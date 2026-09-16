/**
 * Fixed native evidence for the clock and wakeup checkpoint of ADR 0025.
 *
 * The probe drives the platform adapter through every facility
 * configuration: the primary facility, the self-pipe fallback, the sleep
 * fallback without wakeup, the second-resolution real-time fallback, and
 * an absent monotonic clock. The scheduler harness then runs the runtime's
 * own timer queue against the platform adapter, where waits take real
 * monotonic time, and against the deterministic adapter, where the trace
 * is exact. Generated schedules live in
 * *tests/property/nio-clock-wakeup.property.test.ts*; what stays here is
 * what a generated observation cannot prove: the host facilities, their
 * CPU cost while idle, descriptor and thread lifetime, and the AArch64
 * Linux link.
 *
 * Timing assertions use lower bounds from the monotonic clock and loose
 * upper bounds, because a loaded host may deliver a wakeup late but a
 * correct adapter never delivers a deadline early or spins while idle.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildClockProgram,
  hostClockTarget,
  runClockProbe,
  runClockScheduler,
} from "../../tools/native-io/clock.ts";
import { needsTest262Agent, parseTest262Case } from "../../tools/test262.ts";
import type {
  ClockBuild,
  ClockProbeConfiguration,
} from "../../tools/native-io/clock.ts";

const target = hostClockTarget();
const skip = target == null ? "requires a supported native host" : false;
const linux = process.platform === "linux";
const idleWaitMilliseconds = 200;
/* A spinning wait would spend about the whole interval on the CPU. */
const idleCpuLimitMicroseconds = 50_000;

const primary =
  process.platform === "darwin"
    ? { backend: "macos-kqueue", wait: "kevent", wakeup: "EVFILT_USER" }
    : { backend: "linux-eventfd", wait: "ppoll", wakeup: "eventfd" };
const monotonicName =
  process.platform === "darwin"
    ? "clock_gettime(CLOCK_UPTIME_RAW)"
    : "clock_gettime(CLOCK_MONOTONIC)";
const sleepName =
  process.platform === "darwin" ? "nanosleep" : "clock_nanosleep";

async function withBuild(
  program: "probe" | "scheduler",
  body: (build: ClockBuild) => void,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "oseo-native-io-"));
  try {
    body(
      buildClockProgram({
        directory,
        program,
        sanitize: true,
        target: target ?? "x86_64-linux-gnu",
      }),
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function configuration(
  configurations: readonly ClockProbeConfiguration[],
  name: string,
): ClockProbeConfiguration {
  const found = configurations.find((entry) => entry.configuration === name);
  assert.ok(found != null, `probe configuration ${name}`);
  return found;
}

function assertReadableClocks(entry: ClockProbeConfiguration): void {
  assert.equal(entry.monotonic.available, true);
  assert.equal(entry.monotonic.nonDecreasing, true);
  assert.ok(entry.monotonic.resolutionNanoseconds > 0);
  assert.ok(entry.monotonic.resolutionNanoseconds <= 1_000_000);
  assert.equal(entry.realTime.available, true);
  assert.equal(entry.realTime.integral, true);
}

function assertIdleDeadline(entry: ClockProbeConfiguration): void {
  assert.equal(entry.deadlineWait.result, "deadline");
  assert.equal(entry.deadlineWait.reachedDeadline, true);
  assert.ok(
    (entry.deadlineWait.elapsedMicroseconds ?? 0) >=
      idleWaitMilliseconds * 1000,
  );
  assert.ok(
    (entry.deadlineWait.cpuMicroseconds ?? Infinity) < idleCpuLimitMicroseconds,
    `idle wait CPU ${entry.deadlineWait.cpuMicroseconds}`,
  );
}

function assertWakeable(entry: ClockProbeConfiguration): void {
  assert.equal(entry.wakeupAvailable, true);
  assert.deepEqual(
    [entry.pendingWakeup?.accepted, entry.pendingWakeup?.first],
    [true, "wakeup"],
  );
  assert.equal(entry.pendingWakeup?.second, "deadline");
  for (const wait of [entry.crossThreadWakeup, entry.indefiniteWait]) {
    assert.ok(wait != null);
    assert.equal(wait.accepted, true);
    assert.equal(wait.result, "wakeup");
    assert.ok(wait.elapsedMicroseconds >= 50_000);
    assert.ok(wait.elapsedMicroseconds < 5_000_000);
  }
}

function assertShutdown(
  entry: ClockProbeConfiguration,
  descriptors: number,
): void {
  if (!linux) return;
  assert.equal(entry.shutdown.threadsBeforeClose, 1, "no hidden worker");
  assert.equal(
    entry.shutdown.descriptorsOpen,
    entry.shutdown.descriptorsBefore + descriptors,
  );
  assert.equal(
    entry.shutdown.descriptorsAfter,
    entry.shutdown.descriptorsBefore,
  );
}

test(
  "the platform clock probe selects every recorded facility",
  { skip },
  async () => {
    await withBuild("probe", (build) => {
      const report = runClockProbe(build, idleWaitMilliseconds);
      assert.ok(report.host.system.length > 0);
      const { configurations } = report;

      const selected = configuration(configurations, "primary");
      assert.deepEqual(selected.capabilities, {
        backend: primary.backend,
        fallback: false,
        monotonic: monotonicName,
        realTime: "clock_gettime(CLOCK_REALTIME)",
        wait: primary.wait,
        wakeup: primary.wakeup,
      });
      assertReadableClocks(selected);
      assert.ok(selected.realTime.differenceFromTimespecGetMilliseconds <= 50);
      assertIdleDeadline(selected);
      assertWakeable(selected);
      assertShutdown(selected, 1);

      const pipe = configuration(configurations, "pipe-fallback");
      assert.deepEqual(
        [pipe.capabilities.wait, pipe.capabilities.wakeup],
        ["poll", "pipe"],
      );
      assert.equal(pipe.capabilities.fallback, true);
      assertReadableClocks(pipe);
      assertIdleDeadline(pipe);
      assertWakeable(pipe);
      assertShutdown(pipe, 2);

      const sleep = configuration(configurations, "sleep-fallback");
      assert.deepEqual(
        [sleep.capabilities.wait, sleep.capabilities.wakeup],
        [sleepName, null],
      );
      assert.equal(sleep.capabilities.fallback, true);
      assert.equal(sleep.wakeupAvailable, false);
      assertReadableClocks(sleep);
      assertIdleDeadline(sleep);
      assert.deepEqual(
        [
          sleep.pendingWakeup?.accepted,
          sleep.pendingWakeup?.first,
          sleep.pendingWakeup?.second,
        ],
        [false, "deadline", "deadline"],
      );
      assert.deepEqual(
        [sleep.crossThreadWakeup?.accepted, sleep.crossThreadWakeup?.result],
        [false, "deadline"],
      );
      assert.ok((sleep.crossThreadWakeup?.elapsedMicroseconds ?? 0) >= 300_000);
      assert.deepEqual(
        [sleep.indefiniteWait?.accepted, sleep.indefiniteWait?.result],
        [false, "failed"],
      );
      assertShutdown(sleep, 0);

      const realTime = configuration(configurations, "real-time-fallback");
      assert.deepEqual(
        [realTime.capabilities.realTime, realTime.capabilities.fallback],
        ["time", true],
      );
      assert.equal(realTime.capabilities.wakeup, primary.wakeup);
      assert.equal(realTime.realTime.resolutionNanoseconds, 1_000_000_000);
      assertReadableClocks(realTime);
      assert.ok(
        realTime.realTime.differenceFromTimespecGetMilliseconds <= 1050,
      );
      assertShutdown(realTime, 1);

      const monotonic = configuration(configurations, "monotonic-absent");
      assert.equal(monotonic.capabilities.monotonic, null);
      assert.equal(monotonic.monotonic.available, false);
      assert.equal(monotonic.monotonic.resolutionNanoseconds, -1);
      assert.equal(monotonic.deadlineWait.result, "failed");
      assertShutdown(monotonic, 1);
    });
  },
);

function runLines(stdout: string): readonly string[] {
  return stdout
    .split("\n")
    .filter((line) => line.startsWith("run "))
    .map((line) => line.split(" ").slice(0, 2).join(" "));
}

function measured(stdout: string, key: string): number {
  const line = stdout.split("\n").find((entry) => entry.startsWith(`${key} `));
  assert.ok(line != null, `${key} measurement`);
  return Number(line.slice(key.length + 1));
}

test(
  "production timer waits elapse monotonic time without busy polling",
  { skip },
  async () => {
    await withBuild("scheduler", (build) => {
      const schedule = [
        "mode platform",
        "measure",
        "do 0 timer 1 150",
        "do 0 timer 2 150",
        "do 0 timer 3 0",
        "do 0 timer 4 60000",
        "do 0 cancel 4",
        "do 0 thread-wake 40",
        "do 1 micro 5",
        "do 3 micro 6",
        "do 6 micro 7",
        "do 1 real",
        "",
      ].join("\n");
      const run = runClockScheduler(build, schedule);
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stderr, "");
      assert.deepEqual(runLines(run.stdout), [
        "run 0",
        "run 3",
        "run 6",
        "run 7",
        "run 1",
        "run 5",
        "run 2",
      ]);
      const timerRun = run.stdout
        .split("\n")
        .find((line) => line.startsWith("run 1 "));
      assert.ok(Number(timerRun?.split(" ")[2]) >= 150);
      assert.match(run.stdout, /^real 1 \d+$/mu);
      const elapsed = measured(run.stdout, "elapsed");
      assert.ok(elapsed >= 150, `elapsed ${elapsed}`);
      assert.ok(elapsed < 30_000, "a canceled deadline never extends a wait");
      assert.ok(
        measured(run.stdout, "cpu") < 75_000,
        "a production timer wait blocks instead of polling",
      );
      if (linux) assert.match(run.stdout, /^threads 1$/mu);

      for (const [restriction, wait] of [
        [4, "poll"],
        [12, sleepName],
      ] as const) {
        const fallback = runClockScheduler(
          build,
          ["mode platform", "measure", `restrict ${restriction}`]
            .concat(["do 0 timer 1 60", "do 1 timer 2 0", ""])
            .join("\n"),
        );
        assert.equal(fallback.status, 0, fallback.stderr);
        assert.deepEqual(runLines(fallback.stdout), [
          "run 0",
          "run 1",
          "run 2",
        ]);
        assert.match(fallback.stdout, new RegExp(` ${wait} `, "u"));
        assert.ok(measured(fallback.stdout, "elapsed") >= 60);
      }

      const absent = runClockScheduler(
        build,
        "mode platform\nrestrict 1\ndo 0 timer 1 5\n",
      );
      assert.equal(absent.status, 1);
      assert.equal(absent.stdout, "run 0 0\nexit 1 OSEO2001\n");
    });
  },
);

const deterministicSchedule = [
  "mode deterministic",
  "clock 5000 1700000000000",
  "step 1500000 -3600000 0 0",
  "step 0 0 1 0",
  "step 0 86400000 0 0",
  "do 0 timer 1 10",
  "do 0 timer 2 10",
  "do 0 timer 3 0",
  "do 0 timer 4 50",
  "do 0 cancel 4",
  "do 0 real",
  "do 1 micro 5",
  "do 1 real",
  "do 5 timer 6 0",
  "do 2 wake",
  "do 2 advance 40000000",
  "do 2 timer 8 1",
  "do 6 real",
  "do 3 timer 7 5",
  "do 7 set-real 0",
  "do 7 real",
  "do 8 real",
  "do 8 wake",
  "do 8 timer 9 5",
  "",
].join("\n");

const deterministicTrace = [
  "run 0 0",
  "real 0 1700000000000",
  "run 3 0",
  "wait 5005000 deadline 6505000 1699996400000",
  "run 7 6",
  "real 7 0",
  "wait 10005000 wakeup 8255000 0",
  "wait 10005000 deadline 10005000 86400000",
  "run 1 10",
  "real 1 86400000",
  "run 5 10",
  "run 2 10",
  "wake 2 1",
  "run 6 50",
  "real 6 86400000",
  "run 8 50",
  "real 8 86400000",
  "wake 8 1",
  "wait 55005000 wakeup 50005000 86400000",
  "wait 55005000 deadline 55005000 86400000",
  "run 9 55",
  "exit 0 none",
  "close",
  "",
].join("\n");

test(
  "the deterministic adapter keeps real-time jumps out of deadlines",
  { skip },
  async () => {
    await withBuild("scheduler", (build) => {
      for (const environment of [{}, { OSEO_GC_EVERY_SAFEPOINT: "1" }]) {
        const run = runClockScheduler(
          build,
          deterministicSchedule,
          environment,
        );
        assert.equal(run.stderr, "");
        assert.equal(run.status, 0);
        assert.equal(run.stdout, deterministicTrace);
      }

      const failedWait = runClockScheduler(
        build,
        "mode deterministic\nstep 0 0 0 1\ndo 0 timer 1 1\n",
      );
      assert.equal(failedWait.status, 1);
      assert.equal(
        failedWait.stdout,
        "run 0 0\nwait 1000000 failed 0 0\nexit 1 OSEO2001\nclose\n",
      );

      const noMonotonic = runClockScheduler(
        build,
        "mode deterministic\nunavailable monotonic\ndo 0 timer 1 0\n",
      );
      assert.equal(noMonotonic.status, 1);
      assert.equal(noMonotonic.stdout, "run 0 0\nexit 1 OSEO2001\nclose\n");

      const noRealTime = runClockScheduler(
        build,
        "mode deterministic\nunavailable real\ndo 0 real\ndo 0 timer 1 3\n",
      );
      assert.equal(noRealTime.status, 0);
      assert.equal(
        noRealTime.stdout,
        [
          "run 0 0",
          "real 0 unavailable",
          "wait 3000000 deadline 3000000 0",
          "run 1 3",
          "exit 0 none",
          "close",
          "",
        ].join("\n"),
      );
    });
  },
);

test(
  "AArch64 Linux links the clock probe and harness with the Linux adapter",
  { skip },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-native-io-cross-"));
    try {
      const builds = (["probe", "scheduler"] as const).map((program) =>
        buildClockProgram({
          directory,
          program,
          sanitize: false,
          target: "aarch64-linux-musl",
        }),
      );
      const images = await Promise.all(
        builds.map((build) => readFile(build.executable)),
      );
      for (const [index, build] of builds.entries()) {
        assert.ok(build.invocation.includes("aarch64-linux-musl"));
        const bytes = images[index];
        assert.ok(bytes != null);
        assert.ok(bytes.includes("linux-eventfd"), "selected Linux backend");
        assert.ok(bytes.includes("clock_gettime(CLOCK_MONOTONIC)"));
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  },
);

/*
 * The reviewed test262 manifest records its asynchronous executions under
 * the `deterministic-logical-clock` scheduler value of ADR 0013. That value
 * stays exact after ADR 0025 only because no reviewed execution schedules a
 * timer, so none ever opens the clock adapter or waits. A reviewed case that
 * would schedule one, and any reviewed harness include, needs that record
 * revisited before it enters the subset. A case that needs the `$262.agent`
 * capability is never executed, so the timers behind that capability cannot
 * reach the scheduler; the reviewed Atomics rows that call
 * `$262.agent.setTimeout` are exactly those.
 */
test("no reviewed test262 execution schedules a timer", async () => {
  const repository = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const upstream = dirname(
    fileURLToPath(import.meta.resolve("test262/package.json")),
  );
  const subset = await readFile(
    join(repository, "tests/test262/subset.yaml"),
    "utf8",
  );
  const revision = /^suiteRevision: (\S+)$/mu.exec(subset)?.[1] ?? "";
  assert.notEqual(revision, "");
  const paths = [...subset.matchAll(/^\s*(?:-\s+)?path: (test\/\S+)$/gmu)].map(
    (match) => match[1] ?? "",
  );
  assert.ok(paths.length > 0);
  const harness = join(repository, "tests/test262/harness");
  const includes = (await readdir(harness)).map((name) => join(harness, name));
  // The corpus holds thousands of files, so they are read one at a time:
  // opening them all at once exhausts the descriptor limit on Windows.
  const timers: string[] = [];
  for (const path of paths) {
    // eslint-disable-next-line no-await-in-loop -- Reads stay serial.
    const text = await readFile(join(upstream, path), "utf8");
    if (!/\b(?:setTimeout|clearTimeout)\b/u.test(text)) continue;
    if (needsTest262Agent(text, parseTest262Case(text, path, revision))) {
      continue;
    }
    timers.push(path);
  }
  for (const include of includes) {
    // eslint-disable-next-line no-await-in-loop -- Reads stay serial.
    const text = await readFile(include, "utf8");
    if (/\b(?:setTimeout|clearTimeout)\b/u.test(text)) timers.push(include);
  }
  assert.deepEqual(timers, []);
});
