import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { summarizeTest262 } from "../packages/testkit/src/test262-summary.ts";
import type {
  Test262Classification,
  Test262Result,
} from "../packages/testkit/src/index.ts";
import {
  compareCompatibility,
  createCompatibilitySnapshot,
  createGitCompatibilitySnapshot,
  selectBaselineIntent,
  selectCurrentPropertyPaths,
  selectGitResultPartitionPaths,
  validatePropertySeedRegistry,
} from "../tools/compatibility-ratchet.ts";
import type {
  CompatibilitySnapshot,
  PropertySource,
  ResultManifestSource,
} from "../tools/compatibility-ratchet.ts";
import { serializeTest262Manifest } from "../tools/test262-manifest.ts";

const repositoryRoot = resolve(fileURLToPath(import.meta.url), "../..");

function subset(paths: readonly string[]): string {
  return JSON.stringify({
    tests: paths.map((path) => ({ path })),
  });
}

function legacyResults(
  entries: readonly (readonly [string, string])[],
): ResultManifestSource {
  return {
    indexText: JSON.stringify({
      results: entries.map(([path, classification]) => ({
        case: { path },
        classification,
      })),
    }),
    partitionPaths: [],
    readPartition(path): string {
      throw new Error(`unexpected partition ${path}`);
    },
  };
}

function results(
  entries: readonly (readonly [string, string])[],
): ResultManifestSource {
  const suiteRevision = "0123456789abcdef0123456789abcdef01234567";
  const manifestResults: readonly Test262Result[] = entries.map(
    ([path, resultClassification]) => {
      // SAFETY: Callers supply classifications from the closed test262 domain.
      const classification = resultClassification as Test262Classification;
      return {
        case: {
          async: false,
          features: [],
          flags: [],
          includes: [],
          mode: "script",
          path,
          strictness: ["non-strict"],
          suiteRevision,
        },
        classification,
        dependencies: [],
        observation: {
          passed:
            classification === "pass" || classification === "expected-negative",
        },
        unsupportedFeatures: [],
      };
    },
  );
  const serialized = serializeTest262Manifest({
    results: manifestResults,
    suiteRevision,
    summary: summarizeTest262(manifestResults),
  });
  const partitions = new Map(
    serialized.partitions.map(({ path, text }) => [path, text]),
  );
  return {
    indexText: serialized.indexText,
    partitionPaths: [...partitions.keys()],
    readPartition(path): string {
      const text = partitions.get(path);
      if (text == null) throw new Error(`unexpected partition ${path}`);
      return text;
    },
  };
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

interface RegistryFamilyInput {
  readonly end: number;
  readonly family: string;
  readonly owner: string;
  readonly start: number;
}

function seedRegistry(families: readonly RegistryFamilyInput[]): string {
  return JSON.stringify({ families, version: 1 });
}

function locatedPropertySource(
  path: string,
  domain: string,
  seed: number,
): PropertySource {
  return { ...propertySource(domain, seed, 10), path };
}

function snapshot(
  subsetPaths: readonly string[] = [
    "test/language/statements/a.js",
    "test/language/statements/b.js",
  ],
  resultEntries: readonly (readonly [string, string])[] = [
    ["test/language/statements/a.js", "pass"],
    ["test/language/statements/b.js", "expected-negative"],
  ],
  properties: readonly PropertySource[] = [propertySource("values", 101, 10)],
  families: readonly string[] = [],
): CompatibilitySnapshot {
  return createCompatibilitySnapshot(
    subset(subsetPaths),
    results(resultEntries),
    properties,
    families,
  );
}

test("loads the ratchet without compiler build artifacts", () => {
  const source = `
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (result.url.includes("/packages/compiler/dist/")) {
      throw new Error("ratchet loaded a compiler build artifact");
    }
    return result;
  },
});

await import("./tools/compatibility-ratchet.ts");
`;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", source],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
});

test("accepts unchanged and monotonically growing compatibility", () => {
  const baseline = snapshot();
  const current = snapshot(
    [
      "test/language/statements/a.js",
      "test/language/statements/b.js",
      "test/language/statements/c.js",
    ],
    [
      ["test/language/statements/a.js", "pass"],
      ["test/language/statements/b.js", "expected-negative"],
      ["test/language/statements/c.js", "pass"],
    ],
    [propertySource("values", 101, 12)],
  );
  const report = compareCompatibility(baseline, current);
  assert.deepEqual(report.unoverriddenViolations, []);
  assert.deepEqual(report.staleOverrides, []);
  assert.deepEqual(report.baseline, {
    admittedFamilies: 0,
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

test("rejects removal of an admitted family without an override path", () => {
  const report = compareCompatibility(
    snapshot(undefined, undefined, undefined, ["retained", "removed"]),
    snapshot(undefined, undefined, undefined, ["retained"]),
  );
  assert.deepEqual(report.unoverriddenViolations, [
    {
      from: "present",
      invariant: "admitted-family",
      scope: "removed",
      to: "absent",
    },
  ]);
  assert.throws(
    () =>
      compareCompatibility(
        snapshot(undefined, undefined, undefined, ["removed"]),
        snapshot(),
        `
overrides:
  - invariant: admitted-family
    path: removed
    transition:
      from: present
      to: absent
    reason: A family removal must not be overridden.
`,
      ),
    /invalid invariant/u,
  );
});

test("rejects a legacy result manifest in the current snapshot", () => {
  assert.throws(
    () =>
      createCompatibilitySnapshot(
        subset(["test/language/statements/a.js"]),
        legacyResults([["test/language/statements/a.js", "pass"]]),
        [],
      ),
    /legacy result manifests are allowed only for Git baselines/u,
  );
});

test("accepts a legacy result manifest only for a Git snapshot", () => {
  const gitSnapshot = createGitCompatibilitySnapshot(
    subset(["test/language/statements/a.js"]),
    legacyResults([["test/language/statements/a.js", "pass"]]),
    [],
  );
  assert.equal(
    gitSnapshot.classifications.get("test/language/statements/a.js"),
    "pass",
  );
});

test("rejects partitions alongside a legacy Git result manifest", () => {
  const source = legacyResults([["test/language/statements/a.js", "pass"]]);
  assert.throws(
    () =>
      createGitCompatibilitySnapshot(
        subset(["test/language/statements/a.js"]),
        {
          ...source,
          partitionPaths: ["results/language/statements/00.yaml"],
        },
        [],
      ),
    /a legacy Git baseline cannot contain partitions/u,
  );
});

test("rejects an unindexed result partition", () => {
  const source = results([["test/language/statements/a.js", "pass"]]);
  assert.throws(
    () =>
      createCompatibilitySnapshot(
        subset(["test/language/statements/a.js"]),
        {
          ...source,
          partitionPaths: [
            ...source.partitionPaths,
            "results/stale/group/00.yaml",
          ],
        },
        [],
      ),
    /unexpected=results\/stale\/group\/00\.yaml/u,
  );
});

test("rejects a Git snapshot missing an indexed result partition", () => {
  const source = results([["test/language/statements/a.js", "pass"]]);
  assert.throws(
    () =>
      createCompatibilitySnapshot(
        subset(["test/language/statements/a.js"]),
        {
          ...source,
          partitionPaths: selectGitResultPartitionPaths(
            "tests/test262/results.yaml",
          ),
        },
        [],
      ),
    /test262 result partition file set changed: missing=/u,
  );
});

test("enumerates every Git result partition path", () => {
  assert.deepEqual(
    selectGitResultPartitionPaths(
      [
        "tests/test262/results.yaml",
        "tests/test262/results/language/statements/01.yaml",
        "tests/test262/results/language/statements/stale.yaml",
        "tests/test262/results/language/statements/readme.txt",
      ].join("\n"),
    ),
    [
      "results/language/statements/01.yaml",
      "results/language/statements/stale.yaml",
    ],
  );
});

test("rejects pass count loss and path reclassification separately", () => {
  const report = compareCompatibility(
    snapshot(),
    snapshot(undefined, [
      ["test/language/statements/a.js", "unsupported-profile-feature"],
      ["test/language/statements/b.js", "expected-negative"],
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
    snapshot(
      ["test/language/statements/a.js"],
      [["test/language/statements/a.js", "pass"]],
    ),
  );
  assert.deepEqual(
    report.unoverriddenViolations.map((violation) => violation.invariant),
    ["subset-path"],
  );
  assert.equal(
    report.unoverriddenViolations[0]?.scope,
    "test/language/statements/b.js",
  );
});

test("rejects a subset and result path-set mismatch", () => {
  const report = compareCompatibility(
    snapshot(),
    snapshot(undefined, [["test/language/statements/a.js", "pass"]]),
  );
  assert.deepEqual(
    report.unoverriddenViolations.map((violation) => violation.invariant),
    ["manifest-path-set"],
  );
  assert.equal(
    report.unoverriddenViolations[0]?.scope,
    "test/language/statements/b.js",
  );
});

test("rejects a result path missing from the reviewed subset", () => {
  const report = compareCompatibility(
    snapshot(),
    snapshot(
      ["test/language/statements/a.js", "test/language/statements/b.js"],
      [
        ["test/language/statements/a.js", "pass"],
        ["test/language/statements/b.js", "expected-negative"],
        ["test/language/statements/c.js", "unsupported-profile-feature"],
      ],
    ),
  );
  assert.deepEqual(report.unoverriddenViolations, [
    {
      from: "present",
      invariant: "manifest-path-set",
      scope: "test/language/statements/c.js",
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

test("accepts registered property family seed allocations", () => {
  const firstPath = "tests/property/first.property.test.ts";
  const secondPath = "tests/property/second.property.test.ts";
  const summary = validatePropertySeedRegistry(
    seedRegistry([
      {
        end: 0x1ff,
        family: "first",
        owner: firstPath,
        start: 0x100,
      },
      {
        end: 0x2ff,
        family: "second",
        owner: secondPath,
        start: 0x200,
      },
    ]),
    [
      locatedPropertySource(firstPath, "first", 0x100),
      locatedPropertySource(secondPath, "second", 0x200),
    ],
  );
  assert.deepEqual(summary, { allocations: 2, families: 2, seeds: 2 });
});

test("accepts same-domain property seed reuse", () => {
  const path = "tests/property/example.property.test.ts";
  const summary = validatePropertySeedRegistry(
    seedRegistry([
      { end: 0x1ff, family: "example", owner: path, start: 0x100 },
    ]),
    [
      locatedPropertySource(path, "example", 0x100),
      locatedPropertySource(path, "example", 0x100),
    ],
  );
  assert.deepEqual(summary, { allocations: 2, families: 1, seeds: 1 });
});

test("rejects an unregistered property family", () => {
  assert.throws(
    () =>
      validatePropertySeedRegistry(seedRegistry([]), [
        locatedPropertySource(
          "tests/property/unregistered.property.test.ts",
          "unregistered",
          0x100,
        ),
      ]),
    /property family is unregistered/u,
  );
});

test("rejects an unregistered property file with no recognized call", () => {
  const path = "tests/property/unscanned.property.test.ts";
  assert.throws(
    () =>
      validatePropertySeedRegistry(seedRegistry([]), [
        { path, text: "const property = assertProperty;\n" },
      ]),
    /property family is unregistered/u,
  );
});

test("rejects a property seed outside its family block", () => {
  const path = "tests/property/example.property.test.ts";
  assert.throws(
    () =>
      validatePropertySeedRegistry(
        seedRegistry([
          { end: 0x1ff, family: "example", owner: path, start: 0x100 },
        ]),
        [locatedPropertySource(path, "example", 0x200)],
      ),
    /uses seed 512 outside family example block 256\.\.511/u,
  );
});

test("rejects a seed allocated to distinct property domains", () => {
  const path = "tests/property/example.property.test.ts";
  assert.throws(
    () =>
      validatePropertySeedRegistry(
        seedRegistry([
          { end: 0x1ff, family: "example", owner: path, start: 0x100 },
        ]),
        [
          locatedPropertySource(path, "first", 0x100),
          locatedPropertySource(path, "second", 0x100),
        ],
      ),
    /property seed 256 is allocated to both/u,
  );
});

test("rejects overlapping property family blocks", () => {
  assert.throws(
    () =>
      validatePropertySeedRegistry(
        seedRegistry([
          {
            end: 0x1ff,
            family: "first",
            owner: "tests/property/first.property.test.ts",
            start: 0x100,
          },
          {
            end: 0x1ff,
            family: "second",
            owner: "tests/property/second.property.test.ts",
            start: 0x100,
          },
        ]),
        [],
      ),
    /property seed blocks overlap for first and second/u,
  );
});

test("rejects malformed property seed registry data", () => {
  const path = "tests/property/example.property.test.ts";
  assert.throws(
    () =>
      validatePropertySeedRegistry(
        JSON.stringify({
          families: [
            {
              end: 0x200,
              family: "example",
              owner: path,
              start: 0x100,
            },
          ],
          version: 1,
        }),
        [],
      ),
    /must reserve one aligned 256-seed block/u,
  );
});

test("rejects a stale property seed family", () => {
  const path = "tests/property/stale.property.test.ts";
  assert.throws(
    () =>
      validatePropertySeedRegistry(
        seedRegistry([
          { end: 0x1ff, family: "stale", owner: path, start: 0x100 },
        ]),
        [],
      ),
    /property seed family stale has no reviewed property call/u,
  );
});

test("an override permits only its exact named transition", () => {
  const baseline = snapshot();
  const current = snapshot(undefined, [
    ["test/language/statements/a.js", "unsupported-profile-feature"],
    ["test/language/statements/b.js", "expected-negative"],
  ]);
  const classificationOnly = compareCompatibility(
    baseline,
    current,
    `
overrides:
  - invariant: pass-classification
    path: test/language/statements/a.js
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
    path: test/language/statements/a.js
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
      path: "tests/property/example.property.test.ts",
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
        "tests/property/added.property.test.ts",
        "tests/deleted.property.test.ts",
        "tests/retained.property.test.ts",
        "tests/unit.test.ts",
      ].join("\n"),
      "tests/deleted.property.test.ts",
    ),
    [
      "tests/property/added.property.test.ts",
      "tests/retained.property.test.ts",
    ],
  );
});

test("selects baselines for CI events and local branches", () => {
  assert.deepEqual(
    selectBaselineIntent(
      {
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "workflow_dispatch",
      },
      { inputs: { baseline: "manual-base-sha" } },
      undefined,
    ),
    { kind: "commit", revision: "manual-base-sha" },
  );
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
