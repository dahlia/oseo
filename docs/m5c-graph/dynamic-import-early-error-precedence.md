Report dynamic import early errors first
========================================

Reports the early SyntaxError of the 21 observed dynamic-import parse-negative
paths before Oseo's ImportExpression unsupported diagnostic, so their expected
negative is observed.

The 21 paths below remain unreviewed in the closure ledger.
Root authorized this ready, unlanded owner on 2026-10-27. The saved API
observations used clean source `6aab0fc8`, tree
`d6723be80209aca0fcf0606c5c3e5959f152ad0c`.

Each path applies `new` to an ImportCall followed by `.prop`. ECMA-262
accepts only a MemberExpression after `new`, and an ImportCall is a
CallExpression, so an unparenthesized ImportCall may not begin a `new`
operand. Babel rejects a bare `new import('')` but accepts the operand when
a property access, element access, or tagged template follows the call.
Oseo then converted the program and reported the ImportCall's profile
diagnostic, `ImportExpression is outside the M1 profile.`, as `OSEO1001`.

*packages/parser-babel/src/import-call-early-errors.ts* now scans the
parsed Script or Module before profile conversion. Each ImportCall that
begins a `new` operand through member accesses or template tags yields
`OSEO0001`, “An import() call cannot be the operand of new.”, located at
the call. A ParenthesizedExpression ends the scan, so
`new (import('')).prop` keeps the profile diagnostic. Both Babel frontends
return these diagnostics instead of converting, so an earlier profile gap
in the same program cannot mask the early error. Dynamic import stays
outside the profile under ADR 0016; this node admits no ImportCall
evaluation.

*packages/parser-babel/tests/import-call-early-errors.test.ts* checks
eight invalid operand shapes in the enclosing syntax of test262's templates, in
both frontends, with the exact location and message. It also checks precedence
over an earlier profile diagnostic, source order, eight valid ImportCall
placements that keep `OSEO1001`, and `new` over `import.meta` and ordinary
members.

A focused observation of the 21 paths at the implementation source,
calling the runner's exported `executeTest262Case` with the checked-in
`supportedFeatures` and an executor that refuses to run, classified each
as `expected-negative` with a parse-phase SyntaxError in every strictness mode
its frontmatter selects: both modes for 19 paths, and non-strict only for the
two `noStrict` `with` paths. It is not a manifest update. Observation batch 30
still admits the paths, and Root runs the manifest update. The 21 reviewed bare
`new import('')` paths already fail in Babel before this scan and keep their
`expected-negative` records.

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

The runner retained only `non-strict produced OSEO1001.` for these parse
negatives. It records no compiler message or location; the ImportExpression
precedence diagnosis was the Root routing decision, not a deeper raw trace.
Without the scan, the invalid-operand parser tests above fail.
