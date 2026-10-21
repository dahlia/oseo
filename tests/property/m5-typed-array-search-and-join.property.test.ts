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
 * the outer locales for toLocaleString; the predicate searches and toString
 * ignore it. ECMA-262 never passes the locales to an element method, so
 * only the ECMA-402 reference model converts a coerced locales object.
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
      // Under ECMA-402 the element method's own String(locales) runs this
      // conversion, so it observes the forwarded object's identity rather
      // than a copy. Under ECMA-262 the element method never receives it.
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

/**
 * Which toLocaleString element call contract a model follows. `ecma262` is
 * the ADR 0013 edition that native execution must satisfy: each element
 * method receives no arguments. `ecma402` is the labeled reference model for
 * Node.js and Deno, which forward the outer locales and options as exactly
 * two arguments. The two differ only in toLocaleString observations.
 */
type LocaleModel = "ecma262" | "ecma402";

function expected(testCase: SearchCase, model: LocaleModel): string {
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
      const forwarded = model === "ecma402" && input.kind !== "absent";
      const locales = forwarded ? "ko" : "undefined";
      if (forwarded && input.kind === "coerced") {
        lines.push("convert");
        mutate();
      }
      lines.push(
        `locale ${String(value)} ${model === "ecma402" ? 2 : 0} ${locales} ` +
          String(forwarded),
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
    stdout: expected(testCase, "ecma262"),
  };
  assertMatchingObservations([
    { exitStatus: 0, stderr: "", stdout: expected(testCase, "ecma402") },
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
 * toLocaleString seeing a later element disappear, and a locales object
 * whose conversion detaches the view under the ECMA-402 reference model
 * while the ECMA-262 element call detaches it natively. These fixed cases
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

/*
 * %TypedArray%.prototype.toLocaleString element arguments. ECMA-262 2025
 * applies the Array.prototype.toLocaleString algorithm after
 * ValidateTypedArray, and that algorithm invokes each element's current
 * toLocaleString with no arguments, whatever the outer call received.
 * ECMA-402 replaces the step with a call forwarding the outer locales and
 * options, and both reference hosts implement ECMA-402, so their element
 * methods always receive exactly two arguments. ADR 0013 excludes ECMA-402,
 * so the references must equal a labeled ECMA-402 model while native output
 * must equal the independent ECMA-262 model. Every outer argument expression
 * is still evaluated before the call in both, and a locales object that
 * logs its own conversion shows that only the forwarding model converts it.
 */
type LocaleView =
  | "BigInt64Array"
  | "BigUint64Array"
  | "Float64Array"
  | "Int8Array"
  | "Uint8Array";
type LocaleArgument =
  | "ar"
  | "coercing"
  | "null"
  | "throwing"
  | "undefined"
  | "unique"
  | "zero"
  | "zh";
type LocaleMethod = "detach" | "noncallable" | "object" | "report" | "throw";
type LocaleForm = "apply" | "call" | "method";

interface LocaleSubject {
  readonly args: readonly LocaleArgument[];
  readonly detached: boolean;
  readonly form: LocaleForm;
  readonly method: LocaleMethod;
  readonly values: readonly number[];
  readonly view: LocaleView;
}

interface LocaleCase {
  readonly subjects: readonly LocaleSubject[];
}

const localeViews: readonly LocaleView[] = [
  "BigInt64Array",
  "BigUint64Array",
  "Float64Array",
  "Int8Array",
  "Uint8Array",
];
const localeArguments: readonly LocaleArgument[] = [
  "ar",
  "coercing",
  "null",
  "throwing",
  "undefined",
  "unique",
  "zero",
  "zh",
];
const localeMethods: readonly LocaleMethod[] = [
  "detach",
  "noncallable",
  "object",
  "report",
  "throw",
];
const localeForms: readonly LocaleForm[] = ["apply", "call", "method"];

const localeCaseArbitrary: fc.Arbitrary<LocaleCase> = fc.record({
  subjects: fc.array(
    fc.record({
      args: fc.array(fc.constantFrom(...localeArguments), { maxLength: 3 }),
      detached: fc.boolean(),
      form: fc.constantFrom(...localeForms),
      method: fc.constantFrom(...localeMethods),
      values: fc.array(fc.integer({ max: 9, min: 0 }), { maxLength: 4 }),
      view: fc.constantFrom(...localeViews),
    }),
    { maxLength: 3, minLength: 1 },
  ),
});

function isBigIntView(view: LocaleView): boolean {
  return view === "BigInt64Array" || view === "BigUint64Array";
}

/** Mirrors the generated program's `describe`, including its conversion. */
const localeArgumentDescription = {
  ar: "'ar'",
  coercing: "coercing:zh",
  null: "null",
  throwing: "unreachable",
  undefined: "undefined",
  unique: "unique",
  zero: "0",
  zh: "'zh'",
} satisfies Record<LocaleArgument, string>;

function localeArgumentSource(
  arg: LocaleArgument,
  subject: number,
  index: number,
): string {
  if (arg === "throwing") return `fail(${subject}, ${index})`;
  const value = {
    ar: '"ar"',
    coercing: "coercing",
    null: "null",
    undefined: "undefined",
    unique: "unique",
    zero: "0",
    zh: '"zh"',
  }[arg];
  return `arg(${subject}, ${index}, ${value})`;
}

function localeMethodSource(method: LocaleMethod, view: string): string {
  switch (method) {
    case "detach":
      return `function () {
  "use strict";
  report(typeof this + ":" + this, arguments);
  if (calls === 0) ${view}.buffer.transfer();
  calls = calls + 1;
  return "e" + this;
}`;
    case "noncallable":
      return "1";
    case "object":
      return `function () {
  "use strict";
  const label = typeof this + ":" + this;
  report(label, arguments);
  return {
    toString() {
      console.log("coerce result", label);
      return "o";
    },
  };
}`;
    case "report":
      return `function () {
  "use strict";
  report(typeof this + ":" + this, arguments);
  return "e" + this;
}`;
    case "throw":
      return `function () {
  "use strict";
  report(typeof this + ":" + this, arguments);
  calls = calls + 1;
  if (calls === 2) throw new RangeError("element");
  return "e" + this;
}`;
  }
}

function printLocaleCase(testCase: LocaleCase): string {
  const subjects = testCase.subjects.map((subject, index) => {
    const view = `view${index}`;
    const bigint = isBigIntView(subject.view);
    const owner = bigint ? "BigInt" : "Number";
    const elements = subject.values
      .map((value) => (bigint ? `${value}n` : String(value)))
      .join(", ");
    const args = subject.args.map((arg, position) =>
      localeArgumentSource(arg, index, position),
    );
    let invocation: string;
    switch (subject.form) {
      case "apply":
        invocation =
          `TypedArrayPrototype.toLocaleString.apply(` +
          `${view}, [${args.join(", ")}])`;
        break;
      case "call":
        invocation = `TypedArrayPrototype.toLocaleString.call(${[
          view,
          ...args,
        ].join(", ")})`;
        break;
      case "method":
        invocation = `${view}.toLocaleString(${args.join(", ")})`;
        break;
    }
    return `const ${view} = new ${subject.view}([${elements}]);
${subject.detached ? `${view}.buffer.transfer();\n` : ""}calls = 0;
${owner}.prototype.toLocaleString = ${localeMethodSource(subject.method, view)};
try {
  console.log("result", ${index}, ${invocation});
} catch (error) {
  console.log("abrupt", ${index}, error.name);
}
`;
  });
  return `const TypedArray = Object.getPrototypeOf(Int8Array);
const TypedArrayPrototype = TypedArray.prototype;
const unique = { toString() { return "<sentinel object>"; } };
const coercing = {
  toString() {
    console.log("coerce locales");
    return "zh";
  },
};
function arg(subject, index, value) {
  console.log("evaluate", subject, index);
  return value;
}
function fail(subject, index) {
  console.log("evaluate", subject, index);
  throw new RangeError("argument");
}
function describe(value) {
  if (value === unique) return "unique";
  if (value === coercing) return "coercing:" + String(value);
  return typeof value === "string" ? "'" + value + "'" : String(value);
}
function report(label, received) {
  const described = Array.prototype.map.call(received, describe);
  console.log("call", label, received.length, described.join("|"));
}
let calls = 0;
${subjects.join("")}`;
}

/**
 * The expected stdout. Under `ecma402` every element method receives the
 * outer call's first two arguments, `undefined` when absent, and describing
 * the coercing locales object converts it before the call is logged. Under
 * `ecma262` every element method receives no arguments, so nothing converts
 * that object. Both evaluate every argument expression before the receiver
 * is validated, and a throwing expression prevents the call.
 */
function modelLocaleCase(testCase: LocaleCase, model: LocaleModel): string {
  const lines: string[] = [];
  for (const [subjectIndex, subject] of testCase.subjects.entries()) {
    let abrupt: string | null = null;
    for (const [position, arg] of subject.args.entries()) {
      lines.push(`evaluate ${subjectIndex} ${position}`);
      if (arg === "throwing") {
        abrupt = "RangeError";
        break;
      }
    }
    if (abrupt == null && subject.detached) abrupt = "TypeError";
    const received: readonly LocaleArgument[] =
      model === "ecma402"
        ? [0, 1].map((position) => subject.args[position] ?? "undefined")
        : [];
    const kind = isBigIntView(subject.view) ? "bigint" : "number";
    const pieces: string[] = [];
    let calls = 0;
    let detached = false;
    for (const value of subject.values) {
      if (abrupt != null) break;
      if (detached) {
        pieces.push("");
        continue;
      }
      if (subject.method === "noncallable") {
        abrupt = "TypeError";
        break;
      }
      const label = `${kind}:${value}`;
      for (const arg of received) {
        if (arg === "coercing") lines.push("coerce locales");
      }
      const described = received.map((arg) => localeArgumentDescription[arg]);
      lines.push(`call ${label} ${received.length} ${described.join("|")}`);
      switch (subject.method) {
        case "detach":
          if (calls === 0) detached = true;
          calls += 1;
          pieces.push(`e${value}`);
          break;
        case "object":
          lines.push(`coerce result ${label}`);
          pieces.push("o");
          break;
        case "report":
          pieces.push(`e${value}`);
          break;
        case "throw":
          calls += 1;
          if (calls === 2) abrupt = "RangeError";
          else pieces.push(`e${value}`);
          break;
      }
    }
    lines.push(
      abrupt == null
        ? `result ${subjectIndex} ${pieces.join(",")}`
        : `abrupt ${subjectIndex} ${abrupt}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Every outer argument shape, including explicit undefined, extra
 * arguments, a coercing locales object as locales and as options, and a
 * throwing expression between two others, through every call form on a
 * Number view; then each element method mode, each view kind, a detached
 * receiver, and an empty view. One program keeps this to one native
 * compilation per specialization policy.
 */
const fixedLocaleCase: LocaleCase = {
  subjects: [
    ...(
      [
        [],
        ["undefined"],
        ["ar"],
        ["unique"],
        ["coercing"],
        ["zh", "coercing"],
        ["coercing", "unique", "coercing"],
        ["null", "zero"],
        ["ar", "throwing", "zh"],
      ] as const
    ).flatMap((args) =>
      localeForms.map((form) => ({
        args,
        detached: false,
        form,
        method: "report" as const,
        values: [1, 2],
        view: "Uint8Array" as const,
      })),
    ),
    ...localeViews.flatMap((view) =>
      localeMethods.map((method) => ({
        args: ["coercing", "unique"] as const,
        detached: false,
        form: "method" as const,
        method,
        values: [3, 0, 7],
        view,
      })),
    ),
    ...(["Int8Array", "BigUint64Array"] as const).flatMap((view) =>
      ([[], ["ar"]] as const).map((args) => ({
        args,
        detached: true,
        form: "call" as const,
        method: "report" as const,
        values: [5],
        view,
      })),
    ),
    {
      args: ["coercing"],
      detached: false,
      form: "apply",
      method: "noncallable",
      values: [],
      view: "Float64Array",
    },
  ],
};

/** Both specialization policies, each with collection at every safepoint. */
async function assertNativeLocaleCase(
  source: string,
  stdout: string,
): Promise<void> {
  const expectedObservation = { exitStatus: 0, stderr: "", stdout };
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "generated-m5-typed-array-locale-arguments.ts" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
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
          if (specialization === "disabled") {
            assert.equal(native.counters.guardHits, 0);
            assert.equal(native.counters.guardMisses, 0);
          }
        },
      );
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}

/**
 * Requires both references to equal the labeled ECMA-402 model and native
 * output to equal the ECMA-262 model.
 */
async function assertLocaleCase(testCase: LocaleCase): Promise<void> {
  const source = printLocaleCase(testCase);
  assertMatchingObservations([
    { exitStatus: 0, stderr: "", stdout: modelLocaleCase(testCase, "ecma402") },
    ...(await references(source)),
  ]);
  await assertNativeLocaleCase(source, modelLocaleCase(testCase, "ecma262"));
}

test("TypedArray locale models differ only in element arguments", () => {
  const testCase: LocaleCase = {
    subjects: [
      {
        args: ["ar", "coercing", "zh"],
        detached: false,
        form: "method",
        method: "report",
        values: [1],
        view: "BigInt64Array",
      },
      {
        args: [],
        detached: false,
        form: "call",
        method: "detach",
        values: [4, 5],
        view: "Int8Array",
      },
    ],
  };
  assert.equal(
    modelLocaleCase(testCase, "ecma262"),
    "evaluate 0 0\nevaluate 0 1\nevaluate 0 2\n" +
      "call bigint:1 0 \nresult 0 e1\n" +
      "call number:4 0 \nresult 1 e4,\n",
  );
  assert.equal(
    modelLocaleCase(testCase, "ecma402"),
    "evaluate 0 0\nevaluate 0 1\nevaluate 0 2\n" +
      "coerce locales\ncall bigint:1 2 'ar'|coercing:zh\nresult 0 e1\n" +
      "call number:4 2 undefined|undefined\nresult 1 e4,\n",
  );
  const search: SearchCase = {
    constructorName: "Int8Array",
    input: { kind: "coerced", value: 0 },
    method: "toLocaleString",
    mutation: "none",
    target: undefined,
    values: [2],
  };
  assert.equal(
    expected(search, "ecma262"),
    "locale 2 0 undefined false\nresult string <2>\nhint 5 23\n",
  );
  assert.equal(
    expected(search, "ecma402"),
    "convert\nlocale 2 2 ko true\nresult string <2>\nhint 5 23\n",
  );
});

test(
  "fixed TypedArray locale arguments follow the ECMA-262 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertLocaleCase(fixedLocaleCase);
  },
);

test(
  "generated TypedArray locale arguments are never forwarded",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "TypedArray toLocaleString invokes element methods without arguments",
      fc.asyncProperty(localeCaseArbitrary, assertLocaleCase),
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
          "one to three %TypedArray%.prototype.toLocaleString calls through " +
          "method, call, or apply on attached or detached Int8, Uint8, " +
          "Float64, BigInt64, or BigUint64 views of zero to four elements, " +
          "with zero to three logged outer argument expressions drawn from " +
          "undefined, null, 0, two strings, an identity object, a coercing " +
          "locales object, and a throwing expression, and a reporting, " +
          "object-returning, throwing, detaching, or non-callable element " +
          "method",
        numRuns: 10,
        profile: "M5 TypedArray toLocaleString element arguments",
        seed: 0x6000_7601,
        sizeLimit:
          "three calls, three outer arguments, and four elements per call",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
