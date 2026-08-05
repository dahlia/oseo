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
type TargetKind = "identifier" | "member";

interface ForOfAssignmentCase {
  readonly fallback: number;
  readonly first: number;
  readonly inputKind: InputKind;
  readonly patternKind: PatternKind;
  readonly second: number;
  readonly targetKind: TargetKind;
}

interface ModelResult {
  readonly assigned?: number;
  readonly closeCount: number;
  readonly rest?: number;
  readonly sum?: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<ForOfAssignmentCase> = fc.record({
  fallback: fc.integer({ max: 20, min: -20 }),
  first: fc.integer({ max: 20, min: -20 }),
  inputKind: fc.constantFrom<InputKind>("missing", "null", "present"),
  patternKind: fc.constantFrom<PatternKind>("array", "object"),
  second: fc.integer({ max: 20, min: -20 }),
  targetKind: fc.constantFrom<TargetKind>("identifier", "member"),
});

function patternSource(testCase: ForOfAssignmentCase): string {
  const assigned =
    testCase.targetKind === "member" ? "target.assigned" : "assigned";
  const rest = testCase.targetKind === "member" ? "target.rest" : "rest";
  if (testCase.patternKind === "array") {
    return `[${assigned} = ${testCase.fallback}, ...${rest}]`;
  }
  return `{ value: ${assigned} = ${testCase.fallback}, ...${rest} }`;
}

function inputsSource(testCase: ForOfAssignmentCase): string {
  if (testCase.inputKind === "null") return `[null]`;
  const first =
    testCase.inputKind === "present" ? String(testCase.first) : "undefined";
  if (testCase.patternKind === "array") {
    return `[[${first}, 7], [${testCase.second}, 8]]`;
  }
  return (
    `[{ value: ${first}, extra: 7 }, ` +
    `{ value: ${testCase.second}, extra: 8 }]`
  );
}

function printCase(testCase: ForOfAssignmentCase): string {
  const assigned =
    testCase.targetKind === "member" ? "target.assigned" : "assigned";
  const rest =
    testCase.targetKind === "member"
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
let closeCount = 0;
const values = ${inputsSource(testCase)};
const iterable = {
  [Symbol.iterator]: function () {
    let index = 0;
    return {
      next: function () {
        const done = index >= values.length;
        const value = done ? undefined : values[index];
        index = index + 1;
        return { value: value, done: done };
      },
      return: function () {
        closeCount = closeCount + 1;
        return {};
      },
    };
  },
};
let sum = 0;
try {
  for (${patternSource(testCase)} of iterable) {
    sum = sum + ${assigned} + ${rest};
  }
  console.log("values", ${assigned}, ${rest}, sum, closeCount);
} catch (error) {
  console.log("error", error.name, ${assigned}, closeCount);
}
`;
}

function expected(testCase: ForOfAssignmentCase): ModelResult {
  if (testCase.inputKind === "null") {
    return { closeCount: 1 };
  }
  const first =
    testCase.inputKind === "present" ? testCase.first : testCase.fallback;
  return {
    assigned: testCase.second,
    closeCount: 0,
    rest: 8,
    sum: first + 7 + testCase.second + 8,
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
    "oseo-for-of-assignment-property-",
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

test("for-of assignment model closes after pattern failure", () => {
  assert.deepEqual(
    expected({
      fallback: 2,
      first: 1,
      inputKind: "null",
      patternKind: "object",
      second: 3,
      targetKind: "identifier",
    }),
    { closeCount: 1 },
  );
});

test(
  "generated for-of assignments match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "for-of assignment patterns preserve values and iterator cleanup",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const modeled = expected(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout:
            modeled.assigned == null
              ? `error TypeError 99 ${modeled.closeCount}\n`
              : `values ${modeled.assigned} ${modeled.rest} ` +
                `${modeled.sum} ${modeled.closeCount}\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-for-of-assignment.js" },
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
          "identifier and member array or object for-of assignment patterns " +
          "with defaults, rest, present, missing, and nullish inputs",
        numRuns: 10,
        profile: "M5 for-of assignment patterns",
        seed: 0x6000_1600,
        sizeLimit: "two iterations with bounded integers",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
