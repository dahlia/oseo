import { cBackend } from "@oseo/backend-c";
import type {
  CompilerHost,
  Diagnostic,
  MirProgram,
  ModuleSourceFrontend,
  NativeBackend,
  NativeToolchain,
  ProcessObservation,
  ProcessRequest,
  RuntimeInputProvider,
  SourceFrontend,
} from "@oseo/compiler";
import {
  buildModuleGraph,
  compileModuleGraph,
  compileSource,
  printMir,
  renderDiagnostic,
} from "@oseo/compiler";
import {
  createDenoHost,
  createFileModuleLoader,
  createNodeHost,
  fileModuleResolver,
  hashModuleSource,
} from "@oseo/host";
import { babelFrontend, babelModuleFrontend } from "@oseo/parser-babel";
import { cRuntimeProvider } from "@oseo/runtime-c";
import { zigToolchain } from "@oseo/toolchain-zig";
import { object, or } from "@optique/core/constructs";
import { runParser } from "@optique/core/facade";
import { message } from "@optique/core/message";
import { map, withDefault } from "@optique/core/modifiers";
import type { InferValue } from "@optique/core/parser";
import { argument, flag } from "@optique/core/primitives";
import { defineProgram } from "@optique/core/program";
import { string as stringValue } from "@optique/core/valueparser";

const modeParser = withDefault(
  or(
    map(
      flag("--dump-mir", {
        description: message`Print textual MIR for supported source.`,
      }),
      () => "dump-mir" as const,
    ),
    map(
      flag("--emit-c", {
        description: message`Print generated C11 for supported source.`,
      }),
      () => "emit-c" as const,
    ),
  ),
  "execute" as const,
);

const specializationParser = withDefault(
  map(
    flag("--no-specialization", {
      description: message`Compile only the generic native path.`,
    }),
    () => "disabled" as const,
  ),
  "enabled" as const,
);

const cliParser = object({
  mode: modeParser,
  sourceId: argument(stringValue({ metavar: "SOURCE" }), {
    description: message`Source file to compile.`,
  }),
  specialization: specializationParser,
});

const cliProgram = defineProgram({
  metadata: {
    brief: message`Compile JavaScript source to a native executable.`,
    name: "oseo",
  },
  parser: cliParser,
});

type CliInvocation = InferValue<typeof cliParser>;

type CliParseResult =
  | { readonly kind: "invoke"; readonly value: CliInvocation }
  | { readonly kind: "result"; readonly value: CliResult };

/** Concrete adapters selected at the outer Oseo composition root. */
export interface DefaultComponents {
  readonly backend: NativeBackend;
  readonly createDenoHost: () => CompilerHost;
  readonly createNodeHost: () => CompilerHost;
  readonly frontend: SourceFrontend;
  readonly moduleFrontend: ModuleSourceFrontend;
  readonly runtime: RuntimeInputProvider;
  readonly toolchain: NativeToolchain;
}

/** A host-independent invocation of the Oseo command-line contract. */
export interface CliRequest {
  readonly args: readonly string[];
  readonly source?: string;
  readonly sourceId?: string;
  readonly version: string;
}

/** Captured command-line output and status. */
export interface CliResult {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}

/** The concrete adapters composed by the default Oseo command line. */
export const defaultComponents: DefaultComponents = {
  backend: cBackend,
  createDenoHost,
  createNodeHost,
  frontend: babelFrontend,
  moduleFrontend: babelModuleFrontend,
  runtime: cRuntimeProvider,
  toolchain: zigToolchain,
};

function hostDiagnostic(
  sourceId: string,
  diagnosticMessage: string,
): Diagnostic {
  return {
    byteRange: { end: 0, start: 0 },
    code: "OSEO3001",
    message: diagnosticMessage,
    range: {
      end: { column: 1, line: 1 },
      start: { column: 1, line: 1 },
    },
    sourceId,
  };
}

function diagnosticResult(diagnostic: Diagnostic): CliResult {
  return {
    exitStatus: 1,
    stderr: `${renderDiagnostic(diagnostic)}\n`,
    stdout: "",
  };
}

function parseCliRequest(request: CliRequest): CliParseResult {
  let exitStatus = 0;
  let stderr = "";
  let stdout = "";
  const stopped = {};
  const stop = (status: number): never => {
    exitStatus = status;
    throw stopped;
  };
  try {
    return {
      kind: "invoke",
      value: runParser(cliProgram, request.args, {
        colors: false,
        help: { onShow: stop, option: true },
        maxWidth: 80,
        onError: stop,
        stderr: (text) => {
          stderr += `${text}\n`;
        },
        stdout: (text) => {
          stdout += `${text}\n`;
        },
        version: {
          onShow: stop,
          option: true,
          value: request.version,
        },
      }),
    };
  } catch (error) {
    if (error !== stopped) throw error;
    return {
      kind: "result",
      value: { exitStatus, stderr, stdout },
    };
  }
}

function compileCliSource(
  mode: CliInvocation["mode"],
  source: string,
  sourceId: string,
  specialization: CliInvocation["specialization"],
): CliResult {
  const compiled = compileSource(
    defaultComponents.frontend,
    {
      source,
      sourceId,
    },
    { specialization },
  );
  const diagnostic = compiled.diagnostics[0];
  if (diagnostic != null) return diagnosticResult(diagnostic);
  if (compiled.mir == null) {
    return diagnosticResult(
      hostDiagnostic(sourceId, "The compiler did not produce MIR."),
    );
  }
  if (mode === "dump-mir") {
    return { exitStatus: 0, stderr: "", stdout: printMir(compiled.mir) };
  }
  if (mode === "emit-c") {
    return {
      exitStatus: 0,
      stderr: "",
      stdout: defaultComponents.backend.emit(compiled.mir).source,
    };
  }
  return diagnosticResult(
    hostDiagnostic(
      sourceId,
      "Native execution requires the asynchronous CLI host workflow.",
    ),
  );
}

async function compileCliModuleGraph(
  host: CompilerHost,
  sourcePath: string,
  source: string,
  specialization: CliInvocation["specialization"],
): Promise<{ readonly diagnostic: Diagnostic } | { readonly mir: MirProgram }> {
  let entryId: string;
  try {
    entryId =
      host.canonicalizeFile == null
        ? new URL(sourcePath).href
        : await host.canonicalizeFile(sourcePath);
  } catch {
    return {
      diagnostic: hostDiagnostic(
        sourcePath,
        "The module entry could not be canonicalized.",
      ),
    };
  }
  const fileLoader = createFileModuleLoader(host);
  const result = await buildModuleGraph(
    defaultComponents.moduleFrontend,
    {
      load(canonicalId) {
        return canonicalId === entryId
          ? Promise.resolve({
              diagnostics: [],
              source: {
                source,
                sourceHash: hashModuleSource(source),
                sourceId: entryId,
              },
            })
          : fileLoader.load(canonicalId);
      },
    },
    fileModuleResolver,
    entryId,
  );
  const graphDiagnostic = result.diagnostics[0];
  if (graphDiagnostic != null) return { diagnostic: graphDiagnostic };
  if (result.graph == null) {
    return {
      diagnostic: hostDiagnostic(entryId, "The module graph is unavailable."),
    };
  }
  const compiled = compileModuleGraph(result.graph, { specialization });
  const diagnostic = compiled.diagnostics[0];
  if (diagnostic != null) return { diagnostic };
  if (compiled.mir == null) {
    return {
      diagnostic: hostDiagnostic(entryId, "The compiler did not produce MIR."),
    };
  }
  return { mir: compiled.mir };
}

function hasModulePathIntent(sourcePath: string): boolean {
  try {
    const url = new URL(sourcePath);
    if (url.protocol === "file:") return url.pathname.endsWith(".mjs");
  } catch {
    // Ordinary filesystem paths are checked below.
  }
  return sourcePath.endsWith(".mjs");
}

function isModuleSource(
  source: string,
  sourceId: string,
  sourcePath: string,
): boolean {
  if (hasModulePathIntent(sourcePath)) return true;
  const parsed = defaultComponents.moduleFrontend.parseModule({
    source,
    sourceId,
  });
  if (
    parsed.module != null &&
    (parsed.module.imports.length > 0 || parsed.module.exports.length > 0)
  ) {
    return true;
  }
  if (!parsed.parsed) return false;
  return !defaultComponents.frontend.parse({ source, sourceId }).parsed;
}

function emitCliMir(mode: CliInvocation["mode"], mir: MirProgram): CliResult {
  if (mode === "dump-mir") {
    return { exitStatus: 0, stderr: "", stdout: printMir(mir) };
  }
  if (mode === "emit-c") {
    return {
      exitStatus: 0,
      stderr: "",
      stdout: defaultComponents.backend.emit(mir).source,
    };
  }
  throw new Error("The native execution mode does not emit compiler text.");
}

/** Run parsing, dumps, and C emission without touching a host process. */
export function runCli(request: CliRequest): CliResult {
  const parsed = parseCliRequest(request);
  if (parsed.kind === "result") return parsed.value;
  return compileCliSource(
    parsed.value.mode,
    request.source ?? "",
    request.sourceId ?? parsed.value.sourceId,
    parsed.value.specialization,
  );
}

function join(directory: string, name: string): string {
  return `${directory.replace(/\/$/u, "")}/${name}`;
}

function sourceReadLocation(sourceId: string): string | URL {
  try {
    const url = new URL(sourceId);
    return url.protocol === "file:" ? url : sourceId;
  } catch {
    return sourceId;
  }
}

async function observeProcess(
  host: CompilerHost,
  request: ProcessRequest,
): Promise<ProcessObservation | undefined> {
  try {
    return await host.run(request);
  } catch {
    return undefined;
  }
}

async function executeNativeWorkflow(
  host: CompilerHost,
  sourceId: string,
  directory: string,
  mir: MirProgram,
): Promise<CliResult> {
  const emitted = defaultComponents.backend.emit(mir);
  const generatedSourcePath = join(directory, emitted.sourceName);
  await host.writeTextFile(generatedSourcePath, emitted.source);
  const runtime = defaultComponents.runtime.getRuntimeInput();
  const copiedAssets = [];
  for (const asset of runtime.assets) {
    const destination = join(directory, asset.name);
    // eslint-disable-next-line no-await-in-loop -- Copies must settle in order.
    const contents = await host.readTextFile(asset.url);
    // eslint-disable-next-line no-await-in-loop -- Copies must settle in order.
    await host.writeTextFile(destination, contents);
    copiedAssets.push({ asset, destination });
  }
  const runtimeSourcePath = copiedAssets.find(
    (entry) => entry.asset.kind === "source",
  )?.destination;
  if (runtimeSourcePath == null) {
    return diagnosticResult(
      hostDiagnostic(sourceId, "The C runtime source is unavailable."),
    );
  }
  const plan = defaultComponents.toolchain.createBuildPlan({
    generatedSourcePath,
    runtimeDirectory: directory,
    runtimeSourcePath,
    target: {
      cStandard: "c11",
      execute: true,
      name: "x86_64-linux-gnu",
      sanitizeUndefinedBehavior: true,
    },
    workingDirectory: directory,
  });
  for (const processRequest of plan.requests) {
    // eslint-disable-next-line no-await-in-loop -- Native steps are ordered.
    const observation = await observeProcess(host, processRequest);
    if (observation == null) {
      return diagnosticResult(
        hostDiagnostic(sourceId, "The native toolchain could not be started."),
      );
    }
    if (observation.exitStatus !== 0) {
      return diagnosticResult(
        hostDiagnostic(sourceId, "The native toolchain failed."),
      );
    }
  }
  const observation = await observeProcess(host, {
    args: [],
    command: plan.executablePath,
    cwd: directory,
  });
  if (observation == null) {
    return diagnosticResult(
      hostDiagnostic(sourceId, "The native executable could not be started."),
    );
  }
  return {
    exitStatus: observation.exitStatus,
    stderr: observation.stderr,
    stdout: observation.stdout,
  };
}

/** Compile and execute one source invocation through the native toolchain. */
export async function runNativeCli(
  request: CliRequest,
  host: CompilerHost = defaultComponents.createNodeHost(),
): Promise<CliResult> {
  const parsed = parseCliRequest(request);
  if (parsed.kind === "result") return parsed.value;
  const sourceId = request.sourceId ?? parsed.value.sourceId;
  let source: string;
  try {
    source =
      request.source ??
      (await host.readTextFile(sourceReadLocation(parsed.value.sourceId)));
  } catch {
    return diagnosticResult(
      hostDiagnostic(sourceId, "The source file could not be read."),
    );
  }
  let mir: MirProgram;
  if (isModuleSource(source, sourceId, parsed.value.sourceId)) {
    const compiled = await compileCliModuleGraph(
      host,
      parsed.value.sourceId,
      source,
      parsed.value.specialization,
    );
    if ("diagnostic" in compiled) {
      return diagnosticResult(compiled.diagnostic);
    }
    mir = compiled.mir;
    if (parsed.value.mode !== "execute") {
      return emitCliMir(parsed.value.mode, mir);
    }
  } else if (parsed.value.mode !== "execute") {
    return compileCliSource(
      parsed.value.mode,
      source,
      sourceId,
      parsed.value.specialization,
    );
  } else {
    const compiled = compileSource(
      defaultComponents.frontend,
      {
        source,
        sourceId,
      },
      { specialization: parsed.value.specialization },
    );
    const diagnostic = compiled.diagnostics[0];
    if (diagnostic != null) return diagnosticResult(diagnostic);
    if (compiled.mir == null) {
      return diagnosticResult(
        hostDiagnostic(sourceId, "The compiler did not produce MIR."),
      );
    }
    mir = compiled.mir;
  }
  let directory: string;
  try {
    directory = await host.makeTemporaryDirectory("oseo-cli-");
  } catch {
    return diagnosticResult(
      hostDiagnostic(
        sourceId,
        "The native temporary directory could not be created.",
      ),
    );
  }
  let result: CliResult;
  try {
    result = await executeNativeWorkflow(host, sourceId, directory, mir);
  } catch {
    result = diagnosticResult(
      hostDiagnostic(sourceId, "The native host workflow failed."),
    );
  }
  try {
    await host.remove(directory);
  } catch {
    return diagnosticResult(
      hostDiagnostic(
        sourceId,
        "The native temporary directory could not be removed.",
      ),
    );
  }
  return result;
}
