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

type ReceiverKind = "array" | "object" | "primitive" | "wrapper";
type SearchKind = "object" | "primitive" | "regexp-false" | "wrapper";
type PositionKind =
  | "infinity"
  | "nan"
  | "number"
  | "object"
  | "string"
  | "undefined";

interface PositionCase {
  readonly kind: PositionKind;
  readonly value: number;
}

interface StringSearchCase {
  readonly end: PositionCase;
  readonly position: PositionCase;
  readonly receiver: ReceiverKind;
  readonly search: SearchKind;
  readonly searchUnits: readonly number[];
  readonly subjectUnits: readonly number[];
}

const unitsArbitrary = fc.oneof(
  fc.array(fc.integer({ max: 0xffff, min: 0 }), { maxLength: 6 }),
  fc
    .record({
      lead: fc.integer({ max: 0xdbff, min: 0xd800 }),
      trail: fc.integer({ max: 0xdfff, min: 0xdc00 }),
    })
    .map(({ lead, trail }) => [lead, trail]),
);

const positionArbitrary: fc.Arbitrary<PositionCase> = fc.oneof(
  fc.integer({ max: 9, min: -9 }).map((value) => ({
    kind: "number" as const,
    value,
  })),
  fc.integer({ max: 9, min: -9 }).map((value) => ({
    kind: "number" as const,
    value: value + (value < 0 ? -0.75 : 0.75),
  })),
  fc.integer({ max: 9, min: -9 }).map((value) => ({
    kind: "string" as const,
    value,
  })),
  fc.integer({ max: 9, min: -9 }).map((value) => ({
    kind: "object" as const,
    value,
  })),
  fc.constantFrom(
    { kind: "nan" as const, value: Number.NaN },
    { kind: "infinity" as const, value: Number.POSITIVE_INFINITY },
    { kind: "infinity" as const, value: Number.NEGATIVE_INFINITY },
    { kind: "undefined" as const, value: 0 },
  ),
);

const caseArbitrary: fc.Arbitrary<StringSearchCase> = fc.record({
  end: positionArbitrary,
  position: positionArbitrary,
  receiver: fc.constantFrom<ReceiverKind>(
    "primitive",
    "wrapper",
    "object",
    "array",
  ),
  search: fc.constantFrom<SearchKind>(
    "primitive",
    "wrapper",
    "object",
    "regexp-false",
  ),
  searchUnits: unitsArbitrary,
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
  if (position < 0 || position + search.length > subject.length) return false;
  return search.every((unit, index) => subject[position + index] === unit);
}

function toInteger(value: number): number {
  if (Number.isNaN(value) || Object.is(value, -0) || value === 0) return 0;
  return Number.isFinite(value) ? Math.trunc(value) : value;
}

function clamp(value: number, length: number): number {
  return Math.min(Math.max(value, 0), length);
}

function relative(value: number, length: number): number {
  return value < 0 ? Math.max(length + value, 0) : Math.min(value, length);
}

function indexOf(
  subject: readonly number[],
  search: readonly number[],
  position: number,
): number {
  for (
    let index = clamp(position, subject.length);
    index <= subject.length - search.length;
    index += 1
  ) {
    if (matchesAt(subject, search, index)) return index;
  }
  return -1;
}

function lastIndexOf(
  subject: readonly number[],
  search: readonly number[],
  position: number,
): number {
  const latest = Math.min(
    clamp(position, subject.length),
    subject.length - search.length,
  );
  for (let index = latest; index >= 0; index -= 1) {
    if (matchesAt(subject, search, index)) return index;
  }
  return -1;
}

function positionExpression(position: PositionCase): string {
  if (position.kind === "undefined") return "undefined";
  const value = Number.isNaN(position.value)
    ? "NaN"
    : position.value === Number.POSITIVE_INFINITY
      ? "Infinity"
      : position.value === Number.NEGATIVE_INFINITY
        ? "-Infinity"
        : String(position.value);
  if (position.kind === "string") return JSON.stringify(value);
  if (position.kind === "object") {
    return `({ valueOf() { return ${value}; } })`;
  }
  return value;
}

function receiverExpression(kind: ReceiverKind): string {
  if (kind === "primitive") return "subject";
  if (kind === "wrapper") return "new String(subject)";
  if (kind === "array") return "[subject]";
  return "({ toString() { return subject; } })";
}

function searchExpression(kind: SearchKind): string {
  if (kind === "primitive") return "needle";
  if (kind === "wrapper") return "new String(needle)";
  if (kind === "object") return "({ toString() { return needle; } })";
  return `({
    get [Symbol.match]() { return false; },
    toString() { return needle; },
  })`;
}

function stringFromUnits(units: readonly number[]): string {
  return String.fromCharCode(...units);
}

function printCase(testCase: StringSearchCase): string {
  const subject = testCase.subjectUnits;
  const search = testCase.searchUnits;
  const position = toInteger(testCase.position.value);
  const end = toInteger(testCase.end.value);
  const ordinaryPosition =
    testCase.position.kind === "undefined" ? 0 : position;
  const lastPosition =
    testCase.position.kind === "undefined" ||
    Number.isNaN(testCase.position.value)
      ? Number.POSITIVE_INFINITY
      : position;
  const endPosition =
    testCase.position.kind === "undefined" ? subject.length : position;
  const sliceStart = relative(ordinaryPosition, subject.length);
  const sliceEnd =
    testCase.end.kind === "undefined"
      ? subject.length
      : relative(end, subject.length);
  const substringStart = clamp(ordinaryPosition, subject.length);
  const substringEnd =
    testCase.end.kind === "undefined"
      ? subject.length
      : clamp(end, subject.length);
  const substringFrom = Math.min(substringStart, substringEnd);
  const substringTo = Math.max(substringStart, substringEnd);
  const expectedSlice = subject.slice(
    sliceStart,
    Math.max(sliceStart, sliceEnd),
  );
  const expectedSubstring = subject.slice(substringFrom, substringTo);
  const expectedIndex = indexOf(subject, search, ordinaryPosition);
  const expectedLast = lastIndexOf(subject, search, lastPosition);
  const expectedStarts = matchesAt(
    subject,
    search,
    clamp(ordinaryPosition, subject.length),
  );
  const clampedEnd = clamp(endPosition, subject.length);
  const expectedEnds = matchesAt(subject, search, clampedEnd - search.length);
  return `
const subject = String.fromCharCode(${subject.join(", ")});
const needle = String.fromCharCode(${search.join(", ")});
const receiver = ${receiverExpression(testCase.receiver)};
const search = ${searchExpression(testCase.search)};
const position = ${positionExpression(testCase.position)};
const end = ${positionExpression(testCase.end)};
console.log(
  "concat",
  String.prototype.concat.call(receiver, search, "!") ===
    ${JSON.stringify(stringFromUnits(subject) + stringFromUnits(search) + "!")},
);
console.log(
  "indexOf",
  String.prototype.indexOf.call(receiver, search, position) ===
    ${expectedIndex},
);
console.log(
  "lastIndexOf",
  String.prototype.lastIndexOf.call(receiver, search, position) ===
    ${expectedLast},
);
console.log(
  "includes",
  String.prototype.includes.call(receiver, search, position) ===
    ${expectedIndex >= 0},
);
console.log(
  "startsWith",
  String.prototype.startsWith.call(receiver, search, position) ===
    ${expectedStarts},
);
console.log(
  "endsWith",
  String.prototype.endsWith.call(receiver, search, position) ===
    ${expectedEnds},
);
console.log(
  "slice",
  String.prototype.slice.call(receiver, position, end) ===
    ${JSON.stringify(stringFromUnits(expectedSlice))},
);
console.log(
  "substring",
  String.prototype.substring.call(receiver, position, end) ===
    ${JSON.stringify(stringFromUnits(expectedSubstring))},
);
/** @param {string} value */
function hinted(value) { return value.indexOf(needle, position); }
console.log("hint", hinted(subject) === ${expectedIndex});
console.log("false hint", hinted(new String(subject)) === ${expectedIndex});
console.log("guard", hinted(subject) === ${expectedIndex});
String.prototype.searchMarker = 1;
console.log("guard", hinted(subject) === ${expectedIndex});
`;
}

const expectedObservation = {
  exitStatus: 0,
  stderr: "",
  stdout: [
    "concat true",
    "indexOf true",
    "lastIndexOf true",
    "includes true",
    "startsWith true",
    "endsWith true",
    "slice true",
    "substring true",
    "hint true",
    "false hint true",
    "guard true",
    "guard true",
    "",
  ].join("\n"),
};

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
    "oseo-string-search-property-",
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
  "generated String search and slice methods match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "String search and slice conversion and clamping agree",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-string-search.ts" },
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
          "zero to six UTF-16 subject and search code units including " +
          "surrogate pairs; primitive, wrapper, array, and generic " +
          "receivers; primitive, wrapper, generic, and false @@match " +
          "search values; integral, fractional, string, object, infinite, " +
          "NaN, and undefined bounds; a false hint and shape-guard miss",
        numRuns: 16,
        profile: "M5 String prototype search and slice",
        seed: 0x6000_4300,
        sizeLimit:
          "at most six subject and search code units, one receiver, one " +
          "search value, two bounds, eight method observations, two hint " +
          "classes, and one prototype shape change",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
