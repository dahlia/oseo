Report dynamic import early errors first
========================================

Reports the early SyntaxError of the 21 observed dynamic-import parse-negative
paths before Oseo's ImportExpression unsupported diagnostic, so their expected
negative is observed.

The 21 paths below remain unreviewed in the closure ledger.
Root authorized this ready, unlanded owner on 2026-10-27. The saved API
observations used clean source `6aab0fc8`, tree
`d6723be80209aca0fcf0606c5c3e5959f152ad0c`; no path was re-observed here.
This node supplies no semantic repair or predicted promotion.

| Owned path                                                                                                                               | Exact observed diagnostic       | Raw result                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-arrow-assignment-expression-no-new-call-expression-prop-access.js`       | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-615-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-arrow-no-new-call-expression-prop-access.js`                             | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-620-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-async-arrow-function-await-no-new-call-expression-prop-access.js`        | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-626-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-async-arrow-function-return-await-no-new-call-expression-prop-access.js` | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-632-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-async-function-await-no-new-call-expression-prop-access.js`              | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-639-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-async-function-no-new-call-expression-prop-access.js`                    | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-644-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-async-function-return-await-no-new-call-expression-prop-access.js`       | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-649-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-async-gen-await-no-new-call-expression-prop-access.js`                   | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-656-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-block-labeled-no-new-call-expression-prop-access.js`                     | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-663-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-block-no-new-call-expression-prop-access.js`                             | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-668-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-do-while-no-new-call-expression-prop-access.js`                          | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-674-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-else-braceless-no-new-call-expression-prop-access.js`                    | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-681-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-else-no-new-call-expression-prop-access.js`                              | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-686-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-function-no-new-call-expression-prop-access.js`                          | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-692-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-function-return-no-new-call-expression-prop-access.js`                   | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-697-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-if-braceless-no-new-call-expression-prop-access.js`                      | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-705-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-if-no-new-call-expression-prop-access.js`                                | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-710-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-while-no-new-call-expression-prop-access.js`                             | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-716-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-with-expression-no-new-call-expression-prop-access.js`                   | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-723-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/nested-with-no-new-call-expression-prop-access.js`                              | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-728-result.json` |
| `test/language/expressions/dynamic-import/syntax/invalid/top-level-no-new-call-expression-prop-access.js`                                | `non-strict produced OSEO1001.` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-734-result.json` |

The runner retains only `non-strict produced OSEO1001.` for these parse
negatives. It records no compiler message or location; the ImportExpression
precedence diagnosis is the Root routing decision, not a deeper raw trace.
