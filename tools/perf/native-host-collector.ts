/* eslint-disable no-await-in-loop -- Samples and probes must not overlap. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, delimiter } from "node:path";
import { isObject, isString } from "../value-kinds.ts";

/** Supported execution hosts; plans for other hosts must fail explicitly. */
export type CollectorTarget = "linux-x86_64-gnu" | "macos-aarch64";

/** All limits are required; none changes the separately owned workload. */
export interface CollectorBounds {
  readonly probeTimeoutMs: number;
  readonly intervalMs: number;
  readonly termGraceMs: number;
  readonly cleanupMs: number;
  readonly maxProbeBytes: number;
  readonly maxTotalBytes: number;
  readonly maxRecords: number;
  readonly maxSamples: number;
  readonly maxProcesses: number;
  readonly maxGapMs: number;
  readonly maxClockSkewMs: number;
}

/** Caller claims stay private and separate from observed OS facts. */
export type CollectorOrigin =
  | { readonly kind: "local-read" }
  | {
      readonly kind: "github-claim";
      readonly repository: string;
      readonly runId: string;
      readonly jobId: string;
      readonly runnerId: string;
    };

/** Fresh private storage, finite controls and separate logical labels. */
export interface CollectorOptions {
  readonly directory: string;
  readonly bounds: CollectorBounds;
  readonly logicalSlots: readonly string[];
  readonly origin: CollectorOrigin;
  readonly signal?: AbortSignal;
}

/** Both clocks are sampled at the actual operation boundary in this process. */
export interface CollectorClock {
  readonly utc: string;
  readonly monotonicNs: string;
}

/** Fixed internal plans never receive command text or argv from a worker. */
export interface CollectorProbe {
  readonly name: string;
  readonly kind: "command" | "read";
  readonly executable: string;
  readonly argv: readonly string[];
}

/** A parsed minimal process row; arguments and environments are excluded. */
export interface HostProcess {
  readonly pid: number;
  readonly ppid: number;
  readonly group: number;
  readonly uid: number;
  readonly cpuPercent: number;
  readonly cpuTime: string;
  readonly comm: string;
  readonly birth: string | null;
  readonly birthPrecision: "kernel-ticks" | "one-second" | "unknown";
}

/** Parse failure is distinct from a successful empty process snapshot. */
export interface ProcessInventory {
  readonly complete: boolean;
  readonly processes: readonly HostProcess[];
  readonly errors: readonly string[];
}

/** Public metadata deliberately excludes paths, raw bytes and OS identities. */
export interface CollectorSummary {
  readonly assessment: "UNASSESSED";
  readonly rootAdjudication: "required-separately";
  readonly physicalExclusion: "unknown";
  readonly target: CollectorTarget | "fixture";
  readonly start: CollectorClock;
  readonly end: CollectorClock;
  readonly samples: number;
  readonly records: number;
  readonly incompleteRecords: number;
  readonly rawBytes: number;
  readonly maxObservationGapMs: number;
  readonly maxCallbackLatenessMs: number;
  readonly lateCallbacks: number;
  readonly diagnostics: readonly string[];
}

/** A durable new sample is collection evidence, never an exclusion decision. */
export interface CollectorCheckpoint {
  readonly phase: "before" | "after";
  readonly request: number;
  readonly requested: CollectorClock;
  readonly start: CollectorClock;
  readonly end: CollectorClock;
  readonly sample: number;
  readonly firstRecord: number;
  readonly nextRecord: number;
  readonly snapshot: {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly mode: "0600";
  };
  readonly assessment: "UNASSESSED";
  readonly physicalExclusion: "unknown";
  readonly diagnostics: readonly string[];
}

/** Close is idempotent and awaits probe reaping and private finalization. */
export interface NativeHostCollector {
  readonly ready: Promise<void>;
  readonly finished: Promise<CollectorSummary>;
  /** Queue one fresh serial sample within the original collection bounds. */
  checkpoint(phase: "before" | "after"): Promise<CollectorCheckpoint>;
  close(
    reason: "caller-close" | "workload-failed" | "disconnect",
  ): Promise<CollectorSummary>;
}

const environment = Object.freeze({
  PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
  LC_ALL: "C",
  LANG: "C",
  TZ: "UTC",
});
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu;

function noop(): void {
  /* Replaced before the operation starts. */
}

function fail(): never {
  throw new Error("Native host collector failed; retain private evidence.");
}

function stamp(): CollectorClock {
  return {
    utc: new Date().toISOString(),
    monotonicNs: process.hrtime.bigint().toString(),
  };
}

function elapsed(start: CollectorClock, end: CollectorClock): number {
  return Number(BigInt(end.monotonicNs) - BigInt(start.monotonicNs)) / 1e6;
}

/** Determine the target from OS runtime facts, never a runner label. */
export function nativeCollectorTarget(
  platform: string,
  arch: string,
): CollectorTarget {
  if (platform === "linux" && arch === "x64") return "linux-x86_64-gnu";
  if (platform === "darwin" && arch === "arm64") return "macos-aarch64";
  throw new Error("Unsupported native collector host.");
}

function command(
  name: string,
  executable: string,
  argv: readonly string[],
): CollectorProbe {
  return { name, kind: "command", executable, argv };
}

function read(name: string, path: string): CollectorProbe {
  return { name, kind: "read", executable: path, argv: [] };
}

/**
 * Fixed read-only tools use C locale and UTC. Linux comm is not args; Mac -c
 * selects the executable name. Mac lstart has only second-level precision.
 * Missing tools, unreadable files and unsupported counters remain failures.
 */
export function nativeCollectorPlan(
  target: CollectorTarget,
): readonly CollectorProbe[] {
  if (!["linux-x86_64-gnu", "macos-aarch64"].includes(target)) fail();
  const common = [
    command("account", "/usr/bin/id", ["-un"]),
    command("uid", "/usr/bin/id", ["-u"]),
    command("gid", "/usr/bin/id", ["-g"]),
    command("os", "/usr/bin/uname", ["-s"]),
    command("arch", "/usr/bin/uname", ["-m"]),
  ];
  return target === "linux-x86_64-gnu"
    ? [
        ...common,
        read("hardware", "/sys/class/dmi/id/product_uuid"),
        read("boot", "/proc/sys/kernel/random/boot_id"),
        command("processes", "/bin/ps", [
          "-e",
          "-o",
          "pid=,ppid=,pgid=,uid=,pcpu=,time=,comm=",
          "-ww",
        ]),
        read("load", "/proc/loadavg"),
        read("cpu-counters", "/proc/stat"),
        read("memory", "/proc/meminfo"),
        read("cpu-pressure", "/proc/pressure/cpu"),
        read("io-pressure", "/proc/pressure/io"),
        read("memory-pressure", "/proc/pressure/memory"),
        read("collector-io", "/proc/self/io"),
      ]
    : [
        ...common,
        command("hardware", "/usr/sbin/ioreg", [
          "-r",
          "-d",
          "1",
          "-c",
          "IOPlatformExpertDevice",
          "-w",
          "0",
        ]),
        command("boot", "/usr/sbin/sysctl", ["-n", "kern.bootsessionuuid"]),
        command("processes", "/bin/ps", [
          "-A",
          "-c",
          "-ww",
          "-o",
          "pid=,ppid=,pgid=,uid=,pcpu=,time=,lstart=,comm=",
        ]),
        command("load", "/usr/sbin/sysctl", ["-n", "vm.loadavg"]),
        command("memory", "/usr/sbin/sysctl", ["-n", "hw.memsize"]),
        command("vm-counters", "/usr/bin/vm_stat", []),
      ];
}

function text(bytes: Uint8Array): string | null {
  try {
    const body = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    return body.includes("\uFEFF") || body.includes("\0") ? null : body;
  } catch {
    return null;
  }
}

/** Empty, ambiguous, malformed and all-zero identities remain unknown. */
export function parseCollectorUuid(
  bytes: Uint8Array,
  format: "uuid" | "ioreg",
): string | null {
  const body = text(bytes);
  if (body === null) return null;
  const matches = [...body.matchAll(/"IOPlatformUUID"\s*=\s*"([^"\n]*)"/gu)];
  const value =
    format === "uuid"
      ? body.trim()
      : matches.length === 1
        ? (matches[0]?.[1] ?? "")
        : "";
  return uuid.test(value) && !/^0+(?:-0+)*$|^f+(?:-f+)*$/iu.test(value)
    ? value.toLowerCase()
    : null;
}

function natural(value: string): number | null {
  if (!/^\d+$/u.test(value)) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : null;
}

function validMacStart(value: string): boolean {
  const parts = value.trim().split(/\s+/u);
  const [weekday, month, day, time, year] = parts;
  if (parts.length !== 5 || day === undefined) return false;
  const parsed = Date.parse(value + " GMT");
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toUTCString() ===
      `${weekday}, ${day.padStart(2, "0")} ${month} ${year} ${time} GMT`
  );
}

/** Strict C-locale minimal ps output; duplicate PIDs invalidate the sample. */
export function parseCollectorProcesses(
  bytes: Uint8Array,
  target: CollectorTarget,
  maxProcesses: number,
): ProcessInventory {
  const body = text(bytes);
  if (body === null || body.includes("\0")) {
    return { complete: false, processes: [], errors: ["invalid-encoding"] };
  }
  const processes: HostProcess[] = [];
  const errors: string[] = [];
  const seen = new Set<number>();
  for (const line of body.split("\n")) {
    if (line.trim() === "") continue;
    if (processes.length >= maxProcesses) {
      errors.push("process-bound");
      break;
    }
    const match = new RegExp(
      "^\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+" +
        "(\\d+(?:\\.\\d+)?)\\s+(\\S+)\\s+(.+)$",
      "u",
    ).exec(line);
    if (match === null) {
      errors.push("malformed-row");
      continue;
    }
    const [pid, ppid, group, uid] = match.slice(1, 5).map(natural);
    const cpuPercent = Number(match[5]);
    const cpuTime = match[6] ?? "";
    let comm = match[7] ?? "";
    let birth: string | null = null;
    if (target === "macos-aarch64") {
      const start = new RegExp(
        "^(\\w{3}\\s+\\w{3}\\s+\\d{1,2}\\s+" +
          "\\d{2}:\\d{2}:\\d{2}\\s+\\d{4})\\s+(.+)$",
        "u",
      ).exec(comm);
      if (start === null || !validMacStart(start[1] ?? "")) {
        errors.push("invalid-start");
        continue;
      }
      birth = start[1] ?? null;
      comm = start[2] ?? "";
    }
    if (
      pid == null ||
      pid === 0 ||
      ppid == null ||
      group == null ||
      uid == null ||
      !Number.isFinite(cpuPercent) ||
      !/^(?:\d+-)?\d+:\d{2}(?::\d{2})?(?:\.\d+)?$/u.test(cpuTime) ||
      comm.trim() === "" ||
      [...comm].some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ) ||
      seen.has(pid)
    ) {
      errors.push("invalid-row");
      continue;
    }
    seen.add(pid);
    processes.push({
      pid,
      ppid,
      group,
      uid,
      cpuPercent,
      cpuTime,
      comm,
      birth,
      birthPrecision: birth === null ? "unknown" : "one-second",
    });
  }
  return { complete: errors.length === 0, processes, errors };
}

/** Linux stat field 22 is boot-relative start ticks, not a wall-clock date. */
export function parseCollectorProcStat(bytes: Uint8Array): {
  readonly pid: number;
  readonly ppid: number;
  readonly group: number;
  readonly startTicks: string;
} | null {
  const body = text(bytes);
  if (body === null) return null;
  const match = /^(\d+) \((.*)\) ([A-Za-z]) (.*)\n?$/u.exec(body);
  if (match === null) return null;
  const fields = (match[4] ?? "").trim().split(/\s+/u);
  const pid = natural(match[1] ?? "");
  const ppid = natural(fields[0] ?? "");
  const group = natural(fields[1] ?? "");
  const startTicks = fields[18] ?? "";
  if (
    pid === null ||
    pid === 0 ||
    ppid === null ||
    group === null ||
    !/^\d+$/u.test(startTicks) ||
    BigInt(startTicks) === 0n
  )
    return null;
  return { pid, ppid, group, startTicks };
}

/** Load and cumulative counters retain their units and original raw bytes. */
export function parseCollectorCounters(
  name: "linux-load" | "linux-stat" | "mac-load" | "mac-vm",
  bytes: Uint8Array,
): Readonly<Record<string, number | string>> | null {
  const body = text(bytes);
  if (body === null) return null;
  if (name === "linux-load" || name === "mac-load") {
    const match =
      name === "linux-load"
        ? /^(\d+\.\d+) (\d+\.\d+) (\d+\.\d+) (\d+)\/(\d+) (\d+)\n?$/u.exec(body)
        : new RegExp(
            "^\\{\\s*(\\d+(?:\\.\\d+)?)\\s+" +
              "(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)\\s*\\}\\s*$",
            "u",
          ).exec(body);
    if (match === null) return null;
    const result = {
      load1: Number(match[1]),
      load5: Number(match[2]),
      load15: Number(match[3]),
      runnable: name === "linux-load" ? (match[4] ?? "") : null,
      entities: name === "linux-load" ? (match[5] ?? "") : null,
      lastPid: name === "linux-load" ? (match[6] ?? "") : null,
    };
    if (
      [result.load1, result.load5, result.load15].some(
        (value) => !Number.isFinite(value),
      )
    )
      return null;
    return name === "linux-load"
      ? {
          load1: result.load1,
          load5: result.load5,
          load15: result.load15,
          runnable: match[4] ?? "",
          entities: match[5] ?? "",
          lastPid: match[6] ?? "",
        }
      : { load1: result.load1, load5: result.load5, load15: result.load15 };
  }

  const result: Record<string, number | string> = {};
  for (const line of body.split("\n")) {
    if (name === "linux-stat") {
      const match = new RegExp(
        "^(cpu(?:\\d+)?|ctxt|btime|processes|procs_running|" +
          "procs_blocked)\\s+(\\d+(?: \\d+)*)$",
        "u",
      ).exec(line);
      if (match !== null && match[1] !== undefined) {
        if (match[1] in result) return null;
        result[match[1]] = match[2] ?? "";
      }
    } else {
      const match = /^([A-Za-z][A-Za-z -]+):\s+(\d+)\.$/u.exec(line);
      if (match !== null && match[1] !== undefined) {
        if (match[1] in result) return null;
        result[match[1]] = match[2] ?? "";
      }
    }
  }
  if (name === "linux-stat") {
    return "cpu" in result && "btime" in result ? result : null;
  }
  const page = /page size of (\d+) bytes/u.exec(body);
  if (page === null || !("Pages free" in result)) return null;
  result.pageSizeBytes = page[1] ?? "";
  return result;
}

/** Changes are evidence of possible reuse; missing birth evidence stays so. */
export function compareCollectorPids(
  previous: readonly HostProcess[],
  current: readonly HostProcess[],
): readonly { readonly pid: number; readonly change: string }[] {
  const before = new Map(previous.map((row) => [row.pid, row]));
  return current.map((row) => {
    const old = before.get(row.pid);
    const change =
      old === undefined
        ? "newly-observed"
        : row.birth === null || old.birth === null
          ? "identity-unknown"
          : row.birth !== old.birth
            ? "pid-reused"
            : row.uid !== old.uid
              ? "uid-changed"
              : row.birthPrecision !== "kernel-ticks"
                ? "coarse-identity"
                : "same-birth-observed";
    return { pid: row.pid, change };
  });
}

interface ProbeOutcome {
  readonly start: CollectorClock;
  readonly end: CollectorClock;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly error: Buffer;
  readonly errorCode: string | null;
  readonly code: number | null;
  readonly readCompleted: boolean;
  readonly signal: string | null;
  readonly pid: number | null;
  readonly reportedPid: number | null;
  readonly reaped: boolean;
  readonly cleanup: "absent" | "unknown" | "no-child";
  readonly cleanupAt: CollectorClock;
  readonly stop: string | null;
  readonly overflow: boolean;
  readonly seenBytes: number;
}

function codeOf<Value>(error: Value): string {
  return isObject(error) && "code" in error && isString(error.code)
    ? error.code
    : "IO_ERROR";
}

function messageOf<Value>(error: Value): Buffer {
  return Buffer.from(error instanceof Error ? error.message : "IO error");
}

function groupVisible(pid: number, group: boolean): boolean | null {
  try {
    process.kill(group ? -pid : pid, 0);
    return true;
  } catch (error) {
    return codeOf(error) === "ESRCH" ? false : null;
  }
}

async function executeProbe(
  probe: CollectorProbe,
  bounds: CollectorBounds,
  byteLimit: number,
  abort: AbortSignal,
): Promise<ProbeOutcome> {
  const start = stamp();
  let stdout: Buffer = Buffer.alloc(0);
  let stderr: Buffer = Buffer.alloc(0);
  let errorBytes: Buffer = Buffer.alloc(0);
  let errorCode: string | null = null;
  let seenBytes = 0;
  let overflow = false;
  let stop: string | null = null;
  let pid: number | null = null;
  let reportedPid: number | null = null;
  let reaped = false;
  let code: number | null = null;
  let readCompleted = false;
  let exitSignal: string | null = null;
  let cleanup: ProbeOutcome["cleanup"] = "no-child";
  let stopOperation: () => void = noop;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  const keep = (old: Buffer, bytes: Buffer): Buffer => {
    seenBytes += bytes.length;
    const used = stdout.length + stderr.length + errorBytes.length;
    const remaining = Math.max(0, byteLimit - used);
    if (bytes.length > remaining) {
      overflow = true;
      stop ??= "output-bound";
      stopOperation();
    }
    return Buffer.concat([old, bytes.subarray(0, remaining)]);
  };
  const onAbort = (): void => {
    stop ??= "aborted";
    stopOperation();
  };
  const captureError = <Value>(error: Value): void => {
    errorCode ??= codeOf(error);
    errorBytes = keep(errorBytes, messageOf(error));
  };
  try {
    if (abort.aborted) stop = "aborted";
    else if (probe.kind === "read") {
      await new Promise<void>((resolve) => {
        const stream = createReadStream(probe.executable, {
          flags: "r",
          highWaterMark: Math.min(64 * 1024, Math.max(1, byteLimit)),
        });
        stopOperation = (): void => {
          stream.destroy();
        };
        stream.on("data", (chunk: string | Buffer) => {
          if (isString(chunk)) {
            captureError(new Error("Unexpected decoded probe stream."));
            stop ??= "stream-error";
            stopOperation();
          } else stdout = keep(stdout, chunk);
        });
        stream.on("error", captureError);
        stream.once("close", resolve);
        abort.addEventListener("abort", onAbort, { once: true });
        timeout = setTimeout(() => {
          stop ??= "timeout";
          stopOperation();
        }, bounds.probeTimeoutMs);
        if (abort.aborted) onAbort();
      });
      readCompleted = errorCode === null && stop === null;
    } else {
      await new Promise<void>((resolve) => {
        const grouped = process.platform !== "win32";
        const child = spawn(probe.executable, [...probe.argv], {
          cwd: dirname(process.execPath),
          env: { ...environment },
          detached: grouped,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });
        reportedPid = child.pid ?? null;
        pid =
          reportedPid !== null &&
          Number.isSafeInteger(reportedPid) &&
          reportedPid > 0
            ? reportedPid
            : null;
        cleanup = pid === null ? "no-child" : "unknown";
        let settled = false;
        let stopping = false;
        const signal = (value: NodeJS.Signals): void => {
          if (pid === null) return;
          try {
            if (grouped) process.kill(-pid, value);
            else if (!reaped) child.kill(value);
          } catch (error) {
            if (codeOf(error) !== "ESRCH") captureError(error);
          }
        };
        const finish = (): void => {
          if (settled) return;
          settled = true;
          cleanup =
            pid === null
              ? "no-child"
              : groupVisible(pid, grouped) === false && reaped
                ? "absent"
                : "unknown";
          try {
            child.stdout?.destroy();
            child.stderr?.destroy();
            if (!reaped && pid !== null) child.unref();
          } catch (error) {
            captureError(error);
          }
          resolve();
        };
        stopOperation = (): void => {
          if (stopping) return;
          stopping = true;
          signal("SIGTERM");
          killTimer = setTimeout(() => signal("SIGKILL"), bounds.termGraceMs);
          cleanupTimer = setTimeout(() => {
            signal("SIGKILL");
            finish();
          }, bounds.termGraceMs + bounds.cleanupMs);
        };
        child.on("error", (error) => {
          captureError(error);
          if (pid === null) finish();
          else {
            stop ??= "child-error";
            stopOperation();
          }
        });
        child.stdout?.on("data", (bytes: Buffer) => {
          stdout = keep(stdout, bytes);
        });
        child.stderr?.on("data", (bytes: Buffer) => {
          stderr = keep(stderr, bytes);
        });
        child.stdout?.on("error", (error) => {
          captureError(error);
          stop ??= "stream-error";
          stopOperation();
        });
        child.stderr?.on("error", (error) => {
          captureError(error);
          stop ??= "stream-error";
          stopOperation();
        });
        child.once("exit", (status, termination) => {
          reaped = true;
          code = status;
          exitSignal = termination;
        });
        child.once("close", () => {
          if (pid !== null && groupVisible(pid, grouped) !== false) {
            stop ??= "residual-group";
            stopOperation();
          } else finish();
        });
        abort.addEventListener("abort", onAbort, { once: true });
        timeout = setTimeout(() => {
          stop ??= "timeout";
          stopOperation();
        }, bounds.probeTimeoutMs);
        if (abort.aborted) onAbort();
      });
    }
  } catch (error) {
    captureError(error);
    stop ??= "probe-error";
  } finally {
    clearTimeout(timeout);
    clearTimeout(killTimer);
    clearTimeout(cleanupTimer);
    abort.removeEventListener("abort", onAbort);
  }
  const cleanupAt = stamp();
  return {
    start,
    end: stamp(),
    stdout,
    stderr,
    error: errorBytes,
    errorCode,
    code,
    readCompleted,
    signal: exitSignal,
    pid,
    reportedPid,
    reaped,
    cleanup,
    cleanupAt,
    stop,
    overflow,
    seenBytes,
  };
}

function successful(outcome: ProbeOutcome): boolean {
  return (
    (outcome.readCompleted || (outcome.pid !== null && outcome.code === 0)) &&
    outcome.signal === null &&
    outcome.errorCode === null &&
    outcome.stop === null &&
    !outcome.overflow &&
    outcome.cleanup !== "unknown"
  );
}

function validate(options: CollectorOptions): void {
  const expectedBounds = [
    "probeTimeoutMs",
    "intervalMs",
    "termGraceMs",
    "cleanupMs",
    "maxProbeBytes",
    "maxTotalBytes",
    "maxRecords",
    "maxSamples",
    "maxProcesses",
    "maxGapMs",
    "maxClockSkewMs",
  ];
  const values = Object.values(options.bounds);
  if (
    Object.keys(options.bounds).toSorted().join() !==
      expectedBounds.toSorted().join() ||
    values.some(
      (value) =>
        !Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647,
    ) ||
    options.bounds.maxProbeBytes > 16 * 1024 * 1024 ||
    options.bounds.maxTotalBytes > 1024 * 1024 * 1024 ||
    options.bounds.maxRecords > 1_000_000 ||
    options.bounds.maxSamples > 100_000 ||
    options.bounds.maxProcesses > 4096 ||
    !isAbsolute(options.directory) ||
    options.logicalSlots.length > 128 ||
    options.logicalSlots.some((label) => !/^[\w.-]{1,100}$/u.test(label)) ||
    new Set(options.logicalSlots).size !== options.logicalSlots.length
  )
    fail();
  if (options.origin.kind === "github-claim") {
    const { repository, runId, jobId, runnerId } = options.origin;
    if (
      !/^[\w.-]+\/[\w.-]+$/u.test(repository) ||
      [runId, jobId, runnerId].some((id) => !/^[1-9]\d{0,19}$/u.test(id))
    ) {
      fail();
    }
  } else if (options.origin.kind !== "local-read") fail();
}

interface DirectoryIdentity {
  readonly dev: number;
  readonly ino: number;
}

async function privateDirectory(directory: string): Promise<DirectoryIdentity> {
  if ((await realpath(dirname(directory))) !== dirname(directory)) fail();
  await mkdir(directory, { mode: 0o700 });
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (process.platform !== "win32" && (info.mode & 0o777) !== 0o700)
  )
    fail();
  return { dev: info.dev, ino: info.ino };
}

async function writePrivate(
  directory: string,
  name: string,
  bytes: Uint8Array | string,
  identity: DirectoryIdentity,
): Promise<void> {
  if (!/^[a-z0-9.-]+$/u.test(name)) fail();
  const current = await lstat(directory);
  if (
    !current.isDirectory() ||
    current.isSymbolicLink() ||
    current.dev !== identity.dev ||
    current.ino !== identity.ino ||
    (process.platform !== "win32" && (current.mode & 0o777) !== 0o700)
  )
    fail();
  await writeFile(join(directory, name), bytes, { flag: "wx", mode: 0o600 });
}

interface CollectorOverhead {
  readonly at: CollectorClock;
  readonly usage: NodeJS.ResourceUsage;
  readonly rssBytes: number;
}

function overhead(): CollectorOverhead {
  return {
    at: stamp(),
    usage: process.resourceUsage(),
    rssBytes: process.memoryUsage().rss,
  };
}

async function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    if (signal.aborted) done();
  });
}

interface CollectorExecution {
  readonly target: CollectorSummary["target"];
  readonly plan: readonly CollectorProbe[];
}

async function createCollector(
  input: CollectorOptions,
  execution: CollectorExecution,
): Promise<NativeHostCollector> {
  validate(input);
  // Copy caller controls before any await; later mutation cannot change them.
  const options = {
    ...input,
    bounds: { ...input.bounds },
    logicalSlots: [...input.logicalSlots],
    origin: { ...input.origin },
  };
  const { directory, bounds } = options;
  const directoryIdentity = await privateDirectory(directory);
  const write = async (
    name: string,
    body: Uint8Array | string,
  ): Promise<void> =>
    await writePrivate(directory, name, body, directoryIdentity);
  const start = stamp();
  const initialOverhead = overhead();
  const control = new AbortController();
  const diagnostics = new Set<string>([
    "sampling-cannot-exclude-fleeting-processes",
    "host-inventory-and-operational-controls-unverified",
    "job-origin-and-root-adjudication-required",
    "probe-child-resource-counters-unknown",
  ]);
  interface PendingCheckpoint {
    readonly phase: "before" | "after";
    readonly request: number;
    readonly requested: CollectorClock;
    readonly resolve: (value: CollectorCheckpoint) => void;
    readonly reject: (error: Error) => void;
  }
  const pending: PendingCheckpoint[] = [];
  let active: PendingCheckpoint | undefined;
  let requestSequence = 0;
  let wake: () => void = noop;
  const rejectCheckpoints = (): void => {
    const error = new Error("Collector checkpoint unavailable; retain raw.");
    active?.reject(error);
    for (const request of pending.splice(0)) request.reject(error);
    wake();
  };
  control.signal.addEventListener("abort", rejectCheckpoints, { once: true });
  let reason = "control-bound";
  let records = 0;
  let samples = 0;
  let rawBytes = 0;
  let incompleteRecords = 0;
  let maxObservationGapMs = 0;
  let maxCallbackLatenessMs = 0;
  let lateCallbacks = 0;
  let previousProcesses: readonly HostProcess[] = [];
  let previousObservation = start;
  let hardware: string | null = null;
  let boot: string | null = null;
  let identitySeen = false;
  const children: { pid: number; reaped: boolean }[] = [];
  let readyResolve: () => void = noop;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });
  const abort = (): void => {
    if (!control.signal.aborted) reason = "caller-abort";
    control.abort();
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const collect = async (
    probe: CollectorProbe,
  ): Promise<ProbeOutcome | null> => {
    if (records >= bounds.maxRecords || rawBytes >= bounds.maxTotalBytes) {
      diagnostics.add("transport-control-bound");
      control.abort();
      return null;
    }
    const index = records++;
    const name = `probe-${String(index).padStart(8, "0")}`;
    const result = await executeProbe(
      probe,
      bounds,
      Math.min(bounds.maxProbeBytes, bounds.maxTotalBytes - rawBytes),
      control.signal,
    );
    rawBytes +=
      result.stdout.length + result.stderr.length + result.error.length;
    if (result.pid !== null) {
      children.push({ pid: result.pid, reaped: result.reaped });
    }
    const complete = successful(result);
    if (!complete) incompleteRecords++;
    const files = [];
    for (const [stream, bytes] of [
      ["stdout", result.stdout],
      ["stderr", result.stderr],
      ["error", result.error],
    ] as const) {
      const path = `${name}.${stream}.bin`;
      await write(path, bytes);
      files.push({
        path,
        bytes: bytes.length,
        mode: "0600",
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
    const { stdout: _out, stderr: _err, error: _error, ...metadata } = result;
    await write(
      `${name}.json`,
      JSON.stringify({
        probe,
        ...metadata,
        complete,
        files,
        elapsedWallMs: elapsed(result.start, result.end),
        host: {
          platform: process.platform,
          arch: process.arch,
          hostname: hostname(),
          collectorPid: process.pid,
        },
        environment,
      }),
    );
    const wallDelta = Date.parse(result.end.utc) - Date.parse(result.start.utc);
    if (
      Math.abs(wallDelta - elapsed(result.start, result.end)) >
      bounds.maxClockSkewMs
    )
      diagnostics.add("wall-clock-discontinuity");
    if (result.cleanup === "unknown") {
      diagnostics.add("probe-cleanup-unknown");
      control.abort();
    }
    if (!complete && (probe.kind === "command" || result.stop !== null)) {
      diagnostics.add("probe-failure-stopped-collector");
      if (!control.signal.aborted) reason = "probe-failed";
      control.abort();
    }
    return result;
  };
  const sample = async (
    scheduled: CollectorClock,
    latenessMs: number,
    checkpoint?: PendingCheckpoint,
  ): Promise<CollectorCheckpoint | null> => {
    const sampleStart = stamp();
    const sampleOverhead = overhead();
    let inventory: ProcessInventory | null = null;
    let nextHardware: string | null = null;
    let nextBoot: string | null = null;
    const counters: Record<
      string,
      Readonly<Record<string, number | string>> | null
    > = {};
    let account: string | null = null;
    let uid: number | null = null;
    const firstRecord = records;
    for (const probe of execution.plan) {
      if (control.signal.aborted) break;
      const result = await collect(probe);
      if (result === null) break;
      const valid = successful(result);
      if (!valid) diagnostics.add("partial-or-failed-probe");
      if (probe.name === "hardware") {
        nextHardware = valid
          ? parseCollectorUuid(
              result.stdout,
              execution.target === "macos-aarch64" ? "ioreg" : "uuid",
            )
          : null;
      } else if (probe.name === "boot") {
        nextBoot = valid ? parseCollectorUuid(result.stdout, "uuid") : null;
      } else if (probe.name === "account") {
        const value = valid ? (text(result.stdout)?.trim() ?? "") : "";
        account = /^[\w.-]{1,256}$/u.test(value) ? value : null;
      } else if (probe.name === "uid") {
        uid = valid ? natural(text(result.stdout)?.trim() ?? "") : null;
      } else if (probe.name === "processes") {
        maxObservationGapMs = Math.max(
          maxObservationGapMs,
          elapsed(previousObservation, result.start),
        );
        previousObservation = result.end;
        inventory = valid
          ? parseCollectorProcesses(
              result.stdout,
              execution.target === "macos-aarch64"
                ? "macos-aarch64"
                : "linux-x86_64-gnu",
              bounds.maxProcesses,
            )
          : null;
        if (inventory !== null && execution.target === "linux-x86_64-gnu") {
          const rows: HostProcess[] = [];
          for (const row of inventory.processes) {
            if (control.signal.aborted) break;
            const stat = await collect(
              read(`birth-${row.pid}`, `/proc/${row.pid}/stat`),
            );
            const birth =
              stat !== null && successful(stat)
                ? parseCollectorProcStat(stat.stdout)
                : null;
            const matching =
              birth !== null &&
              birth.pid === row.pid &&
              birth.ppid === row.ppid &&
              birth.group === row.group;
            rows.push({
              ...row,
              birth: matching ? birth.startTicks : null,
              birthPrecision: matching ? "kernel-ticks" : "unknown",
            });
          }
          inventory = {
            ...inventory,
            processes: rows,
            complete:
              inventory.complete && rows.length === inventory.processes.length,
          };
        }
        if (inventory === null || !inventory.complete) {
          diagnostics.add("process-inventory-incomplete");
        }
      } else if (probe.name === "load") {
        counters.load = valid
          ? parseCollectorCounters(
              execution.target === "macos-aarch64" ? "mac-load" : "linux-load",
              result.stdout,
            )
          : null;
      } else if (
        probe.name === "cpu-counters" ||
        probe.name === "vm-counters"
      ) {
        counters[probe.name] = valid
          ? parseCollectorCounters(
              probe.name === "cpu-counters" ? "linux-stat" : "mac-vm",
              result.stdout,
            )
          : null;
      }
    }
    if (
      identitySeen &&
      ((hardware !== null &&
        nextHardware !== null &&
        hardware !== nextHardware) ||
        (boot !== null && nextBoot !== null && boot !== nextBoot))
    ) {
      diagnostics.add("host-or-boot-identity-drift");
    }
    hardware = nextHardware;
    boot = nextBoot;
    identitySeen = true;
    if (hardware === null || boot === null) {
      diagnostics.add("hardware-or-boot-unknown");
    }
    if (account === null || uid === null) diagnostics.add("os-account-unknown");
    const current = inventory?.processes ?? [];
    if (current.some((row) => row.birth === null)) {
      diagnostics.add("pid-birth-unknown");
    }
    if (execution.target === "macos-aarch64") {
      diagnostics.add("mac-pid-birth-has-one-second-resolution");
    }
    const changes = compareCollectorPids(previousProcesses, current);
    if (changes.some((row) => row.change === "pid-reused")) {
      diagnostics.add("pid-reuse-observed");
    }
    previousProcesses = current;
    if (Object.values(counters).some((value) => value === null)) {
      diagnostics.add("load-or-counter-unknown");
    }
    const sampleEnd = stamp();
    const path = `sample-${String(samples).padStart(8, "0")}.json`;
    const body = JSON.stringify({
      start: sampleStart,
      scheduled,
      latenessMs,
      end: sampleEnd,
      checkpoint:
        checkpoint === undefined
          ? null
          : {
              phase: checkpoint.phase,
              request: checkpoint.request,
              requested: checkpoint.requested,
            },
      firstRecord,
      nextRecord: records,
      identity: { hardware, boot, account, uid },
      inventory,
      pidChanges: changes,
      counters,
      overhead: { before: sampleOverhead, after: overhead() },
      snapshotIsNotAtomic: true,
    });
    await write(path, body);
    const index = samples++;
    if (
      checkpoint === undefined ||
      control.signal.aborted ||
      records === firstRecord
    )
      return null;
    return {
      phase: checkpoint.phase,
      request: checkpoint.request,
      requested: checkpoint.requested,
      start: sampleStart,
      end: sampleEnd,
      sample: index,
      firstRecord,
      nextRecord: records,
      snapshot: {
        path: join(directory, path),
        bytes: Buffer.byteLength(body),
        sha256: createHash("sha256").update(body).digest("hex"),
        mode: "0600",
      },
      assessment: "UNASSESSED",
      physicalExclusion: "unknown",
      diagnostics: [...diagnostics],
    };
  };
  const finished = (async (): Promise<CollectorSummary> => {
    try {
      await write(
        "start.json",
        JSON.stringify({
          schema: 1,
          assessment: "UNASSESSED",
          start,
          bounds,
          target: execution.target,
          actualPlatform: process.platform,
          actualArch: process.arch,
          host: hostname(),
          collectorPid: process.pid,
          logicalSlots: options.logicalSlots,
          origin: options.origin,
          originVerification: "unverified",
          environment,
          overhead: initialOverhead,
        }),
      );
      let due = stamp();
      while (!control.signal.aborted && samples < bounds.maxSamples) {
        const now = stamp();
        const lateness = Math.max(0, elapsed(due, now));
        maxCallbackLatenessMs = Math.max(maxCallbackLatenessMs, lateness);
        if (lateness > bounds.maxGapMs) {
          lateCallbacks++;
          diagnostics.add("late-observation-callback");
        }
        active = pending.shift();
        const checkpoint = await sample(due, lateness, active);
        if (active !== undefined) {
          if (checkpoint !== null) active.resolve(checkpoint);
          else active.reject(new Error("Collector checkpoint incomplete."));
          active = undefined;
        }
        readyResolve();
        due = {
          utc: new Date().toISOString(),
          monotonicNs: (
            BigInt(now.monotonicNs) +
            BigInt(bounds.intervalMs) * 1_000_000n
          ).toString(),
        };
        if (samples < bounds.maxSamples && !control.signal.aborted) {
          const waiting = new AbortController();
          const stopWaiting = (): void => waiting.abort();
          wake = stopWaiting;
          control.signal.addEventListener("abort", stopWaiting, { once: true });
          await pause(Math.max(0, -elapsed(due, stamp())), waiting.signal);
          control.signal.removeEventListener("abort", stopWaiting);
          wake = noop;
        }
      }
      if (!control.signal.aborted) diagnostics.add("sample-control-bound");
    } catch {
      diagnostics.add("storage-or-collector-failure");
      control.abort();
    } finally {
      readyResolve();
      control.abort();
      options.signal?.removeEventListener("abort", abort);
    }
    const finalChildren = children.map((child) => ({
      pid: child.pid,
      reaped: child.reaped,
      observedAt: stamp(),
      groupAbsent:
        groupVisible(child.pid, process.platform !== "win32") === false,
    }));
    if (finalChildren.some((child) => !child.reaped || !child.groupAbsent)) {
      diagnostics.add("final-owned-child-absence-unknown");
    }
    const end = stamp();
    maxObservationGapMs = Math.max(
      maxObservationGapMs,
      elapsed(previousObservation, end),
    );
    if (maxObservationGapMs > bounds.maxGapMs) {
      diagnostics.add("observation-gap-exceeds-control");
    }
    const summary: CollectorSummary = {
      assessment: "UNASSESSED",
      rootAdjudication: "required-separately",
      physicalExclusion: "unknown",
      target: execution.target,
      start,
      end,
      samples,
      records,
      incompleteRecords,
      rawBytes,
      maxObservationGapMs,
      maxCallbackLatenessMs,
      lateCallbacks,
      diagnostics: [...diagnostics],
    };
    try {
      await write(
        "finish.json",
        JSON.stringify({
          summary,
          reason,
          finalChildren,
          cleanup: "see-each-probe-reaping-and-group-observation",
          absenceObservationsAreNotHostExclusion: true,
          overhead: {
            scope: "supervising-process-cumulative",
            probeChildrenCpuRssIo: "unknown",
            before: initialOverhead,
            after: overhead(),
          },
        }),
      );
    } catch {
      diagnostics.add("final-record-write-failed");
    }
    return { ...summary, diagnostics: [...diagnostics] };
  })();
  return {
    ready,
    finished,
    checkpoint: (phase): Promise<CollectorCheckpoint> => {
      if (
        (phase !== "before" && phase !== "after") ||
        control.signal.aborted ||
        samples + pending.length + (active === undefined ? 0 : 1) >=
          bounds.maxSamples
      ) {
        return Promise.reject(new Error("Collector checkpoint unavailable."));
      }
      return new Promise((resolve, reject) => {
        pending.push({
          phase,
          request: requestSequence++,
          requested: stamp(),
          resolve,
          reject,
        });
      });
    },
    close: async (closeReason): Promise<CollectorSummary> => {
      if (!control.signal.aborted) reason = closeReason;
      control.abort();
      return await finished;
    },
  };
}

/**
 * Collect on the actual supported host. This parent must remain responsive;
 * run synchronous H/P work in a separately owned child. No admission, Root
 * decision, workload launch, operational control or GitHub lookup is implied.
 */
export async function startNativeHostCollector(
  options: CollectorOptions,
): Promise<NativeHostCollector> {
  const target = nativeCollectorTarget(process.platform, process.arch);
  try {
    return await createCollector(options, {
      target,
      plan: nativeCollectorPlan(target),
    });
  } catch {
    return fail();
  }
}

/** Closed test modes exercise real Node children without caller commands. */
export type CollectorFixture =
  | "missing-read"
  | "bytes"
  | "nonzero"
  | "signal"
  | "spawn-failure"
  | "timeout"
  | "overflow"
  | "disconnect"
  | "error-after-success"
  | "slow"
  | "blocked"
  | "environment"
  | "ignore-term";

const fixturePrograms = {
  "missing-read": "process.stdout.write('closed fixture');",
  blocked:
    "process.stdout.write(JSON.stringify({" +
    "start:new Date().toISOString()})+'\\n');" +
    "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,250);" +
    "process.stdout.write(JSON.stringify({" +
    "end:new Date().toISOString()})+'\\n');",
  environment:
    "process.stdout.write(String(" +
    "process.env.OSEO_COLLECTOR_TEST_SECRET===undefined));",
  "ignore-term": "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);",
  bytes:
    "process.stdout.write(Buffer.from([0,255,128,13,10]));" +
    "process.stderr.write(Buffer.from([254,0,10]));",
  nonzero: "process.stdout.write('before failure');process.exitCode=7;",
  signal: "process.kill(process.pid,'SIGTERM');",
  "spawn-failure": "",
  timeout: "setInterval(()=>{},1000);",
  overflow: "process.stdout.write(Buffer.alloc(131072,255));",
  disconnect:
    "process.stdout.destroy();process.stderr.destroy();" +
    "setInterval(()=>{},1000);",
  "error-after-success": "process.stdout.write('retained');",
  slow: "setTimeout(()=>process.stdout.write('slow'),50);",
} satisfies Readonly<Record<CollectorFixture, string>>;

async function fixtureNode(): Promise<string> {
  const candidates =
    process.versions.deno === undefined
      ? [process.execPath]
      : [
          ...(process.env.PATH ?? "")
            .split(delimiter)
            .filter((path) => isAbsolute(path))
            .map((path) =>
              join(path, process.platform === "win32" ? "node.exe" : "node"),
            ),
          "/usr/bin/node",
          "/usr/local/bin/node",
        ];
  for (const path of candidates) {
    try {
      await access(path, constants.X_OK);
      return await realpath(path);
    } catch {
      /* Another fixed Node filename may be available. */
    }
  }
  throw new Error("Node fixture executable unavailable.");
}

/**
 * Test-only closed program selection. Results identify fixtures, including on
 * unsupported native hosts. It cannot receive arbitrary commands or claim a
 * native host diagnosis. Production callers use startNativeHostCollector().
 */
export async function startCollectorFixture(
  options: CollectorOptions,
  mode: CollectorFixture,
): Promise<NativeHostCollector> {
  if (!Object.hasOwn(fixturePrograms, mode)) fail();
  const node = await fixtureNode();
  const plan = [
    command(
      "fixture",
      mode === "spawn-failure"
        ? join(dirname(node), "oseo-absent-collector-fixture")
        : node,
      ["-e", fixturePrograms[mode]],
    ),
  ];
  if (mode === "missing-read") {
    plan.push(
      read(
        "fixture-missing-read",
        join(dirname(node), "oseo-absent-read-fixture"),
      ),
    );
  }
  if (mode === "error-after-success") {
    plan.push(
      command("fixture-error", node, [
        "-e",
        "process.stderr.write('fixture failure');process.exitCode=9;",
      ]),
    );
  }
  try {
    return await createCollector(options, { target: "fixture", plan });
  } catch {
    return fail();
  }
}
