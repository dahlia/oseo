import { parseArgs } from "node:util";

import { nativeShardCosts } from "./native-shard-costs.ts";
import { parseTestShardArguments } from "./shard.ts";
import type { TestShard } from "./shard.ts";

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
 */
export function selectNativeTestShard(
  files: readonly string[],
  shard: TestShard,
  platform: string,
): readonly string[] {
  if (new Set(files).size !== files.length) {
    throw new Error("Native shard file arguments must be unique.");
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
    return args;
  }
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: { shard: { type: "string" } },
    tokens: true,
  });
  const flags = parsed.tokens.filter((token) => token.kind === "option");
  if (flags.length !== 1 || parsed.values.shard == null) {
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
  const selected = selectNativeTestShard(parsed.positionals, shard!, platform);
  // Node without files discovers the full suite; never launch an empty shard.
  return selected;
}
