Unknown eval binding coverage
=============================

This record backs the M5c graph node `dynamic-source-unknown-eval` (DS-3).
The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*), item 4, approves this node as DS-3
of the `dynamic-source-coverage-remediation` split. The umbrella lands when
it owns zero paths.


Selection rule
--------------

This node owns exactly the 66 paths that `observation-batch-19` (25),
`observation-batch-20` (40), and `observation-batch-30` (1) add to the
umbrella with the observed rejection `error[OSEO1001]: Unknown binding 'eval'`.
The Host Full path
*test/language/global-code/script-decl-lex-var-declared-via-eval.js* reports
the same diagnostic but belongs to `dynamic-source-lexical-completion-family`.
The umbrella owns these paths once those batches land. This node does not
depend on the batches, because the umbrella shares manifest collision groups
with them; it selects nothing before they land, and its landing must follow
theirs. The sorted path set, with one final newline, has SHA256
`f8cdae47b9f8cf413abce9a9546194caa38c727841c0b42ca361f5a471f86830`.


Evidence obligations
--------------------

 -  Assess each path separately. The _statementList/eval-\*_ probes may make
    source evaluation their subject, while the *literals/regexp/* probes may
    make RegExp literal grammar their subject; they can reach different
    conclusions.
 -  A path closes under `adr:0016-dynamic-source-boundary` only by item 1 of
    the decision: reviewed replacement evidence covers every non-source
    subject, and a fresh-digest exclusion-audit record names it and shows
    that only source evaluation remains. Otherwise it stays in remediation.
 -  Never count a pass, emulate eval, remove an assertion, or widen ADR 0016.
    ADR 0016 and ADR 0019 remain unchanged, and all 41,091 inventory paths
    remain.


Owned paths
-----------

| Path                                                                                          |
| --------------------------------------------------------------------------------------------- |
| *test/language/expressions/dynamic-import/usage-from-eval.js*                                 |
| *test/language/literals/numeric/7.8.3-3gs.js*                                                 |
| *test/language/literals/regexp/7.8.5-1.js*                                                    |
| *test/language/literals/regexp/mongolian-vowel-separator-eval.js*                             |
| *test/language/literals/regexp/named-groups/invalid-lone-surrogate-groupname.js*              |
| *test/language/literals/regexp/S7.8.5\_A1.1\_T2.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A1.3\_T2.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A1.3\_T4.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A1.3\_T5.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A1.3\_T6.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A1.4\_T2.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A1.5\_T2.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A1.5\_T4.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A1.5\_T5.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A1.5\_T6.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A2.1\_T2.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A2.3\_T2.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A2.3\_T4.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A2.3\_T5.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A2.3\_T6.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A2.4\_T2.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A2.5\_T2.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A2.5\_T4.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A2.5\_T5.js*                                           |
| *test/language/literals/regexp/S7.8.5\_A2.5\_T6.js*                                           |
| *test/language/literals/string/mongolian-vowel-separator-eval.js*                             |
| *test/language/statementList/eval-block-array-literal.js*                                     |
| *test/language/statementList/eval-block-array-literal-with-item.js*                           |
| *test/language/statementList/eval-block-arrow-function-assignment-expr.js*                    |
| *test/language/statementList/eval-block-arrow-function-functionbody.js*                       |
| *test/language/statementList/eval-block-block.js*                                             |
| *test/language/statementList/eval-block-block-with-labels.js*                                 |
| *test/language/statementList/eval-block-expr-arrow-function-boolean-literal.js*               |
| *test/language/statementList/eval-block-let-declaration.js*                                   |
| *test/language/statementList/eval-block-regexp-literal-flags.js*                              |
| *test/language/statementList/eval-block-regexp-literal.js*                                    |
| *test/language/statementList/eval-block-with-statment-array-literal.js*                       |
| *test/language/statementList/eval-block-with-statment-array-literal-with-item.js*             |
| *test/language/statementList/eval-block-with-statment-arrow-function-assignment-expr.js*      |
| *test/language/statementList/eval-block-with-statment-arrow-function-functionbody.js*         |
| *test/language/statementList/eval-block-with-statment-block.js*                               |
| *test/language/statementList/eval-block-with-statment-block-with-labels.js*                   |
| *test/language/statementList/eval-block-with-statment-expr-arrow-function-boolean-literal.js* |
| *test/language/statementList/eval-block-with-statment-let-declaration.js*                     |
| *test/language/statementList/eval-block-with-statment-regexp-literal-flags.js*                |
| *test/language/statementList/eval-block-with-statment-regexp-literal.js*                      |
| *test/language/statementList/eval-class-array-literal.js*                                     |
| *test/language/statementList/eval-class-array-literal-with-item.js*                           |
| *test/language/statementList/eval-class-arrow-function-assignment-expr.js*                    |
| *test/language/statementList/eval-class-arrow-function-functionbody.js*                       |
| *test/language/statementList/eval-class-block.js*                                             |
| *test/language/statementList/eval-class-block-with-labels.js*                                 |
| *test/language/statementList/eval-class-expr-arrow-function-boolean-literal.js*               |
| *test/language/statementList/eval-class-let-declaration.js*                                   |
| *test/language/statementList/eval-class-regexp-literal-flags.js*                              |
| *test/language/statementList/eval-class-regexp-literal.js*                                    |
| *test/language/statementList/eval-fn-array-literal.js*                                        |
| *test/language/statementList/eval-fn-array-literal-with-item.js*                              |
| *test/language/statementList/eval-fn-arrow-function-assignment-expr.js*                       |
| *test/language/statementList/eval-fn-arrow-function-functionbody.js*                          |
| *test/language/statementList/eval-fn-block.js*                                                |
| *test/language/statementList/eval-fn-block-with-labels.js*                                    |
| *test/language/statementList/eval-fn-expr-arrow-function-boolean-literal.js*                  |
| *test/language/statementList/eval-fn-let-declaration.js*                                      |
| *test/language/statementList/eval-fn-regexp-literal-flags.js*                                 |
| *test/language/statementList/eval-fn-regexp-literal.js*                                       |
