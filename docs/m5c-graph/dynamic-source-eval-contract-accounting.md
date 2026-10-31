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


Per-path review result
----------------------

The [*per-path assessment*](./dynamic-source-eval-contract-assessment.md)
reviews all 105 pinned paths at base
`362ddb13d933600f6a0543ac332eb8479be9053f`: seven close under ADR 0016,
98 stay with the umbrella, and zero replacement tests were added. Every
selected path matched the ledger and its current source and normalized
observation digests. The selector and its SHA256 remain unchanged.

Root's 2026-10-31 ruling under decision item 1 permits the exact seven
acceptance-only environment-construction cases to use existing
`eval-semantics`. Their complete asserted subject is eval source evaluation;
there is no non-source subject requiring replacement evidence. Each audit
record has fresh digests. The other 98 preserve independent binding,
strictness, property, error or completion subjects for which this audit
establishes no complete qualifying source-free replacement. They remain
active remediation rather than excluded ordinary semantics.

The derived ledger moves only the seven existing unsupported rows to
`adr:0016-dynamic-source-boundary`. The umbrella goes from 950 to 943 owned
paths; its retained DS-10 subset is 98. All 41,091 inventory paths remain,
and classifications, dependency tags, subset and results are unchanged.
Accounting adds no passes. No UPDATE is needed and no new native suite is
required. Root owns outer review, publication, integration and landing.


Self-audit and validation
-------------------------

The dependency-tag rules of 2026-10-29 were checked against this change:
no dependency tag or observation changed. Every original eval rejection
retains its dynamic-source prerequisite. Assertions about errors, ordinary
bindings, properties, strictness, skipped side effects and returned values
remain explicit in the 98 retained rows; assertion messages and failure
markers were not substituted for semantic evidence. The seven closed rows
assert only environment-construction acceptance and have no later ordinary
assertion. The existing audit digests were recomputed and match byte for
byte, so their fresh values remain unchanged.

The baseline fast M5c repository tests passed 105/105. The final required
checks are `mise run check` and `node --test tests/m5c-*.test.ts`; their
results and internal review artifacts accompany the worker report. No
native test was added and `mise run test` is outside this accounting run.
