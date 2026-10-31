Observation batch 31: reservation reconciliation
================================================

At base `8f4202628356e172e1b4093a371d086070619de3`, this batch has zero
remaining unreviewed paths. Its task reconciles the 65 original path/source
identities in
[*import-attributes-reservation-reconciliation.md*](./import-attributes-reservation-reconciliation.md).
The focused reconciliation confirms one parse `expected-negative` and 64
`unsupported-profile-feature` records in the canonical manifest. Each of the 64
unsupported originals remains owned by `adr:0016-dynamic-source-boundary` in
the closure ledger under the maintainer accounting decision of October 22. An
accepted ADR 0016 amendment admitting any form of dynamic import reopens that
accounting decision.

The audit reads all 65 pinned upstream sources and verifies their SHA256
hashes against the historical reservation. Every original has exactly one
subset row, manifest record and ledger entry. Subset classifications and
dependency tags agree with the canonical manifest. The sole negative retains
its parse phase. The other 24 identities in the historical reservation belong
to batch 32 and are outside this reconciliation.

The audit introduces no subset row, observation, classification, dependency
tag, owner or exclusion. Existing rows are preserved. It performs no duplicate
first admission and makes no new pass or automatic closure claim. ADR 0013,
ADR 0016 and ADR 0019 retain their existing boundaries and reopening triggers.
Root retains integration, graph landed state, publication and the outer gate.


Evidence
--------

The audit program and its complete per-path source hashes, subset rows,
manifest records and ledger entries are in
[audit program](/data/m5c-d17-20261031/train-d/task_f6880fe9a7b3/ctx_2931b5fdcc73/audit-b31.mjs)
and
[reconciliation record](/data/m5c-d17-20261031/train-d/task_f6880fe9a7b3/ctx_2931b5fdcc73/b31-reconciliation.json).
These are source and accounting checks against the existing observations,
without fresh execution of the 65 originals.
