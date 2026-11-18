import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileIdentity } from "../../perf-profile-capture.ts";
import type { FileIdentity } from "../../perf-profile-capture.ts";
import type { RunRecord } from "../../perf-profile-process.ts";
import type * as S from "../native-host-collector.ts";
import { kernelSessionStat, requireStableKernelChain } from "./ownership.ts";
import type { KernelSessionStat } from "./ownership.ts";
import { readKernelControl } from "./control.ts";
import {
  replayKernelLifetimeProof,
  requireKernelLifetimeArm,
} from "./lifetime.ts";
import type { RootLifetime } from "./lifetime.ts";
import { KernelMacTimeline } from "./mac-timeline.ts";
import type { KernelMacEvent } from "./mac-timeline.ts";

/** Exact identities allocated by direct Root, without a public origin. */
export interface KernelHost {
  readonly target: S.CollectorTarget;
  readonly hardware: string;
  readonly boot: string;
  readonly uid: number;
}

/** Observed immutable process identity; unknown births are not exemptions. */
export interface KernelProcess {
  readonly pid: number;
  readonly ppid: number;
  readonly group: number;
  readonly uid: number;
  readonly comm: string;
  readonly birth: string;
  readonly birthPrecision: "kernel-ticks" | "one-second";
}

/** Original existing native operator records, supplied by direct Root. */
export interface KernelListenerObservation {
  readonly print: RunRecord;
  readonly identity: RunRecord;
}

interface Sample {
  readonly start: S.CollectorClock;
  readonly end: S.CollectorClock;
  readonly firstRecord: number;
  readonly nextRecord: number;
  readonly identity: {
    readonly hardware: string;
    readonly boot: string;
    readonly uid: number;
    readonly account: string;
  };
  readonly inventory: S.ProcessInventory;
  readonly counters: Readonly<
    Record<string, Readonly<Record<string, number | string>> | null>
  >;
  readonly snapshotIsNotAtomic: true;
}

interface Probe {
  readonly environment: Readonly<Record<string, string>>;
  readonly probe: S.CollectorProbe;
  readonly complete: boolean;
  readonly code: number | null;
  readonly errorCode: string | null;
  readonly readCompleted: boolean;
  readonly pid: number | null;
  readonly reportedPid: number | null;
  readonly reaped: boolean;
  readonly cleanup: string;
  readonly stop: string | null;
  readonly overflow: boolean;
  readonly signal: string | null;
  readonly start: S.CollectorClock;
  readonly end: S.CollectorClock;
  readonly host: {
    readonly collectorPid: number;
    readonly platform: string;
    readonly arch: string;
    readonly hostname: string;
  };
  readonly files: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly mode: string;
  }[];
}

/** The original arm shape that requireKernelLifetimeArm() validates. */
type LifetimeArm = Parameters<typeof requireKernelLifetimeArm>[0];

/**
 * The lifetime helper as seen in one consumed sample. Only a sample whose ps
 * started after Root armed is causal: the helper was then alive from before
 * ps until the post-sample poll, so its PID cannot name another process.
 */
interface HelperObservation {
  readonly sample: number;
  readonly causal: boolean;
  readonly arm: FileIdentity;
  readonly pid: number;
  readonly controlPid: number;
  readonly comm: string;
  readonly leaderTicks: string;
  readonly row: S.HostProcess | null;
  readonly stat: KernelSessionStat | null;
}

function sameProcess(known: KernelProcess, row: S.HostProcess): boolean {
  return (
    known.pid === row.pid &&
    known.ppid === row.ppid &&
    known.group === row.group &&
    known.uid === row.uid &&
    known.comm === row.comm &&
    known.birth === row.birth &&
    known.birthPrecision === row.birthPrecision
  );
}

function processBase(rows: readonly S.HostProcess[]) {
  return rows.map(
    ({ birth: _birth, birthPrecision: _precision, ...row }) => row,
  );
}

/**
 * Replay original S bytes conservatively. The existing exact reaped-ps-self
 * exception preserves unknown birth; other missing births remain blocking.
 * Continuous operating control and external Root acceptance stay separate.
 */
export class KernelCollectorReader {
  readonly #api: typeof S;
  readonly #host: KernelHost;
  readonly #bounds: S.CollectorBounds;
  readonly #directory: string;
  readonly #root: KernelProcess;
  readonly #background: readonly KernelProcess[];
  readonly #pins = new Map<string, FileIdentity>();
  readonly #seenPids = new Set<number>();
  readonly #listeners = new Map<
    number,
    {
      readonly uid: number;
      readonly birth: string;
    }
  >();
  readonly timeline: KernelMacTimeline = new KernelMacTimeline();
  lifetime: RootLifetime | null = null;
  #previousStats = new Map<number, Probe>();
  #samples = 0;
  #records = 0;
  #incomplete = 0;
  #last: S.CollectorClock | null = null;
  #lastProcesses: readonly S.HostProcess[] = [];
  #lastProbePid: number | null = null;
  #helper: HelperObservation | null = null;
  #helperBirth: string | null = null;

  constructor(
    api: typeof S,
    host: KernelHost,
    bounds: S.CollectorBounds,
    directory: string,
    root: KernelProcess,
    background: readonly KernelProcess[],
  ) {
    this.#api = api;
    this.#host = structuredClone(host);
    this.#bounds = structuredClone(bounds);
    this.#directory = directory;
    this.#root = structuredClone(root);
    this.#background = structuredClone(background);
    assert.equal(root.uid, host.uid);
    assert.ok(root.birth && host.hardware && host.boot);
    assert.ok(background.length > 0, "Unknown background inventory");
  }

  get samples(): number {
    return this.#samples;
  }

  /** Replay exact launchd/ps originals before admitting restored listeners. */
  observeMacListeners(
    observations: readonly KernelListenerObservation[],
    event?: Omit<KernelMacEvent, "listeners">,
  ): void {
    if (this.#host.target !== "macos-aarch64") {
      assert.equal(observations.length, 0);
      return;
    }
    assert.ok(observations.length === 0 || observations.length === 2);
    this.#listeners.clear();
    const raw = (record: RunRecord, absence = false): string => {
      if (absence)
        assert.ok(Number.isInteger(record.status) && record.status !== 0);
      else assert.equal(record.status, 0);
      assert.equal(record.signal, null);
      assert.equal(record.error, null);
      assert.equal(record.timedOut, false);
      assert.equal(record.groupGone, true);
      const path = join(
        record.directory,
        record.stdout.replace(/\.stdout$/u, ".json"),
      );
      assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), record);
      for (const file of [
        path,
        join(record.directory, record.stdout),
        join(record.directory, record.stderr),
      ]) {
        const pin = fileIdentity(file);
        assert.equal(pin.path, pin.realpath);
        this.#pins.set(file, pin);
      }
      return readFileSync(join(record.directory, record.stdout), "utf8");
    };
    assert.ok(
      event?.commands?.length,
      "Missing original Mac transition commands",
    );
    const transitions = event.commands.filter(
      (record) =>
        record.argv[3] === (event.kind === "stop" ? "bootout" : "bootstrap"),
    );
    const beginning = event.kind === "baseline" ? event.commands : transitions;
    assert.ok(beginning.length > 0, "Missing original service action");
    assert.equal(
      event.startedMs,
      Math.min(...beginning.map((record) => Date.parse(record.startedUtc))),
    );
    assert.equal(
      event.finishedMs,
      Math.max(
        ...event.commands.map((record) => Date.parse(record.finishedUtc)),
      ),
    );
    for (const record of event.commands) {
      const absence = record.argv[3] === "print" && record.status !== 0;
      raw(record, absence);
      if (absence)
        assert.match(
          readFileSync(join(record.directory, record.stderr), "utf8"),
          /Could not find service/u,
        );
    }
    const listeners: KernelProcess[] = [];
    for (const [index, observation] of observations.entries()) {
      const service = `org.oseo.runner.oseo-mac-${index + 1}`;
      const user = index === 0 ? "oseo-runner" : "oseo-runner2";
      assert.deepEqual(observation.print.argv, [
        "/usr/bin/sudo",
        "-n",
        "/bin/launchctl",
        "print",
        `system/${service}`,
      ]);
      const fields: Record<string, string> = {};
      for (const line of raw(observation.print).split("\n")) {
        const match = /^\t(state|pid|username|program|path|type) = (.*)$/u.exec(
          line,
        );
        if (match) {
          assert.equal(fields[match[1]!], undefined);
          fields[match[1]!] = match[2]!;
        }
      }
      assert.equal(fields.state, "running");
      assert.equal(fields.type, "LaunchDaemon");
      assert.equal(fields.username, user);
      assert.equal(fields.path, `/Library/LaunchDaemons/${service}.plist`);
      assert.equal(
        fields.program,
        `/Users/${user}/actions-runner/bin/Runner.Listener`,
      );
      const pid = Number(fields.pid);
      assert.ok(Number.isSafeInteger(pid) && pid > 0);
      assert.deepEqual(observation.identity.argv, [
        "/bin/ps",
        "-p",
        String(pid),
        "-o",
        "lstart=,uid=,ppid=,comm=",
      ]);
      const identity = new RegExp(
        "^(\\w{3}\\s+\\w{3}\\s+\\d{1,2}\\s+" +
          "\\d{2}:\\d{2}:\\d{2}\\s+\\d{4})\\s+" +
          "(\\d+)\\s+(\\d+)\\s+(.+)$",
        "u",
      ).exec(raw(observation.identity).trim());
      assert.ok(identity);
      assert.equal(Number(identity[2]), 502 + index);
      assert.equal(Number(identity[3]), 1);
      assert.equal(identity[4], fields.program);
      this.#listeners.set(pid, { uid: 502 + index, birth: identity[1]! });
      listeners.push({
        pid,
        ppid: 1,
        group: pid,
        uid: 502 + index,
        comm: "Runner.Listener",
        birth: identity[1]!,
        birthPrecision: "one-second",
      });
    }
    assert.ok(event, "Mac listener observations lack original event bounds");
    this.timeline.record({ ...event, listeners });
  }

  #knownListener(row: S.HostProcess): boolean {
    const known = this.#listeners.get(row.pid);
    return (
      known != null &&
      known.uid === row.uid &&
      known.birth === row.birth &&
      row.birthPrecision === "one-second" &&
      row.ppid === 1 &&
      row.comm === "Runner.Listener"
    );
  }

  /** Only consume a sample after S's serial publisher completed it. */
  async consumeThrough(last: number, window = true): Promise<void> {
    while (this.#samples <= last) {
      // eslint-disable-next-line no-await-in-loop -- Replay samples serially.
      await this.#consume(window);
    }
  }

  async #consume(_window: boolean): Promise<void> {
    const read = (path: string): Buffer => {
      const pin = fileIdentity(path);
      assert.equal(pin.path, pin.realpath);
      assert.equal(pin.mode, 0o600);
      const previous = this.#pins.get(path);
      if (previous) assert.deepEqual(pin, previous);
      this.#pins.set(path, pin);
      return readFileSync(path);
    };
    const samplePath = join(
      this.#directory,
      `sample-${String(this.#samples).padStart(8, "0")}.json`,
    );
    // SAFETY: accepted S owns this shape; identity and raw are replayed below.
    const sample = JSON.parse(read(samplePath).toString("utf8")) as Sample;
    assert.equal(
      sample.identity.hardware.toLowerCase(),
      this.#host.hardware.toLowerCase(),
    );
    assert.equal(
      sample.identity.boot.toLowerCase(),
      this.#host.boot.toLowerCase(),
    );
    assert.equal(sample.identity.uid, this.#host.uid);
    assert.ok(sample.identity.account);
    assert.equal(sample.snapshotIsNotAtomic, true);
    assert.equal(sample.firstRecord, this.#records);
    assert.ok(sample.nextRecord > sample.firstRecord);
    assert.ok(
      BigInt(sample.end.monotonicNs) >= BigInt(sample.start.monotonicNs),
    );
    const duration =
      Number(
        BigInt(sample.end.monotonicNs) - BigInt(sample.start.monotonicNs),
      ) / 1e6;
    assert.ok(
      Math.abs(
        Date.parse(sample.end.utc) - Date.parse(sample.start.utc) - duration,
      ) <= this.#bounds.maxClockSkewMs,
    );
    if (this.#last) {
      const gap =
        Number(
          BigInt(sample.start.monotonicNs) - BigInt(this.#last.monotonicNs),
        ) / 1e6;
      assert.ok(gap >= 0 && gap <= this.#bounds.maxGapMs);
      assert.ok(
        Math.abs(
          Date.parse(sample.start.utc) - Date.parse(this.#last.utc) - gap,
        ) <= this.#bounds.maxClockSkewMs,
      );
    }
    const raw = new Map<string, Buffer>();
    const probes = new Map<string, Probe>();
    for (let index = sample.firstRecord; index < sample.nextRecord; index++) {
      const name = `probe-${String(index).padStart(8, "0")}`;
      // SAFETY: S's pinned producer owns this shape; terminal/raw are checked.
      const record = JSON.parse(
        read(join(this.#directory, name + ".json")).toString("utf8"),
      ) as Probe;
      assert.deepEqual(record.environment, {
        PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
        LC_ALL: "C",
        LANG: "C",
        TZ: "UTC",
      });
      assert.equal(record.host.collectorPid, this.#root.pid);
      assert.equal(
        record.host.platform,
        this.#host.target === "macos-aarch64" ? "darwin" : "linux",
      );
      assert.equal(
        record.host.arch,
        this.#host.target === "macos-aarch64" ? "arm64" : "x64",
      );
      assert.ok(record.host.hostname);
      assert.ok(
        BigInt(record.start.monotonicNs) >= BigInt(sample.start.monotonicNs),
      );
      assert.ok(
        BigInt(record.end.monotonicNs) >= BigInt(record.start.monotonicNs),
      );
      assert.ok(
        BigInt(record.end.monotonicNs) <= BigInt(sample.end.monotonicNs),
      );
      assert.equal(probes.has(record.probe.name), false);
      probes.set(record.probe.name, record);
      const planned = this.#api
        .nativeCollectorPlan(this.#host.target)
        .find((probe) => probe.name === record.probe.name);
      if (planned) assert.deepEqual(record.probe, planned);
      else {
        assert.equal(this.#host.target, "linux-x86_64-gnu");
        assert.match(record.probe.name, /^birth-\d+$/u);
        assert.deepEqual(record.probe, {
          name: record.probe.name,
          kind: "read",
          executable: `/proc/${record.probe.name.slice(6)}/stat`,
          argv: [],
        });
      }
      assert.equal(record.stop, null);
      assert.equal(record.signal, null);
      assert.equal(record.overflow, false);
      assert.equal(record.files.length, 3);
      for (const [stream, file] of record.files.entries()) {
        assert.equal(
          file.path,
          `${name}.${["stdout", "stderr", "error"][stream]}.bin`,
        );
        assert.equal(file.mode, "0600");
        const bytes = read(join(this.#directory, file.path));
        const pin = this.#pins.get(join(this.#directory, file.path))!;
        assert.equal(pin.sha256, file.sha256);
        assert.equal(pin.bytes, file.bytes);
        if (stream === 0) raw.set(record.probe.name, bytes);
        else if (record.complete || stream === 1) assert.equal(bytes.length, 0);
        else {
          assert.ok(
            record.errorCode === "ENOENT" || record.errorCode === "ESRCH",
          );
          assert.ok(bytes.toString("utf8").includes(record.errorCode));
          if (record.errorCode === "ENOENT")
            assert.ok(bytes.toString("utf8").includes(record.probe.executable));
        }
        if (!record.complete && stream === 0) assert.equal(bytes.length, 0);
      }
      if (record.complete) {
        assert.equal(record.errorCode, null);
        if (record.probe.kind === "command") {
          assert.equal(record.code, 0);
          assert.ok(Number.isSafeInteger(record.pid) && record.pid! > 0);
          assert.equal(record.pid, record.reportedPid);
          assert.equal(record.readCompleted, false);
          assert.equal(record.reaped, true);
          assert.equal(record.cleanup, "absent");
        } else {
          assert.equal(record.readCompleted, true);
          assert.equal(record.pid, null);
          assert.equal(record.reportedPid, null);
          assert.equal(record.code, null);
          assert.equal(record.reaped, false);
          assert.equal(record.cleanup, "no-child");
        }
      } else {
        assert.match(record.probe.name, /^birth-\d+$/u);
        assert.ok(
          record.errorCode === "ENOENT" || record.errorCode === "ESRCH",
        );
        assert.equal(record.readCompleted, false);
        assert.equal(record.pid, null);
        assert.equal(record.reportedPid, null);
        assert.equal(record.code, null);
        assert.equal(record.reaped, false);
        assert.equal(record.cleanup, "no-child");
        this.#incomplete++;
      }
    }
    for (const probe of this.#api.nativeCollectorPlan(this.#host.target))
      assert.ok(raw.has(probe.name));
    const mac = this.#host.target === "macos-aarch64";
    assert.equal(
      this.#api
        .parseCollectorUuid(raw.get("hardware")!, mac ? "ioreg" : "uuid")
        ?.toLowerCase(),
      this.#host.hardware.toLowerCase(),
    );
    assert.equal(
      this.#api.parseCollectorUuid(raw.get("boot")!, "uuid")?.toLowerCase(),
      this.#host.boot.toLowerCase(),
    );
    assert.equal(Number(raw.get("uid")!.toString().trim()), this.#host.uid);
    const parsed = this.#api.parseCollectorProcesses(
      raw.get("processes")!,
      this.#host.target,
      this.#bounds.maxProcesses,
    );
    assert.equal(parsed.complete, true);
    assert.equal(sample.inventory.complete, true);
    assert.deepEqual(
      processBase(parsed.processes),
      processBase(sample.inventory.processes),
    );
    let liveGroup: number | null = null;
    if (!mac && this.lifetime) {
      const psIndex =
        [...probes.keys()].indexOf("processes") + sample.firstRecord;
      const psPath = join(
        this.#directory,
        `probe-${String(psIndex).padStart(8, "0")}.json`,
      );
      const proof = await this.lifetime.poll(
        fileIdentity(samplePath),
        fileIdentity(psPath),
        this.#samples,
      );
      for (const pin of [proof.arm, proof.transcript])
        this.#pins.set(pin.path, pin);
      const ps = probes.get("processes")!;
      const initial = replayKernelLifetimeProof(
        proof,
        fileIdentity(samplePath),
        fileIdentity(psPath),
        this.#samples,
        this.#host,
        this.#root.pid,
      );
      if (initial) {
        const leader = sample.inventory.processes.find(
          (row) => row.pid === initial.pid,
        );
        assert.ok(leader, "Live leader absent");
        assert.equal(leader.uid, this.#host.uid);
        assert.equal(leader.birth, initial.ticks);
        assert.deepEqual(
          kernelSessionStat(raw.get(`birth-${leader.pid}`)!.toString("utf8")),
          initial,
        );
        assert.ok(
          BigInt(probes.get(`birth-${leader.pid}`)!.start.monotonicNs) >=
            BigInt(ps.end.monotonicNs),
        );
        liveGroup = initial.pid;
      }
      this.#observeHelper(proof.arm, initial != null, sample, probes, raw);
    }
    const root = sample.inventory.processes.find((row) =>
      sameProcess(this.#root, row),
    );
    assert.ok(root, "Root identity missing or changed");
    const owned = new Set([this.#root.pid]);
    for (let pass = 0; pass < sample.inventory.processes.length; pass++) {
      for (const row of sample.inventory.processes) {
        if (row.birth != null && owned.has(row.ppid)) owned.add(row.pid);
      }
    }
    for (const row of sample.inventory.processes) {
      if (mac) {
        assert.equal(
          row.birth,
          parsed.processes.find((item) => item.pid === row.pid)!.birth,
        );
        assert.equal(row.birthPrecision, "one-second");
        const observed = probes.get("processes")!;
        this.timeline.require(
          row,
          Date.parse(observed.start.utc),
          Date.parse(observed.end.utc),
        );
      } else {
        const record = probes.get(`birth-${row.pid}`)!;
        assert.ok(record);
        if (!record.complete) {
          const ps = probes.get("processes")!;
          assert.equal(row.birth, null);
          assert.equal(row.birthPrecision, "unknown");
          assert.equal(row.uid, this.#host.uid);
          assert.ok(
            BigInt(record.start.monotonicNs) >= BigInt(ps.end.monotonicNs),
          );
          if (row.pid === ps.pid) {
            assert.equal(ps.pid, ps.reportedPid);
            assert.equal(ps.host.collectorPid, this.#root.pid);
            assert.equal(row.ppid, this.#root.pid);
            assert.equal(row.group, row.pid);
            assert.equal(row.comm, "ps");
            assert.equal(this.#seenPids.has(row.pid), false);
          } else if (liveGroup != null && row.group === liveGroup) {
            // Only current live session ownership; birth/fork stay unknown.
            assert.equal(row.birth, null);
          } else {
            requireStableKernelChain(
              row,
              sample.inventory.processes,
              this.#lastProcesses,
              this.#root.pid,
              this.#host.uid,
              this.#seenPids,
              (pid) => {
                const before = this.#previousStats.get(pid);
                const after = probes.get(`birth-${pid}`);
                assert.ok(before?.complete && after?.complete);
                assert.ok(
                  BigInt(before.end.monotonicNs) <=
                    BigInt(ps.start.monotonicNs),
                );
                assert.ok(
                  BigInt(after.start.monotonicNs) >= BigInt(ps.end.monotonicNs),
                );
              },
            );
          }
          owned.add(row.pid);
        } else {
          const stat = this.#api.parseCollectorProcStat(
            raw.get(`birth-${row.pid}`)!,
          );
          assert.ok(stat);
          assert.equal(stat.pid, row.pid);
          assert.equal(stat.ppid, row.ppid);
          assert.equal(stat.group, row.group);
          assert.equal(stat.startTicks, row.birth);
          assert.equal(row.birthPrecision, "kernel-ticks");
        }
      }
      assert.ok(
        owned.has(row.pid) ||
          (mac && (row.uid === 502 || row.uid === 503)) ||
          this.#background.some((known) => sameProcess(known, row)),
        `Unassigned process ${row.uid}/${row.pid}/${row.comm}`,
      );
      this.#seenPids.add(row.pid);
    }
    const counters: Record<
      string,
      Readonly<Record<string, number | string>> | null
    > = {};
    for (const [name, parser] of [
      ["load", mac ? "mac-load" : "linux-load"],
      [mac ? "vm-counters" : "cpu-counters", mac ? "mac-vm" : "linux-stat"],
    ] as const) {
      counters[name] = this.#api.parseCollectorCounters(parser, raw.get(name)!);
      assert.ok(counters[name]);
    }
    assert.deepEqual(sample.counters, counters);
    this.#previousStats = new Map(
      sample.inventory.processes.map((row) => [
        row.pid,
        probes.get(`birth-${row.pid}`)!,
      ]),
    );
    this.#last = sample.end;
    this.#lastProcesses = sample.inventory.processes;
    this.#lastProbePid = probes.get("processes")!.pid;
    this.#records = sample.nextRecord;
    this.#samples++;
  }

  #observeHelper(
    armPin: FileIdentity,
    causal: boolean,
    sample: Sample,
    probes: ReadonlyMap<string, Probe>,
    raw: ReadonlyMap<string, Buffer>,
  ): void {
    // SAFETY: replayKernelLifetimeProof just pinned and replayed this arm.
    const arm = readKernelControl<LifetimeArm>(armPin.path);
    assert.deepEqual(fileIdentity(armPin.path), armPin);
    requireKernelLifetimeArm(arm, arm.config, arm.challenge.observerPid);
    assert.equal(arm.config.rootPid, this.#root.pid);
    if (this.#helper) assert.deepEqual(this.#helper.arm, armPin);
    const pid = arm.challenge.observerPid;
    const row = sample.inventory.processes.find((item) => item.pid === pid);
    let stat: KernelSessionStat | null = null;
    if (row && causal) {
      assert.ok(probes.get(`birth-${pid}`)?.complete, "Helper birth unknown");
      stat = kernelSessionStat(raw.get(`birth-${pid}`)!.toString("utf8"));
      assert.equal(stat.ticks, row.birth);
      this.#helperBirth ??= stat.ticks;
      assert.equal(stat.ticks, this.#helperBirth, "Lifetime helper PID reused");
    }
    this.#helper = {
      sample: this.#samples,
      causal,
      arm: armPin,
      pid,
      controlPid: arm.config.controlPid,
      // Linux comm is the exec'd file name truncated to 15 bytes.
      comm: basename(arm.config.pythonPath).slice(0, 15),
      leaderTicks: kernelSessionStat(arm.leaderStat).ticks,
      row: row ?? null,
      stat,
    };
  }

  /** The exact replayed helper identity in the last sample, if it is there. */
  #activeHelper(controlChildPid: number | undefined): KernelProcess | null {
    assert.ok(this.lifetime, "No active lifetime binding");
    const helper = this.#helper;
    assert.ok(helper, "Lifetime helper unobserved");
    assert.equal(helper.sample, this.#samples - 1, "Unpolled quiet sample");
    assert.equal(helper.causal, true, "Quiet sample precedes the Root arm");
    assert.equal(helper.controlPid, controlChildPid);
    if (helper.row == null) return null;
    assert.ok(helper.stat && this.#helperBirth);
    assert.deepEqual(
      helper.stat,
      {
        pid: helper.pid,
        ppid: helper.controlPid,
        group: helper.controlPid,
        sid: helper.controlPid,
        ticks: this.#helperBirth,
      },
      "Lifetime helper stat mismatch",
    );
    assert.ok(BigInt(this.#helperBirth) >= BigInt(helper.leaderTicks));
    return {
      pid: helper.pid,
      ppid: helper.controlPid,
      group: helper.controlPid,
      uid: this.#host.uid,
      comm: helper.comm,
      birth: this.#helperBirth,
      birthPrecision: "kernel-ticks",
    };
  }

  /**
   * Require P descendants to be absent before service restoration. Only the
   * intermediate checks that run while Root still holds the lifetime
   * connection pass `activeHelper`; final cleanup never exempts the helper.
   */
  requireQuiet(controlChildPid?: number, activeHelper = false): void {
    assert.ok(this.#lastProcesses.length > 0);
    const helper = activeHelper ? this.#activeHelper(controlChildPid) : null;
    for (const row of this.#lastProcesses) {
      assert.ok(
        row.pid === this.#root.pid ||
          row.pid === controlChildPid ||
          row.pid === this.#lastProbePid ||
          (helper != null && sameProcess(helper, row)) ||
          this.#knownListener(row) ||
          this.#background.some((known) => sameProcess(known, row)),
        "Owned descendant remains before restoration",
      );
    }
  }

  /** Closing preserves S's unknown flags and validates final probe reaping. */
  async finish(summary: S.CollectorSummary): Promise<readonly FileIdentity[]> {
    assert.equal(summary.assessment, "UNASSESSED");
    assert.equal(summary.physicalExclusion, "unknown");
    assert.equal(summary.rootAdjudication, "required-separately");
    assert.equal(summary.target, this.#host.target);
    await this.consumeThrough(summary.samples - 1, false);
    assert.equal(summary.records, this.#records);
    assert.equal(summary.incompleteRecords, this.#incomplete);
    assert.ok(summary.maxObservationGapMs <= this.#bounds.maxGapMs);
    assert.ok(summary.maxCallbackLatenessMs <= this.#bounds.maxGapMs);
    assert.equal(summary.lateCallbacks, 0);
    const caveats = new Set([
      "sampling-cannot-exclude-fleeting-processes",
      "host-inventory-and-operational-controls-unverified",
      "job-origin-and-root-adjudication-required",
      "probe-child-resource-counters-unknown",
      "mac-pid-birth-has-one-second-resolution",
    ]);
    if (this.#incomplete > 0) {
      caveats.add("pid-birth-unknown");
      caveats.add("partial-or-failed-probe");
    }
    assert.equal(
      summary.diagnostics.includes("pid-birth-unknown"),
      this.#incomplete > 0,
    );
    assert.ok(summary.diagnostics.every((item) => caveats.has(item)));
    // SAFETY: check the actual S summary and every returned child terminal.
    const final = JSON.parse(
      readFileSync(join(this.#directory, "finish.json"), "utf8"),
    ) as {
      readonly summary: S.CollectorSummary;
      readonly finalChildren: readonly {
        readonly reaped: boolean;
        readonly groupAbsent: boolean;
      }[];
    };
    assert.deepEqual(final.summary, summary);
    for (const child of final.finalChildren)
      assert.ok(child.reaped && child.groupAbsent);
    for (const pin of this.#pins.values())
      assert.deepEqual(fileIdentity(pin.path), pin);
    return [
      ...this.#pins.values(),
      fileIdentity(join(this.#directory, "start.json")),
      fileIdentity(join(this.#directory, "finish.json")),
    ];
  }
}
