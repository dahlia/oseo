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


Candidate evidence and accounting
---------------------------------

The selector matches exactly 43 existing umbrella-owned unsupported paths
at base `362ddb13d933600f6a0543ac332eb8479be9053f`, with the SHA256 above.
The [per-path table](./dynamic-source-static-core-evidence-table.md) names
each normative subject, its fixed static fixture, every non-source
observation and the source operation that remains. There were no reviewed
complete replacement witnesses at entry.

This node adds 43 fixed native fixture groups. Thirty-six use ordinary
static Script code. Seven use ADR 0029's explicit `test262Host` compiler
path for finite literal host Scripts: six retain the exact original
statement completion values and one observes an invalid continue across a
Script boundary. Root approved the six completion witnesses through Orca
on 2026-10-31; the ruling requires the same statement forms,
exact completion values, both native policies and forced collection. No
runtime-created source is accepted. Ordinary eval and Function construction
remain excluded, including the inner eval around the do-loop postfix
update. Each per-path assessment names the replacement and distinguishes
the remaining eval operation.

The candidate delta is 43 newly covered non-source subjects and 43 proposed
ADR 0016 exclusions, with zero paths staying in remediation and 43 evidence
groups added. Classification remains `unsupported-profile-feature` for all
43 paths. No pass, inventory, subset, result, ADR or graph landing changes.
The complete inventory retains 41,091 paths. The ledger in this worktree
prepares only this node's candidate owner assignments; it does not publish
the child or change its unlanded status. Authoritative merged ownership
and aggregate documentation follow Root's serialized publication/landing.

Root's final dispatch addition expressly requires: “Do not write a new
running total into the shared umbrella prose or its node YAML; record only
this node's delta in its own note. Root merges the counts at publication.”
Accordingly, the shared umbrella prose and node YAML retain their base
snapshot here. This note records the 43-path delta for Root to integrate
with the other lanes; their unpublished totals are not a claim about this
candidate ledger. Ownership is generated through the ledger API with only
these assignments, then regenerated with
`mise run m5c:closure-ledger:update`; audit edits touch only these 43
records and their new assessments. Root owns merged totals, outer review,
publication and landing.

The fixed fixture module is
*tests/native/fixtures/dynamic-source-static-core.ts*.
*tests/dynamic-source-static-core-source.test.ts* checks both compilation
policies without ordinary eval or Function calls.
*tests/dynamic-source-static-core.test.ts* observes each fixture against
independent Node.js and Deno Script references, with an explicit `ok` output
oracle, both native policies, positive allocation/collection counters and
C call/host-installation structure. All 43 also register in *tests/native.ts*
and both of its forced-collection lists. No shared property domain changes;
existing generated suites continue to own the admitted semantic domains.


Validation and review
---------------------

Validation results and source identities are recorded in the dispatch report
under */data/m5c-ds15-20261031/*. The baseline fast repository suite passed
105 tests, and the final fast suite passed the same 105 tests. The source
suite passed 43 tests under both policies. The final focused native suite
passed all 43 fixtures with both references, policies and forced collection.
The derived ledger retains all 41,091 paths. Check and internal review
results are bound to the final commit in the dispatch report.

The reviewed subset and observations are unchanged, so no UPDATE is needed.
Root's full exact-candidate gates must include `test:node`, `test:deno`, and
`test:native` for the added native fixtures, followed by normal publication
requirements. No full suite or UPDATE runs in this worker.
