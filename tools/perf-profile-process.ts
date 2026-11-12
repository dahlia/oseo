import { spawn } from "node:child_process";
import { closeSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { isObject } from "./value-kinds.ts";

/** Launch evidence retains incomplete cleanup without inferring success. */
export interface RunRecord {
  readonly directory: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly startedUtc: string;
  readonly finishedUtc: string;
  /**
   * Process-local performance.now() bounds of the owned run, including bounded
   * cleanup after close. These profile lifecycles never enter timing samples;
   * the end is receipt creation, not an exact kernel exit instant.
   */
  readonly monotonicStartMs: number;
  readonly monotonicEndMs: number;
  readonly wallMs: number;
  readonly pid: number | null;
  readonly status: number | null;
  readonly signal: string | null;
  readonly error: string | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly cleanup: readonly string[];
  readonly groupGone: boolean;
}

/** One child and its group, which must never include unrelated processes. */
export interface OwnedRun {
  readonly pid: number | undefined;
  readonly done: Promise<RunRecord>;
  readonly exited: () => boolean;
  readonly stop: (reason: string) => void;
}

function groupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return !isObject(error) || !("code" in error) || error.code !== "ESRCH";
  }
}

/** Own a process group; retain bytes on timeout and spawn failure. */
export function launch(
  directory: string,
  name: string,
  argv: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>>,
  stdin: Buffer,
  timeoutMs: number,
): OwnedRun {
  const stdout = `${name}.stdout`;
  const stderr = `${name}.stderr`;
  const out = openSync(join(directory, stdout), "wx");
  const err = openSync(join(directory, stderr), "wx");
  const startedUtc = new Date().toISOString();
  const monotonicStartMs = performance.now();
  const child = spawn(argv[0]!, argv.slice(1), {
    cwd,
    env,
    detached: true,
    stdio: [stdin.length === 0 ? "ignore" : "pipe", out, err],
  });
  closeSync(out);
  closeSync(err);
  let exited = false;
  let settled = false;
  let error: string | null = null;
  let timedOut = false;
  const cleanup: string[] = [];
  const stop = (reason: string): void => {
    if (settled || child.pid == null || !groupExists(child.pid)) return;
    cleanup.push(reason);
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (cause) {
      cleanup.push(String(cause));
    }
  };
  child.on("error", (cause) => {
    error = String(cause);
  });
  // EPIPE is observable when a short-lived child closes input immediately.
  child.stdin?.on("error", (cause) => {
    error ??= String(cause);
  });
  child.stdin?.end(stdin);
  const timer = setTimeout(() => {
    timedOut = true;
    stop("timeout: SIGKILL owned process group");
  }, timeoutMs);
  const done = new Promise<RunRecord>((fulfill) => {
    child.once("close", async (status, signal) => {
      exited = true;
      clearTimeout(timer);
      stop("post-exit: SIGKILL remaining owned group members");
      // Bound observation; zombies may remain owned by an external reaper.
      for (let attempt = 0; attempt < 50; attempt++) {
        if (child.pid == null || !groupExists(child.pid)) break;
        // eslint-disable-next-line no-await-in-loop -- Observe group cleanup.
        await delay(20);
      }
      const monotonicEndMs = performance.now();
      const record: RunRecord = {
        directory,
        argv,
        cwd,
        env,
        startedUtc,
        finishedUtc: new Date().toISOString(),
        monotonicStartMs,
        monotonicEndMs,
        wallMs: monotonicEndMs - monotonicStartMs,
        pid: child.pid ?? null,
        status: child.pid == null ? null : status,
        signal,
        error,
        timedOut,
        stdout,
        stderr,
        cleanup,
        groupGone: child.pid == null || !groupExists(child.pid),
      };
      settled = true;
      writeJson(join(directory, `${name}.json`), record);
      fulfill(record);
    });
  });
  return { pid: child.pid, done, exited: () => exited, stop };
}

/** Own all subprocesses in one operation, including direct discovery probes. */
export class ProfilingSession {
  readonly runs: Set<OwnedRun> = new Set<OwnedRun>();
  interrupted: string | null = null;
  readonly #sigint = (): void => this.#interrupt("SIGINT");
  readonly #sigterm = (): void => this.#interrupt("SIGTERM");

  constructor() {
    process.on("SIGINT", this.#sigint);
    process.on("SIGTERM", this.#sigterm);
  }

  #interrupt(signal: string): void {
    this.interrupted ??= signal;
    for (const run of this.runs)
      run.stop(`signal ${signal}: cleanup owned group`);
  }

  /** Refuse fresh work after interruption, including later capture phases. */
  launch(...args: Parameters<typeof launch>): OwnedRun {
    if (this.interrupted != null) {
      throw new Error(`Interrupted: ${this.interrupted}`);
    }
    const run = launch(...args);
    this.runs.add(run);
    return run;
  }

  /** Stop remaining groups and retain bounded, conservative cleanup results. */
  async finish(): Promise<readonly RunRecord[]> {
    try {
      for (const run of this.runs) run.stop("finally: cleanup owned group");
      return await Promise.all([...this.runs].map((run) => run.done));
    } finally {
      process.off("SIGINT", this.#sigint);
      process.off("SIGTERM", this.#sigterm);
    }
  }
}

function writeJson<Value>(path: string, value: Value): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
