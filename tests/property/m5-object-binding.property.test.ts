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

type DeclarationKind = "const" | "let" | "var";
type Shape =
  | "computed"
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
const caseArbitrary: fc.Arbitrary<ObjectBindingCase> = fc.record({
  declarationKind: fc.constantFrom<DeclarationKind>("const", "let", "var"),
  fallback: fc.integer({ max: 20, min: -20 }),
  shape: fc.constantFrom<Shape>(
    "computed",
    "default",
    "nested-array",
    "nested-object",
    "static",
  ),
  sourceKind: fc.constantFrom<SourceKind>(
    "missing",
    "null",
    "number",
    "present",
    "string",
    "undefined",
  ),
  value: fc.integer({ max: 20, min: -20 }),
});

function patternSource(testCase: ObjectBindingCase): string {
  if (testCase.shape === "static") return "{ value: bound }";
  if (testCase.shape === "default") {
    return `{ value: bound = (order = order + "d", ${testCase.fallback}) }`;
  }
  if (testCase.shape === "computed") {
    return (
      `{ [(order = order + "e", keyObject)]: bound = ` +
      `(order = order + "d", ${testCase.fallback}) }`
    );
  }
  if (testCase.shape === "nested-array") {
    return `{ nested: [bound = ${testCase.fallback}] = [] }`;
  }
  return `{ nested: { value: bound = ${testCase.fallback} } = {} }`;
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
    if (testCase.shape === "computed") order += "d";
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

test("object binding model checks nullish inputs before computed keys", () => {
  assert.deepEqual(
    expected({
      declarationKind: "const",
      fallback: 2,
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
            { source, sourceId: "generated-m5-object-binding.js" },
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
          "const, let, and var object patterns with static, computed, " +
          "defaulted, nested, primitive, and nullish inputs",
        numRuns: 10,
        profile: "M5 object binding declarations",
        seed: 0x5eed_0008,
        sizeLimit: "one nested property and bounded integer values",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
