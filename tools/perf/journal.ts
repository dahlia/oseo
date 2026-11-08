import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { artifact } from "./evidence.ts";
import type { Artifact } from "./evidence.ts";
import { explicitCommand, executeRaw } from "./observation.ts";
import type { RawExecution } from "./observation.ts";
import type { Command } from "./plan.ts";

/** Inject a byte executor without executing benchmark workloads in tests. */
export type RawExecutor = (command: Command) => RawExecution;

/** A launch's purpose is independent of its executable's build role. */
export interface LaunchContext {
  readonly phase: "build" | "runtime" | "startup" | "rss" | "observe";
  readonly artifactId: string;
  readonly role: "build" | "timed" | "startup" | "observe";
  readonly round: number | null;
  readonly retained: boolean;
  readonly timingEligible?: false;
  readonly reason: string;
  readonly identities: readonly Artifact[];
}

/** Persisted byte files and request metadata for one completed attempt. */
export interface LaunchRecord
  extends LaunchContext, Omit<RawExecution, "stdout" | "stderr"> {
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly stdin: Artifact;
  readonly stdout: Artifact;
  readonly stderr: Artifact;
  readonly enqueuedAt: string;
}

/** Append-only raw records survive output validation and subprocess failure. */
export class Journal {
  readonly directory: string;
  private sequence = 0;
  private last: LaunchRecord | null = null;
  private readonly executor: RawExecutor;

  constructor(directory: string, executor: RawExecutor = executeRaw) {
    mkdirSync(directory, { recursive: false });
    this.directory = directory;
    this.executor = executor;
  }

  /** Last completed transport record, including subprocess failures. */
  get lastLaunch(): LaunchRecord | null {
    return this.last;
  }

  /** Persist exact input/output bytes before any checker decodes text. */
  run(command: Command, context: LaunchContext): RawExecution {
    if (command.cwd == null || command.env == null || command.stdin == null) {
      throw new Error("Journal launches require explicit cwd, env and stdin.");
    }
    const input = explicitCommand(command);
    const id = String(this.sequence++).padStart(6, "0");
    const stdin = join(this.directory, `${id}.stdin`);
    writeFileSync(stdin, input.stdin, { flag: "wx" });
    const request = {
      id,
      ...context,
      command: input.command,
      args: input.args,
      cwd: input.cwd,
      env: input.env,
      stdin: artifact(stdin),
      enqueuedAt: new Date().toISOString(),
    };
    appendFileSync(
      join(this.directory, "requests.jsonl"),
      JSON.stringify(request) + "\n",
    );
    const result = this.executor(input);
    const stdout = join(this.directory, `${id}.stdout`);
    const stderr = join(this.directory, `${id}.stderr`);
    writeFileSync(stdout, result.stdout, { flag: "wx" });
    writeFileSync(stderr, result.stderr, { flag: "wx" });
    const { stdout: _stdout, stderr: _stderr, ...observation } = result;
    const record: LaunchRecord = {
      ...request,
      ...observation,
      stdout: artifact(stdout),
      stderr: artifact(stderr),
    };
    appendFileSync(
      join(this.directory, "launches.jsonl"),
      JSON.stringify(record) + "\n",
    );
    this.last = record;
    return result;
  }
}

/** Recheck request links and original bytes, including empty streams. */
export function verifyJournal(path: string): readonly LaunchRecord[] {
  const text = readFileSync(path, "utf8");
  if (text.trim() === "") throw new Error("Raw launch journal is empty.");
  const records: readonly LaunchRecord[] = text
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  const requests: readonly Partial<LaunchRecord>[] = readFileSync(
    join(dirname(path), "requests.jsonl"),
    "utf8",
  )
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  if (records.length !== requests.length) {
    throw new Error("Incomplete raw request/launch journal.");
  }
  for (const [index, record] of records.entries()) {
    if (record.id !== String(index).padStart(6, "0")) {
      throw new Error("Missing or duplicated raw launch identity.");
    }
    const request = requests[index]!;
    const required = [
      "id",
      "phase",
      "artifactId",
      "role",
      "round",
      "retained",
      "reason",
      "identities",
      "command",
      "args",
      "cwd",
      "env",
      "stdin",
      "enqueuedAt",
    ] as const;
    if (
      required.some(
        (key) => !Object.hasOwn(request, key) || !Object.hasOwn(record, key),
      )
    ) {
      throw new Error("Missing raw request/launch metadata.");
    }
    // SAFETY: Journal's request producer uses only LaunchRecord fields.
    for (const key of Object.keys(request) as (keyof LaunchRecord)[]) {
      if (JSON.stringify(request[key]) !== JSON.stringify(record[key])) {
        throw new Error(`Raw request/launch mismatch: ${record.id}/${key}`);
      }
    }
    for (const file of [record.stdin, record.stdout, record.stderr]) {
      const current = artifact(file.path);
      if (current.bytes !== file.bytes || current.sha256 !== file.sha256) {
        throw new Error(`Raw stream changed: ${file.path}`);
      }
    }
  }
  return records;
}
