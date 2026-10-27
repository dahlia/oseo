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
import {
  balancedInteropBackend,
  compileInterop,
  continuationBudget,
  interopCases,
  interopGuard,
} from "./helpers/tco-generator-interop.ts";
import { runtimeFrameContract } from "./proper-tail-call-resources.ts";
import * as balancedBackend from "./helpers/balanced-backend.ts";
import { includeSelectedSources } from "./helpers/tail-owner-exit.ts";

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
const report = process.env.OSEO_INTEROP_PREPARATION_DIR;

/** Retain pure preparation evidence only when a caller supplies a directory. */
function retain(name: string, contents: string): void {
  if (report == null) return;
  mkdirSync(report, { recursive: true });
  writeFileSync(join(report, name), contents);
}

const contracts = [
  runtimeFrameContract(),
  runtimeFrameContract([
    "-DOSEO_CALLABLE_FRAME_MULTIPLIER=8u",
    "-DOSEO_CALLABLE_FRAME_BASE_SLOTS=32u",
  ]),
];
const fixtures = [
  ...interopCases,
  ...contracts.map((contract) => interopGuard(contract, "enabled")),
];

for (const fixture of fixtures) {
  test(`${fixture.name}: Node and Deno Script references`, async () => {
    const directory = await host.makeTemporaryDirectory("oseo-interop-ref-");
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

  test(`${fixture.name}: pure MIR/C and continuation contracts`, () => {
    retain(`${fixture.name}.source.js`, fixture.source);
    retain(`${fixture.name}.expected.stdout`, fixture.stdout);
    for (const policy of ["disabled", "enabled"] as const) {
      const mir = compileInterop(fixture, policy);
      const emitted = cBackend.emit(mir);
      const instrumented = balancedInteropBackend.emit(mir);
      assert.equal(
        balancedInteropBackend,
        balancedBackend.balancedInteropBackend,
      );
      const teardown = "oseo_context_destroy(&context);";
      const replacement =
        "if (context.active_frame_slots != 0u || " +
        "context.call_depth != 0u || context.roots != NULL) abort();\n" +
        "        " +
        teardown;
      assert.equal(
        instrumented.source,
        emitted.source.replaceAll(teardown, replacement),
      );
      assert.deepEqual(
        instrumented.compilationUnits,
        emitted.compilationUnits?.map((unit) => ({
          ...unit,
          source: unit.source.replaceAll(teardown, replacement),
        })),
      );
      if (fixture.name.startsWith("wide-")) {
        assert.ok(emitted.compilationUnits != null);
        assert.ok(
          includeSelectedSources(emitted).filter((source) =>
            source.includes(teardown),
          ).length === 1,
          "one include-selected unit owns the actual teardown",
        );
      }
      assert.match(
        emitted.source,
        /OSEO_TAIL_HOST_CLEAR_TIMEOUT/u,
        "strict helper must use the host-tail step",
      );
      assert.match(instrumented.source, /context\.roots != NULL/u);
      assert.match(instrumented.source, /context\.call_depth != 0u/u);
      for (const fn of mir.functions.filter((value) => value.generator)) {
        assert.ok(
          fn.blocks.every((block) =>
            block.operations.every((operation) => operation.tail !== true),
          ),
          "continuation bodies themselves cannot discard their frame",
        );
      }
      const budgets = fixture.name.startsWith("wide-")
        ? contracts.map((contract) => ({
            contract,
            charge: continuationBudget(mir, contract),
          }))
        : [];
      const mirText = printMir(mir);
      const harness = compileHarnessFragment(
        babelFrontend,
        [{ sourceId: "strict.js", source: '"use strict";' }],
        true,
        { specialization: policy, test262Host: true },
      );
      assert.equal(harness.kind, "compiled");
      if (harness.kind !== "compiled") return;
      const body = compileBodyFragment(babelFrontend, harness.harness, {
        source: fixture.source,
        sourceId: `${fixture.name}.js`,
      });
      assert.equal(body.kind, "compiled");
      if (body.kind !== "compiled") return;
      const fragments = emitScriptFragments(harness.harness, body.body, {
        sourceId: `${fixture.name}.js`,
        harnessLineOffset: 0,
        bodyLineOffset: 1,
      });
      assert.match(fragments.body.source, /OSEO_TAIL_HOST_CLEAR_TIMEOUT/u);
      assert.match(fragments.body.source, /oseo_case_resume/u);
      if (fixture.name.startsWith("wide-")) {
        const charge = continuationBudget(body.body.mir, contracts[0]!).logical;
        const resume = fragments.body.source.slice(
          fragments.body.source.indexOf("OseoResult oseo_case_resume("),
        );
        assert.match(
          resume,
          new RegExp(
            "oseo_frame_enter\\(context, OSEO_CALLABLE_FRAME_COST\\(" +
              `${charge}u\\)\\)[\\s\\S]*?` +
              "oseo_frame_leave\\(context, OSEO_CALLABLE_FRAME_COST\\(" +
              `${charge}u\\)\\)`,
            "u",
          ),
        );
      }
      retain(`${fixture.name}-${policy}.fragment.c`, fragments.body.source);
      retain(`${fixture.name}-${policy}.mir`, mirText);
      retain(`${fixture.name}-${policy}.c`, emitted.source);
      retain(`${fixture.name}-${policy}.instrumented.c`, instrumented.source);
      retain(
        `${fixture.name}-${policy}.identities.json`,
        JSON.stringify({
          policy,
          sourceSha256: createHash("sha256")
            .update(fixture.source)
            .digest("hex"),
          mirSha256: createHash("sha256").update(mirText).digest("hex"),
          cSha256: createHash("sha256").update(emitted.source).digest("hex"),
          budgets,
        }),
      );
    }
  });
}
