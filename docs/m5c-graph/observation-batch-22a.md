Observation batch 22a: class fields and private async methods
=============================================================

Observe all 579 pinned selector paths on base `8f420262`.
Admit 457 passes, 57 expected negatives, and
65 unsupported-profile-feature results. No semantic failure is admitted.


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

Of the 65 unsupported paths, 64 eval-source subjects use the existing
ADR 0016 eval-semantics exclusion assessment. Another 1 use eval as
fixture construction and retain dynamic-source coverage remediation.
The [owner assignments](/data/m5c-d17-20261031/train-b/owner-assignments.json)
list every path. The
[source audit](/data/m5c-d17-20261031/train-b/round2-investigation/independent-assertion-audit.json)
reviews all 1,859 rows, including the source and assertion bounds for all 100
eval rejections. Existing assessment and ADR boundaries are unchanged. No
unsupported result counts as a pass.


Dependency self-audit
---------------------

The [row audit](/data/m5c-d17-20261031/train-b/reviewed-tags.json) covers all
579 rows in this batch. Each retained tag has source or asserted-contract
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

The first internal review adds lexical-grammar to 44 ASI subjects:
fields-asi-4, the six after-method literal-names-asi variants,
multiple-definitions-literal-names-asi, and 36 stacked-definition cases.
The
[ASI audit](/data/m5c-d17-20261031/train-b/round1-investigation/asi-audit.json)
covers all 1,859 train rows and distinguishes asserted insertion from explicit
semicolons and complete method definitions. Execution counts and ownership are
unchanged.

The second-round
[identifier audit](/data/m5c-d17-20261031/train-b/round2-investigation/identifier-audit.json)
adds lexical-grammar to 177 additional identifier-matrix rows. The 27 shared
rs-\* cases explicitly specify IdentifierStart, IdentifierPart and Unicode
escapes, and assert reads, writes or calls through the declared names. The
full-train AST scan checks all 1,859 sources and finds no additional
unclassified Unicode identifier subject outside the matrices.

Root's
[property-syntax ruling](/data/m5c-d17-20261031/train-b/round2-investigation/property-tag-policy-decision.json)
removes object-properties from 16 constructor-eval error rows whose recorded
read follows aborted construction. Four explicit indirect-eval SuperProperty
subjects keep the family for their rejected property syntax. Their corrected
per-row evidence claims no runtime property lookup; the
[full-train audit](/data/m5c-d17-20261031/train-b/round2-investigation/constructor-property-audit.json)
records every disposition.

Internal review round 3 corrected reach-marker scaffolding missed by the
earlier audit: 43 rows lost `var-bindings` supported only by
`var executed = false`, and 15 lost `expression-operators` supported only by
`executed = true`. Other bindings and operators remain only where a separate
asserted or prerequisite witness exists; marker evidence was also removed from
eight retained binding records across B22a/B22b. Five rejected indirect-eval
SuperProperty subjects gained `object-properties` as a grammar family, without
claiming a runtime lookup. All 1,859 train sources were checked for these
patterns; the source hashes and dispositions are in
[marker and grammar audit](/data/m5c-d17-20261031/train-b/round3-investigation/marker-and-superproperty-audit.json).
