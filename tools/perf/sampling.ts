/* eslint-disable no-await-in-loop -- Timings must run serially. */
import type { Kernel } from "./corpus.ts";
import type { Command, Method, Variant } from "./plan.ts";
import { orderForRound, validateMethod } from "./plan.ts";
import type { Execution, Executor } from "./observation.ts";
import { checkExecution } from "./observation.ts";

/** Unrounded observations; warmups never enter this array. */
export interface Sample {
  readonly round: number;
  readonly variant: string;
  readonly runtimeMs: number;
  readonly processMs: number;
}

/** Distribution statistics always retain the raw sample beside them. */
export interface Distribution {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly median: number;
  readonly p95: number;
  readonly mean: number;
  readonly standardDeviation: number;
  readonly mad: number;
}

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** No outlier removal: dispersion and resolution limits stay visible. */
export function distribution(values: readonly number[]): Distribution {
  if (values.length === 0 || values.some((v) => !Number.isFinite(v) || v < 0)) {
    throw new Error("Distribution requires finite nonnegative samples.");
  }
  const sorted = values.toSorted((a, b) => a - b);
  const center = median(sorted);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    count: values.length,
    min: sorted[0]!,
    max: sorted.at(-1)!,
    median: center,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
    mean,
    standardDeviation: Math.sqrt(
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length,
    ),
    mad: median(
      values.map((v) => Math.abs(v - center)).toSorted((a, b) => a - b),
    ),
  };
}

/**
 * Root supplies built uninstrumented variants after integrating optimized.
 * Every warmup and repetition self-checks; blocked forms fail before execution.
 */
export function sampleKernel(
  kernel: Kernel,
  variants: readonly Variant[],
  method: Method,
  run: Executor,
): readonly Sample[] {
  validateMethod(method);
  if (variants.length === 0 || variants.some((v) => v.blocked != null)) {
    throw new Error("Measurement requires a nonempty, fully built matrix.");
  }
  if (new Set(variants.map((v) => v.id)).size !== variants.length) {
    throw new Error("Duplicate variants.");
  }
  const samples: Sample[] = [];
  for (let round = 0; round < method.warmups + method.repetitions; round += 1) {
    for (const variant of orderForRound(variants, round)) {
      const result = run(variant.run);
      const runtimeMs = checkExecution(result, kernel.id, method.iterations);
      if (round >= method.warmups) {
        samples.push({
          round: round - method.warmups,
          variant: variant.id,
          runtimeMs,
          processMs: result.wallMs,
        });
      }
    }
  }
  return samples;
}

/** Startup is process creation through checked output and exit, warm-cache. */
export function sampleStartup(
  command: Command,
  method: Method,
  run: Executor,
): readonly number[] {
  validateMethod(method);
  const samples: number[] = [];
  for (let round = 0; round < method.warmups + method.repetitions; round += 1) {
    const result: Execution = run(command);
    checkExecution(result, "startup", 1);
    if (round >= method.warmups) samples.push(result.wallMs);
  }
  return samples;
}

/** RSS runs use the same workload, outside the timing population. */
export function sampleRss(
  command: Command,
  host: PerfHost,
  kernel: Kernel,
  method: Method,
  run: Executor,
): readonly number[] {
  validateMethod(method);
  const samples: number[] = [];
  for (let round = 0; round < method.repetitions; round += 1) {
    const result = run(rssCommand(host, command));
    if (result.stderr.includes("OSEO_OBSERVATIONS ")) {
      throw new Error("Instrumented build cannot supply RSS evidence.");
    }
    // time owns stderr for this run; retain it in raw logs at the executor.
    checkExecution({ ...result, stderr: "" }, kernel.id, method.iterations);
    samples.push(parseRss(host, result.stderr));
  }
  return samples;
}

/** Observation builds yield counters only, never a timing population. */
export function observeKernel(
  command: Command,
  kernel: Kernel,
  iterations: number,
  run: Executor,
): Counters {
  const result = run(command);
  checkExecution(result, kernel.id, iterations, true);
  return parseCounters(result.stderr);
}

import type { PerfHost } from "./plan.ts";
import type { Counters } from "./observation.ts";
import { parseCounters, parseRss, rssCommand } from "./observation.ts";
