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

interface NumberIntrinsicCase {
  readonly magnitude: number;
  readonly negative: boolean;
  readonly radix: 2 | 8 | 10 | 16 | 36;
  readonly suffix: string;
  readonly wideOffset: number;
  readonly wideRadix: 2 | 8 | 10 | 16;
}

const caseArbitrary: fc.Arbitrary<NumberIntrinsicCase> = fc.record({
  magnitude: fc.integer({ max: 10_000, min: 1 }),
  negative: fc.boolean(),
  radix: fc.constantFrom(2, 8, 10, 16, 36),
  suffix: fc.constantFrom("!", "_rest"),
  wideOffset: fc.integer({ max: 8191, min: 2049 }),
  wideRadix: fc.constantFrom(2, 8, 10, 16),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function signedValue(testCase: NumberIntrinsicCase): number {
  return testCase.negative ? -testCase.magnitude : testCase.magnitude;
}

function printCase(testCase: NumberIntrinsicCase): string {
  const sign = testCase.negative ? "-" : "+";
  const digits = testCase.magnitude.toString(testCase.radix);
  const wideMagnitude = (1n << 64n) + BigInt(testCase.wideOffset);
  const wideDigits = wideMagnitude.toString(testCase.wideRadix);
  const signedWide = testCase.negative ? -wideMagnitude : wideMagnitude;
  return `
const converted = Number("  ${sign}${testCase.magnitude}  ");
const parsedFloat = Number.parseFloat(
  " ${sign}${testCase.magnitude}e1${testCase.suffix}",
);
const parsedInt = Number.parseInt(
  " ${sign}${digits}${testCase.suffix}",
  ${testCase.radix},
);
const parsedWide = Number.parseInt(
  " ${sign}${wideDigits}${testCase.suffix}",
  ${testCase.wideRadix},
);
console.log("values", converted, parsedFloat, parsedInt);
console.log("wide", parsedWide === ${signedWide});
console.log(
  "predicates",
  Number.isFinite(converted),
  Number.isInteger(converted),
  Number.isNaN(Number.NaN),
  Number.isSafeInteger(converted),
  Number.isFinite("${testCase.magnitude}"),
);
const boxed = new Number(converted);
console.log(
  "wrapper",
  boxed instanceof Number,
  Number.prototype.isPrototypeOf(boxed),
  boxed.hasOwnProperty("value"),
);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log(
  "hint",
  hinted(converted, 1),
  hinted("${signedValue(testCase)}", 1),
);
const originalIsFinite = Number.isFinite;
let turn = 0;
while (turn < 2) {
  console.log("guard", Number.isFinite === originalIsFinite);
  if (turn === 0) Number.marker = converted;
  turn = turn + 1;
}
const originalNumber = Number;
const numberGlobalObject = this;
Number = converted;
Number += 2;
const postNumber = Number++;
const preNumber = ++Number;
console.log(
  "identifier mutation",
  postNumber,
  preNumber,
  Number,
  this.Number === Number,
);
Number = originalNumber;
console.log("identifier restore", Number === originalNumber);
this.Number = converted;
console.log("global write", this.Number === Number, Number === converted);
this.Number = originalNumber;
console.log("global restore", this.Number === Number);
console.log(
  "global delete",
  delete this.Number,
  typeof Number,
);
try { Number; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
try { Number += 1; } catch (error) {
  console.log("global deleted update", error instanceof ReferenceError);
}
try { Number++; } catch (error) {
  console.log("global deleted step", error instanceof ReferenceError);
}
function strictDeletedNumberSet() { "use strict"; Number = converted; }
try { strictDeletedNumberSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
Number = originalNumber;
console.log("global deleted restore", this.Number === Number);
function strictDeleteDuringNumberSet() {
  "use strict";
  Number = (delete numberGlobalObject.Number, converted);
}
try { strictDeleteDuringNumberSet(); } catch (error) {
  console.log("global strict set race", error instanceof ReferenceError);
}
Number = {
  valueOf() {
    delete numberGlobalObject.Number;
    return converted;
  },
};
function strictDeleteDuringNumberStep() { "use strict"; Number++; }
try { strictDeleteDuringNumberStep(); } catch (error) {
  console.log("global strict step race", error instanceof ReferenceError);
}
Number = originalNumber;
console.log("global race restore", this.Number === Number);
`;
}

function expected(testCase: NumberIntrinsicCase): string {
  const value = signedValue(testCase);
  return [
    `values ${value} ${value * 10} ${value}`,
    "wide true",
    "predicates true true true true false",
    "wrapper true true false",
    `hint ${value + 1} ${value}1`,
    "guard true",
    "guard true",
    `identifier mutation ${value + 2} ${value + 4} ${value + 4} true`,
    "identifier restore true",
    "global write true true",
    "global restore true",
    "global delete true undefined",
    "global deleted read true",
    "global deleted update true",
    "global deleted step true",
    "global deleted strict set true",
    "global deleted restore true",
    "global strict set race true",
    "global strict step race true",
    "global race restore true",
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
  const directory = await host.makeTemporaryDirectory(
    "oseo-number-intrinsic-property-",
  );
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
  "generated Number operations and global identity match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Number conversions, wrappers, predicates, and parsers agree",
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
            { source, sourceId: "generated-m5-number-intrinsic.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /add-smi-checked/u);
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
          "one signed integer from 1 to 10000, one radix from 2, 8, 10, " +
          "16, or 36, one parser suffix, one wide rounding offset from " +
          "2049 to 8191, one exact wide radix from 2, 8, 10, or 16, a " +
          "false number hint, one constructor shape guard miss, and one " +
          "global Number write, restore, and delete sequence",
        numRuns: 12,
        profile: "M5 Number intrinsic",
        seed: 0x6000_3500,
        sizeLimit:
          "one bounded integer, one bounded wide offset, two radices, one " +
          "parser suffix, one wrapper, two repeated intrinsic property " +
          "observations, and one identifier and global mutation sequence",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
