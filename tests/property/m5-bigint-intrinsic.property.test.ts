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

/**
 * The independent oracle keeps a sign and a little-endian base-2^15
 * magnitude in ordinary Numbers, so no result compared below is
 * produced by a host BigInt or by the runtime's own 30-bit limbs. Every
 * intermediate stays under 2^21, which a double represents exactly.
 */
const modelBase = 32_768;
const modelBits = 15;
const digitAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

function trimModel(digits: readonly number[]): number[] {
  const result = [...digits];
  while (result.length > 1 && result[result.length - 1] === 0) result.pop();
  return result;
}

function modelIsZero(digits: readonly number[]): boolean {
  return digits.length === 1 && digits[0] === 0;
}

function modelBit(digits: readonly number[], bit: number): number {
  const index = Math.floor(bit / modelBits);
  if (index >= digits.length) return 0;
  return ((digits[index] ?? 0) >> (bit % modelBits)) & 1;
}

function modelWidthLength(width: number): number {
  return Math.floor(width / modelBits) + 1;
}

function modelTopMask(width: number): number {
  const topBit = width % modelBits;
  return topBit === 0 ? 0 : (1 << topBit) - 1;
}

/** The low `width` bits of a magnitude. */
function modelTruncate(digits: readonly number[], width: number): number[] {
  const length = modelWidthLength(width);
  const result: number[] = [];
  for (let index = 0; index < length; index += 1) {
    result.push(digits[index] ?? 0);
  }
  result[length - 1] = (result[length - 1] ?? 0) & modelTopMask(width);
  return trimModel(result);
}

/** 2**width minus a nonzero magnitude already below 2**width. */
function modelComplement(digits: readonly number[], width: number): number[] {
  const length = modelWidthLength(width);
  const result: number[] = [];
  for (let index = 0; index < length; index += 1) {
    result.push(~(digits[index] ?? 0) & (modelBase - 1));
  }
  result[length - 1] = (result[length - 1] ?? 0) & modelTopMask(width);
  let carry = 1;
  for (let index = 0; index < length && carry !== 0; index += 1) {
    const sum = (result[index] ?? 0) + carry;
    result[index] = sum & (modelBase - 1);
    carry = sum >> modelBits;
  }
  return trimModel(result);
}

function modelRadixText(digits: readonly number[], radix: number): string {
  const working = trimModel(digits);
  const characters: string[] = [];
  do {
    let remainder = 0;
    for (let cursor = working.length; cursor > 0; cursor -= 1) {
      const current = remainder * modelBase + (working[cursor - 1] ?? 0);
      working[cursor - 1] = Math.floor(current / radix);
      remainder = current % radix;
    }
    characters.push(digitAlphabet[remainder] ?? "?");
    while (working.length > 1 && working[working.length - 1] === 0) {
      working.pop();
    }
  } while (!(working.length === 1 && working[0] === 0));
  return characters.toReversed().join("");
}

function modelSignedText(
  negative: boolean,
  digits: readonly number[],
  radix: number,
): string {
  if (modelIsZero(trimModel(digits))) return "0";
  return `${negative ? "-" : ""}${modelRadixText(digits, radix)}`;
}

interface ModelInteger {
  readonly digits: readonly number[];
  readonly negative: boolean;
}

/** BigInt.asIntN and BigInt.asUintN over the independent model. */
function modelAsWidth(
  value: ModelInteger,
  width: number,
  signedResult: boolean,
): ModelInteger {
  if (width === 0) return { digits: [0], negative: false };
  const low = modelTruncate(value.digits, width);
  let magnitude =
    value.negative && !modelIsZero(low) ? modelComplement(low, width) : low;
  let negative = false;
  if (signedResult && modelBit(magnitude, width - 1) === 1) {
    magnitude = modelComplement(magnitude, width);
    negative = true;
  }
  return { digits: magnitude, negative: negative && !modelIsZero(magnitude) };
}

interface BigIntIntrinsicCase {
  readonly limbs: readonly number[];
  readonly negative: boolean;
  readonly parseRadix: 2 | 8 | 10 | 16;
  readonly radix: number;
  readonly width: number;
}

const caseArbitrary: fc.Arbitrary<BigIntIntrinsicCase> = fc.record({
  limbs: fc.array(fc.integer({ max: modelBase - 1, min: 0 }), {
    maxLength: 6,
    minLength: 1,
  }),
  negative: fc.boolean(),
  parseRadix: fc.constantFrom(2, 8, 10, 16),
  radix: fc.integer({ max: 36, min: 2 }),
  width: fc.integer({ max: 96, min: 0 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function operand(testCase: BigIntIntrinsicCase): ModelInteger {
  const digits = trimModel(testCase.limbs);
  return {
    digits,
    negative: testCase.negative && !modelIsZero(digits),
  };
}

const parsePrefixes = {
  2: "0b",
  8: "0o",
  10: "",
  16: "0x",
} as const;

function printCase(testCase: BigIntIntrinsicCase): string {
  const value = operand(testCase);
  const literal = `${value.negative ? "-" : ""}0x${modelRadixText(
    value.digits,
    16,
  )}n`;
  const parsePrefix = parsePrefixes[testCase.parseRadix] ?? "";
  /*
   * StringToBigInt admits a sign only in front of decimal digits, so a
   * non-decimal spelling carries the magnitude alone and is compared
   * against the unsigned literal.
   */
  const signedParse = testCase.parseRadix === 10;
  const parseText = `${
    value.negative && signedParse ? "-" : ""
  }${parsePrefix}${modelRadixText(value.digits, testCase.parseRadix)}`;
  const parseValue = `0x${modelRadixText(value.digits, 16)}n`;
  const parseExpression =
    value.negative && signedParse ? `-(${parseValue})` : parseValue;
  return `
const value = ${literal};
console.log("text", value.toString(), value.toString(${testCase.radix}));
console.log(
  "width",
  String(BigInt.asIntN(${testCase.width}, value)),
  String(BigInt.asUintN(${testCase.width}, value)),
);
console.log("parse", BigInt("  ${parseText}  ") === ${parseExpression});
const wrapper = Object(value);
console.log(
  "wrapper",
  BigInt.prototype.valueOf.call(wrapper) === value,
  wrapper.toString(${testCase.radix}),
  ({}).toString.call(wrapper),
);
console.log("identity", BigInt.asIntN(8589934592, value) === value);
try { BigInt(value.toString() + "n"); } catch (error) {
  console.log("suffix", error instanceof SyntaxError);
}
try { BigInt.prototype.valueOf.call(Object.create(BigInt.prototype)); }
catch (error) {
  console.log("brand", error instanceof TypeError);
}
try { value.toString(1); } catch (error) {
  console.log("radix", error instanceof RangeError);
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", String(hinted(value, 0n)), hinted(1, 2));
const originalAsIntN = BigInt.asIntN;
let turn = 0;
while (turn < 2) {
  console.log("guard", BigInt.asIntN === originalAsIntN);
  if (turn === 0) BigInt.marker = value;
  turn = turn + 1;
}
delete BigInt.marker;
const originalBigInt = BigInt;
BigInt = value;
console.log("global write", this.BigInt === BigInt);
BigInt = originalBigInt;
console.log("global restore", this.BigInt === BigInt, typeof BigInt);
`;
}

function expected(testCase: BigIntIntrinsicCase): string {
  const value = operand(testCase);
  const signed = modelAsWidth(value, testCase.width, true);
  const unsigned = modelAsWidth(value, testCase.width, false);
  const decimal = modelSignedText(value.negative, value.digits, 10);
  const radixText = modelSignedText(
    value.negative,
    value.digits,
    testCase.radix,
  );
  return [
    `text ${decimal} ${radixText}`,
    `width ${modelSignedText(signed.negative, signed.digits, 10)} ` +
      modelSignedText(unsigned.negative, unsigned.digits, 10),
    "parse true",
    `wrapper true ${radixText} [object BigInt]`,
    "identity true",
    "suffix true",
    "brand true",
    "radix true",
    `hint ${decimal} 3`,
    "guard true",
    "guard true",
    "global write true",
    "global restore true function",
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
    "oseo-bigint-intrinsic-property-",
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
  "generated BigInt intrinsic operations match the independent model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "BigInt conversion, fixed width, text, and wrappers agree",
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
            { source, sourceId: "generated-m5-bigint-intrinsic.ts" },
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
          "one sign and one to six base-2^15 magnitude digits, one text " +
          "radix from 2 to 36, one fixed width from 0 to 96, one string " +
          "grammar from binary, octal, decimal, or hexadecimal, one " +
          "above-magnitude identity width, a false number hint, one " +
          "intrinsic shape-guard miss, and one global BigInt write and " +
          "restore",
        numRuns: 12,
        profile: "M5 BigInt intrinsic",
        seed: 0x6000_4b00,
        sizeLimit:
          "one bounded sign-and-magnitude operand of at most 90 bits, one " +
          "radix, one width, one wrapper, two repeated intrinsic property " +
          "observations, and one global write and restore",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
