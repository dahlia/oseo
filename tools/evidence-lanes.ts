import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

const repositoryRoot = resolve(fileURLToPath(import.meta.url), "../..");

export const evidenceIndexDirectory = "docs/language-profile-m5/index";
export const evidenceRecordDirectory = "docs/language-profile-m5/families";

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

function record(value: unknown, context: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be a mapping.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
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

function stringValue(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string.`);
  }
  return value;
}

function familyId(value: unknown, context: string): string {
  const id = stringValue(value, context);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) {
    throw new Error(`${context} must be a kebab-case family ID.`);
  }
  return id;
}

function stringArray(value: unknown, context: string): readonly string[] {
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

function parseSource(source: EvidenceSource, context: string): unknown {
  try {
    return parseYaml(source.text) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${context} is malformed YAML: ${detail}`, {
      cause: error,
    });
  }
}

function expectedPath(directory: string, id: string): string {
  return `${directory}/${id}.yaml`;
}

/** Validate the complete indexed M5 per-family evidence record set. */
export function validateEvidenceInventory(
  indexSources: readonly EvidenceSource[],
  recordSources: readonly EvidenceSource[],
  knownReferences: ReadonlySet<string>,
): EvidenceInventorySummary {
  const indexed = new Map<string, string>();
  for (const source of indexSources) {
    const context = `evidence index ${source.path}`;
    const value = record(parseSource(source, context), context);
    requireExactKeys(value, new Set(["id", "record", "version"]), context);
    if (value.version !== 1) {
      throw new Error(`${context} version must be 1.`);
    }
    const id = familyId(value.id, `${context} id`);
    if (source.path !== expectedPath(evidenceIndexDirectory, id)) {
      throw new Error(`${context} filename does not match ID ${id}.`);
    }
    if (indexed.has(id)) {
      throw new Error(`evidence index repeats family ID ${id}.`);
    }
    const recordPath = stringValue(value.record, `${context} record`);
    const expectedRecord = expectedPath(evidenceRecordDirectory, id);
    if (recordPath !== expectedRecord) {
      throw new Error(`${context} must index ${expectedRecord}.`);
    }
    indexed.set(id, recordPath);
  }

  const records = new Set<string>();
  let omitted = 0;
  for (const source of recordSources) {
    const context = `evidence record ${source.path}`;
    const value = record(parseSource(source, context), context);
    requireExactKeys(
      value,
      new Set(["evidence", "id", "owners", "scope", "title", "version"]),
      context,
    );
    if (value.version !== 1) {
      throw new Error(`${context} version must be 1.`);
    }
    const id = familyId(value.id, `${context} id`);
    if (source.path !== expectedPath(evidenceRecordDirectory, id)) {
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

/** Validate and return family IDs from one complete repository tree. */
export function validatedEvidenceFamilyIdsFromTree(
  listedPaths: readonly string[],
  readSource: EvidenceSourceReader,
): readonly string[] {
  const evidenceSources = (directory: string): readonly EvidenceSource[] =>
    listedPaths
      .filter(
        (path) => path.startsWith(`${directory}/`) && path.endsWith(".yaml"),
      )
      .map((path) => ({ path, text: readSource(path) }));
  const indexSources = evidenceSources(evidenceIndexDirectory);
  const recordSources = evidenceSources(evidenceRecordDirectory);
  if (indexSources.length === 0 && recordSources.length === 0) return [];
  validateEvidenceInventory(indexSources, recordSources, new Set(listedPaths));
  return recordSources.map((source) => basename(source.path, ".yaml"));
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

function repositoryFiles(): ReadonlySet<string> {
  const git = (args: readonly string[]): readonly string[] =>
    execFileSync("git", ["-c", "core.fsmonitor=false", ...args], {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
      .split("\n")
      .filter((path) => path.length > 0);
  return new Set(git(["ls-files", "--cached"]));
}

/** Validate and summarize the current worktree's normative evidence lanes. */
export function validateCurrentEvidenceInventory(): EvidenceInventorySummary {
  return validateEvidenceInventory(
    directorySources(evidenceIndexDirectory),
    directorySources(evidenceRecordDirectory),
    repositoryFiles(),
  );
}

/** Return validated current-tree family IDs for compatibility snapshots. */
export function currentEvidenceFamilyIds(): readonly string[] {
  validateCurrentEvidenceInventory();
  return directorySources(evidenceRecordDirectory).map((source) =>
    basename(source.path, ".yaml"),
  );
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  const summary = validateCurrentEvidenceInventory();
  console.log(
    `evidence-lanes passed families=${summary.families} ` +
      `classes=${summary.classes} omitted=${summary.omitted}`,
  );
}
