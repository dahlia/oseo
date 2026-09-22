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

type ReceiverKind = "object" | "primitive" | "wrapper";

interface StringPadCase {
  readonly fillerDefault: boolean;
  readonly fillerUnits: readonly number[];
  readonly receiver: ReceiverKind;
  readonly repeatCount: number;
  readonly subjectUnits: readonly number[];
  readonly targetLength: number;
}

const unitsArbitrary = fc.oneof(
  fc.array(fc.integer({ max: 0xffff, min: 0 }), { maxLength: 6 }),
  fc.constantFrom(
    [0xd800],
    [0xdc00],
    [0xd800, 0xdc00],
    [0xd800, 0xd800, 0xdc00, 0xdc00],
  ),
);

const testCaseArbitrary: fc.Arbitrary<StringPadCase> = fc.record({
  fillerDefault: fc.boolean(),
  fillerUnits: fc.array(fc.integer({ max: 0xffff, min: 0 }), {
    maxLength: 4,
  }),
  receiver: fc.constantFrom<ReceiverKind>("primitive", "wrapper", "object"),
  repeatCount: fc.integer({ max: 5, min: 0 }),
  subjectUnits: unitsArbitrary,
  targetLength: fc.integer({ max: 18, min: -3 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function stringFromUnits(units: readonly number[]): string {
  return String.fromCharCode(...units);
}

function receiverExpression(kind: ReceiverKind): string {
  if (kind === "primitive") return "subject";
  if (kind === "wrapper") return "new String(subject)";
  return "({ toString() { return subject; } })";
}

function repeated(value: string, count: number): string {
  let result = "";
  for (let index = 0; index < count; index += 1) result += value;
  return result;
}

function padded(
  subject: string,
  targetLength: number,
  filler: string,
  atStart: boolean,
): string {
  const target = Math.max(Math.trunc(targetLength), 0);
  if (target <= subject.length || filler.length === 0) return subject;
  const fillLength = target - subject.length;
  let fill = "";
  for (let index = 0; index < fillLength; index += 1) {
    fill += filler[index % filler.length];
  }
  return atStart ? fill + subject : subject + fill;
}

function wellFormed(units: readonly number[]): boolean {
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index] ?? 0;
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = units[index + 1] ?? 0;
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function repaired(units: readonly number[]): string {
  const result: number[] = [];
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index] ?? 0;
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = units[index + 1] ?? 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        result.push(unit, next);
        index += 1;
      } else {
        result.push(0xfffd);
      }
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      result.push(0xfffd);
    } else {
      result.push(unit);
    }
  }
  return stringFromUnits(result);
}

function printCase(testCase: StringPadCase): string {
  const subject = stringFromUnits(testCase.subjectUnits);
  const explicitFiller = stringFromUnits(testCase.fillerUnits);
  const filler = testCase.fillerDefault ? " " : explicitFiller;
  const fillerArgument = testCase.fillerDefault
    ? "undefined"
    : `String.fromCharCode(${testCase.fillerUnits.join(", ")})`;
  const receiver = receiverExpression(testCase.receiver);
  return `
const subject = String.fromCharCode(${testCase.subjectUnits.join(", ")});
const receiver = ${receiver};
const filler = ${fillerArgument};
console.log(
  "results",
  String.prototype.repeat.call(receiver, ${testCase.repeatCount}) ===
    ${JSON.stringify(repeated(subject, testCase.repeatCount))},
  String.prototype.padStart.call(
    receiver,
    ${testCase.targetLength},
    filler,
  ) === ${JSON.stringify(padded(subject, testCase.targetLength, filler, true))},
  String.prototype.padEnd.call(
    receiver,
    ${testCase.targetLength},
    filler,
  ) === ${JSON.stringify(
    padded(subject, testCase.targetLength, filler, false),
  )},
  String.prototype.isWellFormed.call(receiver) ===
    ${wellFormed(testCase.subjectUnits)},
  String.prototype.toWellFormed.call(receiver) ===
    ${JSON.stringify(repaired(testCase.subjectUnits))},
);
/** @param {string} value */
function hinted(value) { return value.padEnd(9, "ab"); }
console.log("hint", hinted(subject) === ${JSON.stringify(
    padded(subject, 9, "ab", false),
  )});
console.log("false hint", hinted(new String(subject)) === ${JSON.stringify(
    padded(subject, 9, "ab", false),
  )});
console.log("guard", hinted(subject) === ${JSON.stringify(
    padded(subject, 9, "ab", false),
  )});
String.prototype.padMarker = 1;
console.log("guard", hinted(subject) === ${JSON.stringify(
    padded(subject, 9, "ab", false),
  )});
`;
}

const expectedObservation = {
  exitStatus: 0,
  stderr: "",
  stdout: [
    "results true true true true true",
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
    "oseo-string-pad-property-",
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
  "generated String padding and well-formedness match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "String repeat, padding, and well-formedness agree",
      fc.asyncProperty(testCaseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-string-pad.ts" },
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
                toolchain: nativeToolchain,
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
          "zero to six arbitrary UTF-16 subject code units weighted toward " +
          "paired and lone surrogates; zero to four filler code units or " +
          "the default filler; zero through five repeat counts; target " +
          "lengths from negative three through eighteen; primitive, wrapper, " +
          "and generic receivers; both specialization policies, a false " +
          "hint, and a deliberate prototype-shape miss",
        numRuns: 12,
        profile: "M5 String prototype padding and well-formedness",
        seed: 0x6000_7a00,
        sizeLimit:
          "at most six subject code units, four filler code units, five " +
          "method observations, two hint classes, and one prototype shape " +
          "change",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
