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

/*
 * Oseo's realm reports UTC as its local time zone until the PLAN-NIO
 * clock and wakeup checkpoint supplies a host one, so the reference hosts
 * run in that zone. Both reference commands inherit this process's
 * environment, and the compiled program ignores the variable.
 */
process.env.TZ = "UTC";

/** The seven MakeDay and MakeTime operands one generated case supplies. */
interface DateFamilyCase {
  readonly day: number;
  readonly hour: number;
  readonly millisecond: number;
  readonly minute: number;
  readonly month: number;
  readonly second: number;
  /** The component setter the case exercises, by index. */
  readonly setter: number;
  /** The setter's first argument, deliberately out of its unit's range. */
  readonly setterArgument: number;
  readonly year: number;
}

const caseArbitrary: fc.Arbitrary<DateFamilyCase> = fc.record({
  day: fc.integer({ max: 31, min: 1 }),
  hour: fc.integer({ max: 23, min: 0 }),
  millisecond: fc.integer({ max: 999, min: 0 }),
  minute: fc.integer({ max: 59, min: 0 }),
  month: fc.integer({ max: 11, min: 0 }),
  second: fc.integer({ max: 59, min: 0 }),
  setter: fc.integer({ max: 5, min: 0 }),
  setterArgument: fc.integer({ max: 400, min: -400 }),
  year: fc.integer({ max: 4000, min: -2000 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/*
 * The independent oracle's calendar. It is written as floor division over
 * the proleptic Gregorian year rather than the era arithmetic
 * runtime_date.c uses, and it reads no host Date, so agreement is
 * evidence rather than a restatement.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const shifted = month <= 2 ? year - 1 : year;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear =
    Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

interface CivilDate {
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

/** The inverse of `daysFromCivil`, by direct search over the year. */
function civilFromDays(days: number): CivilDate {
  let year = Math.floor(days / 366) + 1970;
  while (daysFromCivil(year + 1, 1, 1) <= days) year += 1;
  while (daysFromCivil(year, 1, 1) > days) year -= 1;
  let month = 1;
  while (month < 12 && daysFromCivil(year, month + 1, 1) <= days) month += 1;
  return { day: days - daysFromCivil(year, month, 1) + 1, month, year };
}

/** Every component of one time value, as the oracle derives them. */
interface DateFields {
  readonly day: number;
  readonly hour: number;
  readonly millisecond: number;
  readonly minute: number;
  readonly month: number;
  readonly second: number;
  readonly weekday: number;
  readonly year: number;
}

function fieldsOf(timeValue: number): DateFields {
  const dayNumber = Math.floor(timeValue / 86_400_000);
  const withinDay = timeValue - dayNumber * 86_400_000;
  const civil = civilFromDays(dayNumber);
  return {
    day: civil.day,
    hour: Math.floor(withinDay / 3_600_000),
    millisecond: withinDay % 1000,
    minute: Math.floor(withinDay / 60_000) % 60,
    month: civil.month - 1,
    second: Math.floor(withinDay / 1000) % 60,
    weekday: (((dayNumber + 4) % 7) + 7) % 7,
    year: civil.year,
  };
}

function padded(value: number, width: number): string {
  const text = String(Math.abs(value));
  return "0".repeat(Math.max(0, width - text.length)) + text;
}

function signedYear(year: number, width: number): string {
  return (year < 0 ? "-" : "") + padded(year, width);
}

function isoText(timeValue: number): string {
  const fields = fieldsOf(timeValue);
  const year =
    fields.year < 0
      ? `-${padded(fields.year, 6)}`
      : fields.year > 9999
        ? `+${padded(fields.year, 6)}`
        : padded(fields.year, 4);
  return (
    `${year}-${padded(fields.month + 1, 2)}-${padded(fields.day, 2)}` +
    `T${padded(fields.hour, 2)}:${padded(fields.minute, 2)}` +
    `:${padded(fields.second, 2)}.${padded(fields.millisecond, 3)}Z`
  );
}

function timeText(fields: DateFields): string {
  return (
    `${padded(fields.hour, 2)}:${padded(fields.minute, 2)}` +
    `:${padded(fields.second, 2)} GMT`
  );
}

function toStringText(timeValue: number): string {
  const fields = fieldsOf(timeValue);
  return (
    `${weekdayNames[fields.weekday]} ${monthNames[fields.month]} ` +
    `${padded(fields.day, 2)} ${signedYear(fields.year, 4)} ` +
    `${timeText(fields)}+0000 (Coordinated Universal Time)`
  );
}

function utcText(timeValue: number): string {
  const fields = fieldsOf(timeValue);
  return (
    `${weekdayNames[fields.weekday]}, ${padded(fields.day, 2)} ` +
    `${monthNames[fields.month]} ${signedYear(fields.year, 4)} ` +
    `${timeText(fields)}`
  );
}

/** The time value one generated case names, always inside the range. */
function timeValueOf(testCase: DateFamilyCase): number {
  return (
    daysFromCivil(testCase.year, testCase.month + 1, 1) * 86_400_000 +
    (testCase.day - 1) * 86_400_000 +
    testCase.hour * 3_600_000 +
    testCase.minute * 60_000 +
    testCase.second * 1000 +
    testCase.millisecond
  );
}

/*
 * MakeFullYear maps a year from 0 through 99 into the twentieth century,
 * so the seven-argument constructor and Date.UTC report a different time
 * value than the same components name directly.
 */
function constructedTimeValue(testCase: DateFamilyCase): number {
  const year =
    testCase.year >= 0 && testCase.year <= 99
      ? 1900 + testCase.year
      : testCase.year;
  return (
    daysFromCivil(year, testCase.month + 1, 1) * 86_400_000 +
    (testCase.day - 1) * 86_400_000 +
    testCase.hour * 3_600_000 +
    testCase.minute * 60_000 +
    testCase.second * 1000 +
    testCase.millisecond
  );
}

/** The six component setters the generated cases select between. */
const setterNames = [
  "setUTCMilliseconds",
  "setUTCSeconds",
  "setUTCMinutes",
  "setUTCHours",
  "setUTCDate",
  "setUTCMonth",
];

/**
 * The oracle's own answer for the selected setter: recompose the seven
 * components with the generated argument replacing exactly one of them,
 * which is what the specification's MakeDay and MakeTime do.
 */
function setterResult(testCase: DateFamilyCase, timeValue: number): number {
  const fields = fieldsOf(timeValue);
  const argument = testCase.setterArgument;
  const components = [
    fields.year,
    fields.month,
    fields.day,
    fields.hour,
    fields.minute,
    fields.second,
    fields.millisecond,
  ];
  const target = [6, 5, 4, 3, 2, 1][testCase.setter] ?? 6;
  components[target] = argument;
  const result =
    daysFromCivil(components[0]!, components[1]! + 1, 1) * 86_400_000 +
    (components[2]! - 1) * 86_400_000 +
    components[3]! * 3_600_000 +
    components[4]! * 60_000 +
    components[5]! * 1000 +
    components[6]!;
  return Math.abs(result) > 8.64e15 ? Number.NaN : result;
}

/*
 * MakeDay resolves an out-of-range month into its year before the day
 * count is added, so a generated month argument moves the year too.
 */
function monthSetterResult(
  testCase: DateFamilyCase,
  timeValue: number,
): number {
  const fields = fieldsOf(timeValue);
  const month = testCase.setterArgument;
  const year = fields.year + Math.floor(month / 12);
  const resolved = ((month % 12) + 12) % 12;
  const result =
    daysFromCivil(year, resolved + 1, 1) * 86_400_000 +
    (fields.day - 1) * 86_400_000 +
    fields.hour * 3_600_000 +
    fields.minute * 60_000 +
    fields.second * 1000 +
    fields.millisecond;
  return Math.abs(result) > 8.64e15 ? Number.NaN : result;
}

function expectedSetter(testCase: DateFamilyCase, timeValue: number): number {
  return testCase.setter === 5
    ? monthSetterResult(testCase, timeValue)
    : setterResult(testCase, timeValue);
}

function printCase(testCase: DateFamilyCase): string {
  const timeValue = timeValueOf(testCase);
  const setter = setterNames[testCase.setter];
  return `
const dateGlobalObject = this;
const originalDate = Date;
const timeValue = ${timeValue};
const value = new Date(timeValue);
console.log(
  "fields",
  value.getTime(),
  value.getUTCFullYear(),
  value.getUTCMonth(),
  value.getUTCDate(),
  value.getUTCDay(),
  value.getUTCHours(),
  value.getUTCMinutes(),
  value.getUTCSeconds(),
  value.getUTCMilliseconds(),
);
console.log(
  "local",
  value.getFullYear() === value.getUTCFullYear(),
  value.getMonth() === value.getUTCMonth(),
  value.getDate() === value.getUTCDate(),
  value.getDay() === value.getUTCDay(),
  value.getHours() === value.getUTCHours(),
  value.getMinutes() === value.getUTCMinutes(),
  value.getSeconds() === value.getUTCSeconds(),
  value.getMilliseconds() === value.getUTCMilliseconds(),
  value.getTimezoneOffset(),
);
console.log("iso", value.toISOString());
console.log("text", value.toString());
console.log("utc text", value.toUTCString());
console.log("json", value.toJSON() === value.toISOString());
console.log(
  "parts",
  value.toDateString() + " " + value.toTimeString() === value.toString(),
);
// Only the ISO text is compared across hosts here. Recovering a
// toString or toUTCString text is the non-normative recommendation of
// 21.4.3.2, and both reference hosts decline it for a negative year, so
// tests/native.ts observes that pair against Oseo's own model instead.
console.log("round trip", Date.parse(value.toISOString()));
console.log(
  "construct",
  new Date(
    ${testCase.year},
    ${testCase.month},
    ${testCase.day},
    ${testCase.hour},
    ${testCase.minute},
    ${testCase.second},
    ${testCase.millisecond},
  ).getTime(),
  Date.UTC(
    ${testCase.year},
    ${testCase.month},
    ${testCase.day},
    ${testCase.hour},
    ${testCase.minute},
    ${testCase.second},
    ${testCase.millisecond},
  ),
);
const target = new Date(timeValue);
console.log("setter", target.${setter}(${testCase.setterArgument}));
console.log("setter slot", target.getTime());
const invalid = new Date(NaN);
console.log(
  "invalid",
  invalid.${setter}(${testCase.setterArgument}),
  invalid.getTime(),
  invalid.toString(),
);
console.log(
  "clip",
  new Date(timeValue + 8.64e15).getTime(),
  new Date(timeValue - 8.64e15 - 1).getTime(),
  new Date(-timeValue).getTime() === -timeValue,
);
// A false Number hint on a Date receiver must not change behavior, and
// the repeated intrinsic reads deliberately miss the property shape guard
// once so the generic fallback runs.
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
console.log(
  "hint",
  hinted(value.getTime(), value.getUTCMonth()),
  hinted("a", "b"),
);
const originalGetTime = Date.prototype.getTime;
let turn = 0;
while (turn < 2) {
  console.log("guard", Date.prototype.getTime === originalGetTime);
  if (turn === 0) Date.prototype.marker = 1;
  turn = turn + 1;
}
delete Date.prototype.marker;
// A Date survives collection pressure with its slot and own properties.
const survivor = new Date(timeValue);
survivor.tag = "kept";
for (let index = 0; index < 60; index = index + 1) {
  const garbage = new Date(timeValue + index);
  garbage.setUTCMilliseconds(index % 1000);
}
console.log("survived", survivor.getTime(), survivor.tag);
Date = 1;
console.log("global write", this.Date === Date, typeof Date);
Date = originalDate;
console.log("global restore", this.Date === Date, typeof Date);
delete dateGlobalObject.Date;
try { Date; } catch (error) {
  console.log("global deleted", error instanceof ReferenceError);
}
this.Date = originalDate;
console.log("global reinstall", this.Date === Date);
`;
}

function expected(testCase: DateFamilyCase): string {
  const timeValue = timeValueOf(testCase);
  const fields = fieldsOf(timeValue);
  const setterValue = expectedSetter(testCase, timeValue);
  const constructed = constructedTimeValue(testCase);
  const clippedHigh = timeValue + 8.64e15;
  const clippedLow = timeValue - 8.64e15 - 1;
  return [
    [
      "fields",
      timeValue,
      fields.year,
      fields.month,
      fields.day,
      fields.weekday,
      fields.hour,
      fields.minute,
      fields.second,
      fields.millisecond,
    ].join(" "),
    "local true true true true true true true true 0",
    `iso ${isoText(timeValue)}`,
    `text ${toStringText(timeValue)}`,
    `utc text ${utcText(timeValue)}`,
    "json true",
    "parts true",
    `round trip ${timeValue}`,
    `construct ${constructed} ${constructed}`,
    `setter ${setterValue}`,
    `setter slot ${setterValue}`,
    "invalid NaN NaN Invalid Date",
    [
      "clip",
      Math.abs(clippedHigh) > 8.64e15 ? "NaN" : clippedHigh,
      Math.abs(clippedLow) > 8.64e15 ? "NaN" : clippedLow,
      "true",
    ].join(" "),
    `hint ${timeValue + fields.month} ab`,
    "guard true",
    "guard true",
    `survived ${timeValue} kept`,
    "global write true number",
    "global restore true function",
    "global deleted true",
    "global reinstall true",
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
    "oseo-date-family-property-",
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
  "generated Date time values and texts match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Date fields, texts, parsing, and setters agree with the model",
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
            { source, sourceId: "generated-m5-date-family.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /property-get generic/u);
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
          "one proleptic Gregorian date from year -2000 to 4000 with a " +
          "day from 1 to 31, an hour, a minute, a second, and a " +
          "millisecond, observed as a time value, as every UTC and local " +
          "component, as the ISO, toString, and toUTCString texts, as the " +
          "three texts parsed back, and as the seven-argument constructor " +
          "and Date.UTC; one of six UTC component setters over an " +
          "argument from -400 to 400 that leaves its unit's range, " +
          "applied to a valid and to an invalid receiver; both TimeClip " +
          "boundaries; a false number hint; one prototype shape guard " +
          "miss; and one global Date write, restore, delete, and " +
          "reinstall sequence",
        numRuns: 12,
        profile: "M5 Date family",
        seed: 0x6000_6800,
        sizeLimit:
          "one bounded year, month, day, hour, minute, second, and " +
          "millisecond, one bounded setter selection, one bounded setter " +
          "argument, nine pseudorandom draws, two repeated prototype " +
          "property observations, sixty collection-pressure allocations, " +
          "and one global mutation sequence",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
