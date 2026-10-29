Iterator helpers closure
========================

This record backs the M5c umbrella node `iterator-helpers`. The maintainer
decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*), item 4, splits it into
`iterator-helpers-tag-activation` (IH-A) and `temporal-helpers-harness`
(IH-B).

IH-A landed in `5537be5207ec5f5bf81c02f47b5c734c51071c14`, admitting
389 passing observations and assigning the four remaining paths to bounded
remediation owners. IH-B landed in
`a23a25e147b4fe013ceb3de08e5a0c84d149bc0a`, admitting passing observations
for its three *Iterator/from/* paths. Their accepted observations and
source/result identities are recorded in
[*iterator-helpers-tag-activation.md*](./iterator-helpers-tag-activation.md)
and [*temporal-helpers-harness.md*](./temporal-helpers-harness.md).


Original-path reconciliation
----------------------------

The table below reconstructs the original 393 paths by selecting exactly
`node:iterator-helpers` from *docs/m5c-closure/ledger.yaml* at split
baseline `6db426dd0cf788f7c69c08eb5644af6c9e8c77de`. This is IH-A's
selection rule before subtracting the three paths named for IH-B. It
contains 392 originally gated paths plus
*test/built-ins/Iterator/proto-from-ctor-realm.js*, reassigned after
`cross-realm-host` landed. The three IH-B paths leave 390 IH-A paths:
389 passes and one unsupported observation, matching IH-A's accounting.

Every row was checked against the checked-in partition under
*tests/test262/results/* and the derived ledger at Main
`74bb8e47c26e47c765c98c86bb37c41d152c699d`, suite revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`. Each original path occurs
once in its SHA-256-prefix partition, retains the `iterator-helpers`
feature, and has the same manifest classification and ledger state.
Every pass has a recorded passing observation. All three IH-B paths now
pass. These are stored observations, not predicted results or a new run.

| Manifest classification       | Ledger owner                               | Paths |
| ----------------------------- | ------------------------------------------ | ----- |
| `pass`                        | `observation`                              | 392   |
| `unsupported-profile-feature` | `node:dynamic-source-coverage-remediation` | 1     |
| Total                         |                                            | 393   |

There are zero paths without a valid owner, zero authorized exclusions,
and zero paths still owned by `node:iterator-helpers` or
`node:temporal-helpers-harness` in this original set. The unsupported path,
*test/built-ins/Iterator/proto-from-ctor-realm.js*, records `OSEO1001`:
“Function compiles source text at run time, which is outside the admitted
profile.” Its non-source realm/constructor subject remains active
coverage debt under
[*dynamic-source-coverage-remediation.yaml*](./nodes/dynamic-source-coverage-remediation.yaml).
It is neither a pass nor an exclusion, and no completed replacement evidence is
claimed.

This reconciles the umbrella's path-accounting obligation. Its two child
nodes and `unsupported-ownership-audit` are landed at the audit baseline;
the umbrella remains `landed: false`. Root owns the outer review,
integration, candidate/Main CI, explicit landing decision and publication.
The subset, results, ledger and ADRs 0013, 0016 and 0019 are unchanged;
no UPDATE is required for this documentation-only reconciliation.


Per-path accounting at the audit baseline
-----------------------------------------

| Original path                                                                                    | Manifest classification       | Ledger owner                               |
| ------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------ |
| *test/built-ins/Iterator/constructor.js*                                                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/callable.js*                                                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/get-next-method-only-once.js*                                      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/get-next-method-throws.js*                                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/get-return-method-when-call-return.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/is-function.js*                                                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/iterable-primitives.js*                                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/iterable-to-iterator-fallback.js*                                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/length.js*                                                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/name.js*                                                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/non-constructible.js*                                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/primitives.js*                                                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/prop-desc.js*                                                      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/proto.js*                                                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/result-proto.js*                                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/return-method-calls-base-return-method.js*                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/return-method-returns-iterator-result.js*                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/return-method-throws-for-invalid-this.js*                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/supports-iterable.js*                                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/from/supports-iterator.js*                                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/length.js*                                                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/name.js*                                                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/newtarget-or-active-function-object.js*                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prop-desc.js*                                                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/proto-from-ctor-realm.js*                                               | `unsupported-profile-feature` | `node:dynamic-source-coverage-remediation` |
| *test/built-ins/Iterator/proto.js*                                                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/Symbol.toStringTag/prop-desc.js*                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/Symbol.toStringTag/weird-setter.js*                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/constructor/prop-desc.js*                                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/constructor/weird-setter.js*                                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/argument-effect-order.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/argument-validation-failure-closes-underlying.js*        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/callable.js*                                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/exhaustion-does-not-call-return.js*                      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/get-next-method-only-once.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/get-next-method-throws.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/get-return-method-throws.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/is-function.js*                                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/length.js*                                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/limit-equals-total.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/limit-greater-than-total.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/limit-less-than-total.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/limit-rangeerror.js*                                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/limit-tonumber-throws.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/limit-tonumber.js*                                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/name.js*                                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/next-method-returns-non-object.js*                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/next-method-returns-throwing-done.js*                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/next-method-returns-throwing-value-done.js*              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/next-method-returns-throwing-value.js*                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/next-method-throws.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/non-constructible.js*                                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/prop-desc.js*                                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/proto.js*                                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/result-is-iterator.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/return-is-forwarded.js*                                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/return-is-not-forwarded-after-exhaustion.js*             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/this-non-callable-next.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/this-non-object.js*                                      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/this-plain-iterator.js*                                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/throws-typeerror-when-generator-is-running.js*           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/underlying-iterator-advanced-in-parallel.js*             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/underlying-iterator-closed-in-parallel.js*               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/drop/underlying-iterator-closed.js*                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/argument-effect-order.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/argument-validation-failure-closes-underlying.js*       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/callable.js*                                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/get-next-method-only-once.js*                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/get-next-method-throws.js*                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/get-return-method-throws.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/is-function.js*                                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/iterator-already-exhausted.js*                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/iterator-has-no-return.js*                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/iterator-return-method-throws.js*                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/length.js*                                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/name.js*                                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/next-method-returns-non-object.js*                      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/next-method-returns-throwing-done.js*                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/next-method-returns-throwing-value-done.js*             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/next-method-returns-throwing-value.js*                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/next-method-throws.js*                                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/non-callable-predicate.js*                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/non-constructible.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/predicate-args.js*                                      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/predicate-returns-falsey.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/predicate-returns-non-boolean.js*                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/predicate-returns-truthy-then-falsey.js*                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/predicate-returns-truthy.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/predicate-this.js*                                      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/predicate-throws-then-closing-iterator-also-throws.js*  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/predicate-throws.js*                                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/prop-desc.js*                                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/proto.js*                                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/result-is-boolean.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/this-non-callable-next.js*                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/this-non-object.js*                                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/every/this-plain-iterator.js*                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/argument-effect-order.js*                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/argument-validation-failure-closes-underlying.js*      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/callable.js*                                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/exhaustion-does-not-call-return.js*                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/get-next-method-only-once.js*                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/get-next-method-throws.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/get-return-method-throws.js*                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/is-function.js*                                        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/iterator-already-exhausted.js*                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/iterator-return-method-throws.js*                      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/length.js*                                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/name.js*                                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/next-method-returns-non-object.js*                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/next-method-returns-throwing-done.js*                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/next-method-returns-throwing-value-done.js*            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/next-method-returns-throwing-value.js*                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/next-method-throws.js*                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/non-callable-predicate.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/non-constructible.js*                                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/predicate-args.js*                                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/predicate-filters.js*                                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/predicate-returns-non-boolean.js*                      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/predicate-this.js*                                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/predicate-throws-then-closing-iterator-also-throws.js* | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/predicate-throws.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/prop-desc.js*                                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/proto.js*                                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/result-is-iterator.js*                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/return-is-forwarded.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/return-is-not-forwarded-after-exhaustion.js*           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/this-non-callable-next.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/this-non-object.js*                                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/this-plain-iterator.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/throws-typeerror-when-generator-is-running.js*         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/underlying-iterator-advanced-in-parallel.js*           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/underlying-iterator-closed-in-parallel.js*             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/filter/underlying-iterator-closed.js*                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/argument-effect-order.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/argument-validation-failure-closes-underlying.js*        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/callable.js*                                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/get-next-method-only-once.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/get-next-method-throws.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/get-return-method-throws.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/is-function.js*                                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/iterator-already-exhausted.js*                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/iterator-has-no-return.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/iterator-return-method-throws.js*                        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/length.js*                                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/name.js*                                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/next-method-returns-non-object.js*                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/next-method-returns-throwing-done.js*                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/next-method-returns-throwing-value-done.js*              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/next-method-returns-throwing-value.js*                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/next-method-throws.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/non-callable-predicate.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/non-constructible.js*                                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/predicate-args.js*                                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/predicate-returns-falsey-then-truthy.js*                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/predicate-returns-falsey.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/predicate-returns-non-boolean.js*                        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/predicate-returns-truthy.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/predicate-this.js*                                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/predicate-throws-then-closing-iterator-also-throws.js*   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/predicate-throws.js*                                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/prop-desc.js*                                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/proto.js*                                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/this-non-callable-next.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/this-non-object.js*                                      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/find/this-plain-iterator.js*                                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/argument-effect-order.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/argument-validation-failure-closes-underlying.js*     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/callable.js*                                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/exhaustion-does-not-call-return.js*                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/flattens-iterable.js*                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/flattens-iterator.js*                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/flattens-only-depth-1.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/get-next-method-only-once.js*                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/get-next-method-throws.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/get-return-method-throws.js*                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/is-function.js*                                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/iterable-primitives-are-not-flattened.js*             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/iterable-to-iterator-fallback.js*                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/iterator-already-exhausted.js*                        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/iterator-return-method-throws.js*                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/length.js*                                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/mapper-args.js*                                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/mapper-returns-closed-iterator.js*                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/mapper-returns-non-object.js*                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/mapper-this.js*                                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/mapper-throws-then-closing-iterator-also-throws.js*   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/mapper-throws.js*                                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/name.js*                                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/next-method-returns-non-object.js*                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/next-method-returns-throwing-done.js*                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/next-method-returns-throwing-value-done.js*           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/next-method-returns-throwing-value.js*                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/next-method-throws.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/non-callable-mapper.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/non-constructible.js*                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/prop-desc.js*                                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/proto.js*                                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/result-is-iterator.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/return-is-forwarded-to-mapper-result.js*              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/return-is-forwarded-to-underlying-iterator.js*        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/return-is-not-forwarded-after-exhaustion.js*          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/strings-are-not-flattened.js*                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/this-non-callable-next.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/this-non-object.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/this-plain-iterator.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/throws-typeerror-when-generator-is-running.js*        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/underlying-iterator-advanced-in-parallel.js*          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/underlying-iterator-closed-in-parallel.js*            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/flatMap/underlying-iterator-closed.js*                        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/argument-effect-order.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/argument-validation-failure-closes-underlying.js*     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/callable.js*                                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/fn-args.js*                                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/fn-called-for-each-yielded-value.js*                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/fn-this.js*                                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/fn-throws-then-closing-iterator-also-throws.js*       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/fn-throws.js*                                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/get-next-method-only-once.js*                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/get-next-method-throws.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/is-function.js*                                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/iterator-already-exhausted.js*                        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/length.js*                                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/name.js*                                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/next-method-returns-non-object.js*                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/next-method-returns-throwing-done.js*                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/next-method-returns-throwing-value-done.js*           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/next-method-returns-throwing-value.js*                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/next-method-throws.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/non-callable-predicate.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/non-constructible.js*                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/prop-desc.js*                                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/proto.js*                                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/result-is-undefined.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/this-non-callable-next.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/this-non-object.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/forEach/this-plain-iterator.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/initial-value.js*                                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/argument-effect-order.js*                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/argument-validation-failure-closes-underlying.js*         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/callable.js*                                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/exhaustion-does-not-call-return.js*                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/get-next-method-only-once.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/get-next-method-throws.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/get-return-method-throws.js*                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/is-function.js*                                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/iterator-already-exhausted.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/iterator-return-method-throws.js*                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/length.js*                                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/mapper-args.js*                                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/mapper-this.js*                                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/mapper-throws-then-closing-iterator-also-throws.js*       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/mapper-throws.js*                                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/name.js*                                                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/next-method-returns-non-object.js*                        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/next-method-returns-throwing-done.js*                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/next-method-returns-throwing-value-done.js*               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/next-method-returns-throwing-value.js*                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/next-method-throws.js*                                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/non-callable-mapper.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/non-constructible.js*                                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/prop-desc.js*                                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/proto.js*                                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/result-is-iterator.js*                                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/return-is-forwarded-to-underlying-iterator.js*            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/return-is-not-forwarded-after-exhaustion.js*              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/returned-iterator-yields-mapper-return-values.js*         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/this-non-callable-next.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/this-non-object.js*                                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/this-plain-iterator.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/throws-typeerror-when-generator-is-running.js*            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/underlying-iterator-advanced-in-parallel.js*              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/underlying-iterator-closed-in-parallel.js*                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/map/underlying-iterator-closed.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/argument-effect-order.js*                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/argument-validation-failure-closes-underlying.js*      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/callable.js*                                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/get-next-method-only-once.js*                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/get-next-method-throws.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/is-function.js*                                        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/iterator-already-exhausted-initial-value.js*           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/iterator-already-exhausted-no-initial-value.js*        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/iterator-yields-once-initial-value.js*                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/iterator-yields-once-no-initial-value.js*              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/length.js*                                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/name.js*                                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/next-method-returns-non-object.js*                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/next-method-returns-throwing-done.js*                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/next-method-returns-throwing-value-done.js*            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/next-method-returns-throwing-value.js*                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/next-method-throws.js*                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/non-callable-reducer.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/non-constructible.js*                                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/prop-desc.js*                                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/proto.js*                                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/reducer-args-initial-value.js*                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/reducer-args-no-initial-value.js*                      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/reducer-memo-can-be-any-type.js*                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/reducer-this.js*                                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/reducer-throws-then-closing-iterator-also-throws.js*   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/reducer-throws.js*                                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/this-non-callable-next.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/this-non-object.js*                                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/reduce/this-plain-iterator.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/argument-effect-order.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/argument-validation-failure-closes-underlying.js*        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/callable.js*                                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/get-next-method-only-once.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/get-next-method-throws.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/get-return-method-throws.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/is-function.js*                                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/iterator-already-exhausted.js*                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/iterator-has-no-return.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/iterator-return-method-throws.js*                        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/length.js*                                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/name.js*                                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/next-method-returns-non-object.js*                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/next-method-returns-throwing-done.js*                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/next-method-returns-throwing-value-done.js*              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/next-method-returns-throwing-value.js*                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/next-method-throws.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/non-callable-predicate.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/non-constructible.js*                                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/predicate-args.js*                                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/predicate-returns-falsey-then-truthy.js*                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/predicate-returns-falsey.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/predicate-returns-non-boolean.js*                        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/predicate-returns-truthy.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/predicate-this.js*                                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/predicate-throws-then-closing-iterator-also-throws.js*   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/predicate-throws.js*                                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/prop-desc.js*                                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/proto.js*                                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/result-is-boolean.js*                                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/this-non-callable-next.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/this-non-object.js*                                      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/some/this-plain-iterator.js*                                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/argument-effect-order.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/argument-validation-failure-closes-underlying.js*        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/callable.js*                                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/exhaustion-calls-return.js*                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/get-next-method-only-once.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/get-next-method-throws.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/get-return-method-throws.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/is-function.js*                                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/length.js*                                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/limit-greater-than-or-equal-to-total.js*                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/limit-less-than-total.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/limit-rangeerror.js*                                     | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/limit-tonumber-throws.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/limit-tonumber.js*                                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/name.js*                                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/next-method-returns-non-object.js*                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/next-method-returns-throwing-done.js*                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/next-method-returns-throwing-value-done.js*              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/next-method-returns-throwing-value.js*                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/next-method-throws.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/non-constructible.js*                                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/prop-desc.js*                                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/proto.js*                                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/result-is-iterator.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/return-is-forwarded.js*                                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/return-is-not-forwarded-after-exhaustion.js*             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/this-non-callable-next.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/this-non-object.js*                                      | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/this-plain-iterator.js*                                  | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/throws-typeerror-when-generator-is-running.js*           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/underlying-iterator-advanced-in-parallel.js*             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/underlying-iterator-closed-in-parallel.js*               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/take/underlying-iterator-closed.js*                           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/callable.js*                                          | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/get-next-method-only-once.js*                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/get-next-method-throws.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/is-function.js*                                       | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/iterator-already-exhausted.js*                        | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/length.js*                                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/name.js*                                              | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/next-method-returns-non-object.js*                    | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/next-method-returns-throwing-done.js*                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/next-method-returns-throwing-value-done.js*           | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/next-method-returns-throwing-value.js*                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/next-method-throws.js*                                | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/non-constructible.js*                                 | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/prop-desc.js*                                         | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/proto.js*                                             | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/this-non-callable-next.js*                            | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/this-non-object.js*                                   | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/prototype/toArray/this-plain-iterator.js*                               | `pass`                        | `observation`                              |
| *test/built-ins/Iterator/subclassable.js*                                                        | `pass`                        | `observation`                              |
| *test/built-ins/Object/prototype/toString/symbol-tag-array-builtin.js*                           | `pass`                        | `observation`                              |
| *test/built-ins/Object/prototype/toString/symbol-tag-map-builtin.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Object/prototype/toString/symbol-tag-set-builtin.js*                             | `pass`                        | `observation`                              |
| *test/built-ins/Object/prototype/toString/symbol-tag-string-builtin.js*                          | `pass`                        | `observation`                              |
