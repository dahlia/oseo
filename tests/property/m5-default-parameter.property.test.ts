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

interface DefaultParameterCase {
  readonly fallbackOffset: number;
  readonly first: number;
  readonly supplied: boolean;
  readonly suppliedValue: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<DefaultParameterCase> = fc.record({
  fallbackOffset: fc.integer({ max: 20, min: -20 }),
  first: fc.integer({ max: 20, min: -20 }),
  supplied: fc.boolean(),
  suppliedValue: fc.integer({ max: 20, min: -20 }),
});

function printCase(testCase: DefaultParameterCase): string {
  const argument = testCase.supplied ? `, ${testCase.suppliedValue}` : "";
  return `
function consume(first, value = first + ${testCase.fallbackOffset}) {
  console.log("result", value);
}
console.log("length", consume.length);
consume(${testCase.first}${argument});
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
    "oseo-default-parameter-property-",
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
  "generated default parameters match Node.js and Deno",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "default parameters preserve supplied and fallback values",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedValue = testCase.supplied
          ? testCase.suppliedValue
          : testCase.first + testCase.fallbackOffset;
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: `length 1\nresult ${expectedValue}\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-default-parameter.js" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = compiled.mir;
          if (specialization === "enabled") {
            process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          }
          try {
            await withNativeFixture(
              {
                backend: cBackend,
                host,
                input: mir,
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
          "synchronous identifier defaults with supplied or missing bounded " +
          "integer values",
        numRuns: 10,
        profile: "M5 default parameters",
        seed: 0x5eed_0012,
        sizeLimit: "two parameters and bounded integers",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
