import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Test262Classification } from "../packages/testkit/src/index.ts";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  m5cInventoryPath,
  m5cWorkGraphNodeDirectory,
  parseM5cInventory,
  readCurrentM5cManifest,
} from "./m5c-graph.ts";
import type {
  StructuredDataInput,
  StructuredDataRecord,
} from "./structured-data.ts";
import { parsedObject as record } from "./structured-data.ts";
import { isNumber, isString } from "./value-kinds.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Checked-in M5c closure ledger, a graph serialization point. */
export const m5cClosureLedgerPath = "docs/m5c-closure/ledger.yaml";

/**
 * Closure state of one included inventory path. Reviewed paths carry their
 * manifest classification unchanged; a path absent from the manifest is
 * `unreviewed`, never a classification inferred from its directory.
 */
export type M5cLedgerState = Test262Classification | "unreviewed";

/**
 * Every state in canonical order. Failure states stay in the vocabulary so a
 * manifest that records one produces a ledger that reports it rather than a
 * ledger that cannot be generated.
 */
export const m5cLedgerStates: readonly M5cLedgerState[] = [
  "expected-negative",
  "harness-failure",
  "infrastructure-failure",
  "pass",
  "semantic-failure",
  "unreviewed",
  "unsupported-profile-feature",
];

/** Owner of a path whose reviewed observation closes it by itself. */
export const m5cObservationOwner = "observation";

/**
 * Owner of a reviewed path that needs remediation or an authorized exclusion
 * but has neither yet. The checker counts it as open.
 */
export const m5cUnassignedOwner = "unassigned";

/** Graph node that owns unreviewed paths until it partitions them. */
export const m5cUnreviewedDefaultNode = "observation-batch-plan";

const nodeOwnerPrefix = "node:";
const ledgerVersion = 1;
const closedStates: ReadonlySet<M5cLedgerState> = new Set([
  "expected-negative",
  "pass",
]);
const ownerAssignableStates: ReadonlySet<M5cLedgerState> = new Set([
  "harness-failure",
  "infrastructure-failure",
  "semantic-failure",
  "unsupported-profile-feature",
]);
const headerKeys: ReadonlySet<string> = new Set([
  "closedPaths",
  "inventoryPaths",
  "openPaths",
  "owners",
  "states",
  "suiteRevision",
  "version",
]);
const defaultOwnerNotes: ReadonlyMap<string, string> = new Map([
  [
    `${nodeOwnerPrefix}${m5cUnreviewedDefaultNode}`,
    "Absent from the reviewed manifest. The observation-batch-plan node " +
      "partitions these paths into deterministic observation batches; no " +
      "classification is assumed before a batch observes them.",
  ],
  [
    m5cObservationOwner,
    "Closed by a reviewed pass or expected negative in the manifest. The " +
      "owner changes only when a regenerated manifest changes the state.",
  ],
  [
    m5cUnassignedOwner,
    "Reviewed unsupported paths awaiting the unsupported-ownership-audit " +
      "node. Their prerequisites are ADR 0013 dependency tags, not exclusion " +
      "authorizations, so every path here remains open.",
  ],
]);
const pathPattern = /^test\/[A-Za-z0-9._/-]+$/u;
const tagPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const entryPattern =
  /^ {2}(\S+): \[([a-z-]+), ([a-z0-9:-]+)(?:, \[([a-z0-9, -]*)\])?\]$/u;
const preamble = [
  "# Derived M5c closure ledger. Regenerate with",
  "# `mise run m5c:closure-ledger:update`; PLAN-M5C.md defines the layout.",
  "# States and prerequisites come from the inventory and reviewed manifest.",
  "# Only owner assignments and owner notes are edited by M5c nodes.",
];

/** One included inventory path, its derived state, and its owner. */
export interface M5cLedgerEntry {
  /** Exact upstream test path from the inventory. */
  readonly path: string;
  /** Derived state; never edited by hand. */
  readonly state: M5cLedgerState;
  /**
   * `observation`, `unassigned`, or `node:<id>` naming a graph node. An
   * authorized-exclusion owner form does not exist until an accepted record
   * authorizes and bounds one.
   */
  readonly owner: string;
  /**
   * ADR 0013 dependency tags copied from the manifest for an unsupported
   * path, and empty for every other state. They name prerequisite work and
   * never authorize an exclusion.
   */
  readonly prerequisites: readonly string[];
}

/** Parsed or derived closure ledger. */
export interface M5cClosureLedger {
  readonly entries: readonly M5cLedgerEntry[];
  /** Hand-written explanation for each owner, keyed by owner. */
  readonly ownerNotes: ReadonlyMap<string, string>;
  readonly suiteRevision: string;
}

/** Reviewed-manifest surface the ledger derives states from. */
export interface M5cLedgerManifestInput {
  readonly results: readonly {
    readonly case: { readonly path: string };
    readonly classification: Test262Classification;
    readonly dependencies: readonly string[];
  }[];
  readonly suiteRevision: string;
}

/** State counts, which the manifest alone determines. */
export interface M5cLedgerStateCounts {
  readonly closedPaths: number;
  readonly inventoryPaths: number;
  readonly openPaths: number;
  readonly states: ReadonlyMap<M5cLedgerState, number>;
}

/** Counts reported by a valid ledger. */
export interface M5cLedgerSummary extends M5cLedgerStateCounts {
  /** Path count per owner in code-unit order. */
  readonly owners: ReadonlyMap<string, number>;
}

/** Manifest-derived facts for one included path, before ownership. */
interface DerivedEntry {
  readonly path: string;
  readonly prerequisites: readonly string[];
  readonly state: M5cLedgerState;
}

/** Derived entries in canonical path order, also indexed by path. */
interface DerivedInventory {
  readonly byPath: ReadonlyMap<string, DerivedEntry>;
  readonly entries: readonly DerivedEntry[];
}

/** Parsed header kept for count validation, and the parsed ledger. */
interface ParsedLedger {
  readonly header: StructuredDataRecord;
  readonly ledger: M5cClosureLedger;
}

/** Checked-in inputs the current ledger is derived from. */
interface CurrentInputs {
  readonly inventoryText: string;
  readonly manifest: M5cLedgerManifestInput;
  readonly nodeIds: ReadonlySet<string>;
}

function isLedgerState(value: string): value is M5cLedgerState {
  return m5cLedgerStates.some((state) => state === value);
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** Name the closure-owning graph node of a `node:` owner, if any. */
function ownerNode(owner: string): string | undefined {
  return owner.startsWith(nodeOwnerPrefix)
    ? owner.slice(nodeOwnerPrefix.length)
    : undefined;
}

/** Owner a newly derived or newly changed state receives. */
function defaultOwner(state: M5cLedgerState): string {
  if (closedStates.has(state)) return m5cObservationOwner;
  if (state === "unreviewed") {
    return `${nodeOwnerPrefix}${m5cUnreviewedDefaultNode}`;
  }
  return m5cUnassignedOwner;
}

/**
 * Explain why an owner cannot own a path in a state, or return undefined.
 * Closed states belong to their observation, unreviewed paths to a graph
 * node, and reviewed open states to a node or explicitly to nobody yet.
 */
function ownerProblem(
  state: M5cLedgerState,
  owner: string,
  nodeIds: ReadonlySet<string>,
): string | undefined {
  const node = ownerNode(owner);
  if (node != null && !nodeIds.has(node)) {
    return `names unknown M5c graph node ${node}`;
  }
  if (closedStates.has(state)) {
    return owner === m5cObservationOwner
      ? undefined
      : `must be ${m5cObservationOwner} for a ${state} path`;
  }
  if (state === "unreviewed") {
    return node == null
      ? "must name the M5c graph node that observes an unreviewed path"
      : undefined;
  }
  if (ownerAssignableStates.has(state)) {
    return node != null || owner === m5cUnassignedOwner
      ? undefined
      : `must be ${m5cUnassignedOwner} or a node: owner for a ${state} path`;
  }
  return `is not valid for state ${state}`;
}

function deriveInventory(
  inventoryText: string,
  manifest: M5cLedgerManifestInput,
): DerivedInventory {
  const inventory = parseM5cInventory(inventoryText);
  if (inventory.suiteRevision !== manifest.suiteRevision) {
    throw new Error(
      "test262 inventory and reviewed manifest revisions do not match.",
    );
  }
  const included = new Set(inventory.includedPaths);
  const reviewed = new Map<string, DerivedEntry>();
  for (const result of manifest.results) {
    const path = result.case.path;
    if (!included.has(path)) {
      throw new Error(
        `reviewed test262 path is outside the inventory: ${path}.`,
      );
    }
    if (reviewed.has(path)) {
      throw new Error(`reviewed test262 path is repeated: ${path}.`);
    }
    const unsupported = result.classification === "unsupported-profile-feature";
    const prerequisites = unsupported
      ? result.dependencies.toSorted(compareCodeUnits)
      : [];
    reviewed.set(path, {
      path,
      prerequisites,
      state: result.classification,
    });
  }
  const entries = [...included]
    .toSorted(compareCodeUnits)
    .map((path): DerivedEntry => {
      if (!pathPattern.test(path)) {
        throw new Error(`inventory path cannot be serialized: ${path}.`);
      }
      return (
        reviewed.get(path) ?? { path, prerequisites: [], state: "unreviewed" }
      );
    });
  return {
    byPath: new Map(entries.map((entry) => [entry.path, entry])),
    entries,
  };
}

/**
 * Derive the ledger from the inventory and manifest. A previous ledger
 * contributes only owners and notes: an owner survives when its path keeps
 * the same state and the owner is still valid, and a note survives while
 * its owner still owns a path.
 */
export function deriveM5cClosureLedger(
  inventoryText: string,
  manifest: M5cLedgerManifestInput,
  nodeIds: ReadonlySet<string>,
  previous?: M5cClosureLedger,
): M5cClosureLedger {
  const derived = deriveInventory(inventoryText, manifest);
  if (!nodeIds.has(m5cUnreviewedDefaultNode)) {
    throw new Error(
      `M5c graph needs node ${m5cUnreviewedDefaultNode} to own unreviewed ` +
        "paths.",
    );
  }
  const previousEntries = new Map(
    (previous?.entries ?? []).map((entry) => [entry.path, entry]),
  );
  const entries = derived.entries.map(
    ({ path, prerequisites, state }): M5cLedgerEntry => {
      const earlier = previousEntries.get(path);
      const owner =
        earlier != null &&
        earlier.state === state &&
        ownerProblem(state, earlier.owner, nodeIds) == null
          ? earlier.owner
          : defaultOwner(state);
      return { owner, path, prerequisites, state };
    },
  );
  const used = new Set(entries.map((entry) => entry.owner));
  const ownerNotes = new Map<string, string>();
  for (const owner of [...used].toSorted(compareCodeUnits)) {
    const note =
      previous?.ownerNotes.get(owner) ?? defaultOwnerNotes.get(owner);
    if (note != null) ownerNotes.set(owner, note);
  }
  return { entries, ownerNotes, suiteRevision: manifest.suiteRevision };
}

function countStates(
  entries: readonly { readonly state: M5cLedgerState }[],
): M5cLedgerStateCounts {
  const states = new Map<M5cLedgerState, number>(
    m5cLedgerStates.map((state) => [state, 0]),
  );
  let closedPaths = 0;
  for (const entry of entries) {
    states.set(entry.state, (states.get(entry.state) ?? 0) + 1);
    if (closedStates.has(entry.state)) closedPaths += 1;
  }
  return {
    closedPaths,
    inventoryPaths: entries.length,
    openPaths: entries.length - closedPaths,
    states,
  };
}

/** Count states and owners exactly as the header records them. */
export function summarizeM5cClosureLedger(
  ledger: M5cClosureLedger,
): M5cLedgerSummary {
  const owners = new Map<string, number>();
  for (const entry of ledger.entries) {
    owners.set(entry.owner, (owners.get(entry.owner) ?? 0) + 1);
  }
  return {
    ...countStates(ledger.entries),
    owners: new Map(
      [...owners.entries()].toSorted(([left], [right]) =>
        compareCodeUnits(left, right),
      ),
    ),
  };
}

function serializeEntry(entry: M5cLedgerEntry): string {
  const prerequisites =
    entry.state === "unsupported-profile-feature"
      ? `, [${entry.prerequisites.join(", ")}]`
      : "";
  return `  ${entry.path}: [${entry.state}, ${entry.owner}${prerequisites}]`;
}

/** Serialize a ledger in its canonical, line-per-path layout. */
export function serializeM5cClosureLedger(ledger: M5cClosureLedger): string {
  const summary = summarizeM5cClosureLedger(ledger);
  const owners: Record<string, { note?: string; paths: number }> = {};
  for (const [owner, paths] of summary.owners) {
    const note = ledger.ownerNotes.get(owner);
    owners[owner] = note == null ? { paths } : { note, paths };
  }
  const header = stringifyYaml(
    {
      version: ledgerVersion,
      suiteRevision: ledger.suiteRevision,
      inventoryPaths: summary.inventoryPaths,
      closedPaths: summary.closedPaths,
      openPaths: summary.openPaths,
      states: Object.fromEntries(summary.states),
      owners,
    },
    { lineWidth: 72 },
  );
  return [
    ...preamble,
    header.trimEnd(),
    "paths:",
    ...ledger.entries.map(serializeEntry),
    "",
  ].join("\n");
}

function countValue(value: StructuredDataInput, context: string): number {
  if (!isNumber(value) || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${context} must be a non-negative integer.`);
  }
  return value;
}

function requireExactKeys(
  value: StructuredDataRecord,
  expected: ReadonlySet<string>,
  context: string,
): void {
  const missing = [...expected].filter((key) => !(key in value));
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${context} keys differ: missing=${missing.join(",") || "none"} ` +
        `unexpected=${unexpected.join(",") || "none"}.`,
    );
  }
}

/**
 * Parse the ledger header and one entry per line. Duplicate paths are
 * rejected here, before YAML could silently keep only one of them.
 */
export function parseM5cClosureLedger(text: string): ParsedLedger {
  const lines = text.split("\n");
  const pathsLine = lines.indexOf("paths:");
  if (pathsLine < 0) {
    throw new Error("M5c closure ledger needs a paths: section.");
  }
  let headerValue: StructuredDataInput;
  try {
    // SAFETY: record and the checks below validate the parsed header.
    headerValue = parseYaml(
      lines.slice(0, pathsLine).join("\n"),
    ) as StructuredDataInput;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`M5c closure ledger header is malformed: ${detail}`, {
      cause: error,
    });
  }
  const header = record(headerValue, "M5c closure ledger header");
  requireExactKeys(header, headerKeys, "M5c closure ledger header");
  if (header.version !== ledgerVersion) {
    throw new Error(`M5c closure ledger version must be ${ledgerVersion}.`);
  }
  const suiteRevision = header.suiteRevision;
  if (!isString(suiteRevision) || suiteRevision.length === 0) {
    throw new Error("M5c closure ledger suiteRevision must be a string.");
  }
  const ownersRecord = record(header.owners, "M5c closure ledger owners");
  const ownerNotes = new Map<string, string>();
  for (const [owner, value] of Object.entries(ownersRecord)) {
    const context = `M5c closure ledger owner ${owner}`;
    const ownerRecord = record(value, context);
    const keys = "note" in ownerRecord ? ["note", "paths"] : ["paths"];
    requireExactKeys(ownerRecord, new Set(keys), context);
    countValue(ownerRecord.paths, `${context} paths`);
    if ("note" in ownerRecord) {
      const note = ownerRecord.note;
      if (!isString(note) || note.trim().length === 0) {
        throw new Error(`${context} note must be a non-empty string.`);
      }
      ownerNotes.set(owner, note);
    }
  }

  const entries: M5cLedgerEntry[] = [];
  const seen = new Set<string>();
  const body = lines.slice(pathsLine + 1);
  if (body.at(-1) === "") body.pop();
  for (const [offset, line] of body.entries()) {
    const context = `M5c closure ledger line ${pathsLine + offset + 2}`;
    const match = entryPattern.exec(line);
    if (match == null) {
      throw new Error(`${context} is not a canonical ledger entry.`);
    }
    const [, path = "", state = "", owner = "", tags] = match;
    if (!pathPattern.test(path)) {
      throw new Error(`${context} has a malformed path ${path}.`);
    }
    if (seen.has(path)) {
      throw new Error(`M5c closure ledger repeats path ${path}.`);
    }
    const previousPath = entries.at(-1)?.path;
    if (previousPath != null && compareCodeUnits(previousPath, path) > 0) {
      throw new Error(`${context} is not in code-unit path order.`);
    }
    seen.add(path);
    if (!isLedgerState(state)) {
      throw new Error(`${context} has unknown state ${state}.`);
    }
    const unsupported = state === "unsupported-profile-feature";
    if (unsupported !== (tags != null)) {
      throw new Error(
        `${context} must list prerequisites exactly when the state is ` +
          "unsupported-profile-feature.",
      );
    }
    const prerequisites =
      tags == null || tags.length === 0 ? [] : tags.split(", ");
    if (!prerequisites.every((tag) => tagPattern.test(tag))) {
      throw new Error(`${context} has a malformed prerequisite list.`);
    }
    entries.push({ owner, path, prerequisites, state });
  }
  return { header, ledger: { entries, ownerNotes, suiteRevision } };
}

/**
 * Compare recorded counts with counts regenerated from the manifest, so a
 * ledger left behind by a manifest change fails even if its rows were
 * edited to match.
 */
function validateHeaderCounts(
  header: StructuredDataRecord,
  expected: M5cLedgerStateCounts,
  owners: ReadonlyMap<string, number>,
): void {
  const context = "M5c closure ledger";
  for (const key of ["closedPaths", "inventoryPaths", "openPaths"] as const) {
    const recorded = countValue(header[key], `${context} ${key}`);
    if (recorded !== expected[key]) {
      throw new Error(
        `${context} ${key} is ${recorded} but the manifest derives ` +
          `${expected[key]}.`,
      );
    }
  }
  const states = record(header.states, `${context} states`);
  requireExactKeys(states, new Set(m5cLedgerStates), `${context} states`);
  for (const [state, count] of expected.states) {
    const recorded = countValue(states[state], `${context} state ${state}`);
    if (recorded !== count) {
      throw new Error(
        `${context} state ${state} is ${recorded} but the manifest derives ` +
          `${count}.`,
      );
    }
  }
  const recordedOwners = record(header.owners, `${context} owners`);
  requireExactKeys(recordedOwners, new Set(owners.keys()), `${context} owners`);
  for (const [owner, count] of owners) {
    const recorded = countValue(
      record(recordedOwners[owner], `${context} owner ${owner}`).paths,
      `${context} owner ${owner} paths`,
    );
    if (recorded !== count) {
      throw new Error(
        `${context} owner ${owner} paths is ${recorded} but entries ` +
          `record ${count}.`,
      );
    }
  }
}

/**
 * Validate a ledger against the inventory, the reviewed manifest, and the
 * graph's node IDs. Every included path must appear once with its derived
 * state and prerequisites, every owner must be valid for its state, the
 * header counts must match the manifest, and the text must be canonical.
 */
export function validateM5cClosureLedger(
  text: string,
  inventoryText: string,
  manifest: M5cLedgerManifestInput,
  nodeIds: ReadonlySet<string>,
): M5cLedgerSummary {
  const { header, ledger } = parseM5cClosureLedger(text);
  const derived = deriveInventory(inventoryText, manifest);
  if (ledger.suiteRevision !== manifest.suiteRevision) {
    throw new Error(
      `M5c closure ledger suiteRevision ${ledger.suiteRevision} differs ` +
        `from the manifest revision ${manifest.suiteRevision}.`,
    );
  }
  for (const entry of ledger.entries) {
    const expected = derived.byPath.get(entry.path);
    if (expected == null) {
      throw new Error(
        `M5c closure ledger path is outside the included inventory: ` +
          `${entry.path}.`,
      );
    }
    if (entry.state !== expected.state) {
      throw new Error(
        `M5c closure ledger records ${entry.path} as ${entry.state} but ` +
          `the manifest derives ${expected.state}.`,
      );
    }
    if (!sameStrings(entry.prerequisites, expected.prerequisites)) {
      throw new Error(
        `M5c closure ledger prerequisites for ${entry.path} differ from ` +
          `the manifest dependencies [${expected.prerequisites.join(", ")}].`,
      );
    }
    const problem = ownerProblem(entry.state, entry.owner, nodeIds);
    if (problem != null) {
      throw new Error(
        `M5c closure ledger owner ${entry.owner} of ${entry.path} ` +
          `${problem}.`,
      );
    }
  }
  const recorded = new Set(ledger.entries.map((entry) => entry.path));
  const missing = derived.entries
    .map((entry) => entry.path)
    .filter((path) => !recorded.has(path));
  if (missing.length > 0) {
    throw new Error(
      `M5c closure ledger omits ${missing.length} included paths, first ` +
        `${missing[0]}.`,
    );
  }
  const summary = summarizeM5cClosureLedger(ledger);
  validateHeaderCounts(header, countStates(derived.entries), summary.owners);
  if (serializeM5cClosureLedger(ledger) !== text) {
    throw new Error(
      "M5c closure ledger is not in canonical order or layout; run " +
        "`mise run m5c:closure-ledger:update`.",
    );
  }
  return summary;
}

/** Read the IDs of every checked-in M5c graph node. */
export function readCurrentM5cNodeIds(): ReadonlySet<string> {
  const absolute = join(repositoryRoot, m5cWorkGraphNodeDirectory);
  return new Set(
    readdirSync(absolute)
      .filter((name) => name.endsWith(".yaml"))
      .map((name) => name.slice(0, -".yaml".length)),
  );
}

function readCurrentInputs(): CurrentInputs {
  return {
    inventoryText: readFileSync(join(repositoryRoot, m5cInventoryPath), "utf8"),
    manifest: readCurrentM5cManifest(),
    nodeIds: readCurrentM5cNodeIds(),
  };
}

/** Validate the checked-in ledger against checked-in evidence. */
export function validateCurrentM5cClosureLedger(): M5cLedgerSummary {
  const { inventoryText, manifest, nodeIds } = readCurrentInputs();
  return validateM5cClosureLedger(
    readFileSync(join(repositoryRoot, m5cClosureLedgerPath), "utf8"),
    inventoryText,
    manifest,
    nodeIds,
  );
}

/** Regenerate the checked-in ledger, keeping still-valid owners and notes. */
export function updateCurrentM5cClosureLedger(): M5cLedgerSummary {
  const { inventoryText, manifest, nodeIds } = readCurrentInputs();
  const absolute = join(repositoryRoot, m5cClosureLedgerPath);
  const previous = existsSync(absolute)
    ? parseM5cClosureLedger(readFileSync(absolute, "utf8")).ledger
    : undefined;
  const ledger = deriveM5cClosureLedger(
    inventoryText,
    manifest,
    nodeIds,
    previous,
  );
  writeFileSync(absolute, serializeM5cClosureLedger(ledger));
  return validateCurrentM5cClosureLedger();
}

function describe(summary: M5cLedgerSummary): string {
  const states = [...summary.states]
    .map(([state, count]) => `${state}=${count}`)
    .join(" ");
  const owners = [...summary.owners]
    .map(([owner, count]) => `${owner}=${count}`)
    .join(" ");
  return (
    `paths=${summary.inventoryPaths} closed=${summary.closedPaths} ` +
    `open=${summary.openPaths}\nstates: ${states}\nowners: ${owners}`
  );
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  const update = process.argv.includes("--update");
  const summary = update
    ? updateCurrentM5cClosureLedger()
    : validateCurrentM5cClosureLedger();
  console.log(
    `m5c-closure-ledger ${update ? "updated" : "passed"} ` + describe(summary),
  );
}
