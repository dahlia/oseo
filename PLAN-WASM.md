WebAssembly integration plan
============================

Status
------

Implementation status: planned, probe work not started. This plan owns two
related capabilities: ahead-of-time compilation of statically imported
*.wasm* modules inside Oseo's closed module graph, and the WebAssembly
JavaScript and web APIs required by M6. The static-import checkpoint may land
before the complete M6 API because its bytes are build input. It does not make
Oseo a JavaScript-to-WebAssembly compiler or satisfy the runtime-byte APIs by
itself.

No WebAssembly decoder, validator, compiler, interpreter, runtime store, or
JavaScript binding exists in the current implementation. Candidate tools and
libraries remain probe subjects. Naming a candidate in this plan does not
select it or add it to the production dependency graph.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md),
[*PLAN-BIGINT.md*](./PLAN-BIGINT.md), [*PLAN-DYN.md*](./PLAN-DYN.md),
[*PLAN-GC.md*](./PLAN-GC.md), [*PLAN-M6.md*](./PLAN-M6.md),
[*PLAN-PT.md*](./PLAN-PT.md),
[ADR 0009](./docs/adr/0009-module-identity-and-linking.md),
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md), and the target
decisions under *docs/adr/*. Evidence that changes one of these contracts
updates the affected document in the same change.


Goal
----

Oseo should compile a statically imported WebAssembly module together with the
JavaScript and TypeScript modules that reference it. A source import such as
this remains part of one closed, deterministic native build:

~~~~ ts
import { add } from "./add.wasm";

console.log(add(1, 2));
~~~~

The build resolves and hashes *add.wasm*, decodes and validates it, resolves
its own imports, compiles its functions for the selected native target, and
links the resulting artifact into the executable. The produced program carries
the instance state and JavaScript interoperability support that the reachable
module needs. It carries no WebAssembly parser or compiler merely because a
build-time module was present.

M6 adds the broader contract. `WebAssembly.Module`, `compile()`,
`instantiate()`, and the streaming methods accept bytes after execution has
started. Those APIs require an in-process WebAssembly execution strategy. The
static compiler and runtime engine should share validated representations and
tests where that reduces semantic duplication, but neither checkpoint may be
reported as the other.


Terms and capability boundary
-----------------------------

A *static WebAssembly module* is a *.wasm* resource whose canonical identity
and complete bytes are known while Oseo builds the native executable. Its code
is compiled before that executable starts. Its memories, tables, globals, and
other instance state are still runtime values.

The *static AOT compiler* is a build-side component that turns a validated
WebAssembly module into target code or an explicit lower-level artifact. It is
not linked into an executable that only consumes its output.

The *runtime WebAssembly engine* accepts module bytes or a compiled module
object after the Oseo program starts. It may interpret a validated internal
form, compile it to native code, or use a measured combination. The execution
decision must name which capability profiles include that engine and whether
they require executable-memory support.

The *WebAssembly runtime support layer* owns stores, instances, memories,
tables, globals, traps, JavaScript wrappers, and imported-call adapters. Static
AOT removes the need to decode or compile bytes at run time; it does not remove
this state or its specified behavior.

WebAssembly code is a native dependency of the final program, not an Oseo
program backend. Oseo continues to compile JavaScript and TypeScript through
its generic and guarded-specialization pipeline. A separate future decision
would be required to emit a WebAssembly program instead of a native
executable.


Non-goals
---------

This plan does not add a JavaScript-to-WebAssembly target, browser deployment
target, public backend plugin API, or stable native embedding ABI. It does not
replace the C11 reference backend under [*PLAN-BACKEND.md*](./PLAN-BACKEND.md).

The first implementation does not accept *.wat* source. Text-format tools may
produce test fixtures, but production input is the versioned WebAssembly binary
format. A text parser would be a separate user-facing syntax and diagnostic
surface.

WASI, the component model, interface types, generated language bindings, and
command-style module execution are outside the static ECMAScript module and M6
Web API checkpoints. They may reuse a selected core engine later, but engine
availability does not admit operating-system capabilities or a component
contract implicitly.

Deno-compatible TypeScript checking is not an Oseo compiler goal. Oseo may
publish accurate declarations or expose WebAssembly signatures to tools, but a
JavaScript call still follows the specified WebAssembly conversion and error
behavior. Source annotations remain hints and cannot replace a runtime
boundary check.

This plan does not select a WebAssembly feature edition, AOT toolchain,
interpreter, JIT, or third-party engine without checked-in probes. It does not
assume that the build-side and runtime-byte paths need the same code generator.


Entry evidence
--------------

The current implementation supplies useful boundaries but no WebAssembly
semantics:

 -  M4 builds one deterministic graph with canonical module identities, source
    hashes, ordered dependencies, live cells, and one module instance per
    canonical identity;
 -  the graph loader currently returns JavaScript or TypeScript source, and
    each graph node contains one owned `SyntaxModule`, so binary modules need
    an explicit node and loader contract rather than a parser special case;
 -  the C11 backend and pinned Zig toolchain compile and statically link
    reviewed target artifacts for Linux AMD64 and macOS AArch64, while AArch64
    Linux retains compile-link and inspection evidence;
 -  runtime components already separate object, function, memory, promise, and
    event-loop ownership, but no component owns a WebAssembly store or wrapper;
 -  ECMAScript BigInt remains planned, so an `i64` value cannot yet cross the
    JavaScript boundary through its required BigInt representation;
 -  the collector traces `OseoValue` slots and owns external-memory accounting,
    while linear memory and compiled WebAssembly code need explicit native
    owners; and
 -  M6 requires both the WebAssembly JavaScript interface and streaming web
    methods, which cannot be implemented by recognizing build-time modules
    alone.


Standards and compatibility boundary
------------------------------------

The WebAssembly work depends on separate, versioned contracts:

 -  the [WebAssembly core specification] defines binary decoding, validation,
    instantiation, execution, traps, and core feature semantics;
 -  the [WebAssembly JavaScript interface] defines module and instance objects,
    value conversion, imports and exports, stores, errors, and API methods;
 -  the [WebAssembly Web API] defines streaming compilation and instantiation;
    and
 -  static module loading follows a separately frozen
    [WebAssembly ES module integration] contract, informed by
    [Deno's documented direct-import behavior] rather than treating one host
    implementation as the standard.

Before static import implementation begins, an architecture decision freezes
the binary edition, admitted core features, ES module integration revision,
specifier policy, import and export kinds, cycle policy, target roles, and
diagnostic boundary. Before M6 group 8 begins, the M6 standards decision and a
WebAssembly execution decision freeze the required JavaScript and web API
surface, web-platform-test revision, runtime engine features, and documented
server-runtime deviations.

The core feature matrix records each proposal or edition feature separately.
It covers at least numeric and vector types, reference types, multiple values,
bulk memory, multiple memories, threads and shared memory, exceptions, tail
calls, memory64, typed function references, garbage-collected types, and
JavaScript string built-ins where they appear in the selected contracts. A
feature is supported only when decoding, validation, AOT and runtime execution,
JavaScript interoperation, target evidence, and applicable standards tests
agree. Unknown or disabled feature encodings fail with an owned diagnostic or
the specified `CompileError`; they are never accepted and approximated.

Static ES module support is an Oseo module-loading capability and may exceed
the Minimum common web API surface. Its tests and release notes remain separate
from the M6 WinterTC denominator. Conversely, passing static-import tests does
not count `WebAssembly.compile()` or `instantiateStreaming()` as implemented.

[WebAssembly core specification]: https://webassembly.github.io/spec/core/
[WebAssembly JavaScript interface]: https://webassembly.github.io/spec/js-api/
[WebAssembly Web API]: https://webassembly.github.io/spec/web-api/
[WebAssembly ES module integration]: https://github.com/WebAssembly/esm-integration
[Deno's documented direct-import behavior]: https://docs.deno.com/runtime/reference/wasm/#wasm-modules


Static module graph contract
----------------------------

The host-neutral loader distinguishes text source from WebAssembly bytes. A
binary result contains the canonical URL, immutable bytes, content digest, and
media or module kind. The compiler core does not decode bytes as source text or
expose a host filesystem path as module identity.

The graph representation becomes an explicit union of ECMAScript and
WebAssembly nodes. Both node kinds retain canonical identity, content digest,
ordered dependency edges, imports, exports, and source locations or binary
offsets. Only an ECMAScript node owns `SyntaxModule`; a WebAssembly node owns a
validated, parser-independent module representation.

Decoding discovers every WebAssembly import before native code generation.
The module portion of a WebAssembly import is resolved through the same injected
resolver policy as an ECMAScript specifier, relative to the importing *.wasm*
module where the selected ES module integration contract requires that
behavior. The field portion selects one export from the resolved module. Import
maps, package aliases, URL policy, integrity policy, and network access remain
host resolver concerns rather than WebAssembly compiler behavior.

Canonical identity preserves one static instance for repeated imports of the
same module. Re-exports and namespace access retain stable JavaScript wrapper
identity. The static integration decision defines instantiation and start
function order, failure propagation, and every admitted ECMAScript-to-
WebAssembly, WebAssembly-to-ECMAScript, and WebAssembly-to-WebAssembly cycle.
Unsupported cycles fail during graph construction or linking with the exact
edge and import named. Loader or linker order must not decide whether a cycle
works.

The same decision freezes the observable `WebAssembly` namespace for the
static-only profile. It states whether the namespace exists when the graph does
or does not contain a WebAssembly module, which constructors, prototypes, and
methods support static export wrappers, and whether each unavailable dynamic
byte API is absent or throws a specified error. Feature detection must not
select an apparently supported runtime path that ends in a missing method or a
silent stub.

Binary diagnostics retain the canonical module identity, section and byte
offset where available, feature policy, and import or export name involved.
Malformed bytes, validation failures, missing imports, kind mismatches, and
unsupported features remain distinct phases so build reports and generated
properties can compare them.


Static AOT compiler boundary
----------------------------

Decoded WebAssembly enters an Oseo-owned validated representation. It does not
enter the JavaScript syntax or HIR representations, and it does not borrow
JavaScript MIR operations whose semantics only happen to resemble a typed
WebAssembly instruction. A later shared machine-operation layer is acceptable
only after both frontends have fixed their own traps, calls, memory accesses,
roots, and metadata before that boundary.

The first bounded probes compare these artifact paths:

 -  deterministic WebAssembly-to-C lowering consumed by the existing strict
    C11 and Zig toolchain;
 -  an external pinned compiler that emits target objects from validated
    modules; and
 -  a library or Oseo-owned emitter that returns relocatable objects or another
    explicit lower-level artifact.

Each probe records supported core features, validation ownership, target
coverage, deterministic output, object format, symbol and relocation policy,
debug metadata, trap strategy, bounds-check behavior, C undefined-behavior
containment, sanitizer coverage, license, distribution size, release cadence,
and maintenance cost. A fast compiler that delegates validation or silently
changes the admitted feature set is not interchangeable with another path.

The selected compiler produces one target-explicit artifact per canonical
module or deterministic compilation unit. Generated symbols remain private
unless an Oseo-owned linker contract names them. Arbitrary custom sections,
module names, imports, and exports cannot inject native symbols, linker flags,
paths, or libraries.

Static direct calls may bypass a general JavaScript wrapper only when the
compiler proves that the same conversion, trap, identity, and abrupt-completion
behavior remains observable. Taking a function as a value, calling it through
a generic path, or importing it into another module must keep the specified
wrapper semantics. An optimization is not an alternate interoperation model.


JavaScript and WebAssembly value boundary
-----------------------------------------

WebAssembly signatures are validated runtime ABI facts. They are not
TypeScript assertions and do not let Oseo reject arbitrary JavaScript callers
or remove required conversions. Every imported or exported function has one
semantic adapter that defines argument conversion, result conversion,
multi-value results, thrown JavaScript values, WebAssembly traps, and call-depth
failure. Direct and indirect calls reuse that contract.

The initial boundary can admit `i32`, `f32`, and `f64` functions before BigInt.
WebAssembly may use `i64` internally when the selected compiler supports it,
but an `i64` import, export, global, or reflected signature that
requires a JavaScript value waits for [*PLAN-BIGINT.md*](./PLAN-BIGINT.md).
The compiler rejects only that unsupported interoperation edge, not unrelated
internal integer code.

Reference values require identity and tracing decisions. `externref` values
must keep their JavaScript referents alive while reachable from a WebAssembly
global, table, instance, or suspended call. Function references must preserve
callable identity and the selected table rules. Garbage-collected WebAssembly
types do not reuse the native Oseo object layout accidentally. Each admitted
reference feature receives a representation decision and forced-collection
evidence before it enters the feature matrix.

`WebAssembly.Memory`, `WebAssembly.Table`, and `WebAssembly.Global` exports are
JavaScript objects with stable identity, not copied snapshots. Repeated reads
of one static module export observe the same underlying instance state. Import
kind and type matching happen before the start function runs, and a failed
instantiation publishes no partial namespace or instance.


Runtime store and memory ownership
----------------------------------

Compiled code is immutable program data. An instance owns mutable globals,
tables, memories, data and element initialization state, and any imported
references. A static module graph creates the instances required by its
evaluation contract; the dynamic API may create many instances from one module
object. Those cases share code only when doing so preserves module identity,
store, and target rules.

Linear memory uses runtime-owned native storage unless an accepted decision
selects another representation. Its committed, accessible, maximum, shared,
and externally visible byte counts enter the accounting and limit contract in
[*PLAN-GC.md*](./PLAN-GC.md). Ordinary linear bytes are not scanned as
`OseoValue` slots. The JavaScript memory wrapper traces the native owner, and
the grow operation follows the selected JavaScript interface's buffer identity,
detachment, resizability, failure, and maximum rules.

Tables and globals that can contain JavaScript or WebAssembly references expose
mutable slots to the collector. A non-moving collector may keep the first
implementation simple, but the slot contract must permit a moving collector to
rewrite references later. Compiled code and runtime helpers cannot retain raw
heap pointers across safepoints.

Instantiation allocates and initializes through owned cleanup regions. A
validation, import, allocation, start-function, or trap failure releases every
unpublished memory, table, global, wrapper, and native artifact reference.
Collector finalization order never decides visible instantiation behavior.


Dynamic JavaScript and web APIs
-------------------------------

M6 group 8 requires the selected `WebAssembly` namespace methods and
constructors, module and instance objects, memories, tables, globals, errors,
and streaming integration. `validate()` and synchronous constructors require a
bounded synchronous path. `compile()` and the streaming methods settle promises
through the Oseo scheduler without letting an engine callback invoke JavaScript
directly.

Arbitrary runtime bytes cannot use the closed static-module checkpoint as a
semantic substitute. The execution decision compares at least:

 -  interpreting a validated WebAssembly representation;
 -  compiling runtime bytes to native code and publishing a validated artifact;
    and
 -  a composed engine that precompiles static modules while using a separate
    measured path for runtime modules.

A WebAssembly interpreter is not an interpreter for JavaScript source and does
not split Oseo's ECMAScript semantics into two tiers. It still adds a distinct
execution engine, feature matrix, performance profile, and security boundary.
A runtime AOT or JIT path instead adds executable-code lifetime, target, W^X,
instruction-cache, reclamation, and sandbox constraints. Neither choice is
accepted by analogy to ADR 0016 alone.

[*PLAN-DYN.md*](./PLAN-DYN.md) continues to own ECMAScript source compilation
and late native artifact capability. Runtime WebAssembly bytes are not
ECMAScript source and do not admit `eval`, the `Function` constructor, or
unrestricted dynamic import. When the selected WebAssembly engine publishes
native code after startup, it must reuse the applicable target validation,
artifact publication, accounting, and code-lifetime contracts from that plan.
An interpreter does not need executable-code publication but still needs
bounded module and instance lifetime.

A conforming M6 profile retains every required observable WebAssembly
intrinsic. A smaller application profile may omit the runtime engine only when
its documented host contract permits that omission. Reachability analysis does
not prove a required global interface absent merely because no direct call is
visible.


Artifact, toolchain, and cache policy
-------------------------------------

Every static module artifact key includes the exact input digest, selected core
and integration feature matrices, compiler and validator identities, compiler
options, Oseo runtime ABI, native target, object format, optimization and
sanitizer modes, and any external runtime or compiler pack digest. A cache hit
never crosses one of those boundaries.

Official builds use pinned, validated compiler and runtime inputs. They do not
discover an ambient system WebAssembly engine, invoke an unspecified compiler
from `PATH`, or retry a failed pinned compiler through another tool. If an
external component is selected, its headers, archives, tools, license material,
source digest, build configuration, and supported targets form a reviewed pack
or an equally explicit distribution boundary.

The reference toolchain remains the pinned Zig C compiler and linker for C11
and final native linking. A selected WebAssembly compiler may emit C, object
files, or another reviewed input, but it does not change stable Oseo target
names or choose the final linker through ambient state. Linux AMD64 and macOS
AArch64 need execution evidence. AArch64 Linux retains compile-link, relocation,
symbol, and artifact inspection until it becomes an execution target.

Build records retain each WebAssembly module identity, input and artifact
digest, admitted features, imports and exports, compiler path, target, output
sections and symbols, runtime components, link inputs, and final executable
identity. A source-only program provides structural evidence that no static AOT
compiler or WebAssembly runtime component entered its executable.


Security and resource boundary
------------------------------

Validation completes before a module is compiled, linked, instantiated, or
published. The validator checks every selected core rule and configured limit;
native lowering cannot treat successful code generation as proof that the
input was valid.

Generated native code preserves WebAssembly's sandbox. Every linear-memory and
table access has the required bounds behavior, integer and floating-point
operations avoid host undefined behavior, indirect calls check their types, and
traps cannot continue through corrupted Oseo state. Signal or guard-page
optimizations require target-specific proof and a portable checked fallback.

Modules receive no ambient filesystem, network, clock, environment, process,
or native-symbol access. Their only host capabilities are validated imports
from the selected module graph or explicit dynamic instantiation object. WASI
or another host interface requires its own permission and compatibility plan.

The architecture decisions freeze limits for binary size, section counts,
types, functions, locals, control nesting, call depth, memories, tables,
instances, compilation work, generated code, and retained native bytes. Limit
failures map to an owned build diagnostic or the specified JavaScript error.
They do not abort the process, wrap arithmetic, or fall back to an unvalidated
path.

Runtime native-code generation is an explicit capability. Targets or sandboxes
that forbid it may still support static modules and an interpreter-backed
dynamic profile. An unavailable selected capability fails at build or startup
through the accepted policy; it is not emulated by an external service.


Property, standards, and target evidence
----------------------------------------

The core engine runs the official WebAssembly specification tests at a pinned
revision with each result classified against the frozen feature matrix. The
JavaScript and web bindings run the applicable web-platform tests required by
M6. Static ES module integration has a separate manifest and compares behavior
with Deno and any other host that implements the frozen contract.

Generated valid modules come from a typed structured representation. The
generator covers functions, control flow, numeric edges, memories, tables,
globals, imports, exports, start functions, traps, and admitted references. Its
shrinker preserves validation and the import, trap, or conversion edge under
test. Controlled invalid mutations target one binary or validation rule at a
time and must produce a stable phase and diagnostic.

The properties compare:

 -  static AOT execution with independent reference engines;
 -  static and runtime execution when both admit the same module and imports;
 -  repeated builds, targets, specialization modes, and collector modes;
 -  JavaScript-to-WebAssembly and WebAssembly-to-JavaScript conversions;
 -  canonical module identity, single static instantiation, start order, and
    cycle rejection or execution;
 -  memory growth, table mutation, global mutation, and wrapper identity;
 -  traps, imported JavaScript exceptions, allocation and limit failures, and
    cleanup; and
 -  ordinary and forced collection of every JavaScript reference retained by a
    store, instance, table, global, wrapper, or suspended call.

One failure record retains the minimized structured module, binary bytes,
textual diagnostic rendering, module graph, imports, feature matrix, compiler
and engine identities, target, artifact and executable paths, seed, replay
path, collection and sanitizer modes, and complete observations. A runtime-code
failure also retains its publication and lifetime schedule.

Strict warnings, address and undefined-behavior sanitizers, Linux AMD64 and
macOS AArch64 execution, and AArch64 Linux compile-link and inspection remain
ordinary acceptance evidence. A target-specific fast path does not remove the
portable checked corpus.


Performance and size evidence
-----------------------------

Static compiler probes separate decoding, validation, lowering, external
compilation, object writing, and final link time. They record peak compiler
memory, generated C or IR size, object size, executable delta, retained runtime
components, startup and instantiation time, import and export call overhead,
linear-memory access cost, trap cost, and representative workload throughput.

Dynamic engine probes add cold and warm compile time, interpreter dispatch or
native publication cost, compiled-module reuse, peak and retained code bytes,
executable-memory transitions, and reclamation. Streaming probes separate
transport from validation and compilation so a network result cannot hide
engine cost.

The static checkpoint sets budgets before becoming a supported import surface.
M6 sets separate budgets for the complete runtime API. A slower result can be
accepted with recorded rationale; a result that drops validation, bounds
checks, feature coverage, target evidence, or deterministic failure behavior is
not a performance improvement.


Probe and decision plan
-----------------------

The first probe compiles one local module that exports an `i32` addition
function, imports it from an Oseo module, calls it through the specified
JavaScript wrapper, and links one native executable. It retains the input
digest, validated representation, intermediate artifact, symbols, relocations,
output, target, and build cost.

The next probes add one imported JavaScript function, one trap, one start
function, one growing linear memory, one table and indirect call, and one
unsupported feature. Each probe remains small enough to compare diagnostics
and artifacts across candidate compiler paths.

The AOT decision compares the candidate classes above on all three target
roles. It selects a path only after the same validated inputs and runtime
adapters produce matching observations. Rejected candidates remain retained
evidence rather than dormant dependencies.

The runtime-engine probe uses the same small corpus to compare an interpreter,
runtime native compilation, and a composed strategy. It records API timing,
code lifetime, target restrictions, executable size, standards coverage, and
failure containment before the M6 execution decision selects a path.

Probe commands remain internal until a supported repository task exists. Each
retained result names the source revision, host, target, tool and library
versions, licenses, configuration, exact command or API call, input digest,
feature matrix, outputs, timings, limits, and observations.


Delivery order
--------------

1.  Freeze the static ES module integration contract, core feature matrix,
    target roles, limits, diagnostic phases, observable `WebAssembly` namespace,
    and evidence manifests in an architecture decision that amends or
    supersedes ADR 0009's source-only loader and graph-node contract.
2.  Extend the loader and graph contracts with immutable binary modules,
    canonical content digests, decoded imports and exports, binary locations,
    and deterministic mixed-graph linking without selecting an AOT compiler.
3.  Build the bounded AOT probes and accept a compiler, validator, artifact,
    dependency, and distribution decision from retained target evidence.
4.  Implement the smallest static import vertical slice with numeric function
    exports, one instance per canonical module, JavaScript wrappers, traps, and
    source-only compiler-absence evidence.
5.  Add the admitted import kinds, linear memories, tables, globals, start
    functions, cycles, references, and `i64` boundary in the dependency order
    frozen by the feature matrix. Update the BigInt dependency before admitting
    `i64` across the JavaScript boundary; until then the owned rejection remains
    part of the supported static profile.
6.  Complete the static standards, differential, property, forced-collection,
    sanitizer, target, performance, and size gates. Publish this checkpoint as
    static WebAssembly module support, not M6 group 8 completion.
7.  Freeze the M6 WebAssembly JavaScript and web API matrix and accept the
    runtime execution decision, including target and executable-memory policy.
8.  Implement the runtime store and the required module, instance, function,
    memory, table, global, reference, and error objects over the shared semantic
    boundary.
9.  Implement `validate()`, synchronous construction, asynchronous `compile()`
    and `instantiate()`, and the streaming methods with scheduler, fetch, limit,
    and failure integration.
10. Close every result in the pinned core and web-platform manifests, complete
    target and performance evidence, and only then mark M6 group 8 complete.

Each checkpoint updates [*DESIGN.md*](./DESIGN.md),
[*ROADMAP.md*](./ROADMAP.md), the applicable profile and standards manifests,
this plan, and any affected backend, BigInt, dynamic-artifact, collector, or
property contract. Commands enter contributor documentation only after they
exist.


Exit criteria
-------------

The static WebAssembly module checkpoint is complete when:

 -  one frozen core and ES module integration matrix defines every admitted
    binary, import, export, feature, cycle, and diagnostic case;
 -  mixed JavaScript, TypeScript, and WebAssembly graphs retain canonical
    identity, content digests, deterministic dependencies, one static instance,
    and specified evaluation and start order;
 -  every accepted module validates and compiles ahead of time for the selected
    target, while every rejected module fails before native linking at its owned
    phase;
 -  the observable `WebAssembly` namespace for builds with and without static
    modules has a frozen, tested surface, and every unavailable runtime-byte API
    is absent or fails with its specified error rather than acting as a stub;
 -  JavaScript wrappers preserve conversion, identity, exception, and trap
    behavior, including either implemented BigInt conversion or the owned
    rejection diagnostic for an `i64` interoperation edge, according to the
    frozen feature matrix;
 -  memories, tables, globals, instances, references, native storage, and
    cleanup obey their runtime and collector ownership contracts;
 -  the selected AOT dependency and artifact policy is pinned, reproducible,
    licensed, target-explicit, and absent from executables that only consume its
    output;
 -  official specification, static-integration, differential, property,
    forced-collection, sanitizer, execution-target, and cross-target gates pass;
    and
 -  measured build time, executable size, startup, call, memory, and runtime
    costs satisfy their reviewed budgets or have accepted exceptions.

M6 group 8 is complete when, in addition:

 -  every required WebAssembly JavaScript and web API interface, method,
    property, conversion, and error in the targeted Minimum common web API
    edition passes its pinned manifest;
 -  arbitrary valid runtime bytes execute through the accepted engine rather
    than a build-time-only recognition rule;
 -  synchronous, promise, and streaming operations preserve scheduler,
    transport, cancellation, failure, and shutdown behavior;
 -  module reuse, multiple instances, stores, references, memories, tables,
    globals, code and metadata lifetime, and resource limits pass ordinary and
    failure-injection coverage;
 -  each supported target either provides the selected runtime execution
    capability or reports the documented profile restriction without weakening
    the static AOT target; and
 -  the complete M6 WebAssembly size, performance, security, standards,
    property, sanitizer, and target evidence is reproducible from documented
    repository tasks.
