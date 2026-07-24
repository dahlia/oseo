Dynamic source and staged compilation plan
==========================================

Status
------

Implementation status: planned, deferred. This plan defines the
cross-milestone capability and packaging boundaries for dynamic import, late
native artifacts, `eval`, and the `Function` constructor family. It does not
reserve a numbered milestone, add a repository command, or admit any dynamic
source form to the active M5 language profile.

[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md) remains the current
decision: M5 rejects `eval`, the `Function` constructor family, and dynamic
import with owned diagnostics. This plan records the evidence and separations
needed to revisit that decision without making every Oseo binary carry a
compiler.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md), [*PLAN-M5.md*](./PLAN-M5.md),
[*PLAN-PT.md*](./PLAN-PT.md), [*PLAN-REPL.md*](./PLAN-REPL.md), and the
accepted records under *docs/adr/*. Evidence that changes one of those
contracts updates the affected document in the same change.


Goal
----

Oseo should keep a closed ahead-of-time binary as its smallest deployment
unit. A program that needs only source known during its build carries the
compiled generic and specialized code, runtime semantics, and host
capabilities reachable from that program. It does not carry a source parser,
compiler, native code generator, or incremental loader merely because another
Oseo program might use them.

Programs that need a bounded dynamic module set, late native artifacts, or
runtime source compilation add only the capability closure required by that
choice. Every added path still executes native generic code, may add guarded
specialization, and uses no hidden interpreter, profiling tier, or
deoptimization mechanism.

The build records why each runtime component entered the result. It must be
possible to prove both sides of the boundary: a compiler-enabled artifact has
the compiler, loader, and lifetime support it needs, while a closed artifact
contains no dormant route that can compile source at run time.


Lineage and adaptation
----------------------

SBCL and Chez Scheme show that dynamic evaluation does not require interpreted
execution. [SBCL's executable-delivery documentation]
states that a saved executable can retain the compiler and call `compile` or
`load`. [Chez Scheme's implementation overview]
states that source is compiled to machine code by default, that its compiler is
included in the runtime by default, and that dynamically compiled code is
garbage-collected. Chez also offers whole-program compilation for a program and
the libraries it invokes.

Those systems are evidence, not deployment templates. Oseo does not inherit
their image, boot-file, language-environment, or artifact model. It adopts the
narrower principles that dynamic source may still produce native code and that
compiler availability is a deployment choice. The capability classes below
make that choice explicit instead of treating the full development system as
the minimum runtime.

[SBCL's executable-delivery documentation]: https://sbcl.org/manual/index.html
[Chez Scheme's implementation overview]: https://cisco.github.io/ChezScheme/


Capability classes
------------------

Dynamic behavior is not one capability. The implementation and compatibility
manifests distinguish at least four classes.

### Closed source

All source and ordinary module identities are known before native code
generation. Static imports form one closed graph. The result contains no
incremental artifact loader or runtime compiler.

This remains Oseo's default deployment model. A language or host feature may
still need generic runtime helpers, reflection, promises, or I/O; those costs
do not imply dynamic source compilation.

### Closed dynamic module set

An `import()` expression may choose among a finite set of modules resolved
during the build. Every selected module is parsed, linked, and compiled before
the executable is produced. At run time, the import expression resolves a
canonical identity from the recorded set, starts or reuses its module
evaluation, and settles the specified promise.

This class needs dynamic-import semantics and a module registry, but no source
compiler. The admission decision must define how the build proves that the
specifier space is closed. A literal, a finite compiler-owned expression
model, and an explicit application manifest are candidates; ordinary
JavaScript analysis that cannot prove a finite set does not guess.

### Late native artifacts

A running process may accept a native unit compiled earlier or by an external
supported compiler host. The loader validates the target, runtime ABI,
compiler options, source and dependency identities, and required capability
set before the unit joins the process. Publication is atomic: a failed
validation or load exposes no new binding, module, function, or partially
registered code.

This class supports REPL experiments and may later support a host policy that
loads precompiled modules. It does not let an arbitrary JavaScript program
compile a source string. [*PLAN-REPL.md*](./PLAN-REPL.md) owns interactive
session behavior built on this class.

### Runtime source compilation

Source becomes known after execution starts and must be parsed, compiled,
loaded, and executed with the required ECMAScript environment. This class is
needed by the `Function` constructor family and `eval`. Unrestricted dynamic
import may also need it when the selected host policy supplies source rather
than a compatible native artifact.

The compiler service is an explicit optional component. A self-contained
native service depends on M8 self-hosting. Before M8, a supported Node.js or
Deno compiler host may exercise the same artifact boundary in a probe, but it
does not satisfy language-level `eval` inside a standalone Oseo executable.


Non-goals while deferred
------------------------

This plan does not change the M5 unsupported classifications or permit a
release to claim ECMA-262 conformance while the dynamic-source gap remains. It
does not require M5, M6, M7, or M8 to wait for dynamic-source implementation.

The plan does not define REPL submission, redefinition, display, prompt,
interruption, or history semantics. Those belong to
[*PLAN-REPL.md*](./PLAN-REPL.md). A REPL loader probe may supply evidence for
late artifacts without exposing `eval` to Oseo programs.

No runtime helper interprets source as an approximation. Runtime compilation
does not imply hotness profiling, speculative recompilation, on-stack
replacement, or deoptimization. This plan also does not introduce a stable
embedding API, plugin ABI, or Node-API compatibility.

Source acquisition is separate from compilation. M6 owns web transport and
M7 owns selected file, package, and module-resolution behavior. Admitting
dynamic import does not silently grant filesystem or network access.


Relationship to the roadmap
---------------------------

M5 supplies the language semantics needed to describe each environment and
records the global-object and dynamic global-binding decision. It retains the
current rejection until a feature-specific architecture decision satisfies
the entry criteria below.

M6 and M7 may supply host loaders and resolution policies for modules. A
closed dynamic module set can be admitted without waiting for either milestone
when its entire graph is build input. A loader that reads new source or
artifacts uses only host capabilities already present in its selected runtime
profile.

The REPL track supplies a persistent-session consumer for late native
artifacts. Its loader, ABI, and lifetime probes should be shared where their
contracts match, but REPL session rules must not become ECMAScript `eval`
rules.

M8 makes an embedded native Oseo compiler possible. Self-hosting alone does
not admit dynamic source. The compiled service still needs capability-aware
packaging, environment semantics, artifact validation, code lifetime, target
evidence, and standards tests.


Capability derivation and build contract
----------------------------------------

The frontend and graph builder produce a compiler-owned requirement set from
owned syntax, canonical modules, selected host facilities, and explicit build
policy. Bootstrap-parser nodes and linker accidents do not decide the result.

The derivation follows these rules:

 -  a known semantic operation names the runtime capabilities it needs;
 -  capabilities form a reviewed dependency graph, and the build links its
    transitive closure;
 -  a dynamic construct rejected by the selected profile produces an owned,
    source-located diagnostic before native toolchain work begins;
 -  analysis that cannot prove a bounded module or intrinsic set widens the
    requirement or rejects the build according to explicit policy;
 -  computed global-property access is not treated as proof that every
    intrinsic is absent or present; and
 -  specialization changes code shape, not the required generic semantic
    surface.

ECMAScript can observe an intrinsic without calling it. Property lookup,
descriptors, enumeration, aliases, and constructors reached through existing
function objects prevent unsound call-graph deletion. A standards-conforming
profile therefore retains every observable intrinsic it promises. A smaller
application profile may omit a feature only when that omission is part of its
documented language and host contract.

Each native result retains a machine-readable capability manifest. Its schema
is decided before implementation, but it must be able to identify:

 -  the language and host profiles;
 -  the canonical module-set digest and whether that set is closed;
 -  the native target and runtime ABI;
 -  the required runtime component closure;
 -  whether late artifact loading or source compilation is permitted;
 -  the compiler and artifact format when either is present; and
 -  selected system libraries and target capability restrictions.

The initial runtime archive remains valid input while this work is deferred.
Its component translation units are ownership boundaries, not yet a promise of
minimum feature-level linking. Capability-aware packaging needs a measured
baseline and must report component cycles that make a small program pull in an
otherwise unrelated family. It must not depend on undocumented static-linker
dead stripping.


Dynamic import contract
-----------------------

Build-time-resolvable dynamic import is the first candidate because it can
preserve a closed native program. Its feature decision must define:

 -  specifier expression evaluation and conversion;
 -  import attributes admitted by the selected edition;
 -  canonical resolution relative to the active Script or module;
 -  one module record and namespace per canonical identity;
 -  promise creation, reuse, settlement, and failure timing;
 -  linking and evaluation failure propagation;
 -  synchronous and asynchronous dependency cycles;
 -  interaction with top-level `await` and the job queue; and
 -  the owned error when a run-time value falls outside the recorded set.

The finite-set proof belongs to the build manifest, not to module semantics.
Two builds that include the same canonical modules must observe the same module
identity and evaluation behavior whether an import was static or selected
dynamically.

Late artifact and runtime-source policies are later extensions. They retain
the canonical identity, single-evaluation, live-binding, scheduler, and
failure contracts accepted by
[ADR 0009](./docs/adr/0009-module-identity-and-linking.md). A host loader may
obtain bytes asynchronously, but it cannot publish a module before validation
and linking complete.


Function and eval contracts
---------------------------

The `Function` constructor family, indirect `eval`, and direct `eval` are
separate semantic units. Sharing a compiler service does not make their
environment rules interchangeable.

The `Function` constructor family compiles parameter and body strings in the
specified realm and global environment. Its decision covers parsing goal,
strictness, source text, function kind, prototype selection, constructor
behavior, property attributes, error timing, and source locations.

Indirect `eval` compiles Script source against the required global
environment. It does not capture the caller's lexical environment. Its
decision still covers realm selection, strictness, global declarations,
completion values, and host permission to compile strings.

Direct `eval` is the last and widest unit. It can observe the caller's lexical,
variable, private, and strictness state and can introduce declarations under
edition-specific rules. Oseo cannot recover that state by deoptimizing a frame
that discarded it. Before a function containing direct eval is compiled, its
owned IR must choose an environment representation that remains valid if the
call executes.

The direct-eval decision must show how this cost stays local. A function that
cannot perform direct eval should keep ordinary closed-world binding and
specialization behavior. An alias that invokes indirect eval must not force
caller lexical materialization merely because the value originated from the
global `eval` intrinsic.


Compiler service and artifact boundary
--------------------------------------

The staged compiler consumes source, an explicit parse goal, environment and
realm descriptions, target facts, runtime ABI, policy, and source identity. It
produces a native artifact plus validation metadata. It does not mutate the
running process while parsing or compiling.

The initial C11 backend does not settle the runtime compiler shape. Candidate
probes may generate C and invoke an external toolchain, emit a loadable object
through a future backend, or use another inspectable artifact boundary. No
candidate becomes the deployment contract before measuring toolchain
presence, temporary storage, startup latency, executable size, sandbox
restrictions, and failure cleanup.
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md) owns any conclusion about Oseo's general
code-generation path. This plan owns whether a candidate artifact and compiler
service satisfy dynamic-source capability, validation, and lifetime needs.

Only the generic call ABI is stable across independently compiled units.
Private specialized entries remain inside one artifact. A loaded unit may call
older code and may be retained by closures, continuations, promises, module
records, exceptions, or diagnostics.

Validation rejects:

 -  a mismatched target, runtime ABI, artifact format, or compiler contract;
 -  undeclared runtime or host capabilities;
 -  stale module, environment, or intrinsic identities;
 -  malformed relocation, symbol, root, source, or stack metadata; and
 -  an artifact whose executable-memory policy is unavailable on the target.

Validation success precedes relocation and publication. Failure releases every
temporary file, mapping, native handle, compiler allocation, and unpublished
heap object through owned cleanup paths.


Code and metadata lifetime
--------------------------

Loaded code is runtime-owned state. A binding can be replaced while an older
closure, queued job, suspended continuation, exception, stack trace, or module
namespace still reaches the earlier artifact.

The collector must trace artifact ownership through ordinary managed values or
an explicit companion table. Raw instruction pointers are not treated as heap
objects. Unloading begins only after no live value, native frame, pending job,
diagnostic, or source record can reach the artifact, and target-specific
instruction-cache or loader requirements have completed.

Source text, line maps, stack metadata, canonical module records, and compiler
diagnostics may have different retention needs from executable pages. The
lifetime decision records each owner separately so removing debug metadata
cannot leave a dangling stack or source reference.

The late-artifact contract should be shared with
[*PLAN-REPL.md*](./PLAN-REPL.md) where possible. A divergence must name the
semantic reason, such as REPL redefinition state versus direct-eval lexical
capture, rather than creating a second loader accidentally.


Target and security boundary
----------------------------

Each supported execution target reports whether it can load the selected
artifact and whether it permits the required executable-memory transition.
Linux AMD64 and macOS AArch64 need native execution evidence. AArch64 Linux
retains compile-link and artifact inspection until it becomes an execution
target.

A target or sandbox that forbids runtime code generation remains a supported
closed-AOT target when its existing contracts pass. Selecting a dynamic-source
profile on that target produces an owned capability failure. It never falls
back to an interpreter or silently sends source to an external service.

Dynamic-source permission is explicit in the artifact manifest and runtime
policy. Source compilation has bounded input, compiler work, output size, and
retained-code budgets with specified failures. A module loader validates
identity and integrity metadata before publication. Network trust, package
authenticity, and filesystem permissions remain host-policy concerns rather
than implicit powers granted by `import()`.


Property, standards, and structural evidence
--------------------------------------------

Dynamic capability properties extend [*PLAN-PT.md*](./PLAN-PT.md). Generated
closed programs and module graphs compare their derived requirement set with an
independent capability model. Shrinking preserves the construct or computed
access that caused a capability to enter the closure.

The evidence includes:

 -  deterministic capability derivation from identical owned input;
 -  rejection of a forbidden dynamic construct before toolchain execution;
 -  structural proof that a closed binary contains no compiler or loader
    entry;
 -  executable and runtime-archive size deltas for every capability class;
 -  dynamic-import module identity, promise, failure, and scheduler properties;
 -  late-artifact validation, atomic publication, and failure cleanup;
 -  function-constructor and eval differential tests against Node.js and Deno;
 -  specialization-enabled and specialization-disabled equality;
 -  ordinary and forced collection across compilation, loading, execution, and
    reclamation; and
 -  strict-warning, sanitizer, supported-target, and cross-target inspection
    evidence.

The test262 manifest keeps `dynamic-source` cases unsupported until their
complete semantic unit runs. A build-time-resolvable import subset is reported
as that explicit subset, not as unrestricted dynamic import. REPL behavior is
tested against its owned session model and does not count as `eval` evidence.

Failures retain source, module graph, capability manifest, compiler options,
target, runtime ABI, artifact metadata, specialization and collection modes,
seed, replay path, and the validation or execution observation. A loader race
also retains the publication and reclamation schedule needed by its
independent model.


Probe plan
----------

Probe work may begin before a dynamic feature is admitted. Every probe is
internal, target-explicit, and named as planned rather than documented as an
available repository command.

The first probes measure:

 -  the component and symbol closure of representative closed programs;
 -  bounded dynamic-import dispatch over a precompiled module set;
 -  loadable native artifact formats on Linux AMD64 and macOS AArch64;
 -  validation and atomic failure before publication;
 -  calls in both directions across the generic ABI;
 -  retention by closures, promises, continuations, exceptions, and forced
    collection;
 -  safe reclamation and repeated load and unload cycles;
 -  compiler payload, startup, source-to-artifact latency, and peak memory; and
 -  failure on a target or policy that denies runtime executable code.

Each retained result names the source revision, compiler host, native target,
toolchain, runtime ABI, artifact format, system libraries, operating-system
version, sanitizer modes, input size, output size, timings, and observations.
An external-toolchain prototype is evidence about that route, not a commitment
to ship the external toolchain.


Entry criteria
--------------

Capability-aware runtime selection begins only when:

 -  the current runtime component and symbol closure has a reproducible size
    baseline;
 -  an owned requirement graph can represent language, host, loader, and
    compiler capabilities without importing concrete adapters into compiler
    core;
 -  the build can retain and inspect a capability manifest; and
 -  missing or forbidden capabilities have owned diagnostic contracts.

Build-time-resolvable dynamic import additionally requires:

 -  an accepted finite-module-set rule;
 -  a feature decision covering promise, identity, linking, evaluation, and
    failure timing;
 -  the test262 and generated module domains needed to measure that subset; and
 -  an update to ADR 0016 admitting the exact subset.

Late native artifacts additionally require:

 -  a loader probe on both supported execution targets;
 -  an accepted artifact validation and publication decision;
 -  an accepted code and metadata lifetime decision;
 -  generic ABI calls across old and new units under forced collection; and
 -  explicit target capability and denial evidence.

Language-level runtime source compilation additionally requires:

 -  M8 self-hosting for a standalone embedded compiler;
 -  the M5 global-object and dynamic global-binding decision;
 -  an accepted compiler-service and resource-limit contract;
 -  the complete environment decision for the admitted semantic unit; and
 -  standards, differential, property, lifetime, and target evidence that
    reopens ADR 0016.


Delivery order
--------------

1.  Record the current runtime component, symbol, executable-size, and
    compiler-absence baseline for representative closed programs.
2.  Define a compiler-owned capability requirement graph and retained build
    manifest without changing the current language profile.
3.  Probe and decide build-time-resolvable dynamic import, then admit only the
    finite-set subset whose promise, module, and failure semantics are covered.
4.  Share a native artifact loading, validation, publication, and lifetime
    probe with the REPL track.
5.  Add late precompiled module loading only after its host policy, canonical
    identity, integrity, and asynchronous failure contracts are accepted.
6.  After M8, compose the self-hosted compiler behind the same artifact
    boundary and measure the optional compiler-enabled runtime.
7.  Admit the `Function` constructor family and indirect `eval` as separate
    semantic units when their global environment and standards evidence pass.
8.  Admit direct `eval` only after lexical materialization, declaration,
    strictness, private-environment, and localized-optimization rules pass.
9.  Consider unrestricted source-loading dynamic import after the applicable
    M6 or M7 loader policy and every source-compilation criterion are complete.

Every checkpoint updates the applicable decision, language profile,
compatibility manifest, runtime ownership record, target evidence, and this
plan. A probe that shows unacceptable size, latency, sandbox, or lifetime cost
may keep a capability unsupported without weakening the closed-AOT path.


Documentation changes
---------------------

The first capability implementation documents commands only after they exist.
It updates [*DESIGN.md*](./DESIGN.md) with the accepted requirement, artifact,
and lifetime contracts and updates [*ROADMAP.md*](./ROADMAP.md) with the
current track status.

Each admitted semantic unit updates the applicable language profile, test262
manifest, ADR 0016, package documentation, and target capability evidence.
Compiler-enabled distribution documentation states which artifacts contain the
compiler and how a closed build proves that it does not.


Exit criteria
-------------

This plan has no single milestone completion date. Its architecture is
complete when:

 -  closed builds derive a deterministic capability closure and retain a
    machine-readable manifest;
 -  representative closed binaries contain no source compiler or incremental
    loader and have reproducible component, symbol, and size evidence;
 -  build-time-resolvable dynamic import preserves canonical module identity,
    live bindings, single evaluation, promise timing, top-level `await`, and
    owned out-of-set failure;
 -  late artifacts validate target, ABI, identities, metadata, and capability
    requirements before atomic publication;
 -  loaded code and metadata remain alive through every reachable closure,
    frame, job, continuation, exception, module, and diagnostic, then reclaim
    safely;
 -  a compiler-enabled profile carries its parser, compiler, loader, and
    lifetime support without adding them to closed builds;
 -  each admitted `Function` or eval unit implements its exact realm,
    strictness, environment, declaration, completion, and error behavior;
 -  targets that deny runtime code generation retain closed-AOT support and
    reject compiler-enabled profiles explicitly;
 -  property, differential, standards, forced-collection, failure-injection,
    sanitizer, size, target, and replay evidence covers every admitted class;
    and
 -  `mise run check`, `mise run test`, the applicable native and standards
    tasks, and the extended property task pass from a clean checkout.
