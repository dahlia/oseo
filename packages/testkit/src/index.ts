import type {
  CompilerCacheLock,
  CompilerHost,
  ExecutionHostDescription,
  NativeBackend,
  NativeToolchain,
  MirProgram,
  ProcessEnvironment,
  ProcessObservation,
  ProcessRequest,
  RuntimeInputProvider,
  SpecializationMode,
  TargetDescription,
} from "@oseo/compiler";
import { canExecuteTarget } from "@oseo/compiler";

export { summarizeTest262, test262Group } from "./test262-summary.ts";

/** Complete observation retained for one native fixture build and run. */
export interface NativeFixtureObservation extends ProcessObservation {
  readonly compilerInvocation: readonly string[];
  readonly counters?: RuntimeObservationCounters;
  readonly emittedC: string;
  readonly executionHost?: ExecutionHostDescription;
  readonly target: TargetDescription;
}

/** Operation requested from one explicit target and host pair. */
export type NativeFixtureOperation = "compile" | "execute";

/** Test-only runtime counters kept separate from JavaScript observations. */
export interface RuntimeObservationCounters {
  readonly allocations: number;
  readonly collections: number;
  readonly genericAdditionCalls: number;
  readonly guardHits: number;
  readonly guardMisses: number;
  readonly overflowMisses: number;
}

/** Injected components and options for one native fixture. */
export interface NativeFixtureOptions {
  readonly backend: NativeBackend;
  readonly host: CompilerHost;
  readonly input: MirProgram;
  readonly keepArtifacts?: boolean;
  readonly operation: NativeFixtureOperation;
  readonly runtime: RuntimeInputProvider;
  readonly runtimeArchiveReuse?: "disabled" | "enabled";
  readonly target: TargetDescription;
  readonly toolchain: NativeToolchain;
}

/** Observable output used by reference and native fixture comparisons. */
export interface FixtureObservation extends ProcessObservation {}

/** Classification retained for one reviewed test262 execution. */
export type Test262Classification =
  | "expected-negative"
  | "harness-failure"
  | "infrastructure-failure"
  | "pass"
  | "semantic-failure"
  | "unsupported-profile-feature";

/** Non-semantic failure source recorded before result classification. */
export type Test262FailureKind = "harness" | "infrastructure";

/** Strictness variants requested by test262 frontmatter. */
export type Test262Strictness = "non-strict" | "strict";

/** Goal symbol one reviewed case compiles under. */
export type Test262ExecutionMode = "module" | "script";

/**
 * Failure phase declared by test262 metadata. Parse includes early errors.
 */
export type Test262FailurePhase = "parse" | "resolution" | "runtime";

/**
 * Reviewed semantic dependency tags frozen by ADR 0013. Any other value is
 * a validation error until a reviewed change to that record admits it.
 */
export const test262DependencyVocabulary: ReadonlySet<string> = new Set([
  "abrupt-completion",
  "array-buffer",
  "async-functions",
  "async-iteration",
  "bigint-primitive",
  "classes",
  "control-flow",
  "default-parameters",
  "destructuring-bindings",
  "dynamic-source",
  "error-intrinsics",
  "expression-operators",
  "functions",
  "generators",
  "iterator-protocol",
  "lexical-bindings",
  "module-linking",
  "object-literals",
  "object-properties",
  "promise-settlement",
  "property-enumeration",
  "rest-parameters",
  "symbols",
  "timers",
  "top-level-await",
  "var-bindings",
]);

/** Frontmatter and suite identity needed to reproduce one reviewed case. */
export interface Test262Case {
  readonly async: boolean;
  readonly expectedErrorType?: string;
  readonly expectedFailurePhase?: Test262FailurePhase;
  readonly features: readonly string[];
  readonly flags: readonly string[];
  readonly includes: readonly string[];
  readonly mode: Test262ExecutionMode;
  readonly path: string;
  readonly strictness: readonly Test262Strictness[];
  readonly suiteRevision: string;
}

/** One executed strictness and specialization combination. */
export interface Test262Variant {
  readonly specialization: SpecializationMode;
  readonly strictness: Test262Strictness;
}

/**
 * Linked-module evidence for one reviewed case. Identities are relative to
 * the pinned suite root, and the entry records its upstream test path, so a
 * manifest never contains host-specific canonical URLs.
 */
export interface Test262ModuleGraphNode {
  readonly dependencies: readonly string[];
  readonly id: string;
  readonly sourceHash: string;
}

/**
 * Evidence about what actually executed for one reviewed case. Omitted when
 * nothing executed. One observation per case is sound because the runner
 * rejects any difference between executed variants as a semantic failure
 * whose detail names the diverging combination.
 */
export interface Test262Execution {
  readonly harnessIncludes: readonly string[];
  readonly moduleGraph?: readonly Test262ModuleGraphNode[];
  readonly scheduler?: "deterministic-logical-clock";
  readonly target: string;
  readonly variants: readonly Test262Variant[];
}

/** Host-independent observation produced by the test262 adapter. */
export interface Test262Observation {
  readonly detail?: string;
  readonly errorType?: string;
  readonly failureKind?: Test262FailureKind;
  readonly failedPhase?: Test262FailurePhase;
  readonly passed: boolean;
  readonly unsupportedCapability?: string;
}

/** Complete reviewed result for one test262 case. */
export interface Test262Result {
  readonly case: Test262Case;
  readonly classification: Test262Classification;
  readonly dependencies: readonly string[];
  readonly execution?: Test262Execution;
  readonly observation: Test262Observation;
  readonly unsupportedFeatures: readonly string[];
}

/** Classification counts shared by raw, group, and dependency totals. */
export interface Test262Counts {
  readonly expectedNegatives: number;
  readonly harnessFailures: number;
  readonly infrastructureFailures: number;
  readonly passes: number;
  readonly semanticFailures: number;
  readonly unsupportedProfileFeatures: number;
}

/** Counts for one dependency-indexed path group. */
export interface Test262GroupSummary extends Test262Counts {
  readonly group: string;
}

/** Counts for one reviewed semantic dependency tag. */
export interface Test262DependencySummary extends Test262Counts {
  readonly dependency: string;
}

/**
 * Counts that never fold unsupported or infrastructure failures into passes.
 */
export interface Test262Summary extends Test262Counts {
  readonly dependencies: readonly Test262DependencySummary[];
  readonly groups: readonly Test262GroupSummary[];
}

interface ProcessStepObservation {
  readonly observation: ProcessObservation;
  readonly request: ProcessRequest;
}

function join(directory: string, name: string): string {
  return `${directory.replace(/\/$/u, "")}/${name}`;
}

function toolchainIdentity(
  host: CompilerHost,
  toolchain: NativeToolchain,
  workingDirectory: string,
  environment: ProcessEnvironment,
): Promise<string> {
  const reuse = toolchain.runtimeArchiveReuse;
  if (reuse == null) {
    return Promise.reject(
      new Error("The native toolchain does not support archive reuse."),
    );
  }
  const identityRequest = reuse.createIdentityRequest(
    workingDirectory,
    environment,
  );
  return host.run(identityRequest).then((observation) => {
    if (observation.exitStatus !== 0) {
      throw failedProcess(identityRequest, observation);
    }
    const identity = observation.stdout.trim();
    if (identity === "") {
      throw new Error("The native toolchain reported an empty identity.");
    }
    return identity;
  });
}

async function releaseCacheLock(
  lock: CompilerCacheLock | undefined,
): Promise<void> {
  try {
    await lock?.release();
  } catch {
    // Cache cleanup cannot turn a usable native fixture into a failure.
  }
}

/**
 * Require a runtime asset name to be a portable leaf file name so a
 * copied asset can neither escape the fixture directory nor alias
 * another destination through separators or relative segments.
 */
function isPortableAssetName(name: string): boolean {
  return name !== "." && name !== ".." && /^[A-Za-z0-9._-]+$/u.test(name);
}

function displayRequest(request: ProcessRequest): string {
  return [request.command, ...request.args].join(" ");
}

function failedProcess(
  request: ProcessRequest,
  result: ProcessObservation,
): Error {
  return new Error(
    `${displayRequest(request)} failed (${result.exitStatus}):\n` +
      `stdout:\n${result.stdout}\n` +
      `stderr:\n${result.stderr}`,
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error
    ? `${cause.name}: ${cause.message}`
    : `${cause}`;
}

function splitCounters(observation: ProcessObservation) {
  const prefix = "OSEO_OBSERVATIONS ";
  const lines = observation.stderr.split(/(?<=\n)/u);
  // The machine-readable thrown-error marker is appended as the final
  // line; only that runtime-appended marker is removed before comparing
  // observable output, so a marker-shaped line inside a rendered message
  // is preserved.
  const markerIndex = lines.findLastIndex((line) =>
    /^OSEO_THROWN [A-Za-z]+\n?$/u.test(line),
  );
  if (markerIndex >= 0) lines.splice(markerIndex, 1);
  const strippedStderr = lines.join("");
  const index = lines.findLastIndex((line) => line.startsWith(prefix));
  if (index < 0) {
    return strippedStderr === observation.stderr
      ? { observation }
      : { observation: { ...observation, stderr: strippedStderr } };
  }
  const line = lines[index];
  if (line == null)
    return { observation: { ...observation, stderr: strippedStderr } };
  // SAFETY: Every counter field is validated before the record is returned.
  const parsed = JSON.parse(
    line.slice(prefix.length),
  ) as Partial<RuntimeObservationCounters>;
  const keys = [
    "allocations",
    "collections",
    "genericAdditionCalls",
    "guardHits",
    "guardMisses",
    "overflowMisses",
  ] as const;
  for (const key of keys) {
    if (!Number.isSafeInteger(parsed[key]) || (parsed[key] ?? -1) < 0) {
      throw new Error(`Runtime observation has invalid ${key}.`);
    }
  }
  lines.splice(index, 1);
  return {
    // SAFETY: The loop above validates every RuntimeObservationCounters field.
    counters: parsed as RuntimeObservationCounters,
    observation: { ...observation, stderr: lines.join("") },
  };
}

/** Reviewed metadata attached to a classification beyond the observation. */
export interface Test262Evidence {
  readonly dependencies: readonly string[];
  readonly execution?: Test262Execution;
}

/** Classify one test262 observation against the supported feature profile. */
export function classifyTest262(
  testCase: Test262Case,
  observation: Test262Observation,
  supportedFeatures: ReadonlySet<string>,
  evidence: Test262Evidence = { dependencies: [] },
): Test262Result {
  const unsupportedFeatures = testCase.features.filter(
    (feature) => !supportedFeatures.has(feature),
  );
  const errorTypeMatches =
    testCase.expectedErrorType == null ||
    testCase.expectedErrorType === observation.errorType;
  const negativeMatches =
    testCase.expectedFailurePhase != null &&
    !observation.passed &&
    observation.failedPhase === testCase.expectedFailurePhase &&
    errorTypeMatches;
  let classification: Test262Classification;
  if (observation.failureKind === "harness") {
    classification = "harness-failure";
  } else if (observation.failureKind === "infrastructure") {
    classification = "infrastructure-failure";
  } else if (
    unsupportedFeatures.length > 0 ||
    observation.unsupportedCapability != null
  ) {
    classification = "unsupported-profile-feature";
  } else if (negativeMatches) {
    classification = "expected-negative";
  } else if (testCase.expectedFailurePhase == null && observation.passed) {
    classification = "pass";
  } else {
    classification = "semantic-failure";
  }
  return {
    case: testCase,
    classification,
    dependencies: evidence.dependencies,
    ...(evidence.execution == null ? {} : { execution: evidence.execution }),
    observation,
    unsupportedFeatures,
  };
}

/**
 * Build and inspect one source fixture while its artifacts remain alive.
 *
 * Artifacts are removed only after the inspection succeeds. Build, execution,
 * and inspection failures retain the directory and a complete observation.
 */
export async function withNativeFixture<T>(
  options: NativeFixtureOptions,
  inspect: (observation: NativeFixtureObservation) => T | PromiseLike<T>,
): Promise<T> {
  if (options.operation === "execute") {
    if (options.host.executionHost == null) {
      throw new Error(
        "Native execution requires normalized execution-host metadata.",
      );
    }
    if (!canExecuteTarget(options.host.executionHost, options.target)) {
      throw new Error(
        `Target ${options.target.name} cannot execute on ` +
          `${options.host.executionHost.operatingSystem}/` +
          `${options.host.executionHost.architecture}.`,
      );
    }
  }
  const runtimeInput = options.runtime.getRuntimeInput();
  const assetNames = new Set<string>();
  for (const asset of runtimeInput.assets) {
    if (!isPortableAssetName(asset.name)) {
      throw new Error(
        `Runtime input lists an invalid asset name: ${asset.name}.`,
      );
    }
    // Case-folded so one destination on a case-insensitive filesystem
    // cannot silently drop a copied asset.
    const folded = asset.name.toLowerCase();
    if (assetNames.has(folded)) {
      throw new Error(
        `Runtime input lists a duplicate asset name: ${asset.name}.`,
      );
    }
    assetNames.add(folded);
  }
  const directory = await options.host.makeTemporaryDirectory("oseo-native-");
  let compilerInvocation: readonly string[] = [];
  let emittedC: string | undefined;
  let nativeObservation: NativeFixtureObservation | undefined;
  let cacheLock: CompilerCacheLock | undefined;
  const steps: ProcessStepObservation[] = [];
  let succeeded = false;
  try {
    const emitted = options.backend.emit(options.input);
    emittedC = emitted.source;
    if (assetNames.has(emitted.sourceName.toLowerCase())) {
      throw new Error(
        "Runtime input lists an asset that collides with the " +
          `generated source name: ${emitted.sourceName}.`,
      );
    }
    const generatedSourcePath = join(directory, emitted.sourceName);
    await options.host.writeTextFile(generatedSourcePath, emitted.source);

    const loadedAssets = await Promise.all(
      runtimeInput.assets.map(async (asset) => ({
        asset,
        contents: await options.host.readTextFile(asset.url),
      })),
    );
    if (!loadedAssets.some((entry) => entry.asset.kind === "source")) {
      throw new Error("Runtime input did not contain a C source asset.");
    }
    const reuse = options.toolchain.runtimeArchiveReuse;
    let toolchainEnvironment: ProcessEnvironment | undefined;
    const environmentPolicy = options.toolchain.environment;
    if (environmentPolicy != null && options.host.captureEnvironment != null) {
      try {
        toolchainEnvironment =
          await options.host.captureEnvironment(environmentPolicy);
      } catch {
        // An unavailable snapshot keeps compilation on ordinary inheritance.
      }
    }
    const cache =
      options.runtimeArchiveReuse !== "disabled" &&
      reuse != null &&
      toolchainEnvironment != null
        ? options.host.cache
        : undefined;
    let cachedArchivePath: string | undefined;
    let publishArchivePath: string | undefined;
    if (cache != null && reuse != null && toolchainEnvironment != null) {
      try {
        const identity = await toolchainIdentity(
          options.host,
          options.toolchain,
          directory,
          toolchainEnvironment,
        );
        const key = await reuse.createKey({
          runtimeAbiVersion: runtimeInput.abiVersion,
          runtimeAssets: loadedAssets.map((entry) => ({
            contents: entry.contents,
            kind: entry.asset.kind,
            name: entry.asset.name,
          })),
          target: options.target,
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
    const copiedAssets = await Promise.all(
      loadedAssets.map(async (entry) => {
        if (cachedArchivePath != null && entry.asset.kind === "source") {
          return undefined;
        }
        const asset = entry.asset;
        const destination = join(directory, asset.name);
        await options.host.writeTextFile(destination, entry.contents);
        return { asset, destination };
      }),
    );
    const runtimeSourcePaths = copiedAssets.flatMap((entry) =>
      entry?.asset.kind === "source" ? [entry.destination] : [],
    );
    if (runtimeSourcePaths.length === 0 && cachedArchivePath == null) {
      throw new Error("Runtime input did not contain a C source asset.");
    }

    const plan = options.toolchain.createBuildPlan({
      ...(toolchainEnvironment == null
        ? {}
        : { environment: toolchainEnvironment }),
      generatedSourcePath,
      ...(cachedArchivePath == null
        ? {}
        : { prebuiltRuntimeArchivePath: cachedArchivePath }),
      runtimeDirectory: directory,
      runtimeSourcePaths,
      target: options.target,
      workingDirectory: directory,
    });
    compilerInvocation = plan.requests.map(displayRequest);
    for (const request of plan.requests) {
      // eslint-disable-next-line no-await-in-loop -- Build steps are ordered.
      const result = await options.host.run(request);
      steps.push({ observation: result, request });
      if (result.exitStatus !== 0) throw failedProcess(request, result);
    }
    if (
      publishArchivePath != null &&
      plan.runtimeArchivePath != null &&
      cache != null
    ) {
      try {
        await cache.publishFile(plan.runtimeArchivePath, publishArchivePath);
      } catch {
        // The completed fixture remains usable when optional publication fails.
      }
      await releaseCacheLock(cacheLock);
      cacheLock = undefined;
    }

    let observation: ProcessObservation;
    if (options.operation === "execute") {
      const request = {
        args: [],
        command: plan.executablePath,
        cwd: directory,
      };
      observation = await options.host.run(request);
      steps.push({ observation, request });
    } else {
      observation = { exitStatus: 0, stderr: "", stdout: "" };
    }
    if (observation.exitStatus !== 0) {
      throw new Error(
        `Native fixture failed (${observation.exitStatus}):\n` +
          observation.stderr,
      );
    }
    const separated = splitCounters(observation);
    if (
      options.input.observeSpecialization === true &&
      options.operation === "execute" &&
      separated.counters == null
    ) {
      throw new Error("Native fixture did not report runtime observations.");
    }
    const completeObservation: NativeFixtureObservation = {
      ...separated.observation,
      compilerInvocation,
      ...(separated.counters == null ? {} : { counters: separated.counters }),
      emittedC: emitted.source,
      ...(options.host.executionHost == null
        ? {}
        : { executionHost: options.host.executionHost }),
      target: options.target,
    };
    nativeObservation = completeObservation;
    const result = await inspect(completeObservation);
    succeeded = true;
    return result;
  } catch (error) {
    const metadata = {
      compilerInvocation,
      emittedC,
      error: errorMessage(error),
      observation: nativeObservation ?? steps.at(-1)?.observation,
      steps,
      executionHost: options.host.executionHost,
      target: options.target,
    };
    try {
      await options.host.writeTextFile(
        join(directory, "native-observation.json"),
        `${JSON.stringify(metadata, null, 2)}\n`,
      );
    } catch (metadataError) {
      throw new Error(
        `Native artifacts retained at ${directory}; ` +
          `observation metadata write failed after ${errorMessage(error)}`,
        { cause: metadataError },
      );
    }
    throw new Error(`Native artifacts retained at ${directory}`, {
      cause: error,
    });
  } finally {
    await releaseCacheLock(cacheLock);
    if (succeeded && options.keepArtifacts !== true) {
      await options.host.remove(directory);
    }
  }
}

/** Require reference hosts and native execution to agree exactly. */
export function assertMatchingObservations(
  observations: readonly FixtureObservation[],
): void {
  const first = observations[0];
  if (first == null) throw new Error("At least one observation is required.");
  for (const observation of observations.slice(1)) {
    if (
      observation.exitStatus !== first.exitStatus ||
      observation.stderr !== first.stderr ||
      observation.stdout !== first.stdout
    ) {
      throw new Error(
        "Fixture observations differ:\n" +
          `expected=${JSON.stringify(first)}\n` +
          `actual=${JSON.stringify(observation)}`,
      );
    }
  }
}
