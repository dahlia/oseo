Module semantics reached through import()
=========================================

This record backs the M5c graph node `dynamic-source-module-semantics`
(DS-2). The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*) keeps module evaluation order,
top-level await, module namespace objects, and JSON module identity in
remediation (item 2) and approves this node as DS-2 of the
`dynamic-source-coverage-remediation` split (item 4). The umbrella lands
when it owns zero paths.


Selection rule
--------------

This node selects from the 393 OSEO1001 ImportExpression rejections that
`observation-batch-20` and `observation-batch-30` add to the umbrella;
*dynamic-source-importcall-accounting.md* records their path-set digest. The
umbrella owns them once both batches land. This node does not depend on the
batches; it selects nothing before they land, and its landing must follow
theirs.
The candidates are:

 -  the 61 paths under *test/language/expressions/dynamic-import/namespace/*;
 -  the 11 module code paths: 10 under
    *test/language/module-code/top-level-await/* and
    *test/language/module-code/verify-dfs.js*;
 -  other dynamic import paths, such as the directory's `reuse-namespace-*`,
    `import-errored-module`, and `imported-self-update` files, whose
    reviewed assessment finds one of the module subjects above.

Each path is assessed separately. One path has one owner: a path that
`dynamic-source-importcall-accounting` has already moved is not reselected,
and a path whose subject is neither ImportCall nor a module subject stays
with the umbrella.

The train also introduces `module-namespace-uninitialized-bindings`, whose
subject is close to this node's. That node does not exist on this base, so
this node does not depend on it; landing it first is safer.


Evidence obligations
--------------------

 -  Review replacement fixtures that observe each module subject through
    static imports, preserving every original path and assertion. Some
    subjects may already be covered by landed static module evidence; that
    is unconfirmed.
 -  A path closes under `adr:0016-dynamic-source-boundary` only by item 1 of
    the decision, with a fresh-digest exclusion-audit record that names the
    replacement paths and observations and shows that only source
    evaluation remains. Otherwise it stays in remediation.
 -  Never count a pass, emulate dynamic import, or widen ADR 0016. ADR 0016
    and ADR 0019 remain unchanged, and all 41,091 inventory paths remain.
