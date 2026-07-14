/** Stable diagnostic codes owned by the Oseo compiler. */
export type DiagnosticCode = "OSEO0001" | "OSEO1001" | "OSEO2001" | "OSEO3001";

/** A half-open UTF-8 byte range. */
export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/** A one-based Unicode scalar-value source position. */
export interface Position {
  readonly line: number;
  readonly column: number;
}

/** A half-open source range. */
export interface SourceRange {
  readonly start: Position;
  readonly end: Position;
}

/** A source-located error independent of a bootstrap parser or host. */
export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly sourceId: string;
  readonly byteRange: ByteRange;
  readonly range: SourceRange;
  readonly message: string;
  readonly notes?: readonly string[];
}

/** Input accepted by a source frontend implementation. */
export interface SourceInput {
  readonly source: string;
  readonly sourceId: string;
}

/** M0 frontend output, intentionally opaque until M1 owns its syntax tree. */
export interface FrontendResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly parsed: boolean;
  readonly sourceId: string;
}

/** Replaceable source frontend boundary owned by compiler core. */
export interface SourceFrontend {
  parse(input: SourceInput): FrontendResult;
}

/** The targets exercised by the M0 native fixture harness. */
export type TargetName = "aarch64-linux-musl" | "x86_64-linux-gnu";

/** Explicit target properties consumed by native toolchain adapters. */
export interface TargetDescription {
  readonly cStandard: "c11";
  readonly execute: boolean;
  readonly name: TargetName;
  readonly sanitizeUndefinedBehavior: boolean;
}

/** M0-only synthetic backend input used to prove package composition. */
export interface SyntheticNativeModule {
  readonly kind: "m0-synthetic-native-module";
  readonly outputLine: string;
}

/** Deterministic source emitted by a replaceable native backend. */
export interface EmittedNativeSource {
  readonly source: string;
  readonly sourceName: string;
}

/** Backend boundary that never performs process execution. */
export interface NativeBackend {
  emit(input: SyntheticNativeModule): EmittedNativeSource;
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

/** One process request created by a native toolchain adapter. */
export interface ProcessRequest {
  readonly args: readonly string[];
  readonly command: string;
  readonly cwd: string;
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
  readonly target: TargetDescription;
}

/** Explicit inputs used to construct a native build plan. */
export interface NativeBuildInput {
  readonly generatedSourcePath: string;
  readonly runtimeDirectory: string;
  readonly runtimeSourcePath: string;
  readonly target: TargetDescription;
  readonly workingDirectory: string;
}

/** Toolchain boundary that constructs commands without executing them. */
export interface NativeToolchain {
  createBuildPlan(input: NativeBuildInput): NativeBuildPlan;
}

/** Narrow host boundary used by compiler adapters and test infrastructure. */
export interface CompilerHost {
  makeTemporaryDirectory(prefix: string): Promise<string>;
  readTextFile(path: string | URL): Promise<string>;
  remove(path: string): Promise<void>;
  run(request: ProcessRequest): Promise<ProcessObservation>;
  writeTextFile(path: string, contents: string): Promise<void>;
}

/** Render the stable first line of an Oseo diagnostic. */
export function renderDiagnostic(diagnostic: Diagnostic): string {
  const position = diagnostic.range.start;
  return (
    `${diagnostic.sourceId}:${position.line}:${position.column}: ` +
    `error[${diagnostic.code}]: ${diagnostic.message}`
  );
}

/** Return the accepted M0 target description for an explicit target name. */
export function describeTarget(name: TargetName): TargetDescription {
  if (name === "x86_64-linux-gnu") {
    return {
      cStandard: "c11",
      execute: true,
      name,
      sanitizeUndefinedBehavior: true,
    };
  }
  return {
    cStandard: "c11",
    execute: false,
    name,
    sanitizeUndefinedBehavior: false,
  };
}
