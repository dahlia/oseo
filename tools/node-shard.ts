import { globSync } from "node:fs";
import { dedicatedMacosNodeFiles } from "./native-shard.ts";
import type { TestShard } from "./shard.ts";

/**
 * Discover the same files as Node 24's default test runner, including its
 * JavaScript and stripped TypeScript extensions and test-directory rules.
 * Keep node_modules excluded at every depth, as Node's CLI does.
 */
export function discoverNodeTests(cwd: string): readonly string[] {
  return globSync(
    "**/{test,test/**/*,test-*,*[._-]test}.{js,mjs,cjs,ts,mts,cts}",
    { cwd, exclude: ["**/node_modules", "**/node_modules/**"] },
  ).toSorted();
}

/** Exclude dedicated files before Node partitions the remaining inventory. */
export function nodeTestShardArguments(
  cwd: string,
  shard: TestShard,
): readonly string[] {
  const files = discoverNodeTests(cwd).filter(
    (file) => !dedicatedMacosNodeFiles.includes(file),
  );
  // An empty explicit list would make Node discover everything again.
  if (files.length === 0) return [];
  return ["--test", `--test-shard=${shard.index}/${shard.total}`, ...files];
}
