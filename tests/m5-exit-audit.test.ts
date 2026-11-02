import assert from "node:assert/strict";
import test from "node:test";

import type {
  Test262Classification,
  Test262Summary,
} from "../packages/testkit/src/index.ts";

import {
  auditM5Exit,
  renderM5CoverageReport,
  replaceM5CoverageSection,
  validateM5ExitReport,
} from "../tools/m5-exit-audit.ts";
import type { M5ExitAuditInputs } from "../tools/m5-exit-audit.ts";
import type {
  M5cLedgerEntry,
  M5cLedgerState,
} from "../tools/m5c-closure-ledger.ts";

const revision = "abc123";
const passPath = "test/built-ins/A/pass.js";
const negativePath = "test/language/B/negative.js";
const excludedPath = "test/language/C/eval.js";
const deferredPath = "test/language/D/deferred.js";
const dynamicRecord = "0016-dynamic-source-boundary";
const included = [passPath, negativePath, excludedPath, deferredPath];
const classifications = new Map<string, Test262Classification>([
  [passPath, "pass"],
  [negativePath, "expected-negative"],
  [excludedPath, "unsupported-profile-feature"],
  [deferredPath, "unsupported-profile-feature"],
]);
const owners = new Map([
  [passPath, "observation"],
  [negativePath, "observation"],
  [excludedPath, `adr:${dynamicRecord}`],
  [deferredPath, "deferred"],
]);

function inventoryText(paths: readonly string[] = included): string {
  return [
    `# suite-revision: ${revision}`,
    `# included: ${paths.length}`,
    "path\tboundary\tbasis",
    ...paths.map((path) => `${path}\tincluded\tfeatureless`),
    "test/built-ins/Temporal/outside.js\texcluded\tproposal:temporal",
    "",
  ].join("\n");
}

function summary(
  results: readonly { readonly classification: Test262Classification }[],
): Test262Summary {
  const counted = (classification: Test262Classification): number =>
    results.filter((result) => result.classification === classification).length;
  return {
    dependencies: [],
    expectedNegatives: counted("expected-negative"),
    groups: [],
    harnessFailures: counted("harness-failure"),
    infrastructureFailures: counted("infrastructure-failure"),
    passes: counted("pass"),
    semanticFailures: counted("semantic-failure"),
    unsupportedProfileFeatures: counted("unsupported-profile-feature"),
  };
}

function manifest(paths: readonly string[] = included) {
  const results = paths.map((path) => ({
    case: { path },
    classification: classifications.get(path) ?? "pass",
  }));
  return { results, suiteRevision: revision, summary: summary(results) };
}

function ledgerEntries(): M5cLedgerEntry[] {
  return included.map((path) => ({
    owner: owners.get(path) ?? "observation",
    path,
    prerequisites: [],
    state: classifications.get(path) ?? "pass",
  }));
}

function auditText(reopening = '["Changed evidence reopens it."]'): string {
  return [
    "version: 1",
    `suiteRevision: ${revision}`,
    "records:",
    `  ${dynamicRecord}:`,
    "    digest: unused",
    '    authorization: ["Dynamic source stays outside."]',
    `    reopening: ${reopening}`,
    "assessments: {}",
    "paths: []",
    "",
  ].join("\n");
}

function deferralsText(entry = "remainingContract: The rest.\n"): string {
  return [
    "version: 1",
    `suiteRevision: ${revision}`,
    "paths:",
    `  ${deferredPath}:`,
    "    family: run-time-source",
    "    targetMilestone: PLAN-DYN.md",
    ...entry
      .trimEnd()
      .split("\n")
      .map((line) => `    ${line}`),
    "",
  ].join("\n");
}

function valid(): M5ExitAuditInputs {
  return {
    deferralSummary: {
      families: new Map([["run-time-source", 1]]),
      milestones: new Map([["PLAN-DYN.md", 1]]),
      paths: 1,
    },
    deferralsText: deferralsText(),
    exclusionAuditText: auditText(),
    exclusionSummary: {
      deferrals: 1,
      exclusions: 1,
      missingDynamicTags: 0,
      remediation: 0,
    },
    inventoryText: inventoryText(),
    ledger: {
      entries: ledgerEntries(),
      ownerNotes: new Map(),
      suiteRevision: revision,
    },
    ledgerSummary: {
      closedPaths: 2,
      deferredPaths: 1,
      inventoryPaths: 4,
      openPaths: 2,
      owners: new Map(),
      states: new Map(),
    },
    manifest: manifest(),
    records: new Map([
      [
        dynamicRecord,
        "ADR 0016: Dynamic source evaluation boundary\n" +
          "============================================\n",
      ],
    ]),
    subset: {
      suiteRevision: revision,
      tests: included.map((path) => ({
        expectedClassification: classifications.get(path) ?? "pass",
        path,
      })),
    },
  };
}

function withLedger(
  change: (entries: M5cLedgerEntry[]) => M5cLedgerEntry[],
): M5ExitAuditInputs {
  const inputs = valid();
  return {
    ...inputs,
    ledger: { ...inputs.ledger, entries: change(ledgerEntries()) },
  };
}

function withOwner(path: string, owner: string): M5ExitAuditInputs {
  return withLedger((entries) =>
    entries.map((entry) => (entry.path === path ? { ...entry, owner } : entry)),
  );
}

function withState(path: string, state: M5cLedgerState): M5ExitAuditInputs {
  return withLedger((entries) =>
    entries.map((entry) => (entry.path === path ? { ...entry, state } : entry)),
  );
}

test("the audit counts every disposition separately", () => {
  const report = auditM5Exit(valid());
  assert.equal(report.suiteRevision, revision);
  assert.equal(report.inventoryPaths, 4);
  assert.equal(report.subsetPaths, 4);
  assert.equal(report.manifestPaths, 4);
  assert.equal(report.closedPaths, 2);
  assert.equal(report.excludedPaths, 1);
  assert.equal(report.deferredPaths, 1);
  assert.equal(report.remediationPaths, 0);
  assert.equal(report.unownedPaths, 0);
  assert.equal(report.states.get("pass"), 1);
  assert.equal(report.states.get("semantic-failure"), 0);
  assert.deepEqual(report.exclusionRecords, [
    {
      paths: 1,
      stem: dynamicRecord,
      title: "ADR 0016: Dynamic source evaluation boundary",
    },
  ]);
  assert.deepEqual(report.deferralFamilies, [
    { family: "run-time-source", paths: 1, targets: ["PLAN-DYN.md"] },
  ]);
});

test("the rendered report keeps exclusions and deferrals apart", () => {
  const rendered = renderM5CoverageReport(auditM5Exit(valid()));
  assert.match(rendered, /`abc123`/u);
  assert.match(
    rendered,
    /\| Closed by a reviewed pass or expected negative +\| +2 \|/u,
  );
  assert.match(
    rendered,
    /\| Unsupported, covered by an authorized exclusion +\| +1 \|/u,
  );
  assert.match(
    rendered,
    /\| Unsupported, named in the ADR 0031 deferral list +\| +1 \|/u,
  );
  assert.match(rendered, /\| Unsupported, owned by remediation +\| +0 \|/u);
  assert.match(rendered, /\| Unsupported, without an owner +\| +0 \|/u);
  assert.match(
    rendered,
    /\[ADR 0016: Dynamic source evaluation boundary\]\(\.\.\/adr\/0016-/u,
  );
  assert.match(rendered, /\| `run-time-source` \| \[\*PLAN-DYN\.md\*\]/u);
});

test("the audit rejects an input at another revision", () => {
  const inputs = valid();
  const cases: readonly [string, M5ExitAuditInputs][] = [
    [
      "reviewed manifest",
      { ...inputs, manifest: { ...inputs.manifest, suiteRevision: "def" } },
    ],
    [
      "reviewed subset",
      { ...inputs, subset: { ...inputs.subset, suiteRevision: "def" } },
    ],
    [
      "closure ledger",
      { ...inputs, ledger: { ...inputs.ledger, suiteRevision: "def" } },
    ],
    [
      "exclusion audit",
      {
        ...inputs,
        exclusionAuditText: auditText().replace(revision, "def"),
      },
    ],
    [
      "deferral list",
      { ...inputs, deferralsText: deferralsText().replace(revision, "def") },
    ],
  ];
  for (const [input, changed] of cases) {
    assert.throws(
      () => auditM5Exit(changed),
      new RegExp(`${input} revision def differs`, "u"),
    );
  }
});

test("the audit rejects a manifest that omits an included path", () => {
  assert.throws(
    () =>
      auditM5Exit({
        ...valid(),
        manifest: manifest([passPath, negativePath, excludedPath]),
      }),
    /manifest omits 1 paths, first test\/language\/D\/deferred\.js/u,
  );
});

test("the audit rejects a subset that differs from the inventory", () => {
  const inputs = valid();
  const tests = inputs.subset.tests;
  const subset = (changed: typeof tests): M5ExitAuditInputs => ({
    ...inputs,
    subset: { ...inputs.subset, tests: changed },
  });
  assert.throws(
    () => auditM5Exit(subset(tests.slice(1))),
    /subset omits 1 paths, first test\/built-ins\/A\/pass\.js/u,
  );
  assert.throws(
    () => auditM5Exit(subset([...tests, tests[0]!])),
    /subset repeats path test\/built-ins\/A\/pass\.js/u,
  );
  assert.throws(
    () =>
      auditM5Exit(
        subset([
          ...tests,
          {
            expectedClassification: "pass",
            path: "test/built-ins/Temporal/outside.js",
          },
        ]),
      ),
    /subset path is outside the included inventory/u,
  );
  assert.throws(
    () =>
      auditM5Exit(
        subset([
          { expectedClassification: "semantic-failure", path: passPath },
          ...tests.slice(1),
        ]),
      ),
    /pass\.js to be semantic-failure but the manifest records pass/u,
  );
});

test("the audit requires every included path once in the ledger", () => {
  assert.throws(
    () => auditM5Exit(withLedger((entries) => entries.slice(0, 3))),
    /ledger omits 1 paths, first test\/language\/D\/deferred\.js/u,
  );
  assert.throws(
    () => auditM5Exit(withLedger((entries) => [...entries, entries[0]!])),
    /ledger path is repeated or outside the included inventory/u,
  );
  assert.throws(
    () =>
      auditM5Exit(
        withLedger((entries) => [
          ...entries,
          { ...entries[0]!, path: "test/built-ins/Temporal/outside.js" },
        ]),
      ),
    /ledger path is repeated or outside the included inventory/u,
  );
});

test("the audit rejects failures and unreviewed paths", () => {
  for (const state of [
    "harness-failure",
    "infrastructure-failure",
    "semantic-failure",
    "unreviewed",
  ] as const) {
    assert.throws(
      () => auditM5Exit(withState(passPath, state)),
      new RegExp(`records 1 ${state} paths`, "u"),
    );
  }
});

test("the audit rejects a closed path with another owner", () => {
  assert.throws(
    () => auditM5Exit(withOwner(passPath, "deferred")),
    /pass\.js is pass but owned by deferred/u,
  );
});

test("the audit rejects remediation-owned and unowned paths", () => {
  assert.throws(
    () =>
      auditM5Exit(
        withOwner(excludedPath, "node:dynamic-source-coverage-remediation"),
      ),
    /remediation still owns 1 paths, first test\/language\/C\/eval\.js/u,
  );
  assert.throws(
    () => auditM5Exit(withOwner(excludedPath, "unassigned")),
    /no owner covers 1 paths, first test\/language\/C\/eval\.js/u,
  );
});

test("every excluding record needs an audit and a reopening trigger", () => {
  assert.throws(
    () =>
      auditM5Exit(withOwner(excludedPath, "adr:0028-legacy-caller-boundary")),
    /0028-legacy-caller-boundary excludes 1 paths but the exclusion audit/u,
  );
  for (const reopening of ["[]", '[" "]', '"Not a list."']) {
    assert.throws(
      () =>
        auditM5Exit({ ...valid(), exclusionAuditText: auditText(reopening) }),
      /record 0016-dynamic-source-boundary states no reopening trigger/u,
    );
  }
  assert.throws(
    () => auditM5Exit({ ...valid(), records: new Map() }),
    /record 0016-dynamic-source-boundary has no text/u,
  );
  assert.throws(
    () =>
      auditM5Exit({
        ...valid(),
        records: new Map([[dynamicRecord, "Dynamic source\n==============\n"]]),
      }),
    /record 0016-dynamic-source-boundary has no title heading/u,
  );
});

test("the exclusion audit counts must agree with the ledger", () => {
  const inputs = valid();
  for (const change of [
    { remediation: 1 },
    { missingDynamicTags: 1 },
    { exclusions: 2 },
    { deferrals: 0 },
  ]) {
    assert.throws(
      () =>
        auditM5Exit({
          ...inputs,
          exclusionSummary: { ...inputs.exclusionSummary, ...change },
        }),
      /the exclusion audit counts/u,
    );
  }
});

test("every deferral needs its remaining contract and target", () => {
  assert.throws(
    () => auditM5Exit({ ...valid(), deferralsText: deferralsText("x: y\n") }),
    /deferred\.js remainingContract must be a nonempty string/u,
  );
  assert.throws(
    () =>
      auditM5Exit({
        ...valid(),
        deferralsText: deferralsText("remainingContract: The rest.\n").replace(
          "targetMilestone: PLAN-DYN.md",
          'targetMilestone: ""',
        ),
      }),
    /deferred\.js targetMilestone must be a nonempty string/u,
  );
});

test("the deferral counts must agree with the ledger", () => {
  const inputs = valid();
  const cases: readonly M5ExitAuditInputs[] = [
    { ...inputs, deferralSummary: { ...inputs.deferralSummary, paths: 2 } },
    {
      ...inputs,
      deferralSummary: {
        ...inputs.deferralSummary,
        families: new Map([["static-specifier-import", 1]]),
      },
    },
    {
      ...inputs,
      deferralSummary: {
        ...inputs.deferralSummary,
        families: new Map([
          ["run-time-source", 1],
          ["static-specifier-import", 0],
        ]),
      },
    },
    { ...inputs, ledgerSummary: { ...inputs.ledgerSummary, deferredPaths: 0 } },
    {
      ...inputs,
      deferralsText:
        deferralsText() +
        "  test/language/E/extra.js:\n" +
        "    family: run-time-source\n" +
        "    targetMilestone: PLAN-DYN.md\n" +
        "    remainingContract: More.\n",
    },
  ];
  for (const changed of cases) {
    assert.throws(
      () => auditM5Exit(changed),
      /the deferral list names \d+ paths but the ledger defers 1/u,
    );
  }
});

test("the ledger summary must match its entries", () => {
  const inputs = valid();
  assert.throws(
    () =>
      auditM5Exit({
        ...inputs,
        ledgerSummary: { ...inputs.ledgerSummary, closedPaths: 3 },
      }),
    /ledger summary differs from its entries/u,
  );
});

test("the report document must hold the regenerated section", () => {
  const rendered = renderM5CoverageReport(auditM5Exit(valid()));
  const start =
    "<!-- Generated by `mise run report:m5-coverage:update`; do not edit. -->";
  const end = "<!-- End of generated coverage. -->";
  const empty = `Report\n\n${start}\n\n${end}\n\nAfter.\n`;
  const current = replaceM5CoverageSection(empty, rendered);
  assert.equal(
    current,
    `Report\n\n${start}\n\n${rendered}\n\n${end}\n\nAfter.\n`,
  );
  validateM5ExitReport(current, rendered);
  assert.throws(
    () => validateM5ExitReport(empty, rendered),
    /coverage section is stale/u,
  );
  assert.throws(
    () =>
      validateM5ExitReport(
        current.replace(/(expected negative +\| +)2 \|/u, "$13 |"),
        rendered,
      ),
    /coverage section is stale/u,
  );
  for (const broken of [
    "Report\n",
    `${end}\n${start}\n`,
    `${current}${start}\n${end}\n`,
  ]) {
    assert.throws(
      () => validateM5ExitReport(broken, rendered),
      /needs exactly one generated coverage section/u,
    );
  }
});
