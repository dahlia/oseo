import process from "node:process";
import { writeFileSync } from "node:fs";

import fc from "fast-check";
import { __version as fastCheckVersion } from "fast-check";
import type {
  IAsyncProperty,
  IProperty,
  Parameters,
  PreconditionFailure,
  PropertyFailure,
} from "fast-check";

/** Reviewed structural size tiers for Oseo property generators. */
export type PropertySize = "large" | "small";

/** Options recorded for one deterministic property suite. */
export interface PropertySuiteOptions {
  readonly context?: readonly string[];
  readonly domain: string;
  readonly numRuns: number;
  readonly profile: string;
  readonly seed: number;
  readonly sizeLimit: string;
  readonly timeLimitMilliseconds: number;
}

/** Zero-based case partition; every shard generates the full input stream. */
export interface PropertyCaseShard {
  readonly index: number;
  readonly total: number;
}

/** Parse the explicit one-based case shard used by CI. */
export function propertyCaseShard(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PropertyCaseShard | undefined {
  const value = environment.OSEO_PROPERTY_CASE_SHARD;
  if (value == null || value === "") return undefined;
  const match = /^(\d+)\/(\d+)$/u.exec(value);
  if (match == null) {
    throw new Error("OSEO_PROPERTY_CASE_SHARD must be INDEX/TOTAL.");
  }
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (
    !Number.isSafeInteger(index) ||
    !Number.isSafeInteger(total) ||
    total < 1 ||
    index < 1 ||
    index > total
  ) {
    throw new Error("OSEO_PROPERTY_CASE_SHARD has invalid indices.");
  }
  return { index: index - 1, total };
}

function optionalInteger(
  name: string,
  value: string | undefined,
): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a safe integer.`);
  }
  return parsed;
}

function positiveInteger(name: string, value: string | undefined): number {
  const parsed = optionalInteger(name, value) ?? 1;
  if (parsed < 1) throw new Error(`${name} must be positive.`);
  return parsed;
}

function scaledPositive(name: string, value: number, scale: number): number {
  const scaled = value * scale;
  if (!Number.isSafeInteger(scaled) || scaled < 1) {
    throw new Error(`${name} times OSEO_PROPERTY_RUN_SCALE must be safe.`);
  }
  return scaled;
}

function propertyContext(options: PropertySuiteOptions): string {
  return options.context == null || options.context.length === 0
    ? ""
    : `${options.context.join(" ")}\n`;
}

/** Select one reviewed generator size without process-global configuration. */
export function propertySize(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PropertySize {
  const value = environment.OSEO_PROPERTY_SIZE;
  if (value == null || value === "") return "small";
  if (value !== "small" && value !== "large") {
    throw new Error("OSEO_PROPERTY_SIZE must be small or large.");
  }
  return value;
}

/** Build explicit runner parameters with optional replay environment input. */
export function propertyParameters(
  options: PropertySuiteOptions,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Parameters<unknown> {
  const seed = optionalInteger(
    "OSEO_PROPERTY_SEED",
    environment.OSEO_PROPERTY_SEED,
  );
  const scale = positiveInteger(
    "OSEO_PROPERTY_RUN_SCALE",
    environment.OSEO_PROPERTY_RUN_SCALE,
  );
  // Instrumented lanes run every case several times slower without changing
  // what a case proves. This widens only the interrupt limit, so the reviewed
  // case budget stays fixed and an interrupted run still fails.
  const timeScale = positiveInteger(
    "OSEO_PROPERTY_TIME_SCALE",
    environment.OSEO_PROPERTY_TIME_SCALE,
  );
  const path = environment.OSEO_PROPERTY_PATH;
  // Validate even for callers that only request parameters or samples.
  propertyCaseShard(environment);
  const fullLimit = scaledPositive(
    "time limit",
    options.timeLimitMilliseconds,
    scale * timeScale,
  );
  const replay = path == null || path === "" ? {} : { path };
  return {
    interruptAfterTimeLimit: fullLimit,
    markInterruptAsFailure: true,
    numRuns: scaledPositive("run count", options.numRuns, scale),
    randomType: "xorshift128plus",
    ...replay,
    seed: seed ?? options.seed,
    verbose: true,
  };
}

/** One run counter and shrink state for either fast-check property kind. */
interface CaseRunFilter {
  readonly shouldRun: () => boolean;
  readonly observe: (
    result: PreconditionFailure | PropertyFailure | null,
  ) => void;
}

/** Shared run state keeps sync and async case partitions identical. */
function caseRunFilter(shard: PropertyCaseShard): CaseRunFilter {
  let runIndex = 0;
  let shrinking = false;
  return {
    shouldRun: () => shrinking || runIndex++ % shard.total === shard.index,
    observe: (result) => {
      if (result == null) return;
      if (!("error" in result)) {
        throw new Error("Case sharding requires precondition-free properties.");
      }
      shrinking = true;
    },
  };
}

/** Skip only original generated runs; shrink attempts remain executable. */
export function shardProperty<T>(
  property: IProperty<T>,
  shard: PropertyCaseShard,
): IProperty<T> {
  const filter = caseRunFilter(shard);
  return {
    isAsync: () => false,
    generate: (mrng, runId) => property.generate(mrng, runId),
    shrink: (value) => property.shrink(value),
    runBeforeEach: () => property.runBeforeEach(),
    runAfterEach: () => property.runAfterEach(),
    run: (value) => {
      if (!filter.shouldRun()) return null;
      const result = property.run(value);
      filter.observe(result);
      return result;
    },
  };
}

/** Async counterpart of the generated-case partition. */
export function shardAsyncProperty<T>(
  property: IAsyncProperty<T>,
  shard: PropertyCaseShard,
): IAsyncProperty<T> {
  const filter = caseRunFilter(shard);
  return {
    isAsync: () => true,
    generate: (mrng, runId) => property.generate(mrng, runId),
    shrink: (value) => property.shrink(value),
    runBeforeEach: () => property.runBeforeEach(),
    runAfterEach: () => property.runAfterEach(),
    run: async (value) => {
      if (!filter.shouldRun()) return null;
      const result = await property.run(value);
      filter.observe(result);
      return result;
    },
  };
}

/** Persist the measured property interval for CI's strict aggregate gate. */
function reportCaseShardDuration<T>(
  options: PropertySuiteOptions,
  shard: PropertyCaseShard | undefined,
  parameters: Parameters<T>,
  elapsedMilliseconds: number,
): void {
  const path = process.env.OSEO_PROPERTY_DURATION_FILE;
  if (path == null || path === "") return;
  if (shard == null) {
    throw new Error("Duration reporting requires a case shard.");
  }
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      domain: options.domain,
      profile: options.profile,
      shard: { index: shard.index + 1, total: shard.total },
      durationMilliseconds: elapsedMilliseconds,
      limitMilliseconds: parameters.interruptAfterTimeLimit,
      numRuns: parameters.numRuns,
      path: parameters.path ?? "",
      seed: parameters.seed,
    }) + "\n",
    { flag: "wx" },
  );
}

/** Settings shared by synchronous and asynchronous property assertions. */
interface PropertyRunSettings<T> {
  readonly shard: PropertyCaseShard | undefined;
  readonly replay: boolean;
  readonly parameters: Parameters<T>;
}

/** Shared settings enforce the same budget for both assertion variants. */
function propertyRunSettings<T>(
  options: PropertySuiteOptions,
): PropertyRunSettings<T> {
  const shard = propertyCaseShard();
  // SAFETY: propertyParameters constructs fast-check's Parameters<T> fields.
  const parameters = propertyParameters(options) as Parameters<T>;
  if (shard != null && shard.total > (parameters.numRuns ?? 0)) {
    throw new Error("Case shard total exceeds the generated run count.");
  }
  return {
    shard,
    replay: parameters.path != null && parameters.path !== "",
    parameters,
  };
}

/** Preserve replay details while naming only a shard that actually ran. */
function propertyFailure(
  name: string,
  options: PropertySuiteOptions,
  shard: PropertyCaseShard | undefined,
  replay: boolean,
  error: Error,
): Error {
  return new Error(
    `${name} failed\n` +
      `profile=${options.profile} domain=${options.domain}\n` +
      (process.env.OSEO_NATIVE_TOOLCHAIN === "host-cc"
        ? `compiler=${process.env.OSEO_HOST_CC_IDENTITY ?? "unknown"}\n`
        : "") +
      propertyContext(options) +
      (shard == null || replay
        ? ""
        : `case-shard=${shard.index + 1}/${shard.total}\n`) +
      `size-limit=${options.sizeLimit}\n` +
      `fast-check=${fastCheckVersion}\n${error.message}`,
    { cause: error },
  );
}

/** Run one property and retain its named domain and profile on failure. */
export function assertProperty<T>(
  name: string,
  property: IProperty<T>,
  options: PropertySuiteOptions,
): void {
  const { shard, replay, parameters } = propertyRunSettings<T>(options);
  const selected =
    shard == null || replay ? property : shardProperty(property, shard);
  const started = performance.now();
  try {
    fc.assert(selected, parameters);
  } catch (error) {
    const cause =
      error instanceof Error ? error : new Error(`${error}`, { cause: error });
    throw propertyFailure(name, options, shard, replay, cause);
  }
  reportCaseShardDuration(
    options,
    shard,
    parameters,
    performance.now() - started,
  );
}

/** Run one asynchronous property with the same replay failure contract. */
export async function assertAsyncProperty<T>(
  name: string,
  property: IAsyncProperty<T>,
  options: PropertySuiteOptions,
): Promise<void> {
  const { shard, replay, parameters } = propertyRunSettings<T>(options);
  const selected =
    shard == null || replay ? property : shardAsyncProperty(property, shard);
  const started = performance.now();
  try {
    await fc.assert(selected, parameters);
  } catch (error) {
    const cause =
      error instanceof Error ? error : new Error(`${error}`, { cause: error });
    throw propertyFailure(name, options, shard, replay, cause);
  }
  reportCaseShardDuration(
    options,
    shard,
    parameters,
    performance.now() - started,
  );
}
