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
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

// The realm's local time zone is UTC; the reference hosts inherit this so
// their local-time answers are comparable on any developer machine.
process.env.TZ = "UTC";

/** One setYear operand: a number, or a numeric string ToNumber reads. */
type YearOperand =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: number };

interface DateCase {
  /** The receiver's time value, which may be NaN. */
  readonly time: number;
  readonly year: YearOperand;
}

const msPerDay = 86_400_000;
const timeLimit = 8.64e15;

/*
 * Time values near the epoch, both sides of 1900 and 2000, leap days,
 * the two ends of the time-value range, arbitrary values inside it, and
 * NaN for an invalid receiver.
 */
const timeArbitrary: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(
    0,
    -1,
    -2_208_988_800_000,
    -2_208_988_800_001,
    946_684_800_000,
    951_782_400_000,
    1_709_210_096_789,
    timeLimit,
    -timeLimit,
    NaN,
  ),
  fc.integer({ max: timeLimit, min: -timeLimit }),
  fc.integer({ max: 4_102_444_800_000, min: -4_102_444_800_000 }),
);

/*
 * Year operands across the 0 to 99 window MakeFullYear maps, its edges,
 * fractions, negative values, the ends of the representable years, and
 * NaN and the infinities.
 */
const yearNumberArbitrary: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ max: 120, min: -20 }),
  fc.constantFrom(
    -0,
    0.5,
    99.9,
    -0.5,
    1899,
    1900,
    2000,
    275_760,
    275_761,
    -271_821,
    -271_822,
    NaN,
    Infinity,
    -Infinity,
  ),
  fc.integer({ max: 300_000, min: -300_000 }),
);

const caseArbitrary: fc.Arbitrary<DateCase> = fc.record({
  time: timeArbitrary,
  year: fc.oneof(
    fc.record({
      kind: fc.constant("number" as const),
      value: yearNumberArbitrary,
    }),
    fc.record({
      kind: fc.constant("string" as const),
      value: fc.integer({ max: 3000, min: -100 }),
    }),
  ),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** One proleptic Gregorian date; `month` is zero-based. */
interface CivilDate {
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

/** The civil date of a day number, by the proleptic Gregorian rules. */
function civilFromDays(days: number): CivilDate {
  const shifted = days + 719_468;
  const era = Math.floor(shifted / 146_097);
  const dayOfEra = shifted - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime < 10 ? monthPrime + 3 : monthPrime - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return { day, month: month - 1, year };
}

/** The day number of a civil date; `month` is zero-based and may overflow. */
function daysFromCivil(year: number, month: number, day: number): number {
  const normalizedYear = year + Math.floor(month / 12);
  const normalizedMonth = ((month % 12) + 12) % 12;
  const shiftedYear = normalizedMonth < 2 ? normalizedYear - 1 : normalizedYear;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const monthPrime = (normalizedMonth + 10) % 12;
  const dayOfYear = Math.floor((153 * monthPrime + 2) / 5);
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146_097 + dayOfEra - 719_468 + day - 1;
}

/** ToIntegerOrInfinity over a number. */
function integerOrInfinity(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (!Number.isFinite(value)) return value;
  return Math.trunc(value) === 0 ? 0 : Math.trunc(value);
}

/** The numeric operand setYear converts. */
function yearNumber(year: YearOperand): number {
  return year.value;
}

/** getYear, B.2.3.1, under the realm's UTC local time zone. */
function getYearOracle(time: number): number {
  if (Number.isNaN(time)) return NaN;
  return civilFromDays(Math.floor(time / msPerDay)).year - 1900;
}

/** setYear, B.2.3.2, under the realm's UTC local time zone. */
function setYearOracle(time: number, operand: number): number {
  const base = Number.isNaN(time) ? 0 : time;
  if (Number.isNaN(operand)) return NaN;
  const truncated = integerOrInfinity(operand);
  const year = truncated >= 0 && truncated <= 99 ? 1900 + truncated : operand;
  if (!Number.isFinite(year)) return NaN;
  const dayNumber = Math.floor(base / msPerDay);
  const within = base - dayNumber * msPerDay;
  const { day, month } = civilFromDays(dayNumber);
  const date = daysFromCivil(integerOrInfinity(year), month, day) * msPerDay;
  const composed = date + within;
  if (!Number.isFinite(composed) || Math.abs(composed) > timeLimit) {
    return NaN;
  }
  return composed + 0;
}

/** The source text of one number, including NaN and signed zero. */
function numberSource(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

function yearSource(year: YearOperand): string {
  return year.kind === "string"
    ? JSON.stringify(String(year.value))
    : numberSource(year.value);
}

function printCase(testCase: DateCase): string {
  return `
const date = new Date(${numberSource(testCase.time)});
console.log("getYear", date.getYear());
const returned = date.setYear(${yearSource(testCase.year)});
console.log("setYear", returned, Object.is(returned, date.getTime()));
console.log("after", date.getYear());
console.log(
  "toGMTString",
  date.toGMTString() === date.toUTCString(),
  Date.prototype.toGMTString === Date.prototype.toUTCString,
);
try {
  Date.prototype.setYear.call({}, { valueOf() { throw new RangeError("y"); } });
} catch (error) {
  console.log("receiver first", error instanceof TypeError);
}
/** @param {number} operand @param {number} addend */
function hinted(operand, addend) { return operand + addend; }
console.log("hint", hinted(2, 1), hinted(new Date(0).getYear(), 1));
const holder = { date };
let turn = 0;
while (turn < 2) {
  console.log("guard", Object.is(holder.date.getYear(), date.getYear()));
  if (turn === 0) holder.marker = 1;
  turn = turn + 1;
}
`;
}

function expected(testCase: DateCase): string {
  const updated = setYearOracle(testCase.time, yearNumber(testCase.year));
  return [
    `getYear ${getYearOracle(testCase.time)}`,
    `setYear ${updated} true`,
    `after ${getYearOracle(updated)}`,
    "toGMTString true true",
    "receiver first true",
    "hint 3 71",
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
    "oseo-annexb-date-property-",
  );
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

const context =
  nativeTarget == null || host.executionHost == null
    ? ["target=unsupported host=unknown"]
    : [
        `target=${nativeTarget.name}`,
        `host=${host.executionHost.operatingSystem}/` +
          host.executionHost.architecture,
        `sanitizers=${nativeTarget.sanitizers.join(",")}`,
      ];

/** Compile `source` under one policy and run it with forced collection. */
async function observeNative(
  source: string,
  specialization: "disabled" | "enabled",
  check: (native: {
    readonly counters?: {
      readonly collections: number;
      readonly guardMisses: number;
    };
    readonly exitStatus: number;
    readonly stderr: string;
    readonly stdout: string;
  }) => void,
): Promise<void> {
  const compiled = compileSource(
    babelFrontend,
    { source, sourceId: "generated-m5-annexb-date-methods.ts" },
    { observeSpecialization: true, specialization },
  );
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  const mir = printMir(compiled.mir);
  if (specialization === "enabled") {
    assert.match(mir, /guard-smi/u);
    assert.match(mir, /guard-shape/u);
    assert.match(mir, /add-smi-checked/u);
    assert.match(mir, /generic-fallback/u);
  } else {
    assert.doesNotMatch(mir, /guard-(?:smi|shape)/u);
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
        toolchain: nativeToolchain,
      },
      check,
    );
  } finally {
    delete process.env.OSEO_GC_EVERY_SAFEPOINT;
  }
}

test(
  "generated getYear and setYear operands match the Annex B model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "getYear, setYear, and toGMTString agree with a calendar model",
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
          await observeNative(source, specialization, (native) => {
            assertMatchingObservations([expectedObservation, native]);
            assert.ok(native.counters?.collections != null);
            assert.ok(native.counters.collections > 0);
            if (specialization === "enabled") {
              assert.ok(native.counters.guardMisses > 0);
            }
          });
        }
      }),
      {
        context,
        domain:
          "one receiver time value near the epoch, around 1900 and 2000, " +
          "on a leap day, at either end of the time-value range, anywhere " +
          "inside it, or NaN, one setYear operand in or around the 0 to 99 " +
          "window, fractional, negative, at the representable year limits, " +
          "NaN, infinite, or a numeric string, a false number hint, and " +
          "one object shape guard miss",
        numRuns: 12,
        profile: "Annex B Date methods",
        seed: 0x6000_9f00,
        sizeLimit:
          "one receiver, one year operand, and two repeated property reads",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);

/*
 * B.2.3.2 reads [[DateValue]] before ToNumber(year), so a conversion
 * that stores a new time value into the same Date does not change the
 * month, day, or time the result keeps. Both reference hosts reread the
 * slot after the conversion, so this case has a written expectation and
 * is observed natively only, like the other Date setters.
 */
test(
  "setYear uses the time value read before its conversion",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const source = `
const valid = new Date(0);
const fromValid = valid.setYear({
  valueOf() { valid.setTime(40 * 86400000); return 2000; },
});
console.log("valid", fromValid, valid.getTime());
const invalid = new Date(NaN);
const fromInvalid = invalid.setYear({
  valueOf() { invalid.setTime(40 * 86400000); return 2000; },
});
console.log("invalid", fromInvalid, invalid.getTime());
/** @param {number} operand @param {number} addend */
function hinted(operand, addend) { return operand + addend; }
console.log("hint", hinted(2, 1), hinted(new Date(0).getYear(), 1));
const holder = { date: valid };
let turn = 0;
while (turn < 2) {
  console.log("guard", holder.date.getYear());
  if (turn === 0) holder.marker = 1;
  turn = turn + 1;
}
`;
    const stdout = [
      "valid 946684800000 946684800000",
      "invalid 946684800000 946684800000",
      "hint 3 71",
      "guard 100",
      "guard 100",
      "",
    ].join("\n");
    for (const specialization of ["disabled", "enabled"] as const) {
      await observeNative(source, specialization, (native) => {
        assertMatchingObservations([
          { exitStatus: 0, stderr: "", stdout },
          native,
        ]);
        assert.ok(native.counters != null);
        assert.ok(native.counters.collections > 0);
      });
    }
  },
);
