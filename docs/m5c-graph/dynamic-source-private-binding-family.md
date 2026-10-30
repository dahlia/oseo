Private class and binding dynamic source subjects
=================================================

This record backs the M5c graph node `dynamic-source-private-binding-family`
(DS-6). The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*) approves splitting
`dynamic-source-coverage-remediation` into DS-1 through DS-7 and keeps it as an
umbrella that lands when it owns zero paths.

This node assesses exactly the 66 paths below at test262 revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`. At base `1f3ade13`, all
66 were `unsupported-profile-feature` paths owned by
`node:dynamic-source-coverage-remediation` in the derived closure ledger.
The sorted path set, with one final newline, has SHA256
`d698889cd5c0a48322a434125b9986ae6ca1cfd383f48736be2abf0e93dd5352`.

DS-6 accounts for 42 paths under `adr:0016-dynamic-source-boundary`
using item 1 of the maintainer decision. The other 24 stay with the
umbrella as active remediation. Classification remains
`unsupported-profile-feature` for all 66; no path counts as a pass.
No native tests or fixtures are added, and all 41,091 inventory paths
remain. The subset and observations are unchanged; no UPDATE is needed.

The [*per-path assessment*](./dynamic-source-private-binding-assessment.yaml)
records each original's normative subject, source digest, disposition,
replacement path and one-line coverage reason. Its 20 distinct static
replacement paths already pass on linux-x86\_64-gnu in every listed
strictness/specialization variant. It binds their pinned source and result
partition digests. The exclusion audit independently binds all originals'
fresh source and observation digests and the replacement table/partitions.
For a remediation row, “no complete replacement is established” records a
remaining evidence gap; it does not assert that no related test exists.

| Family                                                          | Assessed | Closed under ADR 0016 | Staying | Evidence added |
| --------------------------------------------------------------- | -------: | --------------------: | ------: | -------------: |
| Private class identity, public lookup, static initializer this  |       24 |                    21 |       3 |              0 |
| Named self bindings, arrows, compound assignment, call ordering |       22 |                     9 |      13 |              0 |
| Direct-eval arguments and spread                                |        6 |                     0 |       6 |              0 |
| Batch 16 and 17 static this and call context                    |       14 |                    12 |       2 |              0 |
| Total                                                           |       66 |                    42 |      24 |              0 |

The 21 private identity closures use factory expressions that evaluate the
same static class twice, observe own getter/method/field access or setter
side effects, and reject both cross-brand accesses with TypeError. The eight
named-binding replacements keep the original strictness, self identity or
TypeError, invocation count, and async/generator observation. The static
call-order replacement observes the argument side effect and TypeError.
The 12 caller/callee replacements observe callee strictness independently
of caller strictness. Their original eval/Function caller supplies only
source evaluation to that receiver contract.

The remaining subjects are private initialization/public lookup (2), static
initializer this (1), arrow capture (4), unresolvable compound assignment
ReferenceErrors (9), direct-eval argument/spread dispatch (6), and mixed
ordinary/eval global this or construction (2). A compiler rejection cannot
replace a catchable ReferenceError, and no-argument eval dispatch does not
have a source-evaluation-only remainder. Their original assertions remain
in-claim; ADR 0016 and ADR 0019 are unchanged.

Root approved supplying changed owners in memory through
`parseM5cClosureLedger`, `deriveM5cClosureLedger`, and
`serializeM5cClosureLedger`. The script is
*/data/m5c-ds6-20261031/update-accounting.mjs*. It verifies all 66 original
audit digests, changes only the 42 closure owners and the two affected owner
notes, and serializes the derived ledger. Then
`mise run m5c:closure-ledger:update` verifies regeneration is a no-op.
The umbrella owns 1,004 paths after this change, down from 1,046 at the base;
ADR 0016 owns 626, up from 584. Root owns outer review and publication.

Validation: `mise run check` and the dedicated
`mise run check:m5c-closure-ledger` pass. `node --test tests/m5c-*.test.ts`
passes all 105 tests both before and after the change. The consistency script
*/data/m5c-ds6-20261031/verify.mjs* verifies the selector, all original source
and replacement source/result digests, every listed variant, and exactly 42
owner changes with all inventory states and dependency tags unchanged.
Regenerating the ledger preserves its SHA256 exactly. No UPDATE or additional
native suite is required for this accounting-only change; Root retains the
normal exact-candidate publication gates.

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


Assessed paths
--------------

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
