import type {
  CompilerHost,
  NativeBackend,
  NativeToolchain,
  MirProgram,
  ProcessObservation,
  ProcessRequest,
  RuntimeInputProvider,
  SpecializationMode,
  TargetDescription,
} from "@oseo/compiler";

/** Complete observation retained for one native fixture build and run. */
export interface NativeFixtureObservation extends ProcessObservation {
  readonly compilerInvocation: readonly string[];
  readonly counters?: RuntimeObservationCounters;
  readonly emittedC: string;
  readonly target: TargetDescription;
}

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
  readonly runtime: RuntimeInputProvider;
  readonly target: TargetDescription;
  readonly toolchain: NativeToolchain;
}

/** Observable output used by reference and native fixture comparisons. */
export interface FixtureObservation extends ProcessObservation {}

/** Classification retained for one reviewed test262 execution. */
export type Test262Classification =
  | "expected-negative"
  | "harness-failure"
  | "pass"
  | "semantic-failure"
  | "unsupported-profile-feature";

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
  "async-functions",
  "functions",
  "lexical-bindings",
  "module-linking",
  "object-properties",
  "promise-settlement",
  "timers",
  "top-level-await",
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
  readonly failedPhase?: Test262FailurePhase;
  readonly harnessFailed: boolean;
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

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : `${error}`;
}

function splitCounters(observation: ProcessObservation): {
  readonly counters?: RuntimeObservationCounters;
  readonly observation: ProcessObservation;
} {
  const prefix = "OSEO_OBSERVATIONS ";
  const lines = observation.stderr.split(/(?<=\n)/u);
  const index = lines.findLastIndex((line) => line.startsWith(prefix));
  if (index < 0) return { observation };
  const line = lines[index];
  if (line == null) return { observation };
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
    counters: parsed as RuntimeObservationCounters,
    observation: { ...observation, stderr: lines.join("") },
  };
}

/** Reviewed metadata attached to a classification beyond the observation. */
export interface Test262Evidence {
  readonly dependencies: readonly string[];
  readonly execution?: Test262Execution;
}

/**
 * Dependency-indexed path group frozen by ADR 0013: the first two directory
 * segments of the upstream path under *test/*.
 */
export function test262Group(path: string): string {
  const segments = path.split("/");
  const start = segments[0] === "test" ? 1 : 0;
  const directories = segments.slice(start, -1);
  return directories.slice(0, 2).join("/");
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
  if (observation.harnessFailed) {
    classification = "harness-failure";
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

interface MutableTest262Counts {
  expectedNegatives: number;
  harnessFailures: number;
  passes: number;
  semanticFailures: number;
  unsupportedProfileFeatures: number;
}

function emptyCounts(): MutableTest262Counts {
  return {
    expectedNegatives: 0,
    harnessFailures: 0,
    passes: 0,
    semanticFailures: 0,
    unsupportedProfileFeatures: 0,
  };
}

function countClassification(
  counts: MutableTest262Counts,
  classification: Test262Classification,
): void {
  if (classification === "expected-negative") {
    counts.expectedNegatives += 1;
  } else if (classification === "harness-failure") {
    counts.harnessFailures += 1;
  } else if (classification === "pass") {
    counts.passes += 1;
  } else if (classification === "semantic-failure") {
    counts.semanticFailures += 1;
  } else {
    counts.unsupportedProfileFeatures += 1;
  }
}

/**
 * Summarize reviewed test262 records without changing their classifications.
 * Raw totals, path-group totals, and dependency-tag totals stay separate so
 * a large group cannot hide a regression in a smaller dependency.
 */
export function summarizeTest262(
  results: readonly Test262Result[],
): Test262Summary {
  const raw = emptyCounts();
  const groups = new Map<string, MutableTest262Counts>();
  const dependencies = new Map<string, MutableTest262Counts>();
  for (const result of results) {
    countClassification(raw, result.classification);
    const group = test262Group(result.case.path);
    const groupCounts = groups.get(group) ?? emptyCounts();
    groups.set(group, groupCounts);
    countClassification(groupCounts, result.classification);
    for (const dependency of result.dependencies) {
      const dependencyCounts = dependencies.get(dependency) ?? emptyCounts();
      dependencies.set(dependency, dependencyCounts);
      countClassification(dependencyCounts, result.classification);
    }
  }
  const dependencySummaries: Test262DependencySummary[] = [];
  for (const [dependency, counts] of [...dependencies.entries()].toSorted(
    ([left], [right]) => (left < right ? -1 : 1),
  )) {
    dependencySummaries.push({ dependency, ...counts });
  }
  const groupSummaries: Test262GroupSummary[] = [];
  for (const [group, counts] of [...groups.entries()].toSorted(
    ([left], [right]) => (left < right ? -1 : 1),
  )) {
    groupSummaries.push({ group, ...counts });
  }
  return { ...raw, dependencies: dependencySummaries, groups: groupSummaries };
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
  const directory = await options.host.makeTemporaryDirectory("oseo-native-");
  let compilerInvocation: readonly string[] = [];
  let emittedC: string | undefined;
  let nativeObservation: NativeFixtureObservation | undefined;
  const steps: ProcessStepObservation[] = [];
  let succeeded = false;
  try {
    const emitted = options.backend.emit(options.input);
    emittedC = emitted.source;
    const generatedSourcePath = join(directory, emitted.sourceName);
    await options.host.writeTextFile(generatedSourcePath, emitted.source);

    const runtimeInput = options.runtime.getRuntimeInput();
    const copiedAssets = await Promise.all(
      runtimeInput.assets.map(async (asset) => {
        const destination = join(directory, asset.name);
        await options.host.writeTextFile(
          destination,
          await options.host.readTextFile(asset.url),
        );
        return { asset, destination };
      }),
    );
    const runtimeSourcePath = copiedAssets.find(
      (entry) => entry.asset.kind === "source",
    )?.destination;
    if (runtimeSourcePath == null) {
      throw new Error("Runtime input did not contain a C source asset.");
    }

    const plan = options.toolchain.createBuildPlan({
      generatedSourcePath,
      runtimeDirectory: directory,
      runtimeSourcePath,
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

    let observation: ProcessObservation;
    if (options.target.execute) {
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
      options.target.execute &&
      separated.counters == null
    ) {
      throw new Error("Native fixture did not report runtime observations.");
    }
    const completeObservation: NativeFixtureObservation = {
      ...separated.observation,
      compilerInvocation,
      ...(separated.counters == null ? {} : { counters: separated.counters }),
      emittedC: emitted.source,
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
