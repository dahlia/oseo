temporalHelpers.js harness
==========================

This record backs the M5c graph node `temporal-helpers-harness` (IH-B). The
maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*), item 4, approves it as IH-B of the
`iterator-helpers` split. It depends on `iterator-helpers-tag-activation`,
which assigns it these paths. [*iterator-helpers.md*](./iterator-helpers.md)
records the umbrella.


Selection rule
--------------

This node owns exactly the three `iterator-helpers` paths that include
*temporalHelpers.js*:

 -  *test/built-ins/Iterator/from/get-return-method-when-call-return.js*
 -  *test/built-ins/Iterator/from/return-method-calls-base-return-method.js*
 -  *test/built-ins/Iterator/from/return-method-throws-for-invalid-this.js*

PLAN-M5.md records the scoped classification in which they failed in the
harness because the reviewed harness set does not supply that include.


Evidence obligations
--------------------

 -  Decide whether the reviewed harness set admits the upstream
    *temporalHelpers.js* unchanged or a reviewed subset providing the
    `propertyBagObserver` and `observeMethod` helpers these paths use. The
    upstream file references Temporal and Intl widely; admitting the harness
    must not admit Temporal or Intl behavior.
 -  Observe the three paths and assign any still-unsupported path a bounded
    owner. Do not predict passes.
