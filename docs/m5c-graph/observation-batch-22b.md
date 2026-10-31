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

Of the 37 unsupported paths, 32 eval-source subjects use the existing
ADR 0016 eval-semantics exclusion assessment. Two use eval as fixture
construction; another has an independent ordinary TypeError assertion.
All three retain dynamic-source coverage remediation.
The two optional private-accessor lookup subjects retain their bounded
remediation owner.
The [owner assignments](/data/m5c-d17-20261031/train-b/owner-assignments.json)
list every path. The
[source audit](/data/m5c-d17-20261031/train-b/round2-investigation/independent-assertion-audit.json)
reviews all 1,859 rows, including the source and assertion bounds for all 100
eval rejections. Existing assessment and ADR boundaries are unchanged. No
unsupported result counts as a pass.

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

The first internal review adds lexical-grammar to eleven explicit ASI
subjects and seventeen without-semicolon template cases whose final
field requires insertion before the asserted method. The
[ASI audit](/data/m5c-d17-20261031/train-b/round1-investigation/asi-audit.json)
covers the full train, including cases that need no correction.

The private static generator whitespace negative and method-param-yield
also retain generators for their rejected grammar subjects. The
[parse-grammar audit](/data/m5c-d17-20261031/train-b/round1-investigation/parse-generator-audit.json)
covers all 1,859 rows and all 197 parse negatives. Execution counts and
ownership are unchanged.

The second-round
[identifier audit](/data/m5c-d17-20261031/train-b/round2-investigation/identifier-audit.json)
adds lexical-grammar to 203 additional identifier-matrix rows. Their Unicode
and escaped names are the asserted subject. Across both element batches, all
414 matrix instances now retain this family.

The
[operator audit](/data/m5c-d17-20261031/train-b/round2-investigation/unreached-operator-audit.json)
removes expression-operators from six generator parameter-error rows, whose
initializers throw before their body counter can run. The
[object-fixture audit](/data/m5c-d17-20261031/train-b/round2-investigation/early-error-object-audit.json)
removes object-literals from privatename-not-valid-eval-earlyerr-7.js: eval
rejects the undeclared private name before obj is read.

The
[independent-assertion audit](/data/m5c-d17-20261031/train-b/round2-investigation/independent-assertion-audit.json)
reviews all 100 eval rejections and preserves the mixed static-setter case as
remediation. Its final C.getWithEval.call(D) reads an absent method and throws
TypeError before any eval. The existing dynamic-source node owns 886 paths,
including five additions from these batches. The original source, all
assertions and the unsupported observation stay.

Internal review round 3 corrected 20 `var-bindings` rows supported only by
reach markers or the unused rejected-eval assignment-target fixture, and three
`expression-operators` rows supported only by the marker assignment. Two
rejected indirect-eval SuperProperty subjects gained `object-properties` as
their grammar family. The full 1,859-source audit retained the computed boolean
field-value update and numeric counters, and recorded its per-source
dispositions in
[marker and grammar audit](/data/m5c-d17-20261031/train-b/round3-investigation/marker-and-superproperty-audit.json).

Internal review round 4 audited all 1,859 sources for asserted values
from ordinary methods that discard an eval-created value. The
[implicit-return audit](/data/m5c-d17-20261031/train-b/round4-investigation/implicit-return-audit.json)
identifies one B22a mixed assertion: the public x method drops its private
arrow call result, so the final undefined value is independent of that arrow
new.target value. The
[controlled source probes](/data/m5c-d17-20261031/train-b/round4-investigation/implicit-return-probe.json)
confirm this distinction without changing the pinned source or native
observation. That path remains in claim under active remediation; B21d and B22b
ownership is unchanged. The node now owns 886 paths, including five from this
train; 95 train paths retain the existing eval-semantics exclusion. No
replacement evidence or ADR boundary change is claimed.
