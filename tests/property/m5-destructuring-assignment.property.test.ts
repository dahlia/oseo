/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
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

type InputKind = "missing" | "null" | "present";
type PatternKind = "array" | "object";
type TargetKind = "identifier" | "member" | "parenthesized-member";

interface DestructuringAssignmentCase {
  readonly fallback: number;
  readonly inputKind: InputKind;
  readonly patternKind: PatternKind;
  readonly targetKind: TargetKind;
  readonly value: number;
}

interface ModelResult {
  readonly assigned?: number;
  readonly rest?: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<DestructuringAssignmentCase> = fc.record({
  fallback: fc.integer({ max: 20, min: -20 }),
  inputKind: fc.constantFrom<InputKind>("missing", "null", "present"),
  patternKind: fc.constantFrom<PatternKind>("array", "object"),
  targetKind: fc.constantFrom<TargetKind>(
    "identifier",
    "member",
    "parenthesized-member",
  ),
  value: fc.integer({ max: 20, min: -20 }),
});

function patternSource(testCase: DestructuringAssignmentCase): string {
  const memberTarget = testCase.targetKind !== "identifier";
  let assigned = memberTarget ? "target.assigned" : "assigned";
  let rest = memberTarget ? "target.rest" : "rest";
  if (testCase.targetKind === "parenthesized-member") {
    assigned = `(${assigned})`;
    rest = `(${rest})`;
  }
  if (testCase.patternKind === "array") {
    return `[${assigned} = ${testCase.fallback}, ...${rest}]`;
  }
  return `{ value: ${assigned} = ${testCase.fallback}, ...${rest} }`;
}

function inputSource(testCase: DestructuringAssignmentCase): string {
  if (testCase.inputKind === "null") return "null";
  if (testCase.patternKind === "array") {
    const value =
      testCase.inputKind === "present" ? String(testCase.value) : "undefined";
    return `[${value}, 7]`;
  }
  const value =
    testCase.inputKind === "present" ? `value: ${testCase.value}, ` : "";
  return `{ ${value}extra: 7 }`;
}

function printCase(testCase: DestructuringAssignmentCase): string {
  const memberTarget = testCase.targetKind !== "identifier";
  const assignedValue = memberTarget ? "target.assigned" : "assigned";
  const restValue = memberTarget
    ? testCase.patternKind === "array"
      ? "target.rest[0]"
      : "target.rest.extra"
    : testCase.patternKind === "array"
      ? "rest[0]"
      : "rest.extra";
  return `
let assigned = 99;
let rest;
const target = { assigned: 99, rest: undefined };
const input = ${inputSource(testCase)};
try {
  const result = (${patternSource(testCase)} = input);
  console.log("result", ${assignedValue}, ${restValue}, result === input);
} catch (error) {
  console.log("error", error.name, ${assignedValue});
}
`;
}

function expected(testCase: DestructuringAssignmentCase): ModelResult {
  if (testCase.inputKind === "null") return {};
  return {
    assigned:
      testCase.inputKind === "present" ? testCase.value : testCase.fallback,
    rest: 7,
  };
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
    "oseo-destructuring-assignment-property-",
  );
  const sourcePath = `${directory}/case.js`;
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

const nullishModelTest =
  "destructuring assignment leaves targets unchanged on nullish input";

test(nullishModelTest, () => {
  assert.deepEqual(
    expected({
      fallback: 2,
      inputKind: "null",
      patternKind: "object",
      targetKind: "identifier",
      value: 1,
    }),
    {},
  );
});

test(
  "generated destructuring assignments match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "destructuring assignments preserve values, rest, and result identity",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const modeled = expected(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout:
            modeled.assigned == null
              ? "error TypeError 99\n"
              : `result ${modeled.assigned} ${modeled.rest} true\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-destructuring-assignment.js" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          if (specialization === "enabled") {
            process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          }
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
              (native) =>
                assertMatchingObservations([expectedObservation, native]),
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
          "identifier, member, and parenthesized-member array and object " +
          "assignments with defaults, rest, present, missing, and nullish " +
          "inputs",
        numRuns: 10,
        profile: "M5 destructuring assignment",
        seed: 0x6000_1000,
        sizeLimit: "one target, one rest value, and bounded integers",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
