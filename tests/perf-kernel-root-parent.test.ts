import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { fileIdentity } from "../tools/perf-profile-capture.ts";
import type * as S from "../tools/perf/native-host-collector.ts";
import type { ComparisonRequest } from "../tools/perf/ordered-comparison.ts";
import {
  retainKernelReaderTerminal,
  runKernelRootParent,
} from "../tools/perf/kernel-root/parent.ts";
import type {
  KernelParentAllocation,
  KernelParentRuntime,
  KernelParentOperations,
} from "../tools/perf/kernel-root/parent.ts";
import {
  readKernelControl,
  waitKernelControl,
  writeKernelControl,
} from "../tools/perf/kernel-root/control.ts";
import {
  KernelRootOperator,
  requireKernelOperatorArgv,
} from "../tools/perf/kernel-root/operator.ts";
import type {
  KernelOperatorAllocation,
  KernelOperatorCommand,
} from "../tools/perf/kernel-root/operator.ts";
import { KernelCollectorReader } from "../tools/perf/kernel-root/collector.ts";
import { profilingProbes } from "../tools/perf-profile.ts";
import { profileInventory } from "../tools/perf/kernel-root/profile-replay.ts";
import type { RunRecord } from "../tools/perf-profile-process.ts";
import type {
  BoundaryProof,
  WindowBounds,
} from "../tools/perf/ordered-comparison.ts";
import type { KernelResponse } from "../tools/perf/kernel-root/control.ts";
import type { RootLifetime } from "../tools/perf/kernel-root/lifetime.ts";
import { KernelMacTimeline } from "../tools/perf/kernel-root/mac-timeline.ts";

/** Private fixtures require POSIX ownership and mode semantics. */
const posixFixture = {
  skip:
    process.platform === "linux" || process.platform === "darwin"
      ? false
      : "requires POSIX ownership and private file modes",
};

function unused(): never {
  throw new Error("unused S fixture API");
}

/** One finish.json that actual S wrote for a long run, and its summary. */
interface SFinish {
  readonly bytes: Buffer;
  readonly summary: S.CollectorSummary;
}

let sFinish: Promise<SFinish> | undefined;

/**
 * Run S's own closed fixture collector long enough that its unframed
 * finish.json, one entry per owned probe child, exceeds a control frame.
 * The bytes are S's; fixtures publish them unchanged, as S's writer does.
 */
async function actualSFinish(): Promise<SFinish> {
  sFinish ??= (async () => {
    const local = new URL(
      "../tools/perf/native-host-collector.ts",
      import.meta.url,
    );
    const injected = process.env.OSEO_KERNEL_ROOT_CONTRACT_SOURCE;
    assert.ok(
      existsSync(local) || injected,
      "Actual S is not integrated and no read-only contract source was " +
        "assigned",
    );
    const url = existsSync(local) ? local : pathToFileURL(injected!);
    // SAFETY: offline use of the actual S fixture runner; no source admission.
    const api = (await import(url.href)) as typeof S;
    const base = realpathSync(mkdtempSync(join(tmpdir(), "kernel-S-finish-")));
    try {
      const directory = join(base, "collector");
      const collector = await api.startCollectorFixture(
        {
          directory,
          bounds: {
            intervalMs: 1,
            probeTimeoutMs: 5000,
            termGraceMs: 10,
            cleanupMs: 100,
            maxProbeBytes: 1024,
            maxTotalBytes: 1_000_000,
            maxRecords: 1000,
            maxSamples: 540,
            maxProcesses: 100,
            maxGapMs: 60_000,
            maxClockSkewMs: 1000,
          },
          logicalSlots: ["fixture"],
          origin: { kind: "local-read" },
        },
        "bytes",
      );
      const summary = await collector.finished;
      await collector.close("caller-close");
      const path = join(directory, "finish.json");
      const pin = fileIdentity(path);
      assert.equal(pin.mode, 0o600);
      assert.ok(pin.bytes > 65_536, "S finish fits one frame");
      const bytes = readFileSync(path);
      // SAFETY: S's own record; only the terminal fields are checked here.
      const finish = JSON.parse(bytes.toString("utf8")) as {
        readonly summary: S.CollectorSummary;
        readonly finalChildren: readonly {
          readonly reaped: boolean;
          readonly groupAbsent: boolean;
        }[];
      };
      assert.deepEqual(finish.summary, summary);
      assert.equal(finish.finalChildren.length, summary.records);
      assert.ok(
        finish.finalChildren.every(
          (child) => child.reaped && child.groupAbsent,
        ),
      );
      return { bytes, summary };
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  })();
  return await sFinish;
}

/** S's writer: whole JSON, no trailing newline, exclusive create, 0600. */
function writeSOriginal(path: string, bytes: string | Buffer): void {
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
}

/** S's finish for the S-* faults, or a changed copy for their negatives. */
async function sFinishFault(path: string, fault: string): Promise<SFinish> {
  const original = await actualSFinish();
  // SAFETY: S's own record, already checked by actualSFinish().
  const value = JSON.parse(original.bytes.toString("utf8")) as {
    readonly finalChildren: readonly object[];
  };
  if (fault === "S-large-finish-parts") writeKernelControl(path, value);
  else if (fault === "S-large-finish-child") {
    const [first, ...rest] = value.finalChildren;
    writeSOriginal(
      path,
      JSON.stringify({
        ...value,
        finalChildren: [{ ...first, groupAbsent: false }, ...rest],
      }),
    );
  } else {
    writeSOriginal(path, original.bytes);
    if (fault === "S-large-finish-mode") chmodSync(path, 0o644);
  }
  return original;
}

/** Inert producer doubles use actual contracts and private durable IPC. */
async function session(fault: string): Promise<readonly string[]> {
  const baseDirectory = realpathSync(
    mkdtempSync(join(tmpdir(), "kernel-parent-")),
  );
  const directory = join(baseDirectory, "root-allocation-" + "a".repeat(96));
  mkdirSync(directory, { mode: 0o700 });
  const events: string[] = [];
  const sourceRoot = join(directory, "source");
  const outputRoot = join(directory, "supervisor");
  mkdirSync(sourceRoot, { mode: 0o700 });
  mkdirSync(outputRoot, { mode: 0o700 });
  const output = join(directory, "output");
  const rawPath = join(directory, "raw.json");
  writeFileSync(rawPath, "fixture raw", { mode: 0o600 });
  const raw = fileIdentity(rawPath);
  const manifestPath = join(directory, "built.json");
  writeFileSync(manifestPath, "fixture manifest", { mode: 0o600 });
  const manifest = fileIdentity(manifestPath);
  const source = {
    root: sourceRoot,
    commit: "1".repeat(40),
    tree: "2".repeat(40),
    files: [],
  };
  const clock: S.CollectorClock = {
    utc: new Date(0).toISOString(),
    monotonicNs: "0",
  };
  const summary: S.CollectorSummary = {
    assessment: "UNASSESSED",
    rootAdjudication: "required-separately",
    physicalExclusion: "unknown",
    target: "linux-x86_64-gnu",
    start: clock,
    end: clock,
    samples: 1,
    records: 1,
    incompleteRecords: 0,
    rawBytes: 0,
    maxObservationGapMs: 0,
    maxCallbackLatenessMs: 0,
    lateCallbacks: 0,
    diagnostics: [],
  };
  let finished!: (summary: S.CollectorSummary) => void;
  const terminal = new Promise<S.CollectorSummary>((resolve) => {
    finished = resolve;
  });
  let count = 0;
  const collector: S.NativeHostCollector = {
    ready: Promise.resolve(),
    finished: terminal,
    checkpoint: async (phase) => {
      events.push(`checkpoint:${phase}`);
      return {
        phase,
        request: count++,
        requested: clock,
        start: clock,
        end: clock,
        sample: 0,
        firstRecord: 0,
        nextRecord: 1,
        snapshot: {
          path: raw.path,
          sha256: raw.sha256,
          bytes: raw.bytes,
          mode: "0600",
        },
        assessment: "UNASSESSED",
        physicalExclusion: "unknown",
        diagnostics: [],
      };
    },
    close: async () => {
      events.push("reader-close");
      if (fault === "reader-close") throw new Error("close unknown");
      if (fault.startsWith("S-large-finish")) {
        // S's close is idempotent; it publishes finish.json once.
        const path = join(output, "collector", "finish.json");
        const original = existsSync(path)
          ? await actualSFinish()
          : await sFinishFault(path, fault);
        finished(original.summary);
        return original.summary;
      }
      writeFileSync(
        join(output, "collector", "finish.json"),
        JSON.stringify({
          summary,
          finalChildren: [{ reaped: true, groupAbsent: true }],
        }),
        { mode: 0o600 },
      );
      finished(summary);
      return summary;
    },
  };
  // SAFETY: only start is used by this parent orchestration fixture; no OS API.

  const api: typeof S = {
    nativeCollectorTarget: unused,
    nativeCollectorPlan: unused,
    parseCollectorUuid: unused,
    parseCollectorProcesses: unused,
    parseCollectorProcStat: unused,
    parseCollectorCounters: unused,
    compareCollectorPids: unused,
    startCollectorFixture: unused,
    startNativeHostCollector: async () => {
      events.push("collector-start");
      mkdirSync(join(output, "collector"), { mode: 0o700 });
      if (fault === "S-early-terminal") finished(summary);
      return collector;
    },
  };
  const channel = new PassThrough();
  const quiet: [number | undefined, boolean | undefined][] = [];
  const lifetime: Pick<RootLifetime, "close" | "destroy"> = {
    close: async () => {
      events.push("lifetime-close");
    },
    destroy: () => undefined,
  };
  const runtime: KernelParentRuntime = {
    verifySource: () => {
      events.push("source-verify");
      if (fault === "source-drift") throw new Error("source drift");
    },
    loadCollector: async () => {
      if (fault === "pre-S-collector") throw new Error("pre-S module");
      return api;
    },
    reader: () => ({
      // SAFETY: the parent reaches only close and destroy on this binding.
      lifetime: fault === "lifetime-helper" ? (lifetime as RootLifetime) : null,
      timeline: new KernelMacTimeline(),
      observeMacListeners: () => {
        events.push("listeners");
      },
      consumeThrough: async () => {
        events.push("consume");
      },
      requireQuiet: (controlChildPid, activeHelper) => {
        events.push("quiet");
        quiet.push([controlChildPid, activeHelper]);
        if (fault === "P-detached") throw new Error("detached child remains");
      },
      finish: async () => {
        events.push("reader-finish");
        return [raw];
      },
    }),
    loadSupervisor: async () => {
      if (fault === "pre-S-supervisor") throw new Error("pre-S module");
      return {
        supervise: async (request, options) => {
          events.push("supervisor-start");
          const childPid = 12345;
          writeFileSync(
            join(request.outputRoot, "journal.jsonl"),
            JSON.stringify({ type: "spawned", pid: childPid }) + "\n",
          );
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
          try {
            for (const [sequence, phase] of phases.entries()) {
              const name = String(sequence).padStart(3, "0");
              const control = {
                sequence,
                childPid,
                parentPid: process.pid,
                phase,
                request: {
                  id: phase.split("-")[0]!,
                  runId: "fixture",
                  phase,
                  manifest,
                  source: {
                    host: { commit: source.commit },
                    tree: source.tree,
                  },
                },
                bounds: phase.endsWith("close")
                  ? { startedMs: 0, finishedMs: 1 }
                  : null,
                failure: null,
              };
              // A purpose window carries the same original H request at close.
              if (phase.endsWith("close")) {
                const original = JSON.parse(
                  readFileSync(
                    join(
                      output,
                      "control",
                      String(sequence - 1).padStart(3, "0") + ".request.json",
                    ),
                    "utf8",
                  ),
                );
                control.request = original.request;
              }
              if (fault === "parent-loss" && sequence === 1) channel.end();
              writeKernelControl(
                join(output, "control", name + ".request.json"),
                control,
              );
              // eslint-disable-next-line no-await-in-loop -- Ordered IPC.
              await waitKernelControl(
                join(output, "control"),
                name + ".response.json",
                1000,
                options.signal,
              );
            }
            return {
              success: fault !== "supervisor-cleanup",
              cleanup: {
                leaderExited: true,
                groupEmptyAtFinalProbe:
                  fault === "supervisor-cleanup" ? null : true,
                streamsClosed: true,
              },
            };
          } catch {
            return {
              success: false,
              cleanup: {
                leaderExited: true,
                groupEmptyAtFinalProbe: true,
                streamsClosed: true,
              },
            };
          }
        },
      };
    },
  };
  // SAFETY: unconsumed build/measurement fields are inert; actual parent
  // request, host, paths and private protocol are exercised below.
  const input: KernelParentAllocation = {
    source,
    supervisor: source,
    collector: source,
    collectorAcceptance: [raw],
    request: {
      source: { root: sourceRoot, head: source.commit, tree: source.tree },
      node: raw,
      git: raw,
      entry: {
        ...raw,
        path: join(sourceRoot, "tools/perf/kernel-root/child.ts"),
      },
      inputs: [],
      argv: [],
      cwd: sourceRoot,
      outputRoot,
      env: {},
      abortOnStdinEnd: true,
      limits: {
        timeoutMs: 1000,
        termGraceMs: 10,
        cleanupMs: 10,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
        gitTimeoutMs: 1000,
      },
    },
    host: {
      target: "linux-x86_64-gnu",
      hardware: "fixture",
      boot: "boot",
      uid: process.getuid!(),
    },
    rootProcess: {
      pid: process.pid,
      ppid: 1,
      group: process.pid,
      uid: process.getuid!(),
      comm: "node",
      birth: "1",
      birthPrecision: "kernel-ticks",
    },
    background: [],
    bounds: {
      intervalMs: 10000,
      probeTimeoutMs: 1000,
      termGraceMs: 10,
      cleanupMs: 10,
      maxProbeBytes: 1024,
      maxTotalBytes: 65536,
      maxRecords: 100,
      maxSamples: 100,
      maxProcesses: 100,
      maxGapMs: 10000,
      maxClockSkewMs: 10,
    },
    output,
    child: {
      responseMs: 1000,
      lifetime: null,
      comparison: {
        physicalHost: "fixture",
        accounts: ["fixture"],
        measurement: {
          runId: "fixture",
          conditions: {
            power: "fixture",
            backgroundLoad: "fixture",
            cachePolicy: "warm-process-launch",
            notes: "inert offline fixture",
          },
        },
        destination: join(directory, "measurement"),
        directory,
      },
    },
  };
  const proof = (request: ComparisonRequest) => ({
    requestId: request.id,
    status: "complete" as const,
    raw: [raw],
  });
  const root: KernelParentOperations = {
    diagnose: async (request) => proof(request),
    admit: async (request, purpose) => ({
      ...proof(request),
      authority: "Root",
      purpose,
    }),
    exclude: async (request) => {
      events.push("open");
      if (fault === "partial-open") throw new Error("partial open");
      return {
        opened: {
          ...proof(request),
          physicalHost: "fixture",
          accounts: ["fixture"],
          startedMs: 0,
          state: "monitoring",
        },
        finish: async (bounds) => {
          events.push("restore");
          if (fault === "restore") throw new Error("restore failed");
          return {
            ...proof(request),
            ...bounds,
            physicalHost: "fixture",
            accounts: ["fixture"],
            coverage: "whole-window",
          };
        },
      };
    },
    finalize: async (request) => proof(request),
    listeners: async () => ({
      observations: [],
      event: { sequence: 0, kind: "baseline", startedMs: 0, finishedMs: 0 },
    }),
  };
  try {
    if (fault.startsWith("operator")) {
      await operatorFixture(input, directory, fault, events, api);
      return events;
    }
    if (fault.startsWith("pre-S-")) {
      await assert.rejects(
        runKernelRootParent(input, root, channel, runtime, {
          beforeCollector: async () => {
            events.push("uuid-open");
          },
          startingCollector: () => {
            events.push("S-may-exist");
          },
        }),
        /pre-S module/,
      );
      assert.equal(events.includes("uuid-open"), false);
      assert.equal(events.includes("S-may-exist"), false);
      assert.equal(events.includes("collector-start"), false);
      return events;
    }
    if (
      fault === "none" ||
      fault === "lifetime-helper" ||
      fault === "S-large-finish"
    ) {
      await runKernelRootParent(input, root, channel, runtime);
      assert.ok(events.indexOf("reader-close") > events.indexOf("restore"));
      assert.ok(events.indexOf("quiet") < events.indexOf("restore"));
      assert.ok(events.includes("reader-finish"));
      // Two window closes and pre-finalize may exempt only a bound helper;
      // final cleanup after Root's close never does.
      const helper = fault === "lifetime-helper";
      assert.deepEqual(quiet, [
        [12345, helper],
        [12345, helper],
        [12345, helper],
        [undefined, undefined],
      ]);
      if (helper)
        assert.ok(
          events.indexOf("lifetime-close") < events.lastIndexOf("quiet"),
        );
      if (fault === "S-large-finish") {
        // The retained terminal is a private frame naming S's whole original.
        const finish = join(output, "collector", "finish.json");
        assert.ok(fileIdentity(finish).bytes > 65_536);
        assert.equal(existsSync(finish + ".part-000000"), false);
        assert.deepEqual(
          readKernelControl(join(output, "reader-terminal.json")),
          {
            original: fileIdentity(finish),
            summary: (await actualSFinish()).summary,
          },
        );
      }
    } else {
      const expected = new Map([
        ["S-large-finish-child", /Reader terminal unknown/u],
        ["S-large-finish-parts", /parts frame/u],
        ["S-large-finish-mode", /420 !== 384/u],
      ]).get(fault);
      await assert.rejects(
        runKernelRootParent(input, root, channel, runtime),
        (error) =>
          expected == null ||
          (error instanceof AggregateError &&
            error.errors.some((item) => expected.test(String(item)))),
      );
      if (expected)
        assert.equal(existsSync(join(output, "reader-closed.json")), false);
    }
    if (fault !== "source-drift") assert.ok(events.includes("reader-close"));
    return events;
  } finally {
    channel.destroy();
    rmSync(baseDirectory, { recursive: true, force: true });
  }
}

for (const fault of [
  "none",
  "lifetime-helper",
  "pre-S-supervisor",
  "pre-S-collector",
  "source-drift",
  "partial-open",
  "parent-loss",
  "S-early-terminal",
  "P-detached",
  "reader-close",
  "restore",
  "supervisor-cleanup",
  "S-large-finish",
  "S-large-finish-child",
  "S-large-finish-parts",
  "S-large-finish-mode",
])
  test(
    `independent parent consumes actual private IPC: ${fault}`,
    posixFixture,
    async () => {
      await session(fault);
    },
  );

/** Change one byte of a published part, keeping its frame, size and mode. */
function tamperPart(path: string): void {
  const bytes = readFileSync(path);
  bytes[0] = bytes[0] === 0x20 ? 0x21 : 0x20;
  writeFileSync(path, bytes);
}

/** The inert summary shape these operator fixtures retain. */
interface FixtureSummary {
  readonly assessment: string;
}

/** The original reader-close payload the parent publishes after S closes. */
function readerClosed(
  raw: readonly ReturnType<typeof fileIdentity>[],
  summary: FixtureSummary,
) {
  return {
    raw,
    summary,
    externalRootAcceptance: "required",
    escapedDescendantCleanup: "requires original Root evidence",
    linuxModeRestoration: "external Root after actual reader close",
  };
}

/** Native commands are replaced by original-format raw fixtures, never run. */
async function operatorFixture(
  parent: KernelParentAllocation,
  directory: string,
  mode: string,
  events: string[],
  api: typeof S,
): Promise<void> {
  const channel = join(directory, "manual");
  mkdirSync(channel, { mode: 0o700 });
  const mac = mode.includes("mac");
  const host = mac
    ? { ...parent.host, target: "macos-aarch64" as const, uid: 501 }
    : parent.host;
  const plists = mac
    ? [1, 2].map((index) => ({
        path: `/Library/LaunchDaemons/org.oseo.runner.oseo-mac-${index}.plist`,
        metadata: "1:2:Regular File:0:0:644",
        sha256: "a".repeat(64),
      }))
    : [];
  const allocationPath = join(directory, "root-allocation.json");
  const rootAllocation = {
    taskId: "fixture-task",
    transport: "manual-files" as const,
    host,
    ingressNames: ["existing-manual-window"],
    macPlists: plists,
    runId: parent.child.comparison.measurement.runId,
  };
  writeKernelControl(allocationPath, rootAllocation);
  const input: KernelOperatorAllocation = {
    ...rootAllocation,
    directory: channel,
    allocation: fileIdentity(allocationPath),
    parent: { ...parent, host },
    responseMs: 1000,
    signal: new AbortController().signal,
  };
  const operator = new KernelRootOperator(input);
  const stopped = new Set<number>();
  const originals: ReturnType<typeof fileIdentity>[] = [];
  let sequence = 0;
  let uuidMode = "400";
  let failed = false;
  const serve = async (work: Promise<void>): Promise<void> => {
    const settled = work.then(
      () => ({ done: true as const }),
      (error: Error) => ({ done: true as const, error }),
    );
    while (true) {
      const signal = new AbortController();
      const stem = String(sequence).padStart(4, "0");
      // Event-driven private file publication, not process/status polling.
      const next = waitKernelControl<KernelOperatorCommand["request"]>(
        channel,
        stem + ".command.json",
        1000,
        signal.signal,
      ).then((request) => ({ done: false as const, request }));
      // eslint-disable-next-line no-await-in-loop -- Manual command order.
      const result = await Promise.race([settled, next]);
      if (result.done) {
        signal.abort();
        if ("error" in result) throw result.error;
        return;
      }
      const request = result.request;
      assert.equal(request.sequence, sequence++);
      requireKernelOperatorArgv(request.kind, request.argv);
      events.push(request.kind);
      const index = request.argv.join(" ").includes("mac-2") ? 2 : 1;
      let stdout = "",
        stderr = "",
        status = 0;
      if (request.kind === "boot") stdout = host.boot;
      if (request.kind === "mac-host") stdout = "mac-mini-m6";
      if (request.kind === "uuid-canonical")
        stdout = "/sys/devices/virtual/dmi/id/product_uuid";
      if (
        request.kind.startsWith("uuid-") &&
        request.argv[0] === "/usr/bin/stat"
      )
        stdout = "26:2001:regular file:0:0:" + uuidMode;
      if (request.kind === "uuid-open") uuidMode = "444";
      if (request.kind === "uuid-opened") {
        if (mode === "operator-open-verification") status = 1;
        if (mode === "operator-open-inode")
          stdout = "26:2002:regular file:0:0:444";
      }
      if (
        mode === "operator-open-inode" &&
        request.kind === "uuid-before-restore"
      )
        stdout = "26:2002:regular file:0:0:444";
      if (request.kind === "uuid-restore") uuidMode = "400";
      if (request.kind === "plist-metadata")
        stdout = plists[index - 1]!.metadata;
      if (request.kind === "plist-hash")
        stdout = plists[index - 1]!.sha256 + "  " + plists[index - 1]!.path;
      if (request.kind === "stop") {
        if (mode === "operator-mac-partial" && index === 2) {
          status = 1;
          failed = true;
        } else stopped.add(index);
      }
      if (request.kind === "restore") {
        if (mode === "operator-mac-restore-failed") status = 1;
        else stopped.delete(index);
      }
      if (request.kind === "absence" && stopped.has(index)) {
        status = 113;
        stderr = "Could not find service";
      }
      if (request.kind === "listener-print") {
        const user = index === 1 ? "oseo-runner" : "oseo-runner2";
        stdout =
          `\tstate = running\n\ttype = LaunchDaemon\n` +
          `\tusername = ${user}\n\tpid = ${index * 100}\n` +
          `\tpath = ${plists[index - 1]!.path}\n` +
          `\tprogram = /Users/${user}/actions-runner/bin/Runner.Listener\n`;
      }
      if (request.kind === "listener-identity") {
        const slot = request.argv[2] === "100" ? 1 : 2;
        const user = slot === 1 ? "oseo-runner" : "oseo-runner2";
        stdout =
          `Mon Nov 16 01:00:00 2026 ${501 + slot} 1 ` +
          `/Users/${user}/actions-runner/bin/Runner.Listener\n`;
      }
      const raw = join(directory, "command-" + stem);
      mkdirSync(raw, { mode: 0o700 });
      const time = new Date().toISOString();
      const record = {
        directory: raw,
        argv: request.argv,
        cwd: "/",
        env: {
          PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
          LANG: "C",
          LC_ALL: "C",
          TZ: "UTC",
        },
        startedUtc: time,
        finishedUtc: time,
        monotonicStartMs: 0,
        monotonicEndMs: 0,
        wallMs: 0,
        pid: 10000 + sequence,
        status:
          (mode === "operator-unknown" && request.kind === "uuid-open") ||
          (mode === "operator-open-unknown" &&
            request.kind === "uuid-opened") ||
          (mode === "operator-mac-unknown" && request.kind === "stop")
            ? null
            : status,
        signal: null,
        error: null,
        timedOut: false,
        stdout: "command.stdout",
        stderr: "command.stderr",
        cleanup: [],
        groupGone: true,
      };
      writeFileSync(join(raw, record.stdout), stdout, { mode: 0o600 });
      writeFileSync(join(raw, record.stderr), stderr, { mode: 0o600 });
      writeKernelControl(join(raw, "command.json"), record);
      const receiptPath = join(channel, stem + ".terminal.json");
      writeKernelControl(receiptPath, { request, record });
      originals.push(
        fileIdentity(receiptPath),
        ...[record.stdout, record.stderr, "command.json"].map((name) =>
          fileIdentity(join(raw, name)),
        ),
      );
      // eslint-disable-next-line no-await-in-loop -- Match service event.
      const snapshot = await operator.operations().listeners();
      if (
        mac &&
        request.kind === "plist-hash" &&
        index === 2 &&
        events.includes("restore") &&
        stopped.size === 0 &&
        !existsSync(
          join(
            channel,
            `restore-online-${snapshot.event.sequence}.receipt.json`,
          ),
        )
      ) {
        const response = join(
          directory,
          `online-${snapshot.event.sequence}.json`,
        );
        writeKernelControl(response, {
          runners: [
            ...[1, 2].map((slot) => ({
              name: `oseo-mac-${slot}`,
              status: "online",
              busy: false,
            })),
            // A complete runner listing may exceed one control frame.
            ...(mode.endsWith("response-part")
              ? Array.from({ length: 2000 }, (_, slot) => ({
                  name: `other-${slot}`,
                  status: "offline",
                  busy: false,
                }))
              : []),
          ],
        });
        writeKernelControl(
          join(
            channel,
            `restore-online-${snapshot.event.sequence}.receipt.json`,
          ),
          {
            taskId: input.taskId,
            host,
            event: snapshot.event,
            observedMs: Date.now(),
            method: "GET",
            url: "https://api.github.com/repos/dahlia/oseo/actions/runners",
            status: 200,
            response: fileIdentity(response),
          },
        );
        originals.push(
          fileIdentity(
            join(
              channel,
              `restore-online-${snapshot.event.sequence}.receipt.json`,
            ),
          ),
          fileIdentity(response),
        );
      }
    }
  };
  if (mode.startsWith("operator-open-")) {
    await assert.rejects(serve(operator.beforeCollector()));
    if (mode === "operator-open-verification") {
      await serve(operator.restoreWithoutReader());
      assert.equal(uuidMode, "400");
      assert.equal(events.includes("uuid-restored"), true);
    } else {
      await assert.rejects(serve(operator.restoreWithoutReader()));
      assert.equal(uuidMode, "444");
      assert.equal(events.includes("uuid-restore"), false);
    }
    return;
  }
  await serve(operator.beforeCollector());
  if (mode === "operator-no-reader") {
    await serve(operator.restoreWithoutReader());
    assert.equal(uuidMode, "400");
    return;
  }
  if (mode === "operator-reader-unknown") {
    await assert.rejects(operator.afterCollector(), /reader close/);
    assert.equal(uuidMode, "444");
    assert.equal(events.includes("uuid-restore"), false);
    return;
  }
  const reader = new KernelCollectorReader(
    api,
    host,
    parent.bounds,
    directory,
    { ...parent.rootProcess, uid: host.uid },
    [parent.rootProcess],
  );
  if (mac) {
    const snapshot = await operator.operations().listeners();
    reader.observeMacListeners(snapshot.observations, snapshot.event);
  }
  if (mode.startsWith("operator-mac-full")) {
    const operation = operator.operations();
    const request: ComparisonRequest = {
      id: "diagnosis",
      phase: "diagnosis",
      runId: "fixture",
      manifest: fileIdentity(join(directory, "built.json")),
      // SAFETY: inert source fields; no build or host discovery is executed.
      source: JSON.parse('{"host":{},"tree":"fixture"}'),
      destination: directory,
    };
    const discoveryDirectory = join(directory, "discovery");
    mkdirSync(discoveryDirectory, { mode: 0o700 });
    const tools = ["sample", "dwarfdump"].map((name) => {
      const path = join(directory, name);
      writeFileSync(path, "inert tool", { mode: 0o600 });
      return fileIdentity(path);
    });
    const commands = profilingProbes("darwin").map((argv, index) => {
      const time = new Date().toISOString();
      const record: RunRecord = {
        directory: discoveryDirectory,
        argv: index === 9 ? [tools[0]!.path, ...argv.slice(1)] : argv,
        cwd: "/",
        env: {},
        startedUtc: time,
        finishedUtc: time,
        monotonicStartMs: 0,
        monotonicEndMs: 0,
        wallMs: 0,
        pid: 10000 + index,
        status: 0,
        signal: null,
        error: null,
        timedOut: false,
        stdout: `${index}.stdout`,
        stderr: `${index}.stderr`,
        cleanup: [],
        groupGone: true,
      };
      writeFileSync(join(discoveryDirectory, record.stdout), "fixture", {
        mode: 0o600,
      });
      writeFileSync(join(discoveryDirectory, record.stderr), "", {
        mode: 0o600,
      });
      writeKernelControl(join(discoveryDirectory, `${index}.json`), record);
      return Object.assign({}, record, {
        toolPath: index === 9 ? tools[0]!.path : null,
        stdoutBase64: Buffer.from("fixture").toString("base64"),
        stderrBase64: "",
      });
    });
    const discoveryPath = join(discoveryDirectory, "discovery.json");
    writeKernelControl(discoveryPath, {
      kind: "profiling-tool-discovery",
      acceptance: "unverified",
      completed: true,
      interrupted: null,
      platform: "darwin",
      architecture: "arm64",
      commands,
    });
    const receiptPath = join(channel, "diagnosis.receipt.json");
    writeKernelControl(receiptPath, {
      request,
      host,
      discovery: fileIdentity(discoveryPath),
      tools,
    });
    originals.push(
      ...profileInventory(discoveryDirectory),
      ...tools,
      fileIdentity(receiptPath),
    );
    let frame = 0;
    const exchange = async (
      proof: BoundaryProof,
      original = request,
      phase = original.phase,
      bounds: WindowBounds | null = null,
    ): Promise<void> => {
      const name = `proof-${frame}.response.json`;
      const path = join(channel, name);
      const control = {
        sequence: frame++,
        childPid: 12345,
        parentPid: process.pid,
        phase,
        request: original,
        bounds,
        failure: null,
      };
      const response: KernelResponse = { control, proof };
      writeKernelControl(path, response);
      const received = await waitKernelControl<KernelResponse>(
        channel,
        name,
        1000,
        new AbortController().signal,
      );
      assert.deepEqual(received, response);
      assert.deepEqual(received.control, control);
      assert.equal(received.proof.requestId, control.request.id);
      assert.equal(received.proof.status, "complete");
      assert.deepEqual(proof.raw, originals);
      for (const pin of proof.raw)
        assert.deepEqual(fileIdentity(pin.path), pin);
      assert.ok(fileIdentity(path).bytes <= 65_536);
    };
    await exchange(await operation.diagnose(request));
    for (const purpose of ["profile", "timing"] as const) {
      const current = {
        ...request,
        id: purpose,
        phase: `${purpose}-admission`,
      };
      const ingress = (closed: boolean): void => {
        const path = join(
          channel,
          `${purpose}.${closed ? "closed" : "open"}.ingress.json`,
        );
        writeKernelControl(path, {
          taskId: input.taskId,
          host,
          requestId: purpose,
          purpose,
          accounts: parent.child.comparison.accounts,
          manifest: current.manifest,
          acquiredMs: 0,
          observedThroughMs: Date.now(),
          releasedMs: null,
          ingress: [
            {
              name: input.ingressNames[0],
              heldFromMs: 0,
              heldUntilMs: null,
              original: input.allocation,
            },
          ],
          pendingJobs: [],
          activeHooks: [],
          activeChildren: [],
        });
        originals.push(fileIdentity(path), input.allocation);
      };
      ingress(false);
      // eslint-disable-next-line no-await-in-loop -- Original phase order.
      await exchange(await operation.admit(current, purpose), current);
      originals.push(
        fileIdentity(join(channel, `${purpose}.open.ingress.json`)),
        input.allocation,
      );
      const opening = operation.exclude(current, purpose);
      // eslint-disable-next-line no-await-in-loop -- Original command order.
      await serve(opening.then(() => undefined));
      // eslint-disable-next-line no-await-in-loop -- Same completed opening.
      const monitor = await opening;
      // eslint-disable-next-line no-await-in-loop -- Original phase order.
      await exchange(monitor.opened, current, `${purpose}-exclusion`);
      // eslint-disable-next-line no-await-in-loop -- Actual timeline replay.
      const held = await operation.listeners();
      reader.observeMacListeners(held.observations, held.event);
      reader.timeline.open(monitor.opened.startedMs);
      const finishedMs = Date.now();
      reader.timeline.close(finishedMs);
      ingress(true);
      const closing = monitor.finish({
        startedMs: monitor.opened.startedMs,
        finishedMs,
      });
      // eslint-disable-next-line no-await-in-loop -- Original restoration.
      await serve(closing.then(() => undefined));
      // eslint-disable-next-line no-await-in-loop -- Original phase order.
      await exchange(await closing, current, `${purpose}-exclusion-close`, {
        startedMs: monitor.opened.startedMs,
        finishedMs,
      });
      // eslint-disable-next-line no-await-in-loop -- Actual timeline replay.
      const restored = await operation.listeners();
      reader.observeMacListeners(restored.observations, restored.event);
      assert.equal(stopped.size, 0);
    }
    const finalRequest = { ...request, id: "finalize", phase: "finalize" };
    await exchange(await operation.finalize(finalRequest, null), finalRequest);
    assert.ok(originals.length >= 260);
    assert.ok(Buffer.byteLength(JSON.stringify(originals)) > 65_536);
    mkdirSync(parent.output, { mode: 0o700 });
    const summary = { assessment: "UNASSESSED" };
    const finish = join(parent.output, "finish.json");
    writeKernelControl(finish, {
      summary,
      finalChildren: [{ reaped: true, groupAbsent: true }],
    });
    writeKernelControl(join(parent.output, "reader-terminal.json"), {
      original: fileIdentity(finish),
      summary,
    });
    const closed = join(parent.output, "reader-closed.json");
    writeKernelControl(closed, readerClosed([fileIdentity(finish)], summary));
    const acceptance = join(channel, "external-final-acceptance.json");
    writeKernelControl(acceptance, {
      allocation: mode.endsWith("invalid")
        ? { ...input.allocation, sha256: "0".repeat(64) }
        : input.allocation,
      readerClosed: fileIdentity(closed),
      commandOriginals: mode.endsWith("drop") ? originals.slice(1) : originals,
    });
    assert.ok(fileIdentity(acceptance).bytes <= 65_536);
    if (mode.endsWith("tamper"))
      writeFileSync(originals[1]!.path, "tampered", { mode: 0o600 });
    if (mode.endsWith("response-part")) {
      // The acceptance still names the unchanged envelope of this original.
      const response = originals.find((pin) =>
        /\/online-\d+\.json$/u.test(pin.path),
      )!;
      assert.ok(fileIdentity(response.path).bytes <= 65_536);
      tamperPart(response.path + ".part-000001");
    }
    if (mode === "operator-mac-full") await operator.afterCollector();
    else await assert.rejects(operator.afterCollector());
    return;
  }
  if (!mac) {
    assert.equal(uuidMode, "444");
    mkdirSync(parent.output, { mode: 0o700 });
    const finish = join(parent.output, "finish.json");
    const s = mode.startsWith("operator-linux-s-finish")
      ? await actualSFinish()
      : null;
    const summary: FixtureSummary = s?.summary ?? { assessment: "UNASSESSED" };
    if (s) {
      // S's own long-run finish, retained by the parent's actual terminal.
      writeSOriginal(finish, s.bytes);
      retainKernelReaderTerminal(parent.output, parent.output, s.summary);
    } else {
      writeKernelControl(finish, {
        summary,
        finalChildren: [{ reaped: true, groupAbsent: true }],
      });
      writeKernelControl(join(parent.output, "reader-terminal.json"), {
        original: fileIdentity(finish),
        summary,
      });
    }
    if (mode === "operator-linux-s-finish-tamper") {
      // A changed S finish leaves reader close unknown: no restoration.
      writeFileSync(finish, s!.bytes.toString("utf8").replace("{", "{ "));
      await assert.rejects(serve(operator.afterCollector()));
      assert.equal(uuidMode, "444");
      assert.equal(events.includes("uuid-restore"), false);
      return;
    }
    const raw = [fileIdentity(finish)];
    const large = mode.startsWith("operator-linux-large");
    const interior = join(parent.output, "interior.json");
    if (large) {
      for (let index = 0; index < 400; index++) {
        const path = join(parent.output, `raw-${index}.bin`);
        writeFileSync(path, String(index), { mode: 0o600 });
        raw.push(fileIdentity(path));
      }
      // A retained original that is itself a partitioned control.
      writeKernelControl(interior, { original: "x".repeat(100_000) });
      raw.push(fileIdentity(interior));
    }
    const closed = join(parent.output, "reader-closed.json");
    writeKernelControl(
      closed,
      readerClosed(
        raw,
        mode === "operator-linux-summary" ? { assessment: "other" } : summary,
      ),
    );
    if (large) {
      assert.ok(existsSync(closed + ".part-000001"));
      assert.ok(fileIdentity(closed).bytes <= 65_536);
    }
    const tampers = new Map<string, () => void>([
      [
        "operator-linux-large-part-delete",
        () => rmSync(closed + ".part-000001"),
      ],
      [
        "operator-linux-large-part-tamper",
        () => tamperPart(closed + ".part-000001"),
      ],
      [
        "operator-linux-large-interior",
        () => tamperPart(interior + ".part-000001"),
      ],
      [
        "operator-linux-large-raw",
        () => writeFileSync(raw[1]!.path, "tampered", { mode: 0o600 }),
      ],
    ]);
    const tamper = tampers.get(mode);
    // Five restoration commands wait first. The sixth wait is for external
    // acceptance, which starts only after the operator's own replay.
    let waits = 0;
    let accepting!: () => void;
    const accepted = new Promise<void>((resolve) => {
      accepting = resolve;
    });
    const listen = input.signal.addEventListener.bind(input.signal);
    // SAFETY: the wrapper forwards the same arguments to the original method.
    input.signal.addEventListener = ((
      ...args: Parameters<typeof listen>
    ): void => {
      if (++waits === 6) accepting();
      listen(...args);
    }) as typeof listen;
    void accepted.then(() => {
      const envelope = fileIdentity(closed);
      writeKernelControl(join(channel, "external-final-acceptance.json"), {
        allocation: input.allocation,
        readerClosed: envelope,
        commandOriginals: originals,
      });
      // Every change below leaves the accepted envelope byte-identical.
      tamper?.();
      assert.deepEqual(fileIdentity(closed), envelope);
    });
    // A payload corrupt before acceptance still permits the 0400 restoration.
    const early =
      mode === "operator-linux-summary" ||
      mode === "operator-linux-large-corrupt";
    if (mode === "operator-linux-large-corrupt")
      rmSync(closed + ".part-000001");
    const drive = serve(operator.afterCollector());
    if (tamper || early) await assert.rejects(drive);
    else await drive;
    // A tamper fails only the replay after acceptance; an early failure comes
    // before the operator waits for acceptance at all.
    assert.equal(waits, early ? 5 : 6);
    // Restoration precedes raw adjudication and external acceptance.
    assert.equal(uuidMode, "400");
  } else {
    const request: ComparisonRequest = {
      id: "profile",
      phase: "profile-admission",
      runId: "fixture",
      manifest: fileIdentity(join(directory, "built.json")),
      // SAFETY: parent fixture exercises no H execution or host discovery.
      source: JSON.parse('{"host":{},"tree":"fixture"}'),
      destination: directory,
    };
    writeKernelControl(join(channel, "profile.open.ingress.json"), {
      taskId: input.taskId,
      host,
      requestId: "profile",
      purpose: "profile",
      accounts: parent.child.comparison.accounts,
      manifest: fileIdentity(request.manifest.path),
      acquiredMs: 0,
      observedThroughMs: Date.now(),
      releasedMs: null,
      ingress: [
        {
          name: input.ingressNames[0],
          heldFromMs: 0,
          heldUntilMs: null,
          original: input.allocation,
        },
      ],
      pendingJobs: [],
      activeHooks: [],
      activeChildren: [],
    });
    const operation = operator.operations();
    const opened = operation.exclude(request, "profile");
    if (mode === "operator-mac-partial") {
      await assert.rejects(serve(opened.then(() => undefined)), /Partial/);
      assert.equal(stopped.size, 0);
      assert.equal(failed, true);
    } else {
      await serve(opened.then(() => undefined));
      const monitor = await opened;
      const held = await operation.listeners();
      reader.observeMacListeners(held.observations, held.event);
      reader.timeline.open(monitor.opened.startedMs);
      reader.timeline.close(Date.now());
      const finishedMs = Date.now();
      writeKernelControl(join(channel, "profile.closed.ingress.json"), {
        taskId: input.taskId,
        host,
        requestId: "profile",
        purpose: "profile",
        accounts: parent.child.comparison.accounts,
        manifest: fileIdentity(request.manifest.path),
        acquiredMs: 0,
        observedThroughMs: Date.now(),
        releasedMs: null,
        ingress: [
          {
            name: input.ingressNames[0],
            heldFromMs: 0,
            heldUntilMs: null,
            original: input.allocation,
          },
        ],
        pendingJobs: [],
        activeHooks: [],
        activeChildren: [],
      });
      const restored = serve(
        monitor
          .finish({
            startedMs: monitor.opened.startedMs,
            finishedMs,
          })
          .then(() => undefined),
      );
      if (mode === "operator-mac-restore-failed")
        await assert.rejects(restored);
      else {
        await restored;
        assert.equal(stopped.size, 0);
        const snapshot = await operation.listeners();
        reader.observeMacListeners(snapshot.observations, snapshot.event);
      }
    }
  }
}

for (const mode of [
  "operator-linux",
  "operator-linux-summary",
  "operator-linux-large",
  "operator-linux-large-corrupt",
  "operator-linux-large-part-delete",
  "operator-linux-large-part-tamper",
  "operator-linux-large-interior",
  "operator-linux-large-raw",
  "operator-linux-s-finish",
  "operator-linux-s-finish-tamper",
  "operator-no-reader",
  "operator-open-verification",
  "operator-open-inode",
  "operator-open-unknown",
  "operator-reader-unknown",
  "operator-unknown",
  "operator-mac",
  "operator-mac-full",
  "operator-mac-full-invalid",
  "operator-mac-full-drop",
  "operator-mac-full-tamper",
  "operator-mac-full-response-part",
  "operator-mac-partial",
  "operator-mac-restore-failed",
  "operator-mac-unknown",
])
  test(`Root original command exchange: ${mode}`, posixFixture, async () => {
    if (mode === "operator-unknown" || mode === "operator-mac-unknown")
      await assert.rejects(session(mode), /terminal unknown/);
    else await session(mode);
  });
