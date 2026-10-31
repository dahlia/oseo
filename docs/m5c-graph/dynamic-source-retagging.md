Dynamic source dependency retagging
===================================

Selection and authorization
---------------------------

This metadata-only node starts at Main
`1f3ade138ea7cbee80b2d62940e8f497db2bc1a2`. The exact selector is the
155 records in *../m5c-closure/exclusion-audit.yaml* whose
`missingDynamicTag` is true at that baseline. Every selected path is
already reviewed and classified `unsupported-profile-feature`.

The original 154 records comprise 120 from `authorized-exclusion-audit`
and 34 from `cross-realm-host`, under the 2026-10-07 maintainer decision.
Their set equals the flagged records at `4f003df84`. IH-A result commit
`29f72c0d797388289648ea49bb855d84ea2b6a1b` added the remaining path,
*test/built-ins/Iterator/proto-from-ctor-realm.js*, after feature activation
reached the existing source-constructor rejection. Its non-source subject
remains active remediation. Root's blocking reply on 2026-10-31 approved
including this 155th record and updating the node contract accordingly.

The 2026-10-28 big-node split decision leaves the DS-0 accounting rule
and DS-1 through DS-7 work intact. A dependency tag grants no exclusion
authority. ADR 0013's inventory and classification rules, ADR 0016's source
evaluation boundary, and ADR 0019's closure requirements remain unchanged.


Prepared metadata
-----------------

Each selected subset entry gains only `dynamic-source`, retaining every
existing dependency and its expected classification. The canonical
manifest serializer materializes those dependencies into stored records,
derives the dependency summary, and computes the target-parity digest.
It preserves all observations, executions, source hashes, classifications,
unsupported features, paths, suite revision, and supported features.
This preparation is not a new standards observation or a completed UPDATE.
Root explicitly authorized it to prepare a canonical scoped-update U.

The ledger serializer derives the matching prerequisites while retaining
all owners and states. Each selected audit record changes only
`missingDynamicTag` to false; its source and observation digests,
assessment, normative subject, and proposed owner remain unchanged.
No compiler, runtime, harness, generator, property seed, or budget changes.
No normative profile family changes, because no semantic unit is admitted.

The path-by-path before/after dependencies, observations, classifications,
and owners are retained in
[*owned-rows.json*](/data/m5c-d17-20261031/retagging/owned-rows.json).
[*materialization.json*](/data/m5c-d17-20261031/retagging/materialization.json)
records the exact selected set, partition writes, and preservation checks.


Validation and remaining gates
------------------------------

The baseline and prepared-tree compatibility ratchets passed with zero
overrides. Local `mise run check` passed, including the ledger, graph,
exclusion audit, formatting, lint, and type checks. The exclusion checker
reported zero missing dynamic-source tags. The fast non-native repository
gate passed all 833 registrations in 59 top-level test files,
including the focused audit, ledger, and graph suites. The exact included
and excluded file sets are recorded in
[*non-native-files.json*](/data/m5c-d17-20261031/retagging/non-native-files.json).

The independent preservation and canonical-text check confirms all 34,337
observations remain unchanged, with only 155 dependency lists extended.
It also proves scoped-update eligibility against the named baseline and
retention of all 41,091 inventory paths, ledger owners, and states. See
[*preservation proof*](/data/m5c-d17-20261031/retagging/preservation-and-scoped-proof.json).
No new native fixture or property file is added; there is no semantic or
backend change requiring a native or extended property run.

Internal precheck and both review stages are recorded separately against
their exact U SHA in the
[*validation report*](/data/m5c-d17-20261031/retagging/final-report.md).
Root owns D3 and the actual scoped UPDATE at the accepted U, then outer
review, candidate/Main CI, publication, and landed state. The node remains
`landed: false`.
