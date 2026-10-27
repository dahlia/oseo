Optional-call receivers through with in tail position
=====================================================

This record backs the M5c graph node `with-optional-call-receiver-tail`
(WOC-2). The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*), item 4, approves it as WOC-2 of the
`with-optional-call-receiver` split and makes it depend on
`with-optional-call-receiver-non-tail` (WOC-1) and `proper-tail-calls`.
[*with-optional-call-receiver.md*](./with-optional-call-receiver.md)
records the defect and explains why tail position reaches the
`proper-tail-calls` trampoline.

This node owns no manifest path. It keeps the TCO review risk out of WOC-1.


Evidence obligations
--------------------

 -  Strict tail-position optional calls through a selected `with` object
    environment, such as `return f?.(args())` in a strict function nested in
    a sloppy `with` body, covering normal and abrupt completion, argument
    order, and the selected receiver, each beside the ordinary strict tail
    call `return f(args())` as a control.
 -  Both specialization policies, with collection forced across the tail call
    trampoline so that the receiver, callee, and arguments stay rooted and
    live until the callee runs.
 -  MIR structural evidence that a strict tail-position optional call through
    `with` remains a tail call returned directly.
 -  Generated oracle and family record updates that extend WOC-1's evidence
    to tail position without weakening it.
