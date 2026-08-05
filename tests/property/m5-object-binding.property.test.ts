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

type DeclarationKind = "const" | "let" | "var";
type HintKind = "absent" | "false" | "truthful";
type Shape =
  | "computed"
  | "computed-literal"
  | "default"
  | "nested-array"
  | "nested-object"
  | "static";
type SourceKind =
  | "missing"
  | "null"
  | "number"
  | "present"
  | "string"
  | "undefined";

interface ObjectBindingCase {
  readonly declarationKind: DeclarationKind;
  readonly fallback: number;
  readonly hintKind: HintKind;
  readonly nestedAnnotationMatches: boolean;
  readonly shape: Shape;
  readonly sourceKind: SourceKind;
  readonly value: number;
}

interface ModelResult {
  readonly order: string;
  readonly result: string;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const sharedArbitraries = {
  declarationKind: fc.constantFrom<DeclarationKind>("const", "let", "var"),
  fallback: fc.integer({ max: 20, min: -20 }),
  nestedAnnotationMatches: fc.boolean(),
  sourceKind: fc.constantFrom<SourceKind>(
    "missing",
    "null",
    "number",
    "present",
    "string",
    "undefined",
  ),
  value: fc.integer({ max: 20, min: -20 }),
};
const caseArbitrary: fc.Arbitrary<ObjectBindingCase> = fc.oneof(
  {
    arbitrary: fc.record({
      ...sharedArbitraries,
      hintKind: fc.constantFrom<HintKind>("absent", "false", "truthful"),
      shape: fc.constantFrom<Shape>("computed", "computed-literal"),
    }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      ...sharedArbitraries,
      hintKind: fc.constantFrom<HintKind>("absent", "false", "truthful"),
      shape: fc.constantFrom<Shape>(
        "default",
        "nested-array",
        "nested-object",
        "static",
      ),
    }),
    weight: 4,
  },
);

function patternSource(testCase: ObjectBindingCase): string {
  let pattern: string;
  if (testCase.shape === "static") {
    pattern = "{ value: bound }";
  } else if (testCase.shape === "default") {
    const fallback = testCase.fallback;
    pattern = `{ value: bound = (order = order + "d", ${fallback}) }`;
  } else if (testCase.shape === "computed") {
    pattern =
      `{ [(order = order + "e", keyObject)]: bound = ` +
      `(order = order + "d", ${testCase.fallback}) }`;
  } else if (testCase.shape === "computed-literal") {
    const fallback = testCase.fallback;
    pattern = `{ ["value"]: bound = (order = order + "d", ${fallback}) }`;
  } else if (testCase.shape === "nested-array") {
    pattern = `{ nested: [bound = ${testCase.fallback}] = [] }`;
  } else {
    pattern = `{ nested: { value: bound = ${testCase.fallback} } = {} }`;
  }
  if (testCase.hintKind === "absent") return pattern;
  const type = testCase.hintKind === "truthful" ? "number" : "string";
  if (testCase.shape === "nested-array") {
    if (!testCase.nestedAnnotationMatches) {
      return `${pattern}: { nested: ${type} }`;
    }
    return `${pattern}: { nested: ${type}[] }`;
  }
  if (testCase.shape === "nested-object") {
    if (!testCase.nestedAnnotationMatches) {
      return `${pattern}: { nested: ${type} }`;
    }
    return `${pattern}: { nested: { value: ${type} } }`;
  }
  return `${pattern}: { value: ${type} }`;
}

function sourceValue(testCase: ObjectBindingCase): string {
  if (testCase.sourceKind === "null") return "null";
  if (testCase.sourceKind === "undefined") return "undefined";
  if (testCase.sourceKind === "number") return "1";
  if (testCase.sourceKind === "string") return '"text"';
  if (testCase.sourceKind === "missing") return "{}";
  if (testCase.shape === "nested-array") {
    return `{ nested: [${testCase.value}] }`;
  }
  if (testCase.shape === "nested-object") {
    return `{ nested: { value: ${testCase.value} } }`;
  }
  return `{ value: ${testCase.value} }`;
}

function printCase(testCase: ObjectBindingCase): string {
  return `
let order = "";
const keyObject = {
  [Symbol.toPrimitive]: function () {
    order = order + "k";
    return "value";
  },
};
function consume(input) {
  ${testCase.declarationKind} ${patternSource(testCase)} = input;
  return bound;
}
try {
  console.log("result", consume(${sourceValue(testCase)}));
} catch (error) {
  console.log("error", error.name);
}
console.log("order", order);
`;
}

function expected(testCase: ObjectBindingCase): ModelResult {
  if (testCase.sourceKind === "null" || testCase.sourceKind === "undefined") {
    return { order: "", result: "error TypeError" };
  }
  const present = testCase.sourceKind === "present";
  let order = testCase.shape === "computed" ? "ek" : "";
  let value: number | undefined = present ? testCase.value : undefined;
  if (value === undefined && testCase.shape !== "static") {
    value = testCase.fallback;
    if (
      testCase.shape === "computed" ||
      testCase.shape === "computed-literal"
    ) {
      order += "d";
    }
    if (testCase.shape === "default") order += "d";
  }
  return { order, result: `result ${String(value)}` };
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
    "oseo-object-binding-property-",
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

test("object binding model checks nullish inputs before computed keys", () => {
  assert.deepEqual(
    expected({
      declarationKind: "const",
      fallback: 2,
      hintKind: "absent",
      nestedAnnotationMatches: true,
      shape: "computed",
      sourceKind: "null",
      value: 1,
    }),
    { order: "", result: "error TypeError" },
  );
});

test(
  "generated object bindings match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "object bindings preserve generated values and property order",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const modeled = expected(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: `${modeled.result}\norder ${modeled.order}\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-object-binding.ts" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.hir != null);
          assert.ok(compiled.mir != null);
          const hir = printHir(compiled.hir);
          if (
            testCase.hintKind === "absent" ||
            testCase.shape === "computed" ||
            testCase.shape === "computed-literal" ||
            ((testCase.shape === "nested-array" ||
              testCase.shape === "nested-object") &&
              !testCase.nestedAnnotationMatches)
          ) {
            assert.doesNotMatch(hir, /bound hints=/u);
          } else {
            const type = testCase.hintKind === "truthful" ? "number" : "string";
            assert.match(
              hir,
              new RegExp(`bound hints=\\[typescript:${type}\\]`, "u"),
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
          "const, let, and var object patterns with static, computed " +
          "literal, computed dynamic, defaulted, nested, primitive, and " +
          "nullish inputs plus absent, truthful, or false TypeScript hints; " +
          "computed keys and nested shape mismatches remain unhinted",
        numRuns: 10,
        profile: "M5 object binding declarations",
        seed: 0x6000_2000,
        sizeLimit: "one nested property and bounded integer values",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
