ADR 0016: Dynamic source evaluation boundary
============================================

Status
------

Accepted. This record resolves the M5 ahead-of-time challenge checkpoint:
whether `eval`, the `Function` constructor family, and dynamic import enter the
M5 language profile, and how their test262 observations are classified while
they stay outside it.

Amended on 2026-11-03, when the maintainer accepted the amendment in the
[static-specifier import design](../static-specifier-import-design.md) for the
`import-*` units of [*PLAN-LANGUAGE.md*](../../PLAN-LANGUAGE.md). The amendment
selects alternative 3 for one bounded subset of dynamic import and changes
nothing else this record decides.


Context
-------

Oseo compiles a closed, resolved module graph into one native program before
execution. `eval`, the `Function` constructor, `new Function`, and dynamic
import with a value unknown at build time all introduce source text after
that closure. [*DESIGN.md*](../../DESIGN.md) forbids admitting them through
an interpreter hidden in a runtime helper, and
[ADR 0013](./0013-m5-edition-and-manifest.md) placed them inside the claim
boundary as explicit gaps awaiting an owned decision.

[*DESIGN.md*](../../DESIGN.md#remaining-architecture-decisions) requires any
admitting decision to define when source becomes known; how bindings,
strictness, realms, and module identity are preserved; whether produced
artifacts remain bootstrap-runtime independent; how collection and code lifetime
are rooted; which targets can execute the feature; and how test262 observations
remain comparable. No current probe provides that evidence.


Required contract
-----------------

M5 measurement and later milestones need:

 -  a stable answer to whether compatibility work should attempt `eval`,
    `Function` constructor, or unrestricted dynamic import support during
    M5;
 -  deterministic source-located diagnostics for every rejected dynamic
    source form;
 -  manifest classifications that keep the affected test262 cases visible
    without folding them into passes or semantic failures; and
 -  an honest conformance-label policy while the gap stands.


Alternatives considered
-----------------------

1.  **Interpret dynamic source in a runtime helper.** Rejected. It would
    silently create the interpreter tier that the design forbids, give
    interpreted code different performance and observability, and split
    semantics between two engines.
2.  **Ship the compiler inside every produced executable.** Rejected for
    M5. Staged compilation is the only design-compatible route to complete
    `eval` semantics, but it requires the self-hosting work of M8, a code
    lifetime and collection story for newly generated object code, and a
    target story for platforms that forbid runtime code generation. It
    remains the candidate design if later evidence demands `eval`.
3.  **Admit only build-time-known dynamic import.** Selected for the
    bounded subset of the
    [static-specifier import design](../static-specifier-import-design.md).
    A dynamic `import()` whose specifier is resolvable while linking keeps
    the program closed. M4 already anticipates this route. The design
    supplies the feature decision on promise identity, failure timing, and
    manifest evidence that admission needed.
    [*PLAN-DYN.md*](../../PLAN-DYN.md) keeps the entry criteria for every
    other form.
4.  **Keep every dynamic source form explicitly unsupported.** Selected
    for M5, and still selected for `eval`, the `Function` constructor
    family, and every dynamic-import form outside the subset. The compiler
    already rejects these forms with source-located diagnostics, the
    manifest can carry them as unsupported profile features, and
    package-compatibility evidence can later justify reopening this record.


Decision
--------

 -  `eval` in call position, the `Function` constructor, `new Function`,
    and every constructor that compiles source text stay outside the M5
    language profile. The frontend and resolver reject them with owned
    `OSEO1001` diagnostics; no runtime helper approximates them. In the
    current implementation, a program that reaches one of these as a value
    the frontend cannot see is rejected by the native runtime instead, with
    the same owned `OSEO1001` diagnostic, after its earlier statements have
    run: on any call or construction of `%Function%`,
    `%GeneratorFunction%`, `%AsyncFunction%`, or
    `%AsyncGeneratorFunction%`, and on a call of `%eval%` with a String
    argument.

 -  Alternative 3 is selected for the static-specifier subset defined in
    *docs/static-specifier-import-design.md*: an ImportCall whose only
    argument is a string literal, at a site in a module or in a Script
    with a build-side referrer identity. Each such request resolves during
    the build relative to the source that contains it, and its target's
    transitive static and literal closure must resolve, load, parse, link,
    and compile before native generation; a failure is a build diagnostic,
    not a language result.

    Dynamic-only modules evaluate on request through the same runtime
    module evaluation algorithms as the static graph, which share one
    record, namespace, evaluation state, and evaluation error per canonical
    identity. Each call returns a fresh promise from the realm's intrinsic
    `%Promise%`, and the host completes HostLoadImportedModule
    synchronously from the recorded table.

    Every other dynamic-import form, including computed specifiers, options
    and import attributes, phase imports, runtime source acquisition, and
    any import inside eval or `Function` source, stays rejected with the
    existing `OSEO1001` diagnostic. Implementation and admission require
    the design's test groups, the repository gates, and explicit admission
    approval; until those are recorded, every `import()` remains rejected.

 -  For this subset, the retained request record replaces the capability
    baseline and full manifest schema that *PLAN-DYN.md* lists for
    capability-aware runtime selection. Those remain prerequisites for late
    artifacts and runtime source compilation.

 -  Affected test262 cases are classified `unsupported-profile-feature`
    through the owned `OSEO1001` rejection, whether the frontend reports it
    before execution or the runtime reports it at the invocation, and
    reviewed subset entries name the gap with the `dynamic-source`
    dependency tag so coverage summaries can total it. They never count as
    passes, expected negatives, or semantic failures.

 -  While this boundary stands, no Oseo release uses an unqualified
    ECMA-262 conformance label. Releases publish measured coverage with
    the dynamic source gap named, as the honest-reporting rule in
    [*DESIGN.md*](../../DESIGN.md#supported-semantics) already requires.
    Closing M5's conformance claim therefore depends on a later decision that
    either admits these features through staged compilation or revises the
    claim boundary of [ADR 0013](./0013-m5-edition-and-manifest.md) with
    recorded rationale.

 -  The amendment leaves the `eval` and constructor-family decisions, the
    no-interpreter invariant, the conformance-label restriction, the
    inventory denominator, and the exclusion review rules as they are. It
    grants no M5 exclusion.


Consequences
------------

 -  M5 semantic streams can proceed without reserving design room for a
    hidden interpreter, and specialization work keeps the closed-world
    assumption that every executable function is known at build time.
 -  The compatibility manifest gains a stable dependency tag for the gap,
    so coverage reports distinguish dynamic-source unsupported results
    from ordinary missing built-ins.
 -  Whole-program optimizations may rely on the absence of dynamic source,
    but each such reliance must be recorded where it happens so a future
    staged-compilation decision can find every affected assumption.
 -  Build-time refusals of the static-specifier subset are reported as
    subset boundaries, separate from runtime language failures. The closed
    program assumption holds because no module enters the program after the
    build. Whole-program optimizations that assume a fixed evaluation
    schedule now record their reliance on the runtime driver instead.
 -  Package-compatibility experiments that fail on `eval` or dynamic
    import produce classified evidence instead of blocking, feeding the
    replacement triggers below.


Failure modes and replacement triggers
--------------------------------------

Reopen this record when:

 -  the compatibility laboratory shows that packages Oseo targets cannot
    run without `eval`, `Function`, or unrestricted dynamic import;
 -  a probe demonstrates staged compilation with acceptable code lifetime,
    rooting, and target coverage; or
 -  the WinterTC profile targeted by M6 makes one of these features a
    conformance requirement that documented server-runtime deviations
    cannot cover.

Reopen the static-specifier subset decision if any of these holds:

 -  package evidence needs computed specifiers or attributes;
 -  the driver cannot preserve the edition's order for asynchronous cycles;
 -  the synchronous host load choice conflicts with a host the WinterTC
    profile requires; or
 -  rooting or target evidence fails.


Links
-----

 -  [ADR 0013](./0013-m5-edition-and-manifest.md) defines the claim
    boundary against which this record leaves an explicit gap. Narrowing that
    boundary would require the later decision this record's own consequences
    name.
 -  [ADR 0019](./0019-m5-claim-closure.md) removes M5 completion's dependence
    on the later decision this record requests, and moves the conformance label
    to its own gate. It does not supply that decision.
 -  [*ROADMAP.md*](../../ROADMAP.md) names the M5 work stream this record
    resolves.
 -  [*DESIGN.md*](../../DESIGN.md) records the module and whole-program
    constraints that motivate the boundary.
 -  [*ROADMAP.md*](../../ROADMAP.md) carries the M8 staged-compilation
    dependency if alternative 2 is ever selected.
 -  [*PLAN-DYN.md*](../../PLAN-DYN.md) defines the deferred capability,
    packaging, artifact, and evidence track without changing this decision.
 -  The [static-specifier import design](../static-specifier-import-design.md)
    specifies the subset that alternative 3 admits, and
    [*PLAN-LANGUAGE.md*](../../PLAN-LANGUAGE.md) schedules its
    implementation units.
 -  [*PLAN-REPL.md*](../../PLAN-REPL.md) keeps future tool-level interactive
    compilation separate from language-level dynamic source evaluation.
