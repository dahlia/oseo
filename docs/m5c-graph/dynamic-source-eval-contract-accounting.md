Eval contract accounting
========================

DS-10 bounds 105 unsupported paths at semantic bundle commit
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: M. The initial scope has
zero newly established closures.

The exact selector is
[*dynamic-source-eval-contract-accounting.paths.txt*](./dynamic-source-eval-contract-accounting.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`735e9086f63fa28e088d05d3a1c688f871f254164d87bd0b327278bc87429886`


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

Estimated new test groups: 0–0. Audit-only candidates: 0–105. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### Direct and indirect eval execution contracts (105)

Remaining reason: `source-evaluation-only-candidate`.

Direct/indirect environment selection, eval-created lexical/var/function
bindings, eval-specific super/new.target rules and strictness propagation.
Completion-value probes, generic parse-failure probes, realm tests and Annex B
overlaps are assigned elsewhere.

Potential ADR 0016 accounting after a fresh per-path subject review; broad
admission records are not reviewed replacement evidence. Distinguish eval
environment construction from any independently asserted ordinary binding,
global-property, strictness or super behavior. Zero new tests is the
audit-first estimate, not permission to discard those subjects.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. This metadata change
performs none of those closure or landing steps.
