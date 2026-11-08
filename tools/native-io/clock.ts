import { runNativeFixture } from "../native-fixture.ts";
/**
 * Build and run the native clock and wakeup probe and scheduler harness.
 *
 * Both programs link the reviewed runtime sources in their reviewed order
 * with the checked-in C under *tests/native-io/*. The fixed native tests,
 * the generated property suite, and `mise run probe:native-io:clock` share
 * these builders so that the evidence each one retains names the same
 * compiler invocation and target.
 */

import {
  hostCcLane,
  nativeBuildConfiguration,
  nativeToolchain,
} from "../../tests/native-toolchain.ts";
import { describeTarget } from "../../packages/compiler/src/index.ts";
import { mkdirSync } from "node:fs";
import { buildHostCcFixture } from "../../tests/host-cc-runtime.ts";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";

const repositoryRoot = resolve(fileURLToPath(import.meta.url), "../../..");
const runtimeDirectory = join(repositoryRoot, "packages/runtime-c/native");
const nativeIoDirectory = join(repositoryRoot, "tests/native-io");

/** The two checked-in native clock programs. */
export type ClockProgram = "probe" | "scheduler";

/** One completed native clock build. */
export interface ClockBuild {
  readonly executable: string;
  readonly invocation: readonly string[];
  readonly target: string;
}

/** Inputs for one native clock build. */
export interface ClockBuildOptions {
  readonly directory: string;
  readonly optimize?: "-O1" | "-O2";
  readonly program: ClockProgram;
  readonly sanitize: boolean;
  readonly target: string;
}

/** One observed process execution. */
export interface ClockRun {
  readonly status: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * The explicit Zig target string for the execution host, or undefined
 * when the host is not a supported native execution environment.
 */
export function hostClockTarget(): string | undefined {
  if (process.platform === "linux" && process.arch === "x64") {
    return "x86_64-linux-gnu";
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "aarch64-macos";
  }
  return undefined;
}

function runtimeSources(): readonly string[] {
  return cRuntimeProvider
    .getRuntimeInput()
    .assets.filter((asset) => asset.kind === "source")
    .map((asset) => fileURLToPath(asset.url));
}

function programSources(program: ClockProgram): readonly string[] {
  return program === "probe"
    ? [join(nativeIoDirectory, "probes/clock-wakeup.c")]
    : [
        join(nativeIoDirectory, "clock-scheduler.c"),
        join(nativeIoDirectory, "deterministic-clock.c"),
      ];
}

function describeFailure(
  command: string,
  args: readonly string[],
  run: ClockRun,
): string {
  return [
    `${command} ${args.join(" ")}`,
    `status: ${run.status ?? "signal"}`,
    `stdout: ${run.stdout}`,
    `stderr: ${run.stderr}`,
  ].join("\n");
}

/** Run one command to completion and capture its text output. */
export function runClockCommand(
  command: string,
  args: readonly string[],
  options: {
    readonly environment?: Readonly<Record<string, string>>;
    readonly input?: string;
  } = {},
): ClockRun {
  const optionsForRun = {
    cwd: repositoryRoot,
    encoding: "utf8" as const,
    env: { ...process.env, ...options.environment },
    input: options.input,
    maxBuffer: 16 * 1024 * 1024,
  };
  const result =
    command === "zig"
      ? spawnSync(command, args, optionsForRun)
      : runNativeFixture(command, args, {
          ...optionsForRun,
          // Measured probe 1.62 s, scheduler 0.22 s including supervision.
          // Over 70 times the probe runtime; compilation stays separate.
          timeout: 120_000,
        });
  if (result.error != null) throw result.error;
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

/**
 * Compile and link one clock program for an explicit target. A target
 * that cannot execute on this host still links, which is the AArch64
 * Linux compile-link evidence.
 */
export function buildClockProgram(options: ClockBuildOptions): ClockBuild {
  const executable = join(
    options.directory,
    `${options.program}-${options.target}`,
  );
  if (hostCcLane) {
    if (options.target !== hostClockTarget()) {
      throw new Error(`Host C lane cannot cross-compile ${options.target}.`);
    }
    const sources = programSources(options.program);
    const invocation = buildHostCcFixture(
      sources[0]!,
      runtimeDirectory,
      [...runtimeSources(), ...sources.slice(1)],
      executable,
    );
    return { executable, invocation, target: options.target };
  }
  if (nativeBuildConfiguration === "optimized") {
    return buildOptimizedClockProgram(options);
  }
  const args = [
    "cc",
    "-target",
    options.target,
    "-std=c11",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-pedantic",
    "-ffp-contract=off",
    options.optimize ?? "-O1",
    ...(options.sanitize ? ["-fsanitize=address,undefined"] : []),
    "-I",
    runtimeDirectory,
    "-I",
    nativeIoDirectory,
    ...programSources(options.program),
    ...runtimeSources(),
    "-lpthread",
    "-o",
    executable,
  ];
  const run = runClockCommand("zig", args);
  if (run.status !== 0) throw new Error(describeFailure("zig", args, run));
  return {
    executable,
    invocation: ["zig", ...args],
    target: options.target,
  };
}

/** The capability record one platform adapter configuration reports. */
export interface ClockCapabilities {
  readonly backend: string;
  readonly fallback: boolean;
  readonly monotonic: string | null;
  readonly realTime: string | null;
  readonly wait: string | null;
  readonly wakeup: string | null;
}

/** One wait observed across threads. */
export interface ClockThreadWait {
  readonly accepted: boolean;
  readonly elapsedMicroseconds: number;
  readonly result: string;
  readonly wakeLatencyMicroseconds: number;
}

/** One facility configuration of the native clock probe. */
export interface ClockProbeConfiguration {
  readonly capabilities: ClockCapabilities;
  readonly configuration: string;
  readonly crossThreadWakeup?: ClockThreadWait;
  readonly deadlineWait: {
    readonly cpuMicroseconds?: number;
    readonly elapsedMicroseconds?: number;
    readonly reachedDeadline?: boolean;
    readonly requestedMilliseconds?: number;
    readonly result: string;
  };
  readonly indefiniteWait?: ClockThreadWait;
  readonly monotonic: {
    readonly available: boolean;
    readonly nanosecondsPerRead: number;
    readonly nonDecreasing: boolean;
    readonly reads: number;
    readonly resolutionNanoseconds: number;
  };
  readonly pendingWakeup?: {
    readonly accepted: boolean;
    readonly first: string;
    readonly firstElapsedMicroseconds: number;
    readonly second: string;
  };
  readonly realTime: {
    readonly available: boolean;
    readonly differenceFromTimespecGetMilliseconds: number;
    readonly integral: boolean;
    readonly nanosecondsPerRead: number;
    readonly resolutionNanoseconds: number;
  };
  readonly restrictions: number;
  readonly shutdown: {
    readonly descriptorsAfter: number;
    readonly descriptorsBefore: number;
    readonly descriptorsOpen: number;
    readonly threadsBeforeClose: number;
  };
  readonly wakeupAvailable: boolean;
}

/** The complete record of one native clock probe run. */
export interface ClockProbeReport {
  readonly configurations: readonly ClockProbeConfiguration[];
  readonly host: {
    readonly machine: string;
    readonly release: string;
    readonly system: string;
    readonly version: string;
  };
}

function parseProbeRecord<ProbeRecord>(line: string): ProbeRecord {
  // SAFETY: the checked-in probe prints exactly these record shapes.
  return JSON.parse(line) as ProbeRecord;
}

/** Run a built probe and parse its JSON-lines record. */
export function runClockProbe(
  build: ClockBuild,
  waitMilliseconds: number,
): ClockProbeReport {
  const args = [`${waitMilliseconds}`];
  const run = runClockCommand(build.executable, args);
  if (run.status !== 0 || run.stderr !== "") {
    throw new Error(describeFailure(build.executable, args, run));
  }
  const [header = "", ...rest] = run.stdout.trimEnd().split("\n");
  const { host } = parseProbeRecord<{
    readonly host: ClockProbeReport["host"];
  }>(header);
  const configurations = rest.map((line) =>
    parseProbeRecord<ClockProbeConfiguration>(line),
  );
  return { configurations, host };
}

/** Run the scheduler harness once over one schedule. */
export function runClockScheduler(
  build: ClockBuild,
  input: string,
  environment: Readonly<Record<string, string>> = {},
): ClockRun {
  return runClockCommand(build.executable, [], { environment, input });
}

/** Use the production adapter for optimized clock properties and probes. */
function buildOptimizedClockProgram(options: ClockBuildOptions): ClockBuild {
  const target =
    options.target === "x86_64-linux-gnu"
      ? "linux-x86_64-gnu"
      : options.target === "aarch64-macos"
        ? "macos-aarch64"
        : options.target === "aarch64-linux-musl"
          ? "linux-aarch64-musl"
          : undefined;
  if (target == null) {
    throw new Error(`Unsupported optimized clock target: ${options.target}.`);
  }
  const directory = join(options.directory, options.program);
  mkdirSync(directory, { recursive: true });
  const sources = programSources(options.program);
  const variables = Object.fromEntries(
    (nativeToolchain.environment?.inherit ?? []).flatMap((name) => {
      const value = process.env[name];
      return value == null ? [] : [[name, value]];
    }),
  );
  const plan = nativeToolchain.createBuildPlan({
    buildConfiguration: nativeBuildConfiguration,
    generatedSourcePath: sources[0]!,
    additionalGeneratedSourcePaths: sources.slice(1),
    runtimeDirectory,
    runtimeSourcePaths: runtimeSources(),
    target: describeTarget(target),
    workingDirectory: directory,
    environment: { variables },
  });
  const link = plan.requests.at(-1)!;
  const invocation = [link.command, ...link.args, "-lpthread"];
  for (const request of plan.requests) {
    const args =
      request === link ? [...request.args, "-lpthread"] : request.args;
    const run = spawnSync(request.command, args, {
      cwd: request.cwd,
      env: request.environment?.variables,
      encoding: "utf8",
    });
    if (run.status !== 0) {
      throw new Error(
        `build-config=${nativeBuildConfiguration}\n` +
          describeFailure(request.command, args, run),
      );
    }
  }
  return {
    executable: plan.executablePath,
    invocation,
    target: options.target,
  };
}
