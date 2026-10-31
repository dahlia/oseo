import { globSync } from "node:fs";
import { sep } from "node:path";
import { dedicatedSanitizerPropertyFiles } from "./native-shard.ts";
import type { TestShard } from "./shard.ts";

/**
 * The ordinary property files the sanitizer property tasks pass to Node,
 * sorted by code point as Node's test runner sorts an explicit file list.
 * Paths use forward slashes on every host so they compare with the
 * dedicated-file list.
 */
export function discoverSanitizerPropertyFiles(cwd: string): readonly string[] {
  return globSync("tests/property/*.property.test.ts", { cwd })
    .map((file) => (sep === "/" ? file : file.split(sep).join("/")))
    .toSorted();
}

/**
 * Select one shared sanitizer property shard without the dedicated files.
 *
 * Node's `--test-shard=INDEX/TOTAL` keeps the files at sorted positions
 * congruent to `INDEX - 1` modulo `TOTAL`. Selecting those positions over
 * the complete list and only then dropping the dedicated files keeps every
 * other file in the shard it already ran in. Without a shard the whole
 * list runs, still without the dedicated files.
 */
export function sharedSanitizerPropertyFiles(
  cwd: string,
  shard?: TestShard,
): readonly string[] {
  return discoverSanitizerPropertyFiles(cwd).filter(
    (file, position) =>
      (shard == null || position % shard.total === shard.index - 1) &&
      !dedicatedSanitizerPropertyFiles.includes(file),
  );
}
