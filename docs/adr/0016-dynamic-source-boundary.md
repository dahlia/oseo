ADR 0016: Dynamic source evaluation boundary
============================================

Status
------

Accepted. This record resolves the ahead-of-time challenge checkpoint
required by [*PLAN-M5.md*](../../PLAN-M5.md): whether `eval`, the `Function`
constructor family, and dynamic import enter the M5 language profile, and
how their test262 observations are classified while they stay outside it.


Context
-------

Oseo compiles a closed, resolved module graph into one native program before
execution. `eval`, the `Function` constructor, `new Function`, and dynamic
import with a value unknown at build time all introduce source text after
that closure. [*DESIGN.md*](../../DESIGN.md) forbids admitting them through
an interpreter hidden in a runtime helper, and
[ADR 0013](./0013-m5-edition-and-manifest.md) placed them inside the claim
boundary as explicit gaps awaiting an owned decision.

[*PLAN-M5.md*](../../PLAN-M5.md) requires any admitting decision to define
when source becomes known; how bindings, strictness, realms, and module
identity are preserved; whether produced artifacts remain bootstrap-runtime
independent; how collection and code lifetime are rooted; which targets can
execute the feature; and how test262 observations remain comparable. No
current probe provides that evidence.


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
3.  **Admit only build-time-known dynamic import.** Deferred, not decided.
    A dynamic `import()` whose specifier is resolvable while linking keeps
    the program closed. M4 already anticipates this route. It still needs
    its own plan covering promise identity, failure timing, and manifest
    evidence before admission.
4.  **Keep every dynamic source form explicitly unsupported.** Selected
    for M5. The compiler already rejects these forms with source-located
    diagnostics, the manifest can carry them as unsupported profile
    features, and package-compatibility evidence can later justify
    reopening this record.


Decision
--------

 -  `eval` in call position, the `Function` constructor, `new Function`,
    and every constructor that compiles source text stay outside the M5
    language profile. The frontend and resolver reject them with owned
    `OSEO1001` diagnostics; no runtime helper approximates them.
 -  Dynamic import remains rejected at parse time. Admitting the
    build-time-resolvable subset requires a separate reviewed plan and an
    update to this record, following alternative 3.
 -  Affected test262 cases are classified `unsupported-profile-feature`
    through the existing compile-stage rejection, and reviewed subset
    entries name the gap with the `dynamic-source` dependency tag so
    coverage summaries can total it. They never count as passes, expected
    negatives, or semantic failures.
 -  While this boundary stands, no Oseo release uses an unqualified
    ECMA-262 conformance label. Releases publish measured coverage with
    the dynamic source gap named, as the honest-reporting rule in
    [*PLAN-M5.md*](../../PLAN-M5.md) already requires. Closing M5's
    conformance claim therefore depends on a later decision that either
    admits these features through staged compilation or revises the claim
    boundary of [ADR 0013](./0013-m5-edition-and-manifest.md) with
    recorded rationale.


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


Links
-----

 -  [ADR 0013](./0013-m5-edition-and-manifest.md) defines the claim
    boundary this record narrows.
 -  [*PLAN-M5.md*](../../PLAN-M5.md) names the checkpoint this record
    resolves.
 -  [*DESIGN.md*](../../DESIGN.md) records the module and whole-program
    constraints that motivate the boundary.
 -  [*ROADMAP.md*](../../ROADMAP.md) carries the M8 staged-compilation
    dependency if alternative 2 is ever selected.
