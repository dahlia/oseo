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

interface PropertyCase {
  readonly booleanEntryValue: number;
  readonly entries: readonly EntryCase[];
  readonly entryStringParts: readonly (
    | "a"
    | "b"
    | "🥰"
    | "💩"
    | "\ud800"
    | "\udfff"
  )[];
  readonly grouped: readonly number[];
  readonly laterSymbolEnumerable: boolean;
  readonly numberIteratorValues: readonly number[];
  readonly virtualIteratorEnumerable: boolean;
  readonly wrapperParts: readonly ("a" | "b" | "🥰" | "💩")[];
}

interface EntryCase {
  readonly enumerable: boolean;
  readonly key: "0" | "2" | "a" | "b" | "symbol-0" | "symbol-1";
  readonly value: number;
}

const entryArbitrary = fc.record({
  enumerable: fc.boolean(),
  key: fc.constantFrom<EntryCase["key"]>(
    "0",
    "2",
    "a",
    "b",
    "symbol-0",
    "symbol-1",
  ),
  value: fc.integer({ max: 9, min: -9 }),
});

const caseArbitrary: fc.Arbitrary<PropertyCase> = fc.record({
  booleanEntryValue: fc.integer({ max: 9, min: -9 }),
  entries: fc.uniqueArray(entryArbitrary, {
    maxLength: 6,
    minLength: 1,
    selector: (entry) => entry.key,
  }),
  // The empty String is a valid empty iterable, so this domain
  // deliberately admits it alongside non-empty code-point sequences.
  // Unpaired surrogate halves belong here too: nothing this domain
  // observes prints the String itself, so a lone half exercises the
  // shared code-point step without depending on how a host encodes it.
  entryStringParts: fc.array(
    fc.constantFrom("a", "b", "🥰", "💩", "\ud800", "\udfff"),
    { maxLength: 3, minLength: 0 },
  ),
  grouped: fc.array(fc.integer({ max: 6, min: -6 }), { maxLength: 5 }),
  laterSymbolEnumerable: fc.boolean(),
  numberIteratorValues: fc.array(fc.integer({ max: 6, min: -6 }), {
    maxLength: 4,
    minLength: 1,
  }),
  virtualIteratorEnumerable: fc.boolean(),
  wrapperParts: fc.array(fc.constantFrom("a", "b", "🥰", "💩"), {
    maxLength: 4,
    minLength: 1,
  }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function sourceKey(entry: EntryCase): string {
  switch (entry.key) {
    case "symbol-0":
      return "symbols[0]";
    case "symbol-1":
      return "symbols[1]";
    default:
      return JSON.stringify(entry.key);
  }
}

function printCase(testCase: PropertyCase): string {
  const definitions = testCase.entries
    .map(
      (entry) => `Object.defineProperty(subject, ${sourceKey(entry)}, {
  value: ${entry.value},
  enumerable: ${String(entry.enumerable)},
  configurable: true,
  writable: true,
});`,
    )
    .join("\n");
  return `
function render(values) {
  let text = "";
  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) text = text + ",";
    text = text + values[index];
  }
  return text;
}
const symbols = [Symbol("zero"), Symbol("one")];
const subject = {};
${definitions}
console.log("keys", render(Object.keys(subject)));
console.log("values", render(Object.values(subject)));
let renderedEntries = "";
for (const entry of Object.entries(subject)) {
  if (renderedEntries !== "") renderedEntries = renderedEntries + ",";
  renderedEntries = renderedEntries + entry[0] + ":" + entry[1];
}
console.log("entries", renderedEntries);
console.log("names", render(Object.getOwnPropertyNames(subject)));
const ownSymbols = Object.getOwnPropertySymbols(subject);
let renderedSymbols = "";
for (let index = 0; index < ownSymbols.length; index = index + 1) {
  if (index > 0) renderedSymbols = renderedSymbols + ",";
  renderedSymbols = renderedSymbols +
    (ownSymbols[index] === symbols[0] ? "zero" : "one");
}
console.log("symbols", renderedSymbols);
const assigned = Object.assign({ base: 10 }, subject);
console.log("assign keys", render(Object.keys(assigned)));
console.log("assign values", render(Object.values(assigned)));
console.log(
  "assign symbols",
  Object.hasOwn(assigned, symbols[0]),
  Object.hasOwn(assigned, symbols[1]),
);
const reconstructed = Object.fromEntries(Object.entries(subject));
console.log("from entries", render(Object.keys(reconstructed)));
console.log(
  "has own",
  Object.hasOwn(subject, "0"),
  Object.hasOwn(subject, "a"),
  Object.hasOwn(subject, symbols[0]),
);
const grouped = Object.groupBy(
  ${JSON.stringify(testCase.grouped)},
  (value) => value % 2 === 0 ? "even" : "odd",
);
console.log("group keys", render(Object.keys(grouped)));
if (Object.hasOwn(grouped, "even")) {
  console.log("even", render(grouped.even));
}
if (Object.hasOwn(grouped, "odd")) {
  console.log("odd", render(grouped.odd));
}
console.log("null prototype", Object.getPrototypeOf(grouped) === null);
/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
console.log("guard", hinted("guard"));
String.prototype.objectOwnKeysPropertyMarker = 1;
console.log("guard", hinted("guard"));
const stringPrototype = Object.getPrototypeOf(Object(""));
const laterStringSymbol = Symbol("later string symbol");
function reflectStringIterator(label) {
  const descriptor = Object.getOwnPropertyDescriptor(
    stringPrototype,
    Symbol.iterator,
  );
  console.log(
    "string iterator reflection",
    label,
    Object.hasOwn(stringPrototype, Symbol.iterator),
    Object.prototype.hasOwnProperty.call(stringPrototype, Symbol.iterator),
    Object.prototype.propertyIsEnumerable.call(
      stringPrototype,
      Symbol.iterator,
    ),
    Symbol.iterator in stringPrototype,
    Symbol.iterator in Object(""),
    descriptor === undefined
      ? "absent"
      : "get" in descriptor
        ? "accessor"
        : "data",
    descriptor === undefined ? "absent" : descriptor.enumerable,
    descriptor === undefined ? "absent" : descriptor.configurable,
  );
}
reflectStringIterator("untouched");
let stringSymbolAccessLog = [];
Object.defineProperty(stringPrototype, Symbol.iterator, {
  enumerable: ${String(testCase.virtualIteratorEnumerable)},
});
Object.defineProperty(stringPrototype, laterStringSymbol, {
  configurable: true,
  enumerable: ${String(testCase.laterSymbolEnumerable)},
  get: function () {
    stringSymbolAccessLog.push("later");
    return 42;
  },
});
const virtualStringSymbols = Object.getOwnPropertySymbols(stringPrototype);
const virtualStringDescriptor = Object.getOwnPropertyDescriptor(
  stringPrototype,
  Symbol.iterator,
);
const virtualStringDescriptors = Object.getOwnPropertyDescriptors(
  stringPrototype,
);
const virtualStringAssigned = Object.assign({}, stringPrototype);
const virtualStringAssignedOwn = Object.hasOwn(
  virtualStringAssigned,
  Symbol.iterator,
);
console.log(
  "virtual string reflection",
  virtualStringSymbols.length,
  virtualStringSymbols[0] === Symbol.iterator,
  virtualStringSymbols[1] === laterStringSymbol,
  Object.hasOwn(stringPrototype, Symbol.iterator),
  virtualStringAssignedOwn,
  virtualStringDescriptor !== undefined,
  virtualStringDescriptor.enumerable,
  Object.hasOwn(virtualStringDescriptors, Symbol.iterator),
  virtualStringDescriptors[Symbol.iterator].enumerable,
  // The current node preserves only identity until the virtual value is
  // materialized by the later String iterator node.
  !virtualStringAssignedOwn ||
    virtualStringAssigned[Symbol.iterator] ===
      stringPrototype[Symbol.iterator],
  stringSymbolAccessLog.length === 0
    ? "none"
    : render(stringSymbolAccessLog),
);
reflectStringIterator("enumerable");
const wrapperCallbacks = [];
const groupedWrapperString = Object.groupBy(
  new String(${JSON.stringify(testCase.wrapperParts.join(""))}),
  (value, index) => {
    wrapperCallbacks.push(index + ":" + value);
    return "wrapper";
  },
);
console.log(
  "group wrapper string",
  render(wrapperCallbacks),
  render(groupedWrapperString.wrapper),
);
const entryString = ${JSON.stringify(testCase.entryStringParts.join(""))};
for (const entrySource of [entryString, new String(entryString)]) {
  try {
    const built = Object.fromEntries(entrySource);
    console.log(
      "from entries default string",
      "built",
      Object.getOwnPropertyNames(built).length,
      Object.getOwnPropertySymbols(built).length,
    );
  } catch (error) {
    console.log(
      "from entries default string",
      "threw",
      error instanceof TypeError &&
        error.message.indexOf("entry object") >= 0,
    );
  }
}
const ownEntryWrapper = new String(entryString);
ownEntryWrapper[Symbol.iterator] = function () {
  let done = false;
  return {
    next: function () {
      if (done) return { done: true };
      done = true;
      return { done: false, value: ["own", ${testCase.booleanEntryValue}] };
    },
  };
};
const ownEntryResult = Object.fromEntries(ownEntryWrapper);
console.log(
  "from entries own string iterator",
  Object.hasOwn(ownEntryWrapper, Symbol.iterator),
  render(Object.getOwnPropertyNames(ownEntryResult)),
  ownEntryResult.own,
);
const assignedStringIterator = function () {
  let done = false;
  return {
    next: function () {
      if (done) return { done: true };
      done = true;
      return { done: false, value: "assigned" };
    },
  };
};
const assignmentWrapper = Object("z");
const wrapperOwnIterator = function () {};
assignmentWrapper[Symbol.iterator] = wrapperOwnIterator;
stringPrototype[Symbol.iterator] = assignedStringIterator;
const assignedStringSymbols = Object.getOwnPropertySymbols(stringPrototype);
const assignedStringDescriptor = Object.getOwnPropertyDescriptor(
  stringPrototype,
  Symbol.iterator,
);
const assignedStringGroups = Object.groupBy(
  new String("ignored"),
  (value) => value,
);
const assignedStringKeys = Object.keys(assignedStringGroups);
console.log(
  "assigned string iterator",
  Object.hasOwn(assignmentWrapper, Symbol.iterator),
  assignmentWrapper[Symbol.iterator] === wrapperOwnIterator,
  stringPrototype[Symbol.iterator] === assignedStringIterator,
  assignedStringDescriptor.configurable,
  assignedStringDescriptor.enumerable,
  assignedStringDescriptor.writable,
  assignedStringSymbols.length,
  assignedStringSymbols[0] === Symbol.iterator,
  assignedStringSymbols[1] === laterStringSymbol,
  assignedStringKeys.length,
  assignedStringKeys[0],
);
reflectStringIterator("assigned");
let stringIteratorReads = 0;
let replacementReceiverIsWrapper = false;
stringSymbolAccessLog = [];
Object.defineProperty(stringPrototype, Symbol.iterator, {
  configurable: true,
  enumerable: true,
  get: function () {
    stringIteratorReads = stringIteratorReads + 1;
    stringSymbolAccessLog.push("iterator");
    return function () {
      replacementReceiverIsWrapper = this instanceof String;
      let done = false;
      return {
        next: function () {
          if (done) return { done: true };
          done = true;
          return { done: false, value: "replacement" };
        },
      };
    };
  },
});
const replacedStringSymbols = Object.getOwnPropertySymbols(stringPrototype);
const replacedStringDescriptor = Object.getOwnPropertyDescriptor(
  stringPrototype,
  Symbol.iterator,
);
const replacedStringAssigned = Object.assign({}, stringPrototype);
console.log(
  "replaced string reflection",
  replacedStringSymbols.length,
  replacedStringSymbols[0] === Symbol.iterator,
  replacedStringSymbols[1] === laterStringSymbol,
  Object.hasOwn(stringPrototype, Symbol.iterator),
  Object.hasOwn(replacedStringAssigned, Symbol.iterator),
  replacedStringDescriptor.get !== undefined,
  replacedStringDescriptor.enumerable,
  stringIteratorReads,
  render(stringSymbolAccessLog),
);
reflectStringIterator("replaced");
const replacedStringGroups = Object.groupBy(
  new String("ignored"),
  (value) => value,
);
console.log(
  "group replaced string iterator",
  stringIteratorReads,
  replacementReceiverIsWrapper,
  render(replacedStringGroups.replacement),
);
delete stringPrototype[Symbol.iterator];
const deletedStringSymbols = Object.getOwnPropertySymbols(stringPrototype);
const deletedStringDescriptor = Object.getOwnPropertyDescriptor(
  stringPrototype,
  Symbol.iterator,
);
const deletedStringDescriptors = Object.getOwnPropertyDescriptors(
  stringPrototype,
);
const deletedStringAssigned = Object.assign({}, stringPrototype);
console.log(
  "deleted string reflection",
  deletedStringSymbols.length,
  deletedStringSymbols[0] === laterStringSymbol,
  Object.hasOwn(stringPrototype, Symbol.iterator),
  Object.hasOwn(deletedStringAssigned, Symbol.iterator),
  deletedStringDescriptor === undefined,
  Object.hasOwn(deletedStringDescriptors, Symbol.iterator),
);
reflectStringIterator("deleted");
let deletedStringIteratorCalls = 0;
try {
  Object.groupBy(new String("ignored"), () => {
    deletedStringIteratorCalls = deletedStringIteratorCalls + 1;
    return "unreachable";
  });
} catch (error) {
  console.log(
    "group deleted string iterator",
    error instanceof TypeError,
    deletedStringIteratorCalls,
  );
}
for (const deletedSource of [entryString, new String(entryString)]) {
  try {
    Object.fromEntries(deletedSource);
    console.log("from entries deleted string iterator", "no error");
  } catch (error) {
    console.log(
      "from entries deleted string iterator",
      error instanceof TypeError,
      error.message.indexOf("entry object") >= 0,
    );
  }
}
Object.defineProperty(stringPrototype, Symbol.iterator, {
  configurable: true,
  enumerable: true,
  value: function () {
    return { next: function () { return { done: true }; } };
  },
});
const redefinedStringSymbols = Object.getOwnPropertySymbols(stringPrototype);
console.log(
  "redefined string iterator order",
  redefinedStringSymbols.length,
  redefinedStringSymbols[0] === laterStringSymbol,
  redefinedStringSymbols[1] === Symbol.iterator,
);
reflectStringIterator("redefined");
const numberIteratorValues = ${JSON.stringify(testCase.numberIteratorValues)};
const numberPrototype = Object.getPrototypeOf(Object(0));
let numberIteratorReads = 0;
Object.defineProperty(numberPrototype, Symbol.iterator, {
  configurable: true,
  get: function () {
    numberIteratorReads = numberIteratorReads + 1;
    return function () {
      let index = 0;
      return {
        next: function () {
          if (index >= numberIteratorValues.length) return { done: true };
          const value = numberIteratorValues[index];
          index = index + 1;
          return { done: false, value };
        },
      };
    };
  },
});
const numberGroups = Object.groupBy(7, () => "number");
console.log(
  "group primitive number",
  numberIteratorReads,
  render(numberGroups.number),
);
const numberLoopValues = [];
for (const value of 7) numberLoopValues.push(value);
console.log(
  "for of primitive number",
  numberIteratorReads,
  render(numberLoopValues),
);
delete numberPrototype[Symbol.iterator];
const booleanPrototype = Object.getPrototypeOf(Object(false));
let booleanIteratorReads = 0;
Object.defineProperty(booleanPrototype, Symbol.iterator, {
  configurable: true,
  get: function () {
    booleanIteratorReads = booleanIteratorReads + 1;
    return function () {
      let done = false;
      return {
        next: function () {
          if (done) return { done: true };
          done = true;
          return {
            done: false,
            value: ["boolean", ${testCase.booleanEntryValue}],
          };
        },
      };
    };
  },
});
const booleanEntries = Object.fromEntries(false);
console.log(
  "from entries primitive boolean",
  booleanIteratorReads,
  booleanEntries.boolean,
);
delete booleanPrototype[Symbol.iterator];
for (const nullish of [null, undefined]) {
  try {
    Object.groupBy(nullish, () => "unreachable");
  } catch (error) {
    console.log("group nullish", error instanceof TypeError);
  }
  try {
    Object.fromEntries(nullish);
  } catch (error) {
    console.log("from entries nullish", error instanceof TypeError);
  }
}
for (const invalid of [null, undefined, true]) {
  try {
    for (const value of invalid) console.log("unreachable", value);
  } catch (error) {
    console.log("for of invalid", error instanceof TypeError);
  }
}
`;
}

function orderedEntries(testCase: PropertyCase): readonly EntryCase[] {
  const indices = testCase.entries
    .filter((entry) => entry.key === "0" || entry.key === "2")
    .toSorted((left, right) => Number(left.key) - Number(right.key));
  const strings = testCase.entries.filter(
    (entry) => entry.key === "a" || entry.key === "b",
  );
  const symbols = testCase.entries.filter((entry) =>
    entry.key.startsWith("symbol-"),
  );
  return [...indices, ...strings, ...symbols];
}

function stringName(entry: EntryCase): string | undefined {
  return entry.key.startsWith("symbol-") ? undefined : entry.key;
}

function expected(testCase: PropertyCase): string {
  const ordered = orderedEntries(testCase);
  const enumerableStrings = ordered.filter(
    (entry) => entry.enumerable && stringName(entry) != null,
  );
  const names = ordered
    .map(stringName)
    .filter((name): name is string => name != null);
  const symbols = ordered.filter((entry) => entry.key.startsWith("symbol-"));
  const assignedSymbols = new Set(
    symbols.filter((entry) => entry.enumerable).map((entry) => entry.key),
  );
  // The default String path reports the same line for the primitive and
  // its wrapper: an empty String is a valid empty iterable, and every
  // element a non-empty String yields fails the entry-object check.
  const defaultStringEntryLine =
    testCase.entryStringParts.length === 0
      ? "from entries default string built 0 0"
      : "from entries default string threw true";
  const lines = [
    `keys ${enumerableStrings.map((entry) => entry.key).join(",")}`,
    `values ${enumerableStrings.map((entry) => entry.value).join(",")}`,
    "entries " +
      enumerableStrings.map((entry) => `${entry.key}:${entry.value}`).join(","),
    `names ${names.join(",")}`,
    `symbols ${symbols
      .map((entry) => (entry.key === "symbol-0" ? "zero" : "one"))
      .join(",")}`,
  ];
  const assignedStrings = [
    ...enumerableStrings.filter(
      (entry) => entry.key === "0" || entry.key === "2",
    ),
    { enumerable: true, key: "base", value: 10 },
    ...enumerableStrings.filter(
      (entry) => entry.key === "a" || entry.key === "b",
    ),
  ];
  lines.push(
    `assign keys ${assignedStrings.map((entry) => entry.key).join(",")}`,
    `assign values ${assignedStrings.map((entry) => entry.value).join(",")}`,
    `assign symbols ${String(assignedSymbols.has("symbol-0"))} ` +
      String(assignedSymbols.has("symbol-1")),
    `from entries ${enumerableStrings.map((entry) => entry.key).join(",")}`,
  );
  const ownKeys = new Set(testCase.entries.map((entry) => entry.key));
  lines.push(
    `has own ${String(ownKeys.has("0"))} ${String(ownKeys.has("a"))} ` +
      String(ownKeys.has("symbol-0")),
  );
  const even = testCase.grouped.filter((value) => value % 2 === 0);
  const odd = testCase.grouped.filter((value) => value % 2 !== 0);
  const groupKeys: string[] = [];
  for (const value of testCase.grouped) {
    const key = value % 2 === 0 ? "even" : "odd";
    if (!groupKeys.includes(key)) groupKeys.push(key);
  }
  lines.push(`group keys ${groupKeys.join(",")}`);
  if (even.length > 0) lines.push(`even ${even.join(",")}`);
  if (odd.length > 0) lines.push(`odd ${odd.join(",")}`);
  lines.push(
    "null prototype true",
    "hint h",
    "false hint m",
    "guard g",
    "guard g",
    "string iterator reflection untouched true true false true true " +
      "data false true",
    "virtual string reflection 2 true true true " +
      `${String(testCase.virtualIteratorEnumerable)} true ` +
      `${String(testCase.virtualIteratorEnumerable)} true ` +
      `${String(testCase.virtualIteratorEnumerable)} true ` +
      (testCase.laterSymbolEnumerable ? "later" : "none"),
    "string iterator reflection enumerable true true " +
      `${String(testCase.virtualIteratorEnumerable)} true true data ` +
      `${String(testCase.virtualIteratorEnumerable)} true`,
    `group wrapper string ${testCase.wrapperParts
      .map((part, index) => `${index}:${part}`)
      .join(",")} ${testCase.wrapperParts.join(",")}`,
    defaultStringEntryLine,
    defaultStringEntryLine,
    "from entries own string iterator true own " +
      String(testCase.booleanEntryValue),
    "assigned string iterator true true true true " +
      `${String(testCase.virtualIteratorEnumerable)} true 2 true true ` +
      "1 assigned",
    "string iterator reflection assigned true true " +
      `${String(testCase.virtualIteratorEnumerable)} true true data ` +
      `${String(testCase.virtualIteratorEnumerable)} true`,
    "replaced string reflection 2 true true true true true true 1 " +
      (testCase.laterSymbolEnumerable ? "iterator,later" : "iterator"),
    "string iterator reflection replaced true true true true true " +
      "accessor true true",
    "group replaced string iterator 2 true replacement",
    "deleted string reflection 1 true false false true false",
    "string iterator reflection deleted false false false false false " +
      "absent absent absent",
    "group deleted string iterator true 0",
    "from entries deleted string iterator true false",
    "from entries deleted string iterator true false",
    "redefined string iterator order 2 true true",
    "string iterator reflection redefined true true true true true " +
      "data true true",
    `group primitive number 1 ${testCase.numberIteratorValues.join(",")}`,
    `for of primitive number 2 ${testCase.numberIteratorValues.join(",")}`,
    `from entries primitive boolean 1 ${testCase.booleanEntryValue}`,
    "group nullish true",
    "from entries nullish true",
    "group nullish true",
    "from entries nullish true",
    "for of invalid true",
    "for of invalid true",
    "for of invalid true",
    "",
  );
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
    "oseo-object-own-keys-property-",
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
  "generated Object own-key statics match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Object own-key statics agree",
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
            { source, sourceId: "generated-m5-object-own-keys.ts" },
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
          "one to six distinct integer, string, and symbol own properties; " +
          "enumerable and hidden descriptors; bounded integer values; zero " +
          "to five grouped values; one to four String wrapper code points; " +
          "virtual, enumerable, assigned, replaced, deleted, and " +
          "redefined String iterators ordered against a generated later " +
          "symbol, an ordinary assignment through a String wrapper, and " +
          "an ordinary assignment that replaces the virtual property in " +
          "place, each stage " +
          "cross-checked through Object.hasOwn, inherited hasOwnProperty, " +
          "propertyIsEnumerable, the in operator, and the own descriptor; " +
          "inherited Number and Boolean iterators through built-in and " +
          "generated consumers; nullish and absent-iterator failures; a " +
          "false hint and one shape-guard miss; zero to three code points, " +
          "including unpaired surrogate halves, built into an object " +
          "through Object.fromEntries with the default, own, and deleted " +
          "String iterator",
        numRuns: 16,
        profile: "M5 Object own-key statics",
        seed: 0x6000_6100,
        sizeLimit:
          "at most six own properties, five grouped values, nine static " +
          "observations, four Number iterator values, four String wrapper " +
          "code points, six String iterator observations, six String " +
          "iterator reflection observations, eleven assignment " +
          "observations, two Boolean " +
          "iterator observations, four nullish " +
          "observations, three invalid for-of observations, four " +
          "specialization observations, and three fromEntries String " +
          "code points",
        // Each case compiles and executes two specializations under
        // forced collection, so this suite is among the slowest in the
        // ordinary gate. A GitHub-hosted ubuntu-latest runner reached
        // only thirteen of the sixteen cases within 240,000 ms, which
        // extrapolates to roughly 295,000 ms for the whole suite. This
        // budget covers that runner with room for ordinary variance;
        // an interrupted suite still fails rather than passing.
        timeLimitMilliseconds: 360_000,
      },
    );
  },
);
