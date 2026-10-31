Module observable contracts
===========================

DS-12 bounds 70 unsupported paths at semantic bundle commit
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: L. The initial scope has
zero newly established closures.

The exact selector is
[*dynamic-source-module-observable-contracts.paths.txt*](./dynamic-source-module-observable-contracts.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`39f6b65e31d060e881a8172954c00b638d8544d2f0117f60def87e7155abed2e`


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

Estimated new test groups: 19–36. Audit-only candidates: 0–0. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### Namespace operations, identity and binding updates (46)

Remaining reason: `new-evidence`.

Namespace Set/Delete behavior including sloppy callers, nested namespace
exports, identity/ToPrimitive and live binding updates, including eval-driven
updates. Static-import observations cover many earlier DS-2 rows but not these
complete assertions.

Budget 8–16 static module/native groups. Sloppy assignment/delete needs a
sloppy observer of a statically imported namespace; writing another strict
*.mjs* file changes the contract. Binding updates need exact alias/local/global
observations, and repeated-load identity needs an explicit witness.

### Module graph state, top-level await and ordering (18)

Remaining reason: `new-evidence-or-maintainer-decision`.

Exactly-once evaluation, cached errors, cycles, concurrent/deferred settlement,
DFS order and async evaluation order. Newer admissions add graph cases beyond
the old DS-2 reservation.

Budget 8–14 static module graph fixtures with exact settlement traces. Existing
TLA support or a nearby fixture does not prove repeated dynamic loads or cached
errors. Preserve an explicit residual when the only observation site requires
host loading or dynamic import; that residual needs a maintainer decision
rather than invented static equivalence.

### import.meta under non-Module source goals (6)

Remaining reason: `new-evidence-or-source-only-review`.

Five import.meta goal-rejection probes and the ImportMeta specifier expression.
These combine source-goal rejection with import.meta/module behavior.

Budget 3–6 parser/static goal groups after a source-only audit. Distinguish the
forbidden dynamic source goal from the in-claim ImportMeta expression and
specifier assertion. An esid or the module-linking tag is not a closure proof.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. This metadata change
performs none of those closure or landing steps.


DS-12 assessment
----------------

The
[per-path table](./dynamic-source-module-observable-contracts-assessment.yaml)
assesses exactly the pinned 70 paths against base `362ddb13`. All 70 were
unsupported and umbrella-owned at that base. This change accounts for 51 under
ADR 0016 and leaves 19 with the umbrella. It adds 36 fixed native groups and
nine Script/Module parser probes; none becomes a test262 pass. All 41,091
inventory paths remain. The subset and results are unchanged, so no UPDATE is
needed.

The namespace witnesses preserve all original assertions and export
categories, including absent names, symbols, descriptor flags and values.
The nested-property observer also checks the actual six unexported
declaration names, preserving the upstream negative-name assertions.
Their observers are defined in a Script prelude: sloppy assignment and
delete remain sloppy, while strict observers retain their directive.
Each observer receives a statically imported namespace, directly and after
a promise continuation. The promise only transports an existing namespace;
it does not model dynamic module loading.

The live-binding witnesses keep the original enclosing syntax and the
independent global updater. Static self-import observes both export aliases
before and after a local update. Custom primitive witnesses retain all four
String/Number results. The three static graph witnesses retain the original
import/export forms (including default-plus-empty-named imports protected
from formatter normalization), exact evaluation-count guard, global object
identity and nine-dependency order. `globalThis` replaces only dynamic
discovery of the existing global object.

The ImportMeta specifier witness observes the null prototype and the exact
conditional conversion failure; decision item 2 separately bounds ImportCall
promise identity and abrupt-to-rejection conversion. The five constructor
or eval goal probes assert source-goal rejection itself. Nine fixed parser
probes separately reject Script and admit Module source in top-level,
ordinary, generator, async and async-generator bodies and parameters.

The dedicated native suite requires Node.js and Deno references, both native
specialization policies with collection forced at every safepoint, positive
allocation/collection counters and emitted module C. Namespace subjects
also require explicit namespace construction in MIR and C. The parser
probes live under *packages/parser-babel/tests/* and run unchanged under
both bootstrap hosts. Its forced-collection
matrix applies to every group directly; these module/prelude groups do not
enter the Script-fixture allowlists in *tests/native.ts*. Existing property
domains and seeds remain unchanged.

The 19 residuals include repeated namespace acquisition, cached evaluation
errors and error-object identity, Script/Module dual execution, deferred
binding updates, independently started TLA graphs and their exact values,
errors or settlement traces. Their table rows state the missing observation.
A static target error plus ImportCall rejection accounting cannot close a
path that additionally asserts caching, identity, messages or ordering.
Those residuals need faithful evidence or a bounded maintainer decision.

Only the 70 selected audit records change assessment. Each source and
normalized observation digest was checked against the pinned suite and
manifest. The replacement-evidence digests bind the table, both test files
and the complete copied fixture graph. The original observations remain
`unsupported-profile-feature`. An accepted ADR 0016 amendment admitting the
relevant source form reopens the exclusions; ADR 0019's non-source
normative-dependence trigger remains in force.

Root retains outer review, exact-candidate CI, integration, publication and
landing. New native evidence requires the ordinary full gate on both native
hosts, including the AArch64 Linux compile-link lane. No compiler, runtime,
specialization or property generator changes require a new extended property
run locally; Root's M5c candidate CI still owns its required full gates.
