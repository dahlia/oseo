Ordinary array indexed lookup performance
=========================================

The user authorized investigation and implementation on 2026-10-24 while
RegExp utility harness review and observation continue independently. This
node targets the repeated linear own-property scans observed while the
unchanged upstream buildString helper fills and reads ordinary arrays.
It owns no new test262 path and admits no language surface or exclusion.

The initial diagnostic found 18 of 24 sampled stacks in apply argument-list
construction, five in indexed assignment, and one in length truncation.
Those samples identify candidate paths; they are not exact CPU percentages.
Lookup-only measurement on the unchanged original helper subsequently left
ASCII and Surrogate native interval unions near 158 seconds, about 1.42
times faster. The user's 2026-10-24 decision authorizes this node's bounded
expansion to insertion and length truncation. That focused measurement does
not establish whole-corpus deadline margin.

Preserve data and accessor descriptors, numeric and nonnumeric property
ordering, holes, inherited properties, unusual array states, Proxy behavior,
and generic fallback. Insertions, deletions, redefinitions, length changes,
and collection must not leave a stale lookup or a dangling reference.
Both specialization policies and forced collection remain part of evidence.

Keep the original helper, its 10,000-element chunk size, upstream source and
Unicode data, assertions, case counts, seeds, and time limits unchanged.
Do not change CI shard totals or settings. New generated domains reserve
stable seed slots and retain deliberate fallback and invalidation cases.

Measure the same fixed sources and conditions before and after the change.
Separate compilation from native execution, retain raw timing and failures,
and qualify cache and instrumentation effects. Validate complete original
harness registrations once that harness source is available for the measured
composition. A focused speedup does not establish a whole-corpus forecast or
a repaired CI deadline. Required native execution uses the single heavy slot;
source investigation and pure checks may continue during another UPDATE.

The original running UPDATE input and its results remain separate evidence.
This branch does not modify that worktree or replace its observations.
Fresh final observations, D1 impact reviews, local CHECK, and exact candidate
CI remain required before publication under the current M5c procedure.


Source preparation
------------------

The candidate lookup checks only arrays branded `OSEO_HEAP_ARRAY`. For a
canonical array index `i`, it checks whether property slot `i` exists and
currently holds the requested key. Only that match returns early. Every
miss retains the complete ordinary property scan, including a numeric key
stored elsewhere. The property vector remains the sole descriptor storage;
`length` remains separate array metadata.

The check neither allocates nor calls user code. It keeps no cached slot,
pointer, or absence result, so deletion, reordering, redefinition, vector
growth, and collection need no new invalidation protocol. Descriptor reads,
accessors, writes, prototype traversal, enumeration, and Proxy dispatch keep
their existing callers. No runtime layout, public API, or ABI changes.

For dense arrays populated in ascending index order, a successful indexed
lookup examines one candidate key instead of scanning preceding properties.
In that initial source, absent-key insertions still scan, and truncation
retains its existing cost.
The worst-case fallback remains linear. Runtime costs, including overhead
on fallback cases, require later measurement with fixed sources.

The fixed `array-indexed-lookup-transitions` fixture and the existing Array
constructor property sequence cover dense `apply` reads, read-only data,
accessors, holes and inherited receivers, deletion and reinsertion,
non-configurable truncation barriers, numeric-looking strings, boundary
indices, symbols, Proxy forwarding, ordinary objects, and array reuse.
The property's arbitrary, seed, case budget, and timeout stay unchanged;
its numeric payloads vary while every transition remains during shrinking.
Both native policies and forced collection remain in that existing lane.

The accepted native and measured lookup-only evidence is pinned to that
earlier source and its private benchmark composition. It does not validate
the following expanded runtime or its compiler/backend reanchor. The node
stays ready and unlanded.


Insertion and length reduction source
-------------------------------------

An Array's own canonical indices are strictly below its current length.
The ordinary lookup helper therefore reports no own property for an index
at or beyond that length, without scanning the vector. This applies to
append and out-of-length insertion even after named properties or holes.
It establishes absence only on that Array: Set still walks prototypes and
honors setters and inherited read-only data, while definition keeps every
extensibility, descriptor, and writable-length check. A below-length slot
miss, noncanonical string, symbol, or non-Array keeps the existing scan.
Preallocated holes below length are not an optimized insertion case.

Length reduction first performs the existing conversions and writable
checks. A new guard then validates the complete current property vector:
every slot i must hold canonical key i and a configurable data descriptor.
Only that whole-vector match removes the affected tail in descending order.
No repeated search or shift is needed, so validation and removal are linear
in stored elements rather than quadratic. A dense prefix with trailing
holes is valid; holes or reordering within the stored prefix, named/symbol
keys, accessors, or non-configurable elements retain the unchanged generic
descending selection and deletion, including partial failure and rollback.
Common length, dictionary, and shape updates remain shared with that path.

Neither guard allocates or calls user code, and neither retains a slot or
pointer across allocation or a safepoint. The property vector remains the
only descriptor storage; there is no layout, public API, ABI, cache, or
collector-policy change. The collector traces only the live property count,
as after an ordinary removal. Truncation does not invoke getters, setters,
or finalization during the validated removal loop.

The fixed insertion/truncation transition fixture and its pure reference
and lowering checks cover dense append, partial/zero reduction, reuse with
heap values, trailing holes, definition, preallocated holes, deletion and
reinsertion, named and symbol keys before indices, accessors, inherited
setters and data, dense and out-of-order non-configurable barriers, strict
failure, failed definition making length read-only, non-extensibility,
length conversions and abrupt completion, SameValue and Proxy writes.
The existing Array constructor arbitrary, domain identity, shrinking, seed
0x60003f00, twelve cases, both policies and 180000 ms limit remain fixed.
Every transition remains present while its existing numeric payloads shrink.
The historical file weight has not measured these added transitions.

Pure Node/Deno reference and compiler checks validate the new test source
only. Native execution, host ASan/UBSan/LSan, cross-linking, the same-helper
benchmark, observations, reviews and exact candidate CI remain pending for
the expanded source. No old result is relabeled as new validation.
