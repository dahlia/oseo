Iterator helpers tag activation
===============================

This record backs the M5c graph node `iterator-helpers-tag-activation`
(IH-A). The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*), item 4, approves it as IH-A of the
`iterator-helpers` split, and its priority note puts IH-A first.
[*iterator-helpers.md*](./iterator-helpers.md) records the umbrella.


Selection rule
--------------

This node owns the 393 paths assigned to `node:iterator-helpers` in the
derived closure ledger, except these three, which include
*temporalHelpers.js* and belong to `temporal-helpers-harness`:

 -  *test/built-ins/Iterator/from/get-return-method-when-call-return.js*
 -  *test/built-ins/Iterator/from/return-method-calls-base-return-method.js*
 -  *test/built-ins/Iterator/from/return-method-throws-for-invalid-this.js*

That leaves 390 paths. The umbrella owns all 393 until this node lands.


Evidence obligations
--------------------

 -  Admit the `iterator-helpers` feature tag. Activation is atomic, so the
    node cannot split by method. Split review scopes by
    *test/built-ins/Iterator/prototype/* method directory instead.
 -  First check whether the runner classifies a missing harness include as
    unsupported. *tools/test262.ts* currently throws on an unknown include,
    which yields a harness failure the reviewed manifest rejects. If needed,
    add the bounded runner change that classifies the three
    *temporalHelpers.js* paths as an explicit unsupported capability, and
    regenerate the full manifest.
 -  Observe actual classifications. Apply the reviewed exclusion-audit
    procedure, and assign every still-unsupported path a bounded remediation
    or authorized exclusion owner. The node contract already expects
    *test/built-ins/Iterator/proto-from-ctor-realm.js* to keep a
    source-constructor rejection. Do not predict passes.
