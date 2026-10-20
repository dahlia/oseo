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

type CopyMethod =
  | "concat"
  | "flat"
  | "flatMap"
  | "join"
  | "slice"
  | "toLocaleString"
  | "toString";
type ReceiverKind = "array" | "object";
type SpeciesKind = "custom" | "null";

interface CopyCase {
  readonly end: number;
  readonly entries: readonly (number | null)[];
  readonly extra: readonly (number | null)[];
  readonly method: CopyMethod;
  readonly offset: number;
  readonly receiver: ReceiverKind;
  readonly separator: string;
  readonly species: SpeciesKind;
  readonly start: number;
}

const caseArbitrary: fc.Arbitrary<CopyCase> = fc.record({
  end: fc.integer({ max: 7, min: -7 }),
  entries: fc.array(fc.option(fc.integer({ max: 9, min: -9 }), { nil: null }), {
    maxLength: 5,
  }),
  extra: fc.array(fc.option(fc.integer({ max: 9, min: -9 }), { nil: null }), {
    maxLength: 3,
  }),
  method: fc.constantFrom<CopyMethod>(
    "concat",
    "flat",
    "flatMap",
    "join",
    "slice",
    "toLocaleString",
    "toString",
  ),
  offset: fc.integer({ max: 4, min: -4 }),
  receiver: fc.constantFrom<ReceiverKind>("array", "object"),
  separator: fc.constantFrom(",", "|", "::"),
  species: fc.constantFrom<SpeciesKind>("custom", "null"),
  start: fc.integer({ max: 7, min: -7 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function assignments(
  name: string,
  values: readonly (number | null)[],
  locale = false,
): string {
  return values
    .map((value, index) => {
      if (value == null) return "";
      const expression = locale
        ? `{ toLocaleString() { return ${JSON.stringify(String(value))}; } }`
        : String(value);
      return `${name}[${index}] = ${expression};`;
    })
    .join("\n");
}

function printCase(testCase: CopyCase): string {
  const subject = testCase.receiver === "array" ? "[]" : "{}";
  const species = testCase.species === "custom" ? "Species" : "null";
  let invocation: string;
  switch (testCase.method) {
    case "concat":
      invocation = "Array.prototype.concat.call(subject, extra)";
      break;
    case "flat":
      invocation = "Array.prototype.flat.call(subject)";
      break;
    case "flatMap":
      invocation = `Array.prototype.flatMap.call(
  subject,
  (value) => [value, value + ${testCase.offset}],
)`;
      break;
    case "join":
      invocation = `Array.prototype.join.call(
  subject,
  ${JSON.stringify(testCase.separator)},
)`;
      break;
    case "slice":
      invocation = `Array.prototype.slice.call(
  subject,
  ${testCase.start},
  ${testCase.end},
)`;
      break;
    case "toLocaleString":
      invocation = "Array.prototype.toLocaleString.call(subject)";
      break;
    case "toString":
      invocation = "Array.prototype.toString.call(subject)";
      break;
  }
  return `
const subject = ${subject};
subject.length = ${testCase.entries.length};
${assignments(
  "subject",
  testCase.entries,
  testCase.method === "toLocaleString",
)}
const extra = [];
extra.length = ${testCase.extra.length};
${assignments("extra", testCase.extra)}
function Species(length) {
  console.log("construct", length);
  this.requestedLength = length;
}
const holder = {};
Object.defineProperty(holder, Symbol.species, {
  get() { console.log("species"); return ${species}; },
});
Object.defineProperty(subject, "constructor", {
  get() { console.log("constructor"); return holder; },
});
if (${JSON.stringify(testCase.method)} === "concat") {
  subject[Symbol.isConcatSpreadable] = true;
}
const result = ${invocation};
if (
  ${JSON.stringify(testCase.method)} === "join" ||
  ${JSON.stringify(testCase.method)} === "toLocaleString" ||
  ${JSON.stringify(testCase.method)} === "toString"
) {
  console.log("string result", result);
} else {
  console.log(
    "result",
    Array.isArray(result),
    result instanceof Species,
    result.requestedLength,
    result.length,
  );
  for (let index = 0; index < 10; index = index + 1) {
    console.log(
      "entry",
      index,
      Object.prototype.hasOwnProperty.call(result, String(index)),
      result[index],
    );
  }
}
/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayCopyingPropertyMarker = 1;
  turn = turn + 1;
}
const originalIs = Object.is;
turn = 0;
while (turn < 3) {
  console.log("shape", Object.is === originalIs);
  if (turn === 1) Object.arrayCopyingPropertyMarker = 1;
  turn = turn + 1;
}
`;
}

function clamp(index: number, length: number): number {
  return index < 0 ? Math.max(length + index, 0) : Math.min(index, length);
}

function expectedValues(testCase: CopyCase): readonly (number | null)[] {
  switch (testCase.method) {
    case "concat":
      return [...testCase.entries, ...testCase.extra];
    case "flat":
      return testCase.entries.filter((value): value is number => value != null);
    case "flatMap":
      return testCase.entries.flatMap((value) =>
        value == null ? [] : [value, value + testCase.offset],
      );
    case "join":
    case "toLocaleString":
    case "toString":
      return [];
    case "slice": {
      const start = clamp(testCase.start, testCase.entries.length);
      const end = clamp(testCase.end, testCase.entries.length);
      return end <= start ? [] : testCase.entries.slice(start, end);
    }
  }
}

function expected(testCase: CopyCase): string {
  const lines: string[] = [];
  const usesSpecies =
    testCase.receiver === "array" &&
    ["concat", "flat", "flatMap", "slice"].includes(testCase.method);
  const values = expectedValues(testCase);
  if (usesSpecies) {
    lines.push("constructor", "species");
    if (testCase.species === "custom") {
      const requested = testCase.method === "slice" ? values.length : 0;
      lines.push(`construct ${requested}`);
    }
  }
  if (testCase.method === "join" || testCase.method === "toLocaleString") {
    const joined = testCase.entries
      .map((value) => (value == null ? "" : String(value)))
      .join(testCase.method === "join" ? testCase.separator : ",");
    lines.push(`string result ${joined}`);
  } else if (testCase.method === "toString") {
    const rendered =
      testCase.receiver === "array"
        ? testCase.entries
            .map((value) => (value == null ? "" : String(value)))
            .join(",")
        : "[object Object]";
    lines.push(`string result ${rendered}`);
  } else {
    const custom = usesSpecies && testCase.species === "custom";
    const requested = custom
      ? testCase.method === "slice"
        ? values.length
        : 0
      : "undefined";
    const length =
      custom && (testCase.method === "flat" || testCase.method === "flatMap")
        ? "undefined"
        : values.length;
    lines.push(
      `result ${String(!custom)} ${String(custom)} ${requested} ${length}`,
    );
    for (let index = 0; index < 10; index += 1) {
      const value = values[index];
      lines.push(
        `entry ${index} ${String(value != null)} ` +
          `${String(value == null ? undefined : value)}`,
      );
    }
  }
  lines.push(
    "hint h",
    "false hint m",
    "guard g",
    "guard g",
    "guard g",
    "shape true",
    "shape true",
    "shape true",
    "",
  );
  return lines.join("\n");
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory(
    "oseo-array-copying-property-",
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
  "generated Array copying methods match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Array copying methods agree",
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
            { source, sourceId: "generated-m5-array-copying.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-object/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /property-get generic/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:object|shape)/u);
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
                assert.ok(native.counters != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "disabled") {
                  assert.equal(native.counters.guardHits, 0);
                  assert.equal(native.counters.guardMisses, 0);
                } else {
                  assert.ok(native.counters.guardHits > 0);
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
          "concat, flat, flatMap, join, slice, toLocaleString, and " +
          "toString over zero to five " +
          "sparse array or ordinary array-like numeric entries, with " +
          "locale wrappers for toLocaleString; zero to three " +
          "concat entries; default and custom species; bounded slice " +
          "indices, flatMap offsets, and separators; false hints and a " +
          "deliberate shape-guard miss",
        numRuns: 10,
        profile: "M5 Array prototype copying and flattening",
        seed: 0x6000_4700,
        sizeLimit:
          "at most five source indices, three concat indices, ten result " +
          "observations, one species construction, and eight hint or " +
          "guard observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

/*
 * Array.prototype.toLocaleString arguments. ECMA-262 2025 invokes each
 * non-nullish element's toLocaleString with no arguments, whatever the
 * outer call received. ECMA-402 replaces that step with a call forwarding
 * the outer locales and options, and both reference hosts implement
 * ECMA-402, so their element methods always receive exactly two arguments.
 * ADR 0013 excludes ECMA-402, so the references must equal a labeled
 * reference model while native output must equal the ECMA-262 model.
 *
 * Node.js 24.21.0 and Deno 2.9.7 also depart from both specifications for
 * a hole in an Array receiver: V8 reads it as an empty string rather than
 * undefined and invokes String.prototype.toLocaleString on it. An ordinary
 * array-like receiver's missing index reads undefined in all three, so the
 * reference model applies that difference only to Array receivers.
 */
type LocaleArgument = "ar" | "null" | "undefined" | "unique" | "zero" | "zh";
type LocaleElement =
  | "accessor"
  | "coerce"
  | "hole"
  | "inherited"
  | "nested"
  | "noncallable"
  | "null"
  | "number"
  | "own"
  | "string"
  | "throwing"
  | "undefined";
type LocaleForm =
  | "array-apply"
  | "array-call"
  | "array-like-apply"
  | "array-like-call"
  | "array-method";

interface LocaleSubject {
  readonly args: readonly LocaleArgument[];
  readonly elements: readonly LocaleElement[];
  readonly form: LocaleForm;
}

interface LocaleCase {
  readonly subjects: readonly LocaleSubject[];
}

const localeArguments: readonly LocaleArgument[] = [
  "ar",
  "null",
  "undefined",
  "unique",
  "zero",
  "zh",
];
const localeElements: readonly LocaleElement[] = [
  "accessor",
  "coerce",
  "hole",
  "inherited",
  "nested",
  "noncallable",
  "null",
  "number",
  "own",
  "string",
  "throwing",
  "undefined",
];
const localeForms: readonly LocaleForm[] = [
  "array-apply",
  "array-call",
  "array-like-apply",
  "array-like-call",
  "array-method",
];

const localeCaseArbitrary: fc.Arbitrary<LocaleCase> = fc.record({
  subjects: fc.array(
    fc.record({
      args: fc.array(fc.constantFrom(...localeArguments), { maxLength: 3 }),
      elements: fc.array(fc.constantFrom(...localeElements), {
        maxLength: 5,
      }),
      form: fc.constantFrom(...localeForms),
    }),
    { maxLength: 3, minLength: 1 },
  ),
});

const localeArgumentSource = {
  ar: '"ar"',
  null: "null",
  undefined: "undefined",
  unique: "unique",
  zero: "0",
  zh: '"zh"',
} satisfies Record<LocaleArgument, string>;

/** Mirrors the generated program's `describe`. */
const localeArgumentDescription = {
  ar: "'ar'",
  null: "null",
  undefined: "undefined",
  unique: "unique",
  zero: "0",
  zh: "'zh'",
} satisfies Record<LocaleArgument, string>;

function localeElementSource(
  element: LocaleElement,
  label: string,
  index: number,
): string | null {
  switch (element) {
    case "accessor":
      return `{
  get toLocaleString() {
    console.log("get", ${JSON.stringify(label)});
    return function (...received) {
      report(${JSON.stringify(label)}, received);
      return "a";
    };
  },
}`;
    case "coerce":
      return `{
  toLocaleString(...received) {
    report(${JSON.stringify(label)}, received);
    return {
      toString() {
        console.log("coerce", ${JSON.stringify(label)});
        return "c";
      },
    };
  },
}`;
    case "hole":
      return null;
    case "inherited":
      return "Object.create(inheritedLocale)";
    case "nested":
      return `[{
  toLocaleString(...received) {
    report(${JSON.stringify(label)}, received);
    return "x";
  },
}]`;
    case "noncallable":
      return "{ toLocaleString: 1 }";
    case "null":
      return "null";
    case "number":
      return String(index);
    case "own":
      return `{
  toLocaleString(...received) {
    report(${JSON.stringify(label)}, received);
    return "o";
  },
}`;
    case "string":
      return JSON.stringify(`t${index}`);
    case "throwing":
      return `{
  toLocaleString(...received) {
    report(${JSON.stringify(label)}, received);
    throw new RangeError("element");
  },
}`;
    case "undefined":
      return "undefined";
  }
}

function printLocaleCase(testCase: LocaleCase): string {
  const subjects = testCase.subjects.map((subject, subjectIndex) => {
    const name = `subject${subjectIndex}`;
    const receiver = subject.form.startsWith("array-like") ? "{}" : "[]";
    const elementAssignments = subject.elements
      .map((element, index) => {
        const source = localeElementSource(
          element,
          `s${subjectIndex}e${index}`,
          index,
        );
        return source == null ? "" : `${name}[${index}] = ${source};\n`;
      })
      .join("");
    const args = subject.args.map((arg) => localeArgumentSource[arg]);
    let invocation: string;
    switch (subject.form) {
      case "array-apply":
      case "array-like-apply":
        invocation =
          `Array.prototype.toLocaleString.apply(` +
          `${name}, [${args.join(", ")}])`;
        break;
      case "array-call":
      case "array-like-call":
        invocation = `Array.prototype.toLocaleString.call(${[
          name,
          ...args,
        ].join(", ")})`;
        break;
      case "array-method":
        invocation = `${name}.toLocaleString(${args.join(", ")})`;
        break;
    }
    return `const ${name} = ${receiver};
${name}.length = ${subject.elements.length};
${elementAssignments}try {
  console.log("result", ${subjectIndex}, ${invocation});
} catch (error) {
  console.log("abrupt", ${subjectIndex}, error.name);
}
`;
  });
  return `const unique = { toString() { return "<sentinel object>"; } };
function describe(value) {
  if (value === unique) return "unique";
  return typeof value === "string" ? "'" + value + "'" : String(value);
}
function report(label, received) {
  const described = Array.prototype.map.call(received, describe);
  console.log("call", label, received.length, described.join("|"));
}
// Strict, so the primitive receiver needs no wrapper object.
Number.prototype.toLocaleString = function () {
  "use strict";
  report(typeof this + ":" + this, arguments);
  return "n" + this;
};
String.prototype.toLocaleString = function () {
  "use strict";
  report(typeof this + ":" + this, arguments);
  return "s" + this;
};
const inheritedLocale = {
  toLocaleString(...received) {
    report("inherited", received);
    return "i";
  },
};
${subjects.join("")}`;
}

/**
 * The expected stdout. With `v8`, every element method receives the outer
 * call's first two arguments, `undefined` when absent, a nested Array
 * forwards the same two arguments again, and an Array receiver's hole
 * invokes String.prototype.toLocaleString on an empty string. Without it,
 * every element method receives no arguments and a hole is skipped.
 */
function modelLocaleCase(testCase: LocaleCase, v8: boolean): string {
  const lines: string[] = [];
  for (const [subjectIndex, subject] of testCase.subjects.entries()) {
    const received = v8
      ? [0, 1].map((index) => {
          const arg = subject.args[index];
          return arg == null ? "undefined" : localeArgumentDescription[arg];
        })
      : [];
    const call = (label: string): void => {
      lines.push(`call ${label} ${received.length} ${received.join("|")}`);
    };
    const pieces: string[] = [];
    let abrupt: string | null = null;
    for (const [index, element] of subject.elements.entries()) {
      const label = `s${subjectIndex}e${index}`;
      switch (element) {
        case "accessor":
          lines.push(`get ${label}`);
          call(label);
          pieces.push("a");
          break;
        case "coerce":
          call(label);
          lines.push(`coerce ${label}`);
          pieces.push("c");
          break;
        case "hole":
          if (v8 && !subject.form.startsWith("array-like")) {
            call("string:");
            pieces.push("s");
          } else {
            pieces.push("");
          }
          break;
        case "null":
        case "undefined":
          pieces.push("");
          break;
        case "inherited":
          call("inherited");
          pieces.push("i");
          break;
        case "nested":
          call(label);
          pieces.push("x");
          break;
        case "noncallable":
          abrupt = "TypeError";
          break;
        case "number":
          call(`number:${index}`);
          pieces.push(`n${index}`);
          break;
        case "own":
          call(label);
          pieces.push("o");
          break;
        case "string":
          call(`string:t${index}`);
          pieces.push(`st${index}`);
          break;
        case "throwing":
          call(label);
          abrupt = "RangeError";
          break;
      }
      if (abrupt != null) break;
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
 * Every test262 argument shape from invoke-element-tolocalestring.js plus
 * a null locale with numeric options, over every receiver and call form with
 * every non-abrupt element kind, then abrupt elements after a successful one
 * with and without arguments. One program keeps this to one native
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
        ["undefined", "unique"],
        ["zh", "unique"],
        ["unique", "unique"],
        ["unique", "unique", "unique"],
        ["null", "zero"],
      ] as const
    ).flatMap((args) =>
      localeForms.map((form) => ({
        args,
        elements: [
          "own",
          "hole",
          "undefined",
          "null",
          "inherited",
          "accessor",
          "number",
          "string",
          "nested",
          "coerce",
        ] as const,
        form,
      })),
    ),
    ...([[], ["zh", "unique"]] as const).flatMap((args) =>
      (["throwing", "noncallable"] as const).map((abrupt) => ({
        args,
        elements: ["own", abrupt, "own"] as const,
        form: "array-method" as const,
      })),
    ),
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
      { source, sourceId: "generated-m5-array-locale-arguments.ts" },
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
          target: nativeTarget!,
          toolchain: nativeToolchain,
        },
        (native) => {
          assertMatchingObservations([expectedObservation, native]);
          assert.ok(native.counters != null);
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
 * Requires both references to equal the labeled V8 model and native output
 * to equal the ECMA-262 model. The two models differ only in the arguments
 * each element method receives and in an Array receiver's holes.
 */
async function assertLocaleCase(testCase: LocaleCase): Promise<void> {
  const source = printLocaleCase(testCase);
  assertMatchingObservations([
    { exitStatus: 0, stderr: "", stdout: modelLocaleCase(testCase, true) },
    ...(await references(source)),
  ]);
  await assertNativeLocaleCase(source, modelLocaleCase(testCase, false));
}

test("Array locale model invokes element methods without arguments", () => {
  const testCase: LocaleCase = {
    subjects: [{ args: ["ar"], elements: ["own"], form: "array-method" }],
  };
  assert.equal(modelLocaleCase(testCase, false), "call s0e0 0 \nresult 0 o\n");
  assert.equal(
    modelLocaleCase(testCase, true),
    "call s0e0 2 'ar'|undefined\nresult 0 o\n",
  );
  const holed: LocaleCase = {
    subjects: [
      { args: [], elements: ["hole", "own"], form: "array-call" },
      { args: [], elements: ["hole", "own"], form: "array-like-call" },
    ],
  };
  assert.equal(
    modelLocaleCase(holed, false),
    "call s0e1 0 \nresult 0 ,o\ncall s1e1 0 \nresult 1 ,o\n",
  );
  assert.equal(
    modelLocaleCase(holed, true),
    "call string: 2 undefined|undefined\n" +
      "call s0e1 2 undefined|undefined\nresult 0 s,o\n" +
      "call s1e1 2 undefined|undefined\nresult 1 ,o\n",
  );
});

test(
  "fixed Array locale arguments follow the ECMA-262 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertLocaleCase(fixedLocaleCase);
  },
);

test(
  "generated Array locale arguments are never forwarded",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Array toLocaleString invokes element methods without arguments",
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
          "one to three Array.prototype.toLocaleString calls with zero to " +
          "three outer arguments drawn from undefined, null, 0, two " +
          "strings, and an object, through method, call, or apply on an " +
          "Array or ordinary array-like receiver of zero to five elements: " +
          "holes, undefined, null, own, inherited, accessor, coercing, " +
          "throwing, and non-callable methods, number and string " +
          "primitives, and nested Arrays",
        numRuns: 10,
        profile: "M5 Array toLocaleString element arguments",
        seed: 0x6000_4701,
        sizeLimit:
          "three calls, three outer arguments, and five elements per call",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
