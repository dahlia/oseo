/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  printMir,
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

/** One generated helper stage in the pipeline under test. */
interface Stage {
  readonly kind: "drop" | "filter" | "flatMap" | "map" | "take";
  /** The addend `map` applies and the divisor `filter` tests against. */
  readonly operand: number;
  /** The count `drop` skips and `take` admits; unused by the others. */
  readonly limit: number;
}

interface HelpersCase {
  /** How many results the consumer pulls before closing the pipeline. */
  readonly consumed: number;
  /** The limit of the trailing `take` stage, absent when negative. */
  readonly takeLimit: number;
  readonly source: readonly number[];
  readonly stages: readonly Stage[];
}

const stageArbitrary: fc.Arbitrary<Stage> = fc.record({
  kind: fc.constantFrom("drop", "filter", "flatMap", "map"),
  limit: fc.integer({ max: 3, min: 0 }),
  operand: fc.integer({ max: 3, min: 1 }),
});

const caseArbitrary: fc.Arbitrary<HelpersCase> = fc.record({
  consumed: fc.integer({ max: 6, min: 0 }),
  source: fc.array(fc.integer({ max: 9, min: -9 }), {
    maxLength: 5,
    minLength: 0,
  }),
  stages: fc.array(stageArbitrary, { maxLength: 3, minLength: 1 }),
  takeLimit: fc.integer({ max: 4, min: -1 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function stageSource(stage: Stage, index: number): string {
  if (stage.kind === "map") {
    return `iterator = iterator.map((v, i) => {
  trace.push("m${index}:" + i);
  return v + ${stage.operand};
});`;
  }
  if (stage.kind === "filter") {
    return `iterator = iterator.filter((v, i) => {
  trace.push("f${index}:" + i);
  return v % ${stage.operand} !== 0;
});`;
  }
  if (stage.kind === "drop") {
    return `iterator = iterator.drop(${stage.limit});`;
  }
  if (stage.kind === "take") {
    return `iterator = iterator.take(${stage.limit});`;
  }
  return `iterator = iterator.flatMap((v, i) => {
  trace.push("x${index}:" + i);
  return [v, v + ${stage.operand}];
});`;
}

/**
 * The stage list both the printed program and the model consume, so a
 * trailing `take` keeps the same index in the emitted trace labels and in
 * the predicted one.
 */
function pipelineStages(testCase: HelpersCase): readonly Stage[] {
  if (testCase.takeLimit < 0) return testCase.stages;
  return [
    ...testCase.stages,
    { kind: "take", limit: testCase.takeLimit, operand: 1 },
  ];
}

function printCase(testCase: HelpersCase): string {
  const stages = pipelineStages(testCase)
    .map((stage, index) => stageSource(stage, index))
    .join("\n");
  return `
const values = [${testCase.source.join(", ")}];
let cursor = 0;
let returnCalls = 0;
const trace = [];
let iterator = {
  __proto__: Iterator.prototype,
  next() {
    if (cursor >= values.length) return { done: true, value: undefined };
    const value = values[cursor];
    cursor = cursor + 1;
    return { done: false, value };
  },
  return() {
    returnCalls = returnCalls + 1;
    return {};
  },
};
${stages}
const collected = [];
let closedEarly = false;
while (collected.length < ${testCase.consumed}) {
  const result = iterator.next();
  if (result.done) break;
  collected.push(result.value);
}
if (collected.length === ${testCase.consumed}) {
  const closed = iterator.return();
  closedEarly = closed.done;
}
console.log("values", collected.join(","));
console.log("trace", trace.join(","));
console.log("returns", returnCalls, closedEarly);
let turn = 0;
while (turn < 2) {
  console.log("guard", Iterator.prototype.map === Iterator.prototype.map);
  if (turn === 0) Iterator.prototype.marker = ${testCase.stages.length};
  turn = turn + 1;
}
delete Iterator.prototype.marker;
`;
}

/** One stage's live simulator state in the independent pull model. */
interface StageState {
  counter: number;
  prefixDropped: boolean;
  queue: number[];
  remaining: number;
  state: "completed" | "start" | "suspended";
  readonly stage: Stage;
}

interface Pulled {
  readonly done: boolean;
  readonly value: number;
}

const exhausted: Pulled = { done: true, value: 0 };

/** The observation the independent model predicts for one case. */
interface Prediction {
  readonly collected: readonly number[];
  readonly closedEarly: boolean;
  readonly returnCalls: number;
  readonly trace: readonly string[];
}

/**
 * The independent pull model the generated pipeline is measured against.
 *
 * It is a hand-written demand-driven simulator rather than a second use of
 * a host's iterator helpers: each stage keeps its own counter, remaining
 * count, and flattened queue, and records the [[GeneratorState]]
 * transitions that decide whether a close reaches the source. Stage -1 is
 * the source object, whose `return` runs on every close that reaches it.
 */
function predict(testCase: HelpersCase, stages: readonly Stage[]): Prediction {
  const states: StageState[] = stages.map((stage) => ({
    counter: 0,
    prefixDropped: false,
    queue: [],
    remaining: stage.limit,
    stage,
    state: "start",
  }));
  const trace: string[] = [];
  let cursor = 0;
  let returnCalls = 0;

  function stateAt(index: number): StageState {
    const state = states[index];
    assert.ok(state != null, "modeled stage");
    return state;
  }

  function close(index: number): void {
    if (index < 0) {
      returnCalls += 1;
      return;
    }
    const current = stateAt(index);
    if (current.state === "completed") return;
    current.state = "completed";
    close(index - 1);
  }

  function pull(index: number): Pulled {
    if (index < 0) {
      const value = testCase.source[cursor];
      if (value == null) return exhausted;
      cursor += 1;
      return { done: false, value };
    }
    const current = stateAt(index);
    if (current.state === "completed") return exhausted;
    const stage = current.stage;
    for (;;) {
      if (stage.kind === "take" && current.remaining === 0) {
        current.state = "completed";
        close(index - 1);
        return exhausted;
      }
      if (stage.kind === "flatMap" && current.queue.length > 0) {
        const pending = current.queue.shift();
        assert.ok(pending != null, "queued flattened value");
        current.state = "suspended";
        return { done: false, value: pending };
      }
      if (stage.kind === "drop" && !current.prefixDropped) {
        while (current.remaining > 0) {
          current.remaining -= 1;
          if (pull(index - 1).done) {
            current.prefixDropped = true;
            current.state = "completed";
            return exhausted;
          }
        }
        current.prefixDropped = true;
      }
      if (stage.kind === "take") current.remaining -= 1;
      const stepped = pull(index - 1);
      if (stepped.done) {
        current.state = "completed";
        return exhausted;
      }
      if (stage.kind === "drop" || stage.kind === "take") {
        current.state = "suspended";
        return { done: false, value: stepped.value };
      }
      const counter = current.counter;
      current.counter = counter + 1;
      if (stage.kind === "map") {
        trace.push(`m${index}:${counter}`);
        current.state = "suspended";
        return { done: false, value: stepped.value + stage.operand };
      }
      if (stage.kind === "filter") {
        trace.push(`f${index}:${counter}`);
        if (stepped.value % stage.operand !== 0) {
          current.state = "suspended";
          return { done: false, value: stepped.value };
        }
        continue;
      }
      trace.push(`x${index}:${counter}`);
      current.queue = [stepped.value, stepped.value + stage.operand];
    }
  }

  const last = stages.length - 1;
  const collected: number[] = [];
  while (collected.length < testCase.consumed) {
    const result = pull(last);
    if (result.done) break;
    collected.push(result.value);
  }
  let closedEarly = false;
  if (collected.length === testCase.consumed) {
    close(last);
    closedEarly = true;
  }
  return { collected, closedEarly, returnCalls, trace };
}

function expected(testCase: HelpersCase): string {
  const prediction = predict(testCase, pipelineStages(testCase));
  return [
    `values ${prediction.collected.join(",")}`,
    `trace ${prediction.trace.join(",")}`,
    `returns ${prediction.returnCalls} ${prediction.closedEarly}`,
    "guard true",
    "guard true",
    "",
  ].join("\n");
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
    "oseo-iterator-helpers-lazy-property-",
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
  "generated lazy iterator helper pipelines match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "a helper pipeline yields the modeled values and closes once",
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
            { source, sourceId: "generated-m5-iterator-helpers-lazy.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-object/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /property-get generic/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:object|shape)/u);
          }
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
              (native) => {
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters?.collections != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "enabled") {
                  assert.ok(native.counters.guardMisses > 0);
                }
              },
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
          "one to three map, filter, drop, and flatMap stages over at most " +
          "five source values, an optional trailing take limit, a bounded " +
          "early close, and a deliberate prototype shape-guard miss",
        numRuns: 10,
        profile: "M5 lazy iterator helpers",
        seed: 0x6000_5e00,
        sizeLimit:
          "at most five source values, four helper stages, six pulled " +
          "results, and one close per pipeline",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
