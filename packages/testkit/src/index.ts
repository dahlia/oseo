import type {
  CompilerHost,
  NativeBackend,
  NativeToolchain,
  MirProgram,
  ProcessObservation,
  ProcessRequest,
  RuntimeInputProvider,
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
