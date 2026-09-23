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

type Comparator =
  | "ascending"
  | "coerced"
  | "default"
  | "descending"
  | "equal"
  | "nan";
type ConstructorName = "BigInt64Array" | "Float64Array" | "Int16Array";
type Element = bigint | number;
type Method = "sort" | "toSorted";
type Mutation = "detach" | "grow" | "none" | "shrink";

interface SortCase {
  readonly comparator: Comparator;
  readonly constructorName: ConstructorName;
  readonly elements: readonly Element[];
  readonly method: Method;
  readonly mutation: Mutation;
}

function normalize(testCase: SortCase): SortCase {
  return {
    ...testCase,
    mutation:
      testCase.comparator === "default" || testCase.elements.length < 2
        ? "none"
        : testCase.mutation,
  };
}

const numberElements = fc.oneof(
  fc.integer({ max: 20, min: -20 }),
  fc.constantFrom(NaN, -0, 0, Infinity, -Infinity),
);

const caseArbitrary: fc.Arbitrary<SortCase> = fc
  .oneof(
    fc.record({
      comparator: fc.constantFrom<Comparator>(
        "ascending",
        "coerced",
        "default",
        "descending",
        "equal",
        "nan",
      ),
      constructorName: fc.constantFrom<ConstructorName>(
        "Float64Array",
        "Int16Array",
      ),
      elements: fc.array(numberElements, { maxLength: 6 }),
      method: fc.constantFrom<Method>("sort", "toSorted"),
      mutation: fc.constantFrom<Mutation>("detach", "grow", "none", "shrink"),
    }),
    fc.record({
      comparator: fc.constantFrom<Comparator>(
        "ascending",
        "coerced",
        "default",
        "descending",
        "equal",
        "nan",
      ),
      constructorName: fc.constant<ConstructorName>("BigInt64Array"),
      elements: fc.array(fc.bigInt({ max: 20n, min: -20n }), {
        maxLength: 6,
      }),
      method: fc.constantFrom<Method>("sort", "toSorted"),
      mutation: fc.constantFrom<Mutation>("detach", "grow", "none", "shrink"),
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

function printValue(value: Element, constructorName: ConstructorName): string {
  if (constructorName === "BigInt64Array") return `${String(value)}n`;
  if (Number.isNaN(value)) return "NaN";
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

function comparatorBody(comparator: Comparator): string {
  const ascending =
    "Number.isNaN(left) ? (Number.isNaN(right) ? 0 : 1) : " +
    "Number.isNaN(right) ? -1 : " +
    "left < right ? -1 : left > right ? 1 : 0";
  if (comparator === "descending") {
    return `-(${ascending})`;
  }
  if (comparator === "equal") return "0";
  if (comparator === "nan") return "NaN";
  if (comparator === "coerced") {
    return `String(${ascending})`;
  }
  return ascending;
}

function printCase(testCase: SortCase): string {
  const bytes = testCase.constructorName === "Int16Array" ? 2 : 8;
  const length = testCase.elements.length;
  const mutation =
    testCase.mutation === "detach"
      ? "buffer.transfer();"
      : testCase.mutation === "shrink"
        ? `buffer.resize(${Math.floor(length / 2) * bytes});`
        : testCase.mutation === "grow"
          ? `buffer.resize(${length * bytes * 2});`
          : "";
  const writes = testCase.elements
    .map(
      (value, index) =>
        `view[${index}] = ${printValue(value, testCase.constructorName)};`,
    )
    .join("\n");
  const comparator =
    testCase.comparator === "default"
      ? ""
      : `function (left, right) {
    if (!mutated) { mutated = true; ${mutation} }
    return ${comparatorBody(testCase.comparator)};
  }`;
  return `
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
  return values.join(",");
}
const buffer = new ArrayBuffer(${length * bytes}, {
  maxByteLength: ${length * bytes * 2},
});
const view = new ${testCase.constructorName}(buffer);
${writes}
let mutated = false;
const result = view.${testCase.method}(${comparator});
console.log("result", result.constructor.name, show(result), result === view);
console.log("view", show(view), view.length);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
`;
}

function defaultOrder(
  constructorName: ConstructorName,
  left: Element,
  right: Element,
): number {
  if (constructorName === "BigInt64Array") {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isNaN(leftNumber)) return Number.isNaN(rightNumber) ? 0 : 1;
  if (Number.isNaN(rightNumber)) return -1;
  if (leftNumber < rightNumber) return -1;
  if (leftNumber > rightNumber) return 1;
  if (Object.is(leftNumber, -0) && Object.is(rightNumber, 0)) return -1;
  if (Object.is(leftNumber, 0) && Object.is(rightNumber, -0)) return 1;
  return 0;
}

/** The total Number order used by each generated supplied comparator. */
function suppliedOrder(left: Element, right: Element): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isNaN(leftNumber)) return Number.isNaN(rightNumber) ? 0 : 1;
  if (Number.isNaN(rightNumber)) return -1;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** The value retained after assignment to the generated element kind. */
function stored(constructorName: ConstructorName, value: Element): Element {
  if (constructorName !== "Int16Array") return value;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  const integer = Math.trunc(numberValue);
  const wrapped = ((integer % 65_536) + 65_536) % 65_536;
  return wrapped >= 32_768 ? wrapped - 65_536 : wrapped + 0;
}

function compare(
  constructorName: ConstructorName,
  comparator: Comparator,
  left: Element,
  right: Element,
): number {
  if (comparator === "default") {
    return defaultOrder(constructorName, left, right);
  }
  if (comparator === "equal" || comparator === "nan") return 0;
  const order = suppliedOrder(left, right);
  return comparator === "descending" ? -order : order;
}

function elementAt(values: readonly Element[], index: number): Element {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Missing modeled element at index ${index}.`);
  }
  return value;
}

/** Stable insertion sort independent of the host sort implementation. */
function sorted(testCase: SortCase): readonly Element[] {
  const result: Element[] = [];
  for (const element of testCase.elements) {
    const value = stored(testCase.constructorName, element);
    let position = result.length;
    result.push(value);
    while (
      position > 0 &&
      compare(
        testCase.constructorName,
        testCase.comparator,
        elementAt(result, position - 1),
        value,
      ) > 0
    ) {
      result[position] = elementAt(result, position - 1);
      position -= 1;
    }
    result[position] = value;
  }
  return result;
}

function show(
  values: readonly Element[],
  constructorName: ConstructorName,
): string {
  return values.map((value) => printValue(value, constructorName)).join(",");
}

function expected(testCase: SortCase): string {
  const ordered = sorted(testCase);
  const length = testCase.elements.length;
  const zero = testCase.constructorName === "BigInt64Array" ? 0n : 0;
  let live: readonly Element[] = testCase.elements.map((value) =>
    stored(testCase.constructorName, value),
  );
  if (testCase.mutation === "detach") live = [];
  else if (testCase.mutation === "shrink") {
    live = live.slice(0, Math.floor(length / 2));
  } else if (testCase.mutation === "grow") {
    live = [...live, ...Array.from({ length }, () => zero)];
  }
  const result =
    testCase.method === "sort"
      ? [
          ...ordered.slice(0, live.length),
          ...live.slice(Math.min(length, live.length)),
        ]
      : ordered;
  const source = testCase.method === "sort" ? result : live;
  return [
    `result ${testCase.constructorName} ${show(
      result,
      testCase.constructorName,
    )} ${testCase.method === "sort"}`,
    `view ${show(source, testCase.constructorName)} ${source.length}`,
    "hint 5 23",
    "",
  ].join("\n");
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory(
    "oseo-typed-array-sort-property-",
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
  "generated TypedArray sorting methods match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "TypedArray sorting methods agree",
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
            { source, sourceId: "generated-m5-typed-array-sort.ts" },
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
          "sort and toSorted over zero to six bounded Number, NaN, " +
          "signed-zero, infinite, or BigInt elements in three typed-array " +
          "kinds; numeric default, ascending, descending, equal, NaN, and " +
          "coerced comparators; detach, shrink, and grow during the first " +
          "comparison; in-place and copied results; and one deliberate " +
          "numeric-hint guard miss",
        numRuns: 12,
        profile: "M5 TypedArray sorting methods",
        seed: 0x6000_7d00,
        sizeLimit:
          "one length-tracking view, zero to six elements, at most one " +
          "resize or detach, one result and source observation, and one " +
          "false numeric hint",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
