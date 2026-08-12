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

/** One bounded program covering construction, statics, and a shape miss. */
interface ArrayConstructorCase {
  readonly items: readonly number[];
  readonly iteratorOverride:
    | "inherited-callable"
    | "inherited-null"
    | "inherited-undefined"
    | "ordinary"
    | "own-callable"
    | "own-null"
    | "own-undefined";
  readonly iteratorRedefinition: "callable" | "null" | "undefined";
  readonly length: number;
  readonly marker: number;
  readonly offset: number;
}

const caseArbitrary: fc.Arbitrary<ArrayConstructorCase> = fc.record({
  items: fc.array(fc.integer({ max: 20, min: -20 }), { maxLength: 4 }),
  iteratorOverride: fc.constantFrom(
    "ordinary",
    "own-callable",
    "own-undefined",
    "own-null",
    "inherited-undefined",
    "inherited-null",
    "inherited-callable",
  ),
  iteratorRedefinition: fc.constantFrom("callable", "null", "undefined"),
  length: fc.integer({ max: 8, min: 0 }),
  marker: fc.integer({ max: 20, min: -20 }),
  offset: fc.integer({ max: 20, min: -20 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** Render numeric arguments without relying on the subject runtime. */
function argumentsSource(items: readonly number[]): string {
  return items.map(String).join(", ");
}

/** Print one generated program whose expected output is modeled separately. */
function printCase(testCase: ArrayConstructorCase): string {
  const items = argumentsSource(testCase.items);
  const iteratorValue = testCase.iteratorOverride.endsWith("callable")
    ? "function () { return { next: function () { " +
      "return { done: true }; } }; }"
    : testCase.iteratorOverride.endsWith("null")
      ? "null"
      : "undefined";
  const iteratorOverride =
    testCase.iteratorOverride === "ordinary"
      ? ""
      : `Object.defineProperty(${
          testCase.iteratorOverride.startsWith("own-")
            ? "stringPrototype"
            : "Object.prototype"
        },
  Symbol.iterator,
  { configurable: true, value: ${iteratorValue}, writable: true },
);`;
  const redefinitionValue =
    testCase.iteratorRedefinition === "callable"
      ? "function () { return { next: function () { " +
        "return { done: true }; } }; }"
      : testCase.iteratorRedefinition;
  return `
const sparse = Array(${testCase.length});
console.log("sparse", sparse.length, 0 in sparse);
const values = Array.of(${items});
console.log(
  "of",
  values.length,
  values[0],
  values[1],
  values[2],
  values[3],
);
const mapped = Array.from(values, function (value, index) {
  return value + ${testCase.offset} + index;
});
console.log(
  "from",
  mapped.length,
  mapped[0],
  mapped[1],
  mapped[2],
  mapped[3],
);
console.log("isArray", Array.isArray(values), Array.isArray({}));
const guarded = Array.of({ marker: ${testCase.marker} });
let turn = 0;
while (turn < 2) {
  console.log("guard", guarded[0].marker);
  if (turn === 0) guarded[0].extra = true;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log(
  "hint",
  hinted(${testCase.offset}, 1),
  hinted("${testCase.offset}", 1),
);
const stringPrototype = Object.getPrototypeOf(Object(""));
${iteratorOverride}
function observeString(label, input) {
  const result = Array.from(input);
  console.log(
    label,
    result.length,
    result[0] === "A",
    result[1] === "💩",
    result[1] + result[2] === "💩",
    result[3] === "B",
  );
}
observeString("string primitive", "A💩B");
observeString("string wrapper", Object("A💩B"));
delete Object.prototype[Symbol.iterator];
delete stringPrototype[Symbol.iterator];
observeString("deleted primitive", "A💩B");
observeString("deleted wrapper", Object("A💩B"));
Object.defineProperty(stringPrototype, Symbol.iterator, {
  configurable: true,
  value: ${redefinitionValue},
  writable: true,
});
observeString("redefined primitive", "A💩B");
observeString("redefined wrapper", Object("A💩B"));
delete stringPrototype[Symbol.iterator];
observeString("deleted again primitive", "A💩B");
observeString("deleted again wrapper", Object("A💩B"));
`;
}

/** Model four printed array positions, including absent generated positions. */
function displayed(values: readonly number[]): readonly string[] {
  return [0, 1, 2, 3].map((index) => String(values[index]));
}

/** Compute the complete output without executing Array behavior. */
function expected(testCase: ArrayConstructorCase): string {
  const mapped = testCase.items.map(
    (value, index) => value + testCase.offset + index,
  );
  const codePoints = "3 true true false false";
  const codeUnits = "4 true false true true";
  const emptyIterator = "0 false false false false";
  const initial = testCase.iteratorOverride.startsWith("own-")
    ? testCase.iteratorOverride === "own-callable"
      ? emptyIterator
      : codeUnits
    : codePoints;
  const redefined =
    testCase.iteratorRedefinition === "callable" ? emptyIterator : codeUnits;
  return [
    `sparse ${testCase.length} false`,
    `of ${testCase.items.length} ${displayed(testCase.items).join(" ")}`,
    `from ${mapped.length} ${displayed(mapped).join(" ")}`,
    "isArray true false",
    `guard ${testCase.marker}`,
    `guard ${testCase.marker}`,
    `hint ${testCase.offset + 1} ${testCase.offset}1`,
    `string primitive ${initial}`,
    `string wrapper ${initial}`,
    `deleted primitive ${codeUnits}`,
    `deleted wrapper ${codeUnits}`,
    `redefined primitive ${redefined}`,
    `redefined wrapper ${redefined}`,
    `deleted again primitive ${codeUnits}`,
    `deleted again wrapper ${codeUnits}`,
    "",
  ].join("\n");
}

/** Run the same generated source on both bootstrap hosts. */
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
  const directory = await host.makeTemporaryDirectory(
    "oseo-array-constructor-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(sourcePath, source);
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
  "generated Array construction and statics match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Array preserves length construction, statics, and generic fallback",
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
            { source, sourceId: "generated-m5-array-constructor.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-object/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /property-get generic/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:object|shape)/u);
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
          "zero to four bounded integer elements, a valid array length, " +
          "a mapper offset, primitive and wrapper strings, an ordinary, " +
          "deleted, callable, or nullish string iterator state, a callable " +
          "or nullish redefinition, a false numeric hint, and one shape " +
          "miss",
        numRuns: 12,
        profile: "M5 Array constructor and statics",
        seed: 0x6000_3f00,
        sizeLimit:
          "four elements, length eight, one mapping pass, and two guarded " +
          "reads, plus primitive and wrapper string iterator transitions",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
