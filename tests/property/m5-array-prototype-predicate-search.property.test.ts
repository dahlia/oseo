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

type EntryKind = number | "hole" | "undefined";
type ReceiverKind = "array" | "object";
type SearchMethod = "find" | "findIndex" | "findLast" | "findLastIndex";
type ThisKind = "none" | "object";

interface SearchCase {
  readonly entries: readonly EntryKind[];
  readonly method: SearchMethod;
  readonly receiver: ReceiverKind;
  readonly thisArgument: ThisKind;
  /** The smallest number the predicate accepts; 4 accepts nothing. */
  readonly threshold: number;
}

const caseArbitrary: fc.Arbitrary<SearchCase> = fc.record({
  entries: fc.array(
    fc.oneof(
      fc.integer({ max: 3, min: 0 }),
      fc.constant<EntryKind>("hole"),
      fc.constant<EntryKind>("undefined"),
    ),
    { maxLength: 6 },
  ),
  method: fc.constantFrom<SearchMethod>(
    "find",
    "findIndex",
    "findLast",
    "findLastIndex",
  ),
  receiver: fc.constantFrom<ReceiverKind>("array", "object"),
  thisArgument: fc.constantFrom<ThisKind>("none", "object"),
  threshold: fc.integer({ max: 4, min: 0 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printCase(testCase: SearchCase): string {
  const subject = testCase.receiver === "array" ? "[]" : "{}";
  const assignments = testCase.entries
    .map((entry, index) => {
      if (entry === "hole") return "";
      if (entry === "undefined") return `subject[${index}] = undefined;`;
      return `subject[${index}] = ${entry};`;
    })
    .filter((line) => line !== "")
    .join("\n");
  const thisArgument =
    testCase.thisArgument === "object" ? ",\n    thisArgument," : "";
  return `
const subject = ${subject};
subject.length = ${testCase.entries.length};
${assignments}
Object.defineProperty(subject, "constructor", {
  get() { console.log("constructor"); return Array; },
});
const thisArgument = { tag: "this" };
let calls = 0;
const predicate = function (value, index, source) {
  calls = calls + 1;
  console.log(
    "call",
    index,
    String(value),
    source === subject,
    this === thisArgument,
  );
  return typeof value === "number" && value >= ${testCase.threshold};
};
try {
  const result = Array.prototype.${testCase.method}.call(
    subject,
    predicate${thisArgument}
  );
  console.log("result", String(result));
} catch (error) {
  console.log("type error", error instanceof TypeError);
}
console.log("calls", calls);
/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayPredicateSearchPropertyMarker = 1;
  turn = turn + 1;
}
const originalIs = Object.is;
turn = 0;
while (turn < 3) {
  console.log("shape", Object.is === originalIs);
  if (turn === 1) Object.arrayPredicateSearchPropertyMarker = 1;
  turn = turn + 1;
}
`;
}

function entryText(entry: EntryKind): string {
  return entry === "hole" || entry === "undefined"
    ? "undefined"
    : String(entry);
}

function accepted(entry: EntryKind, threshold: number): boolean {
  return entry !== "hole" && entry !== "undefined" && entry >= threshold;
}

/**
 * The independent model of the predicate loop: traversal order is
 * ascending for find and findIndex and descending for findLast and
 * findLastIndex, every index below the length is visited because each
 * element is read with Get rather than filtered through HasProperty, so
 * a hole is observed as undefined, and the first truthy predicate result
 * stops the loop with the element or its index. An exhausted loop yields
 * undefined or -1. The trace is replayed here rather than delegated to a
 * host search call.
 */
function expected(testCase: SearchCase): string {
  const lines: string[] = [];
  const indices = testCase.entries.map((_, index) => index);
  const fromLast =
    testCase.method === "findLast" || testCase.method === "findLastIndex";
  const wantsIndex =
    testCase.method === "findIndex" || testCase.method === "findLastIndex";
  if (fromLast) indices.reverse();
  const hasThis = testCase.thisArgument === "object";
  let calls = 0;
  let result = wantsIndex ? "-1" : "undefined";
  for (const index of indices) {
    const entry = testCase.entries[index]!;
    calls += 1;
    lines.push(`call ${index} ${entryText(entry)} true ${hasThis}`);
    if (accepted(entry, testCase.threshold)) {
      result = wantsIndex ? String(index) : entryText(entry);
      break;
    }
  }
  lines.push(
    `result ${result}`,
    `calls ${calls}`,
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
    "oseo-array-predicate-search-property-",
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
  "generated Array predicate search methods match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Array predicate search methods agree",
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
            {
              source,
              sourceId: "generated-m5-array-predicate-search.ts",
            },
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
          "find, findIndex, findLast, and findLastIndex over zero to six " +
          "sparse array or ordinary array-like entries that are a small " +
          "integer, an explicit undefined, or a hole; a numeric threshold " +
          "the predicate accepts or a threshold nothing reaches; an " +
          "omitted or object this argument; a traced predicate observing " +
          "element, index, receiver identity, and its this value; a " +
          "constructor read that no method may perform; false hints and a " +
          "deliberate shape-guard miss",
        numRuns: 12,
        profile: "M5 Array prototype predicate search",
        seed: 0x6000_6000,
        sizeLimit:
          "at most six source indices, one traced line per predicate " +
          "call, and eight hint or guard observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
