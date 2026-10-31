Residual ImportCall accounting
==============================

DS-8 bounds 3 unsupported paths at semantic bundle commit
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: S. The initial scope has
zero newly established closures at the split. This assessment accounts for
two paths under ADR 0016 and retains one in remediation; evidence added: 0.

The exact selector is
[*dynamic-source-importcall-residual-accounting.paths.txt*](./dynamic-source-importcall-residual-accounting.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`949e49f1fc8722655c8a9e7865ee722c74960ab28c49e9f204638444d25b5c15`


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

Estimated new test groups: 0–1. Audit-only candidates: 0–2. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### Residual ImportCall subjects and eval/Promise interaction (3)

Remaining reason: `existing-observation-accounting-candidate`.

*await-expr-dyn-import.js* only checks valid await ImportCall syntax and catches
any load error; *returns-promise.js* observes the intrinsic ImportCall promise
after tampering with global Promise. *usage-from-eval.js* additionally checks
eval and four imported values.

The first two are candidates for the already authorized item 2 ImportCall
accounting rule, using existing rejection observations and fresh audit digests.
The third is a DS-3 retained gap: enumerate every value and promise assertion
and provide evidence before accounting it. Budget at most one shared static
value/Promise group, while retaining any uncovered ImportCall/eval interaction.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. The split performed none
of those closure or landing steps. The assessment below prepares two exclusions
for Root's review and publication gates.


Per-path assessment
-------------------

The exact selector above matches three umbrella-owned unsupported rows at
base `362ddb13d933600f6a0543ac332eb8479be9053f`. The source and normalized
observation digests of all three were recomputed from the pinned suite and
checked-in result partitions and match their audit records. Every path
retains its classification, tags, source and original assertions.

| Path                                                                        | Normative subject and assertions                                                                                                                                                                                                                                                                        | Replacement coverage                                                                                                                                                                                                                                                              | Disposition and reason                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| *test/language/expressions/dynamic-import/returns-promise.js*               | EvaluateImportCall creates its promise with intrinsic `%Promise%` after the global `Promise` binding is replaced with a throwing function. The returned promise retains the original constructor, prototype, `then`, `catch` and `finally`; none of the three methods is an own property.               | No independent non-source subject: every assertion describes the ImportCall result; no namespace export, evaluation order or binding is read. No replacement is required under decision item 2.                                                                                   | ADR 0016, `ds8-import-call-intrinsic-promise`: the complete contract is ImportCall's intrinsic promise creation, with the existing exact ImportExpression OSEO1001 rejection.                                |
| *test/language/expressions/dynamic-import/usage-from-eval.js*               | ImportCall inside direct eval, `Promise.resolve(p) === p`, `Object.getPrototypeOf(p) === Promise.prototype`, then namespace values `default === 42`, `local1 === 'Test262'`, `renamed === 'TC39'` and `indirect === 'Test262'`; the final chained promise reports success or rejection through `$DONE`. | No complete replacement established. The fixture exports a default expression, a local var, a renamed var and an indirect self-reexport. The retained DS-3 assessment establishes no replacement for every value assertion together with the eval/ImportCall promise interaction. | Remediation, `ds3-import-from-eval`: the runtime eval-source rejection observes none of the promise or exported-value assertions, and static loading alone cannot establish the eval/ImportCall interaction. |
| *test/language/module-code/top-level-await/syntax/await-expr-dyn-import.js* | `prod-AwaitExpression`: valid composition of top-level `await` with an ImportCall operand. The sole statement awaits `import('foo')` inside a try/catch that ignores every load error; there is no assertion of a loaded value, evaluation order, scheduling or settlement result.                      | No independent non-source behavior is asserted; this is the ImportCall grammar composition singled out for reassessment by DS-2. No replacement is required for that bounded syntax subject.                                                                                      | ADR 0016, `ds8-await-import-call-syntax`: only the rejected ImportCall grammar site remains.                                                                                                                 |

The retained mixed path needs a reviewed witness for every exported value
and the intrinsic promise assertions before reconsideration; no static
substitute for its eval/ImportCall interaction is claimed. A partial value
fixture would leave that interaction open, so this change adds no evidence
or native tests.

Self-audit against the 2026-10-29 tag rules: all three classifications,
dependency lists and observations remain byte for byte unchanged. Promise
and module prerequisites do not establish a separate asserted subject.
Neither the throwing replacement constructor nor the syntax probe's error
handler is reached by the recorded ImportExpression rejection. No new tag
or diagnostic witness is inferred from them.

The inventory remains 41,091 paths. No subset or result changes occur and
no UPDATE is needed. Root retains outer review, exact-candidate CI,
publication, integration, push and landed-state ownership. An accepted ADR
0016 amendment admitting any form of dynamic import reopens ImportCall
accounting; changed source, observation or assessment requires a fresh
review, and ADR 0019's reopening triggers remain in force.

Root confirmed on 2026-10-31 that item 2 follows the ImportCall subject,
including this grammar-only await composition in the approved DS-8
selector, rather than the directory containing the test. The two excluded
paths move only to `adr:0016-dynamic-source-boundary`; the retained path
stays with `node:dynamic-source-coverage-remediation`. Umbrella ownership
changes from 950 to 948 and ADR 0016 ownership from 677 to 679. The ledger's
`closedPaths` stays 32,665 because exclusions never count as passes or
expected negatives.


Publication coordination
------------------------

Root directed the parallel DS-8 through DS-22 lanes on 2026-10-31 to keep
shared umbrella counts anchored to the 950-path split baseline and report
only each child's delta. DS-8 accounts for 2 paths and retains 1; Root
reconciles the shared running total at publication. The local derived
ledger's 948 umbrella paths and 679 ADR 0016 paths describe this candidate
alone, not a running total across the other lanes. Shared prose and node
metadata therefore name the historical baseline and DS-8 delta rather than
asserting a new combined total.
