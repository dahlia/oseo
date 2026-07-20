ADR 0017: Structured cleanup regions
====================================

Status
------

Accepted. This record defines how MIR decides whether `finally` and later
resource cleanup run for a control transfer.


Context
-------

MIR previously kept only the block identifier of each active finalizer. Every
`return`, `break`, and `continue` encountered while that stack was nonempty
entered the innermost finalizer. That is correct only when the transfer leaves
the protected region. A `break` from a `switch` nested inside a `try`, or a
`continue` targeting a loop that is itself inside that `try`, remains inside the
region and must not execute `finally` early.

The synchronous iterator consumer planned by [*PLAN-M5.md*](../../PLAN-M5.md)
adds another cleanup with the same distinction. Same-loop `continue` and normal
iteration keep the iterator open, while `break`, `return`, and transfers to an
outer loop close it. Encoding that rule as special cases in the C backend would
duplicate source semantics downstream of MIR.


Decision
--------

 -  MIR control targets carry both a block identifier and the number of cleanup
    regions active at that destination.
 -  Each cleanup entry records the depth outside its protected region. A jump
    enters that cleanup only when its destination depth is not inside the
    region.
 -  Completion storage retains the destination block and depth. When one
    cleanup finishes, it forwards a non-normal completion to an outer cleanup
    only if that destination also lies outside the outer region.
 -  Thrown completion still selects the nearest catch or cleanup target before
    backend lowering. A catch inside an outer cleanup remains inside that
    cleanup until its body finishes or transfers outward.
 -  Cleanup bodies lower after removing their own region from the active stack.
    A completion created by a cleanup therefore overrides the stored completion
    without re-entering the same cleanup.


Consequences
------------

 -  `finally` observes the same transfer boundaries as ECMAScript instead of
    running for every syntactic jump beneath it.
 -  Nested cleanups resume inside out, while an internal target bypasses every
    cleanup it does not leave.
 -  The C backend stores one additional cleanup-depth array beside completion
    kind, value, target, and diagnostic metadata.
 -  Synchronous `for-of` iterator closing reuses this representation. Its step
    failures, normal exhaustion, and same-loop continuation select explicit
    paths that do not request cleanup.


Alternatives considered
-----------------------

1.  **Keep a finalizer block stack without target depths.** Rejected because it
    cannot distinguish an internal `switch` break from a break that exits the
    protected statement.
2.  **Teach the C backend about loop and statement nesting.** Rejected because
    source control semantics belong in HIR and MIR, and another backend would
    otherwise need to reconstruct them.
3.  **Clone cleanup bodies for every transfer.** Rejected because it expands
    generated control flow, duplicates side-effecting code, and makes nested
    completion precedence harder to inspect.


Replacement triggers
--------------------

Revisit this record if a later IR represents completion with explicit edges
that make numeric cleanup depths redundant, or if suspension needs cleanup
state that cannot be retained in the current completion slots.


Links
-----

 -  [*DESIGN.md*](../../DESIGN.md) records the abrupt-completion invariant.
 -  [*PLAN-M5.md*](../../PLAN-M5.md) requires generic abrupt-completion order
    before broader executable syntax.
 -  [ADR 0011](./0011-asynchronous-continuations.md) records the separate
    ownership of suspended execution state.
