/**
 * Generated evidence for the clock and wakeup boundary of ADR 0025.
 *
 * Each case is a structured schedule: a tree of timer and microtask
 * callbacks whose actions schedule, cancel, read epoch real time, request
 * wakeups, run long, or inject a wall-clock discontinuity, plus a script
 * for the deterministic adapter's waits that resumes late, returns
 * spuriously, moves real time forward or backward, or fails. The runtime's
 * own timer queue runs each schedule through
 * *tests/native-io/clock-scheduler.c*, once normally and once with a
 * collection forced at every safepoint, and both traces must equal the
 * independent model below.
 *
 * The model is the oracle: it states the scheduler contract directly,
 * with no reference to the C sources. Deadlines are whole milliseconds
 * past the monotonic origin that the first clock use takes, computed from
 * the scheduler time a task cached when it started; a turn waits until the
 * earliest live deadline has elapsed; equal deadlines keep registration
 * order; each task drains the FIFO microtask queue before the next one
 * starts; canceled timers never cause a wait; and real time, whatever the
 * script does to it, never moves a deadline. A missing monotonic clock or
 * a failed wait ends the run with the owned diagnostic, and the adapter is
 * closed exactly once at shutdown.
 *
 * Specialization policies do not apply: no compiled JavaScript runs, and
 * the fixed differential fixture `monotonic-timer-wakeups` in
 * *tests/native/fixtures/async.ts* covers both policies and a guard miss.
 * Platform timing is not generated either, because a loaded host's late
 * wakeup is not a replayable input; *tests/native-io/clock-wakeup.test.ts*
 * retains that evidence.
 *
 * Replay a failure with `OSEO_PROPERTY_SEED` and `OSEO_PROPERTY_PATH`.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import {
  buildClockProgram,
  hostClockTarget,
  runClockScheduler,
} from "../../tools/native-io/clock.ts";
import type { ClockBuild } from "../../tools/native-io/clock.ts";

const { assertAsyncProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

const nanosecondsPerMillisecond = 1_000_000;

/** One action a callback performs when it runs, before child allocation. */
type ActionTemplate =
  | { readonly delay: number; readonly kind: "timer" }
  | { readonly kind: "cancel"; readonly target: number }
  | { readonly kind: "micro" }
  | { readonly kind: "real" }
  | { readonly kind: "wake" }
  | { readonly kind: "advance"; readonly nanoseconds: number }
  | { readonly kind: "set-real"; readonly milliseconds: number };

/** One action with its child node assigned. */
type Action =
  | { readonly child: number; readonly delay: number; readonly kind: "timer" }
  | { readonly kind: "cancel"; readonly target: number }
  | { readonly child: number; readonly kind: "micro" }
  | { readonly kind: "real" }
  | { readonly kind: "wake" }
  | { readonly kind: "advance"; readonly nanoseconds: number }
  | { readonly kind: "set-real"; readonly milliseconds: number };

/** One scripted deterministic wait. */
interface WaitStep {
  readonly fail: boolean;
  readonly jump: number;
  readonly late: number;
  readonly spurious: boolean;
}

/** One generated schedule before child nodes are assigned. */
interface ScheduleTemplate {
  readonly monotonic: number;
  readonly nodes: readonly (readonly ActionTemplate[])[];
  readonly realTime: number;
  readonly steps: readonly WaitStep[];
  readonly unavailable: "monotonic" | "none" | "real";
}

/** One schedule the harness runs and the model predicts. */
interface Schedule {
  readonly monotonic: number;
  readonly nodes: readonly (readonly Action[])[];
  readonly realTime: number;
  readonly steps: readonly WaitStep[];
  readonly unavailable: "monotonic" | "none" | "real";
}

const large = propertySize() === "large";
const maximumNodes = large ? 48 : 20;
const maximumActions = large ? 6 : 4;

/* Small delay sets make equal deadlines common. */
const delayArbitrary = fc.constantFrom(0, 0, 1, 2, 5, 5, 10, 25);

function actionTemplateArbitrary(
  failures: boolean,
): fc.Arbitrary<ActionTemplate> {
  return fc.oneof(
    {
      arbitrary: fc.record({
        delay: delayArbitrary,
        kind: fc.constant("timer" as const),
      }),
      weight: 5,
    },
    {
      arbitrary: fc.record({
        kind: fc.constant("cancel" as const),
        target: fc.integer({ max: maximumNodes - 1, min: 1 }),
      }),
      weight: 2,
    },
    {
      arbitrary: fc.record({ kind: fc.constant("micro" as const) }),
      weight: 3,
    },
    { arbitrary: fc.record({ kind: fc.constant("real" as const) }), weight: 2 },
    { arbitrary: fc.record({ kind: fc.constant("wake" as const) }), weight: 1 },
    {
      arbitrary: fc.record({
        kind: fc.constant("advance" as const),
        nanoseconds: fc.integer({
          max: 30 * nanosecondsPerMillisecond,
          min: 0,
        }),
      }),
      weight: failures ? 1 : 2,
    },
    {
      arbitrary: fc.record({
        kind: fc.constant("set-real" as const),
        milliseconds: fc.integer({
          max: 4_000_000_000_000,
          min: -1_000_000_000_000,
        }),
      }),
      weight: 1,
    },
  );
}

function stepArbitrary(failures: boolean): fc.Arbitrary<WaitStep> {
  return fc.record({
    fail: failures ? fc.boolean() : fc.constant(false),
    jump: fc.integer({ max: 86_400_000, min: -86_400_000 }),
    late: fc.integer({ max: 3 * nanosecondsPerMillisecond, min: 0 }),
    spurious: fc.boolean(),
  });
}

function scheduleArbitrary(failures: boolean): fc.Arbitrary<ScheduleTemplate> {
  return fc.record({
    monotonic: fc.integer({ max: 1_000_000_000, min: 0 }),
    nodes: fc.array(
      fc.array(actionTemplateArbitrary(failures), {
        maxLength: maximumActions,
      }),
      { maxLength: maximumNodes, minLength: 1 },
    ),
    realTime: fc.integer({ max: 2_000_000_000_000, min: 0 }),
    steps: fc.array(stepArbitrary(failures), { maxLength: large ? 24 : 12 }),
    unavailable: failures
      ? fc.constantFrom("none" as const, "monotonic" as const, "real" as const)
      : fc.constant("none" as const),
  });
}

/**
 * Assign children in creation order. A scheduling action takes the next
 * unused node and that node's generated action list; once every node is
 * taken, it becomes a real-time read, so the schedule stays a tree and a
 * shrunk list keeps its prefix.
 */
function assignChildren(template: ScheduleTemplate): Schedule {
  const nodes: Action[][] = [];
  let next = 1;
  const queue = [0];
  while (queue.length > 0) {
    const node = queue.shift() ?? 0;
    const actions: Action[] = [];
    for (const action of template.nodes[node] ?? []) {
      if (action.kind === "timer" || action.kind === "micro") {
        if (next >= template.nodes.length) {
          actions.push({ kind: "real" });
          continue;
        }
        const child = next;
        next += 1;
        queue.push(child);
        actions.push(
          action.kind === "timer"
            ? { child, delay: action.delay, kind: "timer" }
            : { child, kind: "micro" },
        );
      } else {
        actions.push(action);
      }
    }
    nodes[node] = actions;
  }
  for (let node = 0; node < template.nodes.length; node += 1) {
    nodes[node] ??= [];
  }
  return {
    monotonic: template.monotonic,
    nodes,
    realTime: template.realTime,
    steps: template.steps,
    unavailable: template.unavailable,
  };
}

function printSchedule(schedule: Schedule): string {
  const lines = [
    "mode deterministic",
    `clock ${schedule.monotonic} ${schedule.realTime}`,
    ...schedule.steps.map(
      (step) =>
        `step ${step.late} ${step.jump} ${step.spurious ? 1 : 0} ` +
        `${step.fail ? 1 : 0}`,
    ),
  ];
  if (schedule.unavailable !== "none") {
    lines.push(`unavailable ${schedule.unavailable}`);
  }
  for (const [node, actions] of schedule.nodes.entries()) {
    for (const action of actions) {
      switch (action.kind) {
        case "timer":
          lines.push(`do ${node} timer ${action.child} ${action.delay}`);
          break;
        case "cancel":
          lines.push(`do ${node} cancel ${action.target}`);
          break;
        case "micro":
          lines.push(`do ${node} micro ${action.child}`);
          break;
        case "advance":
          lines.push(`do ${node} advance ${action.nanoseconds}`);
          break;
        case "set-real":
          lines.push(`do ${node} set-real ${action.milliseconds}`);
          break;
        case "real":
        case "wake":
          lines.push(`do ${node} ${action.kind}`);
          break;
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

interface ModelTimer {
  readonly deadline: number;
  readonly id: number;
  readonly node: number;
  readonly order: number;
  canceled: boolean;
}

/** Thrown inside the model when the run ends with the owned diagnostic. */
class OwnedFailure extends Error {}

/** Predict the harness trace from the scheduler contract alone. */
function expectedTrace(schedule: Schedule): string {
  const lines: string[] = [];
  let monotonic = schedule.monotonic;
  let realTime = schedule.realTime;
  let origin = 0;
  let started = false;
  let cached = 0;
  let nextId = 1;
  let nextOrder = 0;
  let steps = 0;
  let pendingWakeup = false;
  const handles = new Map<number, number>();
  const timers: ModelTimer[] = [];
  const microtasks: number[] = [];

  const startClock = (): void => {
    if (started) return;
    if (schedule.unavailable === "monotonic") throw new OwnedFailure();
    origin = monotonic;
    started = true;
    cached = 0;
  };
  const now = (): number => {
    startClock();
    const elapsed = Math.floor(
      (monotonic - origin) / nanosecondsPerMillisecond,
    );
    return Math.max(elapsed, cached);
  };
  const wait = (deadline: number): void => {
    const target = origin + deadline * nanosecondsPerMillisecond;
    const step = schedule.steps[steps] ?? {
      fail: false,
      jump: 0,
      late: 0,
      spurious: false,
    };
    steps += 1;
    let result: string;
    if (step.fail) {
      result = "failed";
    } else if (pendingWakeup) {
      pendingWakeup = false;
      result = "wakeup";
    } else if (step.spurious) {
      monotonic += Math.floor((target - monotonic) / 2);
      result = "wakeup";
    } else {
      monotonic = Math.max(monotonic, target + step.late);
      result = "deadline";
    }
    if (result !== "failed") realTime += step.jump;
    lines.push(`wait ${target} ${result} ${monotonic} ${realTime}`);
    if (result === "failed") throw new OwnedFailure();
  };
  const runNode = (node: number): void => {
    lines.push(`run ${node} ${cached}`);
    for (const action of schedule.nodes[node] ?? []) {
      switch (action.kind) {
        case "timer": {
          startClock();
          const timer: ModelTimer = {
            canceled: false,
            deadline: cached + action.delay,
            id: nextId,
            node: action.child,
            order: nextOrder,
          };
          nextId += 1;
          nextOrder += 1;
          handles.set(action.child, timer.id);
          timers.push(timer);
          timers.sort(
            (left, right) =>
              left.deadline - right.deadline || left.order - right.order,
          );
          break;
        }
        case "cancel": {
          const id = handles.get(action.target);
          const timer = timers.find((entry) => entry.id === id);
          if (timer != null) timer.canceled = true;
          break;
        }
        case "micro":
          microtasks.push(action.child);
          break;
        case "real":
          lines.push(
            schedule.unavailable === "real"
              ? `real ${node} unavailable`
              : `real ${node} ${realTime}`,
          );
          break;
        case "wake":
          pendingWakeup = true;
          lines.push(`wake ${node} 1`);
          break;
        case "advance":
          monotonic += action.nanoseconds;
          break;
        case "set-real":
          realTime = action.milliseconds;
          break;
      }
    }
  };
  const drain = (): void => {
    while (microtasks.length > 0) runNode(microtasks.shift() ?? 0);
  };

  let status = "exit 0 none";
  try {
    runNode(0);
    drain();
    for (;;) {
      while (timers[0]?.canceled === true) timers.shift();
      const head = timers[0];
      if (head == null) break;
      const current = now();
      if (head.deadline > current) {
        wait(head.deadline);
        continue;
      }
      cached = current;
      timers.shift();
      runNode(head.node);
      drain();
    }
  } catch (error) {
    if (!(error instanceof OwnedFailure)) throw error;
    status = "exit 1 OSEO2001";
  }
  lines.push(status, "close");
  return `${lines.join("\n")}\n`;
}

async function withScheduler(
  body: (build: ClockBuild) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "oseo-clock-property-"));
  try {
    await body(
      buildClockProgram({
        directory,
        program: "scheduler",
        sanitize: true,
        target: hostClockTarget() ?? "x86_64-linux-gnu",
      }),
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function assertTrace(build: ClockBuild, schedule: Schedule): void {
  const input = printSchedule(schedule);
  const expected = expectedTrace(schedule);
  const status = expected.includes("exit 0 none") ? 0 : 1;
  for (const environment of [{}, { OSEO_GC_EVERY_SAFEPOINT: "1" }]) {
    const run = runClockScheduler(build, input, environment);
    assert.equal(run.stderr, "", input);
    assert.equal(run.stdout, expected, input);
    assert.equal(run.status, status, input);
  }
}

const target = hostClockTarget();
const context =
  target == null
    ? ["target=unsupported"]
    : [
        `target=${target}`,
        `host=${process.platform}/${process.arch}`,
        "adapter=deterministic sanitizers=address,undefined",
      ];

test(
  "generated clock schedules match the scheduler model",
  { skip: target == null ? "requires a supported native host" : false },
  async () => {
    await withScheduler(async (build) => {
      await assertAsyncProperty(
        "deterministic clock schedules keep jumps out of deadlines",
        fc.asyncProperty(scheduleArbitrary(false), async (template) => {
          assertTrace(build, assignChildren(template));
        }),
        {
          context,
          domain:
            "timer and microtask trees with late, spurious, and " +
            "real-time-jumping deterministic waits",
          numRuns: 30,
          profile: "PLAN-NIO clock and wakeup checkpoint",
          seed: 0x6000_7000,
          sizeLimit: large
            ? "48 nodes, 6 actions per node, and 24 wait steps"
            : "20 nodes, 4 actions per node, and 12 wait steps",
          timeLimitMilliseconds: 180_000,
        },
      );
      await assertAsyncProperty(
        "deterministic clock failures end with the owned diagnostic",
        fc.asyncProperty(scheduleArbitrary(true), async (template) => {
          assertTrace(build, assignChildren(template));
        }),
        {
          context,
          domain:
            "clock schedules with failed waits and absent monotonic or " +
            "real-time capabilities",
          numRuns: 15,
          profile: "PLAN-NIO clock and wakeup checkpoint",
          seed: 0x6000_7001,
          sizeLimit: large
            ? "48 nodes, 6 actions per node, and 24 wait steps"
            : "20 nodes, 4 actions per node, and 12 wait steps",
          timeLimitMilliseconds: 180_000,
        },
      );
    });
  },
);
