/* eslint-disable no-await-in-loop -- Reference observations are ordered. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";

import {
  cBackend,
  emitScriptFragments,
} from "../packages/backend-c/src/index.ts";
import {
  compileBodyFragment,
  compileHarnessFragment,
  printMir,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { createDenoHost, createNodeHost } from "../packages/host/src/index.ts";
import { balancedInteropBackend } from "./helpers/balanced-backend.ts";
import {
  compilePrimitiveSetArray,
  primitiveSetArrayCase,
} from "./helpers/primitive-set-array-interop.ts";

const bootstrap =
  Object.getOwnPropertyDescriptor(globalThis, "Deno")?.value == null
    ? "node"
    : "deno";
const host = bootstrap === "node" ? createNodeHost() : createDenoHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const report = process.env.OSEO_SET_ARRAY_PREPARATION_DIR;
const fixture = primitiveSetArrayCase;

/** Retain pure evidence only when a caller supplies a directory. */
function retain(name: string, contents: string): void {
  if (report == null) return;
  mkdirSync(report, { recursive: true });
  writeFileSync(join(report, name), contents);
}

test(`${fixture.name}: Node and Deno Script references`, async () => {
  const directory = await host.makeTemporaryDirectory("oseo-set-array-ref-");
  try {
    await host.writeTextFile(join(directory, "case.js"), fixture.source);
    // Script isolation and the reference realm are outside Oseo's subject.
    await host.writeTextFile(
      join(directory, "reference.mjs"),
      'import { readFileSync } from "node:fs";\n' +
        'import { runInNewContext } from "node:vm";\n' +
        'const source = readFileSync(new URL("case.js", import.meta.url),' +
        ' "utf8");\n' +
        "const $262 = { createRealm() { return { global: " +
        'runInNewContext("this") }; } };\n' +
        "runInNewContext(source, " +
        "{ console, setTimeout, clearTimeout, $262 });\n",
    );
    for (const [command, args] of [
      ["node", ["reference.mjs"]],
      ["deno", ["run", "--quiet", "-A", "reference.mjs"]],
    ] as const) {
      const request = { command, args, cwd: directory };
      const observed = await host.run(request);
      retain(
        `${fixture.name}-${command}.reference.json`,
        JSON.stringify({
          request,
          observed,
          bootstrap,
          executionHost: host.executionHost,
          nativeTarget,
        }),
      );
      assert.deepEqual(observed, {
        exitStatus: 0,
        stderr: "",
        stdout: fixture.stdout,
      });
    }
  } finally {
    await host.remove(directory);
  }
});

test(`${fixture.name}: pure generic MIR/C contracts`, () => {
  retain(`${fixture.name}.source.js`, fixture.source);
  retain(`${fixture.name}.expected.stdout`, fixture.stdout);
  for (const policy of ["disabled", "enabled"] as const) {
    const mir = compilePrimitiveSetArray(policy);
    const emitted = cBackend.emit(mir);
    const instrumented = balancedInteropBackend.emit(mir);
    const setter = mir.functions.find(
      (fn) => fn.name === "primitiveTailSetter",
    );
    assert.ok(setter?.strict === true);
    const helper = mir.functions.find((fn) => fn.name === "reenter");
    assert.ok(helper != null);
    const scriptOperations = mir.script.blocks.flatMap(
      (block) => block.operations,
    );
    const helperValue = scriptOperations.find(
      (operation) =>
        operation.kind === "function-create" &&
        operation.functionId === helper.id,
    );
    assert.ok(helperValue != null);
    const helperBinding = scriptOperations.find(
      (operation) =>
        operation.kind === "initialize" &&
        operation.arguments[0] === helperValue.id,
    )?.bindingId;
    assert.ok(helperBinding != null);
    const setterOperations = setter.blocks.flatMap((block) => block.operations);
    // The dynamic callee must be the value read from the binding initialized
    // with this helper, rather than the unrelated events.push method value.
    const helperReads = setterOperations.filter(
      (operation) =>
        operation.kind === "read" && operation.bindingId === helperBinding,
    );
    assert.equal(helperReads.length, 1);
    const helperRead = helperReads[0];
    assert.ok(helperRead != null);
    assert.equal(
      setterOperations.filter(
        (operation) =>
          operation.kind === "call" &&
          operation.target?.kind === "dynamic" &&
          operation.arguments[0] === helperRead.id,
      ).length,
      1,
      "the inherited setter retains its ordinary helper call",
    );
    const start = emitted.source.indexOf(
      `static OseoResult oseo_function_${setter.id}(\n`,
    );
    assert.ok(start >= 0);
    const body = emitted.source.slice(
      start,
      emitted.source.indexOf("\n}\n", start),
    );
    assert.match(body, /oseo_(?:call_function|function_\d+)\(/u);
    assert.match(instrumented.source, /context\.roots != NULL/u);
    assert.match(instrumented.source, /context\.call_depth != 0u/u);
    assert.match(instrumented.source, /context\.active_frame_slots != 0u/u);
    assert.doesNotMatch(emitted.source, /oseo_tail_call|OSEO_TAIL_HOST/u);
    const mirText = printMir(mir);
    const harness = compileHarnessFragment(
      babelFrontend,
      [{ sourceId: "strict.js", source: '"use strict";' }],
      true,
      { specialization: policy, test262Host: true },
    );
    assert.equal(harness.kind, "compiled");
    if (harness.kind !== "compiled") return;
    const fragmentBody = compileBodyFragment(babelFrontend, harness.harness, {
      source: fixture.source,
      sourceId: `${fixture.name}.js`,
    });
    assert.equal(fragmentBody.kind, "compiled");
    if (fragmentBody.kind !== "compiled") return;
    const fragments = emitScriptFragments(harness.harness, fragmentBody.body, {
      sourceId: `${fixture.name}.js`,
      harnessLineOffset: 0,
      bodyLineOffset: 1,
    });
    assert.match(fragments.body.source, /oseo_case_resume/u);
    assert.doesNotMatch(
      fragments.body.source,
      /oseo_tail_call|OSEO_TAIL_HOST/u,
    );
    retain(`${fixture.name}-${policy}.fragment.c`, fragments.body.source);
    retain(`${fixture.name}-${policy}.mir`, mirText);
    retain(`${fixture.name}-${policy}.c`, emitted.source);
    retain(`${fixture.name}-${policy}.instrumented.c`, instrumented.source);
    retain(
      `${fixture.name}-${policy}.identities.json`,
      JSON.stringify({
        policy,
        sourceSha256: createHash("sha256").update(fixture.source).digest("hex"),
        mirSha256: createHash("sha256").update(mirText).digest("hex"),
        cSha256: createHash("sha256").update(emitted.source).digest("hex"),
      }),
    );
  }
});
