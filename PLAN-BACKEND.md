Native backend evolution plan
=============================

Status
------

Implementation status: planned, deferred. This plan defines the evidence and
entry criteria for deciding whether Oseo should keep C11 as its primary native
backend or add another code-generation path. It does not reserve a numbered
milestone, select a replacement, or put backend work in the active M5 queue.

The implemented path remains the reference: backend-neutral MIR lowers to
deterministic C11, the reviewed C runtime is linked separately, and pinned
`zig cc` provides the default compiler and linker driver. A later backend must
earn its maintenance cost against that path. Reaching an entry criterion starts
an investigation, not a migration.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-CRYPTO.md*](./PLAN-CRYPTO.md), [*PLAN-DYN.md*](./PLAN-DYN.md),
[*PLAN-GC.md*](./PLAN-GC.md), [*PLAN-PT.md*](./PLAN-PT.md),
[*PLAN-REPL.md*](./PLAN-REPL.md), [*PLAN-WASM.md*](./PLAN-WASM.md),
[ADR 0003](./docs/adr/0003-c11-runtime-and-zig-boundary.md), and the target
decisions under *docs/adr/*. Evidence that changes one of those contracts
updates the affected document in the same change.


Goal
----

Oseo should retain a code-generation path that is inspectable, reproducible,
and portable across its supported targets. The path must compile the generic
semantics and every guarded specialization from the same validated MIR. A
backend may improve code quality or artifact production, but it cannot become a
source of JavaScript semantics or make specialization necessary for
correctness.

C11 remains useful even if another backend is added. It provides readable
output, strict-warning and sanitizer coverage, a cross-target reference, and a
way to separate backend bugs from runtime or MIR bugs. This plan therefore
treats removal as a separate finding. Adding another backend does not by itself
retire the C path.

The decision should be reversible at the compiler boundary. Runtime language,
native target identity, artifact loading, and code generation are related but
separate choices. Replacing the code generator must not require an unrelated
runtime rewrite or expose an external tool's target spelling as an Oseo
contract.


Non-goals while deferred
------------------------

This plan does not choose LLVM IR, a code-generation library, or an Oseo-owned
machine-code emitter. It does not assume that one of those choices must replace
C11. Candidate names describe experiments, not dependencies.

No work under this plan adds an interpreter, bytecode fallback, profiling tier,
speculative recompilation, or deoptimization path. Generic execution remains
native execution.

The plan does not define a stable public backend plugin API. The compiler-owned
interfaces may change while M5 expands MIR and runtime semantics. Independently
distributed backends would require a separate versioning and compatibility
decision.

Native I/O backends in [*PLAN-NIO.md*](./PLAN-NIO.md) submit operating-system
work and do not generate program code. Matcher strategies in
[*PLAN-REGEXP.md*](./PLAN-REGEXP.md) compile one regular expression sublanguage.
Evidence from either track may expose code-generation costs, but neither track
selects Oseo's program backend.


Implemented baseline
--------------------

The current path has contracts that every candidate must preserve:

 -  compiler core owns syntax, HIR, MIR, specialization policy, and validation;
 -  MIR is the complete semantic input to a native backend;
 -  the C backend lowers MIR directly without replaying HIR or parser nodes;
 -  runtime C is a separate ordered set of reviewed translation units;
 -  the toolchain adapter maps stable Oseo target facts to an external driver;
 -  generated and runtime C use strict C11 and avoid undefined behavior;
 -  Linux AMD64 and macOS AArch64 execute the native semantic corpus;
 -  AArch64 Linux compile-links and retains artifact inspection evidence; and
 -  specialization-disabled and specialization-enabled builds preserve the
    same observable behavior.

The baseline also has known costs. C exposes only the control flow, values, and
calls that Oseo chooses to encode. Runtime helpers can hide facts from the C
optimizer. Explicit roots and completion records can produce memory traffic
that another representation might avoid. C semantics differ from ECMAScript,
so arithmetic, pointer, shift, and floating-point operations need deliberate
containment.

Those costs are not findings by themselves. The baseline needs measurements on
reviewed workloads before a candidate can claim an improvement.


Decision boundaries
-------------------

The eventual decision covers several questions that should not be collapsed
into one backend name.

### Primary and reference paths

The decision states whether C11 remains the primary backend on every supported
target, becomes a reference and portability backend beside another primary
path, or is retained only for a bounded set of targets or diagnostics.

Selecting different primary backends for different targets requires an
explicit reason. Target availability alone is insufficient if it produces
different semantic or debugging contracts.

### Runtime boundary

A candidate links against the existing private runtime ABI unless its probe
shows a specific incompatibility. The probe must distinguish code-generator
limits from runtime ABI limits. A new calling convention, stack-map format, or
exception representation receives its own decision when it would affect
independently compiled units or runtime ownership.

The C runtime may remain in place when generated program code no longer passes
through C. Conversely, changing a runtime component does not imply a new
program backend.

[*PLAN-GC.md*](./PLAN-GC.md) owns allocation, tracing, collection policy, and
the behavior used to enumerate roots. A backend owns only its encoding of the
compiler-provided root and safepoint facts. Adding a backend neither forks the
heap nor requires a collector rewrite.

### Toolchain boundary

A backend produces an explicit artifact or an explicit request for a separate
tool. It does not locate compilers, inherit a host target, or invoke a linker
through hidden process state.

An external IR tool, code-generation library, assembler, archiver, and linker
have different versioning and distribution costs. A candidate records each
one. Bundling a library does not make its target support or output
reproducibility an Oseo guarantee.

Pinned `zig cc` remains the canonical C11 adapter and reference evidence. A
future same-host system adapter may invoke GCC or Clang on Linux and Apple
Clang on macOS, but it must be selected explicitly or through a documented
`auto` policy. Automatic fallback is permitted only when the Zig executable
cannot be found or started. It must not retry a failed Zig compile or link with
an ambient compiler, because doing so would hide a reproducibility, source, or
dependency failure.

Each adapter reports the compiler version and target, archiver and linker,
C11 capability, libc, sysroot or SDK, deployment target, sanitizer support,
complete arguments, and environment policy. That identity participates in
runtime and dependency artifact keys. `linux-aarch64-musl` remains a Zig
cross-target unless a named cross-compiler adapter supplies equivalent
evidence. Future Windows support uses explicit MSVC, `clang-cl`, or MinGW
adapters rather than assuming a Unix-shaped `cc`.

Bundled runtime or dependency archives must prove compatibility with every
supported adapter. [*PLAN-CRYPTO.md*](./PLAN-CRYPTO.md) applies this policy to
cryptography artifact packs; it does not choose the general C toolchain.

### Metadata ownership

The compiler owns the facts needed for roots, safepoints, source locations,
stack traces, calls, exceptions, and artifact validation. A candidate may
choose a backend-specific encoding, but it cannot reconstruct missing facts
from generated machine code.

Metadata needed by the collector or generic ABI is validated before code
publication. Debug-only metadata may be optional when its absence cannot affect
program behavior or memory safety.

Collector metadata follows the same rule. MIR supplies safepoint liveness and
heap-store facts before lowering; a candidate may encode them as explicit
frames, stack maps, spills, or registers but cannot discover a missing live
value afterward.


Candidate classes
-----------------

The first investigation should compare classes of implementation rather than
start several production backends.

### Retain and improve C11

This is the control candidate. It may change C lowering, runtime inline
primitives, translation-unit boundaries, optimization flags, or link-time
optimization while preserving ADR 0003. Improvements must keep `--emit-c`
useful and preserve strict-warning, sanitizer, and cross-target evidence.

The control candidate matters because a local C-lowering fix may remove the
observed problem at much lower maintenance cost than a second backend.

### External optimizing IR

This class emits an external compiler IR and lets a pinned tool perform
selection, register allocation, object writing, and linking. A probe records
the IR version boundary, tool distribution, target coverage, optimization
stability, diagnostics, debug metadata, and whether textual output remains
inspectable.

The experiment must not move specialization decisions out of Oseo MIR. An
external optimizer may refine machine code, but removing the generic fallback
or changing visible evaluation order is never its policy choice.

### Code-generation library

This class calls a library that accepts a lower-level IR or machine operations
and returns code or object data. It may avoid an external compiler process and
support incremental artifacts, but it adds a native dependency to the compiler
or its host adapter.

The probe records host-language bindings, library lifetime, error containment,
cross-compilation behavior, binary size, license, release cadence, and the work
needed to keep Node.js and Deno compiler hosts equivalent.

### Oseo-owned native emitter

This class selects instructions and writes relocatable objects or loadable code
under Oseo's control. It offers the most direct ownership of calling
conventions, stack metadata, and compilation latency. It also requires an
assembler, object-format support, register allocation, relocation handling,
debug information, and target-specific testing.

The first probe covers one narrow vertical slice. It must not grow into a
second incomplete compiler before the comparison is reviewed.

### Composed paths

A composed result may keep C11 as the reference and cross-target path while an
additional backend serves the supported execution targets. It may also use a
direct backend for incremental artifacts while closed builds continue through
C. Such a split is accepted only when shared MIR, ABI, and differential tests
prevent the paths from becoming separate language implementations.


Measurement corpus
------------------

Backend comparisons use reviewed inputs rather than isolated arithmetic
benchmarks. The corpus grows with the project, but its first version includes:

 -  the complete native differential fixture set;
 -  specialization hits, every distinct miss, overflow, and disabled policy;
 -  forced collection at every declared safepoint;
 -  exceptions, cleanup regions, closures, objects, modules, promises, and
    asynchronous continuations;
 -  the reviewed native property suites and applicable test262 cases;
 -  deep and wide module graphs that stress source, object, and link size;
 -  representative compiler-core functions admitted by the self-hosting
    profile; and
 -  late-artifact and REPL probes once those tracks satisfy their own entry
    criteria.

M6 and M7 add representative web and package workloads as their profiles
become executable. A candidate is not delayed until every later milestone, but
results from a toy language subset cannot justify a project-wide migration.

Regular expression matcher probes retain their family-specific corpus under
[*PLAN-REGEXP.md*](./PLAN-REGEXP.md). Only their program-level build and
artifact observations enter this comparison.


Measurements and retained evidence
----------------------------------

Each run separates frontend, MIR construction, optimization, backend lowering,
external compilation, archive creation, and linking time. Combined wall time
alone cannot show which boundary needs to change.

The retained build record includes:

 -  source revision, compiler host, backend, backend version, and policy;
 -  exact native target, toolchain components, flags, and sanitizer modes;
 -  input MIR digest and generated source, IR, object, and executable sizes;
 -  cold and warm elapsed time, CPU time, and peak resident memory;
 -  translation-unit and object counts, link time, and retained runtime
    components;
 -  diagnostics, exit status, and enough intermediate output to reproduce a
    failure; and
 -  normalized artifact inspection for calls, symbols, sections, relocations,
    and required system libraries.

Execution records include observable output, exit status, exceptions,
specialization counters, allocation and collection observations, and workload
timings. Performance claims use repeated runs with the host, target, load, and
variance recorded. A faster result that changes semantics or drops a safety
mode is a failure.

Selected structural checks inspect machine code when code shape is part of the
claim. They should test facts such as the absence of a generic helper on one
guarded hit path, not freeze a complete instruction sequence chosen by an
external optimizer.


Entry criteria
--------------

Small measurement probes may land before every criterion is complete.
Implementation of a second production backend begins only when:

 -  the current MIR and native backend interfaces can express the selected
    comparison corpus without backend recovery from HIR;
 -  the C11 path has a reproducible build, execution, size, and code-shape
    baseline on both supported execution targets;
 -  the comparison harness can run the same validated MIR and runtime ABI
    through each candidate;
 -  at least one replacement trigger below appears in retained evidence;
 -  the candidate can preserve Linux AMD64 and macOS AArch64 execution plus
    AArch64 Linux compile-link and inspection;
 -  failure artifacts identify the backend, target, tools, and input MIR; and
 -  maintaining two paths will not remove the ordinary, native, standards,
    property, or sanitizer gates from either path.

M5 completion is not itself an entry criterion. A stable enough semantic corpus
and an observed backend problem matter more than the milestone label. M8
self-hosting is also not required for a host-assisted probe.


Replacement triggers
--------------------

A trigger opens comparison work. It does not prove that C11 should be replaced.

 -  backend, C compiler, or link time exceeds a reviewed build-latency budget
    on representative module and package graphs;
 -  generated source or peak compiler memory grows beyond a reviewed bound for
    admitted programs;
 -  an important guarded path repeatedly fails its reviewed code-shape or
    performance goal across pinned toolchain updates;
 -  required root, safepoint, stack, exception, or source metadata cannot be
    expressed without unsafe or opaque C conventions;
 -  avoiding C undefined behavior makes lowering less inspectable than the MIR
    contract it is meant to expose;
 -  a supported target cannot be built reproducibly through the pinned C
    toolchain;
 -  incremental artifact work meets the entry criteria in
    [*PLAN-DYN.md*](./PLAN-DYN.md) or [*PLAN-REPL.md*](./PLAN-REPL.md), and an
    external C compilation path fails its recorded latency, temporary-storage,
    sandbox, or cleanup requirements; or
 -  self-hosting evidence shows that the C path imposes an unacceptable
    compiler payload or trusted-tool dependency for an intended distribution.

An isolated benchmark regression, an unpinned compiler difference, or a
preference for a backend technology is not a trigger.


Property and differential evidence
----------------------------------

Backend properties extend [*PLAN-PT.md*](./PLAN-PT.md). They generate valid
bounded MIR or source programs, compile identical owned input through every
candidate, and compare program observations. The generator preserves guards,
generic fallback edges, abrupt completion, and safepoints while shrinking.

Invalid MIR is rejected by compiler-owned validation before any backend runs.
Candidate-specific validation may add encoding or target errors, but it cannot
silently repair malformed semantic input.

A failure report includes the minimized source or MIR, backend and tool
versions, target, specialization and collector modes, seed, replay path,
generated intermediate artifacts, process observations, and retained artifact
directory. Cross-backend disagreement is a failed run until the semantic oracle
or unsupported test premise is identified.

Unless an accepted decision retires it, the ordinary gate continues to exercise
C11 after another backend becomes the default. Extended properties may
partition candidates or targets for cost, but every required partition runs
from the same reviewed file set and seed policy.


Relationship to other tracks
----------------------------

M5 continues to expand language semantics through the implemented C11 path.
This plan does not move a semantic unit out of M5 or make backend exploration a
conformance prerequisite.

M6 and M7 contribute realistic compiler and runtime workloads. Their native I/O
and system-library decisions remain runtime boundaries; a code generator
consumes the resulting target dependencies without choosing them.
[*PLAN-CRYPTO.md*](./PLAN-CRYPTO.md) owns cryptography provider and pack
selection, while this plan owns the compiler and linker adapter policy that
consumes those packs.

M8 can self-host the compiler while still using an external C compiler and
linker. Removing Node.js and Deno from the trusted compiler path does not by
itself require removing Zig. Self-hosting does provide a larger compiler
workload and measured distribution cost for this plan.

[*PLAN-DYN.md*](./PLAN-DYN.md) and [*PLAN-REPL.md*](./PLAN-REPL.md) own
incremental artifact validation, publication, and code lifetime. Their probes
measure whether external C compilation is viable for those capabilities. This
plan owns any conclusion about Oseo's general code-generation backend.

[*PLAN-REGEXP.md*](./PLAN-REGEXP.md) owns matcher representation and lowering.
A future program backend must consume or lower its backend-neutral artifact
without changing regular expression semantics.

[*PLAN-WASM.md*](./PLAN-WASM.md) owns the compiler for WebAssembly dependency
modules and the engine for runtime module bytes. Neither is a backend for
Oseo's JavaScript MIR. A static Wasm compiler may share final linking, target
artifacts, or a future lower machine-operation layer, but its measurements do
not trigger a general program-backend migration without evidence from this
plan's corpus.

[*PLAN-GC.md*](./PLAN-GC.md) owns collector evolution. A backend candidate may
share root-map or barrier probes with that track, but changing the program
backend and changing the collector remain separate decisions with independent
replacement triggers.


Delivery order
--------------

1.  Freeze a versioned measurement schema and reviewed C11 baseline corpus.
2.  Measure the current backend before changing its translation-unit, inline,
    optimization, or link policy.
3.  When a replacement trigger appears, test the smallest C11 improvement that
    could remove it.
4.  If the trigger remains, build bounded candidate probes from identical
    validated MIR. Cover generic calls, roots, abrupt completion, one guarded
    specialization, and all three target roles.
5.  Compare build cost, output, metadata, code shape, execution, distribution,
    and failure behavior. Retain rejected results.
6.  Record an architecture decision that keeps C11 primary, defers the choice,
    or selects an additional backend with its target and dependency scope.
7.  If another backend is selected, create an implementation plan that reaches
    semantic parity in reviewable units while C11 remains green.
8.  Change a default only after the candidate passes the complete required
    corpus and its packaging, diagnostics, and target evidence are documented.

A rejected candidate or a decision to improve C11 can close an investigation.
The plan should not keep a prototype alive only to justify the time spent on
it.


Documentation changes
---------------------

Every retained probe names only commands that exist in that checkout. Internal
one-off commands remain in the probe record rather than contributor guidance.

An accepted backend decision updates [*DESIGN.md*](./DESIGN.md), this plan,
target records, package boundaries, and the applicable runtime ABI or artifact
decision. [*ROADMAP.md*](./ROADMAP.md) records whether the track remains
deferred, is under investigation, or has moved to an implementation plan.
Any changed root or barrier encoding also updates [*PLAN-GC.md*](./PLAN-GC.md)
and its liveness evidence without making that encoding the collector policy.

Public CLI and package documentation describe backend selection only after a
supported selection surface exists. Stable Oseo target names do not change when
an external tool or backend changes its own target spelling.


Exit criteria
-------------

This planning track has no scheduled completion milestone. One investigation
is complete when:

 -  the C11 baseline and candidate inputs are reproducible;
 -  the observed trigger and reviewed budget are recorded;
 -  every candidate result names its dependency, target, metadata, safety, and
    maintenance costs;
 -  generic and specialized observations agree across the compared paths;
 -  supported execution and inspection targets have the required evidence;
 -  an accepted architecture decision retains C11, defers the choice with new
    evidence requirements, or selects an additional backend; and
 -  selected implementation work, if any, moves to a scoped plan with ordinary
    repository gates.

C11 remains the reference and portability backend unless the accepted decision
explicitly finds that its output no longer provides safe or honest evidence.
