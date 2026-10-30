Realm, string, and intrinsic dynamic source subjects
====================================================

This record backs the M5c graph node `dynamic-source-realm-string-family`
(DS-7). The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*) approves splitting
`dynamic-source-coverage-remediation` into DS-1 through DS-7 and keeps it as an
umbrella that lands when it owns zero paths.

This node owns exactly the 80 paths below at test262 revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`. At base main
`1f3ade13`, all 80 are unsupported umbrella paths in the derived ledger.
The per-path assessment below prepares 9 ADR 0016 owners and retains 71
umbrella owners; this node remains unlanded. The path set,
sorted with one final newline, has SHA256
`e0822eea02a0a34eef63da1fe738fe0a8e13c5be2094b3d937c2a7c92c33e87e`.

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


Per-path review result
----------------------

The [per-path assessment](./dynamic-source-realm-string-assessment.md)
records each original normative subject, selected evidence or remaining gap,
and its decision. Nine paths close under the 2026-10-28 decision, item 1:
four template-site paths, four ASCII string case-conversion paths, and one
mixed generator-instance path.
Their audit records bind fresh source and observation digests and name the
existing passing static paths or native fixtures. No evidence was added.

The other 71 paths stay with the umbrella: all 34 foreign-realm subjects,
the realm template registry path, the same-site template identity path
whose substitution values change between calls, seven RegExp paths, 23
string/global/block paths, and five intrinsic/mixed-function paths. Their table
rows name the uncovered assertions in the candidates inspected. The umbrella
now owns 1,037 paths on this base, before parallel DS-4 through DS-6
integration (451 of the historical 765-path cohort and 586 later admissions).
All 80 classifications remain unsupported-profile-feature; all 41,091 inventory
paths remain. No subset, result, tag or runtime change was made, so no UPDATE
is needed. No native tests were added; Root retains the full publication suites
and outer review.


Owned paths
-----------

### Foreign-realm callables and constructors (34)

Audit family “Foreign-realm callables and constructors”, work groups
`foreign-realm-callables-and-constructors`.

| Path                                                                              |
| --------------------------------------------------------------------------------- |
| *test/built-ins/Array/from/proto-from-ctor-realm.js*                              |
| *test/built-ins/Array/of/proto-from-ctor-realm.js*                                |
| *test/built-ins/Array/proto-from-ctor-realm-one.js*                               |
| *test/built-ins/Array/proto-from-ctor-realm-two.js*                               |
| *test/built-ins/Array/proto-from-ctor-realm-zero.js*                              |
| *test/built-ins/ArrayBuffer/proto-from-ctor-realm.js*                             |
| *test/built-ins/Boolean/proto-from-ctor-realm.js*                                 |
| *test/built-ins/DataView/proto-from-ctor-realm-sab.js*                            |
| *test/built-ins/DataView/proto-from-ctor-realm.js*                                |
| *test/built-ins/Date/proto-from-ctor-realm-one.js*                                |
| *test/built-ins/Date/proto-from-ctor-realm-two.js*                                |
| *test/built-ins/Date/proto-from-ctor-realm-zero.js*                               |
| *test/built-ins/FinalizationRegistry/proto-from-ctor-realm.js*                    |
| *test/built-ins/Function/internals/Call/class-ctor-realm.js*                      |
| *test/built-ins/Function/internals/Construct/derived-return-val-realm.js*         |
| *test/built-ins/Function/internals/Construct/derived-this-uninitialized-realm.js* |
| *test/built-ins/Function/prototype/apply/argarray-not-object-realm.js*            |
| *test/built-ins/Function/prototype/bind/get-fn-realm-recursive.js*                |
| *test/built-ins/Function/prototype/bind/get-fn-realm.js*                          |
| *test/built-ins/Function/prototype/bind/proto-from-ctor-realm.js*                 |
| *test/built-ins/Map/proto-from-ctor-realm.js*                                     |
| *test/built-ins/Number/proto-from-ctor-realm.js*                                  |
| *test/built-ins/Object/proto-from-ctor-realm.js*                                  |
| *test/built-ins/Promise/proto-from-ctor-realm.js*                                 |
| *test/built-ins/RegExp/proto-from-ctor-realm.js*                                  |
| *test/built-ins/RegExp/prototype/Symbol.split/splitter-proto-from-ctor-realm.js*  |
| *test/built-ins/Set/proto-from-ctor-realm.js*                                     |
| *test/built-ins/SharedArrayBuffer/proto-from-ctor-realm.js*                       |
| *test/built-ins/String/proto-from-ctor-realm.js*                                  |
| *test/built-ins/ThrowTypeError/distinct-cross-realm.js*                           |
| *test/built-ins/WeakMap/proto-from-ctor-realm.js*                                 |
| *test/built-ins/WeakRef/proto-from-ctor-realm.js*                                 |
| *test/built-ins/WeakSet/proto-from-ctor-realm.js*                                 |
| *test/language/expressions/async-generator/eval-body-proto-realm.js*              |

### Template sites and realms (6)

Audit family “Template sites and realms”, work groups
`template-site-and-realm-identity`.

| Path                                                                                    |
| --------------------------------------------------------------------------------------- |
| *test/language/expressions/tagged-template/cache-differing-expressions-eval.js*         |
| *test/language/expressions/tagged-template/cache-differing-expressions-new-function.js* |
| *test/language/expressions/tagged-template/cache-eval-inner-function.js*                |
| *test/language/expressions/tagged-template/cache-identical-source-eval.js*              |
| *test/language/expressions/tagged-template/cache-identical-source-new-function.js*      |
| *test/language/expressions/tagged-template/cache-realm.js*                              |

### RegExp round trips and flags (7)

Audit family “RegExp round trips and flags”, work groups
`regexp-literal-roundtrips`, `regexp-input-and-flags`.

| Path                                                              |
| ----------------------------------------------------------------- |
| *test/built-ins/RegExp/S15.10.4.1\_A5\_T3.js*                     |
| *test/built-ins/RegExp/S15.10.4.1\_A8\_T11.js*                    |
| *test/built-ins/RegExp/prototype/source/value-empty.js*           |
| *test/built-ins/RegExp/prototype/source/value-line-terminator.js* |
| *test/built-ins/RegExp/prototype/source/value-slash.js*           |
| *test/built-ins/RegExp/prototype/source/value-u.js*               |
| *test/built-ins/RegExp/prototype/source/value.js*                 |

### String inputs and global properties (27)

Audit family “String inputs, global properties, intrinsic lookup, deletion and
block exit”, work groups `string-static-inputs-and-callables`,
`global-property-presence-and-enumerability`,
`Object-intrinsic-independent-of-global-binding`, `global-var-deletion`,
`block-scope-exit`.

| Path                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------- |
| *test/built-ins/Object/entries/tamper-with-global-object.js*                                                                       |
| *test/built-ins/Object/values/tamper-with-global-object.js*                                                                        |
| *test/built-ins/String/S15.5.1.1\_A1\_T6.js*                                                                                       |
| *test/built-ins/String/prototype/charAt/S15.5.4.4\_A1.1.js*                                                                        |
| *test/built-ins/String/prototype/charCodeAt/S15.5.4.5\_A1.1.js*                                                                    |
| *test/built-ins/String/prototype/indexOf/S15.5.4.7\_A3\_T2.js*                                                                     |
| *test/built-ins/String/prototype/match/S15.5.4.10\_A1\_T3.js*                                                                      |
| *test/built-ins/String/prototype/replace/S15.5.4.11\_A1\_T5.js*                                                                    |
| *test/built-ins/String/prototype/replace/S15.5.4.11\_A1\_T6.js*                                                                    |
| *test/built-ins/String/prototype/slice/S15.5.4.13\_A1\_T5.js*                                                                      |
| *test/built-ins/String/prototype/split/checking-by-using-eval.js*                                                                  |
| *test/built-ins/String/prototype/split/separator-regexp-limit-string-via-eval.js*                                                  |
| *test/built-ins/String/prototype/substring/S15.5.4.15\_A1\_T5.js*                                                                  |
| *test/built-ins/String/prototype/toLocaleLowerCase/S15.5.4.17\_A1\_T3.js*                                                          |
| *test/built-ins/String/prototype/toLocaleUpperCase/S15.5.4.19\_A1\_T3.js*                                                          |
| *test/built-ins/String/prototype/toLowerCase/S15.5.4.16\_A1\_T3.js*                                                                |
| *test/built-ins/String/prototype/toUpperCase/S15.5.4.18\_A1\_T3.js*                                                                |
| *test/built-ins/global/S10.2.3\_A1.3\_T1.js*                                                                                       |
| *test/built-ins/global/S10.2.3\_A1.3\_T2.js*                                                                                       |
| *test/built-ins/global/S10.2.3\_A1.3\_T3.js*                                                                                       |
| *test/built-ins/global/S10.2.3\_A1.3\_T4.js*                                                                                       |
| *test/built-ins/global/S10.2.3\_A2.3\_T1.js*                                                                                       |
| *test/built-ins/global/S10.2.3\_A2.3\_T2.js*                                                                                       |
| *test/built-ins/global/S10.2.3\_A2.3\_T3.js*                                                                                       |
| *test/built-ins/global/S10.2.3\_A2.3\_T4.js*                                                                                       |
| *test/language/block-scope/leave/outermost-binding-updated-in-catch-block-nested-block-let-declaration-unseen-outside-of-block.js* |
| *test/language/expressions/delete/11.4.1-4.a-7.js*                                                                                 |

### Intrinsic IsConstructor and mixed static/dynamic functions (6)

Audit family “Intrinsic IsConstructor and mixed static/dynamic functions”, work
groups `intrinsic-IsConstructor`, `mixed-static-function-constructibility`.

| Path                                                        |
| ----------------------------------------------------------- |
| *test/built-ins/AsyncFunction/instance-construct-throws.js* |
| *test/built-ins/AsyncFunction/is-a-constructor.js*          |
| *test/built-ins/AsyncGeneratorFunction/has-instance.js*     |
| *test/built-ins/AsyncGeneratorFunction/is-a-constructor.js* |
| *test/built-ins/GeneratorFunction/has-instance.js*          |
| *test/built-ins/GeneratorFunction/is-a-constructor.js*      |
