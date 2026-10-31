Template site evidence
======================

DS-20 bounds 1 unsupported paths at semantic bundle commit
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: M. The initial scope has
zero newly established closures.

The exact selector is
[*dynamic-source-template-site-evidence.paths.txt*](./dynamic-source-template-site-evidence.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`cbfdaae7c47f8afff0533cca29e703d45d2581a05fbdd9d49968e257f6a374d5`


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

Estimated new test groups: 1–2. Audit-only candidates: 0–0. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### Template identity across inner/outer evaluations (1)

Remaining reason: `new-evidence-or-maintainer-decision`.

The one local residual compares four template objects: same source location
within each inner loop, different Parse Nodes across separate eval calls, with
changing substitutions. The other template-realm path belongs to realm-host.

Budget 1–2 native/static identity fixtures that execute the same template site
twice per enclosing function/source instantiation and prove both equalities
plus the intervening inequality. DS-7 already rejected incomplete identity
witnesses. If a static pair cannot preserve the Parse Node distinction, retain
and request a boundary decision.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. This metadata change
performs none of those closure or landing steps.


Per-path assessment
-------------------

At base `362ddb13d933600f6a0543ac332eb8479be9053f`, the selector above
contains exactly one path and the derived ledger assigns it to
`node:dynamic-source-coverage-remediation`, classified
`unsupported-profile-feature`. Its normative subject is GetTemplateObject
(ECMA-262 2025 13.2.8.4), caching by Parse Node identity.

| Original path                                                            | Non-source assertions                                                                                                                       | Replacement                                                                                                                     | Decision and reason                                                                                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| *test/language/expressions/tagged-template/cache-eval-inner-function.js* | Four tag calls: objects 0 and 1 are identical, objects 1 and 2 differ, objects 2 and 3 are identical; outer and inner substitutions change. | *tests/native/fixtures/template-site-identity.ts*, registered through *tests/native/fixtures/bindings.ts* in *tests/native.ts*. | Item 1 exclusion: two identical static inner bodies have distinct Parse Nodes and each inner loop reuses its site; only creating those Parse Nodes through eval remains excluded. |

The fixed fixture adds one evidence group. Its first four calls preserve
both equalities and the intervening inequality, and explicitly report the
substitutions `0:0,0:1,1:0,1:1`. Recreating the first function's closure
with outer value 2 observes two more calls: both reuse object 0. That
control distinguishes the Parse Node from closure or invocation identity.
Neither body uses dynamic source. The original eval-specific step, producing
fresh Parse Nodes from identical source text, remains under ADR 0016; the
static fixture witnesses the resulting identity relationships.

The native runner compares Node.js and Deno with an explicit expected log,
then compares each native policy with those observations. Both policies
force collection at every safepoint and require a positive collection count.
Structural assertions require two template-object operations in distinct
MIR functions, identical cooked/raw strings, and two emitted C static site
identities. The tagged-template profile record names the new evidence.
This node adds no specialized template operation or property domain.

The original source and normalized rejection digests are recomputed using
*tools/m5c-exclusion-audit.ts* and match the existing row. The dedicated
`ds20-template-site-identity` audit assessment binds the fixture, its
registration and the runner by SHA256. The derived ledger changes only this
path's owner to `adr:0016-dynamic-source-boundary`; its state and dependency
tags remain unchanged. No inventory path, reviewed subset, result, ADR,
umbrella total or graph landed state changes.

Node delta: one closed as an authorized exclusion, zero staying in
remediation, one fixed evidence group added, zero passes added. Root owns
publication of the umbrella's aggregate count. Changed original source,
observations or replacement evidence require reassessment; ADR 0016's
replacement triggers and ADR 0019's non-source normative-dependence trigger
remain in force.


Validation and review
---------------------

Both baseline and post-change `node --test tests/m5c-*.test.ts` runs passed
105 tests. The focused `mise run test:native --shard 188/297` run passed:
one fixture against Node.js/Deno and both native policies on
`linux-x86_64-gnu`, plus one `linux-aarch64-musl` compile/link inspection.
The cross-target build is structural evidence, not native execution.
*native01.json*, *native01.stdout* and *native01.stderr* retain that run;
*final-fast01.log* retains the post-change fast result. Raw author artifacts
and the final check/review receipts are under
*/data/m5c-d17-20261031/ds20/*; *REPORT.md* there records the reviewed
commits, verdicts, exact final-source hashes and any remaining gate.

No UPDATE is needed: the reviewed subset and observations are unchanged,
and all changed executable files are native evidence outside the test262
runner's import/data closure. Root must still run the exact candidate's
full `mise run test` suites (Node.js, Deno, native and test262), including
supported macOS native validation and ordinary candidate/Main gates. No
local full suite or publication is claimed here.
