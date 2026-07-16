@oseo/runtime-c
===============

This package provides versioned, reviewed C11 runtime source inputs. The runtime
owns opaque NaN-boxed values, UTF-16 strings, primitive semantics, two-word call
results, explicit root frames, mark-and-sweep collection, ordinary objects,
arrays, environments, binding cells, function objects, and the deterministic
`console.log` intrinsic. Native assets remain separate files and are included
in npm and JSR packages.
The collector queues newly marked objects through an intrusive worklist, so it
traces each reachable object once regardless of allocation-list order.
M3 property operations implement descriptors, prototypes, array holes and
length, ordered own-key enumeration, and private cache primitives for explicit
MIR property-read guards.
Function creation installs the standard configurable, non-enumerable `name` and
`length` properties through the ordinary descriptor representation.
The `m4-2` ABI adds traced promises, reactions, jobs, and timer tasks. Promise
executors run synchronously through a generated-function dispatcher. Reactions
and thenable assimilation enter a runtime-owned FIFO microtask queue. The
context retains queued work as collector roots and records unhandled rejections
only at an explicit microtask checkpoint.

Lexical bindings use a private uninitialized sentinel for runtime TDZ checks.
Catchable runtime-generated language errors carry distinct opaque ordinary
objects. Catching one clears its transient diagnostic message, while resource
and host failures retain non-catchable diagnostics.
Power-of-two radix strings are rounded once from their exact integer value into
binary64.
Numeric coercion distinguishes an ordinary `NaN` conversion from temporary
buffer allocation failure. Allocation failure propagates as an abrupt
`OSEO2001` result through arithmetic and relational operations.
String concatenation checks its combined UTF-16 length before addition or
allocation, so an unrepresentable result fails with `OSEO2001` instead of
wrapping a native allocation size.
Declared-function calls have a deterministic maximum active depth of 256. The
runtime returns an owned `OSEO2001` diagnostic before entering another C frame
when that limit is reached.
Root slot arrays are allocated independently of the process stack. Allocation
failure propagates as `OSEO2001`. The script and active declared functions also
have a deterministic aggregate limit of 32,768 root slots. Exceeding this
native-frame budget fails with `OSEO2001` before generated C is entered.
The context ABI includes private inline small-integer recognition, unboxing,
checked addition, and boxing primitives. Checked addition validates the signed
48-bit range before using C signed arithmetic. Test builds can separately
report guard, generic-addition, allocation, and collection counters; ordinary
program output cannot observe them. The context also carries diagnostic source
identifiers with explicit byte lengths, heap-backed root-frame ownership, and
active frame-budget accounting. Embedded null bytes are preserved during native
error output.
