import { cBackend } from "@oseo/backend-c";
import type {
  CompilerCacheLock,
  CompilerHost,
  Diagnostic,
  EmittedNativeSource,
  MirProgram,
  ModuleSourceFrontend,
  NativeBackend,
  NativeToolchain,
  ProcessEnvironment,
  ProcessObservation,
  ProcessRequest,
  FileFingerprint,
  RegExpPatternExtensions,
  RuntimeAsset,
  RuntimeInput,
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

const test262HostParser = withDefault(
  map(
    flag("--test262-host", {
      description: message`Provide the test262 host object and its agents.`,
    }),
    () => true,
  ),
  false,
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
  test262Host: test262HostParser,
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
  test262Host: boolean,
): CliResult {
  const compiled = compileSource(
    defaultComponents.frontend,
    {
      source,
      sourceId,
    },
    { specialization, test262Host },
  );
  const diagnostic = compiled.diagnostics[0];
  if (diagnostic != null) return diagnosticResult(diagnostic);
  if (compiled.mir == null) {
    return diagnosticResult(
      hostDiagnostic(sourceId, "The compiler did not produce MIR."),
    );
  }
  // A test262 host MIR dump prints each agent program after the main one.
  const programs = [compiled.mir, ...(compiled.agents ?? [])];
  if (mode === "dump-mir") {
    return {
      exitStatus: 0,
      stderr: "",
      stdout: programs.map((program) => printMir(program)).join("\n"),
    };
  }
  if (mode === "emit-c") {
    // `--emit-c` prints one translation unit that compiles on its own,
    // while each agent program is a unit of its own whose file-scope
    // definitions repeat the main unit's (ADR 0026), so no single unit
    // can hold them; only native execution links them side by side.
    if (programs.length > 1) {
      return diagnosticResult(
        hostDiagnostic(
          sourceId,
          "The test262 host program links agent programs as separate " +
            "translation units, which --emit-c cannot print as one; " +
            "run it natively instead.",
        ),
      );
    }
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
    parsed.value.test262Host,
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

/**
 * One runtime asset whose contents a prepared native runtime already holds.
 * The location is the asset URL's serialization taken when the contents were
 * read, not the provider's `URL` object, which a later caller could mutate.
 */
export interface PreparedRuntimeAsset {
  readonly contents: string;
  readonly kind: RuntimeAsset["kind"];
  readonly location: string;
  readonly name: string;
}

/**
 * The runtime-archive inputs that do not vary between native executions of one
 * composing process: the runtime asset contents, the toolchain identity, and
 * the archive key derived from both. A composer that runs many executions
 * through a single process prepares them once and passes the result to
 * `runNativeUnits`, which then performs no per-execution runtime read,
 * identity probe, or key derivation. A caller that passes nothing keeps the
 * per-execution behavior unchanged.
 *
 * The value records every input it was derived from so that it cannot be
 * reused silently against different ones. `runNativeUnits` rejects it with a
 * `PreparedNativeRuntimeMismatchError` when the execution's compiler host,
 * toolchain, target, runtime asset set, runtime ABI version, or captured
 * toolchain environment differs. `assetDigest` records which asset contents
 * the key was derived from; it is provenance for a failure report, not a
 * per-execution check.
 *
 * Passing a prepared runtime asserts that the runtime package's asset
 * contents are fixed for the lifetime of the process. Unlike the
 * per-execution path, a change written to those files after preparation is
 * not observed.
 */
export interface PreparedNativeRuntime {
  readonly archiveKey: string;
  readonly assetDigest: string;
  readonly assets: readonly PreparedRuntimeAsset[];
  /** The executable every build of this preparation invokes. */
  readonly compilerPath: string;
  readonly host: CompilerHost;
  /** Fingerprints rechecked before each build that uses this preparation. */
  readonly pinnedFiles: readonly PinnedFile[];
  readonly runtimeAbiVersion: string;
  readonly target: TargetDescription;
  readonly toolchain: NativeToolchain;
  readonly toolchainEnvironment: ProcessEnvironment;
  readonly toolchainIdentity: string;
}

/** One path the toolchain identity described and the facts it then had. */
export interface PinnedFile {
  readonly fingerprint: FileFingerprint;
  readonly path: string;
}

/**
 * A prepared native runtime was supplied for an execution whose inputs differ
 * from the ones it was derived from. It is a composition error, so it is
 * raised rather than reported as a source diagnostic.
 */
export class PreparedNativeRuntimeMismatchError extends Error {
  constructor(subject: string) {
    super(
      `The prepared native runtime was derived from a different ${subject}.`,
    );
    this.name = "PreparedNativeRuntimeMismatchError";
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Copy and freeze the inputs a prepared runtime keeps, so that mutating the
 * object a caller handed in can change neither the derived key nor the record
 * the key is validated against.
 */
function snapshotTarget(target: TargetDescription): TargetDescription {
  return Object.freeze({
    ...target,
    sanitizers: Object.freeze([...target.sanitizers]),
  });
}

function snapshotEnvironment(
  environment: ProcessEnvironment,
): ProcessEnvironment {
  return Object.freeze({
    variables: Object.freeze({ ...environment.variables }),
  });
}

/**
 * Compare every field a toolchain may read from a target. The runtime archive
 * key is derived from the target's compile and link flags, so two targets that
 * share a name but differ in sanitizers or ABI derive different keys.
 */
function sameTargetDescription(
  left: TargetDescription,
  right: TargetDescription,
): boolean {
  return (
    left.abi === right.abi &&
    left.architecture === right.architecture &&
    left.cStandard === right.cStandard &&
    left.executableFormat === right.executableFormat &&
    left.name === right.name &&
    left.operatingSystem === right.operatingSystem &&
    left.sanitizers.length === right.sanitizers.length &&
    left.sanitizers.every(
      (sanitizer, index) => right.sanitizers[index] === sanitizer,
    )
  );
}

function sameToolchainEnvironment(
  left: ProcessEnvironment,
  right: ProcessEnvironment,
): boolean {
  const leftNames = Object.keys(left.variables).toSorted();
  const rightNames = Object.keys(right.variables).toSorted();
  return (
    leftNames.length === rightNames.length &&
    leftNames.every(
      (name, index) =>
        rightNames[index] === name &&
        left.variables[name] === right.variables[name],
    )
  );
}

/**
 * Reject a prepared runtime that was not derived from this execution's own
 * inputs. Every comparison is exact: hosts and toolchains by identity, so a
 * host that reads different runtime bytes or a toolchain with different flags
 * is refused, and the asset set by name, kind, and location in order.
 */
function requirePreparedNativeRuntime(
  prepared: PreparedNativeRuntime,
  observed: {
    readonly host: CompilerHost;
    readonly runtime: RuntimeInput;
    readonly target: TargetDescription;
    readonly toolchain: NativeToolchain;
    readonly toolchainEnvironment: ProcessEnvironment | undefined;
  },
): void {
  if (prepared.host !== observed.host) {
    throw new PreparedNativeRuntimeMismatchError("compiler host");
  }
  if (prepared.toolchain !== observed.toolchain) {
    throw new PreparedNativeRuntimeMismatchError("native toolchain");
  }
  if (!sameTargetDescription(prepared.target, observed.target)) {
    throw new PreparedNativeRuntimeMismatchError("native target");
  }
  if (prepared.runtimeAbiVersion !== observed.runtime.abiVersion) {
    throw new PreparedNativeRuntimeMismatchError("runtime ABI version");
  }
  const sameAssets =
    prepared.assets.length === observed.runtime.assets.length &&
    prepared.assets.every((asset, index) => {
      const actual = observed.runtime.assets[index];
      return (
        actual != null &&
        actual.name === asset.name &&
        actual.kind === asset.kind &&
        actual.url.href === asset.location
      );
    });
  if (!sameAssets) {
    throw new PreparedNativeRuntimeMismatchError("runtime asset set");
  }
  if (
    observed.toolchainEnvironment == null ||
    !sameToolchainEnvironment(
      prepared.toolchainEnvironment,
      observed.toolchainEnvironment,
    )
  ) {
    throw new PreparedNativeRuntimeMismatchError("toolchain environment");
  }
}

/**
 * Read the runtime assets, identify the toolchain, and derive the runtime
 * archive key once for a composing process. The result is only valid for the
 * same host, toolchain, target, and runtime provider; `runNativeUnits`
 * enforces that.
 *
 * The identity is probed in a temporary directory this function creates and
 * removes, which is the kind of directory one execution probes in, so the
 * probe does not depend on the composing entry point's working directory. A
 * toolchain that resolves to a different executable in a different directory,
 * such as one reached through a relative search-path entry, is outside this
 * contract; the per-execution path gives no guarantee there either, because
 * each of its executions probes in a directory of its own.
 *
 * Preparation raises rather than reporting a diagnostic. A host that refuses
 * to run the probe raises its own error, and a probe that completes without a
 * usable identity raises `The native toolchain identity is unavailable.`
 *
 * What is checked, and when. At preparation the identity is taken twice,
 * through the search path and then through the resolved executable, and the
 * two must name the same executable and the same watched paths with no
 * fingerprint change between them. At every later use `runNativeUnits`
 * compares the execution's compiler host, toolchain, target, captured
 * environment snapshot, runtime ABI version and runtime asset set against the
 * recorded ones, and re-fingerprints the watched paths.
 *
 * It does not probe the identity again. A search path that later resolves to
 * a different installation therefore does not change what this value builds
 * with: the pinned executable keeps being used, which is what pinning is for,
 * while an unprepared execution would pick up the new one. In the other
 * direction the fingerprints catch a rewrite of the pinned executable, or of
 * a watched path, that unchanged identity output alone would miss.
 *
 * Runtime bytes come only from the snapshot this value holds, so a runtime
 * file edited after preparation is neither read nor compiled.
 *
 * One limitation is shared with the per-execution path rather than introduced
 * here. A watched directory is fingerprinted as a directory, and the archive
 * key an adapter derives hashes the toolchain's identity output rather than
 * its library tree, so an in-place edit to a file beneath that directory
 * which leaves the identity output unchanged is observed by neither path.
 */
export async function prepareNativeRuntime(
  host: CompilerHost,
  toolchain: NativeToolchain,
  target: TargetDescription,
  runtimeProvider: RuntimeInputProvider = defaultComponents.runtime,
): Promise<PreparedNativeRuntime> {
  const reuse = toolchain.runtimeArchiveReuse;
  if (reuse == null) {
    throw new Error("The native toolchain does not reuse runtime archives.");
  }
  const environmentPolicy = toolchain.environment;
  if (environmentPolicy == null || host.captureEnvironment == null) {
    throw new Error("The native toolchain environment cannot be captured.");
  }
  const captured = await host.captureEnvironment(environmentPolicy);
  if (captured == null) {
    throw new Error("The native toolchain environment cannot be captured.");
  }
  const toolchainEnvironment = snapshotEnvironment(captured);
  const preparedTarget = snapshotTarget(target);
  const runtime = runtimeProvider.getRuntimeInput();
  // The ABI version and each asset's location, name, and kind are taken
  // before any read starts, so the key and the record this returns describe
  // the same runtime even if the provider changes while a read is pending.
  const runtimeAbiVersion = runtime.abiVersion;
  // Each asset's location, name, and kind are taken before its read starts,
  // and the read goes through a URL built from that snapshot, so a provider
  // URL mutated while a read is in flight cannot attach those bytes to a
  // different location.
  const descriptors = runtime.assets.map((asset) => ({
    kind: asset.kind,
    location: asset.url.href,
    name: asset.name,
  }));
  const assets = await Promise.all(
    descriptors.map(async (descriptor) => ({
      contents: await host.readTextFile(new URL(descriptor.location)),
      kind: descriptor.kind,
      location: descriptor.location,
      name: descriptor.name,
    })),
  );
  if (host.describeFile == null) {
    throw new Error(
      "The compiler host cannot fingerprint files, so a pinned toolchain " +
        "cannot be rechecked.",
    );
  }
  const describeFile = host.describeFile.bind(host);
  const probe = async (compilerPath?: string): Promise<string> => {
    const directory = await host.makeTemporaryDirectory("oseo-prepare-");
    let identity: ProcessObservation;
    try {
      // The probe runs through the host directly, without the per-execution
      // path's start-failure conversion, so a host that refuses to run
      // reaches the composing caller as its own error rather than as a
      // missing identity. A composer prepares once and needs to see why.
      identity = await host.run(
        reuse.createIdentityRequest(
          directory,
          toolchainEnvironment,
          compilerPath,
        ),
      );
    } finally {
      try {
        await host.remove(directory);
      } catch {
        // A retained directory cannot fail an otherwise usable identity.
      }
    }
    const observed = identity.stdout.trim();
    if (identity.exitStatus !== 0 || observed === "") {
      throw new Error("The native toolchain identity is unavailable.");
    }
    return observed;
  };
  const fingerprintPaths = async (
    paths: readonly string[],
  ): Promise<readonly PinnedFile[]> =>
    await Promise.all(
      paths.map(async (path) => {
        const fingerprint = await describeFile(path);
        if (fingerprint == null) {
          throw new Error(`The pinned toolchain path is missing: ${path}.`);
        }
        return { fingerprint, path };
      }),
    );
  /*
   * The first probe only says which executable to pin. Recording its output
   * would leave a window in which the compiler is replaced between that probe
   * and the fingerprints, pairing a new compiler with an old identity. So the
   * probe is repeated through the resolved executable and bracketed by
   * fingerprints, and the preparation is accepted only when the repeat agrees
   * with the first and nothing moved around it.
   */
  const searched = reuse.pinToolchain?.(await probe());
  if (searched == null) {
    throw new Error(
      "The native toolchain does not report the executable its identity " +
        "describes, so it cannot be pinned for a prepared runtime.",
    );
  }
  const before = await fingerprintPaths(searched.watchedPaths);
  if (before.some((entry) => entry.fingerprint.changedAtMilliseconds == null)) {
    throw new Error(
      "The compiler host does not report inode change times, so an " +
        "in-place compiler rewrite could not be detected.",
    );
  }
  const compilerPin = before.find(
    (entry) => entry.path === searched.compilerPath,
  );
  if (compilerPin == null) {
    throw new Error(
      "The native toolchain did not include its compiler among the paths " +
        "it pins.",
    );
  }
  const compilerPath = compilerPin.fingerprint.realPath;
  const toolchainIdentity = await probe(compilerPath);
  const pinned = reuse.pinToolchain?.(toolchainIdentity);
  const pinnedFiles = await fingerprintPaths(searched.watchedPaths);
  if (
    pinned == null ||
    pinned.compilerPath !== searched.compilerPath ||
    pinned.watchedPaths.length !== searched.watchedPaths.length ||
    pinned.watchedPaths.some(
      (path, index) => searched.watchedPaths[index] !== path,
    ) ||
    !samePinnedFiles(before, pinnedFiles)
  ) {
    throw new Error(
      "The native toolchain changed while it was being pinned; prepare " +
        "again once it is stable.",
    );
  }
  const archiveKey = await reuse.createKey({
    runtimeAbiVersion,
    runtimeAssets: assets.map(({ contents, kind, name }) => ({
      contents,
      kind,
      name,
    })),
    target: preparedTarget,
    toolchainEnvironment,
    toolchainIdentity,
  });
  return {
    archiveKey,
    assetDigest: await sha256Hex(
      JSON.stringify(
        assets.map(({ name, kind, contents }) => [name, kind, contents]),
      ),
    ),
    assets,
    // Builds run the resolved file, so repointing the reported path later
    // cannot substitute a different compiler behind the recorded key.
    compilerPath,
    host,
    pinnedFiles,
    runtimeAbiVersion,
    target: preparedTarget,
    toolchain,
    toolchainEnvironment,
    toolchainIdentity,
  };
}

function samePinnedFiles(
  left: readonly PinnedFile[],
  right: readonly PinnedFile[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index];
      return (
        other != null &&
        other.path === entry.path &&
        other.fingerprint.changedAtMilliseconds ===
          entry.fingerprint.changedAtMilliseconds &&
        other.fingerprint.device === entry.fingerprint.device &&
        other.fingerprint.inode === entry.fingerprint.inode &&
        other.fingerprint.modifiedAtMilliseconds ===
          entry.fingerprint.modifiedAtMilliseconds &&
        other.fingerprint.realPath === entry.fingerprint.realPath &&
        other.fingerprint.size === entry.fingerprint.size
      );
    })
  );
}

/**
 * Recheck a prepared runtime's pinned toolchain. `runNativeUnits` calls this
 * before every build it performs with a prepared runtime; a composer that
 * builds something else from the same preparation, such as a reusable
 * harness object, calls it first as well.
 */
export async function verifyPreparedNativeRuntime(
  prepared: PreparedNativeRuntime,
): Promise<void> {
  await requirePinnedToolchain(prepared, prepared.host);
}

/**
 * Recheck the pinned toolchain before a build. This is one stat per watched
 * path, so it runs per native execution rather than once per process: an
 * executable replaced in place, or a path repointed at a different file,
 * must not build under the key the previous one produced.
 */
async function requirePinnedToolchain(
  prepared: PreparedNativeRuntime,
  host: CompilerHost,
): Promise<void> {
  // Bound to the host for the same reason preparation binds it: a host that
  // implements describeFile as a method reading `this` must keep its receiver
  // across every recheck, not just the one preparation performed.
  const describeFile = host.describeFile?.bind(host);
  if (describeFile == null) {
    throw new PreparedNativeRuntimeMismatchError("compiler host");
  }
  const observed = await Promise.all(
    prepared.pinnedFiles.map(async (entry) => {
      const fingerprint = await describeFile(entry.path);
      return fingerprint == null
        ? undefined
        : { fingerprint, path: entry.path };
    }),
  );
  if (
    observed.some((entry) => entry == null) ||
    !samePinnedFiles(
      prepared.pinnedFiles,
      observed.filter((e) => e != null),
    )
  ) {
    throw new PreparedNativeRuntimeMismatchError("pinned native toolchain");
  }
}

async function executeNativeWorkflow(
  host: CompilerHost,
  sourceId: string,
  directory: string,
  input: MirProgram | NativeUnits,
  target: TargetDescription,
  archiveReuse: CliInvocation["runtimeArchiveReuse"],
  toolchain: NativeToolchain,
  prepared?: PreparedNativeRuntime,
): Promise<CliResult> {
  const units = "sources" in input ? input : undefined;
  const emitted =
    "sources" in input
      ? input.sources[0]
      : defaultComponents.backend.emit(input);
  if (emitted == null) throw new Error("No native source units supplied.");
  const extra = units?.sources.slice(1) ?? [];
  const sourceNames = new Set<string>();
  for (const unit of [emitted, ...extra]) {
    const name = unit.sourceName.toLowerCase();
    if (!isPortableAssetName(unit.sourceName) || sourceNames.has(name)) {
      throw new Error("Invalid or duplicate native source unit name.");
    }
    sourceNames.add(name);
  }
  for (const unit of extra) {
    // eslint-disable-next-line no-await-in-loop -- Ordered unit staging.
    await host.writeTextFile(join(directory, unit.sourceName), unit.source);
  }
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
    if (sourceNames.has(folded)) {
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
  const reuse = toolchain.runtimeArchiveReuse;
  let toolchainEnvironment: ProcessEnvironment | undefined;
  const environmentPolicy = toolchain.environment;
  if (environmentPolicy != null && host.captureEnvironment != null) {
    try {
      toolchainEnvironment = await host.captureEnvironment(environmentPolicy);
    } catch {
      // An unavailable snapshot keeps compilation on ordinary inheritance.
    }
  }
  if (prepared != null) {
    requirePreparedNativeRuntime(prepared, {
      host,
      runtime,
      target,
      toolchain,
      toolchainEnvironment,
    });
    await requirePinnedToolchain(prepared, host);
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
    const preparedAssets = prepared?.assets;
    if (preparedAssets == null) {
      loadedAssets = [];
      for (const asset of runtime.assets) {
        // eslint-disable-next-line no-await-in-loop -- Reads settle in order.
        const contents = await host.readTextFile(asset.url);
        loadedAssets.push({ asset, contents });
      }
    } else {
      loadedAssets = runtime.assets.flatMap((asset, index) => {
        const entry = preparedAssets[index];
        return entry == null ? [] : [{ asset, contents: entry.contents }];
      });
    }
    const readAssets = loadedAssets;
    try {
      const identity =
        prepared?.toolchainIdentity ??
        (await observeToolchainIdentity(
          host,
          toolchain,
          directory,
          toolchainEnvironment,
        ));
      if (identity == null) {
        throw new Error("The native toolchain identity is unavailable.");
      }
      const key =
        prepared?.archiveKey ??
        (await reuse.createKey({
          runtimeAbiVersion: runtime.abiVersion,
          runtimeAssets: readAssets.map((entry) => ({
            contents: entry.contents,
            kind: entry.asset.kind,
            name: entry.asset.name,
          })),
          target,
          toolchainEnvironment,
          toolchainIdentity: identity,
        }));
      const cacheDirectory = await cache.getDirectory("runtime-archives");
      const candidate = join(cacheDirectory, `liboseo-runtime-${key}.a`);
      cacheLock = await cache.acquireFileLock(candidate);
      // Acquiring the lock can wait, so the pin is rechecked after it: this
      // decision either consumes an archive or claims the right to publish
      // one under the prepared key.
      if (prepared != null) await requirePinnedToolchain(prepared, host);
      if (await cache.hasFile(candidate)) {
        cachedArchivePath = candidate;
        await releaseCacheLock(cacheLock);
        cacheLock = undefined;
      } else {
        publishArchivePath = candidate;
      }
    } catch (error) {
      await releaseCacheLock(cacheLock);
      cacheLock = undefined;
      // Falling back to a build without archive reuse is right for a cache
      // that is merely unavailable, and wrong for a toolchain that moved.
      if (error instanceof PreparedNativeRuntimeMismatchError) throw error;
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
      for (const [index, asset] of runtime.assets.entries()) {
        const destination = join(directory, asset.name);
        const held = prepared?.assets[index]?.contents;
        const contents =
          held ??
          // eslint-disable-next-line no-await-in-loop -- Reads are ordered.
          (await host.readTextFile(asset.url));
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
    const plan = toolchain.createBuildPlan({
      ...includePropertiesWhen(() => {
        if (prepared == null) return undefined;
        return { compilerPath: prepared.compilerPath };
      }),
      ...includePropertiesWhen(() => {
        if (toolchainEnvironment == null) return undefined;
        return {
          environment: toolchainEnvironment,
        };
      }),
      generatedSourcePath,
      ...includePropertiesWhen(() => {
        if (units == null) return undefined;
        return {
          additionalGeneratedSourcePaths: extra.map((unit) =>
            join(directory, unit.sourceName),
          ),
          prebuiltObjectPaths: units.prebuiltObjectPaths,
        };
      }),
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
    // Staging ran between the last recheck and here, so the pin is confirmed
    // once more immediately before the compiler is invoked.
    if (prepared != null) await requirePinnedToolchain(prepared, host);
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
    // Every artifact this build produced, whether it is published under the
    // prepared key or only executed here, has to come from the pinned
    // compiler, so the last recheck covers the whole build rather than only
    // the publication branch below.
    if (prepared != null) await requirePinnedToolchain(prepared, host);
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
  toolchain: NativeToolchain = defaultComponents.toolchain,
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
  let mir: MirProgram | NativeUnits;
  const moduleGoal =
    parsed.value.module ||
    isModuleSource(source, sourceId, parsed.value.sourceId);
  if (moduleGoal && parsed.value.test262Host) {
    return diagnosticResult(
      hostDiagnostic(
        sourceId,
        "The --test262-host option applies only to Scripts.",
      ),
    );
  }
  if (moduleGoal) {
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
      parsed.value.test262Host,
    );
  } else {
    const compiled = compileSource(
      defaultComponents.frontend,
      {
        source,
        sourceId,
      },
      {
        specialization: parsed.value.specialization,
        test262Host: parsed.value.test262Host,
      },
    );
    const diagnostic = compiled.diagnostics[0];
    if (diagnostic != null) return diagnosticResult(diagnostic);
    if (compiled.mir == null) {
      return diagnosticResult(
        hostDiagnostic(sourceId, "The compiler did not produce MIR."),
      );
    }
    // Each agent program is a generated unit of its own, linked beside
    // the main program whose table names its entry.
    mir = parsed.value.test262Host
      ? {
          prebuiltObjectPaths: [],
          sources: [compiled.mir, ...(compiled.agents ?? [])].map((program) =>
            defaultComponents.backend.emit(program),
          ),
        }
      : compiled.mir;
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
      toolchain,
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

/** Pre-emitted units for native composition, with no JavaScript compilation. */
export interface NativeUnits {
  readonly sources: readonly EmittedNativeSource[];
  readonly prebuiltObjectPaths: readonly string[];
}

/**
 * Execute trusted generated units through the ordinary native host workflow.
 * The composing caller owns admission, emission, and prebuilt object lifetime.
 * It may also supply a `preparedRuntime` from `prepareNativeRuntime` so that
 * this execution reuses one process-wide runtime read, identity probe, and
 * archive key; a prepared runtime that does not match this execution's inputs
 * raises `PreparedNativeRuntimeMismatchError` after the temporary directory is
 * removed, and is never used.
 */
export async function runNativeUnits(
  units: NativeUnits,
  sourceId: string,
  host: CompilerHost,
  toolchain: NativeToolchain,
  archiveReuse: "enabled" | "disabled" = "enabled",
  preparedRuntime?: PreparedNativeRuntime,
): Promise<CliResult> {
  const selected = selectExecutionTarget(host, undefined, sourceId);
  if ("diagnostic" in selected) return diagnosticResult(selected.diagnostic);
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
  let mismatch: PreparedNativeRuntimeMismatchError | undefined;
  try {
    result = await executeNativeWorkflow(
      host,
      sourceId,
      directory,
      units,
      selected.target,
      archiveReuse,
      toolchain,
      preparedRuntime,
    );
  } catch (error) {
    if (error instanceof PreparedNativeRuntimeMismatchError) mismatch = error;
    result = diagnosticResult(
      hostDiagnostic(sourceId, "The native host workflow failed."),
    );
  }
  try {
    await host.remove(directory);
  } catch {
    if (mismatch != null) throw mismatch;
    return diagnosticResult(
      hostDiagnostic(
        sourceId,
        "The native temporary directory could not be removed.",
      ),
    );
  }
  if (mismatch != null) throw mismatch;
  return result;
}
