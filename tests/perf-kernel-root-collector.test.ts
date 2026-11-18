import assert from "node:assert/strict";
import { spawn as spawnChild } from "node:child_process";
import { once } from "node:events";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { fileIdentity } from "../tools/perf-profile-capture.ts";
import type * as S from "../tools/perf/native-host-collector.ts";
import { KernelCollectorReader } from "../tools/perf/kernel-root/collector.ts";
import { writeKernelControl } from "../tools/perf/kernel-root/control.ts";
import type { RootLifetime } from "../tools/perf/kernel-root/lifetime.ts";

/** Private fixtures require POSIX ownership and mode semantics. */
const posixFixture = {
  skip:
    process.platform === "linux" || process.platform === "darwin"
      ? false
      : "requires POSIX ownership and private file modes",
};

// Integrated gates use the local actual S. This preparation worktree may
// inject its read-only actual contract source; no parser implementation copy.
const localApi = new URL(
  "../tools/perf/native-host-collector.ts",
  import.meta.url,
);
const injectedApi = process.env.OSEO_KERNEL_ROOT_CONTRACT_SOURCE;
assert.ok(
  existsSync(localApi) || injectedApi,
  "Actual S is not integrated and no read-only contract source was assigned",
);
const apiUrl = existsSync(localApi) ? localApi : pathToFileURL(injectedApi!);
// SAFETY: offline comparison against the actual S API; no source admission.
const api = (await import(apiUrl.href)) as typeof S;
const host = {
  target: "linux-x86_64-gnu" as const,
  uid: 1000,
  hardware: "11111111-1111-4111-8111-111111111111",
  boot: "22222222-2222-4222-8222-222222222222",
};
const root = {
  pid: 100,
  ppid: 1,
  group: 100,
  uid: 1000,
  comm: "node",
  birth: "100",
  birthPrecision: "kernel-ticks" as const,
};
const background = {
  ...root,
  pid: 1,
  ppid: 0,
  group: 1,
  uid: 0,
  comm: "init",
  birth: "1",
};
const bounds: S.CollectorBounds = {
  intervalMs: 100,
  probeTimeoutMs: 1000,
  termGraceMs: 10,
  cleanupMs: 10,
  maxProbeBytes: 65536,
  maxTotalBytes: 1000000,
  maxRecords: 1000,
  maxSamples: 100,
  maxProcesses: 100,
  maxGapMs: 1000,
  maxClockSkewMs: 1,
};

function clock(ms: number) {
  return {
    utc: new Date(ms).toISOString(),
    monotonicNs: String(ms * 1000000),
  };
}

interface RawRow {
  readonly pid: number;
  readonly ppid: number;
  readonly group: number;
  readonly uid: number;
  readonly comm: string;
  readonly birth: string;
  readonly sid?: number;
}

/** Write one original-format S sample; rows absent from base lose births. */
function writeRawSample(
  directory: string,
  state: { records: number; incomplete: number },
  index: number,
  base: readonly RawRow[],
  rows: readonly string[],
  fault: string,
  readFailure?: { readonly code: string; readonly message: string },
): void {
  const firstRecord = state.records;
  const ps = 400 + index;
  const processes = api.parseCollectorProcesses(
    Buffer.from(rows.join("\n")),
    host.target,
    bounds.maxProcesses,
  );
  assert.equal(processes.complete, true);
  const inventory = {
    ...processes,
    processes: Array.from(processes.processes, (row) => {
      const known = base.find((item) => item.pid === row.pid);
      return known
        ? {
            ...row,
            birth: known.birth,
            birthPrecision: "kernel-ticks" as const,
          }
        : row;
    }),
  };
  const contents = new Map<string, string>([
    ["hardware", fault === "hardware" ? host.boot : host.hardware],
    ["boot", host.boot],
    ["uid", "1000"],
    ["processes", rows.join("\n")],
    ["load", "0.00 0.00 0.00 1/10 400\n"],
    ["cpu-counters", "cpu 1 2 3 4\nbtime 1\n"],
  ]);
  const plan = [
    ...api.nativeCollectorPlan(host.target),
    ...inventory.processes.map((row) => ({
      name: `birth-${row.pid}`,
      kind: "read" as const,
      executable: `/proc/${row.pid}/stat`,
      argv: [],
    })),
  ];
  for (const probe of plan) {
    const birth = probe.name.startsWith("birth-");
    const pid = birth ? Number(probe.name.slice(6)) : null;
    const known = base.find((row) => row.pid === pid);
    const missing =
      (birth && !known) ||
      ((fault === "unrelated-probe" || fault === "esrch-other-read") &&
        probe.name === "load");
    const errorCode = fault.startsWith("esrch") ? "ESRCH" : "ENOENT";
    const failure = readFailure ?? {
      code: fault === "esrch-wrong-code" ? "EACCES" : errorCode,
      message:
        fault === "esrch-wrong-byte"
          ? `ENOENT: ${probe.executable}`
          : fault === "enoent-no-path"
            ? "ENOENT: no such file or directory, read"
            : errorCode === "ESRCH"
              ? "ESRCH: no such process, read" +
                (fault === "esrch-with-path" ? ` ${probe.executable}` : "")
              : `ENOENT: ${probe.executable}`,
    };
    if (missing) state.incomplete++;
    const prefix = `probe-${String(state.records++).padStart(8, "0")}`;
    const stat = known
      ? `${known.pid} (${known.comm}) S ` +
        [
          known.ppid,
          known.group,
          known.sid ?? known.group,
          ...Array(15).fill(0),
          known.birth,
        ].join(" ")
      : "";
    const output = birth ? stat : (contents.get(probe.name) ?? "fixture\n");
    const streams = [missing ? "" : output, "", missing ? failure.message : ""];
    const files = streams.map((value, slot) => {
      const name = prefix + `.${["stdout", "stderr", "error"][slot]}.bin`;
      const path = join(directory, name);
      writeFileSync(path, value, { mode: 0o600 });
      const pin = fileIdentity(path);
      return {
        path: name,
        bytes: pin.bytes,
        sha256: pin.sha256,
        mode: "0600",
      };
    });
    if (missing && fault === "esrch-altered-original")
      writeFileSync(join(directory, files[2]!.path), "ESRCH: altered");
    writeKernelControl(join(directory, prefix + ".json"), {
      probe,
      environment: {
        PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
        LC_ALL: "C",
        LANG: "C",
        TZ: "UTC",
      },
      complete: !missing,
      code: probe.kind === "command" ? 0 : null,
      errorCode: missing ? failure.code : null,
      readCompleted: probe.kind === "read" && !missing,
      pid: probe.kind === "command" ? ps : null,
      reportedPid: probe.kind === "command" ? ps : null,
      reaped: probe.kind === "command",
      cleanup: probe.kind === "command" ? "absent" : "no-child",
      stop: null,
      overflow: false,
      signal: null,
      start: clock(index * 100 + (birth ? 3 : 1)),
      end: clock(index * 100 + (birth ? 4 : 2)),
      host: {
        collectorPid: root.pid,
        platform: "linux",
        arch: "x64",
        hostname: "fixture",
      },
      files,
    });
  }
  writeKernelControl(
    join(directory, `sample-${String(index).padStart(8, "0")}.json`),
    {
      start: clock(index * 100),
      end: clock(index * 100 + 20),
      firstRecord,
      nextRecord: state.records,
      identity: { ...host, account: "fixture" },
      inventory,
      snapshotIsNotAtomic: true,
      counters: {
        load: api.parseCollectorCounters(
          "linux-load",
          Buffer.from(contents.get("load")!),
        ),
        "cpu-counters": api.parseCollectorCounters(
          "linux-stat",
          Buffer.from(contents.get("cpu-counters")!),
        ),
      },
    },
  );
}

async function rawFixture(
  fault: string,
  readFailure?: { readonly code: string; readonly message: string },
): Promise<void> {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "kernel-S-raw-")));
  const state = { records: 0, incomplete: 0 };
  const reader = new KernelCollectorReader(api, host, bounds, directory, root, [
    background,
  ]);
  const sample = (index: number) => {
    const ps = 400 + index;
    const base = [root, background];
    if (fault !== "quiet")
      base.push({ ...root, pid: 200, ppid: 100, group: 200, birth: "200" });
    if (fault === "zero-incomplete")
      base.push({ ...root, pid: ps, ppid: 100, group: ps, birth: "400" });
    const rows = base.map(
      (row) =>
        `${row.pid} ${row.ppid} ${row.group} ` +
        `${row.uid} 0.0 00:00 ${row.comm}`,
    );
    if (index > 0 && fault !== "quiet" && fault !== "zero-incomplete")
      rows.push(
        `300 ${fault === "unknown-parent" ? 999 : 200} ` +
          `${fault === "detached" ? 999 : 200} 1000 0.0 00:00 leaf`,
      );
    if (fault !== "zero-incomplete")
      rows.push(`${ps} 100 ${ps} 1000 0.0 00:00 ps`);
    writeRawSample(directory, state, index, base, rows, fault, readFailure);
  };
  try {
    writeKernelControl(join(directory, "start.json"), { fixture: true });
    sample(0);
    if (
      [
        "hardware",
        "unrelated-probe",
        "esrch-wrong-code",
        "esrch-wrong-byte",
        "enoent-no-path",
        "esrch-other-read",
        "esrch-altered-original",
      ].includes(fault)
    )
      await assert.rejects(reader.consumeThrough(0));
    else {
      await reader.consumeThrough(0);
      sample(1);
      if (fault === "unknown-parent" || fault === "detached")
        await assert.rejects(reader.consumeThrough(1));
      else {
        await reader.consumeThrough(1);
        const summary: S.CollectorSummary = {
          assessment: "UNASSESSED",
          physicalExclusion: "unknown",
          rootAdjudication: "required-separately",
          target: host.target,
          start: clock(0),
          end: clock(120),
          samples: 2,
          records: state.records,
          incompleteRecords: state.incomplete,
          rawBytes: 0,
          maxObservationGapMs: 100,
          maxCallbackLatenessMs: 0,
          lateCallbacks: 0,
          diagnostics: [
            "partial-or-failed-probe",
            ...(state.incomplete > 0 ? ["pid-birth-unknown"] : []),
            ...(fault === "unknown-diagnostic" ? ["unknown-probe"] : []),
          ],
        };
        writeKernelControl(join(directory, "finish.json"), {
          summary,
          finalChildren: [{ reaped: true, groupAbsent: true }],
        });
        if (fault === "zero-incomplete" || fault === "unknown-diagnostic") {
          if (fault === "zero-incomplete") assert.equal(state.incomplete, 0);
          await assert.rejects(reader.finish(summary));
        } else {
          assert.ok(state.incomplete > 0);
          const pins = await reader.finish(summary);
          assert.ok(pins.some((pin) => pin.path.endsWith("/finish.json")));
        }
        if (fault === "quiet" || fault === "zero-incomplete")
          reader.requireQuiet(200);
        else assert.throws(() => reader.requireQuiet(200), /descendant/);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const fault of [
  "quiet",
  "stable-leaf",
  "unknown-parent",
  "detached",
  "hardware",
  "unrelated-probe",
  "unknown-diagnostic",
  "zero-incomplete",
  "esrch",
  "esrch-with-path",
  "esrch-wrong-code",
  "esrch-wrong-byte",
  "enoent-no-path",
  "esrch-other-read",
  "esrch-altered-original",
])
  test(
    `actual S raw/parser contract is replayed: ${fault}`,
    posixFixture,
    async () => {
      await rawFixture(fault);
    },
  );

test(
  "owned Linux child stat read after reaping preserves an unknown birth",
  { skip: process.platform !== "linux" ? "requires Linux procfs" : false },
  async () => {
    const child = spawnChild(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      {
        stdio: "ignore",
      },
    );
    let descriptor: number | undefined;
    try {
      await once(child, "spawn");
      const path = `/proc/${child.pid}/stat`;
      descriptor = openSync(path, "r");
      const exited = once(child, "exit");
      assert.equal(child.kill("SIGTERM"), true);
      await exited;
      let failure:
        | { readonly code: string; readonly message: string }
        | undefined;
      assert.throws(
        () => readSync(descriptor!, Buffer.alloc(4096), 0, 4096, 0),
        (error: NodeJS.ErrnoException) => {
          assert.equal(error.code, "ESRCH");
          assert.equal(error.syscall, "read");
          assert.equal(error.path, undefined);
          assert.equal(error.message.includes(path), false);
          failure = { code: error.code!, message: error.message };
          return true;
        },
      );
      assert.ok(failure);
      await rawFixture("esrch", failure);
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        await exited;
      }
    }
  },
);

const control = { ...root, pid: 200, ppid: 100, group: 200, birth: "200" };
const helper = {
  ...control,
  pid: 210,
  ppid: 200,
  comm: "python3.14",
  birth: "210",
};

/**
 * Bind the real reader to original-format lifetime arm, pipe, Root arm and
 * poll files. Only the socket transport is replaced; replay is the reader's.
 */
function lifetimeFixture(
  directory: string,
  options: { readonly observerPid: number; readonly rootArmedNs: string },
): Pick<RootLifetime, "poll"> {
  const write = <Value>(name: string, value: Value) => {
    const path = join(directory, name);
    writeKernelControl(path, value);
    return fileIdentity(path);
  };
  const binding = {
    taskId: "kernel-task",
    runId: "fixture-kernel",
    manifestSha256: "1".repeat(64),
    host,
    phase: "kernel-control" as const,
  };
  const config = {
    directory,
    controlPid: control.pid,
    rootPid: root.pid,
    host,
    pythonVersion: "fixture",
    pythonPath: "/usr/bin/python3.14",
    pythonSha256: "2".repeat(64),
    sourceSha256: "3".repeat(64),
    binding,
    responseMs: 1000,
    timeoutMs: 10000,
    maxSamples: 10,
  };
  const challenge = { nonce: "4".repeat(64), observerPid: options.observerPid };
  const arm = {
    config,
    challenge,
    response: { challenge, binding },
    hostObservation: {
      boot: host.boot,
      uid: host.uid,
      hostname: "fixture",
      hardware: { value: null, error: { errno: 13, message: "denied" } },
    },
    leaderStat: `200 (node) S ${[100, 200, 200, ...Array(15).fill(0), 200].join(
      " ",
    )}`,
    handleGeneration: "5".repeat(64),
    pidfdNumber: 7,
    events: [],
  };
  const armPin = write("arm.json", arm);
  const spawn = write("spawn.json", { pid: options.observerPid, config });
  const pipe = write("pipe.json", {
    arm: armPin,
    spawn,
    challengeRaw: JSON.stringify(challenge),
    responseRaw: JSON.stringify(arm.response),
    armRaw: JSON.stringify(arm),
  });
  const hello = { kind: "hello", binding, nonce: "6".repeat(64) };
  const reply = {
    hello,
    arm,
    peer: { pid: root.pid, uid: host.uid, gid: process.getgid!() },
  };
  write("root-arm.json", {
    arm: armPin,
    rootArmedNs: options.rootArmedNs,
    actualRootPid: root.pid,
    spawnedControlPid: control.pid,
    hello,
    reply,
    wireHello: JSON.stringify(hello),
    wireReply: JSON.stringify(reply),
    pipe,
  });
  let sequence = 0;
  return {
    poll: async (sample, probe, sampleSequence) => {
      // SAFETY: the fixture's own original-format sample; only its end clock.
      const completed = JSON.parse(readFileSync(sample.path, "utf8")) as {
        readonly end: { readonly monotonicNs: string };
      };
      const requestedNs = String(BigInt(completed.end.monotonicNs) + 1n);
      const receivedNs = String(BigInt(requestedNs) + 1n);
      const request = {
        kind: "poll",
        binding,
        sequence,
        sampleSequence,
        sample,
        probe,
        handleGeneration: arm.handleGeneration,
      };
      const response = { request, events: [] };
      const transcript = write(`poll-${sequence++}.json`, {
        arm: armPin,
        request,
        response,
        requestedNs,
        receivedNs,
        wireRequest: JSON.stringify(request) + "\n",
        wireResponse: JSON.stringify(response) + "\n",
      });
      return {
        sample,
        probe,
        sampleSequence,
        rootArmedNs: options.rootArmedNs,
        requestedNs,
        receivedNs,
        leaderPid: control.pid,
        leaderStat: arm.leaderStat,
        arm: armPin,
        transcript,
        handleGeneration: arm.handleGeneration,
      };
    },
  };
}

/** Intermediate quiet checks admit only the replayed, active helper. */
async function helperFixture(fault: string): Promise<void> {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "kernel-S-helper-")),
  );
  const lifetimeDirectory = join(directory, "lifetime");
  mkdirSync(lifetimeDirectory, { mode: 0o700 });
  const state = { records: 0, incomplete: 0 };
  const reader = new KernelCollectorReader(api, host, bounds, directory, root, [
    background,
  ]);
  const sample = (index: number, extra: readonly RawRow[]) => {
    const ps = 400 + index;
    const base = [root, background, ...extra];
    const rows = base.map(
      (row) =>
        `${row.pid} ${row.ppid} ${row.group} ` +
        `${row.uid} 0.0 00:00 ${row.comm}`,
    );
    rows.push(`${ps} 100 ${ps} 1000 0.0 00:00 ps`);
    writeRawSample(directory, state, index, base, rows, fault);
  };
  const changed = new Map<string, RawRow>([
    ["helper-parent", { ...helper, ppid: 100 }],
    ["helper-session", { ...helper, sid: 100 }],
    ["helper-comm", { ...helper, comm: "python3" }],
    ["helper-reused", { ...helper, birth: "211" }],
  ]);
  const unrelated = new Map<string, RawRow>([
    ["helper-descendant", { ...helper, pid: 220, ppid: 210, birth: "220" }],
    ["helper-sibling", { ...helper, pid: 230, birth: "230" }],
  ]);
  try {
    writeKernelControl(join(directory, "start.json"), { fixture: true });
    // SAFETY: only poll is reached; arm/pipe/poll replay is the actual code.
    reader.lifetime = lifetimeFixture(lifetimeDirectory, {
      observerPid: fault === "helper-pid" ? 211 : helper.pid,
      rootArmedNs: fault === "helper-precausal" ? "9".repeat(18) : "0",
    }) as RootLifetime;
    sample(0, [control, helper]);
    await reader.consumeThrough(0);
    const current = [control, changed.get(fault) ?? helper];
    const extra = unrelated.get(fault);
    if (extra) current.push(extra);
    sample(1, current);
    if (fault === "helper-reused") {
      await assert.rejects(reader.consumeThrough(1), /helper PID reused/);
      return;
    }
    await reader.consumeThrough(1);
    assert.throws(() => reader.requireQuiet(200), /descendant/);
    if (fault !== "helper-active") {
      assert.throws(
        () => reader.requireQuiet(200, true),
        {
          "helper-parent": /stat mismatch/,
          "helper-session": /stat mismatch/,
          "helper-precausal": /precedes the Root arm/,
        }[fault] ?? /descendant/,
      );
      return;
    }
    reader.requireQuiet(200, true);
    assert.throws(() => reader.requireQuiet(999, true));
    // Root's close clears the binding; nothing is exempt from then on.
    reader.lifetime = null;
    assert.throws(() => reader.requireQuiet(200, true), /lifetime/);
    sample(2, [control, helper]);
    await reader.consumeThrough(2);
    assert.throws(() => reader.requireQuiet(), /descendant/);
    sample(3, [{ ...helper, ppid: 100, group: 210, birth: "300" }]);
    await reader.consumeThrough(3);
    assert.throws(() => reader.requireQuiet(), /descendant/);
    sample(4, []);
    await reader.consumeThrough(4);
    reader.requireQuiet();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const fault of [
  "helper-active",
  "helper-pid",
  "helper-parent",
  "helper-session",
  "helper-comm",
  "helper-reused",
  "helper-descendant",
  "helper-sibling",
  "helper-precausal",
])
  test(
    `lifetime helper quiet exemption is exact: ${fault}`,
    posixFixture,
    async () => {
      await helperFixture(fault);
    },
  );
