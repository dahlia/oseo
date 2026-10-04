import { parseArgs } from "node:util";

import { nativeShardCosts } from "./native-shard-costs.ts";
import { parseTestShardArguments } from "./shard.ts";
import type { TestShard } from "./shard.ts";

/** This one case-sharded file runs outside the native file shards. */
export const caseShardedNativeFile =
  "tests/property/m5-object-own-keys.property.test.ts";

/** Fixed host-specific scheduling model for native property partitions. */
export interface NativeShardModel {
  readonly costs: Readonly<Record<string, number>>;
  readonly width: number;
}

/** Select the measured host model, independent of local CPU availability. */
export function nativeShardModel(platform: string): NativeShardModel {
  const target = platform === "darwin" ? "macos-aarch64" : "linux-x86_64-gnu";
  return {
    costs: nativeShardCosts[target] ?? {},
    width: platform === "darwin" ? 3 : 4,
  };
}

/**
 * Partition files exactly once using measured costs and fixed-width batches.
 * Start expensive files first, and assign each batch to the shortest modeled
 * shard. Model widths come from CI, never local CPU availability. Unknown
 * files use the table's median weight; ties use path order then shard index.
 * Linux own-key uses a singleton first shard when the total exceeds one.
 */
export function selectNativeTestShard(
  files: readonly string[],
  shard: TestShard,
  platform: string,
): readonly string[] {
  if (new Set(files).size !== files.length) {
    throw new Error("Native shard file arguments must be unique.");
  }
  // This property approached its deadline in two historical Linux runs and
  // exceeded it when cost batching put other heavyweight files beside it.
  // Reserve a singleton shard whenever a partition can provide one.
  const isolated = caseShardedNativeFile;
  if (platform === "linux" && shard.total > 1 && files.includes(isolated)) {
    if (shard.index === 1) return [isolated];
    return selectNativeTestShard(
      files.filter((path) => path !== isolated),
      { index: shard.index - 1, total: shard.total - 1 },
      platform,
    );
  }
  const { costs, width } = nativeShardModel(platform);
  // Larger totals have one batch per populated shard; later indices are empty.
  const count = Math.min(shard.total, Math.ceil(files.length / width));
  if (shard.index > count) return [];
  const measured = Object.values(costs).toSorted((a, b) => a - b);
  const fallback = measured[Math.floor(measured.length / 2)] ?? 1;
  const weight = (path: string): number => costs[path] ?? fallback;
  const ordered = files.toSorted(
    (a, b) => weight(b) - weight(a) || (a < b ? -1 : a > b ? 1 : 0),
  );
  const partitions: string[][] = Array.from({ length: count }, () => []);
  const slots: number[][] = Array.from({ length: count }, () =>
    Array.from({ length: width }, () => 0),
  );
  for (let offset = 0; offset < ordered.length; offset += width) {
    const loads = slots.map((workers) => Math.max(...workers));
    const index = loads.indexOf(Math.min(...loads));
    const workers = slots[index]!;
    const partition = partitions[index]!;
    for (const path of ordered.slice(offset, offset + width)) {
      const worker = workers.indexOf(Math.min(...workers));
      workers[worker] = workers[worker]! + weight(path);
      partition.push(path);
    }
  }
  return partitions[shard.index - 1]!;
}

/** Translate the wrapper's shard flag to explicit files for Node's runner. */
export function nativeTestArguments(
  args: readonly string[],
  platform: string,
): readonly string[] {
  if (!args.some((arg) => arg === "--shard" || arg.startsWith("--shard="))) {
    if (
      args.some(
        (arg) =>
          arg === "--exclude-case-sharded" ||
          arg.startsWith("--exclude-case-sharded="),
      )
    ) {
      throw new Error("Excluding case-sharded files requires --shard.");
    }
    return args;
  }
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      shard: { type: "string" },
      "exclude-case-sharded": { type: "boolean" },
    },
    tokens: true,
  });
  const flags = parsed.tokens.filter((token) => token.kind === "option");
  const shardFlags = flags.filter((token) => token.name === "shard");
  const excludeFlags = flags.filter(
    (token) => token.name === "exclude-case-sharded",
  );
  if (excludeFlags.length > 1) {
    throw new Error("Native sharding allows one exclusion flag.");
  }
  if (shardFlags.length !== 1 || parsed.values.shard == null) {
    throw new Error("Native sharding requires exactly one --shard flag.");
  }
  const { shard } = parseTestShardArguments(["--shard", parsed.values.shard]);
  if (
    parsed.positionals.length === 0 ||
    parsed.positionals.some(
      (path) => !/^tests\/property\/[\w.-]+\.property\.test\.ts$/u.test(path),
    )
  ) {
    throw new Error("Native sharding requires explicit property file paths.");
  }
  const files = parsed.values["exclude-case-sharded"]
    ? parsed.positionals.filter((path) => path !== caseShardedNativeFile)
    : parsed.positionals;
  const selected = selectNativeTestShard(files, shard!, platform);
  // Node without files discovers the full suite; never launch an empty shard.
  return selected;
}
