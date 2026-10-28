TypedArray copyWithin detached cost
===================================

This ready, unlanded node owns no test262 paths. The user registered it on
2026-10-28 as a product performance node, depending on
`unsupported-ownership-audit`.

A phase-timed Full UPDATE of main `6aab0fc8` on t1 (never-merge
instrumentation commit `7adf8d40`, manifest unchanged) found the three
slowest paths of the whole run in one place. The timings include
instrumentation overhead and a cold Zig cache, so treat them as relative.

| Path under *test/built-ins/TypedArray/prototype/copyWithin/* | Native execution, 4 variants | Compile and link | C bytes, 4 variants |
| ------------------------------------------------------------ | ---------------------------- | ---------------- | ------------------- |
| *coerced-values-end-detached.js*                             | 128.887 s                    | 0.402 s          | 3,680,829           |
| *coerced-values-end-detached-prototype.js*                   | 128.410 s                    | 0.464 s          | 3,698,972           |
| *coerced-values-start-detached.js*                           | 129.134 s                    | 0.363 s          | 3,680,885           |

The phase report sums every column over the four variants. Each variant
spends about 32 seconds in native execution and emits about 0.92 MB of C,
while emitting, compiling and linking it takes well under a second. These are
retained measurements, not new executions in this worktree.

| Evidence                                  | Pointer                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| User decision                             | ~/.local/state/oseo-m5c/decisions/done/product-performance-nodes-20261028.md |
| Phase report, “Top 30 slowest item paths” | ~/.local/state/oseo-m5c/throughput-research/p06/report.txt                   |
| Raw `OSEO_PHASE` records                  | /data/m5c-phase-diag-20261028/remote-20261027T212428Z-2c437718e422/          |
| Report parser                             | ~/.local/state/oseo-m5c/throughput-research/p06/phase\_report.py             |

The bounded remedy is to find the runtime cause, for example a loop over a
large length after detachment, and fix it without changing semantics.
Record before and after per-variant native time, C bytes and compile time
here. The node is observation-neutral if the outputs stay unchanged; the
publication decision says which UPDATE it needs.


Cause
-----

The copyWithin call is not the cost: after detachment it throws, or does
one `memmove`. The cost is the setup each case repeats for every
TypedArray constructor and argument factory. The case writes ten thousand
holes with `array.fill(7, 0)`, and the harness's `makeArrayLike` copies
them into `{ length: n }` one index at a time and reads them back.
`oseo_internal_own_property_index` scanned the whole property vector for
every index that was not already in its expected slot. An ascending write
of index *i* into an object that holds only indices 0 through *i* − 1
always missed, so each write scanned *i* slots and each fill or copy was
quadratic: 10,000 array-like writes took 306 ms, 2,500 took 20 ms.


Remedy
------

Every ordinary object now carries a dense index hint (*runtime\_internal.h*):
while it holds, slots [*base*, *base* + *count*) store the indices 0
through *count* − 1 in order and no other slot stores an array index. An
index lookup then finds its slot, or misses, without a scan. The five
sites that store a key call `oseo_internal_note_property_inserted`, and
`oseo_internal_remove_property` keeps the hint on removal. Index 0 starts
the run wherever it lands, the next index right after the run extends it,
a named key or a removal before the run shifts it whole, and removing the
run's last index shortens it. Anything else, such as an out-of-order
index, a named key inside the run or a middle deletion, clears the hint
for good, which restores the previous linear search. Every allocation
site starts the hint through `oseo_internal_init_dense_index`. The hint is
exact about the vector, so every lookup answer is unchanged; the Array
length check and the slot check in front of it are unchanged.

*packages/runtime-c/tests/fixtures/dense-index.c* is the contract test,
run on the Zig lane (*packages/runtime-c/tests/dense-index.test.ts*) and
the host-cc ASan and UBSan lane (*tests/runtime-dense-index.test.ts*),
each also with `OSEO_GC_EVERY_SAFEPOINT=1`. It requires that ten thousand
ascending writes into Array holes and into an array-like object after its
`length` keep the hint after every write, which is the structural check
that the quadratic scan cannot return. It also forces a false claim to
show that the lookup trusts the hint, and after each transition it
compares every probe lookup against a plain vector scan and checks the
hint's invariant.


Measurements
------------

Measured on 2026-10-28 on this host with a focused script, not a gate:
the case assembled as the runner does (base, *testTypedArray.js*,
*detachArrayBuffer.js*, then the case, with `"use strict";` first for the
strict variant), compiled with `--test262-host` and, for the generic
variant, `--no-specialization`, through the default CLI toolchain, the
Zig lane, with a warm cache. That lane passes the combined
`-fsanitize=address,undefined` flag, which the pinned Zig 0.16.0 build
reduces to UBSan alone (*docs/sanitizer-activity.md*), so these timings
carry UBSan instrumentation but no ASan; the host-cc ASan coverage above
belongs to the fixture, not to the timings. “Execution” is `Date.now()` around
the whole program inside the native run; “compile and link” is the CLI wall
time minus it; “C bytes” is the `--emit-c` output. The phase report's
per-variant C bytes, about 3.7 MB above, are not the `--emit-c` count, so
compare only within one method. Before is commit G `e2ff16d4` exported to a
separate directory; after is this change. Every run exited 0.

| Path, variant                             | C bytes   | Execution before | Execution after | Compile and link before → after |
| ----------------------------------------- | --------- | ---------------- | --------------- | ------------------------------- |
| *end-detached.js*, sloppy, specialized    | 1,851,902 | 35.620 s         | 3.877 s         | 1.572 s → 1.641 s               |
| *end-detached.js*, sloppy, generic        | 1,433,722 | 34.665 s         | 3.745 s         | 1.550 s → 1.273 s               |
| *end-detached.js*, strict, specialized    | 1,911,783 | 34.038 s         | 3.980 s         | 1.676 s → 1.451 s               |
| *end-detached.js*, strict, generic        | 1,508,866 | 33.729 s         | 4.007 s         | 1.470 s → 1.420 s               |
| *end-detached-prototype.js*, sloppy, spec | 1,856,594 | 33.149 s         | 3.848 s         | 1.396 s → 1.400 s               |
| *end-detached-prototype.js*, sloppy, gen  | 1,437,855 | 33.417 s         | 3.663 s         | 1.269 s → 1.221 s               |
| *end-detached-prototype.js*, strict, spec | 1,916,749 | 33.283 s         | 4.054 s         | 1.408 s → 1.415 s               |
| *end-detached-prototype.js*, strict, gen  | 1,513,269 | 33.107 s         | 3.979 s         | 1.373 s → 1.465 s               |
| *start-detached.js*, sloppy, specialized  | 1,851,914 | 33.043 s         | 4.068 s         | 1.458 s → 1.360 s               |
| *start-detached.js*, sloppy, generic      | 1,433,734 | 32.718 s         | 3.745 s         | 1.237 s → 1.265 s               |
| *start-detached.js*, strict, specialized  | 1,911,795 | 33.050 s         | 3.944 s         | 1.396 s → 1.438 s               |
| *start-detached.js*, strict, generic      | 1,508,878 | 33.061 s         | 3.899 s         | 1.305 s → 1.385 s               |

Execution falls from 32.7–35.6 s to 3.7–4.1 s per variant, about 8.7
times, or from about 134 s to about 15.6 s per path. The emitted C
differs only by the scratch path bytes in the source name, and compile
and link time is unchanged within noise, because the change is in the
runtime archive, not in generated code. The remaining time is the
harness's other per-constructor work, such as `Array.from`, the buffer
copies, and global variable lookups, which scan the global object's
named keys; none of it is index lookup. An intermediate Array-only form
of the hint reached 9.5–10.4 s; the array-like copy was the rest.

Raw rows: */data/m5c-typedarray-copywithin-before-20261028/measure-before.log*
and *measure-after.log* (the Array-only intermediate is
*measure-after-arrayonly.log*), from the script
*/data/m5c-typedarray-copywithin-before-20261028/measure.mjs*.
