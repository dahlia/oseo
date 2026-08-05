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

interface CatchBindingCase {
  readonly fallback: number;
  readonly inputKind: InputKind;
  readonly patternKind: PatternKind;
  readonly value: number;
}

interface ModelResult {
  readonly restValue?: number;
  readonly result?: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<CatchBindingCase> = fc.record({
  fallback: fc.integer({ max: 20, min: -20 }),
  inputKind: fc.constantFrom<InputKind>("missing", "null", "present"),
  patternKind: fc.constantFrom<PatternKind>("array", "object"),
  value: fc.integer({ max: 20, min: -20 }),
});

function patternSource(testCase: CatchBindingCase): string {
  if (testCase.patternKind === "array") {
    return `[bound = ${testCase.fallback}, ...rest]`;
  }
  return `{ value: bound = ${testCase.fallback}, ...rest }`;
}

function inputSource(testCase: CatchBindingCase): string {
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

function printCase(testCase: CatchBindingCase): string {
  const restValue = testCase.patternKind === "array" ? "rest[0]" : "rest.extra";
  return `
function consume(input) {
  try {
    throw input;
  } catch (${patternSource(testCase)}) {
    console.log("result", bound, ${restValue});
  }
}
try {
  consume(${inputSource(testCase)});
} catch (error) {
  console.log("error", error.name);
}
`;
}

function expected(testCase: CatchBindingCase): ModelResult {
  if (testCase.inputKind === "null") return {};
  return {
    restValue: 7,
    result:
      testCase.inputKind === "present" ? testCase.value : testCase.fallback,
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
    "oseo-catch-binding-property-",
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

test("catch binding model rejects null before entering the body", () => {
  assert.deepEqual(
    expected({
      fallback: 2,
      inputKind: "null",
      patternKind: "object",
      value: 1,
    }),
    {},
  );
});

test(
  "generated catch bindings match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "catch bindings preserve generated values and rest",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const modeled = expected(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout:
            modeled.result == null
              ? "error TypeError\n"
              : `result ${modeled.result} ${modeled.restValue}\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-catch-binding.js" },
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
          "array and object catch bindings with defaults, rest, present, " +
          "missing, and nullish inputs",
        numRuns: 10,
        profile: "M5 catch binding patterns",
        seed: 0x6000_0a00,
        sizeLimit: "one binding, one rest value, and bounded integers",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
