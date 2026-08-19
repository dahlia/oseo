/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  printHir,
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

type GeneratorKind = "asynchronous" | "synchronous";
type HintKind =
  | "absent"
  | "jsdoc-false"
  | "jsdoc-truthful"
  | "typescript-false"
  | "typescript-truthful";
type InputKind = "missing" | "null" | "present" | "undefined";
type PatternKind = "array" | "object";

interface GeneratorParameterCase {
  readonly fallback: number;
  readonly generatorKind: GeneratorKind;
  readonly hintKind: HintKind;
  readonly inputKind: InputKind;
  readonly nestedFallback: number;
  readonly nestedPresent: boolean;
  readonly nestedValue: number;
  readonly patternKind: PatternKind;
  readonly topLevelDefault: boolean;
  readonly value: number;
  readonly valuePresent: boolean;
}

interface ModelResult {
  readonly initialized: number;
  readonly nested?: number;
  readonly rest?: number | undefined;
  readonly value?: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<GeneratorParameterCase> = fc.record({
  fallback: fc.integer({ max: 20, min: -20 }),
  generatorKind: fc.constantFrom<GeneratorKind>("asynchronous", "synchronous"),
  hintKind: fc.constantFrom<HintKind>(
    "absent",
    "jsdoc-false",
    "jsdoc-truthful",
    "typescript-false",
    "typescript-truthful",
  ),
  inputKind: fc.constantFrom<InputKind>(
    "missing",
    "null",
    "present",
    "undefined",
  ),
  nestedFallback: fc.integer({ max: 20, min: -20 }),
  nestedPresent: fc.boolean(),
  nestedValue: fc.integer({ max: 20, min: -20 }),
  patternKind: fc.constantFrom<PatternKind>("array", "object"),
  topLevelDefault: fc.boolean(),
  value: fc.integer({ max: 20, min: -20 }),
  valuePresent: fc.boolean(),
});

function patternSource(testCase: GeneratorParameterCase): string {
  const typescript =
    testCase.hintKind === "typescript-truthful"
      ? "number"
      : testCase.hintKind === "typescript-false"
        ? "string"
        : undefined;
  if (testCase.patternKind === "array") {
    const pattern =
      `[value = initialized(${testCase.fallback}), ` +
      `[nested = initialized(${testCase.nestedFallback})] = [], ...rest]`;
    return typescript == null
      ? pattern
      : `${pattern}: [${typescript}, [number], ...number[]]`;
  }
  const pattern =
    `{ value = initialized(${testCase.fallback}), ` +
    `nested: { inner: nested = initialized(` +
    `${testCase.nestedFallback}) } = {}, ...rest }`;
  return typescript == null
    ? pattern
    : `${pattern}: { value: ${typescript}; ` +
        `nested: { inner: number }; extra: number }`;
}

function inputSource(testCase: GeneratorParameterCase): string {
  if (testCase.inputKind === "missing") return "";
  if (testCase.inputKind === "null") return "null";
  if (testCase.inputKind === "undefined") return "undefined";
  if (testCase.patternKind === "array") {
    const value = testCase.valuePresent ? String(testCase.value) : "undefined";
    const nested = testCase.nestedPresent
      ? String(testCase.nestedValue)
      : "undefined";
    return `[${value}, [${nested}], 9]`;
  }
  const value = testCase.valuePresent ? `value: ${testCase.value}, ` : "";
  const nested = testCase.nestedPresent
    ? `nested: { inner: ${testCase.nestedValue} }, `
    : "";
  return `{ ${value}${nested}extra: 9 }`;
}

function printCase(testCase: GeneratorParameterCase): string {
  const jsdoc =
    testCase.hintKind === "jsdoc-truthful"
      ? "/** @param {number} value */"
      : testCase.hintKind === "jsdoc-false"
        ? "/** @param {string} value */"
        : "";
  const empty = testCase.patternKind === "array" ? "[]" : "{}";
  const parameter =
    patternSource(testCase) +
    (testCase.topLevelDefault ? " = wholeDefault()" : "");
  const restValue = testCase.patternKind === "array" ? "rest[0]" : "rest.extra";
  const call = `consume(${inputSource(testCase)})`;
  const driver =
    testCase.generatorKind === "asynchronous"
      ? `
let iterator;
try {
  iterator = ${call};
  console.log("called", initializationCount);
} catch (error) {
  console.log("error", initializationCount, error.name);
}
if (iterator != null) {
  iterator.next().then(function (step) {
    console.log("step", step.value, step.done);
  });
}
`
      : `
try {
  const iterator = ${call};
  console.log("called", initializationCount);
  const step = iterator.next();
  console.log("step", step.value, step.done);
} catch (error) {
  console.log("error", initializationCount, error.name);
}
`;
  return `
let initializationCount = 0;
function initialized(value) {
  initializationCount += 1;
  return value;
}
function wholeDefault() {
  initializationCount += 10;
  return ${empty};
}
${jsdoc}
${testCase.generatorKind === "asynchronous" ? "async " : ""}function* consume(
  ${parameter}
) {
  yield value + "|" + nested + "|" + ${restValue};
}
${driver}
`;
}

function expected(testCase: GeneratorParameterCase): ModelResult {
  const usesDefaultInput =
    testCase.inputKind === "missing" || testCase.inputKind === "undefined";
  if (
    testCase.inputKind === "null" ||
    (usesDefaultInput && !testCase.topLevelDefault)
  ) {
    return { initialized: 0 };
  }
  const defaultInput = usesDefaultInput && testCase.topLevelDefault;
  const valuePresent = !defaultInput && testCase.valuePresent;
  const nestedPresent = !defaultInput && testCase.nestedPresent;
  return {
    initialized:
      (defaultInput ? 10 : 0) +
      (valuePresent ? 0 : 1) +
      (nestedPresent ? 0 : 1),
    nested: nestedPresent ? testCase.nestedValue : testCase.nestedFallback,
    rest: defaultInput ? undefined : 9,
    value: valuePresent ? testCase.value : testCase.fallback,
  };
}

function expectedObservation(testCase: GeneratorParameterCase) {
  const modeled = expected(testCase);
  if (modeled.value == null || modeled.nested == null) {
    return {
      exitStatus: 0,
      stderr: "",
      stdout: `error ${modeled.initialized} TypeError\n`,
    };
  }
  return {
    exitStatus: 0,
    stderr: "",
    stdout:
      `called ${modeled.initialized}\n` +
      `step ${modeled.value}|${modeled.nested}|` +
      `${modeled.rest ?? "undefined"} false\n`,
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
    "oseo-generator-parameter-property-",
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

test("generator parameter model keeps initialization at call time", () => {
  assert.deepEqual(
    expected({
      fallback: 2,
      generatorKind: "synchronous",
      hintKind: "absent",
      inputKind: "missing",
      nestedFallback: 3,
      nestedPresent: false,
      nestedValue: 4,
      patternKind: "array",
      topLevelDefault: true,
      value: 1,
      valuePresent: false,
    }),
    { initialized: 12, nested: 3, rest: undefined, value: 2 },
  );
});

test(
  "generated generator parameters match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "generator parameters initialize before the first resumption",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedValue = expectedObservation(testCase);
        assertMatchingObservations([
          expectedValue,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-generator-parameter.ts" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.hir != null);
          assert.ok(compiled.mir != null);
          const hinted =
            testCase.hintKind === "jsdoc-truthful" ||
            testCase.hintKind === "typescript-truthful"
              ? "number"
              : testCase.hintKind === "jsdoc-false" ||
                  testCase.hintKind === "typescript-false"
                ? "string"
                : undefined;
          if (hinted != null) {
            assert.match(
              printHir(compiled.hir),
              new RegExp(`hints=\\[(?:jsdoc|typescript):${hinted}\\]`, "u"),
            );
          }
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
              (native) => assertMatchingObservations([expectedValue, native]),
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
          "synchronous and asynchronous generators with recursive array or " +
          "object parameters, top-level and nested defaults, present, " +
          "missing, undefined, and null inputs, and absent, truthful, or " +
          "false JSDoc and TypeScript hints",
        numRuns: 10,
        profile: "M5 generator parameters",
        seed: 0x6000_1a00,
        sizeLimit:
          "two recursive binding leaves, one rest observation, and bounded " +
          "integer values",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
