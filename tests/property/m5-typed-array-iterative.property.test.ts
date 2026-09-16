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
  | "Float32Array"
  | "Float64Array"
  | "Int16Array"
  | "Int32Array"
  | "Int8Array";
type Element = bigint | number;
type IterativeMethod =
  | "every"
  | "filter"
  | "forEach"
  | "map"
  | "reduce"
  | "reduceRight"
  | "some";
type Mutation = "detach" | "none" | "shrink";
type Species = "default" | "null" | "subclass";

interface IterativeCase {
  readonly constructorName: ConstructorName;
  readonly initial: boolean;
  readonly method: IterativeMethod;
  readonly mutation: Mutation;
  readonly species: Species;
  readonly threshold: Element;
  readonly values: readonly Element[];
}

const methods: readonly IterativeMethod[] = [
  "every",
  "filter",
  "forEach",
  "map",
  "reduce",
  "reduceRight",
  "some",
];

const numberConstructors: readonly ConstructorName[] = [
  "Float32Array",
  "Float64Array",
  "Int16Array",
  "Int32Array",
  "Int8Array",
];

function caseArbitraryFor(
  constructors: readonly ConstructorName[],
  element: fc.Arbitrary<Element>,
  threshold: fc.Arbitrary<Element>,
  mutation: fc.Arbitrary<Mutation>,
): fc.Arbitrary<IterativeCase> {
  return fc.record({
    constructorName: fc.constantFrom(...constructors),
    initial: fc.boolean(),
    method: fc.constantFrom(...methods),
    mutation,
    species: fc.constantFrom<Species>("default", "null", "subclass"),
    threshold,
    values: fc.array(element, { maxLength: 5, minLength: 1 }),
  });
}

const caseArbitrary = fc.oneof(
  caseArbitraryFor(
    numberConstructors,
    fc.integer({ max: 9, min: -9 }),
    fc.integer({ max: 9, min: -9 }),
    fc.constantFrom<Mutation>("none", "detach", "shrink"),
  ),
  caseArbitraryFor(
    ["BigInt64Array"],
    fc.bigInt({ max: 9n, min: -9n }),
    fc.bigInt({ max: 9n, min: -9n }),
    fc.constant("none"),
  ),
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

function isBigIntKind(name: ConstructorName): boolean {
  return name === "BigInt64Array";
}

function printValue(value: Element): string {
  return isBigInt(value) ? `${value}n` : String(value);
}

function bytesPerElement(name: ConstructorName): number {
  if (name === "Int8Array") return 1;
  if (name === "Int16Array") return 2;
  if (name === "Float64Array" || name === "BigInt64Array") return 8;
  return 4;
}

function isReduction(method: IterativeMethod): boolean {
  return method === "reduce" || method === "reduceRight";
}

function hasSpecies(method: IterativeMethod): boolean {
  return method === "map" || method === "filter";
}

function printCase(testCase: IterativeCase): string {
  const bigint = isBigIntKind(testCase.constructorName);
  const bytes = bytesPerElement(testCase.constructorName);
  const length = testCase.values.length;
  const one = bigint ? "1n" : "1";
  const zero = bigint ? "0n" : "0";
  const reduction = isReduction(testCase.method);
  const species = hasSpecies(testCase.method);
  const classDeclaration = species
    ? `class Sub extends ${testCase.constructorName} {}\n`
    : "";
  let speciesAssignment = "";
  if (species && testCase.species === "subclass") {
    speciesAssignment = "view.constructor = Sub;\n";
  } else if (species && testCase.species === "null") {
    speciesAssignment = "view.constructor = { [Symbol.species]: null };\n";
  }
  const mutation =
    testCase.mutation === "detach"
      ? "view.buffer.transfer();"
      : testCase.mutation === "shrink"
        ? "view.buffer.resize(0);"
        : "";
  const parameters = reduction
    ? "accumulator, value, index, object"
    : "value, index, object";
  const callLine = reduction
    ? 'console.log("call", String(accumulator), String(value), index, ' +
      "object === view);"
    : 'console.log("call", String(value), index, object === view, ' +
      "this === marker);";
  const expression = reduction
    ? "accumulator + value"
    : testCase.method === "map"
      ? `value + ${one}`
      : testCase.method === "forEach"
        ? "true"
        : `value < ${printValue(testCase.threshold)}`;
  const trailing = reduction
    ? testCase.initial
      ? `, ${zero}`
      : ""
    : ", marker";
  const result =
    testCase.method === "map" || testCase.method === "filter"
      ? 'console.log("result", result instanceof Sub, ' +
        `Object.getPrototypeOf(result) === ${testCase.constructorName}` +
        ".prototype, result.length, [...result].join());"
      : 'console.log("result", String(result));';
  const writes = testCase.values
    .map((value, index) => `view[${index}] = ${printValue(value)};`)
    .join("\n");
  return `
const buffer = new ArrayBuffer(${length * bytes}, {
  maxByteLength: ${length * bytes},
});
const view = new ${testCase.constructorName}(buffer);
${writes}
${classDeclaration}${speciesAssignment}const marker = { marker: true };
let mutated = false;
const result = view.${testCase.method}(function (${parameters}) {
  ${callLine}
  if (!mutated) { mutated = true; ${mutation} }
  return ${expression};
}${trailing});
${result}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
`;
}

function store(constructorName: ConstructorName, value: Element): Element {
  if (isBigInt(value)) return value;
  if (constructorName === "Float32Array") return Math.fround(value);
  if (constructorName === "Float64Array") return value;
  return Number.isFinite(value) ? value : 0;
}

/** Add two elements of one case's kind without mixing Number and BigInt. */
function add(left: Element, right: Element): Element {
  if (isBigInt(left) && isBigInt(right)) return left + right;
  if (isBigInt(left) || isBigInt(right)) {
    throw new Error("a case mixed Number and BigInt elements");
  }
  return left + right;
}

function printElement(value: Element | undefined): string {
  return value === undefined ? "undefined" : String(value);
}

function expected(testCase: IterativeCase): string {
  const bigint = isBigIntKind(testCase.constructorName);
  const one: Element = bigint ? 1n : 1;
  const zero: Element = bigint ? 0n : 0;
  const name = testCase.constructorName;
  const values = testCase.values.map((value) => store(name, value));
  const snapshot = values.length;
  let current: readonly Element[] = values;
  const lines: string[] = [];
  let mutated = false;
  let accumulator: Element | undefined = testCase.initial ? zero : undefined;
  let result: boolean | undefined;
  const output: (Element | undefined)[] = [];
  const collected: Element[] = [];
  const indices: number[] = [];
  if (testCase.method === "reduceRight") {
    for (let index = snapshot - 1; index >= 0; index -= 1) {
      indices.push(index);
    }
  } else {
    for (let index = 0; index < snapshot; index += 1) indices.push(index);
  }
  for (const index of indices) {
    const value = index < current.length ? current[index] : undefined;
    if (isReduction(testCase.method) && accumulator === undefined) {
      accumulator = value;
      continue;
    }
    if (isReduction(testCase.method)) {
      const left = printElement(accumulator);
      lines.push(`call ${left} ${printElement(value)} ${index} true`);
    } else {
      lines.push(`call ${printElement(value)} ${index} true true`);
    }
    if (!mutated) {
      mutated = true;
      if (testCase.mutation !== "none") current = [];
    }
    if (testCase.method === "every") {
      if (!(value !== undefined && value < testCase.threshold)) {
        result = false;
        break;
      }
    } else if (testCase.method === "some") {
      if (value !== undefined && value < testCase.threshold) {
        result = true;
        break;
      }
    } else if (testCase.method === "filter") {
      if (value !== undefined && value < testCase.threshold) {
        collected.push(value);
      }
    } else if (testCase.method === "map") {
      output[index] =
        value === undefined ? store(name, NaN) : store(name, add(value, one));
    } else if (isReduction(testCase.method)) {
      if (accumulator === undefined) {
        throw new Error("a reduction lost its accumulator");
      }
      const right: Element =
        value === undefined ? (bigint ? zero : NaN) : value;
      accumulator = add(accumulator, right);
    }
  }
  if (testCase.method === "every") {
    if (result !== false) result = true;
    lines.push(`result ${String(result)}`);
  } else if (testCase.method === "some") {
    if (result !== true) result = false;
    lines.push(`result ${String(result)}`);
  } else if (testCase.method === "forEach") {
    lines.push("result undefined");
  } else if (testCase.method === "map") {
    const final: Element[] = [];
    for (let index = 0; index < snapshot; index += 1) {
      final.push(output[index] ?? store(name, NaN));
    }
    lines.push(
      `result ${testCase.species === "subclass"} ` +
        `${testCase.species !== "subclass"} ${snapshot} ${final.join()}`,
    );
  } else if (testCase.method === "filter") {
    lines.push(
      `result ${testCase.species === "subclass"} ` +
        `${testCase.species !== "subclass"} ${collected.length} ` +
        `${collected.join()}`,
    );
  } else {
    lines.push(`result ${printElement(accumulator)}`);
  }
  lines.push("hint 5 23", "");
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
    "oseo-typed-array-iterative-property-",
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

async function assertCase(testCase: IterativeCase): Promise<void> {
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
      { source, sourceId: "generated-m5-typed-array-iterative.ts" },
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

test(
  "generated TypedArray iterative methods match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "TypedArray iterative methods agree",
      fc.asyncProperty(caseArbitrary, assertCase),
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
          "every, filter, forEach, map, reduce, reduceRight, and some over " +
          "one to five bounded Number or BigInt elements of six typed-array " +
          "kinds; default, null, and subclass species; present and absent " +
          "reduction initial values; no mutation, detach, and shrink during " +
          "the first callback; callback receiver and argument identity; and " +
          "one deliberate numeric-hint guard miss",
        numRuns: 12,
        profile: "M5 TypedArray iterative methods",
        seed: 0x6000_7400,
        sizeLimit:
          "one view, one to five elements, one resize or detach, one " +
          "callback per snapshot index, at most one result observation, and " +
          "one false numeric hint",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

/*
 * The generated domain cannot guarantee that one of its 12 draws is a Number
 * reduction whose first callback detaches or shrinks the view, which is the
 * path where a read after the mutation becomes `undefined` and the reduction
 * addition turns it into `NaN`. These fixed cases keep the model's Number
 * reduction, map, and filter mutation paths exercised on every run.
 */
test(
  "TypedArray iterative mutation cases match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const cases: readonly IterativeCase[] = [
      {
        constructorName: "Float64Array",
        initial: false,
        method: "reduce",
        mutation: "detach",
        species: "default",
        threshold: 0,
        values: [1, 2, 3],
      },
      {
        constructorName: "Int32Array",
        initial: true,
        method: "reduceRight",
        mutation: "shrink",
        species: "default",
        threshold: 0,
        values: [4, 5, 6],
      },
      {
        constructorName: "Float32Array",
        initial: false,
        method: "map",
        mutation: "detach",
        species: "default",
        threshold: 0,
        values: [1, 2, 3],
      },
      {
        constructorName: "Int16Array",
        initial: false,
        method: "filter",
        mutation: "shrink",
        species: "subclass",
        threshold: 5,
        values: [1, 2, 3],
      },
    ];
    for (const testCase of cases) await assertCase(testCase);
  },
);
