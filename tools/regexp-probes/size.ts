/* eslint-disable no-await-in-loop -- Every build and run is measured. */

/**
 * The code-size probe.
 *
 * [*PLAN-REGEXP.md*](../../PLAN-REGEXP.md) asks for generated C size,
 * object size, final executable size, C compilation time, and first-use
 * cost. Every number here comes from a real build: the same frontend,
 * the same C backend, and the pinned Zig toolchain, driven directly so
 * that the compile step and the link step can be timed apart from each
 * other and from the runtime archive.
 *
 * Two build choices are deliberate and reported with the results. The
 * measurement target carries no sanitizer, because the address and
 * undefined-behavior sanitizers the reviewed native gates use change
 * both size and time by more than the effect being measured. The runtime
 * archive is built once and reused by every program, because it is a
 * fixed cost that no pattern moves.
 */

import { stat } from "node:fs/promises";
import { basename, join } from "node:path";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import { defaultComponents } from "../../packages/cli/src/index.ts";
import {
  compileSource,
  describeTarget,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import type {
  CompilerHost,
  ProcessEnvironment,
  ProcessRequest,
  TargetDescription,
} from "../../packages/compiler/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

/**
 * One built program and everything measured about it.
 *
 * The C compilation of the generated source and the link against the
 * runtime archive are separate timed steps, because
 * [*PLAN-REGEXP.md*](../../PLAN-REGEXP.md) asks for object size and C
 * compilation time and neither is visible in one combined invocation.
 * `attempts` is how many match attempts a timed program performs, which
 * is not the same as `output`: the program prints how many of them
 * matched.
 */
export interface SizeRow {
  readonly attempts: number;
  readonly compileNanoseconds: number;
  readonly executableBytes: number;
  readonly exitStatus: number;
  readonly generatedBytes: number;
  readonly id: string;
  readonly linkNanoseconds: number;
  readonly objectBytes: number;
  readonly objectTextBytes: number | undefined;
  readonly output: string;
  readonly patterns: number;
  readonly runNanoseconds: number;
  readonly stderr: string;
  readonly textBytes: number | undefined;
}

/** One separately compiled runtime component. */
export interface ComponentRow {
  readonly compileNanoseconds: number;
  readonly name: string;
  readonly objectBytes: number;
  readonly textBytes: number | undefined;
}

/**
 * Everything the code-size probe reports.
 *
 * `environment` records whether the toolchain's own environment policy
 * answered, because a build that fell back to ordinary inheritance is
 * not the build a composition root performs and its sizes and timings
 * are not comparable with one that did.
 */
export interface SizeMeasurement {
  readonly archiveBytes: number;
  readonly archiveNanoseconds: number;
  readonly components: readonly ComponentRow[];
  readonly environment: boolean;
  readonly programs: readonly SizeRow[];
  readonly target: string;
}

/**
 * One program the probe builds.
 *
 * `expectDiagnostic` marks a program whose whole point is the diagnostic
 * it reports. Such a program has to fail, and it has to fail by printing
 * that diagnostic: a crash, a loader failure, or an unrelated
 * diagnostic exits nonzero too, and accepting any of them would report
 * a boundary the runtime never reached.
 */
export interface SizeProgram {
  readonly attempts: number;
  readonly expectDiagnostic?: string;
  readonly id: string;
  readonly patterns: number;
  readonly source: string;
}

/**
 * The number of executions timed for one program.
 *
 * The smallest of them is reported. Several are needed because this
 * measurement shares a machine with whatever else is building on it, and
 * one execution under load says more about the load than about the
 * program.
 */
const runSamples = 7;

/**
 * Everything every build step in one run shares.
 *
 * `environment` is the snapshot the toolchain's own policy admits,
 * captured once. A real Oseo build passes that snapshot into its build
 * plan, so a probe that omitted it would let an ambient variable such as
 * `CPATH` reach the compiler and would measure a build no ordinary one
 * performs. It stays `undefined` only on a host that cannot answer the
 * policy at all, which the report names.
 */
interface BuildContext {
  readonly directory: string;
  readonly environment: ProcessEnvironment | undefined;
  readonly host: CompilerHost;
  readonly target: TargetDescription;
}

/** The toolchain environment snapshot, or `undefined` where none is. */
async function captureToolchainEnvironment(
  host: CompilerHost,
): Promise<ProcessEnvironment | undefined> {
  const policy = zigToolchain.environment;
  if (policy == null || host.captureEnvironment == null) return undefined;
  try {
    return await host.captureEnvironment(policy);
  } catch {
    // An unavailable snapshot keeps the build on ordinary inheritance,
    // which is what the composition root does with the same failure.
    return undefined;
  }
}

/** The measurement target: the execution host's target, unsanitized. */
export function measurementTarget(
  host: CompilerHost,
): TargetDescription | undefined {
  const executionHost = host.executionHost;
  if (executionHost == null) return undefined;
  const selected = targetForExecutionHost(executionHost);
  if (selected == null) return undefined;
  return { ...describeTarget(selected.name), sanitizers: [] };
}

async function fileBytes(path: string): Promise<number> {
  const information = await stat(path);
  return information.size;
}

/**
 * The `.text` size one binutils-compatible `size` reports, or
 * `undefined` where no such tool answered.
 */
async function textBytes(
  host: CompilerHost,
  directory: string,
  path: string,
): Promise<number | undefined> {
  let observation;
  try {
    observation = await host.run({
      args: ["-A", path],
      command: "size",
      cwd: directory,
    });
  } catch {
    return undefined;
  }
  if (observation.exitStatus !== 0) return undefined;
  for (const line of observation.stdout.split("\n")) {
    const parts = line.trim().split(/\s+/u);
    if (parts[0] !== ".text") continue;
    const value = Number(parts[1]);
    if (Number.isSafeInteger(value)) return value;
  }
  return undefined;
}

async function timed<T>(
  action: () => Promise<T>,
): Promise<{ readonly nanoseconds: number; readonly value: T }> {
  const started = process.hrtime.bigint();
  const value = await action();
  return { nanoseconds: Number(process.hrtime.bigint() - started), value };
}

function requireSuccess(
  step: string,
  observation: { readonly exitStatus: number; readonly stderr: string },
): void {
  if (observation.exitStatus === 0) return;
  throw new Error(`${step} failed: ${observation.stderr.trim()}`);
}

/** Require the exact failure a boundary program exists to observe. */
function requireDiagnostic(
  id: string,
  diagnostic: string,
  observation: {
    readonly exitStatus: number;
    readonly stderr: string;
    readonly stdout: string;
  },
): void {
  if (observation.exitStatus === 0) {
    throw new Error(
      `Probe program ${id} was expected to report ${diagnostic} and ` +
        "exited successfully.",
    );
  }
  const reported = `${observation.stdout}\n${observation.stderr}`;
  if (reported.includes(diagnostic)) return;
  throw new Error(
    `Probe program ${id} exited ${observation.exitStatus} without ` +
      `reporting ${diagnostic}: ${observation.stderr.trim()}`,
  );
}

/** Copy the reviewed runtime assets into one working directory. */
async function copyRuntime(context: BuildContext): Promise<readonly string[]> {
  const input = cRuntimeProvider.getRuntimeInput();
  const sources: string[] = [];
  for (const asset of input.assets) {
    const contents = await context.host.readTextFile(asset.url);
    const path = join(context.directory, asset.name);
    await context.host.writeTextFile(path, contents);
    if (asset.kind === "source") sources.push(path);
  }
  return sources;
}

/**
 * The properties a factory produced, or none of them.
 *
 * An optional property is omitted rather than set to `undefined`, which
 * is what `exactOptionalPropertyTypes` requires of a build plan input
 * and of a process request.
 */
function includePropertiesWhen<const Properties extends object>(
  properties: () => Properties | undefined,
): Properties | { [Key in keyof Properties]?: never } {
  return properties() ?? {};
}

/** The environment fields a build plan carries, where one was captured. */
function planEnvironment(
  context: BuildContext,
): { readonly environment: ProcessEnvironment } | { environment?: never } {
  return includePropertiesWhen(() => {
    const environment = context.environment;
    if (environment == null) return undefined;
    return { environment };
  });
}

/**
 * One planned request re-issued with different arguments.
 *
 * The toolchain adapter owns the command, the working directory, and the
 * environment a build step runs under, so a step this probe times apart
 * from the planned one keeps all three and replaces only the arguments.
 */
function reissue(
  request: ProcessRequest,
  args: readonly string[],
): ProcessRequest {
  return {
    args,
    command: request.command,
    cwd: request.cwd,
    ...includePropertiesWhen(() => {
      const environment = request.environment;
      if (environment == null) return undefined;
      return { environment };
    }),
  };
}

/** Build the runtime archive once, timing it apart from every program. */
async function buildArchive(
  context: BuildContext,
  sources: readonly string[],
): Promise<{
  readonly bytes: number;
  readonly nanoseconds: number;
  readonly path: string;
}> {
  const { directory, host } = context;
  const placeholder = join(directory, "archive-only.c");
  await host.writeTextFile(placeholder, "int main(void) { return 0; }\n");
  const plan = zigToolchain.createBuildPlan({
    ...planEnvironment(context),
    generatedSourcePath: placeholder,
    runtimeDirectory: directory,
    runtimeSourcePaths: sources,
    target: context.target,
    workingDirectory: directory,
  });
  const archivePath = plan.runtimeArchivePath;
  if (archivePath == null) {
    throw new Error("The build plan did not name a runtime archive.");
  }
  const compileAndArchive = plan.requests.slice(0, plan.requests.length - 1);
  const measured = await timed(async () => {
    for (const request of compileAndArchive) {
      requireSuccess(request.command, await host.run(request));
    }
  });
  return {
    bytes: await fileBytes(archivePath),
    nanoseconds: measured.nanoseconds,
    path: archivePath,
  };
}

/** Compile every runtime component separately, without archiving it. */
async function measureComponents(
  context: BuildContext,
  sources: readonly string[],
  selected: ReadonlySet<string>,
): Promise<readonly ComponentRow[]> {
  const { directory, host } = context;
  const rows: ComponentRow[] = [];
  for (const source of sources) {
    const name = basename(source);
    if (!selected.has(name)) continue;
    const objectPath = join(directory, `component-${name}.o`);
    const plan = zigToolchain.createBuildPlan({
      ...planEnvironment(context),
      generatedSourcePath: join(directory, "archive-only.c"),
      runtimeDirectory: directory,
      runtimeSourcePaths: [source],
      target: context.target,
      workingDirectory: directory,
    });
    const request = plan.requests[0];
    if (request == null) throw new Error("A component compile was planned.");
    const measured = await timed(() =>
      host.run(
        reissue(request, [
          ...request.args.slice(0, request.args.length - 1),
          objectPath,
        ]),
      ),
    );
    requireSuccess(name, measured.value);
    rows.push({
      compileNanoseconds: measured.nanoseconds,
      name,
      objectBytes: await fileBytes(objectPath),
      textBytes: await textBytes(host, directory, objectPath),
    });
  }
  return rows;
}

/** Compile, link, and run one program. */
async function measureProgram(
  context: BuildContext,
  archivePath: string,
  program: SizeProgram,
): Promise<SizeRow> {
  const { directory, host } = context;
  const compiled = compileSource(defaultComponents.frontend, {
    source: program.source,
    sourceId: `${program.id}.js`,
  });
  if (compiled.diagnostics.length > 0 || compiled.mir == null) {
    const first = compiled.diagnostics[0];
    throw new Error(
      `Probe program ${program.id} did not compile: ` +
        `${first?.message ?? "no MIR was produced"}.`,
    );
  }
  const emitted = cBackend.emit(compiled.mir);
  const sourcePath = join(directory, `${program.id}-${emitted.sourceName}`);
  await host.writeTextFile(sourcePath, emitted.source);
  const plan = zigToolchain.createBuildPlan({
    ...planEnvironment(context),
    generatedSourcePath: sourcePath,
    prebuiltRuntimeArchivePath: archivePath,
    runtimeDirectory: directory,
    runtimeSourcePaths: [],
    target: context.target,
    workingDirectory: directory,
  });
  const link = plan.requests[plan.requests.length - 1];
  if (link == null) throw new Error("A link step was planned.");
  // The planned link invocation ends with the generated source, the
  // archive, and the output. Both measured steps are derived from it so
  // that they carry exactly the toolchain adapter's own flags.
  const tail = link.args.slice(-4);
  if (tail[0] !== sourcePath || tail[1] !== archivePath || tail[2] !== "-o") {
    throw new Error(
      "The planned link invocation no longer ends with the generated " +
        "source, the runtime archive, and the output path.",
    );
  }
  const flags = link.args.slice(0, -4);
  const objectPath = join(directory, `${program.id}.o`);
  const executablePath = join(directory, `${program.id}-executable`);
  const objectStep = await timed(() =>
    host.run(reissue(link, [...flags, "-c", sourcePath, "-o", objectPath])),
  );
  requireSuccess(`compile ${program.id}`, objectStep.value);
  const linked = await timed(() =>
    host.run(
      reissue(link, [...flags, objectPath, archivePath, "-o", executablePath]),
    ),
  );
  requireSuccess(`link ${program.id}`, linked.value);
  let best = Number.POSITIVE_INFINITY;
  let output = "";
  let stderr = "";
  let exitStatus = 0;
  for (let sample = 0; sample < runSamples; sample += 1) {
    const run = await timed(() =>
      host.run({ args: [], command: executablePath, cwd: directory }),
    );
    if (program.expectDiagnostic != null) {
      requireDiagnostic(program.id, program.expectDiagnostic, run.value);
    } else requireSuccess(`run ${program.id}`, run.value);
    exitStatus = run.value.exitStatus;
    output = run.value.stdout;
    stderr = run.value.stderr;
    if (run.nanoseconds < best) best = run.nanoseconds;
  }
  return {
    attempts: program.attempts,
    compileNanoseconds: objectStep.nanoseconds,
    executableBytes: await fileBytes(executablePath),
    exitStatus,
    generatedBytes: Buffer.byteLength(emitted.source, "utf8"),
    id: program.id,
    linkNanoseconds: linked.nanoseconds,
    objectBytes: await fileBytes(objectPath),
    objectTextBytes: await textBytes(host, directory, objectPath),
    output: output.trim(),
    patterns: program.patterns,
    runNanoseconds: best,
    stderr: stderr.trim(),
    textBytes: await textBytes(host, directory, executablePath),
  };
}

/** The runtime components whose separate size the report names. */
const reportedComponents: ReadonlySet<string> = new Set([
  "runtime_regexp.c",
  "runtime_regexp_matcher.c",
  "runtime_regexp_symbol.c",
]);

/** Build and measure every program in one working directory. */
export async function measureSizes(
  host: CompilerHost,
  target: TargetDescription,
  programs: readonly SizeProgram[],
): Promise<SizeMeasurement> {
  const environment = await captureToolchainEnvironment(host);
  const directory = await host.makeTemporaryDirectory("oseo-regexp-probe-");
  try {
    return await buildIn({ directory, environment, host, target }, programs);
  } finally {
    // Every exit removes the directory, including a build or a run that
    // failed, so a run leaves no artifact behind.
    await host.remove(directory);
  }
}

/** Build and measure every program inside one working directory. */
async function buildIn(
  context: BuildContext,
  programs: readonly SizeProgram[],
): Promise<SizeMeasurement> {
  const sources = await copyRuntime(context);
  const archive = await buildArchive(context, sources);
  const components = await measureComponents(
    context,
    sources,
    reportedComponents,
  );
  // The first link of one working directory pays for whatever the
  // toolchain caches once, so a warm link is measured instead.
  const warmUp = programs[0];
  if (warmUp != null) {
    await measureProgram(context, archive.path, {
      ...warmUp,
      id: `${warmUp.id}-warm-up`,
    });
  }
  const rows: SizeRow[] = [];
  for (const program of programs) {
    rows.push(await measureProgram(context, archive.path, program));
  }
  return {
    archiveBytes: archive.bytes,
    archiveNanoseconds: archive.nanoseconds,
    components,
    environment: context.environment != null,
    programs: rows,
    target: context.target.name,
  };
}
