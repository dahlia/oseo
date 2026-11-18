/* eslint-disable no-await-in-loop -- Inspect ordered immutable records. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
  mkdir,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  compareCollectorPids,
  nativeCollectorPlan,
  nativeCollectorTarget,
  parseCollectorCounters,
  parseCollectorProcesses,
  parseCollectorProcStat,
  parseCollectorUuid,
  startCollectorFixture,
} from "../tools/perf/native-host-collector.ts";
import type {
  CollectorBounds,
  CollectorFixture,
  CollectorOptions,
  NativeHostCollector,
} from "../tools/perf/native-host-collector.ts";

const linux = "linux-x86_64-gnu";
const mac = "macos-aarch64";
const bytes = (value: string): Buffer => Buffer.from(value);
const hardware = "C8C8C8C8-ABCD-1234-9876-123456789ABC";
const boot = "12345678-1111-2222-3333-987654321ABC";
const bounds: CollectorBounds = {
  probeTimeoutMs: 2000,
  intervalMs: 20,
  termGraceMs: 40,
  cleanupMs: 300,
  maxProbeBytes: 1024 * 1024,
  maxTotalBytes: 16 * 1024 * 1024,
  maxRecords: 1000,
  maxSamples: 30,
  maxProcesses: 1000,
  maxGapMs: 100,
  maxClockSkewMs: 100,
};

async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "oseo-host-collector-")),
  );
  const options: CollectorOptions = {
    directory: join(root, "raw"),
    bounds,
    logicalSlots: ["logical-slot-1"],
    origin: { kind: "local-read" },
  };
  return {
    root,
    options,
    remove: async (): Promise<void> => {
      await rm(root, { recursive: true });
    },
  };
}

async function json(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function records(directory: string) {
  const names = (await readdir(directory))
    .filter((name) => /^probe-\d+\.json$/u.test(name))
    .toSorted();
  return await Promise.all(names.map((name) => json(join(directory, name))));
}

async function once(mode: CollectorFixture, controls = bounds) {
  const f = await fixture();
  try {
    const collector = await startCollectorFixture(
      { ...f.options, bounds: { ...controls, maxSamples: 1 } },
      mode,
    );
    const summary = await collector.finished;
    return {
      summary,
      records: await records(f.options.directory),
      stdout: await readFile(
        join(f.options.directory, "probe-00000000.stdout.bin"),
      ),
      stderr: await readFile(
        join(f.options.directory, "probe-00000000.stderr.bin"),
      ),
      final: await json(join(f.options.directory, "finish.json")),
    };
  } finally {
    await f.remove();
  }
}

test("collector rejects unsupported execution hosts", () => {
  assert.equal(nativeCollectorTarget("linux", "x64"), linux);
  assert.equal(nativeCollectorTarget("darwin", "arm64"), mac);
  for (const [platform, arch] of [
    ["win32", "x64"],
    ["linux", "arm64"],
    ["darwin", "x64"],
    ["oseo-mac-1", "arm64"],
    ["unknown", "x64"],
  ]) {
    assert.throws(
      () => nativeCollectorTarget(platform ?? "", arch ?? ""),
      /Unsupported/u,
    );
  }
});

test("collector plans exclude args and workload tools", () => {
  for (const target of [linux, mac] as const) {
    const plan = nativeCollectorPlan(target);
    assert.ok(plan.some((probe) => probe.name === "hardware"));
    assert.ok(plan.some((probe) => probe.name === "boot"));
    const ps = plan.find((probe) => probe.name === "processes");
    assert.ok(ps);
    assert.ok(ps.argv.join().includes("pgid="));
    assert.ok(ps.argv.join().includes("uid="));
    assert.ok(ps.argv.join().includes("time="));
    assert.ok(!ps.argv.join().includes("args"));
    assert.ok(plan.every((probe) => probe.executable.startsWith("/")));
    assert.ok(
      !plan.some((probe) => /sample|gdb|oseo|sh$/u.test(probe.executable)),
    );
  }
  const macPlan = nativeCollectorPlan(mac);
  assert.deepEqual(macPlan.find((p) => p.name === "hardware")?.argv, [
    "-r",
    "-d",
    "1",
    "-c",
    "IOPlatformExpertDevice",
    "-w",
    "0",
  ]);
  assert.deepEqual(macPlan.find((p) => p.name === "boot")?.argv, [
    "-n",
    "kern.bootsessionuuid",
  ]);
});

test("collector parses only observed nonzero UUIDs", () => {
  assert.equal(
    parseCollectorUuid(bytes(boot + "\n"), "uuid"),
    boot.toLowerCase(),
  );
  const ioreg =
    "+-o IOPlatformExpertDevice <class IOPlatformExpertDevice>\n" +
    '  {\n    "IOPlatformUUID" = "' +
    hardware +
    '"\n  }\n';
  assert.equal(
    parseCollectorUuid(bytes(ioreg), "ioreg"),
    hardware.toLowerCase(),
  );
  for (const value of [
    "",
    "oseo-mac-1",
    "runner-account",
    "unknown",
    "00000000-0000-0000-0000-000000000000",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
    boot + "\n" + boot,
    "sysctl: permission denied",
    "sysctl: unknown oid",
  ]) {
    assert.equal(parseCollectorUuid(bytes(value), "uuid"), null);
  }
  assert.equal(parseCollectorUuid(bytes(ioreg + ioreg), "ioreg"), null);
  assert.equal(parseCollectorUuid(Buffer.from([0xff]), "uuid"), null);
  assert.equal(
    parseCollectorUuid(bytes('"IOPlatformUUID" = "bad"'), "ioreg"),
    null,
  );
});

test("collector Linux inventory retains all observed UIDs", () => {
  const inventory = parseCollectorProcesses(
    bytes(
      "      1 0 1 0 0.1 00:04:12 systemd\n" +
        "  1200 1 1200 501 12.2 00:00:01 Runner.Listener\n" +
        "  1201 1200 1200 1002 103.0 01:20:31 competing job\n",
    ),
    linux,
    10,
  );
  assert.equal(inventory.complete, true);
  assert.deepEqual(
    inventory.processes.map((p) => p.uid),
    [0, 501, 1002],
  );
  assert.equal(inventory.processes[2]?.comm, "competing job");
  assert.equal(inventory.processes[2]?.cpuPercent, 103);
  assert.equal(inventory.processes[1]?.birth, null);
  assert.equal(inventory.processes[1]?.birthPrecision, "unknown");
});

test("collector Mac ps uses OS UIDs and coarse start evidence", () => {
  const inventory = parseCollectorProcesses(
    bytes(
      "1 0 1 0 0.0 12:31.42 Thu Nov 12 01:04:05 2026 launchd\n" +
        "809 1 809 502 2.3 0:01.01 Thu Nov 12 10:30:05 2026 Runner.Worker\n" +
        "810 1 810 503 99.1 1:01.12 Thu Nov 12 10:30:06 2026 node\n",
    ),
    mac,
    10,
  );
  assert.equal(inventory.complete, true);
  assert.equal(inventory.processes.length, 3);
  assert.equal(inventory.processes[1]?.uid, 502);
  assert.equal(inventory.processes[1]?.birthPrecision, "one-second");
  assert.equal(inventory.processes[1]?.comm, "Runner.Worker");
});

for (const [name, input] of [
  ["duplicate PID", "1 0 1 0 0.1 00:00:01 init\n1 0 1 0 0.1 00:00:02 init\n"],
  ["permission denial", "ps: permission denied\n"],
  ["unsafe PID", "9007199254740993 0 1 0 0.1 00:00:01 init\n"],
  ["negative CPU", "1 0 1 0 -1.0 00:00:01 init\n"],
  ["missing comm", "1 0 1 0 0.0 00:00:01\n"],
  ["NUL", "1 0 1 0 0.0 00:00:01 init\0\n"],
] as const) {
  test(`collector inventory marks ${name} incomplete`, () => {
    assert.equal(
      parseCollectorProcesses(bytes(input), linux, 20).complete,
      false,
    );
  });
}

test("collector rejects malformed or capped inventories", () => {
  assert.equal(
    parseCollectorProcesses(Buffer.from([255]), linux, 20).complete,
    false,
  );
  const capped = parseCollectorProcesses(
    bytes("1 0 1 0 0.1 00:00:01 init\n2 0 2 0 0.0 00:00:01 kthreadd\n"),
    linux,
    1,
  );
  assert.equal(capped.complete, false);
  assert.deepEqual(capped.errors, ["process-bound"]);
  assert.equal(capped.processes.length, 1);
  assert.equal(parseCollectorProcesses(bytes(""), linux, 10).complete, true);
  assert.equal(
    parseCollectorProcesses(
      bytes("1 0 1 0 0.0 0:01.01 invalid-date node\n"),
      mac,
      10,
    ).complete,
    false,
  );
});

function procStat(pid: number, start: string): Buffer {
  return bytes(
    `${pid} (name with ) parentheses) S 1 42 42 0 -1 4194304 ` +
      `10 0 0 0 12 3 0 0 20 0 1 0 ${start} 4096 1\n`,
  );
}

test("collector Linux birth uses stat field22", () => {
  assert.deepEqual(parseCollectorProcStat(procStat(45, "12345678")), {
    pid: 45,
    ppid: 1,
    group: 42,
    startTicks: "12345678",
  });
  for (const value of [
    bytes(""),
    bytes("Permission denied"),
    bytes("1 (x) S 0 1"),
    procStat(45, "0"),
    procStat(45, "bad"),
    Buffer.from([255]),
  ]) {
    assert.equal(parseCollectorProcStat(value), null);
  }
});

test("collector preserves unknown and reused PID identity", () => {
  const base = parseCollectorProcesses(
    bytes("41 1 41 502 2.0 00:01:01 node\n"),
    linux,
    10,
  ).processes[0];
  assert.ok(base);
  const before = {
    ...base,
    birth: "100",
    birthPrecision: "kernel-ticks",
  } as const;
  assert.equal(
    compareCollectorPids([before], [{ ...before, birth: "101" }])[0]?.change,
    "pid-reused",
  );
  assert.equal(
    compareCollectorPids([before], [before])[0]?.change,
    "same-birth-observed",
  );
  assert.equal(
    compareCollectorPids([before], [base])[0]?.change,
    "identity-unknown",
  );
  assert.equal(compareCollectorPids([], [base])[0]?.change, "newly-observed");
  assert.equal(
    compareCollectorPids([before], [{ ...before, uid: 503 }])[0]?.change,
    "uid-changed",
  );
  assert.equal(
    compareCollectorPids(
      [before],
      [{ ...before, birthPrecision: "one-second" }],
    )[0]?.change,
    "coarse-identity",
  );
});

test("collector retains Linux cumulative counter units", () => {
  assert.deepEqual(
    parseCollectorCounters("linux-load", bytes("0.41 1.12 2.04 3/545 12345\n")),
    {
      load1: 0.41,
      load5: 1.12,
      load15: 2.04,
      runnable: "3",
      entities: "545",
      lastPid: "12345",
    },
  );
  const result = parseCollectorCounters(
    "linux-stat",
    bytes(
      "cpu  100 2 34 5000 6 0 3 0 0 0\n" +
        "cpu0 25 0 7 1000 0 0 0 0 0 0\n" +
        "ctxt 12345\nbtime 1794432000\nprocesses 100\nprocs_running 2\n",
    ),
  );
  assert.equal(result?.ctxt, "12345");
  assert.equal(result?.btime, "1794432000");
  assert.equal(result?.cpu, "100 2 34 5000 6 0 3 0 0 0");
});

test("collector Mac load and VM counters parse realistic C output", () => {
  assert.deepEqual(
    parseCollectorCounters("mac-load", bytes("{ 1.25 0.90 0.72 }\n")),
    { load1: 1.25, load5: 0.9, load15: 0.72 },
  );
  const result = parseCollectorCounters(
    "mac-vm",
    bytes(
      "Mach Virtual Memory Statistics: (page size of 16384 bytes)\n" +
        "Pages free:                              4501.\n" +
        "Pages active:                           99001.\n" +
        "Pageins:                                 4321.\n" +
        "Pageouts:                                   0.\n",
    ),
  );
  assert.equal(result?.pageSizeBytes, "16384");
  assert.equal(result?.Pageins, "4321");
});

for (const kind of [
  "linux-load",
  "linux-stat",
  "mac-load",
  "mac-vm",
] as const) {
  test(`collector ${kind} retains counter errors`, () => {
    assert.equal(
      parseCollectorCounters(kind, bytes("permission denied")),
      null,
    );
    assert.equal(parseCollectorCounters(kind, bytes("")), null);
    assert.equal(parseCollectorCounters(kind, Buffer.from([255])), null);
  });
}

test("collector retains exact bytes and actual clocks", async () => {
  const result = await once("bytes");
  assert.equal(result.summary.assessment, "UNASSESSED");
  assert.equal(result.summary.physicalExclusion, "unknown");
  assert.equal(result.summary.rootAdjudication, "required-separately");
  assert.equal(result.summary.incompleteRecords, 0);
  assert.deepEqual(result.stdout, Buffer.from([0, 255, 128, 13, 10]));
  assert.deepEqual(result.stderr, Buffer.from([254, 0, 10]));
  const probe = result.records[0];
  assert.equal(probe.complete, true);
  assert.equal(probe.reaped, true);
  assert.equal(probe.cleanup, "absent");
  assert.ok(probe.pid > 0);
  assert.ok(Date.parse(probe.start.utc) <= Date.parse(probe.end.utc));
  assert.ok(BigInt(probe.end.monotonicNs) > BigInt(probe.start.monotonicNs));
  assert.ok(probe.elapsedWallMs > 0);
  assert.equal(result.final.finalChildren[0].groupAbsent, true);
  assert.equal(result.final.finalChildren[0].reaped, true);
  assert.equal(result.final.overhead.scope, "supervising-process-cumulative");
});

for (const mode of ["control", "emfile"] as const) {
  test(
    `collector settles ${mode} with a child-only descriptor limit`,
    { skip: process.platform === "win32" ? "requires POSIX ulimit" : false },
    async () => {
      const f = await fixture();
      try {
        const script = `
          import assert from 'node:assert/strict';
          import cp from 'node:child_process';
          import fs from 'node:fs';
          import { syncBuiltinESMExports } from 'node:module';
          const [source, options, mode] = process.argv.slice(1);
          const original = cp.spawn;
          cp.spawn = (...args) => {
            const owned = [];
            let exhausted = false;
            try {
              if (mode === 'emfile') {
                for (let i = 0; i < 128; i++) {
                  try { owned.push(fs.openSync('/dev/null', 'r')); }
                  catch (error) {
                    assert.equal(error.code, 'EMFILE');
                    exhausted = true;
                    break;
                  }
                }
                assert.equal(exhausted, true);
              }
              const child = original(...args);
              fs.writeSync(1, JSON.stringify({
                exhausted, descriptors: owned.length, pid: child.pid ?? null,
                stdoutUnavailable: child.stdout == null,
                stderrUnavailable: child.stderr == null,
              }) + '\\n');
              return child;
            } finally {
              for (const descriptor of owned) fs.closeSync(descriptor);
            }
          };
          syncBuiltinESMExports();
          const { startCollectorFixture } = await import(source);
          const collector = await startCollectorFixture(
            JSON.parse(options), 'bytes',
          );
          const summary = await collector.finished;
          await collector.ready;
          fs.writeSync(1, JSON.stringify(summary) + '\\n');
        `;
        const child = spawnSync(
          "/bin/sh",
          [
            "-c",
            'ulimit -n 64 && exec "$@"',
            "collector-rlimit",
            "node",
            "--input-type=module",
            "-e",
            script,
            new URL("../tools/perf/native-host-collector.ts", import.meta.url)
              .href,
            JSON.stringify({
              ...f.options,
              bounds: { ...bounds, maxSamples: 1 },
            }),
            mode,
          ],
          { encoding: "utf8", timeout: 6000 },
        );
        assert.ifError(child.error);
        assert.equal(child.signal, null);
        assert.equal(child.status, 0, child.stderr);
        assert.equal(child.stderr, "");
        const [launch, summary] = child.stdout
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        assert.equal(launch.exhausted, mode === "emfile");
        const probes = await records(f.options.directory);
        assert.equal(probes.length, 1);
        const probe = probes[0];
        const final = await json(join(f.options.directory, "finish.json"));
        assert.deepEqual(final.summary, summary);
        assert.equal(summary.assessment, "UNASSESSED");
        assert.equal(summary.records, 1);
        const raw = (stream: string) =>
          readFile(join(f.options.directory, `probe-00000000.${stream}.bin`));
        if (mode === "emfile") {
          assert.ok(launch.descriptors > 0);
          assert.equal(launch.pid, null);
          assert.equal(launch.stdoutUnavailable, true);
          assert.equal(launch.stderrUnavailable, true);
          assert.equal(probe.complete, false);
          assert.equal(probe.errorCode, "EMFILE");
          assert.match((await raw("error")).toString(), /EMFILE/u);
          assert.doesNotMatch((await raw("error")).toString(), /TypeError/u);
          assert.equal((await raw("stdout")).length, 0);
          assert.equal((await raw("stderr")).length, 0);
          assert.equal(probe.pid, null);
          assert.equal(probe.code, null);
          assert.equal(probe.reaped, false);
          assert.equal(probe.cleanup, "no-child");
          assert.equal(probe.stop, null);
          assert.equal(summary.incompleteRecords, 1);
          assert.ok(
            summary.diagnostics.includes("probe-failure-stopped-collector"),
          );
          assert.equal(final.reason, "probe-failed");
          assert.deepEqual(final.finalChildren, []);
          const sample = await json(
            join(f.options.directory, "sample-00000000.json"),
          );
          assert.equal(sample.inventory, null);
          assert.deepEqual(sample.identity, {
            hardware: null,
            boot: null,
            account: null,
            uid: null,
          });
        } else {
          assert.equal(probe.complete, true);
          assert.equal(probe.errorCode, null);
          assert.equal(probe.code, 0);
          assert.equal(probe.reaped, true);
          assert.equal(probe.cleanup, "absent");
          assert.equal(summary.incompleteRecords, 0);
          assert.deepEqual(
            await raw("stdout"),
            Buffer.from([0, 255, 128, 13, 10]),
          );
          assert.deepEqual(await raw("stderr"), Buffer.from([254, 0, 10]));
          assert.equal((await raw("error")).length, 0);
        }
      } finally {
        await f.remove();
      }
    },
  );
}

for (const mode of [
  "nonzero",
  "signal",
  "spawn-failure",
  "timeout",
  "disconnect",
] as const) {
  test(`collector retains actual ${mode} failure and cleanup`, async () => {
    const result = await once(mode, {
      ...bounds,
      probeTimeoutMs: mode === "timeout" || mode === "disconnect" ? 150 : 2000,
    });
    const probe = result.records[0];
    assert.equal(probe.complete, false);
    assert.equal(result.summary.incompleteRecords, 1);
    assert.ok(
      result.summary.diagnostics.includes("probe-failure-stopped-collector"),
    );
    if (mode === "nonzero") {
      assert.equal(probe.code, 7);
      assert.equal(result.stdout.toString(), "before failure");
    } else if (mode === "signal") {
      if (process.platform === "win32") assert.equal(probe.code, 1);
      else assert.equal(probe.signal, "SIGTERM");
    } else if (mode === "spawn-failure") {
      assert.equal(probe.errorCode, "ENOENT");
      assert.equal(probe.pid, null);
      assert.equal(probe.cleanup, "no-child");
    } else assert.equal(probe.stop, "timeout");
    if (probe.pid !== null) {
      assert.equal(probe.reaped, true);
      assert.equal(probe.cleanup, "absent");
    }
  });
}

test("collector retains an incomplete overflow prefix", async () => {
  const result = await once("overflow", { ...bounds, maxProbeBytes: 97 });
  const probe = result.records[0];
  assert.equal(result.stdout.length, 97);
  assert.ok(result.stdout.every((byte) => byte === 255));
  assert.ok(probe.seenBytes > 97);
  assert.equal(probe.overflow, true);
  assert.equal(probe.complete, false);
  assert.equal(probe.stop, "output-bound");
  assert.equal(probe.reaped, true);
});

test("collector retains samples before a later failure", async () => {
  const f = await fixture();
  try {
    const collector = await startCollectorFixture(
      f.options,
      "error-after-success",
    );
    const summary = await collector.finished;
    const observations = await records(f.options.directory);
    assert.equal(observations.length, 2);
    assert.equal(observations[0].complete, true);
    assert.equal(observations[1].complete, false);
    assert.equal(
      await readFile(
        join(f.options.directory, "probe-00000000.stdout.bin"),
        "utf8",
      ),
      "retained",
    );
    assert.equal(
      await readFile(
        join(f.options.directory, "probe-00000001.stderr.bin"),
        "utf8",
      ),
      "fixture failure",
    );
    assert.equal(summary.incompleteRecords, 1);
    assert.equal(summary.records, 2);
    assert.equal(
      (await collector.close("workload-failed")).assessment,
      "UNASSESSED",
    );
  } finally {
    await f.remove();
  }
});

test("collector abort reaps an active probe", async () => {
  const f = await fixture();
  const abort = new AbortController();
  try {
    const collector = await startCollectorFixture(
      { ...f.options, signal: abort.signal },
      "timeout",
    );
    // Abort after launch, independently of a fixture's readiness callback.
    const timer = setTimeout(() => abort.abort(), 50);
    try {
      const summary = await collector.finished;
      const probe = (await records(f.options.directory))[0];
      assert.equal(probe.stop, "aborted");
      assert.equal(probe.reaped, true);
      assert.equal(probe.cleanup, "absent");
      assert.equal(summary.records, 1);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    await f.remove();
  }
});

test("collector preaborted signal never launches a probe", async () => {
  const f = await fixture();
  const abort = new AbortController();
  abort.abort();
  try {
    const collector = await startCollectorFixture(
      { ...f.options, signal: abort.signal },
      "bytes",
    );
    const summary = await collector.finished;
    await collector.ready;
    assert.equal(summary.records, 0);
    assert.equal(
      (await json(join(f.options.directory, "finish.json"))).reason,
      "caller-abort",
    );
  } finally {
    await f.remove();
  }
});

for (const reason of [
  "caller-close",
  "workload-failed",
  "disconnect",
] as const) {
  test(`collector finalizes after ${reason}`, async () => {
    const f = await fixture();
    try {
      const collector = await startCollectorFixture(f.options, "bytes");
      await collector.ready;
      const first = await collector.close(reason);
      const again = await collector.close(reason);
      assert.deepEqual(first, again);
      const final = await json(join(f.options.directory, "finish.json"));
      assert.equal(final.reason, reason);
      assert.ok(first.records >= 1);
      assert.ok(
        final.finalChildren.every(
          (child: { groupAbsent: boolean }) => child.groupAbsent,
        ),
      );
      const count = (await readdir(f.options.directory)).length;
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
      assert.equal((await readdir(f.options.directory)).length, count);
    } finally {
      await f.remove();
    }
  });
}

test("collector observes while a child blocks", async () => {
  const observing = await fixture();
  const blocking = await fixture();
  let collector: NativeHostCollector | undefined;
  let child: NativeHostCollector | undefined;
  let heartbeats = 0;
  const heartbeat = setInterval(() => {
    heartbeats++;
  }, 5);
  try {
    collector = await startCollectorFixture(observing.options, "bytes");
    await collector.ready;
    child = await startCollectorFixture(
      { ...blocking.options, bounds: { ...bounds, maxSamples: 1 } },
      "blocked",
    );
    await child.finished;
    const summary = await collector.close("caller-close");
    const raw = (
      await readFile(
        join(blocking.options.directory, "probe-00000000.stdout.bin"),
        "utf8",
      )
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(Date.parse(raw[1].end) - Date.parse(raw[0].start) >= 200);
    assert.ok(heartbeats > 10);
    assert.ok(summary.samples >= 3);
    const probes = await records(observing.options.directory);
    assert.ok(
      probes.some(
        (probe) =>
          Date.parse(probe.start.utc) > Date.parse(raw[0].start) &&
          Date.parse(probe.end.utc) < Date.parse(raw[1].end),
      ),
    );
    for (let i = 1; i < probes.length; i++) {
      assert.ok(
        BigInt(probes[i].start.monotonicNs) >=
          BigInt(probes[i - 1].end.monotonicNs),
      );
    }
  } finally {
    clearInterval(heartbeat);
    await collector?.close("workload-failed");
    await child?.close("workload-failed");
    await observing.remove();
    await blocking.remove();
  }
});

test("collector records actual callback gaps", async () => {
  const f = await fixture();
  try {
    const collector = await startCollectorFixture(f.options, "bytes");
    await collector.ready;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 180);
    // Allow the late next callback to complete before closing.
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    const summary = await collector.close("caller-close");
    assert.ok(summary.maxObservationGapMs >= 100);
    assert.ok(summary.maxCallbackLatenessMs >= 100);
    assert.ok(summary.lateCallbacks > 0);
    assert.ok(summary.diagnostics.includes("late-observation-callback"));
    assert.equal(summary.physicalExclusion, "unknown");
  } finally {
    await f.remove();
  }
});

test("collector directories and byte files are fresh and private", async () => {
  const f = await fixture();
  try {
    const collector = await startCollectorFixture(
      { ...f.options, bounds: { ...bounds, maxSamples: 1 } },
      "bytes",
    );
    await collector.finished;
    if (process.platform !== "win32") {
      assert.equal((await stat(f.options.directory)).mode & 0o777, 0o700);
      for (const name of await readdir(f.options.directory)) {
        assert.equal(
          (await stat(join(f.options.directory, name))).mode & 0o777,
          0o600,
        );
      }
    }
    const before = await readFile(join(f.options.directory, "start.json"));
    await assert.rejects(
      startCollectorFixture(f.options, "bytes"),
      /Native host collector failed/u,
    );
    assert.deepEqual(
      await readFile(join(f.options.directory, "start.json")),
      before,
    );
  } finally {
    await f.remove();
  }
});

test("collector enforces byte and record controls", async () => {
  const f = await fixture();
  try {
    const collector = await startCollectorFixture(
      { ...f.options, bounds: { ...bounds, maxTotalBytes: 8, maxRecords: 1 } },
      "bytes",
    );
    const summary = await collector.finished;
    assert.equal(summary.rawBytes, 8);
    assert.equal(summary.records, 1);
    assert.ok(summary.diagnostics.includes("transport-control-bound"));
    assert.deepEqual(
      await readFile(join(f.options.directory, "probe-00000000.stdout.bin")),
      Buffer.from([0, 255, 128, 13, 10]),
    );
  } finally {
    await f.remove();
  }
});

test("collector preserves earlier records on storage failure", async () => {
  const f = await fixture();
  try {
    const collector = await startCollectorFixture(
      { ...f.options, bounds: { ...bounds, intervalMs: 500 } },
      "bytes",
    );
    await collector.ready;
    const first = await readFile(
      join(f.options.directory, "probe-00000000.stdout.bin"),
    );
    const path = join(f.options.directory, "probe-00000001.stdout.bin");
    await writeFile(path, "caller sentinel", { flag: "wx", mode: 0o600 });
    const summary = await collector.finished;
    assert.ok(summary.diagnostics.includes("storage-or-collector-failure"));
    assert.deepEqual(
      await readFile(join(f.options.directory, "probe-00000000.stdout.bin")),
      first,
    );
    assert.equal(await readFile(path, "utf8"), "caller sentinel");
    assert.ok((await records(f.options.directory))[0].reaped);
  } finally {
    await f.remove();
  }
});

test("collector keeps secrets and raw paths private", async () => {
  const f = await fixture();
  const previous = process.env.OSEO_COLLECTOR_TEST_SECRET;
  process.env.OSEO_COLLECTOR_TEST_SECRET = "fixture-private-sentinel";
  try {
    const collector = await startCollectorFixture(
      { ...f.options, bounds: { ...bounds, maxSamples: 1 } },
      "environment",
    );
    const summary = await collector.finished;
    assert.equal(
      await readFile(
        join(f.options.directory, "probe-00000000.stdout.bin"),
        "utf8",
      ),
      "true",
    );
    const publicText = JSON.stringify(summary);
    for (const forbidden of [
      f.root,
      "fixture-private-sentinel",
      "stdout",
      "logical-slot-1",
      "github-claim",
      "accepted",
      "whole-window",
    ]) {
      assert.ok(!publicText.includes(forbidden));
    }
    const probe = (await records(f.options.directory))[0];
    assert.deepEqual(probe.environment, {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      LC_ALL: "C",
      LANG: "C",
      TZ: "UTC",
    });
  } finally {
    if (previous === undefined) delete process.env.OSEO_COLLECTOR_TEST_SECRET;
    else process.env.OSEO_COLLECTOR_TEST_SECRET = previous;
    await f.remove();
  }
});

test("collector separates labels, origin and OS facts", async () => {
  const f = await fixture();
  try {
    const collector = await startCollectorFixture(
      {
        ...f.options,
        bounds: { ...bounds, maxSamples: 1 },
        logicalSlots: ["oseo-mac-1", "oseo-mac-2", "unmapped-third-slot"],
        origin: {
          kind: "github-claim",
          repository: "fixture/oseo",
          runId: "101",
          jobId: "202",
          runnerId: "303",
        },
      },
      "bytes",
    );
    const summary = await collector.finished;
    const start = await json(join(f.options.directory, "start.json"));
    const sample = await json(
      join(f.options.directory, "sample-00000000.json"),
    );
    assert.equal(start.origin.kind, "github-claim");
    assert.equal(start.originVerification, "unverified");
    assert.equal(start.logicalSlots.length, 3);
    assert.equal(sample.identity.account, null);
    assert.equal(sample.identity.uid, null);
    assert.equal(summary.assessment, "UNASSESSED");
    assert.ok(summary.diagnostics.includes("os-account-unknown"));
  } finally {
    await f.remove();
  }
});

for (const [key, value] of [
  ["probeTimeoutMs", 0],
  ["intervalMs", Infinity],
  ["maxSamples", -1],
  ["maxTotalBytes", NaN],
  ["maxProbeBytes", 17 * 1024 * 1024],
  ["maxRecords", 1.2],
  ["cleanupMs", 2_147_483_648],
] as const) {
  test(`collector rejects invalid ${key} controls`, async () => {
    const f = await fixture();
    try {
      await assert.rejects(
        startCollectorFixture(
          { ...f.options, bounds: { ...bounds, [key]: value } },
          "bytes",
        ),
      );
      assert.deepEqual(await readdir(f.root), []);
    } finally {
      await f.remove();
    }
  });
}

test("collector rejects relative and symlinked output parents", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      startCollectorFixture(
        { ...f.options, directory: "relative/path" },
        "bytes",
      ),
    );
    if (process.platform !== "win32") {
      await mkdir(join(f.root, "parent"));
      await symlink(join(f.root, "parent"), join(f.root, "link"));
      await assert.rejects(
        startCollectorFixture(
          { ...f.options, directory: join(f.root, "link", "raw") },
          "bytes",
        ),
      );
      assert.deepEqual(await readdir(join(f.root, "parent")), []);
    }
  } finally {
    await f.remove();
  }
});

test("collector reports bounded incomplete coverage", async () => {
  const result = await once("slow");
  assert.equal(result.summary.samples, 1);
  assert.ok(result.summary.diagnostics.includes("sample-control-bound"));
  assert.ok(
    result.summary.diagnostics.includes(
      "sampling-cannot-exclude-fleeting-processes",
    ),
  );
  assert.equal(result.summary.target, "fixture");
});

test(
  "collector escalates only its owned POSIX group after TERM grace",
  {
    skip: process.platform === "win32" ? "POSIX group signals only" : false,
  },
  async () => {
    const result = await once("ignore-term", {
      ...bounds,
      probeTimeoutMs: 500,
    });
    assert.equal(result.records[0].stop, "timeout");
    assert.equal(result.records[0].signal, "SIGKILL");
    assert.equal(result.records[0].reaped, true);
    assert.equal(result.records[0].cleanup, "absent");
  },
);

test("collector rejects invalid Mac calendar starts", () => {
  for (const date of [
    "Fri Nov 12 01:00:00 2026",
    "Mon Feb 30 01:00:00 2026",
    "Thu Nov 12 25:00:00 2026",
  ]) {
    assert.equal(
      parseCollectorProcesses(
        bytes(`1 0 1 0 0.0 0:01.00 ${date} launchd\n`),
        mac,
        10,
      ).complete,
      false,
    );
  }
});

test("collector finalizes after a separate child failure", async () => {
  const observer = await fixture();
  const work = await fixture();
  let collector: NativeHostCollector | undefined;
  try {
    collector = await startCollectorFixture(observer.options, "bytes");
    await collector.ready;
    const failingChild = await startCollectorFixture(work.options, "nonzero");
    await failingChild.finished;
    assert.equal((await records(work.options.directory))[0].code, 7);
  } finally {
    const result = await collector?.close("workload-failed");
    assert.ok(result && result.records >= 1);
    const final = await json(join(observer.options.directory, "finish.json"));
    assert.equal(final.reason, "workload-failed");
    assert.ok(
      final.finalChildren.every((child: { reaped: boolean }) => child.reaped),
    );
    await observer.remove();
    await work.remove();
  }
});

test("collector checkpoints queue fresh durable serial samples", async () => {
  const f = await fixture();
  const collector = await startCollectorFixture(f.options, "slow");
  try {
    await collector.ready;
    const before = collector.checkpoint("before");
    const after = collector.checkpoint("after");
    const [first, last] = await Promise.all([before, after]);
    assert.equal(first.phase, "before");
    assert.equal(last.phase, "after");
    assert.ok(last.sample > first.sample);
    assert.ok(last.firstRecord >= first.nextRecord);
    assert.ok(
      BigInt(first.start.monotonicNs) >= BigInt(first.requested.monotonicNs),
    );
    assert.ok(
      BigInt(last.start.monotonicNs) >= BigInt(last.requested.monotonicNs),
    );
    assert.ok(BigInt(last.start.monotonicNs) >= BigInt(first.end.monotonicNs));
    const { createHash } = await import("node:crypto");
    for (const point of [first, last]) {
      const raw = await readFile(point.snapshot.path);
      assert.equal(raw.length, point.snapshot.bytes);
      assert.equal(
        createHash("sha256").update(raw).digest("hex"),
        point.snapshot.sha256,
      );
      if (process.platform !== "win32") {
        assert.equal((await stat(point.snapshot.path)).mode & 0o777, 0o600);
      }
      const sample = JSON.parse(raw.toString("utf8"));
      assert.deepEqual(sample.checkpoint, {
        phase: point.phase,
        request: point.request,
        requested: point.requested,
      });
      assert.deepEqual(sample.start, point.start);
      assert.deepEqual(sample.end, point.end);
      assert.equal(sample.firstRecord, point.firstRecord);
      assert.equal(sample.nextRecord, point.nextRecord);
      assert.equal(point.assessment, "UNASSESSED");
      assert.equal(point.physicalExclusion, "unknown");
    }
    const summary = await collector.close("caller-close");
    const probes = await records(f.options.directory);
    for (let index = 1; index < probes.length; index++) {
      assert.ok(
        BigInt(probes[index].start.monotonicNs) >=
          BigInt(probes[index - 1].end.monotonicNs),
      );
    }
    assert.ok(summary.samples <= bounds.maxSamples);
    const final = await json(join(f.options.directory, "finish.json"));
    assert.ok(
      final.finalChildren.every((child: { reaped: boolean }) => child.reaped),
    );
  } finally {
    await collector.close("caller-close");
    await retainCheckpointFixture(f.root);
    await f.remove();
  }
});

test("collector checkpoints consume the sample allowance", async () => {
  const f = await fixture();
  const collector = await startCollectorFixture(
    { ...f.options, bounds: { ...bounds, maxSamples: 2, intervalMs: 1000 } },
    "bytes",
  );
  try {
    await collector.ready;
    const point = await collector.checkpoint("after");
    assert.equal(point.sample, 1);
    await assert.rejects(collector.checkpoint("after"));
    assert.equal((await collector.finished).samples, 2);
  } finally {
    await collector.close("caller-close");
    await retainCheckpointFixture(f.root);
    await f.remove();
  }
});

for (const stop of ["close", "abort", "storage"] as const) {
  test(`collector rejects pending checkpoints on ${stop}`, async () => {
    const f = await fixture();
    const signal = new AbortController();
    const collector = await startCollectorFixture(
      { ...f.options, signal: signal.signal },
      "slow",
    );
    try {
      await collector.ready;
      const pending = collector.checkpoint("after");
      const rejected = assert.rejects(pending);
      if (stop === "close") await collector.close("caller-close");
      if (stop === "abort") signal.abort();
      if (stop === "storage") {
        await writeFile(
          join(f.options.directory, "sample-00000001.json"),
          "retain-existing",
          { flag: "wx" },
        );
      }
      await rejected;
      const summary = await collector.finished;
      if (stop === "storage") {
        assert.ok(summary.diagnostics.includes("storage-or-collector-failure"));
        assert.equal(
          await readFile(
            join(f.options.directory, "sample-00000001.json"),
            "utf8",
          ),
          "retain-existing",
        );
      }
      await assert.rejects(collector.checkpoint("before"));
      const final = await json(join(f.options.directory, "finish.json"));
      assert.ok(
        final.finalChildren.every((child: { reaped: boolean }) => child.reaped),
      );
    } finally {
      await collector.close("caller-close");
      await retainCheckpointFixture(f.root);
      await f.remove();
    }
  });
}

test("collector failed ready is not a completed checkpoint", async () => {
  const f = await fixture();
  const collector = await startCollectorFixture(f.options, "nonzero");
  try {
    const rejected = assert.rejects(collector.checkpoint("before"));
    await collector.ready;
    await rejected;
    await collector.finished;
    await assert.rejects(collector.checkpoint("after"));
  } finally {
    await collector.close("caller-close");
    await retainCheckpointFixture(f.root);
    await f.remove();
  }
});

async function retainCheckpointFixture(root: string): Promise<void> {
  const base = process.env.OSEO_CHECKPOINT_TEST_EVIDENCE;
  if (base === undefined) return;
  await mkdir(base, { recursive: true, mode: 0o700 });
  const target = await mkdtemp(join(base, "fixture-"));
  const { cp } = await import("node:fs/promises");
  await cp(root, join(target, "raw"), { recursive: true });
}

test("collector completed failed reads remain unassessed", async () => {
  const f = await fixture();
  const collector = await startCollectorFixture(f.options, "missing-read");
  try {
    await collector.ready;
    const point = await collector.checkpoint("after");
    assert.ok(point.diagnostics.includes("partial-or-failed-probe"));
    assert.equal(point.nextRecord - point.firstRecord, 2);
    assert.equal(point.assessment, "UNASSESSED");
    assert.equal(point.physicalExclusion, "unknown");
    assert.ok((await collector.close("caller-close")).incompleteRecords > 0);
  } finally {
    await collector.close("caller-close");
    await retainCheckpointFixture(f.root);
    await f.remove();
  }
});
