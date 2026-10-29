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


Repair
------

`lowerOptionalChain` in *packages/compiler/src/mir-build.ts* now lowers a
`with-get` chain base whose first link is a call through `lowerWithRead`
with `retainReceiver` set, as the ordinary call path does. The join that
carries the callee also carries the selected object, or `undefined` from a
lexical or global fallback, and that receiver becomes the first call
link's `this`. The read keeps the GetBindingValue order that
`eval-intrinsic-value` establishes, so the nullish guard, the arguments,
and the call follow the second HasProperty and the Get. A base whose first
link is a member or private member, any later call link, a parenthesized
comma callee such as `(0, f)?.()`, and optional member calls lower as
before.

The same lowering also gives the receiver to a strict tail-position
optional call, because the call link does not depend on tail position.
This node claims no tail-position behavior; its evidence, including
collection forced across the tail call trampoline, remains
`with-optional-call-receiver-tail`'s contract.


Evidence
--------

 -  The `with-optional-call-receiver` fixture in
    *tests/native/fixtures/bindings.ts* compares Node.js, Deno, and native
    output under both specialization policies with collection forced at
    every safepoint. It covers own, inherited, `Symbol.unscopables`-blocked
    (global and lexical fallback), and all-miss (lexical and global)
    references, nested `with` objects selected from the outer and inner
    environments, a parenthesized callee, an `eval`-named property, a
    following link, null and undefined short-circuits that skip their
    arguments, a non-callable callee that throws after its arguments, a
    getter-traced argument order, a strict nested caller, a sloppy
    `return f?.()`, and controls for the ordinary call, a comma callee, and
    optional member calls. Its arguments allocate while the selected
    receiver is live only in the call link. Without the repair, ten of
    its twenty-one lines report `undefined` as the receiver.
 -  Rows `O1` through `O4` of the native-only *with-get-binding-value.ts*
    fixture cover what V8 cannot observe because it skips GetBindingValue's
    second HasProperty: a binding gone before Get short-circuits the sloppy
    chain and throws `ReferenceError` in strict code, both before the
    arguments; a traced Proxy observes `has`, `@@unscopables`, `has`, and
    `get` before the arguments and is the call's `this`; and an abrupt
    second `has` propagates.
 -  *tests/property/m5-optional-chaining.property.test.ts* adds the domain
    at seed `0x60002401` to the family's existing block. Its independent
    model follows ResolveBinding, GetBindingValue, and EvaluateCall for a
    traced `with` Proxy holding an own, inherited, blocked, or no `f`, an
    optional outer `with` object, a lexical or global fallback, four callee
    kinds, a present, missing, or abrupt second `has`, and a sloppy or
    strict nested caller. Native runs under both policies with forced
    collection must equal the model; the reference engines are not
    consulted for the same reason as above. The earlier domain at
    `0x60002400` keeps its twelve cases and budget. With the repair
    reverted the domain fails on an unscopables-blocked case whose outer
    `with` object is the receiver.
 -  *packages/parser-babel/tests/statements.test.ts* checks the MIR: the
    first call link's receiver is the parameter of the join that also
    carries the callee, whose two incoming values are the selected object
    tested by GetBindingValue's `in` and a constant `undefined` from the
    fallback, for a sloppy call, a parenthesized callee followed by a
    second call, a strict nested caller, and a sloppy `return`, none of
    them a tail call. A later call link and a comma callee keep a constant
    `undefined` receiver.
