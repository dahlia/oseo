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

A dictionary for every object is simple, but provides no stable layout to guard
and repeats metadata in every instance. Object-owned mutable descriptors make
transitions cheap to implement, but couple values to metadata and invalidate
fixed slots unpredictably. Tracing shapes as ordinary JavaScript heap values
would reuse collector machinery, but exposes metadata that has no language
identity and complicates weak transition ownership before it is needed.


Decision
--------

Every managed allocation begins with a private header containing its heap kind,
mark bit, and allocation-list link. Heap kinds dispatch to tracing functions for
strings, ordinary objects, arrays, functions, environments, and binding cells.
The dispatch traces only `OseoValue` fields. It uses an explicit work list so a
deep or cyclic graph cannot exhaust the native stack.

An ordinary shape is immutable. It owns ordered property metadata containing an
owned UTF-16 key copy, attributes, and a fixed slot index. Shapes and their key
copies live in a context-owned lifetime arena. They are not tagged values, do
not outlive the context, and never contain `OseoValue` fields. An ordinary
object owns its shape pointer, value slots, and a rooted prototype value. A
compatible addition creates a successor shape and preserves existing slots.

Deletion, incompatible redefinition, or layout pressure converts an object to
an insertion-ordered dictionary. Dictionary entries own the same key,
descriptor, and value information. Conversion preserves order and attributes.
No generic operation may distinguish the shape-backed and dictionary-backed
representations.

Arrays use a distinct heap kind. Dense storage uses an occupancy bitmap so a
hole differs from stored `undefined`. Sparse indexed entries preserve numeric
order separately from ordinary named properties. The array owns its `length`
descriptor and an ordinary-object property record for named keys and its
prototype. Canonical indices range from zero through 2^32 - 2; the string
`"4294967295"` is an ordinary key.

Prototype values live on each object rather than in a shape. The context owns a
monotonic prototype epoch. Prototype mutation advances the epoch and rejects a
cycle before publishing the new link. A shape-specialized read checks the
receiver kind, shape identity, and the epoch required by its selection. Shapes,
slot arrays, dictionaries, and element buffers never cross public TypeScript
interfaces.

Allocation and resizing collect before publication. Generated code roots all
live generic values across those safepoints. Tests may force every safepoint or
request a deterministic allocation failure. Raw object, slot, entry, and shape
pointers cannot survive a safepoint in generated code.


Consequences
------------

Shape identity supports a monomorphic fixed-slot read, while dictionary
conversion and prototype mutation have explicit miss conditions. The initial
arena can retain unreachable shapes until context destruction. That bounded
metadata retention is accepted for M3 and is not a JavaScript-visible leak.
Object values and all references among objects, arrays, functions,
environments, cells, prototypes, and thrown values remain collector-managed.


Failure modes and replacement triggers
--------------------------------------

Reopen this decision if shape retention dominates representative heaps, if
descriptor churn makes arena allocation unbounded, if array workloads require a
different elements strategy, or if a moving collector cannot retain an opaque
stable shape identity. A later collector may trace or compact metadata provided
that the public semantics and guard-miss contract remain unchanged.


Links
-----

[*0004-generic-tagged-value.md*](./0004-generic-tagged-value.md) defines the
tagged word that carries heap references.
[*0006-root-stack-and-safepoints.md*](./0006-root-stack-and-safepoints.md)
defines the existing explicit root protocol.
