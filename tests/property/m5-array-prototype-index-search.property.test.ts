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

type EntryKind =
  | "hole"
  | "nan"
  | "negative"
  | "other"
  | "shared"
  | "text"
  | "undefined"
  | "zero";
type SearchKind = Exclude<EntryKind, "hole"> | "fresh";
type IndexMethod = "at" | "includes" | "indexOf" | "lastIndexOf";
type ReceiverKind = "array" | "object";

interface IndexSearchCase {
  readonly entries: readonly EntryKind[];
  readonly index: number;
  readonly method: IndexMethod;
  readonly receiver: ReceiverKind;
  readonly search: SearchKind;
}

const indexValues = [
  -Infinity,
  -7,
  -2,
  -1.5,
  -1,
  -0.5,
  0,
  0.5,
  1,
  1.5,
  2,
  7,
  Infinity,
] as const;

const caseArbitrary: fc.Arbitrary<IndexSearchCase> = fc.record({
  entries: fc.array(
    fc.constantFrom<EntryKind>(
      "hole",
      "nan",
      "negative",
      "other",
      "shared",
      "text",
      "undefined",
      "zero",
    ),
    { maxLength: 7 },
  ),
  index: fc.constantFrom<number>(...indexValues),
  method: fc.constantFrom<IndexMethod>(
    "at",
    "includes",
    "indexOf",
    "lastIndexOf",
  ),
  receiver: fc.constantFrom<ReceiverKind>("array", "object"),
  search: fc.constantFrom<SearchKind>(
    "nan",
    "negative",
    "other",
    "shared",
    "text",
    "undefined",
    "zero",
    "fresh",
  ),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const expressions = {
  fresh: "{}",
  hole: "undefined",
  nan: "NaN",
  negative: "-2",
  other: "other",
  shared: "shared",
  text: '"x"',
  undefined: "undefined",
  zero: "0",
} satisfies Readonly<Record<EntryKind | SearchKind, string>>;

function printCase(testCase: IndexSearchCase): string {
  const subject = testCase.receiver === "array" ? "[]" : "{}";
  const assignments = testCase.entries
    .map((entry, index) =>
      entry === "hole" ? "" : `subject[${index}] = ${expressions[entry]};`,
    )
    .filter((line) => line !== "")
    .join("\n");
  const callArguments =
    testCase.method === "at"
      ? String(testCase.index)
      : `${expressions[testCase.search]}, ${String(testCase.index)}`;
  return `
const shared = { name: "shared" };
const other = { name: "other" };
const subject = ${subject};
subject.length = ${testCase.entries.length};
${assignments}
Object.defineProperty(subject, "constructor", {
  get() { console.log("constructor"); return Array; },
});
const result = Array.prototype.${testCase.method}.call(
  subject,
  ${callArguments},
);
if (result !== result) console.log("result NaN");
else if (result === shared) console.log("result shared");
else if (result === other) console.log("result other");
else if (${
    testCase.method === "indexOf" || testCase.method === "lastIndexOf"
  } && result === 0) {
  console.log("result", String(result), "reciprocal", String(1 / result));
}
else console.log("result", String(result));
/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayIndexSearchPropertyMarker = 1;
  turn = turn + 1;
}
const originalIs = Object.is;
turn = 0;
while (turn < 3) {
  console.log("shape", Object.is === originalIs);
  if (turn === 1) Object.arrayIndexSearchPropertyMarker = 1;
  turn = turn + 1;
}
`;
}

function entryText(entry: EntryKind): string {
  if (entry === "nan") return "NaN";
  if (entry === "negative") return "-2";
  if (entry === "text") return "x";
  if (entry === "zero") return "0";
  return entry;
}

function equal(left: EntryKind, right: SearchKind, zero: boolean): boolean {
  if (left === "hole") return zero && right === "undefined";
  if (left === "nan" || right === "nan") {
    return zero && left === "nan" && right === "nan";
  }
  if (left === "shared" || left === "other") return left === right;
  if (right === "shared" || right === "other" || right === "fresh") {
    return false;
  }
  return entryText(left) === entryText(right);
}

function startIndex(testCase: IndexSearchCase): number {
  const length = testCase.entries.length;
  const truncated = Math.trunc(testCase.index);
  const relative = truncated === 0 ? 0 : truncated;
  if (testCase.method === "at") {
    return relative >= 0 ? relative : length + relative;
  }
  if (testCase.method === "lastIndexOf") {
    return relative >= 0 ? Math.min(relative, length - 1) : length + relative;
  }
  return relative >= 0 ? relative : Math.max(length + relative, 0);
}

/** Independent relative-index and comparison oracle for the four methods. */
function expected(testCase: IndexSearchCase): string {
  const length = testCase.entries.length;
  const index = startIndex(testCase);
  let rendered: string;
  if (testCase.method === "at") {
    const entry =
      index >= 0 && index < length ? testCase.entries[index]! : "undefined";
    rendered = entry === "hole" ? "undefined" : entryText(entry);
  } else {
    const fromRight = testCase.method === "lastIndexOf";
    const sameValueZero = testCase.method === "includes";
    let found = -1;
    for (
      let cursor = index;
      fromRight ? cursor >= 0 : cursor < length;
      cursor += fromRight ? -1 : 1
    ) {
      const entry = testCase.entries[cursor]!;
      if (equal(entry, testCase.search, sameValueZero)) {
        found = cursor;
        break;
      }
    }
    if (
      (testCase.method === "indexOf" || testCase.method === "lastIndexOf") &&
      found === 0
    ) {
      rendered = "0 reciprocal Infinity";
    } else {
      rendered =
        testCase.method === "includes" ? String(found >= 0) : String(found);
    }
  }
  return [
    `result ${rendered}`,
    "hint h",
    "false hint m",
    "guard g",
    "guard g",
    "guard g",
    "shape true",
    "shape true",
    "shape true",
    "",
  ].join("\n");
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory(
    "oseo-array-index-search-property-",
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
  "generated Array index search methods match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Array index search methods agree",
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
            { source, sourceId: "generated-m5-array-index-search.ts" },
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
          "at, includes, indexOf, and lastIndexOf over zero to seven " +
          "sparse Array or ordinary array-like entries drawn from NaN, " +
          "zero, a bounded integer, a string, undefined, and two stable " +
          "object identities; matching or fresh search values; and finite " +
          "or infinite integer and fractional positive and negative relative " +
          "indices, plus false " +
          "hints and a deliberate shape-guard miss",
        numRuns: 12,
        profile: "M5 Array prototype index search",
        seed: 0x6000_5900,
        sizeLimit:
          "at most seven source indices, one method result, and eight hint " +
          "or guard observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
