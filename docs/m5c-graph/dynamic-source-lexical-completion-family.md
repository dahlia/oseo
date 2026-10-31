Lexical, completion, and variable environment subjects
======================================================

This record backs the M5c graph node `dynamic-source-lexical-completion-family`
(DS-5). The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*) approves splitting
`dynamic-source-coverage-remediation` into DS-1 through DS-7 and keeps it as an
umbrella that lands when it owns zero paths.

This node selects exactly the 73 original umbrella paths below at test262
revision `f2d1435644797268dca1f7988cad5a4e89ccd8d2`. The per-path assessment
closes two under `adr:0016-dynamic-source-boundary` and keeps 71 with
`node:dynamic-source-coverage-remediation` in the derived closure ledger. All
73 retain `unsupported-profile-feature`; none counts as a pass. The path set,
sorted with one final newline, has SHA256
`1f540200bd7b2e1a109da611f0762bf5383c14ae38d4eb11c50fb1ae83f617ee`.

Selection rule: the audit families of
*/data/m5c-dynamic-source-265-audit-20261024/group-counts.json* named below,
plus the later umbrella additions that audit did not group, placed by the
missing contracts their batch notes record.


Assessment outcome
------------------

The [*per-path assessment*](./dynamic-source-lexical-completion-assessment.yaml)
records all 73 normative subjects, replacement candidates, dispositions and
reasons. Two U+180E probes close under item 1 of the maintainer decision:
the single-line comment and template-literal probes have paired reviewed
static passes in all four strictness/specialization variants on
linux-x86\_64-gnu. The assessment binds their pinned source digests and result
partitions, and `ds5-static-u180e` binds those partitions in the exclusion
audit. All 73 original source and normalized observation digests were
recomputed and match the audit.

71 paths stay with the umbrella. These include full whitespace and BMP
comment matrices, declaration and statement completion values, binding
introduction and retained References, and the global declaration collision.
Three strict early-error probes have related static expected-negatives;
this task requires an existing reviewed passing path or fixture/native
replacement, so this assessment does not treat those negatives as complete
replacement evidence for the caught-error assertions.

No native or fixture evidence was added. The subset, result partitions,
dependency tags and all 41,091 inventory paths remain unchanged; no UPDATE
is needed. The dependency-tag self-audit found no changed rows to retag.
ADR 0016 and ADR 0019 remain unchanged, including their reopening triggers.
This is partial accounting; Root retains outer review, publication and the
landed-state decision.


Evidence obligations
--------------------

 -  For each path, review ahead-of-time observation or replacement evidence
    for every non-source subject. Preserve every original path and
    assertion.
 -  A path closes under `adr:0016-dynamic-source-boundary` only by item 1 of
    the decision: reviewed replacement evidence covers every non-source
    subject and only source evaluation remains. Its exclusion-audit record
    has fresh source and observation digests, names the replacement paths
    and observations, and shows that no non-source subject remains.
 -  A path whose non-source subjects are not all covered stays in
    remediation under this node or the umbrella.
 -  Never count a path as a pass, emulate eval or source construction,
    remove an assertion, or widen ADR 0016. ADR 0016 and ADR 0019 stay
    unchanged, and all 41,091 inventory paths remain.
 -  Split review scopes by subdirectory where a diff is large.


Owned paths
-----------

### Lexical grammar and ordinary strict early errors (23)

Audit family “Lexical grammar and ordinary strict early errors”, work groups
`lexical-whitespace-expression-probes`, `comment-code-unit-matrix`,
`strict-binding-early-errors`.

| Path                                                              |
| ----------------------------------------------------------------- |
| *test/language/arguments-object/10.5-1-s.js*                      |
| *test/language/comments/S7.4\_A5.js*                              |
| *test/language/comments/S7.4\_A6.js*                              |
| *test/language/comments/mongolian-vowel-separator-single-eval.js* |
| *test/language/expressions/addition/S11.6.1\_A1.js*               |
| *test/language/expressions/bitwise-and/S11.10.1\_A1.js*           |
| *test/language/expressions/bitwise-not/S11.4.8\_A1.js*            |
| *test/language/expressions/bitwise-or/S11.10.3\_A1.js*            |
| *test/language/expressions/bitwise-xor/S11.10.2\_A1.js*           |
| *test/language/expressions/call/S11.2.3\_A1.js*                   |
| *test/language/expressions/comma/S11.14\_A1.js*                   |
| *test/language/expressions/conditional/S11.12\_A1.js*             |
| *test/language/expressions/division/S11.5.2\_A1.js*               |
| *test/language/expressions/does-not-equals/S11.9.2\_A1.js*        |
| *test/language/expressions/equals/S11.9.1\_A1.js*                 |
| *test/language/expressions/function/name-eval-stricteval.js*      |
| *test/language/expressions/function/param-eval-stricteval.js*     |
| *test/language/expressions/greater-than-or-equal/S11.8.4\_A1.js*  |
| *test/language/expressions/greater-than/S11.8.2\_A1.js*           |
| *test/language/expressions/grouping/S11.1.6\_A1.js*               |
| *test/language/expressions/in/S11.8.7\_A1.js*                     |
| *test/language/expressions/instanceof/S11.8.6\_A1.js*             |
| *test/language/expressions/typeof/syntax.js*                      |

### Completion values and declaration-completion inputs (20)

Audit family “Completion values and declaration-completion inputs”, work groups
`completion-record-values`, `undefined-input-via-var-completion`.

| Path                                                                 |
| -------------------------------------------------------------------- |
| *test/built-ins/Boolean/S9.2\_A1\_T1.js*                             |
| *test/built-ins/String/S9.8\_A1\_T1.js*                              |
| *test/built-ins/undefined/S15.1.1.3\_A1.js*                          |
| *test/language/expressions/concatenation/S9.8\_A1\_T2.js*            |
| *test/language/expressions/division/no-magic-asi-from-block-eval.js* |
| *test/language/expressions/does-not-equals/S11.9.2\_A6.1.js*         |
| *test/language/expressions/equals/S11.9.1\_A6.1.js*                  |
| *test/language/statements/do-while/cptn-normal.js*                   |
| *test/language/statements/for-in/S12.6.4\_A3.1.js*                   |
| *test/language/statements/for-in/S12.6.4\_A3.js*                     |
| *test/language/statements/for-in/S12.6.4\_A4.1.js*                   |
| *test/language/statements/for-in/S12.6.4\_A4.js*                     |
| *test/language/statements/for-in/cptn-decl-abrupt-empty.js*          |
| *test/language/statements/for-in/cptn-decl-itr.js*                   |
| *test/language/statements/for-in/cptn-decl-skip-itr.js*              |
| *test/language/statements/for-in/cptn-decl-zero-itr.js*              |
| *test/language/statements/for-in/cptn-expr-abrupt-empty.js*          |
| *test/language/statements/for-in/cptn-expr-itr.js*                   |
| *test/language/statements/for-in/cptn-expr-skip-itr.js*              |
| *test/language/statements/for-in/cptn-expr-zero-itr.js*              |

### Variable environment and RHS binding introduction (13)

Audit family “Variable environment and RHS binding introduction”, work groups
`retained-variable-environments`, `compound-reference-retained-during-RHS`.

| Path                                                                   |
| ---------------------------------------------------------------------- |
| *test/language/expressions/compound-assignment/S11.13.2\_A6.10\_T1.js* |
| *test/language/expressions/compound-assignment/S11.13.2\_A6.11\_T1.js* |
| *test/language/expressions/compound-assignment/S11.13.2\_A6.1\_T1.js*  |
| *test/language/expressions/compound-assignment/S11.13.2\_A6.2\_T1.js*  |
| *test/language/expressions/compound-assignment/S11.13.2\_A6.3\_T1.js*  |
| *test/language/expressions/compound-assignment/S11.13.2\_A6.4\_T1.js*  |
| *test/language/expressions/compound-assignment/S11.13.2\_A6.5\_T1.js*  |
| *test/language/expressions/compound-assignment/S11.13.2\_A6.6\_T1.js*  |
| *test/language/expressions/compound-assignment/S11.13.2\_A6.7\_T1.js*  |
| *test/language/expressions/compound-assignment/S11.13.2\_A6.8\_T1.js*  |
| *test/language/expressions/compound-assignment/S11.13.2\_A6.9\_T1.js*  |
| *test/language/statements/for-in/scope-head-var-none.js*               |
| *test/language/statements/try/scope-catch-param-var-none.js*           |

### Batch 16 `fixture-construction` whitespace and line-terminator probes (11)

| Path                                                                           |
| ------------------------------------------------------------------------------ |
| *test/language/expressions/property-accessors/S11.2.1\_A1.1.js*                |
| *test/language/expressions/property-accessors/S11.2.1\_A1.2.js*                |
| *test/language/expressions/right-shift/S11.7.2\_A1.js*                         |
| *test/language/expressions/strict-does-not-equals/S11.9.5\_A1.js*              |
| *test/language/expressions/strict-equals/S11.9.4\_A1.js*                       |
| *test/language/expressions/subtraction/S11.6.2\_A1.js*                         |
| *test/language/expressions/template-literal/mongolian-vowel-separator-eval.js* |
| *test/language/expressions/unary-minus/S11.4.7\_A1.js*                         |
| *test/language/expressions/unary-plus/S11.4.6\_A1.js*                          |
| *test/language/expressions/unsigned-right-shift/S11.7.3\_A1.js*                |
| *test/language/expressions/void/S11.4.2\_A1.js*                                |

### Batch 16 `completion-observation` (3)

| Path                                                                |
| ------------------------------------------------------------------- |
| *test/language/expressions/strict-does-not-equals/S11.9.5\_A6.1.js* |
| *test/language/expressions/strict-equals/S11.9.4\_A6.1.js*          |
| *test/language/expressions/unary-plus/S9.3\_A1\_T2.js*              |

### Batch 17 `parameter-expression-variable-environment` (2)

| Path                                                                  |
| --------------------------------------------------------------------- |
| *test/language/function-code/eval-param-env-with-computed-key.js*     |
| *test/language/function-code/eval-param-env-with-prop-initializer.js* |

### Host Full global lexical and var declaration collision (1)

| Path                                                                 |
| -------------------------------------------------------------------- |
| *test/language/global-code/script-decl-lex-var-declared-via-eval.js* |
