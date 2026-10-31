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


Implementation delta
--------------------

The per-path assessment is in
[*dynamic-source-regexp-static-evidence.assessment.md*](./dynamic-source-regexp-static-evidence.assessment.md).
The selector and its SHA256 are unchanged, and all 29 paths match the base
ledger's unsupported umbrella rows. This change supplies replacement coverage
for 25 paths: 18 literal grammar paths, two constructor-input paths and five
source round-trip paths. Four exhaustive BMP paths remain in remediation, as
Root approved in Orca reply `msg_39d48b1bac6b` on 2026-10-31. No aggregate
umbrella total is changed here; Root reconciles this node's 25-path delta at
publication.

The new fixed *tests/native/fixtures/regexp-static-evidence.ts* fixture
covers eight semantic groups: invalid flags, Math pattern conversion,
empty source, LF escaping, slash escaping, surrogate-pair Unicode spelling,
code-point Unicode spelling and anchored bounded quantification. It retains
every original input and result, pins source and flags, and compares the
original/constructor matcher with a build-time literal. Both forced-GC
lists in *tests/native.ts* include it, so both specialization policies must
observe actual collection. The new
*tests/regexp-static-grammar.test.ts* covers the complete fixed grammar
matrix and checks artifact-carrying literal operations for every source
output spelling. Rejected literals produce `OSEO0001` without MIR; source
parsing is witnessed before native code generation, rather than replaced
with constructor parsing.

The exclusion audit names these replacement files and binds their digests.
Each selected source digest and normalized observation digest was freshly
checked against the pinned source and checked-in observation. Ownership is
regenerated through the ledger APIs and
`mise run m5c:closure-ledger:update`, retaining
`unsupported-profile-feature` for all 29 paths. No pass, subset, result,
inventory, ADR, dependency tag or ratchet override changes. The four BMP
paths retain their existing audit assessment and umbrella owner, with the
exact missing domains recorded in the per-path table. ADR 0016's
replacement triggers and ADR 0019's non-source reopening trigger remain in
force.

The pre-commit tag self-audit found no dependency changes: all existing
asserted/prerequisite tags and missing-tag audit facts stay intact. Negative
syntax evidence covers only grammar, not an executed exception or later
property read. Constructor and matching observations remain runtime
subjects. No shared property domain or seed was added.

The subset and recorded observations are unchanged, so no UPDATE is needed.
Root's exact-candidate CI must run the ordinary full suites, including
`test:node`, `test:deno`, `test:native` on Linux AMD64/macOS AArch64 with the
AArch64 Linux cross-link, and `test:test262`. This worker does not run
`mise run test`, publish, push, merge or set landed.

Initial validation at `8b1e69ba`: 29 grammar/structural tests passed. The fixed
fixture passed in Node.js, Deno and Linux AMD64 native execution with
specialization disabled and enabled. Each native policy observed 4,055 forced
collections, 236 allocations and the exact expected success output. The focused
native log and capacity metadata are in
*/data/m5c-d17-20261031/ds17/native-focused.stdout* and the adjacent JSON
record. These observations establish the local candidate; Root still owns
both-host exact-candidate CI and outer review.


Witness oracle follow-up
------------------------

Root's witness-oracle follow-up `msg_e2fd2ff4ed97` requires strict in-program
value comparisons and mutation controls. The fixed fixture uses `Object.is`
for the original SameValue observations. Its six negative controls reject
number/string, undefined/string, boolean/string and positive/negative-zero
mismatches, while a NaN positive control succeeds. The actual observations
use the same oracle; printed output is only the final success marker. Math
remains an unqualified identifier read, as in the original path.

The updated fixture passes in Node.js, Deno and Linux AMD64 native execution
under both specialization policies. Each native policy observes 269
allocations and 4,386 forced collections; enabled specialization additionally
observes 85 guard hits and 90 misses. Evidence is in
*/data/m5c-d17-20261031/ds17/native-oracle.stdout* and its adjacent JSON
record. All 29 grammar/structural tests pass. The audit replacement digests
are refreshed; no subset, classification, dependency tag or observation
changes, so no UPDATE is needed.


Internal review reconciliation
------------------------------

Pass 1 accepted the functional replacement evidence. Its two documentation
findings, `ds3-reason-stale` and `ds3-assessment-stale-rows`, identified old
DS-3 text that still described the 18 covered grammar paths as uncovered.
The fix updates only those table rows and the shared literal assessment,
and labels the original DS-3 publication counts as historical. No umbrella
running total is added. The fix-round tag self-audit confirms unchanged
subjects, prerequisites, dependency tags, subset and observations; no UPDATE
is needed.
