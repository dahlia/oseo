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
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type Entry = number | "hole";
type MutationMethod =
  | "copyWithin"
  | "fill"
  | "pop"
  | "push"
  | "reverse"
  | "shift"
  | "splice"
  | "unshift";
type ReceiverKind = "array" | "object";
type SpliceMode = "full" | "none" | "start";

interface MutationCase {
  readonly deleteCount: number;
  readonly end: number | "undefined";
  readonly entries: readonly Entry[];
  readonly items: readonly number[];
  readonly method: MutationMethod;
  readonly receiver: ReceiverKind;
  readonly spliceMode: SpliceMode;
  readonly start: number;
  readonly target: number;
}

const relativeIndexArbitrary = fc.oneof(
  fc.integer({ max: 8, min: -8 }),
  fc.constantFrom(-Infinity, -1.5, -0.5, -0, 0.5, 1.5, Infinity, NaN),
);

const caseArbitrary: fc.Arbitrary<MutationCase> = fc.record({
  deleteCount: relativeIndexArbitrary,
  end: fc.oneof(relativeIndexArbitrary, fc.constant("undefined" as const)),
  entries: fc.array(
    fc.oneof(fc.integer({ max: 4, min: -4 }), fc.constant<Entry>("hole")),
    { maxLength: 7 },
  ),
  items: fc.array(fc.integer({ max: 4, min: -4 }), { maxLength: 3 }),
  method: fc.constantFrom<MutationMethod>(
    "copyWithin",
    "fill",
    "pop",
    "push",
    "reverse",
    "shift",
    "splice",
    "unshift",
  ),
  receiver: fc.constantFrom<ReceiverKind>("array", "object"),
  spliceMode: fc.constantFrom<SpliceMode>("full", "none", "start"),
  start: relativeIndexArbitrary,
  target: relativeIndexArbitrary,
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const observedIndexLimit = 10;

function itemList(items: readonly number[]): string {
  return items.length === 0 ? "" : `, ${items.join(", ")}`;
}

function numberLiteral(value: number | "undefined"): string {
  if (value === "undefined") return value;
  if (Number.isNaN(value)) return "NaN";
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

function invocation(testCase: MutationCase): string {
  const receiver = "subject";
  switch (testCase.method) {
    case "copyWithin":
      return (
        `Array.prototype.copyWithin.call(${receiver}, ` +
        `${numberLiteral(testCase.target)}, ` +
        `${numberLiteral(testCase.start)}, ${numberLiteral(testCase.end)})`
      );
    case "fill":
      return (
        `Array.prototype.fill.call(${receiver}, 9, ` +
        `${numberLiteral(testCase.start)}, ${numberLiteral(testCase.end)})`
      );
    case "pop":
    case "reverse":
    case "shift":
      return `Array.prototype.${testCase.method}.call(${receiver})`;
    case "push":
    case "unshift":
      return (
        `Array.prototype.${testCase.method}.call(` +
        `${receiver}${itemList(testCase.items)})`
      );
    case "splice":
      if (testCase.spliceMode === "none") {
        return `Array.prototype.splice.call(${receiver})`;
      }
      if (testCase.spliceMode === "start") {
        return (
          `Array.prototype.splice.call(${receiver}, ` +
          `${numberLiteral(testCase.start)})`
        );
      }
      return (
        `Array.prototype.splice.call(${receiver}, ` +
        `${numberLiteral(testCase.start)}, ` +
        `${numberLiteral(testCase.deleteCount)}` +
        `${itemList(testCase.items)})`
      );
  }
}

function printCase(testCase: MutationCase): string {
  const subject = testCase.receiver === "array" ? "[]" : "{}";
  const assignments = testCase.entries
    .map((entry, index) =>
      entry === "hole" ? "" : `subject[${index}] = ${entry};`,
    )
    .filter((line) => line !== "")
    .join("\n");
  const resultKind =
    testCase.method === "copyWithin" ||
    testCase.method === "fill" ||
    testCase.method === "reverse"
      ? "same"
      : testCase.method === "splice"
        ? "splice"
        : "value";
  return `
const subject = ${subject};
subject.length = ${testCase.entries.length};
${assignments}
const result = ${invocation(testCase)};
console.log("result kind", "${resultKind}");
if ("${resultKind}" === "same") console.log("result", result === subject);
else if ("${resultKind}" === "splice") {
  console.log("removed length", result.length);
  for (let index = 0; index < ${observedIndexLimit}; index = index + 1) {
    const own = Object.prototype.hasOwnProperty.call(result, index);
    console.log("removed", index, own, own ? String(result[index]) : "hole");
  }
} else console.log("result", String(result));
console.log("subject length", subject.length);
for (let index = 0; index < ${observedIndexLimit}; index = index + 1) {
  const own = Object.prototype.hasOwnProperty.call(subject, index);
  console.log("subject", index, own, own ? String(subject[index]) : "hole");
}
/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayMutationPropertyMarker = 1;
  turn = turn + 1;
}
const originalIs = Object.is;
turn = 0;
while (turn < 3) {
  console.log("shape", Object.is === originalIs);
  if (turn === 1) Object.arrayMutationPropertyMarker = 1;
  turn = turn + 1;
}
`;
}

function integerOrInfinity(value: number): number {
  if (Number.isNaN(value) || value === 0) return 0;
  return Number.isFinite(value) ? Math.trunc(value) : value;
}

function relative(index: number, length: number): number {
  const integer = integerOrInfinity(index);
  return integer < 0
    ? Math.max(length + integer, 0)
    : Math.min(integer, length);
}

function cloneEntries(entries: readonly Entry[]): Entry[] {
  const result: Entry[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    result[index] = entries[index]!;
  }
  return result;
}

interface ModelResult {
  readonly entries: readonly Entry[];
  readonly removed?: readonly Entry[];
  readonly result: string;
  readonly resultKind: "same" | "splice" | "value";
}

/** Independent indexed-property model for all eight mutation methods. */
function model(testCase: MutationCase): ModelResult {
  const entries = cloneEntries(testCase.entries);
  switch (testCase.method) {
    case "push": {
      for (const item of testCase.items) entries[entries.length] = item;
      return { entries, result: String(entries.length), resultKind: "value" };
    }
    case "pop": {
      if (entries.length === 0) {
        return { entries, result: "undefined", resultKind: "value" };
      }
      const value = entries[entries.length - 1]!;
      entries.length -= 1;
      return {
        entries,
        result: value === "hole" ? "undefined" : String(value),
        resultKind: "value",
      };
    }
    case "shift": {
      if (entries.length === 0) {
        return { entries, result: "undefined", resultKind: "value" };
      }
      const value = entries[0]!;
      for (let index = 1; index < entries.length; index += 1) {
        entries[index - 1] = entries[index]!;
      }
      entries.length -= 1;
      return {
        entries,
        result: value === "hole" ? "undefined" : String(value),
        resultKind: "value",
      };
    }
    case "unshift": {
      const oldLength = entries.length;
      const count = testCase.items.length;
      entries.length = oldLength + count;
      for (let index = oldLength; index > 0; index -= 1) {
        entries[index + count - 1] = entries[index - 1]!;
      }
      for (let index = 0; index < count; index += 1) {
        entries[index] = testCase.items[index]!;
      }
      return { entries, result: String(entries.length), resultKind: "value" };
    }
    case "reverse": {
      const middle = Math.floor(entries.length / 2);
      for (let lower = 0; lower < middle; lower += 1) {
        const upper = entries.length - lower - 1;
        const value = entries[lower]!;
        entries[lower] = entries[upper]!;
        entries[upper] = value;
      }
      return { entries, result: "true", resultKind: "same" };
    }
    case "fill": {
      const start = relative(testCase.start, entries.length);
      const end =
        testCase.end === "undefined"
          ? entries.length
          : relative(testCase.end, entries.length);
      for (let index = start; index < end; index += 1) entries[index] = 9;
      return { entries, result: "true", resultKind: "same" };
    }
    case "copyWithin": {
      let target = relative(testCase.target, entries.length);
      let source = relative(testCase.start, entries.length);
      const final =
        testCase.end === "undefined"
          ? entries.length
          : relative(testCase.end, entries.length);
      let count = Math.min(final - source, entries.length - target);
      let direction = 1;
      if (source < target && target < source + count) {
        direction = -1;
        source += count - 1;
        target += count - 1;
      }
      while (count > 0) {
        entries[target] = entries[source]!;
        source += direction;
        target += direction;
        count -= 1;
      }
      return { entries, result: "true", resultKind: "same" };
    }
    case "splice": {
      const oldLength = entries.length;
      const start =
        testCase.spliceMode === "none"
          ? 0
          : relative(testCase.start, entries.length);
      const deleteCount =
        testCase.spliceMode === "none"
          ? 0
          : testCase.spliceMode === "start"
            ? entries.length - start
            : Math.min(
                Math.max(integerOrInfinity(testCase.deleteCount), 0),
                entries.length - start,
              );
      const items = testCase.spliceMode === "full" ? testCase.items : [];
      const removed: Entry[] = [];
      removed.length = deleteCount;
      for (let index = 0; index < deleteCount; index += 1) {
        removed[index] = entries[start + index]!;
      }
      if (items.length < deleteCount) {
        for (
          let index = start;
          index < entries.length - deleteCount;
          index += 1
        ) {
          entries[index + items.length] = entries[index + deleteCount]!;
        }
      } else if (items.length > deleteCount) {
        entries.length = oldLength - deleteCount + items.length;
        for (let index = oldLength - deleteCount; index > start; index -= 1) {
          entries[index + items.length - 1] = entries[index + deleteCount - 1]!;
        }
      }
      entries.length = oldLength - deleteCount + items.length;
      for (let index = 0; index < items.length; index += 1) {
        entries[start + index] = items[index]!;
      }
      return {
        entries,
        removed,
        result: "",
        resultKind: "splice",
      };
    }
  }
}

function printEntries(
  lines: string[],
  label: "removed" | "subject",
  entries: readonly Entry[],
): void {
  for (let index = 0; index < observedIndexLimit; index += 1) {
    const within = index < entries.length;
    const value = within ? entries[index]! : "hole";
    lines.push(
      `${label} ${index} ${String(within && value !== "hole")} ` +
        `${within && value !== "hole" ? value : "hole"}`,
    );
  }
}

function expected(testCase: MutationCase): string {
  const result = model(testCase);
  const lines = [`result kind ${result.resultKind}`];
  if (result.resultKind === "splice") {
    lines.push(`removed length ${result.removed!.length}`);
    printEntries(lines, "removed", result.removed!);
  } else {
    lines.push(`result ${result.result}`);
  }
  lines.push(`subject length ${result.entries.length}`);
  printEntries(lines, "subject", result.entries);
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
    "oseo-array-mutation-property-",
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
  "generated Array mutation methods match the indexed-property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Array mutation methods agree",
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
            { source, sourceId: "generated-m5-array-mutation.ts" },
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
                toolchain: zigToolchain,
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
          "push, pop, shift, unshift, splice, fill, copyWithin, and " +
          "reverse over zero to seven sparse Array or ordinary " +
          "array-like entries, zero to three inserted integers, bounded " +
          "integer, fractional, infinite, NaN, signed-zero, and explicit " +
          "undefined relative indices, every splice argument-count mode, " +
          "false " +
          "hints, and a deliberate shape-guard miss",
        numRuns: 12,
        profile: "M5 Array prototype mutation",
        seed: 0x6000_5c00,
        sizeLimit:
          "at most seven source indices, three inserted values, ten " +
          "printed result indices, ten printed receiver indices, and " +
          "eight hint or guard observations",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
