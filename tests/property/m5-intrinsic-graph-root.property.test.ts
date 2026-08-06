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

type Replacement = "none" | "null" | "shadow";

interface IntrinsicGraphCase {
  readonly appended: number;
  readonly replacement: Replacement;
  readonly values: readonly number[];
}

const caseArbitrary: fc.Arbitrary<IntrinsicGraphCase> = fc.record({
  appended: fc.integer({ max: 20, min: -20 }),
  replacement: fc.constantFrom("none", "null", "shadow"),
  values: fc.array(fc.integer({ max: 20, min: -20 }), {
    maxLength: 5,
  }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printCase(testCase: IntrinsicGraphCase): string {
  const replacement =
    testCase.replacement === "none"
      ? ""
      : testCase.replacement === "null"
        ? "Object.setPrototypeOf(values, null);"
        : 'Object.setPrototypeOf(values, { push: "shadow" });';
  const observation =
    testCase.replacement === "none"
      ? `
const length = values.push(${testCase.appended});
let total = 0;
for (const value of values) total = total + value;
console.log("none", length, values.length, total);`
      : `
console.log(
  ${JSON.stringify(testCase.replacement)},
  values.push,
  "push" in values,
  values[Symbol.iterator],
);`;
  return `
const values = ${JSON.stringify(testCase.values)};
const peer = [];
console.log(
  "root",
  values.push === peer.push,
  values[Symbol.iterator] === peer[Symbol.iterator],
  "push" in values,
);
${replacement}
${observation}
`;
}

function expected(testCase: IntrinsicGraphCase): string {
  const root = "root true true true\n";
  if (testCase.replacement === "shadow") {
    return `${root}shadow shadow true undefined\n`;
  }
  if (testCase.replacement === "null") {
    return `${root}null undefined false undefined\n`;
  }
  const length = testCase.values.length + 1;
  const total =
    testCase.values.reduce((sum, value) => sum + value, 0) + testCase.appended;
  return `${root}none ${length} ${length} ${total}\n`;
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
    "oseo-intrinsic-graph-property-",
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
  "generated arrays preserve the realm intrinsic graph",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "array methods use one ordinary realm prototype chain",
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
            { source, sourceId: "generated-m5-intrinsic-graph-root.ts" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
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
          "zero to five bounded integer elements, one appended integer, " +
          "and an unchanged, shadowed, or null array prototype, compared " +
          "with an independent length, sum, identity, and reachability " +
          "model under Node.js, Deno, and both native specialization " +
          "policies with forced collection",
        numRuns: 12,
        profile: "M5 realm-owned intrinsic graph root",
        seed: 0x6000_3100,
        sizeLimit:
          "two arrays, at most five initial elements, one append, and one " +
          "prototype replacement",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
