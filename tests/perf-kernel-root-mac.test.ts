import assert from "node:assert/strict";
import { test } from "node:test";
import { KernelMacTimeline } from "../tools/perf/kernel-root/mac-timeline.ts";
import type { OwnershipRow } from "../tools/perf/kernel-root/ownership.ts";

const one: OwnershipRow = {
  pid: 100,
  ppid: 1,
  group: 100,
  uid: 502,
  comm: "Runner.Listener",
  birth: "Mon Nov 16 01:00:00 2026",
  birthPrecision: "one-second",
};
const two = { ...one, pid: 200, group: 200, uid: 503 };

function lifecycle() {
  const timeline = new KernelMacTimeline();
  timeline.record({
    sequence: 0,
    kind: "baseline",
    startedMs: 0,
    finishedMs: 1,
    listeners: [one, two],
  });
  timeline.record({
    sequence: 1,
    kind: "stop",
    startedMs: 10,
    finishedMs: 20,
    listeners: [],
  });
  timeline.open(21);
  timeline.close(40);
  timeline.record({
    sequence: 2,
    kind: "restore",
    startedMs: 41,
    finishedMs: 50,
    listeners: [one, two],
  });
  return timeline;
}

test("pending Mac samples retain original transition times", () => {
  const timeline = lifecycle();
  for (const [start, end] of [
    [2, 3],
    [11, 12],
    [42, 43],
    [51, 52],
  ]) {
    assert.equal(timeline.require(one, start!, end!), true);
    assert.equal(timeline.require(two, start!, end!), true);
  }
  for (const [start, end] of [
    [21, 22],
    [30, 31],
    [20, 22],
    [39, 42],
  ])
    assert.throws(() => timeline.require(one, start!, end!), /window/);
});

test("partial bootout and unknown terminal cannot open", () => {
  const timeline = new KernelMacTimeline();
  timeline.record({
    sequence: 0,
    kind: "baseline",
    startedMs: 0,
    finishedMs: 1,
    listeners: [one, two],
  });
  timeline.record({
    sequence: 1,
    kind: "stop",
    startedMs: 2,
    finishedMs: 3,
    listeners: [two],
  });
  assert.throws(() => timeline.open(4), /Partial bootout/);
  assert.throws(() =>
    timeline.record({
      sequence: 2,
      kind: "restore",
      startedMs: 4,
      finishedMs: NaN,
      listeners: [one, two],
    }),
  );
});

test("restoration rejects foreign UID and changed or unknown birth", () => {
  const timeline = lifecycle();
  for (const row of [
    { ...one, birth: null },
    { ...one, birth: "changed" },
    { ...one, pid: 300 },
    { ...one, uid: 503 },
  ])
    assert.throws(() => timeline.require(row, 51, 52));
});
