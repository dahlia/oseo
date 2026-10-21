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
                toolchain: nativeToolchain,
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

/*
 * A power of two is the one place a double's round-trip interval is
 * asymmetric: its next-lower double lies half as far away as its
 * next-higher one. The shortest-decimal domain below draws powers of two
 * across the binary16, binary32, and binary64 exponent ranges, with the
 * neighboring doubles one unit in the last place away as symmetric
 * controls.
 */
type Neighbor = "above" | "below" | "exact";

interface ShortestDecimalCase {
  readonly exponent: number;
  readonly negative: boolean;
  readonly neighbor: Neighbor;
}

const shortestDecimalArbitrary: fc.Arbitrary<ShortestDecimalCase> = fc.record({
  exponent: fc.oneof(
    fc.integer({ max: 15, min: -24 }),
    fc.integer({ max: 127, min: -149 }),
    fc.integer({ max: 1023, min: -1074 }),
  ),
  negative: fc.boolean(),
  neighbor: fc.constantFrom<Neighbor>("below", "exact", "above"),
});

/** Bit pattern of the generated positive double. */
function shortestDecimalBits(testCase: ShortestDecimalCase): bigint {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, 2 ** testCase.exponent);
  const exact = view.getBigUint64(0);
  /*
   * The double below the smallest denormal is zero, whose formatting is
   * not a shortest-decimal search, so that one draw keeps the power.
   */
  if (testCase.neighbor === "below" && exact > 1n) return exact - 1n;
  if (testCase.neighbor === "above") return exact + 1n;
  return exact;
}

function shortestDecimalValue(testCase: ShortestDecimalCase): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, shortestDecimalBits(testCase));
  const magnitude = view.getFloat64(0);
  return testCase.negative ? -magnitude : magnitude;
}

const doubleScale = 1n << 1076n;

/** Significant digits without trailing zeros and the decimal point position. */
interface ShortestDecimal {
  readonly digits: string;
  readonly n: number;
}

/** A k-digit significand and its scaled distance from the double. */
interface DecimalCandidate {
  readonly distance: bigint;
  readonly s: bigint;
}

/**
 * Number::toString's digit selection (6.1.6.1.20 step 5) by exact
 * rational arithmetic over 2^1076, independent of the runtime's
 * printf/strtod search: the fewest digits whose decimal lies in the
 * double's round-trip interval (closed when its significand is even),
 * then the closest such decimal, the even one on a tie. Returns the
 * digits without trailing zeros and n, the decimal point position.
 */
function shortestDecimal(bits: bigint): ShortestDecimal {
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const significand = biased === 0 ? fraction : fraction | (1n << 52n);
  const binaryExponent = (biased === 0 ? 1 : biased) - 1075;
  const scaled = significand << BigInt(binaryExponent + 1076);
  const above = 1n << BigInt(binaryExponent + 1076);
  const below = fraction === 0n && biased > 1 ? above / 2n : above;
  const low = scaled - below / 2n;
  const high = scaled + above / 2n;
  const closed = significand % 2n === 0n;
  const atLeastPower = (q: number) =>
    q >= 0
      ? scaled >= 10n ** BigInt(q) * doubleScale
      : scaled * 10n ** BigInt(-q) >= doubleScale;
  let q = Math.floor(
    Math.log10(Number(significand)) + binaryExponent * Math.log10(2),
  );
  while (!atLeastPower(q)) q -= 1;
  while (atLeastPower(q + 1)) q += 1;
  for (let k = 1; k <= 17; k += 1) {
    const shift = k - 1 - q;
    const base =
      shift >= 0
        ? (scaled * 10n ** BigInt(shift)) / doubleScale
        : scaled / (doubleScale * 10n ** BigInt(-shift));
    let best: DecimalCandidate | null = null;
    for (const s of [base, base + 1n]) {
      if (s <= 0n) continue;
      /* s * 10^-shift as numerator / denominator over 2^1076. */
      const numerator =
        shift >= 0 ? s * doubleScale : s * 10n ** BigInt(-shift) * doubleScale;
      const denominator = shift >= 0 ? 10n ** BigInt(shift) : 1n;
      const inside = closed
        ? numerator >= low * denominator && numerator <= high * denominator
        : numerator > low * denominator && numerator < high * denominator;
      if (!inside) continue;
      const target = scaled * denominator;
      const distance =
        numerator > target ? numerator - target : target - numerator;
      if (
        best == null ||
        distance < best.distance ||
        (distance === best.distance && s % 2n === 0n)
      ) {
        best = { distance, s };
      }
    }
    if (best == null) continue;
    const text = best.s.toString();
    return {
      digits: text.replace(/0+$/u, ""),
      n: q + 1 + (text.length > k ? 1 : 0),
    };
  }
  throw new Error("no 17-digit decimal reads back");
}

function expectedNumberToString(bits: bigint, negative: boolean): string {
  const { digits, n } = shortestDecimal(bits);
  const k = digits.length;
  let body: string;
  if (k <= n && n <= 21) body = digits + "0".repeat(n - k);
  else if (n > 0 && n <= 21) body = `${digits.slice(0, n)}.${digits.slice(n)}`;
  else if (n > -6 && n <= 0) body = `0.${"0".repeat(-n)}${digits}`;
  else body = assembleExponential(digits, n - 1);
  return (negative ? "-" : "") + body;
}

function expectedFreeExponential(bits: bigint, negative: boolean): string {
  const { digits, n } = shortestDecimal(bits);
  return (negative ? "-" : "") + assembleExponential(digits, n - 1);
}

function printShortestDecimalCase(testCase: ShortestDecimalCase): string {
  return `
const value = ${shortestDecimalValue(testCase)};
console.log("String", String(value));
console.log("toString", value.toString());
console.log("template", \`\${value}\`);
console.log("toExponential", value.toExponential());
console.log("toPrecision", value.toPrecision());
/** @param {number} input */
function hinted(input) { return input.toString(); }
console.log("hint", hinted(value));
console.log("false hint", hinted(new Number(value)));
console.log("guard", hinted(value));
Number.prototype.hintMarker = 1;
console.log("guard", hinted(value));
`;
}

function expectedShortestDecimalObservation(testCase: ShortestDecimalCase) {
  const bits = shortestDecimalBits(testCase);
  const text = expectedNumberToString(bits, testCase.negative);
  return {
    exitStatus: 0,
    stderr: "",
    stdout: [
      `String ${text}`,
      `toString ${text}`,
      `template ${text}`,
      `toExponential ${expectedFreeExponential(bits, testCase.negative)}`,
      `toPrecision ${text}`,
      `hint ${text}`,
      `false hint ${text}`,
      `guard ${text}`,
      `guard ${text}`,
      "",
    ].join("\n"),
  };
}

test(
  "generated shortest Number decimals match ECMA-262 2025",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Number::toString picks the closest shortest round-trip decimal",
      fc.asyncProperty(shortestDecimalArbitrary, async (testCase) => {
        const source = printShortestDecimalCase(testCase);
        const expected = expectedShortestDecimalObservation(testCase);
        assertMatchingObservations([expected, ...(await references(source))]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-number-shortest.ts" },
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
                toolchain: nativeToolchain,
              },
              (native) => {
                assertMatchingObservations([expected, native]);
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
          "a power of two 2^e with e drawn from the binary16 -24..15, " +
          "binary32 -149..127, or binary64 -1074..1023 exponent range, " +
          "the double one unit in the last place below or above it as a " +
          "symmetric-interval control (the power itself when the one " +
          "below would be zero), and a sign; omitted-argument decimal " +
          "formatting through String, toString, a template, " +
          "toExponential, and toPrecision, a false hint, and a " +
          "shape-guard miss, against an exact-rational Number::toString " +
          "oracle. toLocaleString is left out because the reference " +
          "engines format it through ECMA-402.",
        numRuns: 16,
        profile: "M5 Number shortest decimal",
        seed: 0x6000_4901,
        sizeLimit:
          "one exponent, one neighbor offset, one sign, five format " +
          "observations, two hint classes, and one prototype shape change",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
