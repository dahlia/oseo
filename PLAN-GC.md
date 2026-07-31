Garbage collector evolution plan
================================

Status
------

Implementation status: planned, with an implemented reference collector. Oseo
currently uses a precise, non-moving, stop-the-world mark-and-sweep collector
with linked explicit root frames. That collector remains the correctness
baseline while this plan turns it into a measured production policy and
defines the evidence needed for any later generational, moving, incremental,
parallel, or concurrent collector.

The first checkpoint may proceed during M5 because it changes allocation and
collector infrastructure without adding language semantics. Later checkpoints
depend on representative M5 and M6 workloads. This plan does not reserve a
numbered milestone or select a moving collector before those measurements
exist.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md), [*PLAN-M5.md*](./PLAN-M5.md),
[*PLAN-M6.md*](./PLAN-M6.md), [*PLAN-NIO.md*](./PLAN-NIO.md),
[*PLAN-PT.md*](./PLAN-PT.md), [*PLAN-WASM.md*](./PLAN-WASM.md),
[ADR 0006](./docs/adr/0006-root-stack-and-safepoints.md), and
[ADR 0008](./docs/adr/0008-object-layout-and-shapes.md). Evidence that changes
one of those contracts updates the affected document in the same change.


Goal
----

Oseo needs one collector implementation for every native program backend that
shares the current object model. The compiler owns the semantic facts needed
for collection: safepoints, live heap-bearing values, heap stores, and any
metadata required to find or update those values. A backend chooses how to
encode those facts. The runtime owns allocation, tracing, collection policy,
spaces, barriers, and memory limits.

The current C11 backend may keep linked root frames while another backend uses
stack maps or a different private frame layout. Both must expose equivalent
roots to the same runtime collector and pass the same liveness evidence.
Adding a backend does not create another heap or another collector policy.
A target with an incompatible memory model, such as a future WebAssembly
strategy that uses host-managed references, requires its own representation
decision under [*PLAN-WASM.md*](./PLAN-WASM.md) rather than an accidental copy
of the native collector.

The likely long-term shape is a copying nursery beside a non-moving old
generation and separate large or pinned storage. That shape is a hypothesis,
not an accepted decision. Oseo adopts it only if measured allocation lifetimes
show that minor collection avoids enough full-heap work to pay for relocation,
barriers, promotion, and target-specific metadata.


Non-goals
---------

This plan does not replace the reference collector merely because a more
advanced algorithm exists. It does not select Immix, a semispace collector,
MMTk, or a concurrent design by name before a probe reaches the entry criteria
below.

The plan does not introduce conservative stack scanning. Conservative retention
would weaken Oseo's precise tagged-value contract, hide missing roots, and make
moving collection harder to validate.

It does not define a stable public embedding or native-addon API. Heap layouts,
root encodings, barriers, and handles remain private while the language and
runtime profiles are expanding.

Garbage collection is not the lifetime mechanism for operating-system
operations. Files, sockets, mappings, executable artifacts, and in-flight
buffers keep explicit close, completion, and ownership rules. Collection may
make an unreachable wrapper eligible for cleanup, but a finalizer cannot prove
that a kernel or worker has stopped using a resource.

This plan does not make weak references, finalization, or ephemerons available
to JavaScript. Their language semantics enter through M5 with their own
standards evidence. The tracing interface should leave room to classify weak
edges without exposing them early.


Implemented baseline
--------------------

The current collector has several useful properties:

 -  `OseoValue` tags identify heap references precisely;
 -  generated functions register contiguous root slots in linked frames;
 -  the runtime context owns persistent roots for jobs, promises, timers,
    intrinsics, symbols, and errors;
 -  every implemented heap kind has explicit tracing;
 -  marking uses an iterative work list, so deep and cyclic graphs do not
    recurse on the native stack;
 -  collection can run at every declared safepoint; and
 -  deterministic allocation failure, root-budget failure, strict warnings,
    address sanitization, and undefined-behavior sanitization are ordinary
    test evidence.

The baseline is deliberately simple. Each published object joins one allocation
list, each object is allocated separately, and every collection marks all
reachable objects before sweeping the complete list. Ordinary allocation
triggers collection only in the force-every-safepoint mode. Root slot arrays,
property vectors, argument storage, coercion buffers, and similar auxiliary
allocations use separate allocation and cleanup paths.

Root storage is also conservative within the precise protocol. MIR and the C
backend reserve slots from broad function-level value and argument counts.
That is safe, but it can scan dead slots, retain dead values until a frame
returns, and make wide functions consume more root budget than their live set
requires.

These costs do not yet justify a particular replacement. They define the first
measurements and refactorings.


Collector invariants
--------------------

Every collector policy preserves the following rules:

 -  JavaScript object identity and observable behavior do not depend on a
    physical address;
 -  every operation that may collect is a declared safepoint;
 -  every live heap-bearing value is discoverable at each safepoint;
 -  raw object, field, property-entry, shape, buffer, and code pointers do not
    survive a safepoint unless an accepted contract pins them;
 -  a helper does not collect after producing an unpublished, unrooted result;
 -  every heap kind defines its size, edges, and owned cleanup before allocation
    can collect it;
 -  compiler-owned metadata is validated before generated code or a late
    artifact can run;
 -  specialization does not change root visibility, barrier behavior,
    allocation failure, or collection results; and
 -  exceeding a memory, root, or collector work limit produces an owned failure
    at the documented boundary.

Collection remains private and unobservable except through specified language
features such as future weak references or finalization. Test counters and
diagnostic records are removed before differential output comparison.


Tracing and object metadata
---------------------------

The first structural change replaces value-only marking with mutable slot
visiting. A tracer must receive the address of each `OseoValue` edge rather
than a copied value:

~~~~ c
visit_slot(visitor, &object->prototype);
visit_slot(visitor, &object->properties[index].value);
visit_slot(visitor, &frame->slots[index]);
~~~~

A non-moving collector can mark through the same interface. A moving collector
can rewrite the slot after forwarding its referent. Root frames, context roots,
object fields, indexed storage, continuation state, and runtime-owned queues
all use this one slot contract.

Heap-kind dispatch moves behind a reviewed descriptor table. A descriptor
records enough information to:

 -  identify fixed and variable object size;
 -  enumerate strong `OseoValue` slots;
 -  classify future weak or ephemeron edges;
 -  release non-GC storage owned by the object;
 -  identify large, pinned, executable-artifact, or other special treatment;
    and
 -  support heap verification without duplicating the tracing switch.

Descriptors remain private runtime data. Generating their repetitive parts from
one checked heap-kind schema is preferable once enough kinds exist to justify
the generator. Hand-written special cases may remain where layout or cleanup is
genuinely irregular, but the descriptor inventory must still prove that every
published kind is covered.

Native data that cannot contain `OseoValue` edges need not become a managed
object. Its owner must nevertheless report its bytes, cleanup path, and
relationship to heap reachability. Static matcher tables and read-only program
metadata are examples. Dynamic matcher artifacts, resizable backing stores, and
loaded code records need explicit owners before they can outlive a call.


Root metadata and backend boundary
----------------------------------

MIR records the live heap-bearing values at each safepoint. A compiler pass
validates those live sets, assigns reusable root locations, and clears a
location when its value is no longer live. Function-wide root counts remain a
checked storage bound, not a substitute for safepoint liveness.

The C11 reference path may continue to push one linked frame around a generated
function or a bounded region. Its slot stores must reflect the compiler-owned
live sets. A later backend may encode the same facts in stack maps, spill
locations, callee-save registers, or smaller shadow frames. The runtime sees a
`RootEnumerator` behavior, not a backend name.

A root-liveness replay compares the MIR live set at every possible collection
with the roots reported by the generated artifact. It covers normal calls,
abrupt exits, cleanup regions, constructors, suspension, resumption, runtime
callbacks, and late artifacts when those capabilities land. A backend cannot
infer missing liveness by scanning generated machine code.

The compiler also identifies every heap store that may need a barrier. The
initial non-generational collector emits no barrier work, but pointer-bearing
stores should pass through a small owned operation or an equally inspectable
lowering rule before a generational probe begins. Direct assignments scattered
through generated and runtime code are not a safe barrier insertion strategy.


Production mark-and-sweep checkpoint
------------------------------------

The first checkpoint keeps objects non-moving and collection stop-the-world.
It adds the policy and accounting missing from the reference implementation
before changing the collection algorithm.

The runtime records requested, committed, live, and peak bytes. It distinguishes
managed object bodies, managed backing stores, root storage, collector
metadata, and native or external storage retained on behalf of heap objects.
Counters must not pretend that a separately allocated property vector costs
nothing merely because the object header is small.

Ordinary allocation triggers collection from an explicit policy based on bytes
allocated since the last collection, the previous live size, a minimum growth
allowance, and the configured heap limit. Exact constants are measurement
inputs, not ABI. Tests can replace the adaptive policy with a deterministic
threshold.

An allocation that cannot be satisfied may request one full collection and
retry once when doing so is safe. A second failure returns the owned allocation
failure. Arithmetic that computes object, backing-store, or heap sizes is
checked before allocation.

Each collection records:

 -  reason and collector policy;
 -  heap bytes and object counts before and after collection;
 -  roots and heap slots visited;
 -  mark, sweep, and total pause time;
 -  reclaimed objects and bytes;
 -  auxiliary and external bytes retained by live owners;
 -  high-water marks and configured limits; and
 -  target, backend, specialization, sanitizer, and workload identity.

These observations are private diagnostics. Ordinary programs do not read them.

The first checkpoint may retain one native allocation per object. A separate
allocator probe compares that baseline with pages and size classes for small
objects plus a large-object path. A page allocator lands only with evidence for
allocation throughput, sweep cost, committed memory, fragmentation, sanitizer
coverage, and both supported execution targets.


Collector test modes
--------------------

One stress switch cannot expose every class of collector defect. The native
and property harnesses should support these explicit modes:

 -  ordinary adaptive collection;
 -  full collection at every declared safepoint;
 -  a tiny deterministic heap or allocation-debt threshold;
 -  collection before a selected allocation count;
 -  deterministic allocation and root-budget failure;
 -  heap verification before and after collection; and
 -  barrier and remembered-set verification once a generational probe exists.

Moving probes add forced evacuation, forced promotion, and pinned or
large-object cases. Incremental probes add a deterministic slice schedule.
Parallel or concurrent probes retain the thread schedule facts needed to
distinguish a reproducible semantic failure from an unrecorded race.

The heap verifier checks headers, kind descriptors, object extents, slot tags,
allocation-space membership, forwarding state where applicable, remembered
edges, root-frame links, and accounting totals. It must be callable from tests
without changing the source program's behavior.


Measurement corpus
------------------

Collector comparisons use complete behaviors rather than allocation
microbenchmarks alone. The initial corpus includes:

 -  the native differential fixtures with both specialization policies;
 -  deep, wide, cyclic, and heavily shared object graphs;
 -  closures, exceptions, constructors, modules, promises, continuations,
    queues, timers, and top-level `await`;
 -  M5 grammar-generated programs and applicable test262 cases;
 -  regular expression object, artifact, work-area, and result workloads when
    that family lands; and
 -  compiler-core functions admitted by the self-hosting profile.

M6 adds long-running server-style workloads with events, abort state, streams,
fetch buffers, Web Crypto, WebAssembly, native completions, and idle periods.
M7 contributes representative package graphs and file workloads. Dynamic
artifact and REPL probes enter only after their own loader and lifetime
contracts are accepted.

Allocation-only probes remain useful for isolating allocator cost, survival
curves, promotion, remembered-set traffic, and fragmentation. They cannot by
themselves justify a project-wide collector migration.


Measurements and retained evidence
----------------------------------

Every retained run names the source revision, target, program backend,
collector implementation and policy, specialization mode, sanitizer mode,
workload, warmup rule, repetition count, and host load assumptions.

The measurement record includes:

 -  allocation count, requested bytes, committed bytes, peak resident memory,
    and allocation throughput;
 -  live bytes after each full collection and survival by object kind;
 -  root slots reserved, reported, live, and visited;
 -  collection count, causes, total collector time, maximum pause, and pause
    percentiles;
 -  bytes traced, swept, copied, promoted, and pinned where applicable;
 -  remembered-set size, barrier executions, dirty-card work, and verified
    old-to-young edges;
 -  free-space distribution, large-object bytes, and measured fragmentation;
    and
 -  workload throughput and tail latency outside collection.

Measurements separate collector improvement from semantic or build changes.
A faster run that drops forced-collection, sanitizer, target, or differential
coverage is not comparable evidence. A lower pause that raises memory beyond a
reviewed bound records the tradeoff rather than being reported as an
unqualified win.


Generational collector investigation
------------------------------------

A generational probe begins only when the production mark-and-sweep checkpoint
has complete accounting and representative workloads show all of the
following:

 -  allocation or full-heap collection consumes a material part of a reviewed
    workload;
 -  survival measurements show a useful short-lived population;
 -  root and slot tracing can update mutable locations;
 -  heap stores pass through an auditable barrier boundary;
 -  the native I/O buffer decision defines copying, pinning, or native storage;
    and
 -  both supported execution targets can run the probe with the required
    sanitizers and metadata checks.

The first moving probe should keep its scope narrow: a bump-allocated copying
nursery, a non-moving old generation, and a separate large-object path. Objects
that exceed a measured size, require a stable address, or own incompatible
native storage bypass the nursery. Promotion age and nursery size remain policy
inputs.

The remembered set records old-to-young edges. The probe compares card marking
with any simpler precise set only if both use the same compiler-owned store
inventory. A verification mode scans the old generation after each minor
collection and fails if an edge was missing from the remembered set.

Relocation uses forwarding state and updates every root and heap slot through
the slot visitor. A copied object cannot leave a stale interior pointer,
property entry pointer, matcher work pointer, or runtime queue pointer behind.
The existing rule that raw pointers are reacquired after a safepoint remains
mandatory.

An architecture decision selects, defers, or rejects the generational design.
It records nursery organization, promotion, barriers, large objects, pinned
objects, interior pointers, target metadata, failure behavior, and rollback to
the non-moving reference collector.


Old-generation and latency candidates
-------------------------------------

The first generational probe does not need a sophisticated old generation.
Page-based non-moving mark-and-sweep keeps native ownership and diagnosis
simple. Later evidence may open narrower investigations:

| Evidence                                           | Candidate investigation                               |
| -------------------------------------------------- | ----------------------------------------------------- |
| sweep time or fragmentation dominates              | segregated pages, lazy sweep, or a mark-region design |
| long full-collection pauses dominate               | incremental old-generation marking                    |
| collector CPU limits throughput on multicore hosts | parallel marking or sweeping                          |
| pause remains unacceptable after incremental work  | concurrent old-generation collection                  |
| explicit root traffic dominates generated code     | denser shadow frames or backend stack maps            |
| copying native buffers dominates I/O workloads     | bounded pinning or a dedicated stable buffer space    |

Incremental marking requires a barrier and a deterministic slice model.
Concurrent collection additionally requires a memory model, mutator
coordination, root handshakes, shutdown rules, sanitizer strategy, and race
replay evidence. Neither enters because a server runtime is expected to be
concurrent eventually. Tail-latency measurements must identify the pause that
the added machinery is meant to remove.

An Immix-style or other mark-region old generation is a candidate only after
the page baseline measures fragmentation and evacuation opportunity. Fully
compacting the old generation is not the default assumption because native I/O
and future host integration benefit from an explicit stable-address boundary.


External collector toolkits
---------------------------

An external toolkit such as [MMTk] may be probed after Oseo has the same
runtime boundaries that an external collector would require: mutable slot
tracing, root enumeration, object-size and layout descriptors, barrier hooks,
allocation slow paths, and target-specific build support.

The probe compares integration size, build and distribution cost, supported
targets, available policies, diagnostics, sanitizer behavior, and the amount of
Oseo-specific fast-path code retained in generated or runtime C. A no-collection
or mark-sweep binding is useful boundary evidence, not proof that a production
policy is ready.

The internal interfaces should not copy one toolkit's public types. Oseo must
remain able to keep its reviewed C collector when a toolkit lacks a target,
complicates static distribution, or cannot express the private object and
failure contracts.

[MMTk]: https://www.mmtk.io/


Relationship to other tracks
----------------------------

M5 owns language semantics and standards coverage. This plan owns collector
policy, memory accounting, tracing metadata, and collector-specific
measurements. New M5 heap kinds use the descriptor and slot contracts, while
the production mark-and-sweep checkpoint can proceed without changing the M5
compatibility count.

M6 supplies the first long-running web workloads likely to expose retained
memory and tail pauses. API components still own their JavaScript roots and
resource cleanup. A collector optimization cannot replace an explicit abort,
stream, fetch, or shutdown lifetime.

[*PLAN-WASM.md*](./PLAN-WASM.md) owns WebAssembly stores, instances, linear
memories, tables, globals, references, wrappers, and compiled artifacts. This
plan owns their managed-slot tracing, native and external byte accounting,
stable-address or pinning costs, and collector verification. Linear bytes are
not scanned as `OseoValue` slots, while tables or globals that retain JavaScript
references must expose mutable slots through the ordinary tracing contract.

[*PLAN-NIO.md*](./PLAN-NIO.md) owns operation completion and native buffer
lifetime. This plan owns stable heap addresses, pinned spaces, and the
collector cost of any pinning choice. The first native I/O implementation may
prefer runtime-owned native storage so moving collection does not wait for a
general pinning API.

[*PLAN-BACKEND.md*](./PLAN-BACKEND.md) owns program code generation. This plan
owns the collector and the behavior through which a backend reports roots and
barrier sites. A backend replacement and a collector replacement are separate
decisions even when one probe shares stack-map evidence with the other.

[*PLAN-DYN.md*](./PLAN-DYN.md) and [*PLAN-REPL.md*](./PLAN-REPL.md) own loaded
code publication and lifetime. This plan supplies tracing and companion-table
rules that can retain an artifact through live functions, continuations,
frames, jobs, and diagnostics. Raw instruction pointers never become ordinary
heap edges.

[*PLAN-REGEXP.md*](./PLAN-REGEXP.md) owns matcher artifacts and work areas.
Dynamic artifacts report their managed and native bytes through this plan's
accounting contract. Static read-only artifacts do not enter the movable heap
merely to reuse object tracing.

[*PLAN-PT.md*](./PLAN-PT.md) owns generators, shrinking, replay, execution
tiers, and retained property failures. This plan adds collector modes, heap
verification, liveness replay, barrier verification, and measurement fields to
that shared infrastructure.


Decision and replacement triggers
---------------------------------

The non-moving reference collector remains available until an accepted
decision says otherwise. A trigger opens an investigation; it does not choose
the result.

 -  unbounded ordinary heap growth shows that the production mark-and-sweep
    checkpoint is required before more long-running workloads are admitted;
 -  allocation cost or full-heap collection exceeds a reviewed throughput or
    pause budget;
 -  measured short-lived allocation makes nursery collection likely to avoid
    substantial old-heap work;
 -  fragmentation or sweep cost exceeds the recorded page or object-list
    baseline;
 -  M6 or M7 tail latency repeatedly exceeds a reviewed budget because of a
    named collector phase;
 -  root traffic or explicit-frame size exceeds a reviewed code-size, memory,
    or call-cost budget;
 -  a native I/O or late-artifact consumer needs a stable-address contract that
    current native copying cannot satisfy within its budget; or
 -  a supported target or backend cannot provide required collector metadata
    safely through the current encoding.

An isolated microbenchmark, an unrecorded production impression, or preference
for a collector family is not a replacement trigger.


Delivery order
--------------

1.  Freeze the collector measurement schema and add complete managed,
    auxiliary, root, collector, and external-memory accounting.
2.  Add an ordinary automatic collection policy, explicit heap limit,
    collect-and-retry allocation path, and private per-cycle observations while
    retaining non-moving mark-and-sweep.
3.  Replace value-only marking with mutable slot visiting. Put heap-kind size,
    tracing, and cleanup behind a complete descriptor inventory.
4.  Implement safepoint-specific root liveness, slot reuse, dead-slot clearing,
    and root-liveness replay for the C11 path.
5.  Add heap verification and the ordinary, every-safepoint, tiny-heap,
    selected-allocation, and failure-injection modes to the shared native and
    property harness.
6.  Measure the object-list and per-object-allocation baseline. Probe pages,
    size classes, and a large-object path only where the observations justify
    them.
7.  Route heap pointer stores through an auditable compiler and runtime
    boundary without adding barrier work to the reference collector.
8.  Collect survival, root-density, allocation, fragmentation, throughput, and
    pause evidence from the M5 corpus and the first representative M6
    workloads.
9.  If the generational entry criteria pass, build the bounded copying-nursery
    probe with a non-moving old generation, large-object path, remembered set,
    barrier verifier, forced promotion, and both execution targets.
10. Record an architecture decision that selects, defers, or rejects the
    generational design. Move selected production work into reviewable units
    while the reference collector stays green.
11. Investigate old-generation layout, incremental work, parallelism,
    concurrency, stack maps, or general pinning only when a recorded trigger
    names the cost each candidate should remove.
12. Re-run the complete ordinary, standards, property, sanitizer, target, and
    workload corpus before changing a default collector policy.

Each checkpoint updates its measurements and affected living documents. A
rejected allocator, barrier, toolkit, or collector probe remains useful
evidence and does not need to survive as production code.


Documentation changes
---------------------

The production mark-and-sweep checkpoint updates [*DESIGN.md*](./DESIGN.md),
[*docs/runtime-components.md*](./docs/runtime-components.md), runtime package
documentation, and contributor commands that exist at that point. It records
the selected allocation policy and limits without turning private constants
into language guarantees.

A moving or generational decision updates ADR 0006 or supersedes its
collector-specific part with a new record. It also updates ADR 0008 where
object headers, layout identity, or metadata movement changes. Backend,
native-I/O, dynamic-artifact, and REPL records change only when their own
encoding or lifetime contracts are affected.

[*ROADMAP.md*](./ROADMAP.md) records whether this track is at the reference,
production mark-and-sweep, generational investigation, or selected
implementation stage. Public CLI documentation names collector or heap options
only after they are supported and tested interfaces.


Exit criteria
-------------

The production mark-and-sweep checkpoint is complete when:

 -  ordinary execution collects from a documented adaptive policy and respects
    a checked heap limit;
 -  managed, auxiliary, root, collector, and external memory are accounted
    without double counting;
 -  an eligible failed allocation collects and retries once before returning
    an owned failure;
 -  every heap kind uses mutable slot tracing and the complete descriptor
    inventory;
 -  safepoint liveness, root location reuse, and dead-slot clearing are
    validated against generated C;
 -  heap verification and every required collector test mode pass;
 -  cycle observations and workload measurements are reproducible on Linux
    AMD64 and macOS AArch64, with AArch64 Linux retaining compile-link and
    structural evidence; and
 -  `mise run check`, `mise run test`, the applicable native tasks, and the
    extended property task pass from a clean checkout.

A later collector investigation is complete when its trigger, baseline,
candidate, target support, memory tradeoff, pause and throughput results,
failure behavior, and maintenance cost are retained, and an accepted
architecture decision selects, defers, or rejects it. This track remains a
living plan after any one decision because M6, M7, dynamic artifacts, and
self-hosting will add new allocation and lifetime evidence.
