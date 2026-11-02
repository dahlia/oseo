import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Test262Classification } from "../packages/testkit/src/index.ts";
import { parse as parseYaml } from "yaml";

import {
  m5cClosureLedgerPath,
  m5cDeferralsPath,
  m5cDeferredOwner,
  m5cLedgerStates,
  m5cObservationOwner,
  ownerUnit,
  parseM5cClosureLedger,
  validateCurrentM5cClosureLedger,
} from "./m5c-closure-ledger.ts";
import type {
  M5cClosureLedger,
  M5cLedgerState,
  M5cLedgerSummary,
} from "./m5c-closure-ledger.ts";
import { validateCurrentM5cDeferrals } from "./m5c-deferrals.ts";
import type { M5cDeferralSummary } from "./m5c-deferrals.ts";
import { validateCurrentM5cExclusionAudit } from "./m5c-exclusion-audit.ts";
import type { M5cExclusionAuditSummary } from "./m5c-exclusion-audit.ts";
import {
  deriveM5cBaseline,
  m5cInventoryPath,
  parseM5cInventory,
  readCurrentM5cManifest,
} from "./m5c-graph.ts";
import type { M5cManifestInput } from "./m5c-graph.ts";
import type { StructuredDataInput } from "./structured-data.ts";
import { parsedObject } from "./structured-data.ts";
import { parseReviewedSubset } from "./test262-source.ts";
import { isString } from "./value-kinds.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const subsetPath = "tests/test262/subset.yaml";
const exclusionAuditPath = "docs/m5c-closure/exclusion-audit.yaml";
const recordDirectory = "docs/adr";
const recordOwnerPrefix = "adr:";
const nodeOwnerPrefix = "node:";
/**
 * ADR 0032 withdrew this record's Annex B authorization. Its rows keep the
 * owner only until their work units implement the behavior, so a closed
 * claim may not rest on it.
 */
const withdrawnAnnexBOwner = "adr:0013-m5-edition-and-manifest";
const failureStates: readonly M5cLedgerState[] = [
  "harness-failure",
  "infrastructure-failure",
  "semantic-failure",
];
const stateLabels: ReadonlyMap<M5cLedgerState, string> = new Map([
  ["pass", "Pass"],
  ["expected-negative", "Expected negative"],
  ["unsupported-profile-feature", "Unsupported profile feature"],
  ["semantic-failure", "Semantic failure"],
  ["harness-failure", "Harness failure"],
  ["infrastructure-failure", "Infrastructure failure"],
  ["unreviewed", "Unreviewed"],
]);

/** Reviewed subset fields the audit compares with the manifest. */
export interface LanguageClaimSubsetInput {
  readonly suiteRevision: string;
  readonly tests: readonly {
    readonly expectedClassification: Test262Classification;
    readonly path: string;
  }[];
}

/**
 * Inputs are explicit so regression tests need no checked-in corpus. The
 * ledger and the two summaries come from validators that have already
 * accepted them; this audit checks only what those validators leave to the
 * terminal audit.
 */
export interface LanguageClaimAuditInputs {
  readonly deferralSummary: M5cDeferralSummary;
  /** Text of *docs/m5c-closure/deferrals.yaml*. */
  readonly deferralsText: string;
  /** Text of *docs/m5c-closure/exclusion-audit.yaml*. */
  readonly exclusionAuditText: string;
  readonly exclusionSummary: M5cExclusionAuditSummary;
  readonly inventoryText: string;
  readonly ledger: M5cClosureLedger;
  readonly ledgerSummary: M5cLedgerSummary;
  readonly manifest: M5cManifestInput;
  /** Text of every decision record the ledger names as an owner. */
  readonly records: ReadonlyMap<string, string>;
  readonly subset: LanguageClaimSubsetInput;
}

/** How strictly the audit treats paths that are still open. */
export interface LanguageClaimAuditOptions {
  /**
   * Require the terminal condition of `language-exit-audit`: no unreviewed
   * path and no remediation owner. Without it, unit-owned unreviewed paths
   * and remediation-owned unsupported paths are counted, not rejected.
   */
  readonly requireClosed: boolean;
}

/** One accepted record that authorizes and bounds an exclusion. */
export interface ExclusionRecordCount {
  readonly paths: number;
  readonly stem: string;
  readonly title: string;
}

/** One ADR 0031 deferral family and the targets that inherit it. */
export interface DeferralFamilyCount {
  readonly family: string;
  readonly paths: number;
  readonly targets: readonly string[];
}

/** Open paths one owner still holds. */
export interface OpenOwnerCount {
  readonly owner: string;
  /** Unsupported paths the owner remediates. */
  readonly remediation: number;
  /** Paths absent from the reviewed subset and manifest. */
  readonly unreviewed: number;
}

/** Every count the coverage report prints. */
export interface LanguageCoverageReport {
  readonly closedPaths: number;
  readonly deferralFamilies: readonly DeferralFamilyCount[];
  readonly deferredPaths: number;
  readonly excludedPaths: number;
  readonly exclusionRecords: readonly ExclusionRecordCount[];
  readonly inventoryPaths: number;
  readonly manifestPaths: number;
  readonly openOwners: readonly OpenOwnerCount[];
  readonly remediationPaths: number;
  readonly states: ReadonlyMap<M5cLedgerState, number>;
  readonly subsetPaths: number;
  readonly suiteRevision: string;
  readonly unownedPaths: number;
  readonly unreviewedPaths: number;
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

function nonemptyString(value: StructuredDataInput, label: string): string {
  if (!isString(value) || value.trim().length === 0) {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return value;
}

function requireRevision(
  input: string,
  revision: string,
  expected: string,
): void {
  if (revision !== expected) {
    throw new Error(
      `claim audit: ${input} revision ${revision} differs from the ` +
        `inventory revision ${expected}.`,
    );
  }
}

/** Read a record's `ADR nnnn: …` title from its Setext heading. */
function recordTitle(stem: string, text: string): string {
  const [title, underline] = text.split("\n");
  if (
    title?.startsWith(`ADR ${stem.slice(0, 4)}: `) !== true ||
    !/^=+$/u.test(underline ?? "")
  ) {
    throw new Error(`claim audit: record ${stem} has no title heading.`);
  }
  return title.trim();
}

function describePaths(paths: readonly string[]): string {
  return `${paths.length} paths, first ${paths[0]}`;
}

/**
 * Prove the mechanical closure conditions of ADR 0019 over the expanded
 * inventory of ADR 0032 and count the coverage report. Throws on the first
 * condition that does not hold; a returned report means every condition
 * holds. An open path is accepted only in a state the ledger names and
 * with a work-unit or remediation owner, unless `requireClosed` is set.
 */
export function auditLanguageClaim(
  inputs: LanguageClaimAuditInputs,
  options: LanguageClaimAuditOptions = { requireClosed: false },
): LanguageCoverageReport {
  const inventory = parseM5cInventory(inputs.inventoryText);
  const revision = inventory.suiteRevision;
  requireRevision("reviewed manifest", inputs.manifest.suiteRevision, revision);
  requireRevision("reviewed subset", inputs.subset.suiteRevision, revision);
  requireRevision("closure ledger", inputs.ledger.suiteRevision, revision);
  // SAFETY: parsedObject validates each parsed document before it is read.
  const audit = parsedObject(
    parseYaml(inputs.exclusionAuditText) as StructuredDataInput,
    "M5c exclusion audit",
  );
  // SAFETY: parsedObject validates each parsed document before it is read.
  const deferrals = parsedObject(
    parseYaml(inputs.deferralsText) as StructuredDataInput,
    "M5c deferral list",
  );
  for (const [input, document] of [
    ["exclusion audit", audit],
    ["deferral list", deferrals],
  ] as const) {
    requireRevision(
      input,
      nonemptyString(document.suiteRevision, `${input} suiteRevision`),
      revision,
    );
  }

  const included = new Set(inventory.includedPaths);
  const baseline = deriveM5cBaseline(inputs.inventoryText, inputs.manifest);

  const classifications = new Map(
    inputs.manifest.results.map((result) => [
      result.case.path,
      result.classification,
    ]),
  );
  const subsetPaths = new Set<string>();
  for (const test of inputs.subset.tests) {
    if (!included.has(test.path)) {
      throw new Error(
        `claim audit: reviewed subset path is outside the included ` +
          `inventory: ${test.path}.`,
      );
    }
    if (subsetPaths.has(test.path)) {
      throw new Error(
        `claim audit: reviewed subset repeats path ${test.path}.`,
      );
    }
    subsetPaths.add(test.path);
    const observed = classifications.get(test.path);
    if (observed !== test.expectedClassification) {
      throw new Error(
        `claim audit: reviewed subset expects ${test.path} to be ` +
          `${test.expectedClassification} but the manifest records ` +
          `${observed}.`,
      );
    }
  }

  const ledgerPaths = new Set<string>();
  for (const entry of inputs.ledger.entries) {
    if (!included.has(entry.path) || ledgerPaths.has(entry.path)) {
      throw new Error(
        `claim audit: closure ledger path is repeated or outside the ` +
          `included inventory: ${entry.path}.`,
      );
    }
    ledgerPaths.add(entry.path);
  }
  if (ledgerPaths.size !== included.size) {
    throw new Error(
      "claim audit: the closure ledger omits " +
        describePaths(
          inventory.includedPaths.filter((p) => !ledgerPaths.has(p)),
        ) +
        ".",
    );
  }

  const states = new Map<M5cLedgerState, number>(
    m5cLedgerStates.map((state) => [state, 0]),
  );
  for (const entry of inputs.ledger.entries) {
    states.set(entry.state, (states.get(entry.state) ?? 0) + 1);
  }
  const forbidden = options.requireClosed
    ? [...failureStates, "unreviewed" as const]
    : failureStates;
  for (const state of forbidden) {
    const recorded = states.get(state) ?? 0;
    if (recorded !== 0) {
      throw new Error(
        `claim audit: the closure ledger records ${recorded} ` +
          `${state} paths.`,
      );
    }
  }

  const auditRecords = parsedObject(audit.records, "exclusion audit records");
  const exclusionCounts = new Map<string, number>();
  const remediation: string[] = [];
  const unowned: string[] = [];
  const unreviewed: string[] = [];
  const open = new Map<string, { remediation: number; unreviewed: number }>();
  const countOpen = (owner: string, key: "remediation" | "unreviewed") => {
    const counts = open.get(owner) ?? { remediation: 0, unreviewed: 0 };
    counts[key] += 1;
    open.set(owner, counts);
  };
  let closedPaths = 0;
  let deferredPaths = 0;
  for (const entry of inputs.ledger.entries) {
    if (entry.state === "unreviewed") {
      if (ownerUnit(entry.owner) == null || subsetPaths.has(entry.path)) {
        throw new Error(
          `claim audit: unreviewed ${entry.path} needs a work-unit ` +
            "owner and no reviewed subset entry.",
        );
      }
      unreviewed.push(entry.path);
      countOpen(entry.owner, "unreviewed");
    } else if (entry.state !== "unsupported-profile-feature") {
      if (entry.owner !== m5cObservationOwner) {
        throw new Error(
          `claim audit: ${entry.path} is ${entry.state} but owned by ` +
            `${entry.owner}.`,
        );
      }
      closedPaths += 1;
    } else if (entry.owner === m5cDeferredOwner) {
      deferredPaths += 1;
    } else if (entry.owner.startsWith(recordOwnerPrefix)) {
      const stem = entry.owner.slice(recordOwnerPrefix.length);
      exclusionCounts.set(stem, (exclusionCounts.get(stem) ?? 0) + 1);
    } else if (
      entry.owner.startsWith(nodeOwnerPrefix) ||
      ownerUnit(entry.owner) != null
    ) {
      remediation.push(entry.path);
      countOpen(entry.owner, "remediation");
    } else {
      unowned.push(entry.path);
    }
  }
  if (subsetPaths.size + unreviewed.length !== included.size) {
    throw new Error(
      "claim audit: the reviewed subset omits " +
        describePaths(
          inventory.includedPaths.filter(
            (path) => !subsetPaths.has(path) && !unreviewed.includes(path),
          ),
        ) +
        " that the ledger does not hold as unreviewed.",
    );
  }
  const withdrawn = inputs.ledger.entries
    .filter((entry) => entry.owner === withdrawnAnnexBOwner)
    .map((entry) => entry.path);
  if (options.requireClosed && withdrawn.length > 0) {
    throw new Error(
      `claim audit: ${withdrawnAnnexBOwner} still owns ` +
        `${describePaths(withdrawn)}, but ADR 0032 withdrew its Annex B ` +
        "authorization.",
    );
  }
  if (options.requireClosed && remediation.length > 0) {
    throw new Error(
      `claim audit: remediation still owns ${describePaths(remediation)}.`,
    );
  }
  if (unowned.length > 0) {
    throw new Error(`claim audit: no owner covers ${describePaths(unowned)}.`);
  }

  const exclusionRecords: ExclusionRecordCount[] = [];
  for (const [stem, paths] of [...exclusionCounts].toSorted(([left], [right]) =>
    compareCodeUnits(left, right),
  )) {
    const evidence = auditRecords[stem];
    if (evidence == null) {
      throw new Error(
        `claim audit: record ${stem} excludes ${paths} paths but the ` +
          "exclusion audit does not review it.",
      );
    }
    const reopening = parsedObject(
      evidence,
      `exclusion audit record ${stem}`,
    ).reopening;
    if (
      !Array.isArray(reopening) ||
      reopening.length === 0 ||
      !reopening.every((quote) => isString(quote) && quote.trim() !== "")
    ) {
      throw new Error(
        `claim audit: record ${stem} states no reopening trigger.`,
      );
    }
    const text = inputs.records.get(stem);
    if (text == null) {
      throw new Error(`claim audit: record ${stem} has no text.`);
    }
    exclusionRecords.push({ paths, stem, title: recordTitle(stem, text) });
  }
  const excludedPaths = exclusionRecords.reduce(
    (total, row) => total + row.paths,
    0,
  );
  if (
    (options.requireClosed && inputs.exclusionSummary.remediation !== 0) ||
    inputs.exclusionSummary.missingDynamicTags !== 0 ||
    inputs.exclusionSummary.exclusions !== excludedPaths ||
    inputs.exclusionSummary.deferrals !== deferredPaths
  ) {
    throw new Error(
      `claim audit: the exclusion audit counts ` +
        `${inputs.exclusionSummary.exclusions} exclusions, ` +
        `${inputs.exclusionSummary.deferrals} deferrals, ` +
        `${inputs.exclusionSummary.remediation} remediation paths, and ` +
        `${inputs.exclusionSummary.missingDynamicTags} missing dynamic ` +
        `tags, but the ledger has ${excludedPaths} exclusions and ` +
        `${deferredPaths} deferrals.`,
    );
  }

  const deferralPaths = parsedObject(deferrals.paths, "deferral list paths");
  const families = new Map<string, { paths: number; targets: Set<string> }>();
  for (const [path, value] of Object.entries(deferralPaths)) {
    const row = parsedObject(value, `deferral ${path}`);
    nonemptyString(row.remainingContract, `deferral ${path} remainingContract`);
    const target = nonemptyString(
      row.targetMilestone,
      `deferral ${path} targetMilestone`,
    );
    const family = nonemptyString(row.family, `deferral ${path} family`);
    const counts = families.get(family) ?? { paths: 0, targets: new Set() };
    counts.paths += 1;
    counts.targets.add(target);
    families.set(family, counts);
  }
  const deferralFamilies = [...families]
    .toSorted(([left], [right]) => compareCodeUnits(left, right))
    .map(([family, counts]) => ({
      family,
      paths: counts.paths,
      targets: [...counts.targets].toSorted(compareCodeUnits),
    }));
  const listed = Object.keys(deferralPaths).length;
  if (
    listed !== deferredPaths ||
    inputs.deferralSummary.paths !== deferredPaths ||
    inputs.ledgerSummary.deferredPaths !== deferredPaths ||
    deferralFamilies.some(
      (row) => inputs.deferralSummary.families.get(row.family) !== row.paths,
    ) ||
    inputs.deferralSummary.families.size !== deferralFamilies.length
  ) {
    throw new Error(
      `claim audit: the deferral list names ${listed} paths but the ` +
        `ledger defers ${deferredPaths}, or the family counts differ.`,
    );
  }

  if (
    inputs.ledgerSummary.closedPaths !== closedPaths ||
    inputs.ledgerSummary.inventoryPaths !== included.size
  ) {
    throw new Error(
      "claim audit: the ledger summary differs from its entries.",
    );
  }

  return {
    closedPaths,
    deferralFamilies,
    deferredPaths,
    excludedPaths,
    exclusionRecords,
    inventoryPaths: included.size,
    manifestPaths: baseline.reviewedPaths,
    openOwners: [...open]
      .toSorted(([left], [right]) => compareCodeUnits(left, right))
      .map(([owner, counts]) => ({
        owner,
        remediation: counts.remediation,
        unreviewed: counts.unreviewed,
      })),
    remediationPaths: remediation.length,
    states,
    subsetPaths: subsetPaths.size,
    suiteRevision: revision,
    unownedPaths: unowned.length,
    unreviewedPaths: unreviewed.length,
  };
}

function count(value: number): string {
  return String(value).replace(/\B(?=(?:\d{3})+$)/gu, ",");
}

function table(header: readonly string[], rows: readonly string[][]): string {
  const all = [header, ...rows];
  const widths = header.map((_, column) =>
    Math.max(3, ...all.map((row) => (row[column] ?? "").length)),
  );
  const numeric = header.map((_, column) =>
    rows.every((row) => /^[0-9,]+$/u.test(row[column] ?? "")),
  );
  const line = (row: readonly string[]): string =>
    "| " +
    row
      .map((cell, column) =>
        numeric[column] === true
          ? cell.padStart(widths[column] ?? 0)
          : cell.padEnd(widths[column] ?? 0),
      )
      .join(" | ") +
    " |";
  const rule =
    "| " +
    widths
      .map((width, column) =>
        numeric[column] === true
          ? "-".repeat(width - 1) + ":"
          : "-".repeat(width),
      )
      .join(" | ") +
    " |";
  return [line(header), rule, ...rows.map(line)].join("\n");
}

function recordLink(row: ExclusionRecordCount): string {
  return `[${row.title}](../adr/${row.stem}.md)`;
}

function targetLink(target: string): string {
  return /^PLAN-[A-Z0-9-]+\.md$/u.test(target)
    ? `[*${target}*](../../${target})`
    : target;
}

/** Render the coverage report as Markdown. */
export function renderLanguageCoverageReport(
  report: LanguageCoverageReport,
): string {
  const inputs = table(
    ["Input", "Paths"],
    [
      ["Applicable inventory, included paths", count(report.inventoryPaths)],
      ["Reviewed subset", count(report.subsetPaths)],
      ["Reviewed manifest", count(report.manifestPaths)],
    ],
  );
  const states = table(
    ["State", "Paths"],
    [...stateLabels].map(([state, label]) => [
      label,
      count(report.states.get(state) ?? 0),
    ]),
  );
  const dispositions = table(
    ["Disposition", "Paths"],
    [
      [
        "Closed by a reviewed pass or expected negative",
        count(report.closedPaths),
      ],
      [
        "Unsupported, covered by an authorized exclusion",
        count(report.excludedPaths),
      ],
      [
        "Unsupported, named in the ADR 0031 deferral list",
        count(report.deferredPaths),
      ],
      ["Unsupported, owned by remediation", count(report.remediationPaths)],
      ["Unsupported, without an owner", count(report.unownedPaths)],
      ["Unreviewed, owned by a work unit", count(report.unreviewedPaths)],
    ],
  );
  const openOwners = table(
    ["Owner", "Unreviewed", "Remediation"],
    [
      ...report.openOwners.map((row) => [
        `\`${row.owner}\``,
        count(row.unreviewed),
        count(row.remediation),
      ]),
      ["Total", count(report.unreviewedPaths), count(report.remediationPaths)],
    ],
  );
  const exclusions = table(
    ["Authorizing record", "Paths"],
    [
      ...report.exclusionRecords.map((row) => [
        recordLink(row),
        count(row.paths),
      ]),
      ["Total", count(report.excludedPaths)],
    ],
  );
  const deferrals = table(
    ["Deferral family", "Inherited by", "Paths"],
    [
      ...report.deferralFamilies.map((row) => [
        `\`${row.family}\``,
        row.targets.map(targetLink).join(", "),
        count(row.paths),
      ]),
      ["Total", "", count(report.deferredPaths)],
    ],
  );
  return [
    `All inputs use test262 revision \`${report.suiteRevision}\`.`,
    "",
    inputs,
    "",
    "Every included path has exactly one closure ledger state:",
    "",
    states,
    "",
    "Every included path has exactly one disposition. The deferred paths are",
    "counted neither as closed nor as excluded.",
    "",
    dispositions,
    "",
    "Open paths by owner:",
    "",
    openOwners,
    "",
    "Authorized exclusions by accepted record:",
    "",
    exclusions,
    "",
    "Named deferrals by family:",
    "",
    deferrals,
  ].join("\n");
}

function read(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

/**
 * Run the existing ledger, exclusion, and deferral validators over one read
 * of the manifest, then audit the closure conditions they leave open.
 */
export function auditCurrentLanguageClaim(
  options?: LanguageClaimAuditOptions,
): LanguageCoverageReport {
  const manifest = readCurrentM5cManifest();
  const ledgerSummary = validateCurrentM5cClosureLedger(manifest);
  const exclusionSummary = validateCurrentM5cExclusionAudit(manifest.results);
  const deferralSummary = validateCurrentM5cDeferrals(manifest.results);
  const ledger = parseM5cClosureLedger(read(m5cClosureLedgerPath)).ledger;
  const records = new Map<string, string>();
  for (const entry of ledger.entries) {
    if (!entry.owner.startsWith(recordOwnerPrefix)) continue;
    const stem = entry.owner.slice(recordOwnerPrefix.length);
    if (!records.has(stem)) {
      records.set(stem, read(`${recordDirectory}/${stem}.md`));
    }
  }
  return auditLanguageClaim(
    {
      deferralSummary,
      deferralsText: read(m5cDeferralsPath),
      exclusionAuditText: read(exclusionAuditPath),
      exclusionSummary,
      inventoryText: read(m5cInventoryPath),
      ledger,
      ledgerSummary,
      manifest,
      records,
      subset: parseReviewedSubset(read(subsetPath)),
    },
    options,
  );
}

const usage =
  "usage: node tools/language-claim-audit.ts [--print] [--require-closed]";

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (
    args.some((arg) => arg !== "--print" && arg !== "--require-closed") ||
    new Set(args).size !== args.length
  ) {
    throw new Error(usage);
  }
  const report = auditCurrentLanguageClaim({
    requireClosed: args.includes("--require-closed"),
  });
  if (args.includes("--print")) {
    console.log(renderLanguageCoverageReport(report));
  } else {
    console.log(
      `language-claim-audit passed revision=${report.suiteRevision} ` +
        `paths=${report.inventoryPaths} closed=${report.closedPaths} ` +
        `excluded=${report.excludedPaths} deferred=${report.deferredPaths} ` +
        `remediation=${report.remediationPaths} ` +
        `unreviewed=${report.unreviewedPaths}`,
    );
  }
}
