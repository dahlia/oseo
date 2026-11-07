import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import type { Command, PerfHost } from "./plan.ts";
import { isNumber } from "../value-kinds.ts";
import { parsedObject } from "../structured-data.ts";

/** A subprocess failure cannot be mistaken for a valid timing sample. */
export interface Execution {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
  readonly signal: string | null;
  readonly wallMs: number;
}

/** Injected execution tests failure handling without benchmarking. */
export type Executor = (command: Command) => Execution;

/** Execute one bounded command; this function never runs during preparation. */
export function execute(command: Command): Execution {
  const start = performance.now();
  const result = spawnSync(command.command, command.args, {
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error != null) throw result.error;
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
    signal: result.signal,
    wallMs: performance.now() - start,
  };
}

const prefix = "OSEO_OBSERVATIONS ";
const counterKeys = [
  "guardHits",
  "guardMisses",
  "overflowMisses",
  "genericAdditionCalls",
  "allocations",
  "collections",
] as const;

/** The compiler's private counters, collected only in a separate build. */
export type Counters = Readonly<Record<(typeof counterKeys)[number], number>>;

/** Missing, duplicate, fractional, or negative counters invalidate evidence. */
export function parseCounters(stderr: string): Counters {
  const lines = stderr.split("\n").filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) throw new Error("Expected one observation record.");
  const parsed = parsedObject(
    JSON.parse(lines[0]!.slice(prefix.length)),
    "Performance counters",
  );
  for (const key of counterKeys) {
    const value = parsed[key];
    if (!isNumber(value) || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Invalid counter: ${key}`);
    }
  }
  // SAFETY: Each required counter was checked above as a nonnegative integer.
  return parsed as Counters;
}

/** Verify output before keeping metrics, including zero-exit wrong output. */
export function checkExecution(
  result: Execution,
  id: string,
  iterations: number,
  observed = false,
): number {
  if (result.status !== 0 || result.signal != null) {
    throw new Error(`Execution failed: ${result.status}/${result.signal}`);
  }
  const lines = result.stdout.trimEnd().split("\n");
  const time = /^PERF_TIME (\d+)$/u.exec(lines[1] ?? "");
  if (
    lines.length !== 2 ||
    lines[0] !== `PERF_OK ${id} ${iterations}` ||
    time?.[1] == null
  ) {
    throw new Error(`Self-check output mismatch: ${id}`);
  }
  if (observed) {
    parseCounters(result.stderr);
    if (
      result.stderr
        .split("\n")
        .some((line) => line !== "" && !line.startsWith(prefix))
    )
      throw new Error("Unexpected stderr from observed build.");
  } else if (result.stderr.includes(prefix)) {
    throw new Error("Instrumented build cannot supply timing evidence.");
  } else if (
    result.stderr !== "" &&
    !/^Warning: disabling flag --expose_wasm due to conflicting flags\n$/u.test(
      result.stderr,
    )
  ) {
    throw new Error(`Unexpected stderr: ${result.stderr}`);
  }
  const runtimeMs = Number(time[1]);
  if (!Number.isSafeInteger(runtimeMs)) throw new Error("Invalid runtime.");
  if (!Number.isFinite(result.wallMs) || result.wallMs < 0) {
    throw new Error("Invalid wall time.");
  }
  return runtimeMs;
}

/** Peak RSS commands run separately from timing to avoid wrapper overhead. */
export function rssCommand(host: PerfHost, command: Command): Command {
  return {
    command: "/usr/bin/time",
    args: [
      ...(host === "linux-x86_64-gnu" ? ["-f", "PERF_RSS_KIB %M"] : ["-l"]),
      command.command,
      ...command.args,
    ],
  };
}

/** GNU time uses KiB; BSD time uses bytes. Normalize both to bytes. */
export function parseRss(host: PerfHost, stderr: string): number {
  const pattern =
    host === "linux-x86_64-gnu"
      ? /^PERF_RSS_KIB (\d+)$/gmu
      : /^\s*(\d+)\s+maximum resident set size\s*$/gmu;
  const matches = [...stderr.matchAll(pattern)];
  if (matches.length !== 1) throw new Error("Expected one peak RSS record.");
  const bytes =
    Number(matches[0]![1]) * (host === "linux-x86_64-gnu" ? 1024 : 1);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new Error("Invalid peak RSS.");
  }
  return bytes;
}
