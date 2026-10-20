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

type ConstructorName =
  | "BigInt64Array"
  | "BigUint64Array"
  | "Float32Array"
  | "Float64Array"
  | "Int16Array"
  | "Int32Array"
  | "Int8Array"
  | "Uint16Array"
  | "Uint32Array"
  | "Uint8Array"
  | "Uint8ClampedArray";

type ConstructionPath = "array-like" | "buffer" | "iterable" | "typed";
type IteratorMode = "custom" | "null" | "own";
type OutOfBoundsSource = "fixed" | "tracking";
type PrototypeMode = "default" | "null";
type ShadowKey = "buffer" | "byteLength" | "byteOffset" | "length";
type TagPrototypeMode = "custom" | "null";

interface TypedArrayCase {
  readonly constructorName: ConstructorName;
  readonly iteratorMode: IteratorMode;
  readonly outOfBoundsSource: OutOfBoundsSource;
  readonly path: ConstructionPath;
  readonly prototypeMode: PrototypeMode;
  readonly shadowKey: ShadowKey;
  readonly tagPrototypeMode: TagPrototypeMode;
  readonly values: readonly (bigint | number)[];
}

const numberConstructors: readonly ConstructorName[] = [
  "Float32Array",
  "Float64Array",
  "Int16Array",
  "Int32Array",
  "Int8Array",
  "Uint16Array",
  "Uint32Array",
  "Uint8Array",
  "Uint8ClampedArray",
];

const bigintConstructors: readonly ConstructorName[] = [
  "BigInt64Array",
  "BigUint64Array",
];

const numberCaseArbitrary: fc.Arbitrary<TypedArrayCase> = fc.record({
  constructorName: fc.constantFrom(...numberConstructors),
  iteratorMode: fc.constantFrom("custom", "null", "own"),
  outOfBoundsSource: fc.constantFrom("fixed", "tracking"),
  path: fc.constantFrom("array-like", "buffer", "iterable", "typed"),
  prototypeMode: fc.constantFrom("default", "null"),
  shadowKey: fc.constantFrom("buffer", "byteLength", "byteOffset", "length"),
  tagPrototypeMode: fc.constantFrom("custom", "null"),
  values: fc.array(
    fc.oneof(
      fc.integer({ max: 0x1_0000_0001, min: -0x1_0000_0001 }),
      fc.constantFrom(
        NaN,
        Infinity,
        -Infinity,
        0.5,
        1.5,
        2.5,
        254.5,
        3.4028234663852886e38,
        3.4028235170913126e38,
        3.4028235677973366e38,
        -3.4028234663852886e38,
        -3.4028235170913126e38,
        -3.4028235677973366e38,
      ),
    ),
    { maxLength: 8 },
  ),
});

const bigintCaseArbitrary: fc.Arbitrary<TypedArrayCase> = fc.record({
  constructorName: fc.constantFrom(...bigintConstructors),
  iteratorMode: fc.constantFrom("custom", "null", "own"),
  outOfBoundsSource: fc.constantFrom("fixed", "tracking"),
  path: fc.constantFrom("array-like", "buffer", "iterable", "typed"),
  prototypeMode: fc.constantFrom("default", "null"),
  shadowKey: fc.constantFrom("buffer", "byteLength", "byteOffset", "length"),
  tagPrototypeMode: fc.constantFrom("custom", "null"),
  values: fc.array(
    fc.bigInt({
      max: (1n << 65n) + 3n,
      min: -(1n << 65n) - 3n,
    }),
    { maxLength: 8 },
  ),
});

const caseArbitrary = fc.oneof(numberCaseArbitrary, bigintCaseArbitrary);
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function isBigInt(value: bigint | number): value is bigint {
  return typeof value === "bigint";
}

function printValue(value: bigint | number): string {
  if (isBigInt(value)) return `${value}n`;
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  return String(value);
}

function printInput(values: readonly (bigint | number)[]): string {
  return `[${values.map(printValue).join(", ")}]`;
}

function printConstruction(testCase: TypedArrayCase): string {
  const input = printInput(testCase.values);
  if (testCase.path === "array-like") {
    const properties = testCase.values
      .map((value, index) => `${index}: ${printValue(value)}`)
      .join(", ");
    const prefix = properties === "" ? "" : `${properties}, `;
    return `new Constructor({ ${prefix}length: ${testCase.values.length},
  [Symbol.iterator]: null })`;
  }
  if (testCase.path === "buffer") {
    return `new Constructor(new ArrayBuffer(
  Constructor.BYTES_PER_ELEMENT * ${testCase.values.length}))`;
  }
  if (testCase.path === "typed") {
    return `new Constructor(new Constructor(${input}))`;
  }
  return `new Constructor(${input})`;
}

function printCase(testCase: TypedArrayCase): string {
  const input = printInput(testCase.values);
  const assignments =
    testCase.path === "buffer"
      ? testCase.values
          .map((value, index) => `view[${index}] = ${printValue(value)};`)
          .join("\n")
      : "";
  return `
const Constructor = ${testCase.constructorName};
const view = ${printConstruction(testCase)};
${assignments}
console.log(
  "view",
  Constructor.name,
  Constructor.BYTES_PER_ELEMENT,
  ArrayBuffer.isView(view),
  view instanceof Constructor,
  "" + view[0],
  "" + view[1],
  "" + view[2],
  "" + view[${testCase.values.length}],
);
const propertyIsEnumerable = Object.prototype.propertyIsEnumerable;
console.log(
  "enumerable",
  propertyIsEnumerable.call(view, "0"),
  propertyIsEnumerable.call(view, "${testCase.values.length}"),
  propertyIsEnumerable.call(view, "-0"),
  propertyIsEnumerable.call(view, "1.5"),
  propertyIsEnumerable.call(view, "4294967295"),
);
const tagView = new Constructor(0);
${
  testCase.tagPrototypeMode === "custom"
    ? `Object.setPrototypeOf(tagView, {
  [Symbol.toStringTag]: "GeneratedTypedArray",
});`
    : "Object.setPrototypeOf(tagView, null);"
}
console.log(
  "tag",
  tagView[Symbol.toStringTag],
  Object.prototype.toString.call(tagView),
);
const iteratorView = new Constructor(0);
${
  testCase.iteratorMode === "custom"
    ? `Object.setPrototypeOf(iteratorView, {
  [Symbol.iterator]: function () { return [4, 6][Symbol.iterator](); },
});`
    : testCase.iteratorMode === "own"
      ? `Object.defineProperty(iteratorView, Symbol.iterator, {
  value: function () { return [4, 6][Symbol.iterator](); },
});`
      : "Object.setPrototypeOf(iteratorView, null);"
}
${
  testCase.iteratorMode === "null"
    ? `for (const consume of [
  function () { for (const value of iteratorView) void value; },
  function () { return [...iteratorView]; },
  function () { const [value] = iteratorView; return value; },
]) {
  try {
    consume();
  } catch (error) {
    console.log("iterator null", error instanceof TypeError);
  }
}`
    : `const iteratorSpread = [...iteratorView];
const [iteratorFirst, iteratorSecond] = iteratorView;
let iteratorLoop = "";
for (const value of iteratorView) iteratorLoop = iteratorLoop + value;
console.log(
  "iterator ${testCase.iteratorMode}",
  iteratorSpread[0],
  iteratorSpread[1],
  iteratorFirst,
  iteratorSecond,
  iteratorLoop,
);`
}
const copy = new Constructor(view);
console.log("copy", "" + copy[0], "" + copy[1], "" + copy[2]);
let outOfBoundsConversions = 0;
const outOfBoundsTarget = new Constructor(0);
try {
  outOfBoundsTarget[1] = ${
    testCase.constructorName.startsWith("Big")
      ? "1"
      : `{
    valueOf() {
      outOfBoundsConversions = outOfBoundsConversions + 1;
      return 7;
    },
  }`
  };
  console.log("out-of-bounds set", "number", outOfBoundsConversions);
} catch (error) {
  console.log("out-of-bounds set", "bigint", error instanceof TypeError);
}
const edgeBytes = Constructor.BYTES_PER_ELEMENT;
const edgeBuffer = new ArrayBuffer(edgeBytes * 2, {
  maxByteLength: edgeBytes * 4,
});
const edgeSource = ${
    testCase.outOfBoundsSource === "fixed"
      ? "new Constructor(edgeBuffer, edgeBytes, 1)"
      : "new Constructor(edgeBuffer, edgeBytes)"
  };
edgeBuffer.resize(0);
try {
  new Constructor(edgeSource);
} catch (error) {
  console.log(
    "out-of-bounds copy",
    "${testCase.outOfBoundsSource}",
    error instanceof TypeError,
  );
}
${
  testCase.prototypeMode === "default"
    ? `Object.defineProperty(outOfBoundsTarget, "${testCase.shadowKey}", {
  value: "own",
  writable: true,
});`
    : `Object.setPrototypeOf(outOfBoundsTarget, null);
console.log(
  "null prototype accessor before",
  "${testCase.shadowKey}",
  "${testCase.shadowKey}" in outOfBoundsTarget,
  outOfBoundsTarget["${testCase.shadowKey}"],
);`
}
outOfBoundsTarget["${testCase.shadowKey}"] = "updated";
console.log(
  "${
    testCase.prototypeMode === "default"
      ? "own accessor shadow"
      : "null prototype accessor after"
  }",
  "${testCase.shadowKey}",
  ${
    testCase.prototypeMode === "null"
      ? `"${testCase.shadowKey}" in outOfBoundsTarget,`
      : ""
  }
  outOfBoundsTarget["${testCase.shadowKey}"],
);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
const original = ${testCase.constructorName};
${testCase.constructorName} = 7;
console.log("global", ${testCase.constructorName},
  this.${testCase.constructorName} === ${testCase.constructorName});
${testCase.constructorName} = original;
void ${input};
`;
}

function integerModulo(value: number, bits: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const modulus = 2 ** bits;
  const integer = Math.trunc(value);
  return ((integer % modulus) + modulus) % modulus;
}

function signedInteger(value: number, bits: number): number {
  const unsigned = integerModulo(value, bits);
  const sign = 2 ** (bits - 1);
  return unsigned >= sign ? unsigned - 2 ** bits : unsigned;
}

function clampUint8(value: number): number {
  if (!(value > 0)) return 0;
  if (value >= 255) return 255;
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction > 0.5 || (fraction === 0.5 && lower % 2 !== 0)) {
    return lower + 1;
  }
  return lower;
}

function convert(
  constructorName: ConstructorName,
  value: bigint | number,
): bigint | number {
  if (isBigInt(value)) {
    const modulus = 1n << 64n;
    const unsigned = ((value % modulus) + modulus) % modulus;
    if (constructorName === "BigInt64Array" && unsigned >= 1n << 63n) {
      return unsigned - modulus;
    }
    return unsigned;
  }
  if (constructorName === "Float32Array") return Math.fround(value);
  if (constructorName === "Float64Array") return value;
  if (constructorName === "Uint8ClampedArray") return clampUint8(value);
  if (constructorName.startsWith("Uint")) {
    const bits = Number(constructorName.match(/\d+/u)?.[0] ?? "8");
    return integerModulo(value, bits);
  }
  const bits = Number(constructorName.match(/\d+/u)?.[0] ?? "8");
  return signedInteger(value, bits);
}

function observationValue(value: bigint | number | undefined): string {
  return value === undefined ? "undefined" : String(value);
}

function expected(testCase: TypedArrayCase): string {
  const values = testCase.values.map((value) =>
    convert(testCase.constructorName, value),
  );
  const observed = [values[0], values[1], values[2]]
    .map(observationValue)
    .join(" ");
  const bytes =
    testCase.constructorName === "Uint8ClampedArray" ||
    testCase.constructorName.includes("8Array")
      ? 1
      : testCase.constructorName.includes("16Array")
        ? 2
        : testCase.constructorName.includes("32Array")
          ? 4
          : 8;
  return [
    `view ${testCase.constructorName} ${bytes} true true ${observed} undefined`,
    `enumerable ${testCase.values.length > 0} false false false false`,
    testCase.tagPrototypeMode === "custom"
      ? "tag GeneratedTypedArray [object GeneratedTypedArray]"
      : "tag undefined [object Object]",
    ...(testCase.iteratorMode === "null"
      ? ["iterator null true", "iterator null true", "iterator null true"]
      : [`iterator ${testCase.iteratorMode} 4 6 4 6 46`]),
    `copy ${observed}`,
    testCase.constructorName.startsWith("Big")
      ? "out-of-bounds set bigint true"
      : "out-of-bounds set number 1",
    `out-of-bounds copy ${testCase.outOfBoundsSource} true`,
    ...(testCase.prototypeMode === "default"
      ? [`own accessor shadow ${testCase.shadowKey} updated`]
      : [
          "null prototype accessor before " +
            `${testCase.shadowKey} false undefined`,
          `null prototype accessor after ${testCase.shadowKey} true updated`,
        ]),
    "hint 5 23",
    "global 7 true",
    "",
  ].join("\n");
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory("oseo-typed-array-");
  const sourcePath = `${directory}/typed-array.ts`;
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
  "generated TypedArray construction matches the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "TypedArray construction and conversion agree",
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
            { source, sourceId: "generated-m5-typed-array.ts" },
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
          "one of eleven constructors, zero to eight bounded Number or " +
          "BigInt inputs, one iterable, array-like, buffer, or typed-array " +
          "construction path, one clone, one out-of-bounds conversion, " +
          "one fixed or offset length-tracking out-of-bounds clone, one " +
          "default-chain own shadow or null-prototype deferred accessor, " +
          "one custom or null-prototype toStringTag lookup, live and " +
          "out-of-bounds element enumerability, canonical numeric misses, " +
          "one own, custom, or null-prototype iterator lookup, " +
          "one false numeric hint, and one mutable intrinsic global write " +
          "and restore",
        numRuns: 12,
        profile: "M5 TypedArray constructors",
        seed: 0x6000_6e00,
        sizeLimit:
          "one constructor, one construction path, at most eight values, " +
          "one typed-array clone, one out-of-bounds set and clone, one " +
          "default or null prototype accessor case, one false hint, and " +
          "one custom or null-prototype tag case, one element enumeration, " +
          "one own, custom, or null-prototype iterator case, and one " +
          "global rebinding",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

/*
 * Construction order. ECMA-262 2025 23.2.5.1 runs ToIndex on a primitive
 * first argument before AllocateTypedArray reads the new target's
 * `prototype`, while every object argument and the zero-argument form read
 * the prototype first. The model below follows that text. Node.js 24.21.0
 * still reads the prototype first for a primitive argument, and both it and
 * Deno 2.9.7 get an iterable's iterator and drain it, or read an
 * array-like's length, before the prototype; the labeled V8 models differ
 * from the normative one only by those orders.
 */

type PrimitiveArgument =
  | "bigint"
  | "fraction"
  | "infinity"
  | "nan"
  | "negative"
  | "null"
  | "string"
  | "symbol"
  | "true"
  | "two"
  | "undefined";
type BufferLength = "absent" | "one" | "overlong";
type BufferOffset = "element" | "misaligned" | "past" | "zero";
type BufferState = "detached" | "fixed" | "resizable";
type TypedSource = "mixed" | "other" | "same";
type PrototypeResult = "object" | "primitive" | "throw";
type OrderModel = "ecma" | "v8-deno" | "v8-node";

type OrderArgument =
  | { readonly kind: "none" }
  | { readonly kind: "primitive"; readonly value: PrimitiveArgument }
  | {
      readonly kind: "buffer";
      readonly length: BufferLength;
      readonly offset: BufferOffset;
      readonly state: BufferState;
    }
  | {
      readonly kind: "typed";
      readonly detached: boolean;
      readonly source: TypedSource;
    }
  | { readonly kind: "array-like" | "iterable"; readonly count: number };

type OrderTarget =
  | { readonly kind: "call" }
  | { readonly kind: "own" }
  | { readonly kind: "bound" | "proxy"; readonly prototype: PrototypeResult };

interface OrderSubject {
  readonly argument: OrderArgument;
  readonly target: OrderTarget;
}

interface OrderCase {
  readonly constructorName: ConstructorName;
  readonly subjects: readonly OrderSubject[];
}

const primitiveArguments: readonly PrimitiveArgument[] = [
  "bigint",
  "fraction",
  "infinity",
  "nan",
  "negative",
  "null",
  "string",
  "symbol",
  "true",
  "two",
  "undefined",
];

const primitiveSources = {
  bigint: "1n",
  fraction: "1.5",
  infinity: "Infinity",
  nan: "NaN",
  negative: "-1",
  null: "null",
  string: '"3"',
  symbol: 'Symbol("length")',
  true: "true",
  two: "2",
  undefined: "undefined",
} as const satisfies Readonly<Record<PrimitiveArgument, string>>;

type PrimitiveConversion =
  | { readonly kind: "error"; readonly error: "RangeError" | "TypeError" }
  | { readonly kind: "index"; readonly index: number };

/* ToIndex (7.1.22) over ToIntegerOrInfinity and ToNumber (7.1.4). */
const primitiveConversions = {
  bigint: { error: "TypeError", kind: "error" },
  fraction: { index: 1, kind: "index" },
  infinity: { error: "RangeError", kind: "error" },
  nan: { index: 0, kind: "index" },
  negative: { error: "RangeError", kind: "error" },
  null: { index: 0, kind: "index" },
  string: { index: 3, kind: "index" },
  symbol: { error: "TypeError", kind: "error" },
  true: { index: 1, kind: "index" },
  two: { index: 2, kind: "index" },
  undefined: { index: 0, kind: "index" },
} as const satisfies Readonly<Record<PrimitiveArgument, PrimitiveConversion>>;

const elementBytes = {
  BigInt64Array: 8,
  BigUint64Array: 8,
  Float32Array: 4,
  Float64Array: 8,
  Int16Array: 2,
  Int32Array: 4,
  Int8Array: 1,
  Uint16Array: 2,
  Uint32Array: 4,
  Uint8Array: 1,
  Uint8ClampedArray: 1,
} as const satisfies Readonly<Record<ConstructorName, number>>;

const orderArgumentArbitrary: fc.Arbitrary<OrderArgument> = fc.oneof(
  { arbitrary: fc.constant({ kind: "none" } as const), weight: 1 },
  {
    arbitrary: fc.record({
      kind: fc.constant("primitive" as const),
      value: fc.constantFrom(...primitiveArguments),
    }),
    weight: 4,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant("buffer" as const),
      length: fc.constantFrom<BufferLength>("absent", "one", "overlong"),
      offset: fc.constantFrom<BufferOffset>(
        "element",
        "misaligned",
        "past",
        "zero",
      ),
      state: fc.constantFrom<BufferState>("detached", "fixed", "resizable"),
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant("typed" as const),
      detached: fc.boolean(),
      source: fc.constantFrom<TypedSource>("mixed", "other", "same"),
    }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      kind: fc.constantFrom("array-like" as const, "iterable" as const),
      count: fc.integer({ max: 2, min: 0 }),
    }),
    weight: 2,
  },
);

const orderTargetArbitrary: fc.Arbitrary<OrderTarget> = fc.oneof(
  {
    arbitrary: fc.record({
      kind: fc.constantFrom("call" as const, "own" as const),
    }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      kind: fc.constantFrom("bound" as const, "proxy" as const),
      prototype: fc.constantFrom<PrototypeResult>(
        "object",
        "primitive",
        "throw",
      ),
    }),
    weight: 4,
  },
);

const orderCaseArbitrary: fc.Arbitrary<OrderCase> = fc.record({
  constructorName: fc.constantFrom(
    ...numberConstructors,
    ...bigintConstructors,
  ),
  subjects: fc.array(
    fc.record({
      argument: orderArgumentArbitrary,
      target: orderTargetArbitrary,
    }),
    { maxLength: 4, minLength: 1 },
  ),
});

function isBigIntConstructor(constructorName: ConstructorName): boolean {
  return constructorName.startsWith("Big");
}

function printElements(
  constructorName: ConstructorName,
  count: number,
): string {
  const suffix = isBigIntConstructor(constructorName) ? "n" : "";
  return Array.from(
    { length: count },
    (_, index) => `element("value${index}", ${index + 1}${suffix})`,
  ).join(", ");
}

function bufferOffset(constructorName: ConstructorName, offset: BufferOffset) {
  const bytes = elementBytes[constructorName];
  if (offset === "element") return bytes;
  if (offset === "misaligned") return 1;
  if (offset === "past") return bytes * 5;
  return 0;
}

function printTypedSource(
  constructorName: ConstructorName,
  source: TypedSource,
  detached: boolean,
): string {
  const bigint = isBigIntConstructor(constructorName);
  const sourceBigInt = source === "mixed" ? !bigint : bigint;
  const sourceName =
    source === "same"
      ? constructorName
      : source === "mixed"
        ? bigint
          ? "Float64Array"
          : "BigInt64Array"
        : bigint
          ? constructorName === "BigInt64Array"
            ? "BigUint64Array"
            : "BigInt64Array"
          : constructorName === "Float64Array"
            ? "Int16Array"
            : "Float64Array";
  const values = sourceBigInt ? "[1n, 2n]" : "[1, 2]";
  return `typedSource(new ${sourceName}(${values}), ${detached})`;
}

function printOrderArguments(
  constructorName: ConstructorName,
  argument: OrderArgument,
): readonly string[] {
  if (argument.kind === "none") return [];
  if (argument.kind === "primitive") {
    return [`hintedLength(${primitiveSources[argument.value]})`];
  }
  if (argument.kind === "buffer") {
    const offset = `index("offset", ${bufferOffset(
      constructorName,
      argument.offset,
    )})`;
    const length =
      argument.length === "absent"
        ? []
        : [`index("length", ${argument.length === "one" ? 1 : 4})`];
    return [`buffer("${argument.state}")`, offset, ...length];
  }
  if (argument.kind === "typed") {
    return [
      printTypedSource(constructorName, argument.source, argument.detached),
    ];
  }
  const elements = printElements(constructorName, argument.count);
  return argument.kind === "iterable"
    ? [`iterable([${elements}])`]
    : [`arrayLike([${elements}])`];
}

function printOrderConstruction(
  constructorName: ConstructorName,
  subject: OrderSubject,
): string {
  const parameters = printOrderArguments(constructorName, subject.argument);
  const list = parameters.join(", ");
  if (subject.target.kind === "call") return `Constructor(${list})`;
  if (subject.target.kind === "own") return `new Constructor(${list})`;
  const target =
    subject.target.kind === "bound" ? "boundTarget" : "proxyTarget";
  return `Reflect.construct(Constructor, [${list}],
    ${target}("${subject.target.prototype}"))`;
}

function printOrderCase(testCase: OrderCase): string {
  const subjects = testCase.subjects
    .map(
      (subject, index) =>
        `observe("s${index}", function () {
  return ${printOrderConstruction(testCase.constructorName, subject)};
});`,
    )
    .join("\n");
  return `
const Constructor = ${testCase.constructorName};
const prototypeFailure = { failure: "prototype" };
const customPrototype = Object.create(Constructor.prototype);
let events = [];
/** @param {number} length */
function hintedLength(length) { return length; }
function index(tag, value) {
  return { valueOf() { events.push(tag); return value; } };
}
function element(tag, value) {
  return { valueOf() { events.push(tag); return value; } };
}
function prototypeValue(result) {
  events.push("proto");
  if (result === "throw") throw prototypeFailure;
  return result === "object" ? customPrototype : 7;
}
function boundTarget(result) {
  const target = function () {}.bind(null);
  Object.defineProperty(target, "prototype", {
    get() { return prototypeValue(result); },
  });
  return target;
}
function proxyTarget(result) {
  return new Proxy(function () {}, {
    get(target, key, receiver) {
      if (key === "prototype") return prototypeValue(result);
      return Reflect.get(target, key, receiver);
    },
  });
}
function buffer(state) {
  const bytes = Constructor.BYTES_PER_ELEMENT * 4;
  const created = state === "resizable"
    ? new ArrayBuffer(bytes, { maxByteLength: bytes * 2 })
    : new ArrayBuffer(bytes);
  if (state === "detached") created.transfer();
  return created;
}
function typedSource(view, detached) {
  if (detached) view.buffer.transfer();
  return view;
}
function iterable(values) {
  const source = {};
  Object.defineProperty(source, Symbol.iterator, {
    get() {
      events.push("iterator");
      return function () {
        let step = 0;
        return {
          next() {
            events.push("next");
            if (step === values.length) return { done: true, value: 0 };
            step = step + 1;
            return { done: false, value: values[step - 1] };
          },
        };
      };
    },
  });
  return source;
}
function arrayLike(values) {
  const source = {};
  for (let position = 0; position < values.length; position = position + 1) {
    source[position] = values[position];
  }
  Object.defineProperty(source, "length", {
    get() { events.push("length"); return values.length; },
  });
  return source;
}
function observe(label, construct) {
  events = [];
  let outcome = "";
  try {
    const view = construct();
    const prototype = Object.getPrototypeOf(view);
    let values = "";
    for (let position = 0; position < view.length; position = position + 1) {
      values = values + (position === 0 ? "" : "/") + view[position];
    }
    outcome = "ok " +
      (prototype === customPrototype
        ? "custom"
        : prototype === Constructor.prototype ? "default" : "other") +
      " " + view.length + " [" + values + "]";
  } catch (error) {
    outcome = error === prototypeFailure
      ? "prototype-failure"
      : error instanceof TypeError
        ? "TypeError"
        : error instanceof RangeError ? "RangeError" : "other";
  }
  console.log(label, events.length === 0 ? "-" : events.join(","), outcome);
}
${subjects}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
`;
}

function zeros(count: number): readonly string[] {
  return Array.from({ length: count }, () => "0");
}

function orderValues(count: number): readonly string[] {
  return Array.from({ length: count }, (_, position) => `${position + 1}`);
}

/*
 * One subject's events and outcome under the normative order or one of the
 * labeled V8 orders. Each lookup of a getter or Proxy `prototype` records
 * "proto"; an own new target has a data `prototype` that records nothing.
 */
function orderOutcome(
  constructorName: ConstructorName,
  subject: OrderSubject,
  model: OrderModel,
): string {
  const events: string[] = [];
  const finish = (outcome: string) =>
    `${events.length === 0 ? "-" : events.join(",")} ${outcome}`;
  const view = (prototype: string, values: readonly string[]) =>
    finish(`ok ${prototype} ${values.length} [${values.join("/")}]`);
  const target = subject.target;
  if (target.kind === "call") return finish("TypeError");
  const result = target.kind === "own" ? undefined : target.prototype;
  const lookup = (): string | undefined => {
    if (result == null) return "default";
    events.push("proto");
    if (result === "throw") return undefined;
    return result === "object" ? "custom" : "default";
  };
  const argument = subject.argument;
  if (argument.kind === "primitive") {
    const conversion: PrimitiveConversion =
      primitiveConversions[argument.value];
    if (model === "v8-node") {
      const prototype = lookup();
      if (prototype == null) return finish("prototype-failure");
      if (conversion.kind === "error") return finish(conversion.error);
      return view(prototype, zeros(conversion.index));
    }
    if (conversion.kind === "error") return finish(conversion.error);
    const prototype = lookup();
    if (prototype == null) return finish("prototype-failure");
    return view(prototype, zeros(conversion.index));
  }
  if (
    model !== "ecma" &&
    (argument.kind === "iterable" || argument.kind === "array-like")
  ) {
    if (argument.kind === "iterable") {
      events.push("iterator");
      for (let step = 0; step <= argument.count; step += 1) {
        events.push("next");
      }
    } else {
      events.push("length");
    }
    const prototype = lookup();
    if (prototype == null) return finish("prototype-failure");
    for (let position = 0; position < argument.count; position += 1) {
      events.push(`value${position}`);
    }
    return view(prototype, orderValues(argument.count));
  }
  const prototype = lookup();
  if (prototype == null) return finish("prototype-failure");
  if (argument.kind === "none") return view(prototype, []);
  if (argument.kind === "typed") {
    if (argument.detached || argument.source === "mixed") {
      return finish("TypeError");
    }
    return view(prototype, ["1", "2"]);
  }
  if (argument.kind === "buffer") {
    const bytes = elementBytes[constructorName];
    const byteLength = bytes * 4;
    const offset = bufferOffset(constructorName, argument.offset);
    events.push("offset");
    if (offset % bytes !== 0) return finish("RangeError");
    const length =
      argument.length === "absent"
        ? undefined
        : argument.length === "one"
          ? 1
          : 4;
    if (length != null) events.push("length");
    if (argument.state === "detached") return finish("TypeError");
    let count: number;
    if (length == null) {
      if (offset > byteLength) return finish("RangeError");
      count = (byteLength - offset) / bytes;
    } else {
      if (offset + length * bytes > byteLength) return finish("RangeError");
      count = length;
    }
    return view(prototype, zeros(count));
  }
  if (argument.kind === "iterable") {
    events.push("iterator");
    for (let step = 0; step <= argument.count; step += 1) events.push("next");
  } else {
    events.push("length");
  }
  for (let position = 0; position < argument.count; position += 1) {
    events.push(`value${position}`);
  }
  return view(prototype, orderValues(argument.count));
}

function orderExpected(testCase: OrderCase, model: OrderModel): string {
  return [
    ...testCase.subjects.map(
      (subject, index) =>
        `s${index} ${orderOutcome(testCase.constructorName, subject, model)}`,
    ),
    "hint 5 23",
    "",
  ].join("\n");
}

function orderObservation(testCase: OrderCase, model: OrderModel) {
  return { exitStatus: 0, stderr: "", stdout: orderExpected(testCase, model) };
}

async function assertOrderReferences(testCase: OrderCase): Promise<void> {
  const [node, deno] = await references(printOrderCase(testCase));
  assertMatchingObservations([orderObservation(testCase, "v8-node"), node]);
  assertMatchingObservations([orderObservation(testCase, "v8-deno"), deno]);
}

async function assertOrderNative(testCase: OrderCase): Promise<void> {
  const source = printOrderCase(testCase);
  const expectedObservation = orderObservation(testCase, "ecma");
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "generated-m5-typed-array-order.ts" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const mir = printMir(compiled.mir);
    if (specialization === "enabled") {
      assert.match(mir, /guard-smi/u);
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
}

const orderTargets: readonly OrderTarget[] = [
  { kind: "call" },
  { kind: "own" },
  ...(["bound", "proxy"] as const).flatMap((kind) =>
    (["object", "primitive", "throw"] as const).map((prototype) => ({
      kind,
      prototype,
    })),
  ),
];

/* Every argument form the generated domain draws, under every target. */
function allOrderSubjects(): readonly OrderSubject[] {
  const argumentForms: OrderArgument[] = [
    { kind: "none" },
    ...primitiveArguments.map((value) => ({
      kind: "primitive" as const,
      value,
    })),
  ];
  for (const state of ["detached", "fixed", "resizable"] as const) {
    for (const offset of ["element", "misaligned", "past", "zero"] as const) {
      for (const length of ["absent", "one", "overlong"] as const) {
        argumentForms.push({ kind: "buffer", length, offset, state });
      }
    }
  }
  for (const source of ["mixed", "other", "same"] as const) {
    for (const detached of [false, true]) {
      argumentForms.push({ kind: "typed", detached, source });
    }
  }
  for (const kind of ["array-like", "iterable"] as const) {
    for (let count = 0; count <= 2; count += 1) {
      argumentForms.push({ count, kind });
    }
  }
  return argumentForms.flatMap((argument) =>
    orderTargets.map((target) => ({ argument, target })),
  );
}

test("the labeled V8 construction orders match Node.js and Deno", async () => {
  const subjects = allOrderSubjects();
  assert.equal(subjects.length, 480);
  for (const constructorName of [
    ...numberConstructors,
    ...bigintConstructors,
  ]) {
    await assertOrderReferences({ constructorName, subjects });
  }
});

test("TypedArray construction lowers to the generic paths", () => {
  const source = printOrderCase({
    constructorName: "Float64Array",
    subjects: [
      {
        argument: { kind: "primitive", value: "symbol" },
        target: { kind: "bound", prototype: "throw" },
      },
      {
        argument: { kind: "primitive", value: "negative" },
        target: { kind: "own" },
      },
    ],
  });
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "typed-array-order-structure.ts" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const mir = printMir(compiled.mir);
    // `new Constructor(...)` and `Reflect.construct` reach the runtime
    // through the generic construct and call operations under both
    // policies, so the runtime alone owns the conversion order.
    assert.match(mir, /= construct dynamic constructor /u);
    assert.match(mir, /= call dynamic function value /u);
  }
});

test(
  "TypedArray argument conversion precedes the prototype lookup",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const fixedArguments: readonly OrderArgument[] = [
      ...primitiveArguments.map((value) => ({
        kind: "primitive" as const,
        value,
      })),
      { kind: "none" },
      { kind: "buffer", length: "one", offset: "element", state: "fixed" },
      { kind: "buffer", length: "absent", offset: "zero", state: "resizable" },
      { kind: "buffer", length: "one", offset: "zero", state: "detached" },
      { kind: "typed", detached: false, source: "other" },
      { kind: "typed", detached: true, source: "same" },
      { count: 2, kind: "iterable" },
      { count: 2, kind: "array-like" },
    ];
    const subjects = fixedArguments.flatMap((argument) =>
      orderTargets.map((target) => ({ argument, target })),
    );
    for (const constructorName of ["Float64Array", "BigInt64Array"] as const) {
      const testCase = { constructorName, subjects };
      await assertOrderReferences(testCase);
      await assertOrderNative(testCase);
    }
  },
);

test(
  "generated TypedArray construction order matches ECMA-262 2025",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "TypedArray argument conversion and prototype lookup order",
      fc.asyncProperty(orderCaseArbitrary, async (testCase) => {
        await assertOrderReferences(testCase);
        await assertOrderNative(testCase);
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
          "one of eleven constructors and one to four construction " +
          "subjects; each takes no argument, one of eleven primitive " +
          "lengths through a false numeric hint, a fixed, resizable, or " +
          "detached ArrayBuffer with converted offset and optional length, " +
          "a same, other, or mixed content TypedArray that may be detached, " +
          "or an iterable or array-like of zero to two converted elements, " +
          "and is called, constructed directly, or constructed through a " +
          "bound function or Proxy whose prototype read returns an object " +
          "or primitive or throws",
        numRuns: 12,
        profile: "M5 TypedArray construction order",
        seed: 0x6000_6e01,
        sizeLimit:
          "one constructor, four subjects, two buffer conversions, and two " +
          "elements per subject, plus one false hint",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

/*
 * Float16Array conversion. ECMA-262 2025 NumericToRawBytes rounds a Number
 * once, directly from binary64, to the nearest IEEE 754-2019 binary16 value
 * with ties to even; values at or past 65520 become signed infinity. The
 * oracle below reaches that answer by exact BigInt arithmetic over the
 * operand's binary64 encoding, independently of Math.f16round, the
 * runtime's DataView encoder, and both reference engines.
 */

type HalfInput =
  | { readonly kind: "double"; readonly value: number }
  | {
      readonly bits: number;
      readonly kind: "neighbor";
      readonly negative: boolean;
      readonly offset: "above" | "below" | "exact" | "tie";
    };
type HalfPath = "array-like" | "assignment" | "data-view" | "float64";

interface HalfCase {
  readonly inputs: readonly HalfInput[];
  readonly path: HalfPath;
}

const float64Bits = new BigUint64Array(1);
const float64Value = new Float64Array(float64Bits.buffer);

/* Exact |value| as `significand * 2 ** exponent`, for a finite value. */
function binary64Parts(value: number): {
  readonly exponent: number;
  readonly significand: bigint;
} {
  float64Value[0] = Math.abs(value);
  const bits = float64Bits[0] ?? 0n;
  const field = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xf_ffff_ffff_ffffn;
  return field === 0
    ? { exponent: -1074, significand: fraction }
    : { exponent: field - 1075, significand: fraction | (1n << 52n) };
}

function binary16Value(bits: number): number {
  const field = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  const magnitude =
    field === 0 ? fraction * 2 ** -24 : (fraction + 1024) * 2 ** (field - 25);
  return (bits & 0x8000) === 0 ? magnitude : -magnitude;
}

function roundToBinary16(value: number): number {
  if (Number.isNaN(value) || value === 0 || !Number.isFinite(value)) {
    return value;
  }
  const { exponent, significand } = binary64Parts(value);
  const highest = significand.toString(2).length - 1 + exponent;
  // Every subnormal shares the smallest normal's quantum, 2 ** -24.
  const quantum = Math.max(highest, -14) - 10;
  let units: bigint;
  if (exponent >= quantum) {
    units = significand << BigInt(exponent - quantum);
  } else {
    const shift = BigInt(quantum - exponent);
    const truncated = significand >> shift;
    const remainder = significand - (truncated << shift);
    const half = 1n << (shift - 1n);
    units =
      remainder > half || (remainder === half && (truncated & 1n) === 1n)
        ? truncated + 1n
        : truncated;
  }
  const magnitude = Number(units) * 2 ** quantum;
  const rounded = magnitude > 65504 ? Infinity : magnitude;
  return value < 0 ? -rounded : rounded;
}

/*
 * A binary64 operand at or around one binary16 value: the value itself,
 * the exact midpoint to the next binary16 value, or the binary64 values
 * adjacent to that midpoint. The largest finite pattern's midpoint is the
 * overflow threshold 65520.
 */
function adjacentBinary64(value: number, direction: -1n | 1n): number {
  float64Value[0] = value;
  float64Bits[0] = (float64Bits[0] ?? 0n) + direction;
  return float64Value[0] ?? Number.NaN;
}

function halfInputValue(input: HalfInput): number {
  if (input.kind === "double") return input.value;
  const low = binary16Value(input.bits);
  const high = input.bits === 0x7bff ? 65536 : binary16Value(input.bits + 1);
  // Both neighbors are positive binary16 values, so their exact midpoint
  // is a positive binary64 value and its encoding steps to its neighbors.
  const middle = (low + high) / 2;
  const magnitude =
    input.offset === "exact"
      ? low
      : input.offset === "tie"
        ? middle
        : adjacentBinary64(middle, input.offset === "above" ? 1n : -1n);
  return input.negative ? -magnitude : magnitude;
}

function printHalfNumber(value: number): string {
  if (Object.is(value, -0)) return "-0";
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  return String(value);
}

const halfInputArbitrary: fc.Arbitrary<HalfInput> = fc.oneof(
  fc.record({
    kind: fc.constant("double" as const),
    value: fc.oneof(
      fc.double(),
      fc.double({ max: 70_000, min: -70_000 }),
      fc.double({ max: 2 ** -13, min: -(2 ** -13) }),
    ),
  }),
  fc.record({
    bits: fc.oneof(
      fc.integer({ max: 0x7bff, min: 0 }),
      fc.constantFrom(0, 1, 0x3ff, 0x400, 0x3c00, 0x7bfe, 0x7bff),
    ),
    kind: fc.constant("neighbor" as const),
    negative: fc.boolean(),
    offset: fc.constantFrom("above", "below", "exact", "tie"),
  }),
);

const halfCaseArbitrary: fc.Arbitrary<HalfCase> = fc.record({
  inputs: fc.array(halfInputArbitrary, { maxLength: 6, minLength: 1 }),
  path: fc.constantFrom("array-like", "assignment", "data-view", "float64"),
});

/*
 * Every path stores through NumericToRawBytes: construction from an
 * array-like or a Float64Array, element assignment, and DataView's
 * setFloat16 over the same buffer. The view's bytes are then read back
 * through DataView too, so both views must agree on the encoding.
 */
function printHalfCase(testCase: HalfCase): string {
  const values = testCase.inputs
    .map((input) => {
      const value = halfInputValue(input);
      return Object.is(value, -0) ? "-0" : String(value);
    })
    .join(", ");
  const count = testCase.inputs.length;
  const construction =
    testCase.path === "array-like"
      ? `new Float16Array({ length: ${count}, ...inputs })`
      : testCase.path === "float64"
        ? "new Float16Array(new Float64Array(inputs))"
        : `new Float16Array(${count})`;
  const store =
    testCase.path === "assignment"
      ? `for (let index = 0; index < ${count}; index = index + 1) {
  view[index] = inputs[index];
}`
      : testCase.path === "data-view"
        ? `for (let index = 0; index < ${count}; index = index + 1) {
  bytes.setFloat16(index * 2, inputs[index], true);
}`
        : "";
  return `
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
function show(value) {
  return Object.is(value, -0) ? "-0" : String(value);
}
const inputs = [${values}];
const view = ${construction};
const bytes = new DataView(view.buffer);
${store}
const observed = [];
for (let index = 0; index < view.length; index = index + 1) {
  observed.push(show(view[index]), show(bytes.getFloat16(index * 2, true)));
}
console.log("half", view.length, view.byteLength, observed.join(" "));
`;
}

function halfExpected(testCase: HalfCase): string {
  const observed = testCase.inputs.flatMap((input) => {
    const shown = printHalfNumber(roundToBinary16(halfInputValue(input)));
    return [shown, shown];
  });
  return [
    "hint 5 23",
    `half ${testCase.inputs.length} ${testCase.inputs.length * 2} ` +
      observed.join(" "),
    "",
  ].join("\n");
}

test("the binary16 oracle rounds the fixed boundary cases", () => {
  const cases: readonly (readonly [number, number])[] = [
    [65504, 65504],
    [65519.99, 65504],
    [65520, Infinity],
    [-65520, -Infinity],
    [2 ** -25, 0],
    [2 ** -25 + 2 ** -40, 2 ** -24],
    [3 * 2 ** -25, 2 ** -23],
    [1 + 2 ** -11, 1],
    [1 + 3 * 2 ** -11, 1 + 2 ** -9],
    [1 + 2 ** -11 + 2 ** -40, 1 + 2 ** -10],
    [2049, 2048],
    [2051, 2052],
    [1 / 3, 0.333251953125],
    [-1e-8, -0],
  ];
  for (const [input, rounded] of cases) {
    assert.ok(Object.is(roundToBinary16(input), rounded), String(input));
  }
});

test(
  "generated Float16Array conversion matches ECMA-262 2025",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Float16Array stores round once to binary16 with ties to even",
      fc.asyncProperty(halfCaseArbitrary, async (testCase) => {
        const source = printHalfCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: halfExpected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-float16-array.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
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
          "one to six binary64 operands, each an arbitrary double, a " +
          "double within the binary16 range or the subnormal band, or a " +
          "signed finite binary16 value, the exact midpoint to its " +
          "successor, or the adjacent binary64 value above or below that " +
          "midpoint; stored through array-like or Float64Array " +
          "construction, element assignment, or DataView setFloat16, with " +
          "every element read back through the view and DataView, and one " +
          "false numeric hint",
        numRuns: 12,
        profile: "M5 Float16Array conversion",
        seed: 0x6000_6e02,
        sizeLimit:
          "one view of at most six elements, one construction or store " +
          "path, two reads per element, and one false hint",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
