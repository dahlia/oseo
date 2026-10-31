import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { parse as parseYaml } from "yaml";

import type { Test262Summary } from "../packages/testkit/src/index.ts";
import {
  deriveM5cBaseline,
  m5cWorkGraphNodeDirectory,
  m5cWorkGraphPath,
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

test("M5c graph validates after targets and landed ordering", () => {
  for (const [after, overrides, message] of [
    [["missing-node"], {}, /after unknown node missing-node/u],
    [["closure-ledger"], {}, /after itself/u],
    [["Invalid_ID"], {}, /kebab-case node ID/u],
    [["bootstrap-graph", "bootstrap-graph"], {}, /must not repeat/u],
    [["m5-exit-audit", "bootstrap-graph"], {}, /must be sorted/u],
    [null, {}, /must be an array/u],
    [["m5-exit-audit"], { landed: true }, /landed but after target/u],
  ] as const) {
    assert.throws(
      () =>
        validateM5cWorkGraph(
          graphSource(),
          [
            bootstrap,
            exitAudit,
            nodeSource("closure-ledger", {
              after,
              ...overrides,
            }),
          ],
          baseline,
        ),
      message,
    );
  }
});

test("M5c graph rejects after-only and mixed dependency cycles", () => {
  for (const dependencies of [[], ["bootstrap-graph"]]) {
    assert.throws(
      () =>
        validateM5cWorkGraph(
          graphSource(),
          [
            nodeSource("bootstrap-graph", { after: ["closure-ledger"] }),
            nodeSource("closure-ledger", {
              after: dependencies.length === 0 ? ["bootstrap-graph"] : [],
              dependencies,
            }),
            exitAudit,
          ],
          baseline,
        ),
      /dependency cycle.*including after/u,
    );
  }
});

test("M5c graph waits for after targets without collision ancestry", () => {
  for (const landed of [false, true]) {
    const status = landed ? "ready" : "blocked";
    assert.deepEqual(
      validateM5cWorkGraph(
        graphSource({
          summary: {
            blocked: landed ? 1 : 2,
            landed: landed ? 1 : 0,
            nodes: 3,
            parked: 0,
            ready: landed ? 2 : 1,
          },
          collisions: [
            {
              nodes: ["bootstrap-graph", "closure-ledger"],
              note: "Publication still needs serialization.",
              path: "tests/test262/results.yaml",
            },
          ],
        }),
        [
          nodeSource("bootstrap-graph", { landed }),
          nodeSource("closure-ledger", { after: ["bootstrap-graph"], status }),
          nodeSource("m5-exit-audit", {
            dependencies: ["bootstrap-graph", "closure-ledger"],
            status: "blocked",
          }),
        ],
        baseline,
      ),
      {
        blocked: landed ? 1 : 2,
        landed: landed ? 1 : 0,
        nodes: 3,
        parked: 0,
        ready: landed ? 2 : 1,
      },
    );
  }
});

test("M5c graph rejects ready status while after is unlanded", () => {
  assert.throws(
    () =>
      validateM5cWorkGraph(
        graphSource(),
        [
          nodeSource("bootstrap-graph"),
          exitAudit,
          nodeSource("closure-ledger", { after: ["bootstrap-graph"] }),
        ],
        baseline,
      ),
    /and after targets make it blocked/u,
  );
});

test("M5c graph rejects an unparked node ordered after a parked node", () => {
  assert.throws(
    () =>
      validateM5cWorkGraph(
        graphSource(),
        [
          nodeSource("bootstrap-graph", {
            status: "parked",
            reason: "Pending.",
          }),
          exitAudit,
          nodeSource("closure-ledger", { after: ["bootstrap-graph"] }),
        ],
        baseline,
      ),
    /after parked node bootstrap-graph/u,
  );
});

test("M5c graph keeps after out of collision and exit ancestry", () => {
  const nodes = [
    bootstrap,
    nodeSource("closure-ledger", { after: ["bootstrap-graph"], landed: true }),
    nodeSource("m5-exit-audit", { dependencies: ["closure-ledger"] }),
  ];
  assert.throws(
    () => validateM5cWorkGraph(graphSource(), nodes, baseline),
    /bootstrap-graph is not on the m5-exit-audit path/u,
  );
  assert.deepEqual(
    validateM5cWorkGraph(
      graphSource({
        summary: { blocked: 1, landed: 2, nodes: 4, parked: 0, ready: 3 },
        collisions: [
          {
            nodes: ["bootstrap-graph", "publication-owner"],
            note: "Shared publication.",
            path: "tests/test262/results.yaml",
          },
        ],
      }),
      [
        bootstrap,
        nodeSource("closure-ledger", {
          after: ["bootstrap-graph"],
          landed: true,
        }),
        nodeSource("publication-owner", { dependencies: ["closure-ledger"] }),
        nodeSource("m5-exit-audit", {
          dependencies: ["bootstrap-graph", "publication-owner"],
          status: "blocked",
        }),
      ],
      baseline,
    ),
    { blocked: 1, landed: 2, nodes: 4, parked: 0, ready: 3 },
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
  const nodeDirectory = new URL(
    `../${m5cWorkGraphNodeDirectory}/`,
    import.meta.url,
  );
  assert.equal(
    summary.nodes,
    readdirSync(nodeDirectory).filter((path) => path.endsWith(".yaml")).length,
  );
  assert.equal(summary.ready + summary.blocked + summary.parked, summary.nodes);
  // Landing marks change this count without changing the graph's shape.
  assert.ok(summary.landed >= 97);
  assert.equal(summary.parked, 0);
  assert.equal(summary.nodes, 140);
  assert.equal(summary.ready, 136);
  assert.equal(summary.blocked, 4);
  const array = readImportAttributesNode(
    "ordinary-array-indexed-lookup-performance",
  );
  assert.equal(array.landed, true);
  assert.equal(array.status, "ready");
  assert.deepEqual(array.dependencies, ["unsupported-ownership-audit"]);
  assert.ok(
    readImportAttributesNode("m5-exit-audit").dependencies.includes(array.id),
  );
});

interface NodeContract extends PublicationNode {
  readonly delivers: string;
  readonly status: string;
}

function readImportAttributesNode(id: string): NodeContract {
  // SAFETY: the contract test first validates every graph node's shape.
  return parseYaml(
    readFileSync(
      new URL(`../docs/m5c-graph/nodes/${id}.yaml`, import.meta.url),
      "utf8",
    ),
  ) as NodeContract;
}

test("import attribute accounting retains its bounded graph contract", () => {
  validateCurrentM5cWorkGraph();
  const owner = readImportAttributesNode(
    "import-attributes-dynamic-coverage-remediation",
  );
  assert.equal(owner.landed, true);
  assert.equal(owner.status, "ready");
  assert.deepEqual(owner.dependencies, ["dynamic-import", "import-attributes"]);
  assert.match(owner.delivers, /exactly the 64 pinned/u);
  assert.match(owner.delivers, /under the\s+accepted ADR 0016 boundary/u);
  assert.match(owner.delivers, /counts none as a pass/u);
  assert.match(owner.delivers, /does not widen the existing/u);
  const reservation = readImportAttributesNode("observation-batch-31");
  assert.equal(reservation.landed, false);
  assert.equal(reservation.status, "ready");
  assert.deepEqual(reservation.dependencies, [
    "dynamic-import",
    "import-attributes",
    "observation-batch-plan",
  ]);
  assert.match(reservation.delivers, /zero remaining unreviewed/u);
  const prerequisite = readImportAttributesNode("import-attributes");
  assert.deepEqual(prerequisite.dependencies, ["observation-batch-plan"]);
  assert.match(prerequisite.delivers, /static import attributes and JSON/u);
  assert.match(prerequisite.delivers, /89 unreviewed/u);
  assert.match(prerequisite.delivers, /remain rejected under ADR 0016/u);
  assert.equal(prerequisite.status, "ready");
});

interface PublicationNode {
  readonly after?: readonly string[];
  readonly id: string;
  readonly dependencies: readonly string[];
  readonly landed: boolean;
}

interface PublicationGraph {
  readonly collisions: readonly {
    readonly path: string;
    readonly nodes: readonly string[];
  }[];
}

test("independent M5c manifest publishers declare their collisions", () => {
  // Validate shapes and acyclicity before this independent pair audit.
  validateCurrentM5cWorkGraph();
  const nodeDirectory = new URL(
    `../${m5cWorkGraphNodeDirectory}/`,
    import.meta.url,
  );
  const nodes = readdirSync(nodeDirectory)
    .filter((path) => path.endsWith(".yaml"))
    .map(
      (path) =>
        // SAFETY: validateCurrentM5cWorkGraph() checked each node's shape.
        parseYaml(
          readFileSync(new URL(path, nodeDirectory), "utf8"),
        ) as PublicationNode,
    );
  const byId = new Map(nodes.map((node) => [node.id, node]));
  // SAFETY: validateCurrentM5cWorkGraph() checked collision shapes.
  const graph = parseYaml(
    readFileSync(new URL(`../${m5cWorkGraphPath}`, import.meta.url), "utf8"),
  ) as PublicationGraph;
  const collisions = graph.collisions.filter(
    (group) => group.path === "tests/test262/results.yaml",
  );
  // These source-only contracts inspect or propose work without
  // publishing observations. New source-only nodes need a bounded exemption.
  const sourceOnly = new Set([
    "dynamic-import-staged-plan",
    "m5-exit-audit",
    "remediation-work-graph",
  ]);
  const publishers = nodes.filter(
    (node) => !node.landed && !sourceOnly.has(node.id),
  );
  const ancestors = new Map<string, ReadonlySet<string>>();
  for (const node of publishers) {
    const seen = new Set<string>();
    const pending = [...node.dependencies];
    for (const dependency of pending) {
      if (seen.has(dependency)) continue;
      seen.add(dependency);
      const target = byId.get(dependency);
      assert.ok(target, `missing dependency ${dependency}`);
      pending.push(...target.dependencies);
    }
    ancestors.set(node.id, seen);
  }
  for (const [index, left] of publishers.entries()) {
    for (const right of publishers.slice(index + 1)) {
      if (
        ancestors.get(left.id)?.has(right.id) ||
        ancestors.get(right.id)?.has(left.id)
      ) {
        continue;
      }
      assert.ok(
        collisions.some(
          (group) =>
            group.nodes.includes(left.id) && group.nodes.includes(right.id),
        ),
        `missing manifest collision: ${left.id}, ${right.id}`,
      );
    }
  }
});

interface Batch11PrerequisiteNode extends PublicationNode {
  readonly delivers: string;
  readonly status: "blocked" | "parked" | "ready";
}

/** Extract the exact upstream selectors from a bounded node contract. */
function deliveredPaths(node: Batch11PrerequisiteNode): readonly string[] {
  return [...new Set(node.delivers.match(/test\/[^\s,]+\.js/gu))].toSorted();
}

test("class accessor prerequisites retain their bounded paths", () => {
  validateCurrentM5cWorkGraph();
  const readNode = (id: string): Batch11PrerequisiteNode =>
    // SAFETY: graph validation checked each parsed node's shape.
    parseYaml(
      readFileSync(
        new URL(`../${m5cWorkGraphNodeDirectory}/${id}.yaml`, import.meta.url),
        "utf8",
      ),
    ) as Batch11PrerequisiteNode;
  const classifierId = "annexb-legacy-lookup-dependency-classification";
  const coverageId = "class-private-accessor-lookup-coverage-remediation";
  const earlyErrorId = "class-duplicate-constructor-early-error";
  const classifier = readNode(classifierId);
  const coverage = readNode(coverageId);
  const earlyError = readNode(earlyErrorId);
  const accessorPaths = [
    "test/language/expressions/class/elements/" +
      "private-getter-is-not-a-own-property.js",
    "test/language/expressions/class/elements/" +
      "private-setter-is-not-a-own-property.js",
  ];
  assert.deepEqual(deliveredPaths(classifier), accessorPaths);
  assert.deepEqual(deliveredPaths(coverage), [
    ...accessorPaths,
    ...accessorPaths.map((path) =>
      path.replace("/expressions/", "/statements/"),
    ),
  ]);
  assert.deepEqual(deliveredPaths(earlyError), [
    "test/language/expressions/class/elements/syntax/early-errors/" +
      "grammar-class-body-ctor-duplicate.js",
  ]);
  assert.deepEqual(classifier.dependencies, ["authorized-exclusion-audit"]);
  assert.deepEqual(coverage.dependencies, [classifierId]);
  assert.deepEqual(earlyError.dependencies, []);
  assert.equal(coverage.status, classifier.landed ? "ready" : "blocked");
  assert.deepEqual(readNode("observation-batch-11").dependencies, [
    classifierId,
    earlyErrorId,
    "observation-batch-plan",
  ]);
  const exitDependencies = readNode("m5-exit-audit").dependencies;
  assert.ok(exitDependencies.includes(coverageId));
  assert.ok(exitDependencies.includes(earlyErrorId));
  // The existing pair audit includes all three publishers without exemption.
});

test("the with optional-call receiver defect stays on the exit path", () => {
  validateCurrentM5cWorkGraph();
  const readNode = (id: string): NodeContract =>
    // SAFETY: graph validation checked each parsed node's shape.
    parseYaml(
      readFileSync(
        new URL(`../${m5cWorkGraphNodeDirectory}/${id}.yaml`, import.meta.url),
        "utf8",
      ),
    ) as NodeContract;
  const remediationId = "with-optional-call-receiver";
  const remediation = readNode(remediationId);
  // GetBindingValue order comes from eval-intrinsic-value, and strict
  // tail-position optional calls run under proper-tail-calls. The
  // 2026-10-28 split delivers the repair through the two child nodes.
  const nonTailId = "with-optional-call-receiver-non-tail";
  const tailId = "with-optional-call-receiver-tail";
  const prerequisites = [
    "eval-intrinsic-value",
    "proper-tail-calls",
    nonTailId,
    tailId,
  ].map(readNode);
  assert.deepEqual(
    remediation.dependencies,
    prerequisites.map((node) => node.id),
  );
  const nonTail = readNode(nonTailId);
  const tail = readNode(tailId);
  assert.deepEqual(nonTail.dependencies, ["eval-intrinsic-value"]);
  assert.deepEqual(tail.dependencies, ["proper-tail-calls", nonTailId]);
  assert.match(tail.delivers, /strict tail-position\s+optional calls/u);
  for (const child of [nonTail, tail]) {
    assert.match(child.delivers, /Owns no manifest path/u);
    assert.match(child.delivers, /or an exclusion/u);
    assert.ok(readNode("m5-exit-audit").dependencies.includes(child.id));
  }
  assert.equal(
    remediation.status,
    prerequisites.every((node) => node.landed) ? "ready" : "blocked",
  );
  assert.match(remediation.delivers, /strict tail-position optional calls/u);
  assert.match(
    remediation.delivers,
    /docs\/m5c-graph\/with-optional-call-receiver\.md/u,
  );
  assert.match(remediation.delivers, /owns no\s+manifest path/u);
  assert.match(remediation.delivers, /not an eval source\s+evaluation/u);
  assert.match(remediation.delivers, /or an exclusion/u);
  assert.ok(readNode("m5-exit-audit").dependencies.includes(remediationId));
});

test("computed member key order owns its Reference contract", () => {
  validateCurrentM5cWorkGraph();
  const readNode = (id: string): Batch11PrerequisiteNode =>
    // SAFETY: graph validation checked each parsed node's shape.
    parseYaml(
      readFileSync(
        new URL(`../${m5cWorkGraphNodeDirectory}/${id}.yaml`, import.meta.url),
        "utf8",
      ),
    ) as Batch11PrerequisiteNode;
  const ownerId = "computed-member-reference-key-order";
  const compoundId = "compound-member-assignment-key-order";
  const owner = readNode(ownerId);
  const compound = readNode(compoundId);
  assert.deepEqual(owner.dependencies, [compoundId]);
  assert.equal(owner.status, compound.landed ? "ready" : "blocked");
  assert.match(owner.delivers, /one semantic unit/u);
  assert.match(owner.delivers, /docs\/m5c-graph\/computed-member-reference/u);
  assert.match(owner.delivers, /Claim\s+no test262 pass in advance/u);
  // The owner never selects upstream paths; each batch admits its own.
  assert.deepEqual(deliveredPaths(owner), []);
  for (const batchId of [
    "observation-batch-08",
    "observation-batch-14",
    "observation-batch-16",
  ]) {
    const batch = readNode(batchId);
    assert.ok(batch.dependencies.includes(ownerId), batchId);
    if (!owner.landed) assert.equal(batch.status, "blocked", batchId);
  }
  assert.ok(readNode("m5-exit-audit").dependencies.includes(ownerId));
});

test("observation train retains bounded remediation dependencies", () => {
  validateCurrentM5cWorkGraph();
  // The first three landed in the 2026-10-29 remediation publication, so
  // their batches could admit the paths these nodes owned;
  // with-var-loop-head-resolution landed in the 2026-10-30 bundle.
  const landedRemediations = new Set([
    "dynamic-import-early-error-precedence",
    "module-namespace-uninitialized-bindings",
    "test262-module-harness-globals",
    "with-var-loop-head-resolution",
  ]);
  const exit = readImportAttributesNode("m5-exit-audit");
  for (const id of [
    "array-generated-property-cost-remediation",
    "dynamic-import-early-error-precedence",
    "module-namespace-uninitialized-bindings",
    "test262-module-harness-globals",
    "with-var-loop-head-resolution",
  ]) {
    const node = readImportAttributesNode(id);
    assert.equal(node.landed, landedRemediations.has(id), id);
    assert.equal(node.status, "ready");
    assert.deepEqual(node.dependencies, ["unsupported-ownership-audit"]);
    assert.ok(exit.dependencies.includes(id), id);
  }
  for (const [id, prerequisites] of [
    [
      "observation-batch-20",
      [
        "module-namespace-uninitialized-bindings",
        "test262-module-harness-globals",
      ],
    ],
    ["observation-batch-30", ["dynamic-import-early-error-precedence"]],
  ] as const) {
    const batch = readImportAttributesNode(id);
    // Landed with the B20/B30 residual rows after their remediations.
    assert.equal(batch.landed, true);
    assert.equal(batch.status, "ready");
    for (const prerequisite of prerequisites) {
      assert.ok(batch.dependencies.includes(prerequisite), prerequisite);
    }
  }
});

test("dynamic-source selection waits for its observation batches", () => {
  validateCurrentM5cWorkGraph();
  // Every batch named in after has landed, so the ordering edge no longer
  // holds either node back.
  for (const [id, batches] of [
    ["dynamic-source-module-semantics", [20, 30]],
    ["dynamic-source-unknown-eval", [19, 20, 30]],
  ] as const) {
    const node = readImportAttributesNode(id);
    assert.deepEqual(
      node.after,
      batches.map((batch) => `observation-batch-${batch}`),
    );
    assert.equal(node.status, "ready");
    assert.equal(node.landed, true);
  }
});
