import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  Test262Classification,
  Test262Summary,
} from "../packages/testkit/src/index.ts";
import { parse as parseYaml } from "yaml";

import { parseReviewedManifest } from "./test262-manifest.ts";
import type {
  StructuredDataInput,
  StructuredDataRecord,
} from "./structured-data.ts";
import { parsedObject as record } from "./structured-data.ts";
import { isBoolean, isNumber, isString } from "./value-kinds.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Checked-in M5c graph document. */
export const m5cWorkGraphPath = "docs/m5c-graph/graph.yaml";

/** Directory containing one checked-in record per M5c work node. */
export const m5cWorkGraphNodeDirectory = "docs/m5c-graph/nodes";

const inventoryPath = "tests/test262/inventory.tsv";
const resultsPath = "tests/test262/results.yaml";
const exitNodeId = "m5-exit-audit";
const baselineKeys: readonly (keyof M5cBaseline)[] = [
  "expectedNegatives",
  "harnessFailures",
  "infrastructureFailures",
  "inventoryPaths",
  "passes",
  "reviewedPaths",
  "semanticFailures",
  "suiteRevision",
  "unreviewedPaths",
  "unsupportedProfileFeatures",
];

/** Source text and repository path for one graph document. */
export interface M5cWorkGraphSource {
  readonly path: string;
  readonly text: string;
}

/** Minimal reviewed-manifest surface needed to derive the M5c baseline. */
export interface M5cManifestInput {
  readonly results: readonly {
    readonly case: { readonly path: string };
    readonly classification: Test262Classification;
  }[];
  readonly suiteRevision: string;
  readonly summary: Test262Summary;
}

/** Exact inventory and reviewed-result snapshot pinned by the graph. */
export interface M5cBaseline {
  readonly expectedNegatives: number;
  readonly harnessFailures: number;
  readonly infrastructureFailures: number;
  readonly inventoryPaths: number;
  readonly passes: number;
  readonly reviewedPaths: number;
  readonly semanticFailures: number;
  readonly suiteRevision: string;
  readonly unreviewedPaths: number;
  readonly unsupportedProfileFeatures: number;
}

interface M5cWorkGraphNode {
  readonly dependencies: readonly string[];
  readonly id: string;
  readonly landed: boolean;
  readonly status: "blocked" | "parked" | "ready";
}

/** Counts derived from all checked-in M5c nodes. */
export interface M5cWorkGraphSummary {
  readonly blocked: number;
  readonly landed: number;
  readonly nodes: number;
  readonly parked: number;
  readonly ready: number;
}

interface InventorySnapshot {
  readonly includedPaths: readonly string[];
  readonly suiteRevision: string;
}

function requireExactKeys(
  value: StructuredDataRecord,
  expected: ReadonlySet<string>,
  context: string,
): void {
  const actual = Object.keys(value);
  const missing = [...expected].filter((key) => !(key in value));
  const unexpected = actual.filter((key) => !expected.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${context} keys differ: missing=${missing.join(",") || "none"} ` +
        `unexpected=${unexpected.join(",") || "none"}.`,
    );
  }
}

function stringValue(value: StructuredDataInput, context: string): string {
  if (!isString(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty string.`);
  }
  return value;
}

function booleanValue(value: StructuredDataInput, context: string): boolean {
  if (!isBoolean(value)) {
    throw new Error(`${context} must be a boolean.`);
  }
  return value;
}

function countValue(value: StructuredDataInput, context: string): number {
  if (!isNumber(value) || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${context} must be a non-negative integer.`);
  }
  return value;
}

function nodeId(value: StructuredDataInput, context: string): string {
  const id = stringValue(value, context);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) {
    throw new Error(`${context} must be a kebab-case node ID.`);
  }
  return id;
}

function sortedUniqueStrings(
  value: StructuredDataInput,
  context: string,
  allowEmpty: boolean,
): readonly string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    const qualifier = allowEmpty ? "an array" : "a non-empty array";
    throw new Error(`${context} must be ${qualifier}.`);
  }
  const values = value.map((entry, index) =>
    stringValue(entry, `${context} entry ${index}`),
  );
  if (new Set(values).size !== values.length) {
    throw new Error(`${context} must not repeat values.`);
  }
  const sorted = values.toSorted();
  if (values.some((entry, index) => entry !== sorted[index])) {
    throw new Error(`${context} must be sorted.`);
  }
  return values;
}

function parseSource(
  source: M5cWorkGraphSource,
  context: string,
): StructuredDataRecord {
  let value: StructuredDataInput;
  try {
    // SAFETY: record validates the complete parsed YAML tree below.
    value = parseYaml(source.text) as StructuredDataInput;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${context} is malformed YAML: ${detail}`, {
      cause: error,
    });
  }
  return record(value, context);
}

function parseInventory(text: string): InventorySnapshot {
  const headers = new Map<string, string>();
  const paths = new Set<string>();
  const includedPaths: string[] = [];
  let sawColumnHeader = false;
  for (const [index, line] of text.split("\n").entries()) {
    if (line.length === 0) continue;
    if (line.startsWith("# ")) {
      const match = /^# ([a-z-]+): (.+)$/u.exec(line);
      if (match != null) {
        const [, key, value] = match;
        if (key == null || value == null) continue;
        if (headers.has(key)) {
          throw new Error(`test262 inventory repeats header ${key}.`);
        }
        headers.set(key, value);
      }
      continue;
    }
    if (line === "path\tboundary\tbasis") {
      if (sawColumnHeader || paths.size > 0) {
        throw new Error("test262 inventory column header is misplaced.");
      }
      sawColumnHeader = true;
      continue;
    }
    if (!sawColumnHeader) {
      throw new Error("test262 inventory needs its column header.");
    }
    const columns = line.split("\t");
    const path = columns[0];
    const disposition = columns[1];
    if (
      path == null ||
      path.length === 0 ||
      (disposition !== "included" && disposition !== "excluded")
    ) {
      throw new Error(`test262 inventory line ${index + 1} is invalid.`);
    }
    if (paths.has(path)) {
      throw new Error(`test262 inventory repeats path ${path}.`);
    }
    paths.add(path);
    if (disposition === "included") includedPaths.push(path);
  }
  const suiteRevision = headers.get("suite-revision");
  if (suiteRevision == null || suiteRevision.length === 0) {
    throw new Error("test262 inventory needs a suite-revision header.");
  }
  const recordedIncluded = Number(headers.get("included"));
  if (
    !Number.isSafeInteger(recordedIncluded) ||
    recordedIncluded !== includedPaths.length
  ) {
    throw new Error(
      "test262 inventory included header does not match its rows.",
    );
  }
  if (!sawColumnHeader) {
    throw new Error("test262 inventory needs its column header.");
  }
  return { includedPaths, suiteRevision };
}

/** Derive the exact M5c baseline from the inventory and reviewed manifest. */
export function deriveM5cBaseline(
  inventoryText: string,
  manifest: M5cManifestInput,
): M5cBaseline {
  const inventory = parseInventory(inventoryText);
  if (inventory.suiteRevision !== manifest.suiteRevision) {
    throw new Error(
      "test262 inventory and reviewed manifest revisions do not match.",
    );
  }
  const included = new Set(inventory.includedPaths);
  const reviewed = new Set<string>();
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
    reviewed.add(path);
  }
  const summary = manifest.summary;
  const classified =
    summary.expectedNegatives +
    summary.harnessFailures +
    summary.infrastructureFailures +
    summary.passes +
    summary.semanticFailures +
    summary.unsupportedProfileFeatures;
  if (classified !== reviewed.size) {
    throw new Error(
      "reviewed test262 classification counts do not match the path count.",
    );
  }
  return {
    expectedNegatives: summary.expectedNegatives,
    harnessFailures: summary.harnessFailures,
    infrastructureFailures: summary.infrastructureFailures,
    inventoryPaths: included.size,
    passes: summary.passes,
    reviewedPaths: reviewed.size,
    semanticFailures: summary.semanticFailures,
    suiteRevision: manifest.suiteRevision,
    unreviewedPaths: included.size - reviewed.size,
    unsupportedProfileFeatures: summary.unsupportedProfileFeatures,
  };
}

function parseNode(source: M5cWorkGraphSource): M5cWorkGraphNode {
  const context = `M5c work graph node ${source.path}`;
  const value = parseSource(source, context);
  const parked = value.status === "parked";
  requireExactKeys(
    value,
    new Set([
      "delivers",
      "dependencies",
      "id",
      "landed",
      ...(parked ? ["reason"] : []),
      "status",
      "title",
      "version",
    ]),
    context,
  );
  if (value.version !== 1) {
    throw new Error(`${context} version must be 1.`);
  }
  const id = nodeId(value.id, `${context} id`);
  if (source.path !== `${m5cWorkGraphNodeDirectory}/${id}.yaml`) {
    throw new Error(`${context} filename does not match ID ${id}.`);
  }
  const dependencies = sortedUniqueStrings(
    value.dependencies,
    `${context} dependencies`,
    true,
  );
  for (const [index, dependency] of dependencies.entries()) {
    nodeId(dependency, `${context} dependency ${index}`);
    if (dependency === id) {
      throw new Error(`${context} depends on itself.`);
    }
  }
  const status = stringValue(value.status, `${context} status`);
  if (status !== "blocked" && status !== "parked" && status !== "ready") {
    throw new Error(`${context} has unknown status ${status}.`);
  }
  const landed = booleanValue(value.landed, `${context} landed`);
  if (parked) {
    stringValue(value.reason, `${context} reason`);
    if (landed) {
      throw new Error(`${context} is parked and cannot be landed.`);
    }
  }
  stringValue(value.delivers, `${context} delivers`);
  stringValue(value.title, `${context} title`);
  return { dependencies, id, landed, status };
}

function transitiveDependencies(
  nodes: ReadonlyMap<string, M5cWorkGraphNode>,
): ReadonlyMap<string, ReadonlySet<string>> {
  const resolved = new Map<string, ReadonlySet<string>>();
  const visiting = new Set<string>();
  const visit = (id: string, trail: readonly string[]): ReadonlySet<string> => {
    const cached = resolved.get(id);
    if (cached != null) return cached;
    if (visiting.has(id)) {
      const cycle = [...trail.slice(trail.indexOf(id)), id].join(" -> ");
      throw new Error(`M5c work graph has a dependency cycle: ${cycle}.`);
    }
    visiting.add(id);
    const reachable = new Set<string>();
    for (const dependency of nodes.get(id)?.dependencies ?? []) {
      reachable.add(dependency);
      for (const nested of visit(dependency, [...trail, id])) {
        reachable.add(nested);
      }
    }
    visiting.delete(id);
    resolved.set(id, reachable);
    return reachable;
  };
  for (const id of nodes.keys()) visit(id, []);
  return resolved;
}

function parseBaseline(
  value: StructuredDataInput,
  context: string,
): M5cBaseline {
  const baseline = record(value, context);
  requireExactKeys(baseline, new Set(baselineKeys), context);
  return {
    expectedNegatives: countValue(
      baseline.expectedNegatives,
      `${context} expectedNegatives`,
    ),
    harnessFailures: countValue(
      baseline.harnessFailures,
      `${context} harnessFailures`,
    ),
    infrastructureFailures: countValue(
      baseline.infrastructureFailures,
      `${context} infrastructureFailures`,
    ),
    inventoryPaths: countValue(
      baseline.inventoryPaths,
      `${context} inventoryPaths`,
    ),
    passes: countValue(baseline.passes, `${context} passes`),
    reviewedPaths: countValue(
      baseline.reviewedPaths,
      `${context} reviewedPaths`,
    ),
    semanticFailures: countValue(
      baseline.semanticFailures,
      `${context} semanticFailures`,
    ),
    suiteRevision: stringValue(
      baseline.suiteRevision,
      `${context} suiteRevision`,
    ),
    unreviewedPaths: countValue(
      baseline.unreviewedPaths,
      `${context} unreviewedPaths`,
    ),
    unsupportedProfileFeatures: countValue(
      baseline.unsupportedProfileFeatures,
      `${context} unsupportedProfileFeatures`,
    ),
  };
}

function validateBaseline(
  recorded: M5cBaseline,
  actual: M5cBaseline,
  context: string,
): void {
  for (const key of baselineKeys) {
    if (recorded[key] !== actual[key]) {
      throw new Error(
        `${context} ${key} is ${recorded[key]} but current evidence is ` +
          `${actual[key]}.`,
      );
    }
  }
  if (
    recorded.reviewedPaths + recorded.unreviewedPaths !==
    recorded.inventoryPaths
  ) {
    throw new Error(`${context} does not partition the inventory.`);
  }
  if (
    recorded.semanticFailures !== 0 ||
    recorded.harnessFailures !== 0 ||
    recorded.infrastructureFailures !== 0
  ) {
    throw new Error(`${context} records a failure classification.`);
  }
}

function validateGraphDocument(
  source: M5cWorkGraphSource,
  nodes: ReadonlyMap<string, M5cWorkGraphNode>,
  reachable: ReadonlyMap<string, ReadonlySet<string>>,
  summary: M5cWorkGraphSummary,
  actualBaseline: M5cBaseline,
): void {
  const context = `M5c work graph ${source.path}`;
  const value = parseSource(source, context);
  requireExactKeys(
    value,
    new Set([
      "baseline",
      "checkpoint",
      "collisions",
      "serializationPoints",
      "summary",
      "usage",
      "version",
    ]),
    context,
  );
  if (value.version !== 1 || value.checkpoint !== "M5c") {
    throw new Error(`${context} must describe version 1 of checkpoint M5c.`);
  }
  stringValue(value.usage, `${context} usage`);
  validateBaseline(
    parseBaseline(value.baseline, `${context} baseline`),
    actualBaseline,
    `${context} baseline`,
  );

  const recordedSummary = record(value.summary, `${context} summary`);
  requireExactKeys(
    recordedSummary,
    new Set(["blocked", "landed", "nodes", "parked", "ready"]),
    `${context} summary`,
  );
  for (const key of [
    "blocked",
    "landed",
    "nodes",
    "parked",
    "ready",
  ] as const) {
    const count = countValue(recordedSummary[key], `${context} summary ${key}`);
    if (count !== summary[key]) {
      throw new Error(
        `${context} summary ${key} is ${count} but nodes report ` +
          `${summary[key]}.`,
      );
    }
  }

  if (
    !Array.isArray(value.serializationPoints) ||
    value.serializationPoints.length === 0
  ) {
    throw new Error(`${context} serializationPoints must be non-empty.`);
  }
  const serializationPaths = new Set<string>();
  for (const [index, entry] of value.serializationPoints.entries()) {
    const pointContext = `${context} serialization point ${index}`;
    const point = record(entry, pointContext);
    requireExactKeys(point, new Set(["note", "path"]), pointContext);
    stringValue(point.note, `${pointContext} note`);
    const path = stringValue(point.path, `${pointContext} path`);
    if (serializationPaths.has(path)) {
      throw new Error(`${context} repeats serialization point ${path}.`);
    }
    serializationPaths.add(path);
  }

  if (!Array.isArray(value.collisions)) {
    throw new Error(`${context} collisions must be an array.`);
  }
  for (const [index, entry] of value.collisions.entries()) {
    const groupContext = `${context} collision ${index}`;
    const group = record(entry, groupContext);
    requireExactKeys(group, new Set(["nodes", "note", "path"]), groupContext);
    stringValue(group.note, `${groupContext} note`);
    stringValue(group.path, `${groupContext} path`);
    const members = sortedUniqueStrings(
      group.nodes,
      `${groupContext} nodes`,
      false,
    );
    if (members.length < 2) {
      throw new Error(`${groupContext} must name at least two nodes.`);
    }
    for (const member of members) {
      if (!nodes.has(member)) {
        throw new Error(`${groupContext} names unknown node ${member}.`);
      }
    }
    for (const left of members) {
      for (const right of members) {
        if (left === right) continue;
        if (reachable.get(left)?.has(right) === true) {
          throw new Error(
            `${groupContext} lists ${left}, which already depends on ` +
              `${right}.`,
          );
        }
      }
    }
  }
}

/** Validate an M5c graph against its exact evidence baseline. */
export function validateM5cWorkGraph(
  graphSource: M5cWorkGraphSource,
  nodeSources: readonly M5cWorkGraphSource[],
  actualBaseline: M5cBaseline,
): M5cWorkGraphSummary {
  if (nodeSources.length === 0) {
    throw new Error("M5c work graph must contain at least one node.");
  }
  const nodes = new Map<string, M5cWorkGraphNode>();
  for (const source of nodeSources) {
    const node = parseNode(source);
    if (nodes.has(node.id)) {
      throw new Error(`M5c work graph repeats node ID ${node.id}.`);
    }
    nodes.set(node.id, node);
  }
  for (const node of nodes.values()) {
    const context = `M5c work graph node ${node.id}`;
    for (const dependency of node.dependencies) {
      const target = nodes.get(dependency);
      if (target == null) {
        throw new Error(`${context} depends on unknown node ${dependency}.`);
      }
      if (target.status === "parked" && node.status !== "parked") {
        throw new Error(
          `${context} depends on parked node ${dependency}; an unparked ` +
            "node cannot become ready.",
        );
      }
      if (node.landed && !target.landed) {
        throw new Error(
          `${context} is landed but dependency ${dependency} is not.`,
        );
      }
    }
  }
  const reachable = transitiveDependencies(nodes);
  for (const node of nodes.values()) {
    if (node.status === "parked") continue;
    const expected = node.dependencies.every(
      (dependency) => nodes.get(dependency)?.landed === true,
    )
      ? "ready"
      : "blocked";
    if (node.status !== expected) {
      throw new Error(
        `M5c work graph node ${node.id} records status ${node.status} but ` +
          `dependencies make it ${expected}.`,
      );
    }
  }
  const exitNode = nodes.get(exitNodeId);
  if (exitNode == null) {
    throw new Error(`M5c work graph needs terminal node ${exitNodeId}.`);
  }
  const exitDependencies = reachable.get(exitNodeId) ?? new Set<string>();
  for (const id of nodes.keys()) {
    if (id !== exitNodeId && !exitDependencies.has(id)) {
      throw new Error(
        `M5c work graph node ${id} is not on the ${exitNodeId} path.`,
      );
    }
  }
  if (exitNode.landed && actualBaseline.unreviewedPaths !== 0) {
    throw new Error(
      `${exitNodeId} cannot land with ` +
        `${actualBaseline.unreviewedPaths} unreviewed paths.`,
    );
  }
  const summary: M5cWorkGraphSummary = {
    blocked: [...nodes.values()].filter((node) => node.status === "blocked")
      .length,
    landed: [...nodes.values()].filter((node) => node.landed).length,
    nodes: nodes.size,
    parked: [...nodes.values()].filter((node) => node.status === "parked")
      .length,
    ready: [...nodes.values()].filter((node) => node.status === "ready").length,
  };
  validateGraphDocument(graphSource, nodes, reachable, summary, actualBaseline);
  return summary;
}

function readNodeSources(): readonly M5cWorkGraphSource[] {
  const absolute = join(repositoryRoot, m5cWorkGraphNodeDirectory);
  return readdirSync(absolute, { encoding: "utf8", withFileTypes: true })
    .map((entry) => {
      if (!entry.isFile() || !entry.name.endsWith(".yaml")) {
        throw new Error(
          `${m5cWorkGraphNodeDirectory}/${entry.name} is not a node record.`,
        );
      }
      const path = `${m5cWorkGraphNodeDirectory}/${entry.name}`;
      return { path, text: readFileSync(join(repositoryRoot, path), "utf8") };
    })
    .toSorted((left, right) => left.path.localeCompare(right.path));
}

/** Derive the current M5c baseline from checked-in evidence. */
export function deriveCurrentM5cBaseline(): M5cBaseline {
  const absoluteResults = join(repositoryRoot, resultsPath);
  const indexText = readFileSync(absoluteResults, "utf8");
  const manifest = parseReviewedManifest(indexText, (path) =>
    readFileSync(join(repositoryRoot, "tests/test262", path), "utf8"),
  );
  return deriveM5cBaseline(
    readFileSync(join(repositoryRoot, inventoryPath), "utf8"),
    manifest,
  );
}

/** Validate and summarize the checked-in M5c graph. */
export function validateCurrentM5cWorkGraph(): M5cWorkGraphSummary {
  const graphSource = {
    path: m5cWorkGraphPath,
    text: readFileSync(join(repositoryRoot, m5cWorkGraphPath), "utf8"),
  };
  return validateM5cWorkGraph(
    graphSource,
    readNodeSources(),
    deriveCurrentM5cBaseline(),
  );
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  const baseline = deriveCurrentM5cBaseline();
  const summary = validateCurrentM5cWorkGraph();
  console.log(
    `m5c-graph passed nodes=${summary.nodes} ready=${summary.ready} ` +
      `blocked=${summary.blocked} parked=${summary.parked} ` +
      `landed=${summary.landed} reviewed=${baseline.reviewedPaths} ` +
      `unreviewed=${baseline.unreviewedPaths}`,
  );
}
