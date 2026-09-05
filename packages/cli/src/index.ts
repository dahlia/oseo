import { cBackend } from "@oseo/backend-c";
import type {
  CompilerCacheLock,
  CompilerHost,
  Diagnostic,
  MirProgram,
  ModuleSourceFrontend,
  NativeBackend,
  NativeToolchain,
  ProcessEnvironment,
  ProcessObservation,
  ProcessRequest,
  RegExpPatternExtensions,
  RuntimeInputProvider,
  SourceFrontend,
  TargetDescription,
  TargetName,
} from "@oseo/compiler";
import {
  buildModuleGraph,
  canExecuteTarget,
  compileModuleGraph,
  compileSource,
  describeTarget,
  printMir,
  renderDiagnostic,
  targetForExecutionHost,
} from "@oseo/compiler";
import {
  canonicalizeFileModuleUrl,
  createDenoHost,
  createFileModuleLoader,
  createNodeHost,
  fileModuleResolver,
  hashModuleSource,
} from "@oseo/host";
import {
  createBabelFrontend,
  createBabelModuleFrontend,
} from "@oseo/parser-babel";
import { cRuntimeProvider } from "@oseo/runtime-c";
import { zigToolchain } from "@oseo/toolchain-zig";
import {
  binaryPropertySet,
  codePointSetHas,
  ecma262UnicodeStringPropertySet,
  ecma262UnicodePropertySet,
} from "@oseo/unicode";
import { object, or } from "@optique/core/constructs";
import { runParser } from "@optique/core/facade";
import { message } from "@optique/core/message";
import { map, optional, withDefault } from "@optique/core/modifiers";
import type { InferValue } from "@optique/core/parser";
import { argument, flag, option } from "@optique/core/primitives";
import { defineProgram } from "@optique/core/program";
import { choice, string as stringValue } from "@optique/core/valueparser";

import { unicodeMatcherData } from "./regexp-unicode.ts";

export {
  caseEquivalenceClasses,
  propertyEscapeSet,
  stringPropertyEscapeSet,
  unicodeMatcherData,
} from "./regexp-unicode.ts";

function includePropertiesWhen<const Properties extends object>(
  properties: () => Properties | undefined,
): Properties | { [Key in keyof Properties]?: never } {
  return properties() ?? {};
}

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

const runtimeArchiveReuseParser = withDefault(
  map(
    flag("--no-runtime-archive-reuse", {
      description: message`Rebuild the C runtime archive for this execution.`,
    }),
    () => "disabled" as const,
  ),
  "enabled" as const,
);

const moduleParser = withDefault(
  map(
    flag("--module", {
      description: message`Compile the source as an ECMAScript module.`,
    }),
    () => true,
  ),
  false,
);

const targetParser = optional(
  option(
    "--target",
    choice([
      "linux-aarch64-musl",
      "linux-x86_64-gnu",
      "macos-aarch64",
    ] as const),
    {
      description: message`Select an explicit native execution target.`,
    },
  ),
);

const cliParser = object({
  module: moduleParser,
  mode: modeParser,
  runtimeArchiveReuse: runtimeArchiveReuseParser,
  sourceId: argument(stringValue({ metavar: "SOURCE" }), {
    description: message`Source file to compile.`,
  }),
  specialization: specializationParser,
  target: targetParser,
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

/** RegExp extensions supplied at the outer Unicode composition boundary. */
const regexpExtensions: RegExpPatternExtensions = {
  admitted: ["class-set-notation", "modifiers", "unicode-property-escapes"],
  identifierPart: (codePoint) =>
    codePointSetHas(binaryPropertySet("ID_Continue") ?? [], codePoint),
  identifierStart: (codePoint) =>
    codePointSetHas(binaryPropertySet("ID_Start") ?? [], codePoint),
  unicodeProperty: (escape) =>
    ecma262UnicodePropertySet(escape.property, escape.value) != null ||
    (escape.value == null &&
      !escape.negated &&
      ecma262UnicodeStringPropertySet(escape.property) != null),
};

const babelFrontend = createBabelFrontend({
  regexpExtensions,
  regexpUnicodeData: unicodeMatcherData,
});
const babelModuleFrontend = createBabelModuleFrontend({
  regexpExtensions,
  regexpUnicodeData: unicodeMatcherData,
});

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

let sharedNodeHost: CompilerHost | undefined;

function defaultNodeHost(): CompilerHost {
  sharedNodeHost ??= defaultComponents.createNodeHost();
  return sharedNodeHost;
}

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
      load(canonicalId, referrer) {
        return canonicalId === entryId
          ? Promise.resolve({
              diagnostics: [],
              source: {
                source,
                sourceHash: hashModuleSource(source),
                sourceId: entryId,
              },
            })
          : fileLoader.load(canonicalId, referrer);
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

function hasModuleExtension(path: string): boolean {
  return path.endsWith(".mjs") || path.endsWith(".mts");
}

function hasModulePathIntent(sourcePath: string): boolean {
  try {
    const url = new URL(sourcePath);
    if (url.protocol === "file:") {
      const canonical = new URL(canonicalizeFileModuleUrl(url));
      return hasModuleExtension(canonical.pathname);
    }
  } catch {
    // Ordinary filesystem paths are checked below.
  }
  return hasModuleExtension(sourcePath);
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
  if (parsed.value.target != null) {
    return diagnosticResult(
      hostDiagnostic(
        request.sourceId ?? parsed.value.sourceId,
        "The --target option applies only to asynchronous native execution.",
      ),
    );
  }
  if (parsed.value.runtimeArchiveReuse === "disabled") {
    return diagnosticResult(
      hostDiagnostic(
        request.sourceId ?? parsed.value.sourceId,
        "The --no-runtime-archive-reuse option applies only to " +
          "asynchronous native execution.",
      ),
    );
  }
  if (parsed.value.module) {
    return diagnosticResult(
      hostDiagnostic(
        request.sourceId ?? parsed.value.sourceId,
        "Module compilation requires the asynchronous CLI host workflow.",
      ),
    );
  }
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

function observeToolchainIdentity(
  host: CompilerHost,
  toolchain: NativeToolchain,
  workingDirectory: string,
  environment: ProcessEnvironment,
): Promise<string | undefined> {
  const reuse = toolchain.runtimeArchiveReuse;
  if (reuse == null) return Promise.resolve(undefined);
  return observeProcess(
    host,
    reuse.createIdentityRequest(workingDirectory, environment),
  ).then((attempt) => {
    if ("failure" in attempt || attempt.exitStatus !== 0) return undefined;
    const observation = attempt;
    const identity = observation.stdout.trim();
    return identity === "" ? undefined : identity;
  });
}

async function releaseCacheLock(
  lock: CompilerCacheLock | undefined,
): Promise<void> {
  try {
    await lock?.release();
  } catch {
    // Cache cleanup cannot turn a usable native build into a failure.
  }
}

/**
 * Require a runtime asset name to be a portable leaf file name so a
 * copied asset can neither escape the build directory nor alias another
 * destination through separators or relative segments.
 */
function isPortableAssetName(name: string): boolean {
  return name !== "." && name !== ".." && /^[A-Za-z0-9._-]+$/u.test(name);
}

function sourceReadLocation(sourceId: string): string | URL {
  try {
    const url = new URL(sourceId);
    return url.protocol === "file:" ? url : sourceId;
  } catch {
    return sourceId;
  }
}

interface ProcessStartFailure {
  readonly failure: "resource-exhaustion" | "unknown";
}

function isNonNullObject<T>(value: T): value is T & object {
  return value !== null && typeof value === "object";
}

function processStartFailure(cause: unknown): ProcessStartFailure {
  if (isNonNullObject(cause)) {
    const code = "code" in cause ? cause.code : undefined;
    const name = "name" in cause ? cause.name : undefined;
    if (
      code === "EAGAIN" ||
      code === "ENOMEM" ||
      name === "Busy" ||
      name === "WouldBlock"
    ) {
      return { failure: "resource-exhaustion" };
    }
  }
  return { failure: "unknown" };
}

/**
 * Stable OSEO3001 suffix identifying retryable process-start exhaustion.
 */
export const processResourceExhaustionDiagnosticSuffix: string =
  "could not be started because the host temporarily exhausted process " +
  "resources.";

async function observeProcess(
  host: CompilerHost,
  request: ProcessRequest,
): Promise<ProcessObservation | ProcessStartFailure> {
  try {
    return await host.run(request);
  } catch (error) {
    return processStartFailure(error);
  }
}

function processStartDiagnostic(
  sourceId: string,
  subject: string,
  failure: ProcessStartFailure,
): CliResult {
  const diagnostic =
    failure.failure === "resource-exhaustion"
      ? `${subject} ${processResourceExhaustionDiagnosticSuffix}`
      : `${subject} could not be started.`;
  return diagnosticResult(hostDiagnostic(sourceId, diagnostic));
}

async function executeNativeWorkflow(
  host: CompilerHost,
  sourceId: string,
  directory: string,
  mir: MirProgram,
  target: TargetDescription,
  archiveReuse: CliInvocation["runtimeArchiveReuse"],
): Promise<CliResult> {
  const emitted = defaultComponents.backend.emit(mir);
  const generatedSourcePath = join(directory, emitted.sourceName);
  await host.writeTextFile(generatedSourcePath, emitted.source);
  const runtime = defaultComponents.runtime.getRuntimeInput();
  const assetNames = new Set<string>();
  for (const asset of runtime.assets) {
    if (!isPortableAssetName(asset.name)) {
      return diagnosticResult(
        hostDiagnostic(
          sourceId,
          `The C runtime lists an invalid asset name: ${asset.name}.`,
        ),
      );
    }
    // Case-folded so one destination on a case-insensitive filesystem
    // cannot silently drop a copied asset.
    const folded = asset.name.toLowerCase();
    if (folded === emitted.sourceName.toLowerCase()) {
      return diagnosticResult(
        hostDiagnostic(
          sourceId,
          "The C runtime lists an asset that collides with the " +
            `generated source name: ${asset.name}.`,
        ),
      );
    }
    if (assetNames.has(folded)) {
      return diagnosticResult(
        hostDiagnostic(
          sourceId,
          `The C runtime lists a duplicate asset name: ${asset.name}.`,
        ),
      );
    }
    assetNames.add(folded);
  }
  if (!runtime.assets.some((asset) => asset.kind === "source")) {
    return diagnosticResult(
      hostDiagnostic(sourceId, "The C runtime source is unavailable."),
    );
  }
  const reuse = defaultComponents.toolchain.runtimeArchiveReuse;
  let toolchainEnvironment: ProcessEnvironment | undefined;
  const environmentPolicy = defaultComponents.toolchain.environment;
  if (environmentPolicy != null && host.captureEnvironment != null) {
    try {
      toolchainEnvironment = await host.captureEnvironment(environmentPolicy);
    } catch {
      // An unavailable snapshot keeps compilation on ordinary inheritance.
    }
  }
  const cache =
    archiveReuse === "enabled" && reuse != null && toolchainEnvironment != null
      ? host.cache
      : undefined;
  let cachedArchivePath: string | undefined;
  let publishArchivePath: string | undefined;
  let cacheLock: CompilerCacheLock | undefined;
  let loadedAssets:
    | {
        readonly asset: (typeof runtime.assets)[number];
        readonly contents: string;
      }[]
    | undefined;
  const copiedAssets: {
    readonly asset: (typeof runtime.assets)[number];
    readonly destination: string;
  }[] = [];
  if (cache != null && reuse != null && toolchainEnvironment != null) {
    loadedAssets = [];
    for (const asset of runtime.assets) {
      // eslint-disable-next-line no-await-in-loop -- Reads settle in order.
      const contents = await host.readTextFile(asset.url);
      loadedAssets.push({ asset, contents });
    }
    try {
      const identity = await observeToolchainIdentity(
        host,
        defaultComponents.toolchain,
        directory,
        toolchainEnvironment,
      );
      if (identity == null) {
        throw new Error("The native toolchain identity is unavailable.");
      }
      const key = await reuse.createKey({
        runtimeAbiVersion: runtime.abiVersion,
        runtimeAssets: loadedAssets.map((entry) => ({
          contents: entry.contents,
          kind: entry.asset.kind,
          name: entry.asset.name,
        })),
        target,
        toolchainEnvironment,
        toolchainIdentity: identity,
      });
      const cacheDirectory = await cache.getDirectory("runtime-archives");
      const candidate = join(cacheDirectory, `liboseo-runtime-${key}.a`);
      cacheLock = await cache.acquireFileLock(candidate);
      if (await cache.hasFile(candidate)) {
        cachedArchivePath = candidate;
        await releaseCacheLock(cacheLock);
        cacheLock = undefined;
      } else {
        publishArchivePath = candidate;
      }
    } catch {
      await releaseCacheLock(cacheLock);
      cacheLock = undefined;
    }
  }
  try {
    if (loadedAssets != null) {
      for (const entry of loadedAssets) {
        if (cachedArchivePath != null && entry.asset.kind === "source") {
          continue;
        }
        const destination = join(directory, entry.asset.name);
        // eslint-disable-next-line no-await-in-loop -- Writes settle in order.
        await host.writeTextFile(destination, entry.contents);
        copiedAssets.push({ asset: entry.asset, destination });
      }
    } else {
      for (const asset of runtime.assets) {
        const destination = join(directory, asset.name);
        // eslint-disable-next-line no-await-in-loop -- Copies settle in order.
        const contents = await host.readTextFile(asset.url);
        // eslint-disable-next-line no-await-in-loop -- Copies settle in order.
        await host.writeTextFile(destination, contents);
        copiedAssets.push({ asset, destination });
      }
    }
  } catch (error) {
    await releaseCacheLock(cacheLock);
    cacheLock = undefined;
    throw error;
  }
  const runtimeSourcePaths = copiedAssets
    .filter((entry) => entry.asset.kind === "source")
    .map((entry) => entry.destination);
  if (runtimeSourcePaths.length === 0 && cachedArchivePath == null) {
    await releaseCacheLock(cacheLock);
    cacheLock = undefined;
    return diagnosticResult(
      hostDiagnostic(sourceId, "The C runtime source is unavailable."),
    );
  }
  let executablePath: string | undefined;
  try {
    const plan = defaultComponents.toolchain.createBuildPlan({
      ...includePropertiesWhen(() => {
        if (toolchainEnvironment == null) return undefined;
        return {
          environment: toolchainEnvironment,
        };
      }),
      generatedSourcePath,
      ...includePropertiesWhen(() => {
        if (cachedArchivePath == null) return undefined;
        return {
          prebuiltRuntimeArchivePath: cachedArchivePath,
        };
      }),
      runtimeDirectory: directory,
      runtimeSourcePaths,
      target,
      workingDirectory: directory,
    });
    executablePath = plan.executablePath;
    for (const processRequest of plan.requests) {
      // eslint-disable-next-line no-await-in-loop -- Native steps are ordered.
      const attempt = await observeProcess(host, processRequest);
      if ("failure" in attempt) {
        return processStartDiagnostic(
          sourceId,
          `The native toolchain for target '${target.name}'`,
          attempt,
        );
      }
      const observation = attempt;
      if (observation.exitStatus !== 0) {
        return diagnosticResult(
          hostDiagnostic(
            sourceId,
            `The native toolchain for target '${target.name}' failed ` +
              `(exit ${observation.exitStatus}).`,
          ),
        );
      }
    }
    if (
      publishArchivePath != null &&
      plan.runtimeArchivePath != null &&
      cache != null
    ) {
      try {
        await cache.publishFile(plan.runtimeArchivePath, publishArchivePath);
      } catch {
        // The completed build remains usable when optional publication fails.
      }
    }
  } finally {
    await releaseCacheLock(cacheLock);
  }
  if (executablePath == null) {
    return diagnosticResult(
      hostDiagnostic(sourceId, "The native executable is unavailable."),
    );
  }
  const attempt = await observeProcess(host, {
    args: [],
    command: executablePath,
    cwd: directory,
  });
  if ("failure" in attempt) {
    return processStartDiagnostic(sourceId, "The native executable", attempt);
  }
  const observation = attempt;
  return {
    exitStatus: observation.exitStatus,
    stderr: observation.stderr,
    stdout: observation.stdout,
  };
}

function selectExecutionTarget(
  host: CompilerHost,
  requested: TargetName | undefined,
  sourceId: string,
):
  | { readonly diagnostic: Diagnostic }
  | { readonly target: TargetDescription } {
  const executionHost = host.executionHost;
  if (executionHost == null) {
    return {
      diagnostic: hostDiagnostic(
        sourceId,
        "The execution host did not report its operating system and " +
          "architecture.",
      ),
    };
  }
  const target =
    requested == null
      ? targetForExecutionHost(executionHost)
      : describeTarget(requested);
  if (target == null) {
    return {
      diagnostic: hostDiagnostic(
        sourceId,
        `Native execution is unsupported on ` +
          `${executionHost.operatingSystem}/${executionHost.architecture}.`,
      ),
    };
  }
  if (!canExecuteTarget(executionHost, target)) {
    return {
      diagnostic: hostDiagnostic(
        sourceId,
        `Target '${target.name}' cannot execute on ` +
          `${executionHost.operatingSystem}/${executionHost.architecture}.`,
      ),
    };
  }
  return { target };
}

/** Compile and execute one source invocation through the native toolchain. */
export async function runNativeCli(
  request: CliRequest,
  host?: CompilerHost,
): Promise<CliResult> {
  host ??= defaultNodeHost();
  const parsed = parseCliRequest(request);
  if (parsed.kind === "result") return parsed.value;
  const sourceId = request.sourceId ?? parsed.value.sourceId;
  if (parsed.value.mode !== "execute" && parsed.value.target != null) {
    return diagnosticResult(
      hostDiagnostic(
        sourceId,
        "The --target option applies only to native execution.",
      ),
    );
  }
  if (
    parsed.value.mode !== "execute" &&
    parsed.value.runtimeArchiveReuse === "disabled"
  ) {
    return diagnosticResult(
      hostDiagnostic(
        sourceId,
        "The --no-runtime-archive-reuse option applies only to native " +
          "execution.",
      ),
    );
  }
  const selected =
    parsed.value.mode === "execute"
      ? selectExecutionTarget(host, parsed.value.target, sourceId)
      : undefined;
  if (selected != null && "diagnostic" in selected) {
    return diagnosticResult(selected.diagnostic);
  }
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
  if (
    parsed.value.module ||
    isModuleSource(source, sourceId, parsed.value.sourceId)
  ) {
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
    if (selected == null) {
      throw new Error("The native execution target is unavailable.");
    }
    result = await executeNativeWorkflow(
      host,
      sourceId,
      directory,
      mir,
      selected.target,
      parsed.value.runtimeArchiveReuse,
    );
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
