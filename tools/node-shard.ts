import { globSync } from "node:fs";
import { sep } from "node:path";
import { dedicatedMacosNodeFiles, dedicatedNodeFiles } from "./native-shard.ts";
import {
  nodeShardCosts,
  nodeShardFallbackSeconds,
} from "./node-shard-costs.ts";
import type { TestShard } from "./shard.ts";

/**
 * Discover the same files as Node 24's default test runner, including its
 * JavaScript and stripped TypeScript extensions and test-directory rules.
 * Keep node_modules excluded at every depth, as Node's CLI does. Paths use
 * forward slashes on every host, because the dedicated-file list and the
 * exclusion below compare repository-relative POSIX paths and globSync
 * returns platform separators on Windows.
 */
export function discoverNodeTests(cwd: string): readonly string[] {
  return globSync(
    "**/{test,test/**/*,test-*,*[._-]test}.{js,mjs,cjs,ts,mts,cts}",
    { cwd, exclude: ["**/node_modules", "**/node_modules/**"] },
  )
    .map((file) => (sep === "/" ? file : file.split(sep).join("/")))
    .toSorted();
}

/** Fixed host-specific scheduling model for ordinary Node shards. */
export interface NodeShardModel {
  readonly costs: Readonly<Record<string, number>>;
  readonly fallback: number;
  readonly width: number;
}

/**
 * Select the measured host model, independent of local CPU availability.
 * The width is Node's default file concurrency on the hosted runner, its
 * available parallelism minus one: four Linux vCPUs and three macOS cores.
 */
export function nodeShardModel(platform: string): NodeShardModel {
  const target = platform === "darwin" ? "macos-aarch64" : "linux-x86_64-gnu";
  return {
    costs: nodeShardCosts[target] ?? {},
    fallback: nodeShardFallbackSeconds[target] ?? 1,
    width: platform === "darwin" ? 2 : 3,
  };
}

/**
 * Model one Node run's duration: Node sorts the files it is given and
 * starts each on the first free worker, so a heavy file sorted late adds
 * its whole weight after the others started.
 */
function modeledWall(
  files: readonly string[],
  weight: (path: string) => number,
  width: number,
): number {
  const workers = Array.from({ length: width }, () => 0);
  for (const path of files.toSorted()) {
    const worker = workers.indexOf(Math.min(...workers));
    workers[worker] = workers[worker]! + weight(path);
  }
  return Math.max(...workers);
}

/** Modeled seconds of one shard's Node run, excluding job setup. */
export function modeledNodeShardSeconds(
  files: readonly string[],
  platform: string,
): number {
  const { costs, fallback, width } = nodeShardModel(platform);
  return modeledWall(files, (path) => costs[path] ?? fallback, width);
}

/**
 * Partition files exactly once using measured weights. Files are placed
 * heaviest first, ties in path order, each on the shard whose modeled run
 * ends earliest with it added, ties to the lowest index. Unknown files
 * weigh the host fallback.
 */
export function selectNodeTestShard(
  files: readonly string[],
  shard: TestShard,
  platform: string,
): readonly string[] {
  if (new Set(files).size !== files.length) {
    throw new Error("Node shard files must be unique.");
  }
  const { costs, fallback, width } = nodeShardModel(platform);
  const weight = (path: string): number => costs[path] ?? fallback;
  const ordered = files.toSorted(
    (a, b) => weight(b) - weight(a) || (a < b ? -1 : a > b ? 1 : 0),
  );
  const partitions: string[][] = Array.from({ length: shard.total }, () => []);
  for (const path of ordered) {
    const ends = partitions.map((partition) =>
      modeledWall([...partition, path], weight, width),
    );
    partitions[ends.indexOf(Math.min(...ends))]!.push(path);
  }
  return partitions[shard.index - 1]!.toSorted();
}

/**
 * The files a host's ordinary Node shards cover: Node's discovery minus
 * the files that have their own dedicated jobs on that host.
 */
export function nodeShardInventory(
  cwd: string,
  platform: string,
): readonly string[] {
  const dedicated = dedicatedNodeFilesFor(platform);
  return discoverNodeTests(cwd).filter((file) => !dedicated.includes(file));
}

/**
 * The files that run in a host's dedicated ordinary Node jobs instead of
 * its shards: the files dedicated on both hosts, plus the macOS-only ones.
 */
export function dedicatedNodeFilesFor(platform: string): readonly string[] {
  return platform === "darwin"
    ? [...dedicatedMacosNodeFiles, ...dedicatedNodeFiles]
    : dedicatedNodeFiles;
}

/** Node's arguments for one shard: the selected files, run unsharded. */
export function nodeTestShardArguments(
  cwd: string,
  shard: TestShard,
  platform: string,
): readonly string[] {
  const files = selectNodeTestShard(
    nodeShardInventory(cwd, platform),
    shard,
    platform,
  );
  // An empty explicit list would make Node discover everything again.
  if (files.length === 0) return [];
  return ["--test", ...files];
}
