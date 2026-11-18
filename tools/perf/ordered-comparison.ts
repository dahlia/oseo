import { randomUUID } from "node:crypto";
import { isObject } from "../value-kinds.ts";
import {
  appendFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { BuildManifest, BuiltForm, NativeBuildMetadata } from "./build.ts";
import { checkMatrix } from "./correctness.ts";
import type { CorrectnessSource } from "./correctness.ts";
import {
  digest,
  kernelProfileFlag,
  kernelProfileIterations,
  kernels,
} from "./corpus.ts";
import { artifact, validateHostMetadata } from "./evidence.ts";
import type { Artifact } from "./evidence.ts";
import { Journal, verifyJournal } from "./journal.ts";
import type { LaunchRecord, RawExecutor } from "./journal.ts";
import { measureMatrix, readMatrix } from "./measure.ts";
import type { MeasurementOptions } from "./measure.ts";
import { checkExecution, executionText } from "./observation.ts";
import type { RawExecution } from "./observation.ts";
import type { Command } from "./plan.ts";

/** Bind each external decision to a fresh request and frozen H input. */
export interface ComparisonRequest {
  readonly id: string;
  readonly phase: string;
  readonly runId: string;
  readonly manifest: Artifact;
  readonly source: CorrectnessSource;
  readonly destination: string;
}

/** The adapter must assess raw evidence; this envelope alone proves no host. */
export interface BoundaryProof {
  readonly requestId: string;
  readonly status: "complete" | "failed" | "partial" | "unknown";
  readonly raw: readonly Artifact[];
}

/** Root approval and physical exclusion are separate evidence producers. */
export interface AdmissionProof extends BoundaryProof {
  readonly authority: "Root";
  readonly purpose: "profile" | "timing";
}

/** UTC bounds cover the entire operation, including failed launches. */
export interface WindowBounds {
  readonly startedMs: number;
  readonly finishedMs: number;
}

/** A running collector establishes the start, never future exclusion. */
export interface ExclusionStart extends BoundaryProof {
  readonly physicalHost: string;
  readonly accounts: readonly string[];
  readonly startedMs: number;
  readonly state: "monitoring";
}

/** Whole-window acceptance requires a separate completed collector report. */
export interface ExclusionProof extends BoundaryProof, WindowBounds {
  readonly physicalHost: string;
  readonly accounts: readonly string[];
  readonly coverage: "whole-window";
}

/** Closing the monitor is mandatory even after a failed workload or check. */
export interface ExclusionMonitor {
  readonly opened: ExclusionStart;
  readonly finish: (bounds: WindowBounds) => Promise<ExclusionProof>;
}

/** Budgets are fixed independently of transport and host admission. */
export interface ProfileRequirements {
  readonly captures: 8;
  readonly targetTimeoutMs: 120000;
  readonly linux: {
    readonly serial: true;
    readonly captureTimeoutMs: 5000;
    readonly frames: 16;
  };
  readonly mac: {
    readonly concurrent: true;
    readonly targetCount: 1;
    readonly seconds: 1;
    readonly intervalMs: 10;
    readonly captureTimeoutMs: 20000;
    readonly correlated: true;
  };
}

/** Fixed boundary budgets; samplers never enter H's timing population. */
export const profileRequirements: ProfileRequirements = Object.freeze({
  captures: 8,
  targetTimeoutMs: 120_000,
  linux: Object.freeze({ serial: true, captureTimeoutMs: 5_000, frames: 16 }),
  mac: Object.freeze({
    concurrent: true,
    targetCount: 1,
    seconds: 1,
    intervalMs: 10,
    captureTimeoutMs: 20_000,
    correlated: true,
  }),
});

/** Each report needs the owning profiler's assessment and original raw file. */
export interface AssessedCapture {
  readonly index: number;
  readonly report: Artifact;
  readonly useful: boolean;
  readonly runtimeFrames: boolean;
  readonly generatedFrames: boolean;
  readonly complete: boolean;
}

/** A separate workload on the same uninstrumented timed executable. */
export interface KernelProfileLaunch {
  readonly kind: "kernel-fixed-count-v1";
  readonly iterations: number;
  readonly run: Command;
}

/** H checks profile stdout while preserving the original 100-call baseline. */
export interface ProfileInput {
  readonly request: ComparisonRequest;
  readonly form: BuiltForm;
  readonly profile: KernelProfileLaunch;
  readonly inputs: readonly Artifact[];
  readonly correctness: LaunchRecord;
  readonly checkerSources: readonly Artifact[];
  readonly requirements: typeof profileRequirements;
  readonly stdoutCheckerId: string;
  readonly stdoutCheckerSource: Artifact;
  readonly acceptsStdout: (stdout: Uint8Array) => boolean;
}

/** P's future adapter must validate all eight reports before returning this. */
export interface ProfileProof extends BoundaryProof {
  readonly artifactId: string;
  readonly executable: Artifact;
  readonly launchSha256: string;
  readonly captures: readonly AssessedCapture[];
  readonly target: RawExecution;
  readonly cleanup: "complete" | "unknown";
}

/**
 * No default adapter exists. Root supplies actual diagnosis, P assessment,
 * approval, whole-window monitoring and terminal/owned-process finalization.
 * The adapters retain failures under request.destination before throwing.
 */
export interface ComparisonBoundaries {
  readonly diagnose: (request: ComparisonRequest) => Promise<BoundaryProof>;
  readonly admit: (
    request: ComparisonRequest,
    purpose: "profile" | "timing",
  ) => Promise<AdmissionProof>;
  readonly exclude: (
    request: ComparisonRequest,
    purpose: "profile" | "timing",
  ) => Promise<ExclusionMonitor>;
  readonly profile: (input: ProfileInput) => Promise<ProfileProof>;
  readonly finalize: (
    request: ComparisonRequest,
    failure: string | null,
  ) => Promise<BoundaryProof>;
}

/** Executors are transport seams only; H still owns all roles and budgets. */
export interface OrderedComparisonOptions {
  readonly directory: string;
  readonly destination: string;
  readonly measurement: MeasurementOptions;
  readonly physicalHost: string;
  readonly accounts: readonly string[];
  readonly source: () => CorrectnessSource;
  readonly boundaries: ComparisonBoundaries;
  readonly correctnessExecutor?: RawExecutor;
  readonly measurementExecutor?: RawExecutor;
}

/** Failure and finalization errors remain separate in the durable handoff. */
export interface OrderedComparisonResult {
  readonly status: "complete" | "failed";
  readonly failedPhase: string | null;
  readonly error: string | null;
  readonly finalizationErrors: readonly string[];
  readonly profiled: readonly string[];
  readonly measurements: Artifact | null;
}

interface FrozenFile extends Artifact {
  readonly mode: number;
  readonly realpath: string;
}

function snapshot(path: string): FrozenFile {
  return {
    ...artifact(path),
    mode: lstatSync(path).mode & 0o777,
    realpath: realpathSync(path),
  };
}

function freeze<Value>(value: Value): Value {
  if (isObject(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function isBoundaryOperation<Candidate>(
  value: Candidate,
): value is Candidate & ComparisonBoundaries[keyof ComparisonBoundaries] {
  return typeof value === "function";
}

function formId(form: BuiltForm): string {
  return `${form.workload}/${form.id}/${form.role}`;
}

/**
 * Run the ordered chain on a previously built, sealed H matrix. Profile time
 * never enters H's populations. Completion covers one host only and still
 * needs Root's raw acceptance, checkpoint gates and publication.
 */
export async function runOrderedComparison(
  options: OrderedComparisonOptions,
): Promise<OrderedComparisonResult> {
  options = {
    ...options,
    measurement: freeze(structuredClone(options.measurement)),
    accounts: freeze([...options.accounts]),
    boundaries: freeze({ ...options.boundaries }),
  };
  const destination = options.destination;
  if (!isAbsolute(destination) || !isAbsolute(options.directory)) {
    throw new Error("Comparison directories must be absolute.");
  }
  mkdirSync(destination, { mode: 0o700 });
  const events = join(destination, "ordered.jsonl");
  const write = <Value>(name: string, value: Value) =>
    writeFileSync(
      join(destination, name),
      JSON.stringify(value, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
  const event = <Value>(kind: string, value: Value) =>
    appendFileSync(events, JSON.stringify({ kind, ...value }) + "\n", {
      mode: 0o600,
    });
  const frozen = new Map<string, FrozenFile>();
  const pin = (file: Artifact) => {
    const current = snapshot(file.path);
    if (current.sha256 !== file.sha256 || current.bytes !== file.bytes) {
      throw new Error(`Evidence bytes changed: ${file.path}`);
    }
    const previous = frozen.get(file.path);
    if (
      previous != null &&
      JSON.stringify(previous) !== JSON.stringify(current)
    ) {
      throw new Error(`Evidence identity changed: ${file.path}`);
    }
    frozen.set(file.path, current);
  };
  let manifest: BuildManifest | null = null;
  let source: CorrectnessSource | null = null;
  let manifestFile: Artifact | null = null;
  let phase = "inputs";
  let failedPhase: string | null = null;
  let failure: string | null = null;
  const finalizationErrors: string[] = [];
  const profiled: string[] = [];
  let measurements: Artifact | null = null;
  const request = (name: string): ComparisonRequest => {
    if (source == null || manifestFile == null) {
      throw new Error("No frozen comparison input.");
    }
    const id = randomUUID();
    const result = freeze({
      id,
      phase: name,
      runId: options.measurement.runId,
      source,
      manifest: manifestFile,
      destination: join(destination, id),
    });
    event("request", result);
    return result;
  };
  const guard = () => {
    if (source == null || manifest == null) throw new Error("Missing input.");
    readMatrix(options.directory);
    const current = options.source();
    validateHostMetadata(current.host);
    if (JSON.stringify(current) !== JSON.stringify(source)) {
      throw new Error("Producing source/host identity changed.");
    }
    for (const file of frozen.values()) {
      if (JSON.stringify(snapshot(file.path)) !== JSON.stringify(file)) {
        throw new Error(`Frozen identity changed: ${file.path}`);
      }
    }
  };
  const accept = (req: ComparisonRequest, proof: BoundaryProof) => {
    event("proof", { phase: req.phase, proof });
    if (
      proof?.requestId !== req.id ||
      proof.status !== "complete" ||
      !Array.isArray(proof.raw) ||
      proof.raw.length === 0
    ) {
      throw new Error(`Missing, stale or incomplete ${req.phase} proof.`);
    }
    for (const file of proof.raw) pin(file);
  };
  const step = async <Value>(name: string, operation: () => Promise<Value>) => {
    phase = name;
    event("start", { phase });
    guard();
    const result = await operation();
    guard();
    event("complete", { phase });
    return result;
  };
  const window = async (
    purpose: "profile" | "timing",
    operation: () => Promise<void>,
  ) => {
    const req = request(`${purpose}-exclusion`);
    phase = req.phase;
    guard();
    const monitor = await options.boundaries.exclude(req, purpose);
    let primary: Error | null = null;
    let originalPhase = phase;
    const startedMs = Date.now();
    const verifyWindow = (proof: ExclusionProof, bounds: WindowBounds) => {
      accept(req, proof);
      if (
        proof.physicalHost !== options.physicalHost ||
        proof.coverage !== "whole-window" ||
        !Array.isArray(proof.accounts) ||
        JSON.stringify(proof.accounts.toSorted()) !==
          JSON.stringify(options.accounts.toSorted()) ||
        !Number.isFinite(proof.startedMs) ||
        !Number.isFinite(proof.finishedMs) ||
        proof.startedMs > bounds.startedMs ||
        proof.finishedMs < bounds.finishedMs
      ) {
        throw new Error(`Incomplete ${purpose} physical-host exclusion.`);
      }
    };
    try {
      guard();
      if (!isBoundaryOperation(monitor?.finish)) {
        throw new Error(`Missing ${purpose} exclusion finalizer.`);
      }
      accept(req, monitor.opened);
      if (
        monitor.opened.state !== "monitoring" ||
        monitor.opened.physicalHost !== options.physicalHost ||
        !Array.isArray(monitor.opened.accounts) ||
        JSON.stringify(monitor.opened.accounts.toSorted()) !==
          JSON.stringify(options.accounts.toSorted()) ||
        !Number.isFinite(monitor.opened.startedMs) ||
        monitor.opened.startedMs > startedMs
      ) {
        throw new Error(`Missing active ${purpose} exclusion collector.`);
      }
      guard();
      await operation();
    } catch (error) {
      primary = error instanceof Error ? error : new Error(String(error));
      originalPhase = phase;
    }
    const bounds = { startedMs, finishedMs: Date.now() };
    try {
      phase = `${purpose}-exclusion-close`;
      const proof = await monitor.finish(bounds);
      verifyWindow(proof, bounds);
      guard();
    } catch (error) {
      if (primary == null) {
        primary = error instanceof Error ? error : new Error(String(error));
        originalPhase = phase;
      } else {
        finalizationErrors.push(String(error));
        event("exclusion-failure", { purpose, error: String(error) });
      }
    }
    if (primary != null) {
      phase = originalPhase;
      throw primary;
    }
  };
  try {
    for (const name of [
      "diagnose",
      "admit",
      "exclude",
      "profile",
      "finalize",
    ] as const) {
      if (!isBoundaryOperation(options.boundaries?.[name])) {
        throw new Error(`Missing required boundary: ${name}`);
      }
    }
    if (
      !options.physicalHost.trim() ||
      options.physicalHost.trim().toLowerCase() === "unknown" ||
      options.accounts.length === 0 ||
      new Set(options.accounts).size !== options.accounts.length ||
      options.accounts.some((account) => !account.trim())
    ) {
      throw new Error("Explicit physical host and accounts are required.");
    }
    manifest = freeze(readMatrix(options.directory));
    source = freeze(structuredClone(options.source()));
    validateHostMetadata(source.host);
    if (
      !/^[a-f0-9]{40}$/u.test(source.tree) ||
      /^0+$/u.test(source.tree) ||
      JSON.stringify(source.host) !== JSON.stringify(manifest.host)
    ) {
      throw new Error("Source must match the producing H host.");
    }
    if (
      manifest.host.target === "macos-aarch64" &&
      !["oseo-mac-1", "oseo-mac-2"].every((account) =>
        options.accounts.includes(account),
      )
    ) {
      throw new Error("Mac exclusion must cover both runner accounts.");
    }
    manifestFile = artifact(join(options.directory, "built.json"));
    pin(manifestFile);
    pin(artifact(join(options.directory, "built.sha256")));
    const checkerSources = [
      fileURLToPath(import.meta.url),
      fileURLToPath(new URL("./observation.ts", import.meta.url)),
      fileURLToPath(new URL("../structured-data.ts", import.meta.url)),
      fileURLToPath(new URL("../value-kinds.ts", import.meta.url)),
      fileURLToPath(new URL("./corpus.ts", import.meta.url)),
    ].map(artifact);
    for (const file of checkerSources) pin(file);
    const nativeInputs = new Map<string, readonly Artifact[]>();
    for (const form of manifest.forms) {
      for (const file of [
        form.source,
        ...form.identities,
        ...(form.executable == null ? [] : [form.executable]),
        ...(form.generatedC ?? []),
      ])
        pin(file);
      if (form.specialization != null) {
        const metadata: NativeBuildMetadata = JSON.parse(
          readFileSync(join(dirname(form.run.command), "build.json"), "utf8"),
        );
        const files = [metadata.compiler, ...metadata.runtimeAssets];
        nativeInputs.set(formId(form), files);
        for (const file of files) pin(file);
      }
    }
    pin(manifest.buildJournal);
    for (const row of verifyJournal(manifest.buildJournal.path)) {
      for (const file of [row.stdin, row.stdout, row.stderr]) pin(file);
    }
    write("input.json", { manifest, source, files: [...frozen.values()] });
    await step("diagnosis", async () => {
      const req = request("diagnosis");
      accept(req, await options.boundaries.diagnose(req));
    });
    await step("correctness", async () => {
      checkMatrix(
        options.directory,
        join(destination, "correctness"),
        options.correctnessExecutor == null
          ? { source: options.source }
          : { source: options.source, executor: options.correctnessExecutor },
      );
    });
    const correctness = freeze(
      verifyJournal(join(destination, "correctness", "raw", "launches.jsonl")),
    );
    for (const name of [
      "correctness.json",
      "run.json",
      "built.json",
      "built.sha256",
      "raw/launches.jsonl",
      "raw/requests.jsonl",
    ]) {
      pin(artifact(join(destination, "correctness", name)));
    }
    for (const row of correctness) {
      for (const file of [row.stdin, row.stdout, row.stderr]) pin(file);
    }
    const admit = async (purpose: "profile" | "timing") => {
      await step(`${purpose}-admission`, async () => {
        const req = request(`${purpose}-admission`);
        const proof = await options.boundaries.admit(req, purpose);
        accept(req, proof);
        if (proof.authority !== "Root" || proof.purpose !== purpose) {
          throw new Error(`Missing separate Root ${purpose} admission.`);
        }
      });
    };
    await admit("profile");
    await window("profile", async () => {
      for (const form of manifest!.forms.filter(
        (candidate) =>
          candidate.role === "timed" && candidate.specialization != null,
      )) {
        // eslint-disable-next-line no-await-in-loop -- Profiles stay serial.
        await step(`profile:${formId(form)}`, async () => {
          const req = request(`profile:${formId(form)}`);
          const checked = correctness.find(
            (row) => row.artifactId === formId(form),
          )!;
          const baseline: RawExecution = {
            ...checked,
            stdout: readFileSync(checked.stdout.path),
            stderr: readFileSync(checked.stderr.path),
          };
          const profile: KernelProfileLaunch = freeze({
            kind: "kernel-fixed-count-v1",
            iterations: kernelProfileIterations(form.workload),
            run: { ...form.run, args: [kernelProfileFlag] },
          });
          const acceptsStdout = (stdout: Uint8Array) => {
            try {
              checkExecution(
                executionText({ ...baseline, stdout }),
                form.workload,
                profile.iterations,
              );
              return true;
            } catch {
              return false;
            }
          };
          const inputs = freeze([
            form.source,
            ...form.identities,
            ...(form.generatedC ?? []),
            ...nativeInputs.get(formId(form))!,
            ...checkerSources,
            checked.stdin,
            checked.stdout,
            checked.stderr,
          ]);
          const stdoutCheckerId = [
            "H",
            "checkExecution",
            profile.kind,
            form.workload,
            profile.iterations,
          ].join("/");
          const stdoutCheckerSource = checkerSources[0]!;
          event("profile-input", {
            requestId: req.id,
            form,
            profile,
            inputs,
            correctness: checked,
            checkerSources,
            profileRequirements,
            stdoutCheckerId,
            stdoutCheckerSource,
          });
          const proof = await options.boundaries.profile(
            freeze({
              request: req,
              form,
              profile,
              inputs,
              correctness: checked,
              checkerSources,
              acceptsStdout,
              requirements: profileRequirements,
              stdoutCheckerId,
              stdoutCheckerSource,
            }),
          );
          event("profile-proof", { proof });
          // A separate H Journal persists the returned target before checks.
          const targetJournal = new Journal(
            join(destination, req.id + "-raw"),
            () => proof.target,
          );
          const raw = targetJournal.run(profile.run, {
            phase: "runtime",
            role: "timed",
            artifactId: formId(form),
            round: null,
            retained: false,
            timingEligible: false,
            reason: "profile-target-not-timing",
            identities: form.identities,
          });
          checkExecution(executionText(raw), form.workload, profile.iterations);
          accept(req, proof);
          if (
            proof.artifactId !== formId(form) ||
            proof.executable?.path !== form.executable!.path ||
            proof.executable?.sha256 !== form.executable!.sha256 ||
            proof.executable?.bytes !== form.executable!.bytes ||
            proof.launchSha256 !== digest(JSON.stringify(profile.run)) ||
            proof.cleanup !== "complete" ||
            !Array.isArray(proof.captures) ||
            proof.captures.length !== profileRequirements.captures ||
            proof.captures.some(
              (capture, index) =>
                capture.index !== index ||
                capture.useful !== true ||
                capture.generatedFrames !== true ||
                capture.complete !== true ||
                (manifest!.host.target === "macos-aarch64" &&
                  capture.runtimeFrames !== true),
            ) ||
            !proof.captures.some((capture) => capture.runtimeFrames === true) ||
            new Set(proof.captures.map((capture) => capture.report.path))
              .size !== profileRequirements.captures
          ) {
            throw new Error("Incomplete same-artifact profile8 acceptance.");
          }
          for (const capture of proof.captures) pin(capture.report);
          pin(artifact(join(targetJournal.directory, "requests.jsonl")));
          pin(artifact(join(targetJournal.directory, "launches.jsonl")));
          for (const row of verifyJournal(
            join(targetJournal.directory, "launches.jsonl"),
          )) {
            for (const file of [row.stdin, row.stdout, row.stderr]) pin(file);
          }
        });
        profiled.push(formId(form));
      }
    });
    // H's matrix validator fixes the four kernels and two native policies.
    if (profiled.length !== kernels.length * 2) {
      throw new Error("Missing required timed native profile.");
    }
    await admit("timing");
    await window("timing", async () => {
      await step("measurement", async () => {
        measureMatrix(
          manifest!,
          join(destination, "measurement"),
          options.measurement,
          options.measurementExecutor,
        );
        measurements = artifact(
          join(destination, "measurement", "measurements.json"),
        );
        pin(measurements);
        const rawPath = join(destination, "measurement", "raw");
        pin(artifact(join(rawPath, "requests.jsonl")));
        pin(artifact(join(rawPath, "launches.jsonl")));
        for (const row of verifyJournal(join(rawPath, "launches.jsonl"))) {
          for (const file of [row.stdin, row.stdout, row.stderr]) pin(file);
        }
      });
    });
  } catch (error) {
    failedPhase = phase;
    failure = String(error);
    event("failure", { phase, error: failure });
  } finally {
    if (
      source != null &&
      manifestFile != null &&
      isBoundaryOperation(options.boundaries?.finalize)
    ) {
      try {
        const req = request("finalize");
        accept(req, await options.boundaries.finalize(req, failure));
        guard();
      } catch (error) {
        finalizationErrors.push(String(error));
        event("finalization-failure", { error: String(error) });
      }
    }
  }
  const result: OrderedComparisonResult = {
    status:
      failure == null && finalizationErrors.length === 0
        ? "complete"
        : "failed",
    failedPhase,
    error: failure,
    finalizationErrors,
    profiled,
    measurements,
  };
  write("result.json", result);
  return result;
}
