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
Function creation passes MIR-owned UTF-16 names and plain parameter counts to
the runtime, without consulting HIR or source syntax.

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
backend. A named cache belongs to one static key site, so its hit path does not
allocate or materialize the property key.

Pending throws carry their diagnostic location and message through generated
completion slots, so intervening `finally` operations cannot overwrite an
unhandled exception's report.
Iterator operations keep the iterator, captured next method, and yielded value
in distinct root slots. Generated close blocks consult the stored completion
kind so `IteratorClose` preserves the required throw precedence.
Dynamic array accumulation emits runtime value and hole append operations.
Array spread steps its captured iterator method in MIR control-flow blocks and
returns abrupt acquisition, step, and append results without synthesizing a
close block.
Call and constructor spread use the same iterator control flow while appending
values to a GC-traced argument list. Generated invocations borrow the list count
and stable value pointer only for the call, while fixed-arity paths keep their
positional arguments.
Array binding lowering associates iterator get, next, and close operations with
a backend-local done bit. Exhaustion suppresses later steps and close calls,
while generated cleanup blocks close only a still-open iterator and preserve an
in-flight throw over a close failure.
Object binding lowering emits the MIR-owned coercibility check before computed
keys, then uses the existing property-key and generic property-read operations.
Nested patterns reuse the same binding targets and abrupt-completion path.
Catch parameter lowering captures the pending thrown value, resets every catch
cell, and runs the same recursive binding path before entering the body.
Pattern failures retain iterator cleanup and continue through an enclosing
`finally`.
`for-of` declaration patterns reuse that binding path after each outer iterator
step. Generated code resets lexical cells per iteration, writes hoisted `var`
cells in place, and closes nested iterators before the outer iterator when
initialization fails.

M4 whole-graph programs allocate shared module cells and namespaces before
executing dependency-ordered bodies. Generated functions register one shared
code-identity dispatcher used by dynamic calls, promise executors, reactions,
and asynchronous continuations. Promise, timer, and top-level await MIR targets
remain runtime calls, so generated C does not own job queues or scheduler
policy.
