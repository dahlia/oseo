Eval arguments accounting
=========================

DS-9 reviews 192 unsupported paths at split commit
`362ddb13d933600f6a0543ac332eb8479be9053f`, based on semantic bundle
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: M. This accounting
closes 186 under ADR 0016 and retains six mixed arrow cells in remediation.

The exact selector is
[*dynamic-source-eval-arguments-accounting.paths.txt*](./dynamic-source-eval-arguments-accounting.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`da13160f359d5665387f17156ed403e05908d6469ba85221ba50c1096ff3781d`


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

Estimated new test groups: 0–0. Audit-only candidates: 0–192. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### Eval-created arguments bindings (192)

Remaining reason: `source-evaluation-only-candidate`.

EvalDeclarationInstantiation introduces or assigns arguments during parameter
evaluation across 192 generated function/arrow contexts. The assertions
distinguish the eval-created binding from parameter, body and global bindings.
These appear to test eval declaration semantics themselves, rather than use
eval merely to build an input.

Accounting audit using the pinned source and existing reviewed rejection
observations. The
[per-path assessment](./dynamic-source-eval-arguments-assessment.md) records
each cell's normative subject, disposition and reason. All 192 selector paths
match unsupported umbrella entries in the base ledger, and all 192 source and
normalized observation digests were recomputed and match the existing audit
snapshots.

Of these, 184 cells observe eval declaration collisions and global
non-leakage only; two arrow cells read an eval-created arguments binding.
These 186 have no independent non-source subject requiring replacement
evidence. Six arrow cells also assert ordinary function-valued, lexical or
var body bindings named arguments. Three of those invoke a parameter
closure and compare its binding with the body binding. No complete static
replacement is established for those contracts, so all six stay with the
umbrella. A default closure that is never called is not a binding-lookup
witness. No new native or fixture evidence is added.

The umbrella goes from 950 to 764 directly owned paths; ADR 0016 goes from
677 to 863. All 41,091 inventory paths, 29,038 passes, 3,627 expected
negatives and 1,684 unsupported observations remain. No subset, result or
dependency tag changes; no UPDATE is needed. The graph remains unlanded,
and Root owns outer review, publication, integration and landing.

The dependency-tag self-audit changes no rows: the unsupported observations
retain their asserted-contract tags under the 2026-10-29 shared rules.
Unused closures, unreachable body bindings and harness counters supply no
new semantic evidence in this accounting.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. This metadata change
performs none of those closure or landing steps.
