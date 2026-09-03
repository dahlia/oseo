import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  compatibilityRatchetOverridesPath,
  createReviewedEvidenceSnapshot,
  findAddedRatchetOverrides,
  ratchetOverridesAtRevision,
  reviewedEvidenceAtRevision,
  reviewedSubsetPath,
  resolveCompatibilityBaseline,
  selectCurrentBaselineIntent,
} from "./compatibility-ratchet.ts";
import type {
  RatchetOverride,
  ReviewedEvidenceSnapshot,
} from "./compatibility-ratchet.ts";
import {
  parseIncludedInventoryPaths,
  readCurrentWorkGraphNodes,
  selectInventoryPaths,
  workGraphInventoryPath,
} from "./m5b-graph.ts";

const repositoryRoot = resolve(fileURLToPath(import.meta.url), "../..");
const absent = "absent";
const present = "present";

/** The inventory fields needed to enforce one M5b node's evidence scope. */
export interface M5bNodeScopeNode {
  readonly id: string;
  readonly inventory: {
    readonly roots: readonly string[];
  } | null;
}

/** Inputs for one baseline-relative M5b node-scope comparison. */
export interface M5bNodeScopeInputs {
  readonly baseline: ReviewedEvidenceSnapshot;
  readonly baselineOverridesText: string;
  readonly current: ReviewedEvidenceSnapshot;
  readonly currentOverridesText: string;
  readonly includedPaths: readonly string[];
  readonly nodeId: string | undefined;
  readonly nodes: readonly M5bNodeScopeNode[];
}

type ReviewedChangeKind =
  | "expected-classification"
  | "subset-addition"
  | "subset-removal";

interface ReviewedChange {
  readonly from: string;
  readonly kind: ReviewedChangeKind;
  readonly path: string;
  readonly to: string;
}

interface InventoryScopes {
  readonly nodes: ReadonlyMap<string, ReadonlySet<string> | null>;
  readonly owners: ReadonlyMap<string, string>;
}

function inventoryScopes(
  nodes: readonly M5bNodeScopeNode[],
  includedPaths: readonly string[],
): InventoryScopes {
  const scopes = new Map<string, ReadonlySet<string> | null>();
  const owners = new Map<string, string>();
  for (const node of nodes) {
    if (scopes.has(node.id)) {
      throw new Error(`M5b node scope repeats node ${node.id}.`);
    }
    if (node.inventory == null) {
      scopes.set(node.id, null);
      continue;
    }
    const paths = new Set<string>();
    for (const root of node.inventory.roots) {
      const selected = selectInventoryPaths(
        root,
        includedPaths,
        `M5b node ${node.id} inventory`,
      );
      for (const path of selected) {
        const owner = owners.get(path);
        if (owner != null) {
          throw new Error(
            `M5b inventory path ${path} is owned by ${owner} and ${node.id}.`,
          );
        }
        owners.set(path, node.id);
        paths.add(path);
      }
    }
    scopes.set(node.id, paths);
  }
  return { nodes: scopes, owners };
}

function reviewedChanges(
  baseline: ReviewedEvidenceSnapshot,
  current: ReviewedEvidenceSnapshot,
): readonly ReviewedChange[] {
  const changes: ReviewedChange[] = [];
  for (const path of current.subsetPaths) {
    if (!baseline.subsetPaths.has(path)) {
      changes.push({
        from: absent,
        kind: "subset-addition",
        path,
        to: present,
      });
    }
  }
  for (const path of baseline.subsetPaths) {
    if (!current.subsetPaths.has(path)) {
      changes.push({ from: present, kind: "subset-removal", path, to: absent });
    }
  }
  for (const path of baseline.subsetPaths) {
    if (!current.subsetPaths.has(path)) continue;
    const from = baseline.expectedClassifications.get(path);
    const to = current.expectedClassifications.get(path);
    if (from == null || to == null || from === to) continue;
    changes.push({ from, kind: "expected-classification", path, to });
  }
  return changes.toSorted((left, right) =>
    `${left.path}\0${left.kind}`.localeCompare(`${right.path}\0${right.kind}`),
  );
}

function isPromotion(change: ReviewedChange): boolean {
  return change.kind === "expected-classification" && change.to === "pass";
}

function describeChange(change: ReviewedChange): string {
  const label =
    change.kind === "expected-classification"
      ? "expectedClassification"
      : "subset path";
  return (
    `${label} ${JSON.stringify(change.from)} -> ` + JSON.stringify(change.to)
  );
}

function describeOwner(
  path: string,
  owners: ReadonlyMap<string, string>,
): string {
  const owner = owners.get(path);
  return owner == null ? "no M5b node owns it" : `owned by node ${owner}`;
}

function describeOverride(override: RatchetOverride): string {
  return (
    `${override.invariant} ${JSON.stringify(override.scope)} ` +
    `${JSON.stringify(override.from)} -> ${JSON.stringify(override.to)}`
  );
}

function namedNodeFailures(
  nodeId: string,
  changes: readonly ReviewedChange[],
  scopes: InventoryScopes,
): readonly string[] {
  if (!scopes.nodes.has(nodeId)) {
    throw new Error(`OSEO_M5B_NODE names unknown node ${nodeId}.`);
  }
  const paths = scopes.nodes.get(nodeId);
  return changes
    .filter((change) => {
      if (paths == null) return true;
      return !paths.has(change.path) && !isPromotion(change);
    })
    .map((change) => {
      const scope =
        paths == null
          ? `node ${nodeId} has no inventory block`
          : `outside node ${nodeId}'s inventory roots`;
      return (
        `${change.path}: ${describeChange(change)} is ${scope}; ` +
        `${describeOwner(change.path, scopes.owners)}. Report the finding ` +
        "instead of editing this reviewed row."
      );
    });
}

/**
 * Reject reviewed evidence changes outside a named node's directional scope.
 *
 * The check is a worker guard and enforces nothing unless `OSEO_M5B_NODE`
 * names the node the change belongs to. Without that name there is no
 * ownership claim to measure a change against, and the coordinator merging
 * nodes, regenerating the manifest, or recording a reversal legitimately
 * changes reviewed rows that no single node owns.
 *
 * Promotions remain allowed outside the node because inventory roots assign
 * test paths, not the implementation causes that can make those tests pass.
 */
export function checkM5bNodeScope(inputs: M5bNodeScopeInputs): void {
  const nodeId = inputs.nodeId;
  if (nodeId == null || nodeId.length === 0) return;
  const scopes = inventoryScopes(inputs.nodes, inputs.includedPaths);
  const changes = reviewedChanges(inputs.baseline, inputs.current);
  const failures = namedNodeFailures(nodeId, changes, scopes);
  const overrideFailures = findAddedRatchetOverrides(
    inputs.baselineOverridesText,
    inputs.currentOverridesText,
  ).map(
    (override) =>
      `ratchet override added: ${describeOverride(override)}. An override ` +
      "records a deliberate reversal and is the coordinator's decision. " +
      "Report the finding instead of editing the override file.",
  );
  const allFailures = [...failures, ...overrideFailures];
  if (allFailures.length > 0) {
    throw new Error(`M5b node-scope check failed:\n${allFailures.join("\n")}`);
  }
}

function main(): void {
  const intent = selectCurrentBaselineIntent();
  if (intent.kind === "skip") return;
  const revision = resolveCompatibilityBaseline(intent);
  if (revision == null) {
    throw new Error("M5b node-scope baseline selection produced no commit.");
  }
  const includedPaths = parseIncludedInventoryPaths(
    readFileSync(join(repositoryRoot, workGraphInventoryPath), "utf8"),
  );
  checkM5bNodeScope({
    baseline: reviewedEvidenceAtRevision(revision),
    baselineOverridesText: ratchetOverridesAtRevision(revision),
    current: createReviewedEvidenceSnapshot(
      readFileSync(join(repositoryRoot, reviewedSubsetPath), "utf8"),
    ),
    currentOverridesText: readFileSync(
      join(repositoryRoot, compatibilityRatchetOverridesPath),
      "utf8",
    ),
    includedPaths,
    nodeId: process.env.OSEO_M5B_NODE,
    nodes: readCurrentWorkGraphNodes(),
  });
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  main();
}
