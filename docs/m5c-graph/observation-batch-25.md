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
*observation-batch-25.review-units* name the 646 paths and 500 review units. U
canonically materializes the saved focused observations. The independent scoped
UPDATE and strict agreement are recorded below.


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


Scoped UPDATE agreement
-----------------------

Root independently observed U `fe82c8aea6f8d880b4ea3d3e38fc56873b8124c6`
against baseline `8f4202628356e172e1b4093a371d086070619de3`.
Its scoped UPDATE completed with exit 0, selecting all 1,440 B24/B25
originals: 1,354 passes, 79 expected negatives and 7 unsupported results,
with no retries. The remote result tree equals U's tree, all manifest
partitions were unchanged, and the result patch and worktree status are
empty. Every admitted record strictly agrees with the focused observations,
including classifications and executed variants, after the reviewed
dependency-tag projection.

The
[raw Root reply](/data/m5c-d17-20261031/train-d/task_f6880fe9a7b3/ctx_2931b5fdcc73/UPDATE-reply.json),
[remote result](/data/m5c-d17-20261031/train-d/root-scoped-fe82c8ae/remote-20261030T185908Z-1b2dd1fa843f/meta.json)
and
[agreement receipt](/data/m5c-d17-20261031/train-d/task_f6880fe9a7b3/ctx_2931b5fdcc73/R-receipt.json)
retain the execution and comparison evidence. The derived ledger, batch counts
and graph baseline retain their canonical values. B31's 65 existing records are
outside this first-admission UPDATE and remain unchanged. The graph node set,
dependencies and scheduling state are unchanged; the 833 passing non-native
tests include the existing graph contract tests. Root retains the outer gate,
integration, landing and publication.


U2 dependency correction
------------------------

The full-row protocol audit adds `object-properties` to four newly admitted
*test/language/statements/for-of/* originals:
*head-expr-primitive-iterator-method.js*, *nested.js*,
*scope-head-lex-close.js* and *scope-head-lex-open.js*. Each reaches the
implicit `Symbol.iterator` property lookup, including the primitive
missing-method error and the empty-array case. The earlier tagging pass already
retained `symbols` but omitted the paired property-read family. The complete
1,440-row audit now checks this prerequisite consistently. This changes no
executed variant, observation, classification or owner. R also refreshes the
explicit current totals in *PLAN-M5.md* and *docs/language-profile-m5.md*.
