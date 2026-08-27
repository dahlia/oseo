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

type ValueKind =
  | "bigint"
  | "boolean"
  | "null"
  | "number"
  | "object"
  | "string"
  | "symbol";

type EntryMode = "abrupt-value" | "data" | "mixed" | "non-object";

type EntryKey = "3" | "7" | "alpha" | "omega";

type PrototypeKind = "invalid-number" | "invalid-string" | "null" | "object";

type PropertiesKind = "entries" | "null" | "undefined";

interface CreateEntry {
  readonly hasConfigurable: boolean;
  readonly hasEnumerable: boolean;
  readonly hasValue: boolean;
  readonly hasWritable: boolean;
  readonly key: EntryKey;
  readonly mode: EntryMode;
  readonly nextBoolean: boolean;
  readonly nextNumber: number;
  readonly nextText: "a" | "beta" | "z";
  readonly valueKind: ValueKind;
}

interface CreateCase {
  readonly entries: readonly CreateEntry[];
  readonly falseHint: boolean;
  readonly propertiesKind: PropertiesKind;
  readonly prototypeKind: PrototypeKind;
}

interface ModeledValue {
  readonly identity: boolean;
  readonly type: string;
}

interface ModeledDescriptor {
  readonly configurable: boolean;
  readonly enumerable: boolean;
  readonly valueIdentity: boolean;
  readonly valueType: string;
  readonly writable: boolean;
}

const entryArbitrary: fc.Arbitrary<CreateEntry> = fc.record({
  hasConfigurable: fc.boolean(),
  hasEnumerable: fc.boolean(),
  hasValue: fc.boolean(),
  hasWritable: fc.boolean(),
  key: fc.constantFrom("3", "7", "alpha", "omega"),
  mode: fc.constantFrom("data", "data", "mixed", "abrupt-value", "non-object"),
  nextBoolean: fc.boolean(),
  nextNumber: fc.integer({ max: 100, min: -100 }),
  nextText: fc.constantFrom("a", "beta", "z"),
  valueKind: fc.constantFrom(
    "number",
    "string",
    "boolean",
    "null",
    "bigint",
    "symbol",
    "object",
  ),
});

const caseArbitrary: fc.Arbitrary<CreateCase> = fc.record({
  entries: fc.uniqueArray(entryArbitrary, {
    maxLength: 3,
    minLength: 1,
    selector: (entry) => entry.key,
  }),
  falseHint: fc.boolean(),
  propertiesKind: fc.constantFrom(
    "entries",
    "entries",
    "entries",
    "undefined",
    "null",
  ),
  prototypeKind: fc.constantFrom(
    "object",
    "object",
    "null",
    "invalid-number",
    "invalid-string",
  ),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function valueSource(entry: CreateEntry): string {
  switch (entry.valueKind) {
    case "bigint":
      return `${Math.abs(entry.nextNumber)}n`;
    case "boolean":
      return String(entry.nextBoolean);
    case "null":
      return "null";
    case "number":
      return String(entry.nextNumber);
    case "object":
      return `{ marker: ${entry.nextNumber} }`;
    case "string":
      return JSON.stringify(entry.nextText);
    case "symbol":
      return `Symbol(${JSON.stringify(entry.nextText)})`;
  }
}

function prototypeSource(kind: PrototypeKind): string {
  switch (kind) {
    case "invalid-number":
      return "9";
    case "invalid-string":
      return '"proto"';
    case "null":
      return "null";
    case "object":
      return "{ alpha: 41, zeta: 55 }";
  }
}

function fieldGetter(
  key: EntryKey,
  name: string,
  value: string,
  abrupt = false,
): string {
  const label = `${key}:${name}`;
  const body = abrupt ? `throw new RangeError("value");` : `return ${value};`;
  return `
    get ${name}() {
      order.push(${JSON.stringify(label)});
      ${body}
    },`;
}

function entrySource(entry: CreateEntry, index: number): string {
  if (entry.mode === "non-object") return String(entry.nextNumber);
  const fields = [
    entry.hasEnumerable
      ? fieldGetter(entry.key, "enumerable", String(entry.nextBoolean))
      : "",
    entry.hasConfigurable
      ? fieldGetter(entry.key, "configurable", String(!entry.nextBoolean))
      : "",
    entry.hasValue || entry.mode !== "data"
      ? fieldGetter(
          entry.key,
          "value",
          `nextValue${index}`,
          entry.mode === "abrupt-value",
        )
      : "",
    entry.hasWritable
      ? fieldGetter(entry.key, "writable", String(entry.nextBoolean))
      : "",
    entry.mode === "mixed"
      ? fieldGetter(entry.key, "get", "function () { return 1; }")
      : "",
  ].join("");
  return `{${fields}\n  }`;
}

function printCase(testCase: CreateCase): string {
  const values = testCase.entries
    .map((entry, index) => `const nextValue${index} = ${valueSource(entry)};`)
    .join("\n");
  const properties = testCase.entries
    .map(
      (entry, index) =>
        `  ${JSON.stringify(entry.key)}: ${entrySource(entry, index)},`,
    )
    .join("\n");
  const propertiesArgument =
    testCase.propertiesKind === "entries"
      ? "props"
      : testCase.propertiesKind === "null"
        ? "null"
        : "undefined";
  const observations = testCase.entries
    .map((entry, index) => {
      const key = JSON.stringify(entry.key);
      return `
const observed${index} = Object.getOwnPropertyDescriptor(created, ${key});
if (observed${index} === undefined) {
  console.log("descriptor", ${key}, "absent");
} else {
  console.log(
    "descriptor",
    ${key},
    typeof observed${index}.value,
    observed${index}.value === nextValue${index},
    observed${index}.writable,
    observed${index}.enumerable,
    observed${index}.configurable,
  );
}`;
    })
    .join("\n");
  const falseHintEntry = testCase.entries[0];
  const hintedArgument = testCase.falseHint
    ? JSON.stringify(falseHintEntry?.nextText ?? "a")
    : String(falseHintEntry?.nextNumber ?? 0);
  return `
const prototype = ${prototypeSource(testCase.prototypeKind)};
const order = [];
${values}
const props = {
${properties}
};
let created;
let outcome = "ok";
try {
  created = Object.create(prototype, ${propertiesArgument});
} catch (error) {
  outcome = error.name;
}
console.log("outcome", outcome);
console.log("order", order.length);
for (let index = 0; index < order.length; index = index + 1) {
  console.log("read", order[index]);
}
if (created === undefined) {
  console.log("created absent");
} else {
  console.log(
    "created",
    Object.getPrototypeOf(created) === prototype,
    created.zeta,
    "alpha" in created,
  );
${observations}
}
function hinted(value: number) { return value + 1; }
console.log("hint", hinted(${hintedArgument}));
let turn = 0;
while (turn < 3) {
  const allocated = Object.create(null, {
    value: { configurable: true, value: { turn } },
  });
  if (turn === 0) Object.createMarker = true;
  console.log("guard", allocated.value.turn);
  turn = turn + 1;
}
`;
}

/** The props object's own enumerable keys in ordinary own-key order. */
function orderedEntries(testCase: CreateCase): readonly CreateEntry[] {
  const indexEntries = testCase.entries
    .filter((entry) => entry.key === "3" || entry.key === "7")
    .toSorted((left, right) => Number(left.key) - Number(right.key));
  const stringEntries = testCase.entries.filter(
    (entry) => entry.key !== "3" && entry.key !== "7",
  );
  return [...indexEntries, ...stringEntries];
}

/** The field reads one entry's ToPropertyDescriptor performs. */
function entryReads(entry: CreateEntry): readonly string[] {
  if (entry.mode === "non-object") return [];
  const reads: string[] = [];
  if (entry.hasEnumerable) reads.push(`${entry.key}:enumerable`);
  if (entry.hasConfigurable) reads.push(`${entry.key}:configurable`);
  if (entry.hasValue || entry.mode !== "data") reads.push(`${entry.key}:value`);
  if (entry.mode === "abrupt-value") return reads;
  if (entry.hasWritable) reads.push(`${entry.key}:writable`);
  if (entry.mode === "mixed") reads.push(`${entry.key}:get`);
  return reads;
}

/** Whether one entry's conversion completes the collection pass. */
function entryConverts(entry: CreateEntry): boolean {
  return entry.mode === "data";
}

function modeledValue(entry: CreateEntry): ModeledValue {
  switch (entry.valueKind) {
    case "bigint":
      return { identity: true, type: "bigint" };
    case "boolean":
      return { identity: true, type: "boolean" };
    case "null":
      return { identity: true, type: "object" };
    case "number":
      return { identity: true, type: "number" };
    case "object":
      return { identity: true, type: "object" };
    case "string":
      return { identity: true, type: "string" };
    case "symbol":
      return { identity: true, type: "symbol" };
  }
}

/**
 * The observed descriptor for one entry on the freshly created target.
 * Definitions on a fresh extensible object never fail, so an entry is
 * either applied with its converted fields over all-false defaults or
 * absent because an earlier collection abrupt discarded the target.
 */
function modeledDescriptor(
  entry: CreateEntry,
  applied: boolean,
): ModeledDescriptor | undefined {
  if (!applied) return undefined;
  const value = entry.hasValue
    ? modeledValue(entry)
    : { identity: false, type: "undefined" };
  return {
    configurable: entry.hasConfigurable ? !entry.nextBoolean : false,
    enumerable: entry.hasEnumerable ? entry.nextBoolean : false,
    valueIdentity: value.identity,
    valueType: value.type,
    writable: entry.hasWritable ? entry.nextBoolean : false,
  };
}

function expected(testCase: CreateCase): string {
  const invalidPrototype =
    testCase.prototypeKind === "invalid-number" ||
    testCase.prototypeKind === "invalid-string";
  const ordered = orderedEntries(testCase);
  const reads: string[] = [];
  let outcome = "ok";
  if (invalidPrototype || testCase.propertiesKind === "null") {
    outcome = "TypeError";
  } else if (testCase.propertiesKind === "entries") {
    for (const entry of ordered) {
      reads.push(...entryReads(entry));
      if (entryConverts(entry)) continue;
      outcome = entry.mode === "abrupt-value" ? "RangeError" : "TypeError";
      break;
    }
  }
  const applied = outcome === "ok" && testCase.propertiesKind === "entries";
  const lines = [`outcome ${outcome}`, `order ${reads.length}`];
  for (const read of reads) lines.push(`read ${read}`);
  if (outcome !== "ok") {
    lines.push("created absent");
  } else {
    const objectPrototype = testCase.prototypeKind === "object";
    const ownAlpha =
      applied && testCase.entries.some((entry) => entry.key === "alpha");
    lines.push(
      `created true ${objectPrototype ? "55" : "undefined"} ` +
        `${objectPrototype || ownAlpha}`,
    );
    for (const entry of testCase.entries) {
      const descriptor = modeledDescriptor(entry, applied);
      lines.push(
        descriptor == null
          ? `descriptor ${entry.key} absent`
          : `descriptor ${entry.key} ${descriptor.valueType} ` +
              `${descriptor.valueIdentity} ${descriptor.writable} ` +
              `${descriptor.enumerable} ${descriptor.configurable}`,
      );
    }
  }
  const falseHintEntry = testCase.entries[0];
  const hint = testCase.falseHint
    ? `${falseHintEntry?.nextText ?? "a"}1`
    : String((falseHintEntry?.nextNumber ?? 0) + 1);
  lines.push(`hint ${hint}`, "guard 0", "guard 1", "guard 2", "");
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
  const directory = await host.makeTemporaryDirectory("oseo-object-create-");
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(sourcePath, source);
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
  "generated Object.create operations match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "prototype selection and descriptor collection agree",
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
            { source, sourceId: "generated-object-create.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /property-get method lookup/u);
          } else {
            assert.doesNotMatch(mir, /guard-shape/u);
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
          "null, object, and two invalid prototypes ahead of an entries, " +
          "undefined, or null properties argument, one to three unique " +
          "integer and string props keys in every literal order, every " +
          "independently optional data descriptor field, seven admitted " +
          "value families, abrupt field getters, mixed and non-object " +
          "descriptors at any collection position, truthful or false " +
          "numeric hints, both specialization policies, one Object shape " +
          "invalidation, and forced collection at every safepoint",
        numRuns: 12,
        profile: "M5 Object.create",
        seed: 0x6000_5400,
        sizeLimit:
          "at most three collected descriptors with at most five observed " +
          "fields each, one bounded value per descriptor, three guarded " +
          "creations, and one bounded numeric or string hint",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
