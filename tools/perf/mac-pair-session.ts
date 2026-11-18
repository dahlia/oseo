/* eslint-disable no-await-in-loop -- Job phases and teardown are ordered. */
import { spawn } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appendFileSync, closeSync, openSync, writeFileSync } from "node:fs";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import type { Socket } from "node:net";
import { userInfo } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { performance } from "node:perf_hooks";
import { isObject, isString } from "../value-kinds.ts";
import type { SessionCommand } from "./mac-session.ts";
import { attachOwnedPhaseParent } from "./native-phase-ipc.ts";
import type {
  OwnedPhaseParent,
  PhaseParentOptions,
} from "./native-phase-ipc.ts";

/** Ordinary jobs have separate accounts and never signal each other's child. */
export type PairRole = "owner" | "companion";

/** Expected and observed identities must agree on every field. */
export interface PairIdentity {
  readonly session: string;
  readonly repository: string;
  readonly run: string;
  readonly attempt: string;
  readonly source: string;
  readonly tree: string;
  readonly role: PairRole;
  readonly job: string;
  readonly runnerId: string;
  readonly runnerName: string;
  readonly account: string;
  readonly uid: number;
  readonly hardwareUuid: string;
  readonly bootUuid: string;
  readonly platform: string;
  readonly arch: string;
}

/** No default port, public listener, or unauthenticated mode. */
export interface PairEndpoint {
  readonly host: "127.0.0.1";
  readonly port: number;
}

/** Explicit budgets apply to protocol waits and failed-child cleanup only. */
export interface PairBudgets {
  readonly heartbeatMs: number;
  readonly lossMs: number;
  readonly observationMs: number;
  readonly observationTimeoutMs: number;
  readonly barrierMs: number;
  readonly finalizationMs: number;
  readonly termGraceMs: number;
  readonly cleanupMs: number;
}

/** Reference raw, private evidence without collecting environments or argv. */
export interface PairObservation {
  readonly identity: PairIdentity;
  readonly sourceClean: boolean;
  readonly artifactDigest: string;
  readonly setupComplete: boolean;
  readonly status: "unassessed" | "unknown" | "failed";
  readonly raw: readonly string[];
  readonly ownedProcessesDigest: string;
  readonly monitorCost: {
    readonly wallMs: number;
    readonly cpuMicros: number;
    readonly rssBytes: number;
    readonly ioBytes: number | null;
  };
}

/** Separately reviewed input; arbitrary inventory alone cannot justify it. */
export interface PairAdmission {
  readonly status: "accepted" | "unknown" | "rejected";
  readonly decision: string;
  readonly nonceDelivery: string;
  readonly operationalWindow: string;
  readonly observation: string;
}

/** Both jobs retain their own verified archive and upload receipts. */
export interface PairSeal {
  readonly archive: string;
  readonly archiveDigest: string;
  readonly upload: string;
  readonly verified: boolean;
}

type MessageKind =
  | "heartbeat"
  | "ready"
  | "admit"
  | "admitted"
  | "finished"
  | "sealed"
  | "release"
  | "released";

/** MAC covers the serialized payload, including direction and sequence. */
export interface PairMessage {
  readonly simulated: boolean;
  readonly identity: PairIdentity;
  readonly sequence: number;
  readonly kind: MessageKind;
  readonly phase: string;
  readonly utc: string;
  readonly monotonicMs: number;
  readonly observation: PairObservation;
  readonly admission: PairAdmission | null;
  readonly seal: PairSeal | null;
}

/** Encode a frame without ever recording or transmitting the nonce itself. */
export function encodePairMessage(
  message: PairMessage,
  nonce: Uint8Array,
): string {
  if (nonce.byteLength < 32) throw new Error("Safe nonce required.");
  const payload = JSON.stringify(message);
  const mac = createHmac("sha256", nonce).update(payload).digest("hex");
  return `${JSON.stringify({ payload, mac })}\n`;
}

function exactIdentity(actual: PairIdentity, expected: PairIdentity): boolean {
  // SAFETY: Keys originate in the closed expected identity shape.
  return Object.entries(expected).every(
    ([key, value]) => actual[key as keyof PairIdentity] === value,
  );
}

function knownObservation(
  value: PairObservation,
  expected: PairIdentity,
  artifact: string,
): boolean {
  return (
    exactIdentity(value.identity, expected) &&
    value.sourceClean === true &&
    (value.setupComplete === true || value.setupComplete === false) &&
    value.status === "unassessed" &&
    value.artifactDigest === artifact &&
    /^[a-f0-9]{64}$/.test(artifact) &&
    value.raw.length > 0 &&
    value.raw.every((path) => path.trim() !== "") &&
    /^[a-f0-9]{64}$/.test(value.ownedProcessesDigest) &&
    [
      value.monitorCost.wallMs,
      value.monitorCost.cpuMicros,
      value.monitorCost.rssBytes,
    ].every((number) => Number.isFinite(number) && number >= 0) &&
    (value.monitorCost.ioBytes === null ||
      (Number.isFinite(value.monitorCost.ioBytes) &&
        value.monitorCost.ioBytes >= 0))
  );
}

function accepted(value: PairAdmission | null): boolean {
  return (
    value !== null &&
    value.status === "accepted" &&
    [
      value.decision,
      value.nonceDelivery,
      value.operationalWindow,
      value.observation,
    ].every((reference) => reference.trim() !== "")
  );
}

function sealed(value: PairSeal | null): boolean {
  return (
    value !== null &&
    value.verified === true &&
    value.archive.trim() !== "" &&
    /^[a-f0-9]{64}$/.test(value.archiveDigest) &&
    value.upload.trim() !== ""
  );
}

/** One connection per attempt. Replays and reconnects require a new session. */
export class PairReceiver {
  #sequence = 0;
  #monotonicMs = -1;
  readonly #identity: PairIdentity;
  readonly #nonce: Uint8Array;
  readonly #artifact: string;
  readonly #simulated: boolean;

  constructor(
    identity: PairIdentity,
    nonce: Uint8Array,
    artifactDigest: string,
    simulated: boolean,
  ) {
    if (nonce.byteLength < 32) throw new Error("Safe nonce required.");
    this.#identity = identity;
    this.#nonce = nonce;
    this.#artifact = artifactDigest;
    this.#simulated = simulated;
  }

  /**
   * Authenticate before interpretation; retain only sanitized failures.
   */
  receive(frame: string): PairMessage {
    // SAFETY: Treat the untyped wire shape as a candidate only. Validate both
    // fields before use; malformed nested values fail in the transport catch.
    const envelope = JSON.parse(frame) as {
      readonly payload: string;
      readonly mac: string;
    };
    if (!isString(envelope.payload) || !/^[a-f0-9]{64}$/.test(envelope.mac)) {
      throw new Error("Malformed envelope.");
    }
    const expected = createHmac("sha256", this.#nonce)
      .update(envelope.payload)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(envelope.mac, "hex"))) {
      throw new Error("Authentication failed.");
    }
    // SAFETY: This candidate is never returned before exact binding and raw
    // observation validation; malformed fields throw and fail the attempt.
    const value = JSON.parse(envelope.payload) as PairMessage;
    if (
      value.simulated !== this.#simulated ||
      !exactIdentity(value.identity, this.#identity) ||
      value.sequence !== this.#sequence + 1 ||
      !knownObservation(value.observation, this.#identity, this.#artifact) ||
      !Number.isFinite(value.monotonicMs) ||
      value.monotonicMs < 0 ||
      value.monotonicMs < this.#monotonicMs ||
      !isString(value.utc) ||
      !Number.isFinite(Date.parse(value.utc)) ||
      !isString(value.phase)
    ) {
      throw new Error("Identity, observation or sequence mismatch.");
    }
    this.#sequence = value.sequence;
    this.#monotonicMs = value.monotonicMs;
    return value;
  }
}

/**
 * Native collectors and H/P validators are intentionally supplied by callers.
 * A simulation always records the real execution OS and cannot attest a Mac.
 */
export interface PairJobOptions {
  readonly endpoint: PairEndpoint;
  /** Existing safe delivery is required; size cannot establish entropy. */
  readonly nonce: Uint8Array;
  readonly identity: PairIdentity;
  readonly peer: PairIdentity;
  readonly artifactDigest: string;
  readonly budgets: PairBudgets;
  readonly checkout: string;
  readonly directory: string;
  readonly simulated: boolean;
  /** Hermetic receipt-loss clock only; forbidden outside simulation. */
  readonly simulatedReceiptClock?: () => number;
  readonly setup: readonly SessionCommand[];
  /** Owner phases only, with unchanged internal H/P budgets. */
  readonly driver: readonly SessionCommand[];
  /** Select one reviewed Node driver; setup never gets a control pipe. */
  readonly phaseControl?: {
    readonly driverIndex: number;
    readonly options: Omit<PhaseParentOptions, "signal" | "directory">;
  };
  readonly observe: (signal: AbortSignal) => Promise<PairObservation>;
  readonly assess: (value: PairObservation) => Promise<PairAdmission>;
  /** Must run owning archive/upload verification before returning receipts. */
  readonly finalize: (signal: AbortSignal) => Promise<PairSeal>;
  readonly signal?: AbortSignal;
}

/** Completion describes this protocol, never physical isolation or H/P exit. */
export interface PairJobResult {
  readonly status: "completed" | "failed";
  readonly simulated: boolean;
  readonly nativeAcceptance: "unverified";
  readonly failures: readonly string[];
  readonly children: readonly PairChildResult[];
}

/** Cleanup is limited to the new group created by this account's launch. */
export interface PairChildResult {
  readonly pid: number | null;
  readonly uid: number;
  readonly code: number | null;
  readonly signal: string | null;
  readonly cleanup: "gone" | "unknown";
  readonly failure: string | null;
}

/**
 * File-backed streams allow monitoring while the child blocks its event loop.
 * No aggregate driver deadline is added. Cleanup has its own explicit budget.
 */
export async function runPairChild(
  command: SessionCommand,
  directory: string,
  budgets: PairBudgets,
  signal: AbortSignal,
  beforeLaunch?: () => Promise<void>,
  phaseControl?: Omit<PhaseParentOptions, "signal" | "directory">,
): Promise<PairChildResult> {
  if (
    process.platform === "win32" ||
    !isAbsolute(command.executable) ||
    !isAbsolute(command.cwd) ||
    command.timeoutMs !== null
  ) {
    throw new Error(
      "POSIX driver requires absolute paths and no outer timeout.",
    );
  }
  if (
    phaseControl !== undefined &&
    (command.executable !== process.execPath ||
      Object.keys(command.env).some((key) =>
        [
          "NODE_CHANNEL_FD",
          "NODE_CHANNEL_SERIALIZATION_MODE",
          "NODE_OPTIONS",
        ].includes(key),
      ))
  ) {
    throw new Error("Phase control requires an explicit reviewed Node driver.");
  }
  await mkdir(directory, { mode: 0o700 });
  // Environment values and arguments can contain caller secrets. Do not dump
  // them here; the owning driver must retain its reviewed invocation manifest.
  await writeFile(join(directory, "stdin.bin"), command.stdin, { mode: 0o600 });
  const descriptors: number[] = [];
  let failure: string | null = null;
  let result: PairChildResult;
  try {
    descriptors.push(openSync(join(directory, "stdin.bin"), "r"));
    descriptors.push(openSync(join(directory, "stdout.bin"), "wx", 0o600));
    descriptors.push(openSync(join(directory, "stderr.bin"), "wx", 0o600));
    await beforeLaunch?.();
    if (signal.aborted) throw new Error("Aborted before launch.");
    const child = spawn(command.executable, [...command.argv], {
      cwd: command.cwd,
      env: { ...command.env },
      stdio:
        phaseControl === undefined ? descriptors : [...descriptors, "pipe"],
      detached: true,
      shell: false,
    });
    const pid = child.pid ?? null;
    result = await new Promise<PairChildResult>((resolve) => {
      let code: number | null = null;
      let termination: string | null = null;
      let finished = false;
      let streamsClosed = false;
      let exited = false;
      let stopping = false;
      let control: OwnedPhaseParent | undefined;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      let endTimer: ReturnType<typeof setTimeout> | undefined;
      const group = (action: NodeJS.Signals | 0): boolean => {
        if (pid === null) return false;
        try {
          process.kill(-pid, action);
          return true;
        } catch (error) {
          if (isObject(error) && "code" in error && error.code === "ESRCH")
            return false;
          failure ??= "Owned group signal failed.";
          return true;
        }
      };
      const finish = (): void => {
        if (finished) return;
        finished = true;
        clearTimeout(killTimer);
        clearTimeout(endTimer);
        signal.removeEventListener("abort", abort);
        if (control !== undefined) {
          failure ??= control.failure();
          if (!control.complete()) failure ??= "Phase control incomplete.";
          control.dispose();
        }
        const cleanup = group(0) ? "unknown" : "gone";
        if (phaseControl !== undefined && (!exited || !streamsClosed))
          failure ??= "Phase control child or stream closure incomplete.";
        child.unref();
        resolve({
          pid,
          uid: userInfo().uid,
          code,
          signal: termination,
          cleanup,
          failure: failure ?? (code === 0 ? null : "Child failed."),
        });
      };
      const stop = (): void => {
        if (stopping || finished) return;
        stopping = true;
        group("SIGTERM");
        killTimer = setTimeout(() => group("SIGKILL"), budgets.termGraceMs);
        // A stream deadline from an earlier exit must not cancel this
        // stop's TERM grace or KILL before its own cleanup bound expires.
        clearTimeout(endTimer);
        endTimer = setTimeout(finish, budgets.cleanupMs);
      };
      const abort = (): void => {
        failure ??= "Child aborted.";
        stop();
      };
      child.once("error", () => {
        failure ??= "Child launch failed.";
        finish();
      });
      child.once("exit", (status, exitSignal) => {
        exited = true;
        code = status;
        termination = exitSignal;
        if (phaseControl !== undefined) {
          // An owned descendant can retain fd3 and prevent close entirely.
          // Signal only this launch's group, preserving the leader's result.
          if (group(0)) {
            failure ??= "Child left descendants.";
            stop();
          } else {
            // An escaped holder gets only a bounded stream wait. Its new
            // group is outside this launch's cleanup authority.
            endTimer ??= setTimeout(finish, budgets.cleanupMs);
          }
        }
      });
      child.once("close", (status, exitSignal) => {
        streamsClosed = true;
        code = status;
        termination = exitSignal;
        if (group(0)) {
          failure ??= "Child left descendants.";
          stop();
        } else finish();
      });
      signal.addEventListener("abort", abort, { once: true });
      if (phaseControl !== undefined && pid !== null) {
        try {
          control = attachOwnedPhaseParent(
            child,
            {
              ...phaseControl,
              signal,
              directory: join(directory, "control"),
            },
            () => {
              failure ??= "Phase control failed.";
              stop();
            },
          );
        } catch {
          failure ??= "Phase control attachment failed.";
          stop();
        }
      }
      try {
        writeFileSync(
          join(directory, "launch.json"),
          JSON.stringify({
            pid,
            uid: userInfo().uid,
            utc: new Date().toISOString(),
            monotonicMs: performance.now(),
            group: "created-by-this-launch",
          }),
          { mode: 0o600 },
        );
      } catch {
        failure ??= "Launch evidence write failed.";
        stop();
      }
      if (signal.aborted) abort();
    });
  } finally {
    for (const descriptor of descriptors) closeSync(descriptor);
  }
  await writeFile(join(directory, "result.json"), JSON.stringify(result), {
    mode: 0o600,
  });
  return result;
}

function validateOptions(options: PairJobOptions): void {
  const { identity: own, peer, endpoint, budgets } = options;
  if (
    endpoint.host !== "127.0.0.1" ||
    !Number.isInteger(endpoint.port) ||
    endpoint.port < 1024 ||
    endpoint.port > 65535 ||
    options.nonce.byteLength < 32
  ) {
    throw new Error("Explicit loopback endpoint and safe nonce required.");
  }
  if (
    options.phaseControl !== undefined &&
    (own.role !== "owner" ||
      !Number.isSafeInteger(options.phaseControl.driverIndex) ||
      options.phaseControl.driverIndex < 0 ||
      options.phaseControl.driverIndex >= options.driver.length)
  ) {
    throw new Error("Phase control must select an owner driver.");
  }
  if (
    options.phaseControl !== undefined &&
    !exactIdentity(
      options.phaseControl.options.context.jobs.find(
        (job) => job.role === "owner",
      )!,
      own,
    )
  ) {
    throw new Error("Phase control owner must match the pair session.");
  }
  for (const value of Object.values(budgets)) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
      throw new Error("Invalid protocol budget.");
    }
  }
  if (
    budgets.lossMs <= budgets.heartbeatMs ||
    budgets.cleanupMs <= budgets.termGraceMs ||
    own.role === peer.role ||
    !["owner", "companion"].includes(own.role) ||
    !["owner", "companion"].includes(peer.role) ||
    own.account === peer.account ||
    own.uid === peer.uid ||
    own.job === peer.job ||
    own.runnerId === peer.runnerId ||
    own.runnerName === peer.runnerName ||
    (own.role === "companion" && options.driver.length !== 0)
  ) {
    throw new Error("Invalid roles, accounts, slots or budgets.");
  }
  for (const value of [own, peer]) {
    if (
      Object.values(value).some(
        (field) =>
          field === "" ||
          field === null ||
          field === undefined ||
          (isString(field) &&
            /^(unknown|unavailable|unassessed)$/i.test(field.trim())),
      ) ||
      !Number.isSafeInteger(value.uid) ||
      value.uid < 0 ||
      value.platform !== "darwin" ||
      value.arch !== "arm64" ||
      !/^[a-f0-9]{40}$/.test(value.source) ||
      !/^[a-f0-9]{40}$/.test(value.tree)
    ) {
      throw new Error("Unknown native identity.");
    }
  }
  for (const key of [
    "session",
    "repository",
    "run",
    "attempt",
    "source",
    "tree",
    "hardwareUuid",
    "bootUuid",
    "platform",
    "arch",
  ] as const) {
    if (own[key] !== peer[key]) throw new Error("Pair binding mismatch.");
  }
  if (!options.simulated && options.simulatedReceiptClock !== undefined) {
    throw new Error("Simulated clock cannot authorize native use.");
  }
  if (!options.simulated) {
    const user = userInfo();
    const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
    if (!uuid.test(own.hardwareUuid) || !uuid.test(own.bootUuid)) {
      throw new Error("Actual hardware and boot UUID observations required.");
    }
    if (
      process.platform !== "darwin" ||
      process.arch !== "arm64" ||
      user.username !== own.account ||
      user.uid !== own.uid
    )
      throw new Error("Actual darwin/arm64 account required.");
  }
}

type PairEvent =
  | { readonly kind: "failure"; readonly reason: string; readonly utc: string }
  | { readonly kind: "observation"; readonly value: PairObservation }
  | {
      readonly kind: "admission" | "ongoing-admission";
      readonly admission: PairAdmission;
    }
  | { readonly direction: "send" | "receive"; readonly message: PairMessage };

/**
 * Prepare two ordinary jobs on one Mini; no job submission or H/P integration.
 * Callers supply real observations and a separate reviewed admission decision.
 */
export async function runPairJob(
  options: PairJobOptions,
): Promise<PairJobResult> {
  validateOptions(options);
  const checkout = await realpath(options.checkout);
  const parent = await realpath(join(options.directory, ".."));
  const inside = relative(checkout, parent);
  if (
    !isAbsolute(options.directory) ||
    inside === "" ||
    (inside !== ".." && !inside.startsWith("../") && !isAbsolute(inside))
  ) {
    throw new Error("New evidence directory must be outside checkout.");
  }
  await mkdir(options.directory, { mode: 0o700 });
  const controller = new AbortController();
  const failures: string[] = [];
  const children: PairChildResult[] = [];
  const events: PairEvent[] = [];
  const record = (event: PairEvent): void => {
    events.push(event);
    appendFileSync(
      join(options.directory, "events.jsonl"),
      `${JSON.stringify({ simulated: options.simulated, event })}\n`,
      { mode: 0o600 },
    );
  };
  const started = performance.now();
  const cpu = process.cpuUsage();
  let socket: Socket | undefined;
  let phase = "setup";
  let publication:
    | {
        readonly observation: PairObservation;
        readonly admission: PairAdmission | null;
      }
    | undefined;
  let assessmentRequired = false;
  let seal: PairSeal | null = null;
  let sequence = 0;
  const receiptClock = (): number => {
    const value =
      options.simulatedReceiptClock === undefined
        ? performance.now()
        : options.simulatedReceiptClock();
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Receipt clock unknown.");
    }
    return value;
  };
  let lastReceived = receiptClock();
  let released = false;
  const waiting = new Map<
    MessageKind,
    {
      readonly resolve: () => void;
      readonly reject: (error: Error) => void;
    }
  >();
  const received = new Set<MessageKind>();
  const sent = new Set<MessageKind>();
  const server = options.identity.role === "owner" ? createServer() : null;
  const fail = (reason: string): void => {
    if (controller.signal.aborted) return;
    failures.push(reason);
    try {
      record({ kind: "failure", reason, utc: new Date().toISOString() });
    } catch {
      failures.push("Failure journal unavailable.");
    }
    controller.abort();
    socket?.destroy();
    server?.close();
    for (const item of waiting.values()) item.reject(new Error(reason));
    waiting.clear();
  };
  const interrupt = (): void => fail("Interrupted.");
  options.signal?.addEventListener("abort", interrupt, { once: true });
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const bounded = async <Value>(
    action: () => Promise<Value>,
    ms: number,
    label: string,
  ): Promise<Value> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        action(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            fail(`${label} timeout.`);
            reject(new Error(`${label} timeout.`));
          }, ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const readObservation = async (): Promise<void> => {
    const assess = assessmentRequired;
    const value = await bounded(
      () => options.observe(controller.signal),
      options.budgets.observationTimeoutMs,
      "Observation",
    );
    if (controller.signal.aborted) throw new Error("Observation aborted.");
    record({ kind: "observation", value });
    if (!knownObservation(value, options.identity, options.artifactDigest)) {
      throw new Error("Local observation unknown or mismatched.");
    }
    let decision: PairAdmission | null = null;
    if (assess) {
      const first = publication?.admission == null;
      decision = await bounded(
        () => options.assess(value),
        first
          ? options.budgets.barrierMs
          : options.budgets.observationTimeoutMs,
        first ? "Admission" : "Ongoing admission",
      );
      record({
        kind: first ? "admission" : "ongoing-admission",
        admission: decision,
      });
      if (!accepted(decision))
        throw new Error("Admission unknown or rejected.");
    }
    // Publish the observation and its own decision together, never across an
    // await. A pending candidate cannot borrow a previous candidate's decision.
    publication = { observation: value, admission: decision };
  };
  let observationTask: Promise<void> | undefined;
  const observe = async (): Promise<void> => {
    observationTask = (observationTask ?? Promise.resolve()).then(
      readObservation,
    );
    await observationTask;
  };
  const settleObservations = async (): Promise<void> => {
    for (;;) {
      const pending = observationTask;
      await pending;
      if (pending === observationTask) return;
    }
  };
  const admissionGate = async (): Promise<void> => {
    await settleObservations();
    if (
      controller.signal.aborted ||
      publication === undefined ||
      !publication.observation.setupComplete ||
      !accepted(publication.admission)
    ) {
      throw new Error("Final admission unknown or setup incomplete.");
    }
  };
  const send = (kind: MessageKind): void => {
    const current = publication;
    if (
      controller.signal.aborted ||
      socket === undefined ||
      current === undefined
    ) {
      throw new Error("Disconnected.");
    }
    const message: PairMessage = {
      simulated: options.simulated,
      identity: options.identity,
      sequence: ++sequence,
      kind,
      phase,
      utc: new Date().toISOString(),
      monotonicMs: performance.now(),
      observation: current.observation,
      admission: current.admission,
      seal,
    };
    if (!socket.write(encodePairMessage(message, options.nonce))) {
      throw new Error("Transport backpressure.");
    }
    sent.add(kind);
    record({ direction: "send", message });
  };
  const wait = async (kind: MessageKind, ms: number): Promise<void> => {
    if (controller.signal.aborted) throw new Error("Aborted.");
    if (received.has(kind)) return;
    await bounded(
      () =>
        new Promise<void>((resolve, reject) => {
          waiting.set(kind, { resolve, reject });
        }),
      ms,
      kind,
    );
    waiting.delete(kind);
  };
  const receiver = new PairReceiver(
    options.peer,
    options.nonce,
    options.artifactDigest,
    options.simulated,
  );
  const expectedKinds: MessageKind[] =
    options.identity.role === "owner"
      ? ["ready", "admitted", "sealed", "released"]
      : ["ready", "admit", "finished", "release"];
  // Ready may precede local setup. Every later peer transition must follow
  // the local frame that enables it, even within one coalesced data event.
  const localPrerequisite: Partial<Record<MessageKind, MessageKind>> =
    options.identity.role === "owner"
      ? { admitted: "admit", sealed: "finished", released: "release" }
      : { admit: "ready", finished: "admitted", release: "sealed" };
  const attach = (connection: Socket): void => {
    socket = connection;
    lastReceived = receiptClock();
    connection.setNoDelay(true);
    connection.setEncoding("utf8");
    let buffer = "";
    connection.on("data", (text: string) => {
      buffer += text;
      if (buffer.length > 1_048_576) {
        fail("Frame overflow.");
        return;
      }
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const frame = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try {
          const message = receiver.receive(frame);
          const receivedAt = receiptClock();
          record({ direction: "receive", message });
          if (
            receivedAt < lastReceived ||
            receivedAt - lastReceived > options.budgets.lossMs
          ) {
            fail("Peer heartbeat lost before renewal.");
            return;
          }
          lastReceived = receivedAt;
          if (message.kind === "heartbeat") {
            if (
              received.has("ready") &&
              (!message.observation.setupComplete ||
                !accepted(message.admission))
            ) {
              throw new Error("Peer admission lost.");
            }
            continue;
          }
          if (message.kind !== expectedKinds.shift()) {
            throw new Error("Unexpected lifecycle message.");
          }
          const prerequisite = localPrerequisite[message.kind];
          if (prerequisite !== undefined && !sent.has(prerequisite)) {
            throw new Error("Premature lifecycle message.");
          }
          if (
            !message.observation.setupComplete ||
            !accepted(message.admission) ||
            (["finished", "sealed", "release", "released"].includes(
              message.kind,
            ) &&
              !sealed(message.seal))
          )
            throw new Error("Barrier or final evidence incomplete.");
          received.add(message.kind);
          waiting.get(message.kind)?.resolve();
        } catch {
          // Never retain untrusted frame text, parser errors, MACs or nonces.
          fail("Peer protocol authentication, binding or lifecycle failed.");
          return;
        }
      }
    });
    connection.on("error", () => {
      if (!released) fail("Transport error.");
    });
    connection.on("close", () => {
      if (!released) fail("Peer disconnected before release.");
    });
  };
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let monitor: ReturnType<typeof setInterval> | undefined;
  let monitoring = false;
  const run = async (
    commands: readonly SessionCommand[],
    admitted = false,
  ): Promise<void> => {
    for (const [index, command] of commands.entries()) {
      if (controller.signal.aborted) throw new Error("Aborted.");
      const value = await runPairChild(
        command,
        join(options.directory, `child-${children.length}`),
        options.budgets,
        controller.signal,
        admitted ? admissionGate : undefined,
        admitted && options.phaseControl?.driverIndex === index
          ? options.phaseControl.options
          : undefined,
      );
      children.push(value);
      if (value.failure !== null || value.cleanup !== "gone") {
        throw new Error("Owned child failed or cleanup unknown.");
      }
    }
  };
  try {
    await writeFile(
      join(options.directory, "session.json"),
      JSON.stringify(
        {
          identity: options.identity,
          peer: options.peer,
          endpoint: options.endpoint,
          budgets: options.budgets,
          simulated: options.simulated,
          receiptClock:
            options.simulatedReceiptClock === undefined
              ? "process-monotonic"
              : "simulated",
          executionHost: { platform: process.platform, arch: process.arch },
          artifactDigest: options.artifactDigest,
          physicalIsolation: "unknown",
          nativeAcceptance: "unverified",
          originalBudgets: {
            command: 600000,
            target: 120000,
            capture: 20000,
            usefulCaptures: 8,
            warmup: 3,
            retained: 15,
            kernel: 100,
            rss: 15,
          },
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    if (options.signal?.aborted) interrupt();
    if (controller.signal.aborted) throw new Error("Aborted.");
    await observe();
    await bounded(
      () =>
        new Promise<void>((resolve, reject) => {
          if (server !== null) {
            server.on("error", () => {
              fail("Listener failed.");
              reject(new Error("Listener failed."));
            });
            server.on("connection", (connection) => {
              if (socket !== undefined) {
                connection.destroy();
                fail("Duplicate connection.");
                return;
              }
              attach(connection);
              resolve();
            });
            server.listen(options.endpoint.port, options.endpoint.host);
          } else {
            const connection = createConnection(options.endpoint);
            attach(connection);
            connection.once("connect", () => {
              lastReceived = receiptClock();
              resolve();
            });
            connection.once("error", reject);
          }
        }),
      options.budgets.barrierMs,
      "Connection",
    );
    lastReceived = receiptClock();
    heartbeat = setInterval(() => {
      try {
        const now = receiptClock();
        if (now < lastReceived || now - lastReceived > options.budgets.lossMs) {
          fail("Peer heartbeat lost.");
          return;
        }
        send("heartbeat");
      } catch {
        fail("Heartbeat transport failed.");
      }
    }, options.budgets.heartbeatMs);
    monitor = setInterval(() => {
      if (monitoring || controller.signal.aborted) return;
      monitoring = true;
      void observe()
        .catch(() => fail("Host observation failed."))
        .finally(() => {
          monitoring = false;
        });
    }, options.budgets.observationMs);
    await run(options.setup);
    phase = "final-admission";
    assessmentRequired = true;
    await observe();
    await admissionGate();
    send("ready");
    await wait("ready", options.budgets.barrierMs);
    if (options.identity.role === "owner") {
      await admissionGate();
      send("admit");
      await wait("admitted", options.budgets.barrierMs);
      phase = "driver";
      await run(options.driver, true);
      if (controller.signal.aborted) throw new Error("Aborted.");
      phase = "finalize";
      seal = await bounded(
        () => options.finalize(controller.signal),
        options.budgets.finalizationMs,
        "Finalization",
      );
      await observe();
      if (!sealed(seal)) throw new Error("Archive/upload evidence missing.");
      send("finished");
      await wait("sealed", options.budgets.finalizationMs);
      send("release");
      await wait("released", options.budgets.barrierMs);
      released = true;
      clearInterval(heartbeat);
      await bounded(
        () =>
          new Promise<void>((resolve) => {
            if (socket === undefined) resolve();
            else socket.end(resolve);
          }),
        options.budgets.barrierMs,
        "Release flush",
      );
    } else {
      await wait("admit", options.budgets.barrierMs);
      await admissionGate();
      send("admitted");
      phase = "holding";
      // No aggregate timeout truncates the owner's driver phases.
      await new Promise<void>((resolve, reject) => {
        if (received.has("finished")) resolve();
        else waiting.set("finished", { resolve, reject });
      });
      if (controller.signal.aborted) throw new Error("Aborted.");
      phase = "finalize";
      seal = await bounded(
        () => options.finalize(controller.signal),
        options.budgets.finalizationMs,
        "Finalization",
      );
      await observe();
      if (!sealed(seal)) throw new Error("Archive/upload evidence missing.");
      send("sealed");
      await wait("release", options.budgets.barrierMs);
      send("released");
      released = true;
      clearInterval(heartbeat);
      await bounded(
        () =>
          new Promise<void>((resolve) => {
            if (socket === undefined) resolve();
            else socket.end(resolve);
          }),
        options.budgets.barrierMs,
        "Release flush",
      );
    }
  } catch {
    fail("Job failed; preserve partial evidence.");
  } finally {
    clearInterval(heartbeat);
    clearInterval(monitor);
    socket?.destroy();
    server?.close();
    try {
      await observationTask;
    } catch {
      fail("Final monitoring incomplete.");
    }
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    options.signal?.removeEventListener("abort", interrupt);
  }
  const result: PairJobResult = {
    status: released && failures.length === 0 ? "completed" : "failed",
    simulated: options.simulated,
    nativeAcceptance: "unverified",
    failures,
    children,
  };
  await writeFile(
    join(options.directory, "journal.json"),
    JSON.stringify(
      {
        events,
        result,
        monitor: {
          wallMs: performance.now() - started,
          cpu: process.cpuUsage(cpu),
          rssBytes: process.memoryUsage().rss,
          ioBytes: null,
        },
        lifecycleTail:
          "Final records require separate upload and Root verification.",
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  return result;
}
