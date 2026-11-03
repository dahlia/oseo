/* eslint-disable no-await-in-loop */
/* Corpus reads stay sequential and bounded. */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

import {
  parsedObject as record,
  type StructuredDataInput,
} from "./structured-data.ts";
import { isString } from "./value-kinds.ts";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const policyPath = join(repositoryRoot, "tests/test262/inventory-policy.yaml");
const inventoryPath = join(repositoryRoot, "tests/test262/inventory.tsv");
const m5PolicyPath = join(
  repositoryRoot,
  "tests/test262/inventory-policy-m5.yaml",
);
/** Derived list of the included paths ADR 0032 added to the M5 inventory. */
export const m5InventoryAdditionsPath =
  "tests/test262/inventory-m5-additions.txt";
const subsetPath = join(repositoryRoot, "tests/test262/subset.yaml");

/** Whether an upstream path contributes to the edition denominator. */
export type Test262InventoryBoundary = "excluded" | "included";

/**
 * Rules mapping the pinned Test262 corpus to one ECMA-262 edition, a named
 * set of finished later features, and the reviewed optional sections.
 */
export interface Test262InventoryPolicy {
  /** Candidate root whose paths form the Annex B optional section. */
  readonly annexBRoot: string;
  /** Finished later features the claim names, a subset of the map. */
  readonly claimedPostEditionFeatures: ReadonlySet<string>;
  readonly candidateRoots: readonly string[];
  readonly edition: number;
  readonly editionYear: number;
  /** Feature flags whose paths stay outside, with their basis label. */
  readonly excludedOptionalFeatures: ReadonlyMap<string, string>;
  readonly formatVersion: number;
  /** Main-body normative-optional paths outside the Annex B root. */
  readonly normativeOptionalPathPrefixes: readonly string[];
  readonly normativeOptionalPaths: readonly string[];
  readonly postEditionFeatures: ReadonlyMap<string, number>;
  readonly sources: Test262InventorySources;
  readonly suiteRevision: string;
}

/** Pinned primary sources used to review the edition mapping. */
export interface Test262InventorySources {
  /** ECMA-262 draft at the first commit holding every claimed feature. */
  readonly claimedPostEditionFeatures: string;
  readonly edition: string;
  readonly featureRegistry: string;
  readonly finishedProposals: string;
}

/** Feature flags recognized by the pinned upstream registry. */
export interface Test262FeatureRegistry {
  readonly all: ReadonlySet<string>;
  readonly proposed: ReadonlySet<string>;
}

/** One path and its reviewed edition-boundary judgment. */
export interface Test262InventoryEntry {
  readonly basis: string;
  readonly boundary: Test262InventoryBoundary;
  readonly path: string;
}

/** Counts derived from one complete inventory. */
export interface Test262InventorySummary {
  readonly candidates: number;
  readonly excluded: number;
  readonly featurelessIncluded: number;
  readonly included: number;
}

function stringValue(value: StructuredDataInput, description: string): string {
  if (!isString(value) || value.length === 0) {
    throw new Error(`${description} must be a non-empty string.`);
  }
  return value;
}

function sourceUrl(value: StructuredDataInput, description: string): string {
  const source = stringValue(value, description);
  const url = new URL(source);
  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    throw new Error(`${description} must be an HTTPS GitHub URL.`);
  }
  return source;
}

function stringArray(
  value: StructuredDataInput,
  description: string,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => !isString(entry) || entry.length === 0)
  ) {
    throw new Error(`${description} must be an array of non-empty strings.`);
  }
  // SAFETY: The array and element checks establish the string sequence.
  return value as readonly string[];
}

function positiveInteger(
  value: StructuredDataInput,
  description: string,
): number {
  // SAFETY: Number.isSafeInteger establishes a numeric value for comparison.
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${description} must be a positive integer.`);
  }
  // SAFETY: Number.isSafeInteger above establishes a positive integer.
  return value as number;
}

function sortedUnique(
  values: readonly string[],
  description: string,
): readonly string[] {
  const sorted = values.toSorted();
  if (values.some((value, index) => value !== sorted[index])) {
    throw new Error(`${description} must be sorted.`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${description} must be unique.`);
  }
  return values;
}

/** Parse and validate the reviewed inventory policy. */
export function parseInventoryPolicy(text: string): Test262InventoryPolicy {
  // SAFETY: parsedObject validates the complete YAML tree at this boundary.
  const root = record(
    parseYaml(text) as StructuredDataInput,
    "test262 inventory policy",
  );
  const rawSources = record(root.sources, "test262 inventory sources");
  const rawFeatures = record(
    root.postEditionFeatures,
    "test262 post-edition features",
  );
  const featureNames = sortedUnique(
    Object.keys(rawFeatures),
    "test262 post-edition feature names",
  );
  const postEditionFeatures = new Map(
    featureNames.map((feature) => {
      const year = positiveInteger(
        rawFeatures[feature],
        `test262 post-edition year for ${feature}`,
      );
      return [feature, year] as const;
    }),
  );
  const editionYear = positiveInteger(
    root.editionYear,
    "test262 inventory edition year",
  );
  for (const [feature, year] of postEditionFeatures) {
    if (year <= editionYear) {
      throw new Error(
        `test262 post-edition feature ${feature} must follow ${editionYear}.`,
      );
    }
  }
  const candidateRoots = sortedUnique(
    stringArray(root.candidateRoots, "test262 candidate roots"),
    "test262 candidate roots",
  );
  const annexBRoot = stringValue(root.annexBRoot, "test262 Annex B root");
  if (!candidateRoots.includes(annexBRoot)) {
    throw new Error(`test262 Annex B root ${annexBRoot} must be a candidate.`);
  }
  const claimedPostEditionFeatures = sortedUnique(
    stringArray(
      root.claimedPostEditionFeatures,
      "test262 claimed post-edition features",
    ),
    "test262 claimed post-edition features",
  );
  for (const feature of claimedPostEditionFeatures) {
    if (!postEditionFeatures.has(feature)) {
      throw new Error(
        `test262 claimed feature ${feature} has no post-edition year.`,
      );
    }
  }
  const rawExcluded = record(
    root.excludedOptionalFeatures,
    "test262 excluded optional features",
  );
  const excludedOptionalFeatures = new Map(
    sortedUnique(
      Object.keys(rawExcluded),
      "test262 excluded optional feature names",
    ).map((feature) => {
      const label = stringValue(
        rawExcluded[feature],
        `test262 excluded optional feature label for ${feature}`,
      );
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(label)) {
        throw new Error(
          `test262 excluded optional feature label ${label} is malformed.`,
        );
      }
      if (postEditionFeatures.has(feature)) {
        throw new Error(
          `test262 optional feature ${feature} also has an edition year.`,
        );
      }
      return [feature, label] as const;
    }),
  );
  const isMainBodyCandidate = (path: string) =>
    candidateRoots.some(
      (candidateRoot) =>
        candidateRoot !== annexBRoot && path.startsWith(`${candidateRoot}/`),
    );
  const normativeOptionalPathPrefixes = sortedUnique(
    stringArray(
      root.normativeOptionalPathPrefixes,
      "test262 normative-optional path prefixes",
    ),
    "test262 normative-optional path prefixes",
  );
  for (const prefix of normativeOptionalPathPrefixes) {
    if (!prefix.endsWith("/") || !isMainBodyCandidate(prefix)) {
      throw new Error(
        `test262 normative-optional path prefix ${prefix} must be a ` +
          "main-body candidate subdirectory.",
      );
    }
  }
  const normativeOptionalPaths = sortedUnique(
    stringArray(
      root.normativeOptionalPaths,
      "test262 normative-optional paths",
    ),
    "test262 normative-optional paths",
  );
  for (const path of normativeOptionalPaths) {
    if (!path.endsWith(".js") || !isMainBodyCandidate(path)) {
      throw new Error(
        `test262 normative-optional path ${path} must be a main-body ` +
          "candidate JavaScript file.",
      );
    }
    if (
      normativeOptionalPathPrefixes.some((prefix) => path.startsWith(prefix))
    ) {
      throw new Error(
        `test262 normative-optional path ${path} repeats a path prefix.`,
      );
    }
  }
  return {
    annexBRoot,
    candidateRoots,
    claimedPostEditionFeatures: new Set(claimedPostEditionFeatures),
    edition: positiveInteger(root.edition, "test262 inventory edition"),
    editionYear,
    excludedOptionalFeatures,
    formatVersion: positiveInteger(
      root.formatVersion,
      "test262 inventory format version",
    ),
    normativeOptionalPathPrefixes,
    normativeOptionalPaths,
    postEditionFeatures,
    sources: {
      claimedPostEditionFeatures: sourceUrl(
        rawSources.claimedPostEditionFeatures,
        "test262 inventory claimed post-edition feature source",
      ),
      edition: sourceUrl(
        rawSources.edition,
        "test262 inventory edition source",
      ),
      featureRegistry: sourceUrl(
        rawSources.featureRegistry,
        "test262 inventory feature registry source",
      ),
      finishedProposals: sourceUrl(
        rawSources.finishedProposals,
        "test262 inventory finished proposals source",
      ),
    },
    suiteRevision: stringValue(
      root.suiteRevision,
      "test262 inventory suite revision",
    ),
  };
}

/**
 * The frozen ADR 0020 rule that defined the 41,091-path M5 inventory. It is
 * kept only to derive which included paths ADR 0032 added, so the closed M5
 * records can still be validated against the inventory they measured.
 */
export interface Test262M5InventoryPolicy {
  readonly annexBPathPrefixes: readonly string[];
  readonly annexBPaths: readonly string[];
  readonly candidateRoots: readonly string[];
  readonly editionYear: number;
  readonly postEditionFeatures: ReadonlyMap<string, number>;
  readonly suiteRevision: string;
}

/** Parse the frozen ADR 0020 policy. */
export function parseM5InventoryPolicy(text: string): Test262M5InventoryPolicy {
  // SAFETY: parsedObject validates the complete YAML tree at this boundary.
  const root = record(
    parseYaml(text) as StructuredDataInput,
    "test262 M5 inventory policy",
  );
  const rawFeatures = record(
    root.postEditionFeatures,
    "test262 M5 post-edition features",
  );
  const postEditionFeatures = new Map(
    sortedUnique(
      Object.keys(rawFeatures),
      "test262 M5 post-edition feature names",
    ).map(
      (feature) =>
        [
          feature,
          positiveInteger(
            rawFeatures[feature],
            `test262 M5 post-edition year for ${feature}`,
          ),
        ] as const,
    ),
  );
  return {
    annexBPathPrefixes: sortedUnique(
      stringArray(root.annexBPathPrefixes, "test262 M5 Annex B prefixes"),
      "test262 M5 Annex B prefixes",
    ),
    annexBPaths: sortedUnique(
      stringArray(root.annexBPaths, "test262 M5 Annex B paths"),
      "test262 M5 Annex B paths",
    ),
    candidateRoots: sortedUnique(
      stringArray(root.candidateRoots, "test262 M5 candidate roots"),
      "test262 M5 candidate roots",
    ),
    editionYear: positiveInteger(
      root.editionYear,
      "test262 M5 inventory edition year",
    ),
    postEditionFeatures,
    suiteRevision: stringValue(
      root.suiteRevision,
      "test262 M5 inventory suite revision",
    ),
  };
}

/** Whether the frozen ADR 0020 rule included a candidate path. */
export function includedInM5Inventory(
  path: string,
  features: readonly string[],
  registry: Test262FeatureRegistry,
  policy: Test262M5InventoryPolicy,
): boolean {
  return (
    policy.candidateRoots.some((candidateRoot) =>
      path.startsWith(`${candidateRoot}/`),
    ) &&
    !policy.annexBPaths.includes(path) &&
    !policy.annexBPathPrefixes.some((prefix) => path.startsWith(prefix)) &&
    !features.some(
      (feature) =>
        registry.proposed.has(feature) ||
        policy.postEditionFeatures.has(feature),
    )
  );
}

/**
 * Serialize the sorted paths the current rule includes and the frozen
 * ADR 0020 rule did not.
 */
export function serializeM5InventoryAdditions(
  additions: readonly string[],
  suiteRevision: string,
): string {
  return [
    "# Generated by `mise run test262:inventory:update`; do not edit.",
    "# Included paths that ADR 0032 added to the M5 inventory. The M5",
    "# inventory is the included set of inventory.tsv without these paths.",
    `# suite-revision: ${suiteRevision}`,
    `# paths: ${additions.length}`,
    ...additions,
    "",
  ].join("\n");
}

/**
 * Read the M5 inventory paths from the current inventory and the derived
 * additions list. Both files are checked by `check:test262-inventory`.
 */
export function m5IncludedPaths(
  includedPaths: readonly string[],
  additionsText: string,
): readonly string[] {
  const additions = new Set(
    additionsText
      .split("\n")
      .filter((line) => line.length > 0 && !line.startsWith("#")),
  );
  const included = new Set(includedPaths);
  for (const path of additions) {
    if (!included.has(path)) {
      throw new Error(`M5 inventory addition ${path} is not included.`);
    }
  }
  return includedPaths.filter((path) => !additions.has(path));
}

function featureLine(line: string): string | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith("#")) return undefined;
  return trimmed.split(/\s+/u)[0];
}

/** Parse the proposed and complete flag sets from upstream *features.txt*. */
export function parseFeatureRegistry(text: string): Test262FeatureRegistry {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const proposedHeading = "## Proposed language features";
  const standardHeading = "## Standard language features";
  const proposedStart = lines.indexOf(proposedHeading);
  const standardStart = lines.indexOf(standardHeading);
  if (proposedStart === -1 || standardStart <= proposedStart) {
    throw new Error("test262 features.txt has unexpected section headings.");
  }

  const proposed = new Set<string>();
  const all = new Set<string>();
  for (let index = 0; index < lines.length; index += 1) {
    const feature = featureLine(lines[index] ?? "");
    if (feature == null) continue;
    if (all.has(feature)) {
      throw new Error(`test262 features.txt repeats ${feature}.`);
    }
    all.add(feature);
    if (index > proposedStart && index < standardStart) {
      proposed.add(feature);
    }
  }
  if (proposed.size === 0 || all.size === 0) {
    throw new Error("test262 features.txt did not define feature flags.");
  }
  return { all, proposed };
}

/** Read the feature flags from one upstream Test262 frontmatter block. */
export function parseTest262Features(
  source: string,
  path: string,
): readonly string[] {
  const normalized = source.replace(/\r\n?/gu, "\n");
  const match = normalized.match(/\/\*---([\s\S]*?)---\*\//u);
  if (match?.[1] == null) {
    throw new Error(`${path} does not contain test262 frontmatter.`);
  }
  // SAFETY: parsedObject validates the complete YAML frontmatter tree.
  const metadata = record(
    (parseYaml(match[1]) ?? {}) as StructuredDataInput,
    `${path} frontmatter`,
  );
  if (metadata.features == null) return [];
  return sortedUnique(
    stringArray(metadata.features, `${path} features`).toSorted(),
    `${path} features`,
  );
}

/**
 * Apply the ADR 0032 rule without treating implementation support as an
 * edition-boundary fact. The steps run in the record's order: excluded
 * optional features, proposals and unclaimed later features, claimed later
 * features, the optional sections, and finally the core edition.
 */
export function classifyInventoryEntry(
  path: string,
  features: readonly string[],
  registry: Test262FeatureRegistry,
  policy: Test262InventoryPolicy,
): Test262InventoryEntry {
  if (path.includes("\t") || path.includes("\n") || path.includes("\r")) {
    throw new Error("test262 inventory paths cannot contain line separators.");
  }
  for (const feature of features) {
    if (!registry.all.has(feature)) {
      throw new Error(`${path} uses unknown test262 feature ${feature}.`);
    }
    const postEditionYear = policy.postEditionFeatures.get(feature);
    if (registry.proposed.has(feature) && postEditionYear != null) {
      throw new Error(
        `${feature} cannot be both proposed and assigned to an edition.`,
      );
    }
  }
  const optional = features.flatMap((feature) => {
    const label = policy.excludedOptionalFeatures.get(feature);
    return label == null ? [] : [`optional-section:${label}`];
  });
  if (optional.length > 0) {
    return {
      basis: optional.toSorted().join(","),
      boundary: "excluded",
      path,
    };
  }
  const reasons: string[] = [];
  const claimed: string[] = [];
  for (const feature of features) {
    const postEditionYear = policy.postEditionFeatures.get(feature);
    if (registry.proposed.has(feature)) {
      reasons.push(`proposal:${feature}`);
    } else if (postEditionYear == null) {
      continue;
    } else if (policy.claimedPostEditionFeatures.has(feature)) {
      claimed.push(`edition-${postEditionYear}:${feature}`);
    } else {
      reasons.push(`edition-${postEditionYear}:${feature}`);
    }
  }
  if (reasons.length > 0) {
    return {
      basis: reasons.toSorted().join(","),
      boundary: "excluded",
      path,
    };
  }
  if (claimed.length > 0) {
    return { basis: claimed.toSorted().join(","), boundary: "included", path };
  }
  const edition = `edition-${policy.editionYear}`;
  if (path.startsWith(`${policy.annexBRoot}/`)) {
    return { basis: `${edition}:annex-b`, boundary: "included", path };
  }
  if (
    policy.normativeOptionalPaths.includes(path) ||
    policy.normativeOptionalPathPrefixes.some((prefix) =>
      path.startsWith(prefix),
    )
  ) {
    return {
      basis: `${edition}:normative-optional`,
      boundary: "included",
      path,
    };
  }
  return {
    basis: features.length === 0 ? `${edition}:unflagged-core` : edition,
    boundary: "included",
    path,
  };
}

function summarizeInventory(
  entries: readonly Test262InventoryEntry[],
): Test262InventorySummary {
  let excluded = 0;
  let featurelessIncluded = 0;
  for (const entry of entries) {
    if (entry.boundary === "excluded") excluded += 1;
    if (entry.basis.endsWith(":unflagged-core")) {
      featurelessIncluded += 1;
    }
  }
  return {
    candidates: entries.length,
    excluded,
    featurelessIncluded,
    included: entries.length - excluded,
  };
}

/** Serialize the complete lightweight path index in canonical order. */
export function serializeInventory(
  entries: readonly Test262InventoryEntry[],
  policy: Test262InventoryPolicy,
): string {
  const paths = entries.map((entry) => entry.path);
  const sortedPaths = paths.toSorted();
  if (paths.some((path, index) => path !== sortedPaths[index])) {
    throw new Error("test262 inventory paths must be sorted.");
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error("test262 inventory paths must be unique.");
  }
  const summary = summarizeInventory(entries);
  return [
    `# format-version: ${policy.formatVersion}`,
    `# suite-revision: ${policy.suiteRevision}`,
    `# edition: ${policy.edition}`,
    `# edition-year: ${policy.editionYear}`,
    `# candidates: ${summary.candidates}`,
    `# included: ${summary.included}`,
    `# excluded: ${summary.excluded}`,
    `# featureless-included: ${summary.featurelessIncluded}`,
    "path\tboundary\tbasis",
    ...entries.map(
      (entry) => `${entry.path}\t${entry.boundary}\t${entry.basis}`,
    ),
    "",
  ].join("\n");
}

async function walkJavaScriptFiles(
  directory: string,
): Promise<readonly string[]> {
  const paths: string[] = [];
  const entries = (await readdir(directory, { withFileTypes: true })).toSorted(
    (left, right) => left.name.localeCompare(right.name),
  );
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await walkJavaScriptFiles(path)));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".js") &&
      !entry.name.endsWith("_FIXTURE.js")
    ) {
      paths.push(path);
    }
  }
  return paths;
}

async function suiteRoot(revision: string): Promise<string> {
  const packagePath = fileURLToPath(
    import.meta.resolve("test262/package.json"),
  );
  const packageRoot = dirname(packagePath);
  // SAFETY: parsedObject validates the complete JSON tree at this boundary.
  const workspace = record(
    JSON.parse(
      await readFile(join(repositoryRoot, "package.json"), "utf8"),
    ) as StructuredDataInput,
    "workspace package.json",
  );
  const dependencies = record(
    workspace.devDependencies,
    "workspace devDependencies",
  );
  const expected = `github:tc39/test262#${revision}`;
  if (dependencies.test262 !== expected) {
    throw new Error(`test262 must be pinned as ${expected}.`);
  }
  return packageRoot;
}

async function createInventory(
  root: string,
  registry: Test262FeatureRegistry,
  policy: Test262InventoryPolicy,
  m5Policy: Test262M5InventoryPolicy,
): Promise<{
  readonly additions: readonly string[];
  readonly entries: readonly Test262InventoryEntry[];
}> {
  const absolutePaths: string[] = [];
  for (const candidateRoot of policy.candidateRoots) {
    absolutePaths.push(
      ...(await walkJavaScriptFiles(join(root, candidateRoot))),
    );
  }
  const paths = absolutePaths
    .map((path) => relative(root, path).split(sep).join("/"))
    .toSorted();
  for (const prefix of policy.normativeOptionalPathPrefixes) {
    if (!paths.some((path) => path.startsWith(prefix))) {
      throw new Error(
        `Test262 normative-optional path prefix ${prefix} matched no path.`,
      );
    }
  }
  for (const path of policy.normativeOptionalPaths) {
    if (!paths.includes(path)) {
      throw new Error(
        `Test262 normative-optional path ${path} does not exist.`,
      );
    }
  }
  const entries: Test262InventoryEntry[] = [];
  const additions: string[] = [];
  for (const path of paths) {
    const features = parseTest262Features(
      await readFile(join(root, path), "utf8"),
      path,
    );
    const entry = classifyInventoryEntry(path, features, registry, policy);
    const inM5 = includedInM5Inventory(path, features, registry, m5Policy);
    if (inM5 && entry.boundary !== "included") {
      throw new Error(`${path} was in the M5 inventory but is now excluded.`);
    }
    if (!inM5 && entry.boundary === "included") additions.push(path);
    entries.push(entry);
  }
  return { additions, entries };
}

function subsetPaths(text: string, suiteRevision: string): readonly string[] {
  // SAFETY: parsedObject validates the complete YAML tree at this boundary.
  const root = record(parseYaml(text) as StructuredDataInput, "test262 subset");
  if (root.suiteRevision !== suiteRevision) {
    throw new Error("test262 subset and inventory revisions differ.");
  }
  if (!Array.isArray(root.tests)) {
    throw new Error("test262 subset tests must be an array.");
  }
  return root.tests.map((value, index) => {
    const entry = record(value, `test262 subset test ${index}`);
    return stringValue(entry.path, `test262 subset test ${index} path`);
  });
}

function validateReviewedSubset(
  entries: readonly Test262InventoryEntry[],
  paths: readonly string[],
): void {
  const boundaries = new Map(
    entries.map((entry) => [entry.path, entry.boundary] as const),
  );
  for (const path of paths) {
    const boundary = boundaries.get(path);
    if (boundary == null) {
      throw new Error(`Reviewed test262 path ${path} is not inventoried.`);
    }
    if (boundary !== "included") {
      throw new Error(`Reviewed test262 path ${path} is outside the edition.`);
    }
  }
}

function parseArguments(args: readonly string[]) {
  if (args.length === 0) return { help: false, update: false };
  if (args.length === 1 && args[0] === "--update") {
    return { help: false, update: true };
  }
  if (args.length === 1 && args[0] === "--help") {
    return { help: true, update: false };
  }
  throw new Error("usage: node tools/test262-inventory.ts [--update | --help]");
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log("usage: node tools/test262-inventory.ts [--update | --help]");
    return;
  }
  const policy = parseInventoryPolicy(await readFile(policyPath, "utf8"));
  const root = await suiteRoot(policy.suiteRevision);
  const registry = parseFeatureRegistry(
    await readFile(join(root, "features.txt"), "utf8"),
  );
  for (const feature of [
    ...policy.postEditionFeatures.keys(),
    ...policy.excludedOptionalFeatures.keys(),
  ]) {
    if (!registry.all.has(feature)) {
      throw new Error(`Inventory policy feature ${feature} is not registered.`);
    }
    if (registry.proposed.has(feature)) {
      throw new Error(`Inventory policy feature ${feature} is a proposal.`);
    }
  }
  const m5Policy = parseM5InventoryPolicy(await readFile(m5PolicyPath, "utf8"));
  if (m5Policy.suiteRevision !== policy.suiteRevision) {
    throw new Error("test262 M5 and current inventory revisions differ.");
  }
  const { additions, entries } = await createInventory(
    root,
    registry,
    policy,
    m5Policy,
  );
  validateReviewedSubset(
    entries,
    subsetPaths(await readFile(subsetPath, "utf8"), policy.suiteRevision),
  );
  const serialized = serializeInventory(entries, policy);
  const serializedAdditions = serializeM5InventoryAdditions(
    additions,
    policy.suiteRevision,
  );
  const additionsPath = join(repositoryRoot, m5InventoryAdditionsPath);
  if (options.update) {
    await writeFile(inventoryPath, serialized);
    await writeFile(additionsPath, serializedAdditions);
  } else if (
    (await readFile(inventoryPath, "utf8")) !== serialized ||
    (await readFile(additionsPath, "utf8")) !== serializedAdditions
  ) {
    throw new Error(
      "Test262 inventory changed; run mise run test262:inventory:update.",
    );
  }
  const summary = summarizeInventory(entries);
  console.log(
    `test262-inventory revision=${policy.suiteRevision} ` +
      `candidates=${summary.candidates} included=${summary.included} ` +
      `excluded=${summary.excluded} ` +
      `featureless-included=${summary.featurelessIncluded} ` +
      `m5-included=${summary.included - additions.length} ` +
      `m5-additions=${additions.length}`,
  );
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  await main();
}
