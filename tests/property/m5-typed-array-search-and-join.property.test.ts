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
type SearchMethod =
  | "find"
  | "findIndex"
  | "findLast"
  | "findLastIndex"
  | "includes"
  | "indexOf"
  | "join"
  | "lastIndexOf"
  | "toLocaleString"
  | "toString";
type Mutation = "detach" | "none" | "shrink";

/**
 * How the case supplies the method's optional second input: nothing, a
 * plain value, or an object whose conversion performs the case's mutation.
 * The input is the fromIndex for index search, the separator for join, and
 * the forwarded locales for toLocaleString; the predicate searches and
 * toString ignore it.
 */
type Input =
  | { readonly kind: "absent" }
  | { readonly kind: "coerced"; readonly value: number }
  | { readonly kind: "plain"; readonly value: number };

interface SearchCase {
  readonly constructorName: ConstructorName;
  readonly input: Input;
  readonly method: SearchMethod;
  readonly mutation: Mutation;
  readonly target: Element | undefined;
  readonly values: readonly Element[];
}

const methods: readonly SearchMethod[] = [
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "includes",
  "indexOf",
  "join",
  "lastIndexOf",
  "toLocaleString",
  "toString",
];

const numberConstructors: readonly ConstructorName[] = [
  "Float32Array",
  "Float64Array",
  "Int16Array",
  "Int32Array",
  "Int8Array",
];

const inputArbitrary: fc.Arbitrary<Input> = fc.oneof(
  fc.constant<Input>({ kind: "absent" }),
  fc.record({
    kind: fc.constant("plain" as const),
    value: fc.oneof(
      fc.integer({ max: 7, min: -7 }),
      fc.constantFrom(Infinity, -Infinity, 1.5, -0),
    ),
  }),
  fc.record({
    kind: fc.constant("coerced" as const),
    value: fc.integer({ max: 7, min: -7 }),
  }),
);

function caseArbitraryFor(
  constructors: readonly ConstructorName[],
  element: fc.Arbitrary<Element>,
): fc.Arbitrary<SearchCase> {
  return fc
    .record({
      constructorName: fc.constantFrom(...constructors),
      input: inputArbitrary,
      method: fc.constantFrom(...methods),
      mutation: fc.constantFrom<Mutation>("none", "detach", "shrink"),
      target: fc.option(element, { nil: undefined }),
      values: fc.array(element, { maxLength: 5 }),
    })
    .map((testCase) => ({
      constructorName: testCase.constructorName,
      input: testCase.input,
      method: testCase.method,
      // Array.prototype.toString reaches join without a user-code hook.
      mutation: testCase.method === "toString" ? "none" : testCase.mutation,
      target: testCase.target,
      values: testCase.values,
    }));
}

const caseArbitrary = fc.oneof(
  caseArbitraryFor(
    numberConstructors,
    fc.oneof(
      fc.integer({ max: 9, min: -9 }),
      fc.constantFrom(NaN, -0, 0.5, Infinity),
    ),
  ),
  caseArbitraryFor(["BigInt64Array"], fc.bigInt({ max: 9n, min: -9n })),
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

function printValue(value: Element | undefined): string {
  if (value === undefined) return "undefined";
  if (isBigInt(value)) return `${value}n`;
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

function bytesPerElement(name: ConstructorName): number {
  if (name === "Int8Array") return 1;
  if (name === "Int16Array") return 2;
  if (name === "Float64Array" || name === "BigInt64Array") return 8;
  return 4;
}

function isPredicate(method: SearchMethod): boolean {
  return method.startsWith("find");
}

function isIndexSearch(method: SearchMethod): boolean {
  return (
    method === "includes" || method === "indexOf" || method === "lastIndexOf"
  );
}

function printCase(testCase: SearchCase): string {
  const bytes = bytesPerElement(testCase.constructorName);
  const length = testCase.values.length;
  const localeOwner = isBigIntKind(testCase.constructorName)
    ? "BigInt"
    : "Number";
  const mutation =
    testCase.mutation === "detach"
      ? "view.buffer.transfer();"
      : testCase.mutation === "shrink"
        ? `view.buffer.resize(${Math.floor(length / 2) * bytes});`
        : "";
  const writes = testCase.values
    .map((value, index) => `view[${index}] = ${printValue(value)};`)
    .join("\n");
  const target = printValue(testCase.target);
  const { input } = testCase;
  let second = "";
  if (input.kind === "plain") {
    second = testCase.method === "join" ? '"-"' : printValue(input.value);
  } else if (input.kind === "coerced") {
    const returned =
      testCase.method === "join" ? '"+"' : printValue(input.value);
    const hook = testCase.method === "join" ? "toString" : "valueOf";
    second =
      `{ ${hook}() { console.log("convert"); ` +
      `if (!mutated) { mutated = true; ${mutation} } return ${returned}; } }`;
  }
  let call: string;
  if (isPredicate(testCase.method)) {
    call =
      `view.${testCase.method}(function (value, index, object) {\n` +
      '  console.log("call", String(value), index, object === view, ' +
      "this === marker);\n" +
      `  if (!mutated) { mutated = true; ${mutation} }\n` +
      `  return value === ${target};\n` +
      "}, marker)";
  } else if (isIndexSearch(testCase.method)) {
    call =
      `view.${testCase.method}(${target}` +
      `${input.kind === "absent" ? "" : `, ${second}`})`;
  } else if (testCase.method === "toLocaleString") {
    if (input.kind === "absent") call = "view.toLocaleString()";
    else if (input.kind === "plain") {
      call = 'view.toLocaleString("ko", marker)';
    } else {
      // The element method's own String(locales) runs this conversion, so
      // it observes the forwarded object's identity rather than a copy.
      call =
        'view.toLocaleString({ toString() { console.log("convert"); ' +
        `if (!mutated) { mutated = true; ${mutation} } return "ko"; } }, ` +
        "marker)";
    }
  } else if (testCase.method === "join") {
    call = `view.join(${input.kind === "absent" ? "" : second})`;
  } else {
    call = "view.toString()";
  }
  const locale =
    testCase.method === "toLocaleString"
      ? `${localeOwner}.prototype.toLocaleString = function (locales, options) {
  "use strict";
  console.log("locale", String(this), arguments.length, String(locales),
    options === marker);
  if (!mutated) { mutated = true; ${mutation} }
  return "<" + String(this) + ">";
};\n`
      : "";
  return `
const buffer = new ArrayBuffer(${length * bytes}, {
  maxByteLength: ${length * bytes},
});
const view = new ${testCase.constructorName}(buffer);
${writes}
const marker = { marker: true };
let mutated = false;
${locale}const result = ${call};
console.log("result", typeof result, String(result));
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
`;
}

function store(constructorName: ConstructorName, value: Element): Element {
  if (isBigInt(value)) return value;
  if (constructorName === "Float32Array") return Math.fround(value);
  if (constructorName === "Float64Array") return value;
  const bits = constructorName === "Int8Array" ? 8 : 16;
  if (!Number.isFinite(value)) return 0;
  const integer = Math.trunc(value);
  if (constructorName === "Int32Array") return integer | 0;
  const modulo = 2 ** bits;
  const wrapped = ((integer % modulo) + modulo) % modulo;
  return wrapped >= modulo / 2 ? wrapped - modulo : wrapped + 0;
}

function sameValueZero(
  left: Element | undefined,
  right: Element | undefined,
): boolean {
  return (Object.is(left, NaN) && Object.is(right, NaN)) || left === right;
}

/** ToIntegerOrInfinity over the bounded plain and coerced inputs. */
function integerOrInfinity(value: number): number {
  if (Number.isNaN(value) || value === 0) return 0;
  if (!Number.isFinite(value)) return value;
  return Math.trunc(value) + 0;
}

function expected(testCase: SearchCase): string {
  const name = testCase.constructorName;
  const values = testCase.values.map((value) => store(name, value));
  const snapshot = values.length;
  let current: readonly Element[] = values;
  const lines: string[] = [];
  let mutated = false;
  const mutate = (): void => {
    if (mutated) return;
    mutated = true;
    if (testCase.mutation === "detach") current = [];
    else if (testCase.mutation === "shrink") {
      current = values.slice(0, Math.floor(snapshot / 2));
    }
  };
  const read = (index: number): Element | undefined =>
    index < current.length ? current[index] : undefined;
  let result: boolean | string | Element | undefined;
  let resultType = "string";
  const { input, method } = testCase;
  if (isPredicate(method)) {
    const fromLast = method === "findLast" || method === "findLastIndex";
    const wantsIndex = method === "findIndex" || method === "findLastIndex";
    result = wantsIndex ? -1 : undefined;
    const elementType = isBigIntKind(name) ? "bigint" : "number";
    resultType = wantsIndex ? "number" : "undefined";
    for (let visited = 0; visited < snapshot; visited += 1) {
      const index = fromLast ? snapshot - 1 - visited : visited;
      const value = read(index);
      lines.push(`call ${String(value)} ${index} true true`);
      mutate();
      if (value === testCase.target) {
        result = wantsIndex ? index : value;
        if (!wantsIndex && value !== undefined) resultType = elementType;
        break;
      }
    }
  } else if (isIndexSearch(method)) {
    const includes = method === "includes";
    const fromRight = method === "lastIndexOf";
    result = includes ? false : -1;
    resultType = includes ? "boolean" : "number";
    if (snapshot > 0) {
      let relative = fromRight ? snapshot - 1 : 0;
      if (input.kind !== "absent") {
        if (input.kind === "coerced") {
          lines.push("convert");
          mutate();
        }
        relative = integerOrInfinity(input.value);
      }
      // An infinite fromIndex past the traversal end starts out of range.
      let index: number;
      if (fromRight) {
        index =
          relative === -Infinity
            ? -1
            : relative >= 0
              ? Math.min(relative, snapshot - 1)
              : snapshot + relative;
      } else {
        index =
          relative === Infinity
            ? snapshot
            : relative >= 0
              ? relative
              : Math.max(snapshot + relative, 0);
      }
      while (fromRight ? index >= 0 : index < snapshot) {
        if (includes) {
          if (sameValueZero(read(index), testCase.target)) {
            result = true;
            break;
          }
        } else if (index < current.length && read(index) === testCase.target) {
          result = index;
          break;
        }
        index += fromRight ? -1 : 1;
      }
    }
  } else if (method === "toLocaleString") {
    const pieces: string[] = [];
    for (let index = 0; index < snapshot; index += 1) {
      const value = read(index);
      if (value === undefined) {
        pieces.push("");
        continue;
      }
      const locales = input.kind === "absent" ? "undefined" : "ko";
      if (input.kind === "coerced") {
        lines.push("convert");
        mutate();
      }
      lines.push(
        `locale ${String(value)} 2 ${locales} ${input.kind !== "absent"}`,
      );
      mutate();
      pieces.push(`<${String(value)}>`);
    }
    result = pieces.join(",");
  } else {
    let separator = ",";
    if (method === "join" && input.kind === "plain") separator = "-";
    if (method === "join" && input.kind === "coerced") {
      lines.push("convert");
      mutate();
      separator = "+";
    }
    const pieces: string[] = [];
    for (let index = 0; index < snapshot; index += 1) {
      const value = read(index);
      pieces.push(value === undefined ? "" : String(value));
    }
    result = pieces.join(separator);
  }
  lines.push(`result ${resultType} ${String(result)}`, "hint 5 23", "");
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
    "oseo-typed-array-search-property-",
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

async function assertCase(testCase: SearchCase): Promise<void> {
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
      { source, sourceId: "generated-m5-typed-array-search-and-join.ts" },
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
  "generated TypedArray search and join methods match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "TypedArray search and join methods agree",
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
          "find, findIndex, findLast, findLastIndex, includes, indexOf, " +
          "lastIndexOf, join, toLocaleString, and toString over zero to five " +
          "bounded Number, NaN, signed-zero, infinite, or BigInt elements of " +
          "six typed-array kinds; absent, present, and undefined search " +
          "targets; absent, plain, infinite, fractional, and observably " +
          "converted fromIndex, separator, and locale inputs; no mutation, " +
          "detach, and shrink during the first callback or conversion; and " +
          "one deliberate numeric-hint guard miss",
        numRuns: 12,
        profile: "M5 TypedArray search and join methods",
        seed: 0x6000_7600,
        sizeLimit:
          "one view, zero to five elements, one resize or detach, one " +
          "callback or conversion per snapshot index, one result " +
          "observation, and one false numeric hint",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

/*
 * Twelve draws cannot guarantee the paths where a mutation during an
 * observable conversion invalidates an index the method still visits:
 * includes matching undefined after a detach, indexOf and lastIndexOf
 * skipping a shrunk index, join rendering empty fields, a predicate and
 * toLocaleString seeing a later element disappear, and a forwarded locales
 * object whose conversion detaches the view. These fixed cases
 * keep each of them exercised on every run.
 */
test(
  "TypedArray search and join mutation cases match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const cases: readonly SearchCase[] = [
      {
        constructorName: "Float64Array",
        input: { kind: "coerced", value: 0 },
        method: "includes",
        mutation: "detach",
        target: undefined,
        values: [1, NaN, 3],
      },
      {
        constructorName: "Int16Array",
        input: { kind: "coerced", value: 3 },
        method: "lastIndexOf",
        mutation: "shrink",
        target: 4,
        values: [1, 4, 3, 4],
      },
      {
        constructorName: "BigInt64Array",
        input: { kind: "coerced", value: 0 },
        method: "join",
        mutation: "shrink",
        target: undefined,
        values: [1n, -2n, 3n],
      },
      {
        constructorName: "Float32Array",
        input: { kind: "absent" },
        method: "findLastIndex",
        mutation: "detach",
        target: undefined,
        values: [0.5, 2, -0],
      },
      {
        constructorName: "Int8Array",
        input: { kind: "plain", value: 0 },
        method: "toLocaleString",
        mutation: "shrink",
        target: undefined,
        values: [7, -8, 9, 1],
      },
      {
        constructorName: "BigInt64Array",
        input: { kind: "coerced", value: 0 },
        method: "toLocaleString",
        mutation: "detach",
        target: undefined,
        values: [4n, -5n],
      },
    ];
    for (const testCase of cases) await assertCase(testCase);
  },
);
