import assert from "node:assert/strict";
import test from "node:test";

import {
  parseIncludedInventoryPaths,
  selectInventoryPaths,
  validateCurrentWorkGraph,
  validateWorkGraph,
  workGraphNodeDirectory,
} from "../tools/m5b-graph.ts";
import type { WorkGraphSource } from "../tools/m5b-graph.ts";

const includedPaths = [
  "test/built-ins/Sample/length.js",
  "test/built-ins/Sample/prototype/name.js",
  "test/language/statements/sample.js",
];

function nodeSource(
  overrides: Readonly<Record<string, unknown>>,
  id: string,
): WorkGraphSource {
  return {
    path: `${workGraphNodeDirectory}/${id}.yaml`,
    text: JSON.stringify({
      delivers: "One sentence.",
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

function graphSource(
  overrides: Readonly<Record<string, unknown>> = {},
): WorkGraphSource {
  return {
    path: "docs/m5b-graph/graph.yaml",
    text: JSON.stringify({
      backlog: [
        {
          delivers: "One sentence.",
          id: "spare-work",
          independent: "It touches nothing a node owns.",
          title: "Spare work",
        },
      ],
      checkpoint: "M5b",
      collisions: [],
      serializationPoints: [],
      summary: { blocked: 1, nodes: 2, parked: 0, ready: 1 },
      usage: "Take a ready node.",
      version: 1,
      ...overrides,
    }),
  };
}

const rootNode = nodeSource(
  {
    inventory: {
      included: 1,
      roots: ["test/built-ins/Sample/*.js"],
    },
  },
  "root-node",
);

const leafNode = nodeSource(
  {
    dependencies: ["root-node"],
    inventory: {
      included: 1,
      roots: ["test/built-ins/Sample/prototype/"],
    },
    status: "blocked",
  },
  "leaf-node",
);

test("m5b graph accepts a complete two-node partition", () => {
  const summary = validateWorkGraph(
    graphSource(),
    [leafNode, rootNode],
    includedPaths,
  );
  assert.deepEqual(summary, {
    blocked: 1,
    includedPaths: 2,
    nodes: 2,
    parked: 0,
    ready: 1,
  });
});

test("m5b graph rejects an unknown dependency ID", () => {
  assert.throws(
    () =>
      validateWorkGraph(
        graphSource({ summary: { blocked: 1, nodes: 2, parked: 0, ready: 1 } }),
        [
          nodeSource(
            {
              dependencies: ["missing-node"],
              inventory: {
                included: 1,
                roots: ["test/built-ins/Sample/prototype/"],
              },
              status: "blocked",
            },
            "leaf-node",
          ),
          rootNode,
        ],
        includedPaths,
      ),
    /depends on unknown node missing-node/u,
  );
});

test("m5b graph rejects a dependency cycle", () => {
  assert.throws(
    () =>
      validateWorkGraph(
        graphSource({ summary: { blocked: 2, nodes: 2, parked: 0, ready: 0 } }),
        [
          nodeSource(
            {
              dependencies: ["leaf-node"],
              inventory: {
                included: 1,
                roots: ["test/built-ins/Sample/*.js"],
              },
              status: "blocked",
            },
            "root-node",
          ),
          nodeSource(
            {
              dependencies: ["root-node"],
              inventory: {
                included: 1,
                roots: ["test/built-ins/Sample/prototype/"],
              },
              status: "blocked",
            },
            "leaf-node",
          ),
        ],
        includedPaths,
      ),
    /dependency cycle/u,
  );
});

test("m5b graph rejects a dependency on a parked node", () => {
  assert.throws(
    () =>
      validateWorkGraph(
        graphSource({ summary: { blocked: 1, nodes: 2, parked: 1, ready: 0 } }),
        [
          nodeSource(
            {
              inventory: {
                included: 1,
                roots: ["test/built-ins/Sample/*.js"],
              },
              reason: "It needs a decision nobody owns.",
              status: "parked",
            },
            "root-node",
          ),
          leafNode,
        ],
        includedPaths,
      ),
    /depends on parked node root-node/u,
  );
});

test("m5b graph rejects an unclaimed built-in path", () => {
  assert.throws(
    () =>
      validateWorkGraph(
        graphSource({ summary: { blocked: 0, nodes: 1, parked: 0, ready: 1 } }),
        [rootNode],
        includedPaths,
      ),
    /leaves 1 included built-in paths unclaimed/u,
  );
});

test("m5b graph rejects two nodes claiming one path", () => {
  assert.throws(
    () =>
      validateWorkGraph(
        graphSource(),
        [
          rootNode,
          nodeSource(
            {
              dependencies: ["root-node"],
              inventory: { included: 2, roots: ["test/built-ins/Sample/"] },
              status: "blocked",
            },
            "leaf-node",
          ),
        ],
        includedPaths,
      ),
    /already claimed by root-node/u,
  );
});

test("m5b graph rejects a recorded count that does not match", () => {
  assert.throws(
    () =>
      validateWorkGraph(
        graphSource(),
        [
          nodeSource(
            {
              inventory: {
                included: 5,
                roots: ["test/built-ins/Sample/*.js"],
              },
            },
            "root-node",
          ),
          leafNode,
        ],
        includedPaths,
      ),
    /records 5 included paths but selects 1/u,
  );
});

test("m5b graph rejects a derived status that disagrees", () => {
  assert.throws(
    () =>
      validateWorkGraph(
        graphSource({ summary: { blocked: 0, nodes: 2, parked: 0, ready: 2 } }),
        [
          rootNode,
          nodeSource(
            {
              dependencies: ["root-node"],
              inventory: {
                included: 1,
                roots: ["test/built-ins/Sample/prototype/"],
              },
              status: "ready",
            },
            "leaf-node",
          ),
        ],
        includedPaths,
      ),
    /records status ready but its dependencies make it blocked/u,
  );
});

test("m5b graph rejects a collision between ordered nodes", () => {
  assert.throws(
    () =>
      validateWorkGraph(
        graphSource({
          collisions: [
            {
              nodes: ["leaf-node", "root-node"],
              note: "Same component.",
              path: "packages/runtime-c/native/runtime_sample.c",
            },
          ],
        }),
        [leafNode, rootNode],
        includedPaths,
      ),
    /already depends on root-node/u,
  );
});

test("m5b graph selectors separate direct files from subdirectories", () => {
  assert.deepEqual(
    selectInventoryPaths("test/built-ins/Sample/*.js", includedPaths, "sample"),
    ["test/built-ins/Sample/length.js"],
  );
  assert.deepEqual(
    selectInventoryPaths("test/built-ins/Sample/", includedPaths, "sample"),
    [
      "test/built-ins/Sample/length.js",
      "test/built-ins/Sample/prototype/name.js",
    ],
  );
});

test("m5b graph direct-file selectors keep only .js entries", () => {
  assert.deepEqual(
    selectInventoryPaths(
      "test/built-ins/Sample/*.js",
      ["test/built-ins/Sample/length.js", "test/built-ins/Sample/data.json"],
      "sample",
    ),
    ["test/built-ins/Sample/length.js"],
  );
});

test("m5b graph rejects a selector outside the selectable roots", () => {
  assert.throws(
    () =>
      selectInventoryPaths(
        "test/language/statements/",
        includedPaths,
        "sample",
      ),
    /must start with one of/u,
  );
});

test("m5b graph inventory reader keeps only included paths", () => {
  assert.deepEqual(
    parseIncludedInventoryPaths(
      "# comment\ntest/a.js\tincluded\tbasis\ntest/b.js\texcluded\tbasis\n",
    ),
    ["test/a.js"],
  );
});

test("the checked-in M5b work graph is valid", () => {
  const summary = validateCurrentWorkGraph();
  assert.ok(summary.nodes > 0);
  assert.ok(summary.ready > 0);
  assert.equal(summary.nodes, summary.ready + summary.blocked + summary.parked);
});
