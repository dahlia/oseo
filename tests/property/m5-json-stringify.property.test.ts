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
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

interface JsonStringifyCase {
  readonly first: number;
  readonly flag: boolean;
  readonly gapKind: number;
  readonly gapUnits: readonly number[];
  readonly gapWidth: number;
  readonly mode: number;
  readonly omit: boolean;
  readonly second: number;
  readonly units: readonly number[];
}

const caseArbitrary: fc.Arbitrary<JsonStringifyCase> = fc.record({
  first: fc.integer({ max: 1_000_000, min: -1_000_000 }),
  flag: fc.boolean(),
  gapKind: fc.integer({ max: 1, min: 0 }),
  gapUnits: fc.array(
    fc.oneof(
      fc.integer({ max: 0xd7ff, min: 0 }),
      fc.integer({ max: 0xffff, min: 0xe000 }),
    ),
    { maxLength: 12 },
  ),
  gapWidth: fc.integer({ max: 14, min: -2 }),
  mode: fc.integer({ max: 2, min: 0 }),
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

function textOf(units: readonly number[]): string {
  return String.fromCharCode(...units);
}

function printCase(testCase: JsonStringifyCase): string {
  const text = textOf(testCase.units);
  const gap =
    testCase.gapKind === 0
      ? String(testCase.gapWidth)
      : JSON.stringify(textOf(testCase.gapUnits));
  const replacer =
    testCase.mode === 0
      ? "null"
      : testCase.mode === 1
        ? `function (key, value) {
  if (key === "omit" && ${testCase.omit}) return undefined;
  if (typeof value === "number") return value + 1;
  return value;
}`
        : '["values", "first", "text", "flag", "omit", "first"]';
  return `
const value = {
  first: ${testCase.first},
  text: ${JSON.stringify(text)},
  flag: ${testCase.flag},
  omit: ${testCase.second},
  values: [${testCase.first}, undefined, ${testCase.second}],
};
console.log(JSON.stringify(value, ${replacer}, ${gap}));
/** @param {number} value @param {number} addend */
function hinted(value, addend) { return value + addend; }
console.log("hint", hinted(value.first, 1), hinted("x", 1));
let turn = 0;
while (turn < 2) {
  console.log("guard", JSON.stringify({ value: turn }));
  if (turn === 0) JSON.marker = value.first;
  turn = turn + 1;
}
console.log("marker", JSON.marker, delete JSON.marker, "marker" in JSON);
`;
}

function quoteJson(text: string): string {
  let result = '"';
  const shortEscapes = new Map([
    [0x08, "\\b"],
    [0x09, "\\t"],
    [0x0a, "\\n"],
    [0x0c, "\\f"],
    [0x0d, "\\r"],
    [0x22, '\\"'],
    [0x5c, "\\\\"],
  ]);
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    const escape = shortEscapes.get(unit);
    if (escape != null) {
      result += escape;
      continue;
    }
    const leading = unit >= 0xd800 && unit <= 0xdbff;
    const trailing = unit >= 0xdc00 && unit <= 0xdfff;
    const paired =
      leading &&
      index + 1 < text.length &&
      text.charCodeAt(index + 1) >= 0xdc00 &&
      text.charCodeAt(index + 1) <= 0xdfff;
    if (unit < 0x20 || trailing || (leading && !paired)) {
      result += `\\u${unit.toString(16).padStart(4, "0")}`;
    } else {
      result += text[index];
      if (paired) {
        index += 1;
        result += text[index];
      }
    }
  }
  return result + '"';
}

function expectedJson(testCase: JsonStringifyCase): string {
  const text = textOf(testCase.units);
  const gap =
    testCase.gapKind === 0
      ? " ".repeat(Math.max(0, Math.min(10, testCase.gapWidth)))
      : textOf(testCase.gapUnits).slice(0, 10);
  const add = testCase.mode === 1 ? 1 : 0;
  const values = `[${testCase.first + add},null,${testCase.second + add}]`;
  const entries: readonly [string, string | undefined][] =
    testCase.mode === 2
      ? [
          ["values", values],
          ["first", String(testCase.first)],
          ["text", quoteJson(text)],
          ["flag", String(testCase.flag)],
          ["omit", String(testCase.second)],
        ]
      : [
          ["first", String(testCase.first + add)],
          ["text", quoteJson(text)],
          ["flag", String(testCase.flag)],
          [
            "omit",
            testCase.mode === 1 && testCase.omit
              ? undefined
              : String(testCase.second + add),
          ],
          ["values", values],
        ];
  const present = entries.filter((entry) => entry[1] != null);
  if (gap.length === 0) {
    return `{${present
      .map(([key, value]) => `${quoteJson(key)}:${value}`)
      .join(",")}}`;
  }
  const nestedValues = values
    .slice(1, -1)
    .split(",")
    .map((value) => `${gap}${gap}${value}`)
    .join(",\n");
  return `{
${present
  .map(([key, value]) => {
    const formatted = key === "values" ? `[\n${nestedValues}\n${gap}]` : value;
    return `${gap}${quoteJson(key)}: ${formatted}`;
  })
  .join(",\n")}
}`;
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory("oseo-json-stringify-");
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
  "generated JSON stringify cases match the independent M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "JSON serialization, replacers, and gaps agree",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: [
            expectedJson(testCase),
            `hint ${testCase.first + 1} x1`,
            'guard {"value":0}',
            'guard {"value":1}',
            `marker ${testCase.first} true false`,
            "",
          ].join("\n"),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-json-stringify.ts" },
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
                toolchain: nativeToolchain,
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
          "one bounded JSON object, one three-element sparse-value array, " +
          "bounded UTF-16 text and gap, a function or array replacer, one " +
          "false number hint, and one JSON namespace shape-guard miss",
        numRuns: 12,
        profile: "M5 JSON.stringify",
        seed: 0x6000_6c00,
        sizeLimit:
          "one object with five properties, one three-element array, two " +
          "twelve-code-unit strings, one bounded replacer, and one bounded " +
          "namespace mutation",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
