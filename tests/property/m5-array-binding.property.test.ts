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

const { assertAsyncProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type DeclarationKind = "const" | "let" | "var";
type AnnotationKind = "array" | "tuple-fixed-spread" | "tuple-rest";
type HintKind = "absent" | "false" | "truthful";
type IterableKind = "array" | "custom";
type Shape = "default-elision" | "head" | "nested" | "rest-array" | "rest-id";
type Value = number | undefined;
type IteratedValue = Value | readonly Value[];

interface ArrayBindingCase {
  readonly annotationKind: AnnotationKind;
  readonly declarationKind: DeclarationKind;
  readonly defaultThrows: boolean;
  readonly hintKind: HintKind;
  readonly iterableKind: IterableKind;
  readonly nestedAnnotationMatches: boolean;
  readonly nestedMissing: boolean;
  readonly nestedValues: readonly Value[];
  readonly shape: Shape;
  readonly stepFailure: boolean;
  readonly stepRaw: number;
  readonly values: readonly Value[];
}

interface ModelState {
  closes: number;
  done: boolean;
  index: number;
  readonly stepFailureAt: number | undefined;
  steps: number;
  readonly values: readonly IteratedValue[];
}

interface ModelResult {
  readonly closes: number;
  readonly result: string;
  readonly steps: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const large = propertySize() === "large";
const valueArbitrary = fc.oneof(
  fc.constant(undefined),
  fc.integer({ max: 20, min: -20 }),
);
const valuesArbitrary = fc.array(valueArbitrary, {
  maxLength: large ? 9 : 5,
});
const bindingArbitraries = {
  annotationKind: fc.constantFrom<AnnotationKind>(
    "array",
    "tuple-fixed-spread",
    "tuple-rest",
  ),
  declarationKind: fc.constantFrom<DeclarationKind>("const", "let", "var"),
  defaultThrows: fc.boolean(),
  hintKind: fc.constantFrom<HintKind>("absent", "false", "truthful"),
  nestedAnnotationMatches: fc.boolean(),
  nestedMissing: fc.boolean(),
  nestedValues: valuesArbitrary,
  shape: fc.constantFrom<Shape>(
    "default-elision",
    "head",
    "nested",
    "rest-array",
    "rest-id",
  ),
  values: valuesArbitrary,
};
const caseArbitrary: fc.Arbitrary<ArrayBindingCase> = fc.oneof(
  fc.record({
    ...bindingArbitraries,
    iterableKind: fc.constant("array" as const),
    stepFailure: fc.constant(false),
    stepRaw: fc.constant(0),
  }),
  fc.record({
    ...bindingArbitraries,
    iterableKind: fc.constant("custom" as const),
    stepFailure: fc.boolean(),
    stepRaw: fc.nat({ max: large ? 9 : 5 }),
  }),
);

function valueSource(value: Value): string {
  return value == null ? "undefined" : String(value);
}

function arraySource(values: readonly Value[]): string {
  return `[${values.map(valueSource).join(", ")}]`;
}

function outerValues(testCase: ArrayBindingCase): readonly IteratedValue[] {
  if (testCase.shape !== "nested") return testCase.values;
  return [
    testCase.nestedMissing ? undefined : testCase.nestedValues,
    ...testCase.values,
  ];
}

function outerValuesSource(testCase: ArrayBindingCase): string {
  if (testCase.shape !== "nested") return arraySource(testCase.values);
  const first = testCase.nestedMissing
    ? "undefined"
    : arraySource(testCase.nestedValues);
  return `[${[first, ...testCase.values.map(valueSource)].join(", ")}]`;
}

function patternSource(testCase: ArrayBindingCase): string {
  const firstDefault = testCase.defaultThrows
    ? '(function () { throw new RangeError("default"); })()'
    : "31";
  let pattern: string;
  if (testCase.shape === "head") {
    pattern = `[a = ${firstDefault}]`;
  } else if (testCase.shape === "default-elision") {
    pattern = `[a = ${firstDefault}, , b = 32]`;
  } else if (testCase.shape === "nested") {
    pattern = `[[a = ${firstDefault}, b = 32] = [33, 34]]`;
  } else if (testCase.shape === "rest-id") {
    pattern = `[a = ${firstDefault}, ...rest]`;
  } else {
    pattern = `[a = ${firstDefault}, ...[b = 32, c = 33]]`;
  }
  if (testCase.hintKind === "absent") return pattern;
  const type = testCase.hintKind === "truthful" ? "number" : "string";
  if (testCase.shape === "nested") {
    if (!testCase.nestedAnnotationMatches) {
      return `${pattern}: [${type}]`;
    }
    const annotation =
      testCase.annotationKind === "tuple-fixed-spread"
        ? `[...[[${type}, ${type}]]]`
        : `[[${type}, ${type}]]`;
    return `${pattern}: ${annotation}`;
  }
  if (testCase.annotationKind === "tuple-fixed-spread") {
    return `${pattern}: [...[${type}, ${type}], ${type}]`;
  }
  return testCase.annotationKind === "tuple-rest"
    ? `${pattern}: [${type}, ...${type}[]]`
    : `${pattern}: ${type}[]`;
}

function resultSource(shape: Shape): string {
  if (shape === "head") return '"" + a';
  if (shape === "default-elision") return 'a + ":" + b';
  if (shape === "nested") return 'a + ":" + b';
  if (shape === "rest-id") {
    return 'a + ":" + rest.length + ":" + (rest[0] ?? -99)';
  }
  return 'a + ":" + b + ":" + c';
}

function hintedBindingNames(shape: Shape): readonly string[] {
  if (shape === "head" || shape === "rest-id") return ["a"];
  if (shape === "default-elision" || shape === "nested") return ["a", "b"];
  return ["a", "b", "c"];
}

function assertGeneratedHints(testCase: ArrayBindingCase, hir: string): void {
  if (
    testCase.hintKind === "absent" ||
    (testCase.shape === "nested" && !testCase.nestedAnnotationMatches)
  ) {
    assert.doesNotMatch(hir, / hints=/u);
    return;
  }
  const type = testCase.hintKind === "truthful" ? "number" : "string";
  for (const name of hintedBindingNames(testCase.shape)) {
    assert.match(
      hir,
      new RegExp(`${name} hints=\\[typescript:${type}\\]`, "u"),
    );
  }
  if (testCase.shape === "rest-id") {
    assert.doesNotMatch(hir, /rest hints=/u);
  }
}

function failureStep(testCase: ArrayBindingCase): number | undefined {
  if (testCase.iterableKind !== "custom" || !testCase.stepFailure) {
    return undefined;
  }
  return testCase.stepRaw % (outerValues(testCase).length + 1);
}

function printCase(testCase: ArrayBindingCase): string {
  const values = outerValuesSource(testCase);
  const stepFailureAt = failureStep(testCase);
  const iterable =
    testCase.iterableKind === "array"
      ? "values"
      : `{
  [Symbol.iterator]: function () {
    let index = 0;
    return {
      next: function () {
        steps = steps + 1;
        ${
          stepFailureAt == null
            ? ""
            : `if (steps === ${stepFailureAt + 1}) ` +
              '{ throw new RangeError("step"); }'
        }
        const done = index >= values.length;
        const value = done ? undefined : values[index];
        index = index + 1;
        return { value: value, done: done };
      },
      return: function () { closes = closes + 1; return {}; },
    };
  },
}`;
  return `
let steps = ${testCase.iterableKind === "array" ? -1 : 0};
let closes = ${testCase.iterableKind === "array" ? -1 : 0};
const values = ${values};
const iterable = ${iterable};
function consume() {
  ${testCase.declarationKind} ${patternSource(testCase)} = iterable;
  return ${resultSource(testCase.shape)};
}
try {
  console.log("result", consume());
} catch (error) {
  console.log("error", error.name, error.message);
}
console.log("state", steps, closes);
`;
}

function display(value: unknown): string {
  return value === undefined ? "undefined" : String(value);
}

function nextValue(state: ModelState): IteratedValue {
  if (state.done) return undefined;
  const step = state.steps;
  state.steps += 1;
  if (state.stepFailureAt === step) {
    state.done = true;
    throw new RangeError("step");
  }
  if (state.index >= state.values.length) {
    state.done = true;
    return undefined;
  }
  const value = state.values[state.index];
  state.index += 1;
  return value;
}

function initialized(
  value: IteratedValue,
  fallback: number,
  defaultThrows: boolean,
): IteratedValue {
  if (value !== undefined) return value;
  if (defaultThrows) throw new RangeError("default");
  return fallback;
}

function expected(testCase: ArrayBindingCase): ModelResult {
  if (testCase.iterableKind === "array") {
    const modeled = expected({
      ...testCase,
      iterableKind: "custom",
      stepFailure: false,
    });
    return { ...modeled, closes: -1, steps: -1 };
  }
  const state: ModelState = {
    closes: 0,
    done: false,
    index: 0,
    stepFailureAt: failureStep(testCase),
    steps: 0,
    values: outerValues(testCase),
  };
  try {
    const first = nextValue(state);
    let result: string;
    if (testCase.shape === "head") {
      result = display(initialized(first, 31, testCase.defaultThrows));
    } else if (testCase.shape === "default-elision") {
      const a = initialized(first, 31, testCase.defaultThrows);
      nextValue(state);
      const b = initialized(nextValue(state), 32, false);
      result = `${display(a)}:${display(b)}`;
    } else if (testCase.shape === "nested") {
      const nested =
        first === undefined ? ([33, 34] as const) : (first as readonly Value[]);
      const a = initialized(nested[0], 31, testCase.defaultThrows);
      const b = initialized(nested[1], 32, false);
      result = `${display(a)}:${display(b)}`;
    } else if (testCase.shape === "rest-id") {
      const a = initialized(first, 31, testCase.defaultThrows);
      const rest: IteratedValue[] = [];
      while (!state.done) {
        const value = nextValue(state);
        if (!state.done) rest.push(value);
      }
      result = `${display(a)}:${rest.length}:${display(rest[0] ?? -99)}`;
    } else {
      const a = initialized(first, 31, testCase.defaultThrows);
      const rest: IteratedValue[] = [];
      while (!state.done) {
        const value = nextValue(state);
        if (!state.done) rest.push(value);
      }
      const b = initialized(rest[0], 32, false);
      const c = initialized(rest[1], 33, false);
      result = `${display(a)}:${display(b)}:${display(c)}`;
    }
    if (!state.done && !testCase.shape.startsWith("rest-")) state.closes += 1;
    return {
      closes: state.closes,
      result: `result ${result}`,
      steps: state.steps,
    };
  } catch (error) {
    if (!state.done) state.closes += 1;
    const reason = error as Error;
    return {
      closes: state.closes,
      result: `error ${reason.name} ${reason.message}`,
      steps: state.steps,
    };
  }
}

test("array binding model ignores custom iterator controls", () => {
  assert.deepEqual(
    expected({
      annotationKind: "array",
      declarationKind: "const",
      defaultThrows: false,
      hintKind: "absent",
      iterableKind: "array",
      nestedAnnotationMatches: true,
      nestedMissing: false,
      nestedValues: [],
      shape: "default-elision",
      stepFailure: true,
      stepRaw: 0,
      values: [],
    }),
    { closes: -1, result: "result 31:32", steps: -1 },
  );
});

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
    "oseo-array-binding-property-",
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

test(
  "generated array bindings match the M5 iterator model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "array bindings preserve generated values and iterator state",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const modeled = expected(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout:
            `${modeled.result}\n` +
            `state ${modeled.steps} ${modeled.closes}\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-array-binding.ts" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.hir != null);
          assert.ok(compiled.mir != null);
          assertGeneratedHints(testCase, printHir(compiled.hir));
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
          "const, let, and var array patterns with defaults, elision, " +
          "nesting, rest, arrays, custom iterators, abrupt steps, and " +
          "absent, truthful, or false homogeneous array, fixed tuple-" +
          "spread, and tuple-rest TypeScript hints, including nested " +
          "shape mismatches that remain unhinted",
        numRuns: 10,
        profile: "M5 array binding declarations",
        seed: 0x6000_0400,
        sizeLimit: large ? "9 outer and nested values" : "5 values",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
