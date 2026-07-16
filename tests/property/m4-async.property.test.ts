/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
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

interface PromiseCommand {
  readonly fulfill: boolean;
  readonly repeats: readonly boolean[];
  readonly value: number;
}

interface AwaitCommand {
  readonly first: number;
  readonly second: number;
}

interface TimerCommand {
  readonly canceled: boolean;
  readonly delay: 0 | 100;
  readonly microtasks: number;
}

interface Schedule {
  readonly awaits: readonly AwaitCommand[];
  readonly pendingPromises: number;
  readonly promises: readonly PromiseCommand[];
  readonly timers: readonly TimerCommand[];
}

const host = createNodeHost();
const large = propertySize() === "large";
const awaitArbitrary = fc.record({
  first: fc.integer({ max: 20, min: -20 }),
  second: fc.integer({ max: 20, min: -20 }),
});
const promiseArbitrary = fc.record({
  fulfill: fc.boolean(),
  repeats: fc.array(fc.boolean(), { maxLength: 3 }),
  value: fc.integer({ max: 20, min: -20 }),
});
const timerArbitrary = fc.record({
  canceled: fc.boolean(),
  delay: fc.constantFrom(0 as const, 100 as const),
  microtasks: fc.integer({ max: 2, min: 0 }),
});
const scheduleArbitrary = fc.record({
  awaits: fc.array(awaitArbitrary, { maxLength: large ? 6 : 3 }),
  pendingPromises: fc.integer({ max: large ? 4 : 2, min: 0 }),
  promises: fc.array(promiseArbitrary, { maxLength: large ? 8 : 4 }),
  timers: fc.array(timerArbitrary, { maxLength: large ? 10 : 5 }),
});

function promiseHandler(index: number, fulfilled: boolean): string {
  const state = fulfilled ? "fulfilled" : "rejected";
  return [
    `function promise${index}${state}(value) {`,
    `  console.log("promise", ${index}, "${state}", value);`,
    "  return value;",
    "}",
  ].join("\n");
}

function printSchedule(schedule: Schedule): string {
  const lines = [
    ...schedule.promises.flatMap((_, index) => [
      promiseHandler(index, true),
      promiseHandler(index, false),
      `function chain${index}(value) {`,
      `  console.log("chain", ${index}, value);`,
      "}",
    ]),
    ...schedule.awaits.flatMap((command, index) => [
      `async function async${index}() {`,
      `  console.log("async start", ${index});`,
      `  const first = await ${command.first};`,
      `  console.log("async middle", ${index}, first);`,
      `  const second = await ${command.second};`,
      "  return first + second;",
      "}",
      `function asyncResult${index}(value) {`,
      `  console.log("async result", ${index}, value);`,
      "}",
    ]),
    ...schedule.timers.flatMap((timer, index) => [
      `function timer${index}() {`,
      `  console.log("timer", ${index});`,
      ...Array.from({ length: timer.microtasks }, (_, microtask) => [
        `  Promise.resolve(${microtask}).then(` +
          `function micro${index}_${microtask}() {`,
        `    console.log("microtask", ${index}, ${microtask});`,
        "  });",
      ]).flat(),
      "}",
    ]),
  ];
  for (const [index, command] of schedule.promises.entries()) {
    const first = command.fulfill ? "resolve" : "reject";
    const settlements = [command.fulfill, ...command.repeats]
      .map(
        (fulfilled) => `${fulfilled ? "resolve" : "reject"}(${command.value});`,
      )
      .join(" ");
    lines.push(
      `new Promise(function ${first}${index}(resolve, reject) {`,
      `  ${settlements}`,
      `}).then(promise${index}fulfilled, promise${index}rejected)`,
      `  .then(chain${index});`,
    );
  }
  for (let index = 0; index < schedule.pendingPromises; index += 1) {
    lines.push(`new Promise(function pending${index}() {});`);
  }
  for (const [index, timer] of schedule.timers.entries()) {
    lines.push(
      `const handle${index} = setTimeout(timer${index}, ${timer.delay});`,
    );
    if (timer.canceled) lines.push(`clearTimeout(handle${index});`);
  }
  lines.push('console.log("sync");');
  for (const [index] of schedule.awaits.entries()) {
    lines.push(`async${index}().then(asyncResult${index});`);
  }
  return `${lines.join("\n")}\n`;
}

function expectedOutput(schedule: Schedule): string {
  const lines = ["sync"];
  for (const [index] of schedule.awaits.entries()) {
    lines.push(`async start ${index}`);
  }
  for (const [index, command] of schedule.promises.entries()) {
    lines.push(
      `promise ${index} ${command.fulfill ? "fulfilled" : "rejected"} ` +
        `${command.value}`,
    );
  }
  for (const [index, command] of schedule.awaits.entries()) {
    lines.push(`async middle ${index} ${command.first}`);
  }
  for (const [index, command] of schedule.promises.entries()) {
    lines.push(`chain ${index} ${command.value}`);
  }
  for (const [index, command] of schedule.awaits.entries()) {
    lines.push(`async result ${index} ${command.first + command.second}`);
  }
  const timers = schedule.timers
    .map((timer, index) => ({ index, timer }))
    .filter(({ timer }) => !timer.canceled)
    .toSorted(
      (left, right) =>
        left.timer.delay - right.timer.delay || left.index - right.index,
    );
  for (const { index, timer } of timers) {
    lines.push(`timer ${index}`);
    for (let microtask = 0; microtask < timer.microtasks; microtask += 1) {
      lines.push(`microtask ${index} ${microtask}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function referenceObservations(source: string): Promise<
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
  const directory = await host.makeTemporaryDirectory("oseo-property-");
  const sourcePath = `${directory}/schedule.js`;
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
  } catch (error) {
    throw new Error(
      `Reference artifacts retained at ${directory}\nsource:\n${source}`,
      { cause: error },
    );
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test("generated asynchronous schedules match the M4 model", async () => {
  await assertAsyncProperty(
    "native asynchronous schedules retain modeled FIFO observations",
    fc.asyncProperty(scheduleArbitrary, async (schedule) => {
      const source = printSchedule(schedule);
      const expected = {
        exitStatus: 0,
        stderr: "",
        stdout: expectedOutput(schedule),
      };
      const references = await referenceObservations(source);
      assertMatchingObservations([expected, ...references]);
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          { source, sourceId: "generated-m4-schedule.js" },
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
              runtime: cRuntimeProvider,
              target: describeTarget("x86_64-linux-gnu"),
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
      domain: "bounded promise commands and deterministic timer schedules",
      numRuns: 10,
      profile: "M4 promises, jobs, timers, and shutdown",
      seed: 0x5eed_0003,
      sizeLimit: large
        ? "6 async calls, 12 promises, and 10 timers"
        : "3 async calls, 6 promises, and 5 timers",
      timeLimitMilliseconds: 120_000,
    },
  );
});
