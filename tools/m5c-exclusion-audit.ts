import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseBabel } from "@babel/parser";
import type {
  Test262Observation,
  Test262Result,
} from "../packages/testkit/src/index.ts";
import { parse as parseYaml } from "yaml";

import {
  isAcceptedDecisionRecord,
  m5cClosureLedgerPath,
  parseM5cClosureLedger,
} from "./m5c-closure-ledger.ts";
import type { M5cClosureLedger } from "./m5c-closure-ledger.ts";
import { readCurrentM5cManifest } from "./m5c-graph.ts";
import type {
  StructuredDataInput,
  StructuredDataRecord,
} from "./structured-data.ts";
import { parsedObject } from "./structured-data.ts";
import { isObject, isString } from "./value-kinds.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const auditPath = "docs/m5c-closure/exclusion-audit.yaml";
const dynamicOwner = "adr:0016-dynamic-source-boundary";
const annexOwner = "adr:0013-m5-edition-and-manifest";
const remediationOwner = "node:dynamic-source-coverage-remediation";
const annexRemediationOwner = "node:regexp-split-coverage-remediation";
const recordStems = [
  "0013-m5-edition-and-manifest",
  "0016-dynamic-source-boundary",
  "0019-m5-claim-closure",
] as const;

/** Snapshot digest binds a human assessment to its reviewed input. */
export function exclusionAuditDigest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Harness composition can move a diagnostic without changing its rejection.
 * Ignore only the outer diagnostic's numeric location; preserve its code,
 * message, capability, variant, exit status, stdout, and other observation.
 */
export function exclusionObservationDigest(
  observation: Test262Observation,
): string {
  if (observation.detail == null) {
    return exclusionAuditDigest(JSON.stringify(observation));
  }
  return exclusionAuditDigest(
    JSON.stringify({
      ...observation,
      detail: observation.detail.replace(
        /(stderr="[^"]*?):\d+:\d+:(?= error\[OSEO\d{4}\]:)/u,
        "$1:<location>:",
      ),
    }),
  );
}

/** Babel nodes stay local to this audit's syntactic call-position check. */
interface SyntaxNode extends StructuredDataRecord {
  readonly type: string;
}

function syntaxNode<Candidate>(value: Candidate): SyntaxNode | undefined {
  if (
    !isObject(value) ||
    Array.isArray(value) ||
    !("type" in value) ||
    !isString(value.type)
  ) {
    return undefined;
  }
  // SAFETY: the type field is checked; remaining fields are narrowed on use.
  return value as SyntaxNode;
}

function evalCallee(value: StructuredDataInput): boolean {
  const node = syntaxNode(value);
  if (node?.type === "Identifier") return node.name === "eval";
  if (node?.type === "ParenthesizedExpression") {
    return evalCallee(node.expression);
  }
  if (node?.type === "SequenceExpression" && Array.isArray(node.expressions)) {
    return evalCallee(node.expressions.at(-1));
  }
  return false;
}

/**
 * Require actual call syntax, including optional and indirect calls, rather
 * than text in a string/comment or an eval value read. This is not reference
 * resolution: the human assessment still binds the diagnostic to the source.
 */
export function hasEvalCall(
  source: string,
  mode: Test262Result["case"]["mode"],
): boolean {
  const tree = syntaxNode(parseBabel(source, { sourceType: mode }));
  const pending: StructuredDataInput[] = [tree];
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    const node = syntaxNode(value);
    if (node == null) continue;
    if (
      (node.type === "CallExpression" ||
        node.type === "OptionalCallExpression") &&
      evalCallee(node.callee)
    )
      return true;
    pending.push(...Object.values(node));
  }
  return false;
}

/** Inputs are explicit so regression tests need no corpus execution. */
export interface M5cExclusionAuditInputs {
  readonly ledger: M5cClosureLedger;
  readonly results: readonly Test262Result[];
  readonly records: ReadonlyMap<string, string>;
  readonly sources: ReadonlyMap<string, string>;
}

/** Counts distinguish authorized rejection from unresolved subject coverage. */
export interface M5cExclusionAuditSummary {
  readonly exclusions: number;
  readonly remediation: number;
  readonly missingDynamicTags: number;
}

function normalized(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function strings(value: StructuredDataInput, label: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => isString(item) && item.trim().length > 0) ||
    value.length === 0
  ) {
    throw new Error(`${label} must be a nonempty string list.`);
  }
  return value;
}

function string(value: StructuredDataInput, label: string): string {
  if (!isString(value) || value.trim().length === 0) {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return value;
}

/**
 * Validate reviewed judgments, not infer authorization from tags or paths.
 * Quotes and hashes make changed records, sources, and observations require
 * a new review. The checker cannot prove a human normative assessment; it
 * ensures that every ADR-owned row has one explicit, current assessment and
 * refuses closure when that assessment leaves non-source coverage unresolved.
 */
export function validateM5cExclusionAudit(
  text: string,
  inputs: M5cExclusionAuditInputs,
): M5cExclusionAuditSummary {
  // SAFETY: parsedObject and field checks validate the parsed data boundary.
  const audit = parsedObject(
    parseYaml(text) as StructuredDataInput,
    "M5c exclusion audit",
  );
  if (
    audit.version !== 1 ||
    audit.suiteRevision !== inputs.ledger.suiteRevision
  ) {
    throw new Error("M5c exclusion audit version or revision differs.");
  }
  const records = parsedObject(audit.records, "audit records");
  if (
    Object.keys(records).length !== recordStems.length ||
    Object.keys(records).some(
      (stem) => !recordStems.some((known) => known === stem),
    )
  ) {
    throw new Error(
      "Audit records must name exactly ADRs 0013, 0016, and 0019.",
    );
  }
  for (const stem of recordStems) {
    const evidence = parsedObject(records[stem], `audit record ${stem}`);
    const source = inputs.records.get(stem);
    if (source == null || !isAcceptedDecisionRecord(source)) {
      throw new Error(`Audit record ${stem} is not accepted.`);
    }
    if (evidence.digest !== exclusionAuditDigest(source)) {
      throw new Error(`Audit record ${stem} changed; review its boundary.`);
    }
    for (const key of ["authorization", "reopening"] as const) {
      for (const quote of strings(evidence[key], `${stem} ${key}`)) {
        if (!normalized(source).includes(normalized(quote))) {
          throw new Error(
            `Audit ${stem} ${key} quote is absent from its record.`,
          );
        }
      }
    }
  }
  const assessments = parsedObject(audit.assessments, "audit assessments");
  if (!Array.isArray(audit.paths)) {
    throw new Error("Audit paths must be an array.");
  }
  const results = new Map(inputs.results.map((row) => [row.case.path, row]));
  const entries = new Map(inputs.ledger.entries.map((row) => [row.path, row]));
  const seen = new Set<string>();
  let exclusions = 0;
  let remediation = 0;
  let missingDynamicTags = 0;
  let previous = "";
  for (const value of audit.paths) {
    const row = parsedObject(value, "audit path");
    const path = string(row.path, "audit path");
    if (seen.has(path) || path < previous) {
      throw new Error(`Audit path duplicated or unordered: ${path}.`);
    }
    previous = path;
    seen.add(path);
    const entry = entries.get(path);
    const result = results.get(path);
    const source = inputs.sources.get(path);
    if (entry == null || result == null || source == null) {
      throw new Error(
        `Audit path lacks inventory, observation, or source: ${path}.`,
      );
    }
    if (result.classification !== entry.state) {
      throw new Error(`Audit state differs from its observation: ${path}.`);
    }
    if (row.sourceDigest !== exclusionAuditDigest(source)) {
      throw new Error(`Audit source changed: ${path}.`);
    }
    string(row.subject, `${path} subject`);
    string(row.section, `${path} normative section`);
    if (
      row.priorCohort !== "source-subject" &&
      row.priorCohort !== "incidental-scaffolding" &&
      row.priorCohort !== "annex-b"
    ) {
      throw new Error(`Audit needs a prior ownership cohort: ${path}.`);
    }
    const assessment = parsedObject(
      assessments[string(row.assessment, `${path} assessment`)],
      `${path} assessment`,
    );
    string(assessment.reason, `${path} assessment reason`);
    if (
      assessment.normativeDependency !== "source-evaluation-only" &&
      assessment.normativeDependency !== "not-demonstrated" &&
      assessment.normativeDependency !== "annex-b-only"
    ) {
      throw new Error(
        `Audit needs a normative dependency assessment: ${path}.`,
      );
    }
    const proposedOwner = row.proposedOwner;
    if (proposedOwner !== dynamicOwner && proposedOwner !== annexOwner) {
      throw new Error(`Audit cannot authorize this proposed record: ${path}.`);
    }
    const excluded = assessment.disposition === "exclusion";
    if (!excluded && assessment.disposition !== "remediation") {
      throw new Error(`Audit needs a disposition: ${path}.`);
    }
    if (excluded && assessment.normativeDependency === "not-demonstrated") {
      throw new Error(
        `Unresolved subject coverage cannot keep an ADR: ${path}.`,
      );
    }
    if (
      (assessment.normativeDependency === "annex-b-only" &&
        proposedOwner !== annexOwner) ||
      (assessment.normativeDependency === "source-evaluation-only" &&
        proposedOwner !== dynamicOwner)
    ) {
      throw new Error(`Audit bounded surface differs from record: ${path}.`);
    }
    // Promotions close a historical assessment without inventing a new one.
    if (entry.state === "pass" || entry.state === "expected-negative") {
      if (entry.owner !== "observation") {
        throw new Error(
          `Closed audit path needs its observation owner: ${path}.`,
        );
      }
      continue;
    }
    if (entry.state !== "unsupported-profile-feature") {
      throw new Error(
        `Audit path no longer has its unsupported state: ${path}.`,
      );
    }
    if (
      row.observationDigest !== exclusionObservationDigest(result.observation)
    ) {
      throw new Error(`Audit observation changed: ${path}.`);
    }
    const detail = result.observation.detail ?? "";
    const dynamicSurface =
      detail.includes("error[OSEO1001]:") &&
      ((detail.includes("Unknown binding 'eval'.") &&
        hasEvalCall(source, result.case.mode)) ||
        detail.includes("The Function constructor requires dynamic source") ||
        // The run-time boundary of each realm's source-compiling
        // constructors and of %eval% called with a String (ADR 0027).
        [
          "AsyncGeneratorFunction",
          "AsyncFunction",
          "GeneratorFunction",
          "Function",
          "eval",
        ].some((name) =>
          detail.includes(`${name} compiles source text at run time`),
        ));
    const annexSurface =
      detail.includes("error[OSEO1001]:") &&
      detail.includes(
        "A named backreference in a pattern that declares no group name " +
          "is admitted only by Annex B",
      );
    if (proposedOwner === dynamicOwner ? !dynamicSurface : !annexSurface) {
      throw new Error(
        `Audit rejection is outside the record surface: ${path}.`,
      );
    }
    const missingTag =
      proposedOwner === dynamicOwner &&
      !result.dependencies.includes("dynamic-source");
    if (row.missingDynamicTag !== missingTag) {
      throw new Error(`Audit dependency-tag debt changed: ${path}.`);
    }
    if (missingTag) missingDynamicTags += 1;
    const owner = excluded
      ? proposedOwner
      : proposedOwner === annexOwner
        ? annexRemediationOwner
        : remediationOwner;
    if (entry.owner !== owner) {
      throw new Error(`Audit requires owner ${owner} for ${path}.`);
    }
    if (excluded) exclusions += 1;
    else remediation += 1;
  }
  for (const entry of inputs.ledger.entries) {
    if (
      (entry.owner.startsWith("adr:") ||
        entry.owner === remediationOwner ||
        entry.owner === annexRemediationOwner) &&
      !seen.has(entry.path)
    ) {
      throw new Error(
        `Ledger owner has no reviewed exclusion audit: ${entry.path}.`,
      );
    }
  }
  return { exclusions, remediation, missingDynamicTags };
}

/** Check the audit against pinned source and checked-in observations. */
export function validateCurrentM5cExclusionAudit(): M5cExclusionAuditSummary {
  const text = readFileSync(join(repositoryRoot, auditPath), "utf8");
  // SAFETY: parsedObject validates the document before its paths are read.
  const audit = parsedObject(parseYaml(text) as StructuredDataInput, "audit");
  const recordSources = new Map(
    recordStems.map((stem) => [
      stem,
      readFileSync(join(repositoryRoot, "docs/adr", `${stem}.md`), "utf8"),
    ]),
  );
  const suite = dirname(
    fileURLToPath(import.meta.resolve("test262/package.json")),
  );
  const sources = new Map<string, string>();
  if (!Array.isArray(audit.paths))
    throw new Error("Audit paths must be an array.");
  for (const value of audit.paths) {
    const row = parsedObject(value, "audit path");
    const path = string(row.path, "audit path");
    if (
      !/^test\/(?:built-ins|language)\/[A-Za-z0-9_./-]+\.js$/u.test(path) ||
      path.split("/").includes("..")
    ) {
      throw new Error(`Audit path is not an upstream test: ${path}.`);
    }
    sources.set(path, readFileSync(join(suite, path), "utf8"));
  }
  return validateM5cExclusionAudit(text, {
    ledger: parseM5cClosureLedger(
      readFileSync(join(repositoryRoot, m5cClosureLedgerPath), "utf8"),
    ).ledger,
    results: readCurrentM5cManifest().results,
    records: recordSources,
    sources,
  });
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  const summary = validateCurrentM5cExclusionAudit();
  console.log(
    `m5c-exclusion-audit passed exclusions=${summary.exclusions} ` +
      `remediation=${summary.remediation} ` +
      `missing-dynamic-tags=${summary.missingDynamicTags}`,
  );
}
