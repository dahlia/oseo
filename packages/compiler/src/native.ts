import type { MirProgram } from "./mir.ts";
/** Architecture facts admitted by Oseo native targets. */
export type NativeArchitecture = "aarch64" | "x86_64";

/** Operating-system facts admitted by Oseo native targets. */
export type NativeOperatingSystem = "linux" | "macos";

/** ABI environments distinguished by Oseo's native Linux targets. */
export type NativeAbi = "gnu" | "musl";

/** Stable Oseo native target IDs in OS-architecture-ABI order. */
export type TargetName =
  | "linux-aarch64-musl"
  | "linux-x86_64-gnu"
  | "macos-aarch64";

/** Normalized host detection, including explicitly unknown reported facts. */
export interface ExecutionHostDescription {
  readonly architecture: NativeArchitecture | "unknown";
  readonly operatingSystem: NativeOperatingSystem | "unknown";
}

/** Toolchain-neutral artifact facts for one explicit Oseo target ID. */
export interface TargetDescription {
  readonly abi?: NativeAbi;
  readonly architecture: NativeArchitecture;
  readonly cStandard: "c11";
  readonly executableFormat: "elf" | "mach-o";
  readonly name: TargetName;
  readonly operatingSystem: NativeOperatingSystem;
  readonly sanitizers: readonly ("address" | "undefined")[];
}

/** Deterministic source emitted by a replaceable native backend. */
export interface NativeSourceFile {
  readonly source: string;
  readonly sourceName: string;
}

/** Source display plus optional bounded units used for native compilation. */
export interface EmittedNativeSource extends NativeSourceFile {
  /**
   * Compile these files instead of the standalone source when present.
   * Stage the standalone source beside them under sourceName for includes.
   */
  readonly compilationUnits?: readonly NativeSourceFile[];
}

/** Backend boundary that never performs process execution. */
export interface NativeBackend {
  emit(input: MirProgram): EmittedNativeSource;
}

/** One reviewed native asset supplied by a runtime package. */
export interface RuntimeAsset {
  readonly kind: "header" | "source";
  readonly name: string;
  readonly url: URL;
}

/** A versioned set of native runtime inputs. */
export interface RuntimeInput {
  readonly abiVersion: string;
  readonly assets: readonly RuntimeAsset[];
}

/** Provider boundary between runtime selection and backend emission. */
export interface RuntimeInputProvider {
  getRuntimeInput(): RuntimeInput;
}

/**
 * Host-variable names a toolchain permits one of its subprocesses to inherit.
 */
export interface ProcessEnvironmentPolicy {
  readonly inherit: readonly string[];
}

/** Immutable host environment captured for one native workflow. */
export interface ProcessEnvironment {
  readonly variables: Readonly<Record<string, string>>;
}

/** One process request created by a native toolchain adapter. */
export interface ProcessRequest {
  readonly args: readonly string[];
  readonly command: string;
  readonly cwd: string;
  readonly environment?: ProcessEnvironment;
}

/** Host-independent subprocess observation. */
export interface ProcessObservation {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}

/** Files and commands required for one native build. */
export interface NativeBuildPlan {
  readonly executablePath: string;
  readonly requests: readonly ProcessRequest[];
  readonly runtimeArchivePath?: string;
  readonly target: TargetDescription;
}

/** Runtime asset contents covered by one toolchain-owned archive key. */
export interface RuntimeArchiveAsset {
  readonly contents: string;
  readonly kind: RuntimeAsset["kind"];
  readonly name: string;
}

/** Complete semantic and tool inputs covered by one runtime archive key. */
export interface RuntimeArchiveKeyInput {
  readonly runtimeAbiVersion: string;
  readonly runtimeAssets: readonly RuntimeArchiveAsset[];
  readonly target: TargetDescription;
  readonly toolchainEnvironment: ProcessEnvironment;
  readonly toolchainIdentity: string;
}

/**
 * The executable a toolchain identity describes, and the paths whose
 * fingerprints decide whether that identity is still current. A composer
 * that reuses one identity across many builds pins the compiler by this
 * absolute path and rechecks the fingerprints before every build, so an
 * executable replaced or relinked mid-process cannot run under a key
 * derived from the previous one.
 */
export interface PinnedToolchain {
  readonly compilerPath: string;
  readonly watchedPaths: readonly string[];
}

/**
 * Facts a host reports about one path without reading it. The identity
 * fields describe the file the path resolves to, so replacing a file in
 * place and repointing a symbolic link both change them. `realPath` is that
 * resolved location, which a caller pins so later work runs the same file
 * the fingerprint describes.
 */
export interface FileFingerprint {
  /**
   * Inode change time. It moves on an in-place rewrite even when the writer
   * restores the size and the modification time, which the other fields
   * would then miss. A host that cannot report it leaves it absent, and a
   * caller that depends on detecting such a rewrite must refuse that host
   * rather than compare the remaining fields.
   */
  readonly changedAtMilliseconds?: number;
  readonly device: number;
  readonly inode: number;
  readonly modifiedAtMilliseconds: number;
  readonly realPath: string;
  readonly size: number;
}

/** Optional archive-reuse capability implemented by a native toolchain. */
export interface RuntimeArchiveReuse {
  createKey(input: RuntimeArchiveKeyInput): Promise<string>;
  /**
   * Ask the toolchain to report its identity. `compilerPath` repeats the
   * probe through an already resolved executable, which lets a composer
   * confirm that the identity it is about to record describes the file it
   * pinned rather than whatever the search path resolved a moment earlier.
   */
  createIdentityRequest(
    workingDirectory: string,
    environment: ProcessEnvironment,
    compilerPath?: string,
  ): ProcessRequest;
  /**
   * Read the adapter's own identity output and report which executable it
   * describes. An adapter that cannot name one returns undefined, and a
   * composer must then refuse to prepare rather than reuse an unpinned
   * identity.
   */
  pinToolchain?(identity: string): PinnedToolchain | undefined;
}

/**
 * Explicit inputs used to construct a native build plan. Runtime source
 * paths are an ordered collection: the toolchain compiles every listed
 * translation unit and archives the objects in exactly this order, so
 * filesystem enumeration never selects sources or archive layout.
 */
export interface NativeBuildInput {
  /**
   * Absolute path the toolchain must invoke instead of resolving its
   * compiler through the host's search path. A composer that pinned the
   * compiler for a prepared runtime supplies it so that every build of that
   * preparation runs the executable the recorded identity describes.
   */
  readonly compilerPath?: string;
  readonly environment?: ProcessEnvironment;
  readonly generatedSourcePath: string;
  /** Opt-in additional units and already compiled objects, in link order. */
  readonly additionalGeneratedSourcePaths?: readonly string[];
  readonly prebuiltObjectPaths?: readonly string[];
  readonly prebuiltRuntimeArchivePath?: string;
  readonly runtimeDirectory: string;
  readonly runtimeSourcePaths: readonly string[];
  readonly target: TargetDescription;
  readonly workingDirectory: string;
}

/** Toolchain boundary that constructs commands without executing them. */
export interface NativeToolchain {
  /** Exact compiler identity retained in failure and replay metadata. */
  readonly identity?: string;
  createBuildPlan(input: NativeBuildInput): NativeBuildPlan;
  readonly environment?: ProcessEnvironmentPolicy;
  readonly runtimeArchiveReuse?: RuntimeArchiveReuse;
  readonly harnessObjectReuse?: HarnessObjectReuse;
}

/** Exclusive lease over one host-owned compiler cache path. */
export interface CompilerCacheLock {
  release(): Promise<void>;
}

/** Persistent cache storage whose location and lifetime belong to one host. */
export interface CompilerCache {
  acquireFileLock(path: string): Promise<CompilerCacheLock>;
  getDirectory(name: string): Promise<string>;
  hasFile(path: string): Promise<boolean>;
  publishFile(sourcePath: string, destinationPath: string): Promise<void>;
}

/** Narrow host boundary used by compiler adapters and test infrastructure. */
export interface CompilerHost {
  readonly cache?: CompilerCache;
  canonicalizeFile?(path: string): Promise<string>;
  /**
   * Report one path's fingerprint without reading it, or undefined when the
   * path does not exist. It is a stat, so a caller may repeat it per native
   * execution.
   */
  describeFile?(path: string): Promise<FileFingerprint | undefined>;
  captureEnvironment?(
    policy: ProcessEnvironmentPolicy,
  ): Promise<ProcessEnvironment | undefined>;
  readonly executionHost?: ExecutionHostDescription;
  makeTemporaryDirectory(prefix: string): Promise<string>;
  readTextFile(path: string | URL): Promise<string>;
  remove(path: string): Promise<void>;
  run(request: ProcessRequest): Promise<ProcessObservation>;
  writeTextFile(path: string, contents: string): Promise<void>;
}

/** Return the immutable artifact facts for an explicit native target. */
export function describeTarget(name: TargetName): TargetDescription {
  if (name === "linux-x86_64-gnu") {
    return {
      abi: "gnu",
      architecture: "x86_64",
      cStandard: "c11",
      executableFormat: "elf",
      name,
      operatingSystem: "linux",
      sanitizers: ["address", "undefined"],
    };
  }
  if (name === "macos-aarch64") {
    return {
      architecture: "aarch64",
      cStandard: "c11",
      executableFormat: "mach-o",
      name,
      operatingSystem: "macos",
      sanitizers: ["address", "undefined"],
    };
  }
  if (name === "linux-aarch64-musl") {
    return {
      abi: "musl",
      architecture: "aarch64",
      cStandard: "c11",
      executableFormat: "elf",
      name,
      operatingSystem: "linux",
      sanitizers: [],
    };
  }
  throw new Error(`Unsupported native target '${String(name)}'.`);
}

/** Whether one normalized host may execute an artifact for a target. */
export function canExecuteTarget(
  host: ExecutionHostDescription,
  target: TargetDescription,
): boolean {
  return targetForExecutionHost(host)?.name === target.name;
}

/** Select the supported native target matching one execution host. */
export function targetForExecutionHost(
  host: ExecutionHostDescription,
): TargetDescription | undefined {
  if (host.architecture === "x86_64" && host.operatingSystem === "linux") {
    return describeTarget("linux-x86_64-gnu");
  }
  if (host.architecture === "aarch64" && host.operatingSystem === "macos") {
    return describeTarget("macos-aarch64");
  }
  return undefined;
}

/** Normalized object staging contains harness.c and runtime headers. */
export interface HarnessObjectBuildInput {
  /** Pinned compiler, with the same meaning as on `NativeBuildInput`. */
  readonly compilerPath?: string;
  readonly workingDirectory: string;
  readonly target: TargetDescription;
  readonly environment: ProcessEnvironment;
}

/** Complete bundle, compiler, runtime, and tool inputs for object reuse. */
export interface HarnessObjectKeyInput extends RuntimeArchiveKeyInput {
  readonly fragmentAbiVersion: string;
  readonly harnessSources: readonly {
    readonly sourceId: string;
    readonly source: string;
  }[];
  readonly strict: boolean;
  readonly specialization: "enabled" | "disabled";
  readonly observeSpecialization: boolean;
  /** Content identities must include uncommitted implementation changes. */
  readonly frontendIdentity: string;
  readonly compilerIdentity: string;
  readonly backendIdentity: string;
  readonly generatedSource: string;
}

/** Adapter-owned flags are included by createKey, never supplied ambiently. */
export interface HarnessObjectReuse {
  createKey(input: HarnessObjectKeyInput): Promise<string>;
  createBuildRequest(input: HarnessObjectBuildInput): ProcessRequest;
}
