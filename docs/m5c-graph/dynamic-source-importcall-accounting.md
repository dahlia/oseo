ImportCall-subject dynamic import accounting
============================================

This record backs the M5c graph node `dynamic-source-importcall-accounting`
(DS-1). The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*), item 2, extends the 2026-10-22
import-attributes accounting decision (option A) to dynamic import paths whose
normative subject is ImportCall itself, including EvaluateImportCall and
ContinueDynamicImport. Item 4 approves this node as DS-1 of the
`dynamic-source-coverage-remediation` split; the umbrella lands when it owns
zero paths.


Selection rule
--------------

The observation train for `observation-batch-19`, `observation-batch-20`,
and `observation-batch-30` adds 393 observed OSEO1001 ImportExpression
rejections to the umbrella: 3 from batch 20 and 390 from batch 30. Their
sorted path set, with one final newline, has SHA256
`5009fc2b4fb24aa21e174e3da6aed28219f5e78ef01a3389b0ec7ec78ac55823`. The
umbrella owns these paths once those batches land. This node does not depend on
the batches, because the umbrella shares manifest collision groups with them;
it selects nothing before they land, and its landing must follow theirs.

Of those, 382 lie under *test/language/expressions/dynamic-import/*:
*syntax/* 66, *catch/* 112, *usage/* 90, *assignment-expression/* 27,
*namespace/* 61, and 26 files directly in the directory. Candidates for this
node are the paths outside *namespace/*. A candidate is selected only when a
path-by-path reviewed assessment of its description, normative section, and
assertions confirms that ImportCall is the normative subject and bounds the
assertions to source evaluation, as the PLAN-M5C.md ImportCall rule requires.
A directory name, an `esid`, or a feature tag alone does not qualify.

A candidate whose subject is module evaluation order, top-level await, a
module namespace object, or JSON module identity belongs to
`dynamic-source-module-semantics` (DS-2). A candidate whose assessment
finds another unresolved non-source subject stays with the umbrella.


Evidence obligations
--------------------

 -  Each selected path moves to `adr:0016-dynamic-source-boundary` with a
    reviewed exclusion-audit record with fresh source and observation
    digests, as ADR 0019 and PLAN-M5C.md require.
 -  Audit records and ledger owners only; no product change.
 -  Keep all 41,091 inventory paths and count none as a pass.
 -  The exclusion reopens when an accepted ADR 0016 amendment admits any form
    of dynamic import. A later pass or expected negative takes the
    observation owner, and a still unsupported path needs a fresh assessment.
 -  This approves no dynamic import implementation. ADR 0016 and ADR 0019
    remain unchanged.
 -  Split review scopes by subdirectory: *syntax/*, *catch/*, *usage/*,
    *assignment-expression/*, and the directory's own files.


Review result
-------------

The review first ran on the observation train target 3a0e7449 merged under
the graph split 6db426dd, because the umbrella owned no dynamic import path
before the train landed. The reworked train has since landed on Main
915ec6df, and this record was replayed onto it. On Main the 393 paths are
the same set; the SHA256 above is of that set in the `sort` order of the
en\_US locale. For each of the 218 selected paths the landed manifest
keeps the case, the `unsupported-profile-feature` classification, and the
observation byte for byte, and the train audit row keeps its source and
observation digests, normative section, and subject, so the per-path
assessments below still apply. Only dependency tags changed with the
train's tag rework: 132 selected paths gained `module-linking` and
`object-properties`, and the 15 *syntax/valid/* paths in async
contexts lost `promise-settlement`. A prerequisite tag records what a full
run would need, not the normative subject, and neither change makes any
assertion observe module linking, so no selection changed. Before the
replay the umbrella also gained
*test/built-ins/Iterator/proto-from-ctor-realm.js* from the iterator-helpers
tag activation, outside this node's paths.

The umbrella owns 383 paths under
*test/language/expressions/dynamic-import/* on both bases. Excluding the 61
under *namespace/* leaves 322. One of them, *usage-from-eval.js*, observes
the OSEO1001 `Unknown binding 'eval'` rejection rather than the
ImportExpression rejection, so it belongs to the unknown-eval family and is
not a candidate. The other 321 candidates each observe the exact OSEO1001
ImportExpression rejection with the `dynamic-source` dependency tag.

| Subdirectory                    | Candidates | ADR 0016 | Umbrella |
| ------------------------------- | ---------: | -------: | -------: |
| *syntax/*                       |         66 |       66 |        0 |
| *catch/*                        |        112 |       64 |       48 |
| *usage/*                        |         90 |       54 |       36 |
| *assignment-expression/*        |         27 |       27 |        0 |
| Files directly in the directory |         26 |        7 |       19 |
| Total                           |        321 |      218 |      103 |

The 218 selected paths keep their train audit rows. Their source and
observation digests were recomputed from the pinned suite and the merged
manifest and equal the recorded values; only the assessment changes, from the
remediation assessment `observation-train-dynamic-source` to one of three
exclusion assessments:

 -  `import-call-syntax` (86): the ImportCall production in a context, nested,
    or followed by Arguments, a TemplateLiteral, a computed member access, or
    a NewExpression, and two AssignmentExpression argument forms whose call
    results no assertion observes.
 -  `import-call-specifier` (60): EvaluateImportCall's specifier evaluation,
    GetValue, and ToString, with abrupt completions.
 -  `import-call-promise` (72): the promise that ImportCall returns and
    ContinueDynamicImport fulfills or rejects.

Namespace export reads in the selected paths only identify the module that
fulfilled the promise. The 103 staying candidates assert module linking, the
Module goal of a loaded file, live bindings, namespace identity or
ToPrimitive, export default evaluation, module evaluation state, or
evaluation order; they stay with `dynamic-source-coverage-remediation`.
On Main the umbrella goes from 765 to 547 paths and ADR 0016 from 279
to 497. All 41,091 inventory paths remain, and the manifest, subset, and
results are unchanged.


Per-path review
---------------

Each row names a candidate relative to
*test/language/expressions/dynamic-import/*.

### *syntax/*

66 candidates: 66 move to ADR 0016, 0 stay with the umbrella.

| Path                                                                                      | Owner    | Assessment           | Reason                                                                                               |
| ----------------------------------------------------------------------------------------- | -------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| *syntax/valid/callexpression-arguments.js*                                                | ADR 0016 | `import-call-syntax` | ImportCall as the callee of a CallExpression Arguments; TypeError comes from calling its promise     |
| *syntax/valid/callexpression-templateliteral.js*                                          | ADR 0016 | `import-call-syntax` | ImportCall as the tag of a TemplateLiteral; TypeError comes from calling its promise                 |
| *syntax/valid/nested-arrow-assignment-expression-empty-str-is-valid-assign-expr.js*       | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-arrow-assignment-expression-nested-imports.js*                       | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-arrow-assignment-expression-script-code-valid.js*                    | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-arrow-empty-str-is-valid-assign-expr.js*                             | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-arrow-nested-imports.js*                                             | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-arrow-script-code-valid.js*                                          | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-async-arrow-function-await-empty-str-is-valid-assign-expr.js*        | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-async-arrow-function-await-nested-imports.js*                        | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-async-arrow-function-await-script-code-valid.js*                     | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-async-arrow-function-return-await-empty-str-is-valid-assign-expr.js* | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-async-arrow-function-return-await-nested-imports.js*                 | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-async-arrow-function-return-await-script-code-valid.js*              | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-async-function-await-empty-str-is-valid-assign-expr.js*              | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-async-function-await-nested-imports.js*                              | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-async-function-await-script-code-valid.js*                           | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-async-function-empty-str-is-valid-assign-expr.js*                    | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-async-function-nested-imports.js*                                    | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-async-function-return-await-empty-str-is-valid-assign-expr.js*       | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-async-function-return-await-nested-imports.js*                       | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-async-function-return-await-script-code-valid.js*                    | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-async-function-script-code-valid.js*                                 | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-async-gen-await-empty-str-is-valid-assign-expr.js*                   | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-async-gen-await-nested-imports.js*                                   | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-async-gen-await-script-code-valid.js*                                | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-block-empty-str-is-valid-assign-expr.js*                             | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-block-labeled-empty-str-is-valid-assign-expr.js*                     | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-block-labeled-nested-imports.js*                                     | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-block-labeled-script-code-valid.js*                                  | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-block-nested-imports.js*                                             | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-block-script-code-valid.js*                                          | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-do-while-empty-str-is-valid-assign-expr.js*                          | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-do-while-nested-imports.js*                                          | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-do-while-script-code-valid.js*                                       | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-else-braceless-empty-str-is-valid-assign-expr.js*                    | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-else-braceless-nested-imports.js*                                    | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-else-braceless-script-code-valid.js*                                 | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-else-empty-str-is-valid-assign-expr.js*                              | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-else-nested-imports.js*                                              | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-else-script-code-valid.js*                                           | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-function-empty-str-is-valid-assign-expr.js*                          | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-function-nested-imports.js*                                          | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-function-return-empty-str-is-valid-assign-expr.js*                   | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-function-return-nested-imports.js*                                   | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-function-return-script-code-valid.js*                                | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-function-script-code-valid.js*                                       | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-if-braceless-empty-str-is-valid-assign-expr.js*                      | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-if-braceless-nested-imports.js*                                      | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-if-braceless-script-code-valid.js*                                   | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-if-empty-str-is-valid-assign-expr.js*                                | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-if-nested-imports.js*                                                | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-if-script-code-valid.js*                                             | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-while-empty-str-is-valid-assign-expr.js*                             | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-while-nested-imports.js*                                             | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-while-script-code-valid.js*                                          | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-with-empty-str-is-valid-assign-expr.js*                              | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-with-expression-empty-str-is-valid-assign-expr.js*                   | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/nested-with-expression-nested-imports.js*                                   | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-with-expression-script-code-valid.js*                                | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/nested-with-nested-imports.js*                                              | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/nested-with-script-code-valid.js*                                           | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |
| *syntax/valid/new-covered-expression-is-valid.js*                                         | ADR 0016 | `import-call-syntax` | Parenthesized ImportCall as a NewExpression operand; assertions observe only constructing its result |
| *syntax/valid/top-level-empty-str-is-valid-assign-expr.js*                                | ADR 0016 | `import-call-syntax` | ImportCall(‘’) parses as an AssignmentExpression in this context                                     |
| *syntax/valid/top-level-nested-imports.js*                                                | ADR 0016 | `import-call-syntax` | ImportCall nests as the argument of another ImportCall                                               |
| *syntax/valid/top-level-script-code-valid.js*                                             | ADR 0016 | `import-call-syntax` | ImportCall parses in Script code; the var/function pair only pins the Script goal                    |

### *catch/*

112 candidates: 64 move to ADR 0016, 48 stay with the umbrella.

| Path                                                                                  | Owner    | Assessment              | Reason                                                                                                                  |
| ------------------------------------------------------------------------------------- | -------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| *catch/nested-arrow-import-catch-eval-rqstd-abrupt-typeerror.js*                      | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-arrow-import-catch-eval-rqstd-abrupt-urierror.js*                       | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-arrow-import-catch-eval-script-code-target.js*                          | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-arrow-import-catch-file-does-not-exist.js*                              | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-arrow-import-catch-instn-iee-err-ambiguous-import.js*                   | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-arrow-import-catch-instn-iee-err-circular.js*                           | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-arrow-import-catch-specifier-tostring-abrupt-rejects.js*                | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/nested-async-arrow-function-await-eval-rqstd-abrupt-typeerror.js*              | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-async-arrow-function-await-eval-rqstd-abrupt-urierror.js*               | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-async-arrow-function-await-eval-script-code-target.js*                  | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-async-arrow-function-await-file-does-not-exist.js*                      | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-async-arrow-function-await-instn-iee-err-ambiguous-import.js*           | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-async-arrow-function-await-instn-iee-err-circular.js*                   | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-async-arrow-function-await-specifier-tostring-abrupt-rejects.js*        | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/nested-async-arrow-function-return-await-eval-rqstd-abrupt-typeerror.js*       | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-async-arrow-function-return-await-eval-rqstd-abrupt-urierror.js*        | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-async-arrow-function-return-await-eval-script-code-target.js*           | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-async-arrow-function-return-await-file-does-not-exist.js*               | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-async-arrow-function-return-await-instn-iee-err-ambiguous-import.js*    | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-async-arrow-function-return-await-instn-iee-err-circular.js*            | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-async-arrow-function-return-await-specifier-tostring-abrupt-rejects.js* | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/nested-async-function-await-eval-rqstd-abrupt-typeerror.js*                    | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-async-function-await-eval-rqstd-abrupt-urierror.js*                     | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-async-function-await-eval-script-code-target.js*                        | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-async-function-await-file-does-not-exist.js*                            | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-async-function-await-instn-iee-err-ambiguous-import.js*                 | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-async-function-await-instn-iee-err-circular.js*                         | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-async-function-await-specifier-tostring-abrupt-rejects.js*              | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/nested-async-function-eval-rqstd-abrupt-typeerror.js*                          | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-async-function-eval-rqstd-abrupt-urierror.js*                           | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-async-function-eval-script-code-target.js*                              | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-async-function-file-does-not-exist.js*                                  | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-async-function-instn-iee-err-ambiguous-import.js*                       | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-async-function-instn-iee-err-circular.js*                               | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-async-function-return-await-eval-rqstd-abrupt-typeerror.js*             | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-async-function-return-await-eval-rqstd-abrupt-urierror.js*              | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-async-function-return-await-eval-script-code-target.js*                 | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-async-function-return-await-file-does-not-exist.js*                     | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-async-function-return-await-instn-iee-err-ambiguous-import.js*          | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-async-function-return-await-instn-iee-err-circular.js*                  | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-async-function-return-await-specifier-tostring-abrupt-rejects.js*       | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/nested-async-function-specifier-tostring-abrupt-rejects.js*                    | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/nested-async-gen-await-eval-rqstd-abrupt-typeerror.js*                         | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-async-gen-await-eval-rqstd-abrupt-urierror.js*                          | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-async-gen-await-eval-script-code-target.js*                             | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-async-gen-await-file-does-not-exist.js*                                 | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-async-gen-await-instn-iee-err-ambiguous-import.js*                      | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-async-gen-await-instn-iee-err-circular.js*                              | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-async-gen-await-specifier-tostring-abrupt-rejects.js*                   | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/nested-async-gen-return-await-eval-rqstd-abrupt-typeerror.js*                  | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-async-gen-return-await-eval-rqstd-abrupt-urierror.js*                   | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-async-gen-return-await-eval-script-code-target.js*                      | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-async-gen-return-await-file-does-not-exist.js*                          | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-async-gen-return-await-instn-iee-err-ambiguous-import.js*               | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-async-gen-return-await-instn-iee-err-circular.js*                       | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-async-gen-return-await-specifier-tostring-abrupt-rejects.js*            | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/nested-block-import-catch-eval-rqstd-abrupt-typeerror.js*                      | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-block-import-catch-eval-rqstd-abrupt-urierror.js*                       | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-block-import-catch-eval-script-code-target.js*                          | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-block-import-catch-file-does-not-exist.js*                              | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-block-import-catch-instn-iee-err-ambiguous-import.js*                   | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-block-import-catch-instn-iee-err-circular.js*                           | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-block-import-catch-specifier-tostring-abrupt-rejects.js*                | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/nested-block-labeled-eval-rqstd-abrupt-typeerror.js*                           | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-block-labeled-eval-rqstd-abrupt-urierror.js*                            | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-block-labeled-eval-script-code-target.js*                               | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-block-labeled-file-does-not-exist.js*                                   | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-block-labeled-instn-iee-err-ambiguous-import.js*                        | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-block-labeled-instn-iee-err-circular.js*                                | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-block-labeled-specifier-tostring-abrupt-rejects.js*                     | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/nested-do-while-eval-rqstd-abrupt-typeerror.js*                                | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-do-while-eval-rqstd-abrupt-urierror.js*                                 | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-do-while-eval-script-code-target.js*                                    | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-do-while-file-does-not-exist.js*                                        | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-do-while-instn-iee-err-ambiguous-import.js*                             | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-do-while-instn-iee-err-circular.js*                                     | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-do-while-specifier-tostring-abrupt-rejects.js*                          | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/nested-else-import-catch-eval-rqstd-abrupt-typeerror.js*                       | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-else-import-catch-eval-rqstd-abrupt-urierror.js*                        | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-else-import-catch-eval-script-code-target.js*                           | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-else-import-catch-file-does-not-exist.js*                               | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-else-import-catch-instn-iee-err-ambiguous-import.js*                    | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-else-import-catch-instn-iee-err-circular.js*                            | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-else-import-catch-specifier-tostring-abrupt-rejects.js*                 | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/nested-function-import-catch-eval-rqstd-abrupt-typeerror.js*                   | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-function-import-catch-eval-rqstd-abrupt-urierror.js*                    | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-function-import-catch-eval-script-code-target.js*                       | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-function-import-catch-file-does-not-exist.js*                           | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-function-import-catch-instn-iee-err-ambiguous-import.js*                | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-function-import-catch-instn-iee-err-circular.js*                        | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-function-import-catch-specifier-tostring-abrupt-rejects.js*             | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/nested-if-import-catch-eval-rqstd-abrupt-typeerror.js*                         | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-if-import-catch-eval-rqstd-abrupt-urierror.js*                          | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-if-import-catch-eval-script-code-target.js*                             | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-if-import-catch-file-does-not-exist.js*                                 | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-if-import-catch-instn-iee-err-ambiguous-import.js*                      | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-if-import-catch-instn-iee-err-circular.js*                              | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-if-import-catch-specifier-tostring-abrupt-rejects.js*                   | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/nested-while-import-catch-eval-rqstd-abrupt-typeerror.js*                      | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/nested-while-import-catch-eval-rqstd-abrupt-urierror.js*                       | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/nested-while-import-catch-eval-script-code-target.js*                          | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/nested-while-import-catch-file-does-not-exist.js*                              | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/nested-while-import-catch-instn-iee-err-ambiguous-import.js*                   | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/nested-while-import-catch-instn-iee-err-circular.js*                           | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/nested-while-import-catch-specifier-tostring-abrupt-rejects.js*                | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |
| *catch/top-level-import-catch-eval-rqstd-abrupt-typeerror.js*                         | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the TypeError thrown by the target's only statement; no later evaluation is asserted     |
| *catch/top-level-import-catch-eval-rqstd-abrupt-urierror.js*                          | ADR 0016 | `import-call-promise`   | ContinueDynamicImport forwards the URIError thrown by the target's only statement; no later evaluation is asserted      |
| *catch/top-level-import-catch-eval-script-code-target.js*                             | umbrella | n/a                     | Subject is the host parsing the target with the Module goal (module LexicallyDeclaredNames SyntaxError), not ImportCall |
| *catch/top-level-import-catch-file-does-not-exist.js*                                 | ADR 0016 | `import-call-promise`   | ContinueDynamicImport rejects the promise when the host load fails                                                      |
| *catch/top-level-import-catch-instn-iee-err-ambiguous-import.js*                      | umbrella | n/a                     | Subject is module linking: ambiguous indirect export resolution                                                         |
| *catch/top-level-import-catch-instn-iee-err-circular.js*                              | umbrella | n/a                     | Subject is module linking: circular indirect export resolution                                                          |
| *catch/top-level-import-catch-specifier-tostring-abrupt-rejects.js*                   | ADR 0016 | `import-call-specifier` | EvaluateImportCall ToString(specifier) abrupt completion rejects the returned promise                                   |

### *usage/*

90 candidates: 54 move to ADR 0016, 36 stay with the umbrella.

| Path                                                                                           | Owner    | Assessment              | Reason                                                                                                   |
| ---------------------------------------------------------------------------------------------- | -------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| *usage/nested-arrow-assignment-expression-eval-gtbndng-indirect-update-dflt.js*                | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-arrow-assignment-expression-eval-script-code-host-resolves-module-code.js*       | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-arrow-assignment-expression-is-call-expression-square-brackets.js*               | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-arrow-assignment-expression-returns-thenable.js*                                 | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-arrow-assignment-expression-specifier-tostring.js*                               | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-arrow-import-then-eval-gtbndng-indirect-update-dflt.js*                          | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-arrow-import-then-eval-script-code-host-resolves-module-code.js*                 | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-arrow-import-then-is-call-expression-square-brackets.js*                         | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-arrow-import-then-returns-thenable.js*                                           | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-arrow-import-then-specifier-tostring.js*                                         | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-async-arrow-function-await-eval-gtbndng-indirect-update-dflt.js*                 | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-async-arrow-function-await-eval-script-code-host-resolves-module-code.js*        | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-async-arrow-function-await-is-call-expression-square-brackets.js*                | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-async-arrow-function-await-returns-thenable.js*                                  | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-async-arrow-function-await-specifier-tostring.js*                                | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-async-arrow-function-return-await-eval-gtbndng-indirect-update-dflt.js*          | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-async-arrow-function-return-await-eval-script-code-host-resolves-module-code.js* | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-async-arrow-function-return-await-is-call-expression-square-brackets.js*         | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-async-arrow-function-return-await-returns-thenable.js*                           | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-async-arrow-function-return-await-specifier-tostring.js*                         | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-async-function-await-eval-gtbndng-indirect-update-dflt.js*                       | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-async-function-await-eval-script-code-host-resolves-module-code.js*              | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-async-function-await-is-call-expression-square-brackets.js*                      | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-async-function-await-returns-thenable.js*                                        | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-async-function-await-specifier-tostring.js*                                      | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-async-function-eval-gtbndng-indirect-update-dflt.js*                             | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-async-function-eval-script-code-host-resolves-module-code.js*                    | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-async-function-is-call-expression-square-brackets.js*                            | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-async-function-return-await-eval-gtbndng-indirect-update-dflt.js*                | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-async-function-return-await-eval-script-code-host-resolves-module-code.js*       | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-async-function-return-await-is-call-expression-square-brackets.js*               | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-async-function-return-await-returns-thenable.js*                                 | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-async-function-return-await-specifier-tostring.js*                               | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-async-function-returns-thenable.js*                                              | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-async-function-specifier-tostring.js*                                            | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-async-gen-await-eval-gtbndng-indirect-update-dflt.js*                            | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-async-gen-await-eval-script-code-host-resolves-module-code.js*                   | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-async-gen-await-is-call-expression-square-brackets.js*                           | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-async-gen-await-returns-thenable.js*                                             | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-async-gen-await-specifier-tostring.js*                                           | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-async-gen-return-await-eval-gtbndng-indirect-update-dflt.js*                     | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-async-gen-return-await-eval-script-code-host-resolves-module-code.js*            | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-async-gen-return-await-is-call-expression-square-brackets.js*                    | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-async-gen-return-await-returns-thenable.js*                                      | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-async-gen-return-await-specifier-tostring.js*                                    | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-block-import-then-eval-gtbndng-indirect-update-dflt.js*                          | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-block-import-then-eval-script-code-host-resolves-module-code.js*                 | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-block-import-then-is-call-expression-square-brackets.js*                         | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-block-import-then-returns-thenable.js*                                           | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-block-import-then-specifier-tostring.js*                                         | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-do-while-eval-gtbndng-indirect-update-dflt.js*                                   | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-do-while-eval-script-code-host-resolves-module-code.js*                          | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-do-while-is-call-expression-square-brackets.js*                                  | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-do-while-returns-thenable.js*                                                    | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-do-while-specifier-tostring.js*                                                  | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-else-import-then-eval-gtbndng-indirect-update-dflt.js*                           | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-else-import-then-eval-script-code-host-resolves-module-code.js*                  | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-else-import-then-is-call-expression-square-brackets.js*                          | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-else-import-then-returns-thenable.js*                                            | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-else-import-then-specifier-tostring.js*                                          | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-function-import-then-eval-gtbndng-indirect-update-dflt.js*                       | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-function-import-then-eval-script-code-host-resolves-module-code.js*              | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-function-import-then-is-call-expression-square-brackets.js*                      | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-function-import-then-returns-thenable.js*                                        | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-function-import-then-specifier-tostring.js*                                      | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-if-braceless-eval-gtbndng-indirect-update-dflt.js*                               | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-if-braceless-eval-script-code-host-resolves-module-code.js*                      | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-if-braceless-is-call-expression-square-brackets.js*                              | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-if-braceless-returns-thenable.js*                                                | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-if-braceless-specifier-tostring.js*                                              | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-if-import-then-eval-gtbndng-indirect-update-dflt.js*                             | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-if-import-then-eval-script-code-host-resolves-module-code.js*                    | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-if-import-then-is-call-expression-square-brackets.js*                            | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-if-import-then-returns-thenable.js*                                              | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-if-import-then-specifier-tostring.js*                                            | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/nested-while-import-then-eval-gtbndng-indirect-update-dflt.js*                          | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/nested-while-import-then-eval-script-code-host-resolves-module-code.js*                 | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/nested-while-import-then-is-call-expression-square-brackets.js*                         | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/nested-while-import-then-returns-thenable.js*                                           | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/nested-while-import-then-specifier-tostring.js*                                         | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/syntax-nested-block-labeled-eval-gtbndng-indirect-update-dflt.js*                       | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/syntax-nested-block-labeled-eval-script-code-host-resolves-module-code.js*              | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/syntax-nested-block-labeled-is-call-expression-square-brackets.js*                      | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/syntax-nested-block-labeled-returns-thenable.js*                                        | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/syntax-nested-block-labeled-specifier-tostring.js*                                      | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |
| *usage/top-level-import-then-eval-gtbndng-indirect-update-dflt.js*                             | umbrella | n/a                     | Subject is a live default export binding update observed through the namespace                           |
| *usage/top-level-import-then-eval-script-code-host-resolves-module-code.js*                    | umbrella | n/a                     | Subject is the host loading module code from Script; assertions read namespace exports of that module    |
| *usage/top-level-import-then-is-call-expression-square-brackets.js*                            | ADR 0016 | `import-call-syntax`    | ImportCall is a CallExpression followed by a computed member access to its promise's then                |
| *usage/top-level-import-then-returns-thenable.js*                                              | ADR 0016 | `import-call-promise`   | ImportCall returns a promise fulfilled with the target namespace; one export read identifies it          |
| *usage/top-level-import-then-specifier-tostring.js*                                            | ADR 0016 | `import-call-specifier` | EvaluateImportCall applies ToString to an object specifier; export reads only identify the loaded module |

### *assignment-expression/*

27 candidates: 27 move to ADR 0016, 0 stay with the umbrella.

| Path                                                       | Owner    | Assessment              | Reason                                                                                                                         |
| ---------------------------------------------------------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| *assignment-expression/additive-expr.js*                   | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/array-literal.js*                   | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/arrow-function.js*                  | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/await-expr.js*                      | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/await-identifier.js*                | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/call-expr-arguments.js*             | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/call-expr-expr.js*                  | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/call-expr-identifier.js*            | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/cover-call-expr.js*                 | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/cover-parenthesized-expr.js*        | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/identifier.js*                      | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/lhs-assign-operator-assign-expr.js* | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/lhs-eq-assign-expr-nostrict.js*     | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/lhs-eq-assign-expr.js*              | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/logical-and-expr.js*                | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/logical-or-expr.js*                 | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/member-expr.js*                     | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/new-target.js*                      | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/object-literal.js*                  | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/tagged-function-call.js*            | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/ternary.js*                         | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/this.js*                            | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/unary-expr.js*                      | ADR 0016 | `import-call-syntax`    | ImportCall accepts UnaryExpression arguments; the returned promises are discarded and nothing is asserted                      |
| *assignment-expression/yield-assign-expr.js*               | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/yield-expr.js*                      | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/yield-identifier.js*                | ADR 0016 | `import-call-specifier` | EvaluateImportCall evaluates this AssignmentExpression form and applies ToString; export reads only identify the loaded module |
| *assignment-expression/yield-star.js*                      | ADR 0016 | `import-call-syntax`    | ImportCall accepts a yield \* argument inside a generator that is never called; only the parse is asserted                     |

### Files directly in the directory

26 candidates: 7 move to ADR 0016, 19 stay with the umbrella.

| Path                                           | Owner    | Assessment              | Reason                                                                                                      |
| ---------------------------------------------- | -------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| *always-create-new-promise.js*                 | ADR 0016 | `import-call-promise`   | Each ImportCall evaluation returns a new %Promise% instance                                                 |
| *assign-expr-get-value-abrupt-throws.js*       | ADR 0016 | `import-call-specifier` | EvaluateImportCall propagates an abrupt GetValue of its argument synchronously                              |
| *await-import-evaluation.js*                   | ADR 0016 | `import-call-promise`   | ContinueDynamicImport fulfills only after the target's Evaluate promise settles                             |
| *custom-primitive.js*                          | umbrella | n/a                     | Subject is namespace object ToPrimitive through exported toString/valueOf with a null prototype             |
| *eval-export-dflt-cls-anon.js*                 | umbrella | n/a                     | Subject is export default evaluation and naming in module code (sec-moduleevaluation)                       |
| *eval-export-dflt-cls-name-meth.js*            | umbrella | n/a                     | Subject is export default evaluation and naming in module code (sec-moduleevaluation)                       |
| *eval-export-dflt-cls-named.js*                | umbrella | n/a                     | Subject is export default evaluation and naming in module code (sec-moduleevaluation)                       |
| *eval-export-dflt-expr-cls-anon.js*            | umbrella | n/a                     | Subject is export default evaluation and naming in module code (sec-moduleevaluation)                       |
| *eval-export-dflt-expr-cls-name-meth.js*       | umbrella | n/a                     | Subject is export default evaluation and naming in module code (sec-moduleevaluation)                       |
| *eval-export-dflt-expr-cls-named.js*           | umbrella | n/a                     | Subject is export default evaluation and naming in module code (sec-moduleevaluation)                       |
| *eval-export-dflt-expr-fn-anon.js*             | umbrella | n/a                     | Subject is export default evaluation and naming in module code (sec-moduleevaluation)                       |
| *eval-export-dflt-expr-fn-named.js*            | umbrella | n/a                     | Subject is export default evaluation and naming in module code (sec-moduleevaluation)                       |
| *eval-export-dflt-expr-gen-anon.js*            | umbrella | n/a                     | Subject is export default evaluation and naming in module code (sec-moduleevaluation)                       |
| *eval-export-dflt-expr-gen-named.js*           | umbrella | n/a                     | Subject is export default evaluation and naming in module code (sec-moduleevaluation)                       |
| *eval-export-dflt-expr-in.js*                  | umbrella | n/a                     | Subject is export default evaluation and naming in module code (sec-moduleevaluation)                       |
| *for-await-resolution-and-error-agen-yield.js* | ADR 0016 | `import-call-promise`   | ImportCall promises fulfill or reject as above, yielded with and without await                              |
| *for-await-resolution-and-error-agen.js*       | ADR 0016 | `import-call-promise`   | ImportCall promises fulfill or reject as above, yielded through an async generator                          |
| *for-await-resolution-and-error.js*            | ADR 0016 | `import-call-promise`   | ImportCall promises fulfill with namespaces or reject with the target's thrown value, consumed by for await |
| *import-errored-module.js*                     | umbrella | n/a                     | Subject is Module Evaluate reusing `[[TopLevelCapability]]` for an errored module                           |
| *import-fulfilled-member-of-errored-cycle.js*  | umbrella | n/a                     | Subject is top-level-await cycle evaluation error recording (`[[CycleRoot]]`, `[[EvaluationError]]`)        |
| *imported-self-update.js*                      | umbrella | n/a                     | Subject is live namespace binding updates of a self-imported module                                         |
| *indirect-resolution.js*                       | ADR 0016 | `import-call-promise`   | An ImportCall in module code returns a promise that resolves to the second target's namespace               |
| *reuse-namespace-object-from-import.js*        | umbrella | n/a                     | Subject is module namespace object identity shared with a static import                                     |
| *reuse-namespace-object-from-script.js*        | umbrella | n/a                     | Subject is module namespace object identity across Script imports                                           |
| *reuse-namespace-object.js*                    | umbrella | n/a                     | Subject is module namespace object identity across imports                                                  |
| *update-to-dynamic-import.js*                  | umbrella | n/a                     | Subject is module evaluation order: the second module evaluates only after its import() call                |
