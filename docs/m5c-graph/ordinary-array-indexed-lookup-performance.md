Ordinary array indexed lookup performance
=========================================

This node removes repeated linear own-property scans that the unchanged
upstream `buildString` RegExp helper triggers while it fills, reads, and
truncates ordinary arrays. It owns no test262 path and admits no language
surface or exclusion. The node has landed.

An initial diagnostic found 18 of 24 sampled stacks in `apply` argument-list
construction, five in indexed assignment, and one in length truncation. The
samples located candidate paths; they were not CPU percentages. A
lookup-only change cut the ASCII and Surrogate native interval unions from
about 224 to about 158 seconds, roughly 1.42 times faster, so the user's
2026-10-24 decision extended the node to insertion and length truncation.


Contract
--------

The change preserves data and accessor descriptors, numeric and nonnumeric
property order, holes, inherited properties, unusual array states, Proxy
behavior, and generic fallback. Insertion, deletion, redefinition, length
changes, and collection never leave a stale lookup or a dangling reference.
Both specialization policies and forced collection stay part of the evidence.

The original helper, its 10,000-element chunk size, upstream source and
Unicode data, assertions, case counts, seeds, and time limits are unchanged.
The runtime change keeps CI shard totals and settings. A separately reviewed
scheduling change, authorized by the user, gives the unchanged Linux Array
property a dedicated job with the same cases, seeds, policies, and deadline.


Indexed lookup
--------------

For an array branded `OSEO_HEAP_ARRAY` and a canonical array index `i`, the
lookup checks whether property slot `i` exists and holds key `i`. Only that
match returns early. Every miss falls back to the complete ordinary property
scan, including a numeric key stored elsewhere. The property vector remains
the only descriptor storage, and `length` remains separate array metadata.

The check neither allocates nor calls user code. It caches no slot, pointer,
or absence result, so deletion, reordering, redefinition, vector growth, and
collection need no invalidation protocol. Descriptor reads, accessors,
writes, prototype traversal, enumeration, and Proxy dispatch keep their
existing callers. Runtime layout, public API, and ABI are unchanged.

For a dense array filled in ascending index order, a successful lookup
examines one candidate key instead of scanning the preceding properties. The
worst-case fallback remains linear.


Insertion and length reduction
------------------------------

An Array's own canonical indices are strictly below its current length, so
the ordinary lookup reports no own property for an index at or beyond that
length without scanning the vector. This covers append and out-of-length
insertion even after named properties or holes. It establishes absence only
on that Array: Set still walks prototypes and honors setters and inherited
read-only data, and definition keeps every extensibility, descriptor, and
writable-length check. A below-length slot miss, a noncanonical string, a
symbol, or a non-Array keeps the existing scan. Preallocated holes below
length are not an optimized insertion case.

Length reduction first performs the existing conversions and writable
checks. A guard then validates the whole property vector: every slot `i`
must hold canonical key `i` and a configurable data descriptor. Only that
match removes the tail in descending order, which makes validation and
removal linear in stored elements instead of quadratic. A dense prefix with
trailing holes is valid. Holes or reordering inside the stored prefix,
named or symbol keys, accessors, or non-configurable elements take the
unchanged generic descending deletion, including partial failure and
rollback. Common length, dictionary, and shape updates stay shared with that
path.

Neither guard allocates or calls user code, and neither keeps a slot or
pointer across an allocation or safepoint. The collector traces only the
live property count, as after an ordinary removal. Truncation invokes no
getter, setter, or finalization during the validated removal loop.


Tests
-----

The `array-indexed-lookup-transitions` fixture and the existing Array
constructor property cover dense `apply` reads, read-only data, accessors,
holes and inherited receivers, deletion and reinsertion, non-configurable
truncation barriers, numeric-looking strings, boundary indices, symbols,
Proxy forwarding, ordinary objects, and array reuse.

The `array-insertion-truncation-transitions` fixture covers dense append,
partial and zero reduction, reuse with heap values, trailing holes,
definition, preallocated holes, deletion and reinsertion, named and symbol
keys before indices, accessors, inherited setters and data, dense and
out-of-order non-configurable barriers, strict failure, failed definition
that makes length read-only, non-extensibility, length conversions and
abrupt completion, SameValue, and Proxy writes.

The Array constructor property keeps its arbitrary, domain identity,
shrinking, seed `0x60003f00`, twelve cases, both policies, and 180,000 ms
limit. Every transition survives shrinking while its numeric payloads
shrink.


Correctness evidence
--------------------

Five fixtures ran under both specialization policies in three lanes: Node.js,
Deno, and Node.js with the Clang 22.1.8 host-compiler sanitizer toolchain.
The fixtures are `array-indexed-lookup-transitions`,
`array-insertion-truncation-transitions`, `array-constructor`,
`array-prototype-mutation`, and `object-define-property`. All ten
fixture-policy pairs agreed across the lanes on expected and reference
stdout, native exit zero, empty stderr, and counters. Forced safepoint
collection produced positive allocation and collection counts throughout;
these counters do not measure hits in the new runtime branches.

Three property families ran complete under ordinary Zig and the host-compiler
sanitizer, with their arbitraries, sizes, shrinking and replay, both
policies, forced collection, and original assertions:

| Family                   | Cases per lane | Seed       | Ordinary limit ms | Linux sanitizer limit ms |
| ------------------------ | -------------- | ---------- | ----------------- | ------------------------ |
| Array constructor        | 12             | 0x60003f00 | 180000            | 540000                   |
| Array prototype mutation | 12             | 0x60005c00 | 240000            | 720000                   |
| Object DefineOwnProperty | 12             | 0x60003700 | 180000            | 540000                   |

The Linux sanitizer task multiplies only the deadline by three, not cases or
size. Default Linux leak detection stayed on without suppressions, so the
absence of sanitizer diagnostics is bounded execution evidence, not a proof
that nothing leaks. One snapshot showed a native process traced by a
same-name child; Root accepted it as consistent with LSan's internal
stop-the-world tracer, without establishing the helper's identity.

Both insertion and truncation policies also compiled and linked for
`linux-aarch64-musl`. Those cross-links execute no ARM program and supply no
macOS evidence. The raw sources, outputs, counters, sanitizer diagnostics,
and the tracer assessment are in
*/data/m5c-array-expanded-native-validation-20261024/REPORT.md*.


Measurements
------------

The accepted comparison ran the unchanged command
`mise run test:node -- tests/test262-regexp-utils-native.test.ts` with
ordinary GC on two private sources that differ only in the three Array
runtime hunks. Both sides kept the compiler, parser, backend, helper chunk
size, source data, registrations, assertions, strictness and policy variants,
and budgets identical. All four registrations and sixteen native invocations
per side exited zero, with empty subject stdout and stderr.

| Clock, seconds                 | Before        | After        |
| ------------------------------ | ------------- | ------------ |
| Whole direct command and build | 499.876714550 | 25.813427760 |
| Compiler/link interval union   | 32.036151171  | 9.533698797  |
| Native exec-to-exit union      | 462.997601509 | 12.613478184 |
| ASCII native union             | 234.253340244 | 5.840219975  |
| Surrogate native union         | 228.694822073 | 6.739456892  |

The native-union ratio is 36.706576x: 40.110362x for ASCII and 33.933717x
for Surrogate. An earlier comparison on a different composition measured
38.8x and 34.3x for the same subjects. Word-control and helper differences
of a few milliseconds establish no change.

These are single Linux observations. The after run followed the before run
in the same cache, so neither cold nor warm state is certified, and a
concurrent review overlapped the before run. Interval categories overlap and
measure wall time, not CPU or exclusive helper, matcher, or GC time. The
results establish no variance, whole-corpus, CI, macOS, or deadline claim.
The exact clocks and inputs are in
[measurement *REPORT.md*](/data/m5c-array-faithful-comparison-20261026/task_ed8b29a6ee97/ctx_600db5aa21fe/REPORT.md)
and its adjacent *COMPARISON.json*.
