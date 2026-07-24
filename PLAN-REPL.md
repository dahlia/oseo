REPL plan for interactive development
=====================================

Status
------

Implementation status: planned, deferred. This plan defines the architecture
and entry evidence for a full-featured Oseo read-eval-print loop. It does not
reserve a numbered milestone, add a repository command, or make REPL work part
of the active M5 delivery queue.

The REPL is a cross-milestone development track. Host-assisted experiments may
begin once their M5 binding and runtime prerequisites are stable. A
self-contained native REPL that carries its own compiler depends on the M8
self-hosting result. Neither path changes the dynamic-source exclusions accepted
for M5.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md), [*PLAN-DYN.md*](./PLAN-DYN.md),
[*PLAN-GC.md*](./PLAN-GC.md), [*PLAN-M5.md*](./PLAN-M5.md),
[*PLAN-NIO.md*](./PLAN-NIO.md), [*PLAN-PT.md*](./PLAN-PT.md), and
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md). Evidence from an
interactive prototype must update the affected document or decision record
instead of bypassing its current boundary.


Goal
----

Oseo should eventually provide an interactive environment in the tradition of
SBCL and Chez Scheme while preserving Oseo's own execution model. Source
entered at the prompt is compiled to native code by default. Generic execution
remains compiled, specialization remains optional, and no interpreter, runtime
profiling tier, or deoptimization path is introduced to make the shell work.

A completed REPL keeps one session alive across submissions. Values, bindings,
objects, closures, modules, queued jobs, and diagnostics belong to that session
rather than to a sequence of isolated processes. Compilation failure or an
ordinary thrown value does not discard valid earlier state.

Interactive compilation is a tool capability, not an implementation of
language-level `eval`. REPL input arrives through an explicit session boundary
between submissions. Arbitrary Oseo programs do not gain a way to compile
source strings, and [ADR 0016](./docs/adr/0016-dynamic-source-boundary.md)
continues to govern `eval`, the `Function` constructor family, and unrestricted
dynamic import. [*PLAN-DYN.md*](./PLAN-DYN.md) owns the capability and
packaging gates for any future language-level admission.


Target experience
-----------------

The full environment should eventually provide:

 -  single-line and multiline source entry with stable virtual source
    identities;
 -  persistent Script bindings, lexical environments, objects, and closures;
 -  a specified policy for declaration conflicts and deliberate redefinition;
 -  expression result display with specified inspection and user-code rules;
 -  source-located diagnostics that refer to retained submission history;
 -  recovery after parse errors, compilation errors, thrown values, and safe
    interruption;
 -  deterministic rules for promise jobs, timers, top-level `await`, and prompt
    readiness;
 -  file and module loading with canonical identities and one documented cache
    policy;
 -  value inspection, history, completion, and replay metadata built on public
    compiler and runtime interfaces; and
 -  equivalent generic behavior with specialization enabled or disabled.

The first implementation units need not deliver every editing and inspection
feature. They must preserve a route to this target and must not label a
stateless compile-and-run loop as the completed REPL.


Non-goals while deferred
------------------------

This plan does not add `eval`, the `Function` constructor family, unrestricted
dynamic import, realms, or an embedding API to the current language profile.
It does not require M5, M6, or M7 to wait for interactive development work.

Recompiling every earlier submission and replaying the complete session is not
an acceptable state model. It would repeat output, I/O, allocation, and other
visible effects, and it could not preserve object or closure identity. Such a
loop may be useful as a disposable compiler probe, but it is not an
implementation stage of the stateful REPL unless its limitations are explicit.

The initial work does not promise an SBCL-style condition and restart system,
a source-level debugger, or a language-server protocol. Those features may use
the session boundary later, but they do not define its first stable contract.


Relationship to the roadmap
---------------------------

M5 supplies most language-level prerequisites. Its global-object work must
define how Script `var` and function declarations, Script lexical declarations,
module bindings, and `globalThis` relate. The REPL then needs a separate
decision for applying those rules across multiple submissions. M5 does not
admit dynamic source merely because an external shell can compile a new unit.

M6 expands the host and event-loop surface used by interactive asynchronous
programs. M7 supplies file, package, and module-resolution behavior needed by a
practical load command. Neither milestone owns REPL-specific semantics.

M8 makes a self-contained native compiler possible. Before M8, a prototype may
run the compiler under Node.js or Deno and send verified native artifacts to a
persistent Oseo runtime. After M8, the same compiler interface may be composed
inside a native development environment. The session and artifact contracts
must not depend on which supported compiler host performs that compilation.
The loader, validation, and code-lifetime evidence should satisfy the shared
late-artifact criteria in [*PLAN-DYN.md*](./PLAN-DYN.md) rather than creating a
REPL-only native format.
The latency and distribution results also feed
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md), but the REPL does not select Oseo's
general code-generation backend.


Session semantics to decide
---------------------------

JavaScript does not standardize a REPL. Before persistent execution begins, an
architecture decision must freeze the Oseo session rules for:

 -  whether each submission is a Script, a module, or an explicitly selected
    goal;
 -  strictness and the relation between top-level lexical bindings and the
    global object;
 -  redeclaration and redefinition of `var`, `let`, `const`, functions, and
    classes;
 -  when a failed submission may leave declarations or visible side effects;
 -  whether a displayed result is stored in a named session binding;
 -  whether result rendering may invoke user code, accessors, or conversion;
 -  how loaded modules resolve, cache, fail, and observe later definitions;
 -  when promise jobs and timer tasks run before the next prompt is ready; and
 -  what interruption can cancel without corrupting collector, job-queue, or
    binding state.

Each accepted rule needs differential evidence where Node.js and Deno agree.
Where existing shells differ, Oseo needs an owned model and explicit tests
rather than inheriting whichever bootstrap host happens to run the compiler.


Incremental compilation boundary
--------------------------------

The current compiler closes and links one module graph before execution. A
stateful REPL instead needs a persistent session plus incremental native units.
The boundary between them must define:

 -  a session identity, monotonically ordered submission identity, and stable
    virtual source location;
 -  the bindings, cells, shapes, intrinsic identities, and module records a new
    compilation unit may reference;
 -  a versioned generic ABI for calls between older and newer units;
 -  the target, sanitizer, runtime ABI, and compiler options recorded in every
    artifact;
 -  validation before an artifact can enter the running process;
 -  atomic publication of new bindings and code after compilation and loading
    succeed; and
 -  a reproducible record sufficient to inspect or replay a failed submission.

Compiler core continues to define backend-neutral representations and
interfaces. A concrete backend and loader implement the native artifact
format. [*PLAN-BACKEND.md*](./PLAN-BACKEND.md) governs any project-wide
code-generation decision, while this plan governs incremental validation,
publication, and lifetime. The CLI or a later development-environment package
composes the compiler, loader, session, and terminal interface; compiler core
must not import them.


Code and object lifetime
------------------------

Loaded code may outlive the binding that first published it. A closure created
before a redefinition can still point to the older function body, and a queued
job can retain that closure after the prompt returns. Removing a name therefore
cannot unload its code immediately.

Before a persistent loader lands, an architecture decision and native probe
must define:

 -  how function and continuation objects retain their owning code artifact;
 -  how collector tracing reaches artifact ownership without treating raw code
    addresses as ordinary heap objects;
 -  when an unreachable artifact can be reclaimed or unloaded safely;
 -  how exceptions, stack traces, and source maps retain older source records;
 -  how stale specialized entries fall back across a redefinition; and
 -  which supported targets permit the selected loading and executable-memory
    strategy.

The probe runs strict warnings, undefined-behavior and address sanitizers,
forced collection, Linux AMD64 execution, macOS AArch64 execution, and AArch64
Linux compile-link inspection. A target that cannot load a chosen artifact
format receives an explicit capability result rather than a silent fallback to
an interpreter.

Collector tracing and companion-table accounting follow
[*PLAN-GC.md*](./PLAN-GC.md). Reclamation still waits for the code-lifetime
conditions above; an unreachable managed wrapper alone does not prove that no
native frame is executing the artifact.


Asynchronous execution and interruption
---------------------------------------

The session owns one job queue and event-loop state. A submission may return a
value, throw, suspend, schedule later work, or leave referenced handles alive.
Prompt readiness cannot be inferred from an empty native C stack alone.

The session decision must specify whether the prompt waits for a returned
promise, which jobs drain before a result is printed, how output from later
tasks is ordered against new input, and how referenced timers affect session
liveness. Tests use the deterministic clock and injected task sources already
established by M4.

When a session admits network, file, or subprocess work, it consumes the
completion, cancellation, wakeup, and liveness contracts from
[*PLAN-NIO.md*](./PLAN-NIO.md). The session still owns prompt readiness and
JavaScript job ordering; a platform callback cannot publish a prompt or invoke
generated code directly.

Interruption is a runtime transition, not an operating-system signal handler
that abandons arbitrary C frames. A safe initial implementation may interrupt
only at declared compiler or runtime safepoints. It must leave roots, binding
publication, loaded artifacts, and queues in a state that another submission
can use.


Property and differential testing
---------------------------------

REPL properties extend [*PLAN-PT.md*](./PLAN-PT.md) with structured submission
sequences. A model generates declarations, reads, writes, closures,
redefinitions, thrown values, module loads, asynchronous work, interruption,
and collection points. Shrinking preserves the submissions needed to create
the failing session state.

The ordinary properties compare:

 -  Node.js-hosted and Deno-hosted compiler sessions;
 -  specialization-enabled and specialization-disabled execution;
 -  ordinary collection and collection forced at every new safepoint;
 -  the persistent session against an independent binding and artifact-lifetime
    model; and
 -  Linux AMD64 and macOS AArch64 observations for the same submission
    sequence.

Reference JavaScript shells may provide additional evidence for individual
language observations, but host-specific REPL behavior is not the oracle for
Oseo's session rules. Failures retain the complete minimized submission
sequence, session options, artifact metadata, target, seed, and replay path.


Entry criteria
--------------

Implementation beyond disposable probes begins only when:

 -  M5 has a recorded global-object and dynamic global-binding decision;
 -  a session-semantics decision defines submission goals, redeclaration,
    failure, result, asynchronous, and interruption behavior;
 -  a native loading probe establishes a viable artifact boundary for both
    supported execution targets and the AArch64 Linux inspection target;
 -  a code-lifetime decision explains rooting, replacement, reclamation, stack
    traces, and failure cleanup;
 -  the runtime context can outlive one closed module graph without weakening
    collector or scheduler invariants;
 -  compiler and loader interfaces preserve package dependency direction; and
 -  the property model can represent session state and shrink a failing
    submission sequence.

M8 is an additional entry criterion only for work that embeds the compiler in
the native REPL. It does not block a host-assisted prototype that satisfies the
same session and artifact contracts.


Delivery order
--------------

1.  Record the session semantics, incremental artifact, and code-lifetime
    decisions with small native probes for both supported execution targets.
2.  Build an internal stateless compile-and-run probe to measure latency,
    diagnostics, and artifact size. Keep it clearly separate from the REPL.
3.  Add a persistent runtime session with explicit global cells, intrinsic
    identity, source history, and atomic submission publication.
4.  Load incremental native units and retain older code through closures,
    queued jobs, exceptions, and forced collection.
5.  Implement declarations, deliberate redefinition, expression results,
    multiline input, and recovery from parse, compile, and runtime failures.
6.  Add promise, top-level `await`, timer, interruption, module, and
    file-loading behavior in the dependency order established by M5 through
    M7.
7.  Add inspection, history, completion, replay, and stable terminal behavior
    through public session interfaces.
8.  Compose the same interfaces with the self-hosted compiler after M8 and
    remove any bootstrap-host requirement from the native REPL distribution.

Every checkpoint updates this plan and the accepted decisions with measured
latency, code size, target behavior, and retained failure evidence. A probe that
invalidates incremental loading or safe reclamation is useful evidence; it
reopens the affected boundary before implementation continues.


Documentation changes
---------------------

The first implementation change adds contributor guidance only for commands
and workflows that exist in that checkout. It updates [*DESIGN.md*](./DESIGN.md)
with accepted session and artifact contracts, and [*ROADMAP.md*](./ROADMAP.md)
with the current interactive-track status.

Each later unit documents its supported submission forms, redefinition rules,
asynchronous prompt behavior, target capabilities, and known gaps. A public
README or CLI example appears only after the corresponding command exists.


Exit criteria
-------------

The full-featured REPL is complete when:

 -  source entered at the prompt executes as native generic code, with optional
    guarded specialization and no hidden interpreter or JIT tier;
 -  bindings, objects, closures, intrinsic identities, module records, and
    asynchronous state persist across submissions according to the frozen
    session semantics;
 -  redefinition preserves references to older functions and reclaims code only
    after no live value, frame, job, or diagnostic can reach it;
 -  parse errors, compilation failures, thrown values, and supported
    interruptions leave the session in a specified usable state;
 -  multiline entry, expression results, source history, diagnostics,
    inspection, completion, file loading, and module loading use public package
    interfaces;
 -  promise jobs, top-level `await`, timers, output, and prompt readiness follow
    deterministic documented rules;
 -  Node.js and Deno can host the same compiler and session tests, and the M8
    compiler can provide the same service in the native distribution;
 -  Linux AMD64 and macOS AArch64 pass the complete interactive corpus, while
    AArch64 Linux retains compile-link and artifact inspection evidence;
 -  property, differential, forced-collection, failure-injection, sanitizer,
    replay, package, and source-location evidence cover the complete session
    model; and
 -  `mise run check`, `mise run test`, the applicable native and standards
    tasks, and the extended property task pass from a clean checkout.

REPL support does not by itself close the dynamic-source compatibility gap.
Language-level `eval`, the `Function` constructor family, and unrestricted
dynamic import remain governed by their own accepted decision, the entry
criteria in [*PLAN-DYN.md*](./PLAN-DYN.md), and standards evidence.
