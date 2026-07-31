BigInt representation and arithmetic boundary
=============================================

Status
------

Accepted for M5a Unit 8.1a.


Context
-------

M5a needs exact BigInt literals, numeric operations, comparisons, assignment,
and update semantics without exposing an arithmetic representation through
compiler IR or generated C. The existing NaN-boxed `OseoValue` has one unused
immediate tag, but spending it would require every BigInt operation to support
both immediate and heap forms. An all-heap representation keeps that tag
available and gives the initial generic implementation one canonical form.

The representation must execute on Linux AMD64 and macOS AArch64, compile and
link for AArch64 Linux, survive collection at every allocation safepoint, and
avoid C undefined behavior. It must also remain replaceable before later
algorithm or storage optimization.


Decision
--------

Represent every BigInt as a tag-5 collector reference with heap kind
`OSEO_HEAP_BIGINT`. The object stores an immutable normalized sign and
magnitude inline. The magnitude uses little-endian `uint32_t` limbs with 30
value bits per limb. A `uint64_t` therefore holds every product, carry, borrow,
and shifted intermediate used by the portable baseline.

Zero has one non-negative representation, magnitudes have no leading zero
limbs, and every operation normalizes before publication. BigInt remains a
primitive even though its storage is managed. The collector marks the object
without tracing its limb array because the inline limbs contain no
`OseoValue` edges.

Owned syntax, HIR, and MIR retain separator-free radix digits. Generated C
passes those digits to the private `oseo_bigint_literal` operation and never
depends on the heap layout. All arithmetic and conversion entry points accept
and return `OseoValue`; the internal limb view remains package-private.

The runtime ABI advances from `m5-34` to `m5-35`. The new version adds the
BigInt construction and numeric-dispatch operations plus
*runtime\_bigint.c*. It does not assign tag 7.


Evidence
--------

The fixed native BigInt fixtures compare Node.js, Deno, specialization-disabled
native execution, and specialization-enabled native execution. They cover
radices, exact multi-limb arithmetic, division and remainder signs, bitwise and
signed-shift behavior, mixed numeric failures, assignment and update order,
false number hints, deliberate guard misses, and collector survival. Selected
fixtures collect at every safepoint.

The generated property suite uses seed `0x5eed0022`, directly generates the
admitted radix, operator, assignment, update, mixed-type, and hint domains, and
compares a bounded independent integer model with both reference hosts and both
native specialization policies. The ordinary budget is 10 cases under seed
`0x5eed0022`; the repository extended gate uses fixed seed `0x5eed0003` and a
ten-times scale for a 100-case budget. Both native policies force collection.

The native gate executes the shared C sources under the matching Linux AMD64
or macOS AArch64 sanitizer policy and cross-compiles the same fixtures for
`linux-aarch64-musl`. The direct runtime heap fixture also keeps multi-limb
operands and results rooted across forced collection.


Consequences
------------

Small BigInts allocate in this first implementation. In return, every value
has one representation and tag 7 remains available. Schoolbook multiplication,
bit-at-a-time long division, exact signed shifts, and finite-width internal
two's-complement conversion are the generic semantic authority. Size
calculations are checked before allocation, and temporary buffers are freed on
normal and abrupt paths. The portable baseline admits magnitudes through
65,536 bits and throws a catchable `RangeError` before an operation allocates a
result beyond that reviewed resource ceiling. Allocation failure within the
ceiling remains a non-catchable runtime diagnostic.

The callable `BigInt` intrinsic, `BigInt.prototype`, wrappers, constructor
behavior, `BigInt.asIntN`, and `BigInt.asUintN` remain M5b work. This decision
does not expose their object model or fixed-width conversion surface.


Failure modes and replacement triggers
--------------------------------------

Revisit the representation when measured small-BigInt allocation or collector
cost justifies an immediate form or cache, or when larger workloads justify a
different limb width or arithmetic component. A replacement must preserve the
private `OseoValue` API, exact results, normalization, failure order, forced
collection behavior, both native execution targets, and the AArch64 Linux
cross-link. An external arithmetic component must also satisfy the allocator,
license, static-link, target, sanitizer, and failure requirements in
[*PLAN-BIGINT.md*](../../PLAN-BIGINT.md).


Links
-----

[*PLAN-BIGINT.md*](../../PLAN-BIGINT.md) defines the complete BigInt delivery
boundary. [ADR 0004](./0004-generic-tagged-value.md) defines the generic value
word, and [ADR 0006](./0006-root-stack-and-safepoints.md) defines collector
rooting. [ADR 0014](./0014-native-target-support.md) defines the native target
evidence.
