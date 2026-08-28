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

M5a is complete. The normative
[*M5 language profile*](./docs/language-profile-m5.md) records all 98 admitted
families and their evidence assessments. M5b and M5c remain open.

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
changing their order. A native I/O infrastructure track is recorded in
[*PLAN-NIO.md*](./PLAN-NIO.md). It may run probes alongside M5 and supplies the
clock, wakeup, network, and file adapter gates consumed by later compatibility
work. A deferred dynamic-source and staged-compilation track is recorded in
[*PLAN-DYN.md*](./PLAN-DYN.md). It keeps closed AOT binaries compiler-free
while defining the evidence required for bounded dynamic import, late native
artifacts, and optional runtime compilation.

The M5 regular expression family is detailed in
[*PLAN-REGEXP.md*](./PLAN-REGEXP.md). That plan separates fresh `RegExp` object
state from shareable matcher artifacts, keeps dynamic patterns on the same
semantic model as literals, and measures ahead-of-time C lowering against a
compact generic matcher before selecting a backend.

The M5 BigInt primitive and intrinsic are detailed in
[*PLAN-BIGINT.md*](./PLAN-BIGINT.md). That plan keeps exact literals,
`ToNumeric`, arithmetic, comparison, printing, and fixed-width conversion
behind one private runtime boundary. It measures immediate and heap
representations, limb layouts, and external arithmetic components before
selecting the remaining NaN-box tag or a backend.

The M6 Web Crypto and selected M7 `node:crypto` surfaces are detailed in
[*PLAN-CRYPTO.md*](./PLAN-CRYPTO.md). That plan keeps API semantics and opaque
key ownership behind an Oseo-owned provider boundary, separates cryptographic
arithmetic from ECMAScript BigInt, and requires validated target artifact packs
instead of an ambient host OpenSSL installation.

WebAssembly integration is detailed in [*PLAN-WASM.md*](./PLAN-WASM.md). Its
first checkpoint compiles statically imported *.wasm* modules inside the closed
native graph without placing a compiler in the produced executable. Its second
checkpoint supplies the runtime-byte JavaScript and web APIs required by M6.
The plan keeps both capabilities distinct from a JavaScript-to-WebAssembly
program target.

A deferred code-generation track is recorded in
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md). C11 remains the implemented reference
and portability backend. The track starts a candidate investigation only when
representative measurements reach a recorded replacement trigger, and it does
not reserve a milestone or put a backend migration in the M5 queue.

An evidence gate throughput track is recorded in
[*PLAN-GATE.md*](./PLAN-GATE.md). It keeps the cost of the reviewed standards
and property gates usable as the reviewed corpus grows, measured against
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md). It changes no
semantics and reserves no milestone, and it is a prerequisite of the M5b
checkpoint.

A garbage-collector evolution track is recorded in
[*PLAN-GC.md*](./PLAN-GC.md). The precise non-moving collector remains the
reference while its first checkpoint adds ordinary automatic collection,
complete memory accounting, mutable slot tracing, and exact safepoint
liveness. Moving, generational, incremental, parallel, and concurrent
collectors remain measured decisions rather than milestone assumptions.

A release and distribution track is recorded in
[*PLAN-RELEASE.md*](./PLAN-RELEASE.md). It fixes the artifact, channel, and
toolchain-acquisition contracts for future releases but leaves the first
release gate undecided. It reserves no milestone and changes no semantics or
compatibility counts.

A command-line evolution track is recorded in
[*PLAN-CLI.md*](./PLAN-CLI.md). It separates compile-and-run behavior from
retained artifact production, preserves the short source-path invocation as a
root shortcut, and defines a statically generated Optique command registry for
every distribution channel. It reserves no milestone and changes no language
semantics or compatibility counts.


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


Garbage collector track
-----------------------

Oseo uses one runtime collector across native program backends that share the
current object model. M5 may carry the production mark-and-sweep checkpoint
because it preserves language semantics while bounding ordinary heap growth
and making allocation behavior measurable. That work does not add a
compatibility result or force a backend migration.

Representative M5 allocation lifetimes and M6 server workloads decide whether
a copying nursery beside a non-moving old generation deserves a production
probe. Old-generation compaction, incremental marking, parallel work,
concurrency, stack maps, and general pinning each require their own recorded
trigger. [*PLAN-GC.md*](./PLAN-GC.md) owns those gates, while M5 through M7
continue to own the language and host objects whose roots and resource
lifetimes the collector must preserve.


Native I/O track
----------------

Oseo's deterministic M4 scheduler deliberately has no real clock, socket, or
file readiness backend. [*PLAN-NIO.md*](./PLAN-NIO.md) defines the separate
track that measures platform facilities, freezes a completion-driven runtime
adapter, preserves a deterministic test implementation, and records a fallback
for every selected operation.

This track is planned and its probe work is not started. Linux `io_uring`, the
Linux readiness and worker fallbacks, the available macOS system interfaces,
and maintained portable libraries remain candidates rather than commitments.
Windows IOCP and I/O Ring are future-target candidates; this track does not add
Windows to the supported target set by itself.

Before M5 exposes its `Date` family, the native clock checkpoint supplies epoch
real time and moves existing production timer waits to monotonic elapsed time in
the same release. M6 can begin its pure-data API groups earlier; its timer and
performance work standardizes the APIs over that clock contract. `fetch()`
waits for accepted and implemented socket and name-resolution backends plus an
M6-owned TLS client and trust-store decision on both supported execution
targets. Selected M7 file APIs later extend the same operation, cancellation,
buffer, and liveness contracts rather than creating a second event loop.


Dynamic source track
--------------------

Oseo's smallest deployment remains a closed ahead-of-time binary. A program
does not carry a source parser, compiler, incremental loader, or code-lifetime
machinery unless its selected capability profile needs them.
[*PLAN-DYN.md*](./PLAN-DYN.md) separates closed source, a finite precompiled
dynamic module set, late native artifacts, and runtime source compilation so
one dynamic feature does not make every executable equally large.

This track is planned and deferred. Build-time-resolvable dynamic import can be
probed before self-hosting because it preserves a closed graph. Late native
artifact probes may share the REPL loader boundary. A standalone runtime
compiler depends on M8, the global-binding decision, code-lifetime evidence,
and target support for executable code loading. None of this changes the M5
unsupported classifications until a feature-specific decision updates ADR
0016.


WebAssembly track
-----------------

Static *.wasm* imports preserve Oseo's closed build: the binary module is
resolved and validated with the source graph, compiled for the selected native
target, and linked before execution. That checkpoint may be probed before M6
without admitting `eval`, runtime source, or a general WebAssembly engine.
[*PLAN-WASM.md*](./PLAN-WASM.md) owns the mixed module graph, feature matrix,
AOT compiler, JavaScript wrappers, runtime state, target artifacts, and
evidence.

The complete M6 surface also accepts arbitrary module bytes through the
WebAssembly JavaScript and streaming APIs. That later checkpoint requires an
accepted runtime execution strategy. An interpreter and runtime native
compiler have different code-lifetime, target, size, and security costs; the
roadmap selects neither before bounded probes. Static module support must not
be reported as M6 group completion.

BigInt delivery does not block the static checkpoint unless its frozen feature
matrix admits `i64` at the JavaScript boundary. Before that dependency lands,
an `i64` import, export, global, or reflected signature that needs a JavaScript
value fails with the owned build-time diagnostic.


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


Command-line track
------------------

Oseo's current command line compiles one source entry and either prints an
intermediate form or builds and runs a temporary native executable.
[*PLAN-CLI.md*](./PLAN-CLI.md) records the transition to an explicit `run`
command, a cross-target `build` command, a compatible root shortcut, and public
help and completion commands.

This track is planned and its implementation has not started. It changes the
outer composition and artifact lifecycle without changing accepted JavaScript
or the compiler's dependency direction. The command registry remains
statically visible to Node.js, Deno, JSR publication, and the standalone CLI
pipeline; feature-specific commands enter only after their owning plans supply
the required semantics.


Release and distribution track
------------------------------

Oseo has published no release. [*PLAN-RELEASE.md*](./PLAN-RELEASE.md) defines
the distribution channels: standalone CLI archives for the supported
execution environments, the `@oseo/*` packages on npm and JSR, and an
unscoped npm launcher. It separately defines automatic acquisition of the
pinned Zig toolchain by the released CLI. Before M8, `deno compile` embeds a
JavaScript runtime in the archive binary; native executables produced by that
CLI embed no JavaScript runtime. M8 changes only how the CLI executable is
produced.

The first release waits for recorded capability prerequisites from the
measured tracks, and selecting the moment within them remains a maintainer
judgment based on timing and surrounding conditions. Intermediate releases
publish exact coverage and known gaps without the conformance label.


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
M0 probes were retired after direct package, native, and property tests
subsumed their contracts.

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
prerequisites listed. [*PLAN-BIGINT.md*](./PLAN-BIGINT.md) now owns the BigInt
track. These features need not all block the first useful M3 release.

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

Dynamic import may be added for module graphs resolvable at build time.
[*PLAN-DYN.md*](./PLAN-DYN.md) records the finite-set, promise, identity, and
evidence gates for that subset. `eval` and the `Function` constructor remain
unsupported unless a later architecture decision explains how they fit an
ahead-of-time runtime.

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
 -  add exact BigInt values and operators through the representation and
    arithmetic gates in [*PLAN-BIGINT.md*](./PLAN-BIGINT.md);
 -  compile regular expression literals ahead of time while preserving one
    generic matcher contract for dynamic patterns;
 -  increase test262 coverage and publish reproducible result manifests;
 -  add grammar-based and property-based differential generation;
 -  test garbage collection, exceptions, and specialization across the expanded
    value space under the modes and accounting contract in
    [*PLAN-GC.md*](./PLAN-GC.md);
 -  identify constructs that fundamentally challenge ahead-of-time compilation
    and settle them through architecture decisions.

### Checkpoints

M5 is large enough that one exit gate hides its remaining scope. It is
therefore reported as three checkpoints. They are capability gates, not
calendar phases, and later checkpoints may begin as soon as their
prerequisites are stable.

| Checkpoint | Result                                                        |
| ---------- | ------------------------------------------------------------- |
| M5a        | The admitted core language, and the applicable-test inventory |
| M5b        | Built-in object and intrinsic families in dependency order    |
| M5c        | Every result inside the inventory closed or authorized        |

M5a completes the remaining expression, declaration, function, class,
generator, and asynchronous syntax through traced environment and continuation
records. It does not admit the dynamic source family, which
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md) keeps outside the
profile even though `eval` and the `Function` constructor are normative core.
Those cases remain inside the inventory; their result rows remain unsupported
and wait for M5c. The *eval-code/*, *built-ins/eval/*, and *dynamic-import/*
directories hold 977 of the 41,091 included paths. Source-compiling cases in
the `Function`, `GeneratorFunction`, `AsyncFunction`, and
`AsyncGeneratorFunction` families are closed for the same reason and are not
counted here, because separating them from the non-compiling members of those
families needs the per-case review M5c performs.

The four largest families were taken first, in dependency order, using
inventory counts only to break ties. All four have landed, across eighteen
merged units from `fa119c7` to `8f2fff6`.

| Order | Family                 | Inventory paths | Status       |
| ----- | ---------------------- | --------------- | ------------ |
| 1     | Object literals        | 1,170           | Units landed |
| 2     | Synchronous generators | 640             | Units landed |
| 3     | Classes                | 8,494           | Units landed |
| 4     | Asynchronous iteration | 2,231           | Units landed |

Units landed is not the same as fully admitted. The profile still records open
behavior in these families, including the `PromiseResolve` constructor read
the poisoned-wrapper cases need, the unmaterialized `%GeneratorFunction%`
chain, and the *nativeFunctionMatcher.js* include the `async-iteration`-tagged
`Function.prototype.toString` cases need.
Each count is the size of the family in the inventory, not a total of admitted
paths.

Each count is the deduplicated set of included paths under the directories that
family owns. Classes cover *expressions/class/*, *statements/class/*, and
*expressions/super/*. Asynchronous iteration covers *for-await-of/*, both
*async-generator/* directories, and the `AsyncGeneratorPrototype`,
`AsyncGeneratorFunction`, and `AsyncIteratorPrototype` intrinsics.

Object literals came first because their accessors, computed keys, and
shorthand methods share lowering with class elements. Synchronous generators
preceded asynchronous iteration because the asynchronous forms extend their
suspension records. Classes decomposed into nine units covering methods,
accessors, static members, fields, private names, static blocks, `super`, and
inheritance. A count is an upper bound on direct promotion rather than a
forecast, and many cases in a family also need machinery outside it.

Those four are the largest families, not the whole checkpoint. M5a also owns
the rest of the core language: optional chaining, tagged templates, and BigInt
in the expression grammar, the `with` statement, the `arguments` object in
function execution, and the parts of the class, generator, and asynchronous
families that those units left open. Reading the table as the complete
remaining scope is what makes a finished work queue look like a finished
checkpoint.

[*PLAN-BIGINT.md*](./PLAN-BIGINT.md) coordinates the M5a literal, coercion,
operator, assignment, and update work with the M5b intrinsic and prototype. It
admits the M5a Unit 8.1a primitive checkpoint only after exact generic
semantics and the selected all-heap representation have collector and target
evidence. The M5b intrinsic and prototype remain outside that checkpoint.

M5a is complete because Unit 8.5o supplies the last execution evidence that
the Unit 8.5n audit assigned to the core expressions and bindings stream.
Optional private field and accessor reads and optional private method calls,
including `object?.#method()`, now have native and differential evidence for
nullish short circuit, valid-brand access, invalid-brand `TypeError`, and
method receiver preservation under both specialization policies and forced
collection. The profile is the test, not a work queue. Genuine remaining
rejections, including namespace re-exports, keep their M5b intrinsic and
global-object, module and asynchronous execution, standards harness, host, or
accepted dynamic-source owners.

M5a also publishes the complete applicable-test inventory that
[ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md) requires, because that
inventory is what makes the remaining scope measurable, and producing it after
the built-in families would hide their size until the end.
[ADR 0020](./docs/adr/0020-m5-applicable-test-inventory.md) classifies 41,091
of 47,381 candidate paths inside the 16th edition and 6,290 outside it. The
included paths comprise 22,998 language tests and 18,093 built-in tests.
The separate compact index records the denominator without duplicating the
result manifest's observations.

M5b adds the intrinsic graph, the global object, and the built-in families,
including the BigInt intrinsic owned by
[*PLAN-BIGINT.md*](./PLAN-BIGINT.md), the regular expression family owned by
[*PLAN-REGEXP.md*](./PLAN-REGEXP.md), and the `Date` family that depends on the
clock gate in [*PLAN-NIO.md*](./PLAN-NIO.md). M5c closes the remaining results
in the inventory or covers them with a record that authorizes the exclusion.

The reviewed evidence gates grow with the corpus these checkpoints admit.
[*PLAN-GATE.md*](./PLAN-GATE.md) owns that cost and is a prerequisite of M5b
rather than a separate milestone.

### Exit criteria

M5 is complete when the applicable-test inventory that
[ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md) requires is checked in
and every result inside it is a pass, an expected negative, or an unsupported
result covered by an accepted record that explicitly authorizes an M5 exclusion
and bounds its surface. Naming a record as owner is not sufficient;
[ADR 0019](./docs/adr/0019-m5-claim-closure.md) states what an authorizing
record must say.

The unqualified ECMA-262 conformance label is a separate later gate under that
same record, because
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md) keeps the dynamic source
family unsupported inside the claimed edition. Intermediate releases publish
exact coverage and known gaps without using the label.


M6: Minimum common web API
--------------------------

M6 implements the web-platform surface standardized by WinterTC. Development is
ordered by dependency rather than by the order of names in the standard.
Individual API groups may begin as soon as their engine prerequisites are
stable, even while M5 continues. Completing M6 and making a conformance claim
still depend on completing the relevant ECMAScript work.
[*PLAN-M6.md*](./PLAN-M6.md) records the group prerequisites, standards
boundary, and exit criteria in detail. Its monotonic-clock and `fetch()` work
consume the native adapter gates in [*PLAN-NIO.md*](./PLAN-NIO.md); web API
semantics, TLS client, and trust-store decisions remain owned by M6.
[*PLAN-CRYPTO.md*](./PLAN-CRYPTO.md) owns the separate Web Crypto algorithm,
provider, packaging, and security-update boundary.
[*PLAN-WASM.md*](./PLAN-WASM.md) owns static *.wasm* module integration, the
AOT compiler decision, the JavaScript value and runtime-store boundary, and the
runtime execution decision consumed by the WebAssembly API group.

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
native addons. File and subprocess I/O reuse the adapter and target capability
model established under [*PLAN-NIO.md*](./PLAN-NIO.md). The selected
`node:crypto` surface reuses the provider boundary under
[*PLAN-CRYPTO.md*](./PLAN-CRYPTO.md) while retaining a separate compatibility
manifest from the M6 Web Crypto claim.

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
    plans rather than hidden bootstrap hooks; and
 -  compiler-enabled deployment remains an optional capability under
    [*PLAN-DYN.md*](./PLAN-DYN.md), not a cost added to every closed binary.

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
follows [*PLAN-M5.md*](./PLAN-M5.md). The first four steps are complete:
the candidate edition boundary and manifest schema are frozen, the test262
harness observes module and asynchronous execution, and the
dependency-indexed baseline is published.
[ADR 0020](./docs/adr/0020-m5-applicable-test-inventory.md) also checks in the
41,091-path edition denominator without expanding the result manifest.
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md) resolves the dynamic
source challenge features through explicit unsupported classifications, while
[*PLAN-DYN.md*](./PLAN-DYN.md) records the deferred capability and evidence
track.

The normative [*M5 language profile*](./docs/language-profile-m5.md), rather
than this queue, records current admitted behavior and per-family evidence.
The next M5 work adds M5b built-ins in dependency order, then closes or
authorizes every M5c inventory result under ADR 0019.


M5 implementation history
-------------------------

The core expression and control-flow stream now covers the scalar
operator families, `var`, synchronous arrows, template literals, and the
`do-while`, `for`, `for-of`, `switch`, and labeled statements, and the
array literal, call argument, and constructor argument spread consumers now
reuse the synchronous iterator protocol through rooted dynamic accumulation.
Generated Node, Deno, and native evidence covers their values, evaluation
order, captured `next`, and abrupt steps; reviewed test262 evidence covers
iterator acquisition and abrupt steps for all three consumers. The core stream
also admits standalone `const`, `let`, and hoisted `var` array binding
declarations with elisions, defaults, nested array patterns, rest, and
conditional iterator closing. Generated evidence covers binding values,
hoisting, and cleanup; 24 reviewed standards cases cover the three declaration
kinds, defaults, nested patterns, rest, and iterator done-state handling. The
same declaration positions now admit object patterns with static, computed,
shorthand, renamed, defaulted, and nested properties. Generated evidence covers
ordinary, primitive, and nullish inputs, property order, both specialization
policies, and forced collection. A final identifier rest target preserves
enumerable own-key order, string and symbol exclusions, and fresh data
descriptors under a second generated property suite. Twenty-four reviewed
standards cases cover `const`, `let`, and `var` nullish coercibility, trailing
shorthand properties, function-name inference, rest exclusions, fresh data
descriptors, and non-enumerable omission. Catch parameters now reuse the same
recursive array and object binding semantics. Generated and fixed native
evidence covers defaults, rest, nullish failure, iterator cleanup, fresh catch
cells, and abrupt propagation through `finally`. Sixteen reviewed standards
cases add array and object catch patterns to the measured compatibility
manifest. Synchronous `for-of` declaration heads now admit the same recursive
patterns for `const`, `let`, and `var`. Generated and fixed native evidence
covers temporal dead zones, fresh per-iteration cells, `var` retention, nested
cleanup, object rest, and outer iterator close after pattern failure. The
reviewed standards manifest adds six passing nullish object-pattern cases
across all three declaration kinds. Compound assignment now preserves one
identifier or member reference across every arithmetic, bitwise, shift, and
logical operator. Generated and fixed native evidence covers all 15 operators,
short-circuiting, write errors, and identifier function-name inference. The 42
selected `for-of` binding cases whose loop bodies use `+=` now pass. The same
identifier and member reference paths now admit prefix and postfix `++` and
`--`. Generated and fixed native evidence covers Number coercion, result
selection, distinct read and write key conversions, immutable failure, both
specialization policies, and forced collection. Four new reviewed standards
cases cover the four forms, two parse negatives retain strict `arguments`
early errors, and a classic `for` update promotes one existing exponentiation
case to pass. The same
recursive paths also admit standalone destructuring assignment with
existing identifier and member leaves. Generated and fixed native evidence
covers defaults, rest, result identity, member-reference evaluation order,
nullish failure, iterator cleanup, immutable and imported binding errors,
direct awaited right operands, both specialization policies, and forced
collection. Fourteen reviewed standards cases cover identifier and member
writes, nested patterns, defaults, rest, result identity, nullish and
immutable-target errors, and function-name inference. Await inside a member
target became a separate continuation unit, which M5a Unit 8.3 has now
closed for asynchronous bodies. Synchronous `for-of` assignment
heads now reuse those recursive patterns and existing targets. Generated and
fixed native evidence covers defaults, rest, member leaves, nullish and
immutable failure, and inner-before-outer iterator cleanup. Six reviewed
standards cases cover identifier, member, default, and array-rest heads.
Classic `for` declaration heads now accept recursive array and object patterns
for `const`, `let`, and `var`. Generated and fixed native evidence covers
defaults, rest, nullish failure, lexical per-iteration cells, hoisted `var`
cells, both specialization policies, and forced collection. Seven reviewed
standards cases pin the admitted paths. Synchronous functions, constructors,
and arrows now accept recursive array and object binding-pattern parameters.
Generated and fixed native evidence covers defaults, rest, parameter temporal
dead zones, body-declaration isolation, iterator cleanup, constructors,
function length, both specialization policies, and forced collection. Four
reviewed standards cases pin array values, nesting, defaults, rest, and abrupt
completion. Synchronous top-level default parameters now share that parameter
environment. Generated and fixed native evidence covers missing, explicit
`undefined`, supplied and nullish values, prior and later references, abrupt
initializers, constructors, arrows, TypeScript hints, function length, both
specialization policies, and forced collection. Five reviewed standards cases
pin fallback selection, prior references, and length. Top-level rest
parameters now collect the unbound argument suffix into a fresh array without
changing the generic call ABI. Generated and fixed evidence covers bounded
suffixes, empty and nonempty calls, heap-valued arguments, fresh identity,
patterns, arrows, constructors, function length, both specialization policies,
and forced collection. Six reviewed standards cases pin syntax, patterns,
collection, and length. Name-based JSDoc hints now remain attached to their
pattern binding through owned syntax and HIR; generated evidence covers absent,
truthful, and false hints without changing behavior. Inline object, tuple, and
array TypeScript annotations now map syntactically visible primitive member
types to their binding leaves without a type checker. This mapping covers
parameters, standalone declarations, and classic `for` declaration heads.
Optional members remain unhinted. Array element types continue through
unambiguous nested array rest targets. Direct fixed-length tuple spreads expand
before mapping, so their members and following suffix retain their syntactic
positions. Expanded members follow the ordinary primitive-hint and
unsupported-type rules. Variadic array rests and type-reference spreads remain
unhinted where their length makes a position ambiguous. Object targets inside
an array rest remain unhinted. Computed object properties remain unhinted even
for literal keys. A nested array or object binding subtree whose inline
annotation has another container shape remains unhinted without rejecting the
program, while sibling mappings continue. Root container mismatches and type
annotations that require resolution remain explicit boundaries. The generated
domains vary truthful, false, and nested shape-mismatched TypeScript hints.
Asynchronous functions and arrows now run non-simple parameter initialization
inside their asynchronous executor, so abrupt defaults reject the returned
promise. Six reviewed
standards cases pin default selection, prior references, and rejection. Body
`var` declarations may now share parameter names:
parameter-expression lists receive distinct parameter and body cells, while
lists without expressions reuse the parameter cell. A same-name top-level
function declaration owns the body binding when `var` also redeclares it.
Generated and fixed evidence covers captured defaults, binding patterns, plain
sibling parameters, arrows, rest-only lists, both specialization policies, and
forced collection. It also covers the function-declaration-owned body binding.
Six reviewed standards cases pin the environment split. The
intrinsics
stream has landed the
named error family as runtime-owned constructor values with typed catchable
runtime errors. M5b node `error-aggregate-and-options` adds the runtime-owned
`AggregateError`, its iterable-to-list `errors` property, and `cause` handling
to every error constructor;
[*PLAN-M5.md*](./PLAN-M5.md) records the exact admitted list. M5b node
`well-known-symbols` adds the complete thirteen-entry well-known symbol table,
fixing every entry's identity, description, and constructor descriptor with
generated, differential, forced-collection, and reviewed standards evidence.
The corresponding consuming algorithms remain separate dependency-ordered
nodes. M5b node `intrinsic-graph-root` replaces name-compared virtual intrinsic
properties with one realm-owned, collector-traced table. It materializes the
object and callable function prototype roots and links the already admitted
constructors without claiming a later built-in family. Stable-seed generated,
fixed differential, both-policy, forced-collection, and structural evidence
cover the refactor. Its empty test262 inventory leaves all compatibility counts
unchanged and moves the public runtime ABI to `oseo-runtime-m5-46`. The C
runtime componentization recorded in
[*docs/runtime-components.md*](./docs/runtime-components.md) is
complete: the runtime ships eleven component translation units behind a
package-private internal header, an M5-enabling refactor that changes
no compatibility counts; the error, symbol, and iterator components
landed with the M5 intrinsics units.

M5b node `object-prototype` populates the realm-owned ordinary-object root with
its six standard methods and `constructor` link. Fixed and stable-seed
generated differential evidence covers both specialization policies, forced
collection, and generic fallback after a deliberate shape-guard miss. Its 179
reviewed paths add 58 passes and 121 explicit prerequisite boundaries, moving
the manifest to 3,016 passes across 5,078 paths and the runtime ABI to
`oseo-runtime-m5-47`.

The remaining queue is:

1.  The behavior-preserving compiler, Babel frontend, and native fixture
    decomposition is complete. [*DESIGN.md*](./DESIGN.md) and the applicable
    package README files record the resulting ownership. This enabling
    refactoring changed no language-profile or compatibility count.
2.  Complete the remaining foundational expressions and coercions after the
    landed errors, symbols, synchronous iterator consumers, spread consumers,
    and array binding declarations. BigInt literals, primitive values,
    `ToNumeric`, operators, assignment, and update have passed the M5a Unit
    8.1a gate in [*PLAN-BIGINT.md*](./PLAN-BIGINT.md). Delete expressions have
    passed Unit 8.1b, object-literal prototype setters and their duplicate
    early error have passed Unit 8.1c, and Script and module top-level `this`
    have passed Unit 8.1d. Unit 8.2 reconciles the class follow-ups: arrows
    capture lexical `super()` and `new.target`, asynchronous class elements
    retain `super` property context, each `super()` call performs a fresh
    `Construct`, and optional calls through `super` properties are admitted.
    Class bodies without `extends` and object-literal methods still wait for
    the M5b `super-without-extends` node. Unit 8.3 admits `await` inside an
    assignment target's computed member, a computed binding property name, and
    an array or object binding default in every body that owns a traced
    suspension frame; module top level keeps that rejection under the modules
    and asynchronous execution stream. Unit 8.4 closes the async-from-sync
    delegated-throw gap: the virtualized `%GeneratorPrototype%.throw` gains
    its own method-cache identity, the synchronous `yield*` exit reports the
    ending step's own value, and the reviewed
    *AsyncFromSyncIteratorPrototype/throw/iterator-result.js* case enters as
    a pass. Unit 8.5a admits the multi-declarator `const` and `let`
    declaration list: the compiler expands its declarators into the enclosing
    statement list rather than a block, so the whole list keeps one temporal
    dead zone, one set of cells, and its existing early errors. Unit 8.5b
    admits the optional catch binding: a `catch` clause without a parameter
    discards the thrown value, creates no catch-parameter environment, and
    keeps the block's own lexical scope and the parameterized clause's
    completion precedence. Unit 8.5c admits a simple catch parameter sharing a
    name with a var-scoped declaration: the enclosing function, Script, or
    module keeps its hoisted outer cell, while the catch clause creates a fresh
    cell and a same-name initializer inside the catch writes only that cell.
    Recursive catch patterns, same-scope lexical errors, and the Annex B
    block-function boundary remain unchanged. Unit 8.5d admits a
    block-level function declaration sharing a name with a var-scoped
    declaration outside the block that declares it: ECMA-262's Block early
    errors reject only a var that lexically shares the declaring block or a
    block nested inside it, so the frontend's hoisting pass now rejects
    that overlap alone instead of reserving the name across the whole
    enclosing var scope. Annex B's copied-out alias remains unimplemented.
    Unit 8.5e admits a function declaration in a switch clause: every
    clause's function is instantiated once at CaseBlock entry, sharing the
    scope its `let`, `const`, and class declarations already share, so it is
    callable through any clause the discriminant reaches regardless of which
    clause declares it. ECMA-262 exempts a CaseBlock's duplicate function
    name from its early error only for a host that implements Annex B's
    Block-Level Function Declarations Web Legacy Compatibility Semantics;
    since this profile does not, a Block or CaseBlock now rejects every
    duplicate function name outright, correcting the shared
    `predeclareBindings` helper an ordinary block also uses; a module's own
    top level shares that same lexical rule, since ECMA-262 gives it no
    Script- or FunctionBody-style exception either. A Script or function
    body's own top-level function declarations keep their separate,
    unconditional hoistable-redeclaration rule unaffected. Unit 8.5f admits
    the `debugger` statement as an executable no-op: the frontend converts
    it to the same empty block an empty statement already produces, so
    every later stage's existing block handling admits it unmodified, in a
    block, a loop, a switch clause, a function, an async or generator body,
    and a module top level alike. Unit 8.5g replaces the ordinary unmapped
    arguments object with the mapped arguments exotic object for a
    non-strict function whose parameter list is simple: each supplied
    index that is a formal parameter's rightmost occurrence stores that
    parameter's own binding cell as its property value, so the runtime's
    existing cell-backed property machinery, already shared by the global
    object and a module namespace, aliases the index and the parameter
    until an explicit non-writable redefinition, a conversion to an
    accessor, or a deletion severs it. Every non-simple parameter list
    keeps the existing unmapped object. Unit 8.5h then completes
    availability: every ECMA-262 function form that owns an `arguments`
    binding receives one, including strict functions, object and class
    methods, class constructors, asynchronous functions, and asynchronous
    generators, while an arrow declares none of its own and resolves the
    name lexically in its enclosing form, keeping the ordinary
    source-located unresolved diagnostic when there is none. Strictness
    now selects the shape rather than availability, so every strict or
    non-simple form takes `CreateUnmappedArgumentsObject`, whose `callee`
    is the non-configurable poisoned accessor backed by the realm's single
    `%ThrowTypeError%` intrinsic. Both shapes also expose `@@iterator` as
    `%Array.prototype.values%`, which now reads a non-array target's
    `length` through `Get`, `ToNumber`, and `ToLength` the way
    `LengthOfArrayLike` does. Unit 8.5i admits direct `typeof` applied
    to an unresolvable name: the closed profile decides resolvability
    ahead of time, so the expression folds to the `"undefined"` string
    without reading or creating a binding, while every other unresolved
    reference keeps its source-located rejection. Inside `with`, the
    object environments are consulted first and a genuinely
    unresolvable miss answers `"undefined"` instead of an
    uninitialized-cell error, while a resolved lexical fallback keeps
    its ordinary read and temporal dead zone. An unshadowed
    runtime-owned intrinsic name such as `console` stays a
    source-located rejection because ECMA-262 resolves it to a real
    global value this profile admits only as a call target; a name the
    profile has since materialized, such as `Object`, `Promise`, or `String`,
    reads the realm global object's property instead. Unit 8.5j
    admits `delete super.property` and `delete super[expression]`,
    which ECMA-262 rejects with a `ReferenceError` only after the whole
    reference has been evaluated. The receiver is read first, so a
    derived constructor reports its uninitialized `this` before the key
    expression runs; the key expression then runs for its value and its
    abrupt completion; and `ToPropertyKey` is never reached, so a
    poisoned key object is never converted. No lookup starts, so no home
    object prototype is read and no property is removed. Both reference
    hosts evaluate the key before the receiver in a derived constructor,
    which test262 rejects; the reviewed subset and the frontend
    structural tests pin the specified order instead. Unit 8.5k admits
    `super.property` and `super[expression]` as an assignment target in
    a destructuring assignment pattern and in the for-of and
    for-await-of heads the profile already admits. Both positions
    evaluate the reference and hold it until PutValue stores through it,
    which is the receiver-carrying pair an ordinary `super` assignment
    already lowers, so the store reuses that operation and the runtime
    ABI is unchanged. The reference runs before the iterator step that
    supplies the value and once per iteration in a head; the receiver is
    read before the key expression, so a target before `super()` reports
    its uninitialized `this`; `ToPropertyKey` runs only after the value;
    and an abrupt reference closes the iterator the pattern or the loop
    opened. Unit 8.5l admits the `for-in` statement with its base
    enumeration semantics and simple heads. A nullish subject makes
    ForIn/OfHeadEvaluation report a break completion, so the whole
    statement is skipped without an error, and an enumerate iterator is
    never closed, so an abrupt head reference or body leaves the loop
    through the enclosing transfer alone. ECMA-262 leaves the enumeration's
    mechanics and order unspecified and states rules instead, so the
    point at which each level's own keys are obtained is an observable
    choice; this unit makes the choice both reference hosts make and
    collects the whole prototype chain once, when the enumeration is
    acquired. Collection takes each level's own string keys in ascending
    index then creation order, drops symbol keys, skips a name already
    recorded at a nearer level whether or not that property was
    enumerable, and keeps a surviving name only if its own property was
    enumerable then. Each step reports the next collected name while the
    receiver still has a property of that name, so a property deleted
    before it is processed is ignored while one added during the
    enumeration stays invisible to it. ToObject is modeled rather than
    materialized: a string subject reports its code unit indices and a
    non-enumerable `length`, a symbol subject enumerates
    %Symbol.prototype%, and every other primitive reports nothing. The admitted
    heads are a `var`, `let`, or `const` identifier declaration and the
    assignment targets the profile can already represent, including a
    `super` property and a private member; a pattern head is a
    source-located rejection that Unit 8.5m owns. The runtime ABI moves
    to `oseo-runtime-m5-43` for the two owned enumeration entry
    points. Unit 8.5m then admits the object pattern head, in both its
    `ObjectBindingPattern` declaration and `ObjectAssignmentPattern`
    assignment forms, without changing that enumeration: the acquisition,
    the step, the skipped nullish subject, and the absent close are the
    same two owned operations, and the head reuses the recursive
    destructuring the profile already owns for standalone declarations,
    for-of heads, and destructuring assignments. A lexical head creates
    every bound name before the subject runs and again on each iteration,
    so the subject observes the temporal dead zone and a closure observes
    its own iteration's cells, while a `var` or assignment head resolves
    in the surrounding environment. The whole pattern runs after the step
    that produced the key, so RequireObjectCoercible applies to the
    enumerated String key; each property evaluates its name, then its
    target reference, then `GetV`, then a default only for `undefined`,
    then the store; and a rest property excludes every name evaluated
    before it. Any abrupt completion leaves the loop through the
    enclosing transfer, because an enumerate head has no iterator to
    close. Every array pattern position stays a source-located rejection,
    both the head's own form and one nested below an admitted object
    head: the key is always a String and this realm creates no string
    iterator, so an array pattern could only report a `TypeError` where
    ECMA-262 destructures the key's code units. Annex B's head
    initializer and a multi-declarator head keep their existing
    rejections, and the runtime ABI is unchanged.
    Unit 8.5n performs the stale-profile-claims and gap audit. It confirms that
    most apparent remaining M5a rejections are either stale prose for
    implemented behavior or genuine boundaries owned by M5b, modules and
    asynchronous execution, the standards harness, the host profile, or ADR
    0016. It also discovers that optional private field and accessor reads and
    optional private method calls such as `object?.#method()` have only parser,
    HIR, and MIR structural coverage. A separate evidence unit in the core
    expressions and bindings stream must provide native and differential
    evidence for nullish short circuit, valid-brand access, invalid-brand
    `TypeError`, and method receiver preservation under both specialization
    policies and forced collection before the checkpoint closes. The audit
    changes none of the 4,857 reviewed cases, their 2,932 passes, 1,355 expected
    negatives, and 570 unsupported profile features, the 41,091-path inventory,
    revision pins, property seeds and budgets, or compatibility overrides.
    Unit 8.5o supplies that optional private execution evidence and closes
    M5a. The fixed native fixtures cover valid-brand field and accessor reads,
    invalid-brand `TypeError`, nullish short circuit, optional private method
    receiver preservation and argument suppression, both specialization
    policies, truthful and false hints, and forced collection. A generated
    property with seed `0x60002500` adds one domain, one seed, and twelve
    ordinary cases with an independent Node.js oracle over field, accessor,
    and method operations and valid, invalid, `null`, and `undefined`
    receivers. Four test262 cases are reviewed: two optional-private grammar
    cases pass, while two cases that require the `Object` intrinsic remain
    unsupported under their M5b owner. The manifest reaches 4,861 reviewed
    cases: 2,934 passes, 1,355 expected negatives, and 572 unsupported profile
    features. No prior result moves, and the inventory, suite revision,
    manifest schema and vocabulary, zero-override policy, and runtime ABI
    `oseo-runtime-m5-43` are unchanged.
3.  Add built-in families and close module and asynchronous boundaries in
    dependency order.
    The BigInt intrinsic continues under [*PLAN-BIGINT.md*](./PLAN-BIGINT.md).
    The regular expression family follows
    [*PLAN-REGEXP.md*](./PLAN-REGEXP.md), including the generic matcher before
    ahead-of-time literal lowering and measured fast paths.
4.  Close or explicitly authorize every result inside the checked-in
    applicable-test inventory, with reproducible standards and generated
    evidence. The conformance label follows at its own later gate under
    [ADR 0019](./docs/adr/0019-m5-claim-closure.md).

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
 -  Garbage-collector and exception ABIs can force broad rewrites. The
    backend-independent root, slot, and policy boundaries in
    [*PLAN-GC.md*](./PLAN-GC.md) precede a moving or generational decision.
 -  The Minimum common web API includes several large standards, including
    streams, cryptography, and WebAssembly. M6 is divided by API group and test
    surface.
 -  Static WebAssembly modules fit closed AOT compilation, but the dynamic
    JavaScript API accepts bytes after startup. [*PLAN-WASM.md*](./PLAN-WASM.md)
    keeps the build-side compiler, runtime engine, feature matrix, and
    executable-memory policy from collapsing into one unmeasured choice.
 -  Native I/O facilities differ by operation, kernel, sandbox, and target. The
    probes and fallbacks in [*PLAN-NIO.md*](./PLAN-NIO.md) keep one fashionable
    backend name from becoming an unmeasured portability requirement.
 -  C gives a short route to native code but can hide machine-level control and
    carries semantics that differ from ECMAScript. The retained C11 baseline
    and replacement triggers in [*PLAN-BACKEND.md*](./PLAN-BACKEND.md) keep a
    new code generator from becoming an unmeasured requirement.
 -  Self-hosting can drift indefinitely if treated as a final rewrite. The
    compiler profile and host boundaries are enforced from M0 onward.
 -  A stateful REPL requires code and object lifetimes to cross compilation
    units. [*PLAN-REPL.md*](./PLAN-REPL.md) keeps implementation deferred until
    session semantics, artifact loading, reclamation, and target evidence are
    recorded.
 -  Dynamic source can make compiler, loader, and code-lifetime support a
    deployment cost even for programs that never use it.
    [*PLAN-DYN.md*](./PLAN-DYN.md) requires explicit capability derivation and
    compiler-absence evidence before such support enters the runtime.

Changes to milestone order should update this document and name the new
evidence. They should not silently relax the generic-fallback or hint-safety
guarantees in [*DESIGN.md*](./DESIGN.md).
