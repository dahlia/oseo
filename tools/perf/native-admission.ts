import { createHash, createPublicKey, sign, verify } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { isAbsolute } from "node:path";
import { isBoolean, isObject, isString } from "../value-kinds.ts";
import { artifact, validateHostMetadata } from "./evidence.ts";
import type { Artifact } from "./evidence.ts";
import type { PairIdentity } from "./mac-pair-session.ts";
import type {
  AdmissionProof,
  ComparisonRequest,
} from "./ordered-comparison.ts";

/** Source and session identities shared by the two closed origin routes. */
interface NativeSourceContext {
  readonly schema: 1;
  readonly session: string;
  readonly repository: string;
  readonly comparisonRunId: string;
  readonly commit: string;
  readonly tree: string;
  readonly manifest: Artifact;
  /** Logical exclusion labels, distinct from inventory OS accounts. */
  readonly accounts: readonly string[];
}

/** GitHub claims still require independently trusted job/runner validation. */
export interface GitHubNativeContext extends NativeSourceContext {
  readonly origin: "github";
  readonly run: string;
  readonly attempt: string;
  readonly jobs: readonly PairIdentity[];
}

/** Linux kernel process identity, read by the owner, never from a frame. */
export interface LocalProcessIdentity {
  readonly pid: number;
  readonly ppid: number;
  readonly uid: number;
  readonly group: number;
  readonly sid: number;
  readonly startTicks: string;
}

/** OS identity is not proof of physical hardware or whole-host visibility. */
export interface LocalHostIdentity {
  readonly hostname: string;
  readonly machineId: string;
  readonly bootId: string;
  readonly pidNamespace: string;
}

/** Local ownership has no GitHub run, job, attempt or runner identifiers. */
export interface LocalNativeContext extends NativeSourceContext {
  readonly origin: "local-linux";
  readonly checkout: string;
  readonly checkoutDirty: boolean;
  readonly host: LocalHostIdentity;
  readonly parent: LocalProcessIdentity;
  readonly child: LocalProcessIdentity;
  readonly entry: Artifact;
}

/** No implicit origin or fallback from an invalid GitHub context to local. */
export type NativeContext = GitHubNativeContext | LocalNativeContext;

/** A signature records Root's decision, not physical isolation or job truth. */
export interface RootPhaseDecision {
  readonly schema: 1;
  readonly issuer: "Root";
  readonly keyPin: string;
  readonly purpose: "profile" | "timing";
  readonly requestId: string;
  readonly context: NativeContext;
  readonly issuedMs: number;
  readonly expiresMs: number;
  readonly decision: "admit" | "reject";
  readonly raw: readonly Artifact[];
}

/** No public key or credential is carried as authority in this envelope. */
export interface RootPhaseReceipt {
  readonly payload: string;
  readonly signature: string;
}

const sha = /^[a-f0-9]{64}$/u;
const git = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const id = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;
const numeric = /^[1-9][0-9]{0,19}$/u;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;

function fail(): never {
  throw new Error("Invalid Root phase admission.");
}

function observedUuid(value: string): boolean {
  return isString(value) && uuid.test(value) && !/^0+(?:-0+)*$/u.test(value);
}

function known(value: string): boolean {
  return (
    isString(value) &&
    id.test(value) &&
    !/^(unknown|unavailable|unassessed)$/iu.test(value)
  );
}

function exact<Value>(value: Value, keys: readonly string[]): void {
  if (
    !isObject(value) ||
    Array.isArray(value) ||
    Object.keys(value).toSorted().join() !== keys.toSorted().join()
  )
    fail();
}

function validateArtifact(value: Artifact): void {
  exact(value, ["path", "bytes", "sha256"]);
  if (
    !isString(value.path) ||
    !isAbsolute(value.path) ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 0 ||
    !isString(value.sha256) ||
    !sha.test(value.sha256)
  )
    fail();
}

/**
 * Check file bytes through H's owning artifact API, including empty streams.
 */
export function verifyNativeArtifact(value: Artifact): void {
  validateArtifact(value);
  const current = artifact(value.path);
  if (current.bytes !== value.bytes || current.sha256 !== value.sha256) fail();
}

/**
 * Validate a closed public binding; inventory truth still needs adjudication.
 */
export function validateNativeContext(value: NativeContext): void {
  exact(value, [
    "schema",
    "origin",
    "session",
    "repository",
    "comparisonRunId",
    "commit",
    "tree",
    "manifest",
    "accounts",
    ...(value.origin === "github"
      ? ["run", "attempt", "jobs"]
      : ["checkout", "checkoutDirty", "host", "parent", "child", "entry"]),
  ]);
  if (
    value.schema !== 1 ||
    !["github", "local-linux"].includes(value.origin) ||
    !known(value.session) ||
    !known(value.comparisonRunId) ||
    !isString(value.repository) ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value.repository) ||
    !isString(value.commit) ||
    !git.test(value.commit) ||
    /^0+$/u.test(value.commit) ||
    !isString(value.tree) ||
    !git.test(value.tree) ||
    /^0+$/u.test(value.tree) ||
    !Array.isArray(value.accounts) ||
    value.accounts.length < 1 ||
    value.accounts.length > 32 ||
    value.accounts.some((account) => !known(account)) ||
    new Set(value.accounts).size !== value.accounts.length
  )
    fail();
  validateArtifact(value.manifest);
  if (value.origin === "local-linux") {
    validateLocalContext(value);
    return;
  }
  if (
    !isString(value.run) ||
    !numeric.test(value.run) ||
    !isString(value.attempt) ||
    !numeric.test(value.attempt) ||
    !Array.isArray(value.jobs) ||
    value.jobs.length < 1 ||
    value.jobs.length > 32
  )
    fail();
  const jobs = new Set<string>();
  const runners = new Set<string>();
  let owners = 0;
  for (const job of value.jobs) {
    exact(job, [
      "session",
      "repository",
      "run",
      "attempt",
      "source",
      "tree",
      "role",
      "job",
      "runnerId",
      "runnerName",
      "account",
      "uid",
      "hardwareUuid",
      "bootUuid",
      "platform",
      "arch",
    ]);
    if (
      job.session !== value.session ||
      job.repository !== value.repository ||
      job.run !== value.run ||
      job.attempt !== value.attempt ||
      job.source !== value.commit ||
      job.tree !== value.tree ||
      !["owner", "companion"].includes(job.role) ||
      !isString(job.job) ||
      !numeric.test(job.job) ||
      !isString(job.runnerId) ||
      !numeric.test(job.runnerId) ||
      !known(job.runnerName) ||
      !known(job.account) ||
      !Number.isSafeInteger(job.uid) ||
      job.uid < 0 ||
      !observedUuid(job.hardwareUuid) ||
      !observedUuid(job.bootUuid) ||
      job.hardwareUuid !== value.jobs[0]!.hardwareUuid ||
      job.bootUuid !== value.jobs[0]!.bootUuid ||
      !(
        (job.platform === "darwin" && job.arch === "arm64") ||
        (job.platform === "linux" && job.arch === "x64")
      ) ||
      jobs.has(job.job) ||
      runners.has(job.runnerId)
    )
      fail();
    jobs.add(job.job);
    runners.add(job.runnerId);
    if (job.role === "owner") owners++;
  }
  if (owners !== 1) fail();
}

function validateProcess(value: LocalProcessIdentity): void {
  exact(value, ["pid", "ppid", "uid", "group", "sid", "startTicks"]);
  if (
    [value.pid, value.ppid, value.group, value.sid].some(
      (n) => !Number.isSafeInteger(n) || n < 1,
    ) ||
    !Number.isSafeInteger(value.uid) ||
    value.uid < 0 ||
    !isString(value.startTicks) ||
    !numeric.test(value.startTicks)
  )
    fail();
}

function validateLocalContext(value: LocalNativeContext): void {
  exact(value.host, ["hostname", "machineId", "bootId", "pidNamespace"]);
  if (
    !isString(value.checkout) ||
    !isAbsolute(value.checkout) ||
    !isBoolean(value.checkoutDirty) ||
    !known(value.host.hostname) ||
    !isString(value.host.machineId) ||
    !/^[a-f0-9]{32}$/u.test(value.host.machineId) ||
    /^0+$/u.test(value.host.machineId) ||
    !observedUuid(value.host.bootId) ||
    !isString(value.host.pidNamespace) ||
    !/^pid:\[[1-9][0-9]{0,19}\]$/u.test(value.host.pidNamespace)
  )
    fail();
  validateProcess(value.parent);
  validateProcess(value.child);
  if (
    value.child.pid === value.parent.pid ||
    value.child.ppid !== value.parent.pid ||
    value.child.uid !== value.parent.uid ||
    value.child.group !== value.child.pid ||
    value.child.sid !== value.child.pid ||
    BigInt(value.child.startTicks) < BigInt(value.parent.startTicks)
  )
    fail();
  validateArtifact(value.entry);
}

/** Validate a route explicitly before any origin-specific operation. */
export function requireNativeOrigin(
  value: NativeContext,
  origin: NativeContext["origin"],
): void {
  validateNativeContext(value);
  if (value.origin !== origin) fail();
}

/** A local OS identifier needs separate physical-host adjudication. */
export function nativeHostBinding(value: NativeContext): string {
  validateNativeContext(value);
  return value.origin === "github"
    ? value.jobs[0]!.hardwareUuid
    : `linux-machine:${value.host.machineId}`;
}

/** Bind H's actual request shape without changing its frozen boundary API. */
export function validateNativeRequest(
  request: ComparisonRequest,
  context: NativeContext,
  phase: string,
): void {
  validateNativeContext(context);
  exact(request, ["id", "phase", "runId", "manifest", "source", "destination"]);
  if (
    !known(request.id) ||
    request.phase !== phase ||
    request.runId !== context.comparisonRunId ||
    !isString(request.destination) ||
    !isAbsolute(request.destination) ||
    request.source.tree !== context.tree ||
    request.source.host.commit !== context.commit ||
    JSON.stringify(request.manifest) !== JSON.stringify(context.manifest)
  ) {
    fail();
  }
  exact(request.source, ["host", "tree"]);
  exact(request.source.host, [
    "target",
    "os",
    "architecture",
    "cpu",
    "logicalCpus",
    "memoryBytes",
    "commit",
    "dirty",
    "node",
    "deno",
    "bun",
    "zig",
    "postject",
    "pinsSha256",
    "lockSha256",
  ]);
  validateHostMetadata(request.source.host);
  const platform =
    context.origin === "github"
      ? context.jobs.find((job) => job.role === "owner")!.platform
      : "linux";
  if (
    (platform === "darwin" ? "macos-aarch64" : "linux-x86_64-gnu") !==
    request.source.host.target
  )
    fail();
  verifyNativeArtifact(context.manifest);
  if (context.origin === "local-linux") verifyNativeArtifact(context.entry);
}

/** SHA-256 of DER SubjectPublicKeyInfo; provisioning the pin is Root-owned. */
export function rootKeyPin(key: KeyObject): string {
  const publicKey = key.type === "private" ? createPublicKey(key) : key;
  if (publicKey.type !== "public" || publicKey.asymmetricKeyType !== "ed25519")
    fail();
  return createHash("sha256")
    .update(publicKey.export({ type: "spki", format: "der" }))
    .digest("hex");
}

function validateDecision(value: RootPhaseDecision, now: number): void {
  exact(value, [
    "schema",
    "issuer",
    "keyPin",
    "purpose",
    "requestId",
    "context",
    "issuedMs",
    "expiresMs",
    "decision",
    "raw",
  ]);
  if (
    value.schema !== 1 ||
    value.issuer !== "Root" ||
    !isString(value.keyPin) ||
    !sha.test(value.keyPin) ||
    !["profile", "timing"].includes(value.purpose) ||
    !known(value.requestId) ||
    !["admit", "reject"].includes(value.decision) ||
    !Number.isSafeInteger(now) ||
    !Number.isSafeInteger(value.issuedMs) ||
    !Number.isSafeInteger(value.expiresMs) ||
    value.issuedMs < 0 ||
    value.issuedMs > now ||
    value.expiresMs <= now ||
    value.expiresMs <= value.issuedMs ||
    !Array.isArray(value.raw) ||
    value.raw.length < 1 ||
    value.raw.length > 32
  )
    fail();
  validateNativeContext(value.context);
  for (const raw of value.raw) verifyNativeArtifact(raw);
  verifyNativeArtifact(value.context.manifest);
}

/**
 * Keep this object in Root's issuer process only. Input must be an explicit
 * Root decision after trusted collection; there is no automatic approval.
 */
export class RootPhaseIssuer {
  readonly #key: KeyObject;
  readonly #pin: string;
  constructor(privateKey: KeyObject, pin: string) {
    if (privateKey.type !== "private" || rootKeyPin(privateKey) !== pin) fail();
    this.#key = privateKey;
    this.#pin = pin;
  }

  /** Sign exactly the bounded serialized payload bytes, never the key. */
  issue(input: RootPhaseDecision, now: number): RootPhaseReceipt {
    try {
      // Snapshot JSON data before validating the exact bytes to be signed.
      const payload = JSON.stringify(input);
      if (Buffer.byteLength(payload) > 65_536) fail();
      // SAFETY: Closed schema and all nested bindings are validated below.
      const value = JSON.parse(payload) as RootPhaseDecision;
      validateDecision(value, now);
      if (value.keyPin !== this.#pin) fail();
      return {
        payload,
        signature: sign(null, Buffer.from(payload), this.#key).toString(
          "base64",
        ),
      };
    } catch {
      return fail();
    }
  }
}

/**
 * Session-local, bounded one-use state. Keep one verifier for the whole
 * session; restart/retry needs durable Root replay state or a fresh session.
 */
export class RootPhaseVerifier {
  readonly #key: KeyObject;
  readonly #pin: string;
  readonly #used = new Set<string>();
  readonly #capacity: number;
  constructor(trustedKey: KeyObject, pin: string, capacity: number) {
    if (
      trustedKey.type !== "public" ||
      rootKeyPin(trustedKey) !== pin ||
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      capacity > 4096
    ) {
      fail();
    }
    this.#key = trustedKey;
    this.#pin = pin;
    this.#capacity = capacity;
  }

  /**
   * The trusted adjudicator must validate job origin, inventory and raw
   * meaning. Throw on unknown; a signature supplies none of those facts.
   */
  async accept(
    receipt: RootPhaseReceipt,
    request: ComparisonRequest,
    context: NativeContext,
    purpose: "profile" | "timing",
    clock: () => number,
    adjudicate: (decision: RootPhaseDecision) => Promise<void>,
  ): Promise<AdmissionProof> {
    try {
      exact(receipt, ["payload", "signature"]);
      if (
        !isString(receipt.payload) ||
        Buffer.byteLength(receipt.payload) > 65_536 ||
        !isString(receipt.signature) ||
        !/^[A-Za-z0-9+/]{86}==$/u.test(receipt.signature) ||
        !verify(
          null,
          Buffer.from(receipt.payload),
          this.#key,
          Buffer.from(receipt.signature, "base64"),
        )
      )
        fail();
      // SAFETY: Untrusted JSON is checked before any admission is returned.
      const value = JSON.parse(receipt.payload) as RootPhaseDecision;
      const requestBytes = JSON.stringify(request);
      const contextBytes = JSON.stringify(context);
      const now = clock();
      validateDecision(value, now);
      validateNativeRequest(request, context, `${purpose}-admission`);
      if (
        value.keyPin !== this.#pin ||
        value.purpose !== purpose ||
        value.requestId !== request.id ||
        JSON.stringify(value.context) !== JSON.stringify(context)
      )
        fail();
      const key = JSON.stringify([context.session, purpose, request.id]);
      if (this.#used.has(key) || this.#used.size >= this.#capacity) fail();
      // Reserve before adjudication, including failed or reentrant callbacks.
      this.#used.add(key);
      if (value.decision !== "admit") fail();
      await adjudicate(structuredClone(value));
      // A trusted callback cannot silently replace evidence or its identity.
      validateDecision(value, clock());
      if (
        JSON.stringify(request) !== requestBytes ||
        JSON.stringify(context) !== contextBytes
      )
        fail();
      validateNativeRequest(request, context, `${purpose}-admission`);
      return {
        requestId: value.requestId,
        status: "complete",
        raw: value.raw,
        authority: "Root",
        purpose,
      };
    } catch {
      return fail();
    }
  }
}
