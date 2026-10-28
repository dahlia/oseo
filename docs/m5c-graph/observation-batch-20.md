Observation batch 20: reviewed admission
========================================

From the 430 saved observations on clean source `6aab0fc8`, admit
424 paths: 332 pass, 37 expected-negative and
55 unsupported-profile-feature. Retain 6 semantic failures as
unreviewed paths with the bounded remediation responsibilities below.
No path was re-observed for this admission.

Dependency tags derive from original Module goals, source AST constructs,
frontmatter subjects and the pinned lexical or grammar contract, including
malformed sources that cannot produce an AST. A tag changes no actual
classification and authorizes no exclusion. Every expected-negative comes
from the saved phase/type-correct runner classification.

| Evidence                               | Pointer                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Raw observations, first segment        | /data/m5c-b19-b20-b30-20261027/observation-6aab/raw/observations.json                                 |
| Raw observations, continuation         | /data/m5c-b19-b20-b30-20261027/observation-6aab/continuation/raw/observations.json                    |
| Raw observations, remaining 904        | /data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/observations.json                   |
| Exact source hashes and tag derivation | /data/m5c-b19-b20-b30-20261027/task\_c268e41dfa6d/ctx\_e6fde0372f06/round8/reviewed-tag-evidence.json |

The 66 unknown-eval and 393 ImportExpression rejections across this train
belong to `dynamic-source-coverage-remediation`. The 12 await-in-top-level
pattern rejections belong to `module-top-level-await-patterns`. These are
active remediation, with no new exclusion or change to ADR 0016. The
existing owners and their prior paths remain preserved.

| Unreviewed path                                                                                                                   | Remediation responsibility              |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| test/language/module-code/ambiguous-export-bindings/namespace-unambiguous-if-export-star-as-from-and-import-star-as-and-export.js | test262-module-harness-globals          |
| test/language/module-code/namespace/internals/enumerate-binding-uninit.js                                                         | module-namespace-uninitialized-bindings |
| test/language/module-code/namespace/internals/get-own-property-str-found-uninit.js                                                | module-namespace-uninitialized-bindings |
| test/language/module-code/namespace/internals/object-hasOwnProperty-binding-uninit.js                                             | module-namespace-uninitialized-bindings |
| test/language/module-code/namespace/internals/object-keys-binding-uninit.js                                                       | module-namespace-uninitialized-bindings |
| test/language/module-code/namespace/internals/object-propertyIsEnumerable-binding-uninit.js                                       | module-namespace-uninitialized-bindings |

The admission is intermediate until the stock scoped UPDATE agrees with
the API records. Root owns candidate CI, landing state and publication.

The residual paths retain `node:observation-batch-20` ledger
ownership under the existing updater and validator. The graph dependencies
assign their exact remediation responsibilities to the named nodes; this
batch stays blocked and unlanded pending later observations. Root accepted
this arrangement without a tooling change permitting unreviewed paths to
have remediation node ledger owners.


Full dependency audit
---------------------

The full train audit recomputes all 1,409 admitted rows with the B13 r14
AST tagger; its control run matches all 757 landed B13 rows. Each raw
difference and manual supplement has pinned-source evidence. Existing
Main rows, owners, classifications, and source hashes remain unchanged.

A tag records the asserted source subject and operations necessarily
performed. Failure-only assertion throws, diagnostic arguments, harness
plumbing, and uncalled bodies supply no runtime coverage. Syntax-family
tags can describe explicitly tested grammar, including operator early
errors. Normally completing try syntax alone proves no abrupt operation.
Expected runtime/resolution errors and observed rejection retain
abrupt-completion and their asserted named error-family tags.

Generic syntax/runtime tags derive from the primary test and includes.
Fixture modules contribute asserted contracts or prerequisites, including
module linking, top-level await, and dynamic source. Incidental fixture
initialization, loops, and branches are plumbing. The source audit also
checks evaluated class bindings, observed Promise chains, reached object
coercions, object-valued await reads, and heritage prototype reads.

All counts below describe the **full dispatch**, comparing `3a0e7449`
with the current subset. They come from the
[full dispatch delta](/data/m5c-b19-b20-b30-20261027/task_c268e41dfa6d/ctx_e6fde0372f06/round8/all-dispatch-tag-changes.json).
It changes 961 rows across the train and 340 owned rows here. The latest
[correction-round delta](/data/m5c-b19-b20-b30-20261027/task_c268e41dfa6d/ctx_e6fde0372f06/round8/tag-changes.json)
describes the separate comparison from `a5d1d3f6` to this correction. Its
per-round counts must not be compared with the full dispatch totals. Both
artifacts agree with the current source-tag evidence and subset.

Added tag counts for owned rows in this full-dispatch slice:

 -  abrupt-completion: 36
 -  async-iteration: 12
 -  classes: 10
 -  control-flow: 104
 -  error-intrinsics: 29
 -  expression-operators: 108
 -  functions: 75
 -  lexical-bindings: 54
 -  lexical-grammar: 3
 -  object-own-keys: 2
 -  object-properties: 220
 -  regular-expressions: 8
 -  set-intrinsic: 1
 -  symbols: 27

Removed tag counts for owned rows in this full-dispatch slice:

 -  dynamic-source: 2
 -  lexical-grammar: 3
 -  promise-settlement: 1
 -  top-level-await: 1

The evidence directory records all source hashes, per-candidate reach
decisions, metadata/uncalled-body/operator sweeps, and Root decisions.
