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

| Evidence                               | Pointer                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Raw observations, first segment        | /data/m5c-b19-b20-b30-20261027/observation-6aab/raw/observations.json                                |
| Raw observations, continuation         | /data/m5c-b19-b20-b30-20261027/observation-6aab/continuation/raw/observations.json                   |
| Raw observations, remaining 904        | /data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/observations.json                  |
| Exact source hashes and tag derivation | /data/m5c-b19-b20-b30-20261027/task\_fdd834e1b3d1/ctx\_56a3678b5060/reviewed-tag-evidence-final.json |

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
