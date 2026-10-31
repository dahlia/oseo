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


Internal pass 2 corrections
---------------------------

All 1,669 train rows were checked for every second-pass finding pattern
against the latest consolidated tag rules. This batch has
50 dependency rows corrected in that audit.

Evaluated String.prototype.split calls retain the implicit Symbol.split
prerequisite of the asserted loop result. Constant reach-marker assignments and
their sole declarations add no operator or var-binding coverage. Skipped
initializer, unresumed generator and uncalled getter counters remain excluded
even when an executed catch marker appeared alongside them. Real catch-scope
declarations, captured probes, computed counters, iterator setup, and Error
methods whose formatted result is asserted retain their families.

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
118 dependency rows corrected in that audit.

Executed unresolved-binding probes retain error-intrinsics, and numeric
conversion of function-object switch inputs retains symbols for
Symbol.toPrimitive. A TDZ read that throws before addition excludes that
unexecuted operator. The function-local TDZ case retains its invoked inner
function; ordinary assert.throws wrappers alone add no function family. Skipped
default observers, shape-check predicates, unused holders and constant markers
add no dependency coverage. The implicit iterator lookup stays in
iterator-protocol rather than object-properties, and actual catch-scope
subjects, Error formatting calls and loop inputs retain their families.

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
80 dependency rows corrected in that audit.

The property audit preserves actual object-pattern reads, indexed element
assertions and property setup. Implicit iterator lookups and Array.isArray
oracle checks add no independent property family. Nullish inputs that abort
before named-property reads retain their actual TypeError, binding and iterator
contracts. The three closure getters lose their addition because a TDZ read
throws first; direct closure assignments remain actual write subjects. Static
lexical-name conflicts retain lexical-bindings for async functions, generators,
classes and the early catch/block-function conflict. The false-gated labeled
let/ASI case loses its unreachable assignment while the if/while contrasts
retain their executed assignments. Actual var, catch and captured-scope
subjects remain.

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


Outer pass 2 var-binding audit
------------------------------

The full-train audit checked every remaining var-bindings row against the
executed-use rule, including all previously retained marker contrasts.
In this batch, `try/S12.14_A17.js` drops var-bindings. Its sole var i only
numbers failure messages; the constructor increments it without observing
its value on a successful path. That diagnostic counter is scaffolding.

Var declarations which are themselves the subject retain their tags under
Root's clarified rule, including destructuring initialization and grammar
or scope subjects. Every changed and retained row has source-bound evidence
in */data/m5c-d17-20261031/train-c-outer-fix2/audit.json*.
Observations, classifications, unsupported owners and admitted paths are
unchanged.
