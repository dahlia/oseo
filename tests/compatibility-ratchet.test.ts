import assert from "node:assert/strict";
import test from "node:test";

import {
  compareCompatibility,
  createCompatibilitySnapshot,
  selectBaselineIntent,
  selectCurrentPropertyPaths,
} from "../tools/compatibility-ratchet.ts";
import type {
  CompatibilitySnapshot,
  PropertySource,
} from "../tools/compatibility-ratchet.ts";

function subset(paths: readonly string[]): string {
  return JSON.stringify({
    tests: paths.map((path) => ({ path })),
  });
}

function results(entries: readonly (readonly [string, string])[]): string {
  return JSON.stringify({
    results: entries.map(([path, classification]) => ({
      case: { path },
      classification,
    })),
  });
}

function propertySource(
  domain: string,
  seed: number,
  numRuns: number,
): PropertySource {
  return {
    path: "tests/property/example.property.test.ts",
    text: `
const suite = {
  domain: "generated " + ${JSON.stringify(domain)},
  numRuns: ${numRuns},
  seed: ${seed},
} as const;
assertAsyncProperty("example", property, suite);
`,
  };
}

function snapshot(
  subsetPaths: readonly string[] = ["test/a.js", "test/b.js"],
  resultEntries: readonly (readonly [string, string])[] = [
    ["test/a.js", "pass"],
    ["test/b.js", "expected-negative"],
  ],
  properties: readonly PropertySource[] = [propertySource("values", 101, 10)],
): CompatibilitySnapshot {
  return createCompatibilitySnapshot(
    subset(subsetPaths),
    results(resultEntries),
    properties,
  );
}

test("accepts unchanged and monotonically growing compatibility", () => {
  const baseline = snapshot();
  const current = snapshot(
    ["test/a.js", "test/b.js", "test/c.js"],
    [
      ["test/a.js", "pass"],
      ["test/b.js", "expected-negative"],
      ["test/c.js", "pass"],
    ],
    [propertySource("values", 101, 12)],
  );
  const report = compareCompatibility(baseline, current);
  assert.deepEqual(report.unoverriddenViolations, []);
  assert.deepEqual(report.staleOverrides, []);
  assert.deepEqual(report.baseline, {
    distinctPropertySeeds: 1,
    pass: 1,
    propertyCaseBudget: 10,
    propertyDomains: 1,
    results: 2,
    subset: 2,
  });
  assert.equal(report.current.pass, 2);
  assert.equal(report.current.propertyCaseBudget, 12);
});

test("rejects pass count loss and path reclassification separately", () => {
  const report = compareCompatibility(
    snapshot(),
    snapshot(undefined, [
      ["test/a.js", "unsupported-profile-feature"],
      ["test/b.js", "expected-negative"],
    ]),
  );
  assert.deepEqual(
    report.unoverriddenViolations.map((violation) => violation.invariant),
    ["pass-classification", "pass-count"],
  );
});

test("rejects a reviewed subset path removal", () => {
  const report = compareCompatibility(
    snapshot(),
    snapshot(["test/a.js"], [["test/a.js", "pass"]]),
  );
  assert.deepEqual(
    report.unoverriddenViolations.map((violation) => violation.invariant),
    ["subset-path"],
  );
  assert.equal(report.unoverriddenViolations[0]?.scope, "test/b.js");
});

test("rejects a subset and result path-set mismatch", () => {
  const report = compareCompatibility(
    snapshot(),
    snapshot(undefined, [["test/a.js", "pass"]]),
  );
  assert.deepEqual(
    report.unoverriddenViolations.map((violation) => violation.invariant),
    ["manifest-path-set"],
  );
  assert.equal(report.unoverriddenViolations[0]?.scope, "test/b.js");
});

test("rejects a result path missing from the reviewed subset", () => {
  const report = compareCompatibility(
    snapshot(),
    snapshot(
      ["test/a.js", "test/b.js"],
      [
        ["test/a.js", "pass"],
        ["test/b.js", "expected-negative"],
        ["test/c.js", "unsupported-profile-feature"],
      ],
    ),
  );
  assert.deepEqual(report.unoverriddenViolations, [
    {
      from: "present",
      invariant: "manifest-path-set",
      scope: "test/c.js",
      to: "missing-from-subset",
    },
  ]);
});

test("rejects a generated domain seed removal", () => {
  const report = compareCompatibility(
    snapshot(),
    snapshot(undefined, undefined, [propertySource("values", 102, 10)]),
  );
  assert.deepEqual(report.unoverriddenViolations, [
    {
      from: 101,
      invariant: "property-seed",
      scope: "generated values",
      to: "absent",
    },
  ]);
});

test("rejects a generated domain case-budget reduction", () => {
  const report = compareCompatibility(
    snapshot(),
    snapshot(undefined, undefined, [propertySource("values", 101, 9)]),
  );
  assert.deepEqual(report.unoverriddenViolations, [
    {
      from: 10,
      invariant: "property-case-budget",
      scope: "generated values",
      to: 9,
    },
  ]);
});

test("an override permits only its exact named transition", () => {
  const baseline = snapshot();
  const current = snapshot(undefined, [
    ["test/a.js", "unsupported-profile-feature"],
    ["test/b.js", "expected-negative"],
  ]);
  const classificationOnly = compareCompatibility(
    baseline,
    current,
    `
overrides:
  - invariant: pass-classification
    path: test/a.js
    transition:
      from: pass
      to: unsupported-profile-feature
    reason: The recorded observation was wrong.
`,
  );
  assert.deepEqual(
    classificationOnly.unoverriddenViolations.map(
      (violation) => violation.invariant,
    ),
    ["pass-count"],
  );

  const complete = compareCompatibility(
    baseline,
    current,
    `
overrides:
  - invariant: pass-classification
    path: test/a.js
    transition:
      from: pass
      to: unsupported-profile-feature
    reason: The recorded observation was wrong.
  - invariant: pass-count
    path: tests/test262/results.yaml
    transition:
      from: 1
      to: 0
    reason: The corrected observation reduces the measured total.
`,
  );
  assert.deepEqual(complete.unoverriddenViolations, []);
  assert.deepEqual(complete.staleOverrides, []);
});

test("rejects an override when its transition is stale", () => {
  const override = `
overrides:
  - invariant: property-case-budget
    domain: generated values
    transition:
      from: 10
      to: 9
    reason: A smaller exhaustive domain replaced the old generator.
`;
  const report = compareCompatibility(snapshot(), snapshot(), override);
  assert.equal(report.staleOverrides.length, 1);
  assert.deepEqual(report.unoverriddenViolations, []);

  const historical = compareCompatibility(
    snapshot(),
    snapshot(),
    override,
    override,
  );
  assert.deepEqual(historical.staleOverrides, []);
});

test("rejects an ambiguous property options declaration", () => {
  const properties: PropertySource[] = [
    {
      path: "experiments/example.property.test.ts",
      text: `
{
  const suite = { domain: "first", numRuns: 10, seed: 1 };
  assertProperty("first", property, suite);
}
{
  const suite = { domain: "second", numRuns: 10, seed: 2 };
  assertProperty("second", property, suite);
}
`,
    },
  ];
  assert.throws(
    () => snapshot(undefined, undefined, properties),
    /references ambiguous options suite/u,
  );
});

test("omits deleted property sources from the current worktree", () => {
  assert.deepEqual(
    selectCurrentPropertyPaths(
      [
        "experiments/added.property.test.ts",
        "tests/deleted.property.test.ts",
        "tests/retained.property.test.ts",
        "tests/unit.test.ts",
      ].join("\n"),
      "tests/deleted.property.test.ts",
    ),
    ["experiments/added.property.test.ts", "tests/retained.property.test.ts"],
  );
});

test("selects baselines for pull requests, pushes, and local branches", () => {
  assert.deepEqual(
    selectBaselineIntent(
      {
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "pull_request",
      },
      { pull_request: { base: { sha: "base-sha" } } },
      undefined,
    ),
    { kind: "commit", revision: "base-sha" },
  );
  assert.deepEqual(
    selectBaselineIntent(
      {
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "push",
        GITHUB_REF_TYPE: "branch",
      },
      { before: "before-sha", ref: "refs/heads/topic" },
      undefined,
    ),
    { kind: "commit", revision: "before-sha" },
  );
  assert.deepEqual(
    selectBaselineIntent(
      {
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "push",
        GITHUB_REF_TYPE: "branch",
      },
      {
        before: "0000000000000000000000000000000000000000",
        ref: "refs/heads/topic",
      },
      undefined,
    ),
    { kind: "merge-base-main" },
  );
  assert.deepEqual(
    selectBaselineIntent(
      {
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "push",
        GITHUB_REF_TYPE: "tag",
      },
      { before: "before-sha", ref: "refs/tags/v1.0.0" },
      undefined,
    ),
    {
      kind: "skip",
      reason: "tag pushes are outside the compatibility ratchet scope",
    },
  );
  assert.deepEqual(selectBaselineIntent({}, {}, "main"), {
    kind: "commit",
    revision: "HEAD",
  });
  assert.deepEqual(selectBaselineIntent({}, {}, "topic"), {
    kind: "merge-base-main",
  });
  assert.throws(
    () => selectBaselineIntent({}, {}, undefined),
    /detached HEAD/u,
  );
});
