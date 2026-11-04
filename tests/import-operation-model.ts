/**
 * Generated module programs with static and literal `import()` requests,
 * and an independent model of how ECMA-262 16th edition evaluates them
 * when the host completes HostLoadImportedModule synchronously.
 *
 * The model transcribes Evaluate, InnerModuleEvaluation,
 * ExecuteAsyncModule, GatherAvailableAncestors,
 * AsyncModuleExecutionFulfilled, AsyncModuleExecutionRejected,
 * EvaluateImportCall, and ContinueDynamicImport from clause 16.2.1.6 and
 * clause 13.3.10, with a FIFO job queue standing in for
 * HostEnqueuePromiseJob. It is test code and never runs in a produced
 * executable. The import-operation fixed fixtures and property suite
 * compare native traces with it exactly; Node.js and Deno load modules
 * asynchronously, so they are compared only on host-independent facts.
 */

/**
 * One top-level statement after a module's `start` log. An `await`
 * suspends for one job and logs on resumption; a `probe` starts a promise
 * chain whose reactions log one per job; an `import` requests a module
 * and logs the namespace's `id` export or the rejection's message, either
 * from a reaction or, when awaited, after resuming; a `throw` ends the
 * body.
 */
export type ModuleStep =
  | { readonly kind: "await" }
  | {
      readonly awaited: boolean;
      readonly kind: "import";
      readonly target: number;
    }
  | { readonly kind: "probe"; readonly length: number }
  | { readonly kind: "throw" };

/** One generated module: its static requests in source order and body. */
export interface GeneratedModule {
  readonly imports: readonly number[];
  readonly steps: readonly ModuleStep[];
}

/** A module program whose entry is module 0. */
export interface GeneratedProgram {
  readonly modules: readonly GeneratedModule[];
}

/** What the model observes: the full log and the entry's settlement. */
export interface ModelOutcome {
  /** The entry's rejection, as the thrown error's message. */
  readonly error?: string;
  readonly log: readonly string[];
  /** The log length when the entry settled, or -1 if it never did. */
  readonly settledLogLength: number;
  /** True when the entry's evaluation never settles. */
  readonly stalled: boolean;
  /** True when some module's asynchronous evaluation never finishes. */
  readonly unsettled: boolean;
}

/** Whether a module body suspends, which makes it asynchronous. */
export function hasTopLevelAwait(module: GeneratedModule): boolean {
  return module.steps.some(
    (step) => step.kind === "await" || (step.kind === "import" && step.awaited),
  );
}

/** The source text of one generated module, `m<index>.mjs`. */
export function moduleSource(program: GeneratedProgram, index: number): string {
  const module = program.modules[index]!;
  const lines = module.imports.map((target) => `import "./m${target}.mjs";`);
  lines.push(`export const id = "m${index}";`);
  lines.push(`console.log("m${index} start");`);
  for (const [position, step] of module.steps.entries()) {
    const label = `m${index} step${position}`;
    if (step.kind === "await") {
      lines.push("await 0;", `console.log("${label}");`);
    } else if (step.kind === "probe") {
      const reactions = Array.from(
        { length: step.length },
        (_, reaction) => `.then(() => console.log("${label}.${reaction}"))`,
      );
      lines.push(`Promise.resolve()${reactions.join("")};`);
    } else if (step.kind === "import" && step.awaited) {
      lines.push(
        "try {",
        `  const ns = await import("./m${step.target}.mjs");`,
        `  console.log("${label} " + ns.id);`,
        "} catch (error) {",
        `  console.log("${label} " + error.message);`,
        "}",
      );
    } else if (step.kind === "import") {
      lines.push(
        `import("./m${step.target}.mjs").then(`,
        `  (ns) => console.log("${label} " + ns.id),`,
        `  (error) => console.log("${label} " + error.message),`,
        ");",
      );
    } else {
      lines.push(`throw new Error("m${index}");`);
    }
  }
  if (module.steps.at(-1)?.kind !== "throw") {
    lines.push(`console.log("m${index} end");`);
  }
  return `${lines.join("\n")}\n`;
}

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

class ModelThrow {
  readonly error: string;
  constructor(error: string) {
    this.error = error;
  }
}

function newPromise(): ModelPromise {
  return { reactions: [], state: "pending", value: "" };
}

/** Evaluate the program's entry and drain every job. */
export function modelProgram(program: GeneratedProgram): ModelOutcome {
  const log: string[] = [];
  const queue: (() => void)[] = [];
  let asyncCount = 0;
  const records: ModelRecord[] = program.modules.map((module) => ({
    asyncOrder: 0,
    asyncParents: [],
    asyncState: "unset",
    dfsAncestorIndex: -1,
    dfsIndex: -1,
    hasTopLevelAwait: hasTopLevelAwait(module),
    pending: 0,
    status: "linked",
  }));

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
  // PerformPromiseThen; `await` of a native promise is the same step.
  const then = (
    promise: ModelPromise,
    reaction: (fulfilled: boolean, value: string) => void,
  ): void => {
    if (promise.state === "pending") {
      promise.reactions.push(reaction);
    } else {
      const fulfilled = promise.state === "fulfilled";
      const { value } = promise;
      queue.push(() => reaction(fulfilled, value));
    }
  };
  const probe = (label: string, length: number): void => {
    const run = (reaction: number): void => {
      log.push(`${label}.${reaction}`);
      if (reaction + 1 < length) queue.push(() => run(reaction + 1));
    };
    queue.push(() => run(0));
  };
  const cycleRoot = (index: number): number =>
    records[index]!.cycleRoot ?? index;

  // EvaluateImportCall: a fresh promise, and ContinueDynamicImport's
  // reaction on the already fulfilled LoadRequestedModules promise.
  const importCall = (target: number): ModelPromise => {
    const promise = newPromise();
    queue.push(() => {
      const evaluation = evaluate(target);
      then(evaluation, (fulfilled, value) => {
        // A generated namespace has no `then` export, so resolving with
        // it fulfills at once.
        settle(promise, fulfilled, fulfilled ? `m${target}` : value);
      });
    });
    return promise;
  };

  // A synchronous body throws ModelThrow; it has no awaiting step.
  const executeSync = (index: number): void => {
    log.push(`m${index} start`);
    for (const [position, step] of program.modules[index]!.steps.entries()) {
      const label = `m${index} step${position}`;
      if (step.kind === "probe") probe(label, step.length);
      else if (step.kind === "import") {
        then(importCall(step.target), (_, value) =>
          log.push(`${label} ${value}`),
        );
      } else if (step.kind === "throw") throw new ModelThrow(`m${index}`);
    }
    log.push(`m${index} end`);
  };
  // An asynchronous body settles its capability instead of throwing.
  const executeAsync = (index: number, capability: ModelPromise): void => {
    const steps = program.modules[index]!.steps;
    const resume = (from: number): void => {
      for (let position = from; position < steps.length; position += 1) {
        const step = steps[position]!;
        const label = `m${index} step${position}`;
        if (step.kind === "await") {
          // `await 0` resolves a new promise with 0 and reacts to it.
          queue.push(() => {
            log.push(label);
            resume(position + 1);
          });
          return;
        }
        if (step.kind === "probe") probe(label, step.length);
        else if (step.kind === "import" && step.awaited) {
          then(importCall(step.target), (_, value) => {
            log.push(`${label} ${value}`);
            resume(position + 1);
          });
          return;
        } else if (step.kind === "import") {
          then(importCall(step.target), (_, value) =>
            log.push(`${label} ${value}`),
          );
        } else {
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
  const inner = (index: number, dfsIndex: number, stack: number[]): number => {
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
    for (const requested of program.modules[index]!.imports) {
      next = inner(requested, next, stack);
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
  // Evaluate. A finished root settles a capability it gets only now, as
  // the edition's fix for a later request of a finished graph requires.
  function evaluate(index: number): ModelPromise {
    let module = index;
    const status = records[module]!.status;
    if (status === "evaluating-async" || status === "evaluated") {
      module = cycleRoot(module);
    }
    const existing = records[module]!.capability;
    if (existing != null) return existing;
    const capability = newPromise();
    records[module]!.capability = capability;
    const stack: number[] = [];
    try {
      inner(module, 0, stack);
      if (records[module]!.status === "evaluated") {
        settle(capability, true, "");
      }
    } catch (thrown) {
      if (!(thrown instanceof ModelThrow)) throw thrown;
      for (const member of stack) {
        records[member]!.status = "evaluated";
        records[member]!.error = thrown.error;
      }
      records[module]!.error ??= thrown.error;
      settle(capability, false, thrown.error);
    }
    return capability;
  }

  const entry = evaluate(0);
  let settledLogLength = entry.state === "pending" ? -1 : log.length;
  while (queue.length > 0) {
    queue.shift()!();
    if (settledLogLength < 0 && entry.state !== "pending") {
      settledLogLength = log.length;
    }
  }
  const outcome = {
    log,
    settledLogLength,
    stalled: entry.state === "pending",
    unsettled: records.some((record) => record.asyncState === "pending"),
  };
  if (entry.state !== "rejected") return outcome;
  return { ...outcome, error: entry.value };
}

/** The log as process output, one line per entry. */
export function logText(lines: readonly string[]): string {
  return lines.map((line) => `${line}\n`).join("");
}

/** The log lines as a sorted multiset for host-independent comparison. */
export function sortedLines(text: string): readonly string[] {
  return text
    .split("\n")
    .filter((line) => line !== "")
    .toSorted();
}
