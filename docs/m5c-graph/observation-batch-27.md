Observation batch 27: preparation
=================================

On source `8f420262`, focused `executeTest262Case` observations cover
all 640 originals selected for this batch: 373 pass,
192 expected-negative and 75 unsupported-profile-feature.
There are no semantic, harness or infrastructure failures and no held paths.
These are branch preparation results; Root owns scoped UPDATE, integration,
landing, publication and the outer gate.

The 75 unsupported originals remain active in-claim coverage
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
dependency evidence and audit corrections; *observation-batch-27.paths* and
*observation-batch-27.review-units* name the 640 paths and 464 review units.
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

| Original path                                                                                | Owner                               |
| -------------------------------------------------------------------------------------------- | ----------------------------------- |
| test/language/statements/if/S12.5\_A2.js                                                     | dynamic-source-coverage-remediation |
| test/language/statements/if/cptn-else-false-abrupt-empty.js                                  | dynamic-source-coverage-remediation |
| test/language/statements/if/cptn-else-false-nrml.js                                          | dynamic-source-coverage-remediation |
| test/language/statements/if/cptn-else-true-abrupt-empty.js                                   | dynamic-source-coverage-remediation |
| test/language/statements/if/cptn-else-true-nrml.js                                           | dynamic-source-coverage-remediation |
| test/language/statements/if/cptn-empty-statement.js                                          | dynamic-source-coverage-remediation |
| test/language/statements/if/cptn-no-else-false.js                                            | dynamic-source-coverage-remediation |
| test/language/statements/if/cptn-no-else-true-abrupt-empty.js                                | dynamic-source-coverage-remediation |
| test/language/statements/if/cptn-no-else-true-nrml.js                                        | dynamic-source-coverage-remediation |
| test/language/statements/labeled/cptn-break.js                                               | dynamic-source-coverage-remediation |
| test/language/statements/labeled/cptn-nrml.js                                                | dynamic-source-coverage-remediation |
| test/language/statements/let/cptn-value.js                                                   | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-a-abrupt-empty.js                                       | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-a-fall-thru-abrupt-empty.js                             | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-a-fall-thru-nrml.js                                     | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-abrupt-empty.js                                         | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-b-abrupt-empty.js                                       | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-b-fall-thru-abrupt-empty.js                             | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-b-fall-thru-nrml.js                                     | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-b-final.js                                              | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-dflt-abrupt-empty.js                                    | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-dflt-b-abrupt-empty.js                                  | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-dflt-b-fall-thru-abrupt-empty.js                        | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-dflt-b-fall-thru-nrml.js                                | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-dflt-b-final.js                                         | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-dflt-fall-thru-abrupt-empty.js                          | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-dflt-fall-thru-nrml.js                                  | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-dflt-final.js                                           | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-no-dflt-match-abrupt-empty.js                           | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-no-dflt-match-fall-thru-abrupt-empty.js                 | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-no-dflt-match-fall-thru-nrml.js                         | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-no-dflt-match-final.js                                  | dynamic-source-coverage-remediation |
| test/language/statements/switch/cptn-no-dflt-no-match.js                                     | dynamic-source-coverage-remediation |
| test/language/statements/switch/scope-var-none-case.js                                       | dynamic-source-coverage-remediation |
| test/language/statements/switch/scope-var-none-dflt.js                                       | dynamic-source-coverage-remediation |
| test/language/statements/try/catch-parameter-boundnames-restriction-arguments-eval-throws.js | dynamic-source-coverage-remediation |
| test/language/statements/try/catch-parameter-boundnames-restriction-eval-eval-throws.js      | dynamic-source-coverage-remediation |
| test/language/statements/try/completion-values.js                                            | dynamic-source-coverage-remediation |
| test/language/statements/try/cptn-catch-empty-break.js                                       | dynamic-source-coverage-remediation |
| test/language/statements/try/cptn-catch-empty-continue.js                                    | dynamic-source-coverage-remediation |
| test/language/statements/try/cptn-catch-finally-empty-break.js                               | dynamic-source-coverage-remediation |
| test/language/statements/try/cptn-catch-finally-empty-continue.js                            | dynamic-source-coverage-remediation |
| test/language/statements/try/cptn-catch.js                                                   | dynamic-source-coverage-remediation |
| test/language/statements/try/cptn-finally-empty-break.js                                     | dynamic-source-coverage-remediation |
| test/language/statements/try/cptn-finally-empty-continue.js                                  | dynamic-source-coverage-remediation |
| test/language/statements/try/cptn-finally-from-catch.js                                      | dynamic-source-coverage-remediation |
| test/language/statements/try/cptn-finally-skip-catch.js                                      | dynamic-source-coverage-remediation |
| test/language/statements/try/cptn-finally-wo-catch.js                                        | dynamic-source-coverage-remediation |
| test/language/statements/try/cptn-try.js                                                     | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-10-s.js                                             | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-11.js                                               | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-16-s.js                                             | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-17-s.js                                             | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-18-s.js                                             | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-19-s.js                                             | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-2-s.js                                              | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-20-s.js                                             | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-21-s.js                                             | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-22-s.js                                             | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-3-s.js                                              | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-4-s.js                                              | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-5-s.js                                              | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-6-s.js                                              | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-7-s.js                                              | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-8-s.js                                              | dynamic-source-coverage-remediation |
| test/language/statements/variable/12.2.1-9-s.js                                              | dynamic-source-coverage-remediation |
| test/language/statements/variable/S12.2\_A5.js                                               | dynamic-source-coverage-remediation |
| test/language/statements/variable/cptn-value.js                                              | dynamic-source-coverage-remediation |
| test/language/statements/while/S12.6.2\_A3.js                                                | dynamic-source-coverage-remediation |
| test/language/statements/while/S12.6.2\_A5.js                                                | dynamic-source-coverage-remediation |
| test/language/statements/while/S12.6.2\_A7.js                                                | dynamic-source-coverage-remediation |
| test/language/statements/while/S12.6.2\_A8.js                                                | dynamic-source-coverage-remediation |
| test/language/statements/while/cptn-abrupt-empty.js                                          | dynamic-source-coverage-remediation |
| test/language/statements/while/cptn-iter.js                                                  | dynamic-source-coverage-remediation |
| test/language/statements/while/cptn-no-iter.js                                               | dynamic-source-coverage-remediation |


Internal pass 1 corrections
---------------------------

All 1,669 train rows were rechecked against each finding pattern and the
latest consolidated tag rules, including Root's October 30 clarifications.
This batch has 86 dependency rows corrected in that audit.

The audit corrected lexical-declaration conflicts and ASI grammar, parse-only
enumeration claims, unused function wrappers, skipped initializer and
post-throw operators, executed rest-consumption counters, asserted abrupt
completions and runtime errors, implicit with/concat Symbol dispatch, and
checking-only control flow around thrown values.

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
