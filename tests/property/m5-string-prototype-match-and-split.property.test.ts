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

type ReceiverKind = "object" | "primitive" | "wrapper";

interface MatchAndSplitCase {
  readonly limit: number;
  readonly receiver: ReceiverKind;
  readonly searchUnits: readonly number[];
  readonly subjectUnits: readonly number[];
}

const unitsArbitrary = fc.array(
  fc.constantFrom(0x2d, 0x61, 0x62, 0x2665, 0xd800),
  { maxLength: 6 },
);

const caseArbitrary: fc.Arbitrary<MatchAndSplitCase> = fc.record({
  limit: fc.integer({ max: 7, min: 0 }),
  receiver: fc.constantFrom<ReceiverKind>("primitive", "wrapper", "object"),
  searchUnits: fc.array(fc.constantFrom(0x2d, 0x61, 0x62, 0x2665, 0xd800), {
    maxLength: 3,
  }),
  subjectUnits: unitsArbitrary,
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function matchesAt(
  subject: readonly number[],
  search: readonly number[],
  position: number,
): boolean {
  if (position + search.length > subject.length) return false;
  return search.every((unit, index) => subject[position + index] === unit);
}

function firstMatch(
  subject: readonly number[],
  search: readonly number[],
  start: number,
): number {
  for (let index = start; index <= subject.length - search.length; index += 1) {
    if (matchesAt(subject, search, index)) return index;
  }
  return -1;
}

function allMatches(
  subject: readonly number[],
  search: readonly number[],
): readonly number[] {
  const positions: number[] = [];
  let next = 0;
  while (next <= subject.length) {
    const position = firstMatch(subject, search, next);
    if (position < 0) break;
    positions.push(position);
    if (search.length === 0) {
      if (position === subject.length) break;
      next = position + 1;
    } else {
      next = position + search.length;
    }
  }
  return positions;
}

function splitUnits(
  subject: readonly number[],
  search: readonly number[],
  limit: number,
): readonly (readonly number[])[] {
  if (limit === 0) return [];
  if (subject.length === 0) return search.length === 0 ? [] : [[]];
  if (search.length === 0) {
    return subject.slice(0, limit).map((unit) => [unit]);
  }
  const pieces: (readonly number[])[] = [];
  let start = 0;
  while (pieces.length < limit) {
    const position = firstMatch(subject, search, start);
    if (position < 0) break;
    pieces.push(subject.slice(start, position));
    start = position + search.length;
  }
  if (pieces.length < limit) pieces.push(subject.slice(start));
  return pieces;
}

function receiverExpression(kind: ReceiverKind): string {
  if (kind === "primitive") return "subject";
  if (kind === "wrapper") return "new String(subject)";
  return "({ toString() { return subject; } })";
}

function printCase(testCase: MatchAndSplitCase): string {
  return `
const subject = String.fromCharCode(${testCase.subjectUnits.join(", ")});
const needle = String.fromCharCode(${testCase.searchUnits.join(", ")});
const receiver = ${receiverExpression(testCase.receiver)};
const limit = ${testCase.limit};
function render(values) {
  let result = "";
  for (let index = 0; index < values.length; index = index + 1) {
    if (index !== 0) result = result + "|";
    const value = values[index];
    for (let unit = 0; unit < value.length; unit = unit + 1) {
      if (unit !== 0) result = result + ".";
      result = result + value.charCodeAt(unit);
    }
  }
  return result;
}
const matched = String.prototype.match.call(receiver, needle);
console.log(
  "match",
  matched === null ? -1 : matched.index,
  matched === null ? false : matched[0] === needle,
  matched === null ? false : matched.input === subject,
);
console.log("search", String.prototype.search.call(receiver, needle));
let matchIndexes = "";
for (const item of String.prototype.matchAll.call(receiver, needle)) {
  if (matchIndexes !== "") matchIndexes = matchIndexes + ",";
  matchIndexes = matchIndexes + item.index;
}
console.log("matchAll", matchIndexes);
console.log(
  "split",
  render(String.prototype.split.call(receiver, needle, limit)),
);
const nullProtocolMatch = String.prototype.match.call(
  receiver,
  { [Symbol.match]: null, toString() { return needle; } },
);
console.log(
  "null protocol",
  nullProtocolMatch === null ? -1 : nullProtocolMatch.index,
  String.prototype.search.call(
    receiver,
    { [Symbol.search]: null, toString() { return needle; } },
  ),
);

for (const entry of [
  ["match", Symbol.match],
  ["matchAll", Symbol.matchAll],
  ["search", Symbol.search],
  ["split", Symbol.split],
]) {
  const name = entry[0];
  const symbol = entry[1];
  let calls = 0;
  const protocol = {
    [symbol](...args) {
      calls = calls + 1;
      return this === protocol && args[0] === receiver &&
        (name !== "split" || args[1] === limit);
    },
  };
  console.log(
    "protocol",
    name,
    String.prototype[name].call(receiver, protocol, limit),
    calls,
  );
}

/** @param {string} value */
function hinted(value) { return value.split(needle, limit); }
console.log("hint", render(hinted(subject)));
console.log("false hint", render(hinted(new String(subject))));
console.log("guard", render(hinted(subject)));
String.prototype.matchSplitPropertyMarker = 1;
console.log("guard", render(hinted(subject)));
`;
}

function expectedObservation(testCase: MatchAndSplitCase): {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
} {
  const first = firstMatch(testCase.subjectUnits, testCase.searchUnits, 0);
  const positions = allMatches(testCase.subjectUnits, testCase.searchUnits);
  const pieces = splitUnits(
    testCase.subjectUnits,
    testCase.searchUnits,
    testCase.limit,
  ).map((piece) => piece.join("."));
  return {
    exitStatus: 0,
    stderr: "",
    stdout: [
      `match ${first} ${first >= 0} ${first >= 0}`,
      `search ${first}`,
      `matchAll ${positions.join(",")}`,
      `split ${pieces.join("|")}`,
      `null protocol ${first} ${first}`,
      "protocol match true 1",
      "protocol matchAll true 1",
      "protocol search true 1",
      "protocol split true 1",
      `hint ${pieces.join("|")}`,
      `false hint ${pieces.join("|")}`,
      `guard ${pieces.join("|")}`,
      `guard ${pieces.join("|")}`,
      "",
    ].join("\n"),
  };
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory("oseo-string-match-");
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
  "generated String match and split methods agree with the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "String symbol dispatch and string fallbacks agree",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expected = expectedObservation(testCase);
        assertMatchingObservations([expected, ...(await references(source))]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-string-match.ts" },
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
                assertMatchingObservations([expected, native]);
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
          "zero to six UTF-16 subject code units and zero to three literal " +
          "search code units; primitive, wrapper, and generic receivers; " +
          "zero to seven split limits; null match and search methods; all " +
          "four custom symbol methods; a false hint and shape-guard miss",
        numRuns: 12,
        profile: "M5 String prototype match and split",
        seed: 0x6000_4500,
        sizeLimit:
          "at most six subject units, three search units, one receiver, one " +
          "limit, five fallback observations, four dispatch observations, " +
          "two hint classes, and one prototype shape change",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
