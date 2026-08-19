import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import {
  summarizeTest262,
  test262Group,
} from "../packages/testkit/src/test262-summary.ts";
import type {
  Test262Classification,
  Test262Result,
  Test262Summary,
} from "../packages/testkit/src/index.ts";
import { parse as parseYaml, Scalar, stringify as stringifyYaml } from "yaml";

import {
  parsedObject as record,
  type StructuredDataInput,
} from "./structured-data.ts";
import { isString } from "./value-kinds.ts";

const classifications = new Set<Test262Classification>([
  "expected-negative",
  "harness-failure",
  "infrastructure-failure",
  "pass",
  "semantic-failure",
  "unsupported-profile-feature",
]);

/** Target spelling retained in the canonical compatibility manifest. */
export const canonicalTest262Target = "linux-x86_64-gnu";

/** Deterministic checked-in observation of the reviewed subset. */
export interface ReviewedTest262Manifest {
  readonly results: readonly Test262Result[];
  readonly suiteRevision: string;
  readonly summary: Test262Summary;
}

/** One canonical record partition and its serialized content. */
export interface SerializedTest262Partition {
  readonly group: string;
  readonly key: string;
  readonly path: string;
  readonly text: string;
}

/** Complete canonical manifest file set. */
export interface SerializedTest262Manifest {
  readonly indexText: string;
  readonly partitions: readonly SerializedTest262Partition[];
}

interface ManifestPartitionReference {
  readonly group: string;
  readonly key: string;
  readonly path: string;
}

function stringValue(value: StructuredDataInput, description: string): string {
  if (!isString(value) || value.length === 0) {
    throw new Error(`${description} must be a non-empty string.`);
  }
  return value;
}

function stringArray(
  value: StructuredDataInput,
  description: string,
): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => !isString(item))) {
    throw new Error(`${description} must be an array of strings.`);
  }
  // SAFETY: The array and element checks establish the string sequence.
  return value as readonly string[];
}

function classification(
  value: StructuredDataInput,
  description: string,
): Test262Classification {
  // SAFETY: The membership check below validates this candidate before return.
  const candidate = value as Test262Classification;
  if (isString(value) && classifications.has(candidate)) {
    return candidate;
  }
  throw new Error(`${description} is invalid.`);
}

function partitionKey(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 2);
}

function partitionPath(group: string, key: string): string {
  return `results/${group}/${key}.yaml`;
}

function validateGroup(group: string, description: string): void {
  const segments = group.split("/");
  if (
    segments.length !== 2 ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\\"),
    )
  ) {
    throw new Error(`${description} is invalid.`);
  }
}

function parsePartitionReferences(
  text: string,
): readonly ManifestPartitionReference[] {
  // SAFETY: parsedObject validates the complete YAML tree at this boundary.
  const root = record(
    parseYaml(text) as StructuredDataInput,
    "test262 results index",
  );
  if (!Array.isArray(root.partitions)) {
    throw new Error("test262 results index needs a partitions array.");
  }
  const references = root.partitions.map((value, index) => {
    const item = record(value, `test262 partition ${index}`);
    const group = stringValue(item.group, `test262 partition ${index} group`);
    validateGroup(group, `test262 partition ${index} group`);
    const key = stringValue(item.key, `test262 partition ${index} key`);
    const path = stringValue(item.path, `test262 partition ${index} path`);
    if (!/^[0-9a-f]{2}$/u.test(key)) {
      throw new Error(`test262 partition ${index} key is invalid.`);
    }
    if (path !== partitionPath(group, key)) {
      throw new Error(
        `test262 partition ${index} path does not match group and key.`,
      );
    }
    return { group, key, path };
  });
  const paths = references.map(({ path }) => path);
  const sortedPaths = paths.toSorted();
  if (paths.some((path, index) => path !== sortedPaths[index])) {
    throw new Error("test262 result partitions must be sorted by path.");
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error("test262 result partition paths must be unique.");
  }
  return references;
}

/** Return the ordered partition paths named by one manifest index. */
export function reviewedManifestPartitionPaths(
  indexText: string,
): readonly string[] {
  return parsePartitionReferences(indexText).map(({ path }) => path);
}

/** Require the on-disk partition set to match its index exactly. */
export function validateReviewedManifestFileSet(
  indexText: string,
  partitionPaths: readonly string[],
): void {
  const expected = reviewedManifestPartitionPaths(indexText);
  const actual = partitionPaths.toSorted();
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((path) => !actualSet.has(path));
  const unexpected = actual.filter((path) => !expectedSet.has(path));
  if (
    actualSet.size !== actual.length ||
    missing.length > 0 ||
    unexpected.length > 0
  ) {
    throw new Error(
      "test262 result partition file set changed: " +
        `missing=${missing.join(",") || "none"} ` +
        `unexpected=${unexpected.join(",") || "none"}.`,
    );
  }
}

function parseResult(
  value: StructuredDataInput,
  index: number,
  group: string,
  key: string,
): Test262Result {
  const item = record(value, `test262 result ${index}`);
  const testCase = record(item.case, `test262 result ${index} case`);
  const path = stringValue(testCase.path, `test262 result ${index} path`);
  if (!path.startsWith("test/")) {
    throw new Error(`test262 result ${index} path must start with test/.`);
  }
  if (test262Group(path) !== group) {
    throw new Error(`test262 result ${index} does not belong to ${group}.`);
  }
  if (partitionKey(path) !== key) {
    throw new Error(`test262 result ${index} does not belong to key ${key}.`);
  }
  const resultClassification = classification(
    item.classification,
    `test262 result ${index} classification`,
  );
  stringArray(item.dependencies, `test262 result ${index} dependencies`);
  const observation = record(
    item.observation,
    `test262 result ${index} observation`,
  );
  const failureKind = observation.failureKind;
  if (
    failureKind != null &&
    failureKind !== "harness" &&
    failureKind !== "infrastructure"
  ) {
    throw new Error(`test262 result ${index} failure kind is invalid.`);
  }
  if (
    (resultClassification === "harness-failure") !==
      (failureKind === "harness") ||
    (resultClassification === "infrastructure-failure") !==
      (failureKind === "infrastructure")
  ) {
    throw new Error(`test262 result ${index} failure kind does not match.`);
  }
  return assumeValidatedResult(item);
}

/** Convert only after parseResult has validated the record's owned fields. */
function assumeValidatedResult(
  value: StructuredDataInput<Test262Result>,
): Test262Result {
  // SAFETY: parseResult validates path, classification, dependencies,
  // and failureKind, the fields consumed from reviewed results.
  return value as Test262Result;
}

/** Parse the index and all of its canonical result partitions. */
export function parseReviewedManifest(
  indexText: string,
  readPartition: (path: string) => string,
): ReviewedTest262Manifest {
  // SAFETY: parsedObject validates the complete YAML index tree.
  const root = record(
    parseYaml(indexText) as StructuredDataInput,
    "test262 results index",
  );
  const suiteRevision = stringValue(
    root.suiteRevision,
    "test262 results suiteRevision",
  );
  const references = parsePartitionReferences(indexText);
  const results: Test262Result[] = [];
  for (const reference of references) {
    // SAFETY: parsedObject validates each complete partition tree.
    const partition = record(
      parseYaml(readPartition(reference.path)) as StructuredDataInput,
      `test262 partition ${reference.path}`,
    );
    if (partition.group !== reference.group) {
      throw new Error(`${reference.path} group does not match its index.`);
    }
    if (partition.key !== reference.key) {
      throw new Error(`${reference.path} key does not match its index.`);
    }
    if (partition.suiteRevision !== suiteRevision) {
      throw new Error(`${reference.path} suite revision does not match.`);
    }
    if (!Array.isArray(partition.results)) {
      throw new Error(`${reference.path} needs a results array.`);
    }
    const partitionResults: Test262Result[] = [];
    for (const value of partition.results) {
      partitionResults.push(
        parseResult(
          value,
          results.length + partitionResults.length,
          reference.group,
          reference.key,
        ),
      );
    }
    const partitionPaths = partitionResults.map((result) => result.case.path);
    const sortedPartitionPaths = partitionPaths.toSorted();
    if (
      partitionPaths.some((path, index) => path !== sortedPartitionPaths[index])
    ) {
      throw new Error(`${reference.path} result paths must be sorted.`);
    }
    results.push(...partitionResults);
  }
  results.sort((left, right) =>
    left.case.path < right.case.path
      ? -1
      : left.case.path > right.case.path
        ? 1
        : 0,
  );
  const paths = results.map((result) => result.case.path);
  if (new Set(paths).size !== paths.length) {
    throw new Error("test262 result paths must be unique.");
  }
  const summary = summarizeTest262(results);
  if (!isDeepStrictEqual(root.summary, summary)) {
    throw new Error("test262 results summary is not derived from partitions.");
  }
  return { results, suiteRevision, summary };
}

function stringify<Candidate>(value: StructuredDataInput<Candidate>): string {
  // Detail strings can occur at deep indentation, so reserve eight columns
  // below the repository limit for the serializer's indentation.
  return stringifyYaml(value, { lineWidth: 72 });
}

/** Serialize ordered group partitions and their derived index summary. */
export function serializeTest262Manifest(
  manifest: ReviewedTest262Manifest,
): SerializedTest262Manifest {
  const grouped = new Map<
    string,
    { readonly group: string; readonly key: string; results: Test262Result[] }
  >();
  const sortedResults = manifest.results.toSorted((left, right) =>
    left.case.path < right.case.path
      ? -1
      : left.case.path > right.case.path
        ? 1
        : 0,
  );
  if (
    manifest.results.some(
      (result, index) => result.case.path !== sortedResults[index]?.case.path,
    )
  ) {
    throw new Error(
      "test262 result paths must be sorted before serialization.",
    );
  }
  const paths = manifest.results.map((result) => result.case.path);
  if (new Set(paths).size !== paths.length) {
    throw new Error("test262 result paths must be unique.");
  }
  for (const result of manifest.results) {
    if (!result.case.path.startsWith("test/")) {
      throw new Error("test262 result paths must start with test/.");
    }
    const group = test262Group(result.case.path);
    validateGroup(group, `test262 result group for ${result.case.path}`);
    const key = partitionKey(result.case.path);
    const mapKey = `${group}\0${key}`;
    const partition = grouped.get(mapKey) ?? { group, key, results: [] };
    partition.results.push(result);
    grouped.set(mapKey, partition);
  }
  const partitions = [...grouped.values()]
    .map(({ group, key, results }) => ({
      group,
      key,
      path: partitionPath(group, key),
      text: stringify({
        group,
        key,
        results,
        suiteRevision: manifest.suiteRevision,
      }),
    }))
    .toSorted((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
  const summary = summarizeTest262(manifest.results);
  return {
    indexText: stringify({
      partitions: partitions.map(({ group, key, path }) => ({
        group,
        key,
        path,
      })),
      suiteRevision: manifest.suiteRevision,
      summary,
    }),
    partitions,
  };
}

/** Normalize canonical checkout text to LF line endings. */
export function normalizeReviewedManifestText(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

function canonicalFiles(
  manifest: SerializedTest262Manifest,
): readonly (readonly [string, string])[] {
  return [
    ["results.yaml", manifest.indexText],
    ...manifest.partitions.map(({ path, text }) => [path, text] as const),
  ];
}

/** Digest the manifest index and every ordered record partition. */
export function test262ManifestDigest(
  manifest: SerializedTest262Manifest,
): string {
  const hash = createHash("sha256");
  for (const [path, text] of canonicalFiles(manifest)) {
    hash.update(
      `${Buffer.byteLength(path, "utf8")}:${path}` +
        `${Buffer.byteLength(text, "utf8")}:`,
    );
    hash.update(text);
  }
  return `sha256:${hash.digest("hex")}`;
}

/** Serialize the canonical manifest file-set digest and execution targets. */
export function serializeTargetParity(
  manifest: SerializedTest262Manifest,
  suiteRevision: string,
): string {
  const canonicalDigest = new Scalar(test262ManifestDigest(manifest));
  canonicalDigest.type = Scalar.BLOCK_FOLDED;
  return stringifyYaml(
    {
      canonicalDigest,
      canonicalManifest: "results.yaml",
      suiteRevision,
      targets: [canonicalTest262Target, "macos-aarch64"],
    },
    { lineWidth: 72 },
  );
}

/** Validate target parity against the complete canonical manifest file set. */
export function validateTargetParity(
  text: string,
  manifest: SerializedTest262Manifest,
  suiteRevision: string,
  executionTarget: string | undefined,
): void {
  // SAFETY: parsedObject validates the complete parity YAML tree.
  const root = record(
    parseYaml(text) as StructuredDataInput,
    "test262 target parity",
  );
  if (root.canonicalManifest !== "results.yaml") {
    throw new Error("test262 target parity must name results.yaml.");
  }
  if (root.canonicalDigest !== test262ManifestDigest(manifest)) {
    throw new Error("test262 target parity canonical digest changed.");
  }
  if (root.suiteRevision !== suiteRevision) {
    throw new Error("test262 target parity suite revision changed.");
  }
  const targets = stringArray(root.targets, "test262 target parity targets");
  if (executionTarget == null || !targets.includes(executionTarget)) {
    throw new Error(
      `test262 target parity does not admit ${executionTarget ?? "unknown"}.`,
    );
  }
}
