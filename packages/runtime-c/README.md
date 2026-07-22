@oseo/runtime-c
===============

This package provides versioned, reviewed C11 runtime source inputs. The runtime
owns opaque NaN-boxed values, UTF-16 strings, primitive semantics, two-word call
results, explicit root frames, mark-and-sweep collection, ordinary objects,
arrays, environments, binding cells, function objects, and the deterministic
`console.log` intrinsic. Native assets remain separate files and are included
in npm and JSR packages.
The reviewed asset list is ordered: *oseo\_runtime.h* stays the only header
included by generated C and direct native fixtures, while
*runtime\_internal.h* is package-private and owns the shared heap layouts,
tag masks, and inline value helpers used across the runtime translation
units. Every listed C source compiles as its own translation unit and is
archived in asset order.
The shared NaN-boxed layout admits allocator-provided data pointers only after
an explicit low-48-bit payload check. Linux AMD64 and macOS AArch64 execution
exercise that boundary under the target's address and undefined-behavior
sanitizer policy.
The collector queues newly marked objects through an intrusive worklist, so it
traces each reachable object once regardless of allocation-list order.
M3 property operations implement descriptors, prototypes, array holes and
length, ordered own-key enumeration, and private cache primitives for explicit
MIR property-read guards.
Function creation installs the standard configurable, non-enumerable `name` and
`length` properties through the ordinary descriptor representation.
Its ABI also retains callable kind and the traced lexical receiver of arrows.
Arrow and asynchronous functions omit the implicit `prototype` property and
reject construction.
The `m4-2` ABI adds traced promises, reactions, jobs, and timer tasks. Promise
executors run synchronously through a generated-function dispatcher. Reactions
and thenable assimilation enter a runtime-owned FIFO microtask queue. The
context retains queued work as collector roots and records unhandled rejections
only at an explicit microtask checkpoint.
The `m4-3` ABI adds a top-level await scheduler checkpoint. It normalizes an
awaited value through the promise job queue and advances timer turns only until
that value settles. A pending value with no owned work reports `OSEO3001`
instead of leaving the native executable blocked.
The `m5-1` ABI adds the `oseo_typeof` and `oseo_remainder` helpers.
`oseo_typeof` allocates its result string and can trigger collection, so
lowering declares it a safepoint; `oseo_remainder` applies the shared
primitive numeric coercion and IEEE 754 remainder semantics.
The `m5-2` ABI adds `oseo_to_number`, `oseo_bitwise_not`,
`oseo_exponentiate`, and the six bitwise and shift helpers. All apply the
shared primitive numeric coercion. The 32-bit operations wrap through
explicit modular unsigned arithmetic instead of implementation-defined
casts, shifts mask their count to five bits, and exponentiation follows
`Number::exponentiate`, including the `NaN` exponent and unit-base
infinite-exponent cases where C `pow` differs.
The `m5-3` ABI adds `oseo_loose_equal` and `oseo_not_loose_equal`,
implementing `IsLooselyEqual` for the admitted values: nullish pairs are
equal, a nullish operand compared with anything else is unequal without
coercion, booleans and numeric strings coerce through the shared numeric
conversion, objects compare by identity, and comparing an object with a
number or string keeps the shared unsupported object-to-primitive
boundary.
The `m5-4` ABI adds `oseo_has_property` and `oseo_instanceof`.
`oseo_has_property` converts its key through the shared property-key
conversion and walks the prototype chain with the same own-descriptor
and promise-method visibility as generic property reads, throwing a
catchable error for non-object right operands. `oseo_instanceof`
implements `OrdinaryHasInstance`: a non-callable right operand and a
non-object `prototype` property throw catchable errors, a primitive left
operand is false, and the walk compares prototype identity.
The `m5-5` ABI adds `oseo_error_intrinsic` and
`oseo_context_print_thrown`, and the *runtime\_error.c* component that
owns the named error intrinsics. `oseo_error_intrinsic` returns the
lazily created constructor for one `OseoErrorKind`; each constructor is
callable and constructible, builds an instance with an own hidden
`message` property, honors the ES2022 `cause` option, and shares one
`Error.prototype.toString`. `oseo_context_print_thrown` renders an
unhandled thrown error instance as `Name: message` in the owned
diagnostic format and falls back to the stored diagnostic for every
other value.
The `m5-6` ABI adds `oseo_to_string` and the generic `ToPrimitive`
behind the numeric, string, addition, relational, loose-equality,
property-key, console, error-message, and timer-delay conversions.
`OrdinaryToPrimitive` runs user-reachable `valueOf` and `toString` in
hint order; objects on a default-intrinsics chain use the virtualized
`Object.prototype` and `Array.prototype` conversions with cycle-safe,
call-depth-bounded array joins, and an object with no convertible
method throws a catchable `TypeError`. Function and promise text
conversion remains an owned unsupported diagnostic.
The `m5-7` ABI adds `oseo_symbol_intrinsic` and the *runtime\_symbol.c*
component: unique GC-traced symbol primitives with descriptions, the
lazily created non-constructible `Symbol` intrinsic carrying the
well-known `iterator`, `toPrimitive`, and `toStringTag` symbols, and
`Symbol(description)` creation. Symbols are identity-compared property
keys, `typeof` reports `symbol`, numeric and string conversion throw
catchable `TypeError` instances, console output renders
`Symbol(description)`, and a reachable `Symbol.toPrimitive` method is
dispatched by the generic `ToPrimitive`.
The `m5-8` ABI adds the *runtime\_iterator.c* component and the
synchronous iterator protocol: `oseo_internal_iterator_get`, `_next`, `_close`,
over `Symbol.iterator`, `next`, and `return`, plus a first-class array iterator
exposed through a default array's virtualized `Symbol.iterator`. The array
iterator is an ordinary object that steps by re-reading the array length, and
its virtualized `next` and `Symbol.iterator` methods are cached on the context
so they stay rooted. The next method is captured once by `GetIterator` and
reused each step, and `IteratorClose` invokes a present `return` method when a
combinator rejects after a step. `Promise.all` and `Promise.race` consume any
object iterable through this protocol. String and other primitive iteration and
the generic array-like `%Array.prototype.values%` remain boundaries for later
consumers.
The `m5-9` ABI promotes that iterator record surface to the generated-code
entry points `oseo_iterator_get`, `oseo_iterator_next`, and
`oseo_iterator_close`. Generated C keeps the iterator, captured next method,
and yielded value in separate root slots instead of allocating a hidden
iterator-record object. Promise combinators use the same entry points.
Array binding declarations reuse these entry points without changing
the runtime ABI. Generated code owns their iterator done state and conditional
close control flow, while rest accumulation reuses `oseo_array_append`.
The `m5-10` ABI adds `oseo_array_append` and `oseo_array_append_hole` for
generated array accumulation. Value append creates a new own data property
without consulting the prototype, while hole append advances only the array
length. The array and appended value remain caller-rooted across property-key
and storage allocation. Generated accumulation is monotonic, so the array must
not already own the property named by its current length. Accumulation beyond
the runtime's 32-bit array-index limit fails with `OSEO2001` for value append
and a catchable `RangeError` for a trailing hole.
The `m5-11` ABI adds GC-traced dynamic argument lists. Generated code creates
and appends to a private list while evaluating spread arguments, then borrows
its stable count and value pointer for the call or construction. The list
remains rooted across invocation and is never exposed as a JavaScript object.
The `m5-12` ABI adds `oseo_require_object_coercible` for object binding
initialization. It rejects `null` and `undefined` with a catchable `TypeError`
before a computed property name can run, while every other admitted value
continues through the existing primitive-aware property-read operations.

Lexical bindings use a private uninitialized sentinel for runtime TDZ checks.
Catchable runtime-generated language errors are instances of the named
error intrinsics with the applicable `TypeError`, `RangeError`, or
`ReferenceError` identity and an own `message` property. Resource
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
