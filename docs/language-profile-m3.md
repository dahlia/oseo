M3 dynamic language profile
===========================

Status
------

This document freezes the source profile implemented for M3. It extends
[*language-profile-m1.md*](./language-profile-m1.md). M2 specialization remains
removable as described by [*specialization-m2.md*](./specialization-m2.md). The
profile implementation is not a milestone-completion claim: executable
test262 subset evidence remains outstanding in [*PLAN-M3.md*](../PLAN-M3.md).


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
and `__proto__` literal syntax remain unsupported.

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
`new.target`, `super`, bound functions, and reflection APIs remain unsupported.


Control flow and abrupt completion
----------------------------------

M3 accepts `while`, `break`, and `continue` so mutation and completion order can
be observed. It accepts `throw`, `try`, `catch`, and `finally`. Thrown values
are ordinary admitted values. A catch binding is lexical and mutable. A
`finally` completion replaces a pending normal, return, throw, break, or
continue completion according to ECMAScript ordering.

Runtime resource limits and unsupported host capabilities remain `OSEO2001` and
`OSEO3001` diagnostics. They are not catchable JavaScript values.


Specialization
--------------

M3 specializes named property reads with a private monomorphic call-site cache.
The hit path checks object kind, dictionary state, layout identity, slot bounds,
and key equality before reading a fixed slot without allocation or generic
lookup. Any miss performs one generic lookup. Deletion, descriptor change,
prototype mutation, another layout, or a non-object receiver cannot reuse the
cached slot. Disabling specialization preserves observable behavior.


Test262 evidence
----------------

The repository classification model records suite revision, path, frontmatter
features, strictness modes, harness includes, expected phase, and actual
observation. Results are classified as pass, semantic failure, unsupported
profile feature, expected parse failure, or harness failure. Unsupported and
harness cases never increase the pass count. An executable runner, pinned suite
revision, reviewed subset, and checked-in result manifest are still required.


Negative profile boundaries
---------------------------

Each withheld syntax family receives a source-located `OSEO1001` diagnostic.
The negative corpus includes modules, promises, `async` and `await`, generators,
classes, accessors, proxies, symbols, big integers, regular expressions, typed
arrays, destructuring, spread, arrows, optional chaining, and dynamic import.
No withheld form receives approximate semantics.
