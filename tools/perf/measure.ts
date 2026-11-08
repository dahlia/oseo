import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { digest, kernels } from "./corpus.ts";
import type { BuildManifest, BuiltForm } from "./build.ts";
import { artifact, validateEvidence, validateProvenance } from "./evidence.ts";
import type { Evidence, KernelEvidence } from "./evidence.ts";
import { Journal } from "./journal.ts";
import type { RawExecutor, LaunchContext } from "./journal.ts";
import { checkExecution, executionText, parseCounters } from "./observation.ts";
import { parseRss, rssCommand, requireRssTool } from "./observation.ts";
import {
  defaultMethod,
  orderForRound,
  validateMethod,
  variants,
} from "./plan.ts";
import type { Sample } from "./sampling.ts";
import { hostMetadata } from "./prepare.ts";

const ids = [
  "oseo-enabled",
  "oseo-disabled",
  "node",
  "node-jitless",
  "deno",
  "bun",
  "node-sea",
  "deno-compile",
  "bun-compile",
];

/** Recheck frozen files without building or repairing artifacts. */
export function verifyMatrix(manifest: BuildManifest): void {
  validateMethod(manifest.method);
  if (
    (["warmups", "repetitions", "iterations", "order"] as const).some(
      (key) => manifest.method[key] !== defaultMethod[key],
    )
  ) {
    throw new Error("Driver requires the fixed 3/15/100 rotating policy.");
  }
  if (manifest.schema !== 1 || manifest.host.dirty !== false) {
    throw new Error("Invalid build provenance.");
  }
  const expected = [
    ...kernels.flatMap((kernel) =>
      ids.flatMap((id) => [
        `${kernel.id}/${id}/timed`,
        ...(id.startsWith("oseo-") ? [`${kernel.id}/${id}/observe`] : []),
      ]),
    ),
    ...ids.map((id) => `startup/${id}/startup`),
  ].toSorted();
  const actual = manifest.forms
    .map((form) => `${form.workload}/${form.id}/${form.role}`)
    .toSorted();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error("Incomplete built role matrix.");
  }
  for (const form of manifest.forms) {
    const native = form.id.startsWith("oseo-");
    const compiled =
      native || form.id.endsWith("compile") || form.id === "node-sea";
    if (
      form.buildConfiguration !== "optimized" ||
      form.observeSpecialization !== (form.role === "observe") ||
      (form.executable != null) !== compiled ||
      (form.generatedC != null) !== native ||
      (native &&
        (form.generatedC!.length === 0 ||
          form.specialization !== form.id.slice(5))) ||
      (!native && form.specialization != null) ||
      form.run.cwd == null ||
      form.run.env == null
    ) {
      throw new Error("Invalid artifact role or launch contract.");
    }
    if (form.executable != null && form.executable.path !== form.run.command) {
      throw new Error("Executable identity does not match launch.");
    }
    const recipe = variants(
      { ...kernels[0]!, id: form.workload },
      dirname(form.source.path),
      manifest.host.target,
      "unused",
    ).find((variant) => variant.id === form.id)!;
    if (JSON.stringify(form.run.args) !== JSON.stringify(recipe.run.args)) {
      throw new Error("Launch arguments do not match frozen source/form.");
    }
    const related = manifest.forms.filter((other) => other.id === form.id);
    if (
      related.some(
        (other) =>
          other.role !== form.role &&
          form.executable != null &&
          other.executable != null &&
          other.executable.sha256 === form.executable.sha256,
      )
    ) {
      throw new Error("Artifact roles must use separate executable bytes.");
    }
    const sameKernel = manifest.forms.filter(
      (other) => other.workload === form.workload,
    );
    if (
      sameKernel.some((other) => other.source.sha256 !== form.source.sha256)
    ) {
      throw new Error("Forms must use identical kernel source bytes.");
    }
    const files = [
      form.source,
      ...form.identities,
      ...(form.executable == null ? [] : [form.executable]),
      ...(form.generatedC ?? []),
    ];
    if (
      !form.identities.some(
        (file) => file.path === realpathSync(form.run.command),
      )
    ) {
      throw new Error("Unpinned launch executable.");
    }
    for (const file of files) {
      const current = artifact(file.path);
      if (current.sha256 !== file.sha256 || current.bytes !== file.bytes) {
        throw new Error(`Artifact changed: ${file.path}`);
      }
    }
  }
  const journal = artifact(manifest.buildJournal.path);
  if (
    journal.sha256 !== manifest.buildJournal.sha256 ||
    journal.bytes !== manifest.buildJournal.bytes
  ) {
    throw new Error("Build journal changed.");
  }
}

/** Read the sealed build manifest before accepting any launch. */
export function readMatrix(directory: string): BuildManifest {
  const text = readFileSync(join(directory, "built.json"), "utf8");
  if (digest(text) !== readFileSync(join(directory, "built.sha256"), "utf8")) {
    throw new Error("Build manifest digest mismatch.");
  }
  const manifest: BuildManifest = JSON.parse(text);
  verifyMatrix(manifest);
  return manifest;
}

/** Root records real slot/load conditions; the driver never invents them. */
export interface MeasurementOptions {
  readonly runId: string;
  readonly conditions: Evidence["conditions"];
  readonly rssFirst?: boolean;
}

/** Collect serial populations and retain every launch of frozen bytes. */
export function measureMatrix(
  manifest: BuildManifest,
  destination: string,
  options: MeasurementOptions,
  executor?: RawExecutor,
): Evidence {
  if (executor == null) requireRssTool();
  verifyMatrix(manifest);
  const measuredAt = new Date().toISOString();
  validateProvenance({
    host: manifest.host,
    measuredAt,
    runId: options.runId,
    conditions: options.conditions,
  });
  mkdirSync(destination, { recursive: false });
  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  writeFileSync(join(destination, "build-manifest.json"), manifestText, {
    flag: "wx",
  });
  writeFileSync(
    join(destination, "run.json"),
    JSON.stringify(
      {
        measuredAt,
        ...options,
        buildManifestSha256: digest(manifestText),
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  const journal = new Journal(join(destination, "raw"), executor);
  const seen = new Set<string>();
  const method = manifest.method;
  const launch = (
    form: BuiltForm,
    phase: LaunchContext["phase"],
    round: number,
    retained: boolean,
    reason: string,
  ) => {
    const first = !seen.has(`${form.run.command}/${form.source.sha256}`);
    const mac =
      manifest.host.target === "macos-aarch64" && form.executable != null;
    if (mac && first && retained) {
      throw new Error("Missing first-executable discard or RSS preflight.");
    }
    const raw = journal.run(
      phase === "rss" ? rssCommand(manifest.host.target, form.run) : form.run,
      {
        phase,
        role: form.role,
        artifactId: `${form.workload}/${form.id}/${form.role}`,
        round,
        retained,
        reason: mac && first ? "mac-first-new-executable" : reason,
        identities: form.identities,
      },
    );
    seen.add(`${form.run.command}/${form.source.sha256}`);
    return executionText(raw);
  };
  const find = (workload: string, id: string, role: BuiltForm["role"]) =>
    manifest.forms.find(
      (form) =>
        form.workload === workload && form.id === id && form.role === role,
    )!;
  try {
    const startup = new Map<string, number[]>(ids.map((id) => [id, []]));
    for (let round = 0; round < method.warmups + method.repetitions; round++) {
      for (const id of orderForRound(ids, round)) {
        const retained = round >= method.warmups;
        const result = launch(
          find("startup", id, "startup"),
          "startup",
          round - method.warmups,
          retained,
          retained ? "sample" : "warmup",
        );
        checkExecution(result, "startup", 1);
        if (retained) startup.get(id)!.push(result.wallMs);
      }
    }
    verifyMatrix(manifest);
    const measured: KernelEvidence[] = [];
    for (const kernel of kernels) {
      const samples: Sample[] = [];
      const rss = new Map<string, number[]>(ids.map((id) => [id, []]));
      const collectRss = () => {
        verifyMatrix(manifest);
        for (const id of ids) {
          const form = find(kernel.id, id, "timed");
          if (!seen.has(`${form.run.command}/${form.source.sha256}`)) {
            const result = launch(form, "runtime", -1, false, "rss-preflight");
            checkExecution(result, kernel.id, method.iterations);
          }
        }
        for (let round = 0; round < method.repetitions; round++) {
          for (const id of orderForRound(ids, round)) {
            const result = launch(
              find(kernel.id, id, "timed"),
              "rss",
              round,
              true,
              "rss-sample",
            );
            if (result.stderr.includes("OSEO_OBSERVATIONS ")) {
              throw new Error("Instrumented build cannot supply RSS evidence.");
            }
            checkExecution(
              { ...result, stderr: "" },
              kernel.id,
              method.iterations,
            );
            rss.get(id)!.push(parseRss(manifest.host.target, result.stderr));
          }
        }
        verifyMatrix(manifest);
      };
      if (options.rssFirst === true) collectRss();
      verifyMatrix(manifest);
      for (
        let round = 0;
        round < method.warmups + method.repetitions;
        round++
      ) {
        for (const id of orderForRound(ids, round)) {
          const retained = round >= method.warmups;
          const result = launch(
            find(kernel.id, id, "timed"),
            "runtime",
            round - method.warmups,
            retained,
            retained ? "sample" : "warmup",
          );
          const runtimeMs = checkExecution(
            result,
            kernel.id,
            method.iterations,
          );
          if (retained)
            samples.push({
              variant: id,
              round: round - method.warmups,
              runtimeMs,
              processMs: result.wallMs,
            });
        }
      }
      verifyMatrix(manifest);
      if (options.rssFirst !== true) collectRss();
      measured.push({
        id: kernel.id,
        source: find(kernel.id, ids[0]!, "timed").source,
        samples,
        variants: ids.map((id) => {
          const form = find(kernel.id, id, "timed");
          let counterBuild = null;
          if (id.startsWith("oseo-")) {
            const observed = find(kernel.id, id, "observe");
            verifyMatrix(manifest);
            const preflight = launch(
              observed,
              "observe",
              -1,
              false,
              "observed-preflight",
            );
            checkExecution(preflight, kernel.id, method.iterations, true);
            const result = launch(
              observed,
              "observe",
              0,
              false,
              "separate-counters",
            );
            checkExecution(result, kernel.id, method.iterations, true);
            verifyMatrix(manifest);
            counterBuild = {
              executable: observed.executable!,
              observeSpecialization: true as const,
              counters: parseCounters(result.stderr),
            };
          }
          return {
            id,
            executable: form.executable,
            generatedC: form.generatedC,
            startupMs: startup.get(id)!,
            peakRssBytes: rss.get(id)!,
            counterBuild,
          };
        }),
      });
    }
    verifyMatrix(manifest);
    const evidence: Evidence = {
      schema: 1,
      phase: "measured",
      runId: options.runId,
      measuredAt,
      host: manifest.host,
      method,
      buildConfiguration: "optimized",
      observeSpecialization: false,
      sanitizers: [],
      conditions: options.conditions,
      kernels: measured,
    };
    validateEvidence(evidence);
    writeFileSync(
      join(destination, "measurements.json"),
      JSON.stringify(evidence, null, 2) + "\n",
      { flag: "wx" },
    );
    return evidence;
  } catch (error) {
    writeFileSync(
      join(destination, "failure.json"),
      JSON.stringify({
        failedAt: new Date().toISOString(),
        error: String(error),
        journal: join(journal.directory, "launches.jsonl"),
        lastLaunch: journal.lastLaunch,
      }) + "\n",
      { flag: "wx" },
    );
    throw error;
  }
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const directory = process.env.OSEO_PERF_DIRECTORY;
  const destination = process.env.OSEO_PERF_RESULTS;
  const conditions = process.env.OSEO_PERF_CONDITIONS;
  if (directory == null || destination == null || conditions == null) {
    throw new Error(
      "Set OSEO_PERF_DIRECTORY, OSEO_PERF_RESULTS and " +
        "OSEO_PERF_CONDITIONS (JSON). Root must assign a measurement slot.",
    );
  }
  const manifest = readMatrix(directory);
  const current = hostMetadata();
  // SAFETY: These keys come directly from the HostMetadata producer.
  for (const key of Object.keys(manifest.host) as (keyof typeof current)[]) {
    if (current[key] !== manifest.host[key]) {
      throw new Error(`Producing host/source/tool identity changed: ${key}`);
    }
  }
  measureMatrix(manifest, resolve(destination), {
    runId: process.env.OSEO_PERF_RUN_ID ?? destination,
    conditions: JSON.parse(conditions),
    rssFirst: process.env.OSEO_PERF_RSS_FIRST === "1",
  });
}
