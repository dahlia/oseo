import assert from "node:assert/strict";
import test from "node:test";

import { parse as parseYaml } from "yaml";

import {
  deriveM5cClosureLedger,
  parseM5cClosureLedger,
  serializeM5cClosureLedger,
  validateCurrentM5cClosureLedger,
  validateM5cClosureLedger,
} from "../tools/m5c-closure-ledger.ts";
import type {
  M5cClosureLedger,
  M5cLedgerManifestInput,
} from "../tools/m5c-closure-ledger.ts";
import { deriveCurrentM5cBaseline } from "../tools/m5c-graph.ts";

const revision = "abc123";
const nodeIds: ReadonlySet<string> = new Set([
  "m5-exit-audit",
  "observation-batch-plan",
  "realm-remediation",
  "unsupported-ownership-audit",
]);
const passPath = "test/built-ins/A/pass.js";
const negativePath = "test/language/B/negative.js";
const realmPath = "test/built-ins/A/realm.js";
const unreviewedPath = "test/language/B/unreviewed.js";
const excludedPath = "test/built-ins/Temporal/excluded.js";

const inventoryText = [
  `# suite-revision: ${revision}`,
  "# included: 4",
  "path\tboundary\tbasis",
  `${passPath}\tincluded\tfeatureless`,
  `${realmPath}\tincluded\tfeatureless`,
  `${excludedPath}\texcluded\tproposal:temporal`,
  `${negativePath}\tincluded\tfeatureless`,
  `${unreviewedPath}\tincluded\tfeatureless`,
  "",
].join("\n");

const manifest: M5cLedgerManifestInput = {
  results: [
    {
      case: { path: passPath },
      classification: "pass",
      dependencies: ["functions"],
    },
    {
      case: { path: negativePath },
      classification: "expected-negative",
      dependencies: ["control-flow"],
    },
    {
      case: { path: realmPath },
      classification: "unsupported-profile-feature",
      dependencies: ["object-properties", "functions"],
    },
  ],
  suiteRevision: revision,
};

function derive(previous?: M5cClosureLedger): M5cClosureLedger {
  return deriveM5cClosureLedger(inventoryText, manifest, nodeIds, previous);
}

const ledgerText = serializeM5cClosureLedger(derive());

function validate(
  text: string,
  input: M5cLedgerManifestInput = manifest,
): ReturnType<typeof validateM5cClosureLedger> {
  return validateM5cClosureLedger(text, inventoryText, input, nodeIds);
}

function entryLine(path: string): string {
  const line = ledgerText.split("\n").find((candidate) => {
    return candidate.startsWith(`  ${path}: `);
  });
  assert.ok(line != null, `ledger lists ${path}`);
  return line;
}

function replaceLine(text: string, path: string, line: string): string {
  return text.replace(entryLine(path), line);
}

function withOwner(path: string, owner: string): M5cClosureLedger {
  const ledger = derive();
  return {
    ...ledger,
    entries: ledger.entries.map((entry) =>
      entry.path === path ? Object.assign({}, entry, { owner }) : entry,
    ),
  };
}

test("the derived ledger lists every included path once", () => {
  const summary = validate(ledgerText);
  assert.equal(summary.inventoryPaths, 4);
  assert.equal(summary.closedPaths, 2);
  assert.equal(summary.openPaths, 2);
  assert.equal(summary.states.get("unreviewed"), 1);
  assert.equal(summary.states.get("unsupported-profile-feature"), 1);
  assert.equal(summary.states.get("semantic-failure"), 0);
  assert.deepEqual(
    [...summary.owners],
    [
      ["node:observation-batch-plan", 1],
      ["observation", 2],
      ["unassigned", 1],
    ],
  );
  assert.equal(
    entryLine(realmPath),
    `  ${realmPath}: [unsupported-profile-feature, unassigned, ` +
      "[functions, object-properties]]",
  );
  assert.equal(
    entryLine(unreviewedPath),
    `  ${unreviewedPath}: [unreviewed, node:observation-batch-plan]`,
  );
  assert.ok(!ledgerText.includes(excludedPath));
});

test("the canonical layout is plain YAML with the same content", () => {
  // SAFETY: the assertions below check the parsed shape they rely on.
  const parsed = parseYaml(ledgerText) as {
    readonly paths: Readonly<Record<string, readonly unknown[]>>;
  };
  assert.deepEqual(parsed.paths, {
    [passPath]: ["pass", "observation"],
    [realmPath]: [
      "unsupported-profile-feature",
      "unassigned",
      ["functions", "object-properties"],
    ],
    [negativePath]: ["expected-negative", "observation"],
    [unreviewedPath]: ["unreviewed", "node:observation-batch-plan"],
  });
});

test("the ledger rejects a duplicate path", () => {
  const line = entryLine(passPath);
  assert.throws(
    () => validate(ledgerText.replace(line, `${line}\n${line}`)),
    /repeats path test\/built-ins\/A\/pass\.js/u,
  );
});

test("the ledger rejects a missing included path", () => {
  assert.throws(
    () => validate(ledgerText.replace(`${entryLine(unreviewedPath)}\n`, "")),
    /omits 1 included paths, first test\/language\/B\/unreviewed\.js/u,
  );
});

test("the ledger rejects excluded and unknown paths", () => {
  const cases = [
    [excludedPath, realmPath],
    ["test/language/C/unknown.js", unreviewedPath],
  ] as const;
  for (const [path, after] of cases) {
    const line = `  ${path}: [unreviewed, node:observation-batch-plan]`;
    const text = ledgerText.replace(
      entryLine(after),
      `${entryLine(after)}\n${line}`,
    );
    assert.throws(
      () => validate(text),
      /path is outside the included inventory/u,
      path,
    );
  }
});

test("the ledger rejects states that differ from the manifest", () => {
  assert.throws(
    () =>
      validate(
        replaceLine(
          ledgerText,
          unreviewedPath,
          `  ${unreviewedPath}: [pass, observation]`,
        ),
      ),
    /unreviewed\.js as pass but the manifest derives unreviewed/u,
  );
});

test("a ledger left behind by a manifest change fails", () => {
  const advanced: M5cLedgerManifestInput = {
    ...manifest,
    results: [
      ...manifest.results,
      {
        case: { path: unreviewedPath },
        classification: "pass",
        dependencies: [],
      },
    ],
  };
  assert.throws(
    () => validate(ledgerText, advanced),
    /as unreviewed but the manifest derives pass/u,
  );
  const regenerated = serializeM5cClosureLedger(
    deriveM5cClosureLedger(inventoryText, advanced, nodeIds, derive()),
  );
  assert.equal(validate(regenerated, advanced).closedPaths, 3);
});

test("the ledger regenerates its counts from the manifest", () => {
  assert.throws(
    () => validate(ledgerText.replace("closedPaths: 2", "closedPaths: 3")),
    /closedPaths is 3 but the manifest derives 2/u,
  );
  assert.throws(
    () => validate(ledgerText.replace("  pass: 1", "  pass: 2")),
    /state pass is 2 but the manifest derives 1/u,
  );
  assert.throws(
    () =>
      validate(
        ledgerText.replace(/(unassigned:\n(?: {4}.*\n)*? {4}paths: )1/u, "$12"),
      ),
    /owner unassigned paths is 2 but entries record 1/u,
  );
});

test("unsupported prerequisites come from the manifest", () => {
  assert.throws(
    () =>
      validate(
        ledgerText.replace(
          "[functions, object-properties]",
          "[object-properties]",
        ),
      ),
    /prerequisites for test\/built-ins\/A\/realm\.js differ/u,
  );
  assert.throws(
    () =>
      validate(
        replaceLine(
          ledgerText,
          passPath,
          `  ${passPath}: [pass, observation, [functions]]`,
        ),
      ),
    /prerequisites exactly when the state is unsupported/u,
  );
});

test("owners must fit the path state", () => {
  const cases: readonly (readonly [string, string, RegExp])[] = [
    [passPath, "unassigned", /must be observation for a pass path/u],
    [unreviewedPath, "unassigned", /must name the M5c graph node/u],
    [realmPath, "observation", /must be unassigned or a node: owner/u],
    [realmPath, "node:missing-node", /unknown M5c graph node missing-node/u],
  ];
  for (const [path, owner, message] of cases) {
    const text = serializeM5cClosureLedger(withOwner(path, owner));
    assert.throws(() => validate(text), message, `${path} ${owner}`);
  }
});

test("no owner form can authorize an exclusion yet", () => {
  for (const owner of ["adr:dynamic-source", "exclusion:realms"]) {
    const text = serializeM5cClosureLedger(withOwner(realmPath, owner));
    assert.throws(
      () => validate(text),
      new RegExp(
        `owner ${owner} of .* must be unassigned or a node: owner`,
        "u",
      ),
      owner,
    );
  }
});

test("a remediation node may own an unsupported path", () => {
  const text = serializeM5cClosureLedger(
    withOwner(realmPath, "node:realm-remediation"),
  );
  const summary = validate(text);
  assert.equal(summary.owners.get("node:realm-remediation"), 1);
  assert.equal(summary.owners.get("unassigned"), undefined);
  assert.equal(summary.openPaths, 2);
});

test("a node ID containing digits round-trips as an owner", () => {
  const text = serializeM5cClosureLedger(
    withOwner(unreviewedPath, "node:m5-exit-audit"),
  );
  assert.equal(validate(text).owners.get("node:m5-exit-audit"), 1);
});

test("the ledger rejects a non-canonical order or layout", () => {
  const swapped = ledgerText
    .replace(entryLine(passPath), "SWAP")
    .replace(entryLine(realmPath), entryLine(passPath))
    .replace("SWAP", entryLine(realmPath));
  assert.throws(() => validate(swapped), /not in code-unit path order/u);
  assert.throws(
    () =>
      validate(ledgerText.replace("[pass, observation]", "[pass,observation]")),
    /not a canonical ledger entry/u,
  );
});

test("the ledger rejects a different suite revision", () => {
  assert.throws(
    () => validate(ledgerText.replace(`suiteRevision: ${revision}`, "x: 1")),
    /header keys differ/u,
  );
  assert.throws(
    () =>
      validate(
        ledgerText.replace(
          `suiteRevision: ${revision}`,
          "suiteRevision: def456",
        ),
      ),
    /suiteRevision def456 differs from the manifest revision abc123/u,
  );
});

test("regeneration keeps valid owners and notes only", () => {
  const assigned: M5cClosureLedger = {
    ...withOwner(realmPath, "node:realm-remediation"),
    ownerNotes: new Map([
      ["node:realm-remediation", "Realm creation remains M5 work."],
      ["observation", "Edited explanation."],
      ["unassigned", "Unused once the audit assigns every path."],
    ]),
  };
  const kept = derive(assigned);
  assert.equal(
    kept.entries.find((entry) => entry.path === realmPath)?.owner,
    "node:realm-remediation",
  );
  assert.deepEqual(
    [...kept.ownerNotes.keys()],
    ["node:observation-batch-plan", "node:realm-remediation", "observation"],
  );
  assert.equal(kept.ownerNotes.get("observation"), "Edited explanation.");
  assert.deepEqual(parseM5cClosureLedger(serializeM5cClosureLedger(kept)), {
    header: parseM5cClosureLedger(serializeM5cClosureLedger(kept)).header,
    ledger: kept,
  });

  const passed: M5cLedgerManifestInput = {
    ...manifest,
    results: manifest.results.map((result) =>
      result.case.path === realmPath
        ? Object.assign({}, result, { classification: "pass" })
        : result,
    ),
  };
  const reset = deriveM5cClosureLedger(
    inventoryText,
    passed,
    nodeIds,
    assigned,
  );
  assert.equal(
    reset.entries.find((entry) => entry.path === realmPath)?.owner,
    "observation",
  );
  assert.ok(!reset.ownerNotes.has("node:realm-remediation"));
});

test("the checked-in ledger matches the reviewed manifest", () => {
  const summary = validateCurrentM5cClosureLedger();
  const baseline = deriveCurrentM5cBaseline();
  assert.equal(summary.inventoryPaths, baseline.inventoryPaths);
  assert.equal(summary.states.get("unreviewed"), baseline.unreviewedPaths);
  assert.equal(summary.states.get("pass"), baseline.passes);
  assert.equal(
    summary.states.get("expected-negative"),
    baseline.expectedNegatives,
  );
  assert.equal(
    summary.states.get("unsupported-profile-feature"),
    baseline.unsupportedProfileFeatures,
  );
  assert.equal(
    summary.openPaths,
    baseline.inventoryPaths - baseline.passes - baseline.expectedNegatives,
  );
});
