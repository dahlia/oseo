/* eslint-disable no-await-in-loop -- Ordered phases and cleanup are serial. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type { Readable } from "node:stream";
import { fileIdentity } from "../../perf-profile-capture.ts";
import type { FileIdentity } from "../../perf-profile-capture.ts";
import type {
  ComparisonBoundaries,
  ExclusionMonitor,
  BoundaryProof,
  ComparisonRequest,
} from "../ordered-comparison.ts";
import type * as S from "../native-host-collector.ts";
import { requireKernelLifetimeCleanup, RootLifetime } from "./lifetime.ts";
import type { KernelMacEvent } from "./mac-timeline.ts";
import { KernelCollectorReader } from "./collector.ts";
import type {
  KernelHost,
  KernelProcess,
  KernelListenerObservation,
} from "./collector.ts";
import {
  readKernelControl,
  readKernelOriginalJson,
  waitKernelControl,
  writeKernelControl,
  writeKernelAllocation,
} from "./control.ts";
import type { KernelControl } from "./control.ts";
import type { KernelChildAllocation } from "./child.ts";
import {
  loadKernelCollector,
  requireKernelDirectory,
  verifyKernelSource,
} from "./source.ts";
import type { KernelSource } from "./source.ts";

import type {
  KernelSupervisorApi,
  KernelSupervisorRequest,
} from "./supervisor.ts";

function supervisorPin({ path, bytes, sha256, mode }: FileIdentity) {
  return { path, bytes, sha256, mode };
}

/** Exact direct Root allocation; no callback success is a signed origin. */
export interface KernelParentAllocation {
  readonly source: KernelSource;
  readonly collector: KernelSource;
  readonly collectorAcceptance: readonly FileIdentity[];
  readonly supervisor: KernelSource;
  readonly request: KernelSupervisorRequest;
  readonly child: Omit<
    KernelChildAllocation,
    "parentPid" | "channel" | "source"
  >;
  readonly host: KernelHost;
  readonly rootProcess: KernelProcess;
  readonly background: readonly KernelProcess[];
  readonly bounds: S.CollectorBounds;
  readonly output: string;
}

/**
 * Root owns actual ingress/service operations and their original evidence.
 * H envelopes do not replace those operations or authenticate Root files.
 */
export interface KernelParentOperations extends Omit<
  ComparisonBoundaries,
  "profile"
> {
  /** Original print/ps records; empty only while both services are held. */
  readonly listeners: () => Promise<{
    readonly observations: readonly KernelListenerObservation[];
    readonly event: Omit<KernelMacEvent, "listeners">;
  }>;
}

/** Injectable offline seams preserve the actual H/S/supervisor contracts. */
export interface KernelParentRuntime {
  readonly verifySource: typeof verifyKernelSource;
  readonly loadSupervisor: (
    source: KernelSource,
  ) => Promise<KernelSupervisorApi>;
  readonly loadCollector: typeof loadKernelCollector;
  readonly reader: (
    ...args: ConstructorParameters<typeof KernelCollectorReader>
  ) => Pick<
    KernelCollectorReader,
    | "consumeThrough"
    | "requireQuiet"
    | "observeMacListeners"
    | "finish"
    | "timeline"
    | "lifetime"
  >;
}

async function loadSupervisor(
  source: KernelSource,
): Promise<KernelSupervisorApi> {
  verifyKernelSource(source);
  assert.equal(source.commit, "ff355628258a65c9af55323673085c8115e2f556");
  const supervisorEntry = join(source.root, "supervisor.ts");
  assert.equal(
    fileIdentity(supervisorEntry).sha256,
    "00a7925e9edc25b2b33d1b52340ee7273255e1645ecac8358769e9854e6388a6",
  );
  // SAFETY: the normal supervisor commit, full closure and entry hash match.
  const supervisor = (await import(
    pathToFileURL(supervisorEntry).href
  )) as KernelSupervisorApi;
  return supervisor;
}

const actualRuntime: KernelParentRuntime = {
  verifySource: verifyKernelSource,
  loadSupervisor,
  loadCollector: loadKernelCollector,
  reader: (...args) => new KernelCollectorReader(...args),
};

/** Private lifecycle fences; attempted S startup is never presumed absent. */
export interface KernelParentLifecycle {
  readonly beforeCollector: () => Promise<void>;
  readonly startingCollector: () => void;
}

/** Keep S independent; offline injection grants no admission. */
export async function runKernelRootParent(
  input: KernelParentAllocation,
  root: KernelParentOperations,
  channel: Readable,
  runtime: KernelParentRuntime = actualRuntime,
  lifecycle?: KernelParentLifecycle,
): Promise<void> {
  runtime.verifySource(input.source);
  if (input.child.lifetime) {
    const lifetime = input.child.lifetime;
    assert.equal(input.host.target, "linux-x86_64-gnu");
    assert.deepEqual(lifetime.host, input.host);
    assert.deepEqual(lifetime.env, input.request.env);
    assert.equal(lifetime.output, input.output);
    assert.equal(lifetime.runId, input.child.comparison.measurement.runId);
    assert.equal(
      lifetime.manifestSha256,
      fileIdentity(join(input.child.comparison.directory, "built.json")).sha256,
    );
    assert.equal(lifetime.channelResponseMs, input.child.responseMs);
    assert.equal(lifetime.limits.timeoutMs, input.request.limits.timeoutMs);
    runtime.verifySource(lifetime.linuxLifetime.observer);
    for (const pin of [
      lifetime.linuxLifetime.python,
      ...lifetime.linuxLifetime.observer.files,
    ]) {
      assert.ok(
        input.request.inputs.some(
          (file) =>
            file.path === pin.path &&
            file.sha256 === pin.sha256 &&
            file.bytes === pin.bytes &&
            file.mode === pin.mode,
        ),
        "Supervisor omitted lifetime dependency closure",
      );
    }
  }
  const supervisor = await runtime.loadSupervisor(input.supervisor);
  const api = await runtime.loadCollector(
    input.collector,
    input.collectorAcceptance,
  );
  assert.equal(input.rootProcess.pid, process.pid);
  assert.equal(input.host.uid, process.getuid!());
  assert.equal(input.request.cwd, input.source.root);
  assert.equal(
    input.request.entry.path,
    join(input.source.root, "tools/perf/kernel-root/child.ts"),
  );
  assert.equal(input.request.source.root, input.source.root);
  assert.equal(input.request.source.head, input.source.commit);
  assert.equal(input.request.source.tree, input.source.tree);
  assert.equal(input.request.abortOnStdinEnd, true);
  assert.ok(isAbsolute(input.output));
  requireKernelDirectory(dirname(input.output));
  for (const source of [input.source, input.collector, input.supervisor]) {
    const inside = relative(source.root, input.output);
    const contains = relative(input.output, source.root);
    assert.ok(inside.startsWith("../") || isAbsolute(inside));
    assert.ok(contains.startsWith("../") || isAbsolute(contains));
  }
  assert.equal(
    input.child.comparison.physicalHost.toLowerCase(),
    input.host.hardware.toLowerCase(),
  );
  assert.equal(
    Object.hasOwn(input.child.comparison, "correctnessExecutor"),
    false,
  );
  assert.equal(
    Object.hasOwn(input.child.comparison, "measurementExecutor"),
    false,
  );
  mkdirSync(input.output, { mode: 0o700 });
  requireKernelDirectory(input.output);
  const controlDirectory = join(input.output, "control");
  mkdirSync(controlDirectory, { mode: 0o700 });
  const childPath = join(input.output, "child.json");
  writeKernelAllocation(childPath, {
    ...input.child,
    source: input.source,
    parentPid: process.pid,
    channel: controlDirectory,
  });
  const childPin = fileIdentity(childPath);
  const request = {
    ...input.request,
    argv: [
      input.request.node.path,
      input.request.entry.path,
      childPath,
      childPin.sha256,
    ],
    inputs: [...input.request.inputs, supervisorPin(childPin)],
  };
  for (const file of input.source.files) {
    assert.ok(
      [request.entry, ...request.inputs].some(
        (entry) =>
          entry.path === file.path &&
          entry.sha256 === file.sha256 &&
          entry.bytes === file.bytes &&
          entry.mode === file.mode,
      ),
      "Supervisor omitted caller closure",
    );
  }
  // All module loads, allocation validation and control setup precede opening.
  await lifecycle?.beforeCollector();
  const stop = new AbortController();
  const lost = () => stop.abort(new Error("Root/SSH channel ended"));
  const interrupted = () => stop.abort(new Error("Kernel parent interrupted"));
  channel.once("end", lost);
  channel.once("error", lost);
  channel.resume();
  process.once("SIGTERM", interrupted);
  process.once("SIGINT", interrupted);
  if (channel.readableEnded || channel.destroyed) lost();
  const collectorDirectory = join(input.output, "collector");
  lifecycle?.startingCollector();
  const collector = await api.startNativeHostCollector({
    directory: collectorDirectory,
    bounds: input.bounds,
    logicalSlots: input.child.comparison.accounts,
    origin: { kind: "local-read" },
    // Workload abort must not stop observations needed for escaped cleanup.
  });
  const reader = runtime.reader(
    api,
    input.host,
    input.bounds,
    collectorDirectory,
    input.rootProcess,
    input.background,
  );
  let closing = false;
  const errors: unknown[] = [];
  void collector.finished.then(
    () => {
      if (!closing)
        stop.abort(new Error("Collector ended before caller finalization"));
    },
    (error) => stop.abort(error),
  );
  let active: ExclusionMonitor | null = null;
  const activeMonitor = (): ExclusionMonitor | null => active;
  let activeRequest: ComparisonRequest | null = null;
  let window = false;
  let operating = false;
  let monitoringTask: Promise<void> = Promise.resolve();
  const listeners = async (): Promise<void> => {
    const snapshot = await root.listeners();
    reader.observeMacListeners(snapshot.observations, snapshot.event);
  };
  let sequence = 0;
  const phases = [
    "diagnosis",
    "profile-admission",
    "profile-exclusion",
    "profile-exclusion-close",
    "timing-admission",
    "timing-exclusion",
    "timing-exclusion-close",
    "finalize",
  ];
  let run: ReturnType<KernelSupervisorApi["supervise"]> | null = null;
  let terminal: Awaited<ReturnType<KernelSupervisorApi["supervise"]>> | null =
    null;
  const serving = async (): Promise<void> => {
    while (!stop.signal.aborted) {
      const name = String(sequence).padStart(3, "0");
      const control = await waitKernelControl<KernelControl>(
        controlDirectory,
        name + ".request.json",
        null,
        stop.signal,
      );
      operating = true;
      await monitoringTask;
      operating = true;
      assert.equal(control.sequence, sequence++);
      assert.equal(control.parentPid, process.pid);
      // SAFETY: this is the pinned supervisor's original private journal;
      // only its spawn identity is used, with an exact PID comparison below.
      const journal = readFileSync(
        join(request.outputRoot, "journal.jsonl"),
        "utf8",
      )
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)) as readonly {
        readonly type: string;
        readonly pid?: number;
      }[];
      const spawn = journal.find((event) => event.type === "spawned");
      assert.ok(spawn);
      assert.equal(control.childPid, spawn.pid);
      if (!(control.phase === "finalize" && control.failure != null)) {
        assert.equal(control.phase, phases[sequence - 1]);
      }
      assert.equal(
        control.request.runId,
        input.child.comparison.measurement.runId,
      );
      assert.equal(
        control.request.manifest.path,
        join(input.child.comparison.directory, "built.json"),
      );
      assert.deepEqual(
        fileIdentity(control.request.manifest.path).sha256,
        control.request.manifest.sha256,
      );
      assert.equal(control.request.source.host.commit, input.source.commit);
      assert.equal(control.request.source.tree, input.source.tree);
      if (sequence === 1 && input.child.lifetime) {
        reader.lifetime = await RootLifetime.bind(
          input.child.lifetime,
          control.childPid,
        );
      }
      let proof: BoundaryProof;
      let checkpoint: S.CollectorCheckpoint | null = null;
      const purpose = control.phase.startsWith("timing") ? "timing" : "profile";
      if (control.phase === "diagnosis")
        proof = await root.diagnose(control.request);
      else if (control.phase.endsWith("-admission"))
        proof = await root.admit(control.request, purpose);
      else if (control.phase.endsWith("-exclusion")) {
        assert.equal(active, null);
        active = await root.exclude(control.request, purpose);
        activeRequest = control.request;
        await listeners();
        window = true;
        if (input.host.target === "macos-aarch64")
          reader.timeline.open(active.opened.startedMs);
        proof = active.opened;
      } else if (control.phase.endsWith("-exclusion-close")) {
        assert.ok(active && control.bounds);
        assert.deepEqual(control.request, activeRequest);
        checkpoint = await collector.checkpoint("after");
        await reader.consumeThrough(checkpoint.sample, true);
        // Root still holds the lifetime connection; only its helper is exempt.
        reader.requireQuiet(control.childPid, reader.lifetime != null);
        if (input.host.target === "macos-aarch64")
          reader.timeline.close(control.bounds.finishedMs);
        proof = await active.finish(control.bounds);
        await listeners();
        active = null;
        activeRequest = null;
        window = false;
      } else {
        assert.equal(control.phase, "finalize");
        assert.equal(active, null);
        checkpoint = await collector.checkpoint("after");
        await reader.consumeThrough(checkpoint.sample, false);
        reader.requireQuiet(control.childPid, reader.lifetime != null);
        proof = await root.finalize(control.request, control.failure);
        if (reader.lifetime) {
          await reader.lifetime.close();
          reader.lifetime = null;
        }
      }
      checkpoint ??= await collector.checkpoint(
        control.phase.endsWith("close") || control.phase === "finalize"
          ? "after"
          : "before",
      );
      await reader.consumeThrough(checkpoint.sample, window);
      assert.equal(proof.requestId, control.request.id);
      assert.equal(proof.status, "complete");
      assert.ok(proof.raw.length > 0);
      for (const raw of proof.raw) {
        const actual = fileIdentity(raw.path);
        assert.equal(actual.sha256, raw.sha256);
        assert.equal(actual.bytes, raw.bytes);
      }
      writeKernelControl(join(controlDirectory, name + ".response.json"), {
        control,
        proof,
      });
      operating = false;
      if (control.phase === "finalize") return;
    }
  };
  let monitoring: ReturnType<typeof setInterval> | null = null;
  let service: Promise<void> | null = null;
  try {
    await collector.ready;
    await listeners();
    monitoring = setInterval(() => {
      if (operating) return;
      operating = true;
      monitoringTask = (async () => {
        try {
          // A later serial sample establishes that the previous write finished.
          const count = readdirSync(collectorDirectory).filter((name) =>
            /^sample-\d{8}\.json$/u.test(name),
          ).length;
          await reader.consumeThrough(count - 2, window);
        } catch (error) {
          errors.push(error);
          stop.abort(error);
        } finally {
          operating = false;
        }
      })();
    }, input.bounds.intervalMs);
    service = serving().catch((error) => {
      errors.push(error);
      stop.abort(error);
    });
    run = supervisor.supervise(request, { signal: stop.signal });
    const result = await run;
    terminal = result;
    if (input.child.lifetime && result.success)
      requireKernelLifetimeCleanup(join(input.output, "lifetime"));
    if (!result.success) stop.abort(new Error("Owned kernel child failed"));
    if (sequence !== phases.length)
      stop.abort(new Error("Child ended before all control phases"));
    await service;
    assert.equal(result.success, true);
    assert.ok(
      result.cleanup?.leaderExited &&
        result.cleanup.groupEmptyAtFinalProbe &&
        result.cleanup.streamsClosed,
    );
    assert.equal(sequence, phases.length);
    assert.equal(active, null);
  } catch (error) {
    errors.push(error);
    stop.abort(error);
    if (run) {
      try {
        terminal = await run;
      } catch (failure) {
        errors.push(failure);
      }
    }
    if (service) await service;
  } finally {
    if (monitoring) clearInterval(monitoring);
    await monitoringTask;
    reader.lifetime?.destroy();
    reader.lifetime = null;
    closing = true;
    try {
      const recovering = activeMonitor();
      if (recovering) {
        assert.ok(
          terminal?.cleanup?.leaderExited &&
            terminal.cleanup.groupEmptyAtFinalProbe &&
            terminal.cleanup.streamsClosed,
          "Supervisor cleanup unknown; restoration requires Root recovery",
        );
        const quiet = await collector.checkpoint("after");
        await reader.consumeThrough(quiet.sample, false);
        reader.requireQuiet();
        await recovering.finish({
          startedMs: recovering.opened.startedMs,
          finishedMs: Date.now(),
        });
        await listeners();
        active = null;
      }
      const checkpoint = await collector.checkpoint("after");
      // Close in this continuation before consumption or another await.
      const closed = collector.close(
        errors.length ? "workload-failed" : "caller-close",
      );
      const summary = await closed;
      retainKernelReaderTerminal(collectorDirectory, input.output, summary);
      await reader.consumeThrough(checkpoint.sample, false);
      reader.requireQuiet();
      const raw = [...(await reader.finish(summary))];
      if (input.child.lifetime)
        raw.push(
          ...requireKernelLifetimeCleanup(join(input.output, "lifetime")),
        );
      writeKernelControl(join(input.output, "reader-closed.json"), {
        raw,
        summary,
        externalRootAcceptance: "required",
        escapedDescendantCleanup: "requires original Root evidence",
        linuxModeRestoration: "external Root after actual reader close",
      });
    } catch (error) {
      errors.push(error);
      try {
        const summary = await collector.close("workload-failed");
        retainKernelReaderTerminal(collectorDirectory, input.output, summary);
      } catch (failure) {
        errors.push(failure);
      }
    }
    channel.off("end", lost);
    channel.off("error", lost);
    process.off("SIGTERM", interrupted);
    process.off("SIGINT", interrupted);
    channel.pause();
  }
  if (errors.length) {
    writeKernelControl(join(input.output, "failed.json"), {
      errors: errors.map(String),
      recovery:
        "Root must verify reader close, escaped descendants and restoration",
    });
    throw new AggregateError(errors, "Kernel Root parent incomplete");
  }
}

/** Reader termination stays separate from raw adjudication and P cleanup. */
export function retainKernelReaderTerminal(
  directory: string,
  output: string,
  summary: S.CollectorSummary,
): void {
  const path = join(directory, "finish.json");
  // S wrote this original whole; only the retained terminal is a frame.
  const original = readKernelOriginalJson<{
    readonly summary: S.CollectorSummary;
    readonly finalChildren: readonly {
      readonly reaped: boolean;
      readonly groupAbsent: boolean;
    }[];
  }>(path);
  assert.deepEqual(original.summary, summary);
  for (const child of original.finalChildren)
    assert.ok(child.reaped && child.groupAbsent, "Reader terminal unknown");
  const terminal = { original: fileIdentity(path), summary };
  const destination = join(output, "reader-terminal.json");
  try {
    const prior = readKernelControl(destination);
    assert.deepEqual(prior, terminal);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      writeKernelControl(destination, terminal);
    else throw error;
  }
}
