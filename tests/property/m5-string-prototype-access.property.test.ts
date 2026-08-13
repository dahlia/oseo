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

type ReceiverKind =
  | "array"
  | "bigint"
  | "boolean"
  | "null"
  | "number"
  | "object"
  | "primitive"
  | "symbol"
  | "undefined"
  | "wrapper";

type PositionKind =
  | "bigint"
  | "infinity"
  | "number"
  | "object"
  | "string"
  | "symbol";

interface PositionCase {
  readonly kind: PositionKind;
  readonly value: number;
}

interface StringAccessCase {
  readonly position: PositionCase;
  readonly receiver: ReceiverKind;
  readonly units: readonly number[];
}

const unitsArbitrary = fc.oneof(
  fc.array(fc.integer({ max: 0xffff, min: 0 }), {
    maxLength: 6,
  }),
  fc
    .record({
      lead: fc.integer({ max: 0xdbff, min: 0xd800 }),
      prefix: fc.array(fc.integer({ max: 0x7f, min: 0x20 }), {
        maxLength: 2,
      }),
      suffix: fc.array(fc.integer({ max: 0x7f, min: 0x20 }), {
        maxLength: 2,
      }),
      trail: fc.integer({ max: 0xdfff, min: 0xdc00 }),
    })
    .map(({ lead, prefix, suffix, trail }) =>
      prefix.concat([lead, trail], suffix),
    ),
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
    { kind: "bigint" as const, value: 0 },
    { kind: "number" as const, value: Number.NaN },
    { kind: "infinity" as const, value: Number.POSITIVE_INFINITY },
    { kind: "infinity" as const, value: Number.NEGATIVE_INFINITY },
    { kind: "symbol" as const, value: 0 },
  ),
);

const caseArbitrary: fc.Arbitrary<StringAccessCase> = fc.record({
  position: positionArbitrary,
  receiver: fc.constantFrom<ReceiverKind>(
    "primitive",
    "wrapper",
    "object",
    "array",
    "number",
    "boolean",
    "bigint",
    "null",
    "undefined",
    "symbol",
  ),
  units: unitsArbitrary,
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function subjectUnits(testCase: StringAccessCase): readonly number[] {
  if (testCase.receiver === "number") return [49, 50, 51];
  if (testCase.receiver === "boolean") return [116, 114, 117, 101];
  if (testCase.receiver === "bigint") return [52, 50];
  return testCase.units;
}

function integerOrInfinity(value: number): number {
  if (Number.isNaN(value) || Object.is(value, -0) || value === 0) return 0;
  return Number.isFinite(value) ? Math.trunc(value) : value;
}

function receiverExpression(testCase: StringAccessCase): string {
  switch (testCase.receiver) {
    case "primitive":
      return "subject";
    case "wrapper":
      return "new String(subject)";
    case "object":
      return "({ toString() { return subject; } })";
    case "array":
      return "[subject]";
    case "number":
      return "123";
    case "boolean":
      return "true";
    case "bigint":
      return "42n";
    case "null":
      return "null";
    case "undefined":
      return "undefined";
    case "symbol":
      return 'Symbol("receiver")';
  }
}

function positionExpression(position: PositionCase): string {
  if (position.kind === "bigint") return "0n";
  if (position.kind === "symbol") return 'Symbol("position")';
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

function codePointAt(units: readonly number[], index: number): number {
  const first = units[index] ?? 0;
  const second = units[index + 1];
  if (
    first >= 0xd800 &&
    first <= 0xdbff &&
    second != null &&
    second >= 0xdc00 &&
    second <= 0xdfff
  ) {
    return 0x1_0000 + (first - 0xd800) * 0x400 + second - 0xdc00;
  }
  return first;
}

function printCase(testCase: StringAccessCase): string {
  const units = subjectUnits(testCase);
  const position = integerOrInfinity(testCase.position.value);
  const inRange = position >= 0 && position < units.length;
  const relative = position < 0 ? units.length + position : position;
  const relativeInRange = relative >= 0 && relative < units.length;
  const expectedChar = inRange ? units[position] : null;
  const expectedAt = relativeInRange ? units[relative] : null;
  const expectedPoint = inRange ? codePointAt(units, position) : null;
  const subjectArguments = testCase.units.join(", ");
  const receiver = receiverExpression(testCase);
  const input = positionExpression(testCase.position);
  const branded =
    testCase.receiver === "primitive" || testCase.receiver === "wrapper";
  const charExpectation =
    expectedChar == null
      ? 'value === ""'
      : `value === String.fromCharCode(${expectedChar})`;
  const atExpectation =
    expectedAt == null
      ? "value === undefined"
      : `value === String.fromCharCode(${expectedAt})`;
  const charCodeExpectation =
    expectedChar == null ? "Number.isNaN(value)" : `value === ${expectedChar}`;
  const pointExpectation =
    expectedPoint == null
      ? "value === undefined"
      : `value === ${expectedPoint}`;
  return `
const subject = String.fromCharCode(${subjectArguments});
const receiver = ${receiver};
const position = ${input};
function observe(name, operation, matches) {
  try {
    const value = operation();
    console.log(name, "value", matches(value));
  } catch (error) {
    console.log(name, "throw", error instanceof TypeError);
  }
}
observe(
  "charAt",
  () => String.prototype.charAt.call(receiver, position),
  (value) => ${charExpectation},
);
observe(
  "charCodeAt",
  () => String.prototype.charCodeAt.call(receiver, position),
  (value) => ${charCodeExpectation},
);
observe(
  "codePointAt",
  () => String.prototype.codePointAt.call(receiver, position),
  (value) => ${pointExpectation},
);
observe(
  "at",
  () => String.prototype.at.call(receiver, position),
  (value) => ${atExpectation},
);
observe(
  "toString",
  () => String.prototype.toString.call(receiver),
  (value) => value === ${
    branded ? JSON.stringify(String.fromCharCode(...units)) : '""'
  },
);
observe(
  "valueOf",
  () => String.prototype.valueOf.call(receiver),
  (value) => value === ${
    branded ? JSON.stringify(String.fromCharCode(...units)) : '""'
  },
);
/** @param {string} value */
function hinted(value) { return value.charAt(0); }
const hintedExpected = subject.length === 0
  ? ""
  : String.fromCharCode(${testCase.units[0] ?? 0});
console.log("hint", hinted(subject) === hintedExpected);
console.log("false hint", hinted(new String(subject)) === hintedExpected);
console.log("guard", hinted(subject) === hintedExpected);
String.prototype.marker = 1;
console.log("guard", hinted(subject) === hintedExpected);
`;
}

function expected(testCase: StringAccessCase): string {
  const receiverThrows =
    testCase.receiver === "null" ||
    testCase.receiver === "undefined" ||
    testCase.receiver === "symbol";
  const accessThrows =
    receiverThrows ||
    testCase.position.kind === "bigint" ||
    testCase.position.kind === "symbol";
  const branded =
    testCase.receiver === "primitive" || testCase.receiver === "wrapper";
  const accessObservation = accessThrows ? "throw true" : "value true";
  const brandObservation = branded ? "value true" : "throw true";
  return [
    `charAt ${accessObservation}`,
    `charCodeAt ${accessObservation}`,
    `codePointAt ${accessObservation}`,
    `at ${accessObservation}`,
    `toString ${brandObservation}`,
    `valueOf ${brandObservation}`,
    "hint true",
    "false hint true",
    "guard true",
    "guard true",
    "",
  ].join("\n");
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
    "oseo-string-access-property-",
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
  "generated String prototype access matches the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "String prototype access and brands agree",
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
            { source, sourceId: "generated-m5-string-access.ts" },
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
          "zero to six UTF-16 code units including generated surrogate " +
          "pairs; primitive, wrapper, generic object, array, number, " +
          "boolean, BigInt, nullish, and Symbol receivers; integral, " +
          "fractional, string, object, infinite, NaN, BigInt, and Symbol " +
          "positions; " +
          "branded access, a false string hint, and one shape-guard miss",
        numRuns: 16,
        profile: "M5 String prototype access",
        seed: 0x6000_4100,
        sizeLimit:
          "at most six source code units, one receiver, one position, six " +
          "method observations, two hint classes, and one prototype shape " +
          "change",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
