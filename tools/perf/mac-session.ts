/* eslint-disable no-await-in-loop -- Phases and cleanup are ordered. */
import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isObject, isString } from "../value-kinds.ts";

/**
 * A shell-free launch; env replaces inheritance and contains no secrets.
 */
export interface SessionCommand {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly stdin: Uint8Array;
  /** Null means no supervisor deadline; retain the owning driver's budgets. */
  readonly timeoutMs: number | null;
}

/** Raw child outcome, including incomplete or unsuccessful attempts. */
export interface CommandRecord {
  readonly directory: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly pid: number | null;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly failure: string | null;
  readonly cleanup: "gone" | "unknown";
}

function errorText(error: Error | NodeJS.ErrnoException): string {
  return error.message;
}

function hasCode<Candidate>(
  error: Candidate,
): error is Candidate & { readonly code: string } {
  return isObject(error) && "code" in error && isString(error.code);
}

function signalGroup(pid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (hasCode(error) && error.code === "ESRCH") return false;
    throw error;
  }
}

function checkCommand(command: SessionCommand): void {
  if (!isAbsolute(command.executable) || !isAbsolute(command.cwd)) {
    throw new Error("Command executable and cwd must be absolute.");
  }
  if (
    command.timeoutMs !== null &&
    (!Number.isSafeInteger(command.timeoutMs) ||
      command.timeoutMs <= 0 ||
      command.timeoutMs > 2_147_483_647)
  ) {
    throw new Error("Invalid explicit command timeout.");
  }
}

/**
 * Run one POSIX child in its own process group with file-backed byte streams.
 * Only that group is signaled. Escaped sessions and SIGKILL of this supervisor
 * cannot be recovered here; the future CI job must retain partial evidence.
 */
export async function runSessionCommand(
  command: SessionCommand,
  directory: string,
  signal?: AbortSignal,
): Promise<CommandRecord> {
  checkCommand(command);
  if (!isAbsolute(directory))
    throw new Error("Evidence path must be absolute.");
  await mkdir(directory, { mode: 0o700 });
  await writeFile(
    join(directory, "request.json"),
    JSON.stringify({ ...command, stdin: "stdin.bin" }, null, 2),
    { mode: 0o600 },
  );
  await writeFile(join(directory, "stdin.bin"), command.stdin, {
    mode: 0o600,
  });
  const startedAt = new Date().toISOString();
  let pid: number | null = null;
  let code: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  let failure: string | null = null;
  let cleanup: "gone" | "unknown" = "gone";
  const descriptors: number[] = [];
  try {
    descriptors.push(openSync(join(directory, "stdin.bin"), "r"));
    descriptors.push(openSync(join(directory, "stdout.bin"), "wx", 0o600));
    descriptors.push(openSync(join(directory, "stderr.bin"), "wx", 0o600));
    if (process.platform === "win32") {
      throw new Error("POSIX owned process groups are unavailable on Windows.");
    }
    if (signal?.aborted) throw new Error("Interrupted before launch.");
    const child = spawn(command.executable, [...command.argv], {
      cwd: command.cwd,
      env: { ...command.env },
      stdio: descriptors,
      detached: true,
      shell: false,
    });
    pid = child.pid ?? null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (reason: string): void => {
      failure ??= reason;
      if (pid === null) return;
      try {
        signalGroup(pid, "SIGTERM");
      } catch (error) {
        cleanup = "unknown";
        failure += `; terminate: ${String(error)}`;
      }
      // This is failure cleanup, never a successful-work deadline.
      killTimer ??= setTimeout(() => {
        if (pid === null) return;
        try {
          signalGroup(pid, "SIGKILL");
        } catch (error) {
          cleanup = "unknown";
          failure += `; kill: ${String(error)}`;
        }
      }, 1_000);
    };
    const abort = (): void => stop("Interrupted.");
    try {
      await new Promise<void>((resolve) => {
        child.once("error", (error) => {
          failure ??= errorText(error);
        });
        child.once("close", (status, termination) => {
          code = status;
          exitSignal = termination;
          resolve();
        });
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
        if (command.timeoutMs !== null) {
          timer = setTimeout(() => stop("Command timeout."), command.timeoutMs);
        }
      });
    } finally {
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", abort);
    }
    if (pid !== null && signalGroup(pid, 0)) {
      failure ??= "Child left a live process group.";
      signalGroup(pid, "SIGKILL");
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (!signalGroup(pid, 0)) break;
        await delay(20);
      }
      if (signalGroup(pid, 0)) cleanup = "unknown";
    }
    if (code !== 0 || exitSignal !== null) {
      failure ??= "Child exited unsuccessfully.";
    }
  } catch (error) {
    failure ??= String(error);
    if (pid !== null) cleanup = "unknown";
  } finally {
    for (const descriptor of descriptors) closeSync(descriptor);
  }
  const record: CommandRecord = {
    directory,
    startedAt,
    finishedAt: new Date().toISOString(),
    pid,
    code,
    signal: exitSignal,
    failure,
    cleanup,
  };
  await writeFile(join(directory, "result.json"), JSON.stringify(record), {
    mode: 0o600,
  });
  return record;
}

/** Exact source checkout identity; status includes untracked files. */
export interface SessionSource {
  readonly sha: string;
  readonly tree: string;
  readonly status: string;
}

/** Whitelisted CI identity, never the complete environment. */
export interface SessionIdentity {
  readonly platform: string;
  readonly arch: string;
  readonly hostname: string;
  readonly githubActions: string | null;
  readonly runnerEnvironment: string | null;
  readonly runnerOs: string | null;
  readonly runnerArch: string | null;
  readonly runnerName: string | null;
  readonly imageOs: string | null;
  readonly imageVersion: string | null;
  readonly runId: string | null;
  readonly runAttempt: string | null;
  readonly job: string | null;
}

/** Read only documented runner variables and the actual Node execution host. */
export function macSessionIdentity(): SessionIdentity {
  return {
    platform: process.platform,
    arch: process.arch,
    hostname: hostname(),
    githubActions: process.env.GITHUB_ACTIONS ?? null,
    runnerEnvironment: process.env.RUNNER_ENVIRONMENT ?? null,
    runnerOs: process.env.RUNNER_OS ?? null,
    runnerArch: process.env.RUNNER_ARCH ?? null,
    runnerName: process.env.RUNNER_NAME ?? null,
    imageOs: process.env.ImageOS ?? null,
    imageVersion: process.env.ImageVersion ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    job: process.env.GITHUB_JOB ?? null,
  };
}

/** Fixed categories whose raw observations require an integration decision. */
export type MacProbe =
  | "architecture"
  | "os"
  | "load"
  | "memory"
  | "hardware"
  | "virtualMemory"
  | "power"
  | "processes"
  | "disk";

const probeArguments = {
  architecture: ["/usr/bin/uname", "-m"],
  os: ["/usr/bin/sw_vers", "-productVersion"],
  load: ["/usr/sbin/sysctl", "vm.loadavg"],
  memory: ["/usr/sbin/sysctl", "hw.memsize"],
  hardware: ["/usr/sbin/sysctl", "hw.model", "hw.ncpu"],
  virtualMemory: ["/usr/bin/vm_stat"],
  power: ["/usr/bin/pmset", "-g"],
  processes: ["/bin/ps", "-A", "-c", "-o", "pid,ppid,uid,pcpu,pmem,comm"],
  disk: ["/bin/df", "-k"],
} satisfies Readonly<Record<MacProbe, readonly string[]>>;

/** Construct native read-only probes with a fixed environment. */
export function macSessionProbe(probe: MacProbe, cwd: string): SessionCommand {
  const [executable, ...argv] = probeArguments[probe];
  if (executable === undefined) throw new Error("Missing probe executable.");
  return {
    executable,
    argv: probe === "disk" ? [...argv, cwd] : argv,
    cwd,
    env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LC_ALL: "C" },
    stdin: new Uint8Array(),
    timeoutMs: 600_000,
  };
}

/** Raw probe completion is separate from interpretation or admission. */
export interface ProbeRecord {
  readonly probe: MacProbe;
  readonly command: CommandRecord;
  readonly observation: "unassessed" | "unknown" | "failed";
}

/** Before/after host conditions, including failed and uninterpreted probes. */
export interface SessionSnapshot {
  readonly at: string;
  readonly identity: SessionIdentity;
  readonly source: SessionSource;
  readonly probes: readonly ProbeRecord[];
}

/**
 * Integration-owned review of actual tool, process and resource evidence.
 * Unknown/failed conditions never authorize measurement. A known condition
 * references raw evidence and states whether the reviewed limit was met.
 */
export type AdmissionCondition =
  | {
      readonly status: "known";
      readonly accepted: boolean;
      readonly evidence: string;
    }
  | { readonly status: "unknown" | "failed"; readonly reason: string };

/** The caller must account for each required VM condition explicitly. */
export interface SessionAdmission {
  readonly load: AdmissionCondition;
  readonly memory: AdmissionCondition;
  readonly disk: AdmissionCondition;
  readonly power: AdmissionCondition;
  readonly processes: AdmissionCondition;
  readonly tools: AdmissionCondition;
  readonly scope: "github-hosted-vm";
}

/** Ordered commands, supplied only after the owning H/P APIs have landed. */
export interface SessionPhases {
  readonly build: SessionCommand;
  readonly correctness: SessionCommand;
  readonly discovery: SessionCommand;
  readonly measure: SessionCommand;
  readonly profile: SessionCommand;
  readonly archive: SessionCommand;
  readonly upload: SessionCommand;
}

/**
 * Hermetic test seam. Supplying this always marks the result simulated and
 * records the actual process OS separately; it cannot attest Mac acceptance.
 */
export interface SimulatedMacHost {
  readonly identity: () => SessionIdentity;
  readonly source: () => Promise<SessionSource>;
  readonly probe: (name: MacProbe, cwd: string) => SessionCommand;
}

/** Prepared session inputs; no CLI, matrix validation or measured values. */
export interface MacSessionOptions {
  readonly checkout: string;
  readonly directory: string;
  readonly expectedSource: SessionSource;
  readonly expectedIdentity: SessionIdentity;
  readonly phases: SessionPhases;
  /** Called after build, correctness, discovery and raw admission probes. */
  readonly assess: (snapshot: SessionSnapshot) => Promise<SessionAdmission>;
  readonly signal?: AbortSignal;
  readonly simulatedHost?: SimulatedMacHost;
}

/** Supervisor completion is not correctness, capture or Measurement exit. */
export interface MacSessionResult {
  readonly status: "succeeded" | "failed";
  readonly simulated: boolean;
  readonly failures: readonly string[];
  readonly commands: readonly CommandRecord[];
}

async function gitSource(
  checkout: string,
  directory: string,
  signal: AbortSignal,
): Promise<SessionSource> {
  const output: string[] = [];
  const commands = [
    ["rev-parse", "HEAD"],
    ["rev-parse", "HEAD^{tree}"],
    [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--ignore-submodules=none",
    ],
  ];
  await mkdir(directory, { mode: 0o700 });
  for (const [index, argv] of commands.entries()) {
    const record = await runSessionCommand(
      {
        executable: "/usr/bin/git",
        argv: ["--no-optional-locks", "-C", checkout, ...argv],
        env: { PATH: "/usr/bin:/bin", LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" },
        cwd: checkout,
        stdin: new Uint8Array(),
        timeoutMs: 600_000,
      },
      join(directory, String(index)),
      signal,
    );
    if (record.failure !== null) throw new Error("Source probe failed.");
    output.push(await readFile(join(record.directory, "stdout.bin"), "utf8"));
  }
  const [sha, tree, status] = output;
  if (sha === undefined || tree === undefined || status === undefined) {
    throw new Error("Source probe incomplete.");
  }
  return { sha: sha.trim(), tree: tree.trim(), status };
}

function checkSource(actual: SessionSource, expected: SessionSource): void {
  if (
    !/^[0-9a-f]{40}$/.test(actual.sha) ||
    !/^[0-9a-f]{40}$/.test(actual.tree) ||
    actual.sha !== expected.sha ||
    actual.tree !== expected.tree ||
    actual.status !== "" ||
    expected.status !== ""
  ) {
    throw new Error("Source SHA/tree/clean mismatch.");
  }
}

function checkIdentity(
  actual: SessionIdentity,
  expected: SessionIdentity,
): void {
  if (
    actual.platform !== "darwin" ||
    actual.arch !== "arm64" ||
    actual.githubActions !== "true" ||
    actual.runnerEnvironment !== "github-hosted" ||
    actual.runnerOs !== "macOS" ||
    actual.runnerArch !== "ARM64"
  ) {
    throw new Error("Requires actual darwin/arm64 hosted macos-15 VM.");
  }
  for (const key of Object.keys(actual)) {
    // SAFETY: Both operands share this closed, locally constructed shape.
    const name = key as keyof SessionIdentity;
    if (!actual[name] || actual[name] !== expected[name]) {
      throw new Error(`Unknown or mismatched identity: ${name}.`);
    }
  }
}

function admitted(admission: SessionAdmission): boolean {
  return (
    admission.scope === "github-hosted-vm" &&
    [
      admission.load,
      admission.memory,
      admission.disk,
      admission.power,
      admission.processes,
      admission.tools,
    ].every(
      (condition) =>
        condition.status === "known" &&
        condition.accepted &&
        condition.evidence.trim() !== "",
    )
  );
}

/**
 * Supervise serial phases on one hosted VM, preserving partial evidence.
 * The caller's admission assessment and owning H/P validators remain required;
 * a successful command is never promoted to artifact/byte/counter validation.
 * No whole-session deadline is added. SIGINT/SIGTERM fail the active child.
 */
export async function runMacSession(
  options: MacSessionOptions,
): Promise<MacSessionResult> {
  if (!isAbsolute(options.directory)) {
    throw new Error("Evidence directory must be absolute.");
  }
  const checkout = await realpath(options.checkout);
  const parent = await realpath(join(options.directory, ".."));
  const inside = relative(checkout, parent);
  if (
    inside === "" ||
    (inside !== ".." && !inside.startsWith("../") && !isAbsolute(inside))
  ) {
    throw new Error("Evidence must live outside the source checkout.");
  }
  await mkdir(options.directory, { mode: 0o700 });
  const failures: string[] = [];
  const commands: CommandRecord[] = [];
  const controller = new AbortController();
  const interrupt = (): void => controller.abort();
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  options.signal?.addEventListener("abort", interrupt, { once: true });
  if (options.signal?.aborted) interrupt();
  let sequence = 0;
  const identity = options.simulatedHost?.identity ?? macSessionIdentity;
  const probe = options.simulatedHost?.probe ?? macSessionProbe;
  const persist = async <Value>(name: string, value: Value): Promise<void> => {
    await writeFile(
      join(options.directory, name),
      JSON.stringify(value, null, 2),
      {
        mode: 0o600,
      },
    );
  };
  const snapshot = async (name: string): Promise<SessionSnapshot> => {
    const actualIdentity = identity();
    const source = options.simulatedHost
      ? await options.simulatedHost.source()
      : await gitSource(
          checkout,
          join(options.directory, `source-${sequence++}`),
          controller.signal,
        );
    await persist(`${name}-identity.json`, { actualIdentity, source });
    checkSource(source, options.expectedSource);
    checkIdentity(actualIdentity, options.expectedIdentity);
    const probes: ProbeRecord[] = [];
    for (const kind of Object.keys(probeArguments)) {
      // SAFETY: Keys come from the closed, module-owned probe table.
      const key = kind as MacProbe;
      const record = await runSessionCommand(
        probe(key, checkout),
        join(options.directory, `${name}-${key}`),
        controller.signal,
      );
      const bytes = await readFile(join(record.directory, "stdout.bin"));
      probes.push({
        probe: key,
        command: record,
        observation:
          record.failure !== null
            ? "failed"
            : bytes.length === 0 ||
                /^(unknown|unavailable)\s*$/i.test(bytes.toString().trim())
              ? "unknown"
              : "unassessed",
      });
    }
    const value: SessionSnapshot = {
      at: new Date().toISOString(),
      identity: actualIdentity,
      source,
      probes,
    };
    await persist(`${name}.json`, value);
    return value;
  };
  const phase = async (name: keyof SessionPhases): Promise<void> => {
    const source = options.simulatedHost
      ? await options.simulatedHost.source()
      : await gitSource(
          checkout,
          join(options.directory, `source-${sequence++}`),
          controller.signal,
        );
    await persist(`${name}-source.json`, source);
    checkSource(source, options.expectedSource);
    const actual = identity();
    await persist(`${name}-identity.json`, actual);
    checkIdentity(actual, options.expectedIdentity);
    if (controller.signal.aborted) throw new Error("Session interrupted.");
    const record = await runSessionCommand(
      options.phases[name],
      join(options.directory, name),
      controller.signal,
    );
    commands.push(record);
    if (record.failure !== null || record.cleanup !== "gone") {
      throw new Error(`${name}: ${record.failure ?? "cleanup unknown"}`);
    }
  };
  try {
    await persist("session.json", {
      simulated: options.simulatedHost !== undefined,
      executionHost: { platform: process.platform, arch: process.arch },
      expectedSource: options.expectedSource,
      expectedIdentity: options.expectedIdentity,
      physicalIsolation: "unknown",
      outsideVmConditions: "unknown",
      supervisor: { pid: process.pid, monitoring: "boundary probes only" },
      validation: "Owning H/P validators are not connected by this module.",
    });
    await phase("build");
    await phase("correctness");
    await phase("discovery");
    const before = await snapshot("before");
    const admission = await options.assess(before);
    await persist("admission.json", admission);
    if (
      before.probes.some((entry) => entry.observation !== "unassessed") ||
      !admitted(admission)
    ) {
      throw new Error("Admission unknown, failed or rejected.");
    }
    const architecture = before.probes.find(
      (entry) => entry.probe === "architecture",
    );
    if (
      architecture === undefined ||
      (
        await readFile(
          join(architecture.command.directory, "stdout.bin"),
          "utf8",
        )
      ).trim() !== "arm64"
    ) {
      throw new Error("uname architecture mismatch.");
    }
    const os = before.probes.find((entry) => entry.probe === "os");
    if (
      os === undefined ||
      !(
        await readFile(join(os.command.directory, "stdout.bin"), "utf8")
      ).startsWith("15.")
    ) {
      throw new Error("macOS product version mismatch or unknown.");
    }
    await phase("measure");
    const afterMeasure = await snapshot("after-measure");
    const afterAdmission = await options.assess(afterMeasure);
    await persist("after-measure-admission.json", afterAdmission);
    if (
      afterMeasure.probes.some((entry) => entry.observation !== "unassessed") ||
      !admitted(afterAdmission)
    ) {
      throw new Error("Post-measure conditions failed or unknown.");
    }
    await phase("profile");
  } catch (error) {
    failures.push(String(error));
  } finally {
    try {
      const after = await snapshot("after");
      const afterAdmission = await options.assess(after);
      await persist("after-admission.json", afterAdmission);
      if (
        after.probes.some((entry) => entry.observation !== "unassessed") ||
        !admitted(afterAdmission)
      ) {
        failures.push("Final conditions failed or unknown.");
      }
    } catch (error) {
      failures.push(`Final snapshot: ${String(error)}`);
    }
    // Keep finalizers in this same session. The CI workflow also needs always()
    // collection for supervisor crashes or service-level cancellation.
    for (const name of ["archive", "upload"] as const) {
      try {
        await phase(name);
      } catch (error) {
        failures.push(String(error));
      }
    }
    try {
      const finalSource = options.simulatedHost
        ? await options.simulatedHost.source()
        : await gitSource(
            checkout,
            join(options.directory, `source-${sequence++}`),
            controller.signal,
          );
      await persist("final-source.json", finalSource);
      checkSource(finalSource, options.expectedSource);
      const finalIdentity = identity();
      await persist("final-identity.json", finalIdentity);
      checkIdentity(finalIdentity, options.expectedIdentity);
    } catch (error) {
      failures.push(`Final source/identity: ${String(error)}`);
    }
    if (controller.signal.aborted) failures.push("Session interrupted.");
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    options.signal?.removeEventListener("abort", interrupt);
  }
  const result: MacSessionResult = {
    status: failures.length === 0 ? "succeeded" : "failed",
    simulated: options.simulatedHost !== undefined,
    failures,
    commands,
  };
  await persist("result.json", result);
  return result;
}
