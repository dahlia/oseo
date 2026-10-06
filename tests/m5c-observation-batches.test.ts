import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { M5cClosureLedger } from "../tools/m5c-closure-ledger.ts";
import {
  assignM5cObservationBatches,
  assignM5cObservationOwners,
  deriveM5cObservationFacts,
  deriveM5cObservationPlan,
  parseM5cObservationPlanFile,
  planM5cObservationSelectors,
  pruneM5cObservationSelectors,
  serializeM5cObservationPlan,
  validateCurrentM5cObservationPlan,
  validateM5cObservationOwnership,
} from "../tools/m5c-observation-batches.ts";
import type {
  M5cObservationFacts,
  M5cObservationInputs,
  M5cObservationSelector,
  M5cRegenerationMeasurement,
} from "../tools/m5c-observation-batches.ts";

const repositoryRoot = resolve(fileURLToPath(import.meta.url), "../..");
const revision = "abc123";
const supported = new Set(["class", "generators"]);
const harnesses = new Set(["assert.js", "compareArray.js"]);

test("loads the plan checker without package build artifacts", () => {
  // CI's check job runs this checker before any package is built.
  const program = `
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (/\\/packages\\/[^/]+\\/dist\\//u.test(result.url)) {
      throw new Error(\`plan checker loaded \${result.url}\`);
    }
    return result;
  },
});

await import("./tools/m5c-observation-batches.ts");
`;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", program],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
});

function source(frontmatter: string, body = "", header = ""): string {
  return `${header}/*---\n${frontmatter}\n---*/\n${body}\n`;
}

function facts(path: string, text: string): M5cObservationFacts {
  return deriveM5cObservationFacts(path, text, revision, supported, harnesses);
}

function plain(path: string, generatedFrom: readonly string[] = []) {
  const header = generatedFrom.map((entry) => `// - ${entry}\n`).join("");
  return facts(
    path,
    source(
      "flags: [generated]",
      "",
      `// Procedurally generated from the following sources:\n${header}`,
    ),
  );
}

const measurement: M5cRegenerationMeasurement = {
  date: "2026-10-07",
  executedVariants: 100,
  host: "test host",
  loadAverage: 1,
  reviewedPaths: 10,
  wallSeconds: 50,
  workers: 2,
};

function inputs(entries: readonly M5cObservationFacts[]): M5cObservationInputs {
  return {
    basis: {
      reviewedHarnesses: [...harnesses].toSorted(),
      supportedFeatures: [...supported].toSorted(),
    },
    executedVariants: 100,
    existingPartitions: new Set(),
    facts: entries,
    suiteRevision: revision,
  };
}

test("facts come from frontmatter, generator headers, and syntax", () => {
  const generated = facts(
    "test/language/a/gen.js",
    source(
      "features: [class]\nflags: [generated, onlyStrict]",
      "class C {}",
      "// - src/dstr/case-a.case\n// - src/dstr/default/tmpl.template\n",
    ),
  );
  assert.deepEqual(generated.generatedFrom, [
    "src/dstr/case-a.case",
    "src/dstr/default/tmpl.template",
  ]);
  assert.deepEqual(generated.prerequisites, []);
  assert.equal(generated.executableVariants, 2);

  const blocked = facts(
    "test/language/a/blocked.js",
    source(
      "features: [dynamic-import, class]\nincludes: [fnGlobalObject.js]",
      "var x = $262.createRealm(); eval('1');",
    ),
  );
  assert.deepEqual(blocked.prerequisites, [
    "feature:dynamic-import",
    "harness:fnGlobalObject.js",
    "host:$262.createRealm",
  ]);
  assert.deepEqual(blocked.dynamicSource, ["eval"]);
  assert.equal(blocked.executableVariants, 4, "costed after its prerequisites");

  const raw = facts(
    "test/language/a/raw.js",
    source("flags: [raw]\nincludes: [fnGlobalObject.js]"),
  );
  assert.deepEqual(raw.prerequisites, []);
  assert.equal(raw.executableVariants, 2);

  const negative = facts(
    "test/language/a/negative.js",
    source("negative:\n  phase: parse\n  type: SyntaxError"),
  );
  assert.equal(negative.negativePhase, "parse");
  assert.equal(negative.executableVariants, 0);

  const local = facts(
    "test/language/a/local.js",
    source("", "var eval = 1; function f() { return Function; } f();"),
  );
  assert.deepEqual(local.dynamicSource, ["Function"]);
  assert.equal(local.executableVariants, 4);
});

test("an unplanned prerequisite stops planning", () => {
  const entry = facts(
    "test/language/a/new.js",
    source("features: [brand-new-proposal]"),
  );
  assert.throws(
    () => planM5cObservationSelectors([entry], { paths: 5, reviewUnits: 5 }),
    /feature:brand-new-proposal, which has no planned M5c node/u,
  );
});

test("the planner covers every path once within the limits", () => {
  const entries = [
    ...Array.from({ length: 3 }, (_, index) =>
      plain(`test/language/a/x-${index}.js`),
    ),
    ...Array.from({ length: 2 }, (_, index) =>
      plain(`test/language/b/y-${index}.js`),
    ),
    plain("test/language/c/z.js"),
    ...Array.from({ length: 5 }, (_, index) =>
      plain(`test/language/d/w-${index}.js`),
    ),
  ];
  const limits = { paths: 4, reviewUnits: 4 };
  const selectors = planM5cObservationSelectors(entries.toReversed(), limits);
  assert.deepEqual(
    selectors,
    planM5cObservationSelectors(entries, limits),
    "planning does not depend on input order",
  );
  const assigned = assignM5cObservationBatches(selectors, entries);
  const seen = assigned.flat().map((entry) => entry.path);
  assert.equal(seen.length, entries.length);
  assert.equal(new Set(seen).size, entries.length);
  for (const batch of assigned) {
    assert.ok(batch.length > 0 && batch.length <= limits.paths);
  }
  assert.deepEqual(
    selectors.map((selector) => [selector.id, selector.prefixes]),
    [
      ["observation-batch-01", ["test/language/a/x-"]],
      ["observation-batch-02", ["test/language/b/y-", "test/language/c/"]],
      [
        "observation-batch-03",
        [
          "test/language/d/w-0.",
          "test/language/d/w-1.",
          "test/language/d/w-2.",
          "test/language/d/w-3.",
        ],
      ],
      ["observation-batch-04", ["test/language/d/w-4."]],
    ],
  );
});

test("review units count generator sources once", () => {
  const entries = Array.from({ length: 6 }, (_, index) =>
    plain(`test/language/a/gen-${index}.js`, [
      "src/case.case",
      `src/t${index % 2}.template`,
    ]),
  );
  const selectors = planM5cObservationSelectors(entries, {
    paths: 10,
    reviewUnits: 3,
  });
  assert.equal(selectors.length, 1);
  const plan = deriveM5cObservationPlan(
    selectors,
    inputs(entries),
    measurement,
  );
  assert.equal(plan.batches[0]?.reviewUnits, 3);
  assert.equal(plan.batches[0]?.generatedPaths, 6);
});

test("small prerequisite sets share one tail batch", () => {
  const big = Array.from({ length: 3 }, (_, index) =>
    facts(
      `test/language/import/d-${index}.js`,
      source("features: [dynamic-import]"),
    ),
  );
  const small = [
    facts("test/language/h/hash.js", source("features: [hashbang]")),
    facts("test/built-ins/f/f.js", source("includes: [fnGlobalObject.js]")),
  ];
  const selectors = planM5cObservationSelectors(
    [plain("test/language/p.js"), ...big, ...small],
    { paths: 10, reviewUnits: 10 },
    3,
  );
  assert.deepEqual(
    selectors.map((selector) => selector.prerequisiteSets),
    [
      [""],
      ["dynamic-import"],
      ["fn-global-object-harness", "hashbang-comments"],
    ],
  );
  assert.deepEqual(selectors[2]?.prefixes, ["test/"]);
  const plan = deriveM5cObservationPlan(
    selectors,
    inputs([plain("test/language/p.js"), ...big, ...small]),
    measurement,
  );
  assert.deepEqual(
    serializeM5cObservationPlan(plan, measurement)
      .split("\n")
      .filter((line) => line.startsWith("      - ") && !line.includes("/")),
    [
      "      - observation-batch-plan",
      "      - observation-batch-plan",
      "      - dynamic-import",
      "      - observation-batch-plan",
      "      - fn-global-object-harness",
      "      - hashbang-comments",
    ],
  );
});

function selectorsFor(
  entries: readonly M5cObservationFacts[],
): readonly M5cObservationSelector[] {
  return planM5cObservationSelectors(entries, { paths: 2, reviewUnits: 2 });
}

test("assignment rejects missed, duplicated, and invented selections", () => {
  const entries = [
    plain("test/language/a/one.js"),
    plain("test/language/a/two.js"),
    plain("test/language/b/three.js"),
  ];
  const selectors = selectorsFor(entries);
  assert.equal(selectors.length, 2);
  assert.throws(
    () => assignM5cObservationBatches(selectors.slice(0, 1), entries),
    /No observation batch selects unreviewed path test\/language\/b\/three/u,
  );
  const first = selectors[0];
  assert.ok(first != null);
  assert.throws(
    () =>
      assignM5cObservationBatches(
        [...selectors, { ...first, id: "observation-batch-09" }],
        entries,
      ),
    /prefix test\/language\/a\/ repeats/u,
  );
  assert.throws(
    () =>
      assignM5cObservationBatches(
        [
          ...selectors,
          {
            ...first,
            id: "observation-batch-09",
            prefixes: ["test/language/z/"],
          },
        ],
        entries,
      ),
    /observation-batch-09 prefix test\/language\/z\/ selects no unreviewed/u,
  );
  assert.throws(
    () =>
      assignM5cObservationBatches(
        [
          { ...first, prerequisiteSets: ["", "dynamic-import"] },
          ...selectors.slice(1),
        ],
        entries,
      ),
    /prerequisite set "dynamic-import" selects no unreviewed path/u,
  );
  assert.throws(
    () => assignM5cObservationBatches([{ ...first, id: "batch" }], entries),
    /unique observation-batch-NN ID/u,
  );
});

test("pruning drops landed batches without moving other paths", () => {
  const entries = [
    plain("test/language/a/one.js"),
    plain("test/language/a/two.js"),
    plain("test/language/b/three.js"),
  ];
  const selectors = selectorsFor(entries);
  const remaining = entries.slice(2);
  const pruned = pruneM5cObservationSelectors(selectors, remaining);
  assert.deepEqual(
    pruned.map((selector) => selector.id),
    ["observation-batch-02"],
  );
  assert.deepEqual(
    assignM5cObservationBatches(pruned, remaining)[0]?.map(
      (entry) => entry.path,
    ),
    ["test/language/b/three.js"],
  );
});

test("the serialized plan round-trips its selectors", () => {
  const entries = [
    plain("test/language/a/one.js"),
    plain("test/language/b/two.js"),
  ];
  const selectors = selectorsFor(entries);
  const text = serializeM5cObservationPlan(
    deriveM5cObservationPlan(selectors, inputs(entries), measurement),
    measurement,
  );
  assert.deepEqual(parseM5cObservationPlanFile(text), {
    basis: inputs(entries).basis,
    selectors,
  });
});

function ledger(
  entries: readonly {
    readonly owner: string;
    readonly path: string;
    readonly state: "pass" | "unreviewed";
  }[],
): M5cClosureLedger {
  return {
    entries: entries.map((entry) => ({ ...entry, prerequisites: [] })),
    ownerNotes: new Map(),
    suiteRevision: revision,
  };
}

test("membership follows the recorded basis, not later admissions", () => {
  const path = "test/language/import/d.js";
  const text = source("features: [dynamic-import]");
  const entries = [plain("test/language/import/p.js"), facts(path, text)];
  const selectors = planM5cObservationSelectors(
    entries,
    { paths: 5, reviewUnits: 5 },
    1,
  );
  const recorded = parseM5cObservationPlanFile(
    serializeM5cObservationPlan(
      deriveM5cObservationPlan(selectors, inputs(entries), measurement),
      measurement,
    ),
  );
  // The dynamic-import node lands and admits the feature. Facts derived
  // from the live subset would give the path an empty prerequisite set and
  // move it into the plain batch; the recorded basis keeps it in place.
  const live = deriveM5cObservationFacts(
    path,
    text,
    revision,
    new Set([...supported, "dynamic-import"]),
    harnesses,
  );
  assert.deepEqual(live.prerequisites, []);
  const frozen = deriveM5cObservationFacts(
    path,
    text,
    revision,
    new Set(recorded.basis.supportedFeatures),
    new Set(recorded.basis.reviewedHarnesses),
  );
  const assigned = assignM5cObservationBatches(recorded.selectors, [
    entries[0] ?? frozen,
    frozen,
  ]);
  assert.deepEqual(
    assigned.map((batch) => batch.map((entry) => entry.path)),
    [["test/language/import/p.js"], [path]],
  );
});

test("ledger owners and graph nodes must match the batches", () => {
  const entries = [
    plain("test/language/a/one.js"),
    facts("test/language/b/two.js", source("features: [hashbang]")),
  ];
  const selectors = planM5cObservationSelectors(
    entries,
    { paths: 5, reviewUnits: 5 },
    1,
  );
  const plan = deriveM5cObservationPlan(
    selectors,
    inputs(entries),
    measurement,
  );
  const assigned = assignM5cObservationBatches(selectors, entries);
  const nodes = new Map<string, readonly string[]>([
    ["observation-batch-plan", []],
    ["hashbang-comments", ["observation-batch-plan"]],
    ["observation-batch-01", ["observation-batch-plan"]],
    ["observation-batch-02", ["hashbang-comments", "observation-batch-plan"]],
  ]);
  const owned = assignM5cObservationOwners(
    ledger([
      { owner: "observation", path: "test/language/a/pass.js", state: "pass" },
      {
        owner: "node:observation-batch-plan",
        path: "test/language/a/one.js",
        state: "unreviewed",
      },
      {
        owner: "node:observation-batch-plan",
        path: "test/language/b/two.js",
        state: "unreviewed",
      },
    ]),
    plan,
    assigned,
  );
  assert.deepEqual(
    owned.entries.map((entry) => entry.owner),
    ["observation", "node:observation-batch-01", "node:observation-batch-02"],
  );
  assert.deepEqual(
    [...owned.ownerNotes.keys()],
    ["node:observation-batch-01", "node:observation-batch-02"],
  );
  validateM5cObservationOwnership(plan, assigned, owned, (id) => nodes.get(id));

  assert.throws(
    () =>
      validateM5cObservationOwnership(plan, assigned, owned, (id) =>
        id === "observation-batch-02"
          ? ["observation-batch-plan"]
          : nodes.get(id),
      ),
    /observation-batch-02 must depend on hashbang-comments/u,
  );
  assert.throws(
    () =>
      validateM5cObservationOwnership(plan, assigned, owned, (id) =>
        id === "observation-batch-01" ? undefined : nodes.get(id),
      ),
    /observation-batch-01 has no graph node/u,
  );
  const stale = {
    ...owned,
    entries: owned.entries.map((entry) =>
      entry.path === "test/language/a/one.js"
        ? { ...entry, owner: "node:observation-batch-plan" }
        : entry,
    ),
  };
  assert.throws(
    () =>
      validateM5cObservationOwnership(plan, assigned, stale, (id) =>
        nodes.get(id),
      ),
    /owner of test\/language\/a\/one\.js is node:observation-batch-plan/u,
  );
  const reviewed = {
    ...owned,
    entries: owned.entries.map((entry) =>
      entry.path === "test/language/a/one.js"
        ? { ...entry, owner: "observation", state: "pass" as const }
        : entry,
    ),
  };
  assert.throws(
    () =>
      validateM5cObservationOwnership(plan, assigned, reviewed, (id) =>
        nodes.get(id),
      ),
    /selects reviewed path test\/language\/a\/one\.js/u,
  );
  const shorter = { ...owned, entries: owned.entries.slice(0, 2) };
  assert.throws(
    () =>
      validateM5cObservationOwnership(plan, assigned, shorter, (id) =>
        nodes.get(id),
      ),
    /select 1 paths outside the ledger, first test\/language\/b\/two\.js/u,
  );
});

test("each landing costs a scoped update and a full gate", () => {
  const entries = [
    plain("test/language/a/one.js"),
    plain("test/language/b/two.js"),
  ];
  const plan = deriveM5cObservationPlan(
    planM5cObservationSelectors(entries, { paths: 1, reviewUnits: 1 }),
    inputs(entries),
    measurement,
  );
  // Each path without a strictness flag runs four variants at 0.5 s each.
  // The first landing scopes its update to 4 variants and gates 104, the
  // second scopes 4 and gates 108; full updates would run 104 and 108 too.
  assert.equal(plan.batches.length, 2);
  assert.equal(plan.cost.scheduleSeconds, 110);
  assert.equal(plan.cost.fullUpdateScheduleSeconds, 212);
  assert.equal(plan.finalExecutedVariants, 108);
});

test("the checked-in observation batch plan is current", () => {
  const plan = validateCurrentM5cObservationPlan();
  assert.equal(
    plan.batches.reduce((sum, batch) => sum + batch.paths, 0),
    plan.unreviewedPaths,
  );
});
