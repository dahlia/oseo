Optional-call receivers through with outside tail position
==========================================================

This record backs the M5c graph node `with-optional-call-receiver-non-tail`
(WOC-1). The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*), item 4, splits
`with-optional-call-receiver` into this node and
`with-optional-call-receiver-tail` (WOC-2). The umbrella depends on both.
[*with-optional-call-receiver.md*](./with-optional-call-receiver.md)
records the defect, the native observation, and the source location.

This node owns no manifest path. It depends on `eval-intrinsic-value`, whose
GetBindingValue order the repair keeps. Both children change the same
optional-chain lowering, so WOC-2 follows this node rather than running
concurrently.


Evidence obligations
--------------------

The repair keeps the selected object, or `undefined` for a fallback binding,
as the receiver of the first call link of an optional chain whose base is an
identifier resolved through `with`, for every call outside tail position.
Its evidence is the non-tail part of the umbrella's contract:

 -  fixed native examples under both specialization policies with forced
    collection, covering selected, inherited, `Symbol.unscopables`-blocked,
    and all-miss references, nested `with` environments, a nullish
    short-circuit, argument order, a strict GetBindingValue `ReferenceError`,
    and abrupt Proxy traps;
 -  an independent generated oracle that extends an existing property domain
    without weakening its earlier domains, case counts, or budgets;
 -  MIR structural evidence that the call link receives the selected object;
 -  updates to the `optional-chaining` and `with-statement` family records and
    the profile.

Ordinary identifier calls, optional member calls, and lexical and global
fallback behavior stay unchanged. Strict tail-position optional calls are
WOC-2's contract.
