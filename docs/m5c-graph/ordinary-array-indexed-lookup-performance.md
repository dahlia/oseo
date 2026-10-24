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
Array-length truncation is a separate observed cost, not an automatic reason
to widen this node beyond indexed own-property lookup.

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
Absent-key insertions still scan, and truncation retains its existing cost.
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

Pure reference and compiler checks validate the test source only. Native
semantics, sanitizer coverage, target parity, speedup, complete original
harness execution, full observations, and model reviews remain unverified
in this source phase. The node stays ready and unlanded.
