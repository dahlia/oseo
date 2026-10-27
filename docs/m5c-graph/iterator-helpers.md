Iterator helpers split
======================

This record backs the M5c umbrella node `iterator-helpers`. The maintainer
decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*), item 4, splits it into
`iterator-helpers-tag-activation` (IH-A) and `temporal-helpers-harness`
(IH-B). The umbrella depends on both and lands when it owns zero paths.

The original 393 paths belonged to `node:iterator-helpers` at the split
baseline. Root accepted IH-A's full UPDATE on U `a678c85e`: 389 now belong
to their passing observations, the three *temporalHelpers.js* paths to
IH-B, and *Iterator/proto-from-ctor-realm.js* to
`dynamic-source-coverage-remediation`. The latter remains active
non-source coverage debt after its Function source-constructor rejection.
This result accounting leaves zero umbrella-owned paths; the dependency
gates and explicit landing decision remain pending.

IH-A came first to activate the feature tag, with the bounded String
primitive repair and missing-include classification recorded in its work
note. IH-B retains the separate harness review.
