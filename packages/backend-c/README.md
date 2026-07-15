@oseo/backend-c
===============

This package emits deterministic C11 source from backend-neutral MIR. It
preserves generic and dynamic calls, receivers, constructors, explicit abrupt
completion, guarded operations, root frames, and safepoint locations. It does
not execute a compiler or choose runtime sources. MIR blocks and terminators are
its only semantic input; it never replays HIR.
Lexical bindings use traced environments and shared cells while their values
remain rooted across calls and collection.
Only functions reachable from the script and blocks reachable from function
entry are emitted. Self-recursive calls use a standard C volatile function
pointer so strict warning settings do not reject valid recursion.
Every declared-function call enters the runtime call-depth budget before the
callee enters generated C and leaves the budget while unwinding either a normal
or abrupt result. Generated root slots and call-argument scratch slots use a
heap-backed root frame instead of a variable-sized C stack array. The backend
also charges each entry against the runtime's active root-slot budget before
entering generated C, so a wide function cannot exhaust the process stack
before an owned resource diagnostic is possible.
UTF-16 string-constant units use static read-only storage rather than automatic
compound literals, so source literal size does not enlarge a generated stack
frame.
Value-slot discovery scans MIR argument IDs iteratively, so source-level call
size does not become a JavaScript call-stack limit during C emission. Generated
entry code passes diagnostic source identifiers with their UTF-8 byte lengths.

M2 guard failures and checked-addition overflow branch to the same emitted
generic addition block. The hit path uses private inline runtime primitives and
does not call generic addition or allocate. Block parameters carry the selected
result into one ordinary continuation.
M3 named property reads likewise preserve MIR-owned object and shape guards, a
fixed-slot hit, one generic fallback, and a block-parameter join. The runtime
exposes only private cache tests, fixed-slot loads, and cache updates to the C
backend.
