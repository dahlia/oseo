Observation batch 26b: preparation
==================================

On source `8f420262`, focused `executeTest262Case` observations cover
all 645 originals selected for this batch: 521 pass,
65 expected-negative and 59 unsupported-profile-feature.
There are no semantic, harness or infrastructure failures and no held paths.
These are branch preparation results; Root owns scoped UPDATE, integration,
landing, publication and the outer gate.

The 59 unsupported originals remain active in-claim coverage
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
dependency evidence and audit corrections; *observation-batch-26b.paths* and
*observation-batch-26b.review-units* name the 645 paths and 378 review units.
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

| Original path                                                          | Owner                               |
| ---------------------------------------------------------------------- | ----------------------------------- |
| test/language/statements/function/13.0-12-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.0-13-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.0-14-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.0-15-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.0-16-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.0-17-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.0-7-s.js                          | dynamic-source-coverage-remediation |
| test/language/statements/function/13.0-8-s.js                          | dynamic-source-coverage-remediation |
| test/language/statements/function/13.0\_4-17gs.js                      | dynamic-source-coverage-remediation |
| test/language/statements/function/13.1-19-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.1-2-s.js                          | dynamic-source-coverage-remediation |
| test/language/statements/function/13.1-21-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.1-22-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.1-23-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.1-25-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.1-27-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.1-29-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.1-31-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.1-33-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.1-39-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.1-4-s.js                          | dynamic-source-coverage-remediation |
| test/language/statements/function/13.1-41-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-10-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-11-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-12-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-13-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-14-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-15-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-16-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-17-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-18-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-19-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-20-s.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-5-s.js                          | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-6-s.js                          | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-7-s.js                          | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-8-s.js                          | dynamic-source-coverage-remediation |
| test/language/statements/function/13.2-9-s.js                          | dynamic-source-coverage-remediation |
| test/language/statements/function/`S13.2.2_A13.js`                     | dynamic-source-coverage-remediation |
| test/language/statements/function/S13.2.2\_A14.js                      | dynamic-source-coverage-remediation |
| test/language/statements/function/S13.2.2\_A8\_T3.js                   | dynamic-source-coverage-remediation |
| test/language/statements/function/S13\_A14\_T1.js                      | dynamic-source-coverage-remediation |
| test/language/statements/function/cptn-decl.js                         | dynamic-source-coverage-remediation |
| test/language/statements/function/eval-var-scope-syntax-err.js         | dynamic-source-coverage-remediation |
| test/language/statements/function/name-eval-stricteval.js              | dynamic-source-coverage-remediation |
| test/language/statements/function/name-unicode.js                      | dynamic-source-coverage-remediation |
| test/language/statements/function/param-eval-stricteval.js             | dynamic-source-coverage-remediation |
| test/language/statements/function/scope-body-lex-distinct.js           | dynamic-source-coverage-remediation |
| test/language/statements/function/scope-param-elem-var-close.js        | dynamic-source-coverage-remediation |
| test/language/statements/function/scope-param-elem-var-open.js         | dynamic-source-coverage-remediation |
| test/language/statements/function/scope-param-rest-elem-var-close.js   | dynamic-source-coverage-remediation |
| test/language/statements/function/scope-param-rest-elem-var-open.js    | dynamic-source-coverage-remediation |
| test/language/statements/generators/cptn-decl.js                       | dynamic-source-coverage-remediation |
| test/language/statements/generators/eval-var-scope-syntax-err.js       | dynamic-source-coverage-remediation |
| test/language/statements/generators/scope-body-lex-distinct.js         | dynamic-source-coverage-remediation |
| test/language/statements/generators/scope-param-elem-var-close.js      | dynamic-source-coverage-remediation |
| test/language/statements/generators/scope-param-elem-var-open.js       | dynamic-source-coverage-remediation |
| test/language/statements/generators/scope-param-rest-elem-var-close.js | dynamic-source-coverage-remediation |
| test/language/statements/generators/scope-param-rest-elem-var-open.js  | dynamic-source-coverage-remediation |


Internal pass 1 corrections
---------------------------

All 1,669 train rows were rechecked against each finding pattern and the
latest consolidated tag rules, including Root's October 30 clarifications.
This batch has 38 dependency rows corrected in that audit.

Root retained dynamic-source on `S13.2.2_A13.js` even though eval is unreachable
at run time: handling that construct is a prerequisite of the observed
compile-time dynamic-source rejection under ADR 0013. The audit corrected
nested evaluated Function assignments, unused holders around rejected source,
implicit with-environment Symbol.unscopables reads, required runtime errors,
and setup branches that deliberately define the observed caller property. Root
confirmed that constant-false counterparts and assertion-only selection
branches add no control-flow.

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

Inherited strictness makes three direct-eval result holders unreachable before
initialization. The throwing-function holder audit also excludes an unused
local and a result target that cannot initialize. Constant-false
caller-property setup adds no object-literals or lexical-bindings coverage, and
an oracle-only absent-property Symbol sentinel adds no symbols coverage. True
branches that deliberately define the observed caller property retain their
setup families. Expected-error instanceof checks add no symbols or property
coverage.

Root confirmed that expected-error comparisons and their implicit
instanceof protocol are assertion plumbing, as are constant reach markers
and declarations whose sole purpose is to hold those markers. Actual
catch binding and destructuring subjects retain their own families.

The dispatch packet records source hashes, the full-train pattern audits,
and exact changes in `round2-fix-plan.json`, `round2-fix-applied.json` and
the `round2-*-audit.json` and `round2-*-candidates.json` artifacts. The fixed
second-pass verdicts are in `review-round-2/attempts.json`. Classifications,
counts, unsupported ownership and the original admitted rows are preserved.
