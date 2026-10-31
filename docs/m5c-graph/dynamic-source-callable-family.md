Ordinary callable dynamic source subjects
=========================================

This record backs the M5c graph node `dynamic-source-callable-family` (DS-4).
The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*) approves splitting
`dynamic-source-coverage-remediation` into DS-1 through DS-7 and keeps it as an
umbrella that lands when it owns zero paths.

This node audits exactly the 86 paths below at test262 revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`. At base `8f420262` every path
belongs to `node:dynamic-source-coverage-remediation` in the derived closure
ledger. This audit assigns 40 to `adr:0016-dynamic-source-boundary` and
keeps 46 with that umbrella. The path set,
sorted with one final newline, has SHA256
`bd0fdcc24e468e5b193a54ccaab408b58a93af1cf042ba2cdd77539d4ea108a4`.

Selection rule: the audit families of
*/data/m5c-dynamic-source-265-audit-20261024/group-counts.json* named below,
plus the later umbrella additions that audit did not group, placed by the
missing contracts their batch notes record.


Audit result
------------

The [*per-path assessment*](./dynamic-source-callable-family-assessment.md)
names the normative subject, disposition, replacement witnesses, and reason
for each of the 86 paths. Existing reviewed static passes cover every
non-source assertion for 40 paths: inherited call/apply on non-callable
objects (2), sloppy global-this substitution (16), call/apply
non-constructibility (4), call length (1), ordinary callable sealing (2),
primitive OrdinaryHasInstance operands (8), invalid callable prototypes (2),
positive prototype-chain lookup (1), and accessor descriptors (4).

The other 46 paths retain their unsupported classification and umbrella
owner because complete replacement evidence was not established. This
includes the successful returned-function constructions whose descriptions
incorrectly suggest call/apply non-constructibility. No native evidence was
added. The exclusion audit recomputes all 86 original source and observation
digests, which match the recorded values, and binds the replacement table
and passing result partitions. Only source evaluation remains for the 40
exclusion rows under decision item 1. Changed evidence or an accepted
ADR 0016 amendment admitting the excluded source form reopens them;
ADR 0019's non-source dependence trigger remains in force.

The umbrella decreases from 881 to 841 paths; ADR 0016 increases from 584
to 624. All 41,091 inventory paths remain. No subset, result, dependency
tag, ADR, or product behavior changes, so no UPDATE is needed. This
partial accounting does not land this node or the umbrella; Root owns
publication and the remaining remediation schedule.


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

### Ordinary callables and call/apply (76)

Audit family “Ordinary callables, call/apply, instanceof, descriptors, seal and
array-like inputs”, work groups `ordinary-call-apply-contracts`,
`ordinary-has-instance`, `ordinary-callable-value-brand`,
`ordinary-function-descriptors`, `seal-static-callables`,
`reflect-apply-function-array-like`.

| Path                                                                                  |
| ------------------------------------------------------------------------------------- |
| *test/built-ins/Boolean/S9.2\_A6\_T1.js*                                              |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A1\_T1.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A3\_T1.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A3\_T10.js*                       |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A3\_T2.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A3\_T3.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A3\_T4.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A3\_T5.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A3\_T7.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A3\_T9.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A5\_T1.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A5\_T2.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A5\_T7.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A5\_T8.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A7\_T1.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A7\_T10.js*                       |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A7\_T2.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A7\_T3.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A7\_T4.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A7\_T5.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A7\_T6.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A7\_T7.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A7\_T8.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A7\_T9.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A8\_T4.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A8\_T5.js*                        |
| *test/built-ins/Function/prototype/apply/S15.3.4.3\_A8\_T6.js*                        |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A1\_T1.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A2\_T2.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A3\_T1.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A3\_T10.js*                        |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A3\_T2.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A3\_T3.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A3\_T4.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A3\_T5.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A3\_T7.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A3\_T9.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A5\_T1.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A5\_T2.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A5\_T7.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A5\_T8.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A6\_T1.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A6\_T10.js*                        |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A6\_T2.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A6\_T3.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A6\_T4.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A6\_T5.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A6\_T6.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A6\_T7.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A6\_T8.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A6\_T9.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A7\_T4.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A7\_T5.js*                         |
| *test/built-ins/Function/prototype/call/S15.3.4.4\_A7\_T6.js*                         |
| *test/built-ins/Object/getOwnPropertyDescriptor/15.2.3.3-4-187.js*                    |
| *test/built-ins/Object/getOwnPropertyDescriptor/15.2.3.3-4-188.js*                    |
| *test/built-ins/Object/prototype/toString/Object.prototype.toString.call-function.js* |
| *test/built-ins/Object/seal/seal-arrowfunction.js*                                    |
| *test/built-ins/Object/seal/seal-asyncgeneratorfunction.js*                           |
| *test/built-ins/Object/seal/seal-function.js*                                         |
| *test/built-ins/Object/seal/seal-generatorfunction.js*                                |
| *test/built-ins/Reflect/apply/arguments-list-is-not-array-like-but-still-valid.js*    |
| *test/language/expressions/instanceof/S11.8.6\_A7\_T3.js*                             |
| *test/language/expressions/instanceof/S15.3.5.3\_A1\_T1.js*                           |
| *test/language/expressions/instanceof/S15.3.5.3\_A1\_T2.js*                           |
| *test/language/expressions/instanceof/S15.3.5.3\_A1\_T3.js*                           |
| *test/language/expressions/instanceof/S15.3.5.3\_A1\_T4.js*                           |
| *test/language/expressions/instanceof/S15.3.5.3\_A1\_T5.js*                           |
| *test/language/expressions/instanceof/S15.3.5.3\_A1\_T6.js*                           |
| *test/language/expressions/instanceof/S15.3.5.3\_A1\_T7.js*                           |
| *test/language/expressions/instanceof/S15.3.5.3\_A1\_T8.js*                           |
| *test/language/expressions/instanceof/S15.3.5.3\_A2\_T2.js*                           |
| *test/language/expressions/instanceof/S15.3.5.3\_A2\_T5.js*                           |
| *test/language/expressions/instanceof/S15.3.5.3\_A2\_T6.js*                           |
| *test/language/expressions/instanceof/S15.3.5.3\_A3\_T1.js*                           |
| *test/language/expressions/instanceof/S15.3.5.3\_A3\_T2.js*                           |

### Function subclass construction (1)

Audit family “Function subclass construction”, work groups
`Function-subclass-heritage`.

| Path                                                                     |
| ------------------------------------------------------------------------ |
| *test/language/expressions/class/subclass-builtins/subclass-Function.js* |

### Batch 15 object-literal subjects (8)

Batch 15 object-literal getter, setter, descriptor, and duplicate-property
subjects.

| Path                                                  |
| ----------------------------------------------------- |
| *test/language/expressions/object/11.1.5-0-1.js*      |
| *test/language/expressions/object/11.1.5-0-2.js*      |
| *test/language/expressions/object/11.1.5\_4-4-a-3.js* |
| *test/language/expressions/object/11.1.5\_4-4-b-1.js* |
| *test/language/expressions/object/11.1.5\_6-3-1.js*   |
| *test/language/expressions/object/11.1.5\_6-3-2.js*   |
| *test/language/expressions/object/11.1.5\_7-3-1.js*   |
| *test/language/expressions/object/11.1.5\_7-3-2.js*   |

### Batch 16 `mixed-typeof-callability` (1)

| Path                                              |
| ------------------------------------------------- |
| *test/language/expressions/typeof/native-call.js* |
