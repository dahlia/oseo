Static core evidence
====================

DS-15 bounds 43 unsupported paths at semantic bundle commit
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: M. The initial scope has
zero newly established closures.

The exact selector is
[*dynamic-source-static-core-evidence.paths.txt*](./dynamic-source-static-core-evidence.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`05c5f9d0d77213bd3095ca55a9ffd5dbf0614c7944a26bdcfb3e2f2d1c236946`


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

Estimated new test groups: 16–29. Audit-only candidates: 0–0. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### String inputs, global properties and intrinsic lookup (20)

Remaining reason: `new-evidence`.

String char/substring/search/replace/split inputs and callable conversion,
global presence/enumerability, and Object intrinsic lookup independent of the
global binding. DS-7 preserved the original mixed assertions.

Budget 8–14 static/native groups matching every conversion input and global
mutation. Existing broad string tests or ASCII case conversion do not cover
arbitrary separator/limit combinations or global binding tampering.

### with/property effects, control flow and ordinary expressions (23)

Remaining reason: `new-evidence`.

with property mutation/deletion across six input types,
loop/continue/expression values, delete of a global var, object truthiness,
AggregateError newTarget fallback and a catchable unresolvable-reference error.
Eval serves as a fixture or value-observation site.

Budget 8–15 focused static/native groups after examining every assertion. with
is core sloppy syntax and is not excluded wholesale by Annex B. Result-valued
expression/control-flow rows must join Completion Record work if a proposed
static witness observes only side effects.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. This metadata change
performs none of those closure or landing steps.
