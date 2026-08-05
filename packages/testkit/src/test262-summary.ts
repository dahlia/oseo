import type {
  Test262Classification,
  Test262DependencySummary,
  Test262GroupSummary,
  Test262Result,
  Test262Summary,
} from "./index.ts";

interface MutableTest262Counts {
  expectedNegatives: number;
  harnessFailures: number;
  infrastructureFailures: number;
  passes: number;
  semanticFailures: number;
  unsupportedProfileFeatures: number;
}

/**
 * Dependency-indexed path group frozen by ADR 0013: the first two directory
 * segments of the upstream path under *test/*.
 */
export function test262Group(path: string): string {
  const segments = path.split("/");
  const start = segments[0] === "test" ? 1 : 0;
  const directories = segments.slice(start, -1);
  return directories.slice(0, 2).join("/");
}

function emptyCounts(): MutableTest262Counts {
  return {
    expectedNegatives: 0,
    harnessFailures: 0,
    infrastructureFailures: 0,
    passes: 0,
    semanticFailures: 0,
    unsupportedProfileFeatures: 0,
  };
}

function countClassification(
  counts: MutableTest262Counts,
  classification: Test262Classification,
): void {
  if (classification === "expected-negative") {
    counts.expectedNegatives += 1;
  } else if (classification === "harness-failure") {
    counts.harnessFailures += 1;
  } else if (classification === "infrastructure-failure") {
    counts.infrastructureFailures += 1;
  } else if (classification === "pass") {
    counts.passes += 1;
  } else if (classification === "semantic-failure") {
    counts.semanticFailures += 1;
  } else {
    counts.unsupportedProfileFeatures += 1;
  }
}

/**
 * Summarize reviewed test262 records without changing their classifications.
 * Raw totals, path-group totals, and dependency-tag totals stay separate so
 * a large group cannot hide a regression in a smaller dependency.
 */
export function summarizeTest262(
  results: readonly Test262Result[],
): Test262Summary {
  const raw = emptyCounts();
  const groups = new Map<string, MutableTest262Counts>();
  const dependencies = new Map<string, MutableTest262Counts>();
  for (const result of results) {
    countClassification(raw, result.classification);
    const group = test262Group(result.case.path);
    const groupCounts = groups.get(group) ?? emptyCounts();
    groups.set(group, groupCounts);
    countClassification(groupCounts, result.classification);
    for (const dependency of result.dependencies) {
      const dependencyCounts = dependencies.get(dependency) ?? emptyCounts();
      dependencies.set(dependency, dependencyCounts);
      countClassification(dependencyCounts, result.classification);
    }
  }
  const dependencySummaries: Test262DependencySummary[] = [];
  for (const [dependency, counts] of [...dependencies.entries()].toSorted(
    ([left], [right]) => (left < right ? -1 : 1),
  )) {
    dependencySummaries.push({ dependency, ...counts });
  }
  const groupSummaries: Test262GroupSummary[] = [];
  for (const [group, counts] of [...groups.entries()].toSorted(
    ([left], [right]) => (left < right ? -1 : 1),
  )) {
    groupSummaries.push({ group, ...counts });
  }
  return { ...raw, dependencies: dependencySummaries, groups: groupSummaries };
}
