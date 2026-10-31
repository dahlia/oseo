Binding reference evidence
==========================

DS-18 bounds 41 unsupported paths at semantic bundle commit
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: L. The initial scope has
zero newly established closures.

The exact selector is
[*dynamic-source-binding-reference-evidence.paths.txt*](./dynamic-source-binding-reference-evidence.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`600ec00d313b4f00c5d502cee92f9e56b05fa4f8a04e81588f76807054a2d8d4`


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

Estimated new test groups: 15–26. Audit-only candidates: 0–0. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### Binding introduction, retained References and dynamic local eval (20)

Remaining reason: `no-complete-replacement-established`.

Compound/simple assignment retains a pre-RHS Reference while eval creates a
nearer binding; parameter/for-in/catch/global declarations expose environment
identity and configurability. The dynamic local binding named eval also has a
tail-call contract.

Budget 8–14 environment/Reference/native groups, including all operators and
exact inner/outer reads. A static var is hoisted at a different time;
assignment does not introduce a binding. New evidence needs an actual
compiler-level witness of these environments. Escalate genuine dependence on
the excluded operation under ADR 0019 if no faithful witness exists.

### Private/public lookup, arrow capture and call dispatch (21)

Remaining reason: `new-evidence`.

Private initializer side effects/public reads, static initializer this/order,
arrow capture, unresolvable compound-assignment errors and direct-eval spread
dispatch. DS-6 retained these exact missing observations; five no/non-string
dispatch paths already promoted to pass are not selected.

Budget 7–12 focused static/native groups, preserving executed=true with public
c.x===undefined, C.f/g/h order, bare-call global receiver, closure updates,
catchable runtime ReferenceError and spread iterator counts/local-versus-global
effects. Compile-time Unknown binding is not a runtime ReferenceError witness.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. This metadata change
performs none of those closure or landing steps.
