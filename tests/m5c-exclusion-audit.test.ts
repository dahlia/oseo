import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Test262Result } from "../packages/testkit/src/index.ts";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  exclusionAuditDigest,
  exclusionObservationDigest,
  hasCallerRead,
  hasEvalCall,
  hasLookupCall,
  isAuditableUpstreamPath,
  legacyCallerSelector,
  literalImportCalls,
  m5cAnnexLookupClosedPaths,
  validateCurrentM5cExclusionAudit,
  validateM5cExclusionAudit,
} from "../tools/m5c-exclusion-audit.ts";
import type { M5cExclusionAuditInputs } from "../tools/m5c-exclusion-audit.ts";
import { parseM5cClosureLedger } from "../tools/m5c-closure-ledger.ts";
import type { M5cClosureLedger } from "../tools/m5c-closure-ledger.ts";

const revision = "fixture";
const path = "test/language/eval-code/example.js";
const owner = "adr:0016-dynamic-source-boundary";
const remediationOwner = "node:dynamic-source-coverage-remediation";
const annexOwner = "adr:0013-m5-edition-and-manifest";
/** Work unit that remediates a former ADR 0013 exclusion after ADR 0032. */
const unitAnnexOwner = "unit:annexb-object-accessors";
const annexRemediationOwner = "node:regexp-split-coverage-remediation";
const protoRemediationOwner = "node:typed-array-proto-coverage-remediation";
const ordinaryProtoRemediationOwner =
  "node:ordinary-object-proto-coverage-remediation";
const lookupRemediationOwner =
  "node:class-private-accessor-lookup-coverage-remediation";
const callerOwner = "adr:0028-legacy-function-caller-boundary";
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
    "0028-legacy-function-caller-boundary",
  ].map((stem) => [
    stem,
    readFileSync(new URL(`../docs/adr/${stem}.md`, import.meta.url), "utf8"),
  ]),
);

function fixture(
  remediation = false,
  sourceText = source,
  observed: Test262Result["observation"] = observation,
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
              : stem.startsWith("0019")
                ? "ADR 0016 is such a record for the dynamic source family."
                : "The optional legacy caller extension is outside the M5 " +
                  "profile.",
        ],
        reopening: [
          stem.startsWith("0013")
            ? "Evidence that a claimed-excluded section is required by " +
              "a dependency inside the boundary reopens the " +
              "optional-section policy."
            : stem.startsWith("0016")
              ? "a probe demonstrates staged compilation with acceptable " +
                "code lifetime, rooting, and target coverage; or"
              : stem.startsWith("0019")
                ? "Evidence that a normative section inside the claim " +
                  "depends on the excluded dynamic source family for " +
                  "behavior other than source evaluation reopens the " +
                  "boundary rather than this record."
                : "Evidence from target packages that caller " +
                  "introspection is required reopens this boundary.",
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
        remediationOwner: annexRemediationOwner,
        replacementEvidence: {
          "tests/native/fixtures/typed-array-constructors.ts":
            exclusionAuditDigest("reviewed core fixture"),
        },
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
    replacementEvidence: new Map([
      [
        "tests/native/fixtures/typed-array-constructors.ts",
        "reviewed core fixture",
      ],
    ]),
  };
  return { audit, inputs };
}

test("accepted bounded rejection and tag debt are counted separately", () => {
  const { audit, inputs } = fixture();
  assert.deepEqual(validateM5cExclusionAudit(stringifyYaml(audit), inputs), {
    exclusions: 1,
    remediation: 0,
    deferrals: 0,
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
          deferrals: 0,
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
    deferrals: 0,
    missingDynamicTags: 0,
  });
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
    /dependency-tag debt changed/u,
  );
});

/** Move every fixture row onto one of the reservation assessments. */
function withReservationAssessment(
  audit: ReturnType<typeof fixture>["audit"],
  name = "import-call-attributes",
) {
  return {
    ...audit,
    assessments: { [name]: audit.assessments.reviewed },
    paths: audit.paths.map((row) =>
      Object.assign({}, row, { assessment: name }),
    ),
  };
}

const reservedImportDetail =
  'failed (1): stdout="" stderr="test/example.js:1:1: ' +
  'error[OSEO1001]: ImportExpression is outside the M1 profile.\\n"';

test("reserved dynamic attributes require the bounded exclusion", () => {
  const observed = { ...observation, detail: reservedImportDetail };
  const { audit, inputs } = fixture(false, 'import("x", {});', observed);
  const reserved = {
    ...inputs,
    importAttributesDynamicPaths: new Set([path]),
    results: inputs.results.map((entry) =>
      Object.assign({}, entry, {
        case: {
          ...entry.case,
          features: ["import-attributes", "dynamic-import"],
        },
      }),
    ),
  };
  for (const name of [
    "import-call-attributes",
    "import-call-attributes-computed-specifier",
    "json-module-dynamic-site-identity",
  ]) {
    assert.deepEqual(
      validateM5cExclusionAudit(
        stringifyYaml(withReservationAssessment(audit, name)),
        reserved,
      ),
      { exclusions: 1, remediation: 0, deferrals: 0, missingDynamicTags: 1 },
      name,
    );
  }
  const bounded = stringifyYaml(withReservationAssessment(audit));
  assert.throws(
    () =>
      validateM5cExclusionAudit(bounded, {
        ...reserved,
        results: inputs.results,
      }),
    /exact dynamic attribute reservation/u,
  );
  // A reserved path cannot use an ordinary assessment, and no other path
  // can use a reservation assessment.
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), reserved),
    /exact dynamic attribute reservation/u,
  );
  assert.throws(
    () =>
      validateM5cExclusionAudit(bounded, {
        ...reserved,
        importAttributesDynamicPaths: new Set<string>(),
      }),
    /exact dynamic attribute reservation/u,
  );
  // Another ADR 0016 rejection is outside the reserved ImportCall surface.
  const evalCall = fixture();
  assert.throws(
    () =>
      validateM5cExclusionAudit(
        stringifyYaml(withReservationAssessment(evalCall.audit)),
        {
          ...evalCall.inputs,
          importAttributesDynamicPaths: new Set([path]),
          results: evalCall.inputs.results.map((entry) =>
            Object.assign({}, entry, {
              case: { ...entry.case, features: ["import-attributes"] },
            }),
          ),
        },
      ),
    /exact dynamic attribute reservation/u,
  );
});

test("the reserved rejection must end the process stderr", () => {
  for (const detail of [
    reservedImportDetail.replace(
      '\\n"',
      "\\nerror[OSEO1001]: Unknown binding 'eval'.\\n\"",
    ),
    'failed (1): stdout="error[OSEO1001]: ImportExpression is outside ' +
      'the M1 profile.\\n" stderr="test/example.js:1:1: error[OSEO3001]: ' +
      'The native toolchain failed.\\n"',
  ]) {
    const observed = { ...observation, detail };
    const { audit, inputs } = fixture(false, 'import("x", {});', observed);
    assert.throws(
      () =>
        validateM5cExclusionAudit(
          stringifyYaml(withReservationAssessment(audit)),
          {
            ...inputs,
            importAttributesDynamicPaths: new Set([path]),
            results: inputs.results.map((entry) =>
              Object.assign({}, entry, {
                case: {
                  ...entry.case,
                  features: ["import-attributes", "dynamic-import"],
                },
              }),
            ),
          },
        ),
      /exact dynamic attribute reservation/u,
      detail,
    );
  }
});

test("reserved dynamic attributes reject ordinary reassessment", () => {
  const observed = {
    ...observation,
    detail: "error[OSEO1001]: ImportExpression is outside the M1 profile.",
  };
  const { audit, inputs } = fixture(true, 'import("x", {});', observed);
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(audit), {
        ...inputs,
        importAttributesDynamicPaths: new Set([path]),
        results: inputs.results.map((entry) =>
          Object.assign({}, entry, {
            case: {
              ...entry.case,
              features: ["import-attributes", "dynamic-import"],
            },
          }),
        ),
      }),
    /exact dynamic attribute reservation/u,
  );
});

test("the superseded dynamic attribute owner is rejected", () => {
  const observed = {
    ...observation,
    detail: "error[OSEO1001]: ImportExpression is outside the M1 profile.",
  };
  const { audit, inputs } = fixture(true, 'import("x", {});', observed);
  const supersededOwner = "node:import-attributes-dynamic-coverage-remediation";
  audit.assessments.reviewed.remediationOwner = supersededOwner;
  const superseded = {
    ...inputs,
    results: inputs.results.map((entry) =>
      Object.assign({}, entry, {
        case: {
          ...entry.case,
          features: ["import-attributes", "dynamic-import"],
        },
      }),
    ),
    ledger: {
      ...inputs.ledger,
      entries: inputs.ledger.entries.map((entry) =>
        Object.assign({}, entry, { owner: supersededOwner }),
      ),
    },
  };
  for (const reservation of [new Set([path]), new Set<string>()]) {
    assert.throws(
      () =>
        validateM5cExclusionAudit(stringifyYaml(audit), {
          ...superseded,
          importAttributesDynamicPaths: reservation,
        }),
      /exact dynamic attribute reservation/u,
    );
  }
});

test("dynamic attribute audit rejects one omitted reservation", () => {
  const observed = {
    ...observation,
    detail: "error[OSEO1001]: ImportExpression is outside the M1 profile.",
  };
  const sourceText = 'import("x", {});';
  const { audit, inputs } = fixture(false, sourceText, observed);
  const second = "test/language/eval-code/second.js";
  const firstAuditPath = audit.paths[0];
  const firstResult = inputs.results[0];
  const firstLedgerEntry = inputs.ledger.entries[0];
  assert.ok(firstAuditPath);
  assert.ok(firstResult);
  assert.ok(firstLedgerEntry);
  audit.paths.push({ ...firstAuditPath, path: second });
  const reservedAudit = withReservationAssessment(audit);
  const bounded = {
    ...inputs,
    importAttributesDynamicPaths: new Set([path, second]),
    sources: new Map([
      [path, sourceText],
      [second, sourceText],
    ]),
    results: [path, second].map((item) => ({
      case: {
        async: firstResult.case.async,
        features: ["import-attributes", "dynamic-import"],
        flags: firstResult.case.flags,
        includes: firstResult.case.includes,
        mode: firstResult.case.mode,
        path: item,
        strictness: firstResult.case.strictness,
        suiteRevision: firstResult.case.suiteRevision,
      },
      classification: firstResult.classification,
      dependencies: firstResult.dependencies,
      observation: firstResult.observation,
      unsupportedFeatures: firstResult.unsupportedFeatures,
    })),
    ledger: {
      ...inputs.ledger,
      entries: [path, second].map((item) => ({
        owner,
        path: item,
        prerequisites: firstLedgerEntry.prerequisites,
        state: firstLedgerEntry.state,
      })),
    },
  };
  assert.equal(
    validateM5cExclusionAudit(stringifyYaml(reservedAudit), bounded).exclusions,
    2,
  );
  for (const omitted of [path, second]) {
    const incomplete = {
      ...reservedAudit,
      paths: reservedAudit.paths.filter((row) => row.path !== omitted),
    };
    assert.throws(
      () => validateM5cExclusionAudit(stringifyYaml(incomplete), bounded),
      /has no reviewed exclusion audit/u,
    );
  }
});

test("bound replacement evidence must stay current", () => {
  const { audit, inputs } = fixture();
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(audit), {
        ...inputs,
        replacementEvidence: new Map([
          [
            "tests/native/fixtures/typed-array-constructors.ts",
            "changed core fixture",
          ],
        ]),
      }),
    /replacement evidence changed/u,
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

test("a deferral row needs the deferred owner and is counted apart", () => {
  const { audit, inputs } = fixture(true);
  audit.assessments.reviewed.disposition = "deferral";
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
    /requires owner deferred for/u,
  );
  const deferred: M5cExclusionAuditInputs = {
    ...inputs,
    ledger: {
      ...inputs.ledger,
      entries: inputs.ledger.entries.map((entry) =>
        Object.assign({}, entry, { owner: "deferred" }),
      ),
    },
  };
  assert.deepEqual(validateM5cExclusionAudit(stringifyYaml(audit), deferred), {
    exclusions: 0,
    remediation: 0,
    deferrals: 1,
    missingDynamicTags: 1,
  });
  audit.assessments.reviewed.disposition = "deferred";
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), deferred),
    /Audit needs a disposition/u,
  );
  audit.assessments.reviewed.disposition = "deferral";
  audit.assessments.reviewed.normativeDependency = "source-evaluation-only";
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), deferred),
    /An authorized exclusion surface cannot be deferred/u,
  );
});

test("a deferred path on a record surface cannot drop its audit row", () => {
  const { audit, inputs } = fixture();
  const deferred: M5cExclusionAuditInputs = {
    ...inputs,
    ledger: {
      ...inputs.ledger,
      entries: inputs.ledger.entries.map((entry) =>
        Object.assign({}, entry, { owner: "deferred" }),
      ),
    },
  };
  const unaudited = stringifyYaml({ ...audit, paths: [] });
  assert.throws(
    () => validateM5cExclusionAudit(unaudited, deferred),
    /Deferred path on a record surface needs its audit row/u,
  );
  assert.throws(
    () =>
      validateM5cExclusionAudit(unaudited, { ...deferred, sources: new Map() }),
    /Deferred path lacks its observation or source/u,
  );
  const offSurface = {
    ...observation,
    detail: "error[OSEO1001]: ImportDeclaration is outside the M1 profile.",
  };
  assert.deepEqual(
    validateM5cExclusionAudit(unaudited, {
      ...deferred,
      results: [{ ...result, observation: offSurface }],
    }),
    { exclusions: 0, remediation: 0, deferrals: 0, missingDynamicTags: 0 },
  );
});

test("an eval rejection cannot stand under ADR 0013", () => {
  const { audit, inputs } = fixture();
  audit.assessments.reviewed.normativeDependency = "annex-b-only";
  audit.assessments.reviewed.disposition = "remediation";
  audit.assessments.reviewed.remediationOwner = unitAnnexOwner;
  audit.paths[0]!.proposedOwner = annexOwner;
  audit.paths[0]!.missingDynamicTag = false;
  assert.ok(audit.assessments.reviewed.replacementEvidence);
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(audit), {
        ...inputs,
        ledger: {
          ...inputs.ledger,
          entries: [
            {
              path,
              owner: unitAnnexOwner,
              prerequisites: result.dependencies,
              state: result.classification,
            },
          ],
        },
      }),
    /outside the record surface/u,
  );
});

test("the escaped Annex B literal rows are ADR 0016 exclusions", () => {
  const escaped = [
    "test/language/literals/regexp/S7.8.5_A1.4_T2.js",
    "test/language/literals/regexp/S7.8.5_A2.4_T2.js",
  ];
  // SAFETY: the audit checker validates every row, assessment, and path.
  const audit = parseYaml(
    readFileSync(
      new URL("../docs/m5c-closure/exclusion-audit.yaml", import.meta.url),
      "utf8",
    ),
  ) as {
    readonly assessments: Readonly<
      Record<
        string,
        {
          readonly disposition: string;
          readonly normativeDependency: string;
          readonly remediationOwner?: string;
          readonly replacementEvidence?: Readonly<Record<string, string>>;
        }
      >
    >;
    readonly paths: readonly {
      readonly path: string;
      readonly proposedOwner: string;
    }[];
  };
  const ledger = parseM5cClosureLedger(
    readFileSync(
      new URL("../docs/m5c-closure/ledger.yaml", import.meta.url),
      "utf8",
    ),
  ).ledger;
  for (const escapedPath of escaped) {
    assert.equal(
      audit.paths.find((row) => row.path === escapedPath)?.proposedOwner,
      owner,
    );
    assert.equal(
      ledger.entries.find((entry) => entry.path === escapedPath)?.owner,
      owner,
    );
  }
  const assessment = audit.assessments["ds17-exhaustive-escaped-annex-b"];
  assert.equal(assessment?.disposition, "exclusion");
  assert.equal(assessment?.normativeDependency, "source-evaluation-only");
  assert.equal(assessment?.remediationOwner, undefined);
  assert.deepEqual(Object.keys(assessment?.replacementEvidence ?? {}), [
    "tests/property/m5-regexp-literal-exhaustive.property.test.ts",
  ]);
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
      { exclusions: 1, remediation: 0, deferrals: 0, missingDynamicTags: 1 },
      name,
    );
  }
});

const importPath = "test/language/expressions/dynamic-import/catch/example.js";
const importTarget =
  "test/language/expressions/dynamic-import/catch/target_FIXTURE.js";
/** The literal argument sits at line 2, column 8 of this source. */
const importSource = "// a\nimport('./target_FIXTURE.js');\n";

type ImportDisposition = "deferral" | "exclusion" | "remediation";

/**
 * Re-key the fixture onto a literal import() path whose observation is one
 * build diagnostic, as the runner reports it, with the given disposition and
 * the ledger owner that disposition requires.
 */
function importFixture({
  capability = "static-specifier-import-build",
  detail,
  disposition = "exclusion",
  features = ["dynamic-import"],
  sourceText = importSource,
  unsupportedFeatures = [],
}: {
  readonly capability?: string;
  readonly detail: string;
  readonly disposition?: ImportDisposition;
  readonly features?: readonly string[];
  readonly sourceText?: string;
  readonly unsupportedFeatures?: readonly string[];
}) {
  const remediation = disposition === "remediation";
  const observed = {
    passed: false,
    detail,
    unsupportedCapability: capability,
  };
  const { audit, inputs } = fixture(remediation, sourceText, observed);
  audit.paths[0]!.path = importPath;
  audit.assessments.reviewed.disposition = disposition;
  if (disposition === "deferral") {
    audit.assessments.reviewed.normativeDependency = "not-demonstrated";
  }
  const owners = {
    deferral: "deferred",
    exclusion: owner,
    remediation: remediationOwner,
  } satisfies Record<ImportDisposition, string>;
  const imported: M5cExclusionAuditInputs = {
    ...inputs,
    ledger: {
      ...inputs.ledger,
      entries: inputs.ledger.entries.map((entry) =>
        Object.assign({}, entry, {
          path: importPath,
          owner: owners[disposition],
        }),
      ),
    },
    results: [
      {
        ...result,
        case: { ...result.case, path: importPath, features: [...features] },
        observation: observed,
        unsupportedFeatures: [...unsupportedFeatures],
      },
    ],
    sources: new Map([[importPath, sourceText]]),
  };
  return { audit, inputs: imported };
}

const importTargetDetails = [
  `${importTarget}:7:22: error[OSEO0001]: Source could not be parsed.`,
  `${importTarget}:4:10: error[OSEO2001]: Export 'x' is ambiguous.`,
  `${importTarget}:4:10: error[OSEO2001]: Module has no export 'x'.`,
];
/** One diagnostic line at the literal argument, line 2, column 8. */
const callDiagnostic = (code: string, message: string): string =>
  `${importPath}:2:8: error[${code}]: ${message}`;
/** One diagnostic line in a target fixture at line 4, column 10. */
const targetDiagnostic = (code: string, message: string): string =>
  `${importTarget}:4:10: error[${code}]: ${message}`;
const importLoadDetail = callDiagnostic(
  "OSEO3001",
  "The module source could not be read.",
);
const importResolutionSource = "// a\nimport('');\n";
const importResolutionDetail = callDiagnostic(
  "OSEO3001",
  "Unsupported module specifier ''.",
);

test("literal import() calls are read from call syntax", () => {
  assert.deepEqual(literalImportCalls(importSource, "script"), [
    { specifier: "./target_FIXTURE.js", line: 2, column: 8 },
  ]);
  assert.deepEqual(literalImportCalls("await import('foo');", "module"), [
    { specifier: "foo", line: 1, column: 14 },
  ]);
  for (const code of [
    "import(specifier);",
    "import(`./a.js`);",
    "import('./a.js', { with: {} });",
    "import('./a' + '.js');",
    "const text = \"import('./a.js')\";",
    "// import('./a.js')",
  ]) {
    assert.deepEqual(literalImportCalls(code, "script"), [], code);
  }
});

test("build failures of a literal import() target are ADR 0016 rows", () => {
  for (const detail of [...importTargetDetails, importLoadDetail]) {
    const { audit, inputs } = importFixture({ detail });
    assert.deepEqual(
      validateM5cExclusionAudit(stringifyYaml(audit), inputs),
      { exclusions: 1, remediation: 0, deferrals: 0, missingDynamicTags: 1 },
      detail,
    );
  }
});

test("near-miss import() build diagnostics stay off the surface", () => {
  const cases: readonly Parameters<typeof importFixture>[0][] = [
    // Codes and messages outside the observed build failure classes.
    { detail: targetDiagnostic("OSEO2002", "Export 'x' is ambiguous.") },
    { detail: targetDiagnostic("OSEO1001", "Module has no export 'x'.") },
    { detail: targetDiagnostic("OSEO2001", "Export x is ambiguous.") },
    { detail: targetDiagnostic("OSEO3001", "Source could not be parsed.") },
    {
      detail: importLoadDetail.replace(
        "The module source could not",
        "The module could not",
      ),
    },
    // A target failure outside the file a literal import() names.
    { detail: importTargetDetails[0]!.replace("target_", "other_") },
    { detail: `${importPath}:2:8: error[OSEO2001]: Module has no export 'x'.` },
    // A load failure away from the literal argument.
    { detail: importLoadDetail.replace(":2:8:", ":2:1:") },
    { detail: importLoadDetail.replace(importPath, importTarget) },
    // Wrapped, extended, or multi-line details.
    { detail: `${importLoadDetail}\n` },
    { detail: `${importLoadDetail} Extra text.` },
    { detail: `failed (1): stdout="" stderr="${importLoadDetail}\\n"` },
    { detail: `${importTargetDetails[1]}\n${importLoadDetail}` },
    // The source must make the literal call; the case must use the feature.
    { detail: importLoadDetail, sourceText: "// a\nimport(target);\n" },
    {
      detail: importTargetDetails[2]!,
      sourceText: "// a\nimport('./target_FIXTURE.js', {});\n",
    },
    { detail: importLoadDetail, features: [] },
    { detail: importLoadDetail, unsupportedFeatures: ["import-defer"] },
    // The capability names the build stage that refused the program.
    { detail: importLoadDetail, capability: "profile-syntax" },
    { detail: importLoadDetail, capability: "module-resolution-profile" },
  ];
  for (const options of cases) {
    const { audit, inputs } = importFixture(options);
    assert.throws(
      () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
      /outside the record surface/u,
      JSON.stringify(options),
    );
  }
});

test("an import() build failure is only an exclusion", () => {
  for (const disposition of ["deferral", "remediation"] as const) {
    const { audit, inputs } = importFixture({
      detail: importTargetDetails[1]!,
      disposition,
    });
    assert.throws(
      () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
      /outside the record surface/u,
      disposition,
    );
  }
});

test("a refused literal specifier is only a deferral", () => {
  const resolution = {
    capability: "module-resolution-profile",
    detail: importResolutionDetail,
    sourceText: importResolutionSource,
  };
  const { audit, inputs } = importFixture({
    ...resolution,
    disposition: "deferral",
  });
  assert.deepEqual(validateM5cExclusionAudit(stringifyYaml(audit), inputs), {
    exclusions: 0,
    remediation: 0,
    deferrals: 1,
    missingDynamicTags: 1,
  });
  for (const disposition of ["exclusion", "remediation"] as const) {
    const other = importFixture({ ...resolution, disposition });
    assert.throws(
      () => validateM5cExclusionAudit(stringifyYaml(other.audit), other.inputs),
      /outside the record surface/u,
      disposition,
    );
  }
});

test("near-miss specifier refusals stay off the deferral surface", () => {
  const cases: readonly Parameters<typeof importFixture>[0][] = [
    // The quoted specifier must be the literal at the reported call.
    { detail: importResolutionDetail.replace("''", "'foo'") },
    { detail: importResolutionDetail, sourceText: "// a\nimport('foo');\n" },
    { detail: importResolutionDetail.replace(":2:8:", ":1:1:") },
    { detail: importResolutionDetail.replace(importPath, importTarget) },
    { detail: importResolutionDetail, sourceText: "// a\nimport(x);\n" },
    // Other codes, messages, and capabilities.
    { detail: importResolutionDetail.replace("OSEO3001", "OSEO3002") },
    { detail: importResolutionDetail.replace("Unsupported", "Unknown") },
    { detail: importResolutionDetail, capability: "profile-syntax" },
    {
      detail: importResolutionDetail,
      capability: "static-specifier-import-build",
    },
    { detail: `${importResolutionDetail}\n` },
    { detail: importResolutionDetail, features: [] },
  ];
  for (const options of cases) {
    const { audit, inputs } = importFixture({
      capability: "module-resolution-profile",
      sourceText: importResolutionSource,
      ...options,
      disposition: "deferral",
    });
    assert.throws(
      () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
      /outside the record surface/u,
      JSON.stringify(options),
    );
  }
});

test("a deferred import() path on a surface keeps its audit row", () => {
  for (const options of [
    {
      capability: "module-resolution-profile",
      detail: importResolutionDetail,
      sourceText: importResolutionSource,
    },
    { detail: importLoadDetail },
  ]) {
    const { audit, inputs } = importFixture({
      ...options,
      disposition: "deferral",
    });
    assert.throws(
      () =>
        validateM5cExclusionAudit(
          stringifyYaml({ ...audit, paths: [] }),
          inputs,
        ),
      /Deferred path on a record surface needs its audit row/u,
      options.detail,
    );
  }
});

test("the audit reads test262 files under annexB, built-ins, language", () => {
  for (const auditable of [
    "test/annexB/built-ins/RegExp/RegExp-leading-escape-BMP.js",
    "test/built-ins/Function/S15.3.2.1_A1_T1.js",
    "test/language/eval-code/direct/var-env-lower-lex-catch-non-strict.js",
  ]) {
    assert.equal(isAuditableUpstreamPath(auditable), true, auditable);
  }
  for (const outside of [
    "test/annexB/built-ins/RegExp/../../../harness/assert.js",
    "test/annexB/built-ins/RegExp/README.md",
    "test/annexB/built-ins/RegExp/example.mjs",
    "test/annexb/built-ins/RegExp/example.js",
    "test/staging/example.js",
    "test/intl402/example.js",
    "harness/assert.js",
    "test/annexB/built-ins/RegExp/a b.js",
    "/test/annexB/example.js",
  ]) {
    assert.equal(isAuditableUpstreamPath(outside), false, outside);
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
    deferrals: 0,
    missingDynamicTags: 0,
  });
});

test("observed promotions close reserved dynamic attribute assessments", () => {
  const observed = {
    ...observation,
    detail: "error[OSEO1001]: ImportExpression is outside the M1 profile.",
  };
  const { audit, inputs } = fixture(false, 'import("x", {});', observed);
  for (const classification of ["pass", "expected-negative"] as const) {
    const promoted: M5cExclusionAuditInputs = {
      ...inputs,
      importAttributesDynamicPaths: new Set([path]),
      ledger: {
        ...inputs.ledger,
        entries: inputs.ledger.entries.map((entry) => ({
          ...entry,
          owner: "observation",
          state: classification,
        })),
      },
      results: inputs.results.map((entry) =>
        Object.assign({}, entry, {
          classification,
          observation: { passed: true },
        }),
      ),
    };
    assert.deepEqual(
      validateM5cExclusionAudit(stringifyYaml(audit), promoted),
      {
        exclusions: 0,
        remediation: 0,
        deferrals: 0,
        missingDynamicTags: 0,
      },
    );
  }
});

test("reserved dynamic attributes reject a reassigned omitted row", () => {
  const observed = {
    ...observation,
    detail: "error[OSEO1001]: ImportExpression is outside the M1 profile.",
  };
  const { audit, inputs } = fixture(true, 'import("x", {});', observed);
  audit.paths = [];
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(audit), {
        ...inputs,
        importAttributesDynamicPaths: new Set([path]),
        ledger: {
          ...inputs.ledger,
          entries: inputs.ledger.entries.map((entry) =>
            Object.assign({}, entry, { owner: "node:dynamic-import" }),
          ),
        },
      }),
    /reservation lacks its audit row/u,
  );
});

test("reserved dynamic attributes reject an omitted promoted row", () => {
  const observed = {
    ...observation,
    detail: "error[OSEO1001]: ImportExpression is outside the M1 profile.",
  };
  const { audit, inputs } = fixture(true, 'import("x", {});', observed);
  audit.paths = [];
  for (const classification of ["pass", "expected-negative"] as const) {
    assert.throws(
      () =>
        validateM5cExclusionAudit(stringifyYaml(audit), {
          ...inputs,
          importAttributesDynamicPaths: new Set([path]),
          ledger: {
            ...inputs.ledger,
            entries: inputs.ledger.entries.map((entry) => ({
              ...entry,
              owner: "observation",
              state: classification,
            })),
          },
          results: inputs.results.map((entry) =>
            Object.assign({}, entry, {
              classification,
              observation: { passed: true },
            }),
          ),
        }),
      /reservation lacks its audit row/u,
    );
  }
});

/**
 * Independent ledger-side counts. Remediation owners are every owner the
 * audit accepts for a non-excluded row; dynamic-tag debt applies only to the
 * dynamic-source owners, never to the Annex B ones.
 */
function expectedAuditCounts(
  ledger: M5cClosureLedger,
  auditedPaths: ReadonlySet<string>,
) {
  const exclusions = ledger.entries.filter((entry) =>
    entry.owner.startsWith("adr:"),
  );
  const remediation = ledger.entries.filter(
    (entry) =>
      entry.owner === remediationOwner ||
      entry.owner === annexRemediationOwner ||
      entry.owner === protoRemediationOwner ||
      entry.owner === ordinaryProtoRemediationOwner ||
      entry.owner === lookupRemediationOwner ||
      // Former ADR 0013 rows; other unit-owned paths are unreviewed.
      (entry.owner.startsWith("unit:") && auditedPaths.has(entry.path)),
  );
  return {
    exclusions: exclusions.length,
    remediation: remediation.length,
    // Paths never proposed for exclusion carry no audit row, so only the
    // audited deferred paths are counted.
    deferrals: ledger.entries.filter(
      (entry) => entry.owner === "deferred" && auditedPaths.has(entry.path),
    ).length,
    missingDynamicTags: [...exclusions, ...remediation].filter(
      (entry) =>
        entry.owner !== annexOwner &&
        entry.owner !== callerOwner &&
        entry.owner !== annexRemediationOwner &&
        entry.owner !== protoRemediationOwner &&
        entry.owner !== ordinaryProtoRemediationOwner &&
        entry.owner !== lookupRemediationOwner &&
        !entry.owner.startsWith("unit:") &&
        !entry.prerequisites.includes("dynamic-source"),
    ).length,
  };
}

test("checked-in audit counts match ledger owners after promotions", () => {
  const ledger = parseM5cClosureLedger(
    readFileSync(
      new URL("../docs/m5c-closure/ledger.yaml", import.meta.url),
      "utf8",
    ),
  ).ledger;
  // SAFETY: the audit checker above validates every row and its path.
  const audit = parseYaml(
    readFileSync(
      new URL("../docs/m5c-closure/exclusion-audit.yaml", import.meta.url),
      "utf8",
    ),
  ) as { paths: readonly { path: string }[] };
  assert.deepEqual(
    validateCurrentM5cExclusionAudit(),
    expectedAuditCounts(ledger, new Set(audit.paths.map((row) => row.path))),
  );
});

test("call syntax separates lookup calls from reads and text", () => {
  for (const mode of ["script", "module"] as const) {
    for (const method of ["__lookupGetter__", "__lookupSetter__"]) {
      for (const code of [
        `this.${method}("k");`,
        `o?.${method}("k");`,
        `o.${method}?.("k");`,
        `o["${method}"]("k");`,
        `o?.["${method}"]("k");`,
        `(o.${method})("k");`,
        `f(() => o.${method}("k"));`,
      ]) {
        assert.equal(hasLookupCall(code, mode, method), true, code);
      }
      const other =
        method === "__lookupGetter__" ? "__lookupSetter__" : "__lookupGetter__";
      for (const code of [
        `// o.${method}("k")\n0;`,
        `const text = "o.${method}('k')";`,
        `const read = o.${method};`,
        `typeof o.${method};`,
        `o.${other}("k");`,
        `o.${method}X("k");`,
        `${method}("k");`,
        `o[key]("k");`,
        `o.${method}.call(o, "k");`,
      ]) {
        assert.equal(hasLookupCall(code, mode, method), false, code);
      }
    }
  }
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

test("a work unit remediates only a former ADR 0013 row", () => {
  const detail =
    "error[OSEO1001]: The Object.prototype.__proto__ accessor " +
    "is excluded by Annex B.";
  const { audit, inputs } = fixture(true);
  audit.paths[0]!.proposedOwner = annexOwner;
  audit.paths[0]!.missingDynamicTag = false;
  audit.assessments.reviewed.remediationOwner = unitAnnexOwner;
  const observed = { ...observation, detail };
  audit.paths[0]!.observationDigest = exclusionObservationDigest(observed);
  const unitLedger = {
    ...inputs.ledger,
    entries: inputs.ledger.entries.map((entry) =>
      Object.assign({}, entry, { owner: unitAnnexOwner }),
    ),
  };
  const annexInputs: M5cExclusionAuditInputs = {
    ...inputs,
    results: [{ ...result, observation: observed }],
    ledger: unitLedger,
  };
  assert.deepEqual(
    validateM5cExclusionAudit(stringifyYaml(audit), annexInputs),
    {
      exclusions: 0,
      remediation: 1,
      deferrals: 0,
      missingDynamicTags: 0,
    },
  );
  // An ADR 0016 row keeps its own remediation node.
  const dynamic = fixture(true);
  dynamic.audit.assessments.reviewed.remediationOwner = unitAnnexOwner;
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(dynamic.audit), {
        ...dynamic.inputs,
        ledger: unitLedger,
      }),
    /work-unit owner needs an ADR 0013 remediation row/u,
  );
});

test("the exact Annex B accessor rejection uses its assessed owner", () => {
  const detail =
    "error[OSEO1001]: The Object.prototype.__proto__ accessor " +
    "is excluded by Annex B.";
  for (const rejection of [
    detail,
    `${detail}\n`,
    `${detail}\\n`,
    `failed (1): stdout="" stderr="test/case.js:1:1: ${detail}\\n"`,
  ]) {
    const { audit, inputs } = fixture(true);
    audit.paths[0]!.proposedOwner = annexOwner;
    audit.paths[0]!.missingDynamicTag = false;
    audit.assessments.reviewed.remediationOwner = protoRemediationOwner;
    const observed = { ...observation, detail: rejection };
    audit.paths[0]!.observationDigest = exclusionObservationDigest(observed);
    const annexInputs: M5cExclusionAuditInputs = {
      ...inputs,
      results: [{ ...result, observation: observed }],
      ledger: {
        ...inputs.ledger,
        entries: inputs.ledger.entries.map((entry) =>
          Object.assign({}, entry, { owner: protoRemediationOwner }),
        ),
      },
    };
    assert.equal(
      validateM5cExclusionAudit(stringifyYaml(audit), annexInputs).remediation,
      1,
    );
    assert.throws(
      () =>
        validateM5cExclusionAudit(stringifyYaml(audit), {
          ...annexInputs,
          replacementEvidence: new Map(),
        }),
      /replacement evidence changed/u,
    );
    audit.assessments.reviewed.remediationOwner = annexRemediationOwner;
    assert.throws(
      () => validateM5cExclusionAudit(stringifyYaml(audit), annexInputs),
      /requires owner node:regexp-split-coverage-remediation/u,
    );
    audit.assessments.reviewed.remediationOwner = "node:observation-batch-03";
    assert.throws(
      () => validateM5cExclusionAudit(stringifyYaml(audit), annexInputs),
      /bounded Annex B remediation owner/u,
    );
    audit.paths = [];
    assert.throws(
      () => validateM5cExclusionAudit(stringifyYaml(audit), annexInputs),
      /no reviewed exclusion audit/u,
    );
  }
});

test("the ordinary-object accessor owner accepts only the rejection", () => {
  const detail =
    "error[OSEO1001]: The Object.prototype.__proto__ accessor " +
    "is excluded by Annex B.";
  const { audit, inputs } = fixture(true);
  audit.paths[0]!.proposedOwner = annexOwner;
  audit.paths[0]!.missingDynamicTag = false;
  audit.assessments.reviewed.remediationOwner = ordinaryProtoRemediationOwner;
  Reflect.deleteProperty(audit.assessments.reviewed, "replacementEvidence");
  const observed = {
    ...observation,
    detail: `failed (1): stdout="" stderr="test/case.js:1:1: ${detail}\\n"`,
  };
  audit.paths[0]!.observationDigest = exclusionObservationDigest(observed);
  const annexInputs: M5cExclusionAuditInputs = {
    ...inputs,
    results: [{ ...result, observation: observed }],
    ledger: {
      ...inputs.ledger,
      entries: inputs.ledger.entries.map((entry) =>
        Object.assign({}, entry, { owner: ordinaryProtoRemediationOwner }),
      ),
    },
  };
  // Unlike the TypedArray owner, this owner binds no replacement evidence:
  // its node still has to supply a witness for every core subject.
  assert.equal(
    validateM5cExclusionAudit(stringifyYaml(audit), {
      ...annexInputs,
      replacementEvidence: new Map(),
    }).remediation,
    1,
  );
  audit.assessments.reviewed.disposition = "exclusion";
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), annexInputs),
    /Unresolved subject coverage cannot keep an ADR/u,
  );
  audit.assessments.reviewed.disposition = "remediation";
  const unrelated = {
    ...observation,
    detail: "error[OSEO1001]: Unknown binding 'eval'.",
  };
  audit.paths[0]!.observationDigest = exclusionObservationDigest(unrelated);
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(audit), {
        ...annexInputs,
        results: [{ ...result, observation: unrelated }],
      }),
    /outside the record surface/u,
  );
  audit.paths = [];
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), annexInputs),
    /no reviewed exclusion audit/u,
  );
});

test("near-miss accessor diagnostics preserve unrelated failures", () => {
  for (const detail of [
    "error[OSEO2001]: The Object.prototype.__proto__ accessor " +
      "is excluded by Annex B.",
    "error[OSEO1001]: The Object.prototype.__proto__ setter " +
      "is excluded by Annex B.",
    "error[OSEO1001]: The Object.prototype.__proto__ accessor " +
      "is excluded by Annex B. Extra text.",
    "error[OSEO1001]: Unknown binding '__proto__'.",
    'failed (1): stdout="error[OSEO1001]: The Object.prototype.' +
      '__proto__ accessor is excluded by Annex B.\\n" ' +
      "stderr=\"case.js:1:1: error[OSEO1001]: Unknown binding 'other'.\\n\"",
    'failed (1): stdout="" stderr="error[OSEO1001]: The Object.prototype.' +
      "__proto__ accessor is excluded by Annex B.\\n" +
      "case.js:1:1: error[OSEO1001]: Unknown binding 'other'.\\n\"",
  ]) {
    const { audit, inputs } = fixture(true);
    audit.paths[0]!.proposedOwner = annexOwner;
    audit.paths[0]!.missingDynamicTag = false;
    const observed = { ...observation, detail };
    audit.paths[0]!.observationDigest = exclusionObservationDigest(observed);
    assert.throws(
      () =>
        validateM5cExclusionAudit(stringifyYaml(audit), {
          ...inputs,
          results: [{ ...result, observation: observed }],
        }),
      /outside the record surface/u,
      detail,
    );
  }
});

/** Builds a mixed legacy lookup audit whose source calls the named method. */
function lookupFixture(
  method: "__lookupGetter__" | "__lookupSetter__",
  detail: string,
  sourceText = `assert.sameValue(this.${method}("#m"), undefined);`,
) {
  const observed = { ...observation, detail };
  const { audit, inputs } = fixture(true, sourceText, observed);
  audit.paths[0]!.proposedOwner = annexOwner;
  audit.paths[0]!.priorCohort = "annex-b";
  audit.paths[0]!.missingDynamicTag = false;
  audit.assessments.reviewed.remediationOwner = lookupRemediationOwner;
  const lookupInputs: M5cExclusionAuditInputs = {
    ...inputs,
    ledger: {
      ...inputs.ledger,
      entries: inputs.ledger.entries.map((entry) =>
        Object.assign({}, entry, { owner: lookupRemediationOwner }),
      ),
    },
  };
  return { audit, inputs: lookupInputs };
}

const lookupDiagnostic = (method: string): string =>
  `error[OSEO1001]: The Object.prototype.${method} method is excluded ` +
  "by the M5 optional legacy accessor policy.";

test("the exact legacy lookup rejection uses only its bounded owner", () => {
  for (const method of ["__lookupGetter__", "__lookupSetter__"] as const) {
    const detail = lookupDiagnostic(method);
    for (const rejection of [
      detail,
      `${detail}\n`,
      `${detail}\\n`,
      `failed (1): stdout="" stderr="test/case.js:111:22: ${detail}\\n"`,
    ]) {
      const { audit, inputs } = lookupFixture(method, rejection);
      assert.equal(
        validateM5cExclusionAudit(stringifyYaml(audit), inputs).remediation,
        1,
        rejection,
      );
      for (const other of [
        annexRemediationOwner,
        protoRemediationOwner,
        "node:observation-batch-11",
      ]) {
        audit.assessments.reviewed.remediationOwner = other;
        assert.throws(
          () =>
            validateM5cExclusionAudit(stringifyYaml(audit), {
              ...inputs,
              ledger: {
                ...inputs.ledger,
                entries: inputs.ledger.entries.map((entry) =>
                  Object.assign({}, entry, { owner: other }),
                ),
              },
            }),
          /legacy lookup remediation owner/u,
          other,
        );
      }
      audit.assessments.reviewed.remediationOwner = lookupRemediationOwner;
      audit.assessments.reviewed.disposition = "exclusion";
      audit.assessments.reviewed.normativeDependency = "annex-b-only";
      assert.throws(
        () =>
          validateM5cExclusionAudit(stringifyYaml(audit), {
            ...inputs,
            ledger: {
              ...inputs.ledger,
              entries: inputs.ledger.entries.map((entry) =>
                Object.assign({}, entry, { owner: annexOwner }),
              ),
            },
          }),
        /ADR 0032 withdrew the ADR 0013 Annex B exclusion/u,
      );
      audit.assessments.reviewed.disposition = "remediation";
      audit.assessments.reviewed.normativeDependency = "not-demonstrated";
      audit.paths = [];
      assert.throws(
        () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
        /no reviewed exclusion audit/u,
      );
    }
  }
});

test("ledger-side counts agree on a mixed legacy lookup row", () => {
  // A batch 11 row owned by the lookup remediation node, whose dependencies
  // lack dynamic-source: remediation, and no dynamic-tag debt.
  const { audit, inputs } = lookupFixture(
    "__lookupSetter__",
    lookupDiagnostic("__lookupSetter__"),
  );
  assert.deepEqual(
    validateM5cExclusionAudit(stringifyYaml(audit), inputs),
    expectedAuditCounts(
      inputs.ledger,
      new Set(audit.paths.map((row) => row.path)),
    ),
  );
});

test("the legacy lookup owner never accepts another rejection", () => {
  for (const detail of [
    "error[OSEO1001]: The Object.prototype.__proto__ accessor " +
      "is excluded by Annex B.",
    "error[OSEO1001]: A named backreference in a pattern that " +
      "declares no group name is admitted only by Annex B",
  ]) {
    const { audit, inputs } = lookupFixture("__lookupGetter__", detail);
    assert.throws(
      () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
      /legacy lookup owner needs its rejection/u,
      detail,
    );
  }
});

test("legacy lookup source calls are recognized by syntax", () => {
  const detail = lookupDiagnostic("__lookupGetter__");
  for (const sourceText of [
    'this["__lookupGetter__"]("#m");',
    'this.__lookupGetter__?.("#m");',
    'this?.__lookupGetter__("#m");',
    '(this.__lookupGetter__)("#m");',
  ]) {
    const { audit, inputs } = lookupFixture(
      "__lookupGetter__",
      detail,
      sourceText,
    );
    assert.equal(
      validateM5cExclusionAudit(stringifyYaml(audit), inputs).remediation,
      1,
      sourceText,
    );
  }
  for (const sourceText of [
    '/* this.__lookupGetter__("#m") */ typeof this.__lookupGetter__;',
    'const text = "this.__lookupGetter__(1)";',
    "const read = this.__lookupGetter__;",
    'this[name]("#m");',
    '__lookupGetter__("#m");',
    'this.__lookupGetterX__("#m");',
  ]) {
    const { audit, inputs } = lookupFixture(
      "__lookupGetter__",
      detail,
      sourceText,
    );
    assert.throws(
      () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
      /legacy lookup rejection lacks its source call/u,
      sourceText,
    );
  }
});

test("a legacy lookup rejection must name a method the source calls", () => {
  const { audit, inputs } = lookupFixture(
    "__lookupGetter__",
    lookupDiagnostic("__lookupGetter__"),
    'assert.sameValue(this.__lookupSetter__("#m"), undefined);',
  );
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), inputs),
    /legacy lookup rejection lacks its source call/u,
  );
});

test("the legacy lookup closure selector bounds its unit owner", () => {
  const { audit, inputs } = lookupFixture(
    "__lookupGetter__",
    lookupDiagnostic("__lookupGetter__"),
  );
  audit.assessments.reviewed.remediationOwner = unitAnnexOwner;
  audit.assessments.reviewed.normativeDependency = "annex-b-only";
  const owned = {
    ...inputs,
    ledger: {
      ...inputs.ledger,
      entries: inputs.ledger.entries.map((entry) =>
        Object.assign({}, entry, { owner: unitAnnexOwner }),
      ),
    },
  };
  const selected = { ...owned, annexLookupClosedPaths: new Set([path]) };
  assert.equal(
    validateM5cExclusionAudit(stringifyYaml(audit), selected).remediation,
    1,
  );
  // Outside the selector, a lookup rejection keeps its remediation node.
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(audit), owned),
    /exact legacy lookup closure selector/u,
  );
  // ADR 0032 withdrew the exclusion the selector once bounded.
  const { remediationOwner: unitOwner, ...excluded } =
    audit.assessments.reviewed;
  assert.equal(unitOwner, unitAnnexOwner);
  assert.throws(
    () =>
      validateM5cExclusionAudit(
        stringifyYaml({
          ...audit,
          assessments: {
            reviewed: { ...excluded, disposition: "exclusion" },
          },
        }),
        {
          ...selected,
          ledger: {
            ...inputs.ledger,
            entries: inputs.ledger.entries.map((entry) =>
              Object.assign({}, entry, { owner: annexOwner }),
            ),
          },
        },
      ),
    /ADR 0032 withdrew the ADR 0013 Annex B exclusion/u,
  );
  // Inside it, the row must stay bound and owned by its work unit.
  const { replacementEvidence, ...unbound } = audit.assessments.reviewed;
  assert.ok(replacementEvidence);
  assert.throws(
    () =>
      validateM5cExclusionAudit(
        stringifyYaml({ ...audit, assessments: { reviewed: unbound } }),
        selected,
      ),
    /exact legacy lookup closure selector/u,
  );
  assert.throws(
    () =>
      validateM5cExclusionAudit(
        stringifyYaml({
          ...audit,
          assessments: {
            reviewed: {
              ...audit.assessments.reviewed,
              remediationOwner: lookupRemediationOwner,
            },
          },
        }),
        selected,
      ),
    /exact legacy lookup closure selector/u,
  );
  // A selected path keeps its remediation only by leaving the selector.
  const remediation = lookupFixture(
    "__lookupGetter__",
    lookupDiagnostic("__lookupGetter__"),
  );
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(remediation.audit), {
        ...remediation.inputs,
        annexLookupClosedPaths: new Set([path]),
      }),
    /exact legacy lookup closure selector/u,
  );
  // The selector admits only a lookup rejection.
  const annexProto =
    "error[OSEO1001]: The Object.prototype.__proto__ accessor is " +
    "excluded by Annex B.";
  const proto = lookupFixture("__lookupGetter__", annexProto);
  proto.audit.assessments.reviewed.remediationOwner = unitAnnexOwner;
  proto.audit.assessments.reviewed.normativeDependency = "annex-b-only";
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(proto.audit), {
        ...proto.inputs,
        ledger: owned.ledger,
        annexLookupClosedPaths: new Set([path]),
      }),
    /exact legacy lookup closure selector/u,
  );
  // A selector path cannot leave the audit.
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(audit), {
        ...selected,
        annexLookupClosedPaths: new Set([
          path,
          "test/language/expressions/class/elements/absent.js",
        ]),
      }),
    /Legacy lookup closure selector lacks its audit row/u,
  );
});

test("the checked-in legacy lookup closure names two class pairs", () => {
  assert.deepEqual(
    [...m5cAnnexLookupClosedPaths],
    [
      "test/language/expressions/class/elements/" +
        "private-getter-is-not-a-own-property.js",
      "test/language/expressions/class/elements/" +
        "private-setter-is-not-a-own-property.js",
      "test/language/statements/class/elements/" +
        "private-getter-is-not-a-own-property.js",
      "test/language/statements/class/elements/" +
        "private-setter-is-not-a-own-property.js",
    ],
  );
});

test("near-miss legacy lookup diagnostics stay outside the surface", () => {
  const getter = lookupDiagnostic("__lookupGetter__");
  for (const detail of [
    getter.replace("OSEO1001", "OSEO2001"),
    `${getter} Extra text.`,
    getter.replace("__lookupGetter__", "__defineGetter__"),
    getter.replace("__lookupGetter__", "__lookupgetter__"),
    getter.replace("by the M5 optional legacy accessor policy.", "by Annex B."),
    "error[OSEO1001]: Unknown binding '__lookupGetter__'.",
    "error[OSEO2001]: TypeError: Called value is not a function.",
    `failed (1): stdout="${getter}\\n" ` +
      "stderr=\"case.js:1:1: error[OSEO1001]: Unknown binding 'other'.\\n\"",
  ]) {
    const { audit, inputs } = lookupFixture("__lookupGetter__", detail);
    audit.assessments.reviewed.remediationOwner = annexRemediationOwner;
    assert.throws(
      () =>
        validateM5cExclusionAudit(stringifyYaml(audit), {
          ...inputs,
          ledger: {
            ...inputs.ledger,
            entries: inputs.ledger.entries.map((entry) =>
              Object.assign({}, entry, { owner: annexRemediationOwner }),
            ),
          },
        }),
      /outside the record surface/u,
      detail,
    );
  }
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

const callerPath = "test/built-ins/Function/15.3.5.4_2-75gs.js";
const callerSource =
  'function f() { return g(); }\n(function() { "use strict"; f(); })();\n' +
  "function g() { return g.caller; }\n";
const callerObservation = {
  passed: false,
  detail: "Not executed: the frontmatter needs an unsupported feature.",
};

/** One reviewed ADR 0028 row over the frontmatter caller rejection. */
function callerFixture(sourceText = callerSource) {
  const { audit, inputs } = fixture(false, sourceText, callerObservation);
  const assessments = {
    ...audit.assessments,
    caller: {
      disposition: "exclusion",
      normativeDependency: "legacy-caller-only",
      reason: "The read of a non-strict function's caller was reviewed.",
    },
  };
  const row = {
    ...audit.paths[0]!,
    path: callerPath,
    proposedOwner: callerOwner,
    priorCohort: "legacy-caller",
    missingDynamicTag: false,
    section: "sec-forbidden-extensions",
    subject: "Optional legacy caller read on a non-strict function",
    assessment: "caller",
  };
  const callerResult: Test262Result = {
    ...result,
    case: {
      ...result.case,
      features: ["caller"],
      flags: ["noStrict"],
      path: callerPath,
    },
    observation: callerObservation,
    unsupportedFeatures: ["caller"],
  };
  return {
    audit: { ...audit, assessments, paths: [row] },
    inputs: {
      ...inputs,
      legacyCallerPaths: new Set([callerPath]),
      ledger: {
        ...inputs.ledger,
        entries: [
          {
            path: callerPath,
            owner: callerOwner,
            prerequisites: callerResult.dependencies,
            state: callerResult.classification,
          },
        ],
      },
      results: [callerResult],
      sources: new Map([[callerPath, sourceText]]),
    },
  };
}

test("the exact caller rejection uses only the ADR 0028 owner", () => {
  const { audit, inputs } = callerFixture();
  assert.deepEqual(validateM5cExclusionAudit(stringifyYaml(audit), inputs), {
    exclusions: 1,
    remediation: 0,
    deferrals: 0,
    missingDynamicTags: 0,
  });
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(audit), {
        ...inputs,
        legacyCallerPaths: new Set<string>(),
      }),
    /exact ADR 0028 selector/u,
  );
  for (const change of [
    { proposedOwner: owner },
    { priorCohort: "source-subject" },
  ]) {
    const changed = callerFixture().audit;
    Object.assign(changed.paths[0]!, change);
    assert.throws(
      () => validateM5cExclusionAudit(stringifyYaml(changed), inputs),
      /exact ADR 0028 selector/u,
    );
  }
  const remediation = callerFixture().audit;
  remediation.assessments.caller = {
    disposition: "remediation",
    normativeDependency: "legacy-caller-only",
    reason: "Remediation has no owner under this record.",
  };
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(remediation), inputs),
    /no remediation owner/u,
  );
});

test("the caller surface rejects other features, details, and sources", () => {
  const { audit, inputs } = callerFixture();
  const row = inputs.results[0]!;
  for (const changed of [
    { ...row, unsupportedFeatures: ["caller", "cross-realm"] },
    { ...row, unsupportedFeatures: [] },
    { ...row, case: { ...row.case, features: [] } },
    { ...row, case: { ...row.case, flags: ["onlyStrict"] } },
  ]) {
    assert.throws(
      () =>
        validateM5cExclusionAudit(stringifyYaml(audit), {
          ...inputs,
          results: [changed],
        }),
      /outside the record surface/u,
    );
  }
  const detail = {
    ...callerObservation,
    detail: "Not executed: the frontmatter needs an unsupported include.",
  };
  const other = callerFixture();
  other.audit.paths[0]!.observationDigest = exclusionObservationDigest(detail);
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(other.audit), {
        ...other.inputs,
        results: [{ ...row, observation: detail }],
      }),
    /outside the record surface/u,
  );
  const text = callerFixture('var name = "caller"; // g.caller\n');
  assert.throws(
    () => validateM5cExclusionAudit(stringifyYaml(text.audit), text.inputs),
    /outside the record surface/u,
  );
});

test("reviewed caller selector paths cannot leave the audit", () => {
  const { audit, inputs } = callerFixture();
  const empty = { ...audit, paths: [] };
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(empty), {
        ...inputs,
        ledger: {
          ...inputs.ledger,
          entries: inputs.ledger.entries.map((entry) => ({
            ...entry,
            owner: "unassigned",
          })),
        },
      }),
    /selector path lacks its audit row/u,
  );
  assert.deepEqual(
    validateM5cExclusionAudit(stringifyYaml(empty), {
      ...inputs,
      results: [],
      ledger: {
        ...inputs.ledger,
        entries: inputs.ledger.entries.map((entry) => ({
          ...entry,
          owner: "node:observation-batch-32",
          prerequisites: [],
          state: "unreviewed",
        })),
      },
    }),
    { exclusions: 0, remediation: 0, deferrals: 0, missingDynamicTags: 0 },
  );
  assert.deepEqual(
    validateM5cExclusionAudit(stringifyYaml(audit), {
      ...inputs,
      results: inputs.results.map((entry) =>
        Object.assign({}, entry, {
          classification: "pass",
          observation: { passed: true },
          unsupportedFeatures: [],
        }),
      ),
      ledger: {
        ...inputs.ledger,
        entries: inputs.ledger.entries.map((entry) =>
          Object.assign({}, entry, {
            owner: "observation",
            prerequisites: [],
            state: "pass" as const,
          }),
        ),
      },
    }),
    { exclusions: 0, remediation: 0, deferrals: 0, missingDynamicTags: 0 },
  );
});

/** A selector path that fails on its `eval` call after ADR 0034. */
function callerResidueFixture() {
  const sourceText = 'function f() { return eval("g.caller"); }\n';
  const { audit, inputs } = fixture(false, sourceText);
  Object.assign(audit.paths[0]!, { priorCohort: "legacy-caller" });
  return {
    audit,
    inputs: {
      ...inputs,
      legacyCallerAdmitted: true,
      legacyCallerPaths: new Set([path]),
    },
  };
}

test("an admitted caller selector path that still fails is ADR 0016", () => {
  const { audit, inputs } = callerResidueFixture();
  assert.deepEqual(validateM5cExclusionAudit(stringifyYaml(audit), inputs), {
    exclusions: 1,
    remediation: 0,
    deferrals: 0,
    missingDynamicTags: 1,
  });
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(audit), {
        ...inputs,
        legacyCallerAdmitted: false,
      }),
    /exact ADR 0028 selector/u,
  );
  for (const change of [
    { proposedOwner: callerOwner },
    { proposedOwner: annexOwner },
    { priorCohort: "incidental-scaffolding" },
  ]) {
    const changed = callerResidueFixture().audit;
    Object.assign(changed.paths[0]!, change);
    assert.throws(
      () => validateM5cExclusionAudit(stringifyYaml(changed), inputs),
      /exact ADR 0028 selector/u,
    );
  }
  for (const normativeDependency of [
    "legacy-caller-only",
    "not-demonstrated",
  ]) {
    const changed = callerResidueFixture().audit;
    changed.assessments.reviewed = {
      ...changed.assessments.reviewed,
      normativeDependency,
    };
    assert.throws(
      () => validateM5cExclusionAudit(stringifyYaml(changed), inputs),
      /exact ADR 0028 selector/u,
    );
  }
  // The ADR 0016 owner still needs the dynamic-source rejection.
  const caller = callerFixture();
  caller.audit.paths[0]!.proposedOwner = owner;
  caller.audit.assessments.caller = {
    disposition: "exclusion",
    normativeDependency: "source-evaluation-only",
    reason: "The caller rejection is not a dynamic-source rejection.",
  };
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml(caller.audit), {
        ...caller.inputs,
        legacyCallerAdmitted: true,
        ledger: {
          ...caller.inputs.ledger,
          entries: caller.inputs.ledger.entries.map((entry) =>
            Object.assign({}, entry, { owner }),
          ),
        },
      }),
    /outside the record surface/u,
  );
});

test("an admitted caller selector path that passes keeps its row", () => {
  const { audit, inputs } = callerFixture();
  const passing = {
    ...inputs,
    legacyCallerAdmitted: true,
    results: inputs.results.map((entry) =>
      Object.assign({}, entry, {
        classification: "pass",
        observation: { passed: true },
        unsupportedFeatures: [],
      }),
    ),
    ledger: {
      ...inputs.ledger,
      entries: inputs.ledger.entries.map((entry) =>
        Object.assign({}, entry, {
          owner: "observation",
          prerequisites: [],
          state: "pass" as const,
        }),
      ),
    },
  };
  assert.deepEqual(validateM5cExclusionAudit(stringifyYaml(audit), passing), {
    exclusions: 0,
    remediation: 0,
    deferrals: 0,
    missingDynamicTags: 0,
  });
  assert.throws(
    () =>
      validateM5cExclusionAudit(stringifyYaml({ ...audit, paths: [] }), {
        ...passing,
      }),
    /selector path lacks its audit row/u,
  );
});

test("caller member reads are recognized by syntax", () => {
  for (const text of [
    "g.caller;",
    "arguments.callee.caller(true);",
    "g?.caller;",
    'g["caller"];',
    "(g).caller;",
  ]) {
    assert.equal(hasCallerRead(text, "script"), true, text);
  }
  for (const text of [
    '"g.caller";',
    "// g.caller\n",
    "var caller = 1; caller;",
    "g[caller];",
    "g.callers;",
  ]) {
    assert.equal(hasCallerRead(text, "script"), false, text);
  }
});

test("the ADR 0028 selector is exactly the pinned caller paths", () => {
  const record = readFileSync(
    new URL(
      "../docs/adr/0028-legacy-function-caller-boundary.md",
      import.meta.url,
    ),
    "utf8",
  );
  const selector = legacyCallerSelector(record);
  assert.equal(selector.size, 23);
  assert.ok(selector.has("test/built-ins/Function/15.3.5.4_2-12gs.js"));
  assert.ok(selector.has("test/language/arguments-object/10.6-13-a-3.js"));
  assert.throws(
    () =>
      legacyCallerSelector(
        record.replace("\nExact selector\n", "\nSelector\n"),
      ),
    /Exact selector section/u,
  );
});
