Module goal validation
======================

DS-11 bounds 66 unsupported paths at semantic bundle commit
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: M. The initial scope has
zero newly established closures.

The exact selector is
[*dynamic-source-module-goal-validation.paths.txt*](./dynamic-source-module-goal-validation.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`ead48f16bf48e038a9c7fa82936033892184087a350aa384e9bf636c9bf28214`


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

Estimated new test groups: 12–24. Audit-only candidates: 0–0. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### Module goal, target parsing and link failures (66)

Remaining reason: `new-evidence`.

The 48 catch variants retain target parse/link validation; the 18 usage
variants retain loading a Script-valid target as a Module. DS-2 explicitly left
these 66 outside its selection.

Budget 12–24 fixture groups shared across repeated import-site contexts:
invalid target grammars, missing/ambiguous exports and Script versus Module
goal distinctions. Match original error phase/type and surrounding assertions.
A compiler rejection alone cannot replace an asserted rejected promise; provide
the non-source validation witness and assess the remaining ImportCall contract
separately.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. This metadata change
performs none of those closure or landing steps.
