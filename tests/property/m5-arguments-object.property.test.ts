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

interface ArgumentsObjectCase {
  readonly arguments: readonly number[];
  readonly readIndex: number;
  readonly replacement: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<ArgumentsObjectCase> = fc.record({
  arguments: fc.array(fc.integer({ max: 20, min: -20 }), { maxLength: 6 }),
  readIndex: fc.integer({ max: 7, min: 0 }),
  replacement: fc.integer({ max: 20, min: -20 }),
});

function printed(value: number | undefined): string {
  return value == null ? "undefined" : String(value);
}

function printCase(testCase: ArgumentsObjectCase): string {
  return `
function inspect() {
  const first = arguments[0];
  console.log(
    arguments.length,
    arguments[${testCase.readIndex}],
    arguments.callee === inspect,
  );
  arguments[0] = ${testCase.replacement};
  console.log(first, arguments[0], arguments.length);
  return arguments;
}
const first = inspect(${testCase.arguments.join(", ")});
const second = inspect(${testCase.arguments.join(", ")});
console.log(first === second);
`;
}

function expected(testCase: ArgumentsObjectCase): string {
  const first = testCase.arguments[0];
  const observation =
    `${testCase.arguments.length} ` +
    `${printed(testCase.arguments[testCase.readIndex])} true\n` +
    `${printed(first)} ${testCase.replacement} ` +
    `${testCase.arguments.length}\n`;
  return observation + observation + "false\n";
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
    "oseo-arguments-object-property-",
  );
  const sourcePath = `${directory}/case.js`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `new Function(${JSON.stringify(source)})();\n`,
    );
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

test("arguments object model keeps call snapshots independent", () => {
  assert.equal(
    expected({ arguments: [1, 2], readIndex: 1, replacement: 3 }),
    "2 2 true\n1 3 2\n2 2 true\n1 3 2\nfalse\n",
  );
});

test(
  "generated arguments objects match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "arguments objects snapshot indices, length, callee, and identity",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-arguments-object.js" },
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
          "zero to six bounded integer arguments, a bounded read index, " +
          "and a bounded replacement value",
        numRuns: 10,
        profile: "M5 arguments object",
        seed: 0x5eed_001b,
        sizeLimit: "six arguments and an index from zero through seven",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
