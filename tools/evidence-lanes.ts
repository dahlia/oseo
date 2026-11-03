import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

import {
  parsedMapping as record,
  type StructuredDataInput,
  type StructuredDataRecord,
} from "./structured-data.ts";
import { isString } from "./value-kinds.ts";

const repositoryRoot = resolve(fileURLToPath(import.meta.url), "../..");

export const evidenceIndexDirectory = "docs/language-profile-m5/index";
export const evidenceRecordDirectory = "docs/language-profile-m5/families";

/** Directories holding one profile's family index and records. */
export interface EvidenceProfile {
  readonly indexDirectory: string;
  readonly recordDirectory: string;
  /** Whether the profile must hold at least one family. */
  readonly required: boolean;
}

/** The fixed M5 profile, whose records stay the record of the M5 claim. */
export const m5EvidenceProfile: EvidenceProfile = {
  indexDirectory: evidenceIndexDirectory,
  recordDirectory: evidenceRecordDirectory,
  required: true,
};

/**
 * The ECMAScript 2026 profile of ADR 0032. Each post-M5 unit adds the record
 * of its new family here, so the profile may still be empty.
 */
export const es2026EvidenceProfile: EvidenceProfile = {
  indexDirectory: "docs/language-profile-es2026/index",
  recordDirectory: "docs/language-profile-es2026/families",
  required: false,
};

/** Every profile the evidence-lane check validates, in reading order. */
export const evidenceProfiles: readonly EvidenceProfile[] = [
  m5EvidenceProfile,
  es2026EvidenceProfile,
];

export const evidenceClasses = [
  "differential",
  "fixed",
  "forced-collection",
  "generated",
  "guard-fallback",
  "specialization",
  "standards",
  "structural",
] as const;

export interface EvidenceSource {
  readonly path: string;
  readonly text: string;
}

export interface EvidenceInventorySummary {
  readonly classes: number;
  readonly families: number;
  readonly omitted: number;
}

export type EvidenceSourceReader = (path: string) => string;

function requireExactKeys(
  value: StructuredDataRecord,
  expected: ReadonlySet<string>,
  context: string,
): void {
  for (const key of expected) {
    if (!(key in value)) {
      throw new Error(`${context} is missing field ${key}.`);
    }
  }
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      throw new Error(`${context} has unknown field ${key}.`);
    }
  }
}

function stringValue(value: StructuredDataInput, context: string): string {
  if (!isString(value) || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string.`);
  }
  return value;
}

function familyId(value: StructuredDataInput, context: string): string {
  const id = stringValue(value, context);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) {
    throw new Error(`${context} must be a kebab-case family ID.`);
  }
  return id;
}

function stringArray(
  value: StructuredDataInput,
  context: string,
): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }
  const values = value.map((entry, index) =>
    stringValue(entry, `${context} entry ${index}`),
  );
  if (new Set(values).size !== values.length) {
    throw new Error(`${context} must not repeat values.`);
  }
  return values;
}

function checkReference(
  reference: string,
  knownReferences: ReadonlySet<string>,
  context: string,
): void {
  if (
    reference.startsWith("/") ||
    reference.includes("\\") ||
    reference.split("/").includes("..")
  ) {
    throw new Error(`${context} must be a repository-relative path.`);
  }
  if (!knownReferences.has(reference)) {
    throw new Error(`${context} does not exist: ${reference}.`);
  }
}

function parseSource(
  source: EvidenceSource,
  context: string,
): StructuredDataRecord {
  let value: StructuredDataInput;
  try {
    // SAFETY: parsedMapping validates the complete YAML tree immediately below.
    value = parseYaml(source.text) as StructuredDataInput;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${context} is malformed YAML: ${detail}`, {
      cause: error,
    });
  }
  return record(value, context);
}

function expectedPath(directory: string, id: string): string {
  return `${directory}/${id}.yaml`;
}

/** Validate one profile's complete indexed per-family evidence record set. */
export function validateEvidenceInventory(
  indexSources: readonly EvidenceSource[],
  recordSources: readonly EvidenceSource[],
  knownReferences: ReadonlySet<string>,
  profile: EvidenceProfile = m5EvidenceProfile,
): EvidenceInventorySummary {
  const indexed = new Map<string, string>();
  for (const source of indexSources) {
    const context = `evidence index ${source.path}`;
    const value = parseSource(source, context);
    requireExactKeys(value, new Set(["id", "record", "version"]), context);
    if (value.version !== 1) {
      throw new Error(`${context} version must be 1.`);
    }
    const id = familyId(value.id, `${context} id`);
    if (source.path !== expectedPath(profile.indexDirectory, id)) {
      throw new Error(`${context} filename does not match ID ${id}.`);
    }
    if (indexed.has(id)) {
      throw new Error(`evidence index repeats family ID ${id}.`);
    }
    const recordPath = stringValue(value.record, `${context} record`);
    const expectedRecord = expectedPath(profile.recordDirectory, id);
    if (recordPath !== expectedRecord) {
      throw new Error(`${context} must index ${expectedRecord}.`);
    }
    indexed.set(id, recordPath);
  }

  const records = new Set<string>();
  let omitted = 0;
  for (const source of recordSources) {
    const context = `evidence record ${source.path}`;
    const value = parseSource(source, context);
    requireExactKeys(
      value,
      new Set(["evidence", "id", "owners", "scope", "title", "version"]),
      context,
    );
    if (value.version !== 1) {
      throw new Error(`${context} version must be 1.`);
    }
    const id = familyId(value.id, `${context} id`);
    if (source.path !== expectedPath(profile.recordDirectory, id)) {
      throw new Error(`${context} filename does not match ID ${id}.`);
    }
    if (records.has(id)) {
      throw new Error(`evidence records repeat family ID ${id}.`);
    }
    records.add(id);
    stringValue(value.title, `${context} title`);
    stringArray(value.scope, `${context} scope`);
    for (const owner of stringArray(value.owners, `${context} owners`)) {
      checkReference(owner, knownReferences, `${context} owner`);
    }

    const evidence = record(value.evidence, `${context} evidence`);
    requireExactKeys(evidence, new Set(evidenceClasses), `${context} evidence`);
    for (const className of evidenceClasses) {
      const classContext = `${context} evidence ${className}`;
      const entry = record(evidence[className], classContext);
      if (entry.status === "unassessed") {
        throw new Error(`${classContext} must not be unassessed.`);
      }
      if (entry.status === "covered") {
        requireExactKeys(
          entry,
          new Set(["references", "status"]),
          classContext,
        );
        for (const reference of stringArray(
          entry.references,
          `${classContext} references`,
        )) {
          checkReference(reference, knownReferences, classContext);
        }
      } else if (entry.status === "omitted") {
        omitted += 1;
        requireExactKeys(
          entry,
          new Set(["reason", "replacements", "status"]),
          classContext,
        );
        stringValue(entry.reason, `${classContext} reason`);
        for (const replacement of stringArray(
          entry.replacements,
          `${classContext} replacements`,
        )) {
          checkReference(replacement, knownReferences, classContext);
        }
      } else {
        throw new Error(`${classContext} has unknown status.`);
      }
    }
  }

  for (const [id, recordPath] of indexed) {
    if (!records.has(id)) {
      throw new Error(`evidence index ${id} has stale record ${recordPath}.`);
    }
  }
  for (const id of records) {
    if (!indexed.has(id)) {
      throw new Error(`evidence record ${id} is not indexed.`);
    }
  }
  return { classes: evidenceClasses.length, families: records.size, omitted };
}

/** Validate a required current-tree inventory rather than a historical tree. */
export function validateRequiredEvidenceInventory(
  indexSources: readonly EvidenceSource[],
  recordSources: readonly EvidenceSource[],
  knownReferences: ReadonlySet<string>,
  profile: EvidenceProfile = m5EvidenceProfile,
): EvidenceInventorySummary {
  if (indexSources.length === 0 && recordSources.length === 0) {
    throw new Error("current evidence inventory must not be empty.");
  }
  return validateEvidenceInventory(
    indexSources,
    recordSources,
    knownReferences,
    profile,
  );
}

/**
 * Validate every profile's records against one reference set and reject a
 * family ID that two profiles both record.
 */
function validateEvidenceProfiles(
  sources: (profile: EvidenceProfile) => {
    readonly indexSources: readonly EvidenceSource[];
    readonly recordSources: readonly EvidenceSource[];
  },
  knownReferences: ReadonlySet<string>,
  required: boolean,
): ValidatedEvidenceTree {
  const familyIds: string[] = [];
  let families = 0;
  let omitted = 0;
  for (const profile of evidenceProfiles) {
    const { indexSources, recordSources } = sources(profile);
    if (indexSources.length === 0 && recordSources.length === 0) {
      if (required && profile.required) {
        throw new Error("current evidence inventory must not be empty.");
      }
      continue;
    }
    const summary = validateEvidenceInventory(
      indexSources,
      recordSources,
      knownReferences,
      profile,
    );
    families += summary.families;
    omitted += summary.omitted;
    for (const source of recordSources) {
      const id = basename(source.path, ".yaml");
      if (familyIds.includes(id)) {
        throw new Error(`evidence profiles repeat family ID ${id}.`);
      }
      familyIds.push(id);
    }
  }
  return {
    familyIds,
    summary: { classes: evidenceClasses.length, families, omitted },
  };
}

interface ValidatedEvidenceTree {
  readonly familyIds: readonly string[];
  readonly summary: EvidenceInventorySummary;
}

function validateEvidenceTree(
  listedPaths: readonly string[],
  readSource: EvidenceSourceReader,
  required: boolean,
): ValidatedEvidenceTree {
  const evidenceSources = (directory: string): readonly EvidenceSource[] => {
    const prefix = `${directory}/`;
    return listedPaths
      .filter((path) => path.startsWith(prefix))
      .map((path) => {
        const name = path.slice(prefix.length);
        if (name.includes("/") || !name.endsWith(".yaml")) {
          throw new Error(`${path} is an unindexed file.`);
        }
        return { path, text: readSource(path) };
      });
  };
  return validateEvidenceProfiles(
    (profile) => ({
      indexSources: evidenceSources(profile.indexDirectory),
      recordSources: evidenceSources(profile.recordDirectory),
    }),
    new Set(listedPaths),
    required,
  );
}

/** Validate and return family IDs from one complete repository tree. */
export function validatedEvidenceFamilyIdsFromTree(
  listedPaths: readonly string[],
  readSource: EvidenceSourceReader,
): readonly string[] {
  return validateEvidenceTree(listedPaths, readSource, false).familyIds;
}

/** Validate a required inventory read from one complete repository tree. */
export function validateRequiredEvidenceInventoryFromTree(
  listedPaths: readonly string[],
  readSource: EvidenceSourceReader,
): EvidenceInventorySummary {
  return validateEvidenceTree(listedPaths, readSource, true).summary;
}

function directorySources(directory: string): readonly EvidenceSource[] {
  const absolute = join(repositoryRoot, directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { encoding: "utf8", withFileTypes: true })
    .map((entry) => {
      if (!entry.isFile() || !entry.name.endsWith(".yaml")) {
        throw new Error(`${directory}/${entry.name} is an unindexed file.`);
      }
      const path = `${directory}/${entry.name}`;
      return { path, text: readFileSync(join(repositoryRoot, path), "utf8") };
    })
    .toSorted((left, right) => left.path.localeCompare(right.path));
}

function git(args: readonly string[]): readonly string[] {
  return execFileSync("git", ["-c", "core.fsmonitor=false", ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\n")
    .filter((path) => path.length > 0);
}

function repositoryFiles(): ReadonlySet<string> {
  const cached = git(["ls-files", "--cached"]);
  const deleted = new Set(git(["ls-files", "--deleted"]));
  return new Set(
    [...cached, ...git(["ls-files", "--others", "--exclude-standard"])].filter(
      (path) => !deleted.has(path),
    ),
  );
}

function validateStagedEvidenceInventory(): ValidatedEvidenceTree {
  const listedPaths = git(["ls-files", "--cached"]);
  return validateEvidenceTree(
    listedPaths,
    (path) =>
      execFileSync("git", ["-c", "core.fsmonitor=false", "show", `:${path}`], {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    true,
  );
}

/** Validate and summarize the current worktree's normative evidence lanes. */
export function validateCurrentEvidenceInventory(
  preCommit: boolean = process.env.MISE_PRE_COMMIT === "1",
): EvidenceInventorySummary {
  return validateCurrentEvidenceTree(preCommit).summary;
}

function validateCurrentEvidenceTree(
  preCommit: boolean,
): ValidatedEvidenceTree {
  if (preCommit) return validateStagedEvidenceInventory();
  return validateEvidenceProfiles(
    (profile) => ({
      indexSources: directorySources(profile.indexDirectory),
      recordSources: directorySources(profile.recordDirectory),
    }),
    repositoryFiles(),
    true,
  );
}

/** Return validated current-tree family IDs for compatibility snapshots. */
export function currentEvidenceFamilyIds(
  preCommit: boolean = process.env.MISE_PRE_COMMIT === "1",
): readonly string[] {
  return validateCurrentEvidenceTree(preCommit).familyIds;
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  const summary = validateCurrentEvidenceInventory();
  console.log(
    `evidence-lanes passed families=${summary.families} ` +
      `classes=${summary.classes} omitted=${summary.omitted}`,
  );
}
