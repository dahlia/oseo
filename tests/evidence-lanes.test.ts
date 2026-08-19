import assert from "node:assert/strict";
import test from "node:test";

import {
  evidenceClasses,
  evidenceIndexDirectory,
  evidenceRecordDirectory,
  validateEvidenceInventory,
  validateRequiredEvidenceInventory,
  validateRequiredEvidenceInventoryFromTree,
  validatedEvidenceFamilyIdsFromTree,
} from "../tools/evidence-lanes.ts";
import type { EvidenceSource } from "../tools/evidence-lanes.ts";
import type { StructuredDataRecord } from "../tools/structured-data.ts";

const id = "sample-family";
const indexPath = `${evidenceIndexDirectory}/${id}.yaml`;
const recordPath = `${evidenceRecordDirectory}/${id}.yaml`;
const references = new Set([
  "PLAN-M5.md",
  "tests/native/fixtures/expressions.ts",
]);

function indexSource(
  overrides: Readonly<StructuredDataRecord> = {},
  path = indexPath,
): EvidenceSource {
  return {
    path,
    text: JSON.stringify({
      id,
      record: recordPath,
      version: 1,
      ...overrides,
    }),
  };
}

function coveredEvidence(): StructuredDataRecord {
  return Object.fromEntries(
    evidenceClasses.map((className) => [
      className,
      {
        references: ["tests/native/fixtures/expressions.ts"],
        status: "covered",
      },
    ]),
  );
}

function recordSource(
  overrides: Readonly<StructuredDataRecord> = {},
  path = recordPath,
): EvidenceSource {
  return {
    path,
    text: JSON.stringify({
      evidence: coveredEvidence(),
      id,
      owners: ["PLAN-M5.md"],
      scope: ["The sampled behavior."],
      title: "Sample family",
      version: 1,
      ...overrides,
    }),
  };
}

function validate(
  indexes: readonly EvidenceSource[] = [indexSource()],
  records: readonly EvidenceSource[] = [recordSource()],
): void {
  validateEvidenceInventory(indexes, records, references);
}

test("accepts a complete assessed evidence record", () => {
  assert.deepEqual(
    validateEvidenceInventory(
      [indexSource()],
      [
        recordSource({
          evidence: {
            ...coveredEvidence(),
            generated: {
              reason: "The finite state has no useful generated domain.",
              replacements: ["tests/native/fixtures/expressions.ts"],
              status: "omitted",
            },
          },
        }),
      ],
      references,
    ),
    { classes: 8, families: 1, omitted: 1 },
  );
});

test("rejects malformed records and unknown or missing fields", () => {
  assert.throws(
    () => validate([indexSource()], [{ path: recordPath, text: "[" }]),
    /malformed YAML/u,
  );
  assert.throws(
    () => validate(undefined, [recordSource({ extra: true })]),
    /unknown field extra/u,
  );
  // SAFETY: recordSource returns a validated structured-data object fixture.
  const value = {
    ...(JSON.parse(recordSource().text) as StructuredDataRecord),
    title: undefined,
  };
  assert.throws(
    () =>
      validate(undefined, [{ path: recordPath, text: JSON.stringify(value) }]),
    /missing field title/u,
  );
});

test("rejects unknown or missing evidence classes", () => {
  const missing = { ...coveredEvidence(), standards: undefined };
  assert.throws(
    () => validate(undefined, [recordSource({ evidence: missing })]),
    /missing field standards/u,
  );
  assert.throws(
    () =>
      validate(undefined, [
        recordSource({
          evidence: { ...coveredEvidence(), invented: {} },
        }),
      ]),
    /unknown field invented/u,
  );
});

test("rejects duplicate IDs and filename or ID mismatches", () => {
  assert.throws(
    () => validate([indexSource(), indexSource()], [recordSource()]),
    /repeats family ID/u,
  );
  assert.throws(
    () =>
      validate(
        [indexSource()],
        [recordSource({}, `${evidenceRecordDirectory}/wrong.yaml`)],
      ),
    /filename does not match ID/u,
  );
});

test("rejects missing references and unassessed classes", () => {
  assert.throws(
    () =>
      validate(undefined, [
        recordSource({
          evidence: {
            ...coveredEvidence(),
            fixed: {
              references: ["tests/missing.test.ts"],
              status: "covered",
            },
          },
        }),
      ]),
    /does not exist/u,
  );
  assert.throws(
    () =>
      validate(undefined, [
        recordSource({
          evidence: {
            ...coveredEvidence(),
            fixed: { status: "unassessed" },
          },
        }),
      ]),
    /must not be unassessed/u,
  );
});

test("rejects covered and omitted entries without evidence", () => {
  assert.throws(
    () =>
      validate(undefined, [
        recordSource({
          evidence: {
            ...coveredEvidence(),
            fixed: { references: [], status: "covered" },
          },
        }),
      ]),
    /references must be a non-empty array/u,
  );
  assert.throws(
    () =>
      validate(undefined, [
        recordSource({
          evidence: {
            ...coveredEvidence(),
            generated: {
              reason: "No generated model applies.",
              replacements: [],
              status: "omitted",
            },
          },
        }),
      ]),
    /replacements must be a non-empty array/u,
  );
});

test("rejects stale indexes and unindexed records", () => {
  assert.throws(() => validate([indexSource()], []), /has stale record/u);
  assert.throws(() => validate([], [recordSource()]), /is not indexed/u);
});

test("rejects an absent required current-tree inventory", () => {
  assert.throws(
    () => validateRequiredEvidenceInventory([], [], references),
    /must not be empty/u,
  );
});

test("extracts validated family IDs from old and current trees", () => {
  assert.deepEqual(
    validatedEvidenceFamilyIdsFromTree(["PLAN-M5.md"], () => {
      throw new Error("an old tree has no evidence source to read");
    }),
    [],
  );
  const sources = new Map(
    [indexSource(), recordSource()].map((source) => [source.path, source.text]),
  );
  const paths = [...references, ...sources.keys()];
  assert.deepEqual(
    validatedEvidenceFamilyIdsFromTree(paths, (path) => {
      const text = sources.get(path);
      if (text == null) throw new Error(`unexpected evidence source ${path}`);
      return text;
    }),
    [id],
  );
  assert.deepEqual(
    validateRequiredEvidenceInventoryFromTree(paths, (path) => {
      const text = sources.get(path);
      if (text == null) throw new Error(`unexpected evidence source ${path}`);
      return text;
    }),
    { classes: 8, families: 1, omitted: 0 },
  );
  assert.throws(
    () => validateRequiredEvidenceInventoryFromTree(["PLAN-M5.md"], () => ""),
    /must not be empty/u,
  );
});

test("rejects unindexed entries in complete evidence trees", () => {
  const sources = new Map(
    [indexSource(), recordSource()].map((source) => [source.path, source.text]),
  );
  const paths = [...references, ...sources.keys()];
  const readSource = (path: string): string => {
    const text = sources.get(path);
    if (text == null) throw new Error(`unexpected evidence source ${path}`);
    return text;
  };
  for (const path of [
    `${evidenceIndexDirectory}/notes.txt`,
    `${evidenceIndexDirectory}/nested/extra.yaml`,
    `${evidenceRecordDirectory}/notes.txt`,
    `${evidenceRecordDirectory}/nested/extra.yaml`,
  ]) {
    assert.throws(
      () =>
        validateRequiredEvidenceInventoryFromTree([...paths, path], readSource),
      /is an unindexed file/u,
    );
  }
});
