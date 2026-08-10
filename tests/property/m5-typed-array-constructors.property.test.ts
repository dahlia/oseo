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
type OutOfBoundsSource = "fixed" | "tracking";
type PrototypeMode = "default" | "null";
type ShadowKey = "buffer" | "byteLength" | "byteOffset" | "length";
type TagPrototypeMode = "custom" | "null";

interface TypedArrayCase {
  readonly constructorName: ConstructorName;
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

function printValue(value: bigint | number): string {
  if (typeof value === "bigint") return `${value}n`;
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
  if (typeof value === "bigint") {
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
          "one of eleven constructors, zero to eight bounded Number or " +
          "BigInt inputs, one iterable, array-like, buffer, or typed-array " +
          "construction path, one clone, one out-of-bounds conversion, " +
          "one fixed or offset length-tracking out-of-bounds clone, one " +
          "default-chain own shadow or null-prototype deferred accessor, " +
          "one custom or null-prototype toStringTag lookup, live and " +
          "out-of-bounds element enumerability, canonical numeric misses, " +
          "one false numeric hint, and one mutable intrinsic global write " +
          "and restore",
        numRuns: 12,
        profile: "M5 TypedArray constructors",
        seed: 0x6000_6500,
        sizeLimit:
          "one constructor, one construction path, at most eight values, " +
          "one typed-array clone, one out-of-bounds set and clone, one " +
          "default or null prototype accessor case, one false hint, and " +
          "one custom or null-prototype tag case, one element enumeration, " +
          "and one global rebinding",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
