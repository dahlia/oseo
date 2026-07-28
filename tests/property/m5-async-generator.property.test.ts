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

/** Which resumption replaces one `next` call in the driver. */
type Action = "exhaust" | "return" | "throw";
/** How the body guards its suspensions. */
type Guard = "catch" | "finally" | "none";
/**
 * How the body produces its values. The two delegating bodies differ in
 * what a throw resumption reaches: an array iterator declares no `throw`,
 * so the delegation closes it and raises a `TypeError` at the `yield*`
 * position, while an inner asynchronous generator receives the throw
 * completion itself.
 */
type Source = "delegate-array" | "delegate-async" | "yields";

interface AsyncGeneratorCase {
  readonly action: Action;
  readonly awaited: boolean;
  readonly guard: Guard;
  readonly promised: boolean;
  readonly source: Source;
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
  action: fc.constantFrom<Action>("exhaust", "return", "throw"),
  awaited: fc.boolean(),
  guard: fc.constantFrom<Guard>("catch", "finally", "none"),
  promised: fc.boolean(),
  source: fc.constantFrom<Source>("delegate-array", "delegate-async", "yields"),
  stopRaw: fc.nat({ max: large ? 8 : 5 }),
  values: fc.array(fc.integer({ max: 20, min: -20 }), {
    maxLength: large ? 6 : 4,
  }),
});

/** How many resumptions the generated driver performs. */
function callCount(testCase: AsyncGeneratorCase): number {
  return Math.min(testCase.values.length + 2, large ? 8 : 6);
}

function activeStop(testCase: AsyncGeneratorCase): number | undefined {
  if (testCase.action === "exhaust") return undefined;
  return testCase.stopRaw % callCount(testCase);
}

function operand(testCase: AsyncGeneratorCase, value: number): string {
  return testCase.promised ? `Promise.resolve(${value})` : String(value);
}

function bodySource(testCase: AsyncGeneratorCase): string {
  const awaited = testCase.awaited ? '    await "step";\n' : "";
  if (testCase.source === "yields") {
    const steps = testCase.values
      .map((value) => `    yield ${operand(testCase, value)};\n`)
      .join("");
    return `${awaited}${steps}`;
  }
  const elements = testCase.values
    .map((value) => operand(testCase, value))
    .join(", ");
  const delegated =
    testCase.source === "delegate-array" ? `[${elements}]` : "inner()";
  return `${awaited}    yield* ${delegated};\n`;
}

function innerSource(testCase: AsyncGeneratorCase): string {
  if (testCase.source !== "delegate-async") return "";
  const steps = testCase.values
    .map((value) => `  yield ${operand(testCase, value)};\n`)
    .join("");
  return `async function* inner() {\n${steps}}\n`;
}

function guardedBody(testCase: AsyncGeneratorCase): string {
  const body = bodySource(testCase);
  if (testCase.guard === "none") return body;
  const handler =
    testCase.guard === "catch"
      ? "  } catch (error) {\n    caught = error.name;\n" +
        '    yield "recovered";\n'
      : "  } finally {\n    cleanup = cleanup + 1;\n";
  return `  try {\n${body}${handler}  }\n`;
}

function callSource(testCase: AsyncGeneratorCase, index: number): string {
  if (activeStop(testCase) !== index) return "iterator.next()";
  return testCase.action === "return"
    ? 'iterator.return("closed")'
    : 'iterator.throw(new RangeError("thrown"))';
}

function printCase(testCase: AsyncGeneratorCase): string {
  const calls = callCount(testCase);
  let driver = "";
  for (let index = 0; index < calls; index += 1) {
    driver +=
      `  const step${index} = await settle(` +
      `${callSource(testCase, index)});\n` +
      `  text = text + step${index} + " ";\n`;
  }
  return `
let cleanup = 0;
let caught = "none";
${innerSource(testCase)}async function* generated() {
${guardedBody(testCase)}}
function settle(promise) {
  return promise.then(
    function (step) {
      return step.value + ":" + step.done;
    },
    function (error) {
      return "error " + error.name;
    },
  );
}
async function main() {
  const iterator = generated();
  let text = "";
${driver}  console.log(text);
  console.log("state", cleanup, caught);
}
main();
`;
}

function expectedOutput(testCase: AsyncGeneratorCase): string {
  const stop = activeStop(testCase);
  const total = testCase.values.length;
  const outputs: string[] = [];
  let produced = 0;
  let started = false;
  let completed = false;
  let inCatch = false;
  let cleanup = 0;
  let caught = "none";
  // A `finally` runs on every path that leaves the body once it started,
  // and a body that never started runs no cleanup at all.
  const leaveBody = (): void => {
    if (testCase.guard === "finally") cleanup += 1;
    completed = true;
  };
  for (let index = 0; index < callCount(testCase); index += 1) {
    if (index === stop) {
      if (completed || !started) {
        completed = true;
        outputs.push(
          testCase.action === "return" ? "closed:true" : "error RangeError",
        );
        continue;
      }
      if (testCase.action === "return") {
        leaveBody();
        outputs.push("closed:true");
        continue;
      }
      // A delegating body suspended inside `yield*` over an array reaches
      // an iterator with no `throw` method, so the delegation closes it
      // and raises a TypeError at that position instead.
      const raised =
        testCase.source === "delegate-array" && !inCatch
          ? "TypeError"
          : "RangeError";
      if (testCase.guard === "catch" && !inCatch) {
        caught = raised;
        inCatch = true;
        outputs.push("recovered:false");
        continue;
      }
      leaveBody();
      outputs.push(`error ${raised}`);
      continue;
    }
    if (completed) {
      outputs.push("undefined:true");
      continue;
    }
    started = true;
    if (inCatch) {
      // The handler's own suspension resumes past the `catch` block, and
      // this guard declares no `finally`.
      completed = true;
      outputs.push("undefined:true");
      continue;
    }
    if (produced < total) {
      produced += 1;
      outputs.push(`${testCase.values[produced - 1]}:false`);
      continue;
    }
    leaveBody();
    outputs.push("undefined:true");
  }
  return `${outputs.join(" ")} \nstate ${cleanup} ${caught}\n`;
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
    "oseo-async-generator-property-",
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
  "generated asynchronous generators match the M5 model",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    await assertAsyncProperty(
      "asynchronous generators preserve generated step and cleanup " +
        "observations",
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
            { source, sourceId: "generated-m5-async-generator.js" },
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
          "bounded asynchronous generator bodies, awaited and promised " +
          "operands, delegation kinds, guards, and resumption positions",
        numRuns: 10,
        profile: "M5 asynchronous generators and AsyncGeneratorRequest queues",
        seed: 0x5eed_0018,
        sizeLimit: large
          ? "6 values and 8 resumption positions"
          : "4 values and 6 resumption positions",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
