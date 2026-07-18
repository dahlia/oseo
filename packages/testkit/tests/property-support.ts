import process from "node:process";

import fc from "fast-check";
import { __version as fastCheckVersion } from "fast-check";
import type { IAsyncProperty, IProperty, Parameters } from "fast-check";

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
  const path = environment.OSEO_PROPERTY_PATH;
  const replay = path == null || path === "" ? {} : { path };
  return {
    interruptAfterTimeLimit: scaledPositive(
      "time limit",
      options.timeLimitMilliseconds,
      scale,
    ),
    markInterruptAsFailure: true,
    numRuns: scaledPositive("run count", options.numRuns, scale),
    randomType: "xorshift128plus",
    ...replay,
    seed: seed ?? options.seed,
    verbose: true,
  };
}

/** Run one property and retain its named domain and profile on failure. */
export function assertProperty<T>(
  name: string,
  property: IProperty<T>,
  options: PropertySuiteOptions,
): void {
  try {
    fc.assert(property, propertyParameters(options) as Parameters<T>);
  } catch (error) {
    const detail = error instanceof Error ? error.message : `${error}`;
    throw new Error(
      `${name} failed\n` +
        `profile=${options.profile} domain=${options.domain}\n` +
        propertyContext(options) +
        `size-limit=${options.sizeLimit}\n` +
        `fast-check=${fastCheckVersion}\n${detail}`,
      { cause: error },
    );
  }
}

/** Run one asynchronous property with the same replay failure contract. */
export async function assertAsyncProperty<T>(
  name: string,
  property: IAsyncProperty<T>,
  options: PropertySuiteOptions,
): Promise<void> {
  try {
    await fc.assert(property, propertyParameters(options) as Parameters<T>);
  } catch (error) {
    const detail = error instanceof Error ? error.message : `${error}`;
    throw new Error(
      `${name} failed\n` +
        `profile=${options.profile} domain=${options.domain}\n` +
        propertyContext(options) +
        `size-limit=${options.sizeLimit}\n` +
        `fast-check=${fastCheckVersion}\n${detail}`,
      { cause: error },
    );
  }
}
