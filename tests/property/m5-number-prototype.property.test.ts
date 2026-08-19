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

/*
 * Number.prototype's methods brand-check the receiver's [[NumberData]]
 * slot directly (thisNumberValue), unlike String.prototype's looser
 * ToString-based coercion, so there is no valid "generic object with a
 * conversion method" receiver here: only a Number primitive or a Number
 * wrapper object carries the slot.
 */
type ReceiverKind = "primitive" | "wrapper";

interface NumberFormatCase {
  readonly exponent: number;
  readonly exponentialDigits: number;
  readonly fixedDigits: number;
  readonly mantissa: bigint;
  readonly negative: boolean;
  readonly precisionDigits: number;
  readonly radix: number;
  readonly receiver: ReceiverKind;
}

const caseArbitrary: fc.Arbitrary<NumberFormatCase> = fc.record({
  exponent: fc.integer({ max: 16, min: -16 }),
  exponentialDigits: fc.integer({ max: 20, min: 0 }),
  fixedDigits: fc.integer({ max: 20, min: 0 }),
  mantissa: fc.bigInt({ max: (1n << 24n) - 1n, min: 0n }),
  negative: fc.boolean(),
  precisionDigits: fc.integer({ max: 21, min: 1 }),
  radix: fc.integer({ max: 36, min: 2 }),
  receiver: fc.constantFrom<ReceiverKind>("primitive", "wrapper"),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/*
 * The independent oracle below reimplements the same exact-rational-
 * arithmetic technique the C runtime uses (a mantissa and a binary
 * exponent, scaled by BigInt powers of two and ten) in TypeScript BigInt
 * rather than sharing any code with runtime_number.c, so a bug shared by
 * both would have to be a shared misreading of the specification, not a
 * shared implementation.
 */

function exactRatio(mantissa: bigint, exponent: number) {
  if (exponent >= 0) {
    return { denominator: 1n, numerator: mantissa << BigInt(exponent) };
  }
  return { denominator: 1n << BigInt(-exponent), numerator: mantissa };
}

/** round(numerator / denominator * 10^decimalShift), ties away from zero. */
function roundScaled(
  numerator: bigint,
  denominator: bigint,
  decimalShift: number,
): bigint {
  let n = numerator;
  let d = denominator;
  if (decimalShift >= 0) n *= 10n ** BigInt(decimalShift);
  else d *= 10n ** BigInt(-decimalShift);
  const quotient = n / d;
  const remainder = n % d;
  return 2n * remainder >= d ? quotient + 1n : quotient;
}

function significantDigits(
  mantissa: bigint,
  exponent: number,
  precision: number,
) {
  if (mantissa === 0n) return { digits: "0".repeat(precision), e: 0 };
  const { denominator, numerator } = exactRatio(mantissa, exponent);
  const value = Number(mantissa) * 2 ** exponent;
  let e = Math.floor(Math.log10(value));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const digits = roundScaled(
      numerator,
      denominator,
      precision - 1 - e,
    ).toString();
    if (digits.length === precision) return { digits, e };
    e += digits.length > precision ? 1 : -1;
  }
  throw new Error("significant digit search did not converge");
}

function expectedToFixed(
  mantissa: bigint,
  exponent: number,
  negative: boolean,
  digits: number,
): string {
  const { denominator, numerator } = exactRatio(mantissa, exponent);
  const n = roundScaled(numerator, denominator, digits);
  let m = n.toString();
  if (digits > 0) {
    if (m.length <= digits) m = "0".repeat(digits + 1 - m.length) + m;
    const cut = m.length - digits;
    m = `${m.slice(0, cut)}.${m.slice(cut)}`;
  }
  return (negative ? "-" : "") + m;
}

function assembleExponential(digits: string, e: number): string {
  const lead = digits[0];
  const rest = digits.slice(1);
  const mantissaPart = rest.length > 0 ? `${lead}.${rest}` : lead;
  const sign = e < 0 ? "-" : "+";
  return `${mantissaPart}e${sign}${Math.abs(e)}`;
}

function expectedToExponential(
  mantissa: bigint,
  exponent: number,
  negative: boolean,
  fractionDigits: number,
): string {
  const { digits, e } = significantDigits(
    mantissa,
    exponent,
    fractionDigits + 1,
  );
  return (negative ? "-" : "") + assembleExponential(digits, e);
}

function assembleFixedFromSignificant(
  digits: string,
  decimalPosition: number,
): string {
  if (decimalPosition <= 0) {
    return `0.${"0".repeat(-decimalPosition)}${digits}`;
  }
  if (decimalPosition >= digits.length) return digits;
  return `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
}

function expectedToPrecision(
  mantissa: bigint,
  exponent: number,
  negative: boolean,
  precision: number,
): string {
  const { digits, e } = significantDigits(mantissa, exponent, precision);
  const body =
    e < -6 || e >= precision
      ? assembleExponential(digits, e)
      : assembleFixedFromSignificant(digits, e + 1);
  return (negative ? "-" : "") + body;
}

const radixGlyphs = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Exact integer-only radix conversion, used when exponent >= 0. */
function expectedToStringRadix(
  mantissa: bigint,
  exponent: number,
  negative: boolean,
  radix: number,
): string {
  let value = mantissa << BigInt(exponent);
  if (value === 0n) return "0";
  const r = BigInt(radix);
  let out = "";
  while (value > 0n) {
    out = radixGlyphs[Number(value % r)] + out;
    value /= r;
  }
  return (negative ? "-" : "") + out;
}

function receiverExpression(kind: ReceiverKind): string {
  return kind === "primitive" ? "value" : "new Number(value)";
}

function printCase(testCase: NumberFormatCase): string {
  /*
   * Zero has no sign in any of these outputs, and interpolating the
   * computed -0 into source would print "0" and hand the native target a
   * positive zero, so the generated sign is dropped for a zero mantissa
   * rather than being allowed to disagree with the oracle.
   */
  const negative = testCase.negative && testCase.mantissa !== 0n;
  const value =
    (negative ? -1 : 1) * Number(testCase.mantissa) * 2 ** testCase.exponent;
  const receiver = receiverExpression(testCase.receiver);
  const fixed = expectedToFixed(
    testCase.mantissa,
    testCase.exponent,
    negative,
    testCase.fixedDigits,
  );
  const exponential = expectedToExponential(
    testCase.mantissa,
    testCase.exponent,
    negative,
    testCase.exponentialDigits,
  );
  const precision = expectedToPrecision(
    testCase.mantissa,
    testCase.exponent,
    negative,
    testCase.precisionDigits,
  );
  const hintFixed = expectedToFixed(
    testCase.mantissa,
    testCase.exponent,
    negative,
    2,
  );
  const radixCheck =
    testCase.exponent >= 0
      ? `console.log(
  "toString radix",
  Number.prototype.toString.call(${receiver}, ${testCase.radix}) ===
    ${JSON.stringify(
      expectedToStringRadix(
        testCase.mantissa,
        testCase.exponent,
        negative,
        testCase.radix,
      ),
    )},
);
`
      : "";
  return `
const value = ${value};
console.log(
  "toFixed",
  Number.prototype.toFixed.call(${receiver}, ${testCase.fixedDigits}) ===
    ${JSON.stringify(fixed)},
);
console.log(
  "toExponential",
  Number.prototype.toExponential.call(
    ${receiver},
    ${testCase.exponentialDigits},
  ) === ${JSON.stringify(exponential)},
);
console.log(
  "toPrecision",
  Number.prototype.toPrecision.call(
    ${receiver},
    ${testCase.precisionDigits},
  ) === ${JSON.stringify(precision)},
);
console.log(
  "valueOf",
  Number.prototype.valueOf.call(${receiver}) === value,
);
${radixCheck}/** @param {number} input */
function hinted(input) { return input.toFixed(2); }
console.log("hint", hinted(value) === ${JSON.stringify(hintFixed)});
console.log(
  "false hint",
  hinted(new Number(value)) === ${JSON.stringify(hintFixed)},
);
console.log("guard", hinted(value) === ${JSON.stringify(hintFixed)});
Number.prototype.hintMarker = 1;
console.log("guard", hinted(value) === ${JSON.stringify(hintFixed)});
`;
}

function expectedObservation(testCase: NumberFormatCase) {
  const lines = [
    "toFixed true",
    "toExponential true",
    "toPrecision true",
    "valueOf true",
  ];
  if (testCase.exponent >= 0) lines.push("toString radix true");
  lines.push("hint true", "false hint true", "guard true", "guard true", "");
  return {
    exitStatus: 0,
    stderr: "",
    stdout: lines.join("\n"),
  };
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
    "oseo-number-prototype-property-",
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
  "generated Number.prototype formatting matches the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Number.prototype formatting rounds and scales exactly",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expected = expectedObservation(testCase);
        assertMatchingObservations([expected, ...(await references(source))]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-number-prototype.ts" },
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
                assertMatchingObservations([expected, native]);
                assert.ok(native.counters?.collections != null);
                assert.ok(native.counters.collections > 0);
                /*
                 * The generated receivers are a Number primitive and a
                 * Number wrapper, so the shape guard on the method read
                 * always misses; a hit needs the ordinary objects the
                 * fixed fixture builds, which asserts guardHits there.
                 */
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
          "a 24-bit mantissa and a -16..16 binary exponent (an exact " +
          "double, integer whenever the exponent is non-negative and " +
          "fractional otherwise), a sign, primitive and wrapper " +
          "receivers, toFixed and toExponential digit counts 0..20, " +
          "toPrecision precision 1..21, and a radix 2..36 checked only " +
          "for the exact-integer cases; a false hint and shape-guard " +
          "miss. Two cases sit outside this domain and are covered by " +
          "tests/native/fixtures/number-prototype.ts instead. " +
          "Omitted-argument decimal formatting would need an oracle " +
          "reimplementing the shortest round-trip search. Radix " +
          "formatting of a fractional value would need one " +
          "reimplementing the separate round-trip stopping rule, which " +
          "is not a shortest search and whose result the reference " +
          "engines do not reproduce.",
        numRuns: 24,
        profile: "M5 Number.prototype formatting",
        seed: 0x6000_4900,
        sizeLimit:
          "one mantissa, one exponent, one sign, one receiver, three " +
          "digit counts, one radix, four format observations, two hint " +
          "classes, and one prototype shape change",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
