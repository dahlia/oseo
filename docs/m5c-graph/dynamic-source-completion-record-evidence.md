Completion record evidence
==========================

DS-21 bounds 81 unsupported paths at semantic bundle commit
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: L. The initial scope has
zero newly established closures.

The exact selector is
[*dynamic-source-completion-record-evidence.paths.txt*](./dynamic-source-completion-record-evidence.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`c2e120cda1fbb2fc291da12f77eeb9b0097b773e815ed4cf6e9bf1fbeb604b97`


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

Estimated new test groups: 12–20. Audit-only candidates: 0–0. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### StatementList and statement Completion Records (81)

Remaining reason: `no-complete-replacement-established`.

StatementList values and returned arrays/functions, UpdateEmpty across
empty/abrupt control flow, and conversion/equality that consumes a declaration
completion. DS-3 and DS-5 explicitly found that parsing-only counterparts and
ordinary undefined inputs miss these contracts.

Budget 12–20 compiler/IR observation groups covering all 81 source programs and
value/object/function assertions. A compiler-level hook or native
instrumentation must observe the actual Completion Record; a return statement,
loop side effect or Node.js eval is insufficient evidence about Oseo.
Feasibility is unproved. If the compiler does not materialize these values for
static programs, ask for an observation/boundary decision and retain the paths.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. This metadata change
performs none of those closure or landing steps.


Replacement evidence
--------------------

The worker at base `362ddb13` confirmed all 81 selector paths against the
ledger: every path is `unsupported-profile-feature` with umbrella ownership,
and the inventory retains 41,091 paths. The selector digest above matches.
Only this node's delta is recorded here; shared umbrella totals are unchanged.

The per-path table is
[*dynamic-source-completion-record-assessment.md*](./dynamic-source-completion-record-assessment.md).
It records the normative subject, exact fixture index, native group, caller
environment, strictness and preservation of the remaining assertions. The fixed
source pieces in *tests/native/fixtures/completion-record-cases.ts* retain
every original assertion and literal source argument. Fourteen groups each
contain at most six original paths.

Ordinary Script MIR discards expression-statement values and returns
`undefined` at fallthrough. The existing ADR 0029 finite host Script path
instead instruments the actual StatementList completion accumulator in
*packages/compiler/src/host-scripts.ts*. Root approved using this existing
route for DS-21, subject to a faithful environment/strictness substitution
and complete remaining assertions. No runtime eval implementation or new
compiler hook is added. Unknown source retains its OSEO1001 boundary.

Every original eval site is in global Script code or its statement blocks.
No selected call depends on a caller-local `this`, `new.target`, `arguments`
or function variable environment. Each positive witness runs in a fresh
realm, sharing its global declarations with its literal host Scripts. Both
caller strictness variants run except the two `noStrict` with-statement
paths. Indirect source stays non-strict. Direct strict source receives a
strict directive followed by `void 0`: the latter prevents the directive's
string completion from replacing eval's empty-to-undefined result. Original
value, identity, prototype, length, element, function-call, conversion and
control-flow assertions remain intact.

*tests/completion-records.test.ts* compares strict assertion outcomes, not
printed representations of completion values. Declaration-completion inputs
also require the actual value to be `undefined` before conversion/equality.
Each path/strictness variant has a separate mutation realm: a wrong completion
must cause the original assertion or the added completion-type assertion to
throw its own realm's `Test262Error`. The primitive throw mutation changes
its thrown value from 1 to 0. Arrow mutations remain callable, and legacy
for-in mutations remain strings, so mutation rejection observes the oracle
rather than an unrelated call/property TypeError.

Native tests execute both specialization policies with collection forced at
every safepoint and require positive collection counters. The fixture groups
also enter *tests/native.ts* and both its forced-collection setup and counter
lists. Structural checks require finite Script table entries with no deferred
unsupported/error entries, completion accumulator MIR and emitted host Script
tables. Node.js/Deno references validate the assertions and mutations; native
execution supplies the Oseo semantic observation.

A separate fifteenth group uses the same harness oracle to reject the type
confusions `1`/`"1"`, `42`/`"42"` and `undefined`/`"undefined"`, plus the
reverse string/number pairs. It passes Node.js/Deno references, structural
checks and both native policies with forced collection. Raw evidence is in
*/data/m5c-ds21-20261101/native-oracle/oracle.json* (natural exit 0,
3.617 seconds). This adds no original path and leaves the 81 effective
fixture sources above unchanged.

Delta: 81 accounted under ADR 0016, 0 staying, 15 new test groups (82
fixed fixtures). The initial fourteen groups passed all 29 registrations in one
focused command, and the fifteenth passed its two registrations separately.
Both policies run with forced collection, strictness variants, mutations,
structural checks and Node.js/Deno references. The native command completed
naturally with exit 0 in 702.660 seconds. Raw evidence is in
*/data/m5c-ds21-20261101/native-isolated/completion.json*, with sibling
*.stdout* and *.stderr* files. The table and fresh-digest audit records are
part of this node's review target; normal internal/outer review gates apply.
The subset and observations are unchanged, so no UPDATE is needed. Root retains
full Node/Deno/native/sanitizer and macOS publication gates, outer review,
integration and landing.
