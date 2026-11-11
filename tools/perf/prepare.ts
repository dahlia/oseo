import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { parsedObject } from "../structured-data.ts";
import type { StructuredDataValue } from "../structured-data.ts";
import { isString } from "../value-kinds.ts";

import { digest, kernels, readKernel, renderKernel } from "./corpus.ts";
import { defaultMethod, perfHost, variants } from "./plan.ts";
import type { Method, PerfHost } from "./plan.ts";
import { validateMethod } from "./plan.ts";

/** Metadata required to interpret one host's measurements. */
export interface HostMetadata {
  readonly target: PerfHost;
  readonly os: string;
  readonly architecture: string;
  readonly cpu: string;
  readonly logicalCpus: number;
  readonly memoryBytes: number;
  readonly commit: string;
  readonly dirty: boolean;
  readonly node: string;
  readonly deno: string;
  readonly bun: string;
  readonly zig: string;
  readonly postject: string;
  readonly pinsSha256: string;
  readonly lockSha256: string;
}

function command(name: string, args: readonly string[]): string {
  return execFileSync(name, args, { encoding: "utf8", timeout: 30_000 }).trim();
}

/** Missing or ambiguous installations cannot identify the pinned SEA tool. */
export function postjectIdentity(text: string): string {
  const entries: StructuredDataValue = JSON.parse(text);
  if (!Array.isArray(entries) || entries.length !== 1) {
    throw new Error("Expected one active postject installation.");
  }
  const entry = parsedObject(entries[0], "Postject installation");
  if (
    entry.installed !== true ||
    entry.active !== true ||
    !isString(entry.version) ||
    entry.version.trim() === "" ||
    entry.version.trim().toLowerCase() === "unknown"
  ) {
    throw new Error("Expected one active postject installation.");
  }
  return text;
}

/** Capture identities only; no build or workload execution occurs here. */
export function hostMetadata(): HostMetadata {
  return {
    target: perfHost(platform(), arch()),
    os: `${platform()} ${release()}`,
    architecture: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    commit: command("git", ["rev-parse", "HEAD"]),
    dirty: command("git", ["status", "--porcelain"]) !== "",
    node: process.version,
    deno: command("deno", ["--version"]),
    bun: command("bun", ["--version"]),
    zig: command("zig", ["version"]),
    // postject has no version flag; retain mise's active installation record.
    postject: postjectIdentity(
      command("mise", ["ls", "--current", "--json", "npm:postject"]),
    ),
    pinsSha256: digest(readRepositoryFile("mise.toml")),
    lockSha256: digest(readRepositoryFile("pnpm-lock.yaml")),
  };
}

function readRepositoryFile(path: string): string {
  // This module is two levels below the checked-in repository inputs.
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

/**
 * Write source and argv recipes to a fresh directory. The build driver owns
 * native API composition; preparation starts no builds or workloads.
 */
export function prepare(
  destination: string,
  host: HostMetadata,
  nodeExecutable: string,
  method: Method = defaultMethod,
): void {
  validateMethod(method);
  const directory = resolve(destination);
  if (existsSync(directory)) throw new Error("Preparation directory exists.");
  mkdirSync(directory, { recursive: true });
  const startup = {
    id: "startup",
    expected: 0,
    license: "GPL-3.0-only",
    origin: "Original Oseo startup control",
  } as const;
  const corpus = [...kernels, startup].map((kernel) => {
    const source = renderKernel(
      kernel,
      kernel.id === "startup"
        ? "function benchmark() { return 0; }"
        : readKernel(kernel),
      kernel.id === "startup" ? 1 : method.iterations,
    );
    const sourcePath = resolve(directory, `${kernel.id}.js`);
    writeFileSync(sourcePath, source, { flag: "wx" });
    writeFileSync(
      sourcePath + ".sea.json",
      JSON.stringify(
        {
          main: sourcePath,
          output: sourcePath + ".blob",
          disableExperimentalSEAWarning: true,
          useSnapshot: false,
          useCodeCache: false,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    return {
      id: kernel.id,
      expected: kernel.expected,
      license: kernel.license,
      origin: kernel.origin,
      source: sourcePath,
      sourceSha256: digest(source),
      variants: variants(kernel, directory, host.target, nodeExecutable),
    };
  });
  writeFileSync(
    resolve(directory, "plan.json"),
    JSON.stringify(
      {
        schema: 1,
        phase: "prepared",
        preparedAt: new Date().toISOString(),
        host,
        method,
        buildConfiguration: "optimized",
        sanitizers: [],
        observeSpecialization: false,
        measurementBlocked:
          "Run perf:build, then Root assigns the perf:measure slot",
        corpus,
        counterBuild: {
          observeSpecialization: true,
          specialization: ["enabled", "disabled"],
          buildConfiguration: "optimized",
          timingEligible: false,
        },
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  prepare("artifacts/.oseo-perf/prepared", hostMetadata(), process.execPath);
  console.log(
    "Prepared artifacts/.oseo-perf/prepared; no measurements executed.",
  );
}
