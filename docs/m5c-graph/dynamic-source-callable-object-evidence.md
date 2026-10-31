Callable object evidence
========================

DS-14 bounds 66 unsupported paths at semantic bundle commit
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: M. The initial scope has
zero newly established closures.

The exact selector is
[*dynamic-source-callable-object-evidence.paths.txt*](./dynamic-source-callable-object-evidence.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`0c13e045d3e568243319acf9db28dc07a84489362f226498eef81654dc20ca3b`


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

Estimated new test groups: 12–22. Audit-only candidates: 0–0. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### Callable/built-in object contracts (66)

Remaining reason: `new-evidence`.

Call/apply/bind, callable descriptors and sealing, prototype/instanceof,
intrinsic IsConstructor, Proxy/Reflect and typed-array construction inputs.
DS-4 retained 46 paths and DS-7 retained intrinsic/mixed-function gaps; newer
admissions add related object contracts.

Budget 12–22 exact static/native groups. Cover every own-property flag,
operation, receiver/argument result and static function assertion.
IsConstructor of a source-compiling intrinsic is asserted before invoking that
intrinsic; its rejected construction cannot exclude the earlier assertion.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. This metadata change
performs none of those closure or landing steps.


DS-14 evidence delta
--------------------

At base `362ddb13d933600f6a0543ac332eb8479be9053f`, the pinned selector
matches 66 unsupported umbrella paths exactly. The
[*per-path assessment*](./dynamic-source-callable-object-assessment.md)
names every subject, static witness and residual. This node adds 18 fixed
static/native groups: 16 supply complete non-source observations and two
supply partial evidence. Their focused integration runner checks Node.js,
Deno, both native specialization policies, positive forced-collection
counts and static MIR structure. All 36 focused registrations passed on
Linux AMD64; all 18 strengthened structural checks passed afterwards.

The proposed delta is 61 paths accounted under
`adr:0016-dynamic-source-boundary` and five retained with the umbrella.
The five are *Function/instance-name.js* and the four selected
*class/subclass/builtin-objects/Function/* paths. Static name descriptors
and a missing-super ReferenceError are observed, but they do not prove
CreateDynamicFunction naming or successful Function-subclass allocation.
These gaps need faithful evidence or a bounded maintainer decision. No
unrelated built-in subclass stands in for them.

The audit names the replacement groups and binds their fixture, focused
runner, native registration and assessment by SHA256. Every selected source
and normalized observation digest was recomputed. The 61 exclusions keep
all original assertions and the unsupported-profile-feature classification;
no result becomes a pass. All 41,091 inventory paths remain. ADR 0013/0016/
0019, dependency tags, subset and results are unchanged, so no UPDATE is
needed. Changed source, observation or replacement evidence requires a fresh
assessment. ADR 0016's reopening triggers and ADR 0019's non-source
normative-dependence trigger remain in force.

This note records only DS-14's delta. Root owns shared umbrella totals,
outer review, full exact-candidate CI, UPDATE scheduling, publication,
landing, merge and push. The full ordinary and extended property suites on
both supported native hosts remain required by PLAN-M5C.md before landing;
this worker ran no full suite. Internal review artifacts and exact commit
IDs are supplied in the worker report.

The dependency-tag self-audit leaves every row's tags untouched under the
2026-10-29 rules: the source-construction prerequisite remains present,
and no new tag is inferred from the witness harness. The fixed prelude
also exercises a truthful numeric hint and a false string hint; enabled
native runs require both a guard hit and a miss into generic addition.

Internal review pass 1 found two missing observations. The apply/call
argument groups now include strict wrappers that explicitly observe
`this === undefined` before passing that receiver to the same sloppy
target. Both strict and non-strict upstream wrapper variants are covered.
The ordinary-call group deletes and checks the global `y` before each
independent call, so a prior write cannot mask a missing receiver write.
The ledger note also distinguishes the 16 complete groups from the two
partial groups. Counts and dispositions do not change.
