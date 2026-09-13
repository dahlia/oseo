/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

type MessageKind = "custom" | "empty" | "omitted";
type Outcome = "fulfilled" | "rejected";
type SettledFault =
  | "extra-payload"
  | "length"
  | "missing-payload"
  | "missing-status"
  | "none"
  | "not-array"
  | "wrong-payload"
  | "wrong-status";

interface SettledEntry {
  readonly outcome: Outcome;
  readonly value: number;
}

/** One generated call to each promiseHelper.js assertion family. */
interface PromiseHelperCase {
  readonly entries: readonly SettledEntry[];
  readonly faultIndex: number;
  readonly message: MessageKind;
  readonly sequenceFault: boolean;
  readonly sequenceLength: number;
  readonly settledFault: SettledFault;
}

const caseArbitrary: fc.Arbitrary<PromiseHelperCase> = fc.record({
  entries: fc.array(
    fc.record({
      outcome: fc.constantFrom("fulfilled", "rejected"),
      value: fc.integer({ max: 50, min: -50 }),
    }),
    { maxLength: 4, minLength: 1 },
  ),
  faultIndex: fc.integer({ max: 7, min: 0 }),
  message: fc.constantFrom("custom", "empty", "omitted"),
  sequenceFault: fc.boolean(),
  sequenceLength: fc.integer({ max: 6, min: 0 }),
  settledFault: fc.constantFrom(
    "extra-payload",
    "length",
    "missing-payload",
    "missing-status",
    "none",
    "not-array",
    "wrong-payload",
    "wrong-status",
  ),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const baseHarness = await readFile(
  new URL("../test262/harness/base.js", import.meta.url),
  "utf8",
);
const promiseHarness = await readFile(
  new URL("../test262/harness/promiseHelper.js", import.meta.url),
  "utf8",
);

function harnessProgram(body: string): string {
  return `${baseHarness}\n${promiseHarness}\n${body}\n`;
}

function messageSource(kind: MessageKind): string {
  if (kind === "custom") return '"generated"';
  if (kind === "empty") return '""';
  return "undefined";
}

function messagePrefix(kind: MessageKind): string {
  return kind === "custom" ? "generated: " : "";
}

function sequenceValues(testCase: PromiseHelperCase): number[] {
  const values = Array.from(
    { length: testCase.sequenceLength },
    (_, index) => index + 1,
  );
  if (!testCase.sequenceFault) return values;
  if (values.length === 0) return [2];
  const index = testCase.faultIndex % values.length;
  values[index] = (values[index] ?? 0) + 1;
  return values;
}

function settledRecords(
  entries: readonly SettledEntry[],
): readonly Record<string, number | string>[] {
  return entries.map((entry) =>
    entry.outcome === "fulfilled"
      ? { status: "fulfilled", value: entry.value }
      : { reason: entry.value, status: "rejected" },
  );
}

function settledMutation(testCase: PromiseHelperCase): string {
  const index = testCase.faultIndex % testCase.entries.length;
  const entry = testCase.entries[index];
  assert(entry != null);
  const payload = entry.outcome === "fulfilled" ? "value" : "reason";
  const opposite = entry.outcome === "fulfilled" ? "reason" : "value";
  if (testCase.settledFault === "none") return "";
  if (testCase.settledFault === "not-array") {
    return "settleds = { length: expected.length };";
  }
  if (testCase.settledFault === "length") return "settleds.pop();";
  if (testCase.settledFault === "missing-status") {
    return `delete settleds[${index}].status;`;
  }
  if (testCase.settledFault === "wrong-status") {
    const status = entry.outcome === "fulfilled" ? "rejected" : "fulfilled";
    return `settleds[${index}].status = ${JSON.stringify(status)};`;
  }
  if (testCase.settledFault === "missing-payload") {
    return `delete settleds[${index}].${payload};`;
  }
  if (testCase.settledFault === "extra-payload") {
    return `settleds[${index}].${opposite} = 99;`;
  }
  return `settleds[${index}].${payload} = ${entry.value + 1};`;
}

function printCase(testCase: PromiseHelperCase): string {
  const sequence = sequenceValues(testCase);
  const records = settledRecords(testCase.entries);
  const message = messageSource(testCase.message);
  return harnessProgram(`
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 2), hinted("x", 2));
const sequence = ${JSON.stringify(sequence)};
try {
  console.log("sequence", checkSequence(sequence, ${message}));
} catch (error) {
  console.log("sequence error", error.message);
}
const expected = ${JSON.stringify(records)};
let settleds = ${JSON.stringify(records)};
${settledMutation(testCase)}
try {
  checkSettledPromises(settleds, expected, ${message});
  console.log("settled ok");
} catch (error) {
  console.log("settled error", error.message);
}
`);
}

function settledFailure(testCase: PromiseHelperCase): string | undefined {
  const prefix = messagePrefix(testCase.message);
  const index = testCase.faultIndex % testCase.entries.length;
  const entry = testCase.entries[index];
  assert(entry != null);
  if (testCase.settledFault === "none") return undefined;
  if (testCase.settledFault === "not-array") {
    return `${prefix}Settled values is an array`;
  }
  if (testCase.settledFault === "length") {
    return `${prefix}The settled values has a different length than expected`;
  }
  if (testCase.settledFault === "missing-status") {
    return `${prefix}The settled value has a property status`;
  }
  if (testCase.settledFault === "wrong-status") {
    return `${prefix}status for item ${index}`;
  }
  if (entry.outcome === "fulfilled") {
    if (testCase.settledFault === "missing-payload") {
      return `${prefix}The fulfilled promise has a property named value`;
    }
    if (testCase.settledFault === "extra-payload") {
      return `${prefix}The fulfilled promise has no property named reason`;
    }
    return `${prefix}value for item ${index}`;
  }
  if (testCase.settledFault === "extra-payload") {
    return `${prefix}The fulfilled promise has no property named value`;
  }
  if (testCase.settledFault === "missing-payload") {
    return `${prefix}The fulfilled promise has a property named reason`;
  }
  return `${prefix}Reason value for item ${index}`;
}

/** Independent output model for the generated assertion calls. */
function expected(testCase: PromiseHelperCase): string {
  const sequence = sequenceValues(testCase);
  const lines = ["hint 3 x2"];
  if (testCase.sequenceFault) {
    const message =
      testCase.message === "custom"
        ? "generated"
        : "Steps in unexpected sequence:";
    lines.push(`sequence error ${message} '${sequence.join(",")}'`);
  } else {
    lines.push("sequence true");
  }
  const failure = settledFailure(testCase);
  lines.push(failure == null ? "settled ok" : `settled error ${failure}`);
  lines.push("");
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
  const directory = await host.makeTemporaryDirectory(
    "oseo-promise-helper-property-",
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

async function assertNativeObservation(
  source: string,
  expectedObservation: {
    readonly exitStatus: number;
    readonly stderr: string;
    readonly stdout: string;
  },
  target: NonNullable<typeof nativeTarget>,
): Promise<void> {
  assertMatchingObservations([
    expectedObservation,
    ...(await references(source)),
  ]);
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "generated-m5-harness-promise-helper.js" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const mir = printMir(compiled.mir);
    if (specialization === "enabled") {
      assert.match(mir, /guard-(?:shape|smi)/u);
      assert.match(mir, /generic-fallback/u);
    } else {
      assert.doesNotMatch(mir, /guard-(?:shape|smi)/u);
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
          target,
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
}

const fixedSource = harnessProgram(`
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 2), hinted("x", 2));
function report(label, callback) {
  try {
    console.log(label, callback());
  } catch (error) {
    console.log(label, error.message);
  }
}
report("sequence valid", function () { return checkSequence([1, 2, 3]); });
report("sequence default", function () { return checkSequence([1, 3]); });
report("sequence empty", function () { return checkSequence([2], ""); });
report("sequence custom", function () {
  return checkSequence([2], "fixed sequence");
});
report("settled valid", function () {
  return checkSettledPromises(
    [
      { status: "fulfilled", value: 1 },
      { status: "rejected", reason: 2 },
    ],
    [
      { status: "fulfilled", value: 1 },
      { status: "rejected", reason: 2 },
    ],
    "fixed",
  );
});
report("settled array", function () {
  return checkSettledPromises({}, [], "fixed");
});
report("settled length", function () {
  return checkSettledPromises([], [{ status: "fulfilled", value: 1 }]);
});
report("settled status own", function () {
  return checkSettledPromises([{ value: 1 }], [
    { status: "fulfilled", value: 1 },
  ]);
});
report("settled status value", function () {
  return checkSettledPromises([{ status: "rejected", reason: 1 }], [
    { status: "fulfilled", value: 1 },
  ]);
});
report("settled fulfilled value", function () {
  return checkSettledPromises([{ status: "fulfilled" }], [
    { status: "fulfilled", value: 1 },
  ]);
});
report("settled fulfilled reason", function () {
  return checkSettledPromises([
    { status: "fulfilled", value: 1, reason: 2 },
  ], [{ status: "fulfilled", value: 1 }]);
});
report("settled fulfilled mismatch", function () {
  return checkSettledPromises([{ status: "fulfilled", value: 2 }], [
    { status: "fulfilled", value: 1 },
  ]);
});
report("settled rejected value", function () {
  return checkSettledPromises([
    { status: "rejected", value: 1, reason: 2 },
  ], [{ status: "rejected", reason: 2 }]);
});
report("settled rejected reason", function () {
  return checkSettledPromises([{ status: "rejected" }], [
    { status: "rejected", reason: 2 },
  ]);
});
report("settled rejected mismatch", function () {
  return checkSettledPromises([{ status: "rejected", reason: 3 }], [
    { status: "rejected", reason: 2 },
  ]);
});
report("settled invalid status", function () {
  return checkSettledPromises([{ status: "pending" }], [
    { status: "pending" },
  ]);
});
`);

const fixedExpected = [
  "hint 3 x2",
  "sequence valid true",
  "sequence default Steps in unexpected sequence: '1,3'",
  "sequence empty Steps in unexpected sequence: '2'",
  "sequence custom fixed sequence '2'",
  "settled valid undefined",
  "settled array fixed: Settled values is an array",
  "settled length The settled values has a different length than expected",
  "settled status own The settled value has a property status",
  "settled status value status for item 0",
  "settled fulfilled value The fulfilled promise has a property named value",
  "settled fulfilled reason The fulfilled promise has no property named reason",
  "settled fulfilled mismatch value for item 0",
  "settled rejected value The fulfilled promise has no property named value",
  "settled rejected reason The fulfilled promise has a property named reason",
  "settled rejected mismatch Reason value for item 0",
  "settled invalid status Valid statuses are only fulfilled or rejected",
  "",
].join("\n");

test(
  "fixed promiseHelper assertions match the reviewed include",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    if (nativeTarget == null) return;
    await assertNativeObservation(
      fixedSource,
      { exitStatus: 0, stderr: "", stdout: fixedExpected },
      nativeTarget,
    );
  },
);

test(
  "generated promiseHelper assertions match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    if (nativeTarget == null) return;
    await assertAsyncProperty(
      "promiseHelper sequence and settlement assertions agree",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        await assertNativeObservation(
          printCase(testCase),
          { exitStatus: 0, stderr: "", stdout: expected(testCase) },
          nativeTarget,
        );
      }),
      {
        context:
          host.executionHost == null
            ? ["target=unsupported host=unknown"]
            : [
                `target=${nativeTarget.name}`,
                `host=${host.executionHost.operatingSystem}/` +
                  host.executionHost.architecture,
                `sanitizers=${nativeTarget.sanitizers.join(",")}`,
                "replay=OSEO_PROPERTY_SEED and OSEO_PROPERTY_PATH",
              ],
        domain:
          "zero to six sequence entries, valid or one directly generated " +
          "mismatch; one to four fulfilled or rejected settlement records; " +
          "valid records or one array, length, status, presence, or payload " +
          "fault; omitted, empty, or custom messages; and one false number " +
          "hint",
        numRuns: 12,
        profile: "M5 promiseHelper.js harness include",
        seed: 0x6000_6d00,
        sizeLimit:
          "six sequence entries, four settlement records, one deliberate " +
          "fault, one assertion throw, and one false hint",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
