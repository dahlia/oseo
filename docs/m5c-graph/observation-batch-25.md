Observation batch 25: preparation
=================================

On source `8f420262`, focused `executeTest262Case` observations cover
all 646 originals selected for this batch: 560 pass,
79 expected-negative and 7 unsupported-profile-feature.
There are no semantic, harness or infrastructure failures and no held paths.
These are branch preparation results; Root owns scoped UPDATE, integration,
landing, publication and the outer gate.

The 7 unsupported originals remain active in-claim coverage
remediation under `node:dynamic-source-coverage-remediation`. Their
observations report the existing unknown-eval source-compilation
rejection. They gain source-bound assessments under
`observation-train-b24-b25` in the exclusion audit, with original source
hashes, normalized observation digests, normative sections and subjects.
No replacement or whole-path exclusion is claimed. ADR 0013, ADR 0016 and
ADR 0019, including their reopening triggers, remain unchanged.


Evidence
--------

The dispatch packet is
[dispatch packet](/data/m5c-d17-20261031/train-d/task_f6880fe9a7b3/ctx_2931b5fdcc73/).
Its *intake.json* binds the pinned source hashes and exact batch selectors.
*observations.json* contains the runner classifications and specialization
variants, while *raw/* retains every native execution request and result.
*reviewed-tags.json* records per-path dependency evidence and audit
corrections; *observation-batch-25.paths* and
*observation-batch-25.review-units* name the 646 paths and 500 review units.
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
Literal eval source strings are parsed for their actual subject syntax.
The two B24 uncalled async generators retain syntax families and omit
runtime iterator, symbol, promise and assignment claims. Object-rest copying
retains own-key enumeration only after the non-null input reaches copying.
Implicit iterable consumers retain iterator-protocol and symbols where their
Symbol-keyed lookup is reached. Parse-only negatives retain subject grammar
families without runtime promise, abrupt-completion or protocol claims.
Rejected declaration placements and destructuring targets retain their subject
syntax families, without runtime protocol claims. No fixture module contributes
a tag in this train; the fixture-derived row count is zero. Existing subset
rows, classifications, tags and owners are preserved.


Unsupported selector
--------------------

| Original path                                               | Owner                               |
| ----------------------------------------------------------- | ----------------------------------- |
| *test/language/statements/for-of/cptn-decl-abrupt-empty.js* | dynamic-source-coverage-remediation |
| *test/language/statements/for-of/cptn-decl-itr.js*          | dynamic-source-coverage-remediation |
| *test/language/statements/for-of/cptn-decl-no-itr.js*       | dynamic-source-coverage-remediation |
| *test/language/statements/for-of/cptn-expr-abrupt-empty.js* | dynamic-source-coverage-remediation |
| *test/language/statements/for-of/cptn-expr-itr.js*          | dynamic-source-coverage-remediation |
| *test/language/statements/for-of/cptn-expr-no-itr.js*       | dynamic-source-coverage-remediation |
| *test/language/statements/for-of/scope-head-var-none.js*    | dynamic-source-coverage-remediation |
