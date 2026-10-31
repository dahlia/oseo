Regexp static evidence
======================

DS-17 bounds 29 unsupported paths at semantic bundle commit
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: L. The initial scope has
zero newly established closures.

The exact selector is
[*dynamic-source-regexp-static-evidence.paths.txt*](./dynamic-source-regexp-static-evidence.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`d10527a91fccc0d6fb399fc12ea4652eae9cca76ffdad78a8b7e5c21a8c4a616`


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

Estimated new test groups: 10–18. Audit-only candidates: 0–0. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### RegExp grammar and EscapeRegExpPattern round trips (29)

Remaining reason: `new-evidence`.

Literal LF/CR/LS/PS rejection, selected BMP first/subsequent/escaped
characters, UnicodeIDContinue fallback, lone-surrogate group names, source
escaping, literal matcher equivalence, and constructor pattern/flags inputs.

Budget 10–18 generated parser/native groups covering the complete original
domains and source/matcher pairs. Exact .source spelling alone does not prove
equivalent literal matching; a RegExp constructor is not a test of literal
grammar. Keep ADR 0013 Annex B interactions separately assessed inside each
original.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. This metadata change
performs none of those closure or landing steps.
