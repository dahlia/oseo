Private class and binding dynamic source subjects
=================================================

This record backs the M5c graph node `dynamic-source-private-binding-family`
(DS-6). The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*) approves splitting
`dynamic-source-coverage-remediation` into DS-1 through DS-7 and keeps it as an
umbrella that lands when it owns zero paths.

This node owns exactly the 66 paths below at test262 revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`. Every one is currently owned by
`node:dynamic-source-coverage-remediation` in the derived closure ledger,
and it stays there until this node lands; the landing moves each path to
its reviewed owner. This change moves no ledger ownership. The path set,
sorted with one final newline, has SHA256
`d698889cd5c0a48322a434125b9986ae6ca1cfd383f48736be2abf0e93dd5352`.

Selection rule: the audit families of
*/data/m5c-dynamic-source-265-audit-20261024/group-counts.json* named below,
plus the later umbrella additions that audit did not group, placed by the
missing contracts their batch notes record.


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

### Private class identity, public lookup and static initializer this (24)

Audit family “Private class identity, public lookup and static initializer
this”, work groups `repeated-private-class-evaluations`,
`private-field-public-property`, `static-initializer-this`.

| Path                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------ |
| *test/language/expressions/class/elements/nested-private-direct-eval-err-contains-newtarget.js*                    |
| *test/language/expressions/class/elements/private-direct-eval-err-contains-newtarget.js*                           |
| *test/language/expressions/class/elements/static-field-init-with-this.js*                                          |
| *test/language/expressions/class/private-getter-brand-check-multiple-evaluations-of-class-eval-indirect.js*        |
| *test/language/expressions/class/private-getter-brand-check-multiple-evaluations-of-class-eval.js*                 |
| *test/language/expressions/class/private-getter-brand-check-multiple-evaluations-of-class-function-ctor.js*        |
| *test/language/expressions/class/private-method-brand-check-multiple-evaluations-of-class-eval-indirect.js*        |
| *test/language/expressions/class/private-method-brand-check-multiple-evaluations-of-class-eval.js*                 |
| *test/language/expressions/class/private-method-brand-check-multiple-evaluations-of-class-function-ctor.js*        |
| *test/language/expressions/class/private-setter-brand-check-multiple-evaluations-of-class-eval-indirect.js*        |
| *test/language/expressions/class/private-setter-brand-check-multiple-evaluations-of-class-eval.js*                 |
| *test/language/expressions/class/private-setter-brand-check-multiple-evaluations-of-class-function-ctor.js*        |
| *test/language/expressions/class/private-static-field-multiple-evaluations-of-class-direct-eval.js*                |
| *test/language/expressions/class/private-static-field-multiple-evaluations-of-class-eval-indirect.js*              |
| *test/language/expressions/class/private-static-field-multiple-evaluations-of-class-function-ctor.js*              |
| *test/language/expressions/class/private-static-getter-multiple-evaluations-of-class-direct-eval.js*               |
| *test/language/expressions/class/private-static-getter-multiple-evaluations-of-class-eval-indirect.js*             |
| *test/language/expressions/class/private-static-getter-multiple-evaluations-of-class-function-ctor.js*             |
| *test/language/expressions/class/private-static-method-brand-check-multiple-evaluations-of-class-direct-eval.js*   |
| *test/language/expressions/class/private-static-method-brand-check-multiple-evaluations-of-class-eval-indirect.js* |
| *test/language/expressions/class/private-static-method-brand-check-multiple-evaluations-of-class-function-ctor.js* |
| *test/language/expressions/class/private-static-setter-multiple-evaluations-of-class-direct-eval.js*               |
| *test/language/expressions/class/private-static-setter-multiple-evaluations-of-class-eval-indirect.js*             |
| *test/language/expressions/class/private-static-setter-multiple-evaluations-of-class-function-ctor.js*             |

### Named self bindings and call ordering (22)

Audit family “Named self bindings, arrows, unresolved compound assignment and
call ordering”, work groups `named-function-immutable-binding`,
`arrow-this-and-outer-capture`, `compound-unresolvable-reference`,
`call-arguments-before-callability`.

| Path                                                                                               |
| -------------------------------------------------------------------------------------------------- |
| *test/language/expressions/arrow-function/arrow/binding-tests-1.js*                                |
| *test/language/expressions/arrow-function/arrow/binding-tests-2.js*                                |
| *test/language/expressions/arrow-function/arrow/binding-tests-3.js*                                |
| *test/language/expressions/arrow-function/arrow/capturing-closure-variables-1.js*                  |
| *test/language/expressions/async-function/named-reassign-fn-name-in-body-in-eval.js*               |
| *test/language/expressions/async-function/named-strict-error-reassign-fn-name-in-body-in-eval.js*  |
| *test/language/expressions/async-generator/named-no-strict-reassign-fn-name-in-body-in-eval.js*    |
| *test/language/expressions/async-generator/named-strict-error-reassign-fn-name-in-body-in-eval.js* |
| *test/language/expressions/call/11.2.3-3\_5.js*                                                    |
| *test/language/expressions/compound-assignment/11.13.2-1-s.js*                                     |
| *test/language/expressions/compound-assignment/11.13.2-10-s.js*                                    |
| *test/language/expressions/compound-assignment/11.13.2-11-s.js*                                    |
| *test/language/expressions/compound-assignment/11.13.2-2-s.js*                                     |
| *test/language/expressions/compound-assignment/11.13.2-4-s.js*                                     |
| *test/language/expressions/compound-assignment/11.13.2-5-s.js*                                     |
| *test/language/expressions/compound-assignment/11.13.2-6-s.js*                                     |
| *test/language/expressions/compound-assignment/11.13.2-8-s.js*                                     |
| *test/language/expressions/compound-assignment/11.13.2-9-s.js*                                     |
| *test/language/expressions/function/named-no-strict-reassign-fn-name-in-body-in-eval.js*           |
| *test/language/expressions/function/named-strict-error-reassign-fn-name-in-body-in-eval.js*        |
| *test/language/expressions/generators/named-no-strict-reassign-fn-name-in-body-in-eval.js*         |
| *test/language/expressions/generators/named-strict-error-reassign-fn-name-in-body-in-eval.js*      |

### Direct-eval arguments and spread (6)

Audit family “Direct-eval arguments and spread”, work groups
`direct-eval-argument-and-spread-interaction`.

| Path                                                           |
| -------------------------------------------------------------- |
| *test/language/expressions/call/eval-err-args.js*              |
| *test/language/expressions/call/eval-no-args.js*               |
| *test/language/expressions/call/eval-spread-empty-leading.js*  |
| *test/language/expressions/call/eval-spread-empty-trailing.js* |
| *test/language/expressions/call/eval-spread-empty.js*          |
| *test/language/expressions/call/eval-spread.js*                |

### Batch 16 and batch 17 `static-this-and-call-context` (14)

| Path                                              |
| ------------------------------------------------- |
| *test/language/expressions/this/S11.1.1\_A3.1.js* |
| *test/language/expressions/this/S11.1.1\_A3.2.js* |
| *test/language/function-code/10.4.3-1-63-s.js*    |
| *test/language/function-code/10.4.3-1-63gs.js*    |
| *test/language/function-code/10.4.3-1-64-s.js*    |
| *test/language/function-code/10.4.3-1-64gs.js*    |
| *test/language/function-code/10.4.3-1-65-s.js*    |
| *test/language/function-code/10.4.3-1-65gs.js*    |
| *test/language/function-code/10.4.3-1-82-s.js*    |
| *test/language/function-code/10.4.3-1-82gs.js*    |
| *test/language/function-code/10.4.3-1-83-s.js*    |
| *test/language/function-code/10.4.3-1-83gs.js*    |
| *test/language/function-code/10.4.3-1-84-s.js*    |
| *test/language/function-code/10.4.3-1-84gs.js*    |
