import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { artifact, validateHostMetadata } from "./evidence.ts";
import { Journal, verifyJournal } from "./journal.ts";
import type { RawExecutor } from "./journal.ts";
import { readMatrix, verifyMatrix } from "./measure.ts";
import { checkExecution, executionText, parseCounters } from "./observation.ts";
import type { Counters } from "./observation.ts";
import { hostMetadata } from "./prepare.ts";
import type { HostMetadata } from "./prepare.ts";

/** Source tree and actual producing host, captured again after execution. */
export interface CorrectnessSource {
  readonly host: HostMetadata;
  readonly tree: string;
}

function currentSource(): CorrectnessSource {
  return {
    host: hostMetadata(),
    tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
      encoding: "utf8",
      timeout: 30_000,
    }).trim(),
  };
}

/** Test injection changes transport and metadata, never the role policy. */
export interface CorrectnessOptions {
  readonly source?: () => CorrectnessSource;
  readonly executor?: RawExecutor;
}

/** Check all frozen roles once without collecting performance populations. */
export function checkMatrix(
  directory: string,
  destination: string,
  options: CorrectnessOptions = {},
): void {
  mkdirSync(destination, { recursive: false });
  const journal = new Journal(join(destination, "raw"), options.executor);
  const completed: string[] = [];
  const observed: {
    readonly artifactId: string;
    readonly counters: Counters;
  }[] = [];
  let planned: readonly string[] = [];
  let attempted: string | null = null;
  let source: CorrectnessSource | null = null;
  let latestSource: CorrectnessSource | null = null;
  const flags = {
    phase: "correctness-only",
    retained: false,
    timingEligible: false,
  };
  const write = <Value>(name: string, value: Value) =>
    writeFileSync(
      join(destination, name),
      JSON.stringify(value, null, 2) + "\n",
      {
        flag: "wx",
      },
    );
  try {
    for (const name of ["built.json", "built.sha256"]) {
      const path = join(directory, name);
      if (existsSync(path)) copyFileSync(path, join(destination, name));
    }
    const readSource = options.source ?? currentSource;
    source = readSource();
    latestSource = source;
    const manifest = readMatrix(directory);
    planned = manifest.forms.map(
      (form) => `${form.workload}/${form.id}/${form.role}`,
    );
    const manifestIdentity = artifact(join(directory, "built.json"));
    const verifySource = (current: CorrectnessSource = readSource()) => {
      latestSource = current;
      validateHostMetadata(current.host);
      // SAFETY: These keys come directly from the HostMetadata producer.
      for (const key of Object.keys(current.host) as (keyof HostMetadata)[]) {
        if (current.host[key] !== manifest.host[key]) {
          throw new Error(
            `Producing host/source/tool identity changed: ${key}`,
          );
        }
      }
      if (source != null && current.tree !== source.tree) {
        throw new Error("Source tree changed during correctness execution.");
      }
      return current;
    };
    source = verifySource(source);
    write("run.json", {
      ...flags,
      startedAt: new Date().toISOString(),
      source,
      buildManifest: manifestIdentity,
    });
    const seen = new Set<string>();
    for (const form of manifest.forms) {
      attempted = `${form.workload}/${form.id}/${form.role}`;
      const key = `${form.run.command}/${form.source.sha256}`;
      const firstMac =
        manifest.host.target === "macos-aarch64" &&
        form.executable != null &&
        !seen.has(key);
      const result = executionText(
        journal.run(form.run, {
          phase: form.role === "timed" ? "runtime" : form.role,
          role: form.role,
          artifactId: attempted,
          round: null,
          retained: false,
          timingEligible: false,
          reason: firstMac ? "mac-first-new-executable" : "correctness-only",
          identities: form.identities,
        }),
      );
      seen.add(key);
      checkExecution(
        result,
        form.workload,
        form.role === "startup" ? 1 : manifest.method.iterations,
        form.role === "observe",
      );
      if (form.role === "observe") {
        observed.push({
          artifactId: attempted,
          counters: parseCounters(result.stderr),
        });
      }
      completed.push(attempted);
    }
    verifyMatrix(manifest);
    readMatrix(directory);
    if (
      artifact(join(directory, "built.json")).sha256 !== manifestIdentity.sha256
    ) {
      throw new Error("Build manifest changed during correctness execution.");
    }
    verifySource();
    const launches = verifyJournal(join(journal.directory, "launches.jsonl"));
    if (
      launches.length !== manifest.forms.length ||
      launches.some((row, index) => {
        const form = manifest.forms[index]!;
        return (
          row.artifactId !== completed[index] ||
          row.role !== form.role ||
          row.phase !== (form.role === "timed" ? "runtime" : form.role) ||
          row.retained !== false ||
          row.timingEligible !== false ||
          row.status !== 0 ||
          row.signal != null ||
          row.error != null
        );
      })
    ) {
      throw new Error("Incomplete or mixed correctness launch journal.");
    }
    write("correctness.json", {
      ...flags,
      source,
      buildManifest: manifestIdentity,
      checkedForms: completed.length,
      completed,
      observed,
      launches: artifact(join(journal.directory, "launches.jsonl")),
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    write("failure.json", {
      ...flags,
      source,
      latestSource,
      failedAt: new Date().toISOString(),
      error: String(error),
      attempted,
      completed,
      unattempted: planned.filter(
        (id) => id !== attempted && !completed.includes(id),
      ),
      journal: join(journal.directory, "launches.jsonl"),
      requests: join(journal.directory, "requests.jsonl"),
      lastLaunch: journal.lastLaunch,
    });
    throw error;
  }
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const directory = process.env.OSEO_PERF_DIRECTORY;
  const destination = process.env.OSEO_PERF_RESULTS;
  if (directory == null || destination == null) {
    throw new Error(
      "Set OSEO_PERF_DIRECTORY and OSEO_PERF_RESULTS to fresh absolute paths.",
    );
  }
  checkMatrix(resolve(directory), resolve(destination));
}
