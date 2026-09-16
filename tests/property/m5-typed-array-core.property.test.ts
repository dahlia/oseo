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

type Element = bigint | number;
type IteratorMethod = "entries" | "keys" | "values";
type Resize = "detach" | "grow" | "none" | "shrink";

/** One generated core operation over the case's view. */
type Operation =
  | { readonly kind: "accessors" }
  | { readonly index: number; readonly kind: "at" }
  | { readonly kind: "iterate"; readonly method: IteratorMethod }
  | { readonly kind: "keys"; readonly value: Element }
  | {
      readonly kind: "set-array";
      readonly offset: number;
      readonly values: readonly Element[];
    }
  | {
      readonly kind: "set-other";
      readonly offset: number;
      readonly values: readonly Element[];
    }
  | {
      readonly end: number;
      readonly kind: "set-self";
      readonly offset: number;
      readonly start: number;
    }
  | {
      readonly end: number | null;
      readonly kind: "subarray";
      readonly start: number;
      readonly value: Element;
    };

/**
 * A view over a resizable buffer, one resize or detach before the
 * operations run, and the operations themselves. `offset` is in elements.
 */
interface CoreCase {
  readonly constructorName: ConstructorName;
  readonly offset: number;
  readonly operations: readonly Operation[];
  readonly resize: Resize;
  readonly tracking: boolean;
  readonly values: readonly Element[];
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

/** The largest buffer, in elements, that a case can grow to. */
const capacity = 8;

const numberElement: fc.Arbitrary<Element> = fc.oneof(
  fc.integer({ max: 70_000, min: -70_000 }),
  fc.constantFrom(NaN, Infinity, -Infinity, -0, 0.5, 1.5, 2.5, 254.5, 1e40),
);

const bigintElement: fc.Arbitrary<Element> = fc.bigInt({
  max: (1n << 65n) + 3n,
  min: -(1n << 65n) - 3n,
});

function operationArbitrary(
  element: fc.Arbitrary<Element>,
): fc.Arbitrary<Operation> {
  const index = fc.integer({ max: capacity, min: -capacity });
  const offset = fc.integer({ max: 4, min: 0 });
  const values = fc.array(element, { maxLength: 3 });
  return fc.oneof(
    fc.constant({ kind: "accessors" as const }),
    fc.record({ index, kind: fc.constant("at" as const) }),
    fc.record({
      kind: fc.constant("iterate" as const),
      method: fc.constantFrom("entries", "keys", "values"),
    }),
    fc.record({ kind: fc.constant("keys" as const), value: element }),
    fc.record({ kind: fc.constant("set-array" as const), offset, values }),
    fc.record({ kind: fc.constant("set-other" as const), offset, values }),
    fc.record({
      end: index,
      kind: fc.constant("set-self" as const),
      offset,
      start: index,
    }),
    fc.record({
      end: fc.option(index, { nil: null }),
      kind: fc.constant("subarray" as const),
      start: index,
      value: element,
    }),
  );
}

function caseArbitraryFor(
  constructors: readonly ConstructorName[],
  element: fc.Arbitrary<Element>,
): fc.Arbitrary<CoreCase> {
  return fc.record({
    constructorName: fc.constantFrom(...constructors),
    offset: fc.integer({ max: 1, min: 0 }),
    operations: fc.array(operationArbitrary(element), {
      maxLength: 4,
      minLength: 1,
    }),
    resize: fc.constantFrom("detach", "grow", "none", "shrink"),
    tracking: fc.boolean(),
    values: fc.array(element, { maxLength: 5 }),
  });
}

const caseArbitrary = fc.oneof(
  caseArbitraryFor(numberConstructors, numberElement),
  caseArbitraryFor(bigintConstructors, bigintElement),
);
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function isBigInt(value: Element): value is bigint {
  return typeof value === "bigint";
}

function printValue(value: Element): string {
  if (isBigInt(value)) return `${value}n`;
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

function printList(values: readonly Element[]): string {
  return `[${values.map(printValue).join(", ")}]`;
}

function bytesPerElement(name: ConstructorName): number {
  if (name === "Uint8ClampedArray" || name.includes("8Array")) return 1;
  if (name.includes("16Array")) return 2;
  if (name.includes("32Array")) return 4;
  return 8;
}

/** The source kind a cross-kind `set` copies from, with the same content. */
function otherConstructor(name: ConstructorName): ConstructorName {
  if (name === "BigInt64Array") return "BigUint64Array";
  if (name === "BigUint64Array") return "BigInt64Array";
  return name === "Float64Array" ? "Int32Array" : "Float64Array";
}

function printOperation(
  operation: Operation,
  testCase: CoreCase,
  position: number,
): string {
  const label = `${position} ${operation.kind}`;
  if (operation.kind === "accessors") {
    return `console.log("${label}", view.length, view.byteLength,
  view.byteOffset, view.buffer === buffer);`;
  }
  let body: string;
  if (operation.kind === "at") {
    body = `console.log("${label}", String(view.at(${operation.index})));`;
  } else if (operation.kind === "iterate") {
    body = `console.log("${label}",
    [...view.${operation.method}()].map(String).join("|"));`;
  } else if (operation.kind === "keys") {
    body = `console.log("${label}", String(view["-0"]), "1.5" in view,
    Object.keys(view).length, Reflect.deleteProperty(view, "0"),
    Reflect.defineProperty(view, "0", {
      value: ${printValue(operation.value)},
    }), String(view[0]));`;
  } else if (operation.kind === "set-array") {
    body = `view.set(${printList(operation.values)}, ${operation.offset});
  console.log("${label}", snapshot());`;
  } else if (operation.kind === "set-other") {
    const source = otherConstructor(testCase.constructorName);
    body = `view.set(new ${source}(${printList(operation.values)}),
    ${operation.offset});
  console.log("${label}", snapshot());`;
  } else if (operation.kind === "set-self") {
    body = `view.set(view.subarray(${operation.start}, ${operation.end}),
    ${operation.offset});
  console.log("${label}", snapshot());`;
  } else {
    const end = operation.end === null ? "" : `, ${operation.end}`;
    body = `const sub = view.subarray(${operation.start}${end});
  console.log("${label}", sub.length, sub.byteOffset, sub.buffer === buffer);
  if (sub.length > 0) sub[0] = ${printValue(operation.value)};
  console.log("${label} view", snapshot());`;
  }
  return `try {
  ${body}
} catch (error) {
  console.log("${label}", error.constructor.name);
}`;
}

function printCase(testCase: CoreCase): string {
  const bytes = bytesPerElement(testCase.constructorName);
  const total = testCase.offset + testCase.values.length;
  const construction = testCase.tracking
    ? `new ${testCase.constructorName}(buffer, ${testCase.offset * bytes})`
    : `new ${testCase.constructorName}(buffer, ${testCase.offset * bytes},
  ${testCase.values.length})`;
  const writes = testCase.values
    .map((value, index) => `view[${index}] = ${printValue(value)};`)
    .join("\n");
  const resize =
    testCase.resize === "detach"
      ? "buffer.transfer();"
      : testCase.resize === "grow"
        ? `buffer.resize(${capacity * bytes});`
        : testCase.resize === "shrink"
          ? `buffer.resize(${Math.max(total - 2, 0) * bytes});`
          : "";
  return `
const buffer = new ArrayBuffer(${total * bytes}, {
  maxByteLength: ${capacity * bytes},
});
const view = ${construction};
${writes}
${resize}
function snapshot() {
  const parts = [];
  for (let index = 0; index < view.length; index = index + 1) {
    parts.push(String(view[index]));
  }
  return view.length + ":" + parts.join(",");
}
${testCase.operations
  .map((operation, position) => printOperation(operation, testCase, position))
  .join("\n")}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
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

/** The arithmetic element conversion oracle, independent of the runtime. */
function convert(constructorName: ConstructorName, value: Element): Element {
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
  const bits = bytesPerElement(constructorName) * 8;
  return constructorName.startsWith("Uint")
    ? integerModulo(value, bits)
    : signedInteger(value, bits);
}

/** Buffer contents in elements of the case's kind, and the view's shape. */
interface Model {
  readonly bytes: number;
  detached: boolean;
  elements: Element[];
  readonly name: ConstructorName;
  readonly offset: number;
  readonly tracking: boolean;
  readonly viewLength: number;
}

/** The constructor name of the error a modeled operation throws. */
class ModelThrow extends Error {
  readonly errorName: string;

  constructor(errorName: string) {
    super(errorName);
    this.errorName = errorName;
  }
}

/** IsTypedArrayOutOfBounds and TypedArrayLength for a view shape. */
function viewLength(
  model: Model,
  start: number,
  length: number | null,
): number | null {
  if (model.detached || start > model.elements.length) return null;
  if (length === null) return model.elements.length - start;
  return start + length > model.elements.length ? null : length;
}

function currentLength(model: Model): number | null {
  return viewLength(
    model,
    model.offset,
    model.tracking ? null : model.viewLength,
  );
}

function clampIndex(relative: number, length: number): number {
  if (relative < 0) return Math.max(length + relative, 0);
  return Math.min(relative, length);
}

function snapshot(model: Model): string {
  const length = currentLength(model) ?? 0;
  const parts = model.elements
    .slice(model.offset, model.offset + length)
    .map(String);
  return `${length}:${parts.join(",")}`;
}

function inBounds(model: Model): number {
  const length = currentLength(model);
  if (length === null) throw new ModelThrow("TypeError");
  return length;
}

/** A modeled view: its element offset and fixed length, or null to track. */
interface ModelView {
  readonly length: number | null;
  readonly start: number;
}

/** The TypedArray (buffer, byteOffset [, length]) constructor checks. */
function construct(
  model: Model,
  start: number,
  length: number | null,
): ModelView {
  if (model.detached) throw new ModelThrow("TypeError");
  if (viewLength(model, start, length) === null) {
    throw new ModelThrow("RangeError");
  }
  return { length, start };
}

function applyOperation(model: Model, operation: Operation): string {
  if (operation.kind === "accessors") {
    const length = currentLength(model);
    return length === null
      ? "0 0 0 true"
      : `${length} ${length * model.bytes} ` +
          `${model.offset * model.bytes} true`;
  }
  if (operation.kind === "at") {
    const length = inBounds(model);
    const index =
      operation.index >= 0 ? operation.index : length + operation.index;
    return index < 0 || index >= length
      ? "undefined"
      : String(model.elements[model.offset + index]);
  }
  if (operation.kind === "iterate") {
    const length = inBounds(model);
    const entries: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const element = String(model.elements[model.offset + index]);
      entries.push(
        operation.method === "keys"
          ? String(index)
          : operation.method === "values"
            ? element
            : `${index},${element}`,
      );
    }
    return entries.join("|");
  }
  if (operation.kind === "keys") {
    const length = currentLength(model) ?? 0;
    const valid = length > 0;
    if (valid) {
      model.elements[model.offset] = convert(model.name, operation.value);
    }
    return [
      "undefined",
      "false",
      String(length),
      String(!valid),
      String(valid),
      valid ? String(model.elements[model.offset]) : "undefined",
    ].join(" ");
  }
  if (operation.kind === "set-array" || operation.kind === "set-other") {
    const length = inBounds(model);
    if (operation.offset + operation.values.length > length) {
      throw new ModelThrow("RangeError");
    }
    const source =
      operation.kind === "set-other"
        ? operation.values.map((value) =>
            convert(otherConstructor(model.name), value),
          )
        : operation.values;
    source.forEach((value, index) => {
      model.elements[model.offset + operation.offset + index] = convert(
        model.name,
        value,
      );
    });
    return snapshot(model);
  }
  if (operation.kind === "set-self") {
    const sourceLength = currentLength(model) ?? 0;
    const start = clampIndex(operation.start, sourceLength);
    const end = clampIndex(operation.end, sourceLength);
    const sub = construct(
      model,
      model.offset + start,
      Math.max(end - start, 0),
    );
    const length = inBounds(model);
    const subLength = sub.length ?? 0;
    if (operation.offset + subLength > length) {
      throw new ModelThrow("RangeError");
    }
    const copied = model.elements.slice(sub.start, sub.start + subLength);
    copied.forEach((value, index) => {
      model.elements[model.offset + operation.offset + index] = value;
    });
    return snapshot(model);
  }
  const sourceLength = currentLength(model) ?? 0;
  const start = clampIndex(operation.start, sourceLength);
  const sub =
    model.tracking && operation.end === null
      ? construct(model, model.offset + start, null)
      : construct(
          model,
          model.offset + start,
          Math.max(
            (operation.end === null
              ? sourceLength
              : clampIndex(operation.end, sourceLength)) - start,
            0,
          ),
        );
  const subLength = viewLength(model, sub.start, sub.length) ?? 0;
  const line = `${subLength} ${sub.start * model.bytes} true`;
  if (subLength > 0) {
    model.elements[sub.start] = convert(model.name, operation.value);
  }
  return `${line}\n${snapshot(model)}`;
}

function expected(testCase: CoreCase): string {
  const bytes = bytesPerElement(testCase.constructorName);
  const zero: Element = bigintConstructors.includes(testCase.constructorName)
    ? 0n
    : 0;
  const total = testCase.offset + testCase.values.length;
  const model: Model = {
    bytes,
    detached: false,
    elements: Array.from({ length: total }, () => zero),
    name: testCase.constructorName,
    offset: testCase.offset,
    tracking: testCase.tracking,
    viewLength: testCase.values.length,
  };
  testCase.values.forEach((value, index) => {
    model.elements[testCase.offset + index] = convert(
      testCase.constructorName,
      value,
    );
  });
  if (testCase.resize === "detach") {
    model.detached = true;
    model.elements = [];
  } else if (testCase.resize === "grow") {
    while (model.elements.length < capacity) model.elements.push(zero);
  } else if (testCase.resize === "shrink") {
    model.elements = model.elements.slice(0, Math.max(total - 2, 0));
  }
  const lines = testCase.operations.map((operation, position) => {
    const label = `${position} ${operation.kind}`;
    try {
      const output = applyOperation(model, operation);
      if (operation.kind === "subarray") {
        const [first, second] = output.split("\n");
        return `${label} ${first}\n${label} view ${second}`;
      }
      return `${label} ${output}`;
    } catch (error) {
      if (!(error instanceof ModelThrow)) throw error;
      return `${label} ${error.errorName}`;
    }
  });
  return [...lines, "hint 5 23", ""].join("\n");
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory("oseo-typed-core-");
  const sourcePath = `${directory}/typed-array-core.ts`;
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
  "generated TypedArray core operations match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "TypedArray core accessors, methods, and exotic keys agree",
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
            { source, sourceId: "generated-m5-typed-array-core.ts" },
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
          "one of eleven constructors over a resizable buffer with a zero " +
          "or one element offset, fixed or length-tracking shape, zero to " +
          "five bounded Number or BigInt elements, one grow, shrink, detach, " +
          "or no resize, and one to four accessor, at, iterator, canonical " +
          "key, array-like set, cross-kind set, overlapping self set, or " +
          "subarray operations with in-range, negative, and out-of-range " +
          "indices, plus one false numeric hint",
        numRuns: 12,
        profile: "M5 TypedArray core",
        seed: 0x6000_7100,
        sizeLimit:
          "one view, at most five initial elements, a buffer of at most " +
          "eight elements, one resize, at most four operations with at " +
          "most three set values each, and one false hint",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
