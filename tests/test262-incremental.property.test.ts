import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import type {
  Test262Classification,
  Test262Observation,
  Test262Result,
} from "../packages/testkit/src/index.ts";
import { summarizeTest262 } from "../packages/testkit/src/index.ts";
import {
  collectReviewedPartitionRecords,
  mergeReviewedResults,
} from "../tools/test262-incremental.ts";
import { serializeTest262Manifest } from "../tools/test262-manifest.ts";
import type { ReviewedTest262Subset } from "../tools/test262.ts";
import type { SerializedTest262Manifest } from "../tools/test262-manifest.ts";

const { assertProperty, propertySize } = await import(
  ["../packages/testkit/tests/", "property-support.ts"].join("")
);

/*
 * Domain: reviewed record lists over a few path groups and hash buckets,
 * the three reviewed classifications, two dependency tags, and the
 * optional observation fields; a batch selects any subset of the paths.
 * Oracle: `serializeTest262Manifest` over the complete list, which is the
 * complete regeneration. The scoped composition must reproduce it from
 * key-permuted, identity-shared copies of the kept records, and the
 * reindex collector must reproduce it from the partition files.
 * Seed family: test262-incremental (tests/property-seeds.yaml). Size
 * limit: 24 records (small) or 96 (large). Case count: 400 ordinary runs.
 * Failure observation: the first differing file path and text.
 */

const revision = "f2d1435644797268dca1f7988cad5a4e89ccd8d2";
const size = propertySize();
const maximumRecords = size === "large" ? 96 : 24;
const classifications: readonly Test262Classification[] = [
  "pass",
  "expected-negative",
  "unsupported-profile-feature",
];
const groups = [
  "built-ins/Array",
  "built-ins/Object",
  "language/statements",
] as const;

interface GeneratedRecord {
  readonly classification: Test262Classification;
  readonly dependencies: readonly string[];
  readonly detail: boolean;
  readonly group: (typeof groups)[number];
  readonly name: number;
  readonly selected: boolean;
}

const recordArbitrary: fc.Arbitrary<GeneratedRecord> = fc.record({
  classification: fc.constantFrom(...classifications),
  dependencies: fc.constantFrom(
    ["functions"],
    ["functions", "lexical-bindings"],
    ["lexical-bindings"],
  ),
  detail: fc.boolean(),
  group: fc.constantFrom(...groups),
  name: fc.integer({ min: 0, max: 40 }),
  selected: fc.boolean(),
});

function toResult(generated: GeneratedRecord): Test262Result {
  const path = `test/${generated.group}/case-${generated.name}.js`;
  const passed = generated.classification !== "unsupported-profile-feature";
  const observation: MutableObservation = { passed };
  if (generated.detail) observation.detail = `observed ${path}`;
  if (!passed) observation.unsupportedCapability = "profile-syntax";
  return {
    case: {
      async: false,
      features: [],
      flags: [],
      includes: [],
      mode: "script",
      path,
      strictness: ["non-strict", "strict"],
      suiteRevision: revision,
    },
    classification: generated.classification,
    dependencies: generated.dependencies,
    observation,
    unsupportedFeatures: [],
  };
}

type MutableObservation = {
  -readonly [Key in keyof Test262Observation]: Test262Observation[Key];
};

/**
 * The same record with every mapping's keys in reverse order and the given
 * dependency array, as a parsed file with reordered keys and an alias would
 * supply it. Only the shapes the generator produces are rebuilt.
 */
function permutedRecord(
  result: Test262Result,
  dependencies: readonly string[],
): Test262Result {
  const observation: MutableObservation = { passed: result.observation.passed };
  if (result.observation.unsupportedCapability != null) {
    observation.unsupportedCapability =
      result.observation.unsupportedCapability;
  }
  if (result.observation.detail != null) {
    observation.detail = result.observation.detail;
  }
  return {
    unsupportedFeatures: result.unsupportedFeatures,
    observation,
    dependencies,
    classification: result.classification,
    case: {
      suiteRevision: result.case.suiteRevision,
      strictness: result.case.strictness,
      path: result.case.path,
      mode: result.case.mode,
      includes: result.case.includes,
      flags: result.case.flags,
      features: result.case.features,
      async: result.case.async,
    },
  };
}

function firstDifference(
  actual: SerializedTest262Manifest,
  expected: SerializedTest262Manifest,
): string | undefined {
  if (actual.indexText !== expected.indexText) return "results.yaml";
  if (actual.partitions.length !== expected.partitions.length) {
    return (
      `partition count ${actual.partitions.length} != ` +
      `${expected.partitions.length}`
    );
  }
  for (const [index, partition] of actual.partitions.entries()) {
    const other = expected.partitions[index];
    if (other == null || other.path !== partition.path) {
      return `partition path ${partition.path} != ${other?.path}`;
    }
    if (other.text !== partition.text)
      return `partition text ${partition.path}`;
  }
  return undefined;
}

const recordsArbitrary = fc
  .array(recordArbitrary, { maxLength: maximumRecords, minLength: 1 })
  .map((generated) => {
    const byPath = new Map<string, GeneratedRecord>();
    for (const item of generated) {
      byPath.set(`${item.group}/${item.name}`, item);
    }
    return Array.from(byPath.values());
  })
  .filter((generated) => generated.length > 0);

test("scoped merge and reindex reproduce the complete serialization", () => {
  assertProperty(
    "scoped merge equals complete regeneration",
    fc.property(recordsArbitrary, (generated) => {
      const results = generated
        .map(toResult)
        .toSorted((left, right) => (left.case.path < right.case.path ? -1 : 1));
      const subset: ReviewedTest262Subset = {
        suiteRevision: revision,
        supportedFeatures: [],
        tests: results.map((result) => ({
          dependencies: result.dependencies,
          expectedClassification: result.classification,
          path: result.case.path,
        })),
      };
      const full = serializeTest262Manifest({
        results,
        suiteRevision: revision,
        summary: summarizeTest262(results),
      });
      const selected = new Set(
        generated
          .filter((item) => item.selected)
          .map((item) => toResult(item).case.path),
      );
      // Kept records arrive with permuted keys and one shared array for every
      // equal dependency list, as a parsed aliased file would supply them.
      const sharedDependencies = new Map<string, readonly string[]>();
      const existing: Test262Result[] = [];
      for (const result of results) {
        const key = result.dependencies.join(",");
        const dependencies = sharedDependencies.get(key) ?? result.dependencies;
        sharedDependencies.set(key, dependencies);
        existing.push(permutedRecord(result, dependencies));
      }
      const observed = results.filter((result) =>
        selected.has(result.case.path),
      );
      const merged = mergeReviewedResults(existing, observed, selected, subset);
      const scoped = serializeTest262Manifest({
        results: merged,
        suiteRevision: revision,
        summary: summarizeTest262(merged),
      });
      assert.equal(firstDifference(scoped, full), undefined);

      const collected = collectReviewedPartitionRecords(
        full.partitions.map(({ path, text }) => ({ path, text })),
        subset,
      );
      const reindexed = serializeTest262Manifest({
        results: collected,
        suiteRevision: revision,
        summary: summarizeTest262(collected),
      });
      assert.equal(firstDifference(reindexed, full), undefined);
    }),
    {
      domain: "test262 scoped manifest records",
      numRuns: 400,
      profile: "M5c scoped manifest regeneration",
      seed: 0x60008200,
      sizeLimit: `${maximumRecords} records`,
      timeLimitMilliseconds: 60_000,
    },
  );
});
