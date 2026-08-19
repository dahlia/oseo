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
const subsetPath = join(repositoryRoot, "tests/test262/subset.yaml");

/** Whether an upstream path contributes to the edition denominator. */
export type Test262InventoryBoundary = "excluded" | "included";

/** Rules mapping the pinned Test262 corpus to one ECMA-262 edition. */
export interface Test262InventoryPolicy {
  readonly annexBPathPrefixes: readonly string[];
  readonly annexBPaths: readonly string[];
  readonly candidateRoots: readonly string[];
  readonly edition: number;
  readonly editionYear: number;
  readonly formatVersion: number;
  readonly postEditionFeatures: ReadonlyMap<string, number>;
  readonly sources: Test262InventorySources;
  readonly suiteRevision: string;
}

/** Pinned primary sources used to review the edition mapping. */
export interface Test262InventorySources {
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
  const annexBPathPrefixes = sortedUnique(
    stringArray(root.annexBPathPrefixes, "test262 Annex B path prefixes"),
    "test262 Annex B path prefixes",
  );
  for (const prefix of annexBPathPrefixes) {
    if (
      !prefix.endsWith("/") ||
      !candidateRoots.some((candidateRoot) =>
        prefix.startsWith(`${candidateRoot}/`),
      )
    ) {
      throw new Error(
        `test262 Annex B path prefix ${prefix} must be a candidate ` +
          "subdirectory.",
      );
    }
  }
  const annexBPaths = sortedUnique(
    stringArray(root.annexBPaths, "test262 Annex B paths"),
    "test262 Annex B paths",
  );
  for (const path of annexBPaths) {
    if (
      !path.endsWith(".js") ||
      !candidateRoots.some((candidateRoot) =>
        path.startsWith(`${candidateRoot}/`),
      )
    ) {
      throw new Error(
        `test262 Annex B path ${path} must be a candidate JavaScript file.`,
      );
    }
    if (annexBPathPrefixes.some((prefix) => path.startsWith(prefix))) {
      throw new Error(`test262 Annex B path ${path} repeats a path prefix.`);
    }
  }
  return {
    annexBPathPrefixes,
    annexBPaths,
    candidateRoots,
    edition: positiveInteger(root.edition, "test262 inventory edition"),
    editionYear,
    formatVersion: positiveInteger(
      root.formatVersion,
      "test262 inventory format version",
    ),
    postEditionFeatures,
    sources: {
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
 * Apply the ADR 0020 rule without treating implementation support as an
 * edition-boundary fact.
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
  if (
    policy.annexBPaths.includes(path) ||
    policy.annexBPathPrefixes.some((prefix) => path.startsWith(prefix))
  ) {
    return {
      basis: "optional-section:annex-b",
      boundary: "excluded",
      path,
    };
  }
  const reasons: string[] = [];
  for (const feature of features) {
    const postEditionYear = policy.postEditionFeatures.get(feature);
    if (registry.proposed.has(feature)) {
      reasons.push(`proposal:${feature}`);
    } else if (postEditionYear != null) {
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
  return {
    basis:
      features.length === 0
        ? `edition-${policy.editionYear}:unflagged-core`
        : `edition-${policy.editionYear}`,
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
): Promise<readonly Test262InventoryEntry[]> {
  const absolutePaths: string[] = [];
  for (const candidateRoot of policy.candidateRoots) {
    absolutePaths.push(
      ...(await walkJavaScriptFiles(join(root, candidateRoot))),
    );
  }
  const paths = absolutePaths
    .map((path) => relative(root, path).split(sep).join("/"))
    .toSorted();
  for (const prefix of policy.annexBPathPrefixes) {
    if (!paths.some((path) => path.startsWith(prefix))) {
      throw new Error(`Test262 Annex B path prefix ${prefix} matched no path.`);
    }
  }
  for (const path of policy.annexBPaths) {
    if (!paths.includes(path)) {
      throw new Error(`Test262 Annex B path ${path} does not exist.`);
    }
  }
  const entries: Test262InventoryEntry[] = [];
  for (const path of paths) {
    const features = parseTest262Features(
      await readFile(join(root, path), "utf8"),
      path,
    );
    entries.push(classifyInventoryEntry(path, features, registry, policy));
  }
  return entries;
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
  for (const feature of policy.postEditionFeatures.keys()) {
    if (!registry.all.has(feature)) {
      throw new Error(`Post-edition feature ${feature} is not registered.`);
    }
  }
  const entries = await createInventory(root, registry, policy);
  validateReviewedSubset(
    entries,
    subsetPaths(await readFile(subsetPath, "utf8"), policy.suiteRevision),
  );
  const serialized = serializeInventory(entries, policy);
  if (options.update) {
    await writeFile(inventoryPath, serialized);
  } else if ((await readFile(inventoryPath, "utf8")) !== serialized) {
    throw new Error(
      "Test262 inventory changed; run mise run test262:inventory:update.",
    );
  }
  const summary = summarizeInventory(entries);
  console.log(
    `test262-inventory revision=${policy.suiteRevision} ` +
      `candidates=${summary.candidates} included=${summary.included} ` +
      `excluded=${summary.excluded} ` +
      `featureless-included=${summary.featurelessIncluded}`,
  );
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  await main();
}
