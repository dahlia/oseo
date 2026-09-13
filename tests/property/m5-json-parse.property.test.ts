/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  printMir,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

interface JsonParseCase {
  readonly first: number;
  readonly flag: boolean;
  readonly omit: boolean;
  readonly second: number;
  readonly units: readonly number[];
}

const caseArbitrary: fc.Arbitrary<JsonParseCase> = fc.record({
  first: fc.integer({ max: 1_000_000, min: -1_000_000 }),
  flag: fc.boolean(),
  omit: fc.boolean(),
  second: fc.integer({ max: 1_000_000, min: -1_000_000 }),
  units: fc.array(fc.integer({ max: 0xffff, min: 0 }), { maxLength: 12 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function textOf(testCase: JsonParseCase): string {
  return String.fromCharCode(...testCase.units);
}

function printCase(testCase: JsonParseCase): string {
  const text = textOf(testCase);
  const json = JSON.stringify({
    first: testCase.first,
    text,
    flag: testCase.flag,
    omit: testCase.second,
    values: [testCase.first, testCase.second],
  });
  return `
const order = [];
const parsed = JSON.parse(${JSON.stringify(json)}, function (key, value) {
  order.push(key);
  if (key === "omit" && ${testCase.omit}) return undefined;
  if (typeof value === "number") return value + 1;
  return value;
});
console.log(
  "values",
  parsed.first,
  parsed.text === ${JSON.stringify(text)},
  parsed.text.length,
  parsed.flag,
  "omit" in parsed,
  parsed.omit,
  parsed.values[0],
  parsed.values[1],
);
console.log("order", order.join(","));
/** @param {number} value @param {number} addend */
function hinted(value, addend) { return value + addend; }
console.log("hint", hinted(parsed.first, 1), hinted("x", 1));
let turn = 0;
while (turn < 2) {
  console.log("guard", JSON.parse === JSON.parse);
  if (turn === 0) JSON.marker = parsed.first;
  turn = turn + 1;
}
console.log("marker", JSON.marker, delete JSON.marker, "marker" in JSON);
`;
}

function expected(testCase: JsonParseCase): string {
  const omitted = testCase.omit;
  return [
    `values ${testCase.first + 1} true ${testCase.units.length} ` +
      `${testCase.flag} ${!omitted} ` +
      `${omitted ? "undefined" : testCase.second + 1} ` +
      `${testCase.first + 1} ${testCase.second + 1}`,
    "order first,text,flag,omit,0,1,values,",
    `hint ${testCase.first + 2} x1`,
    "guard true",
    "guard true",
    `marker ${testCase.first + 1} true false`,
    "",
  ].join("\n");
}

async function references(source: string): Promise<
  readonly [
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
  ]
> {
  const directory = await host.makeTemporaryDirectory("oseo-json-parse-");
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
    const observations = [
      await host.run({
        args: [sourcePath],
        command: process.execPath,
        cwd: directory,
      }),
      await host.run({
        args: ["run", "--quiet", sourcePath],
        command: "deno",
        cwd: directory,
      }),
    ] as const;
    succeeded = true;
    return observations;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated JSON texts and reviver walks match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "JSON parsing, reviver order, and global identity agree",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-json-parse.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /generic-fallback/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:smi|shape)/u);
          }
          process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          try {
            await withNativeFixture(
              {
                backend: cBackend,
                host,
                input: compiled.mir,
                operation: "execute",
                runtime: cRuntimeProvider,
                target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
                toolchain: zigToolchain,
              },
              (native) => {
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters?.collections != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "enabled") {
                  assert.ok(native.counters.guardMisses > 0);
                }
              },
            );
          } finally {
            delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          }
        }
      }),
      {
        context:
          nativeTarget == null || host.executionHost == null
            ? ["target=unsupported host=unknown"]
            : [
                `target=${nativeTarget.name}`,
                `host=${host.executionHost.operatingSystem}/` +
                  host.executionHost.architecture,
                `sanitizers=${nativeTarget.sanitizers.join(",")}`,
              ],
        domain:
          "one JSON object containing two bounded integers, one Boolean, " +
          "one zero-to-twelve-code-unit UTF-16 string, one two-element " +
          "array, an optional reviver deletion, one false number hint, " +
          "and one JSON namespace shape-guard miss",
        numRuns: 12,
        profile: "M5 JSON.parse",
        seed: 0x6000_6a00,
        sizeLimit:
          "one object with five source-order properties, one nested " +
          "two-element array, twelve UTF-16 code units, one post-order " +
          "reviver traversal, and one bounded namespace mutation",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
