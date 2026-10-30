Observation batch 22b: remaining class elements and methods
===========================================================

Observe all 640 pinned selector paths on base `8f420262`.
Admit 511 passes, 92 expected negatives, and
37 unsupported-profile-feature results. No semantic failure is admitted.


Evidence and ownership
----------------------

The [focused observations](/data/m5c-d17-20261031/train-b/observations.json)
retain each source SHA-256 and the exact classifications and variant
observations. The
[driver completion](/data/m5c-d17-20261031/train-b/complete.json) records the
executor target, path count, request count, and native fragment counts. The
executor uses the pinned toolchain and the same native runner as the ordinary
UPDATE.

The [admission proof](/data/m5c-d17-20261031/train-b/u-preservation.json) binds
the base tree and shows byte preservation of every existing subset row.
Classifications come from execution with empty tag inputs; materialization adds
only the reviewed dependency tags through the canonical manifest serializer.

The 37 unsupported paths retain in-claim remediation owners.
The [owner assignments](/data/m5c-d17-20261031/train-b/owner-assignments.json)
list every path; source-compilation rejections also have source-bound
exclusion-audit records with remediation dispositions. No ADR boundary changes.

The two private getter/setter own-property subjects retain
`node:class-private-accessor-lookup-coverage-remediation`, extending its
exact reservation from two expression forms to all four forms. The
optional lookup observer is excluded, but the private accessor subject
stays in the claim and no replacement evidence is asserted here.


Dependency self-audit
---------------------

The [row audit](/data/m5c-d17-20261031/train-b/reviewed-tags.json) covers all
640 rows in this batch. Each retained tag has source or asserted-contract
evidence; rejected candidates record why their sites do not qualify. The review
applies the consolidated October 29 rules and every October 30 clarification
before U.

Failure guards, custom failure-only $DONE helpers, assertion messages,
and expected-descriptor literals passed only to verifyProperty do not
contribute tags. Descriptor literals used by Object.defineProperty
remain prerequisites. A normal try is not abrupt-completion evidence;
asserted throws, rejected promises, and generator completion resumptions
retain that tag. Catch plumbing does not add control-flow, while
branches that deliberately change the asserted iterator or thrown value
do. Conditional test gating and oracle helpers do not add control-flow.

Array patterns, iterable spread, yield delegation, and for-await-of
retain their reached implicit symbol/protocol dependencies. Operand
errors before iterator acquisition do not establish protocol dispatch.
Async generator
definitions and stepping use async-iteration; ordinary async methods
use async-functions. Parse-only negatives keep grammar families of
the rejected subject without inferred runtime settlement or throws.
The audit includes eval source and private-name static semantics.
All subjects use the primary source; no fixture-derived rows occur.

Root owns the scoped UPDATE, landing, and publication. This observation
commit does not mark any graph node landed.

The pre-UPDATE caller-guard audit removes object-literals from all 12
forbidden-extension bullet-two rows. Their optional descriptor creation
requires an own caller property; freshly created Oseo functions have
none, so the descriptor objects are not evaluated. The original counts
and observations are unchanged. The full-row audit above includes this
pattern across all 1,859 train paths.
