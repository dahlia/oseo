M4 plan for modules and asynchronous execution
==============================================

Status
------

Implementation status: in progress. The profile and four boundary decisions are
frozen, the property runner is active, owned module syntax and graph discovery
have landed, and the linker now fixes live-cell identity, namespace names,
strongly connected components, and dependency-first evaluation order. Named
and default bindings now lower through one shared MIR environment. Namespace
objects and the native CLI graph workflow are the next checkpoint.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md), the frozen language
profiles, and the accepted records under *docs/adr/*.


Current evidence
----------------

 -  [*docs/language-profile-m4.md*](./docs/language-profile-m4.md) freezes the
    admitted grammar, resolver, promise, asynchronous, timer, and shutdown
    surface.
 -  ADRs 0009 through 0012 record module identity, promise jobs, asynchronous
    continuations, and the event-loop boundary.
 -  `fast-check` runs unchanged property sources under Node.js and Deno with
    ordinary and extended replay budgets.
 -  Babel converts static module declarations into Oseo-owned syntax without
    leaking parser nodes.
 -  Graph discovery deduplicates canonical identities, preserves source order,
    records source hashes, and terminates across cycles.
 -  Node.js and Deno file loaders share relative `file:` URL resolution and
    stable content hashing without package or ambient search behavior.
 -  Static linking resolves local, indirect, and star exports to shared cells;
    reports missing or ambiguous names; sorts namespace keys; and records
    deterministic strongly connected components.
 -  Whole-graph HIR reuses exporter cell identities for imported names and
    lowers synchronous module bodies once in dependency-first order.


Goal
----

M4 turns the single-script compiler into a server-oriented module runtime. It
adds static ECMAScript module graphs, live bindings, promises, asynchronous
execution, and a replaceable native event loop without embedding Node.js or
Deno in produced executables.

Every admitted feature must have generic semantics before specialization. A
module or job-queue optimization may change scheduling cost, but never binding
identity, evaluation order, promise settlement, or observable shutdown.


Entry evidence
--------------

 -  owned syntax, HIR, MIR, C lowering, runtime, host, and toolchain behavior
    remain in separate packages;
 -  closures share traced mutable cells and survive forced collection;
 -  calls and constructors carry receiver and code identity without exposing C
    function pointers as JavaScript values;
 -  normal, return, throw, break, and continue completions cross `finally`
    through explicit MIR state;
 -  descriptors, prototypes, arrays, and own-key enumeration have generic
    runtime authority;
 -  specialization-disabled and specialization-enabled native executions are
    differential fixtures; and
 -  x86-64 execution, AArch64 compile-link checks, strict C warnings, and
    sanitizer runs are ordinary repository gates.


Source profile
--------------

The first M4 change creates *docs/language-profile-m4.md*. It freezes the exact
module grammar, promise built-ins, asynchronous syntax, resolver inputs, and
event-loop APIs before the frontend accepts them.

The intended final profile includes:

 -  static imports and exports with string module specifiers;
 -  default, named, namespace, and side-effect-only imports;
 -  local, indirect, and star exports;
 -  live bindings, cycles, and module namespace objects;
 -  `Promise` construction, settlement, chaining, and reaction jobs;
 -  asynchronous functions, `await`, and top-level await; and
 -  the minimal timer surface required to test task and microtask ordering.

Dynamic import may enter only for graphs that the resolver can close before
native linking. Import attributes, JSON modules, WebAssembly modules, CommonJS,
package resolution, `eval`, and the `Function` constructor remain outside M4.
A withheld form receives a source-located diagnostic rather than approximate
module or scheduling behavior.


Module boundary
---------------

The compiler core defines host-neutral source and resolution interfaces. A
resolver receives the importing module's canonical identifier and one source
specifier, then returns a canonical identifier or an owned diagnostic. It does
not read files, fetch URLs, inspect *package.json*, or consult process state.

Node.js and Deno host adapters provide filesystem and URL loading for compiler
execution. The CLI composes one loader and resolver policy explicitly. The
resolved graph records every canonical identity and source hash so native
linking is deterministic and duplicate spellings cannot create duplicate
module instances.


Module lifecycle
----------------

Parsing, linking, instantiation, and evaluation are separate phases. Owned
module syntax records import and export entries without retaining bootstrap
parser nodes. Linking resolves names and star exports before code generation.
Instantiation allocates all module environments before any body executes.
Evaluation follows the linked dependency graph and reports failures through the
ordinary completion ABI.

Imported and exported bindings reuse the traced mutable-cell contract from M3.
An import refers to the exporter's cell rather than copying its value. Reads
retain temporal-dead-zone checks. Module namespace objects expose sorted export
names, stable identity, live reads, and the immutable behavior frozen by the M4
profile.

Cycles use an explicit graph algorithm with inspectable states. Native C call
order or recursive host loading must not determine whether a strongly connected
component instantiates or evaluates correctly.


Promises and jobs
-----------------

Promises are runtime heap values with pending, fulfilled, and rejected states.
Reaction records retain handlers, capability promises, and the job that resumes
their continuation. Settlement is idempotent. Resolution handles self-resolution
and thenable behavior only to the extent admitted by the frozen profile.

The runtime owns a FIFO microtask queue. Calling a reaction never uses a host
promise or host microtask. Each job is an explicit rooted record, and draining
jobs cannot retain completed reactions accidentally. Unhandled rejection state
is observed only at the documented checkpoint, not at an incidental allocation
or process exit.


Asynchronous lowering
---------------------

An asynchronous function lowers to an explicit resumable state machine. The
native C stack is not suspended across `await`. Locals that survive suspension
move into a traced continuation record, while dead locals remain ordinary frame
values. Resumption enters through the generic call and completion conventions.

Top-level await extends module evaluation with promise capabilities and graph
state. Dependencies resume before their importers. Cyclic asynchronous graphs
must either complete in the specified order or report the profile's
deterministic cycle failure. They may not deadlock because of native recursion
or queue implementation details.


Event-loop boundary
-------------------

The runtime defines a replaceable event-loop interface for microtasks, timers,
I/O readiness, wakeups, and shutdown decisions. The initial native adapter may
use one measured platform library, but compiler IR and JavaScript semantics do
not depend on that library's handles or callbacks.

Microtasks drain at the checkpoints frozen by the profile. Timers enter the task
queue after their deadline and preserve documented ordering for equal deadlines.
The executable exits only when no runnable job or referenced native handle can
make progress. Pending promises alone do not keep it alive unless the profile
records a live producer.


Rooting and failure model
-------------------------

Module records, namespace objects, environments, promise reactions,
continuations, queued jobs, timer callbacks, thrown values, and unhandled
rejections are collector-managed. Every allocation or collecting host boundary
is an explicit MIR safepoint. No raw runtime pointer crosses one.

Language-visible module evaluation failures and promise rejections use ordinary
JavaScript completion. Resource limits, loader failures, unsupported host
capabilities, and native allocation failures remain owned diagnostics unless a
later record deliberately makes one catchable.


Specialization invariance
-------------------------

M2 and M3 guarded operations remain removable inside modules and asynchronous
functions. Tests run with specialization enabled and disabled across import
cycles, closure capture, suspension, rejection, and queue draining. A miss must
reach the same compiled generic block without rescheduling a job or replaying an
import, property key, call, or other visible effect.


Test and compatibility evidence
-------------------------------

Differential fixtures compare Node.js, Deno, and native execution where the M4
profile shares behavior. Structural tests inspect module graphs, strongly
connected components, live-cell identity, continuation layouts, job ordering,
and emitted C. Generated tests mutate graph order, export spelling, cycle shape,
settlement order, rejection timing, suspension points, hints, and
specialization policy.

The test262 adapter gains module, promise, asynchronous-function, and top-level
await execution. Each result records the suite revision, path, frontmatter,
strictness mode, harness includes, expected phase, actual phase, and native
observation. Unsupported and harness failures remain separate from semantic
passes and failures.

Force collection at every declared safepoint. Inject deterministic allocation,
loader, timer, and queue failures. Run strict warnings and undefined-behavior
sanitization for generated C, address and undefined-behavior sanitization for
the runtime, and compile-link the complete native corpus for AArch64.


Delivery order
--------------

1.  Freeze *docs/language-profile-m4.md* and accept records for module identity,
    promise jobs, asynchronous frames, and the native event-loop boundary.
2.  Add owned module syntax and host-neutral graph loading without evaluating
    modules.
3.  Link imports and exports, instantiate live cells, and evaluate synchronous
    graphs including cycles.
4.  Add namespace objects, graph diagnostics, and whole-graph native linking.
5.  Add promises, resolution, reaction jobs, and unhandled rejection tracking.
6.  Add asynchronous functions and `await` through traced continuation records.
7.  Add top-level await, asynchronous graph evaluation, timers, and shutdown.
8.  Close test262, differential, sanitizer, cross-target, package, and
    documentation evidence.

Each checkpoint lands with its generic tests and current living documents. A
failed experiment updates this plan and records the evidence before another
mechanism replaces it.


Exit criteria
-------------

 -  the frozen M4 profile names every supported grammar form, built-in, host
    surface, and withheld prerequisite;
 -  static module graphs preserve live bindings, namespace identity, cycles,
    evaluation order, and failure propagation;
 -  canonical resolution produces one deterministic native instance per module;
 -  promises settle once and schedule reactions through the native FIFO job
    queue with documented unhandled-rejection timing;
 -  asynchronous functions and top-level await resume from traced state without
    retaining a native stack frame;
 -  task, microtask, timer, and shutdown ordering match the frozen profile;
 -  forced collection and deterministic failures preserve every live module,
    closure, promise, continuation, job, timer, and thrown value;
 -  specialization-enabled and specialization-disabled executions remain
    observationally equal across the M4 corpus;
 -  selected test262 results record an exact revision and honest classification;
 -  strict native warnings, sanitizer runs, x86-64 execution, and AArch64
    compile-link checks pass; and
 -  `mise run check`, `mise run test`, and every focused task reported by
    `mise tasks` pass from a clean checkout.
