Observation batch 30: reviewed admission
========================================

From the 535 saved observations on clean source `6aab0fc8`, admit
514 paths: 0 pass, 123 expected-negative and
391 unsupported-profile-feature. Retain 21 semantic failures as
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
| Exact source hashes and tag derivation | /data/m5c-b19-b20-b30-20261027/task\_c268e41dfa6d/ctx\_e6fde0372f06/round5/reviewed-tag-evidence.json |

The 66 unknown-eval and 393 ImportExpression rejections across this train
belong to `dynamic-source-coverage-remediation`. The 12 await-in-top-level
pattern rejections belong to `module-top-level-await-patterns`. These are
active remediation, with no new exclusion or change to ADR 0016. The
existing owners and their prior paths remain preserved.

| Unreviewed path                                                                                                                        | Remediation responsibility            |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| test/language/expressions/dynamic-import/syntax/invalid/nested-arrow-assignment-expression-no-new-call-expression-prop-access.js       | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-arrow-no-new-call-expression-prop-access.js                             | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-async-arrow-function-await-no-new-call-expression-prop-access.js        | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-async-arrow-function-return-await-no-new-call-expression-prop-access.js | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-async-function-await-no-new-call-expression-prop-access.js              | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-async-function-no-new-call-expression-prop-access.js                    | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-async-function-return-await-no-new-call-expression-prop-access.js       | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-async-gen-await-no-new-call-expression-prop-access.js                   | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-block-labeled-no-new-call-expression-prop-access.js                     | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-block-no-new-call-expression-prop-access.js                             | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-do-while-no-new-call-expression-prop-access.js                          | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-else-braceless-no-new-call-expression-prop-access.js                    | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-else-no-new-call-expression-prop-access.js                              | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-function-no-new-call-expression-prop-access.js                          | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-function-return-no-new-call-expression-prop-access.js                   | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-if-braceless-no-new-call-expression-prop-access.js                      | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-if-no-new-call-expression-prop-access.js                                | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-while-no-new-call-expression-prop-access.js                             | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-with-expression-no-new-call-expression-prop-access.js                   | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/nested-with-no-new-call-expression-prop-access.js                              | dynamic-import-early-error-precedence |
| test/language/expressions/dynamic-import/syntax/invalid/top-level-no-new-call-expression-prop-access.js                                | dynamic-import-early-error-precedence |

The admission is intermediate until the stock scoped UPDATE agrees with
the API records. Root owns candidate CI, landing state and publication.

The residual paths retain `node:observation-batch-30` ledger
ownership under the existing updater and validator. The graph dependencies
assign their exact remediation responsibilities to the named nodes; this
batch stays blocked and unlanded pending later observations. Root accepted
this arrangement without a tooling change permitting unreviewed paths to
have remediation node ledger owners.

The fixture-import tag audit found one missing dependency among all 1,409
admissions: `verify-dfs.js` imports `verify-dfs-a_FIXTURE.js`, whose line 6
contains ImportExpression. The source-derived `dynamic-source` tag is
added without changing its actual unsupported classification. The 81
entries with imports cover 42 distinct imported files, all byte-identical
to the pinned archive; no other dynamic fixture tag miss was found. A
fresh stock scoped UPDATE must verify this corrected metadata before
review completion.

The twelve malformed `typeof import` negatives also carry `dynamic-source`
from their original ImportCall grammar subject. An enclosing function,
async function, loop or with statement does not replace that subject tag.
Their actual expected-negative classifications remain unchanged.
