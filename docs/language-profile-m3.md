M3 dynamic language profile
===========================

Status
------

This document freezes the source profile implemented for M3. It extends
[*language-profile-m1.md*](./language-profile-m1.md). M2 specialization remains
removable as described by [*specialization-m2.md*](./specialization-m2.md).
The profile and its reviewed evidence satisfy the M3 exit criteria in
[*ROADMAP.md*](../ROADMAP.md).


Program and value model
-----------------------

An input remains one non-module ECMAScript script with optional erasable
TypeScript annotations. M3 adds ordinary objects, arrays, and ordinary function
values to every M1 primitive. Function values may close over mutable lexical
bindings. Symbols, big integers, regular expressions, classes, private fields,
proxies, weak references, finalization, typed arrays, generators, asynchronous
functions, promises, modules, and host web APIs remain unsupported.


Objects and properties
----------------------

M3 accepts object literals containing data properties with identifier, string,
number, or computed primitive keys. It accepts computed and named property
reads, simple property assignment, `delete`, and these static `Object` methods:
`create`, `defineProperty`, `getOwnPropertyDescriptor`, `setPrototypeOf`, and
`keys`. Descriptor objects may specify `value`, `writable`, `enumerable`, and
`configurable`. Accessor descriptors, methods, shorthand properties, spread,
`Object.create` descriptor maps, and `__proto__` literal syntax remain
unsupported. `Object.create` therefore accepts only its prototype argument.

Property keys use ECMAScript `ToPropertyKey` for admitted primitive values.
Object-valued keys remain unsupported because M3 does not admit user-observable
object-to-primitive conversion. Lookup distinguishes absence from stored
`undefined` and walks ordinary prototypes. Prototype mutation rejects cycles.
Definition and deletion honor attributes. Incompatible redefinition produces
an abrupt completion that can be observed through the admitted exception
syntax.


Arrays
------

M3 accepts array literals containing values and elisions. Arrays use ordinary
property reads, writes, definitions, deletion, and prototype lookup. Canonical
indices range from `0` through `4294967294`. Holes are absent properties rather
than stored `undefined`. Writing an index grows `length`; reducing `length`
deletes configurable elements from the end and fails if a retained element
cannot be deleted. The `length` property is non-enumerable and
non-configurable, and its writability can be removed through
`Object.defineProperty`.

`Object.keys` is the enumeration oracle. It reports canonical indices in
ascending order followed by enumerable string keys in insertion order. Array
methods, iterators, destructuring, rest, spread, and array prototype built-ins
remain unsupported.


Functions, bindings, and calls
------------------------------

M3 accepts `let` in addition to `const`, simple identifier assignment, nested
function declarations, and ordinary function expressions. Captured bindings
have shared mutable identity. Arrow functions, default and rest parameters,
destructuring, generators, asynchronous functions, and classes remain
unsupported.

Function values may be called dynamically. Member calls pass their base value
as `this`; plain calls pass `undefined` under the M3 function-body contract.
Function bodies may read `this`. `new` accepts an admitted function value,
creates a receiver whose prototype comes from the function's `prototype`
property, and returns the explicit object result or otherwise the receiver.
Every function has own `name` and `length` data properties. They are
non-writable, non-enumerable, and configurable. `length` is the number of plain
parameters. Named functions retain their declared name; anonymous functions
infer a name from a lexical assignment or an object-literal key and otherwise
use the empty string.

`new.target`, `super`, bound functions, and reflection APIs remain unsupported.
Assignment to a named function expression's inner name is ignored in a
non-strict function body and throws in a strict function body.


Control flow and abrupt completion
----------------------------------

M3 accepts `while`, `break`, and `continue` so mutation and completion order can
be observed. It accepts `throw`, `try`, `catch`, and `finally`. Thrown values
are ordinary admitted values. A catch binding is lexical and mutable. A
`finally` completion replaces a pending normal, return, throw, break, or
continue completion according to ECMAScript ordering. A pending runtime error
retains its diagnostic location and message while a `finally` body executes.

Runtime-generated binding, callability, receiver, and strict-operation errors
throw distinct opaque ordinary objects. They are never represented by
`undefined`. The standard `Error` constructor hierarchy, names, messages, and
prototype identities remain outside the M3 profile.

Runtime resource limits and unsupported host capabilities remain `OSEO2001` and
`OSEO3001` diagnostics. They are not catchable JavaScript values.


Specialization
--------------

M3 specializes named property reads with an explicit backend-neutral MIR graph.
The graph checks object kind, then checks a private monomorphic call-site cache
for dictionary state, layout identity, and slot bounds. Each cache belongs to
one static named-key site, so the hit path reads a fixed slot without allocating
the key or entering generic lookup. Any miss materializes the key in one generic
lookup block, may relearn a stable own slot, and joins the hit result at one
continuation. Deletion, descriptor change, prototype mutation, another layout,
or a non-object receiver cannot reuse the cached slot. Disabling specialization
removes this graph while preserving observable behavior.


Test262 evidence
----------------

The repository classification model records suite revision, path, frontmatter
features, strictness modes, harness includes, expected phase, and actual
observation. Results are classified as pass, semantic failure, unsupported
profile feature, expected parse failure, or harness failure. Unsupported and
harness cases never increase the pass count.

Runtime-negative cases that require a named ECMAScript error type remain
unsupported in M3. The native boundary reports an unhandled thrown completion,
but the M3 profile does not expose enough error identity to distinguish the
actual type. The runner does not copy the expected frontmatter type into the
observation.

The reviewed subset pins test262 revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`. It records 30 passes, 6 expected
parse failures, 1 unsupported profile feature, 0 semantic failures, and 0
harness failures. The positive cases produce 98 native executions across their
requested strictness modes and specialization-disabled and
specialization-enabled compilation. The M3 completion run forced collection
at every safepoint and required exact agreement with
*tests/test262/results.yaml*. The current runner leaves forced-collection
coverage to the native and property lanes recorded by
[ADR 0018](./adr/0018-recorded-evidence-coverage.md). Run the standards lane
with `mise run test:test262`; refresh reviewed evidence explicitly with
`mise run test262:update` on x86-64 Linux.


Negative profile boundaries
---------------------------

Each withheld syntax family receives a source-located `OSEO1001` diagnostic.
The negative corpus includes modules, promises, `async` and `await`, generators,
classes, accessors, proxies, symbols, big integers, regular expressions, typed
arrays, destructuring, spread, arrows, optional chaining, and dynamic import.
No withheld form receives approximate semantics.
