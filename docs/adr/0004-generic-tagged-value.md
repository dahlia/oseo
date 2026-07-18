Generic tagged-value representation
===================================

Status
------

Accepted for the initial x86-64 runtime. The AArch64 deferral is superseded by
[ADR 0014](./0014-native-target-support.md).


Context
-------

The generic ABI needs one 64-bit word that can carry every M1 primitive and a
heap reference. The design proposed NaN-boxing with an immediate small integer,
but the cost and address-space assumptions needed comparison with a conventional
low-bit tag.


Required contract
-----------------

`OseoValue` is an opaque 64-bit runtime word. The private runtime ABI must
define number round trips, negative zero, NaN handling, immediate integer
range, singleton values, heap-reference recognition, and the pointer
assumptions used by the collector. Public TypeScript packages do not expose tag
masks.


Alternatives considered
-----------------------

*experiments/value/nanbox.c* stores non-NaN doubles directly, canonicalizes NaN,
and uses quiet-NaN payloads for immediates and heap references.
*experiments/value/lowtag.c* reserves three low bits, stores small integers
immediately, and boxes other numbers in aligned heap objects. Deferring the
layout behind an opaque word remained an option if either probe exposed an
uncontained target dependency.


Probe evidence
--------------

Both independent C programs test positive and negative zero, minimum and
maximum finite doubles, infinities, NaN, integer boundaries, Booleans, `null`,
`undefined`, and heap references. The task runs correctness checks with
undefined-behavior sanitization and emits optimized assembly for both targets:

~~~~ sh
mise run probe:value-layouts
~~~~


Observed results
----------------

Both layouts passed every correctness case on x86-64 and emitted assembly for
x86-64 and AArch64. The observed instruction counts were:

| Operation             | NaN-box x86-64 | Low tag x86-64 | NaN-box AArch64 | Low tag AArch64 |
| --------------------- | -------------- | -------------- | --------------- | --------------- |
| Number check          | 13             | 19             | 6               | 13              |
| Small-integer box     | 8              | 5              | 4               | 3               |
| Small-integer extract | 14             | 10             | 4               | 5               |
| Heap-reference check  | 9              | 9              | 5               | 4               |

The compiler configuration retained frame setup in several x86-64 functions,
so these counts describe the checked-in probe and pinned Zig release rather
than an architecture minimum. More importantly, the low-tag number check needs
a heap-header load for non-small-integer numbers and every such number needs a
box. The NaN-box path carries ordinary doubles without allocation.


Decision
--------

Use NaN-boxing for the initial `x86_64-linux-gnu` runtime. Canonicalize every
NaN to `0x7ff8000000000000` before it enters the generic ABI. Reserve quiet-NaN
tag values 1 through 7 for non-number values. Use tag 1 for a signed 48-bit
small integer and tag 5 for a heap reference. The immediate integer range is
−140737488355328 through 140737488355327.

Heap references store a nonzero address in the low 48 bits. The initial runtime
therefore requires user-space heap addresses below `0x0001000000000000` and
checks that condition when boxing. The collector recognizes only tag 5 as a
heap reference. It never treats an arbitrary numeric NaN payload as a pointer
because all numeric NaNs are canonicalized at the boxing boundary.


Consequences
------------

Most doubles cross the generic ABI without allocation. M1 runtime helpers must
use `memcpy` for bit conversion and unsigned operations for tag arithmetic so C
undefined behavior cannot enter the representation. The masks remain private
to the C runtime and backend lowering. M0 public packages expose only an opaque
`OseoValue` contract.


Failure modes and replacement triggers
--------------------------------------

Reopen the decision before executing on AArch64 systems with 52-bit virtual
addresses, top-byte-ignore metadata, pointer authentication, or other pointer
forms that do not fit the checked 48-bit payload. Reopen it if sanitizers expose
an invalid pointer round trip, a moving collector needs incompatible metadata,
or measured M1 code shows that canonicalization or tag checks outweigh avoided
number allocation. The named follow-up is “M1 target-address validation,” which
allocates at every runtime heap boundary and rejects a target before any address
is truncated.


Links
-----

[*0001-initial-platform-and-tools.md*](./0001-initial-platform-and-tools.md)
limits accepted execution to x86-64.
[*0006-root-stack-and-safepoints.md*](./0006-root-stack-and-safepoints.md)
defines how tagged heap references become roots.
