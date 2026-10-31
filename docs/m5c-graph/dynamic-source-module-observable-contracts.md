Module observable contracts
===========================

DS-12 bounds 70 unsupported paths at semantic bundle commit
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: L. The initial scope has
zero newly established closures.

The exact selector is
[*dynamic-source-module-observable-contracts.paths.txt*](./dynamic-source-module-observable-contracts.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`39f6b65e31d060e881a8172954c00b638d8544d2f0117f60def87e7155abed2e`


Authority and ownership
-----------------------

The maintainer approved all 15 proposed IDs in
[*20261031T0935-umbrella-second-split.answer.md*](~/.local/state/oseo-m5c/decisions/done/20261031T0935-umbrella-second-split.answer.md),
answering *20261031T0935-umbrella-second-split.md* in that directory. The
source proposal is */data/m5c-d17-20261031/umbrella-split/REPORT.md*, with
per-path subjects and historical gap records in *families.json* beside it.

The 2026-10-28 decision
*~/.local/state/oseo-m5c/decisions/done/20261028-m5c-scope-big-node-split.md*,
items 1 and 2, supplies the existing accounting rules. ADR 0013/0016/0019
remain unchanged. Dependency tags and a rejected source operation do not
authorize whole-path exclusion. Keep all 41,091 inventory paths and every
original assertion; accounting never counts as a pass.

This node depends on landed `authorized-exclusion-audit` and starts
ready/unlanded. Ownership stays with `dynamic-source-coverage-remediation`
until this child lands. Each child landing reports exact newly covered and
still-uncovered subsets and moves ownership in the derived ledger. The
umbrella remains an aggregate gate until all children land and it owns zero
paths. Serialize shared audit, ledger and manifest publication; Root owns
integration and publication.


Closure route and evidence obligations
--------------------------------------

Estimated new test groups: 19–36. Audit-only candidates: 0–0. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### Namespace operations, identity and binding updates (46)

Remaining reason: `new-evidence`.

Namespace Set/Delete behavior including sloppy callers, nested namespace
exports, identity/ToPrimitive and live binding updates, including eval-driven
updates. Static-import observations cover many earlier DS-2 rows but not these
complete assertions.

Budget 8–16 static module/native groups. Sloppy assignment/delete needs a
sloppy observer of a statically imported namespace; writing another strict
*.mjs* file changes the contract. Binding updates need exact alias/local/global
observations, and repeated-load identity needs an explicit witness.

### Module graph state, top-level await and ordering (18)

Remaining reason: `new-evidence-or-maintainer-decision`.

Exactly-once evaluation, cached errors, cycles, concurrent/deferred settlement,
DFS order and async evaluation order. Newer admissions add graph cases beyond
the old DS-2 reservation.

Budget 8–14 static module graph fixtures with exact settlement traces. Existing
TLA support or a nearby fixture does not prove repeated dynamic loads or cached
errors. Preserve an explicit residual when the only observation site requires
host loading or dynamic import; that residual needs a maintainer decision
rather than invented static equivalence.

### import.meta under non-Module source goals (6)

Remaining reason: `new-evidence-or-source-only-review`.

Five import.meta goal-rejection probes and the ImportMeta specifier expression.
These combine source-goal rejection with import.meta/module behavior.

Budget 3–6 parser/static goal groups after a source-only audit. Distinguish the
forbidden dynamic source goal from the in-claim ImportMeta expression and
specifier assertion. An esid or the module-linking tag is not a closure proof.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. This metadata change
performs none of those closure or landing steps.
