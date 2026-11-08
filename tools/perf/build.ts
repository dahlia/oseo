import { accessSync, constants, copyFileSync, mkdirSync } from "node:fs";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  compileSource,
  describeTarget,
} from "../../packages/compiler/src/index.ts";
import { defaultComponents } from "../../packages/cli/src/index.ts";
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

import { digest, kernels } from "./corpus.ts";
import { artifact } from "./evidence.ts";
import type { Artifact } from "./evidence.ts";
import { Journal } from "./journal.ts";
import type { RawExecutor } from "./journal.ts";
import { executionText } from "./observation.ts";
import { defaultMethod, variants } from "./plan.ts";
import type { Command, Method, Variant } from "./plan.ts";
import { hostMetadata, prepare } from "./prepare.ts";
import type { HostMetadata } from "./prepare.ts";

/** Frozen command and all files that must stay unchanged during sampling. */
export interface BuiltForm {
  readonly id: string;
  readonly workload: string;
  readonly role: "timed" | "startup" | "observe";
  readonly source: Artifact;
  readonly run: Command;
  readonly identities: readonly Artifact[];
  readonly executable: Artifact | null;
  readonly generatedC: readonly Artifact[] | null;
  readonly specialization: "enabled" | "disabled" | null;
  readonly buildConfiguration: "optimized";
  readonly observeSpecialization: boolean;
}

/** Build and measurement phases exchange a sealed manifest, never recipes. */
export interface BuildManifest {
  readonly schema: 1;
  readonly host: HostMetadata;
  readonly method: Method;
  readonly forms: readonly BuiltForm[];
  readonly buildJournal: Artifact;
}

function executable(
  name: string,
  env: Readonly<Record<string, string>>,
): string {
  const paths = isAbsolute(name)
    ? [name]
    : (env.PATH ?? "").split(delimiter).map((dir) => resolve(dir, name));
  for (const path of paths) {
    try {
      accessSync(path, constants.X_OK);
      return resolve(path);
    } catch {
      // Try the next PATH entry; missing executables fail before a build.
    }
  }
  throw new Error(`Executable unavailable: ${name}`);
}

/** Selected child inputs that may be persisted with corpus evidence. */
export interface ChildEnvironment {
  readonly [name: string]: string;
}

/** Select process inputs needed by the fixed corpus and build tools. */
export function launchEnvironment(
  env: Readonly<Record<string, string>>,
): ChildEnvironment {
  const selected: Record<string, string> = {};
  const names = [
    ...zigToolchain.environment!.inherit,
    "TMPDIR",
    "TMP",
    "TEMP",
    "USERPROFILE",
    "APPDATA",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "USERNAME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
  ];
  for (const name of names) {
    if (env[name] != null) selected[name] = env[name];
  }
  return selected;
}

/** Keep the dispatch path and pass only the selected child environment. */
export function pinnedCommand(
  command: Command,
  cwd: string,
  env: Readonly<Record<string, string>>,
): Command {
  const selected = launchEnvironment(env);
  return {
    ...command,
    command: executable(command.command, selected),
    cwd,
    env: selected,
    stdin: [],
  };
}

interface NativeOutput {
  readonly executable: string;
  readonly generatedC: readonly Artifact[];
}

function nativeBuild(
  source: string,
  directory: string,
  variant: Variant,
  observed: boolean,
  buildId: string,
  host: HostMetadata,
  journal: Journal,
  env: Readonly<Record<string, string>>,
): NativeOutput {
  mkdirSync(directory);
  const compiled = compileSource(
    defaultComponents.frontend,
    { sourceId: source, source: readFileSync(source, "utf8") },
    {
      specialization: variant.specialization!,
      observeSpecialization: observed,
    },
  );
  if (compiled.mir == null) {
    throw new Error(JSON.stringify(compiled.diagnostics));
  }
  const emitted = defaultComponents.backend.emit(compiled.mir);
  const units = [emitted, ...(emitted.compilationUnits ?? [])];
  for (const unit of units) {
    writeFileSync(join(directory, unit.sourceName), unit.source, {
      flag: "wx",
    });
  }
  const runtime = defaultComponents.runtime.getRuntimeInput();
  const sources: string[] = [];
  for (const asset of runtime.assets) {
    const path = join(directory, asset.name);
    copyFileSync(asset.url, path, constants.COPYFILE_EXCL);
    if (asset.kind === "source") sources.push(path);
  }
  const toolEnv: Record<string, string> = {};
  for (const name of zigToolchain.environment!.inherit) {
    if (env[name] != null) toolEnv[name] = env[name];
  }
  const buildUnits = emitted.compilationUnits ?? [emitted];
  const plan = zigToolchain.createBuildPlan({
    buildConfiguration: "optimized",
    compilerPath: executable("zig", env),
    environment: { variables: toolEnv },
    generatedSourcePath: join(directory, buildUnits[0]!.sourceName),
    additionalGeneratedSourcePaths: buildUnits
      .slice(1)
      .map((unit) => join(directory, unit.sourceName)),
    runtimeDirectory: directory,
    runtimeSourcePaths: sources,
    target: describeTarget(host.target),
    workingDirectory: directory,
  });
  const metadata = {
    source: artifact(source),
    compiler: artifact(realpathSync(plan.requests[0]!.command)),
    runtimeAssets: runtime.assets.map((asset) =>
      artifact(join(directory, asset.name)),
    ),
    specialization: variant.specialization,
    observeSpecialization: observed,
    runtimeAbiVersion: runtime.abiVersion,
    cache: "cold-private-no-archive-reuse",
    plan,
    generatedC: units.map((unit) => artifact(join(directory, unit.sourceName))),
  };
  writeFileSync(
    join(directory, "build.json"),
    JSON.stringify(metadata, null, 2),
  );
  for (const request of plan.requests) {
    const result = executionText(
      journal.run(
        {
          ...request,
          env: request.environment?.variables ?? toolEnv,
          stdin: [],
        },
        {
          phase: "build",
          role: "build",
          artifactId: buildId,
          round: null,
          retained: false,
          reason: "optimized-native-build",
          identities: [
            artifact(source),
            metadata.compiler,
            ...metadata.generatedC,
          ],
        },
      ),
    );
    if (result.status !== 0 || result.signal != null) {
      throw new Error(`Native build failed: ${directory}`);
    }
  }
  return { executable: plan.executablePath, generatedC: metadata.generatedC };
}

/** Build every role before Root enters its exclusive measurement slot. */
export function buildMatrix(
  destination: string,
  host: HostMetadata,
  env: Readonly<Record<string, string>>,
  executor?: RawExecutor,
): BuildManifest {
  if (host.dirty !== false) throw new Error("Build requires a clean tree.");
  const directory = resolve(destination);
  prepare(directory, host, executable("node", env));
  const journal = new Journal(join(directory, "builds"), executor);
  const forms: BuiltForm[] = [];
  for (const workload of [...kernels.map((kernel) => kernel.id), "startup"]) {
    const source = artifact(join(directory, `${workload}.js`));
    for (const variant of variants(
      { ...kernels[0]!, id: workload },
      directory,
      host.target,
      executable("node", env),
    )) {
      const roles =
        workload === "startup"
          ? (["startup"] as const)
          : variant.specialization == null
            ? (["timed"] as const)
            : (["timed", "observe"] as const);
      for (const role of roles) {
        let path = variant.executable;
        let generatedC: readonly Artifact[] | null = null;
        if (variant.specialization != null) {
          const native = nativeBuild(
            source.path,
            join(directory, `${workload}-${variant.id}-${role}`),
            variant,
            role === "observe",
            `${workload}/${variant.id}/${role}`,
            host,
            journal,
            env,
          );
          path = native.executable;
          generatedC = native.generatedC;
        } else {
          for (const recipe of variant.builds) {
            const command = pinnedCommand(recipe, directory, env);
            const result = executionText(
              journal.run(command, {
                phase: "build",
                role: "build",
                artifactId: `${workload}/${variant.id}`,
                round: null,
                retained: false,
                reason: "reference-build",
                identities: [source, artifact(realpathSync(command.command))],
              }),
            );
            if (result.status !== 0 || result.signal != null) {
              throw new Error(`Reference build failed: ${variant.id}`);
            }
          }
        }
        const run = pinnedCommand(
          { ...variant.run, command: path ?? variant.run.command },
          directory,
          env,
        );
        const binary = artifact(realpathSync(run.command));
        forms.push({
          id: variant.id,
          workload,
          role,
          source,
          run,
          identities: [
            source,
            binary,
            ...(generatedC ?? []),
            ...(variant.specialization == null
              ? []
              : [
                  artifact(
                    join(
                      directory,
                      `${workload}-${variant.id}-${role}`,
                      "build.json",
                    ),
                  ),
                ]),
          ],
          executable: path == null ? null : artifact(path),
          generatedC,
          specialization: variant.specialization,
          buildConfiguration: "optimized",
          observeSpecialization: role === "observe",
        });
      }
    }
  }
  const manifest: BuildManifest = {
    schema: 1,
    host,
    method: defaultMethod,
    forms,
    buildJournal: artifact(join(journal.directory, "launches.jsonl")),
  };
  const text = JSON.stringify(manifest, null, 2) + "\n";
  writeFileSync(join(directory, "built.json"), text, { flag: "wx" });
  writeFileSync(join(directory, "built.sha256"), digest(text), { flag: "wx" });
  return manifest;
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const destination = process.env.OSEO_PERF_DIRECTORY;
  if (destination == null)
    throw new Error("Set OSEO_PERF_DIRECTORY to a new path.");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] != null,
    ),
  );
  buildMatrix(destination, hostMetadata(), env);
}
