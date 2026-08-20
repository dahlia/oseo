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
 * The independent oracle works only in byte lists and ordinary Numbers.
 * It never reads a host DataView, never inspects a double's encoding, and
 * never uses a host BigInt: an IEEE image is built by repeatedly halving
 * or doubling a magnitude, and a 64-bit integer image is built from a
 * base-2^15 magnitude divided down into base-256 digits. Nothing below
 * mirrors the runtime's shift-and-mask arithmetic.
 */

/** `value` multiplied by 2**exponent without an intermediate overflow. */
function scaleByPowerOfTwo(value: number, exponent: number): number {
  let result = value;
  let remaining = exponent;
  while (remaining > 500) {
    result *= 2 ** 500;
    remaining -= 500;
  }
  while (remaining < -500) {
    result *= 2 ** -500;
    remaining += 500;
  }
  return result * 2 ** remaining;
}

/** Round half to even over an exact non-negative Number below 2**53. */
function roundTiesToEven(value: number): number {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction > 0.5) return lower + 1;
  if (fraction < 0.5) return lower;
  return lower % 2 === 0 ? lower : lower + 1;
}

interface IeeeFormat {
  readonly exponentBits: number;
  readonly significandBits: number;
}

interface IeeeImage {
  readonly field: number;
  readonly fraction: number;
  readonly negative: boolean;
}

/** The interchange fields `value` rounds to in one binary format. */
function encodeIeee(value: number, format: IeeeFormat): IeeeImage {
  const { exponentBits, significandBits } = format;
  const bias = 2 ** (exponentBits - 1) - 1;
  const maximumField = 2 ** exponentBits - 1;
  const implicit = 2 ** significandBits;
  const negative = value < 0 || Object.is(value, -0);
  if (Number.isNaN(value)) {
    return { field: maximumField, fraction: implicit / 2, negative: false };
  }
  let magnitude = Math.abs(value);
  if (magnitude === Infinity) {
    return { field: maximumField, fraction: 0, negative };
  }
  if (magnitude === 0) return { field: 0, fraction: 0, negative };
  let exponent = 0;
  while (magnitude >= 2) {
    magnitude /= 2;
    exponent += 1;
  }
  while (magnitude < 1) {
    magnitude *= 2;
    exponent -= 1;
  }
  if (exponent < 1 - bias) {
    // Below the smallest normal every representable value is a multiple
    // of one shared quantum, so the whole magnitude is rounded at once.
    const scaled = scaleByPowerOfTwo(
      Math.abs(value),
      bias - 1 + significandBits,
    );
    const rounded = roundTiesToEven(scaled);
    if (rounded < implicit) return { field: 0, fraction: rounded, negative };
    return { field: 1, fraction: 0, negative };
  }
  let rounded = roundTiesToEven(magnitude * implicit);
  let field = exponent + bias;
  if (rounded === implicit * 2) {
    rounded = implicit;
    field += 1;
  }
  if (field >= maximumField) {
    return { field: maximumField, fraction: 0, negative };
  }
  return { field, fraction: rounded - implicit, negative };
}

/** The little-endian bytes of one interchange image. */
function ieeeBytes(image: IeeeImage, format: IeeeFormat): number[] {
  const { exponentBits, significandBits } = format;
  const width = (1 + exponentBits + significandBits) / 8;
  const digits: number[] = [];
  let remaining = image.fraction;
  for (let index = 0; index < width; index += 1) {
    digits.push(remaining % 256);
    remaining = Math.floor(remaining / 256);
  }
  // The exponent field starts where the stored significand ends, and the
  // sign bit is the last one, so both are added into the leading digits.
  const fieldStart = significandBits % 8;
  const fieldByte = Math.floor(significandBits / 8);
  let field = image.field;
  const fieldRoom = 8 - fieldStart;
  digits[fieldByte] =
    (digits[fieldByte] ?? 0) + (field % 2 ** fieldRoom) * 2 ** fieldStart;
  field = Math.floor(field / 2 ** fieldRoom);
  for (let index = fieldByte + 1; index < width; index += 1) {
    digits[index] = (digits[index] ?? 0) + (field % 256);
    field = Math.floor(field / 256);
  }
  if (image.negative) digits[width - 1] = (digits[width - 1] ?? 0) + 128;
  return digits;
}

/**
 * The interchange image one little-endian byte list denotes. The stored
 * significand and the sign-and-exponent half are accumulated separately
 * because a binary64 encoding read as one integer would need
 * sixty-four bits, which an ordinary Number cannot hold exactly.
 */
function decodeIeee(bytes: readonly number[], format: IeeeFormat): IeeeImage {
  const { exponentBits, significandBits } = format;
  const width = (1 + exponentBits + significandBits) / 8;
  const wholeBytes = Math.floor(significandBits / 8);
  const partialBits = significandBits % 8;
  let fraction = 0;
  for (let index = wholeBytes; index > 0; index -= 1) {
    fraction = fraction * 256 + (bytes[index - 1] ?? 0);
  }
  let upper = 0;
  for (let index = width; index > wholeBytes; index -= 1) {
    upper = upper * 256 + (bytes[index - 1] ?? 0);
  }
  fraction += (upper % 2 ** partialBits) * 2 ** (wholeBytes * 8);
  const signAndField = Math.floor(upper / 2 ** partialBits);
  const field = signAndField % 2 ** exponentBits;
  const negative = Math.floor(signAndField / 2 ** exponentBits) === 1;
  return { field, fraction, negative };
}

/**
 * A source-text expression for the exact Number one image denotes. The
 * generated program compares its own load against this expression, so
 * neither side depends on `ToString(Number)`.
 */
function ieeeExpression(image: IeeeImage, format: IeeeFormat): string {
  const { exponentBits, significandBits } = format;
  const bias = 2 ** (exponentBits - 1) - 1;
  const maximumField = 2 ** exponentBits - 1;
  const sign = image.negative ? "-" : "";
  if (image.field === maximumField) {
    return image.fraction === 0 ? `${sign}Infinity` : "NaN";
  }
  if (image.field === 0) {
    if (image.fraction === 0) return `${sign}0`;
    return `${sign}(${image.fraction} * 2 ** ${1 - bias - significandBits})`;
  }
  const significand = image.fraction + 2 ** significandBits;
  const exponent = image.field - bias - significandBits;
  return `${sign}(${significand} * 2 ** ${exponent})`;
}

/** The little-endian two's-complement bytes of one truncated Number. */
function integerBytes(value: number, width: number): number[] {
  const digits: number[] = [];
  if (!Number.isFinite(value)) {
    for (let index = 0; index < width; index += 1) digits.push(0);
    return digits;
  }
  let magnitude = Math.abs(Math.trunc(value));
  for (let index = 0; index < width; index += 1) {
    digits.push(magnitude % 256);
    magnitude = Math.floor(magnitude / 256);
  }
  if (!(value < 0)) return digits;
  // Two's complement over exactly this width, which is the specified
  // value modulo 2**(8 * width).
  let borrow = 1;
  for (let index = 0; index < width; index += 1) {
    const complement = 255 - (digits[index] ?? 0) + borrow;
    digits[index] = complement % 256;
    borrow = complement >= 256 ? 1 : 0;
  }
  return digits;
}

/** The Number one little-endian integer encoding denotes. */
function integerValue(
  bytes: readonly number[],
  width: number,
  signed: boolean,
): number {
  let magnitude = 0;
  for (let index = width; index > 0; index -= 1) {
    magnitude = magnitude * 256 + (bytes[index - 1] ?? 0);
  }
  if (signed && magnitude >= 2 ** (width * 8 - 1)) {
    return magnitude - 2 ** (width * 8);
  }
  return magnitude;
}

/** One base-2^15 magnitude after dividing by a small divisor. */
interface DividedDigits {
  readonly quotient: number[];
  readonly remainder: number;
}

/** One base-2^15 little-endian magnitude divided by a small divisor. */
function divideDigits(
  digits: readonly number[],
  divisor: number,
): DividedDigits {
  const quotient: number[] = [];
  let remainder = 0;
  for (let index = digits.length; index > 0; index -= 1) {
    const current = remainder * 32_768 + (digits[index - 1] ?? 0);
    quotient[index - 1] = Math.floor(current / divisor);
    remainder = current % divisor;
  }
  while (quotient.length > 1 && quotient[quotient.length - 1] === 0) {
    quotient.pop();
  }
  return { quotient, remainder };
}

function digitsAreZero(digits: readonly number[]): boolean {
  return digits.every((digit) => digit === 0);
}

/** The eight little-endian bytes of one signed base-2^15 magnitude. */
function bigIntegerBytes(
  digits: readonly number[],
  negative: boolean,
): number[] {
  const bytes: number[] = [];
  let remaining = [...digits];
  for (let index = 0; index < 8; index += 1) {
    const step = divideDigits(remaining, 256);
    bytes.push(step.remainder);
    remaining = step.quotient;
  }
  if (!negative) return bytes;
  let borrow = 1;
  for (let index = 0; index < 8; index += 1) {
    const complement = 255 - (bytes[index] ?? 0) + borrow;
    bytes[index] = complement % 256;
    borrow = complement >= 256 ? 1 : 0;
  }
  return bytes;
}

/** The decimal text one eight-byte encoding denotes. */
function bigIntegerText(bytes: readonly number[], signed: boolean): string {
  let magnitude = [...bytes];
  let negative = false;
  if (signed && (magnitude[7] ?? 0) >= 128) {
    negative = true;
    let borrow = 1;
    for (let index = 0; index < 8; index += 1) {
      const complement = 255 - (magnitude[index] ?? 0) + borrow;
      magnitude[index] = complement % 256;
      borrow = complement >= 256 ? 1 : 0;
    }
  }
  const characters: string[] = [];
  do {
    let remainder = 0;
    for (let index = magnitude.length; index > 0; index -= 1) {
      const current = remainder * 256 + (magnitude[index - 1] ?? 0);
      magnitude[index - 1] = Math.floor(current / 10);
      remainder = current % 10;
    }
    characters.push(String(remainder));
    while (magnitude.length > 1 && magnitude[magnitude.length - 1] === 0) {
      magnitude.pop();
    }
  } while (!digitsAreZero(magnitude));
  if (characters.length > 1 || characters[0] !== "0") {
    while (characters.length > 1 && characters[characters.length - 1] === "0") {
      characters.pop();
    }
  }
  const text = characters.toReversed().join("");
  return negative && text !== "0" ? `-${text}` : text;
}

/** The hexadecimal magnitude text one base-2^15 magnitude denotes. */
function hexadecimalText(digits: readonly number[]): string {
  let magnitude = [...digits];
  const alphabet = "0123456789abcdef";
  const characters: string[] = [];
  do {
    const step = divideDigits(magnitude, 16);
    characters.push(alphabet[step.remainder] ?? "?");
    magnitude = step.quotient;
  } while (!digitsAreZero(magnitude));
  return characters.toReversed().join("");
}

interface ElementKind {
  readonly big: boolean;
  /** Present exactly for the three float element types. */
  readonly format?: IeeeFormat;
  readonly name: string;
  readonly signed: boolean;
  readonly width: number;
}

const elementKinds: readonly ElementKind[] = [
  { big: false, name: "Int8", signed: true, width: 1 },
  { big: false, name: "Uint8", signed: false, width: 1 },
  { big: false, name: "Int16", signed: true, width: 2 },
  { big: false, name: "Uint16", signed: false, width: 2 },
  { big: false, name: "Int32", signed: true, width: 4 },
  { big: false, name: "Uint32", signed: false, width: 4 },
  {
    big: false,
    format: { exponentBits: 5, significandBits: 10 },
    name: "Float16",
    signed: true,
    width: 2,
  },
  {
    big: false,
    format: { exponentBits: 8, significandBits: 23 },
    name: "Float32",
    signed: true,
    width: 4,
  },
  {
    big: false,
    format: { exponentBits: 11, significandBits: 52 },
    name: "Float64",
    signed: true,
    width: 8,
  },
  { big: true, name: "BigInt64", signed: true, width: 8 },
  { big: true, name: "BigUint64", signed: false, width: 8 },
];

const bufferBytes = 24;

interface DataViewCase {
  readonly bigDigits: readonly number[];
  readonly bigNegative: boolean;
  readonly element: number;
  readonly exponent: number;
  readonly fill: readonly number[];
  readonly little: boolean;
  readonly mantissa: number;
  readonly negative: boolean;
  readonly offset: number;
  readonly special: number;
  readonly viewLength: number;
  readonly viewOffset: number;
}

/*
 * Values the uniform mantissa and exponent above would reach only by
 * accident: both zeros, both infinities, NaN, and the smallest normal,
 * the first normal binade, the smallest subnormal, and the rounding tie
 * that overflows to infinity for each of the three float widths. Each
 * spelling round-trips through the decimal-to-binary64 conversion both
 * this model and the generated program perform.
 */
const specialNumbers = [
  "NaN",
  "Infinity",
  "-Infinity",
  "0",
  "-0",
  "0.00006103515625",
  "0.000091552734375",
  "0.0001",
  "0.000030517578125",
  "5.960464477539063e-8",
  "65504",
  "65520",
  "1.1754943508222875e-38",
  "1.7625602864128504e-38",
  "1.401298464324817e-45",
  "3.4028234663852886e38",
  "3.402823669209385e38",
  "2.2250738585072014e-308",
  "3.34095865190759e-308",
  "5e-324",
  "1.7976931348623157e308",
] as const;

const caseArbitrary: fc.Arbitrary<DataViewCase> = fc.record({
  bigDigits: fc.array(fc.integer({ max: 32_767, min: 0 }), {
    maxLength: 6,
    minLength: 1,
  }),
  bigNegative: fc.boolean(),
  element: fc.integer({ max: elementKinds.length - 1, min: 0 }),
  /*
   * The whole binary64 exponent range, so the subnormal region, the
   * first normal binade, and the overflow boundary of all three float
   * element types are reachable. The lower bound keeps 2**exponent
   * exactly representable.
   */
  exponent: fc.integer({ max: 1023, min: -1074 }),
  fill: fc.array(fc.integer({ max: 255, min: 0 }), {
    maxLength: bufferBytes,
    minLength: bufferBytes,
  }),
  little: fc.boolean(),
  mantissa: fc.integer({ max: 16_777_215, min: 0 }),
  negative: fc.boolean(),
  offset: fc.integer({ max: bufferBytes, min: 0 }),
  /* A negative index selects the generated mantissa and exponent, which
   * the extra weight below keeps common. */
  special: fc.integer({ max: specialNumbers.length - 1, min: -20 }),
  viewLength: fc.integer({ max: bufferBytes, min: 0 }),
  viewOffset: fc.integer({ max: 8, min: 0 }),
});

/** One generated view window inside the fixed buffer. */
interface ViewWindow {
  readonly length: number;
  readonly offset: number;
}

/** The generated view window, clamped into the fixed buffer. */
function windowOf(testCase: DataViewCase): ViewWindow {
  const offset = testCase.viewOffset;
  const length = Math.min(testCase.viewLength, bufferBytes - offset);
  return { length, offset };
}

/** One generated Number operand and the source text that denotes it. */
interface NumberOperand {
  readonly text: string;
  readonly value: number;
}

/** The stored Number, as source text and as the value it denotes. */
function numberOperand(testCase: DataViewCase): NumberOperand {
  if (testCase.special >= 0) {
    const text = specialNumbers[testCase.special] ?? "0";
    return { text, value: Number(text) };
  }
  const sign = testCase.negative ? "-" : "";
  /*
   * The generated exponent keeps 2**exponent exactly representable, so
   * this is one correctly rounded multiplication that the generated
   * program performs in exactly the same way.
   */
  const value = testCase.mantissa * 2 ** testCase.exponent;
  return {
    text: `${sign}(${testCase.mantissa} * 2 ** ${testCase.exponent})`,
    value: testCase.negative ? -value : value,
  };
}

/** One generated sign-and-magnitude BigInt operand. */
interface BigOperand {
  readonly digits: readonly number[];
  readonly negative: boolean;
}

/** The base-2^15 magnitude with its trailing zero digits removed. */
function bigOperand(testCase: DataViewCase): BigOperand {
  const digits = [...testCase.bigDigits];
  while (digits.length > 1 && digits[digits.length - 1] === 0) digits.pop();
  const negative = testCase.bigNegative && !digitsAreZero(digits);
  return { digits, negative };
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printCase(testCase: DataViewCase): string {
  const kind = elementKinds[testCase.element] ?? elementKinds[0];
  assert.ok(kind != null);
  const view = windowOf(testCase);
  const big = bigOperand(testCase);
  const number = numberOperand(testCase);
  const operand = kind.big
    ? `${big.negative ? "-" : ""}0x${hexadecimalText(big.digits)}n`
    : number.text;
  const fill = testCase.fill
    .map((byte, index) => `setup.setUint8(${index}, ${byte});`)
    .join("\n");
  const format = kind.format;
  const expectedLoad =
    format == null
      ? "null"
      : ieeeExpression(decodeIeee(storedBytes(testCase), format), format);
  const read = `window.get${kind.name}(${testCase.offset}, ${testCase.little})`;
  const load = kind.big
    ? `console.log("load", String(${read}));`
    : format == null
      ? `console.log("load", ${read});`
      : `console.log("load", Object.is(${read}, ${expectedLoad}));`;
  return `
const buffer = new ArrayBuffer(${bufferBytes});
const setup = new DataView(buffer);
${fill}
const window = new DataView(buffer, ${view.offset}, ${view.length});
console.log(
  "shape",
  window.byteLength,
  window.byteOffset,
  window.buffer === buffer,
  ArrayBuffer.isView(window),
);
try {
  window.set${kind.name}(${testCase.offset}, ${operand}, ${testCase.little});
  let image = "";
  for (let index = 0; index < ${bufferBytes}; index = index + 1) {
    image = image + "." + setup.getUint8(index);
  }
  console.log("store", image);
  ${load}
} catch (error) {
  console.log("abrupt", error.constructor.name);
}
const detachable = new ArrayBuffer(${bufferBytes});
const orphan = new DataView(detachable, ${view.offset});
detachable.transfer();
try {
  orphan.get${kind.name}(0);
} catch (error) {
  console.log("detached", error.constructor.name, orphan.buffer === detachable);
}
const tracking = new ArrayBuffer(${bufferBytes}, { maxByteLength: 32 });
const follower = new DataView(tracking, ${view.offset});
console.log("tracking", follower.byteLength);
tracking.resize(32);
console.log("grown", follower.byteLength);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log(
  "hint",
  hinted(setup.getUint8(0), setup.getUint8(1)),
  hinted(1, 2),
);
const originalGetter = DataView.prototype.getUint8;
let turn = 0;
while (turn < 2) {
  console.log("guard", DataView.prototype.getUint8 === originalGetter);
  if (turn === 0) DataView.prototype.probe = 1;
  turn = turn + 1;
}
delete DataView.prototype.probe;
`;
}

/**
 * The element's bytes as they read back out of the block, least
 * significant first, after the generated store placed them in the
 * generated byte order.
 */
function storedBytes(testCase: DataViewCase): number[] {
  const kind = elementKinds[testCase.element] ?? elementKinds[0];
  assert.ok(kind != null);
  const view = windowOf(testCase);
  const image = expectedBytes(testCase);
  const stored: number[] = [];
  for (let index = 0; index < kind.width; index += 1) {
    const source =
      view.offset +
      testCase.offset +
      (testCase.little ? index : kind.width - 1 - index);
    stored.push(image[source] ?? 0);
  }
  return stored;
}

/** The whole buffer image the model expects after the store. */
function expectedBytes(testCase: DataViewCase): number[] {
  const kind = elementKinds[testCase.element] ?? elementKinds[0];
  assert.ok(kind != null);
  const view = windowOf(testCase);
  const image = [...testCase.fill];
  if (testCase.offset + kind.width > view.length) return image;
  const format = kind.format;
  const big = bigOperand(testCase);
  const element = kind.big
    ? bigIntegerBytes(big.digits, big.negative)
    : format == null
      ? integerBytes(numberOperand(testCase).value, kind.width)
      : ieeeBytes(encodeIeee(numberOperand(testCase).value, format), format);
  for (let index = 0; index < kind.width; index += 1) {
    const target = view.offset + testCase.offset + index;
    const source = testCase.little ? index : kind.width - 1 - index;
    image[target] = element[source] ?? 0;
  }
  return image;
}

function expected(testCase: DataViewCase): string {
  const kind = elementKinds[testCase.element] ?? elementKinds[0];
  assert.ok(kind != null);
  const view = windowOf(testCase);
  const lines = [`shape ${view.length} ${view.offset} true true`];
  if (testCase.offset + kind.width > view.length) {
    lines.push("abrupt RangeError");
  } else {
    lines.push(
      `store ${expectedBytes(testCase)
        .map((byte) => `.${byte}`)
        .join("")}`,
    );
    const stored = storedBytes(testCase);
    if (kind.big) {
      lines.push(`load ${bigIntegerText(stored, kind.signed)}`);
    } else if (kind.format == null) {
      lines.push(`load ${integerValue(stored, kind.width, kind.signed)}`);
    } else {
      lines.push("load true");
    }
  }
  lines.push("detached TypeError true");
  const trackingLength = bufferBytes - view.offset;
  lines.push(`tracking ${trackingLength}`);
  lines.push(`grown ${32 - view.offset}`);
  const image = expectedBytes(testCase);
  lines.push(`hint ${(image[0] ?? 0) + (image[1] ?? 0)} 3`);
  lines.push("guard true", "guard true", "");
  return lines.join("\n");
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
    "oseo-data-view-property-",
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
  "generated DataView accesses match the independent byte-level model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "DataView stores, loads, bounds, and view state agree",
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
            { source, sourceId: "generated-m5-data-view.ts" },
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
          "one twenty-four byte Data Block image, one of eleven element " +
          "types, one view offset and length inside that block, one " +
          "element index that may fall outside the view, one byte order, " +
          "one stored Number built from a sign, a twenty-four bit " +
          "mantissa, and a binary exponent over the whole binary64 " +
          "range or one of twenty-one boundary values, one stored " +
          "sign-and-magnitude BigInt of at most ninety bits, one " +
          "detached buffer, one length-tracking view over a resized " +
          "buffer, a false number hint, and one " +
          "intrinsic shape-guard miss",
        numRuns: 12,
        profile: "M5 DataView",
        seed: 0x6000_4c00,
        sizeLimit:
          "one twenty-four byte block, one element, one view window, one " +
          "operand of at most ninety bits, one resize, and two repeated " +
          "intrinsic property observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
