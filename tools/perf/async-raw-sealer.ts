/* eslint-disable no-await-in-loop -- Read one bounded envelope at a time. */
import { createHash, createPublicKey } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import { isObject, isString } from "../value-kinds.ts";
import {
  RawSegmentChain,
  rawRecipientPin,
  sealRawSegment,
} from "./private-raw-segments.ts";
import type {
  RawSegmentContext,
  RawSegmentEntry,
  RawSegmentKind,
  RawSegmentLimits,
  SealedRawSegment,
} from "./private-raw-segments.ts";

const protocol = "oseo-async-raw-sealer-v1";
const invalid = "Async raw sealer session discarded; retain private evidence.";

/** Public session controls only; the worker receives no private key or env. */
export interface AsyncRawSealerOptions {
  readonly context: RawSegmentContext;
  readonly recipient: KeyObject;
  readonly recipientPin: string;
  readonly limits: RawSegmentLimits;
  readonly controlMs: number;
  readonly signal?: AbortSignal;
}

/** Closed files only, without callbacks, commands or module paths. */
export interface AsyncRawSealRequest {
  readonly privateRoot: string;
  readonly outputRoot: string;
  readonly entries: readonly RawSegmentEntry[];
  readonly kind: RawSegmentKind;
}

/** Each session owns one persistent chain and one fixed worker until close. */
export interface AsyncRawSealer {
  seal(request: AsyncRawSealRequest): Promise<SealedRawSegment>;
  /** Terminate and await the owned worker; partial output remains private. */
  close(): Promise<void>;
  /** Resolves only after the owned worker has exited, including on failure. */
  readonly finished: Promise<void>;
}

/** Expected response identity is held by the parent, never taken from wire. */
export interface ExpectedRawSealResponse {
  readonly context: RawSegmentContext;
  readonly sequence: number;
  readonly previous: string | null;
  readonly request: AsyncRawSealRequest;
  readonly limits: RawSegmentLimits;
}

function noop(): void {
  /* Replaced before asynchronous work starts. */
}

function fail(): never {
  throw new Error(invalid);
}

function exact<Value>(value: Value, keys: readonly string[]): void {
  if (
    !isObject(value) ||
    Array.isArray(value) ||
    Object.keys(value).toSorted().join() !== keys.toSorted().join()
  )
    fail();
}

function digest(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function checkedLimits(value: RawSegmentLimits): RawSegmentLimits {
  exact(value, [
    "maxFiles",
    "maxFileBytes",
    "maxTotalBytes",
    "maxHeaderBytes",
    "maxManifestBytes",
    "chunkBytes",
  ]);
  const maxima = {
    maxFiles: 10_000,
    maxFileBytes: Number.MAX_SAFE_INTEGER,
    maxTotalBytes: Number.MAX_SAFE_INTEGER - 2_097_152,
    maxHeaderBytes: 65_536,
    maxManifestBytes: 1_048_576,
    chunkBytes: 1_048_576,
  };
  for (const field of [
    "maxFiles",
    "maxFileBytes",
    "maxTotalBytes",
    "maxHeaderBytes",
    "maxManifestBytes",
    "chunkBytes",
  ] as const) {
    if (
      !Number.isSafeInteger(value[field]) ||
      value[field] < 0 ||
      value[field] > maxima[field]
    )
      fail();
  }
  if (
    value.maxFiles < 1 ||
    value.maxHeaderBytes < 1 ||
    value.maxManifestBytes < 1 ||
    value.chunkBytes < 1
  )
    fail();
  return { ...value };
}

/** Pure closed-shape validation also supports transport corruption fixtures. */
export function validateRawSealResponse<Value>(
  value: Value,
  expected: ExpectedRawSealResponse,
): SealedRawSegment {
  try {
    exact(value, ["manifest", "envelope", "receipt"]);
    // SAFETY: all fields and their exact values are checked before returning.
    const result = value as SealedRawSegment;
    const manifest = {
      schema: 1,
      context: expected.context,
      kind: expected.request.kind,
      sequence: expected.sequence,
      previous: expected.previous,
      files: expected.request.entries,
    };
    exact(result.manifest, Object.keys(manifest));
    const manifestBody = JSON.stringify(manifest);
    const cap = checkedLimits(expected.limits);
    if (
      JSON.stringify(result.manifest) !== manifestBody ||
      Buffer.byteLength(manifestBody) > cap.maxManifestBytes
    )
      fail();
    exact(result.envelope, ["path", "bytes", "sha256"]);
    const envelope = result.envelope;
    if (
      envelope.path !==
        join(expected.request.outputRoot, "envelope.raw-segment") ||
      !Number.isSafeInteger(envelope.bytes) ||
      envelope.bytes < 1 ||
      !isString(envelope.sha256) ||
      !/^[a-f0-9]{64}$/u.test(envelope.sha256)
    ) {
      fail();
    }
    const rawBytes = expected.request.entries.reduce(
      (sum, file) => sum + file.bytes,
      0,
    );
    if (
      envelope.bytes >
      rawBytes + Buffer.byteLength(manifestBody) + cap.maxHeaderBytes + 28
    )
      fail();
    const receipt = {
      context: expected.context,
      kind: expected.request.kind,
      sequence: expected.sequence,
      previous: expected.previous,
      segmentSha256: digest(JSON.stringify(manifest)),
      rawBytes: expected.request.entries.reduce(
        (sum, file) => sum + file.bytes,
        0,
      ),
      fileCount: expected.request.entries.length,
      envelopeBytes: envelope.bytes,
      envelopeSha256: envelope.sha256,
    };
    exact(result.receipt, Object.keys(receipt));
    if (JSON.stringify(result.receipt) !== JSON.stringify(receipt)) fail();
    return result;
  } catch {
    return fail();
  }
}

async function verifyEnvelope(
  result: SealedRawSegment,
  signal: AbortSignal,
): Promise<void> {
  const root = await lstat(resolve(result.envelope.path, ".."));
  const before = await lstat(result.envelope.path, { bigint: true });
  if (
    !root.isDirectory() ||
    (root.mode & 0o777) !== 0o700 ||
    !before.isFile() ||
    before.nlink !== 1n ||
    (before.mode & 0o777n) !== 0o600n ||
    before.size !== BigInt(result.envelope.bytes) ||
    (await realpath(result.envelope.path)) !== result.envelope.path
  )
    fail();
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const part of createReadStream(result.envelope.path, { signal })) {
    bytes += part.length;
    if (bytes > result.envelope.bytes) fail();
    hash.update(part);
  }
  const after = await lstat(result.envelope.path, { bigint: true });
  if (
    bytes !== result.envelope.bytes ||
    hash.digest("hex") !== result.envelope.sha256 ||
    [
      before.dev,
      before.ino,
      before.mode,
      before.size,
      before.mtimeNs,
      before.ctimeNs,
    ].join() !==
      [
        after.dev,
        after.ino,
        after.mode,
        after.size,
        after.mtimeNs,
        after.ctimeNs,
      ].join()
  )
    fail();
}

/**
 * Node's fixed module worker owns canonical sealing and its opaque chain.
 * Abort, deadline, exit or malformed wire discards the session without replay.
 * This controls sealing only and adds no workload deadline or admission.
 */
export async function startAsyncRawSealer(
  input: AsyncRawSealerOptions,
): Promise<AsyncRawSealer> {
  if (process.versions.deno !== undefined || process.platform === "win32") {
    throw new Error("Async raw sealing requires a supported POSIX Node host.");
  }
  exact(input, [
    "context",
    "recipient",
    "recipientPin",
    "limits",
    "controlMs",
    ...(input.signal === undefined ? [] : ["signal"]),
  ]);
  if (
    !Number.isSafeInteger(input.controlMs) ||
    input.controlMs < 1 ||
    input.controlMs > 2_147_483_647 ||
    input.signal?.aborted
  )
    fail();
  // The constructor validates and copies the public binding without cloning it.
  const c = input.context;
  const binding: RawSegmentContext = {
    commit: c.commit,
    tree: c.tree,
    repository: c.repository,
    session: c.session,
    comparisonRunId: c.comparisonRunId,
    run: c.run,
    attempt: c.attempt,
    job: c.job,
    role: c.role,
  };
  exact(c, Object.keys(binding));
  const controlMs = input.controlMs;
  const signal = input.signal;
  const initialSequence = new RawSegmentChain(binding).nextSequence;
  if (
    input.recipient.type !== "public" ||
    rawRecipientPin(input.recipient) !== input.recipientPin
  )
    fail();
  const recipient = input.recipient.export({ type: "spki", format: "der" });
  const limits = checkedLimits(input.limits);
  const worker = new Worker(new URL(import.meta.url), {
    env: {},
    execArgv: [],
    workerData: {
      protocol,
      context: binding,
      recipient,
      limits,
      recipientPin: input.recipientPin,
    },
  });
  const verification = new AbortController();
  let discarded = false;
  let sequence = initialSequence;
  let previous: string | null = null;
  let tails = false;
  let requestId = 0;
  let ready = false;
  let verifying = false;
  let timer: ReturnType<typeof setTimeout>;
  let pending:
    | {
        readonly id: number;
        readonly expected: ExpectedRawSealResponse;
        readonly resolve: (value: SealedRawSegment) => void;
        readonly reject: (error: Error) => void;
      }
    | undefined;
  let readyResolve: () => void = noop;
  let readyReject: (error: Error) => void = noop;
  const initialized = new Promise<void>((accept, reject) => {
    readyResolve = accept;
    readyReject = reject;
  });
  let exitResolve: () => void = noop;
  const finished = new Promise<void>((accept) => {
    exitResolve = accept;
  });
  const discard = (): void => {
    if (discarded) return;
    discarded = true;
    verification.abort();
    clearTimeout(timer);
    signal?.removeEventListener("abort", discard);
    readyReject(new Error(invalid));
    pending?.reject(new Error(invalid));
    pending = undefined;
    // terminate() is awaited via the exit event, never a transparent restart.
    void worker.terminate().catch(() => {});
  };
  worker.on("error", discard);
  worker.on("exit", () => {
    discard();
    exitResolve();
  });
  worker.on("messageerror", discard);
  worker.on("message", <Message>(message: Message) => {
    void (async (): Promise<void> => {
      try {
        if (discarded || !isObject(message) || !("protocol" in message)) fail();
        if (!ready) {
          exact(message, ["protocol", "ready"]);
          if (
            message.protocol !== protocol ||
            !("ready" in message) ||
            message.ready !== true
          )
            fail();
          ready = true;
          clearTimeout(timer);
          readyResolve();
          return;
        }
        exact(message, ["protocol", "id", "result"]);
        if (
          message.protocol !== protocol ||
          !("id" in message) ||
          !("result" in message) ||
          pending === undefined ||
          message.id !== pending.id ||
          verifying
        )
          fail();
        verifying = true;
        const current = pending;
        const result = validateRawSealResponse(
          message.result,
          current.expected,
        );
        await verifyEnvelope(result, verification.signal);
        if (discarded || pending !== current) fail();
        sequence++;
        previous = result.receipt.segmentSha256;
        tails ||= result.receipt.kind !== "pre-release";
        pending = undefined;
        verifying = false;
        clearTimeout(timer);
        current.resolve(result);
      } catch {
        discard();
      }
    })();
  });
  timer = setTimeout(discard, controlMs);
  signal?.addEventListener("abort", discard, { once: true });
  if (signal?.aborted) discard();
  try {
    await initialized;
  } catch {
    await finished;
    return fail();
  }
  return {
    finished,
    close: async (): Promise<void> => {
      discard();
      await finished;
    },
    seal: async (request): Promise<SealedRawSegment> => {
      if (discarded || pending !== undefined) fail();
      try {
        exact(request, ["privateRoot", "outputRoot", "entries", "kind"]);
        if (
          !isAbsolute(request.privateRoot) ||
          !isAbsolute(request.outputRoot) ||
          resolve(request.outputRoot) !== request.outputRoot ||
          (sequence === 0 && request.kind !== "pre-release") ||
          (tails && request.kind === "pre-release")
        )
          fail();
        if (
          !Array.isArray(request.entries) ||
          request.entries.length < 1 ||
          request.entries.length > limits.maxFiles
        )
          fail();
        let total = 0;
        const entries = request.entries.map((entry) => {
          exact(entry, ["path", "bytes", "sha256", "mode"]);
          if (
            !isString(entry.path) ||
            entry.path.length > 1024 ||
            !Number.isSafeInteger(entry.bytes) ||
            entry.bytes < 0 ||
            entry.bytes > limits.maxFileBytes ||
            !isString(entry.sha256) ||
            !/^[a-f0-9]{64}$/u.test(entry.sha256) ||
            !Number.isSafeInteger(entry.mode) ||
            entry.mode < 0 ||
            entry.mode > 0o777
          )
            fail();
          total += entry.bytes;
          if (!Number.isSafeInteger(total) || total > limits.maxTotalBytes)
            fail();
          return {
            path: entry.path,
            bytes: entry.bytes,
            sha256: entry.sha256,
            mode: entry.mode,
          };
        });
        const closed = {
          privateRoot: request.privateRoot,
          outputRoot: request.outputRoot,
          kind: request.kind,
          entries,
        };
        const id = requestId++;
        return await new Promise<SealedRawSegment>((accept, reject) => {
          pending = {
            id,
            expected: {
              context: binding,
              sequence,
              previous,
              request: closed,
              limits,
            },
            resolve: accept,
            reject,
          };
          timer = setTimeout(discard, controlMs);
          worker.postMessage({ protocol, id, request: closed }, []);
        });
      } catch {
        discard();
        await finished;
        return fail();
      }
    },
  };
}

function runWorker(): void {
  const port = parentPort;
  if (port === null) fail();
  exact(workerData, [
    "protocol",
    "context",
    "recipient",
    "limits",
    "recipientPin",
  ]);
  const chain = new RawSegmentChain(workerData.context);
  const recipient = createPublicKey({
    key: Buffer.from(workerData.recipient),
    type: "spki",
    format: "der",
  });
  let id = 0;
  port.on("message", <Message>(message: Message) => {
    exact(message, ["protocol", "id", "request"]);
    if (
      !isObject(message) ||
      !("protocol" in message) ||
      !("id" in message) ||
      !("request" in message) ||
      message.protocol !== protocol ||
      message.id !== id++
    )
      fail();
    // SAFETY: the closed request shape is checked before canonical validation.
    const request = message.request as AsyncRawSealRequest;
    exact(request, ["privateRoot", "outputRoot", "entries", "kind"]);
    const result = sealRawSegment({
      ...request,
      chain,
      recipient,
      recipientPin: workerData.recipientPin,
      limits: workerData.limits,
    });
    port.postMessage({ protocol, id: message.id, result }, []);
  });
  port.postMessage({ protocol, ready: true }, []);
}

// Only this fixed entry can create a sealing worker, with no selected module.
if (!isMainThread && isObject(workerData) && workerData.protocol === protocol) {
  runWorker();
}
