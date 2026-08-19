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

const { assertAsyncProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type Action = "break" | "continue" | "exhaust" | "return" | "throw";
type Head = "binding" | "const" | "let" | "property" | "var";
type ReturnBehavior = "normal" | "throw";

interface ForOfCase {
  readonly action: Action;
  readonly head: Head;
  readonly returnBehavior: ReturnBehavior;
  readonly stopRaw: number;
  readonly values: readonly number[];
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const large = propertySize() === "large";
const caseArbitrary = fc.record({
  action: fc.constantFrom<Action>(
    "break",
    "continue",
    "exhaust",
    "return",
    "throw",
  ),
  head: fc.constantFrom<Head>("binding", "const", "let", "property", "var"),
  returnBehavior: fc.constantFrom<ReturnBehavior>("normal", "throw"),
  stopRaw: fc.nat({ max: large ? 8 : 4 }),
  values: fc.array(fc.integer({ max: 20, min: -20 }), {
    maxLength: large ? 9 : 5,
  }),
});

function activeStop(testCase: ForOfCase): number | undefined {
  if (testCase.action === "exhaust" || testCase.values.length === 0) {
    return undefined;
  }
  return testCase.stopRaw % testCase.values.length;
}

function headSource(head: Head) {
  if (head === "binding") return { head: "assigned", value: "assigned" };
  if (head === "property") {
    return { head: "holder.item", value: "holder.item" };
  }
  return { head: `${head} item`, value: "item" };
}

function actionSource(testCase: ForOfCase, value: string): string {
  const stop = activeStop(testCase);
  if (stop == null) return "";
  const action =
    testCase.action === "break"
      ? 'outcome = "break"; break;'
      : testCase.action === "continue"
        ? "continue;"
        : testCase.action === "return"
          ? `return "return:" + ${value};`
          : 'throw new RangeError("body");';
  return `if (bodyIndex === ${stop}) { ${action} }`;
}

function printCase(testCase: ForOfCase): string {
  const target = headSource(testCase.head);
  const returned =
    testCase.returnBehavior === "normal"
      ? "closes = closes + 1; return {};"
      : 'closes = closes + 1; throw new TypeError("close");';
  return `
let steps = 0;
let closes = 0;
let sum = 0;
let assigned = -99;
const holder = { item: -99 };
const values = [${testCase.values.join(", ")}];
const iterable = {
  [Symbol.iterator]: function () {
    let index = 0;
    return {
      next: function () {
        steps = steps + 1;
        const done = index >= values.length;
        const value = done ? undefined : values[index];
        index = index + 1;
        return { value: value, done: done };
      },
      return: function () { ${returned} },
    };
  },
};
function consume() {
  let outcome = "exhaust";
  let bodyIndex = 0;
  for (${target.head} of iterable) {
    sum = sum + ${target.value};
    ${actionSource(testCase, target.value)}
    bodyIndex = bodyIndex + 1;
  }
  return outcome;
}
try {
  console.log("result", consume());
} catch (error) {
  console.log("error", error.name, error.message);
}
console.log("state", sum, steps, closes);
`;
}

function expectedOutput(testCase: ForOfCase): string {
  const stop = activeStop(testCase);
  const early = stop != null && testCase.action !== "continue";
  const observed = early ? testCase.values.slice(0, stop + 1) : testCase.values;
  const sum = observed.reduce((total, value) => total + value, 0);
  const steps = early ? stop + 1 : testCase.values.length + 1;
  const closes = early ? 1 : 0;
  let result = "result exhaust";
  if (early && testCase.action === "throw") {
    result = "error RangeError body";
  } else if (
    early &&
    testCase.returnBehavior === "throw" &&
    (testCase.action === "break" || testCase.action === "return")
  ) {
    result = "error TypeError close";
  } else if (early && testCase.action === "break") {
    result = "result break";
  } else if (early && testCase.action === "return") {
    result = `result return:${testCase.values[stop]}`;
  }
  return `${result}\nstate ${sum} ${steps} ${closes}\n`;
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
  const directory = await host.makeTemporaryDirectory("oseo-for-of-property-");
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
  "generated synchronous iterator consumers match the M5 model",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    await assertAsyncProperty(
      "for-of preserves generated control and IteratorClose observations",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expected = {
          exitStatus: 0,
          stderr: "",
          stdout: expectedOutput(testCase),
        };
        const referenceResults = await references(source);
        assertMatchingObservations([expected, ...referenceResults]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-for-of.js" },
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
              (native) => assertMatchingObservations([expected, native]),
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
          "bounded integer iterables, head forms, transfers, and close modes",
        numRuns: 10,
        profile: "M5 synchronous for-of and IteratorClose",
        seed: 0x6000_1800,
        sizeLimit: large ? "9 values and 9 transfer positions" : "5 values",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
