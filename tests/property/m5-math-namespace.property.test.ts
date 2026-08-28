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

interface MathNamespaceCase {
  /** A binary16 and binary32 exact probe exponent, 0 through 10. */
  readonly exponent: number;
  /** The dyadic fraction the rounding operations resolve. */
  readonly fraction: 0.25 | 0.5 | 0.75;
  /** The `Math.imul` operand, wide enough to wrap the signed product. */
  readonly factor: number;
  /** The Pythagorean scale `Math.hypot` reproduces exactly. */
  readonly leg: number;
  /** The integral magnitude every exact identity is built from. */
  readonly magnitude: number;
  readonly negative: boolean;
  /** The single set bit `Math.clz32` counts down to. */
  readonly shift: number;
}

const caseArbitrary: fc.Arbitrary<MathNamespaceCase> = fc.record({
  exponent: fc.integer({ max: 10, min: 0 }),
  fraction: fc.constantFrom(0.25, 0.5, 0.75),
  factor: fc.integer({ max: 4_294_967_295, min: 46_341 }),
  leg: fc.integer({ max: 100_000, min: 1 }),
  magnitude: fc.integer({ max: 10_000, min: 1 }),
  negative: fc.boolean(),
  shift: fc.integer({ max: 31, min: 0 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** The signed integral magnitude the exact identities start from. */
function signedValue(testCase: MathNamespaceCase): number {
  return testCase.negative ? -testCase.magnitude : testCase.magnitude;
}

/** The signed operand carrying the generated dyadic fraction. */
function fractionalValue(testCase: MathNamespaceCase): number {
  const magnitude = testCase.magnitude + testCase.fraction;
  return testCase.negative ? -magnitude : magnitude;
}

/** One exact rounding answer per operation the case observes. */
interface RoundingOracle {
  readonly ceil: number;
  readonly floor: number;
  readonly round: number;
  readonly trunc: number;
}

/**
 * The independent oracle for the rounding operations. Each answer is
 * exact integer arithmetic over the generated magnitude and fraction
 * rather than a second call into the host's own Math namespace.
 */
function roundingOracle(testCase: MathNamespaceCase): RoundingOracle {
  const magnitude = testCase.magnitude;
  const sign = testCase.negative ? -1 : 1;
  const roundsUp =
    testCase.fraction === 0.75 ||
    (testCase.fraction === 0.5 && !testCase.negative);
  const roundedMagnitude = roundsUp ? magnitude + 1 : magnitude;
  return {
    ceil: testCase.negative ? -magnitude : magnitude + 1,
    floor: testCase.negative ? -(magnitude + 1) : magnitude,
    round: sign * roundedMagnitude,
    trunc: sign * magnitude,
  };
}

/** ToInt32 of the exact product `Math.imul` reports. */
function imulOracle(factor: number): number {
  const product = (BigInt(factor) * BigInt(factor)) % (1n << 32n);
  return Number(product >= 1n << 31n ? product - (1n << 32n) : product);
}

function printCase(testCase: MathNamespaceCase): string {
  const value = signedValue(testCase);
  const fractional = fractionalValue(testCase);
  const power = 2 ** testCase.exponent;
  const bit =
    testCase.shift === 31 ? "2147483648" : String(2 ** testCase.shift);
  return `
const mathGlobalObject = this;
const originalMath = Math;
const value = ${value};
const fractional = ${fractional};
console.log(
  "namespace",
  typeof Math,
  ({}).toString.call(Math),
  Object.getPrototypeOf(Math) === Object.prototype,
  Object.keys(Math).length,
);
console.log(
  "rounding",
  Math.ceil(fractional),
  Math.floor(fractional),
  Math.round(fractional),
  Math.trunc(fractional),
  Math.abs(value),
  Math.sign(value),
);
console.log(
  "exact",
  Math.sqrt(${testCase.magnitude * testCase.magnitude}),
  Math.pow(2, ${testCase.exponent}),
  Math.log2(${power}),
  Math.hypot(${3 * testCase.leg}, ${4 * testCase.leg}),
  Math.fround(${power}),
  Math.f16round(${power}),
  Math.clz32(${bit}),
  Math.imul(${testCase.factor}, ${testCase.factor}),
);
console.log(
  "extrema",
  Math.max(value, value + 1),
  Math.min(value, value + 1),
  Math.max(value, NaN),
  Math.min(NaN, value),
  1 / Math.max(-0, 0),
  1 / Math.min(0, -0),
);
console.log(
  "approximated",
  Math.abs(Math.exp(Math.log(${testCase.magnitude})) - ${testCase.magnitude}) <
    ${testCase.magnitude} * 1e-12,
  Math.abs(Math.cbrt(${testCase.magnitude ** 3}) - ${testCase.magnitude}) <
    ${testCase.magnitude} * 1e-12,
  Math.abs(Math.atan(Math.tan(0.25)) - 0.25) < 1e-12,
  Math.abs(Math.sinh(Math.asinh(1.5)) - 1.5) < 1e-12,
);
let inRange = true;
for (let index = 0; index < 8; index = index + 1) {
  const draw = Math.random();
  if (typeof draw !== "number" || draw < 0 || draw >= 1) inRange = false;
}
console.log("random", inRange);
const order = [];
const shortLeg = ${3 * testCase.leg};
const longLeg = ${4 * testCase.leg};
const left = { valueOf() { order.push("left"); return shortLeg; } };
const right = { valueOf() { order.push("right"); return longLeg; } };
console.log("order", Math.hypot(left, right), order.join(","));
const abruptOrder = [];
try {
  Math.max(
    { valueOf() { abruptOrder.push("observed"); return value; } },
    { valueOf() { throw new RangeError("abrupt"); } },
    { valueOf() { abruptOrder.push("unreached"); return value; } },
  );
} catch (error) {
  console.log("abrupt", error instanceof RangeError, abruptOrder.join(","));
}
try { Math.abs(Symbol("x")); } catch (error) {
  console.log("symbol", error instanceof TypeError);
}
try { new Math.abs(1); } catch (error) {
  console.log("not a constructor", error instanceof TypeError);
}
/** @param {number} operand @param {number} addend */
function hinted(operand, addend) { return operand + addend; }
console.log("hint", hinted(Math.trunc(fractional), 1), hinted("${value}", 1));
let turn = 0;
while (turn < 2) {
  console.log("guard", Math.abs === Math.abs, Math.PI === Math.PI);
  if (turn === 0) Math.marker = value;
  turn = turn + 1;
}
console.log("marker", Math.marker, delete Math.marker, "marker" in Math);
({ value: Math } = { value: value });
console.log("object target", Math, this.Math === Math);
[Math] = [value + 1];
console.log("array target", Math, this.Math === Math);
for (Math of [value + 2]) {}
console.log("for-of target", Math, this.Math === Math);
Math = originalMath;
console.log("target restore", Math === originalMath);
Math = value;
Math += 2;
const postMath = Math++;
const preMath = ++Math;
console.log("identifier mutation", postMath, preMath, Math, this.Math === Math);
Math = originalMath;
console.log("identifier restore", Math === originalMath);
this.Math = value;
console.log("global write", this.Math === Math, Math === value);
this.Math = originalMath;
console.log("global restore", this.Math === Math);
console.log("global delete", delete this.Math, typeof Math);
try { Math; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
function strictDeletedMathSet() { "use strict"; Math = value; }
try { strictDeletedMathSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
({ value: Math } = { value: originalMath });
console.log("global deleted pattern restore", this.Math === Math);
function strictDeleteDuringMathSet() {
  "use strict";
  Math = (delete mathGlobalObject.Math, value);
}
try { strictDeleteDuringMathSet(); } catch (error) {
  console.log("global strict set race", error instanceof ReferenceError);
}
Math = originalMath;
console.log("global race restore", this.Math === Math);
`;
}

function expected(testCase: MathNamespaceCase): string {
  const value = signedValue(testCase);
  const rounding = roundingOracle(testCase);
  const power = 2 ** testCase.exponent;
  return [
    "namespace object [object Math] true 0",
    `rounding ${rounding.ceil} ${rounding.floor} ${rounding.round} ` +
      `${rounding.trunc} ${testCase.magnitude} ${testCase.negative ? -1 : 1}`,
    `exact ${testCase.magnitude} ${power} ${testCase.exponent} ` +
      `${5 * testCase.leg} ${power} ${power} ${31 - testCase.shift} ` +
      `${imulOracle(testCase.factor)}`,
    `extrema ${value + 1} ${value} NaN NaN Infinity -Infinity`,
    "approximated true true true true",
    "random true",
    `order ${5 * testCase.leg} left,right`,
    "abrupt true observed",
    "symbol true",
    "not a constructor true",
    `hint ${rounding.trunc + 1} ${value}1`,
    "guard true true",
    "guard true true",
    `marker ${value} true false`,
    `object target ${value} true`,
    `array target ${value + 1} true`,
    `for-of target ${value + 2} true`,
    "target restore true",
    `identifier mutation ${value + 2} ${value + 4} ${value + 4} true`,
    "identifier restore true",
    "global write true true",
    "global restore true",
    "global delete true undefined",
    "global deleted read true",
    "global deleted strict set true",
    "global deleted pattern restore true",
    "global strict set race true",
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
    "oseo-math-namespace-property-",
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
  "generated Math operations and global identity match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Math constants, rounding, exact identities, and global writes agree",
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
            { source, sourceId: "generated-m5-math-namespace.ts" },
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
          "one signed integral magnitude from 1 to 10000, one dyadic " +
          "rounding fraction from 0.25, 0.5, or 0.75, one binary16 and " +
          "binary32 exact exponent from 0 to 10, one Pythagorean scale " +
          "from 1 to 100000, one wrapping ToUint32 factor, one single-bit " +
          "clz32 position, a false number hint, one namespace shape guard " +
          "miss, and one global Math write, restore, delete, " +
          "assignment-target, and strict missing-property sequence",
        numRuns: 12,
        profile: "M5 Math namespace",
        seed: 0x6000_5600,
        sizeLimit:
          "one bounded magnitude, one bounded Pythagorean scale, one " +
          "bounded exponent, one bounded factor, one bounded bit " +
          "position, eight pseudorandom draws, two repeated namespace " +
          "property observations, and one identifier, assignment-target, " +
          "and global mutation sequence",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
