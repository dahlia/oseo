/* eslint-disable no-await-in-loop -- Native builds run serially. */
import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { defaultComponents } from "../packages/cli/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { nativeToolchain } from "./native-toolchain.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";

const { annexBMixedCoreFixtures } =
  await import("./native/fixtures/annex-b-mixed-core.ts");

// The command-line frontend links the Unicode data that \s and \S need.
const frontend = defaultComponents.frontend;
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);
const skip = nativeTarget == null ? "requires a supported native host" : false;

const expectedOutput = new Map([
  ["annex-b-core-typed-array-no-species", "typed array no-species core ok"],
  [
    "annex-b-core-typed-array-resizable-prototype",
    "typed array resizable prototype core ok",
  ],
  [
    "annex-b-core-typed-array-out-of-bounds-prototype",
    "typed array out-of-bounds prototype core ok",
  ],
  ["annex-b-core-string-split-regexp", "string split regexp core ok"],
]);

function runControl(source: string): string[] {
  const output: string[] = [];
  runInNewContext(source, {
    console: { log: (value: string) => output.push(value) },
  });
  return output;
}

test("replacement fixtures are exactly the four owned subjects", () => {
  assert.deepEqual(
    annexBMixedCoreFixtures.map((fixture) => fixture.name),
    [...expectedOutput.keys()],
  );
});

for (const fixture of annexBMixedCoreFixtures) {
  test(`${fixture.name} passes its oracle controls`, () => {
    for (const strict of [false, true]) {
      assert.deepEqual(
        runControl(`${strict ? '"use strict";\n' : ""}${fixture.source}`),
        [expectedOutput.get(fixture.name)],
      );
    }
  });

  // An always-true, same-type, or loose comparator must fail the program
  // through the independent rejection count, before any output.
  for (const comparator of [
    "true",
    "typeof actual === typeof expected",
    "actual == expected",
  ]) {
    test(`${fixture.name} rejects comparator: ${comparator}`, () => {
      const source = fixture.source.replace(
        "check(Object.is(actual, expected));",
        `check(${comparator});`,
      );
      assert.notEqual(source, fixture.source);
      const output: string[] = [];
      assert.throws(
        () =>
          runInNewContext(source, {
            console: { log: (value: string) => output.push(value) },
          }),
        /annex b core evidence failed/u,
      );
      assert.deepEqual(output, []);
    });
  }
}

// The four omitted patterns are the Annex B forms of separator-regexp.js.
// The profile rejects each at build time; the other 33 compile in the fixture.
for (const [pattern, message] of [
  ["\\k<x>", /named backreference .* only by Annex B/u],
  ["\\XA0", /identity escape is admitted only by Annex B/u],
  ["\\x", /incomplete hexadecimal escape is admitted only by Annex B/u],
  ["\\X", /identity escape is admitted only by Annex B/u],
] as const) {
  test(`split regexp Annex B form stays rejected: /${pattern}/`, () => {
    for (const strict of [false, true]) {
      const result = compileSource(frontend, {
        source: `${strict ? '"use strict";\n' : ""}"x".split(/${pattern}/);`,
        sourceId: "annex-b-split-pattern.js",
      });
      assert.equal(result.mir, undefined);
      assert.ok(result.diagnostics.length > 0);
      assert.ok(result.diagnostics.every((d) => d.code === "OSEO1001"));
      assert.ok(result.diagnostics.some((d) => message.test(d.message)));
    }
  });
}

for (const fixture of annexBMixedCoreFixtures) {
  test(`${fixture.name} native core coverage`, { skip }, async () => {
    const expected = {
      exitStatus: 0,
      stderr: "",
      stdout: `${expectedOutput.get(fixture.name)}\n`,
    };
    assertMatchingObservations([
      expected,
      ...(await hostScriptReferences(host, fixture.source)),
    ]);
    const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const specialization of ["disabled", "enabled"] as const) {
        for (const strict of [false, true]) {
          const compiled = compileSource(
            frontend,
            {
              source: `${strict ? '"use strict";\n' : ""}${fixture.source}`,
              sourceId: `${fixture.name}.js`,
            },
            { specialization, observeSpecialization: true },
          );
          assert.deepEqual(compiled.diagnostics, []);
          await withNativeFixture(
            {
              backend: cBackend,
              host,
              input: compiled.mir!,
              operation: "execute",
              runtime: cRuntimeProvider,
              target: nativeTarget!,
              toolchain: nativeToolchain,
            },
            (native) => {
              assertMatchingObservations([expected, native]);
              assert.ok(native.counters!.collections > 0);
            },
          );
        }
      }
    } finally {
      if (saved == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = saved;
    }
  });
}
