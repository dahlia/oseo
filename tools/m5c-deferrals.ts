import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Test262Result } from "../packages/testkit/src/index.ts";
import { parse as parseYaml } from "yaml";

import {
  isAcceptedDecisionRecord,
  m5cClosureLedgerPath,
  m5cDeferralsPath,
  m5cDeferredOwner,
  parseM5cClosureLedger,
  readCurrentM5cNodeIds,
} from "./m5c-closure-ledger.ts";
import type { M5cClosureLedger } from "./m5c-closure-ledger.ts";
import {
  exclusionAuditDigest,
  exclusionObservationDigest,
} from "./m5c-exclusion-audit.ts";
import { readCurrentM5cManifest } from "./m5c-graph.ts";
import type {
  StructuredDataInput,
  StructuredDataRecord,
} from "./structured-data.ts";
import { parsedObject } from "./structured-data.ts";
import { isString } from "./value-kinds.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The record that defines the deferral list and whose digest binds it. */
export const m5cDeferralRecordStem = "0031-m5-named-deferral";

/** The milestone a deferral leaves open; targets must come after it. */
const deferringMilestone = 5;
const listVersion = 1;
const headerKeys: ReadonlySet<string> = new Set([
  "families",
  "paths",
  "record",
  "suiteRevision",
  "version",
]);
const entryKeys: ReadonlySet<string> = new Set([
  "attempts",
  "family",
  "observationDigest",
  "reason",
  "remainingContract",
  "section",
  "sourceDigest",
  "targetMilestone",
]);
const requiredEntryKeys: ReadonlySet<string> = new Set(
  [...entryKeys].filter((key) => key !== "reason"),
);
const familyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const deferredTrackPattern = new RegExp(
  "^A deferred [^.]*\\btrack is recorded in " +
    "\\[\\*(PLAN-[A-Z0-9-]+\\.md)\\*\\]\\(\\./\\1\\)",
  "u",
);

/** Inputs are explicit so regression tests need no checked-in corpus. */
export interface M5cDeferralInputs {
  readonly ledger: M5cClosureLedger;
  /** IDs of the checked-in M5c graph nodes an attempt may name. */
  readonly nodeIds: ReadonlySet<string>;
  /** Complete text of ADR 0031. */
  readonly record: string;
  readonly results: readonly Test262Result[];
  /** Complete text of *ROADMAP.md*. */
  readonly roadmap: string;
  /** Pinned test262 source of every listed path. */
  readonly sources: ReadonlyMap<string, string>;
}

/** Counts the exit audit summary mail reports. */
export interface M5cDeferralSummary {
  /** Path count per family in code-unit order. */
  readonly families: ReadonlyMap<string, number>;
  /** Path count per target milestone in code-unit order. */
  readonly milestones: ReadonlyMap<string, number>;
  readonly paths: number;
}

/** Targets *ROADMAP.md* offers a deferred path. */
export interface M5cDeferralTargets {
  /** Numbered milestones from the `M<n>: <title>` headings, by number. */
  readonly milestones: ReadonlyMap<string, number>;
  /**
   * Plan files of deferred tracks, each linked from a paragraph that begins
   * “A deferred … track is recorded in” the plan.
   */
  readonly deferredTracks: ReadonlySet<string>;
}

/**
 * Read the milestone headings and deferred track plans of *ROADMAP.md*. A
 * deferred track has no numbered milestone, so its owning plan names it.
 */
export function roadmapDeferralTargets(roadmap: string): M5cDeferralTargets {
  const lines = roadmap.split("\n");
  const milestones = new Map<string, number>();
  for (const [index, line] of lines.entries()) {
    const match = /^M([0-9]+): \S/u.exec(line);
    if (match == null || !/^-+$/u.test(lines[index + 1] ?? "")) continue;
    milestones.set(`M${match[1]}`, Number(match[1]));
  }
  if (milestones.size === 0) {
    throw new Error("ROADMAP.md names no milestone headings.");
  }
  const deferredTracks = new Set<string>();
  for (const paragraph of roadmap.split(/\n[ \t]*\n/u)) {
    const match = deferredTrackPattern.exec(
      paragraph.replace(/\s+/gu, " ").trim(),
    );
    if (match != null) deferredTracks.add(match[1]!);
  }
  return { deferredTracks, milestones };
}

function sorted(
  counts: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  return new Map(
    [...counts].toSorted(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

function describeCounts(counts: ReadonlyMap<string, number>): string {
  return (
    [...counts].map(([key, count]) => `${key}=${count}`).join(" ") || "none"
  );
}

function string(value: StructuredDataInput, label: string): string {
  if (!isString(value) || value.trim().length === 0) {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return value;
}

function stringList(
  value: StructuredDataInput,
  label: string,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => isString(item) && item.trim().length > 0)
  ) {
    throw new Error(`${label} must be a string list.`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`${label} repeats an item.`);
  }
  return value;
}

function requireKeys(
  value: StructuredDataRecord,
  required: ReadonlySet<string>,
  allowed: ReadonlySet<string>,
  context: string,
): void {
  const missing = [...required].filter((key) => !(key in value));
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${context} keys differ: missing=${missing.join(",") || "none"} ` +
        `unexpected=${unexpected.join(",") || "none"}.`,
    );
  }
}

/**
 * Validate the reviewed deferral list. The checker cannot judge a reason; it
 * binds each entry to its record, source, observation, and ledger owner,
 * requires the fields ADR 0031 names, and rejects a target milestone that is
 * not a later *ROADMAP.md* milestone. Every `deferred` ledger owner must have
 * an entry, and every entry must have that owner.
 */
export function validateM5cDeferrals(
  text: string,
  inputs: M5cDeferralInputs,
): M5cDeferralSummary {
  // SAFETY: parsedObject and the field checks validate the data boundary.
  const list = parsedObject(
    parseYaml(text) as StructuredDataInput,
    "M5c deferral list",
  );
  requireKeys(list, headerKeys, headerKeys, "M5c deferral list");
  if (list.version !== listVersion) {
    throw new Error(`M5c deferral list version must be ${listVersion}.`);
  }
  if (list.suiteRevision !== inputs.ledger.suiteRevision) {
    throw new Error(
      "M5c deferral list suiteRevision differs from the closure ledger.",
    );
  }
  const record = parsedObject(list.record, "M5c deferral list record");
  const recordKeys = new Set(["digest", "stem"]);
  requireKeys(record, recordKeys, recordKeys, "M5c deferral list record");
  if (record.stem !== m5cDeferralRecordStem) {
    throw new Error(
      `M5c deferral list record must be ${m5cDeferralRecordStem}.`,
    );
  }
  if (record.digest !== exclusionAuditDigest(inputs.record)) {
    throw new Error(
      `ADR ${m5cDeferralRecordStem} changed; review every deferral entry.`,
    );
  }
  const families = parsedObject(list.families, "M5c deferral families");
  for (const [family, value] of Object.entries(families)) {
    if (!familyPattern.test(family)) {
      throw new Error(`M5c deferral family key is malformed: ${family}.`);
    }
    const body = parsedObject(value, `M5c deferral family ${family}`);
    const keys = new Set(["reason"]);
    requireKeys(body, keys, keys, `M5c deferral family ${family}`);
    string(body.reason, `M5c deferral family ${family} reason`);
  }
  const paths = parsedObject(list.paths, "M5c deferral paths");
  if (
    Object.keys(paths).length > 0 &&
    !isAcceptedDecisionRecord(inputs.record)
  ) {
    throw new Error(
      `ADR ${m5cDeferralRecordStem} is not accepted, so no path can be ` +
        "deferred.",
    );
  }
  const targets = roadmapDeferralTargets(inputs.roadmap);
  const ledgerEntries = new Map(
    inputs.ledger.entries.map((entry) => [entry.path, entry]),
  );
  const results = new Map(inputs.results.map((row) => [row.case.path, row]));
  const familyCounts = new Map<string, number>();
  const milestoneCounts = new Map<string, number>();
  let previous = "";
  for (const [path, value] of Object.entries(paths)) {
    if (path <= previous) {
      throw new Error(`M5c deferral path is unordered: ${path}.`);
    }
    previous = path;
    const context = `M5c deferral ${path}`;
    const entry = parsedObject(value, context);
    requireKeys(entry, requiredEntryKeys, entryKeys, context);
    const ledgerEntry = ledgerEntries.get(path);
    const result = results.get(path);
    const source = inputs.sources.get(path);
    if (ledgerEntry == null || result == null || source == null) {
      throw new Error(`${context} lacks inventory, observation, or source.`);
    }
    if (
      ledgerEntry.state !== "unsupported-profile-feature" ||
      result.classification !== "unsupported-profile-feature"
    ) {
      throw new Error(
        `${context} is ${result.classification}; only an ` +
          "unsupported-profile-feature path can be deferred.",
      );
    }
    if (ledgerEntry.owner !== m5cDeferredOwner) {
      throw new Error(
        `${context} needs the ${m5cDeferredOwner} ledger owner, not ` +
          `${ledgerEntry.owner}.`,
      );
    }
    if (entry.sourceDigest !== exclusionAuditDigest(source)) {
      throw new Error(`${context} source changed; review the entry.`);
    }
    if (
      entry.observationDigest !== exclusionObservationDigest(result.observation)
    ) {
      throw new Error(`${context} observation changed; review the entry.`);
    }
    const family = string(entry.family, `${context} family`);
    if (!Object.hasOwn(families, family)) {
      throw new Error(`${context} names unknown family ${family}.`);
    }
    if ("reason" in entry) string(entry.reason, `${context} reason`);
    string(entry.section, `${context} section`);
    string(entry.remainingContract, `${context} remainingContract`);
    const attempts = parsedObject(entry.attempts, `${context} attempts`);
    const attemptKeys = new Set(["decisions", "nodes"]);
    requireKeys(attempts, attemptKeys, attemptKeys, `${context} attempts`);
    const nodes = stringList(attempts.nodes, `${context} attempt nodes`);
    const decisions = stringList(
      attempts.decisions,
      `${context} attempt decisions`,
    );
    if (nodes.length === 0 && decisions.length === 0) {
      throw new Error(
        `${context} attempts name no evidence node and no track decision.`,
      );
    }
    for (const node of nodes) {
      if (!inputs.nodeIds.has(node)) {
        throw new Error(`${context} attempt names unknown node ${node}.`);
      }
    }
    const milestone = string(entry.targetMilestone, `${context} target`);
    const number = targets.milestones.get(milestone);
    if (number == null && !targets.deferredTracks.has(milestone)) {
      throw new Error(
        `${context} target ${milestone} is neither a ROADMAP.md milestone ` +
          "nor the plan of a deferred ROADMAP.md track.",
      );
    }
    if (number != null && number <= deferringMilestone) {
      throw new Error(
        `${context} target ${milestone} is not a milestone after ` +
          `M${deferringMilestone}.`,
      );
    }
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
    milestoneCounts.set(milestone, (milestoneCounts.get(milestone) ?? 0) + 1);
  }
  for (const family of Object.keys(families)) {
    if (!familyCounts.has(family)) {
      throw new Error(`M5c deferral family ${family} names no path.`);
    }
  }
  for (const entry of inputs.ledger.entries) {
    if (entry.owner === m5cDeferredOwner && !Object.hasOwn(paths, entry.path)) {
      throw new Error(`Deferred ledger path has no entry: ${entry.path}.`);
    }
  }
  return {
    families: sorted(familyCounts),
    milestones: sorted(milestoneCounts),
    paths: Object.keys(paths).length,
  };
}

/** Check the list against checked-in evidence and the pinned suite. */
export function validateCurrentM5cDeferrals(): M5cDeferralSummary {
  const text = readFileSync(join(repositoryRoot, m5cDeferralsPath), "utf8");
  const suite = dirname(
    fileURLToPath(import.meta.resolve("test262/package.json")),
  );
  const sources = new Map<string, string>();
  for (const path of Object.keys(
    parsedObject(
      // SAFETY: parsedObject validates the document before its paths are read.
      parsedObject(parseYaml(text) as StructuredDataInput, "deferrals").paths,
      "deferral paths",
    ),
  )) {
    if (
      !/^test\/(?:built-ins|language)\/[A-Za-z0-9_./-]+\.js$/u.test(path) ||
      path.split("/").includes("..")
    ) {
      throw new Error(`Deferral path is not an upstream test: ${path}.`);
    }
    sources.set(path, readFileSync(join(suite, path), "utf8"));
  }
  return validateM5cDeferrals(text, {
    ledger: parseM5cClosureLedger(
      readFileSync(join(repositoryRoot, m5cClosureLedgerPath), "utf8"),
    ).ledger,
    nodeIds: readCurrentM5cNodeIds(),
    record: readFileSync(
      join(repositoryRoot, "docs/adr", `${m5cDeferralRecordStem}.md`),
      "utf8",
    ),
    results: readCurrentM5cManifest().results,
    roadmap: readFileSync(join(repositoryRoot, "ROADMAP.md"), "utf8"),
    sources,
  });
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  const summary = validateCurrentM5cDeferrals();
  console.log(
    `m5c-deferrals passed paths=${summary.paths}\n` +
      `families: ${describeCounts(summary.families)}\n` +
      `milestones: ${describeCounts(summary.milestones)}`,
  );
}
