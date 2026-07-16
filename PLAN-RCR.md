C runtime componentization plan
===============================

Status
------

Implementation status: ready, not started. M4 left the native runtime with
4,714 lines in *runtime.c*, 476 lines in *oseo\_runtime.h*, and roughly 149 C
functions. The implementation is still testable, but M5 will add enough
intrinsics and generic semantics that continuing in one translation unit would
make ownership and review harder to sustain.

This is a cross-milestone refactoring plan. It does not replace
[*PLAN-M5.md*](./PLAN-M5.md) or [*PLAN-PT.md*](./PLAN-PT.md), and it does not
advance the M5 compatibility manifest by itself. It is governed by
[*WHITEPAPER.md*](./WHITEPAPER.md), [*DESIGN.md*](./DESIGN.md),
[*ROADMAP.md*](./ROADMAP.md), the frozen language profiles, and accepted records
under *docs/adr/*. Evidence that changes one of those contracts updates the
affected document in the same change.


Goal
----

Split the C runtime into independently compiled components with explicit
ownership and a narrow internal interface. Generated programs retain the same
runtime ABI, value representation, collector protocol, JavaScript behavior,
diagnostics, and target support throughout the migration.

The result should make the next semantic change easier to place and review.
File count or line count alone is not success. Each component must own one
coherent part of the runtime, expose only the helpers required by another
component, and preserve the generic behavior that specialization falls back to.


Entry evidence
--------------

The refactoring begins from these current contracts:

 -  *runtime.c* provides value helpers, context management, collection,
    bindings, objects, functions, coercions, operators, promises, jobs, timers,
    and event-loop execution in one translation unit;
 -  *oseo\_runtime.h* is the generated-code boundary and currently exposes the
    value, result, root-frame, context, cache, and callable contracts needed by
    emitted C;
 -  `RuntimeInput.assets` can describe more than one source asset, but
    `NativeBuildInput`, the CLI, `@oseo/testkit`, and the Zig adapter currently
    select exactly one runtime source path;
 -  the Zig adapter compiles that source once, archives one object, and links
    generated C against the archive;
 -  package checks currently require only *oseo\_runtime.h* and *runtime.c*;
 -  native differential fixtures cover x86-64 execution and AArch64
    compile-link behavior;
 -  forced collection, allocation failure, strict warnings, undefined-behavior
    sanitization, assembly inspection, and deterministic asynchronous property
    tests already exercise the runtime; and
 -  the runtime ABI is private to Oseo releases and does not promise native
    addon compatibility.


Scope
-----

This plan owns:

 -  multiple reviewed C source assets in one runtime input;
 -  deterministic compilation and archiving of every runtime translation unit;
 -  one private header for shared runtime representation and helper contracts;
 -  responsibility-based extraction from *runtime.c*;
 -  checks for missing, duplicate, or accidentally public runtime symbols;
 -  package staging and publication of every required native asset; and
 -  documentation of the resulting internal ownership rules.

The work does not add ECMAScript syntax, built-ins, host APIs, optimizations, or
specialization. It does not redesign NaN boxing, object layout, the collector,
the call result, asynchronous scheduling, or the event-loop policy. Making
`OseoContext` opaque, stabilizing an external C ABI, replacing C11, and changing
the native backend remain separate architecture work.

A move that reveals a semantic bug stops being a mechanical extraction. The
bug receives a failing regression, a focused fix, and its own reviewed change
before componentization continues.


Target source layout
--------------------

The initial component map is:

 -  *oseo\_runtime.h* retains declarations and inline operations required by
    generated C;
 -  *runtime\_internal.h* owns heap layouts, private tags, shared allocation
    helpers, and cross-component declarations;
 -  *runtime\_core.c* owns results, context lifecycle, diagnostics, call limits,
    frames, and root-stack operations;
 -  *runtime\_memory.c* owns allocation, tracing, collection, and destruction;
 -  *runtime\_binding.c* owns environments, cells, and module namespaces;
 -  *runtime\_object.c* owns strings used as property keys, arrays, ordinary
    objects, descriptors, prototypes, and property caches;
 -  *runtime\_function.c* owns function creation, callable metadata,
    construction, and generic dispatch;
 -  *runtime\_primitive.c* owns coercions, arithmetic, comparison, string
    conversion, and console output;
 -  *runtime\_promise.c* owns promises, capabilities, reactions, thenable jobs,
    combinators, and rejection tracking; and
 -  *runtime\_event\_loop.c* owns timer conversion, timer queues, task
    checkpoints, top-level await progress, and shutdown.

This map is a starting hypothesis. The first dependency inventory may merge or
rename a component when the code shows a tighter invariant than the proposed
boundary. It may not collapse unrelated object, call, promise, and scheduler
semantics back into one catch-all source file merely to avoid an internal
interface.

No C source file includes another C source file. Generated tables, if M5 later
introduces them, remain distinguishable from manually maintained
implementations and receive their own size and generation contract.


Header and symbol boundaries
----------------------------

*oseo\_runtime.h* remains the only header included by generated C and direct
native fixtures. A declaration stays there only when emitted code or an
intentional fixture calls it, embeds its type, or needs its inline operation.
Existing layout exposure remains unchanged during this refactoring even when a
future design could make it opaque.

*runtime\_internal.h* is private to `@oseo/runtime-c`. It may expose shared heap
layouts and helpers needed by more than one runtime component. It must not be
included by generated C, the C backend, or a package outside
`@oseo/runtime-c`.

A helper used by one component remains `static`. A cross-component helper uses
an internal name and one declaration in *runtime\_internal.h*. Extraction must
not turn a file-local helper into a generated-code ABI merely because two new
translation units need it. The final archive defines each non-inline public or
internal symbol exactly once.

The `abiVersion` changes only if the contract consumed by generated C changes.
Moving an unchanged definition between translation units is not an ABI change.
Any unavoidable generated-code ABI change is isolated, updates every direct
fixture caller, and is not hidden inside a mechanical extraction commit.


Multiple-source build contract
------------------------------

The runtime provider lists every header and source as a reviewed asset in a
stable order. The CLI and `@oseo/testkit` copy all assets and pass every source
path to the native toolchain. They reject a runtime with no source, duplicate
asset names, or a source path that is lost during copying.

`NativeBuildInput` changes from one `runtimeSourcePath` to an immutable ordered
collection of runtime source paths. The Zig adapter compiles each source with
the same target, C11 mode, warning policy, sanitizer policy, and include path.
It gives each object a deterministic collision-free name, archives objects in
input order, and links generated C only after the complete archive exists.

Filesystem enumeration and shell glob order do not select sources or archive
order. A clean checkout and a packaged `@oseo/runtime-c` artifact must produce
the same reviewed asset list and build plan.


Ownership and dependency rules
------------------------------

Runtime components depend on representation and helper contracts, not on
another component's private implementation order. Initialization and teardown
remain explicit in context lifecycle functions. A component that adds rooted
state records how tracing, destruction, and failure cleanup reach it.

Cross-component calls must preserve these invariants:

 -  every allocation can trigger collection at its declared safepoint;
 -  a raw heap pointer is reacquired from a rooted `OseoValue` after a
    collecting call;
 -  a thrown completion retains its value, diagnostic, and source location
    across cleanup and scheduler checkpoints;
 -  property access, coercion, calls, promise settlement, and timer conversion
    retain their observable left-to-right order;
 -  context initialization and destruction leave no component-owned queue,
    singleton, or allocation unvisited; and
 -  specialization counters and generic fallbacks remain independent of file
    placement.

An internal helper should express a semantic operation or ownership transfer.
It should not expose a component's whole representation merely to avoid a
small, named interface. Cyclic component dependencies are recorded during the
inventory and removed where a stable lower-level operation can replace them.
An irreducible cycle is documented rather than hidden through duplicated state
or source inclusion.


Migration method
----------------

Before the first extraction, record the current runtime assets, generated-code
declarations, archive symbols, native observations, selected binary sizes, and
ordinary and extended property budgets. This evidence is a comparison point,
not a promise of byte-identical object files.

The build path gains multi-source support while the runtime still has one C
source. This separates build-contract failures from later source movement.
Tests then prove two minimal translation units compile, archive, package, and
link in deterministic order before production code is split.

Create *runtime\_internal.h* with only the representation already shared inside
*runtime.c*. Extract one responsibility at a time. Prefer leaves with few
dependencies, then bindings, objects, functions, primitives, promises, and the
event loop. Keep context, tracing, and destruction changes paired whenever a
moved heap kind touches all three.

Each extraction commit is mechanical and green. It adds or adjusts structural
tests for the boundary being introduced, runs focused package and native tests,
and leaves behavior changes for separate commits. Temporary forwarding helpers
are allowed only when they have a named removal checkpoint in this plan.


Test and compatibility evidence
-------------------------------

Package tests verify the complete ordered asset list and reject duplicate or
missing sources. Compiler, CLI, testkit, and toolchain tests cover multi-source
copying, deterministic object names, ordered archive construction, startup
failures, compile failures in any component, cleanup, and retained failure
metadata.

Every translation unit compiles independently under strict C11 warnings and
the selected sanitizer policy. Structural checks verify that public header
declarations remain defined, internal helpers do not become unintended public
ABI, and no component relies on inclusion order or an implicit declaration.

Existing differential fixtures must retain identical JavaScript observations
under Node.js, Deno, specialization-disabled native execution, and
specialization-enabled native execution. Runtime counter records remain
private. Forced collection and allocation-failure cases run throughout the
migration, not only after the final file move.

The ordinary gate remains `mise run check` followed by `mise run test`. Because
the work changes runtime and toolchain behavior, every extraction also runs the
applicable focused tasks reported by `mise tasks`, and the completed migration
runs `mise run test:property:extended` from a clean checkout. x86-64 execution,
AArch64 compile-link, assembly inspection, package dry runs, and sanitizer
evidence remain required.


Documentation changes
---------------------

The first implementation change updates [*DESIGN.md*](./DESIGN.md) to describe
the public and private runtime headers, multiple translation units, and the
deterministic archive boundary. It updates the `@oseo/runtime-c` package
documentation when the reviewed asset list changes.

[*PLAN-M5.md*](./PLAN-M5.md) should name this plan as the prerequisite for
large intrinsic tables and built-in families. [*ROADMAP.md*](./ROADMAP.md)
records completion as an M5-enabling refactor without counting it as new
ECMAScript compatibility. Commands and source names are documented as current
behavior only after they land.


Delivery order
--------------

1.  Record the runtime dependency inventory, generated-code ABI declarations,
    archive symbols, asset list, and baseline native observations.
2.  Extend compiler, CLI, testkit, and toolchain contracts to carry an ordered
    collection of runtime C sources. Prove deterministic multi-source builds
    before splitting production code.
3.  Add *runtime\_internal.h*, define the public and internal symbol checks, and
    move shared private representations without changing layout.
4.  Extract core lifecycle and memory management while preserving root,
    safepoint, tracing, destruction, and failure-injection behavior.
5.  Extract bindings, objects, functions, and primitive operations in small
    dependency-ordered changes.
6.  Extract promises and event-loop behavior, preserving queue ownership,
    abrupt completion, timer ordering, and shutdown.
7.  Remove temporary forwarding helpers, reduce *runtime.c* to no remaining
    catch-all implementation, and update package and architecture documents.
8.  Run clean-checkout ordinary and extended gates, compare the recorded
    observations and size evidence, and record any justified difference.

The plan remains active until the final verification is recorded. M5 semantic
work may proceed in an already extracted component only when it does not blur a
pending mechanical move or prevent a before-and-after comparison.


Exit criteria
-------------

The refactoring is complete only when:

 -  every reviewed runtime C source is an explicit ordered runtime asset and is
    compiled as its own translation unit;
 -  the Zig build plan archives all runtime objects deterministically for every
    supported target;
 -  *oseo\_runtime.h* contains only the generated-code and intentional fixture
    boundary, while *runtime\_internal.h* remains package-private;
 -  each runtime responsibility has one documented owner and no catch-all
    *runtime.c* implementation remains;
 -  public, internal, and file-local symbols satisfy the declared ownership
    rules without duplicate or unresolved definitions;
 -  all heap kinds retain complete allocation, tracing, destruction, and
    failure-cleanup coverage;
 -  JavaScript observations, diagnostics, queue ordering, shutdown, and
    specialization invariance match the recorded baseline;
 -  generated C continues to compile without depending on runtime source order
    or internal declarations;
 -  package archives contain every required header and source and build from a
    clean unpacked artifact;
 -  strict warnings, sanitizers, x86-64 execution, AArch64 compile-link,
    assembly inspection, and forced-collection tests pass; and
 -  `mise run check`, `mise run test`, and
    `mise run test:property:extended` pass from a clean checkout.
