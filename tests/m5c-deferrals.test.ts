import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Test262Result } from "../packages/testkit/src/index.ts";
import { stringify as stringifyYaml } from "yaml";

import type { M5cClosureLedger } from "../tools/m5c-closure-ledger.ts";
import {
  roadmapDeferralTargets,
  validateCurrentM5cDeferrals,
  validateM5cDeferrals,
} from "../tools/m5c-deferrals.ts";
import type { M5cDeferralInputs } from "../tools/m5c-deferrals.ts";
import {
  exclusionAuditDigest,
  exclusionObservationDigest,
} from "../tools/m5c-exclusion-audit.ts";

const revision = "fixture";
const path = "test/language/module-code/example.js";
const otherPath = "test/language/module-code/other.js";
const source = 'import "./example_FIXTURE.js";';
const record = [
  "ADR 0031: Named deferral of measured M5 residue",
  "===============================================",
  "",
  "Status",
  "------",
  "",
  "Accepted.",
  "",
].join("\n");
const roadmap = [
  "Roadmap",
  "=======",
  "",
  "A deferred dynamic-source and staged-compilation track is recorded in",
  "[*PLAN-DYN.md*](./PLAN-DYN.md). It keeps closed binaries compiler-free.",
  "",
  "A native I/O infrastructure track is recorded in",
  "[*PLAN-NIO.md*](./PLAN-NIO.md).",
  "",
  ...["M4: Modules", "M5: Measured compatibility", "M6: Web API"].flatMap(
    (heading) => [heading, "-".repeat(heading.length), ""],
  ),
].join("\n");
const observation = {
  passed: false,
  detail: "error[OSEO1001]: ImportDeclaration is outside the M1 profile.",
  unsupportedCapability: "profile-syntax",
};

function result(target: string): Test262Result {
  return {
    case: {
      async: false,
      features: [],
      flags: ["module"],
      includes: [],
      mode: "module",
      path: target,
      strictness: ["strict"],
      suiteRevision: revision,
    },
    classification: "unsupported-profile-feature",
    dependencies: ["modules"],
    observation,
    unsupportedFeatures: [],
  };
}

function ledger(owner = "deferred"): M5cClosureLedger {
  return {
    entries: [path, otherPath].map((target) => ({
      owner: target === path ? owner : "node:static-import-remediation",
      path: target,
      prerequisites: ["modules"],
      state: "unsupported-profile-feature" as const,
    })),
    ownerNotes: new Map(),
    suiteRevision: revision,
  };
}

interface EntryFixture {
  attempts?: { decisions?: string[]; nodes?: string[] };
  family?: string;
  observationDigest: string;
  reason?: string;
  remainingContract?: string;
  section?: string;
  sourceDigest: string;
  targetMilestone: string;
  targetPlan?: string;
}

interface ListFixture {
  families: Record<string, { reason?: string }>;
  paths: Record<string, EntryFixture>;
  record: { digest: string; stem: string };
  suiteRevision: string;
  version: number;
}

function fixture() {
  const list: ListFixture = {
    version: 1,
    suiteRevision: revision,
    record: {
      stem: "0031-m5-named-deferral",
      digest: exclusionAuditDigest(record),
    },
    families: {
      "static-specifier-import": {
        reason: "Only the declined static-specifier import track closes it.",
      },
    },
    paths: {
      [path]: {
        family: "static-specifier-import",
        section: "sec-moduleevaluation",
        remainingContract: "The imported module evaluates before its importer.",
        attempts: {
          nodes: ["static-import-remediation"],
          decisions: ["2026-11-01 item 2"],
        },
        targetMilestone: "PLAN-DYN.md",
        sourceDigest: exclusionAuditDigest(source),
        observationDigest: exclusionObservationDigest(observation),
      },
    },
  };
  const inputs: M5cDeferralInputs = {
    ledger: ledger(),
    nodeIds: new Set(["m5-exit-audit", "static-import-remediation"]),
    record,
    results: [result(path), result(otherPath)],
    roadmap,
    sources: new Map([[path, source]]),
  };
  return { inputs, list };
}

function entry(list: ListFixture): EntryFixture {
  const value = list.paths[path];
  assert.ok(value != null);
  return value;
}

function rejects(
  change: (value: ReturnType<typeof fixture>) => void,
  message: RegExp,
): void {
  const value = fixture();
  change(value);
  assert.throws(
    () => validateM5cDeferrals(stringifyYaml(value.list), value.inputs),
    message,
  );
}

test("a bound entry is counted by family and target", () => {
  const { inputs, list } = fixture();
  const summary = validateM5cDeferrals(stringifyYaml(list), inputs);
  assert.equal(summary.paths, 1);
  assert.deepEqual([...summary.families], [["static-specifier-import", 1]]);
  assert.deepEqual([...summary.milestones], [["PLAN-DYN.md", 1]]);
  entry(list).targetMilestone = "M6";
  assert.deepEqual(
    [...validateM5cDeferrals(stringifyYaml(list), inputs).milestones],
    [["M6", 1]],
  );
});

test("the checked-in deferral list is valid", () => {
  const summary = validateCurrentM5cDeferrals();
  assert.equal(
    summary.paths,
    [...summary.families.values()].reduce((sum, count) => sum + count, 0),
  );
});

test("the roadmap offers later milestones and deferred track plans", () => {
  const targets = roadmapDeferralTargets(
    readFileSync(new URL("../ROADMAP.md", import.meta.url), "utf8"),
  );
  assert.equal(targets.milestones.get("M6"), 6);
  assert.ok(targets.deferredTracks.has("PLAN-DYN.md"));
  assert.ok(!targets.deferredTracks.has("PLAN-NIO.md"));
  assert.throws(
    () => roadmapDeferralTargets("Roadmap\n=======\n"),
    /names no milestone headings/u,
  );
});

test("the header must name its version, revision, and record", () => {
  rejects(({ list }) => {
    list.version = 2;
  }, /version must be 1/u);
  rejects(({ list }) => {
    list.suiteRevision = "other";
  }, /suiteRevision differs/u);
  rejects(({ list }) => {
    list.record.stem = "0019-m5-claim-closure";
  }, /record must be 0031-m5-named-deferral/u);
  rejects(({ list }) => {
    Object.assign(list, { extra: true });
  }, /list keys differ: missing=none unexpected=extra/u);
});

test("an edited ADR 0031 makes the list stale", () => {
  rejects(({ inputs }) => {
    Object.assign(inputs, { record: `${record}\nEdited.\n` });
  }, /changed; review every deferral entry/u);
});

test("no path is deferred while ADR 0031 is not accepted", () => {
  const proposed = record.replace("Accepted.", "Proposed.");
  rejects(({ inputs, list }) => {
    Object.assign(inputs, { record: proposed });
    list.record.digest = exclusionAuditDigest(proposed);
  }, /is not accepted, so no path can be deferred/u);
  const { inputs, list } = fixture();
  list.families = {};
  list.paths = {};
  list.record.digest = exclusionAuditDigest(proposed);
  assert.equal(
    validateM5cDeferrals(stringifyYaml(list), {
      ...inputs,
      ledger: ledger("node:static-import-remediation"),
      record: proposed,
    }).paths,
    0,
  );
});

test("a family needs a well-formed key, a reason, and a path", () => {
  rejects(({ list }) => {
    list.families.Static = { reason: "Reason." };
  }, /family key is malformed: Static/u);
  rejects(({ list }) => {
    list.families["static-specifier-import"] = { reason: " " };
  }, /family static-specifier-import reason must be a nonempty string/u);
  rejects(({ list }) => {
    list.families["static-specifier-import"] = {};
  }, /family static-specifier-import keys differ: missing=reason/u);
  rejects(({ list }) => {
    list.families["unused-family"] = { reason: "Reason." };
  }, /family unused-family names no path/u);
});

test("an entry must name a known family", () => {
  rejects(({ list }) => {
    entry(list).family = "constructor";
  }, /names unknown family constructor/u);
  rejects(({ list }) => {
    delete entry(list).family;
  }, /keys differ: missing=family/u);
});

test("an entry needs a reason, section, and remaining contract", () => {
  rejects(({ list }) => {
    entry(list).reason = "";
  }, /reason must be a nonempty string/u);
  rejects(({ list }) => {
    entry(list).section = "";
  }, /section must be a nonempty string/u);
  rejects(({ list }) => {
    delete entry(list).remainingContract;
  }, /keys differ: missing=remainingContract/u);
  rejects(({ list }) => {
    entry(list).targetPlan = "PLAN-DYN.md";
  }, /keys differ: missing=none unexpected=targetPlan/u);
});

test("attempts must name a known node or a track decision", () => {
  rejects(({ list }) => {
    entry(list).attempts = { nodes: [], decisions: [] };
  }, /attempts name no evidence node and no track decision/u);
  rejects(({ list }) => {
    entry(list).attempts = { nodes: ["removed-node"], decisions: [] };
  }, /attempt names unknown node removed-node/u);
  rejects(({ list }) => {
    entry(list).attempts = { nodes: ["static-import-remediation"] };
  }, /attempts keys differ: missing=decisions/u);
  rejects(({ list }) => {
    entry(list).attempts = { nodes: ["a", "a"], decisions: [] };
  }, /attempt nodes repeats an item/u);
  const { inputs, list } = fixture();
  entry(list).attempts = { nodes: [], decisions: ["2026-11-01 item 2"] };
  assert.equal(validateM5cDeferrals(stringifyYaml(list), inputs).paths, 1);
});

test("the target must follow M5 in ROADMAP.md", () => {
  for (const target of ["M5", "M4"]) {
    rejects(
      ({ list }) => {
        entry(list).targetMilestone = target;
      },
      new RegExp(`target ${target} is not a milestone after M5`, "u"),
    );
  }
  for (const target of ["M9", "M5d", "PLAN-NIO.md", "PLAN-NONE.md"]) {
    rejects(
      ({ list }) => {
        entry(list).targetMilestone = target;
      },
      new RegExp(
        `target ${target.replace(".", "\\.")} is neither a ROADMAP.md ` +
          "milestone nor the plan of a deferred ROADMAP.md track",
        "u",
      ),
    );
  }
});

test("a stale source or observation digest fails", () => {
  rejects(({ inputs }) => {
    Object.assign(inputs, { sources: new Map([[path, `${source}\n`]]) });
  }, /source changed; review the entry/u);
  rejects(({ inputs }) => {
    Object.assign(inputs, {
      results: [
        { ...result(path), observation: { ...observation, detail: "other" } },
      ],
    });
  }, /observation changed; review the entry/u);
});

test("only an unsupported path with the deferred owner is deferred", () => {
  rejects(({ inputs }) => {
    Object.assign(inputs, {
      ledger: ledger("node:static-import-remediation"),
    });
  }, /needs the deferred ledger owner, not node:static-import-remediation/u);
  rejects(({ inputs }) => {
    Object.assign(inputs, {
      results: [{ ...result(path), classification: "semantic-failure" }],
    });
  }, /is semantic-failure; only an unsupported-profile-feature path/u);
  rejects(({ inputs }) => {
    Object.assign(inputs, { sources: new Map() });
  }, /lacks inventory, observation, or source/u);
});

test("every deferred ledger owner needs an entry", () => {
  rejects(
    ({ inputs }) => {
      Object.assign(inputs, {
        ledger: {
          ...inputs.ledger,
          entries: inputs.ledger.entries.map((row) =>
            Object.assign({}, row, { owner: "deferred" }),
          ),
        },
      });
    },
    new RegExp(`Deferred ledger path has no entry: ${otherPath}`, "u"),
  );
});

test("paths must be in code-unit order", () => {
  rejects(
    ({ inputs, list }) => {
      const first = entry(list);
      list.paths = { [otherPath]: { ...first }, [path]: first };
      Object.assign(inputs, {
        ledger: {
          ...inputs.ledger,
          entries: inputs.ledger.entries.map((row) =>
            Object.assign({}, row, { owner: "deferred" }),
          ),
        },
        sources: new Map([
          [path, source],
          [otherPath, source],
        ]),
      });
    },
    new RegExp(`path is unordered: ${path}`, "u"),
  );
});
