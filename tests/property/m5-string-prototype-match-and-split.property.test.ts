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
        seed: 0x6000_4600,
        sizeLimit:
          "at most six subject units, three search units, one receiver, one " +
          "limit, five fallback observations, four dispatch observations, " +
          "two hint classes, and one prototype shape change",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

type FallbackPattern = "digit" | "dot" | "empty" | "escaped-dot" | "mixed";

interface RegExpFallbackCase {
  readonly pattern: FallbackPattern;
  readonly subjectUnits: readonly number[];
}

const regexpFallbackArbitrary: fc.Arbitrary<RegExpFallbackCase> = fc.record({
  pattern: fc.constantFrom<FallbackPattern>(
    "digit",
    "dot",
    "empty",
    "escaped-dot",
    "mixed",
  ),
  subjectUnits: fc.array(
    fc.constantFrom(0x0a, 0x2e, 0x31, 0x61, 0x62, 0xd83d, 0xde00),
    { maxLength: 7 },
  ),
});

function fallbackPatternText(pattern: FallbackPattern): string {
  if (pattern === "digit") return "\\d";
  if (pattern === "dot") return ".";
  if (pattern === "escaped-dot") return "\\.";
  if (pattern === "mixed") return "a.b";
  return "";
}

function fallbackPatternMatchesAt(
  testCase: RegExpFallbackCase,
  position: number,
): number {
  const units = testCase.subjectUnits;
  if (testCase.pattern === "empty") return 0;
  if (testCase.pattern === "dot") {
    return position < units.length && units[position] !== 0x0a ? 1 : -1;
  }
  if (testCase.pattern === "escaped-dot") {
    return units[position] === 0x2e ? 1 : -1;
  }
  if (testCase.pattern === "digit") {
    const unit = units[position];
    return unit != null && unit >= 0x30 && unit <= 0x39 ? 1 : -1;
  }
  return position + 3 <= units.length &&
    units[position] === 0x61 &&
    units[position + 2] === 0x62 &&
    units[position + 1] !== 0x0a
    ? 3
    : -1;
}

function fallbackPatternMatches(
  testCase: RegExpFallbackCase,
): readonly { readonly length: number; readonly position: number }[] {
  const matches: { length: number; position: number }[] = [];
  let next = 0;
  while (next <= testCase.subjectUnits.length) {
    let found = false;
    for (
      let position = next;
      position <= testCase.subjectUnits.length;
      position += 1
    ) {
      const length = fallbackPatternMatchesAt(testCase, position);
      if (length < 0) continue;
      matches.push({ length, position });
      next = length === 0 ? position + 1 : position + length;
      found = true;
      break;
    }
    if (!found || next > testCase.subjectUnits.length) break;
  }
  return matches;
}

function printRegExpFallbackCase(testCase: RegExpFallbackCase): string {
  return `
const subject = String.fromCharCode(${testCase.subjectUnits.join(", ")});
const pattern = ${JSON.stringify(fallbackPatternText(testCase.pattern))};
function renderUnits(value) {
  let rendered = "";
  for (let index = 0; index < value.length; index = index + 1) {
    if (rendered !== "") rendered = rendered + ".";
    rendered = rendered + value.charCodeAt(index);
  }
  return rendered;
}
const iterator = subject.matchAll(pattern);
const prototype = Object.getPrototypeOf(iterator);
const arrayPrototype = Object.getPrototypeOf([][Symbol.iterator]());
const savedNext = arrayPrototype.next;
arrayPrototype.next = function() {
  return { value: undefined, done: true };
};
const first = iterator.next();
arrayPrototype.next = savedNext;
console.log(
  "iterator",
  prototype !== arrayPrototype,
  Object.getPrototypeOf(prototype) === Object.getPrototypeOf(arrayPrototype),
  iterator[Symbol.iterator]() === iterator,
  Object.prototype.toString.call(iterator),
);
console.log(
  "first",
  first.done,
  first.done ? -1 : first.value.index,
  first.done ? "" : renderUnits(first.value[0]),
);
let remaining = "";
for (const match of iterator) {
  if (remaining !== "") remaining = remaining + ",";
  remaining = remaining + match.index + ":" + renderUnits(match[0]);
}
console.log("remaining", remaining);
`;
}

function expectedRegExpFallback(testCase: RegExpFallbackCase): {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
} {
  const matches = fallbackPatternMatches(testCase);
  const first = matches[0];
  const firstUnits =
    first == null
      ? ""
      : testCase.subjectUnits
          .slice(first.position, first.position + first.length)
          .join(".");
  const remaining = matches
    .slice(1)
    .map((match) => {
      const units = testCase.subjectUnits
        .slice(match.position, match.position + match.length)
        .join(".");
      return `${match.position}:${units}`;
    })
    .join(",");
  return {
    exitStatus: 0,
    stderr: "",
    stdout: [
      "iterator true true true [object RegExp String Iterator]",
      `first ${first == null} ${first?.position ?? -1} ${firstUnits}`,
      `remaining ${remaining}`,
      "",
    ].join("\n"),
  };
}

test(
  "generated RegExp fallbacks keep matchAll iterator state isolated",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "RegExp fallback atoms and iterator state agree",
      fc.asyncProperty(regexpFallbackArbitrary, async (testCase) => {
        const source = printRegExpFallbackCase(testCase);
        const expected = expectedRegExpFallback(testCase);
        assertMatchingObservations([expected, ...(await references(source))]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-regexp-fallback.ts" },
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
                toolchain: zigToolchain,
              },
              (native) => {
                assertMatchingObservations([expected, native]);
                assert.ok(native.counters?.collections != null);
                assert.ok(native.counters.collections > 0);
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
          "zero to seven UTF-16 code units; empty, dot, escaped dot, digit, " +
          "and mixed dot patterns; dedicated iterator prototype mutation; " +
          "both specialization policies and forced collection",
        numRuns: 10,
        profile: "M5 String RegExp fallback and matchAll iterator",
        seed: 0x6000_4601,
        sizeLimit:
          "at most seven subject units, one of five fixed-width pattern " +
          "forms, one isolated first step, and the remaining lazy steps",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
