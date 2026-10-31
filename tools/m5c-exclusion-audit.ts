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
const importAttributesOwner =
  "node:import-attributes-dynamic-coverage-remediation";
const importAttributesReservationPath =
  "docs/m5c-graph/import-attributes-dynamic-coverage.md";
/** Assessments that only the reserved dynamic attribute paths may use. */
const importAttributesAssessments: ReadonlySet<string> = new Set([
  "import-call-attributes",
  "import-call-attributes-computed-specifier",
  "json-module-dynamic-site-identity",
]);
/** A reserved rejection ends the process stderr, as a lookup rejection does. */
const reservedImportRejection = new RegExp(
  "error\\[OSEO1001\\]: ImportExpression is outside the M1 profile\\.$",
  "u",
);
const annexRemediationOwners = new Set([
  "node:ordinary-object-proto-coverage-remediation",
  "node:regexp-split-coverage-remediation",
  "node:typed-array-proto-coverage-remediation",
]);
const annexProtoRejection = new RegExp(
  "error\\[OSEO1001\\]: The Object\\.prototype\\.__proto__ accessor " +
    "is excluded by Annex B\\.$",
  "u",
);
/**
 * The mixed private accessor owner accepts only the optional legacy lookup
 * rejection (ECMA-262 16th edition 20.1.3.9, mapped onto the ADR 0013 Annex
 * B policy by ADR 0020), and that rejection accepts only this owner.
 */
const lookupRemediationOwner =
  "node:class-private-accessor-lookup-coverage-remediation";
const annexLookupRejection = new RegExp(
  "error\\[OSEO1001\\]: The Object\\.prototype\\." +
    "(__lookupGetter__|__lookupSetter__) method is excluded by the M5 " +
    "optional legacy accessor policy\\.$",
  "u",
);
const dynamicImportRejection = new RegExp(
  "error\\[OSEO1001\\]: ImportExpression is outside the M1 profile\\." +
    "(?=$|\\r?\\n|\\\\n)",
  "u",
);
/**
 * ADR 0028 excludes only the optional legacy caller expectation, only for
 * its exact selector, and only through the frontmatter rejection of the
 * `caller` feature. Its paths have no other ADR owner.
 */
const callerOwner = "adr:0028-legacy-function-caller-boundary";
const callerRecordStem = "0028-legacy-function-caller-boundary";
const callerRejectionDetail =
  "Not executed: the frontmatter needs an unsupported feature.";
const recordStems = [
  "0013-m5-edition-and-manifest",
  "0016-dynamic-source-boundary",
  "0019-m5-claim-closure",
  callerRecordStem,
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

/**
 * A member callee that names `method` statically: `o.m`, `o?.m`, `o["m"]`, or
 * `o?.["m"]`, with any parentheses. Dynamic keys and bare identifiers do not.
 */
function lookupCallee(value: StructuredDataInput, method: string): boolean {
  const node = syntaxNode(value);
  if (node?.type === "ParenthesizedExpression") {
    return lookupCallee(node.expression, method);
  }
  if (
    node?.type !== "MemberExpression" &&
    node?.type !== "OptionalMemberExpression"
  ) {
    return false;
  }
  const property = syntaxNode(node.property);
  return node.computed === true
    ? property?.type === "StringLiteral" && property.value === method
    : property?.type === "Identifier" && property.name === method;
}

/**
 * Require a call of the named legacy lookup method in call syntax, including
 * optional and static computed member calls, rather than text in a string or
 * comment or a value read. Like hasEvalCall this is not reference resolution
 * or proof of execution; the human assessment still binds the observation.
 */
export function hasLookupCall(
  source: string,
  mode: Test262Result["case"]["mode"],
  method: string,
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
      lookupCallee(node.callee, method)
    )
      return true;
    pending.push(...Object.values(node));
  }
  return false;
}

/**
 * Require a `caller` member read, `o.caller`, `o?.caller`, or the static
 * computed forms, rather than text in a string or comment. Like hasEvalCall
 * this is not reference resolution or proof of execution.
 */
export function hasCallerRead(
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
    if (lookupCallee(node, "caller")) return true;
    pending.push(...Object.values(node));
  }
  return false;
}

/**
 * Read the exhaustive path list under the Exact selector heading of the
 * accepted caller record. The audit digest of that record already binds the
 * text; this parse only turns the list into the set the checker enforces.
 */
export function legacyCallerSelector(record: string): ReadonlySet<string> {
  const lines = record.split("\n");
  const heading = lines.findIndex(
    (line, index) =>
      line === "Exact selector" && /^-+$/u.test(lines[index + 1] ?? ""),
  );
  if (heading < 0) {
    throw new Error("ADR 0028 needs its Exact selector section.");
  }
  const paths: string[] = [];
  for (const line of lines.slice(heading + 2)) {
    if (/^-+$/u.test(line)) break;
    const match = /^ -  \*(test\/[^*]+)\*(?: \(dynamic source\))?$/u.exec(line);
    if (match != null) paths.push(match[1]!.replace(/\\(.)/gu, "$1"));
  }
  if (paths.length === 0 || new Set(paths).size !== paths.length) {
    throw new Error("ADR 0028 selector is empty or repeats a path.");
  }
  return new Set(paths);
}

/** Inputs are explicit so regression tests need no corpus execution. */
export interface M5cExclusionAuditInputs {
  /** Exact separately accepted dynamic attribute reservation. */
  readonly importAttributesDynamicPaths?: ReadonlySet<string>;
  /** Exact ADR 0028 selector; absent means no path may use its owner. */
  readonly legacyCallerPaths?: ReadonlySet<string>;
  readonly ledger: M5cClosureLedger;
  readonly results: readonly Test262Result[];
  readonly records: ReadonlyMap<string, string>;
  readonly sources: ReadonlyMap<string, string>;
  /** Reviewed replacement sources, when a mixed assessment binds them. */
  readonly replacementEvidence?: ReadonlyMap<string, string>;
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
      "Audit records must name exactly ADRs 0013, 0016, 0019, and 0028.",
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
      row.priorCohort !== "annex-b" &&
      row.priorCohort !== "legacy-caller"
    ) {
      throw new Error(`Audit needs a prior ownership cohort: ${path}.`);
    }
    const assessmentName = string(row.assessment, `${path} assessment`);
    const assessment = parsedObject(
      assessments[assessmentName],
      `${path} assessment`,
    );
    string(assessment.reason, `${path} assessment reason`);
    if (
      assessment.normativeDependency !== "source-evaluation-only" &&
      assessment.normativeDependency !== "not-demonstrated" &&
      assessment.normativeDependency !== "annex-b-only" &&
      assessment.normativeDependency !== "legacy-caller-only"
    ) {
      throw new Error(
        `Audit needs a normative dependency assessment: ${path}.`,
      );
    }
    const proposedOwner = row.proposedOwner;
    if (
      proposedOwner !== dynamicOwner &&
      proposedOwner !== annexOwner &&
      proposedOwner !== callerOwner
    ) {
      throw new Error(`Audit cannot authorize this proposed record: ${path}.`);
    }
    // The selector is exact in both directions: its paths name only this
    // record, and only its paths may name it.
    const callerPath = inputs.legacyCallerPaths?.has(path) ?? false;
    if (
      (proposedOwner === callerOwner) !== callerPath ||
      (row.priorCohort === "legacy-caller") !== callerPath ||
      (assessment.normativeDependency === "legacy-caller-only") !== callerPath
    ) {
      throw new Error(`Audit needs the exact ADR 0028 selector: ${path}.`);
    }
    const excluded = assessment.disposition === "exclusion";
    if (!excluded && assessment.disposition !== "remediation") {
      throw new Error(`Audit needs a disposition: ${path}.`);
    }
    if (callerPath && !excluded) {
      throw new Error(`ADR 0028 has no remediation owner: ${path}.`);
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
    // Process observations quote stderr separately. Text printed to stdout
    // cannot authorize the new accessor surface. Direct diagnostic fixtures
    // and non-process rejections have no such wrapper.
    const stderrStart = detail.lastIndexOf('stderr="');
    const accessorDetail = (
      stderrStart < 0
        ? detail
        : detail.slice(
            stderrStart + 'stderr="'.length,
            detail.endsWith('"') ? -1 : undefined,
          )
    ).replace(/(?:\r?\n|\\n)+$/u, "");
    const dynamicSurface =
      detail.includes("error[OSEO1001]:") &&
      ((detail.includes("Unknown binding 'eval'.") &&
        hasEvalCall(source, result.case.mode)) ||
        dynamicImportRejection.test(detail) ||
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
      (detail.includes("error[OSEO1001]:") &&
        detail.includes(
          "A named backreference in a pattern that declares no group name " +
            "is admitted only by Annex B",
        )) ||
      annexProtoRejection.test(accessorDetail);
    const lookupMethod = annexLookupRejection.exec(accessorDetail)?.[1];
    // The frontmatter check runs before compilation, so caller must be the
    // only unadmitted feature: another one would hide work behind this
    // record. The observation digest binds the remaining fields.
    const callerSurface =
      detail === callerRejectionDetail &&
      result.unsupportedFeatures.length === 1 &&
      result.unsupportedFeatures[0] === "caller" &&
      result.case.features.includes("caller") &&
      result.case.flags.includes("noStrict") &&
      hasCallerRead(source, result.case.mode);
    if (
      proposedOwner === dynamicOwner
        ? !dynamicSurface
        : proposedOwner === callerOwner
          ? !callerSurface
          : !annexSurface && lookupMethod == null
    ) {
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
    const annexRemediationOwner = assessment.remediationOwner;
    if (lookupMethod != null) {
      // A rejected optional observer never closes its in-claim subject.
      if (
        proposedOwner !== annexOwner ||
        excluded ||
        annexRemediationOwner !== lookupRemediationOwner
      ) {
        throw new Error(
          `Audit needs the legacy lookup remediation owner: ${path}.`,
        );
      }
      if (!hasLookupCall(source, result.case.mode, lookupMethod)) {
        throw new Error(
          `Audit legacy lookup rejection lacks its source call: ${path}.`,
        );
      }
    } else if (annexRemediationOwner === lookupRemediationOwner) {
      throw new Error(
        `Audit legacy lookup owner needs its rejection: ${path}.`,
      );
    }
    if (
      !excluded &&
      proposedOwner === annexOwner &&
      annexRemediationOwner !== lookupRemediationOwner &&
      (!isString(annexRemediationOwner) ||
        !annexRemediationOwners.has(annexRemediationOwner))
    ) {
      throw new Error(
        `Audit needs a bounded Annex B remediation owner: ${path}.`,
      );
    }
    // Any assessment may bind the replacement evidence its reason relies on;
    // the TypedArray prototype owner requires it.
    if (
      annexRemediationOwner === "node:typed-array-proto-coverage-remediation" ||
      assessment.replacementEvidence != null
    ) {
      const replacements = parsedObject(
        assessment.replacementEvidence,
        `${path} replacement evidence`,
      );
      if (Object.keys(replacements).length === 0) {
        throw new Error(
          `Audit needs reviewed core replacement evidence: ${path}.`,
        );
      }
      for (const [reference, digest] of Object.entries(replacements)) {
        const replacement = inputs.replacementEvidence?.get(reference);
        if (
          replacement == null ||
          digest !== exclusionAuditDigest(replacement)
        ) {
          throw new Error(`Audit replacement evidence changed: ${reference}.`);
        }
      }
    }
    // The accepted accounting decision bounds the reservation to ADR 0016:
    // each unsupported reserved path is an exclusion of the exact rejected
    // ImportCall under a reservation assessment, those assessments cover no
    // other path, and no row keeps the superseded remediation owner.
    const reservedDynamicAttribute =
      inputs.importAttributesDynamicPaths?.has(path) ?? false;
    if (
      (reservedDynamicAttribute &&
        (proposedOwner !== dynamicOwner ||
          !excluded ||
          !reservedImportRejection.test(accessorDetail) ||
          !result.case.features.includes("import-attributes") ||
          !importAttributesAssessments.has(assessmentName))) ||
      (!reservedDynamicAttribute &&
        importAttributesAssessments.has(assessmentName)) ||
      assessment.remediationOwner === importAttributesOwner ||
      entry.owner === importAttributesOwner
    ) {
      throw new Error(
        `Audit needs the exact dynamic attribute reservation: ${path}.`,
      );
    }
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
        entry.owner === importAttributesOwner ||
        entry.owner === lookupRemediationOwner ||
        annexRemediationOwners.has(entry.owner)) &&
      !seen.has(entry.path)
    ) {
      throw new Error(
        `Ledger owner has no reviewed exclusion audit: ${entry.path}.`,
      );
    }
  }
  // A reviewed selector path cannot leave the audit by changing its owner.
  for (const entry of inputs.ledger.entries) {
    if (
      inputs.legacyCallerPaths?.has(entry.path) === true &&
      entry.state !== "unreviewed" &&
      !seen.has(entry.path)
    ) {
      throw new Error(
        `ADR 0028 selector path lacks its audit row: ${entry.path}.`,
      );
    }
  }
  // The reservation is a set contract. Each reserved path keeps its reviewed
  // row, whose row checks require the bounded exclusion or an observation
  // promotion; reassigning a ledger owner cannot drop it from the audit.
  for (const reserved of inputs.importAttributesDynamicPaths ?? []) {
    if (!seen.has(reserved)) {
      throw new Error(
        `Dynamic attribute reservation lacks its audit row: ${reserved}.`,
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
  const replacementEvidence = new Map<string, string>();
  const assessments = parsedObject(audit.assessments, "audit assessments");
  for (const value of Object.values(assessments)) {
    const assessment = parsedObject(value, "audit assessment");
    if (assessment.replacementEvidence == null) continue;
    for (const path of Object.keys(
      parsedObject(
        assessment.replacementEvidence,
        "audit replacement evidence",
      ),
    )) {
      if (
        !/^(?:tests|packages|docs)\/[A-Za-z0-9_./-]+$/u.test(path) ||
        path.split("/").includes("..")
      ) {
        throw new Error(
          `Audit replacement is not repository evidence: ${path}.`,
        );
      }
      replacementEvidence.set(
        path,
        readFileSync(join(repositoryRoot, path), "utf8"),
      );
    }
  }
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
    importAttributesDynamicPaths: readImportAttributesReservation(),
    legacyCallerPaths: readLegacyCallerSelector(
      recordSources.get(callerRecordStem) ?? "",
    ),
    ledger: parseM5cClosureLedger(
      readFileSync(join(repositoryRoot, m5cClosureLedgerPath), "utf8"),
    ).ledger,
    results: readCurrentM5cManifest().results,
    records: recordSources,
    sources,
    replacementEvidence,
  });
}

/** Parse the accepted caller selector and pin its exact 23 paths. */
function readLegacyCallerSelector(record: string): ReadonlySet<string> {
  const paths = [...legacyCallerSelector(record)].toSorted();
  if (
    paths.length !== 23 ||
    exclusionAuditDigest(paths.join("\n") + "\n") !==
      "757812f5891faa0c1ae1e0279bb3abc4b9a2def61ec7b809181264dabc62ed59"
  ) {
    throw new Error("ADR 0028 caller selector changed.");
  }
  return new Set(paths);
}

/** Read and verify the separately accepted 64-path reservation. */
function readImportAttributesReservation(): ReadonlySet<string> {
  const text = readFileSync(
    join(repositoryRoot, importAttributesReservationPath),
    "utf8",
  );
  const paths = [...text.matchAll(/^\| \*(test\/[^*]+)\* +\|/gmu)]
    .map((match) => match[1]!)
    .toSorted();
  if (
    paths.length !== 64 ||
    new Set(paths).size !== 64 ||
    exclusionAuditDigest(paths.join("\n") + "\n") !==
      "8c9557f0ac4f8001bddd01a25dc3b6efef6a76e1d5a8cf34b23c1bd2d86ee9da"
  ) {
    throw new Error("Dynamic import attribute reservation changed.");
  }
  return new Set(paths);
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
