Object layout, shapes, and dictionary fallback
==============================================

Status
------

Accepted for the M3 dynamic language core.


Context
-------

M3 needs stable heap identities, ordinary properties, prototypes, arrays,
closures, and shape guards without exposing a runtime layout through a public
package. The first collector remains non-moving and stop-the-world. Every
collecting operation must trace all owned `OseoValue` fields explicitly.


Required contract
-----------------

Objects must distinguish a missing property from a stored `undefined`, retain
property attributes and insertion order, reject prototype cycles, and preserve
the same behavior after dictionary conversion. Array indices and ordinary
string keys share the generic property operations without sharing storage.
Shape identity must stay stable long enough for a checked read, but another
backend or collector must be able to replace the C representation.


Alternatives considered
-----------------------

A shared immutable shape arena can amortize metadata across similarly
constructed objects, but needs transition ownership, key lifetime management,
and prototype invalidation before the first monomorphic read proves that cost
useful. Tracing shapes as ordinary JavaScript heap values would reuse collector
machinery, but exposes metadata that has no language identity.


Decision
--------

Every managed allocation begins with a private header containing its heap kind,
mark bit, and allocation-list link. Heap kinds dispatch to tracing functions for
strings, ordinary objects, arrays, functions, environments, and binding cells.
The dispatch traces only `OseoValue` fields. It uses an explicit work list so a
deep or cyclic graph cannot exhaust the native stack.

The first guarded layout uses an object-owned ordered property vector. Each
entry contains a rooted UTF-16 key value, attributes, and a rooted property
value. The object also owns a rooted prototype and a monotonic layout identity.
Adding or removing a property, changing a descriptor, or changing the prototype
assigns a fresh identity. Replacing the value of an existing writable property
preserves the identity and slot.

Deletion, descriptor redefinition, and prototype mutation mark the object as a
dictionary layout. Dictionary objects retain the same insertion-ordered vector
for the first implementation, but are never eligible for a fixed-slot cache.
This deliberate mechanism keeps the generic representation authoritative while
leaving a replacement boundary for hash indexing and shared immutable shapes.

Arrays use a distinct heap kind and the same ordered property vector. Absence
from that vector distinguishes a hole from stored `undefined`. The array owns
its `length` value and writability bit. Canonical indices range from zero
through 2^32 - 2; the string `"4294967295"` is an ordinary key.

Prototype mutation assigns a fresh layout identity and rejects a cycle before
publishing the new link. A specialized named read uses explicit MIR blocks for
the object guard, cache guard, fixed-slot load, generic fallback, and result
join. Its private monomorphic cache contains the last layout identity and fixed
slot. Each cache belongs to one static named-key site, so the cache guard checks
dictionary state, identity, and slot bounds without materializing the key. A
miss materializes that site's key, performs one generic lookup, and may relearn
a stable own slot. No private object or cache layout crosses a public TypeScript
interface.

Allocation and resizing collect before publication. Generated code roots all
live generic values across those safepoints. Tests may force every safepoint or
request a deterministic allocation failure. Raw object, slot, entry, and shape
pointers cannot survive a safepoint in generated code.


Consequences
------------

Layout identity supports a monomorphic fixed-slot read, while dictionary
conversion and prototype mutation have explicit miss conditions. A future
shared shape arena can replace object-owned metadata without changing the
runtime API or guarded MIR contract.
Object values and all references among objects, arrays, functions,
environments, cells, prototypes, and thrown values remain collector-managed.


Failure modes and replacement triggers
--------------------------------------

Reopen this decision when representative allocation data justifies shared
shapes, if linear lookup dominates generic property time, if array workloads
require a dedicated elements strategy, or if a moving collector cannot retain
an opaque stable layout identity. A later collector may trace or compact
metadata provided that the public semantics and guard-miss contract remain
unchanged.


Links
-----

[*0004-generic-tagged-value.md*](./0004-generic-tagged-value.md) defines the
tagged word that carries heap references.
[*0006-root-stack-and-safepoints.md*](./0006-root-stack-and-safepoints.md)
defines the existing explicit root protocol.
