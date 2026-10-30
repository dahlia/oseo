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
