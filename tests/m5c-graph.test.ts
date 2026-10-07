import assert from "node:assert/strict";
import test from "node:test";

import type { Test262Summary } from "../packages/testkit/src/index.ts";
import {
  deriveM5cBaseline,
  m5cWorkGraphNodeDirectory,
  validateCurrentM5cWorkGraph,
  validateM5cWorkGraph,
} from "../tools/m5c-graph.ts";
import type {
  M5cBaseline,
  M5cManifestInput,
  M5cWorkGraphSource,
} from "../tools/m5c-graph.ts";
import type { StructuredDataRecord } from "../tools/structured-data.ts";

const baseline: M5cBaseline = {
  expectedNegatives: 1,
  harnessFailures: 0,
  infrastructureFailures: 0,
  inventoryPaths: 3,
  passes: 1,
  reviewedPaths: 2,
  semanticFailures: 0,
  suiteRevision: "abc123",
  unreviewedPaths: 1,
  unsupportedProfileFeatures: 0,
};

function nodeSource(
  id: string,
  overrides: Readonly<StructuredDataRecord> = {},
): M5cWorkGraphSource {
  return {
    path: `${m5cWorkGraphNodeDirectory}/${id}.yaml`,
    text: JSON.stringify({
      delivers: "One result.",
      dependencies: [],
      id,
      landed: false,
      status: "ready",
      title: "Sample",
      version: 1,
      ...overrides,
    }),
  };
}

const bootstrap = nodeSource("bootstrap-graph", { landed: true });
const ledger = nodeSource("closure-ledger", {
  dependencies: ["bootstrap-graph"],
});
const exitAudit = nodeSource("m5-exit-audit", {
  dependencies: ["closure-ledger"],
  status: "blocked",
});

function graphSource(
  overrides: Readonly<StructuredDataRecord> = {},
): M5cWorkGraphSource {
  return {
    path: "docs/m5c-graph/graph.yaml",
    text: JSON.stringify({
      baseline,
      checkpoint: "M5c",
      collisions: [],
      serializationPoints: [
        { note: "Shared state.", path: "docs/m5c-closure/ledger.yaml" },
      ],
      summary: { blocked: 1, landed: 1, nodes: 3, parked: 0, ready: 2 },
      usage: "Take an unlanded ready node.",
      version: 1,
      ...overrides,
    }),
  };
}

test("M5c graph accepts one complete exit path", () => {
  assert.deepEqual(
    validateM5cWorkGraph(
      graphSource(),
      [bootstrap, exitAudit, ledger],
      baseline,
    ),
    { blocked: 1, landed: 1, nodes: 3, parked: 0, ready: 2 },
  );
});

test("M5c graph rejects a stale evidence baseline", () => {
  assert.throws(
    () =>
      validateM5cWorkGraph(
        graphSource({ baseline: { ...baseline, reviewedPaths: 1 } }),
        [bootstrap, exitAudit, ledger],
        baseline,
      ),
    /reviewedPaths is 1 but current evidence is 2/u,
  );
});

test("M5c graph rejects an unknown dependency", () => {
  assert.throws(
    () =>
      validateM5cWorkGraph(
        graphSource(),
        [
          bootstrap,
          nodeSource("closure-ledger", {
            dependencies: ["missing-node"],
            status: "blocked",
          }),
          exitAudit,
        ],
        baseline,
      ),
    /depends on unknown node missing-node/u,
  );
});

test("M5c graph rejects a dependency cycle", () => {
  assert.throws(
    () =>
      validateM5cWorkGraph(
        graphSource({
          summary: {
            blocked: 3,
            landed: 0,
            nodes: 3,
            parked: 0,
            ready: 0,
          },
        }),
        [
          nodeSource("bootstrap-graph", {
            dependencies: ["m5-exit-audit"],
            status: "blocked",
          }),
          nodeSource("closure-ledger", {
            dependencies: ["bootstrap-graph"],
            status: "blocked",
          }),
          nodeSource("m5-exit-audit", {
            dependencies: ["closure-ledger"],
            status: "blocked",
          }),
        ],
        baseline,
      ),
    /dependency cycle/u,
  );
});

test("M5c graph rejects a status that dependencies do not support", () => {
  assert.throws(
    () =>
      validateM5cWorkGraph(
        graphSource(),
        [
          bootstrap,
          nodeSource("closure-ledger", {
            dependencies: ["bootstrap-graph"],
            status: "blocked",
          }),
          exitAudit,
        ],
        baseline,
      ),
    /records status blocked but dependencies make it ready/u,
  );
});

test("M5c graph rejects a collision between ordered nodes", () => {
  assert.throws(
    () =>
      validateM5cWorkGraph(
        graphSource({
          collisions: [
            {
              nodes: ["bootstrap-graph", "closure-ledger"],
              note: "Same file.",
              path: "docs/m5c-closure/ledger.yaml",
            },
          ],
        }),
        [bootstrap, exitAudit, ledger],
        baseline,
      ),
    /already depends on bootstrap-graph/u,
  );
});

test("M5c graph rejects a node outside the exit path", () => {
  assert.throws(
    () =>
      validateM5cWorkGraph(
        graphSource({
          summary: {
            blocked: 1,
            landed: 1,
            nodes: 4,
            parked: 0,
            ready: 3,
          },
        }),
        [bootstrap, exitAudit, ledger, nodeSource("orphan-audit")],
        baseline,
      ),
    /orphan-audit is not on the m5-exit-audit path/u,
  );
});

test("M5c graph rejects a landed exit with unreviewed paths", () => {
  assert.throws(
    () =>
      validateM5cWorkGraph(
        graphSource({
          summary: {
            blocked: 0,
            landed: 3,
            nodes: 3,
            parked: 0,
            ready: 3,
          },
        }),
        [
          bootstrap,
          nodeSource("closure-ledger", {
            dependencies: ["bootstrap-graph"],
            landed: true,
          }),
          nodeSource("m5-exit-audit", {
            dependencies: ["closure-ledger"],
            landed: true,
          }),
        ],
        baseline,
      ),
    /cannot land with 1 unreviewed paths/u,
  );
});

test("M5c graph rejects a landed parked node", () => {
  assert.throws(
    () =>
      validateM5cWorkGraph(
        graphSource(),
        [
          nodeSource("bootstrap-graph", {
            landed: true,
            reason: "A decision is pending.",
            status: "parked",
          }),
          exitAudit,
          ledger,
        ],
        baseline,
      ),
    /is parked and cannot be landed/u,
  );
});

test("M5c graph rejects an unparked dependent of a parked node", () => {
  assert.throws(
    () =>
      validateM5cWorkGraph(
        graphSource(),
        [
          nodeSource("bootstrap-graph", {
            reason: "A decision is pending.",
            status: "parked",
          }),
          exitAudit,
          nodeSource("closure-ledger", {
            dependencies: ["bootstrap-graph"],
            status: "blocked",
          }),
        ],
        baseline,
      ),
    /depends on parked node bootstrap-graph/u,
  );
});

test("M5c graph rejects a landed node with an unlanded dependency", () => {
  assert.throws(
    () =>
      validateM5cWorkGraph(
        graphSource(),
        [
          nodeSource("bootstrap-graph"),
          exitAudit,
          nodeSource("closure-ledger", {
            dependencies: ["bootstrap-graph"],
            landed: true,
            status: "blocked",
          }),
        ],
        baseline,
      ),
    /is landed but dependency bootstrap-graph is not/u,
  );
});

const manifestSummary: Test262Summary = {
  dependencies: [],
  expectedNegatives: 1,
  groups: [],
  harnessFailures: 0,
  infrastructureFailures: 0,
  passes: 1,
  semanticFailures: 0,
  unsupportedProfileFeatures: 0,
};

const manifest: M5cManifestInput = {
  results: [
    { case: { path: "test/a.js" }, classification: "pass" },
    {
      case: { path: "test/b.js" },
      classification: "expected-negative",
    },
  ],
  suiteRevision: "abc123",
  summary: manifestSummary,
};

const inventory = [
  "# format-version: 1",
  "# suite-revision: abc123",
  "# included: 3",
  "path\tboundary\tbasis",
  "test/a.js\tincluded\treviewed",
  "test/b.js\tincluded\treviewed",
  "test/c.js\tincluded\tunreviewed",
  "",
].join("\n");

test("M5c baseline partitions reviewed and unreviewed paths", () => {
  assert.deepEqual(deriveM5cBaseline(inventory, manifest), baseline);
});

test("M5c baseline rejects reviewed paths outside the inventory", () => {
  assert.throws(
    () =>
      deriveM5cBaseline(inventory, {
        ...manifest,
        results: [
          { case: { path: "test/outside.js" }, classification: "pass" },
        ],
        summary: { ...manifestSummary, expectedNegatives: 0 },
      }),
    /outside the inventory/u,
  );
});

test("M5c baseline rejects mismatched suite revisions", () => {
  assert.throws(
    () =>
      deriveM5cBaseline(inventory, {
        ...manifest,
        suiteRevision: "different",
      }),
    /revisions do not match/u,
  );
});

test("the checked-in M5c work graph is valid", () => {
  const summary = validateCurrentM5cWorkGraph();
  assert.equal(summary.nodes, 68);
  // Landing marks change this count without changing the graph's shape.
  assert.ok(summary.landed >= 2);
  assert.equal(summary.parked, 5);
});
