import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Test262Result } from "../packages/testkit/src/index.ts";
import { stringify as stringifyYaml } from "yaml";

import {
  exclusionAuditDigest,
  exclusionObservationDigest,
  hasEvalCall,
  validateCurrentM5cExclusionAudit,
  validateM5cExclusionAudit,
} from "../tools/m5c-exclusion-audit.ts";
import type { M5cExclusionAuditInputs } from "../tools/m5c-exclusion-audit.ts";
import { parseM5cClosureLedger } from "../tools/m5c-closure-ledger.ts";

const revision = "fixture";
const path = "test/language/eval-code/example.js";
const owner = "adr:0016-dynamic-source-boundary";
const remediationOwner = "node:dynamic-source-coverage-remediation";
const annexOwner = "adr:0013-m5-edition-and-manifest";
const annexRemediationOwner = "node:regexp-split-coverage-remediation";
const source = 'eval("1");';
const observation = {
  passed: false,
  detail: "error[OSEO1001]: Unknown binding 'eval'.",
  unsupportedCapability: "profile-syntax",
};
const result: Test262Result = {
  case: {
    async: false,
    features: [],
    flags: [],
    includes: [],
    mode: "script",
    path,
    strictness: ["non-strict"],
    suiteRevision: revision,
  },
  classification: "unsupported-profile-feature",
  dependencies: ["functions"],
  observation,
  unsupportedFeatures: [],
};
const records = new Map(
  [
    "0013-m5-edition-and-manifest",
    "0016-dynamic-source-boundary",
    "0019-m5-claim-closure",
  ].map((stem) => [
    stem,
    readFileSync(new URL(`../docs/adr/${stem}.md`, import.meta.url), "utf8"),
  ]),
);

function fixture(
  remediation = false,
  sourceText = source,
  observed = observation,
) {
  const recordsEvidence = Object.fromEntries(
    [...records].map(([stem, text]) => [
      stem,
      {
        digest: exclusionAuditDigest(text),
        authorization: [
          stem.startsWith("0013")
            ? "Annex B legacy web semantics are excluded from the claim."
            : stem.startsWith("0016")
              ? "`eval` in call position, the `Function` constructor, " +
                "`new Function`, and every constructor that compiles " +
                "source text stay outside the M5 language profile."
              : "ADR 0016 is such a record for the dynamic source family.",
        ],
        reopening: [
          stem.startsWith("0013")
            ? "Evidence that a claimed-excluded section is required by " +
              "a dependency inside the boundary reopens the " +
              "optional-section policy."
            : stem.startsWith("0016")
              ? "a probe demonstrates staged compilation with acceptable " +
                "code lifetime, rooting, and target coverage; or"
              : "Evidence that a normative section inside the claim " +
                "depends on the excluded dynamic source family for " +
                "behavior other than source evaluation reopens the " +
                "boundary rather than this record.",
        ],
      },
    ]),
  );
  const audit = {
    version: 1,
    suiteRevision: revision,
    records: recordsEvidence,
    assessments: {
      reviewed: {
        disposition: remediation ? "remediation" : "exclusion",
        normativeDependency: remediation
          ? "not-demonstrated"
          : "source-evaluation-only",
        reason: "The source and diagnostic were reviewed for this contract.",
      },
    },
    paths: [
      {
        path,
        proposedOwner: owner,
        priorCohort: "source-subject",
        sourceDigest: exclusionAuditDigest(sourceText),
        observationDigest: exclusionObservationDigest(observed),
        missingDynamicTag: true,
        section: "sec-performeval",
        subject: "Direct source evaluation",
        assessment: "reviewed",
      },
    ],
  };
  const inputs: M5cExclusionAuditInputs = {
    ledger: {
      entries: [
        {
          path,
          owner: remediation ? remediationOwner : owner,
          prerequisites: result.dependencies,
          state: result.classification,
        },
      ],
      ownerNotes: new Map(),
      suiteRevision: revision,
    },
    results: [{ ...result, observation: observed }],
    records,
    sources: new Map([[path, sourceText]]),
  };
  return { audit, inputs };
}

test("accepted bounded rejection and tag debt are counted separately", () => {
  const { audit, inputs } = fixture();
  assert.deepEqual(validateM5cExclusionAudit(stringifyYaml(audit), inputs), {
    exclusions: 1,
    remediation: 0,
    missingDynamicTags: 1,
  });
});

test("exact parse-time dynamic import rejection accepts either owner", () => {
  for (const remediation of [false, true]) {
    for (const mode of ["script", "module"] as const) {
      const { audit, inputs } = fixture(remediation, 'import("x");', {
        ...observation,
        detail:
          'failed (1): stdout="" stderr="test/example.js:1:1: ' +
          'error[OSEO1001]: ImportExpression is outside the M1 profile.\\n"',
      });
      assert.deepEqual(
        validateM5cExclusionAudit(stringifyYaml(audit), {
          ...inputs,
          results: [
            {
              ...inputs.results[0]!,
              case: {
                ...result.case,
                mode,
                features: ["dynamic-import"],
              },
            },
          ],
        }),
        {
          exclusions: remediation ? 0 : 1,
          remediation: remediation ? 1 : 0,
          missingDynamicTags: 1,
        },
      );
    }
  }
});

test("near-miss dynamic import diagnostics remain outside the surface", () => {
  for (const detail of [
    "error[OSEO1001]: ImportDeclaration is outside the M1 profile.",
    "error[OSEO1001]: ImportExpression is outside the M4 profile.",
    "error[OSEO1001]: ImportExpression is outside the M1 profile. Extra text.",
    "error[OSEO2001]: ImportExpression is outside the M1 profile.",
  ]) {
    const { audit, inputs } = fixture(false, 'import("x");', {
      ...observation,
      detail,
    });
    assert.throws(
      () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
      /outside the record surface/u,
      detail,
    );
  }
});

test("dynamic import tag debt must match the reviewed dependencies", () => {
  const { audit, inputs } = fixture(false, 'import("x");', {
    ...observation,
    detail: "error[OSEO1001]: ImportExpression is outside the M1 profile.",
  });
  const tagged: M5cExclusionAuditInputs = {
    ...inputs,
    results: [
      {
        ...inputs.results[0]!,
        dependencies: [...result.dependencies, "dynamic-source"],
      },
    ],
  };
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), tagged),
    /dependency-tag debt changed/u,
  );
  audit.paths[0]!.missingDynamicTag = false;
  assert.deepEqual(validateM5cExclusionAudit(stringifyYaml(audit), tagged), {
    exclusions: 1,
    remediation: 0,
    missingDynamicTags: 0,
  });
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
    /dependency-tag debt changed/u,
  );
});

test("unresolved non-source coverage requires remediation ownership", () => {
  const { audit, inputs } = fixture(true);
  assert.equal(
    validateM5cExclusionAudit(stringifyYaml(audit), inputs).remediation,
    1,
  );
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), fixture().inputs),
    /requires owner node:dynamic-source-coverage-remediation/u,
  );
  audit.assessments.reviewed.disposition = "exclusion";
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
    /Unresolved subject coverage cannot keep an ADR/u,
  );
});

test("withdrawn records and stale source, observation, or tags fail", () => {
  const { audit, inputs } = fixture();
  const text = stringifyYaml(audit);
  const withdrawn = new Map(records);
  withdrawn.set("0016-dynamic-source-boundary", "Status\n------\n\nProposed.");
  assert.throws(
    () => validateM5cExclusionAudit(text, { ...inputs, records: withdrawn }),
    /not accepted/u,
  );
  const changed = new Map(records);
  changed.set(
    "0016-dynamic-source-boundary",
    `${records.get("0016-dynamic-source-boundary")}\nChanged boundary.\n`,
  );
  assert.throws(
    () => validateM5cExclusionAudit(text, { ...inputs, records: changed }),
    /changed; review its boundary/u,
  );
  assert.throws(
    () =>
      validateM5cExclusionAudit(text, {
        ...inputs,
        sources: new Map([[path, "eval;"]]),
      }),
    /Audit source changed/u,
  );
  assert.throws(
    () =>
      validateM5cExclusionAudit(text, {
        ...inputs,
        results: [
          { ...result, observation: { ...observation, detail: "new" } },
        ],
      }),
    /Audit observation changed/u,
  );
  assert.throws(
    () =>
      validateM5cExclusionAudit(text, {
        ...inputs,
        results: [{ ...result, dependencies: ["functions", "dynamic-source"] }],
      }),
    /dependency-tag debt changed/u,
  );
});

test("quotes, duplicate paths, and unaudited ADR owners fail", () => {
  const { audit, inputs } = fixture();
  audit.records["0016-dynamic-source-boundary"]!.reopening = [
    "invented trigger",
  ];
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
    /quote is absent/u,
  );
  const duplicate = fixture().audit;
  duplicate.paths.push(duplicate.paths[0]!);
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(duplicate), inputs),
    /duplicated or unordered/u,
  );
  const missing = fixture().audit;
  missing.paths = [];
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(missing), inputs),
    /no reviewed exclusion audit/u,
  );
});

test("empty reopening quotes cannot satisfy the authorization check", () => {
  const { audit, inputs } = fixture();
  audit.records["0016-dynamic-source-boundary"]!.reopening = [" "];
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
    /nonempty string list/u,
  );
});

test("a snapshot cannot authorize a different unsupported surface", () => {
  const { audit, inputs } = fixture();
  const outside = {
    ...observation,
    detail: "error[OSEO1001]: Unknown binding '$262'.",
  };
  audit.paths[0]!.observationDigest = exclusionObservationDigest(outside);
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(audit), {
        ...inputs,
        results: [{ ...result, observation: outside }],
      }),
    /outside the record surface/u,
  );
});

test("the run-time Function and eval boundaries are record surfaces", () => {
  // Another realm's %Function% and %eval% report the ADR 0016 boundary at
  // run time rather than at compile time (ADR 0027).
  for (const name of ["Function", "eval"]) {
    const { audit, inputs } = fixture();
    const runtime = {
      ...observation,
      detail:
        `error[OSEO1001]: ${name} compiles source text at run time, ` +
        "which is outside the admitted profile.",
    };
    audit.paths[0]!.observationDigest = exclusionObservationDigest(runtime);
    assert.deepEqual(
      validateM5cExclusionAudit(stringifyYaml(audit), {
        ...inputs,
        results: [{ ...result, observation: runtime }],
      }),
      { exclusions: 1, remediation: 0, missingDynamicTags: 1 },
      name,
    );
  }
});

test("promotion uses observation ownership and removes the exclusion", () => {
  const { audit, inputs } = fixture();
  const promoted: M5cExclusionAuditInputs = {
    ...inputs,
    ledger: {
      ...inputs.ledger,
      entries: [
        {
          path,
          owner: "observation",
          prerequisites: [],
          state: "pass",
        },
      ],
    },
    results: [
      { ...result, classification: "pass", observation: { passed: true } },
    ],
  };
  assert.deepEqual(validateM5cExclusionAudit(stringifyYaml(audit), promoted), {
    exclusions: 0,
    remediation: 0,
    missingDynamicTags: 0,
  });
});

test("checked-in audit counts match ledger owners after promotions", () => {
  const ledger = parseM5cClosureLedger(
    readFileSync(
      new URL("../docs/m5c-closure/ledger.yaml", import.meta.url),
      "utf8",
    ),
  ).ledger;
  const exclusions = ledger.entries.filter((entry) =>
    entry.owner.startsWith("adr:"),
  );
  const remediation = ledger.entries.filter(
    (entry) =>
      entry.owner === remediationOwner || entry.owner === annexRemediationOwner,
  );
  assert.deepEqual(validateCurrentM5cExclusionAudit(), {
    exclusions: exclusions.length,
    remediation: remediation.length,
    missingDynamicTags: [...exclusions, ...remediation].filter(
      (entry) =>
        entry.owner !== annexOwner &&
        entry.owner !== annexRemediationOwner &&
        !entry.prerequisites.includes("dynamic-source"),
    ).length,
  });
});

test("call syntax distinguishes eval calls from values and text", () => {
  for (const code of ['eval("1");', 'eval?.("1");', '(0, eval)("1");']) {
    assert.equal(hasEvalCall(code, "script"), true, code);
  }
  for (const code of [
    "eval;",
    'const text = "eval(1)";',
    "// eval(1)\neval;",
  ]) {
    assert.equal(hasEvalCall(code, "script"), false, code);
  }
  const { audit, inputs } = fixture();
  audit.paths[0]!.sourceDigest = exclusionAuditDigest("eval;");
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(audit), {
        ...inputs,
        sources: new Map([[path, "eval;"]]),
      }),
    /outside the record surface/u,
  );
});

test("harness line shifts preserve snapshots; changed output does not", () => {
  const observed = {
    ...observation,
    detail:
      'failed (1): stdout="" stderr="test/example.js:10:20: ' +
      "error[OSEO1001]: Unknown binding 'eval'.\\n\"",
  };
  assert.equal(
    exclusionObservationDigest(observed),
    exclusionObservationDigest({
      ...observed,
      detail: observed.detail.replace(":10:20:", ":900:1:"),
    }),
  );
  assert.notEqual(
    exclusionObservationDigest(observed),
    exclusionObservationDigest({
      ...observed,
      detail: observed.detail.replace('stdout=""', 'stdout="x"'),
    }),
  );
  assert.notEqual(
    exclusionObservationDigest(observed),
    exclusionObservationDigest({ ...observed, unsupportedCapability: "host" }),
  );
});

test("mixed Annex B/core coverage needs its own remediation owner", () => {
  const { audit, inputs } = fixture(true);
  audit.paths[0]!.proposedOwner = annexOwner;
  audit.paths[0]!.missingDynamicTag = false;
  const observed = {
    ...observation,
    detail:
      "error[OSEO1001]: A named backreference in a pattern that " +
      "declares no group name is admitted only by Annex B",
  };
  audit.paths[0]!.observationDigest = exclusionObservationDigest(observed);
  const annexInputs: M5cExclusionAuditInputs = {
    ...inputs,
    results: [{ ...result, observation: observed }],
    ledger: {
      ...inputs.ledger,
      entries: inputs.ledger.entries.map((entry) =>
        Object.assign({}, entry, { owner: annexRemediationOwner }),
      ),
    },
  };
  assert.equal(
    validateM5cExclusionAudit(stringifyYaml(audit), annexInputs).remediation,
    1,
  );
  audit.assessments.reviewed.disposition = "exclusion";
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), annexInputs),
    /Unresolved subject coverage cannot keep an ADR/u,
  );
  audit.assessments.reviewed.normativeDependency = "source-evaluation-only";
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), annexInputs),
    /bounded surface differs from record/u,
  );
});

test("revision, cohort, record keys, and order must be valid", () => {
  const { audit, inputs } = fixture();
  audit.suiteRevision = "other";
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
    /version or revision differs/u,
  );
  const cohort = fixture().audit;
  cohort.paths[0]!.priorCohort = "unknown";
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(cohort), inputs),
    /prior ownership cohort/u,
  );
  const extra = fixture().audit;
  extra.records["../../arbitrary"] =
    extra.records["0016-dynamic-source-boundary"]!;
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(extra), inputs),
    /exactly ADRs/u,
  );
  const unordered = fixture().audit;
  unordered.paths.push({ ...unordered.paths[0]!, path: "test/A.js" });
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(unordered), inputs),
    /duplicated or unordered/u,
  );
});

test("failure states and mismatched observation states cannot close", () => {
  const { audit, inputs } = fixture();
  for (const state of ["semantic-failure", "pass"] as const) {
    assert.throws(
      () =>
        validateM5cExclusionAudit(stringifyYaml(audit), {
          ...inputs,
          ledger: {
            ...inputs.ledger,
            entries: inputs.ledger.entries.map((entry) =>
              Object.assign({}, entry, { state }),
            ),
          },
        }),
      /state differs from its observation/u,
    );
  }
  for (const state of ["semantic-failure", "pass"] as const) {
    assert.throws(
      () =>
        validateM5cExclusionAudit(stringifyYaml(audit), {
          ...inputs,
          results: [{ ...result, classification: state }],
          ledger: {
            ...inputs.ledger,
            entries: inputs.ledger.entries.map((entry) =>
              Object.assign({}, entry, { state }),
            ),
          },
        }),
      state === "pass" ? /needs its observation owner/u : /unsupported state/u,
    );
  }
});
