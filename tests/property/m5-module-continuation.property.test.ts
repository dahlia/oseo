/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { runNativeCli } from "../../packages/cli/src/index.ts";
import { targetForExecutionHost } from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";

const { assertAsyncProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

interface ModuleSchedule {
  readonly aliases: boolean;
  readonly awaitCounts: readonly number[];
  readonly cycleFirst: boolean;
  readonly observerIndex: number;
  readonly siblings: readonly number[];
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const large = propertySize() === "large";
const scheduleArbitrary = fc
  .record({
    aliases: fc.boolean(),
    asyncSelector: fc.nat(),
    awaitCounts: fc.array(fc.integer({ max: 3, min: 0 }), {
      maxLength: large ? 4 : 3,
      minLength: 2,
    }),
    cycleFirst: fc.boolean(),
    observerSelector: fc.nat(),
    siblings: fc.uniqueArray(fc.integer({ max: 9, min: 0 }), {
      maxLength: large ? 3 : 2,
    }),
  })
  .map((value): ModuleSchedule => {
    const asyncIndex = value.asyncSelector % value.awaitCounts.length;
    return {
      aliases: value.aliases,
      awaitCounts: value.awaitCounts.map((count, index) =>
        index === asyncIndex ? Math.max(1, count) : count,
      ),
      cycleFirst: value.cycleFirst,
      observerIndex:
        1 + (value.observerSelector % (value.awaitCounts.length - 1)),
      siblings: value.siblings,
    };
  });

function cycleSource(index: number, schedule: ModuleSchedule): string {
  const next = (index + 1) % schedule.awaitCounts.length;
  const awaits = Array.from(
    { length: schedule.awaitCounts[index] ?? 1 },
    () => "await Promise.resolve();",
  );
  return [
    `import "./cycle-${next}.mjs";`,
    `export let state${index} = "pending-${index}";`,
    `console.log("cycle start", ${index});`,
    ...awaits,
    `state${index} = "ready-${index}";`,
    `console.log("cycle done", ${index});`,
  ].join("\n");
}

function entrySource(schedule: ModuleSchedule): string {
  const last = schedule.awaitCounts.length - 1;
  const cycleImports = [
    'import { state0 } from "./cycle-0.mjs";',
    'import "./observer.mjs";',
    `import { state${last} } from "./cycle-${last}.mjs";`,
    ...(schedule.aliases ? ['import "././cycle-0.mjs";'] : []),
  ];
  const siblingImports = schedule.siblings.map(
    (value) => `import "./sibling-${value}.mjs";`,
  );
  return [
    ...(schedule.cycleFirst
      ? [...cycleImports, ...siblingImports]
      : [...siblingImports, ...cycleImports]),
    `console.log("entry", state0, state${last});`,
  ].join("\n");
}

function expectedOutput(schedule: ModuleSchedule): string {
  const cyclePrefix: string[] = [];
  const last = schedule.awaitCounts.length - 1;
  let firstPending = last;
  for (let index = last; index >= 0; index -= 1) {
    cyclePrefix.push(`cycle start ${index}`);
    if ((schedule.awaitCounts[index] ?? 0) > 0) {
      firstPending = index;
      break;
    }
    cyclePrefix.push(`cycle done ${index}`);
  }
  const siblings = schedule.siblings.map((value) => `sibling ${value}`);
  const lines = schedule.cycleFirst
    ? [...cyclePrefix, ...siblings]
    : [...siblings, ...cyclePrefix];
  for (let index = firstPending; index >= 0; index -= 1) {
    lines.push(`cycle done ${index}`);
    if (index > 0) {
      lines.push(`cycle start ${index - 1}`);
    }
  }
  lines.push(`observer ready-${schedule.observerIndex}`);
  lines.push(`entry ready-0 ready-${last}`);
  return `${lines.join("\n")}\n`;
}

async function assertNativeSchedule(schedule: ModuleSchedule): Promise<void> {
  const directory = await host.makeTemporaryDirectory("oseo-module-property-");
  let succeeded = false;
  try {
    for (let index = 0; index < schedule.awaitCounts.length; index += 1) {
      await host.writeTextFile(
        `${directory}/cycle-${index}.mjs`,
        cycleSource(index, schedule),
      );
    }
    for (const value of schedule.siblings) {
      await host.writeTextFile(
        `${directory}/sibling-${value}.mjs`,
        `console.log("sibling", ${value});\n`,
      );
    }
    await host.writeTextFile(
      `${directory}/observer.mjs`,
      `import { state${schedule.observerIndex} } from ` +
        `"./cycle-${schedule.observerIndex}.mjs";\n` +
        `console.log("observer", state${schedule.observerIndex});\n`,
    );
    const entry = `${directory}/entry.mjs`;
    await host.writeTextFile(entry, entrySource(schedule));
    const expected = expectedOutput(schedule);
    for (const specialization of ["disabled", "enabled"] as const) {
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        const result = await runNativeCli(
          {
            args: [
              ...(specialization === "disabled" ? ["--no-specialization"] : []),
              entry,
            ],
            version: "0.1.0",
          },
          host,
        );
        assert.equal(result.exitStatus, 0, result.stderr);
        assert.equal(result.stderr, "");
        assert.equal(result.stdout, expected);
      } finally {
        delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      }
    }
    succeeded = true;
  } catch (error) {
    throw new Error(
      `Module property artifacts retained at ${directory}\n` +
        `schedule=${JSON.stringify(schedule)}`,
      { cause: error },
    );
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated module graphs follow the continuation schedule model",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    await assertAsyncProperty(
      "module continuations preserve SCC and caller-return order",
      fc.asyncProperty(scheduleArbitrary, assertNativeSchedule),
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
          "structured 2-4 node async SCCs, canonical aliases, ordered " +
          "siblings, non-root observers, sync members, and 0-3 FIFO await " +
          "checkpoints per node",
        numRuns: 8,
        profile: "M5a Unit 7.7 module continuation and cycle schedules",
        seed: 0x6000_1f00,
        sizeLimit: large
          ? "4 cycle nodes, 3 siblings, and 3 awaits per node"
          : "3 cycle nodes, 2 siblings, and 3 awaits per node",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
