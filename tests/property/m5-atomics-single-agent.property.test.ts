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
  | "Float64Array"
  | "Int16Array"
  | "Int32Array"
  | "Int8Array"
  | "Uint16Array"
  | "Uint32Array"
  | "Uint8Array"
  | "Uint8ClampedArray";

type Element = bigint | number;
type Modify = "add" | "and" | "exchange" | "or" | "store" | "sub" | "xor";

/** One generated Atomics call over the case's view. */
type Operation =
  | {
      readonly index: number;
      readonly kind: "modify";
      readonly operation: Modify;
      readonly value: Element;
    }
  | { readonly index: number; readonly kind: "load" }
  | {
      readonly expected: Element;
      readonly index: number;
      readonly kind: "compareExchange";
      readonly replacement: Element;
    }
  | {
      readonly count: number | null;
      readonly index: number;
      readonly kind: "notify";
    }
  | {
      readonly index: number;
      readonly kind: "wait";
      readonly timeout: number | null;
      readonly value: Element;
    }
  | {
      readonly index: number;
      readonly kind: "waitAsync";
      readonly timeout: number | null;
      readonly value: Element;
    };

/**
 * One view over a four-element SharedArrayBuffer or ArrayBuffer and the
 * Atomics calls that run against it. A waitAsync call without a timeout
 * waits forever, so only a later notify in the same case settles it.
 */
interface AtomicsCase {
  readonly constructorName: ConstructorName;
  readonly operations: readonly Operation[];
  readonly shared: boolean;
}

const numberConstructors: readonly ConstructorName[] = [
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

const length = 4;

const numberElement: fc.Arbitrary<Element> = fc.oneof(
  fc.integer({ max: 3, min: -3 }),
  fc.integer({ max: 2 ** 33, min: -(2 ** 33) }),
  fc.constantFrom(NaN, Infinity, -Infinity, -0, 0.5, -1.5, 2 ** 53, 1e40),
);

const bigintElement: fc.Arbitrary<Element> = fc.oneof(
  fc.bigInt({ max: 3n, min: -3n }),
  fc.bigInt({ max: (1n << 65n) + 3n, min: -(1n << 65n) - 3n }),
);

function operationArbitrary(
  element: fc.Arbitrary<Element>,
): fc.Arbitrary<Operation> {
  const index = fc.oneof(
    fc.integer({ max: length - 1, min: 0 }),
    fc.constantFrom(-1, length),
  );
  const timeout = fc.constantFrom(null, 0, -1);
  return fc.oneof(
    fc.record({
      index,
      kind: fc.constant("modify" as const),
      operation: fc.constantFrom(
        "add",
        "and",
        "exchange",
        "or",
        "store",
        "sub",
        "xor",
      ),
      value: element,
    }),
    fc.record({ index, kind: fc.constant("load" as const) }),
    fc.record({
      expected: element,
      index,
      kind: fc.constant("compareExchange" as const),
      replacement: element,
    }),
    fc.record({
      count: fc.option(fc.integer({ max: 3, min: -1 }), { nil: null }),
      index,
      kind: fc.constant("notify" as const),
    }),
    fc.record({
      index,
      kind: fc.constant("wait" as const),
      timeout: fc.constantFrom(0, -1),
      value: element,
    }),
    fc.record({
      index,
      kind: fc.constant("waitAsync" as const),
      timeout,
      value: element,
    }),
  );
}

function caseArbitraryFor(
  constructors: readonly ConstructorName[],
  element: fc.Arbitrary<Element>,
): fc.Arbitrary<AtomicsCase> {
  return fc.record({
    constructorName: fc.constantFrom(...constructors),
    operations: fc.array(operationArbitrary(element), {
      maxLength: 8,
      minLength: 1,
    }),
    shared: fc.boolean(),
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

function printTimeout(timeout: number | null): string {
  return timeout === null ? "" : `, ${timeout}`;
}

function printOperation(operation: Operation, position: number): string {
  const label = `"${position} ${operation.kind}"`;
  let call: string;
  if (operation.kind === "modify") {
    call =
      `Atomics.${operation.operation}(view, ${operation.index}, ` +
      `${printValue(operation.value)})`;
  } else if (operation.kind === "load") {
    call = `Atomics.load(view, ${operation.index})`;
  } else if (operation.kind === "compareExchange") {
    call =
      `Atomics.compareExchange(view, ${operation.index}, ` +
      `${printValue(operation.expected)}, ` +
      `${printValue(operation.replacement)})`;
  } else if (operation.kind === "notify") {
    const count = operation.count === null ? "" : `, ${operation.count}`;
    call = `Atomics.notify(view, ${operation.index}${count})`;
  } else if (operation.kind === "wait") {
    call =
      `Atomics.wait(view, ${operation.index}, ` +
      `${printValue(operation.value)}${printTimeout(operation.timeout)})`;
  } else {
    return `attempt(${label}, () => watch(${label}, Atomics.waitAsync(view, ${
      operation.index
    }, ${printValue(operation.value)}${printTimeout(operation.timeout)})));`;
  }
  return `attempt(${label}, () => String(${call}));`;
}

function printCase(testCase: AtomicsCase): string {
  const buffer = testCase.shared ? "SharedArrayBuffer" : "ArrayBuffer";
  const bytes = bytesPerElement(testCase.constructorName);
  return `const view = new ${testCase.constructorName}(
  new ${buffer}(${bytes * length}),
);
const outcomes = [];
function attempt(label, run) {
  try {
    console.log(label, run());
  } catch (error) {
    console.log(label, error instanceof TypeError ? "TypeError" : "RangeError");
  }
}
function watch(label, result) {
  if (!result.async) return "sync " + result.value;
  const settled = { label, value: "pending" };
  outcomes.push(settled);
  result.value.then((value) => {
    settled.value = value;
  });
  return "async";
}
${testCase.operations
  .map((operation, position) => printOperation(operation, position))
  .join("\n")}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
setTimeout(() => {
  console.log(
    "elements",
    Array.from(view, String).join(),
    outcomes.map((entry) => entry.label + "=" + entry.value).join(),
  );
}, 30);
`;
}

function bytesPerElement(name: ConstructorName): number {
  if (name === "Uint8ClampedArray" || name.includes("8Array")) return 1;
  if (name.includes("16Array")) return 2;
  if (name.includes("32Array")) return 4;
  return 8;
}

/** The two's-complement width and signedness of an integer element. */
function integerEncoding(
  name: ConstructorName,
): { readonly bits: bigint; readonly signed: boolean } | undefined {
  if (name === "Float64Array" || name === "Uint8ClampedArray") return undefined;
  return {
    bits: BigInt(bytesPerElement(name) * 8),
    signed: !name.startsWith("Uint") && name !== "BigUint64Array",
  };
}

class ModelThrow extends Error {
  readonly errorName: "RangeError" | "TypeError";

  constructor(errorName: "RangeError" | "TypeError") {
    super(errorName);
    this.errorName = errorName;
  }
}

/** 𝔽(ToIntegerOrInfinity(value)) with -0 normalized to +0. */
function integerOrInfinity(value: number): number {
  if (Number.isNaN(value) || value === 0) return 0;
  return Number.isFinite(value) ? Math.trunc(value) : value;
}

/** The element's stored bits as an unsigned integer below 2 ** bits. */
function rawBits(value: Element, bits: bigint): bigint {
  const modulus = 1n << bits;
  let integer: bigint;
  if (isBigInt(value)) {
    integer = value;
  } else {
    const converted = integerOrInfinity(value);
    integer = Number.isFinite(converted) ? BigInt(converted) : 0n;
  }
  return ((integer % modulus) + modulus) % modulus;
}

function decode(raw: bigint, name: ConstructorName): string {
  const encoding = integerEncoding(name);
  assert.ok(encoding != null);
  const signed =
    encoding.signed && raw >= 1n << (encoding.bits - 1n)
      ? raw - (1n << encoding.bits)
      : raw;
  return String(signed);
}

interface Model {
  readonly elements: bigint[];
  readonly name: ConstructorName;
  readonly shared: boolean;
  readonly waiters: { index: number; label: string }[];
  readonly outcomes: { label: string; value: string }[];
}

function validate(model: Model, index: number, waitable: boolean): bigint {
  const encoding = integerEncoding(model.name);
  if (
    encoding == null ||
    (waitable && model.name !== "Int32Array" && model.name !== "BigInt64Array")
  ) {
    throw new ModelThrow("TypeError");
  }
  if (index < 0 || index >= length) throw new ModelThrow("RangeError");
  return encoding.bits;
}

function applyOperation(
  model: Model,
  operation: Operation,
  label: string,
): string {
  const bigint = bigintConstructors.includes(model.name);
  if (operation.kind === "load") {
    validate(model, operation.index, false);
    return decode(model.elements[operation.index] ?? 0n, model.name);
  }
  if (operation.kind === "modify") {
    const bits = validate(model, operation.index, false);
    const value = operation.value;
    if (isBigInt(value) !== bigint) throw new ModelThrow("TypeError");
    const modulus = 1n << bits;
    const previous = model.elements[operation.index] ?? 0n;
    const operand = rawBits(value, bits);
    const next = {
      add: (previous + operand) % modulus,
      and: previous & operand,
      exchange: operand,
      or: previous | operand,
      store: operand,
      sub: (previous - operand + modulus) % modulus,
      xor: previous ^ operand,
    }[operation.operation];
    model.elements[operation.index] = next;
    if (operation.operation === "store") {
      return isBigInt(value) ? String(value) : String(integerOrInfinity(value));
    }
    return decode(previous, model.name);
  }
  if (operation.kind === "compareExchange") {
    const bits = validate(model, operation.index, false);
    if (
      isBigInt(operation.expected) !== bigint ||
      isBigInt(operation.replacement) !== bigint
    ) {
      throw new ModelThrow("TypeError");
    }
    const previous = model.elements[operation.index] ?? 0n;
    if (previous === rawBits(operation.expected, bits)) {
      model.elements[operation.index] = rawBits(operation.replacement, bits);
    }
    return decode(previous, model.name);
  }
  if (operation.kind === "notify") {
    validate(model, operation.index, true);
    if (!model.shared) return "0";
    const count =
      operation.count === null ? Infinity : Math.max(operation.count, 0);
    let notified = 0;
    while (notified < count) {
      const position = model.waiters.findIndex(
        (waiter) => waiter.index === operation.index,
      );
      if (position < 0) break;
      const [waiter] = model.waiters.splice(position, 1);
      const outcome = model.outcomes.find(
        (entry) => entry.label === waiter?.label,
      );
      assert.ok(outcome != null);
      outcome.value = "ok";
      notified += 1;
    }
    return String(notified);
  }
  // DoWait checks the buffer's shared brand before it converts the index.
  if (model.name !== "Int32Array" && model.name !== "BigInt64Array") {
    throw new ModelThrow("TypeError");
  }
  if (!model.shared) throw new ModelThrow("TypeError");
  const bits = validate(model, operation.index, true);
  if (isBigInt(operation.value) !== bigint) throw new ModelThrow("TypeError");
  const equal =
    (model.elements[operation.index] ?? 0n) === rawBits(operation.value, bits);
  if (operation.kind === "wait") return equal ? "timed-out" : "not-equal";
  if (!equal) return "sync not-equal";
  if (operation.timeout !== null) return "sync timed-out";
  model.waiters.push({ index: operation.index, label });
  model.outcomes.push({ label, value: "pending" });
  return "async";
}

function expected(testCase: AtomicsCase): string {
  const model: Model = {
    elements: Array.from({ length }, () => 0n),
    name: testCase.constructorName,
    outcomes: [],
    shared: testCase.shared,
    waiters: [],
  };
  const lines = testCase.operations.map((operation, position) => {
    const label = `${position} ${operation.kind}`;
    try {
      return `${label} ${applyOperation(model, operation, label)}`;
    } catch (error) {
      if (!(error instanceof ModelThrow)) throw error;
      return `${label} ${error.errorName}`;
    }
  });
  const encoding = integerEncoding(testCase.constructorName);
  const elements =
    encoding == null
      ? Array.from({ length }, () => "0")
      : model.elements.map((raw) => decode(raw, testCase.constructorName));
  const outcomes = model.outcomes
    .map((entry) => `${entry.label}=${entry.value}`)
    .join();
  return [
    ...lines,
    "hint 5 23",
    `elements ${elements.join()} ${outcomes}`,
    "",
  ].join("\n");
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory("oseo-atomics-");
  const sourcePath = `${directory}/atomics-single-agent.ts`;
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
  "generated single-agent Atomics calls match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Atomics element operations, waits, and notifications agree",
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
            { source, sourceId: "generated-m5-atomics-single-agent.ts" },
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
          "one of eight Number or two BigInt element constructors over a " +
          "four-element SharedArrayBuffer or ArrayBuffer, and one to eight " +
          "Atomics calls: the read-modify-write family, load, " +
          "compareExchange, notify with an absent, negative, or bounded " +
          "count, wait with an immediate timeout, and waitAsync with an " +
          "immediate or infinite timeout, at in-range, negative, and " +
          "past-the-end indices with bounded, wrapping, fractional, " +
          "non-finite, and mismatched-type operands, plus one false " +
          "numeric hint",
        numRuns: 12,
        profile: "M5 single-agent Atomics",
        seed: 0x6000_7300,
        sizeLimit:
          "one view of four elements, at most eight Atomics calls, at most " +
          "eight pending waiters, and one false hint",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
