import type { ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { userInfo } from "node:os";
import { isAbsolute, join } from "node:path";
import { Duplex } from "node:stream";
import { isObject, isString } from "../value-kinds.ts";
import {
  validateNativeContext,
  requireNativeOrigin,
  nativeHostBinding,
  validateNativeRequest,
  verifyNativeArtifact,
} from "./native-admission.ts";
import type {
  GitHubNativeContext,
  LocalNativeContext,
  NativeContext,
} from "./native-admission.ts";
import type {
  AdmissionProof,
  BoundaryProof,
  ComparisonRequest,
  ExclusionProof,
  ExclusionStart,
  WindowBounds,
} from "./ordered-comparison.ts";

/**
 * Only controls cross the pipe; H and P callbacks stay in the child.
 */
export const nativeControlPhases: readonly string[] = Object.freeze([
  "diagnosis",
  "profile-admission",
  "profile-exclusion",
  "profile-exclusion-close",
  "timing-admission",
  "timing-exclusion",
  "timing-exclusion-close",
  "finalize",
]);

/**
 * An exclusion close reuses its opening request with explicit window bounds.
 */
export interface NativeControl {
  readonly phase: string;
  readonly request: ComparisonRequest;
  readonly bounds: WindowBounds | null;
}

/**
 * A proof is checked here for binding/bytes; meaning belongs to its producer.
 */
export type NativeControlProof =
  | BoundaryProof
  | AdmissionProof
  | ExclusionStart
  | ExclusionProof;

/** No workload deadline: only each outstanding control exchange is bounded. */
export interface PhaseControlOptions {
  readonly context: NativeContext;
  readonly responseMs: number;
  readonly signal: AbortSignal;
  readonly directory: string;
}

/** Trusted callbacks cannot supply child status or replace owned cleanup. */
interface ParentHandler {
  readonly handle: (
    control: NativeControl,
    signal: AbortSignal,
  ) => Promise<NativeControlProof>;
}

/**
 * The frozen pair caller can supply an unvalidated candidate. Missing tags
 * fail at attachment; this type does not authorize an implicit origin.
 */
export interface PhaseParentOptions
  extends Omit<PhaseControlOptions, "context">, ParentHandler {
  readonly context: Omit<GitHubNativeContext, "schema" | "origin"> & {
    readonly schema?: number;
    readonly origin?: string;
  };
}

/** The Linux launcher supplies a context derived from its owned child. */
export interface LocalPhaseParentOptions
  extends PhaseControlOptions, ParentHandler {
  readonly context: LocalNativeContext;
}

interface AttachedParentOptions extends PhaseControlOptions {
  readonly handle: (
    control: NativeControl,
    signal: AbortSignal,
  ) => Promise<NativeControlProof>;
}

interface Frame {
  readonly schema: 1;
  readonly role: "ordered-child" | "pair-parent" | "local-parent";
  readonly binding: string;
  readonly sequence: number;
  readonly control: NativeControl;
  readonly proof: NativeControlProof | null;
}

const maxFrame = 65_536;
function invalid(): never {
  throw new Error("Phase control failed.");
}
function keys<Value>(value: Value, expected: readonly string[]): void {
  if (
    !isObject(value) ||
    Array.isArray(value) ||
    Object.keys(value).toSorted().join() !== expected.toSorted().join()
  ) {
    invalid();
  }
}
function bounds(value: WindowBounds): void {
  keys(value, ["startedMs", "finishedMs"]);
  if (
    !Number.isSafeInteger(value.startedMs) ||
    !Number.isSafeInteger(value.finishedMs) ||
    value.startedMs < 0 ||
    value.finishedMs < value.startedMs
  )
    invalid();
}
function validateControl(value: NativeControl, context: NativeContext): void {
  keys(value, ["phase", "request", "bounds"]);
  if (!nativeControlPhases.includes(value.phase)) invalid();
  const close = value.phase.endsWith("-close");
  validateNativeRequest(
    value.request,
    context,
    close ? value.phase.slice(0, -6) : value.phase,
  );
  if (close) {
    if (value.bounds === null) invalid();
    bounds(value.bounds);
  } else if (value.bounds !== null) invalid();
}
function validateProof(
  proof: NativeControlProof,
  control: NativeControl,
  context: NativeContext,
): void {
  const base = ["requestId", "status", "raw"];
  const phase = control.phase;
  if (phase.endsWith("-admission")) {
    keys(proof, [...base, "authority", "purpose"]);
    if (
      !("authority" in proof) ||
      proof.authority !== "Root" ||
      !("purpose" in proof) ||
      proof.purpose !== phase.split("-")[0]
    )
      invalid();
  } else if (phase.includes("-exclusion")) {
    const close = phase.endsWith("-close");
    keys(proof, [
      ...base,
      "physicalHost",
      "accounts",
      "startedMs",
      ...(close ? ["finishedMs", "coverage"] : ["state"]),
    ]);
    if (
      !("physicalHost" in proof) ||
      !isString(proof.physicalHost) ||
      proof.physicalHost !== nativeHostBinding(context) ||
      !("accounts" in proof) ||
      !Array.isArray(proof.accounts) ||
      JSON.stringify(proof.accounts.toSorted()) !==
        JSON.stringify(context.accounts.toSorted()) ||
      !("startedMs" in proof) ||
      !Number.isSafeInteger(proof.startedMs) ||
      proof.startedMs < 0
    )
      invalid();
    if (close) {
      if (
        !("coverage" in proof) ||
        proof.coverage !== "whole-window" ||
        !("finishedMs" in proof)
      )
        invalid();
      bounds({ startedMs: proof.startedMs, finishedMs: proof.finishedMs });
      if (
        proof.startedMs > control.bounds!.startedMs ||
        proof.finishedMs < control.bounds!.finishedMs
      )
        invalid();
    } else if (!("state" in proof) || proof.state !== "monitoring") invalid();
  } else keys(proof, base);
  if (
    proof.requestId !== control.request.id ||
    proof.status !== "complete" ||
    !Array.isArray(proof.raw) ||
    proof.raw.length < 1 ||
    proof.raw.length > 32
  ) {
    invalid();
  }
  for (const raw of proof.raw) verifyNativeArtifact(raw);
}

/** A bounded length-prefixed stream avoids Node IPC's unbounded JSON parse. */
class Wire {
  readonly #stream: Duplex;
  readonly #context: NativeContext;
  readonly #binding: string;
  readonly #directory: string;
  readonly #onFrame: (frame: Frame) => void;
  readonly #onFailure: () => void;
  readonly #storage = Buffer.alloc(maxFrame + 4);
  #used = 0;
  #length = 4;
  #failed = false;
  #received = 0;
  constructor(
    stream: Duplex,
    options: PhaseControlOptions,
    onFrame: (frame: Frame) => void,
    onFailure: () => void,
  ) {
    validateNativeContext(options.context);
    if (
      !isAbsolute(options.directory) ||
      !Number.isSafeInteger(options.responseMs) ||
      options.responseMs < 1 ||
      options.responseMs > 2_147_483_647
    )
      invalid();
    this.#stream = stream;
    this.#context = structuredClone(options.context);
    this.#binding = createHash("sha256")
      .update(JSON.stringify(this.#context))
      .digest("hex");
    this.#directory = options.directory;
    mkdirSync(options.directory, { mode: 0o700 });
    this.#onFrame = onFrame;
    this.#onFailure = onFailure;
    stream.on("data", this.#data);
    stream.on("error", this.#fail);
  }
  readonly #fail = (): void => {
    if (this.#failed) return;
    this.#failed = true;
    this.#onFailure();
  };
  readonly #data = (chunk: Buffer): void => {
    try {
      if (!Buffer.isBuffer(chunk) || this.#failed) return this.#fail();
      let offset = 0;
      while (offset < chunk.length && !this.#failed) {
        const count = Math.min(
          this.#length - this.#used,
          chunk.length - offset,
        );
        chunk.copy(this.#storage, this.#used, offset, offset + count);
        offset += count;
        this.#used += count;
        if (this.#used !== this.#length) continue;
        if (this.#length === 4) {
          const size = this.#storage.readUInt32BE(0);
          if (size < 2 || size > maxFrame) invalid();
          this.#length = size + 4;
          continue;
        }
        if (++this.#received > nativeControlPhases.length) invalid();
        const raw = this.#storage.subarray(4, this.#length);
        // SAFETY: The complete closed frame is validated before dispatch.
        const text = raw.toString("utf8");
        if (!Buffer.from(text).equals(raw)) invalid();
        // SAFETY: Closed frame validation precedes use of parsed JSON.
        const frame = JSON.parse(text) as Frame;
        keys(frame, [
          "schema",
          "role",
          "binding",
          "sequence",
          "control",
          "proof",
        ]);
        if (
          frame.schema !== 1 ||
          frame.binding !== this.#binding ||
          !["ordered-child", parentRole(this.#context)].includes(frame.role) ||
          !Number.isSafeInteger(frame.sequence)
        )
          invalid();
        validateControl(frame.control, this.#context);
        if (frame.proof !== null) {
          validateProof(frame.proof, frame.control, this.#context);
        }
        this.#onFrame(frame);
        // Record only schema-validated control bytes, never invalid input or
        // callback error text. Stdout/stderr remain the child's raw files.
        appendFileSync(
          join(this.#directory, "received.bin"),
          this.#storage.subarray(0, this.#length),
          { mode: 0o600 },
        );
        this.#used = 0;
        this.#length = 4;
      }
    } catch {
      this.#fail();
    }
  };
  send(
    role: Frame["role"],
    sequence: number,
    control: NativeControl,
    proof: NativeControlProof | null,
  ): void {
    if (this.#failed) invalid();
    validateControl(control, this.#context);
    if (proof !== null) validateProof(proof, control, this.#context);
    const text = Buffer.from(
      JSON.stringify({
        schema: 1,
        role,
        binding: this.#binding,
        sequence,
        control,
        proof,
      }),
    );
    if (text.length > maxFrame) invalid();
    const packet = Buffer.alloc(4 + text.length);
    packet.writeUInt32BE(text.length);
    text.copy(packet, 4);
    if (!this.#stream.write(packet)) invalid();
    appendFileSync(join(this.#directory, "sent.bin"), packet, { mode: 0o600 });
  }
  partial(): boolean {
    return this.#used !== 0;
  }
  dispose(): void {
    this.#stream.off("data", this.#data);
    // Keep the error listener until destruction; late pipe errors are handled.
    this.#stream.destroy();
  }
}

/** Sequential controls, with exact opening/closing IDs and no phase overlap. */
class Order {
  #next = 0;
  #finalized = false;
  readonly #ids = new Set<string>();
  #opening: ComparisonRequest | null = null;
  check(control: NativeControl): number {
    const finalizing = control.phase === "finalize";
    if (
      this.#finalized ||
      (finalizing
        ? this.#opening !== null
        : nativeControlPhases[this.#next] !== control.phase)
    )
      invalid();
    if (control.phase.endsWith("-close")) {
      if (JSON.stringify(this.#opening) !== JSON.stringify(control.request)) {
        invalid();
      }
      this.#opening = null;
    } else {
      if (this.#ids.has(control.request.id)) invalid();
      this.#ids.add(control.request.id);
      if (control.phase.endsWith("-exclusion")) this.#opening = control.request;
    }
    this.#finalized = finalizing;
    return ++this.#next;
  }
  failedTerminal(): boolean {
    return this.#finalized && this.#next < nativeControlPhases.length;
  }
}

/** The launcher owns the child and cleanup independently of protocol state. */
export interface OwnedPhaseParent {
  readonly failure: () => string | null;
  readonly complete: () => boolean;
  readonly dispose: () => void;
}

/**
 * Attach the private fd3 pipe of an owned Node child. No pid from a message is
 * trusted. The caller's onFailure must start its existing owned-group cleanup.
 */
export function attachOwnedPhaseParent(
  child: ChildProcess,
  options: PhaseParentOptions,
  onFailure: () => void,
): OwnedPhaseParent {
  // SAFETY: The candidate is immediately checked against the closed schema.
  const context = options.context as GitHubNativeContext;
  requireNativeOrigin(context, "github");
  if (context.jobs.find((job) => job.role === "owner")?.uid !== userInfo().uid)
    invalid();
  return attachParent(child, { ...options, context }, onFailure);
}

/** Linux route rejects GitHub claims even when the claimed UID matches. */
export function attachOwnedLocalPhaseParent(
  child: ChildProcess,
  options: LocalPhaseParentOptions,
  onFailure: () => void,
): OwnedPhaseParent {
  requireNativeOrigin(options.context, "local-linux");
  if (
    options.context.parent.pid !== process.pid ||
    options.context.parent.uid !== userInfo().uid ||
    options.context.child.pid !== child.pid
  )
    invalid();
  return attachParent(child, options, onFailure);
}

function parentRole(context: NativeContext): Frame["role"] {
  return context.origin === "github" ? "pair-parent" : "local-parent";
}

function attachParent(
  child: ChildProcess,
  options: AttachedParentOptions,
  onFailure: () => void,
): OwnedPhaseParent {
  const stream = child.stdio[3];
  if (!(stream instanceof Duplex) || child.pid == null || child.pid < 1)
    invalid();
  let failure: string | null = null;
  let complete = false;
  let pending = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const order = new Order();
  const context = structuredClone(options.context);
  const fail = (): void => {
    if (disposed || failure !== null) return;
    failure = "Phase control failed.";
    clearTimeout(timer);
    controller.abort();
    onFailure();
  };
  const wire = new Wire(
    stream,
    options,
    (frame) => {
      if (
        failure !== null ||
        pending ||
        complete ||
        frame.role !== "ordered-child" ||
        frame.proof !== null
      )
        invalid();
      const sequence = order.check(frame.control);
      if (frame.sequence !== sequence) invalid();
      pending = true;
      timer = setTimeout(fail, options.responseMs);
      void Promise.resolve()
        .then(() => {
          if (failure !== null || disposed) invalid();
          return options.handle(
            structuredClone(frame.control),
            controller.signal,
          );
        })
        .then((proof) => {
          if (failure !== null || disposed) return;
          validateProof(proof, frame.control, context);
          wire.send(parentRole(context), sequence, frame.control, proof);
          clearTimeout(timer);
          pending = false;
          complete = frame.control.phase === "finalize";
        })
        .catch(fail);
    },
    fail,
  );
  const closed = (): void => {
    if (!complete || pending || wire.partial()) fail();
  };
  stream.on("close", closed);
  stream.on("end", closed);
  child.on("exit", closed);
  child.on("error", fail);
  options.signal.addEventListener("abort", fail, { once: true });
  if (options.signal.aborted) fail();
  return {
    failure: () =>
      failure ??
      (order.failedTerminal() ? "Phase control finalized early." : null),
    complete: () => complete && failure === null,
    dispose: () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
      options.signal.removeEventListener("abort", fail);
      child.off("exit", closed);
      child.off("error", fail);
      stream.off("close", closed);
      stream.off("end", closed);
      wire.dispose();
    },
  };
}

/** The child holds no pair nonce or Root signing key. */
export interface PhaseControlClient {
  readonly request: (control: NativeControl) => Promise<NativeControlProof>;
  readonly dispose: () => void;
}

/**
 * Use the inherited private pipe in the ordered child, outside synchronous H
 * calls. No profile callback, command, environment, key or nonce crosses it.
 */
export function createPhaseControlClient(
  stream: Duplex,
  options: PhaseControlOptions,
): PhaseControlClient {
  let failed = false;
  let complete = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting: {
    readonly sequence: number;
    readonly control: NativeControl;
    readonly resolve: (proof: NativeControlProof) => void;
    readonly reject: (error: Error) => void;
  } | null = null;
  const order = new Order();
  const fail = (): void => {
    if (disposed) return;
    failed = true;
    clearTimeout(timer);
    waiting?.reject(new Error("Phase control failed."));
    waiting = null;
    stream.destroy();
  };
  const wire = new Wire(
    stream,
    options,
    (frame) => {
      if (
        failed ||
        waiting === null ||
        frame.role !== parentRole(options.context) ||
        frame.sequence !== waiting.sequence ||
        frame.proof === null ||
        JSON.stringify(frame.control) !== JSON.stringify(waiting.control)
      ) {
        invalid();
      }
      clearTimeout(timer);
      complete = frame.control.phase === "finalize";
      waiting.resolve(frame.proof);
      waiting = null;
    },
    fail,
  );
  const closed = (): void => {
    if (!complete || wire.partial()) fail();
  };
  stream.on("close", closed);
  stream.on("end", closed);
  options.signal.addEventListener("abort", fail, { once: true });
  if (options.signal.aborted) fail();
  return {
    request: async (input) => {
      if (failed || disposed || complete) invalid();
      if (waiting !== null) {
        fail();
        return invalid();
      }
      try {
        const control = structuredClone(input);
        validateControl(control, options.context);
        const sequence = order.check(control);
        const proof = await new Promise<NativeControlProof>(
          (resolve, reject) => {
            waiting = { sequence, control, resolve, reject };
            timer = setTimeout(fail, options.responseMs);
            wire.send("ordered-child", sequence, control, null);
          },
        );
        if (failed) invalid();
        return proof;
      } catch {
        fail();
        return invalid();
      }
    },
    dispose: () => {
      fail();
      disposed = true;
      options.signal.removeEventListener("abort", fail);
      stream.off("close", closed);
      stream.off("end", closed);
      wire.dispose();
    },
  };
}
