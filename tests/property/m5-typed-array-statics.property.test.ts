/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
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
  | "Float64Array"
  | "Int16Array"
  | "Uint8ClampedArray";
type Element = bigint | number;
type Mapper = "coerced" | "none" | "scale";
type Mutation = "detach" | "grow" | "none" | "shrink";
type Receiver = "derived" | "intrinsic" | "larger" | "resizable" | "shorter";
type Source = "array" | "array-like" | "iterable" | "typed-array";

/**
 * One generated call. `from` reads `source` and maps it with `mapper`;
 * `of` passes the elements as arguments, wrapped in converting objects when
 * `mapper` is `coerced`. The receiver decides the constructor the static
 * method calls, and `mutation` runs once, on the first element's mapper
 * call or conversion, against the buffer a resizable receiver created.
 */
interface StaticsCase {
  readonly constructorName: ConstructorName;
  readonly elements: readonly Element[];
  readonly mapper: Mapper;
  readonly method: "from" | "of";
  readonly mutation: Mutation;
  readonly receiver: Receiver;
  readonly source: Source;
}

function normalize(testCase: StaticsCase): StaticsCase {
  const runsUserCode =
    testCase.mapper === "coerced" ||
    (testCase.method === "from" && testCase.mapper !== "none");
  return {
    ...testCase,
    mapper:
      testCase.method === "of" && testCase.mapper === "scale"
        ? "none"
        : testCase.mapper,
    mutation:
      testCase.receiver === "resizable" &&
      runsUserCode &&
      testCase.elements.length > 0
        ? testCase.mutation
        : "none",
    source: testCase.method === "of" ? "array" : testCase.source,
  };
}

const numberElements = fc.oneof(
  fc.integer({ max: 300, min: -300 }),
  fc.constantFrom(NaN, -0, 0, 1.5, 2.5, Infinity, -Infinity),
);

const callChoices = {
  mapper: fc.constantFrom<Mapper>("coerced", "none", "scale"),
  method: fc.constantFrom<"from" | "of">("from", "of"),
  mutation: fc.constantFrom<Mutation>("detach", "grow", "none", "shrink"),
  receiver: fc.constantFrom<Receiver>(
    "derived",
    "intrinsic",
    "larger",
    "resizable",
    "shorter",
  ),
  source: fc.constantFrom<Source>(
    "array",
    "array-like",
    "iterable",
    "typed-array",
  ),
};

const caseArbitrary: fc.Arbitrary<StaticsCase> = fc
  .oneof(
    fc.record({
      ...callChoices,
      constructorName: fc.constantFrom<ConstructorName>(
        "Float64Array",
        "Int16Array",
        "Uint8ClampedArray",
      ),
      elements: fc.array(numberElements, { maxLength: 5 }),
    }),
    fc.record({
      ...callChoices,
      constructorName: fc.constant<ConstructorName>("BigInt64Array"),
      elements: fc.array(fc.bigInt({ max: 20n, min: -20n }), {
        maxLength: 5,
      }),
    }),
  )
  .map(normalize);

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const elementBytes = {
  BigInt64Array: 8,
  Float64Array: 8,
  Int16Array: 2,
  Uint8ClampedArray: 1,
} as const satisfies Readonly<Record<ConstructorName, number>>;

function bigintKind(constructorName: ConstructorName): boolean {
  return constructorName === "BigInt64Array";
}

function literal(value: Element, bigint: boolean): string {
  if (bigint) return `${String(value)}n`;
  if (Number.isNaN(value)) return "NaN";
  if (Object.is(value, -0)) return "-0";
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  return String(value);
}

function printReceiver(testCase: StaticsCase): string {
  const name = testCase.constructorName;
  const bytes = elementBytes[name];
  switch (testCase.receiver) {
    case "derived":
      return `class Derived extends ${name} {
  constructor(length) { log.push("new" + length); super(length); }
}
const receiver = Derived;`;
    case "larger":
      return `function receiver(length) {
  log.push("new" + length);
  return new ${name}(length + 2);
}`;
    case "shorter":
      return `function receiver(length) {
  log.push("new" + length);
  return new ${name}(Math.max(length - 1, 0));
}`;
    case "resizable":
      return `function receiver(length) {
  log.push("new" + length);
  resultBuffer = new ArrayBuffer(length * ${bytes}, {
    maxByteLength: length * ${bytes * 2},
  });
  return new ${name}(resultBuffer);
}`;
    case "intrinsic":
      return `const receiver = ${name};`;
  }
}

function printMutation(testCase: StaticsCase): string {
  const bytes = elementBytes[testCase.constructorName];
  const length = testCase.elements.length;
  switch (testCase.mutation) {
    case "detach":
      return "resultBuffer.transfer();";
    case "grow":
      return `resultBuffer.resize(${length * bytes * 2});`;
    case "shrink":
      return `resultBuffer.resize(${Math.floor(length / 2) * bytes});`;
    case "none":
      return "";
  }
}

function printSource(testCase: StaticsCase): string {
  const bigint = bigintKind(testCase.constructorName);
  const values = testCase.elements
    .map((value) => literal(value, bigint))
    .join(", ");
  switch (testCase.source) {
    case "array":
      return `[${values}]`;
    case "typed-array":
      return `new ${testCase.constructorName}([${values}])`;
    case "array-like":
      return `(() => {
  const values = [${values}];
  const source = {
    get length() { log.push("len"); return values.length; },
  };
  for (let index = 0; index < values.length; index = index + 1) {
    Object.defineProperty(source, index, {
      get() { log.push("g" + index); return values[index]; },
    });
  }
  return source;
})()`;
    case "iterable":
      return `{
  [Symbol.iterator]() {
    const values = [${values}];
    let index = 0;
    return {
      next() {
        if (index >= values.length) {
          log.push("done");
          return { done: true, value: undefined };
        }
        log.push("n" + index);
        index = index + 1;
        return { done: false, value: values[index - 1] };
      },
    };
  },
}`;
  }
}

function printCall(testCase: StaticsCase): string {
  if (testCase.method === "of") {
    const items = testCase.elements.map((value, index) =>
      testCase.mapper === "coerced"
        ? `{ valueOf() { hook(${index}); log.push("c${index}"); ` +
          `return ${literal(value, bigintKind(testCase.constructorName))}; } }`
        : literal(value, bigintKind(testCase.constructorName)),
    );
    return ["TypedArray.of.call(receiver", ...items].join(", ") + ")";
  }
  const mappedValue =
    testCase.mapper === "scale"
      ? bigintKind(testCase.constructorName)
        ? "value * 2n + BigInt(index)"
        : "value * 2 + index"
      : `{ valueOf() { log.push("c" + index); return String(value); } }`;
  const mapper =
    testCase.mapper === "none"
      ? ""
      : `, function (value, index) {
    hook(index);
    log.push("m" + index + (this === thisArg ? "" : "!"));
    return ${mappedValue};
  }, thisArg`;
  return `TypedArray.from.call(receiver, ${printSource(testCase)}${mapper})`;
}

function printCase(testCase: StaticsCase): string {
  return `
const TypedArray = Object.getPrototypeOf(Int8Array);
const log = [];
const thisArg = {};
let resultBuffer = null;
let mutated = false;
function hook(index) {
  if (index === 0 && !mutated) { mutated = true; ${printMutation(testCase)} }
}
function show(view) {
  const values = [];
  for (let index = 0; index < view.length; index = index + 1) {
    const value = view[index];
    values.push(
      typeof value === "bigint"
        ? String(value) + "n"
        : Number.isNaN(value)
          ? "NaN"
          : Object.is(value, -0) ? "-0" : String(value),
    );
  }
  return view.constructor.name + " " + values.join(",") + " " + view.length;
}
${printReceiver(testCase)}
try {
  console.log("result", show(${printCall(testCase)}));
} catch (error) {
  console.log("throw", error.constructor.name);
}
console.log("log", log.join(" "));
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
`;
}

/** The value an element kind retains after TypedArraySetElement. */
function stored(constructorName: ConstructorName, value: Element): Element {
  if (constructorName === "BigInt64Array") {
    return BigInt.asIntN(64, BigInt(value));
  }
  const number = Number(value);
  if (constructorName === "Float64Array") return number;
  if (constructorName === "Uint8ClampedArray") {
    if (Number.isNaN(number) || number <= 0) return 0;
    if (number >= 255) return 255;
    const floor = Math.floor(number);
    if (number - floor < 0.5) return floor;
    if (number - floor > 0.5) return floor + 1;
    return floor % 2 === 0 ? floor : floor + 1;
  }
  if (!Number.isFinite(number)) return 0;
  const wrapped = ((Math.trunc(number) % 65_536) + 65_536) % 65_536;
  return wrapped >= 32_768 ? wrapped - 65_536 : wrapped + 0;
}

function mapped(testCase: StaticsCase, value: Element, index: number): Element {
  if (testCase.method === "of" || testCase.mapper === "none") return value;
  const bigint = bigintKind(testCase.constructorName);
  if (testCase.mapper === "coerced") {
    return bigint ? BigInt(String(value)) : Number(String(value));
  }
  return bigint
    ? BigInt(value) * 2n + BigInt(index)
    : Number(value) * 2 + index;
}

function display(value: Element, bigint: boolean): string {
  if (bigint) return `${String(value)}n`;
  if (Number.isNaN(value)) return "NaN";
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

/** An independent model of the observations one generated case prints. */
function expected(testCase: StaticsCase): string {
  const length = testCase.elements.length;
  const events: string[] = [];
  if (testCase.method === "from") {
    if (testCase.source === "iterable") {
      for (let index = 0; index < length; index += 1) {
        events.push(`n${index}`);
      }
      events.push("done");
    } else if (testCase.source === "array-like") {
      events.push("len");
    }
  }
  if (testCase.receiver !== "intrinsic") events.push(`new${length}`);
  const allocated = testCase.receiver === "larger" ? length + 2 : length;
  const lines: string[] = [];
  if (testCase.receiver === "shorter" && length > 0) {
    lines.push("throw TypeError");
  } else {
    const zero = testCase.constructorName === "BigInt64Array" ? 0n : 0;
    let values: Element[] = Array.from({ length: allocated }, () => zero);
    for (let index = 0; index < length; index += 1) {
      // A TypedArray source already holds its own kind's stored values.
      const element =
        testCase.method === "from" && testCase.source === "typed-array"
          ? stored(testCase.constructorName, testCase.elements[index]!)
          : testCase.elements[index]!;
      if (testCase.method === "from" && testCase.source === "array-like") {
        events.push(`g${index}`);
      }
      if (testCase.method === "from" && testCase.mapper !== "none") {
        events.push(`m${index}`);
      }
      if (testCase.mapper === "coerced") events.push(`c${index}`);
      if (index === 0 && testCase.mutation !== "none") {
        values =
          testCase.mutation === "detach"
            ? []
            : testCase.mutation === "shrink"
              ? values.slice(0, Math.floor(length / 2))
              : [...values, ...Array.from({ length }, () => zero)];
      }
      if (index < values.length) {
        values[index] = stored(
          testCase.constructorName,
          mapped(testCase, element, index),
        );
      }
    }
    const name =
      testCase.receiver === "derived" ? "Derived" : testCase.constructorName;
    lines.push(
      `result ${name} ${values
        .map((value) => display(value, bigintKind(testCase.constructorName)))
        .join(",")} ${values.length}`,
    );
  }
  lines.push(`log ${events.join(" ")}`, "hint 5 23", "");
  return lines.join("\n");
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory(
    "oseo-typed-array-statics-property-",
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
  "generated TypedArray statics match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "TypedArray from and of agree",
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
            { source, sourceId: "generated-m5-typed-array-statics.ts" },
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
                target: nativeTarget!,
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
          "%TypedArray%.from over array, array-like, iterable, and " +
          "TypedArray sources and %TypedArray%.of over plain or converting " +
          "arguments, zero to five bounded Number, NaN, signed-zero, " +
          "fractional, infinite, or BigInt elements in four element kinds, " +
          "no, scaling, or converting mappers with a this argument, " +
          "intrinsic, derived, longer, shorter, and resizable receivers, " +
          "detach, shrink, and grow of the result during the first mapper " +
          "call or conversion, and one deliberate numeric-hint guard miss",
        numRuns: 12,
        profile: "M5 TypedArray statics",
        seed: 0x6000_8000,
        sizeLimit:
          "one static call, zero to five elements, one receiver, at most " +
          "one resize or detach, one result and event-log observation, and " +
          "one false numeric hint",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
