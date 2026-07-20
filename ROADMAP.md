Oseo roadmap
============

Status
------

Oseo has completed M4: closed native module graphs, live bindings, promises,
asynchronous continuations, top-level await, timers, and a deterministic native
scheduler. M5 is in progress under [*PLAN-M5.md*](./PLAN-M5.md):
[ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md) freezes the candidate
ECMA-262 16th edition boundary and manifest schema, the test262 harness
executes module and asynchronous cases, and a dependency-indexed baseline
manifest is published. This roadmap uses capability gates rather than
calendar dates.

The macOS AArch64 native execution work accepted by
[ADR 0014](./docs/adr/0014-native-target-support.md) is complete. Linux on AMD64
and macOS on AArch64 execute the same native semantic corpus, while AArch64
Linux retains compile-link and inspection evidence. This target expansion does
not change the current language profile or compatibility counts by itself.

This is a living document, not a fixed schedule or a promise that development
will follow the current sequence unchanged. Milestones, scope, and exit criteria
may change whenever implementation work, standards changes, or compatibility
evidence gives Oseo a better route. The roadmap should be updated when that
happens so that it continues to describe the project's actual plan rather than
preserving an obsolete one.

The roadmap has two primary tracks. The engine track builds the language
implementation, native compiler, and runtime. The compatibility track measures
real programs and adds web-platform, Node.js, and package support. Compatibility
experiments begin early, but compatibility claims follow the engine capabilities
on which they depend. A deferred interactive-development track is recorded in
[*PLAN-REPL.md*](./PLAN-REPL.md). It reuses these capability gates without
changing their order.


Working rules
-------------

Each milestone should leave Oseo in a testable state. New syntax is accepted
only with its generic semantics, and new specialization is accepted only with a
working fallback. Unsupported features remain explicit compile-time errors.

Milestone work follows these rules:

 -  A milestone has written scope, deliverables, and exit criteria before
    implementation begins.
 -  Correctness tests are written with or before the implementation they cover.
 -  Generated semantic domains use the property and replay infrastructure begun
    in M4 rather than introducing independent random-program frameworks.
 -  Every specialized operation has specialization-invariance tests and
    deliberate guard failures.
 -  `mise run check` and `mise run test` are the local and
    continuous-integration gates.
 -  Performance measurements record generated code and allocation behavior
    before broad benchmark scores.
 -  Compatibility findings are classified as language, runtime API, module
    resolution, package convention, native dependency, or external system
    behavior.


Milestone map
-------------

| Milestone | Result                                                             |
| --------- | ------------------------------------------------------------------ |
| M0        | Architecture contracts and a reproducible project foundation       |
| M1        | A generic-only compiler that produces a native executable          |
| M2        | Guarded native specialization with a compiled generic fallback     |
| M3        | A garbage-collected object model and dynamic language core         |
| M4        | Modules, promises, asynchronous execution, and a native event loop |
| M5        | Broad, measured ECMAScript compatibility                           |
| M6        | Minimum common web API coverage and eventual WinterTC conformance  |
| M7        | Selected Node.js APIs and practical package compatibility          |
| M8        | A self-hosting Oseo compiler                                       |


Interactive development track
-----------------------------

Oseo intends to provide a full-featured REPL that compiles submitted source to
native code while preserving bindings, objects, closures, modules, asynchronous
state, and diagnostics across submissions. [*PLAN-REPL.md*](./PLAN-REPL.md)
records that target and the required session, incremental-artifact, and
code-lifetime decisions.

This track is planned and deferred. It is not M9, and no active milestone
depends on REPL delivery. Host-assisted probes may begin after M5 settles the
global-object and dynamic global-binding model and native loading has measured
target evidence. A self-contained native REPL additionally depends on M8 so it
can carry an Oseo compiler without embedding Node.js or Deno. Interactive
compilation does not change the M5 exclusion of language-level `eval`, the
`Function` constructor family, or unrestricted dynamic import.


M0: Architecture and project foundations
----------------------------------------

M0 turns the white paper into implementation contracts and establishes the
smallest workflow needed to test native output.

### Deliverables

 -  *DESIGN.md* and this roadmap.
 -  Architecture decision records for the initial platform, bootstrap parser,
    tagged-value experiment, C backend, runtime language, call ABI, and initial
    garbage collector.
 -  A TypeScript project that runs under both Node.js and Deno.
 -  Thin host adapters and a restricted compiler-core package boundary.
 -  Formatting, linting, type checking, unit testing, and native fixture tasks
    reachable through `mise`.
 -  A test harness that can compile a fixture, run its native executable, and
    compare it with a reference runtime.
 -  Stable commands reserved for `--dump-mir` and `--emit-c`, even if their
    first output is minimal.

M0 accepted Node.js and Deno host pins, Babel behind an owned-syntax boundary,
the C11 and Zig responsibility split, an x86-64 NaN-boxed generic value, a
two-word generic call result, and linked explicit root frames. It also created
the eight-package npm and JSR workspace, lockstep versioning, dual-host tests,
package validation, and the native differential fixture harness. The checked-in
probes remain regression tests through `mise run test:probes`.

### Exit criteria

 -  `mise run check` and `mise run test` pass from a clean checkout on the
    initial supported host.
 -  The same compiler-core unit tests pass under Node.js and Deno.
 -  The repository documents every external tool needed to build a native
    fixture.
 -  Provisional architecture decisions have either measured prototypes or a
    recorded experiment that will settle them during M1.
 -  Unsupported source produces a source-located diagnostic rather than a host
    parser stack trace.


M1: Generic native vertical slice
---------------------------------

M1 compiles a small, explicit JavaScript profile to native code. It has no
optimization-hint-driven specialization yet. The point is to prove the complete
source-to-executable path and establish the generic semantic boundary.

### Initial language profile

 -  primitive literals needed by the first fixtures;
 -  function declarations, parameters, calls, and returns;
 -  lexical local bindings;
 -  basic control flow;
 -  a small set of arithmetic and comparison operations;
 -  string concatenation for the values admitted by the profile;
 -  a minimal `console.log` host intrinsic for observable fixtures.

The exact list and its required fixtures are frozen in
[*docs/language-profile-m1.md*](./docs/language-profile-m1.md). A later plan may
expand the profile, but accepted features may not have placeholder semantics.

### Deliverables

 -  A parser adapter that converts bootstrap-parser nodes into Oseo-owned
    syntax.
 -  A normalized high-level IR with source locations and fixed evaluation order.
 -  A control-flow MIR with explicit generic operations and runtime calls.
 -  A C11 backend, native build driver, and small runtime library.
 -  A generic tagged-value prototype covering every primitive value in the M1
    profile.
 -  `--dump-mir` and `--emit-c` output usable in tests and debugging.
 -  Differential fixtures run against Node.js and Deno where both provide the
    relevant behavior.

### Exit criteria

 -  A source fixture compiles to a standalone native executable and runs without
    embedding Node.js or Deno.
 -  Every accepted fixture has the same observable result under Oseo and the
    selected reference runtime.
 -  Unsupported syntax and values fail at the documented boundary.
 -  Garbage-collector and exception requirements discovered by the slice are
    recorded before M2, even if M1 does not yet allocate general objects or
    throw arbitrary exceptions.

M1 completion is exercised by eight reviewed differential fixture classes.
Their observations match under Node.js, Deno, Linux AMD64, and macOS AArch64
execution, and each fixture compile-links for `linux-aarch64-musl`. The matrix
covers all M1
primitive kinds, conversions, operators, lexical control flow, direct calls,
recursion, argument ordering, hint invariance, numeric edges, strict C11
warnings, undefined-behavior sanitization, and collection forced at every
declared string safepoint.


M2: Guarded specialization
--------------------------

M2 proves Oseo's central claim: a cheap checked specialization can sit beside a
fully compiled generic path, and a failed assumption needs neither an
interpreter nor deoptimization.

### Scope

The first specialization targets a function whose parameter hints suggest
numbers and whose body performs addition. When both values have the required
immediate representation and the arithmetic operation is valid, generated code
uses the specialized path. Any failed condition branches to generic addition.

The fixture corpus includes truthful hints, absent hints, deliberately false
hints, integer overflow, non-integer numbers, negative zero, `NaN`, infinities,
strings, and every other input representable by the M2 language profile.

### Deliverables

 -  TypeScript and JSDoc hint extraction with provenance.
 -  MIR guard, unbox, checked arithmetic, box, and generic-fallback operations.
 -  Specialization enable and disable modes.
 -  Guard-hit, guard-miss, generic-call, and allocation counters in test builds.
 -  Structural tests for MIR and selected generated machine code.
 -  Generated tests that remove or falsify hints.
 -  A benchmark report focused on branch shape, helper calls, and allocation
    rather than broad comparisons with mature engines.

### Exit criteria

 -  Specialization enabled and disabled produce identical observable behavior
    for the full M2 fixture corpus.
 -  Every guard has a tested miss path.
 -  The small-integer fast path contains no generic addition helper call and no
    heap allocation.
 -  Overflow and all non-matching inputs reach generic code without replaying
    already visible side effects.
 -  The resulting native binary contains both the specialized and generic paths.

M2 is the first public proof of the architecture described in the white paper.
Later implementation work should not begin by weakening its invariants.

M2 completion is recorded in
[*docs/specialization-m2.md*](./docs/specialization-m2.md) and
[*ADR 0007*](./docs/adr/0007-guarded-small-integer-addition.md). The compiler
has explicit enabled and disabled policies, inspectable guarded MIR, one shared
generic addition block, test-only counters, strict native execution, AArch64
cross-links, and optimized assembly inspection. The M1 and M2 fixture corpus
matches Node.js and Deno in both native modes.


M3: Dynamic language core
-------------------------

M3 supplies the heap and object semantics needed by ordinary JavaScript
programs. Work proceeds in semantic units so that each accepted operation has a
complete generic path before it receives a specialization.

### Scope

 -  heap allocation and explicit garbage-collector roots;
 -  strings beyond the M1 representation;
 -  ordinary objects, immutable shapes, shape transitions, and dictionary
    fallback;
 -  generic property get, set, define, and delete behavior;
 -  prototypes and property attributes;
 -  arrays and indexed properties;
 -  lexical environments and closures;
 -  function values, methods, `this`, and constructors;
 -  exceptions and abrupt completion;
 -  shape-guarded property access after generic property semantics are stable.

Proxies, weak references, finalization, symbols, big integers, classes, and
other features enter M3 only through separate plans with their semantic
prerequisites listed. They need not all block the first useful M3 release.

### Exit criteria

 -  Collection can be forced at every allocation safepoint in the test corpus.
 -  Objects remain correct across collection, exceptions, closure capture, and
    generic-to-specialized calls.
 -  Shape-specialized access is observationally equivalent to generic property
    access for tested mutations and prototype changes.
 -  Relevant test262 subsets run through an Oseo harness, with pass, fail,
    unsupported, and harness-error results reported separately.
 -  Memory-safety tooling reports no known errors in the runtime and generated C
    fixtures.

M3 implementation evidence is recorded in
[*docs/language-profile-m3.md*](./docs/language-profile-m3.md) and
[*ADR 0008*](./docs/adr/0008-object-layout-and-shapes.md). The generic runtime
owns descriptors, prototypes, arrays, closures, function objects, constructors,
and completion propagation. Differential fixtures match Node.js and Deno in
specialization-disabled and specialization-enabled native modes on both
supported execution targets. The same corpus cross-links for AArch64 Linux.
The reviewed test262 subset at revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2` records 30 passes, 6 expected parse
failures, 1 unsupported profile feature, and no semantic or harness failures.


M4: Modules and asynchronous execution
--------------------------------------

M4 turns the single-program compiler into a runtime for server-oriented module
graphs.

### Scope

 -  static ECMAScript module parsing and resolution;
 -  module instantiation, live bindings, cycles, and evaluation order;
 -  whole-graph native linking;
 -  promises and the ECMAScript job queue;
 -  `async` functions and `await`;
 -  timers and a native event-loop boundary;
 -  host exception and unhandled-rejection reporting;
 -  a documented shutdown rule for pending tasks and handles.

Dynamic import may be added for module graphs resolvable at build time. `eval`
and the `Function` constructor remain unsupported unless a later architecture
decision explains how they fit an ahead-of-time runtime.

### Exit criteria

 -  Multi-module fixtures cover live bindings, cycles, failures during
    evaluation, and top-level scheduling.
 -  Promise and timer ordering matches the documented reference behavior.
 -  Native executables finish, remain alive, or report unhandled failures
    according to the event-loop rules rather than incidental runtime state.
 -  Compiler-core packages can be represented as an Oseo module graph, even if
    the current language profile cannot compile all of them yet.

M4 completion is recorded in
[*docs/language-profile-m4.md*](./docs/language-profile-m4.md) and ADRs 0009
through 0012. The compiler builds deterministic canonical graphs, links live
cells and namespaces, and schedules private module evaluators in one native
program. Independent siblings continue past a suspended evaluator, while
importers wait for asynchronous dependencies. The C11 runtime owns promise
settlement, FIFO reactions, thenable jobs, rejection checkpoints, asynchronous
continuations, timer tasks, and shutdown. Differential fixtures and generated
schedules agree across Node.js, Deno, both specialization policies, forced
collection, Linux AMD64 execution, macOS AArch64 execution, and AArch64 Linux
compile-link checks.


M5: Measured ECMAScript compatibility
-------------------------------------

M5 broadens the language from a documented subset toward ECMA-262 conformance.
It is an iterative compatibility program, not one undifferentiated
implementation task.

### Work streams

 -  expand syntax and semantics in dependency order;
 -  implement standard built-in objects and intrinsic functions;
 -  increase test262 coverage and publish reproducible result manifests;
 -  add grammar-based and property-based differential generation;
 -  test garbage collection, exceptions, and specialization across the expanded
    value space;
 -  identify constructs that fundamentally challenge ahead-of-time compilation
    and settle them through architecture decisions.

### Exit criteria

M5 is complete only when Oseo can make and substantiate an ECMA-262 conformance
claim for a named edition. Intermediate releases publish exact coverage and
known gaps without using the conformance label.


M6: Minimum common web API
--------------------------

M6 implements the web-platform surface standardized by WinterTC. Development is
ordered by dependency rather than by the order of names in the standard.
Individual API groups may begin as soon as their engine prerequisites are
stable, even while M5 continues. Completing M6 and making a conformance claim
still depend on completing the relevant ECMAScript work.
[*PLAN-M6.md*](./PLAN-M6.md) records the group prerequisites, standards
boundary, and exit criteria in detail.

### Planned order

1.  Encoding, `URL`, `URLSearchParams`, events, and `AbortSignal`s.
2.  Timers, performance, structured cloning, and host error reporting.
3.  `Blob`, `File`, and `FormData`.
4.  `Readable`, writable, transform, and compression streams.
5.  `Headers`, `Request`, `Response`, and `fetch()`.
6.  Web Crypto.
7.  The required WebAssembly JavaScript and web APIs.
8.  Remaining globals, integration behavior, and documented server-runtime
    deviations.

The order may change when standards tests expose shared prerequisites. Each API
group gets a conformance matrix linking interfaces to specifications and the
applicable web-platform tests.

### Exit criteria

 -  Oseo passes the applicable tests for every interface, method, and property
    in the targeted Minimum common web API edition.
 -  Documented deviations satisfy that edition's rules for server runtimes.
 -  The underlying ECMAScript implementation meets the ECMA-262 requirement
    named by the Minimum common web API standard.
 -  Only after these criteria pass does Oseo describe itself as WinterTC
    conformant. Earlier releases report partial API coverage.


M7: Node.js and package compatibility
-------------------------------------

M7 adds the parts of the Node.js ecosystem that measured package experiments
show to be useful for Oseo's server-oriented audience. It does not add Node-API
native addons.

### Initial candidates

 -  `node:path` and URL-to-path conversion;
 -  `node:fs` and selected promise-based file operations;
 -  `node:crypto` operations not already served by Web Crypto;
 -  `Buffer`;
 -  a bounded `process` global;
 -  *package.json* `exports` and `imports` resolution;
 -  npm package graph discovery;
 -  CommonJS loading and ECMAScript-module interoperation.

The exact surface is chosen from compatibility data. Oseo should not copy a
Node.js API merely because it is easy to stub; incomplete APIs often make
package failures harder to diagnose.

### Exit criteria

 -  Every supported Node.js API has a documented compatibility surface and tests
    derived from public behavior.
 -  A curated package corpus builds and runs through reproducible scenarios.
 -  Failures caused by native addons are reported distinctly from resolution or
    API failures.
 -  The project publishes package-level results with exact versions and test
    scenarios instead of a general percentage detached from use cases.


M8: Self-hosting
----------------

M8 removes Node.js and Deno from the trusted execution path of the native Oseo
compiler while retaining both as supported development hosts.

Self-hosting also names the long-term implementation strategy for standard
built-ins. Mainstream engines implement much of their built-in surface in
the engine's own language rather than in the native runtime. Once the M5
language profile is rich enough, each new built-in family should weigh a
self-hosted implementation, written in the compiled TypeScript subset and
compiled by Oseo itself, against a C runtime implementation, keeping only
primitive operations native. This keeps the C runtime from growing with
every intrinsic and turns most built-in work into ordinary
compiled-profile code covered by the same standards and differential
gates. The per-family choice and its evidence are recorded when the
family lands.

### Preparation carried by earlier milestones

 -  compiler-core source stays within a tracked TypeScript profile;
 -  host operations remain behind interfaces;
 -  bootstrap parser use stays outside backend and optimization code;
 -  continuous integration reports which compiler packages Oseo can compile;
 -  runtime APIs needed by the compiler are added through ordinary compatibility
    plans rather than hidden bootstrap hooks.

### Bootstrap stages

1.  The Node.js- or Deno-hosted compiler builds a native Oseo compiler.
2.  That native compiler builds the same compiler source again.
3.  The second compiler passes the compiler test suite and builds the milestone
    fixture corpus.
4.  Bootstrap-only dependencies are removed from the native path or documented
    as external build tools.

### Exit criteria

 -  A clean checkout can produce a native compiler from a documented trusted
    bootstrap artifact or supported host compiler.
 -  The native compiler rebuilds a functionally equivalent compiler.
 -  Node.js and Deno host builds still pass the same compiler-core tests.
 -  The bootstrap procedure is automated, repeatable, and covered by continuous
    integration.


Continuous compatibility laboratory
-----------------------------------

Real-package experiments should not wait until M7. A small compatibility
laboratory runs alongside the engine roadmap. Early results
are expected to fail. Their purpose is to replace guesses with a ranked blocker
list.

Each scenario records:

 -  package and version;
 -  source entry point and expected behavior;
 -  first unsupported language feature;
 -  missing web or Node.js API;
 -  module-resolution or package-format problem;
 -  native dependency, if any;
 -  result after each relevant milestone.

The corpus should start with small dependency-free libraries, then add
web-standard packages, framework kernels, and finally representative
applications. Large applications do not become milestone gates until their
transitive requirements are understood.


Initial work queue
------------------

The compiler and runtime capability sequence is complete through M4. M5
follows [*PLAN-M5.md*](./PLAN-M5.md). The first three steps are complete:
the candidate edition boundary and manifest schema are frozen, the test262
harness observes module and asynchronous execution, and the
dependency-indexed baseline is published.
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md) resolves the dynamic
source challenge features through explicit unsupported classifications.
The core expression and control-flow stream now covers the scalar
operator families, `var`, synchronous arrows, template literals, and the
`do-while`, `for`, `for-of`, `switch`, and labeled statements, and the
intrinsics
stream has landed the named error family as runtime-owned constructor
values with typed catchable runtime errors;
[*PLAN-M5.md*](./PLAN-M5.md) records the exact admitted list. The C
runtime componentization recorded in
[*docs/runtime-components.md*](./docs/runtime-components.md) is
complete: the runtime ships eleven component translation units behind a
package-private internal header, an M5-enabling refactor that changes
no compatibility counts; the error, symbol, and iterator components
landed with the M5 intrinsics units. The remaining queue is:

1.  Complete the remaining foundational expressions and coercions after the
    landed errors, symbols, and synchronous iterator consumers.
2.  Add built-in families and broader executable syntax in dependency order.
3.  Close the named edition with reproducible standards and generated
    evidence.

M5 preserves every earlier generic-fallback, forced-collection, sanitizer,
dual-execution-target, cross-target, package, standards, and property gate. It
expands the same
generators, shrinkers, and replay records instead of replacing them.


Risks that affect ordering
--------------------------

The roadmap should be revised when evidence changes one of these assumptions:

 -  A bootstrap parser may use syntax or runtime behavior outside Oseo's
    eventual self-hosting profile. The owned-syntax boundary contains that
    dependency.
 -  C gives a short route to native code but can obscure machine-level control
    and has semantics that differ from ECMAScript. MIR structural tests and
    explicit runtime helpers contain that risk.
 -  JavaScript's reflective object behavior can make shape specialization more
    expensive than expected. Generic property semantics come first so a failed
    experiment does not block correctness.
 -  Garbage-collector and exception ABIs can force broad rewrites. They are
    settled before the object model expands.
 -  The Minimum common web API includes several large standards, including
    streams, cryptography, and WebAssembly. M6 is divided by API group and test
    surface.
 -  Self-hosting can drift indefinitely if treated as a final rewrite. The
    compiler profile and host boundaries are enforced from M0 onward.
 -  A stateful REPL requires code and object lifetimes to cross compilation
    units. [*PLAN-REPL.md*](./PLAN-REPL.md) keeps implementation deferred until
    session semantics, artifact loading, reclamation, and target evidence are
    recorded.

Changes to milestone order should update this document and name the new
evidence. They should not silently relax the generic-fallback or hint-safety
guarantees in [*DESIGN.md*](./DESIGN.md).
