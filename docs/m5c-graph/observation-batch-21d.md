Observation batch 21d: class declaration method destructuring
=============================================================

Observe all 640 pinned selector paths on base `8f420262`.
Admit 592 passes, 48 expected negatives, and
0 unsupported-profile-feature results. No semantic failure is admitted.


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

The first internal review removes symbols from the four public-method
obj-ptrn-prop-ary-value-null rows. Their supplied value is null, so
iterator acquisition throws before symbol-keyed property access. The
[null-dispatch audit](/data/m5c-d17-20261031/train-b/round1-investigation/null-symbol-audit.json)
covers all 1,859 train rows, including all other implicit-symbol consumers. The
classifications and ownership are unchanged.

The second-round full-train reachability audit removes expression-operators
from 12 destructuring error rows. Four counters follow an unconditional
iterator throw; eight default-initializer counters are bypassed by an
earlier binding failure. Their zero assertions do not observe an operator.
The
[operator audit](/data/m5c-d17-20261031/train-b/round2-investigation/unreached-operator-audit.json)
records every train row and retains the eight ordinary methods whose body
counter really runs.

Those eight methods use a supplied inner array, so their g() default is
skipped. The generator declaration is an unused fixture, not asserted
generator behavior. The
[generator-fixture audit](/data/m5c-d17-20261031/train-b/round2-investigation/unused-generator-audit.json)
removes only that family and keeps the reached method-body operators.

Internal review round 3 rechecked all 1,859 admitted sources for the October 30
reach-marker and rejected-SuperProperty rules. No B21d correction matched those
patterns; numeric counter updates remain witnesses because they compute
asserted values. The per-source dispositions are recorded in
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
