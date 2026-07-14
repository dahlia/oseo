Root stack and collection safepoints
====================================

Status
------

Accepted for the initial non-moving collector.


Context
-------

Generated C and runtime helpers need a collector-visible description of live
generic values. The protocol must survive normal and abrupt calls and must be
testable by collecting at every point that may allocate.


Required contract
-----------------

The compiler identifies every allocation and runtime call that may collect.
Before such a safepoint, each live heap-bearing `OseoValue` is present in a
registered root slot. Private unboxed values that can denote heap objects are
boxed into a root slot unless a later record introduces stack maps.


Alternatives considered
-----------------------

The probe uses linked root frames containing contiguous `OseoValue` slots.
Alternatives were conservative C-stack scanning, generated stack maps, shadow
handles allocated one by one, and postponement until a production collector.
Conservative scanning conflicts with precise tags and can retain dead objects.
Stack maps tie M0 to backend and unwind details that have not settled. Separate
handles add allocation and bookkeeping to ordinary generated calls.


Probe evidence
--------------

*experiments/abi-roots/probe.c* implements a small non-moving mark-and-sweep
collector solely to exercise the protocol. Allocation collects before returning
a new object. The fixture roots live objects across nested calls, frees an
unrooted object, preserves abrupt values, and checks that every frame is popped.
Run:

~~~~ sh
mise run probe:abi-roots
~~~~


Observed results
----------------

Normal return, nested call, thrown failure, allocation, and forced collection
all passed with undefined-behavior sanitization. A rooted object remained
discoverable while an unrooted peer was collected. Both normal and abrupt paths
restored the root-stack head. The fixture forced at least eight collections,
including collections inside an allocating call.


Decision
--------

Store the root-stack head in `OseoContext`. A generated frame contains a link
to the previous frame, a pointer to a contiguous array of `OseoValue` slots, and
the slot count. Generated code pushes the frame before the first covered
safepoint and pops it on every normal or abrupt exit. Runtime helpers may
collect only at declared safepoints.

The initial collector is non-moving, stop-the-world mark and sweep. It marks a
slot only when the private value layout recognizes a heap-reference tag. A new
allocation becomes the caller's responsibility after the allocating helper
returns. A helper must not collect after creating an unrooted result unless it
protects that result internally. The probe uses collection before allocation.


Consequences
------------

MIR must carry liveness at safepoints even before a production collector exists.
The C backend emits root-slot stores and balanced frame operations. Runtime APIs
state whether they may allocate or collect. Tests can enable collection at every
declared safepoint without changing source behavior.


Failure modes and replacement triggers
--------------------------------------

A moving or generational collector requires a new record covering slot updates,
write barriers, interior pointers, and pinned values. Native backends with
reliable stack maps may replace explicit frames after showing equivalent normal,
abrupt, and host-call behavior. The named check is “M1 safepoint liveness
replay,” which compares MIR live sets with registered slots while forcing every
possible collection.


Links
-----

[*0004-generic-tagged-value.md*](./0004-generic-tagged-value.md) defines heap
recognition.
[*0005-generic-call-and-abrupt-completion.md*](./0005-generic-call-and-abrupt-completion.md)
defines the exits that must balance root frames.
