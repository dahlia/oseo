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
type HintKind = "absent" | "false" | "truthful";
type PatternKind = "array" | "object";

interface ParameterBindingCase {
  readonly asynchronous: boolean;
  readonly fallback: number;
  readonly hintKind: HintKind;
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
const caseArbitrary: fc.Arbitrary<ParameterBindingCase> = fc.record({
  asynchronous: fc.boolean(),
  fallback: fc.integer({ max: 20, min: -20 }),
  hintKind: fc.constantFrom<HintKind>("absent", "false", "truthful"),
  inputKind: fc.constantFrom<InputKind>("missing", "null", "present"),
  patternKind: fc.constantFrom<PatternKind>("array", "object"),
  value: fc.integer({ max: 20, min: -20 }),
});

function patternSource(testCase: ParameterBindingCase): string {
  if (testCase.patternKind === "array") {
    return `[bound = ${testCase.fallback}, ...rest]`;
  }
  return `{ value: bound = ${testCase.fallback}, ...rest }`;
}

function inputSource(testCase: ParameterBindingCase): string {
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

function printCase(testCase: ParameterBindingCase): string {
  const restValue = testCase.patternKind === "array" ? "rest[0]" : "rest.extra";
  const hint =
    testCase.hintKind === "absent"
      ? ""
      : `/** @param {${
          testCase.hintKind === "truthful" ? "number" : "string"
        }} bound */`;
  const invocation = `consume(${inputSource(testCase)})`;
  const call = testCase.asynchronous
    ? `${invocation}.then(undefined, function (error) {
  console.log("error", error.name);
});`
    : `try {
  ${invocation};
} catch (error) {
  console.log("error", error.name);
}`;
  return `
${hint}
${testCase.asynchronous ? "async " : ""}function consume(${patternSource(
    testCase,
  )}) {
  console.log("result", bound, ${restValue});
}
${call}
`;
}

function expected(testCase: ParameterBindingCase): ModelResult {
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
    "oseo-parameter-binding-property-",
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

test("parameter binding model rejects null before entering the body", () => {
  assert.deepEqual(
    expected({
      asynchronous: false,
      fallback: 2,
      hintKind: "absent",
      inputKind: "null",
      patternKind: "object",
      value: 1,
    }),
    {},
  );
});

test(
  "generated parameter bindings match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "parameter bindings preserve generated values and rest",
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
            { source, sourceId: "generated-m5-parameter-binding.js" },
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
          "synchronous and asynchronous array and object function " +
          "parameters with defaults, rest, present, missing, and nullish " +
          "inputs plus absent, truthful, and false JSDoc hints",
        numRuns: 10,
        profile: "M5 function binding patterns",
        seed: 0x5eed_0011,
        sizeLimit: "one binding, one rest value, and bounded integers",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
