BigInt plan
===========

Status
------

Implementation status: M5a Unit 8.1a is implemented. It admits exact BigInt
literals, primitive values, `ToNumeric`, the M5a operator, assignment, update,
comparison, conversion, and collector contracts.
[ADR 0023](./docs/adr/0023-bigint-representation.md) selects an all-heap
normalized sign-and-magnitude representation with 30-bit limbs and leaves the
last unused NaN-box tag unassigned. The M5b intrinsic, prototype, wrappers,
constructor behavior, and fixed-width conversions remain planned.

BigInt crosses the M5 core-language and built-in checkpoints. Literals,
operators, coercions, and update expressions belong to M5a, while the `BigInt`
intrinsic and its prototype belong to M5b. Keeping both sides in one plan
prevents the expression grammar from choosing a value representation that the
intrinsic, collector, or later binary-data families cannot use.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md), [*PLAN-GC.md*](./PLAN-GC.md),
[*PLAN-CRYPTO.md*](./PLAN-CRYPTO.md), [*PLAN-M5.md*](./PLAN-M5.md),
[*PLAN-PT.md*](./PLAN-PT.md), [*PLAN-WASM.md*](./PLAN-WASM.md),
[ADR 0004](./docs/adr/0004-generic-tagged-value.md),
[ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md), the active language
profile, and accepted records under *docs/adr/*. Evidence that changes one of
those contracts updates the affected document in the same change.


Goal
----

Oseo should implement the complete BigInt primitive and intrinsic semantics
required by its ECMA-262 16th edition candidate boundary. A BigInt stores an
integer of arbitrary finite magnitude without passing through IEEE 754.
Parsing, arithmetic, comparison, conversion, printing, and fixed-width
truncation must preserve that exact value.

The generic runtime operation is the semantic authority. An immediate
representation, a heap representation, compile-time literal lowering, and any
later arithmetic specialization must agree on one canonical mathematical
value. Crossing a representation boundary must not be observable through
equality, conversion, allocation failure, or collection.

The first accepted representation should fit the existing one-word
`OseoValue`, precise root protocol, and native target contract. It should also
leave the arithmetic implementation replaceable. Generated C must not depend
on a particular limb type or an external library's public structures.


Non-goals
---------

ECMAScript `Number` remains an IEEE 754 binary64 type. Decimal floating point,
rationals, operator overloading, and implementation-defined mixed `Number` and
BigInt arithmetic are outside this plan.

The unused NaN-box tag remains unassigned. Spending the last immediate tag is a
future replacement decision that needs target, allocation, and generated-code
evidence beyond the accepted all-heap M5a baseline.

The accepted owned arithmetic baseline uses 30 value bits in each `uint32_t`
limb and `uint64_t` intermediates. An external component remains a replacement
candidate only behind an Oseo-owned adapter and only after its observable
behavior, allocator contract, static-link support, target support, license,
code size, and failure behavior have been measured.

A convenient subset of BigInt arithmetic cannot stand for the whole primitive.
Internal checkpoints may land separately, but every profile update must name
the exact syntax and operations it admits. A rejected operation remains a
source-located or catchable specified failure rather than silently converting
through `Number`.

Typed arrays, `DataView`, and `Atomics` remain built-in families with their own
object, buffer, and concurrency prerequisites. This plan owns the BigInt
conversion and fixed-width contracts those families consume. It does not claim
their full object models as part of the primitive implementation.

WebAssembly may execute `i64` operations internally without using ECMAScript
BigInt. [*PLAN-WASM.md*](./PLAN-WASM.md) owns that machine representation and
the JavaScript interoperation rule. This plan supplies the BigInt value and
conversion behavior required when an `i64` import, export, global, or reflected
signature crosses the JavaScript boundary.

Cryptographic multiprecision arithmetic is not an implementation shortcut for
ECMAScript BigInt, and BigInt is not a cryptographic arithmetic component.
Web Crypto and `node:crypto` keep private key material behind the opaque
provider boundary in [*PLAN-CRYPTO.md*](./PLAN-CRYPTO.md). They do not expose
provider integers as BigInt limbs or reuse this plan's arithmetic for RSA or
elliptic-curve operations.


Entry evidence
--------------

The current runtime provides the boundaries that a BigInt implementation must
extend:

 -  `OseoValue` is an opaque 64-bit word. Numeric NaNs are canonicalized,
    ordinary doubles remain unboxed, and signed 48-bit small integers use an
    immediate tag.
 -  ADR 0004 reserves quiet-NaN tag values 1 through 7 for non-number values.
    The implemented runtime uses tags 1 through 6, leaving tag 7 unassigned.
 -  Tag 5 identifies every collector-managed reference. The collector traces
    only that tag, registers generated roots explicitly, and can run at every
    declared safepoint.
 -  Heap publication rejects pointers that do not fit the checked 48-bit
    payload. Linux AMD64 and macOS AArch64 execute the shared layout, while
    AArch64 Linux remains compile-link evidence.
 -  Generic primitive operations already own `ToPrimitive`, `ToNumber`,
    `ToString`, property-key conversion, equality, relational comparison,
    arithmetic, bitwise operators, and abrupt completion for the admitted
    value profile.
 -  The source frontend converts bootstrap-parser nodes into Oseo-owned syntax
    before compiler core processing. `BigIntLiteral` currently receives an
    unsupported-profile diagnostic rather than entering that syntax.
 -  The reviewed test262 inventory already identifies BigInt syntax,
    operators, intrinsics, and dependent built-in cases inside the candidate
    edition. Their unsupported results remain visible until an admitted unit
    supplies executable evidence.

The first BigInt change replaces only the unsupported boundaries covered by
its tests. Existing `Number` paths stay authoritative for programs that never
produce a BigInt.


M5a Unit 8.1a checkpoint
------------------------

Unit 8.1a admits the complete M5a-owned primitive boundary: exact literals,
the selected representation, Boolean, string, property-key, equality and
relational behavior, `ToNumeric`, arithmetic, bitwise and signed-shift
operators, unary negation and bitwise NOT, compound assignment, and prefix and
postfix update. Mixed Number and BigInt arithmetic, unary plus, unsigned right
shift, division or remainder by zero, and negative exponents throw the
specified catchable errors after the specified conversions.

[ADR 0023](./docs/adr/0023-bigint-representation.md) selects the all-heap
`OSEO_HEAP_BIGINT` representation with an inline normalized sign and magnitude,
30 value bits per `uint32_t` limb, and `uint64_t` intermediates. The runtime ABI
is `m5-35`; tag 7 remains unassigned.

The generated native property uses ordinary seed `0x60000800`, directly
generated admitted radix and operator domains, a bounded independent integer
oracle, and a 10-case ordinary budget. The repository extended gate uses its
fixed `0x5eed0003` seed and a ten-times scale for a 100-case budget. The suite
compares Node.js, Deno, both native specialization policies, false hints,
deliberate guard misses, mixed numeric errors, and forced collection under both
policies. Fixed native fixtures retain larger exact arithmetic, comparison
edges, assignment and update ordering, abrupt completion,
target-width-independent shifts, and collector survival. The native gate
executes the matching supported host with strict warnings and sanitizers and
retains the AArch64 Linux cross-link.

The reviewed Test262 manifest grows from 4,006 to 4,174 cases. It moves from
2,359 to 2,448 passes, from 1,128 to 1,167 expected negatives, and from 519 to
559 unsupported profile features. The 168 added cases therefore contribute 89
passes, 39 syntax negatives, and 40 honest unsupported classifications for
tests that also require an unimplemented intrinsic or object boundary. The pin,
inventory policy, manifest schema, and classification vocabulary do not change.

The callable `BigInt` intrinsic, `BigInt.prototype`, wrappers, constructor
behavior, `BigInt.asIntN`, and `BigInt.asUintN` are not admitted by this
checkpoint. They remain M5b work.

The portable M5a baseline admits magnitudes through 65,536 bits. Literal
construction and operations that would exceed that reviewed ceiling throw a
catchable `RangeError` before allocating an oversized result. Allocation or
host resource failure within the ceiling remains a non-catchable runtime
diagnostic. This bound contains the initial schoolbook and long-division cost
without changing exact results inside the admitted domain.


Semantic boundary
-----------------

BigInt enters as a primitive value, exact literal grammar, numeric coercion
branch, operator family, and intrinsic. The implementation order may separate
those pieces, but their contracts are defined together.

### Literals and primitive values

The frontend accepts the decimal, binary, octal, hexadecimal, and numeric
separator forms in the candidate grammar. It preserves enough source
information to diagnose invalid digits, separators, leading-zero forms,
fractional parts, and exponents at the original range.

A BigInt literal is converted from its radix digits directly to an owned exact
constant. It never becomes a JavaScript `number`, a TypeScript `number`, or a C
`double` on the way to HIR, MIR, or generated C. Unary minus remains an
operator applied to a non-negative literal value, which preserves the grammar
and source order for forms such as `-1n`.

There is one zero value. Negation, parsing, arithmetic, and fixed-width
conversion cannot create an observable negative zero. Two BigInts with the
same mathematical value compare as the same primitive even when one arrived
from a literal and the other from an operation, or when their internal
representations differ.

`typeof` returns `"bigint"`. Boolean conversion is false only for `0n`.
Property-key conversion produces the canonical decimal string. A heap-backed
BigInt remains a primitive and must not pass an ordinary-object test merely
because its storage is collector-managed.

### Numeric coercion and operators

Add `ToNumeric` as the shared numeric dispatch. It returns either a `Number` or
a BigInt after the specified primitive conversion. `ToNumber` rejects a
BigInt. `ToBigInt` rejects a `Number`; the callable `BigInt` intrinsic handles
integral `Number` arguments through its own specified branch.

Arithmetic operators require both numeric operands to select the same numeric
type. Mixing `Number` and BigInt in arithmetic throws `TypeError` after the
specified left-to-right conversions. BigInt addition, subtraction,
multiplication, division, remainder, exponentiation, signed shifts, bitwise
operators, unary negation, compound assignment, and prefix and postfix update
all stay exact.

Division truncates toward zero. Division or remainder by zero throws
`RangeError`, as does exponentiation by a negative exponent. Unary plus and
unsigned right shift reject BigInt. Shift counts and exponent sizes use
checked resource calculations before allocating storage.

Strict equality compares BigInt mathematical values and never pointer
identity. Loose equality and relational comparison support the specified
cross-type cases with strings, integral and non-integral numbers, infinities,
and `NaN`. These comparisons must not round a large BigInt to `double` before
deciding the result.

### Intrinsic and integration

`BigInt` is callable and is not a constructor. Its conversion order, accepted
strings, integral `Number` handling, object-to-primitive behavior, name,
length, prototype links, and property attributes follow the candidate
edition. `BigInt.asIntN` and `BigInt.asUintN` implement exact modulo-\(2^n\)
truncation with the specified index conversion and failure order.

`BigInt.prototype` supplies `toString`, `toLocaleString`, and `valueOf` with
the required receiver checks, radix handling, descriptors, and branding.
Wrapping a BigInt through `Object` produces an ordinary wrapper with an
internal primitive value; the BigInt storage itself does not acquire object
identity.

String conversion, template interpolation, property access, collections, and
JSON behavior use the same primitive conversion contract. Binary-data and
atomic families consume `ToBigInt`, `asIntN`, and `asUintN` semantics rather
than adding private conversion rules.


Representation boundary
-----------------------

One private runtime interface owns BigInt recognition, construction,
normalization, arithmetic, comparison, hashing where required, and text
conversion. HIR and MIR may distinguish a BigInt constant from a `Number`
constant, but neither compiler IR nor generated C exposes heap fields or limb
operations.

Every accepted representation must maintain these invariants:

 -  one canonical mathematical zero with no negative-zero form;
 -  no leading zero limbs in a stored magnitude;
 -  sign represented separately from magnitude or by an equally explicit
    normalized contract;
 -  value equality independent of allocation and representation;
 -  checked size arithmetic before allocation;
 -  no unrooted collector reference across a safepoint; and
 -  normalization after every operation that can remove leading limbs.

### Deferred immediate plus heap candidate

The leading candidate assigns tag 7 to a signed 48-bit immediate BigInt.
Values from \(-2^{47}\) through \(2^{47}-1\) then remain inside one
`OseoValue`, distinct from the tag-1 `Number` small integer. Larger values use
tag 5 to reference a new `OSEO_HEAP_BIGINT` kind.

Construction and arithmetic demote every result that fits the immediate
range. A boundary result promotes to the heap before publication; a later
operation may return it to the immediate form. The generic BigInt API hides
both transitions.

This candidate avoids allocation for common counters, masks, zero, one, and
small literal values. It consumes the final reserved non-number tag and adds a
second representation to every BigInt operation. Those costs require a probe
rather than an architectural assertion.

### Selected all-heap representation

M5a represents every BigInt as `OSEO_HEAP_BIGINT` without a small-value cache.
This keeps tag 7 available and gives generic construction, arithmetic, and
comparison one canonical representation. Ordinary arithmetic allocates its
result.

The current collector allocates each object separately and sweeps one complete
object list. Small-BigInt allocation and collection cost are replacement
triggers. A later cache would also need to measure persistent roots, startup
size, and whether its extra identity-like storage creates an incorrect
pointer-equality shortcut.

### Selected heap magnitude

A heap BigInt uses one normalized sign and magnitude. An inline flexible array
keeps the header and limbs in one managed allocation. Temporary arithmetic
buffers remain separately owned and are released before every normal or abrupt
return.

The owned arithmetic baseline uses little-endian `uint32_t` storage with 30
value bits per limb and `uint64_t` intermediates. Full 32-bit or wider limbs
remain replacement candidates only after both native targets provide checked
intermediate and performance evidence.


Compiler and runtime architecture
---------------------------------

BigInt constants need an owned path from source digits to the private runtime
API.

~~~~ mermaid
flowchart TD
    source[BigInt literal] --> syntax[Owned exact constant]
    syntax --> hir[HIR and MIR BigInt constant]
    hir --> backend[Generated C descriptor or immediate]
    backend --> construct[Private BigInt construction]
    coercion[ToNumeric and BigInt intrinsic] --> construct
    construct --> value[Canonical OseoValue]
    value --> operations[Generic BigInt operations]
    operations --> value
~~~~

The owned constant may retain normalized radix digits, a sign-and-magnitude
form, or a backend-neutral limb vector. The selected form needs a stable text
dump and validator so malformed constants fail before C emission. Cache keys
include every representation version and target fact that changes emitted
data.

Small immediate literals may lower directly to a private boxing helper. Large
literals may use checked static descriptors, runtime parsing, or another
measured form. Generated C must not repeat decimal parsing on each evaluation
without code-size and startup evidence. Because BigInt is an immutable
primitive, sharing immutable constant data is allowed when allocation failure,
context lifetime, and collection remain unobservable.

The runtime arithmetic layer accepts and returns `OseoValue`. Its internal
views may expose a sign and read-only limb span to owned translation units.
Mutating an operand is forbidden even when it has one reference; JavaScript
programs, constant pools, and runtime roots may share the value.

### Collector ownership

An immediate BigInt is not a collector edge. A heap BigInt is published through
the existing tag-5 boundary and receives an explicit heap kind. An inline limb
array contains no `OseoValue` edges, so tracing marks the object without
visiting its digits.

Every operation that may allocate roots its heap-backed operands before the
first safepoint. Temporary buffers have one owner, checked byte counts, and
cleanup on normal return, language throw, allocation failure, and internal
failure. Separate limb storage reports its bytes and destructor through the
collector contracts in [*PLAN-GC.md*](./PLAN-GC.md).

Forced collection and deterministic failure injection apply to literal
materialization, coercion, arithmetic, printing, wrapper creation, and
intrinsic initialization. An external library cannot bypass those observations
through an untracked allocator.


Probes and decisions
--------------------

ADR 0023 records the M5a representation decision and its checked native,
generated, collector, and target evidence. Later representation or arithmetic
replacement follows checked-in probes whose corpus includes test262 values,
boundary-focused generated cases, and large arithmetic workloads.
Measurements distinguish facts from inferences.

### Immediate representation

Compare the tag-7 hybrid, an all-heap representation, and a bounded small-value
cache. At minimum, record:

 -  object and executable size;
 -  allocation attempts, live bytes, and collection work;
 -  literal construction, addition, comparison, and loop latency;
 -  branch and instruction shape for both native execution targets;
 -  AArch64 Linux compile-link behavior;
 -  disabled and enabled specialization behavior;
 -  forced collection and deterministic allocation failure; and
 -  transitions at \(-2^{47}\), \(2^{47}-1\), and their immediate neighbors.

The tag-7 probe also validates that every numeric NaN reaches the existing
canonicalization boundary. A non-canonical numeric NaN must never be mistaken
for an immediate BigInt.

### Limb layout and arithmetic component

Compare at least one owned portable limb implementation with any proposed
external component. The owned baseline starts with linear addition and
subtraction, schoolbook multiplication, exact shifts, bitwise operations, and
long division. Faster multiplication, division, exponentiation, parsing, or
printing algorithms enter only after the baseline is a differential oracle.

An external component such as GMP must meet the same contract. Its probe
records:

 -  candidate-edition semantic coverage and required adapter code;
 -  static-link and cross-compilation support for every configured target;
 -  license and redistribution terms;
 -  allocator replacement, failure reporting, and cleanup guarantees;
 -  sanitizer and strict-warning behavior;
 -  global state, thread, locale, and initialization assumptions;
 -  binary size and removable-component behavior; and
 -  performance across small, medium, and genuinely large operands.

No library type crosses the private BigInt adapter. A later backend replacement
must not change MIR, generated C, or observable JavaScript behavior.

This evaluation covers arbitrary-precision JavaScript arithmetic only. A
component such as GMP is not a cryptography provider, and accepting it here
does not make it eligible for Web Crypto or `node:crypto`. Conversely, a
cryptography provider's private multiprecision implementation cannot become
the `OSEO_HEAP_BIGINT` representation.

### Literal and constant representation

Compare exact digit parsing during frontend conversion, compiler-owned
sign-and-magnitude conversion, and runtime parsing of a static string. Record
compiler memory, generated C size, C compilation time, startup work, runtime
allocation, and diagnostic quality across radices and very large literals.

Constant sharing compares per-evaluation materialization with context-owned
immutable values or backing data. The chosen lifetime must work with multiple
contexts, collection, cache reuse, and deterministic teardown.

### Arithmetic thresholds

Schoolbook multiplication and the baseline division algorithm remain the
generic authority until measurements justify a second algorithm. Each
threshold is recorded with operand shapes, target, compiler version, latency,
temporary memory, and code size. Balanced and highly unbalanced operands are
measured separately.

A faster path retains a deterministic way to exercise both sides of its
threshold. It cannot change division rounding, remainder sign, bitwise
infinite two's-complement behavior, or failure order.

### Resource behavior

Parsing, shifts, exponentiation, multiplication, and radix conversion can
request storage far larger than the source or one operand. Every size
calculation checks overflow before allocation. Stress probes cover huge shift
counts, sparse magnitudes, powers near allocation limits, division by zero,
negative exponents, and conversion to small and large radices.

Oseo does not silently round, truncate, or return a partial BigInt when a
resource request fails. The failure follows the runtime's owned allocation
boundary and leaves no published partial object.


Optimization contract
---------------------

BigInt begins with complete generic semantics. Immediate storage is a value
representation, not permission to duplicate operator meaning in the backend.
The generic helper normalizes immediate and heap results through one contract.

Later specialization may keep proven small BigInts in native integer
registers. It checks both operand tags and every result boundary before
committing visible state. Overflow branches to the compiled generic BigInt
operation without replaying conversion, property access, or operand
evaluation.

A multiplication, division, shift, or conversion fast path names its exact
domain and retains a tested generic fallback. Performance reports separate
small immediate values, one-limb heap values where the selected representation
has them, balanced large values, and unbalanced values. One large benchmark
does not justify slowing common `0n` and `1n` operations.


Property and differential evidence
----------------------------------

The BigInt property domain retains a structured sign and magnitude until source
printing. It generates literals in every admitted radix, coercible strings,
objects with observable primitive conversion, operator trees, assignments,
updates, comparisons, and fixed-width conversions. Shrinking preserves the
operation's semantic preconditions and representation boundary of interest.

Every generated program compares Node.js, Deno, specialization-disabled native
execution, specialization-enabled native execution, and forced collection.
Bounded arithmetic also compares an independent sign-and-magnitude model.
Reference disagreement is infrastructure evidence, not an Oseo pass.

Boundary suites concentrate on:

 -  zero, one, minus one, and negative-zero-producing source forms;
 -  the immediate minimum and maximum candidates and adjacent values;
 -  carries, borrows, leading-limb removal, and sign changes;
 -  exact and inexact `Number` comparisons around \(2^{53}\);
 -  mixed-type conversion and exception order;
 -  quotient and remainder signs;
 -  shifts across limb and representation boundaries;
 -  exponentiation success and failure;
 -  `asIntN` and `asUintN` widths around zero and limb boundaries; and
 -  radix parsing and printing round trips.

Allocation properties force collection at each declared safepoint and inject
failure at every allocation attempt in bounded cases. They verify operand
liveness, cleanup, canonical result form, and the absence of a published
partial value.

The suite uses the seed, replay, size, target, and failure-reporting contracts
in [*PLAN-PT.md*](./PLAN-PT.md). A minimized failure records the mathematical
inputs and source, not an implementation-only limb dump.


Fixed and standards evidence
----------------------------

Example-based native fixtures retain cases that random generation alone does
not explain well:

 -  literal grammar and source ranges for every radix and invalid form;
 -  `typeof`, Boolean conversion, property keys, and template interpolation;
 -  strict, loose, and relational comparison across primitive types;
 -  every arithmetic, bitwise, shift, assignment, and update operator;
 -  conversion side effects and abrupt completion order;
 -  intrinsic identity, descriptors, branding, and wrapper behavior;
 -  allocation failure during each allocating operation;
 -  forced collection with heap-backed operands and results; and
 -  generated C and selected assembly at representation boundaries.

The test262 classifier derives BigInt dependencies from syntax, metadata,
source, and named runtime prerequisites. Inventory inclusion does not imply
support. A case moves from unsupported only when every requested strictness,
specialization policy, scheduler mode, and native target required by the
manifest has executable evidence.

The profile records partial checkpoints precisely. A passing BigInt literal
does not promote a case that also needs typed arrays, `Atomics`, JSON hooks, or
an unimplemented prototype method.


Delivery order
--------------

1.  Audit the applicable test262 BigInt inventory and assign syntax, primitive,
    intrinsic, binary-data, atomic, and unrelated prerequisites.
2.  Add owned exact constants and diagnostics without lowering a BigInt into
    the runtime.
3.  Check in the representation, limb, constant, and external-component probes.
4.  Accept an architecture decision for the immediate tag, heap layout,
    arithmetic component boundary, and literal materialization contract.
5.  Implement canonical construction, recognition, Boolean conversion,
    `typeof`, exact comparison, decimal text, rooting, tracing, and cleanup.
6.  Add `ToNumeric`, `ToBigInt`, arithmetic, bitwise, shift, exponentiation,
    assignment, and update semantics with generated and fixed evidence.
7.  Add the `BigInt` intrinsic, prototype, wrappers, `asIntN`, and `asUintN`.
8.  Connect dependent string, JSON, binary-data, and atomic families through
    the shared conversion contract as their own prerequisites land.
9.  Add measured arithmetic algorithms or guarded specializations only where
    the generic implementation exposes a recorded bottleneck.
10. Close the reviewed BigInt inventory or retain unsupported classifications
    with their remaining named owners.

Each admitted checkpoint updates the active profile, test262 manifest,
property domain, package documentation, runtime ABI version, and affected
living design documents in the same change.


Exit criteria
-------------

The BigInt plan is complete only when:

 -  every candidate-edition BigInt literal form has exact owned syntax,
    source-located negatives, and backend-independent constants;
 -  one accepted decision records the immediate and heap representations,
    limb or external-component boundary, target evidence, allocation behavior,
    and replacement triggers;
 -  every BigInt value has one canonical mathematical interpretation across
    construction, arithmetic, representation transitions, and collection;
 -  `ToNumeric`, `ToBigInt`, mixed-type failures, operators, comparisons,
    updates, and property-key conversion follow the specified evaluation and
    abrupt-completion order;
 -  the `BigInt` intrinsic, prototype, wrappers, fixed-width functions, and
    required integration points expose the specified identity and descriptors;
 -  heap-backed values survive forced collection at every safepoint and every
    bounded allocation failure leaves owned state clean;
 -  generated properties compare both reference hosts, both specialization
    policies, both native execution targets, forced collection, and an
    independent bounded model;
 -  Linux AMD64 execution, macOS AArch64 execution, AArch64 Linux compile-link,
    strict warnings, and sanitizers cover the selected representation;
 -  arithmetic thresholds, literal materialization, executable size, retained
    bytes, and allocation counts are reproducible from documented tasks;
 -  no BigInt representation or arithmetic type crosses the opaque key and
    secret boundary defined by [*PLAN-CRYPTO.md*](./PLAN-CRYPTO.md);
 -  the reviewed test262 inventory contains no BigInt result whose
    classification hides a semantic or harness failure; and
 -  `mise run check`, `mise run test`, and the extended property task pass from
    a clean checkout within the published gate budgets.
