Build-time-resolvable dynamic import proposal
=============================================

Status and authority
--------------------

Proposal only, for maintainer acceptance. This document implements option B
of the 2026-10-07 maintainer decision, alongside interim option A under option
C. It plans alternative 3 of [ADR 0016](./adr/0016-dynamic-source-boundary.md).
ADR 0016's accepted decision remains in force: every `import()` is rejected.
This planning node changes no compiler, runtime, harness, capability manifest,
Test262 admission, exclusion authorization, graph state, or closure ledger.

[*PLAN-DYN.md*](../PLAN-DYN.md) owns the capability track. Acceptance of this
proposal authorizes a design direction, not feature admission or implementation
graph nodes. Separate maintainer approval must authorize implementation units
and accept an ADR amendment; admission waits for the evidence gates below.
[ADR 0019](./adr/0019-m5-claim-closure.md) still separates measured M5 closure
from the conformance label. Neither this proposal nor its literal subset closes
unrestricted dynamic import, `eval`, or function-constructor gaps.


Current source contracts
------------------------

*packages/parser-babel/src/convert.ts* has no admitted ImportExpression
conversion. Its unsupported-node path in *locations.ts* emits source-located
`OSEO1001`, with `ImportExpression is outside the M1 profile.`
*packages/compiler/src/syntax.ts* defines owned module sources, resolvers,
loaders, dependencies, and graph results, but no dynamic-import operation.

*packages/compiler/src/modules.ts* discovers static imports and indirect or
star exports in source order. It deduplicates canonical identities, retains
source hashes, and links live cells, namespaces, and strongly connected
components. Host resolution and loading remain injected interfaces.

*packages/compiler/src/module-compile.ts* creates shared namespace bindings
for namespace imports and lowers module bodies into private evaluators. It
emits startup initializers across the linked evaluation order, with per-module
promise bindings and dependency waits. Its current asynchronous component
handling must be preserved and tested; the historical M4 cycle boundary in
*DESIGN.md* is not a claim that current source rejects every asynchronous cycle.
There is no lazy registry for dynamic-only modules. Adding discovered modules
to today's startup schedule would evaluate them before an import request.

*packages/runtime-c/native/runtime\_binding.c* implements namespace objects
backed by live cells. *runtime\_promise.c* supplies promise capabilities,
resolution, reactions, and jobs. These are reusable mechanisms, not an existing
ImportCall implementation. A cached evaluation promise is not the promise
returned by each import call. Existing Test262 observe-only accounting does
not put `dynamic-import` in the checked-in supported feature list.


Proposed finite-set rule
------------------------

The first unit admits only `import("specifier")` with one ECMAScript string
literal argument and no options argument. Parentheses that retain the same
literal syntax may be normalized by the owned frontend. It admits calls in
scripts and modules only when a build-side referrer identity is explicit.
Computed strings, templates, concatenation, variables, conditional expressions,
application allowlists, import attributes, JSON modules, and host-acquired
source require separate decisions. Hints never prove admission.

Every literal request, including one in unreachable code or an uncalled
function, is resolved relative to its recorded referrer during linking using
the selected host resolver. Its transitive static and literal dynamic closure
must be loadable, parseable, linkable, and compilable before native generation.
Canonical aliases share one record; two distinct identities with equal source
bytes remain distinct. Static evaluation edges and dynamic discovery edges
must be represented separately. Discovery does not start evaluation.

Unbounded syntax gets an owned source-located profile diagnostic before the
native toolchain runs. A missing literal target, parse failure, static linking
failure, or unsupported construct in a discovered target fails the build with
its original location and importer chain. This is a deliberate subset boundary:
ECMAScript's runtime load/link rejection cases are not admitted by converting
them to build errors and claiming a standards pass. Their paths remain visible
as unsupported where applicable, with actual observations and reviewed owners.

There is no runtime source lookup or new network, filesystem, package, loader,
compiler, interpreter, or JIT capability. Literal resolution is a build service.
A registry miss in a validated executable indicates violated build metadata,
not permission to discover source. The implementation must reject the fresh
import promise with an owned catchable error and retain the source request;
the error identifier and text require acceptance with the ABI decision.


Promise, evaluation, and failure contract
-----------------------------------------

The normative reference is ECMA-262 16th edition
[EvaluateImportCall and ContinueDynamicImport]. Every executed call creates a
fresh intrinsic `%Promise%` capability in the caller's realm. Repeated and
concurrent calls must return distinct promises, including after success or
failure. Changing the global `Promise` binding must not change that constructor.
Only module records, namespaces, evaluation state, and evaluation failures are
shared by canonical identity within the owning realm and executable.

Literal evaluation and string conversion retain the edition's order, although
the admitted string literal cannot invoke user conversion hooks. Future
specifier or options expressions must preserve synchronous expression/GetValue
abrupt completion before capability creation and promise rejection for later
conversion or options errors. Those future cases are not admitted here.

A request starts or joins the target's evaluation and its static dependency
closure. Dynamic-only targets do not run at startup. Mixed static/dynamic
requests share cells, namespace identity, completion, and single evaluation.
The first request to an already statically evaluated target does not rerun it.
Failed evaluation is cached, including the original thrown value; later calls
get new promises rejected with that value and do not rerun side effects.

Preserve ContinueDynamicImport's loading, link/evaluate, and reaction sequence
through the existing job queue. Precompilation must not inline target evaluation
into the caller's expression or return a namespace synchronously. Tests must
record the ordering of caller code, target side effects, queued reactions,
await continuations, and timers, including an already evaluated target. Do not
assert a fixed extra job count without deriving it from the edition algorithms.
Module throws before or after top-level await reject import promises, rather
than escaping synchronously from `import()` or terminating the process before
a handler can run. Unhandled rejections retain the ordinary checkpoint policy.

Resolve the request capability with the namespace using ordinary promise
resolution. An exported callable `then` can cause thenable assimilation;
namespace identity assertions therefore use modules without that export.
Test callable, noncallable, throwing, and rejecting `then` exports separately.
Live bindings, namespace descriptors, and TDZ behavior retain module semantics.

Synchronous cycles, top-level-await dependencies, shared pending evaluation,
reentrant import, and asynchronous components need explicit state transitions.
A generated model must distinguish discovery, instantiation, evaluating,
suspended, evaluated, and errored states. Reentrant calls must not evaluate a
module twice or resolve with a partially evaluated namespace. Pending promises
alone do not create progress or keep the executable alive; preserve the current
entry-task no-progress diagnostic. A module awaiting its own import may remain
pending. Unsupported scheduling shapes must be bounded in the accepted decision
and diagnosed at build time, never silently declared passing or newly excluded.

[EvaluateImportCall and ContinueDynamicImport]: https://262.ecma-international.org/16.0/#sec-evaluate-import-call


Bounded implementation units
----------------------------

These are proposed work packages, not graph nodes or available commands.
Each requires explicit authorization before implementation.

1.  **Capability baseline and retained schema.** Own the build-side capability
    requirement graph and inspectable manifest through compiler interfaces and
    outer build composition. Record current runtime components, symbols, archive
    and executable sizes for empty, static-module, and promise programs. Define
    deterministic closure derivation, target/ABI fields, forbidden-capability
    errors, and component cycles. Gate: repeatable baselines and schema tests;
    no profile admission and no reliance on undocumented linker dead stripping.
2.  **Owned requests and graph closure.** Own frontend syntax, referrer
    metadata, and separate discovery/evaluation edges in
    *packages/parser-babel/* and *packages/compiler/*. Test literal locations,
    script referrers, aliases, nested dynamic targets, unreachable calls,
    static cycles, missing sources, and unbounded syntax. Gate: deterministic
    request and module digests; diagnostics precede toolchain invocation, and
    public APIs expose no Babel nodes or concrete host imports.
3.  **Lazy evaluation and namespace registry.** Own module compilation, explicit
    HIR/MIR operations, backend emission, and runtime state/root contracts.
    Compile every generic evaluator, but start dynamic-only evaluators on
    demand. Test repeated, concurrent, mixed, cyclic, reentrant, and suspended
    requests, live bindings, TDZ, and cached throws. Gate: independent model
    equivalence, traced roots for every namespace, error, continuation, and
    queued request, and preserved ordinary static-module behavior under forced
    collection.
4.  **Import capability and scheduler integration.** Own fresh realm-intrinsic
    promises, request completion, namespace assimilation, and failure timing.
    Extend parser/compiler package tests, *tests/runtime-promises.test.ts*,
    native module fixtures, and module-continuation properties. Gate: Node.js
    and Deno differential traces match native generic and specialized paths,
    false hints and guard misses preserve behavior, and cached success/failure,
    global-`Promise` rebinding and realm-intrinsic freshness, all four `then`
    export variants, TLA rejection, timers, and no-progress cases pass.
5.  **Evidence and admission.** Own the exact candidate path assessment,
    normative family record, target and size reports, and authorized serialized
    manifest work. Review each candidate's source and assertions at the pinned
    Test262 revision, rather than admitting all feature-tagged paths. Gate:
    acceptance of the ADR amendment, all evidence below, and explicit admission
    approval; only then update the profile, runner, subset, manifest, and owned
    ledger/graph state together under their serialization rules.

Units 2 through 4 are probes until acceptance and may not enable the active
profile. Unit 1 precedes them under *PLAN-DYN.md*'s entry criteria. Unit 5
waits for all four. This node creates none of these nodes or implementations.


Manifest and evidence gates
---------------------------

The proposed retained build manifest must identify its schema version, source
revision, language/host profiles, native target, runtime ABI, resolver policy,
closed-set status, canonical module-set digest, source hashes, and component
closure. Each request records source location, referrer, decoded literal,
canonical target, empty attributes, and discovery versus static evaluation
edges. It explicitly forbids late artifact loading and runtime compilation.
A schema and validation mechanism must be accepted before implementation.

Evidence must show deterministic manifests from equivalent inputs, canonical
alias handling, mismatched/stale identities rejected before execution, and
structural absence of parser, compiler, incremental loader, and source lookup
entries in both ordinary closed binaries and literal-import binaries. Record
symbol/component and executable-size deltas, including capability cycles that
retain unrelated components. The build manifest is distinct from the Test262
compatibility manifest; neither currently implements this proposed schema.

Generated graphs need independent state and trace oracles, closure-preserving
shrinks, seeds, replay inputs, ordinary budgets, and extended budgets as
required by *PLAN-PT.md* and *PLAN-M5.md*. Cover aliases, lazy side effects,
shared pending state, cycles, errors, namespaces, and collection at each
request/evaluation safepoint. Retain source, graph, manifest, target, ABI,
compiler options, specialization/collection modes, replay path, and actual
failure observation.

Native execution evidence is required on Linux AMD64 and macOS AArch64;
AArch64 Linux supplies compile-link and inspection evidence only. Include strict
warnings, applicable sanitizers, ordinary/forced collection, truthful/false
hints, and specialization on/off. Runtime objects and jobs own the roots;
immutable code is already in the executable and requires no late-code unload
mechanism.

Test262 assessment separates literal success/evaluation cases from computed
specifier, conversion, attribute, runtime loading/linking failure, and other
unadmitted prerequisites. Keep the fixed inventory and frozen classification
vocabulary. An uncovered runtime loading case cannot be made an expected
negative by a compile-time rejection. A tag or this proposal cannot authorize
an exclusion; existing diagnostic-based audit and remediation rules continue
until an accepted successor decision and reviewed observations justify changes.

For future implementations, existing tasks include `mise run check`,
`mise run test`, `mise run test:property:extended`, and applicable sanitizer
tasks listed by `mise tasks`. A runner/profile change needs the full canonical
`mise run test262:update`, not the subset-only changed update. New probe,
manifest-inspection, or dynamic-import test commands remain planned until added
to *mise.toml*. This planning change runs documentation/graph consistency checks
and `mise run check`; the coordinator's full ordinary gate remains pending.


Proposed ADR amendment for acceptance
-------------------------------------

The following is proposed replacement wording for ADR 0016's dynamic-import
decision bullet, not an accepted decision or an instruction to enable support:

> Alternative 3 is selected for the closed string-literal subset described in
> *docs/dynamic-import-staged-plan.md*. Its modules and transitive dependencies
> must resolve, parse, link, and compile during the build. Dynamic-only modules
> evaluate on request, share canonical records and namespaces with static
> imports, and each import call returns a fresh intrinsic promise with the
> edition's evaluation, assimilation, and failure timing. Implementation and
> admission require the plan's capability, manifest, semantic, collection,
> target, standards, and repository gates. Until those gates and explicit
> admission approval are recorded, dynamic import remains rejected. Computed
> specifiers, runtime source acquisition, import attributes, and other forms
> outside that subset remain unsupported and require separate decisions.

Acceptance would also change alternative 3 from deferred to selected for this
bounded implementation direction, qualify alternative 4 for the remaining
dynamic forms, and distinguish build-time subset refusals from runtime language
failures in consequences and reporting. It leaves `eval`, constructor-family
boundaries, the no-interpreter invariant, inventory denominator, exclusion
review requirements, and the conformance-label restriction intact. It grants
no additional M5 exclusions. Record the acceptance date, exact subset, evidence
references, and reopening triggers when the maintainer accepts an amendment.

Reopen the proposal if package evidence needs computed specifiers or attributes,
if lazy/TLA cycles cannot preserve the edition contract, if required runtime
components undermine the closed-binary boundary, or if target/rooting evidence
fails. Keep unsupported observations visible while resolving any such blocker.
