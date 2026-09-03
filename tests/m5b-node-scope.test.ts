import assert from "node:assert/strict";
import test from "node:test";

import { checkM5bNodeScope } from "../tools/m5b-node-scope.ts";
import type { M5bNodeScopeInputs } from "../tools/m5b-node-scope.ts";
import type {
  CompatibilityClassification,
  CompatibilitySnapshot,
} from "../tools/compatibility-ratchet.ts";

const ownPath = "test/built-ins/Sample/Own/case.js";
const demotedOwnPath = "test/built-ins/Sample/Own/demoted.js";
const otherPath = "test/built-ins/Sample/Other/case.js";
const addedOwnPath = "test/built-ins/Sample/Own/added.js";
const includedPaths = [addedOwnPath, demotedOwnPath, otherPath, ownPath];
const nodes = [
  {
    id: "named-node",
    inventory: { roots: ["test/built-ins/Sample/Own/"] },
  },
  {
    id: "other-node",
    inventory: { roots: ["test/built-ins/Sample/Other/"] },
  },
  { id: "infrastructure-node", inventory: null },
];
const emptyOverrides = "overrides: []\n";

interface EvidenceEntry {
  readonly classification: CompatibilityClassification;
  readonly path: string;
}

function snapshot(entries: readonly EvidenceEntry[]): CompatibilitySnapshot {
  const classifications = new Map(
    entries.map(({ classification, path }) => [path, classification]),
  );
  const paths = new Set(entries.map(({ path }) => path));
  return {
    admittedFamilies: new Set(),
    classifications,
    domains: new Map(),
    expectedClassifications: classifications,
    resultPaths: paths,
    subsetPaths: paths,
  };
}

function inputs(
  baseline: CompatibilitySnapshot,
  current: CompatibilitySnapshot,
  overrides: Partial<M5bNodeScopeInputs> = {},
): M5bNodeScopeInputs {
  return {
    baseline,
    baselineOverridesText: emptyOverrides,
    current,
    currentOverridesText: emptyOverrides,
    includedPaths,
    nodeId: "named-node",
    nodes,
    ...overrides,
  };
}

test("rejects an out-of-root reviewed subset removal", () => {
  const baseline = snapshot([{ classification: "pass", path: otherPath }]);
  assert.throws(
    () => checkM5bNodeScope(inputs(baseline, snapshot([]))),
    (error) => {
      assert.match(String(error), new RegExp(otherPath, "u"));
      assert.match(String(error), /subset path "present" -> "absent"/u);
      assert.match(String(error), /owned by node other-node/u);
      assert.match(String(error), /Report the finding/u);
      return true;
    },
  );
});

test("rejects an out-of-root reviewed subset addition", () => {
  const current = snapshot([{ classification: "pass", path: otherPath }]);
  assert.throws(
    () => checkM5bNodeScope(inputs(snapshot([]), current)),
    /subset path "absent" -> "present"/u,
  );
});

test("rejects an out-of-root expected-classification demotion", () => {
  const baseline = snapshot([{ classification: "pass", path: otherPath }]);
  const current = snapshot([
    { classification: "unsupported-profile-feature", path: otherPath },
  ]);
  assert.throws(
    () => checkM5bNodeScope(inputs(baseline, current)),
    /expectedClassification "pass" -> "unsupported-profile-feature"/u,
  );
});

test("allows an out-of-root expected-classification promotion", () => {
  const baseline = snapshot([
    { classification: "unsupported-profile-feature", path: otherPath },
  ]);
  const current = snapshot([{ classification: "pass", path: otherPath }]);
  assert.doesNotThrow(() => checkM5bNodeScope(inputs(baseline, current)));
});

test("allows every reviewed change inside the named node's roots", () => {
  const baseline = snapshot([
    { classification: "pass", path: ownPath },
    { classification: "pass", path: demotedOwnPath },
  ]);
  const current = snapshot([
    { classification: "unsupported-profile-feature", path: demotedOwnPath },
    { classification: "expected-negative", path: addedOwnPath },
  ]);
  assert.doesNotThrow(() => checkM5bNodeScope(inputs(baseline, current)));
});

test("rejects any reviewed change for a node without inventory", () => {
  const baseline = snapshot([
    { classification: "unsupported-profile-feature", path: otherPath },
  ]);
  const current = snapshot([{ classification: "pass", path: otherPath }]);
  assert.throws(
    () =>
      checkM5bNodeScope(
        inputs(baseline, current, { nodeId: "infrastructure-node" }),
      ),
    /node infrastructure-node has no inventory block/u,
  );
});

test("rejects a newly added ratchet override", () => {
  const override = `
overrides:
  - invariant: subset-path
    path: ${otherPath}
    reason: The worker tried to suppress a finding.
    transition:
      from: present
      to: absent
`;
  const unchanged = snapshot([]);
  assert.throws(
    () =>
      checkM5bNodeScope(
        inputs(unchanged, unchanged, { currentOverridesText: override }),
      ),
    /ratchet override added: subset-path/u,
  );
});

test("allows removal of a stale ratchet override", () => {
  const override = `
overrides:
  - invariant: subset-path
    path: ${otherPath}
    reason: The old reversal no longer applies.
    transition:
      from: present
      to: absent
`;
  const unchanged = snapshot([]);
  assert.doesNotThrow(() =>
    checkM5bNodeScope(
      inputs(unchanged, unchanged, {
        baselineOverridesText: override,
      }),
    ),
  );
});

test("enforces nothing when no node name is set", () => {
  // The coordinator merges nodes, regenerates the manifest, and records
  // reversals. Those changes cross node boundaries by design, and CI runs
  // the same gate with no node identity, so an unnamed run must be inert.
  const baseline = snapshot([{ classification: "pass", path: otherPath }]);
  const override = `
overrides:
  - invariant: subset-path
    path: ${otherPath}
    reason: The coordinator accepted a deliberate reversal.
    transition:
      from: present
      to: absent
`;
  assert.doesNotThrow(() =>
    checkM5bNodeScope(
      inputs(baseline, snapshot([]), {
        currentOverridesText: override,
        nodeId: undefined,
      }),
    ),
  );
});
