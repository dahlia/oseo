/* eslint-disable no-await-in-loop -- Serial service changes. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  discoverProfilingTools,
  executablePath,
  profilingProbes,
} from "../../perf-profile.ts";
import { profileInventory } from "./profile-replay.ts";
import { launch } from "../../perf-profile-process.ts";
import type { Readable } from "node:stream";
import { fileIdentity } from "../../perf-profile-capture.ts";
import type { FileIdentity } from "../../perf-profile-capture.ts";
import type { RunRecord } from "../../perf-profile-process.ts";
import type {
  BoundaryProof,
  ComparisonRequest,
  WindowBounds,
} from "../ordered-comparison.ts";
import {
  readKernelControl,
  readKernelOriginalJson,
  waitKernelControl,
  writeKernelControl,
} from "./control.ts";
import type {
  KernelParentAllocation,
  KernelParentOperations,
} from "./parent.ts";
import { runKernelRootParent } from "./parent.ts";
import { requireKernelLifetimeCleanup } from "./lifetime.ts";
import type { KernelListenerObservation } from "./collector.ts";
import type { KernelMacEvent } from "./mac-timeline.ts";
import { verifyKernelSource, requireKernelDirectory } from "./source.ts";

const uuid = "/sys/devices/virtual/dmi/id/product_uuid";
const service = (index: number) => `system/org.oseo.runner.oseo-mac-${index}`;
const plist = (index: number) =>
  `/Library/LaunchDaemons/org.oseo.runner.oseo-mac-${index}.plist`;

/** The existing Root/SSH or manual terminal produces these originals. */
export interface KernelOperatorCommand {
  readonly request: {
    readonly sequence: number;
    readonly taskId: string;
    readonly host: KernelParentAllocation["host"];
    readonly kind: string;
    readonly argv: readonly string[];
  };
  readonly record: RunRecord;
}

/** Private direct allocation, pinned by the existing coordinator. */
export interface KernelOperatorAllocation {
  readonly taskId: string;
  readonly transport: "native-parent" | "manual-files";
  readonly directory: string;
  readonly allocation: FileIdentity;
  readonly responseMs: number;
  readonly signal: AbortSignal;
  readonly ingressNames: readonly string[];
  readonly macPlists: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly metadata: string;
  }[];
  readonly parent: KernelParentAllocation;
}

/** Root's original control events supply no signed origin. */
export interface KernelIngressEvidence {
  readonly taskId: string;
  readonly host: KernelParentAllocation["host"];
  readonly requestId: string;
  readonly purpose: "profile" | "timing";
  readonly accounts: readonly string[];
  readonly manifest: FileIdentity;
  readonly acquiredMs: number;
  readonly observedThroughMs: number;
  readonly releasedMs: number | null;
  readonly ingress: readonly {
    readonly name: string;
    readonly heldFromMs: number;
    readonly heldUntilMs: number | null;
    readonly original: FileIdentity;
  }[];
  readonly pendingJobs: readonly string[];
  readonly activeHooks: readonly string[];
  readonly activeChildren: readonly number[];
}

/** Replay exact original command, terminal, stdout and stderr files. */
export function replayKernelOperatorCommand(
  evidence: KernelOperatorCommand,
  request: KernelOperatorCommand["request"],
  maxClockSkewMs: number,
): string {
  assert.deepEqual(evidence.request, request);
  const record = evidence.record;
  requireKernelDirectory(record.directory);
  assert.match(record.stdout, /^[a-zA-Z0-9_-]+\.stdout$/u);
  assert.equal(record.stderr, record.stdout.replace(/\.stdout$/u, ".stderr"));
  assert.deepEqual(record.argv, request.argv);
  assert.equal(record.cwd, "/");
  assert.deepEqual(record.env, {
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    LANG: "C",
    LC_ALL: "C",
    TZ: "UTC",
  });
  assert.ok(Number.isInteger(record.status), "Command terminal unknown");
  assert.equal(record.signal, null);
  assert.equal(record.error, null);
  assert.equal(record.timedOut, false);
  assert.equal(record.groupGone, true);
  assert.ok(record.pid != null && record.pid > 0);
  assert.ok(Number.isFinite(Date.parse(record.startedUtc)));
  assert.ok(Date.parse(record.finishedUtc) >= Date.parse(record.startedUtc));
  assert.ok(record.monotonicEndMs >= record.monotonicStartMs);
  assert.equal(record.wallMs, record.monotonicEndMs - record.monotonicStartMs);
  assert.ok(
    Math.abs(
      Date.parse(record.finishedUtc) -
        Date.parse(record.startedUtc) -
        record.wallMs,
    ) <= maxClockSkewMs,
  );
  const path = join(
    record.directory,
    record.stdout.replace(/\.stdout$/u, ".json"),
  );
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), record);
  for (const name of [record.stdout, record.stderr]) {
    assert.equal(name.includes("/"), false);
    const pin = fileIdentity(join(record.directory, name));
    assert.equal(pin.path, pin.realpath);
    assert.equal(pin.mode, 0o600);
  }
  return readFileSync(join(record.directory, record.stdout), "utf8");
}

/** The control codec's fixed frame ceiling; a parts frame never exceeds it. */
const controlFrameLimit = 65_536;

/**
 * Replay one retained original. A parts frame pins its parts but cannot show
 * they still exist, so every part is decoded through the original codec.
 */
function requireKernelOriginal(pin: FileIdentity): void {
  assert.deepEqual(fileIdentity(pin.path), pin);
  if (pin.bytes > controlFrameLimit) return;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(pin.path, "utf8"));
  } catch (error) {
    // Raw stdout, stderr and probe bytes are originals, not control frames.
    if (error instanceof SyntaxError) return;
    throw error;
  }
  if (hasControlParts(value)) readKernelControl(pin.path);
  assert.deepEqual(fileIdentity(pin.path), pin);
}

/** Detect only the codec's parts marker; readKernelControl() checks it. */
function hasControlParts<Candidate>(
  value: Candidate,
): value is Candidate & { readonly kernelControlTransport: unknown } {
  return (
    value != null &&
    typeof value === "object" &&
    "kernelControlTransport" in value
  );
}

/** The parent's original reader-close payload after S closed. */
interface KernelReaderClosed {
  readonly raw: readonly FileIdentity[];
  readonly summary: object;
  readonly externalRootAcceptance: string;
  readonly escapedDescendantCleanup: string;
  readonly linuxModeRestoration: string;
}

/** Validate operating control over the requested original interval. */
export function requireKernelIngress(
  evidence: KernelIngressEvidence,
  input: KernelOperatorAllocation,
  request: ComparisonRequest,
  purpose: "profile" | "timing",
  bounds?: WindowBounds,
): void {
  assert.equal(evidence.taskId, input.taskId);
  assert.deepEqual(evidence.host, input.parent.host);
  assert.equal(evidence.requestId, request.id);
  assert.equal(evidence.purpose, purpose);
  assert.deepEqual(evidence.accounts, input.parent.child.comparison.accounts);
  assert.equal(evidence.manifest.path, request.manifest.path);
  assert.equal(evidence.manifest.sha256, request.manifest.sha256);
  assert.deepEqual(fileIdentity(evidence.manifest.path), evidence.manifest);
  assert.deepEqual(evidence.pendingJobs, []);
  assert.deepEqual(evidence.activeHooks, []);
  assert.deepEqual(evidence.activeChildren, []);
  assert.ok(evidence.ingress.length > 0, "Missing original ingress controls");
  assert.deepEqual(
    evidence.ingress.map((item) => item.name).toSorted(),
    input.ingressNames.toSorted(),
  );
  assert.equal(
    new Set(evidence.ingress.map((item) => item.name)).size,
    evidence.ingress.length,
  );
  const start = bounds?.startedMs ?? Date.now();
  const end = bounds?.finishedMs ?? start;
  assert.ok(Number.isFinite(evidence.acquiredMs));
  assert.ok(evidence.acquiredMs <= start && end >= start);
  assert.ok(Number.isFinite(evidence.observedThroughMs));
  assert.ok(
    evidence.observedThroughMs <= Date.now(),
    "Future control observation",
  );
  if (bounds)
    assert.ok(
      evidence.observedThroughMs >= end,
      "Original control observation ends before the requested window",
    );
  else
    assert.ok(
      Date.now() - evidence.observedThroughMs <= input.parent.bounds.maxGapMs,
      "Stale original control observation",
    );
  if (evidence.releasedMs != null) assert.ok(evidence.releasedMs >= end);
  for (const ingress of evidence.ingress) {
    assert.ok(ingress.name && Number.isFinite(ingress.heldFromMs));
    assert.ok(ingress.heldFromMs <= start);
    if (ingress.heldUntilMs != null) assert.ok(ingress.heldUntilMs >= end);
    assert.deepEqual(fileIdentity(ingress.original.path), ingress.original);
  }
}

/** Exchange Root requests through its existing manual channel. */
export class KernelRootOperator {
  readonly #input: KernelOperatorAllocation;
  #sequence = 0;
  #uncertain = false;
  #event = 0;
  #snapshot: Awaited<ReturnType<KernelParentOperations["listeners"]>> = {
    observations: [],
    event: { sequence: 0, kind: "baseline", startedMs: 0, finishedMs: 0 },
  };
  readonly #stopped = new Set<number>();
  #uuidIdentity: string | null = null;
  #uuidMayBeOpen = false;
  readonly #raw: FileIdentity[] = [];
  readonly #commands: RunRecord[] = [];

  constructor(input: KernelOperatorAllocation) {
    requireKernelDirectory(input.directory);
    assert.deepEqual(fileIdentity(input.allocation.path), input.allocation);
    const original = readKernelControl<{
      readonly taskId: string;
      readonly host: KernelParentAllocation["host"];
      readonly ingressNames: readonly string[];
      readonly macPlists: KernelOperatorAllocation["macPlists"];
      readonly runId: string;
      readonly transport: KernelOperatorAllocation["transport"];
    }>(input.allocation.path);
    assert.equal(original.taskId, input.taskId);
    assert.equal(original.transport, input.transport);
    assert.deepEqual(original.host, input.parent.host);
    assert.deepEqual(original.ingressNames, input.ingressNames);
    assert.deepEqual(original.macPlists, input.macPlists);
    assert.equal(
      original.runId,
      input.parent.child.comparison.measurement.runId,
    );
    this.#input = input;
  }

  async #command(kind: string, argv: readonly string[]) {
    assert.equal(
      this.#uncertain,
      false,
      "Original terminal unknown; manual recovery",
    );
    requireKernelOperatorArgv(kind, argv);
    const request = {
      sequence: this.#sequence++,
      taskId: this.#input.taskId,
      host: this.#input.parent.host,
      kind,
      argv,
    };
    const stem = String(request.sequence).padStart(4, "0");
    writeKernelControl(
      join(this.#input.directory, stem + ".command.json"),
      request,
    );
    let receipt: KernelOperatorCommand;
    let output: string;
    try {
      if (this.#input.transport === "native-parent") {
        const directory = join(this.#input.directory, stem + "-raw");
        mkdirSync(directory, { mode: 0o700 });
        const original = await produceKernelOperatorCommand(
          request,
          directory,
          this.#input.responseMs,
        );
        writeKernelControl(
          join(this.#input.directory, stem + ".terminal.json"),
          original,
        );
      }
      receipt = await waitKernelControl<KernelOperatorCommand>(
        this.#input.directory,
        stem + ".terminal.json",
        this.#input.responseMs,
        this.#input.signal,
      );
      output = replayKernelOperatorCommand(
        receipt,
        request,
        this.#input.parent.bounds.maxClockSkewMs,
      );
    } catch (error) {
      this.#uncertain = true;
      throw error;
    }
    this.#raw.push(
      fileIdentity(join(this.#input.directory, stem + ".terminal.json")),
    );
    const record = receipt.record;
    this.#commands.push(record);
    for (const name of [
      record.stdout,
      record.stderr,
      record.stdout.replace(/\.stdout$/u, ".json"),
    ])
      this.#raw.push(fileIdentity(join(record.directory, name)));
    return { record, output };
  }

  async #ok(kind: string, argv: readonly string[]) {
    const result = await this.#command(kind, argv);
    assert.equal(result.record.status, 0, `${kind} failed`);
    return result;
  }

  async #evidence(
    request: ComparisonRequest,
    purpose: "profile" | "timing",
    bounds?: WindowBounds,
  ): Promise<readonly FileIdentity[]> {
    const name = `${request.id}.${bounds ? "closed" : "open"}.ingress.json`;
    assert.match(request.id, /^[a-zA-Z0-9-]+$/u);
    const evidence = await waitKernelControl<KernelIngressEvidence>(
      this.#input.directory,
      name,
      this.#input.responseMs,
      this.#input.signal,
    );
    requireKernelIngress(evidence, this.#input, request, purpose, bounds);
    const pin = fileIdentity(join(this.#input.directory, name));
    this.#raw.push(pin, ...evidence.ingress.map((item) => item.original));
    return [pin, ...evidence.ingress.map((item) => item.original)];
  }

  async #listeners(
    kind: KernelMacEvent["kind"],
    firstCommand: number,
  ): Promise<void> {
    const observations: KernelListenerObservation[] = [];
    for (const index of [1, 2]) {
      if (this.#stopped.has(index)) continue;
      const printed = await this.#ok("listener-print", [
        "/usr/bin/sudo",
        "-n",
        "/bin/launchctl",
        "print",
        service(index),
      ]);
      const match = /^\tpid = (\d+)$/mu.exec(printed.output);
      assert.ok(match, "Missing original listener PID");
      const identity = await this.#ok("listener-identity", [
        "/bin/ps",
        "-p",
        match[1]!,
        "-o",
        "lstart=,uid=,ppid=,comm=",
      ]);
      observations.push({ print: printed.record, identity: identity.record });
    }
    const commands = this.#commands.slice(firstCommand);
    const transitions = commands.filter(
      (record) =>
        record.argv[3] === (kind === "stop" ? "bootout" : "bootstrap"),
    );
    const beginning = kind === "baseline" ? commands : transitions;
    assert.ok(beginning.length > 0);
    this.#snapshot = {
      observations,
      event: {
        sequence: this.#event++,
        kind,
        startedMs: Math.min(
          ...beginning.map((record) => Date.parse(record.startedUtc)),
        ),
        finishedMs: Math.max(
          ...this.#commands
            .slice(firstCommand)
            .map((record) => Date.parse(record.finishedUtc)),
        ),
        commands: this.#commands.slice(firstCommand),
      },
    };
  }

  async #checkPlists(): Promise<void> {
    assert.equal(this.#input.macPlists.length, 2);
    for (const [slot, original] of this.#input.macPlists.entries()) {
      assert.equal(original.path, plist(slot + 1));
      const metadata = await this.#ok("plist-metadata", [
        "/usr/bin/stat",
        "-f",
        "%d:%i:%HT:%u:%g:%Lp",
        original.path,
      ]);
      assert.equal(metadata.output.trim(), original.metadata);
      const hash = await this.#ok("plist-hash", [
        "/usr/bin/shasum",
        "-a",
        "256",
        original.path,
      ]);
      assert.equal(hash.output.trim(), original.sha256 + "  " + original.path);
    }
  }

  async #uuidAnchor(): Promise<void> {
    const boot = await this.#ok("boot", [
      "/usr/bin/cat",
      "/proc/sys/kernel/random/boot_id",
    ]);
    assert.equal(
      boot.output.trim().toLowerCase(),
      this.#input.parent.host.boot.toLowerCase(),
    );
    const canonical = await this.#ok("uuid-canonical", [
      "/usr/bin/readlink",
      "-e",
      "--",
      uuid,
    ]);
    assert.equal(canonical.output.trim(), uuid);
  }

  async #online(): Promise<void> {
    const event = this.#snapshot.event;
    const stem = `restore-online-${event.sequence}`;
    writeKernelControl(join(this.#input.directory, stem + ".request.json"), {
      taskId: this.#input.taskId,
      host: this.#input.parent.host,
      event,
      url: "https://api.github.com/repos/dahlia/oseo/actions/runners",
    });
    const receipt = await waitKernelControl<{
      readonly taskId: string;
      readonly host: KernelParentAllocation["host"];
      readonly event: typeof event;
      readonly observedMs: number;
      readonly method: string;
      readonly url: string;
      readonly status: number;
      readonly response: FileIdentity;
    }>(
      this.#input.directory,
      stem + ".receipt.json",
      this.#input.responseMs,
      this.#input.signal,
    );
    assert.equal(receipt.taskId, this.#input.taskId);
    assert.deepEqual(receipt.host, this.#input.parent.host);
    assert.deepEqual(receipt.event, event);
    assert.ok(
      Number.isFinite(receipt.observedMs) &&
        receipt.observedMs >= event.finishedMs &&
        receipt.observedMs <= Date.now(),
    );
    assert.equal(receipt.method, "GET");
    assert.equal(
      receipt.url,
      "https://api.github.com/repos/dahlia/oseo/actions/runners",
    );
    assert.equal(receipt.status, 200);
    assert.deepEqual(fileIdentity(receipt.response.path), receipt.response);
    const response = readKernelControl<{
      readonly runners: readonly {
        readonly name: string;
        readonly status: string;
        readonly busy: boolean;
      }[];
    }>(receipt.response.path);
    for (const index of [1, 2]) {
      const matches = response.runners.filter(
        (runner) => runner.name === `oseo-mac-${index}`,
      );
      assert.equal(matches.length, 1);
      assert.equal(matches[0]!.status, "online");
      assert.equal(matches[0]!.busy, false);
    }
    this.#raw.push(
      fileIdentity(join(this.#input.directory, stem + ".receipt.json")),
      receipt.response,
    );
  }

  async #restore(): Promise<void> {
    const start = this.#commands.length;
    await this.#checkPlists();
    for (const index of this.#stopped) {
      try {
        await this.#ok("restore", [
          "/usr/bin/sudo",
          "-n",
          "/bin/launchctl",
          "bootstrap",
          "system",
          plist(index),
        ]);
        this.#stopped.delete(index);
      } catch (error) {
        this.#uncertain = true;
        throw error;
      }
    }
    await this.#listeners("restore", start);
    await this.#checkPlists();
    await this.#online();
  }

  /** Open only immediately before S; no UUID content is requested here. */
  async beforeCollector(): Promise<void> {
    if (this.#input.parent.host.target === "macos-aarch64") {
      assert.equal(this.#input.parent.host.uid, 501);
      const named = await this.#ok("mac-host", ["/bin/hostname"]);
      assert.match(named.output.trim(), /^mac-mini-m6(?:\.local)?$/u);
      const start = this.#commands.length;
      await this.#checkPlists();
      await this.#listeners("baseline", start);
      return;
    }
    await this.#uuidAnchor();
    const metadata = await this.#ok("uuid-original", [
      "/usr/bin/stat",
      "-Lc",
      "%d:%i:%F:%u:%g:%a",
      "--",
      uuid,
    ]);
    assert.match(metadata.output.trim(), /^\d+:\d+:regular file:0:0:400$/u);
    this.#uuidIdentity = metadata.output.trim().replace(/:400$/u, "");
    this.#uuidMayBeOpen = true;
    await this.#ok("uuid-open", [
      "/usr/bin/sudo",
      "-N",
      "-n",
      "/usr/bin/chmod",
      "0444",
      "--",
      uuid,
    ]);
    const opened = await this.#ok("uuid-opened", [
      "/usr/bin/stat",
      "-Lc",
      "%d:%i:%F:%u:%g:%a",
      "--",
      uuid,
    ]);
    assert.equal(opened.output.trim(), this.#uuidIdentity + ":444");
  }

  /** Only the caller's definitely-never-started S fence permits this path. */
  async restoreWithoutReader(): Promise<void> {
    if (this.#uuidMayBeOpen) await this.#restoreUuid();
  }

  async #restoreUuid(): Promise<void> {
    assert.equal(this.#uncertain, false, "Original terminal unknown");
    assert.ok(this.#uuidIdentity);
    await this.#uuidAnchor();
    const before = await this.#ok("uuid-before-restore", [
      "/usr/bin/stat",
      "-Lc",
      "%d:%i:%F:%u:%g:%a",
      "--",
      uuid,
    ]);
    assert.equal(before.output.trim(), this.#uuidIdentity + ":444");
    await this.#ok("uuid-restore", [
      "/usr/bin/sudo",
      "-N",
      "-n",
      "/usr/bin/chmod",
      "0400",
      "--",
      uuid,
    ]);
    const restored = await this.#ok("uuid-restored", [
      "/usr/bin/stat",
      "-Lc",
      "%d:%i:%F:%u:%g:%a",
      "--",
      uuid,
    ]);
    assert.equal(restored.output.trim(), this.#uuidIdentity + ":400");
    this.#uuidMayBeOpen = false;
  }

  /** Reader terminal precedes restoration; P cleanup is a separate decision. */
  async afterCollector(): Promise<void> {
    const terminalPath = join(
      this.#input.parent.output,
      "reader-terminal.json",
    );
    assert.ok(existsSync(terminalPath), "Actual reader close not confirmed");
    const terminalOriginal = readKernelControl<{
      readonly original: FileIdentity;
      readonly summary: object;
    }>(terminalPath);
    assert.deepEqual(
      fileIdentity(terminalOriginal.original.path),
      terminalOriginal.original,
    );
    // S's own finish.json is unframed; the terminal above is a frame.
    const finish = readKernelOriginalJson<{
      readonly summary: object;
      readonly finalChildren: readonly {
        readonly reaped: boolean;
        readonly groupAbsent: boolean;
      }[];
    }>(terminalOriginal.original.path);
    assert.deepEqual(finish.summary, terminalOriginal.summary);
    for (const child of finish.finalChildren)
      assert.ok(child.reaped && child.groupAbsent);
    const closed = join(this.#input.parent.output, "reader-closed.json");
    if (this.#input.parent.host.target === "linux-x86_64-gnu") {
      await this.#restoreUuid();
    } else assert.equal(this.#stopped.size, 0, "Mac restore incomplete");
    assert.ok(existsSync(closed), "Raw adjudication failed after reader close");
    assert.equal(
      existsSync(join(this.#input.parent.output, "failed.json")),
      false,
      "Parent failed; external acceptance blocked",
    );
    const envelope = fileIdentity(closed);
    const readerClosed = this.#readerClosed(closed, terminalOriginal);
    for (const pin of this.#raw) requireKernelOriginal(pin);
    const receipt = await waitKernelControl<{
      readonly allocation: FileIdentity;
      readonly readerClosed: FileIdentity;
      readonly commandOriginals: readonly FileIdentity[];
    }>(
      this.#input.directory,
      "external-final-acceptance.json",
      this.#input.responseMs,
      this.#input.signal,
    );
    assert.deepEqual(receipt.allocation, this.#input.allocation);
    assert.deepEqual(receipt.readerClosed, envelope);
    assert.deepEqual(receipt.commandOriginals, this.#raw);
    // Acceptance names envelopes only; replay their parts and interiors again.
    assert.deepEqual(fileIdentity(closed), envelope);
    assert.deepEqual(
      this.#readerClosed(closed, terminalOriginal),
      readerClosed,
    );
    for (const pin of this.#raw) requireKernelOriginal(pin);
  }

  /** Replay the complete reader-close payload and its raw inventory. */
  #readerClosed(
    path: string,
    terminal: { readonly original: FileIdentity; readonly summary: object },
  ): KernelReaderClosed {
    const closed = readKernelControl<KernelReaderClosed>(path);
    assert.deepEqual(Object.keys(closed).toSorted(), [
      "escapedDescendantCleanup",
      "externalRootAcceptance",
      "linuxModeRestoration",
      "raw",
      "summary",
    ]);
    assert.equal(closed.externalRootAcceptance, "required");
    assert.equal(
      closed.escapedDescendantCleanup,
      "requires original Root evidence",
    );
    assert.equal(
      closed.linuxModeRestoration,
      "external Root after actual reader close",
    );
    assert.deepEqual(closed.summary, terminal.summary);
    assert.ok(Array.isArray(closed.raw) && closed.raw.length > 0);
    const retained = (pin: FileIdentity): boolean =>
      closed.raw.some((item) => isDeepStrictEqual(item, pin));
    assert.ok(retained(terminal.original), "Reader terminal not retained");
    if (this.#input.parent.child.lifetime) {
      const lifetime = join(this.#input.parent.output, "lifetime");
      for (const pin of requireKernelLifetimeCleanup(lifetime))
        assert.ok(retained(pin), "Helper cleanup not retained");
    }
    for (const pin of closed.raw) requireKernelOriginal(pin);
    return closed;
  }

  async #diagnose(request: ComparisonRequest): Promise<void> {
    const stem = "diagnosis";
    writeKernelControl(join(this.#input.directory, stem + ".request.json"), {
      taskId: this.#input.taskId,
      host: this.#input.parent.host,
      request,
    });
    if (this.#input.transport === "native-parent") {
      const receipt = await produceKernelRootDiagnosis(
        request,
        join(this.#input.directory, "diagnosis-raw"),
        this.#input.parent.host,
      );
      writeKernelControl(
        join(this.#input.directory, stem + ".receipt.json"),
        receipt,
      );
    }
    const receipt = await waitKernelControl<KernelDiagnosisReceipt>(
      this.#input.directory,
      stem + ".receipt.json",
      this.#input.responseMs,
      this.#input.signal,
    );
    this.#raw.push(
      ...replayKernelDiagnosis(receipt, request, this.#input.parent.host),
    );
    this.#raw.push(
      fileIdentity(join(this.#input.directory, stem + ".receipt.json")),
    );
  }

  /** H receives proofs only after original commands and controls replay. */
  operations(): KernelParentOperations {
    const proof = (request: ComparisonRequest): BoundaryProof => ({
      requestId: request.id,
      status: "complete",
      raw: [...this.#raw],
    });
    return {
      diagnose: async (request) => {
        assert.ok(this.#raw.length > 0, "Collector preparation absent");
        await this.#diagnose(request);
        return proof(request);
      },
      admit: async (request, purpose) => {
        await this.#evidence(request, purpose);
        return { ...proof(request), authority: "Root", purpose };
      },
      exclude: async (request, purpose) => {
        await this.#evidence(request, purpose);
        const start = this.#commands.length;
        if (this.#input.parent.host.target === "macos-aarch64") {
          await this.#checkPlists();
          for (const index of [1, 2]) {
            try {
              const stopped = await this.#command("stop", [
                "/usr/bin/sudo",
                "-n",
                "/bin/launchctl",
                "bootout",
                service(index),
              ]);
              const observed = await this.#command("absence", [
                "/usr/bin/sudo",
                "-n",
                "/bin/launchctl",
                "print",
                service(index),
              ]);
              if (observed.record.status !== 0) {
                assert.match(
                  readFileSync(
                    join(observed.record.directory, observed.record.stderr),
                    "utf8",
                  ),
                  /Could not find service/u,
                );
                this.#stopped.add(index);
              }
              assert.equal(stopped.record.status, 0, "Partial bootout");
              assert.ok(this.#stopped.has(index), "Service remains active");
            } catch (error) {
              if (!this.#uncertain) await this.#restore();
              throw error;
            }
          }
          await this.#listeners("stop", start);
        }
        const opened = {
          ...proof(request),
          physicalHost: this.#input.parent.host.hardware,
          accounts: this.#input.parent.child.comparison.accounts,
          startedMs: Date.now(),
          state: "monitoring" as const,
        };
        return {
          opened,
          finish: async (bounds) => {
            await this.#evidence(request, purpose, bounds);
            if (this.#stopped.size) await this.#restore();
            return {
              ...proof(request),
              ...bounds,
              physicalHost: opened.physicalHost,
              accounts: opened.accounts,
              coverage: "whole-window" as const,
            };
          },
        };
      },
      finalize: async (request, failure) => {
        assert.equal(this.#stopped.size, 0, "Service restoration pending");
        if (failure) throw new Error(failure);
        return proof(request);
      },
      listeners: async () => this.#snapshot,
    };
  }
}

/** Root runs this only after source/QA admission in its existing session. */
export async function runKernelRootOperator(
  input: KernelOperatorAllocation,
  channel: Readable,
): Promise<void> {
  for (const source of [
    input.parent.source,
    input.parent.collector,
    input.parent.supervisor,
  ])
    verifyKernelSource(source);
  if (input.parent.child.lifetime)
    verifyKernelSource(input.parent.child.lifetime.linuxLifetime.observer);
  if (input.parent.host.target === "linux-x86_64-gnu")
    assert.ok(
      input.parent.child.lifetime,
      "Kernel lifetime allocation required",
    );
  const operator = new KernelRootOperator(input);
  let collectorMayExist = false;
  try {
    await runKernelRootParent(
      input.parent,
      operator.operations(),
      channel,
      undefined,
      {
        beforeCollector: () => operator.beforeCollector(),
        startingCollector: () => {
          collectorMayExist = true;
        },
      },
    );
  } catch (error) {
    try {
      if (collectorMayExist) await operator.afterCollector();
      else await operator.restoreWithoutReader();
    } catch (recovery) {
      throw new AggregateError(
        [error, recovery],
        "Kernel failure and restoration/adjudication failure",
        { cause: recovery },
      );
    }
    throw error;
  }
  await operator.afterCollector();
}

/** Fixed command set for the already allocated Root/manual native session. */
export function requireKernelOperatorArgv(
  kind: string,
  argv: readonly string[],
): void {
  const expected: readonly (readonly string[])[] = [
    ["/bin/hostname"],
    ["/usr/bin/stat", "-Lc", "%d:%i:%F:%u:%g:%a", "--", uuid],
    ["/usr/bin/readlink", "-e", "--", uuid],
    ["/usr/bin/cat", "/proc/sys/kernel/random/boot_id"],
    ...["0444", "0400"].map((mode) => [
      "/usr/bin/sudo",
      "-N",
      "-n",
      "/usr/bin/chmod",
      mode,
      "--",
      uuid,
    ]),
    ...[1, 2].flatMap((index) => [
      ["/usr/bin/sudo", "-n", "/bin/launchctl", "print", service(index)],
      ["/usr/bin/sudo", "-n", "/bin/launchctl", "bootout", service(index)],
      [
        "/usr/bin/sudo",
        "-n",
        "/bin/launchctl",
        "bootstrap",
        "system",
        plist(index),
      ],
      ["/usr/bin/stat", "-f", "%d:%i:%HT:%u:%g:%Lp", plist(index)],
      ["/usr/bin/shasum", "-a", "256", plist(index)],
    ]),
  ];
  const identity =
    kind === "listener-identity" &&
    argv.length === 5 &&
    argv[0] === "/bin/ps" &&
    argv[1] === "-p" &&
    /^\d+$/u.test(argv[2]!) &&
    argv[3] === "-o" &&
    argv[4] === "lstart=,uid=,ppid=,comm=";
  assert.ok(
    identity ||
      expected.some((item) => JSON.stringify(item) === JSON.stringify(argv)),
    "Unallocated Root command",
  );
}

/** Root invokes this on the allocated host through its existing session. */
export async function produceKernelOperatorCommand(
  request: KernelOperatorCommand["request"],
  directory: string,
  timeoutMs: number,
): Promise<KernelOperatorCommand> {
  requireKernelDirectory(directory);
  requireKernelOperatorArgv(request.kind, request.argv);
  assert.equal(process.getuid!(), request.host.uid);
  assert.equal(process.umask(), 0o077, "Root raw producer requires umask077");
  const run = launch(
    directory,
    "command",
    request.argv,
    "/",
    {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      LANG: "C",
      LC_ALL: "C",
      TZ: "UTC",
    },
    Buffer.alloc(0),
    timeoutMs,
  );
  const record = await run.done;
  const result = { request, record };
  writeKernelControl(join(directory, "operator-terminal.json"), result);
  return result;
}

/** Original P discovery and required tool pins; discovery is not profiling. */
export interface KernelDiagnosisReceipt {
  readonly request: ComparisonRequest;
  readonly host: KernelParentAllocation["host"];
  readonly discovery: FileIdentity;
  readonly tools: readonly FileIdentity[];
}

/** Root consumes actual P discovery records rather than a readiness boolean. */
export function replayKernelDiagnosis(
  receipt: KernelDiagnosisReceipt,
  request: ComparisonRequest,
  host: KernelParentAllocation["host"],
): readonly FileIdentity[] {
  assert.deepEqual(receipt.request, request);
  assert.deepEqual(receipt.host, host);
  assert.deepEqual(fileIdentity(receipt.discovery.path), receipt.discovery);
  // P writes discovery.json and each command record whole, never as frames.
  const discovery = readKernelOriginalJson<{
    readonly kind: string;
    readonly acceptance: string;
    readonly completed: boolean;
    readonly interrupted: string | null;
    readonly platform: string;
    readonly architecture: string;
    readonly commands: readonly (RunRecord & {
      readonly toolPath: string | null;
      readonly stdoutBase64: string;
      readonly stderrBase64: string;
    })[];
  }>(receipt.discovery.path);
  const mac = host.target === "macos-aarch64";
  const platform = mac ? "darwin" : "linux";
  assert.equal(discovery.kind, "profiling-tool-discovery");
  assert.equal(discovery.acceptance, "unverified");
  assert.equal(discovery.completed, true);
  assert.equal(discovery.interrupted, null);
  assert.equal(discovery.platform, platform);
  assert.equal(discovery.architecture, mac ? "arm64" : "x64");
  const plan = profilingProbes(platform);
  assert.equal(discovery.commands.length, plan.length);
  for (const [index, command] of discovery.commands.entries()) {
    assert.equal(command.directory, dirname(receipt.discovery.path));
    assert.equal(command.stdout, `${index}.stdout`);
    assert.equal(command.stderr, `${index}.stderr`);
    assert.deepEqual(command.argv, [
      command.toolPath ?? plan[index]![0]!,
      ...plan[index]!.slice(1),
    ]);
    assert.equal(command.timedOut, false);
    assert.equal(command.groupGone, true);
    const {
      toolPath: _tool,
      stdoutBase64,
      stderrBase64,
      ...original
    } = command;
    assert.deepEqual(
      readKernelOriginalJson(join(command.directory, String(index) + ".json")),
      original,
    );
    for (const [name, expected] of [
      [command.stdout, stdoutBase64],
      [command.stderr, stderrBase64],
    ]) {
      assert.equal(
        readFileSync(join(command.directory, name!), "base64"),
        expected,
      );
    }
  }
  assert.equal(receipt.tools.length, 2);
  assert.equal(
    receipt.tools[0]!.path,
    discovery.commands[mac ? 9 : 2]!.toolPath,
  );
  for (const pin of receipt.tools)
    assert.deepEqual(fileIdentity(pin.path), pin);
  return [
    ...profileInventory(dirname(receipt.discovery.path)),
    ...receipt.tools,
  ];
}

/** Root invokes the existing P discovery in its allocated native parent. */
export async function produceKernelRootDiagnosis(
  request: ComparisonRequest,
  directory: string,
  host: KernelParentAllocation["host"],
): Promise<KernelDiagnosisReceipt> {
  assert.equal(process.getuid!(), host.uid);
  assert.equal(process.umask(), 0o077);
  const mac = host.target === "macos-aarch64";
  assert.equal(process.platform, mac ? "darwin" : "linux");
  assert.equal(process.arch, mac ? "arm64" : "x64");
  const tools = (
    mac ? ["/usr/bin/sample", "/usr/bin/dwarfdump"] : ["gdb", "readelf"]
  ).map((name) => {
    const path = executablePath(name);
    assert.ok(path, `Required profiling tool missing: ${name}`);
    return fileIdentity(path);
  });
  await discoverProfilingTools(directory);
  return {
    request,
    host,
    tools,
    discovery: fileIdentity(join(directory, "discovery.json")),
  };
}
