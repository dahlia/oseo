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

/** How the generated values reach Math.sumPrecise. */
type Source = "array" | "generator" | "set" | "typed";

interface SumPreciseCase {
  readonly values: readonly number[];
  readonly source: Source;
  /** Insert a non-Number at this index, or never when out of range. */
  readonly poison: number;
  readonly marker: number;
}

const largeArbitrary = fc.double({
  max: 1.7976931348623157e308,
  min: 1e300,
  noNaN: true,
});

/*
 * Magnitudes cluster where exact summation differs from naive addition:
 * cancelling pairs, values near the overflow boundary, subnormals, and
 * integers past 2**53, beside arbitrary doubles and the special values.
 */
const valueArbitrary: fc.Arbitrary<number> = fc.oneof(
  { arbitrary: fc.double(), weight: 4 },
  { arbitrary: fc.integer({ max: 1_000, min: -1_000 }), weight: 2 },
  {
    arbitrary: fc
      .tuple(
        fc.integer({ max: 2 ** 20, min: 1 }),
        fc.integer({ max: 80, min: -80 }),
      )
      .map(([mantissa, exponent]) => mantissa * 2 ** exponent),
    weight: 2,
  },
  { arbitrary: largeArbitrary, weight: 1 },
  { arbitrary: largeArbitrary.map((value) => -value), weight: 1 },
  {
    arbitrary: fc
      .integer({ max: 2 ** 20, min: -(2 ** 20) })
      .map((units) => units * 5e-324),
    weight: 1,
  },
  {
    arbitrary: fc.constantFrom(
      0,
      -0,
      Infinity,
      -Infinity,
      NaN,
      2 ** 53,
      2 ** -53,
      2 ** 970,
      1.7976931348623157e308,
      -1.7976931348623157e308,
      0.1,
      0.2,
      0.3,
    ),
    weight: 2,
  },
);

/** Append the negations of some values, so exact cancellations occur. */
const valuesArbitrary: fc.Arbitrary<readonly number[]> = fc
  .tuple(
    fc.array(valueArbitrary, { maxLength: 10 }),
    fc.array(fc.nat(), { maxLength: 4 }),
  )
  .map(([values, picks]) =>
    values.length === 0
      ? values
      : values.concat(picks.map((pick) => -values[pick % values.length]!)),
  );

const caseArbitrary: fc.Arbitrary<SumPreciseCase> = fc.record({
  marker: fc.integer({ max: 1_000, min: 1 }),
  poison: fc.integer({ max: 40, min: 0 }),
  source: fc.constantFrom<Source>("array", "generator", "set", "typed"),
  values: valuesArbitrary,
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** The values the iterator actually yields for a case. */
function yielded(testCase: SumPreciseCase): readonly number[] {
  if (testCase.source !== "set") return testCase.values;
  // SameValueZero deduplication folds -0 into +0.
  const seen: number[] = [];
  for (const value of testCase.values) {
    const key = Object.is(value, -0) ? 0 : value;
    if (!seen.some((existing) => Object.is(existing, key))) seen.push(key);
  }
  return seen;
}

const unitExponent = 1074n;

/** The exact value of a finite double in units of 2**-1074. */
function exactUnits(value: number): bigint {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const negative = bits >> 63n === 1n;
  const exponent = (bits >> 52n) & 0x7ffn;
  const fraction = bits & ((1n << 52n) - 1n);
  const magnitude =
    exponent === 0n ? fraction : (fraction | (1n << 52n)) << (exponent - 1n);
  return negative ? -magnitude : magnitude;
}

/** Round an exact multiple of 2**-1074 to a Number, ties to even. */
function roundUnits(units: bigint): number {
  if (units === 0n) return 0;
  const negative = units < 0n;
  let magnitude = negative ? -units : units;
  const length = magnitude.toString(2).length;
  let result: number;
  if (length <= 53) {
    result = Number(magnitude) * 2 ** -Number(unitExponent);
  } else {
    let shift = BigInt(length - 53);
    let significand = magnitude >> shift;
    const remainder = magnitude - (significand << shift);
    const half = 1n << (shift - 1n);
    if (remainder > half || (remainder === half && (significand & 1n) === 1n)) {
      significand += 1n;
      if (significand === 1n << 53n) {
        significand >>= 1n;
        shift += 1n;
      }
    }
    magnitude = significand;
    // Split the scale so neither factor underflows or overflows early.
    const exponent = Number(shift - unitExponent);
    result = Number(magnitude) * 2 ** Math.max(exponent, -1022);
    if (exponent < -1022) result *= 2 ** (exponent + 1022);
  }
  return negative ? -result : result;
}

/**
 * The independent oracle: the edition's state machine for -0, the
 * infinities, and NaN, and an exact BigInt sum rounded once.
 */
function oracle(values: readonly number[]): number {
  let state: "finite" | "minus-zero" | "nan" | "minus-inf" | "plus-inf" =
    "minus-zero";
  let units = 0n;
  for (const value of values) {
    if (state === "nan") continue;
    if (Number.isNaN(value)) state = "nan";
    else if (value === Infinity) {
      state = state === "minus-inf" ? "nan" : "plus-inf";
    } else if (value === -Infinity) {
      state = state === "plus-inf" ? "nan" : "minus-inf";
    } else if (
      !Object.is(value, -0) &&
      (state === "minus-zero" || state === "finite")
    ) {
      state = "finite";
      units += exactUnits(value);
    }
  }
  switch (state) {
    case "nan":
      return NaN;
    case "plus-inf":
      return Infinity;
    case "minus-inf":
      return -Infinity;
    case "minus-zero":
      return -0;
    case "finite":
      return roundUnits(units);
  }
}

function show(value: number): string {
  return Object.is(value, -0) ? "-0" : String(value);
}

function literal(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  return show(value);
}

function poisoned(testCase: SumPreciseCase): boolean {
  return (
    testCase.source !== "typed" && testCase.poison < testCase.values.length
  );
}

function printCase(testCase: SumPreciseCase): string {
  const items = testCase.values.map(literal);
  if (poisoned(testCase)) items.splice(testCase.poison, 0, '"poison"');
  const list = `[${items.join(", ")}]`;
  let iterable: string;
  switch (testCase.source) {
    case "array":
      iterable = list;
      break;
    case "generator":
      iterable = `(function* () { yield* ${list}; })()`;
      break;
    case "set":
      iterable = `new Set(${list})`;
      break;
    case "typed":
      iterable = `new Float64Array(${list})`;
      break;
  }
  return `
const show = (value) => (Object.is(value, -0) ? "-0" : String(value));
let closed = 0;
const items = ${iterable};
const iterable = {
  [Symbol.iterator]() {
    const inner = items[Symbol.iterator]();
    return {
      next() { return inner.next(); },
      return() { closed = closed + 1; return {}; },
    };
  },
};
try {
  console.log("sum", show(Math.sumPrecise(iterable)), closed);
} catch (error) {
  console.log("threw", error instanceof TypeError, closed);
}
let turn = 0;
while (turn < 2) {
  console.log("guard", show(Math.sumPrecise([${testCase.marker}, -0])));
  if (turn === 0) Math.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log(
  "hint",
  hinted(${testCase.marker}, 1),
  hinted("${testCase.marker}", 1),
);
`;
}

function expected(testCase: SumPreciseCase): string {
  // A Set keeps the first occurrence of the poison string in place.
  const outcome = poisoned(testCase)
    ? "threw true 1"
    : `sum ${show(oracle(yielded(testCase)))} 0`;
  return [
    outcome,
    `guard ${testCase.marker}`,
    `guard ${testCase.marker}`,
    `hint ${testCase.marker + 1} ${testCase.marker}1`,
    "",
  ].join("\n");
}

/*
 * The pinned Node.js does not expose Math.sumPrecise, so Deno is the
 * single reference host beside the BigInt oracle.
 */
async function reference(source: string): Promise<{
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-math-sum-precise-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
    const observation = await host.run({
      args: ["run", "--quiet", sourcePath],
      command: "deno",
      cwd: directory,
    });
    succeeded = true;
    return observation;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated Math.sumPrecise inputs match the exact rational sum",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Math.sumPrecise rounds the exact sum once and closes on a non-Number",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          await reference(source),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-es2026-math-sum-precise.ts" },
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
          "zero to fourteen values drawn from arbitrary doubles, small " +
          "integers, dyadic rationals, values near the overflow boundary, " +
          "subnormal multiples, and the signed zeroes, infinities, and NaN, " +
          "with negations of earlier values appended for exact " +
          "cancellation, delivered through an array, a generator, a Set, " +
          "or a Float64Array behind a closing iterator wrapper, optionally " +
          "with one non-Number value, plus one namespace shape guard miss " +
          "and one false number hint",
        numRuns: 12,
        profile: "ES2026 Math.sumPrecise",
        seed: 0x6000_9a00,
        sizeLimit:
          "at most ten generated values and four appended negations, one " +
          "inserted non-Number, and one namespace property write",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
