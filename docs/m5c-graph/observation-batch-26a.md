Observation batch 26a: preparation
==================================

On source `8f420262`, focused `executeTest262Case` observations cover
all 384 originals selected for this batch: 326 pass,
49 expected-negative and 9 unsupported-profile-feature.
There are no semantic, harness or infrastructure failures and no held paths.
These are branch preparation results; Root owns scoped UPDATE, integration,
landing, publication and the outer gate.

The 9 unsupported originals remain active in-claim coverage
remediation under `node:dynamic-source-coverage-remediation`. Their
observations report the existing eval or Function source-compilation
boundary, including unknown-eval binding diagnostics. They gain source-bound
assessments under
`observation-train-b26a-b26b-b27` in the exclusion audit, with original source
hashes, normalized observation digests, normative sections and subjects.
No replacement or whole-path exclusion is claimed. ADR 0013, ADR 0016 and
ADR 0019, including their reopening triggers, remain unchanged.


Evidence
--------

The
[dispatch packet](/data/m5c-d17-20261031/train-c/task_e9fd521bf8ca/ctx_f6f615dc9f66/)
retains the raw evidence. Its *intake.json* binds the pinned source hashes and
exact batch selectors. *observations.json* contains the runner classifications
and specialization variants, while *raw/* retains every native execution
request and result. *self-audit.json* and *reviewed-tags.json* record per-path
dependency evidence and audit corrections; *observation-batch-26a.paths* and
*observation-batch-26a.review-units* name the 384 paths and 209 review units.
The canonical serializer materializes the saved observations into the manifest
before U; Root's scoped UPDATE must strictly agree before R is accepted.


Dependency self-audit
---------------------

Every row was checked against the consolidated tag rules of October 29
and every October 30 clarification. Tags name an asserted source contract
or its prerequisites. Assertion messages, failure-only Test262Error
branches, normally completing try statements and expected-error checking
plumbing supply no independent coverage. Catch environments and statement
completion forms retain control-flow only when they are subjects; helper
branches that change an asserted operation retain the prerequisite.

Expected-descriptor objects passed only to verifyProperty are excluded
from object-literals; Object.defineProperty descriptors remain prerequisites.
Literal eval and Function source strings are parsed for their actual subject
syntax, including evaluated object literals. Implicit iterable consumers
retain iterator-protocol and symbols where their Symbol-keyed lookup is
reached. Parse-only negatives retain subject grammar families without
runtime promise, abrupt-completion or protocol claims. Original declaration
conflicts include both declarations in the rejected early-error contract.
No fixture module contributes a tag in this train; the fixture-derived
row count is zero. Existing subset rows, classifications, tags and owners
are preserved.


Unsupported selector
--------------------

| Original path                                                                   | Owner                               |
| ------------------------------------------------------------------------------- | ----------------------------------- |
| test/language/statements/for/S12.6.3\_A5.js                                     | dynamic-source-coverage-remediation |
| test/language/statements/for/cptn-decl-expr-iter.js                             | dynamic-source-coverage-remediation |
| test/language/statements/for/cptn-decl-expr-no-iter.js                          | dynamic-source-coverage-remediation |
| test/language/statements/for/cptn-expr-expr-iter.js                             | dynamic-source-coverage-remediation |
| test/language/statements/for/cptn-expr-expr-no-iter.js                          | dynamic-source-coverage-remediation |
| test/language/statements/for/head-init-expr-check-empty-inc-empty-completion.js | dynamic-source-coverage-remediation |
| test/language/statements/for/head-init-var-check-empty-inc-empty-completion.js  | dynamic-source-coverage-remediation |
| test/language/statements/for/scope-body-var-none.js                             | dynamic-source-coverage-remediation |
| test/language/statements/for/scope-head-var-none.js                             | dynamic-source-coverage-remediation |


Internal pass 1 corrections
---------------------------

All 1,669 train rows were rechecked against each finding pattern and the
latest consolidated tag rules, including Root's October 30 clarifications.
This batch has 55 dependency rows corrected in that audit.

The audit corrected rejected lexical declarations and head/body declaration
conflicts, rest-element declaration families, let lookahead grammar, asserted
break/continue completions, and operators in unreachable initializers or falsy
loop bodies.

Root confirmed that a declaration used only as an unread assignment
target for source that must fail to parse adds no holder syntax coverage.
Identifier-only let tests retain lexical-grammar rather than a directory-only
lexical-bindings claim. Rejected for-in heads keep control-flow as their
grammar carrier and drop runtime property-enumeration.

The source-section audit checked all 143 unsupported assessments and
recovered 37 es6id references omitted by the original fallback. Every
unsupported path keeps its source hash and normalized observation digest.
The full cohort audit distinguishes 61 source subjects from 82 incidental
uses; this cohort records the asserted subject, not an exclusion or proof
of normative dependence. Counts, classifications and active remediation
owners remain as above.

The dispatch packet's *round1-fix-plan.json* and
*round1-fix-applied.json* record the exact changes and source-bound reasons.
Its `round1-*-candidates.json` and `round1-*-conclusions.json` retain the
full-train pattern audits, while *review-round-1/attempts.json* retains every
first-pass verdict. The final packet includes every later review verdict
and Codex rollout path for Root's audit.


Internal pass 2 corrections
---------------------------

All 1,669 train rows were checked for every second-pass finding pattern
against the latest consolidated tag rules. This batch has
14 dependency rows corrected in that audit.

Expected-error sentinel comparisons and constant loop reach-marker assignments
add no expression-operators coverage. Real loop input declarations, loop-head
bindings and computed counters remain prerequisites.

Root confirmed that expected-error comparisons and their implicit
instanceof protocol are assertion plumbing, as are constant reach markers
and declarations whose sole purpose is to hold those markers. Actual
catch binding and destructuring subjects retain their own families.

The dispatch packet records source hashes, the full-train pattern audits,
and exact changes in `round2-fix-plan.json`, `round2-fix-applied.json` and
the `round2-*-audit.json` and `round2-*-candidates.json` artifacts. The fixed
second-pass verdicts are in `review-round-2/attempts.json`. Classifications,
counts, unsupported ownership and the original admitted rows are preserved.


Internal pass 3 corrections
---------------------------

All 1,669 train rows were checked for every third-pass finding pattern
against the latest consolidated tag rules. This batch has
106 dependency rows corrected in that audit.

Unused for-head declarations and constant reach markers do not establish
var-binding coverage. Expected-error checks, marker assignments and their
comparisons do not establish operator coverage. Skipped default helpers,
assertion wrappers and shape-check predicates add no function or generator
coverage; real loop inputs, iterator setup and computed counters remain.

Root confirmed the skipped-default helper, Array.isArray oracle, implicit
iterator-property, TDZ and expected-value comparison boundaries. All train rows
were scanned for the function-observer, holder, marker, evaluated-operator and
implicit Symbol patterns. Source hashes and independent retained witnesses are
recorded per candidate; AST reachability is candidate evidence, not an
execution trace.

The dispatch packet records source hashes, the full-train pattern audits,
and exact changes in `round3-fix-plan.json`, `round3-fix-applied.json` and
the `round3-*-audit.json` and `round3-*-candidates.json` artifacts. The fixed
third-pass verdicts are in `review-round-3/attempts.json`. Classifications,
counts, unsupported ownership and the original admitted rows are preserved.


Internal pass 4 corrections
---------------------------

All 1,669 train rows were checked for every fourth-pass finding pattern
against the latest consolidated rules and original sources. This batch has
88 dependency rows corrected in that audit.

Implicit iterator acquisition and iteration reads are recorded through
iterator-protocol and symbols. They add no independent object-properties
coverage. Explicit typed-array element mutation, iterator setup, input
variables and evaluated loop-condition operators retain their families.

Declarations used only to observe that a counter update never executes
add no var-bindings coverage. The audit distinguishes skipped defaults,
falsy loop bodies and later initializers blocked by an earlier throw
from real input holders, evaluated counter computations and binding
scope subjects.

Source hashes, the whole-train pattern scans and exact corrections are
recorded in `round4-fix-plan.json`, `round4-fix-applied.json`, the
`round4-*-conclusions.json` artifacts and
`zero-counter-holder-Root-decision.json` in the dispatch packet. AST
reachability remains candidate analysis; literal inputs and original source
contracts establish the boundaries. Classifications, counts, unsupported
ownership and prior admitted rows are preserved. All fixed fourth-pass verdicts
are retained in `review-round-4/attempts.json`.
