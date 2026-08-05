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

type ParameterForm = "array" | "default" | "object" | "plain-sibling";
type BodyBinding = "function" | "var";

interface ParameterVarCase {
  readonly bodyBinding: BodyBinding;
  readonly bodyValue: number;
  readonly parameterForm: ParameterForm;
  readonly parameterValue: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<ParameterVarCase> = fc.record({
  bodyBinding: fc.constantFrom<BodyBinding>("function", "var"),
  bodyValue: fc.integer({ max: 20, min: -20 }),
  parameterForm: fc.constantFrom<ParameterForm>(
    "array",
    "default",
    "object",
    "plain-sibling",
  ),
  parameterValue: fc.integer({ max: 20, min: -20 }),
});

function parameterSource(testCase: ParameterVarCase): string {
  const value = testCase.parameterValue;
  const initializer = `(readParameter = () => value, ${value})`;
  if (testCase.parameterForm === "array") {
    return `[value = ${initializer}]`;
  }
  if (testCase.parameterForm === "object") {
    return `{ value = ${initializer} }`;
  }
  if (testCase.parameterForm === "plain-sibling") {
    return (
      `_ = (readParameter = () => value, 0), ` +
      `value = ${testCase.parameterValue}`
    );
  }
  return `value = ${initializer}`;
}

function argumentSource(testCase: ParameterVarCase): string {
  if (testCase.parameterForm === "array") return "[]";
  if (testCase.parameterForm === "object") return "{}";
  return "";
}

function printCase(testCase: ParameterVarCase): string {
  const body =
    testCase.bodyBinding === "function"
      ? `
  function value() { return ${testCase.bodyValue}; }
  var value;
  console.log("result", value(), readParameter());`
      : `
  var value = ${testCase.bodyValue};
  console.log("result", value, readParameter());`;
  return `
let readParameter;
function consume(${parameterSource(testCase)}) {
${body}
}
consume(${argumentSource(testCase)});
`;
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
    "oseo-parameter-var-property-",
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

test(
  "generated parameter and body var cells match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "body var bindings do not replace captured parameter cells",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: `result ${testCase.bodyValue} ${testCase.parameterValue}\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-parameter-var.js" },
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
          "default and binding-pattern parameters with one captured " +
          "parameter cell and a same-name body var or function binding",
        numRuns: 10,
        profile: "M5 parameter and body var environments",
        seed: 0x6000_2700,
        sizeLimit: "two parameter bindings and bounded integers",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
