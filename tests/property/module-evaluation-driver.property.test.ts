/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { runNativeCli } from "../native-cli.ts";
import { targetForExecutionHost } from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";

const { assertAsyncProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/**
 * One top-level statement after a module's `start` log. An `await`
 * suspends for one job and logs on resumption, a `probe` starts a promise
 * chain whose reactions log one per job, and a `throw` ends the body.
 */
type ModuleStep =
  | { readonly kind: "await" }
  | { readonly kind: "probe"; readonly length: number }
  | { readonly kind: "throw" };

/** One generated module: its static requests in source order and body. */
interface GeneratedModule {
  readonly imports: readonly number[];
  readonly steps: readonly ModuleStep[];
}

/** A static graph whose entry is module 0. */
interface GeneratedGraph {
  readonly modules: readonly GeneratedModule[];
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const large = propertySize() === "large";

const stepArbitrary: fc.Arbitrary<ModuleStep> = fc.oneof(
  { arbitrary: fc.constant({ kind: "await" } as const), weight: 4 },
  {
    arbitrary: fc.record({
      kind: fc.constant("probe" as const),
      length: fc.integer({ max: 3, min: 1 }),
    }),
    weight: 3,
  },
  { arbitrary: fc.constant({ kind: "throw" } as const), weight: 1 },
);

const graphArbitrary: fc.Arbitrary<GeneratedGraph> = fc
  .integer({ max: large ? 6 : 4, min: 2 })
  .chain((count) =>
    fc.record({
      modules: fc.array(
        fc.record({
          imports: fc.uniqueArray(fc.integer({ max: count - 1, min: 0 }), {
            maxLength: 3,
          }),
          steps: fc.array(stepArbitrary, { maxLength: large ? 4 : 3 }),
        }),
        { maxLength: count, minLength: count },
      ),
    }),
  )
  .map((graph) => ({
    // A body ends at its first throw, so later steps are never generated.
    modules: graph.modules.map((module, index) => {
      const throwAt = module.steps.findIndex((step) => step.kind === "throw");
      return {
        // The entry requests module 1 first so every graph has an edge.
        imports:
          index === 0 && !module.imports.includes(1)
            ? [1, ...module.imports]
            : module.imports,
        steps: throwAt < 0 ? module.steps : module.steps.slice(0, throwAt + 1),
      };
    }),
  }));

function moduleSource(graph: GeneratedGraph, index: number): string {
  const module = graph.modules[index]!;
  const lines = module.imports.map((target) => `import "./m${target}.mjs";`);
  lines.push(`console.log("m${index} start");`);
  for (const [position, step] of module.steps.entries()) {
    if (step.kind === "await") {
      lines.push("await 0;", `console.log("m${index} await${position}");`);
    } else if (step.kind === "probe") {
      const reactions = Array.from(
        { length: step.length },
        (_, reaction) =>
          `.then(() => console.log("m${index} probe${position}.${reaction}"))`,
      );
      lines.push(`Promise.resolve()${reactions.join("")};`);
    } else {
      lines.push(`throw new Error("m${index}");`);
    }
  }
  if (module.steps.at(-1)?.kind !== "throw") {
    lines.push(`console.log("m${index} end");`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The independent oracle: a TypeScript transcription of Evaluate,
 * InnerModuleEvaluation, ExecuteAsyncModule, GatherAvailableAncestors,
 * AsyncModuleExecutionFulfilled, and AsyncModuleExecutionRejected from
 * ECMA-262 16th edition clause 16.2.1.6, with a FIFO job queue standing in
 * for HostEnqueuePromiseJob. It never runs in a produced executable.
 */
interface ModelPromise {
  reactions: ((fulfilled: boolean, value: string) => void)[];
  state: "fulfilled" | "pending" | "rejected";
  value: string;
}

interface ModelRecord {
  /** The integer [[AsyncEvaluationOrder]] while `asyncState` is pending. */
  asyncOrder: number;
  asyncState: "done" | "pending" | "unset";
  asyncParents: number[];
  capability?: ModelPromise;
  cycleRoot?: number;
  dfsAncestorIndex: number;
  dfsIndex: number;
  error?: string;
  hasTopLevelAwait: boolean;
  pending: number;
  status: "evaluated" | "evaluating" | "evaluating-async" | "linked";
}

/** What the model observes: the full log and the entry's settlement. */
interface ModelOutcome {
  readonly error?: string;
  readonly log: readonly string[];
  readonly settledLogLength: number;
}

class ModelThrow {
  readonly error: string;
  constructor(error: string) {
    this.error = error;
  }
}

function newPromise(): ModelPromise {
  return { reactions: [], state: "pending", value: "" };
}

function modelEvaluation(graph: GeneratedGraph): ModelOutcome {
  const log: string[] = [];
  const queue: (() => void)[] = [];
  let asyncCount = 0;
  let settledLogLength = -1;
  const records: ModelRecord[] = graph.modules.map((module) => ({
    asyncOrder: 0,
    asyncParents: [],
    asyncState: "unset",
    dfsAncestorIndex: -1,
    dfsIndex: -1,
    hasTopLevelAwait: module.steps.some((step) => step.kind === "await"),
    pending: 0,
    status: "linked",
  }));
  const stack: number[] = [];

  const settle = (
    promise: ModelPromise,
    fulfilled: boolean,
    value: string,
  ): void => {
    if (promise.state !== "pending") return;
    promise.state = fulfilled ? "fulfilled" : "rejected";
    promise.value = value;
    for (const reaction of promise.reactions) {
      queue.push(() => reaction(fulfilled, value));
    }
    promise.reactions = [];
  };
  const then = (
    promise: ModelPromise,
    reaction: (fulfilled: boolean, value: string) => void,
  ): void => {
    if (promise.state === "pending") {
      promise.reactions.push(reaction);
    } else {
      const fulfilled = promise.state === "fulfilled";
      queue.push(() => reaction(fulfilled, promise.value));
    }
  };
  const probe = (index: number, position: number, length: number): void => {
    const run = (reaction: number): void => {
      log.push(`m${index} probe${position}.${reaction}`);
      if (reaction + 1 < length) queue.push(() => run(reaction + 1));
    };
    queue.push(() => run(0));
  };

  // A synchronous body throws ModelThrow; it has no await step.
  const executeSync = (index: number): void => {
    log.push(`m${index} start`);
    for (const [position, step] of graph.modules[index]!.steps.entries()) {
      if (step.kind === "probe") probe(index, position, step.length);
      else if (step.kind === "throw") throw new ModelThrow(`m${index}`);
    }
    log.push(`m${index} end`);
  };
  // An asynchronous body settles its capability instead of throwing.
  const executeAsync = (index: number, capability: ModelPromise): void => {
    const steps = graph.modules[index]!.steps;
    const resume = (from: number): void => {
      for (let position = from; position < steps.length; position += 1) {
        const step = steps[position]!;
        if (step.kind === "await") {
          queue.push(() => {
            log.push(`m${index} await${position}`);
            resume(position + 1);
          });
          return;
        }
        if (step.kind === "probe") probe(index, position, step.length);
        else {
          settle(capability, false, `m${index}`);
          return;
        }
      }
      log.push(`m${index} end`);
      settle(capability, true, "");
    };
    log.push(`m${index} start`);
    resume(0);
  };
  const cycleRoot = (index: number): number =>
    records[index]!.cycleRoot ?? index;

  const asyncRejected = (index: number, error: string): void => {
    const record = records[index]!;
    if (record.status === "evaluated") return;
    record.error = error;
    record.status = "evaluated";
    record.asyncState = "done";
    if (record.capability != null) settle(record.capability, false, error);
    for (const parent of record.asyncParents) asyncRejected(parent, error);
  };
  const gather = (index: number, list: number[]): void => {
    for (const parent of records[index]!.asyncParents) {
      if (list.includes(parent) || records[cycleRoot(parent)]!.error != null) {
        continue;
      }
      const record = records[parent]!;
      record.pending -= 1;
      if (record.pending === 0) {
        list.push(parent);
        if (!record.hasTopLevelAwait) gather(parent, list);
      }
    }
  };
  const asyncFulfilled = (index: number): void => {
    const record = records[index]!;
    if (record.status === "evaluated") return;
    record.asyncState = "done";
    record.status = "evaluated";
    if (record.capability != null) settle(record.capability, true, "");
    const list: number[] = [];
    gather(index, list);
    list.sort(
      (left, right) => records[left]!.asyncOrder - records[right]!.asyncOrder,
    );
    for (const member of list) {
      const memberRecord = records[member]!;
      if (memberRecord.status === "evaluated") continue;
      if (memberRecord.hasTopLevelAwait) {
        executeAsyncModule(member);
        continue;
      }
      try {
        executeSync(member);
      } catch (thrown) {
        if (!(thrown instanceof ModelThrow)) throw thrown;
        asyncRejected(member, thrown.error);
        continue;
      }
      memberRecord.asyncState = "done";
      memberRecord.status = "evaluated";
      if (memberRecord.capability != null) {
        settle(memberRecord.capability, true, "");
      }
    }
  };
  function executeAsyncModule(index: number): void {
    const capability = newPromise();
    then(capability, (fulfilled, value) => {
      if (fulfilled) asyncFulfilled(index);
      else asyncRejected(index, value);
    });
    executeAsync(index, capability);
  }
  const inner = (index: number, dfsIndex: number): number => {
    const record = records[index]!;
    if (record.status === "evaluating-async" || record.status === "evaluated") {
      if (record.error != null) throw new ModelThrow(record.error);
      return dfsIndex;
    }
    if (record.status === "evaluating") return dfsIndex;
    record.status = "evaluating";
    record.dfsIndex = dfsIndex;
    record.dfsAncestorIndex = dfsIndex;
    record.pending = 0;
    let next = dfsIndex + 1;
    stack.push(index);
    for (const requested of graph.modules[index]!.imports) {
      next = inner(requested, next);
      let required = requested;
      if (records[required]!.status === "evaluating") {
        record.dfsAncestorIndex = Math.min(
          record.dfsAncestorIndex,
          records[required]!.dfsAncestorIndex,
        );
      } else {
        required = cycleRoot(required);
        const error = records[required]!.error;
        if (error != null) throw new ModelThrow(error);
      }
      if (records[required]!.asyncState === "pending") {
        record.pending += 1;
        records[required]!.asyncParents.push(index);
      }
    }
    if (record.pending > 0 || record.hasTopLevelAwait) {
      asyncCount += 1;
      record.asyncOrder = asyncCount;
      record.asyncState = "pending";
      if (record.pending === 0) executeAsyncModule(index);
    } else {
      executeSync(index);
    }
    if (record.dfsAncestorIndex === record.dfsIndex) {
      for (;;) {
        const member = stack.pop()!;
        const memberRecord = records[member]!;
        memberRecord.status =
          memberRecord.asyncState === "unset"
            ? "evaluated"
            : "evaluating-async";
        memberRecord.cycleRoot = index;
        if (member === index) break;
      }
    }
    return next;
  };

  const entry = records[0]!;
  const capability = newPromise();
  entry.capability = capability;
  const recordSettlement = (): void => {
    if (settledLogLength < 0 && capability.state !== "pending") {
      settledLogLength = log.length;
    }
  };
  try {
    inner(0, 0);
    if (entry.status === "evaluated") settle(capability, true, "");
  } catch (thrown) {
    if (!(thrown instanceof ModelThrow)) throw thrown;
    for (const member of stack) {
      records[member]!.status = "evaluated";
      records[member]!.error = thrown.error;
    }
    stack.length = 0;
    settle(capability, false, thrown.error);
  }
  recordSettlement();
  while (queue.length > 0) {
    queue.shift()!();
    recordSettlement();
  }
  assert.notEqual(capability.state, "pending", "the model entry settles");
  if (capability.state === "rejected") {
    return { error: capability.value, log, settledLogLength };
  }
  return { log, settledLogLength };
}

function text(lines: readonly string[]): string {
  return lines.map((line) => `${line}\n`).join("");
}

/**
 * A reference host may stop running jobs once it reports the entry's
 * rejection, so its output lies between the model's log at that point
 * and the model's fully drained log.
 */
function assertReference(
  label: string,
  observation: { exitStatus: number; stderr: string; stdout: string },
  outcome: ModelOutcome,
): void {
  if (outcome.error == null) {
    assert.deepEqual(
      observation,
      { exitStatus: 0, stderr: "", stdout: text(outcome.log) },
      label,
    );
    return;
  }
  assert.notEqual(observation.exitStatus, 0, label);
  assert.match(observation.stderr, new RegExp(`Error: ${outcome.error}\\b`));
  const minimum = text(outcome.log.slice(0, outcome.settledLogLength));
  const full = text(outcome.log);
  assert.ok(
    observation.stdout.startsWith(minimum) &&
      full.startsWith(observation.stdout),
    `${label} stdout=${JSON.stringify(observation.stdout)}`,
  );
}

async function assertGraph(graph: GeneratedGraph): Promise<void> {
  const outcome = modelEvaluation(graph);
  const directory = await host.makeTemporaryDirectory(
    "oseo-module-driver-property-",
  );
  let succeeded = false;
  try {
    for (const index of graph.modules.keys()) {
      await host.writeTextFile(
        `${directory}/m${index}.mjs`,
        moduleSource(graph, index),
      );
    }
    const entry = `${directory}/m0.mjs`;
    assertReference(
      "Node.js",
      await host.run({
        args: [entry],
        command: process.execPath,
        cwd: directory,
      }),
      outcome,
    );
    assertReference(
      "Deno",
      await host.run({
        args: ["run", "--quiet", entry],
        command: "deno",
        cwd: directory,
      }),
      outcome,
    );
    for (const specialization of ["disabled", "enabled"] as const) {
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        const native = await runNativeCli(
          {
            args: [
              ...(specialization === "disabled" ? ["--no-specialization"] : []),
              entry,
            ],
            version: "0.1.0",
          },
          host,
        );
        // The native event loop drains every job before it reports a
        // rejected entry, so it prints the model's whole log.
        assert.equal(native.stdout, text(outcome.log), specialization);
        if (outcome.error == null) {
          assert.equal(native.exitStatus, 0, native.stderr);
          assert.equal(native.stderr, "");
        } else {
          assert.equal(native.exitStatus, 1);
          assert.match(
            native.stderr,
            new RegExp(`error\\[OSEO2001\\]: Error: ${outcome.error}\\n`),
          );
        }
      } finally {
        delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      }
    }
    succeeded = true;
  } catch (error) {
    throw new Error(
      `Module driver property artifacts retained at ${directory}\n` +
        `graph=${JSON.stringify(graph)}`,
      { cause: error },
    );
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated static module graphs follow the edition's evaluation order",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    await assertAsyncProperty(
      "the runtime module driver matches the edition model, Node.js, " +
        "and Deno on static graphs",
      fc.asyncProperty(graphArbitrary, assertGraph),
      {
        context:
          nativeTarget == null || host.executionHost == null
            ? ["target=unsupported host=unknown"]
            : [
                `target=${nativeTarget.name}`,
                `host=${host.executionHost.operatingSystem}/` +
                  host.executionHost.architecture,
                "native-collector=forced",
              ],
        domain:
          "static module graphs of two to four modules (six when large) " +
          "with up to three requests each, or four for the entry, which " +
          "always requests module 1, including self-requests and cycles, " +
          "whose bodies await, start promise reaction chains, or throw " +
          "before or after their first await",
        numRuns: 6,
        profile: "Runtime module evaluation driver",
        seed: 0x6000_9600,
        sizeLimit:
          "at most six modules, three requests per module and four for " +
          "the entry, four steps per body, and three reactions per chain",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
