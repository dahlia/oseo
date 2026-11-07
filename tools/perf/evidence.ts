import { lstatSync, readFileSync } from "node:fs";

import { digest, kernels } from "./corpus.ts";
import type { Method, PerfHost } from "./plan.ts";
import { validateMethod } from "./plan.ts";
import type { Counters } from "./observation.ts";
import type { HostMetadata } from "./prepare.ts";
import type { Sample } from "./sampling.ts";

/** Artifact identity keeps size comparisons tied to actual built bytes. */
export interface Artifact {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

/** Hash regular files only; generated C sizes exclude runtime source. */
export function artifact(path: string): Artifact {
  const stat = lstatSync(path);
  if (!stat.isFile()) throw new Error(`Not a regular artifact: ${path}`);
  return { path, bytes: stat.size, sha256: digest(readFileSync(path)) };
}

/** A counter build has its own artifact and never supplies latency samples. */
export interface CounterEvidence {
  readonly executable: Artifact;
  readonly observeSpecialization: true;
  readonly counters: Counters;
}

/** Raw per-variant evidence; null sizes mean inapplicable, never zero. */
export interface VariantEvidence {
  readonly id: string;
  readonly executable: Artifact | null;
  readonly generatedC: readonly Artifact[] | null;
  readonly startupMs: readonly number[];
  readonly peakRssBytes: readonly number[];
  readonly counterBuild: CounterEvidence | null;
}

/** One complete kernel on one host; failures stay outside valid results. */
export interface KernelEvidence {
  readonly id: string;
  readonly source: Artifact;
  readonly variants: readonly VariantEvidence[];
  readonly samples: readonly Sample[];
}

/** Host-specific raw records; publication requires both targets separately. */
export interface Evidence {
  readonly schema: 1;
  readonly phase: "measured";
  readonly runId: string;
  readonly measuredAt: string;
  readonly host: HostMetadata;
  readonly method: Method;
  readonly buildConfiguration: "optimized";
  readonly observeSpecialization: false;
  readonly sanitizers: readonly string[];
  readonly conditions: {
    readonly power: string;
    readonly backgroundLoad: string;
    readonly cachePolicy: "warm-process-launch";
    readonly notes: string;
  };
  readonly kernels: readonly KernelEvidence[];
}

const requiredVariants = [
  "oseo-enabled",
  "oseo-disabled",
  "node",
  "node-jitless",
  "deno",
  "bun",
  "node-sea",
  "deno-compile",
  "bun-compile",
];

function validNumbers(values: readonly number[], count: number): boolean {
  return (
    values.length === count &&
    values.every((value) => Number.isFinite(value) && value >= 0)
  );
}

/** Reject missing forms or repetitions before publishing a comparison. */
export function validateEvidence(evidence: Evidence): void {
  validateMethod(evidence.method);
  if (
    evidence.phase !== "measured" ||
    evidence.buildConfiguration !== "optimized" ||
    evidence.observeSpecialization ||
    evidence.sanitizers.length !== 0
  ) {
    throw new Error("Evidence must use uninstrumented optimized builds.");
  }
  if (evidence.host.dirty)
    throw new Error("Measurements require a clean tree.");
  if (evidence.kernels.length === 0)
    throw new Error("Missing kernel evidence.");
  if (
    evidence.kernels
      .map((kernel) => kernel.id)
      .toSorted()
      .join() !==
    kernels
      .map((kernel) => kernel.id)
      .toSorted()
      .join()
  ) {
    throw new Error("Incomplete kernel corpus.");
  }
  const count = evidence.method.repetitions;
  for (const kernel of evidence.kernels) {
    const ids = kernel.variants.map((variant) => variant.id).toSorted();
    if (ids.join() !== requiredVariants.toSorted().join()) {
      throw new Error(`Incomplete variant matrix: ${kernel.id}`);
    }
    for (const variant of kernel.variants) {
      const native = variant.id.startsWith("oseo-");
      const compiled =
        native || variant.id.endsWith("compile") || variant.id === "node-sea";
      if (
        (variant.executable != null) !== compiled ||
        (variant.generatedC != null) !== native ||
        (variant.counterBuild != null) !== native
      ) {
        throw new Error(`Invalid artifact roles: ${variant.id}`);
      }
      if (
        native &&
        (variant.generatedC!.length === 0 ||
          variant.counterBuild!.executable.sha256 ===
            variant.executable!.sha256)
      ) {
        throw new Error(
          "Separate observed executable and generated C required.",
        );
      }
      if (
        !validNumbers(variant.startupMs, count) ||
        !validNumbers(variant.peakRssBytes, count) ||
        variant.peakRssBytes.some((value) => value === 0)
      ) {
        throw new Error(`Incomplete startup/RSS samples: ${variant.id}`);
      }
      const samples = kernel.samples.filter(
        (sample) => sample.variant === variant.id,
      );
      if (
        samples.length !== count ||
        new Set(samples.map((sample) => sample.round)).size !== count ||
        samples.some(
          (sample) =>
            !Number.isSafeInteger(sample.round) ||
            sample.round < 0 ||
            sample.round >= count ||
            !Number.isFinite(sample.runtimeMs) ||
            sample.runtimeMs < 0 ||
            !Number.isFinite(sample.processMs) ||
            sample.processMs < 0,
        )
      ) {
        throw new Error(`Incomplete runtime samples: ${variant.id}`);
      }
    }
    if (kernel.samples.length !== count * requiredVariants.length) {
      throw new Error("Unknown samples outside the variant matrix.");
    }
  }
}

/** Two-host publication never treats cross-linking as native execution. */
export function requireBothHosts(evidence: readonly Evidence[]): void {
  for (const item of evidence) validateEvidence(item);
  const hosts = new Set<PerfHost>(evidence.map((item) => item.host.target));
  if (
    hosts.size !== 2 ||
    !hosts.has("linux-x86_64-gnu") ||
    !hosts.has("macos-aarch64")
  ) {
    throw new Error(
      "Comparison requires Linux AMD64 and macOS AArch64 evidence.",
    );
  }
  if (
    new Set(evidence.map((item) => item.host.commit)).size !== 1 ||
    new Set(evidence.map((item) => JSON.stringify(item.method))).size !== 1
  ) {
    throw new Error("Hosts must measure the same revision and policy.");
  }
}
