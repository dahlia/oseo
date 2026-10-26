/* eslint-disable no-await-in-loop -- Reference Scripts use fresh globals. */
import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import fc from "fast-check";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource, printMir } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import {
  primitiveSetBoundaries,
  primitiveSetCases,
  primitiveSetExpected,
  primitiveSetProgram,
} from "./helpers/primitive-receiver-set.ts";
import type {
  PrimitiveSetCase,
  SetDescriptor,
} from "./helpers/primitive-receiver-set.ts";
import {
  primitiveReceiverSetFixtures,
  primitiveSetterSource,
  primitiveSetterExpected,
  primitiveComputedSetterSource,
  primitiveComputedSetterExpected,
  primitiveSetControlsSource,
  primitiveSetControlsExpected,
  primitiveSetArraySource,
  primitiveSetArrayExpected,
} from "./native/fixtures/primitive-receiver-inherited-set.ts";

const host = createNodeHost();

async function references(source: string, expected: string): Promise<void> {
  const directory = await host.makeTemporaryDirectory("oseo-set-reference-");
  const path = `${directory}/case.js`;
  try {
    await host.writeTextFile(path, `(0, eval)(${JSON.stringify(source)});\n`);
    for (const command of [process.execPath, "deno"]) {
      const observed = await host.run({
        command,
        args: command === "deno" ? ["run", "--quiet", path] : [path],
        cwd: directory,
      });
      assert.equal(observed.exitStatus, 0, observed.stderr);
      assert.equal(observed.stderr, "");
      assert.equal(observed.stdout, expected, command);
    }
  } finally {
    await host.remove(directory);
  }
}

/** Every descriptor/key/caller/callee class runs in the reference matrix. */
function matrix(): readonly PrimitiveSetCase[] {
  const values: PrimitiveSetCase[] = [];
  const descriptors: readonly SetDescriptor[] = [
    "setter",
    "throwing-setter",
    "no-setter",
    "writable",
    "readonly",
    "missing",
    "proxy-true",
    "proxy-false",
    "proxy-throw",
  ];
  const keys: readonly PrimitiveSetCase["key"][] = [
    "string",
    "symbol",
    "index",
    "outside-index",
    "length",
  ];
  for (const descriptor of descriptors)
    for (const key of keys) {
      for (const callerStrict of [false, true]) {
        for (const setterStrict of [false, true]) {
          values.push({
            callerStrict,
            setterStrict,
            descriptor,
            key,
            integer: -7,
            depth: values.length % 3,
          });
        }
      }
    }
  return values;
}

test("primitive Set oracle agrees with both reference hosts", async () => {
  const values = [
    ...matrix(),
    ...primitiveSetBoundaries(),
    ...fc.sample(primitiveSetCases, {
      seed: 0x6000_8b00,
      numRuns: 16,
    }),
  ];
  await references(
    values.map((value) => `{\n${primitiveSetProgram(value)}\n}`).join("\n"),
    values.map(primitiveSetExpected).join(""),
  );
});

test("primitive setter regressions agree with references", async () => {
  for (const [source, expected] of [
    [primitiveSetterSource, primitiveSetterExpected],
    [primitiveComputedSetterSource, primitiveComputedSetterExpected],
    [primitiveSetControlsSource, primitiveSetControlsExpected],
    [primitiveSetArraySource, primitiveSetArrayExpected],
  ] as const)
    await references(source, expected);
});

test("strict Set fixture references survive a prefix statement", async () => {
  const expected = new Map([
    ["primitive-receiver-inherited-set", primitiveSetterExpected],
    ["primitive-receiver-computed-set", primitiveComputedSetterExpected],
  ]);
  for (const fixture of primitiveReceiverSetFixtures) {
    const output = expected.get(fixture.name);
    assert.ok(output != null, fixture.name);
    const source = fixture.globalScriptReference
      ? `(0, eval)(${JSON.stringify(fixture.source)});\n`
      : fixture.source;
    // A preceding statement ends the outer Script's directive prologue.
    await references(`void 0;\n${source}`, output);
  }
});

test("primitive Set sources lower to generic stores", () => {
  const sources = [
    primitiveSetterSource,
    primitiveComputedSetterSource,
    primitiveSetControlsSource,
    primitiveSetArraySource,
    ...matrix().map(primitiveSetProgram),
    ...primitiveSetBoundaries().map(primitiveSetProgram),
  ];
  for (const source of sources) {
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source, sourceId: "primitive-set-structural.js" },
        { specialization },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir != null);
      assert.match(printMir(compiled.mir), /property-set/u);
      const emitted = cBackend.emit(compiled.mir).source;
      assert.match(emitted, /oseo_object_set\(/u);
    }
  }
});

test("setter strictness owns this binding independently of its caller", () => {
  const source = `
function strictSetter(value) { "use strict"; return this; }
function sloppySetter(value) { return this; }
`;
  const compiled = compileSource(babelFrontend, {
    source,
    sourceId: "setter-this-binding.js",
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  const emitted = cBackend.emit(compiled.mir).source;
  for (const name of ["strictSetter", "sloppySetter"]) {
    const fn = compiled.mir.functions.find((entry) => entry.name === name);
    assert.ok(fn != null);
    const start = emitted.indexOf(
      `static OseoResult oseo_function_${fn.id}(\n`,
    );
    assert.ok(start >= 0);
    const body = emitted.slice(start, emitted.indexOf("\n}\n", start));
    if (name === "strictSetter") assert.doesNotMatch(body, /oseo_this_value/u);
    else {
      const binding = body.indexOf("receiver = result.value;");
      assert.ok(binding >= 0);
      assert.match(body.slice(0, binding), /roots\[\d+\] = result.value;/u);
      assert.ok(binding < body.indexOf("oseo_environment_clone"));
    }
  }
});
