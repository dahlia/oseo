Construction contracts
======================

DS-13 bounds 57 unsupported paths at semantic bundle commit
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: L. The initial scope has
zero newly established closures.

The exact selector is
[*dynamic-source-construction-contracts.paths.txt*](./dynamic-source-construction-contracts.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`dbd8987dc7547f584c51d4e5ab50e0f74fb3c865e0e79cad3468ea62d2a1716c`


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

Estimated new test groups: 22–42. Audit-only candidates: 0–0. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### Function-constructor grammar and strictness (15)

Remaining reason: `new-evidence-or-source-only-review`.

Duplicate and reserved parameter names, local versus caller strictness and
invalid private identifiers in constructed source. Constructor-specific
parse/strictness is excluded, but corresponding ordinary static grammar can be
an uncovered non-source subject.

Review source-only construction claims first, then provide 8–15 compiler/parser
or static fixture groups for ordinary strict/sloppy grammar as needed. Related
expected-negatives need an explicit equivalence argument and reviewed
observations; the DS-5 pass-only task did not accept them by itself.

### Constructor argument conversion, order and results (35)

Remaining reason: `new-evidence`.

Function argument ToString side effects, abrupt completion and parameter/body
conversion order, plus results of dynamically constructed functions. Some rows
may prove source-only after review; conversion/order assertions cannot be
excluded merely because Function is rejected.

Budget 10–20 static/native groups covering each asserted conversion order,
thrown value, argument form and ordinary result contract. A generic ToString
test does not establish constructor ordering; retain rows requiring that
particular boundary interaction unless the maintainer accepts a narrower
accounting argument.

### Source-compiling constructor subclass instances (7)

Remaining reason: `new-evidence-or-maintainer-decision`.

Function/GeneratorFunction subclass prototype, name, length, instanceof and
super initialization. These are mixed object/subclass contracts, not just
parsing a string.

Budget 4–7 focused native/static subclass groups. If the asserted allocation or
internal-slot step cannot be reached without source compilation, keep it open
and ask for a bounded decision; do not replace a Function subclass with an
unrelated Array subclass.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. This metadata change
performs none of those closure or landing steps.
