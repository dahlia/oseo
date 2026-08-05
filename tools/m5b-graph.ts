import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

const repositoryRoot = resolve(fileURLToPath(import.meta.url), "../..");

/** The checked-in graph document, holding everything not owned by a node. */
export const workGraphPath = "docs/m5b-graph/graph.yaml";

/** The directory holding one YAML record per work-graph node. */
export const workGraphNodeDirectory = "docs/m5b-graph/nodes";

/** The pinned applicable-test inventory a node's recorded counts must match. */
export const workGraphInventoryPath = "tests/test262/inventory.tsv";

/** The upstream root every node's inventory selectors must partition. */
export const workGraphCoveredRoot = "test/built-ins/";

/**
 * The upstream roots a node's inventory selector may name at all.
 *
 * Only {@link workGraphCoveredRoot} is checked for completeness, because the
 * built-in surface is what M5b partitions. A selector outside these roots is
 * rejected rather than silently accepted: without this, a mistyped selector
 * claims paths no completeness rule covers, and the recorded count still
 * matches whatever it happened to select.
 */
export const workGraphSelectableRoots: readonly string[] = [
  workGraphCoveredRoot,
  "test/language/global-code/",
];

/** Authored admission state of one work-graph node. */
export type WorkGraphStatus = "blocked" | "parked" | "ready";

/** One YAML document read from the checked-in work graph. */
export interface WorkGraphSource {
  readonly path: string;
  readonly text: string;
}

/** One node's claim on the applicable-test inventory. */
export interface WorkGraphInventory {
  readonly included: number;
  readonly roots: readonly string[];
}

/** One work item an implementation session can take. */
export interface WorkGraphNode {
  readonly delivers: string;
  readonly dependencies: readonly string[];
  readonly id: string;
  readonly inventory: WorkGraphInventory | null;
  readonly landed: boolean;
  readonly reason: string | null;
  readonly status: WorkGraphStatus;
  readonly title: string;
}

/** Counts derived from one complete work graph. */
export interface WorkGraphSummary {
  readonly blocked: number;
  readonly includedPaths: number;
  readonly nodes: number;
  readonly parked: number;
  readonly ready: number;
}

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

function booleanValue(value: unknown, context: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
  }
  return value;
}

function countValue(value: unknown, context: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${context} must be a non-negative integer.`);
  }
  return value as number;
}

function nodeId(value: unknown, context: string): string {
  const id = stringValue(value, context);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) {
    throw new Error(`${context} must be a kebab-case node ID.`);
  }
  return id;
}

function sortedUniqueStrings(
  value: unknown,
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
  const sorted = values.toSorted();
  if (values.some((entry, index) => entry !== sorted[index])) {
    throw new Error(`${context} must be sorted.`);
  }
  return values;
}

function parseSource(source: WorkGraphSource, context: string): unknown {
  try {
    return parseYaml(source.text) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${context} is malformed YAML: ${detail}`, {
      cause: error,
    });
  }
}

/**
 * Expand one inventory selector against the included upstream paths.
 *
 * A selector ending in a slash selects everything beneath a directory. A
 * selector ending in `/*.js` selects only the files directly inside it, which
 * is how a family's own tests are separated from its member directories.
 */
export function selectInventoryPaths(
  selector: string,
  includedPaths: readonly string[],
  context: string,
): readonly string[] {
  if (!workGraphSelectableRoots.some((root) => selector.startsWith(root))) {
    throw new Error(
      `${context} must start with one of ` +
        `${workGraphSelectableRoots.join(", ")}: ${selector}.`,
    );
  }
  if (selector.includes("//") || selector.split("/").includes("..")) {
    throw new Error(`${context} must be a normalized path: ${selector}.`);
  }
  if (selector.endsWith("/*.js")) {
    const directory = `${selector.slice(0, -"*.js".length)}`;
    return includedPaths.filter(
      (path) =>
        path.startsWith(directory) &&
        path.endsWith(".js") &&
        !path.slice(directory.length).includes("/"),
    );
  }
  if (!selector.endsWith("/")) {
    throw new Error(`${context} must end with / or /*.js: ${selector}.`);
  }
  return includedPaths.filter((path) => path.startsWith(selector));
}

function parseInventory(
  value: unknown,
  context: string,
  includedPaths: readonly string[],
  claimed: Map<string, string>,
  id: string,
): WorkGraphInventory {
  const entry = record(value, context);
  requireExactKeys(entry, new Set(["included", "roots"]), context);
  const roots = sortedUniqueStrings(entry.roots, `${context} roots`);
  let included = 0;
  for (const root of roots) {
    const selected = selectInventoryPaths(root, includedPaths, context);
    if (selected.length === 0) {
      throw new Error(`${context} root selects no included path: ${root}.`);
    }
    for (const path of selected) {
      const owner = claimed.get(path);
      if (owner != null) {
        throw new Error(
          `${context} claims ${path}, already claimed by ${owner}.`,
        );
      }
      claimed.set(path, id);
      included += 1;
    }
  }
  const recorded = countValue(entry.included, `${context} included`);
  if (recorded !== included) {
    throw new Error(
      `${context} records ${recorded} included paths but selects ${included}.`,
    );
  }
  return { included, roots };
}

function parseNode(
  source: WorkGraphSource,
  includedPaths: readonly string[],
  claimed: Map<string, string>,
): WorkGraphNode {
  const context = `work graph node ${source.path}`;
  const value = record(parseSource(source, context), context);
  const parked = value.status === "parked";
  const optional = "inventory" in value ? ["inventory"] : [];
  requireExactKeys(
    value,
    new Set([
      "delivers",
      "dependencies",
      "id",
      "landed",
      "status",
      "title",
      "version",
      ...optional,
      ...(parked ? ["reason"] : []),
    ]),
    context,
  );
  if (value.version !== 1) {
    throw new Error(`${context} version must be 1.`);
  }
  const id = nodeId(value.id, `${context} id`);
  if (source.path !== `${workGraphNodeDirectory}/${id}.yaml`) {
    throw new Error(`${context} filename does not match ID ${id}.`);
  }
  const dependencies =
    Array.isArray(value.dependencies) && value.dependencies.length === 0
      ? []
      : sortedUniqueStrings(value.dependencies, `${context} dependencies`);
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
  if (parked && landed) {
    throw new Error(`${context} is parked and cannot be landed.`);
  }
  return {
    delivers: stringValue(value.delivers, `${context} delivers`),
    dependencies,
    id,
    inventory:
      "inventory" in value
        ? parseInventory(
            value.inventory,
            `${context} inventory`,
            includedPaths,
            claimed,
            id,
          )
        : null,
    landed,
    reason: parked ? stringValue(value.reason, `${context} reason`) : null,
    status,
    title: stringValue(value.title, `${context} title`),
  };
}

/**
 * Report every node reachable from each node through dependency edges.
 *
 * The traversal also proves acyclicity, because a node that reaches itself
 * would let the orchestrator start work whose prerequisite can never land.
 */
function transitiveDependencies(
  nodes: ReadonlyMap<string, WorkGraphNode>,
): ReadonlyMap<string, ReadonlySet<string>> {
  const resolved = new Map<string, ReadonlySet<string>>();
  const visiting = new Set<string>();
  const visit = (id: string, trail: readonly string[]): ReadonlySet<string> => {
    const cached = resolved.get(id);
    if (cached != null) return cached;
    if (visiting.has(id)) {
      const cycle = [...trail.slice(trail.indexOf(id)), id].join(" -> ");
      throw new Error(`work graph has a dependency cycle: ${cycle}.`);
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

function parseGraphDocument(
  source: WorkGraphSource,
  nodes: ReadonlyMap<string, WorkGraphNode>,
  reachable: ReadonlyMap<string, ReadonlySet<string>>,
  summary: WorkGraphSummary,
): void {
  const context = `work graph ${source.path}`;
  const value = record(parseSource(source, context), context);
  requireExactKeys(
    value,
    new Set([
      "backlog",
      "checkpoint",
      "collisions",
      "serializationPoints",
      "summary",
      "usage",
      "version",
    ]),
    context,
  );
  if (value.version !== 1) {
    throw new Error(`${context} version must be 1.`);
  }
  stringValue(value.checkpoint, `${context} checkpoint`);
  stringValue(value.usage, `${context} usage`);

  const recorded = record(value.summary, `${context} summary`);
  requireExactKeys(
    recorded,
    new Set(["blocked", "nodes", "parked", "ready"]),
    `${context} summary`,
  );
  for (const key of ["blocked", "nodes", "parked", "ready"] as const) {
    const count = countValue(recorded[key], `${context} summary ${key}`);
    if (count !== summary[key]) {
      throw new Error(
        `${context} summary ${key} is ${count} but the nodes report ` +
          `${summary[key]}.`,
      );
    }
  }

  if (!Array.isArray(value.serializationPoints)) {
    throw new Error(`${context} serializationPoints must be an array.`);
  }
  for (const [index, entry] of value.serializationPoints.entries()) {
    const pointContext = `${context} serialization point ${index}`;
    const point = record(entry, pointContext);
    requireExactKeys(point, new Set(["note", "path"]), pointContext);
    stringValue(point.note, `${pointContext} note`);
    stringValue(point.path, `${pointContext} path`);
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
    const members = sortedUniqueStrings(group.nodes, `${groupContext} nodes`);
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
              `${right}; a collision is only advisory between unordered nodes.`,
          );
        }
      }
    }
  }

  if (!Array.isArray(value.backlog) || value.backlog.length === 0) {
    throw new Error(`${context} backlog must be a non-empty array.`);
  }
  const backlogIds = new Set<string>();
  for (const [index, entry] of value.backlog.entries()) {
    const itemContext = `${context} backlog item ${index}`;
    const item = record(entry, itemContext);
    requireExactKeys(
      item,
      new Set(["delivers", "id", "independent", "title"]),
      itemContext,
    );
    const id = nodeId(item.id, `${itemContext} id`);
    if (backlogIds.has(id)) {
      throw new Error(`${itemContext} repeats backlog ID ${id}.`);
    }
    if (nodes.has(id)) {
      throw new Error(`${itemContext} reuses graph node ID ${id}.`);
    }
    backlogIds.add(id);
    stringValue(item.delivers, `${itemContext} delivers`);
    stringValue(item.independent, `${itemContext} independent`);
    stringValue(item.title, `${itemContext} title`);
  }
}

/** Validate the complete checked-in M5b work graph. */
export function validateWorkGraph(
  graphSource: WorkGraphSource,
  nodeSources: readonly WorkGraphSource[],
  includedPaths: readonly string[],
): WorkGraphSummary {
  if (nodeSources.length === 0) {
    throw new Error("work graph must contain at least one node.");
  }
  const claimed = new Map<string, string>();
  const nodes = new Map<string, WorkGraphNode>();
  for (const source of nodeSources) {
    const node = parseNode(source, includedPaths, claimed);
    if (nodes.has(node.id)) {
      throw new Error(`work graph repeats node ID ${node.id}.`);
    }
    nodes.set(node.id, node);
  }

  for (const node of nodes.values()) {
    const context = `work graph node ${node.id}`;
    for (const dependency of node.dependencies) {
      const target = nodes.get(dependency);
      if (target == null) {
        throw new Error(`${context} depends on unknown node ${dependency}.`);
      }
      if (target.status === "parked" && node.status !== "parked") {
        throw new Error(
          `${context} depends on parked node ${dependency}; a parked ` +
            "prerequisite can never make it ready.",
        );
      }
      if (node.landed && !target.landed) {
        throw new Error(
          `${context} is landed but its dependency ${dependency} is not.`,
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
        `work graph node ${node.id} records status ${node.status} but its ` +
          `dependencies make it ${expected}.`,
      );
    }
  }

  const unclaimed = includedPaths.filter(
    (path) => path.startsWith(workGraphCoveredRoot) && !claimed.has(path),
  );
  if (unclaimed.length > 0) {
    throw new Error(
      `work graph leaves ${unclaimed.length} included built-in paths ` +
        `unclaimed, starting with ${unclaimed[0]}.`,
    );
  }

  const summary: WorkGraphSummary = {
    blocked: [...nodes.values()].filter((n) => n.status === "blocked").length,
    includedPaths: claimed.size,
    nodes: nodes.size,
    parked: [...nodes.values()].filter((n) => n.status === "parked").length,
    ready: [...nodes.values()].filter((n) => n.status === "ready").length,
  };
  parseGraphDocument(graphSource, nodes, reachable, summary);
  return summary;
}

/** Read the included upstream paths from the pinned inventory. */
export function parseIncludedInventoryPaths(text: string): readonly string[] {
  return text
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.split("\t"))
    .filter((columns) => columns[1] === "included")
    .map((columns) => columns[0] as string);
}

function readNodeSources(): readonly WorkGraphSource[] {
  const absolute = join(repositoryRoot, workGraphNodeDirectory);
  return readdirSync(absolute, { encoding: "utf8", withFileTypes: true })
    .map((entry) => {
      if (!entry.isFile() || !entry.name.endsWith(".yaml")) {
        throw new Error(
          `${workGraphNodeDirectory}/${entry.name} is not a node record.`,
        );
      }
      const path = `${workGraphNodeDirectory}/${entry.name}`;
      return { path, text: readFileSync(join(repositoryRoot, path), "utf8") };
    })
    .toSorted((left, right) => left.path.localeCompare(right.path));
}

/** Validate and summarize the current worktree's M5b work graph. */
export function validateCurrentWorkGraph(): WorkGraphSummary {
  const graphSource: WorkGraphSource = {
    path: workGraphPath,
    text: readFileSync(join(repositoryRoot, workGraphPath), "utf8"),
  };
  const includedPaths = parseIncludedInventoryPaths(
    readFileSync(join(repositoryRoot, workGraphInventoryPath), "utf8"),
  );
  return validateWorkGraph(graphSource, readNodeSources(), includedPaths);
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  const summary = validateCurrentWorkGraph();
  console.log(
    `m5b-graph passed nodes=${summary.nodes} ready=${summary.ready} ` +
      `blocked=${summary.blocked} parked=${summary.parked} ` +
      `paths=${summary.includedPaths}`,
  );
}
