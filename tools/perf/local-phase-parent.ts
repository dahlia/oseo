import { execFileSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  fstatSync,
  writeSync,
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  openSync,
  readlinkSync,
  readSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { Duplex } from "node:stream";
import { isObject } from "../value-kinds.ts";
import { artifact } from "./evidence.ts";
import type { Artifact } from "./evidence.ts";
import {
  RootPhaseVerifier,
  requireNativeOrigin,
  verifyNativeArtifact,
} from "./native-admission.ts";
import type {
  LocalHostIdentity,
  LocalNativeContext,
  LocalProcessIdentity,
  RootPhaseDecision,
  RootPhaseReceipt,
} from "./native-admission.ts";
import { attachOwnedLocalPhaseParent } from "./native-phase-ipc.ts";
import type {
  NativeControl,
  NativeControlProof,
  OwnedPhaseParent,
} from "./native-phase-ipc.ts";

/** Explicit control/cleanup budgets; there is no total workload deadline. */
export interface LocalParentBounds {
  readonly responseMs: number;
  readonly heartbeatMs: number;
  readonly termGraceMs: number;
  readonly cleanupMs: number;
  readonly maxEntryBytes: number;
  readonly maxStdinBytes: number;
  readonly maxOutputBytes: number;
}

/** Source pins come from the trusted caller, independently of child frames. */
export interface LocalParentSource {
  readonly session: string;
  readonly repository: string;
  readonly comparisonRunId: string;
  readonly commit: string;
  readonly tree: string;
  readonly checkout: string;
  readonly manifest: Artifact;
  readonly accounts: readonly string[];
}

/** Root transport and adjudication must be supplied out of band. */
export interface LocalRootBoundary {
  readonly verifier: RootPhaseVerifier;
  readonly origin: (
    context: LocalNativeContext,
    signal: AbortSignal,
  ) => Promise<void>;
  readonly decide: (
    control: NativeControl,
    context: LocalNativeContext,
    signal: AbortSignal,
  ) => Promise<RootPhaseReceipt>;
  readonly adjudicate: (
    decision: RootPhaseDecision,
    signal: AbortSignal,
  ) => Promise<void>;
}

/** No commands, environment overrides, keys or nonces come from the child. */
export interface LocalParentOptions {
  readonly source: LocalParentSource;
  /** Trusted self-contained ESM source, copied before spawning Node.js. */
  readonly entry: Artifact;
  readonly directory: string;
  readonly stdin: Uint8Array;
  readonly bounds: LocalParentBounds;
  readonly signal: AbortSignal;
  readonly root: LocalRootBoundary;
  /** Explicit diagnosis/exclusion/finalization implementation; no defaults. */
  readonly handle: (
    control: NativeControl,
    context: LocalNativeContext,
    signal: AbortSignal,
  ) => Promise<NativeControlProof>;
  /** Parent-side collector/heartbeat work must observe cancellation. */
  readonly pulse: (
    context: LocalNativeContext,
    signal: AbortSignal,
  ) => Promise<void>;
}

/** Transport completion never establishes physical exclusion or Measurement. */
export interface LocalParentResult {
  readonly status: "completed" | "failed";
  readonly assessment: "UNASSESSED";
  readonly physicalExclusion: "unknown";
  readonly context: LocalNativeContext | null;
  readonly pid: number | null;
  readonly code: number | null;
  readonly signal: string | null;
  readonly reaped: boolean;
  readonly cleanup: "gone" | "unknown";
  readonly cleanupScope: "owned-process-group";
  readonly pulses: number;
  /** Owned stdio drainage, separate from control/workload success. */
  readonly capture: "complete" | "partial";
  readonly failure: string | null;
  readonly raw: readonly Artifact[];
}

function fail(): never {
  throw new Error("Local phase parent failed; retain private evidence.");
}

/** Reject unsupported runtimes before reading origin facts or spawning. */
export function requireLocalParentHost(): void {
  if (
    process.platform !== "linux" ||
    process.arch !== "x64" ||
    "Deno" in globalThis ||
    process.release.name !== "node" ||
    process.getuid === undefined ||
    process.getuid() !== process.geteuid?.()
  )
    fail();
}

function readBounded(path: string, cap: number): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const bytes = Buffer.alloc(cap + 1);
    let size = 0;
    while (size <= cap) {
      const count = readSync(fd, bytes, size, bytes.length - size, null);
      if (count === 0) return bytes.subarray(0, size);
      size += count;
    }
    return fail();
  } finally {
    closeSync(fd);
  }
}

function text(path: string): string {
  const bytes = readBounded(path, 16_384);
  const value = bytes.toString("utf8");
  if (!Buffer.from(value).equals(bytes)) fail();
  return value.trim();
}

/** Kernel start ticks disambiguate PID reuse within the recorded boot. */
export function readLocalProcess(pid: number): LocalProcessIdentity {
  return readProcessState(pid, false)!;
}

/** Terminal reads retain identity checks while allowing kernel teardown. */
function readProcessState(
  pid: number,
  terminal: boolean,
  expected?: LocalProcessIdentity,
): LocalProcessIdentity | null {
  requireLocalParentHost();
  if (!Number.isSafeInteger(pid) || pid < 1) fail();
  const read = (name: string): string | null => {
    try {
      return text(`/proc/${pid}/${name}`);
    } catch (error) {
      if (
        terminal &&
        isObject(error) &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return null;
      throw error;
    }
  };
  const stat = read("stat");
  if (stat === null) return null;
  const close = stat.lastIndexOf(") ");
  if (!stat.startsWith(`${pid} (`) || close < 0) fail();
  const fields = stat.slice(close + 2).split(" ");
  if (!terminal && ["Z", "X", "x"].includes(fields[0] ?? "")) fail();
  // Check available stat facts even if status disappears during teardown.
  if (
    expected !== undefined &&
    (Number(fields[1]) !== expected.ppid ||
      Number(fields[2]) !== expected.group ||
      Number(fields[3]) !== expected.sid ||
      fields[19] !== expected.startTicks)
  )
    fail();
  const status = read("status");
  if (status === null) return null;
  const uid = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/mu.exec(status);
  if (uid === null || new Set(uid.slice(1)).size !== 1) fail();
  const result = {
    pid,
    ppid: Number(fields[1]),
    uid: Number(uid[1]),
    group: Number(fields[2]),
    sid: Number(fields[3]),
    startTicks: fields[19] ?? "",
  };
  if (
    [result.ppid, result.group, result.sid].some(
      (n) => !Number.isSafeInteger(n) || n < 1,
    ) ||
    !Number.isSafeInteger(result.uid) ||
    !/^[1-9][0-9]{0,19}$/u.test(result.startTicks)
  )
    fail();
  return result;
}

/** Machine-id names the OS installation, without attesting hardware. */
export function readLocalHost(): LocalHostIdentity {
  requireLocalParentHost();
  return {
    hostname: hostname(),
    machineId: text("/etc/machine-id"),
    bootId: text("/proc/sys/kernel/random/boot_id"),
    pidNamespace: readlinkSync("/proc/self/ns/pid"),
  };
}

type LocalIdentity =
  | LocalHostIdentity
  | LocalProcessIdentity
  | readonly string[];

function same(left: LocalIdentity, right: LocalIdentity): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertOwned(
  context: LocalNativeContext,
  child: ChildProcess,
  terminal = false,
): void {
  requireNativeOrigin(context, "local-linux");
  if (
    child.pid !== context.child.pid ||
    (!terminal && (child.exitCode !== null || child.signalCode !== null)) ||
    !same(readLocalHost(), context.host) ||
    !same(readLocalProcess(process.pid), context.parent)
  )
    fail();
  const current = readProcessState(context.child.pid, terminal, context.child);
  if (current !== null && !same(current, context.child)) fail();
  verifyNativeArtifact(context.entry);
  verifyNativeArtifact(context.manifest);
}

function checkBounds(value: LocalParentBounds): void {
  if (
    Object.keys(value).toSorted().join() !==
      [
        "responseMs",
        "heartbeatMs",
        "termGraceMs",
        "cleanupMs",
        "maxEntryBytes",
        "maxStdinBytes",
        "maxOutputBytes",
      ]
        .toSorted()
        .join() ||
    Object.values(value).some(
      (n) => !Number.isSafeInteger(n) || n < 1 || n > 2_147_483_647,
    ) ||
    value.cleanupMs <= value.termGraceMs ||
    value.maxEntryBytes > 1_048_576 ||
    value.maxStdinBytes > 1_048_576 ||
    value.maxOutputBytes > 1_048_576
  )
    fail();
}

function privateDirectory(path: string): void {
  if (!isAbsolute(path) || realpathSync(dirname(path)) !== dirname(path))
    fail();
  mkdirSync(path, { mode: 0o700 });
  const info = lstatSync(path);
  if (!info.isDirectory() || (info.mode & 0o777) !== 0o700) fail();
}

function sourceIdentity(source: LocalParentSource, timeout: number): boolean {
  if (realpathSync(source.checkout) !== source.checkout) fail();
  const output = execFileSync(
    "/usr/bin/git",
    [
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.untrackedCache=false",
      "-C",
      source.checkout,
      "rev-parse",
      "--show-toplevel",
      "HEAD",
      "HEAD^{tree}",
    ],
    {
      env: { PATH: "/usr/bin:/bin", LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" },
      timeout,
      maxBuffer: 16_384,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const values = output.trim().split("\n");
  if (!same(values, [source.checkout, source.commit, source.tree])) fail();
  const dirty = execFileSync(
    "/usr/bin/git",
    [
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.untrackedCache=false",
      "-C",
      source.checkout,
      "status",
      "--porcelain=v1",
      "--untracked-files=normal",
    ],
    {
      env: { PATH: "/usr/bin:/bin", LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" },
      timeout,
      maxBuffer: 1_048_576,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return dirty.length !== 0;
}

// fd4 is a one-time bounded public context, not a command channel. The fixed
// bootstrap waits for parent ownership/adjudication before importing the entry.
const bootstrap = `
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';
const stream = new Socket({fd:4,readable:true,writable:false});
const storage = Buffer.alloc(65540);
let used = 0;
for await (const chunk of stream) {
  if (!Buffer.isBuffer(chunk) || used + chunk.length > storage.length)
    throw new Error('Invalid local context size');
  chunk.copy(storage, used); used += chunk.length;
}
if (used < 6) throw new Error('Incomplete local context');
const size = storage.readUInt32BE();
if (size < 2 || size > 65536 || used !== size + 4)
  throw new Error('Invalid local context size');
const bytes = storage.subarray(4, used);
const value = bytes.toString('utf8');
if (!Buffer.from(value).equals(bytes)) throw new Error('Invalid context');
const context = JSON.parse(value);
const entry = await import(pathToFileURL(process.argv[1]).href);
await entry.main(context);
`;

type LocalBoundaryOperation =
  | LocalRootBoundary["origin"]
  | LocalRootBoundary["decide"]
  | LocalRootBoundary["adjudicate"]
  | LocalParentOptions["handle"]
  | LocalParentOptions["pulse"];

function isLocalBoundaryOperation<Candidate>(
  value: Candidate,
): value is Candidate & LocalBoundaryOperation {
  return typeof value === "function";
}

interface LocalOriginReceipt {
  readonly context: LocalNativeContext;
  readonly assessment: "UNASSESSED";
  readonly physicalExclusion: "unknown";
  readonly utc: string;
  readonly monotonicNs: string;
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
}

/**
 * Start one trusted fixed module, own its process group and attach fd3 to that
 * child. The injected boundaries must reject unknown authority. Same-account
 * hostile code, escaped descendants and host-wide exclusion need Root controls.
 */
export async function runLocalPhaseParent(
  input: LocalParentOptions,
): Promise<LocalParentResult> {
  requireLocalParentHost();
  checkBounds(input.bounds);
  if (
    input.signal.aborted ||
    !isLocalBoundaryOperation(input.root.origin) ||
    !isLocalBoundaryOperation(input.root.decide) ||
    !isLocalBoundaryOperation(input.root.adjudicate) ||
    !(input.root.verifier instanceof RootPhaseVerifier) ||
    !isLocalBoundaryOperation(input.handle) ||
    !isLocalBoundaryOperation(input.pulse) ||
    !(input.stdin instanceof Uint8Array) ||
    input.stdin.byteLength > input.bounds.maxStdinBytes
  )
    fail();
  input = {
    ...input,
    root: { ...input.root },
    source: structuredClone(input.source),
    bounds: structuredClone(input.bounds),
    entry: structuredClone(input.entry),
    stdin: Uint8Array.from(input.stdin),
  };
  const source = structuredClone(input.source);
  const bounds = structuredClone(input.bounds);
  const sourceDirty = sourceIdentity(source, bounds.responseMs);
  verifyNativeArtifact(source.manifest);
  if (
    input.entry.bytes > bounds.maxEntryBytes ||
    realpathSync(input.entry.path) !== input.entry.path ||
    !lstatSync(input.entry.path).isFile()
  )
    fail();
  const entryBytes = readBounded(input.entry.path, bounds.maxEntryBytes);
  privateDirectory(input.directory);
  const entryPath = join(input.directory, "entry.mjs");
  writeFileSync(entryPath, entryBytes, { flag: "wx", mode: 0o600 });
  const entry = artifact(entryPath);
  if (entry.sha256 !== input.entry.sha256 || entry.bytes !== input.entry.bytes)
    fail();
  writeFileSync(join(input.directory, "stdin.bin"), input.stdin, {
    flag: "wx",
    mode: 0o600,
  });
  const descriptors: number[] = [];
  const paths = ["stdin.bin", "stdout.bin", "stderr.bin"];
  try {
    for (const [index, path] of paths.entries()) {
      descriptors.push(
        openSync(join(input.directory, path), index === 0 ? "r" : "wx", 0o600),
      );
    }
    const parent = readLocalProcess(process.pid);
    const host = readLocalHost();
    if (input.signal.aborted) fail();
    const child = spawn(
      process.execPath,
      ["--input-type=module", "-e", bootstrap, entryPath],
      {
        cwd: source.checkout,
        env: { PATH: "/usr/bin:/bin", LC_ALL: "C", LANG: "C", TZ: "UTC" },
        stdio: [descriptors[0]!, "pipe", "pipe", "pipe", "pipe"],
        detached: true,
        shell: false,
      },
    );
    return await supervise(
      child,
      input,
      source,
      sourceDirty,
      parent,
      host,
      entry,
      descriptors,
    );
  } finally {
    for (const fd of descriptors) closeSync(fd);
  }
}

function supervise(
  child: ChildProcess,
  input: LocalParentOptions,
  source: LocalParentSource,
  checkoutDirty: boolean,
  parent: LocalProcessIdentity,
  host: LocalHostIdentity,
  entry: Artifact,
  descriptors: readonly number[],
): Promise<LocalParentResult> {
  const bounds = structuredClone(input.bounds);
  const pid = child.pid ?? null;
  const controller = new AbortController();
  const output = input.directory;
  const startup = child.stdio[4];
  let context: LocalNativeContext | null = null;
  let protocol: OwnedPhaseParent | undefined;
  let failure: string | null = null;
  let code: number | null = null;
  let exitSignal: string | null = null;
  let reaped = false;
  let pulses = 0;
  let pulsePending = false;
  let streamsClosed = false;
  let overflow = false;
  let captureFailed = false;
  let finished = false;
  let stopping = false;
  let groupGone = false;
  // Only bootstrap/teardown waits use this timer. Workload windows do not.
  let controlTimer: ReturnType<typeof setTimeout> | undefined;
  let pulseTimer: ReturnType<typeof setTimeout> | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  const rawPaths = ["entry.mjs", "stdin.bin", "stdout.bin", "stderr.bin"];
  const result = Promise.withResolvers<LocalParentResult>();
  const group = (signal: NodeJS.Signals | 0): boolean => {
    if (pid === null || pid < 1 || groupGone) return false;
    try {
      process.kill(-pid, signal);
      return true;
    } catch (error) {
      if (isObject(error) && "code" in error && error.code === "ESRCH") {
        groupGone = true;
        return false;
      }
      failure ??= "Owned group inspection failed.";
      return true;
    }
  };
  const save = (
    name: string,
    value: LocalOriginReceipt | Omit<LocalParentResult, "raw">,
  ): void => {
    writeFileSync(join(output, name), JSON.stringify(value), {
      flag: "wx",
      mode: 0o600,
    });
    rawPaths.push(name);
  };
  const finish = (): void => {
    if (finished) return;
    finished = true;
    clearTimeout(pulseTimer);
    clearTimeout(controlTimer);
    clearTimeout(killTimer);
    clearTimeout(cleanupTimer);
    for (const timer of pendingTimers) clearTimeout(timer);
    input.signal.removeEventListener("abort", abort);
    if (protocol === undefined || !protocol.complete())
      failure ??= "Local control incomplete.";
    failure ??= protocol?.failure() ?? null;
    protocol?.dispose();
    controller.abort();
    if (startup instanceof Duplex) startup.destroy();
    const cleanup: LocalParentResult["cleanup"] = group(0) ? "unknown" : "gone";
    if (
      !reaped ||
      !streamsClosed ||
      cleanup !== "gone" ||
      code !== 0 ||
      exitSignal !== null ||
      pulsePending
    )
      failure ??= "Local child or cleanup failed.";
    if (context !== null) {
      try {
        assertOwned(context, child, protocol?.complete() === true);
      } catch {
        failure ??= "Local terminal origin failed.";
      }
    }
    const summary = {
      status: failure === null ? ("completed" as const) : ("failed" as const),
      assessment: "UNASSESSED" as const,
      physicalExclusion: "unknown" as const,
      context,
      pid,
      code,
      signal: exitSignal,
      reaped,
      cleanup,
      cleanupScope: "owned-process-group" as const,
      pulses,
      failure,
      capture:
        streamsClosed && !overflow && !captureFailed
          ? ("complete" as const)
          : ("partial" as const),
    };
    try {
      for (const [index, name] of [
        "stdin.bin",
        "stdout.bin",
        "stderr.bin",
      ].entries()) {
        const actual = fstatSync(descriptors[index]!);
        const current = lstatSync(join(output, name));
        if (
          !current.isFile() ||
          current.nlink !== 1 ||
          current.ino !== actual.ino ||
          current.dev !== actual.dev ||
          (current.mode & 0o777) !== 0o600
        )
          fail();
      }
      for (const name of ["received.bin", "sent.bin"]) {
        try {
          const path = join(output, "control", name);
          if (lstatSync(path).isFile()) rawPaths.push(join("control", name));
        } catch (error) {
          if (!isObject(error) || !("code" in error) || error.code !== "ENOENT")
            throw error;
        }
      }
      save("result.json", summary);
      result.resolve({
        ...summary,
        cleanup,
        raw: rawPaths.map((path) => artifact(join(output, path))),
      });
    } catch {
      result.resolve({
        ...summary,
        status: "failed",
        cleanup,
        failure: "Private evidence finalization failed.",
        raw: [],
      });
    }
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
  };
  const stop = (): void => {
    if (stopping || finished) return;
    stopping = true;
    controller.abort();
    clearTimeout(pulseTimer);
    clearTimeout(controlTimer);
    group("SIGTERM");
    killTimer = setTimeout(() => group("SIGKILL"), bounds.termGraceMs);
    cleanupTimer = setTimeout(finish, bounds.cleanupMs);
  };
  const reject = (): void => {
    failure ??= "Local control or origin failed.";
    stop();
  };
  const abort = (): void => {
    failure ??= "Local parent aborted.";
    stop();
  };
  const bounded = async <Value>(
    operation: () => Promise<Value>,
  ): Promise<Value> => {
    if (controller.signal.aborted) fail();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise<never>((_resolve, rejectPromise) => {
          timer = setTimeout(() => {
            reject();
            rejectPromise(new Error("Local control deadline."));
          }, bounds.responseMs);
          pendingTimers.add(timer);
          onAbort = () => rejectPromise(new Error("Local control aborted."));
          controller.signal.addEventListener("abort", onAbort, { once: true });
          if (controller.signal.aborted) onAbort();
        }),
      ]);
    } finally {
      clearTimeout(timer);
      if (onAbort !== undefined)
        controller.signal.removeEventListener("abort", onAbort);
      if (timer !== undefined) pendingTimers.delete(timer);
    }
  };
  const pulse = async (binding: LocalNativeContext): Promise<void> => {
    if (stopping || finished) return;
    pulsePending = true;
    try {
      // Final ACK permits child teardown, not a change to its identity or
      // the host, parent, or pinned artifacts. Exit delivery may lag /proc.
      assertOwned(binding, child, protocol?.complete() === true);
      await bounded(() =>
        input.pulse(structuredClone(binding), controller.signal),
      );
      if (stopping || finished) return;
      assertOwned(binding, child, protocol?.complete() === true);
      pulses++;
      if (!reaped) {
        pulseTimer = setTimeout(() => {
          void pulse(binding);
        }, bounds.heartbeatMs);
      }
    } catch {
      failure ??= "Local pulse or origin failed.";
      reject();
    } finally {
      pulsePending = false;
      if (streamsClosed && !finished && !group(0)) finish();
    }
  };
  for (const [stream, fd] of [
    [child.stdout, descriptors[1]!],
    [child.stderr, descriptors[2]!],
  ] as const) {
    let used = 0;
    stream?.on("data", (bytes: Buffer) => {
      try {
        if (finished || overflow) return;
        if (!Buffer.isBuffer(bytes)) fail();
        const remaining = bounds.maxOutputBytes - used;
        const part = bytes.subarray(0, remaining);
        let offset = 0;
        while (offset < part.length) {
          const written = writeSync(fd, part, offset, part.length - offset);
          if (written < 1) fail();
          offset += written;
        }
        used += part.length;
        if (bytes.length > remaining) {
          overflow = true;
          reject();
        }
      } catch {
        captureFailed = true;
        reject();
      }
    });
    stream?.on("error", () => {
      captureFailed = true;
      reject();
    });
  }
  child.once("error", reject);
  child.once("exit", (status, signal) => {
    reaped = true;
    code = status;
    exitSignal = signal;
    clearTimeout(pulseTimer);
    // Exit may precede stdio close when an escaped descendant holds a pipe.
    // Keep the teardown deadline until actual stdio close or stop().
    if (status !== 0) failure ??= "Local child failed.";
    if (group(0)) {
      failure ??= "Local child left descendants.";
      stop();
    }
  });
  child.once("close", () => {
    streamsClosed = true;
    if (group(0)) stop();
    else {
      clearTimeout(controlTimer);
      // Stdio and the owned group are closed. A pending collector callback
      // still has its own response bound and must settle before success.
      if (!pulsePending) finish();
    }
  });
  if (startup instanceof Duplex) startup.on("error", reject);
  input.signal.addEventListener("abort", abort, { once: true });
  if (input.signal.aborted) abort();
  void (async () => {
    try {
      if (pid === null || !(startup instanceof Duplex)) fail();
      context = {
        schema: 1,
        origin: "local-linux",
        ...source,
        checkoutDirty,
        parent,
        host,
        child: readLocalProcess(pid),
        entry,
      };
      const binding = context;
      assertOwned(binding, child);
      save("origin.json", {
        context: binding,
        assessment: "UNASSESSED",
        physicalExclusion: "unknown",
        utc: new Date().toISOString(),
        monotonicNs: process.hrtime.bigint().toString(),
        executable: child.spawnfile,
        argv: child.spawnargs,
        cwd: source.checkout,
        environment: {
          PATH: "/usr/bin:/bin",
          LC_ALL: "C",
          LANG: "C",
          TZ: "UTC",
        },
      });
      await bounded(() =>
        input.root.origin(structuredClone(binding), controller.signal),
      );
      if (stopping || finished) fail();
      assertOwned(binding, child);
      protocol = attachOwnedLocalPhaseParent(
        child,
        {
          context: binding,
          responseMs: bounds.responseMs,
          directory: join(output, "control"),
          signal: controller.signal,
          handle: async (control, signal) => {
            clearTimeout(controlTimer);
            assertOwned(binding, child);
            let proof: NativeControlProof;
            if (control.phase.endsWith("-admission")) {
              const purpose =
                control.phase === "profile-admission" ? "profile" : "timing";
              const receipt = await input.root.decide(
                structuredClone(control),
                structuredClone(binding),
                signal,
              );
              proof = await input.root.verifier.accept(
                receipt,
                control.request,
                binding,
                purpose,
                Date.now,
                (decision) => input.root.adjudicate(decision, signal),
              );
            } else {
              proof = await input.handle(
                control,
                structuredClone(binding),
                signal,
              );
            }
            if (signal.aborted) fail();
            assertOwned(binding, child);
            if (control.phase === "finalize")
              controlTimer = setTimeout(reject, bounds.responseMs);
            return proof;
          },
        },
        reject,
      );
      const bytes = Buffer.from(JSON.stringify(binding));
      if (bytes.length > 65_536) fail();
      const header = Buffer.alloc(4);
      header.writeUInt32BE(bytes.length);
      startup.end(Buffer.concat([header, bytes]));
      controlTimer = setTimeout(reject, bounds.responseMs);
      await pulse(binding);
    } catch {
      reject();
    }
  })();
  return result.promise;
}
