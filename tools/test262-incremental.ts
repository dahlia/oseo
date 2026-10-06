import { summarizeTest262 } from "../packages/testkit/src/index.ts";
import type { Test262Result } from "../packages/testkit/src/index.ts";

import type { ReviewedTest262Entry, ReviewedTest262Subset } from "./test262.ts";
import {
  parseReviewedPartition,
  serializeTest262Manifest,
} from "./test262-manifest.ts";
import type {
  ReviewedTest262Manifest,
  SerializedTest262Manifest,
} from "./test262-manifest.ts";

/**
 * Repository paths a scoped manifest update may find changed against its
 * baseline. Every record in the manifest depends on the compiler, runtime,
 * backend, runner, reviewed harness files, pinned suite, and toolchain, so
 * a difference anywhere else means the untouched partitions may describe
 * an older implementation and only a complete regeneration is sound. The
 * list is syntactic and over-rejects on purpose: a comment-only change
 * under tools/ is refused like any other.
 */
export const scopedUpdateAllowedPrefixes: readonly string[] = [
  "docs/",
  "tests/test262/results.yaml",
  "tests/test262/results/",
  "tests/test262/subset.yaml",
  "tests/test262/target-parity.yaml",
];

function scopedUpdateAllows(path: string): boolean {
  if (path.endsWith(".md")) return true;
  return scopedUpdateAllowedPrefixes.some((prefix) =>
    prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix,
  );
}

/**
 * Reject a scoped update whose working tree differs from its baseline
 * outside the observation-neutral allow-list. The caller supplies every
 * tracked and untracked path that differs; the first refused path is named.
 */
export function rejectScopedUpdateDifferences(
  changedPaths: readonly string[],
  baseline: string,
): void {
  const refused = changedPaths.filter((path) => !scopedUpdateAllows(path));
  if (refused.length === 0) return;
  throw new Error(
    `scoped test262 update refused: ${refused[0]} differs from ${baseline} ` +
      "and may change every reviewed observation; run " +
      "mise run test262:update to regenerate the complete manifest" +
      (refused.length > 1 ? ` (${refused.length} such paths)` : "") +
      ".",
  );
}

function sameEntry(left: ReviewedTest262Entry, right: ReviewedTest262Entry) {
  return (
    left.path === right.path &&
    left.expectedClassification === right.expectedClassification &&
    left.dependencies.length === right.dependencies.length &&
    left.dependencies.every((tag, index) => tag === right.dependencies[index])
  );
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/**
 * Select the reviewed paths whose subset entry is new or changed against
 * the baseline subset. The suite revision and supported-feature list are
 * inputs to every record, so a difference there refuses the scoped mode,
 * and a removed path is refused because the compatibility ratchet forbids
 * it anyway.
 */
export function selectChangedReviewedPaths(
  baseline: ReviewedTest262Subset,
  current: ReviewedTest262Subset,
): readonly string[] {
  if (baseline.suiteRevision !== current.suiteRevision) {
    throw new Error(
      "scoped test262 update refused: the suite revision changed; run " +
        "mise run test262:update.",
    );
  }
  if (!sameStrings(baseline.supportedFeatures, current.supportedFeatures)) {
    throw new Error(
      "scoped test262 update refused: supportedFeatures changed, which can " +
        "reclassify any reviewed path; run mise run test262:update.",
    );
  }
  const currentEntries = new Map(
    current.tests.map((entry) => [entry.path, entry]),
  );
  for (const entry of baseline.tests) {
    if (!currentEntries.has(entry.path)) {
      throw new Error(
        `scoped test262 update refused: reviewed path ${entry.path} was ` +
          "removed.",
      );
    }
  }
  const baselineEntries = new Map(
    baseline.tests.map((entry) => [entry.path, entry]),
  );
  const changed = current.tests
    .filter((entry) => {
      const previous = baselineEntries.get(entry.path);
      return previous == null || !sameEntry(previous, entry);
    })
    .map((entry) => entry.path);
  if (changed.length === 0) {
    throw new Error(
      "scoped test262 update found no new or changed reviewed path; nothing " +
        "to observe.",
    );
  }
  return changed;
}

function comparePaths(left: Test262Result, right: Test262Result): number {
  return left.case.path < right.case.path
    ? -1
    : left.case.path > right.case.path
      ? 1
      : 0;
}

/**
 * Replace the records of the selected paths and keep every other record.
 *
 * The result is exactly what a complete regeneration produces when every
 * kept record still matches the current implementation; the caller's
 * static guard and the full observation gate carry that precondition.
 * This function enforces what can be checked without observing: every
 * selected path is observed and nothing else is, every unselected reviewed
 * path keeps exactly one record whose classification is the one its
 * unchanged subset entry expects, no record is outside the reviewed
 * subset, and the union holds no semantic, harness, or infrastructure
 * failure, which the complete regeneration refuses to publish as well.
 */
export function mergeReviewedResults(
  existing: readonly Test262Result[],
  observed: readonly Test262Result[],
  selected: ReadonlySet<string>,
  subset: ReviewedTest262Subset,
): readonly Test262Result[] {
  const expectations = new Map(
    subset.tests.map((entry) => [entry.path, entry]),
  );
  const observedPaths = new Set<string>();
  for (const result of observed) {
    const path = result.case.path;
    if (!selected.has(path)) {
      throw new Error(`observed test262 path ${path} was not selected.`);
    }
    if (observedPaths.has(path)) {
      throw new Error(`observed test262 path ${path} is repeated.`);
    }
    observedPaths.add(path);
  }
  for (const path of selected) {
    if (!observedPaths.has(path)) {
      throw new Error(`selected test262 path ${path} was not observed.`);
    }
  }
  const kept: Test262Result[] = [];
  const keptPaths = new Set<string>();
  for (const result of existing) {
    const path = result.case.path;
    if (selected.has(path)) continue;
    const expected = expectations.get(path);
    if (expected == null) {
      throw new Error(`test262 result ${path} is outside the reviewed subset.`);
    }
    if (keptPaths.has(path)) {
      throw new Error(`test262 result ${path} is repeated.`);
    }
    if (result.classification !== expected.expectedClassification) {
      throw new Error(
        `kept test262 result ${path} is ${result.classification} but the ` +
          `reviewed subset expects ${expected.expectedClassification}; run ` +
          "mise run test262:update.",
      );
    }
    if (!sameStrings(result.dependencies, expected.dependencies)) {
      throw new Error(
        `kept test262 result ${path} records dependencies ` +
          `${result.dependencies.join(", ")} but the reviewed subset lists ` +
          `${expected.dependencies.join(", ")}; run mise run test262:update.`,
      );
    }
    keptPaths.add(path);
    kept.push(result);
  }
  for (const path of expectations.keys()) {
    if (!selected.has(path) && !keptPaths.has(path)) {
      throw new Error(
        `reviewed test262 path ${path} has no record and was not selected.`,
      );
    }
  }
  const merged = [...kept, ...observed].toSorted(comparePaths);
  const summary = summarizeTest262(merged);
  if (
    summary.semanticFailures !== 0 ||
    summary.harnessFailures !== 0 ||
    summary.infrastructureFailures !== 0
  ) {
    throw new Error(
      `Reviewed failures: semantic=${summary.semanticFailures} ` +
        `harness=${summary.harnessFailures} ` +
        `infrastructure=${summary.infrastructureFailures}.`,
    );
  }
  return merged;
}

/** One manifest file and its exact on-disk text. */
export interface ManifestFileText {
  readonly path: string;
  readonly text: string;
}

/**
 * Require the on-disk manifest to be exactly what the serializer emits for
 * its parsed record values. A scoped update keeps untouched partition text
 * as is, so byte equivalence with a complete regeneration needs every kept
 * file to already be canonical; an alias, comment, or formatting edit that
 * parses to the same values is refused here rather than preserved.
 */
export function requireCanonicalManifest(
  onDisk: SerializedTest262Manifest,
  manifest: ReviewedTest262Manifest,
): void {
  const canonical = serializeTest262Manifest(manifest);
  const nonCanonical: string[] = [];
  if (canonical.indexText !== onDisk.indexText) {
    nonCanonical.push("results.yaml");
  }
  const texts = new Map(
    onDisk.partitions.map(({ path, text }) => [path, text]),
  );
  for (const partition of canonical.partitions) {
    if (texts.get(partition.path) !== partition.text) {
      nonCanonical.push(partition.path);
    }
  }
  if (nonCanonical.length > 0) {
    throw new Error(
      "scoped test262 update refused: the checked-in manifest is not " +
        `canonical (${nonCanonical[0]}` +
        (nonCanonical.length > 1
          ? ` and ${nonCanonical.length - 1} more`
          : "") +
        "); run mise run test262:update.",
    );
  }
}

/**
 * Collect records from every partition file found on disk, independent of
 * the index. This is the reindex input after a merge whose index or parity
 * file may hold conflict markers or miss another branch's new partition.
 * Each file must still parse as a partition of the group and key its path
 * names at the pinned revision, every record must carry the classification
 * and dependency tags its subset entry states, and a path recorded twice
 * anywhere is an error to resolve by hand, never a silent choice between
 * two observations.
 */
export function collectReviewedPartitionRecords(
  files: readonly ManifestFileText[],
  subset: ReviewedTest262Subset,
): readonly Test262Result[] {
  const suiteRevision = subset.suiteRevision;
  const entries = new Map(subset.tests.map((entry) => [entry.path, entry]));
  const results: Test262Result[] = [];
  const owners = new Map<string, string>();
  for (const file of files.toSorted((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  )) {
    const partition = parseReviewedPartition(
      file.path,
      file.text,
      suiteRevision,
      results.length,
    );
    for (const result of partition.results) {
      const path = result.case.path;
      const owner = owners.get(path);
      if (owner != null) {
        throw new Error(
          `test262 result ${path} occurs in both ${owner} and ${file.path}.`,
        );
      }
      const entry = entries.get(path);
      if (entry == null) {
        throw new Error(
          `test262 result ${path} in ${file.path} is outside the reviewed ` +
            "subset.",
        );
      }
      if (
        result.classification !== entry.expectedClassification ||
        !sameStrings(result.dependencies, entry.dependencies)
      ) {
        throw new Error(
          `test262 result ${path} in ${file.path} does not match its ` +
            "reviewed subset entry; run mise run test262:update.",
        );
      }
      owners.set(path, file.path);
      results.push(result);
    }
  }
  for (const path of entries.keys()) {
    if (!owners.has(path)) {
      throw new Error(`reviewed test262 path ${path} has no record.`);
    }
  }
  return results.toSorted(comparePaths);
}
