import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import type { KeyObject } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  rmSync,
  writeSync,
} from "node:fs";
import type { BigIntStats } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { platform } from "node:process";
import { isObject, isString } from "../value-kinds.ts";
import type { Artifact } from "./evidence.ts";

/** Public source binding, supplied independently of transported bytes. */
export interface RawSegmentContext {
  readonly commit: string;
  readonly tree: string;
  readonly repository: string;
  readonly session: string;
  readonly comparisonRunId: string;
  readonly run: string;
  readonly attempt: string;
  readonly job: string;
  readonly role:
    | "owner"
    | "companion"
    | "holder-mac-3"
    | "holder-mac-4"
    | "holder-mac-5"
    | "holder-mac-6"
    | "holder-macrun-1"
    | "holder-macrun-2";
}

/** Closed files precede release; later tails never imply job completion. */
export type RawSegmentKind =
  | "pre-release"
  | "release-tail"
  | "supervisor-tail"
  | "ordered-tail";

/** H byte receipt with a relative name and original permission bits. */
export interface RawSegmentEntry extends Artifact {
  readonly mode: number;
}

/** Explicit transport limits reject excess bytes rather than truncate them. */
export interface RawSegmentLimits {
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
  readonly maxHeaderBytes: number;
  readonly maxManifestBytes: number;
  readonly chunkBytes: number;
}

/** This private manifest preserves boundaries without decoding raw bytes. */
export interface RawSegmentManifest {
  readonly schema: 1;
  readonly context: RawSegmentContext;
  readonly kind: RawSegmentKind;
  readonly sequence: number;
  readonly previous: string | null;
  readonly files: readonly RawSegmentEntry[];
}

/** Safe to export after the caller reviews the public context. */
export interface RawSegmentReceipt {
  readonly context: RawSegmentContext;
  readonly kind: RawSegmentKind;
  readonly sequence: number;
  readonly previous: string | null;
  readonly segmentSha256: string;
  readonly rawBytes: number;
  readonly fileCount: number;
  readonly envelopeBytes: number;
  readonly envelopeSha256: string;
}

/** Local paths and manifest are private; only receipt is a public summary. */
export interface SealedRawSegment {
  readonly manifest: RawSegmentManifest;
  readonly envelope: Artifact;
  readonly receipt: RawSegmentReceipt;
}

/** Read notifications carry counts for coordinated source closure. */
export interface RawReadProgress {
  readonly file: number;
  readonly bytes: number;
}

/** No credential discovery, default key, upload or workload runs here. */
export interface SealRawSegmentOptions {
  readonly privateRoot: string;
  readonly outputRoot: string;
  readonly entries: readonly RawSegmentEntry[];
  readonly chain: RawSegmentChain;
  readonly kind: RawSegmentKind;
  readonly recipient: KeyObject;
  readonly recipientPin: string;
  readonly limits: RawSegmentLimits;
  readonly onRead?: (progress: RawReadProgress) => void;
}

/** Root supplies its key, pin, expected ciphertext and independent chain. */
export interface OpenRawSegmentOptions {
  readonly envelope: Artifact;
  readonly outputRoot: string;
  readonly chain: RawSegmentChain;
  readonly expectedKind: RawSegmentKind;
  readonly privateKey: KeyObject;
  readonly recipientPin: string;
  readonly limits: RawSegmentLimits;
}

interface ChainState {
  readonly context: RawSegmentContext;
  sequence: number;
  previous: string | null;
  tails: boolean;
  busy: boolean;
}

const chains = new WeakMap<RawSegmentChain, ChainState>();
const hashPattern = /^[a-f0-9]{64}$/u;
const gitPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const magic = Buffer.from("OSRAW001", "ascii");
const algorithm = "X25519-HKDF-SHA256-AES-256-GCM";
const errorMessage = "Invalid private raw segment.";

function fail(): never {
  throw new Error(errorMessage);
}

function exact<Value>(value: Value, keys: readonly string[]): void {
  if (
    !isObject(value) ||
    Array.isArray(value) ||
    Object.keys(value).toSorted().join() !== keys.toSorted().join()
  )
    fail();
}

function integer(value: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail();
}

function hash(value: string): void {
  if (!isString(value) || !hashPattern.test(value)) fail();
}

function encode<Value>(value: Value): Buffer {
  return Buffer.from(JSON.stringify(value), "utf8");
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function context(value: RawSegmentContext): RawSegmentContext {
  exact(value, [
    "commit",
    "tree",
    "repository",
    "session",
    "comparisonRunId",
    "run",
    "attempt",
    "job",
    "role",
  ]);
  for (const field of [value.commit, value.tree]) {
    if (!isString(field) || !gitPattern.test(field) || /^0+$/u.test(field)) {
      fail();
    }
  }
  if (
    !isString(value.repository) ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value.repository)
  )
    fail();
  for (const field of [value.session, value.comparisonRunId]) {
    if (
      !isString(field) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u.test(field) ||
      /^(unknown|unavailable)$/iu.test(field)
    )
      fail();
  }
  for (const field of [value.run, value.attempt, value.job]) {
    if (!isString(field) || !/^[1-9][0-9]{0,19}$/u.test(field)) fail();
  }
  if (
    ![
      "owner",
      "companion",
      "holder-mac-3",
      "holder-mac-4",
      "holder-mac-5",
      "holder-mac-6",
      "holder-macrun-1",
      "holder-macrun-2",
    ].includes(value.role)
  )
    fail();
  return {
    commit: value.commit,
    tree: value.tree,
    repository: value.repository,
    session: value.session,
    comparisonRunId: value.comparisonRunId,
    run: value.run,
    attempt: value.attempt,
    job: value.job,
    role: value.role,
  };
}

function limits(value: RawSegmentLimits): RawSegmentLimits {
  exact(value, [
    "maxFiles",
    "maxFileBytes",
    "maxTotalBytes",
    "maxHeaderBytes",
    "maxManifestBytes",
    "chunkBytes",
  ]);
  integer(value.maxFiles, 10_000);
  integer(value.maxFileBytes, Number.MAX_SAFE_INTEGER);
  integer(value.maxTotalBytes, Number.MAX_SAFE_INTEGER - 2_097_152);
  integer(value.maxHeaderBytes, 65_536);
  integer(value.maxManifestBytes, 1_048_576);
  integer(value.chunkBytes, 1_048_576);
  if (
    value.maxFiles < 1 ||
    value.maxHeaderBytes < 1 ||
    value.maxManifestBytes < 1 ||
    value.chunkBytes < 1
  )
    fail();
  return { ...value };
}

function name(value: string): void {
  // Reject Windows aliases and separators on every host, before extraction.
  if (
    !isString(value) ||
    value.length > 1024 ||
    isAbsolute(value) ||
    value
      .split("/")
      .some(
        (part) =>
          !/^[A-Za-z0-9_.-]+$/u.test(part) ||
          part === "." ||
          part === ".." ||
          /[. ]$/u.test(part) ||
          /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/iu.test(part),
      )
  )
    fail();
}

function entries(
  values: readonly RawSegmentEntry[],
  cap: RawSegmentLimits,
): readonly RawSegmentEntry[] {
  if (!Array.isArray(values) || values.length < 1) fail();
  integer(values.length, cap.maxFiles);
  const seen = new Set<string>();
  let total = 0;
  for (const value of values) {
    exact(value, ["path", "bytes", "sha256", "mode"]);
    name(value.path);
    const folded = value.path.toLowerCase();
    if (seen.has(folded)) fail();
    seen.add(folded);
    integer(value.bytes, cap.maxFileBytes);
    hash(value.sha256);
    integer(value.mode, 0o777);
    if (platform !== "win32" && (value.mode & 0o077) !== 0) fail();
    total += value.bytes;
    integer(total, cap.maxTotalBytes);
  }
  for (const path of seen) {
    const parents = path.split("/");
    parents.pop();
    while (parents.length > 0) {
      if (seen.has(parents.join("/"))) fail();
      parents.pop();
    }
  }
  return values.map((value) => ({
    path: value.path,
    bytes: value.bytes,
    sha256: value.sha256,
    mode: value.mode,
  }));
}

/**
 * One local chain per producer identity. Root keeps an independent chain and
 * must persist replay state or require a fresh session after a restart.
 * Neither the chain nor encryption authenticates a GitHub job or host.
 */
export class RawSegmentChain {
  /** Next segment index only; it does not report whole-run acceptance. */
  get nextSequence(): number {
    return chains.get(this)?.sequence ?? fail();
  }

  constructor(binding: RawSegmentContext) {
    try {
      chains.set(this, {
        context: context(binding),
        sequence: 0,
        previous: null,
        tails: false,
        busy: false,
      });
    } catch {
      fail();
    }
  }
}

function state(chain: RawSegmentChain): ChainState {
  const value = chains.get(chain);
  if (value == null || value.busy) fail();
  integer(value.sequence, Number.MAX_SAFE_INTEGER - 1);
  value.busy = true;
  return value;
}

function ordered(
  manifest: Omit<RawSegmentManifest, "files" | "schema">,
  chain: ChainState,
): void {
  if (
    ![
      "pre-release",
      "release-tail",
      "supervisor-tail",
      "ordered-tail",
    ].includes(manifest.kind) ||
    manifest.sequence !== chain.sequence ||
    manifest.previous !== chain.previous ||
    !encode(context(manifest.context)).equals(encode(chain.context)) ||
    (chain.sequence === 0 && manifest.kind !== "pre-release") ||
    (chain.tails && manifest.kind === "pre-release")
  )
    fail();
}

function advance(
  chain: ChainState,
  manifest: RawSegmentManifest,
  digest: string,
): void {
  chain.sequence++;
  chain.previous = digest;
  chain.tails ||= manifest.kind !== "pre-release";
}

function key(keyObject: KeyObject, type: "public" | "private"): void {
  if (
    keyObject == null ||
    keyObject.type !== type ||
    keyObject.asymmetricKeyType !== "x25519"
  )
    fail();
}

/** Pin an explicitly authenticated X25519 recipient public key. */
export function rawRecipientPin(publicKey: KeyObject): string {
  try {
    key(publicKey, "public");
    return sha256(publicKey.export({ type: "spki", format: "der" }));
  } catch {
    fail();
  }
}

function privateDirectory(path: string): string {
  const absolute = resolve(path);
  const parsed = resolve(absolute, "..");
  if (parsed !== absolute) privatePath(absolute);
  const stat = lstatSync(absolute, { bigint: true });
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (platform !== "win32" && (stat.mode & 0o077n) !== 0n)
  )
    fail();
  return realpathSync(absolute);
}

function privatePath(path: string): void {
  const parent = dirname(path);
  if (parent !== path) {
    privatePath(parent);
    const stat = lstatSync(path, { bigint: true });
    if (stat.isSymbolicLink()) fail();
  }
}

function inside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return (
    path === "" ||
    (path !== ".." && !path.startsWith(".." + sep) && !isAbsolute(path))
  );
}

function outputPath(value: string, source: string): string {
  if (!isString(value) || !isAbsolute(value)) fail();
  const path = resolve(value);
  privatePath(dirname(path));
  const output = join(realpathSync(dirname(path)), basename(path));
  if (inside(source, output) || inside(output, source)) fail();
  return output;
}

function signature(stat: BigIntStats): string {
  return [
    stat.dev,
    stat.ino,
    stat.mode,
    stat.nlink,
    stat.size,
    stat.mtimeNs,
    stat.ctimeNs,
  ].join(":");
}

function regular(stat: BigIntStats): void {
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1n ||
    (platform !== "win32" && (stat.mode & 0o077n) !== 0n)
  )
    fail();
}

function openRaw(path: string): number {
  privatePath(path);
  regular(lstatSync(path, { bigint: true }));
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd, { bigint: true });
    regular(stat);
    if (signature(stat) !== signature(lstatSync(path, { bigint: true }))) {
      fail();
    }
    return fd;
  } catch {
    closeSync(fd);
    fail();
  }
}

function write(fd: number, bytes: Uint8Array): void {
  let offset = 0;
  while (offset < bytes.length) {
    const count = writeSync(fd, bytes, offset, bytes.length - offset);
    if (count < 1) fail();
    offset += count;
  }
}

function readExact(fd: number, length: number): Buffer {
  const result = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const count = readSync(fd, result, offset, length - offset, null);
    if (count < 1) fail();
    offset += count;
  }
  return result;
}

/** Stream one H-compatible receipt, checking the opened inode and path. */
function transfer(
  path: string,
  expected: Artifact,
  cap: RawSegmentLimits,
  sink: (bytes: Buffer) => void,
  progress?: (bytes: number) => void,
): string {
  const fd = openRaw(path);
  try {
    const initial = fstatSync(fd, { bigint: true });
    if (initial.size !== BigInt(expected.bytes)) fail();
    const buffer = Buffer.alloc(cap.chunkBytes);
    const digest = createHash("sha256");
    let total = 0;
    let count: number;
    while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      total += count;
      if (total > expected.bytes) fail();
      const part = buffer.subarray(0, count);
      digest.update(part);
      sink(part);
      progress?.(total);
    }
    if (
      total !== expected.bytes ||
      digest.digest("hex") !== expected.sha256 ||
      signature(initial) !== signature(fstatSync(fd, { bigint: true })) ||
      signature(initial) !== signature(lstatSync(path, { bigint: true }))
    )
      fail();
    privatePath(path);
    return signature(initial);
  } finally {
    closeSync(fd);
  }
}

interface Header {
  readonly schema: 1;
  readonly algorithm: typeof algorithm;
  readonly recipientPin: string;
  readonly ephemeral: string;
  readonly nonce: string;
  readonly context: RawSegmentContext;
  readonly kind: RawSegmentKind;
  readonly sequence: number;
  readonly previous: string | null;
  readonly manifestSha256: string;
  readonly manifestBytes: number;
  readonly rawBytes: number;
}

function binary(value: string, length: number): Buffer {
  if (!isString(value)) fail();
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== length || bytes.toString("base64") !== value) fail();
  return bytes;
}

function material(
  privateKey: KeyObject,
  publicKey: KeyObject,
  aad: Buffer,
): Buffer {
  const shared = diffieHellman({ privateKey, publicKey });
  try {
    return Buffer.from(
      hkdfSync(
        "sha256",
        shared,
        createHash("sha256").update(aad).digest(),
        Buffer.from("oseo-private-raw-segment-v1", "ascii"),
        32,
      ),
    );
  } finally {
    shared.fill(0);
  }
}

function receipt(
  manifest: RawSegmentManifest,
  manifestSha256: string,
  envelope: Artifact,
): RawSegmentReceipt {
  return {
    context: context(manifest.context),
    kind: manifest.kind,
    sequence: manifest.sequence,
    previous: manifest.previous,
    segmentSha256: manifestSha256,
    rawBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
    fileCount: manifest.files.length,
    envelopeBytes: envelope.bytes,
    envelopeSha256: envelope.sha256,
  };
}

function cleanup(path: string, identity: string): void {
  // Only remove the fresh directory this invocation actually created.
  const stat = lstatSync(path, { bigint: true });
  if ([stat.dev, stat.ino].join(":") === identity) {
    rmSync(path, { recursive: true, force: true });
  }
}

/**
 * Stage an explicit closed list and encrypt it without decoding any raw bytes.
 * Output is fresh 0700/0600 storage. Caller-owned sources are never changed.
 * The hash closes only this segment, including any currently closed journal
 * slice; release, ordered and supervisor tails require later linked segments.
 */
export function sealRawSegment(
  options: SealRawSegmentOptions,
): SealedRawSegment {
  let chain: ChainState | undefined;
  let output: string | undefined;
  let owned: string | undefined;
  let derivedKey: Buffer | undefined;
  try {
    const cap = limits(options.limits);
    const recipient = options.recipient;
    const recipientPin = options.recipientPin;
    const files = entries(options.entries, cap);
    chain = state(options.chain);
    const manifest: RawSegmentManifest = {
      schema: 1,
      context: context(chain.context),
      kind: options.kind,
      sequence: chain.sequence,
      previous: chain.previous,
      files,
    };
    ordered(manifest, chain);
    key(recipient, "public");
    hash(recipientPin);
    if (rawRecipientPin(recipient) !== recipientPin) fail();
    const root = privateDirectory(options.privateRoot);
    const rootIdentity = lstatSync(root, { bigint: true });
    output = outputPath(options.outputRoot, root);
    const manifestBytes = encode(manifest);
    if (manifestBytes.length > cap.maxManifestBytes) fail();
    mkdirSync(output, { mode: 0o700 });
    const outputStat = lstatSync(output, { bigint: true });
    owned = [outputStat.dev, outputStat.ino].join(":");
    const signatures: string[] = [];
    for (const [index, file] of files.entries()) {
      const source = join(root, ...file.path.split("/"));
      const stat = lstatSync(source, { bigint: true });
      if (Number(stat.mode & 0o777n) !== file.mode) fail();
      const staged = openSync(join(output, `raw-${index}`), "wx", 0o600);
      try {
        signatures.push(
          transfer(
            source,
            file,
            cap,
            (part) => write(staged, part),
            (bytes) => options.onRead?.({ file: index, bytes }),
          ),
        );
        // Include the identity and claimed mode from before opening the file.
        if (signature(stat) !== signatures[index]) fail();
      } finally {
        closeSync(staged);
      }
    }
    // Re-read bytes as well as metadata; timestamps can hide same-size drift.
    files.forEach((file, index) => {
      const source = join(root, ...file.path.split("/"));
      privatePath(source);
      if (
        signature(lstatSync(source, { bigint: true })) !== signatures[index] ||
        transfer(source, file, cap, () => undefined) !== signatures[index]
      ) {
        fail();
      }
    });
    const ephemeral = generateKeyPairSync("x25519");
    const header: Header = {
      schema: 1,
      algorithm,
      recipientPin,
      ephemeral: ephemeral.publicKey
        .export({
          type: "spki",
          format: "der",
        })
        .toString("base64"),
      nonce: randomBytes(12).toString("base64"),
      context: manifest.context,
      kind: manifest.kind,
      sequence: manifest.sequence,
      previous: manifest.previous,
      manifestSha256: sha256(manifestBytes),
      manifestBytes: manifestBytes.length,
      rawBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    };
    const body = encode(header);
    if (body.length > cap.maxHeaderBytes) fail();
    const prefix = Buffer.alloc(12);
    magic.copy(prefix);
    prefix.writeUInt32BE(body.length, 8);
    const aad = Buffer.concat([prefix, body]);
    const secret = material(ephemeral.privateKey, recipient, aad);
    derivedKey = secret;
    const path = join(output, "envelope.raw-segment");
    const fd = openSync(path, "wx", 0o600);
    const digest = createHash("sha256");
    let bytes = 0;
    const emit = (part: Buffer): void => {
      write(fd, part);
      digest.update(part);
      bytes += part.length;
    };
    try {
      const cipher = createCipheriv(
        "aes-256-gcm",
        secret,
        binary(header.nonce, 12),
        { authTagLength: 16 },
      );
      cipher.setAAD(aad);
      emit(aad);
      emit(cipher.update(manifestBytes));
      files.forEach((file, index) => {
        transfer(join(output!, `raw-${index}`), file, cap, (part) =>
          emit(cipher.update(part)),
        );
      });
      emit(cipher.final());
      emit(cipher.getAuthTag());
    } finally {
      secret.fill(0);
      closeSync(fd);
    }
    const currentRoot = lstatSync(root, { bigint: true });
    if (
      currentRoot.dev !== rootIdentity.dev ||
      currentRoot.ino !== rootIdentity.ino ||
      currentRoot.mode !== rootIdentity.mode
    )
      fail();
    // Check again after encryption without replaying caller progress callbacks.
    // This observes the current bytes, not every past transient write.
    files.forEach((file, index) => {
      const source = join(root, ...file.path.split("/"));
      privatePath(source);
      if (
        signature(lstatSync(source, { bigint: true })) !== signatures[index] ||
        transfer(source, file, cap, () => undefined) !== signatures[index]
      ) {
        fail();
      }
    });
    const envelope = { path, bytes, sha256: digest.digest("hex") };
    const result = receipt(manifest, header.manifestSha256, envelope);
    advance(chain, manifest, header.manifestSha256);
    return { manifest, envelope, receipt: result };
  } catch {
    if (output != null && owned != null) {
      try {
        cleanup(output, owned);
      } catch {
        /* Preserve a safe error. */
      }
    }
    return fail();
  } finally {
    derivedKey?.fill(0);
    if (chain != null) chain.busy = false;
  }
}

function parseHeader(bytes: Buffer, cap: RawSegmentLimits): Header {
  // SAFETY: the untrusted shape is checked below before use or export.
  const value = JSON.parse(bytes.toString("utf8")) as Header;
  exact(value, [
    "schema",
    "algorithm",
    "recipientPin",
    "ephemeral",
    "nonce",
    "context",
    "kind",
    "sequence",
    "previous",
    "manifestSha256",
    "manifestBytes",
    "rawBytes",
  ]);
  if (value.schema !== 1 || value.algorithm !== algorithm) fail();
  hash(value.recipientPin);
  hash(value.manifestSha256);
  integer(value.sequence, Number.MAX_SAFE_INTEGER - 1);
  if (value.previous !== null) hash(value.previous);
  integer(value.manifestBytes, cap.maxManifestBytes);
  if (value.manifestBytes < 1) fail();
  integer(value.rawBytes, cap.maxTotalBytes);
  context(value.context);
  binary(value.nonce, 12);
  binary(value.ephemeral, 44);
  if (!encode(value).equals(bytes)) fail();
  return value;
}

function parseManifest(
  bytes: Buffer,
  header: Header,
  cap: RawSegmentLimits,
): RawSegmentManifest {
  if (sha256(bytes) !== header.manifestSha256) fail();
  // SAFETY: the closed manifest schema and all entries are checked below.
  const value = JSON.parse(bytes.toString("utf8")) as RawSegmentManifest;
  exact(value, ["schema", "context", "kind", "sequence", "previous", "files"]);
  if (
    value.schema !== 1 ||
    value.kind !== header.kind ||
    value.sequence !== header.sequence ||
    value.previous !== header.previous ||
    !encode(context(value.context)).equals(encode(header.context)) ||
    !encode(value).equals(bytes)
  )
    fail();
  const files = entries(value.files, cap);
  if (files.reduce((sum, file) => sum + file.bytes, 0) !== header.rawBytes) {
    fail();
  }
  return { ...value, files };
}

/**
 * Authenticate into private staging before exposing files. Check every raw
 * plaintext hash and exact boundary after GCM verification. This is neither
 * Root admission nor job-terminal, cleanup, upload or host-exclusion evidence.
 */
export function openRawSegment(
  options: OpenRawSegmentOptions,
): SealedRawSegment {
  let chain: ChainState | undefined;
  let output: string | undefined;
  let owned: string | undefined;
  let derivedKey: Buffer | undefined;
  try {
    const cap = limits(options.limits);
    chain = state(options.chain);
    key(options.privateKey, "private");
    hash(options.recipientPin);
    if (
      rawRecipientPin(createPublicKey(options.privateKey)) !==
      options.recipientPin
    )
      fail();
    exact(options.envelope, ["path", "bytes", "sha256"]);
    hash(options.envelope.sha256);
    integer(
      options.envelope.bytes,
      cap.maxTotalBytes + cap.maxManifestBytes + cap.maxHeaderBytes + 28,
    );
    const path = resolve(options.envelope.path);
    output = outputPath(options.outputRoot, path);
    const fd = openRaw(path);
    try {
      const initial = fstatSync(fd, { bigint: true });
      if (initial.size !== BigInt(options.envelope.bytes)) fail();
      const prefix = readExact(fd, 12);
      if (!prefix.subarray(0, 8).equals(magic)) fail();
      const length = prefix.readUInt32BE(8);
      if (length < 1 || length > cap.maxHeaderBytes) fail();
      const body = readExact(fd, length);
      const header = parseHeader(body, cap);
      ordered(header, chain);
      if (header.kind !== options.expectedKind) fail();
      if (header.recipientPin !== options.recipientPin) fail();
      const ciphertextBytes = header.manifestBytes + header.rawBytes;
      if (options.envelope.bytes !== 12 + length + ciphertextBytes + 16) fail();
      const publicKey = createPublicKey({
        key: binary(header.ephemeral, 44),
        format: "der",
        type: "spki",
      });
      key(publicKey, "public");
      if (
        !publicKey
          .export({ type: "spki", format: "der" })
          .equals(binary(header.ephemeral, 44))
      )
        fail();
      const aad = Buffer.concat([prefix, body]);
      const secret = material(options.privateKey, publicKey, aad);
      derivedKey = secret;
      mkdirSync(output, { mode: 0o700 });
      const stat = lstatSync(output, { bigint: true });
      owned = [stat.dev, stat.ino].join(":");
      const stagedPath = join(output, "authenticated-payload");
      const staged = openSync(stagedPath, "wx", 0o600);
      const digest = createHash("sha256").update(aad);
      try {
        const cipher = createDecipheriv(
          "aes-256-gcm",
          secret,
          binary(header.nonce, 12),
          { authTagLength: 16 },
        );
        cipher.setAAD(aad);
        let remaining = ciphertextBytes;
        while (remaining > 0) {
          const part = readExact(fd, Math.min(cap.chunkBytes, remaining));
          remaining -= part.length;
          digest.update(part);
          write(staged, cipher.update(part));
        }
        const tag = readExact(fd, 16);
        digest.update(tag);
        cipher.setAuthTag(tag);
        write(staged, cipher.final());
        if (
          digest.digest("hex") !== options.envelope.sha256 ||
          signature(initial) !== signature(fstatSync(fd, { bigint: true })) ||
          signature(initial) !== signature(lstatSync(path, { bigint: true }))
        )
          fail();
        privatePath(path);
      } finally {
        secret.fill(0);
        closeSync(staged);
      }
      const payload = openRaw(stagedPath);
      try {
        const manifest = parseManifest(
          readExact(payload, header.manifestBytes),
          header,
          cap,
        );
        for (const file of manifest.files) {
          const destination = join(output, "files", ...file.path.split("/"));
          mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
          const target = openSync(destination, "wx", 0o600);
          const plainDigest = createHash("sha256");
          try {
            let remaining = file.bytes;
            while (remaining > 0) {
              const part = readExact(
                payload,
                Math.min(cap.chunkBytes, remaining),
              );
              remaining -= part.length;
              plainDigest.update(part);
              write(target, part);
            }
            if (plainDigest.digest("hex") !== file.sha256) fail();
          } finally {
            closeSync(target);
          }
        }
        const result = receipt(
          manifest,
          header.manifestSha256,
          options.envelope,
        );
        advance(chain, manifest, header.manifestSha256);
        return { manifest, envelope: { ...options.envelope }, receipt: result };
      } finally {
        closeSync(payload);
      }
    } finally {
      closeSync(fd);
    }
  } catch {
    if (output != null && owned != null) {
      try {
        cleanup(output, owned);
      } catch {
        /* Preserve a safe error. */
      }
    }
    return fail();
  } finally {
    derivedKey?.fill(0);
    if (chain != null) chain.busy = false;
  }
}
