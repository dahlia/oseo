M0-A plan for architecture decisions and executable probes
==========================================================

Status
------

Implementation status: complete. The decision set and executable probes meet
the exit criteria below. [*PLAN-M0-B.md*](./PLAN-M0-B.md) is ready to begin.

This is a living plan for the first half of milestone M0. It may change when a
probe disproves an assumption, a tool cannot satisfy the required host matrix,
or an architecture decision exposes a missing prerequisite. Changes should
record the evidence that caused them and update [*DESIGN.md*](./DESIGN.md) or
[*ROADMAP.md*](./ROADMAP.md) when their claims also change.

M0-A turns the provisional parts of the design into measured decisions. It does
not build a usable Oseo compiler. Its output is a set of decision records,
reproducible probes, and a narrow language-profile contract that M0-B and M1 can
implement without guessing at package boundaries or native ABIs.


Inputs and constraints
----------------------

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md), and
[*CONTRIBUTING.md*](./CONTRIBUTING.md). The following constraints are fixed for
M0-A:

 -  the compiler is written in TypeScript and remains runnable under Node.js and
    Deno;
 -  the compiler core uses erasable TypeScript and does not depend on the
    TypeScript compiler API;
 -  source types and JSDoc types are optimization hints, never proof of runtime
    behavior;
 -  the initial native path emits C11 and uses Zig as its default C toolchain;
 -  the backend, runtime, native toolchain, parser, and compiler host remain
    replaceable;
 -  every accepted language construct will eventually require complete generic
    semantics before specialization is added.

Decisions inside those constraints are still open. M0-A must test them instead
of treating the first convenient implementation as permanent architecture.


Deliverables
------------

M0-A produces the following artifacts:

 -  an architecture decision record template under *docs/adr/*;
 -  accepted or explicitly deferred decision records for the initial platform,
    bootstrap parser, C backend and toolchain boundary, tagged-value layout,
    call and abrupt-completion ABI, and garbage-collector root protocol;
 -  reproducible probes under *experiments/*, with commands and expected
    observations exposed through mise tasks;
 -  a draft M1 language profile and unsupported-feature policy in
    *docs/language-profile-m1.md*;
 -  exact, non-floating mise pins for every tool needed to run the probes;
 -  updates to the design and roadmap wherever the evidence changes their
    current assumptions.

Probe source and result summaries are committed. Generated executables, object
files, assembly listings, and temporary directories are not committed unless a
specific listing is required as reviewed evidence in a decision record.


Results
-------

M0-A produced [*docs/language-profile-m1.md*](./docs/language-profile-m1.md),
the decision-record template, and six accepted records under *docs/adr/*. The
records select the pinned development hosts and targets, Babel behind an
owned-syntax boundary, the C11 and Zig responsibility split, NaN-boxing for the
initial x86-64 generic value, a two-word generic call result, and linked
explicit root frames for the initial non-moving collector.

The checked-in probes under *experiments/* reproduce every required result.
Node.js and Deno produce byte-for-byte equal owned parser data. The native C11
fixture runs on x86-64 and links for AArch64. Both value layouts pass their
correctness cases and emit assembly summaries for both architectures. The call
and root fixture preserves live values through normal, nested, abrupt,
allocating, and forced-collection paths.

On July 14, 2026, `mise run check` passed. Removing *node\_modules/* and running
`mise run check:probes` restored the locked parser dependencies through aube and
passed every probe, which verifies the required clean dependency path.


Decision record format
----------------------

Create *docs/adr/0000-template.md* before recording a decision. Each decision
record contains:

 -  status: proposed, accepted, superseded, or deferred;
 -  the context and the contract that later work needs;
 -  alternatives considered, including the option of postponing the decision;
 -  the probe, fixture corpus, target, tool versions, and commands used;
 -  observed results, with measurements where code shape or size matters;
 -  the decision and its consequences for package and ABI boundaries;
 -  failure modes and conditions that require the decision to be revisited;
 -  links to superseding or dependent decisions.

A deferred record is not an empty placeholder. It must state why M0 cannot
decide yet, what temporary boundary contains the uncertainty, and which named
M1 experiment will settle it.

The initial record set is expected to be:

| Record | Subject                                                     |
| ------ | ----------------------------------------------------------- |
| 0001   | Initial development hosts, native target, and tool versions |
| 0002   | Bootstrap parser and owned-syntax boundary                  |
| 0003   | C11 backend, C runtime, and Zig toolchain boundary          |
| 0004   | Generic tagged-value representation                         |
| 0005   | Generic calls and abrupt completion                         |
| 0006   | Root stack and collection safepoints                        |

The numbering may change if a prerequisite decision appears. The subject and
the evidence matter more than preserving this provisional numbering.


Work sequence
-------------

The work below is ordered. A later probe may begin only when the contracts it
consumes are written down, even if the earlier decision is still marked
proposed.

1.  Establish the reproducible probe environment.

    Pin an active Node.js LTS release, a stable Deno release, a stable Zig
    release, and aube in *mise.toml*. Keep Hongdown and the existing formatting
    tasks. Do not use `latest`, a moving Zig nightly, a globally installed
    package manager, or an unrecorded system C compiler.

    Add a private root *package.json* and *aube-lock.yaml* when the parser
    probes first require JavaScript dependencies. They remain probe
    infrastructure, not a publishable workspace. M0-B owns
    *aube-workspace.yaml*, the final root manifests, and all `@oseo/*` package
    manifests.

    Add `probe:*` tasks and a `check:probes` aggregate as each probe appears.
    Every task must print or capture the relevant target and tool versions in
    its result summary. Running `mise install` followed by
    `mise run check:probes` from a clean checkout must be sufficient.

2.  Write the M1 language-profile and diagnostic contracts.

    Define the smallest semantic units intended for the first generic native
    slice. The profile must say which primitive values, declarations,
    expressions, calls, and control-flow constructs are accepted. It must also
    list the prerequisites that prevent apparently small syntax from entering
    the profile early.

    Separate four failure classes: parse failure, syntax outside the language
    profile, unsupported runtime value or operation, and unsupported host
    capability. Define a diagnostic as a stable code, source identifier, byte
    range, line and column range, message, and optional notes. Parser exceptions
    and host stack traces never become user-facing diagnostics.

    This document freezes the target for M1 planning, not for all future Oseo
    releases. Expanding it requires another plan with complete generic semantics
    and tests.

3.  Probe the bootstrap parser.

    Use `@babel/parser` as the primary candidate because the intended package
    split already isolates a Babel adapter. Compare it with at least one
    credible alternative before accepting the decision. The comparison must
    cover TypeScript syntax, JSDoc attachment, comment and token retention,
    source ranges, recoverable and fatal errors, ESM packaging, startup cost,
    and execution under both Node.js and Deno.

    Build a small corpus containing valid M1 candidates, type annotations,
    JSDoc hints, deliberately invalid source, unsupported but parseable syntax,
    Unicode identifiers, comments around ambiguous nodes, and line-ending edge
    cases. Convert parser output immediately to a small Oseo-owned probe schema
    and compare the normalized JSON produced by both hosts. No parser-specific
    node may cross the proposed frontend boundary.

    Accept the parser only if both hosts produce equivalent owned data and all
    failures can be converted to Oseo diagnostics. Record replacement triggers,
    including package portability, parse fidelity, performance, and the future
    self-hosting path.

4.  Probe the C11, runtime, and toolchain boundaries.

    Compile a hand-written generated translation unit and a separate C runtime
    translation unit. Archive the runtime as a static library, then link and run
    the fixture for the native Linux x86-64 target with `zig cc`. Compile the
    same sources for AArch64 Linux without running them. Use C11 mode, strict
    warnings, and undefined-behavior sanitization on the native run.

    The probe must keep four responsibilities separate: backend emission,
    runtime source selection, target description, and process execution. Record
    the minimal data passed between them. The backend must not locate Zig or
    execute a process. The runtime must not know which backend emitted its
    caller. The toolchain must not define JavaScript semantics.

    Do not introduce Zig source code or *build.zig*. Zig is used as a pinned C
    compiler and linker driver. The decision record must explain how another C
    compiler, runtime implementation, or native backend could replace each
    component.

5.  Compare tagged-value layouts.

    Implement independent C probes for the current NaN-boxing candidate and a
    conventional low-bit tagged alternative. Each probe covers all IEEE 754
    corner cases, NaN canonicalization, negative zero, immediate integer range,
    booleans, null, undefined, heap references, tag recognition, and round trips
    through the generic ABI.

    Run correctness checks with sanitizers. Emit optimized assembly for x86-64
    and AArch64 for tag guards, number checks, small-integer extraction, boxing,
    and heap-reference recognition. Record instruction shape and code size, but
    do not choose a representation from a synthetic timing benchmark alone.

    The decision must state address-space and pointer-canonicalization
    assumptions, the small-integer range, NaN handling, and garbage-collector
    recognition rules. If the evidence is insufficient, retain an opaque
    `OseoValue` boundary and defer the bit layout rather than exposing
    provisional masks across packages.

6.  Probe calls, abrupt completion, and roots together.

    Compare at least explicit tagged results and a status-plus-output-parameter
    ABI for generic calls. A `setjmp` and `longjmp` design may be measured as an
    alternative but must not be selected without showing how it preserves roots,
    destructors, host frames, and source diagnostics.

    The fixture must include a normal return, a nested call, a thrown failure, a
    runtime allocation, and forced collection at every declared safepoint. Test
    that live generic values remain discoverable and that a non-throwing helper
    can stay on a small path. Record how future closures, constructors, rest
    parameters, and specialized private entries fit the generic ABI.

    M0-A does not need a production collector. It needs enough of an explicit
    root-stack prototype to show that the ABI and safepoint protocol can work
    together.

7.  Close the decision set.

    Review the probes as one system. Resolve contradictions between the parser,
    compiler profile, value layout, ABI, and root protocol. Mark records
    accepted only when their downstream contract is precise enough for M0-B.
    Mark the rest deferred with a named containment boundary and follow-up
    experiment.

    Update [*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md), and this
    plan with the results. Remove probe tasks that no longer provide a
    regression signal; keep those that protect an accepted assumption.


Required evidence
-----------------

The probe report must make the following results reproducible:

| Evidence             | Required result                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| Host execution       | The same erasable TypeScript probe runs under pinned Node.js and Deno                           |
| Parser normalization | Both hosts produce byte-for-byte equivalent owned probe data                                    |
| Parser diagnostics   | Invalid and unsupported sources produce source-located Oseo diagnostics                         |
| Native build         | Zig compiles, links, and runs the native x86-64 C11 fixture                                     |
| Cross-compilation    | Zig produces the AArch64 Linux fixture without host headers or libraries leaking in             |
| C safety             | Native probe tests pass with strict warnings and undefined-behavior sanitization                |
| Value layout         | Correctness cases and assembly listings exist for both candidates and both target architectures |
| ABI and roots        | Normal, abrupt, allocating, and forced-collection paths preserve live values                    |

Decision records may summarize generated output, but every claim must point to a
checked-in probe and a mise task that regenerates it.


Exit criteria
-------------

M0-A is complete when all of the following are true:

 -  `mise install` provisions every probe dependency without a separate system C
    toolchain or global JavaScript package manager;
 -  `mise run check` and `mise run check:probes` pass from a clean checkout on
    Linux x86-64;
 -  the initial parser, target, C toolchain boundary, and runtime language have
    accepted decision records;
 -  the value, call, abrupt-completion, and root protocols have either accepted
    records or precise opaque boundaries with named M1 experiments;
 -  the M1 language profile and unsupported-feature diagnostic contract are
    concrete enough to derive parser and differential fixtures;
 -  no production package imports probe code or parser-specific AST types;
 -  the design and roadmap describe the decisions that were actually made.


Out of scope
------------

M0-A does not create the publishable monorepo, release packages, implement HIR
or MIR, lower JavaScript to C, provide general runtime semantics, implement a
collector, or add specialization. M0-B owns the repository scaffold and native
fixture harness. M1 owns the first generic source-to-executable slice.
