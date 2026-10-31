Static-specifier import design
==============================

Status and authority
--------------------

Design for review, written by the M5c `static-specifier-import-design` node.
Item 3 of the 2026-11-01 maintainer answer approves a design review of the
build-time-resolvable import track that alternative 3 of
[ADR 0016](./adr/0016-dynamic-source-boundary.md) and
[*PLAN-DYN.md*](../PLAN-DYN.md) anticipate. It requires an ADR 0016
amendment and a reviewed plan before the track is accepted. It does not
approve bounded general `eval` or `Function` construction.

ADR 0016's accepted decision remains in force: every `import()` is rejected
at parse time with `OSEO1001`. This document changes no compiler, runtime,
runner, harness, manifest, ledger owner, or exclusion record. The ADR text
below is a draft with status Proposed. It enters ADR 0016 only when the
maintainer accepts it, because
[*docs/m5c-closure/exclusion-audit.yaml*](./m5c-closure/exclusion-audit.yaml)
binds the accepted record by digest and every edit to that record needs a
reviewed audit update.

The landed [build-time-resolvable proposal](./dynamic-import-staged-plan.md)
remains the capability-level plan. This design keeps its finite-set rule and
its promise, evaluation, and failure contract, and adds what the 20 pinned
module-loading rows need: a runtime module evaluation driver, Script
referrers, the settlement order of asynchronous ancestors, and a mapping from
each row to planned test groups.

The normative reference is the ECMA-262 16th edition, the M5 candidate of
[ADR 0013](./adr/0013-m5-edition-and-manifest.md). Algorithm names below are
that edition's: EvaluateImportCall, HostLoadImportedModule,
ContinueDynamicImport, Link, Evaluate, InnerModuleEvaluation,
ExecuteAsyncModule, GatherAvailableAncestors, AsyncModuleExecutionFulfilled,
and AsyncModuleExecutionRejected.


Scope
-----

The pinned selector is
[*m5c-graph/static-specifier-import-design.paths.txt*](./m5c-graph/static-specifier-import-design.paths.txt):
19 DS-12 module-loading-and-promises rows and DS-8's
*test/language/expressions/dynamic-import/usage-from-eval.js*. All 20 are owned
by `node:dynamic-source-coverage-remediation` and observe the parse-time
`OSEO1001` rejection of `import()`.

Admitting the track changes more than these rows. The fixed inventory has
630 paths whose frontmatter lists `dynamic-import`. A heuristic scan of the
pinned test262 revision finds 333 non-negative test bodies whose every
`import(` call has a single string-literal argument, 149 with another
argument form, 146 negative tests, and 2 without a call. The scan ignores
fixtures, so it is a planning estimate, not a selector. Admission therefore
re-observes the whole `dynamic-import` population, as
[Test262 consequences](#test262-and-closure-consequences) describes.


Admitted surface
----------------

The track admits exactly one form:

 -  an ImportCall whose only argument is one ECMAScript string literal, with
    or without the trailing comma the grammar allows, and with no options
    argument;
 -  parentheses around that literal, which the owned frontend may normalize
    because they cannot change its value;
 -  any site in a module, or in a Script that has an explicit build-side
    referrer identity, including function, arrow, method, class, generator,
    and async bodies in that source.

Everything else stays rejected with the current diagnostic text,
`ImportExpression is outside the M1 profile.`, under `OSEO1001`:

 -  computed strings, template literals, concatenation, identifiers, and
    every other expression;
 -  an options argument, including import attributes and JSON modules
    requested dynamically;
 -  `import.defer`, `import.source`, and other phase forms;
 -  any `import()` in source the build does not see, such as direct or
    indirect `eval` code and `Function` bodies, which stay rejected by the
    existing ADR 0016 rules.

The text stays exact because the exclusion audit accepts only that message
for the reviewed dynamic-import exclusions. A clearer message for the
remaining forms is a separate change that updates those audit records under
review. An ImportCall that begins a `new` operand keeps its `OSEO0001`
early error from the `dynamic-import-early-error-precedence` node.

The admitted literal is resolved during the build, as the
[finite-set rule](./dynamic-import-staged-plan.md#proposed-finite-set-rule)
requires. A literal target that cannot be resolved, loaded, parsed, linked,
or compiled fails the build with its source location and importer chain
before the native toolchain runs. That is a subset boundary, not a language
result: test262 cases that expect a runtime load or link rejection stay
unsupported and are never counted as expected negatives.


Build-time resolution
---------------------

### Referrers

EvaluateImportCall uses GetActiveScriptOrModule as the referrer. For code the
build sees, the running execution context's ScriptOrModule is the Script or
module whose source text contains the running function, because a function's
`[[ScriptOrModule]]` is fixed when it is created and the admitted surface
excludes eval code. The syntactic site's source therefore determines the
referrer exactly, and the build resolves every site once.

A Script referrer needs a canonical identity that is not a module record. The
test262 runner supplies the test file's path for Script tests, with harness
includes composed into the same Script. A module whose canonical identity
equals a Script's path is a distinct module record. That separation is what
*eval-self-once-script.js* observes: the file runs once as a Script and once
as a module.

### Graph edges

Static `import` and `export ... from` edges remain evaluation edges. A
literal `import()` adds a discovery edge from its referrer. Discovery loads
the target and its transitive static and literal closure into the build, but
never starts evaluation and never makes the target a startup dependency. The
compiler records each site as a constant request index that names a module
table entry. No specifier string is looked up at run time, so the
proposal's registry-miss error is unreachable for this surface and needs no
runtime path.

Canonical aliases share one module record, exactly as static imports do
under [ADR 0009](./adr/0009-module-identity-and-linking.md). Two identities
with equal bytes stay distinct.

### Linking

Every module in the closure is linked during the build, and its environment
is instantiated at startup, as the static graph is today. The 16th edition
runs Link for a dynamic-only module only inside ContinueDynamicImport.
Instantiating earlier is unobservable when three conditions hold, and the
implementation must test each:

 -  instantiation runs no user code: it creates bindings, initializes `var`
    bindings to `undefined`, and creates hoisted function objects, none of
    which has side effects;
 -  a dynamic-only module's environment is reachable only through its
    namespace, its importers in the same lazy closure, or its own code, and
    none of those exist before the import's link step; and
 -  link failures cannot occur at run time, because the admitted surface
    turns them into build failures.

A future surface that admits runtime link errors loses the third condition
and must move instantiation into the link step.


Module evaluation driver
------------------------

### Why the current schedule cannot serve

*packages/compiler/src/module-compile.ts* compiles evaluation into a fixed
schedule. Each module receives a startup promise binding and waits for
dependency promises in evaluation order. That schedule has one root, the
entry, and decides every ordering at build time.

The pinned rows need state that only exists at run time. A request may
start, join, or reuse evaluation after other evaluations have started or
finished: *fulfillment-order.js* starts B's graph before A's,
*unobservable-global-async-evaluation-count-reset.js* starts D after C
completes, and *module-graphs-does-not-hang.js* evaluates a grandparent after
its parent's asynchronous evaluation finished. Settlement order then depends
on the async-evaluation order of every module that ran.

### Unified runtime driver

The track replaces the compiled schedule with one runtime implementation of
Evaluate and its helper algorithms, used by every module graph:

 -  The build emits a module table. Each entry holds the compiled evaluator,
    whether the module has top-level `await`, its static requested modules in
    source order, its namespace object, and its environment cells.
 -  The runtime adds the per-record evaluation state the edition defines:
    status, DFS index and ancestor index, cycle root, async-evaluation order,
    pending async dependency count, async parent modules, top-level
    capability, and evaluation error. The global module async evaluation
    count lives with the agent's job queue.
 -  Startup calls Evaluate on the entry. The static program becomes the case
    with one Evaluate root, so mixed static and dynamic requests share one
    state machine and one record per canonical identity.
 -  InnerModuleEvaluation runs a module's evaluator synchronously only when
    the module has no top-level `await` and no pending asynchronous
    dependency. A module with top-level `await` and no pending dependency
    starts through ExecuteAsyncModule. Any module with a pending
    asynchronous dependency, with or without top-level `await`, is marked
    for asynchronous evaluation and waits. AsyncModuleExecutionFulfilled
    later runs or starts it from the sorted list that
    GatherAvailableAncestors builds. AsyncModuleExecutionRejected follows
    the edition's separate recursive walk.

The driver dispatches compiled native evaluators, as the promise job queue
dispatches compiled reactions. It is not an interpreter: it executes no
source, and every module body is still compiled generic code. Keeping two
evaluation mechanisms, the compiled schedule for static-only programs and
the driver for programs with `import()`, would make an import's presence
change static evaluation order. The design rejects that split.

Internal reactions use the runtime's PerformPromiseThen operation directly.
The driver never reads `then`, never calls `Promise.all`, and never consults
the global `Promise` binding, so user patches to `Promise`,
`Promise.prototype.then`, or `Symbol.species` cannot change module
evaluation. The existing schedule's `all`, `awaitThen`, and `resolve` module
helpers are replaced by these internal operations, not reused.

Replacing the schedule changes static module behavior wherever the old
schedule deviated from the edition. The first implementation unit therefore
lands the driver for static graphs alone, before `import()` is admitted, and
re-observes the full test262 corpus under `mise run test262:update`. Every
changed static observation is explained under the PLAN-M5C rules before the
unit lands.


Import call semantics
---------------------

### Order of operations

For an admitted site, the compiled code performs EvaluateImportCall with the
build-time request:

1.  Evaluate the literal. It has no conversion hooks and cannot throw.
2.  Create a promise capability from the current realm's intrinsic
    `%Promise%`, never from the global `Promise` binding.
3.  Perform HostLoadImportedModule for the referrer and specifier. Oseo's
    host completes it synchronously from the recorded module table, which
    the edition permits. This host choice is part of the accepted contract
    and the runtime ABI record.
4.  ContinueDynamicImport calls LoadRequestedModules, which returns an
    already fulfilled promise because the whole closure was loaded during
    the build, and registers its reaction with PerformPromiseThen.
5.  In that reaction job, Link succeeds without work and Evaluate returns
    a promise for the evaluation. For a module that is already evaluated or
    evaluating asynchronously, it is the cycle root's top-level capability
    promise, created if absent.
6.  A reaction on that promise resolves the call's capability with the
    module's namespace through ordinary promise resolution, or rejects it
    with the evaluation error.
7.  The call returns the capability's promise.

The call never returns a namespace synchronously, never inlines the target's
evaluation into the caller, and never evaluates anything before the step 5
job. Tests derive job counts from these algorithms instead of asserting a
fixed number.

### Host load timing in differential tests

Node.js and Deno may complete HostLoadImportedModule only after host loading
work, so their job interleaving relative to unrelated reactions can differ
from Oseo's synchronous completion. Both are conforming. Differential tests
against them compare only orderings the edition fixes independently of host
load timing: settlement order of joined requests, leaf-to-root ancestor
order, single evaluation, namespace identity, and error identity. Exact
traces that include unrelated reactions use an independent TypeScript model
of the edition's algorithms with the synchronous host choice. The model is
an oracle in test code; it never runs in a produced executable.

### Promise and namespace identity

Every executed call returns a fresh promise, including repeated, concurrent,
and post-settlement calls. The promise is never the top-level capability
promise. Its prototype is the realm's intrinsic `%Promise.prototype%`, and
`Promise.resolve(p) === p` holds while the global `Promise` binding is
unchanged. Tests also rebind the global `Promise` before the call and check
that the returned promise still uses the intrinsic.

GetModuleNamespace creates at most one namespace per module record. Static
`import * as` bindings and dynamic requests share it, and an export-free
module still has exactly one namespace.

Resolving with a namespace is ordinary promise resolution. An exported
callable `then` makes the namespace a thenable. Callable, noncallable,
throwing, and rejecting `then` exports are tested separately; identity tests
use modules without a `then` export.

### Cached results and errors

A module evaluates at most once per canonical identity. A request for an
evaluated module reuses its result without running side effects again. For
an errored module, Evaluate returns the cycle root's top-level capability
promise, rejected with `[[EvaluationError]]`. Every later request receives
a new promise rejected with the same value, not a copy and not a new error.

In an asynchronous cycle, the error is recorded only on the module that
threw and on the async parents its rejection reaches. A cycle member that
had already finished stays evaluated with an empty `[[EvaluationError]]`.
A later request for that member reaches the error through its cycle root:
Evaluate redirects to the root, and when the root has no top-level
capability because evaluation began from another entry, Evaluate creates
one, InnerModuleEvaluation returns the root's recorded error, and the new
capability rejects with that same value.
*import-fulfilled-member-of-errored-cycle.js* observes that identity. The
model and the runtime keep per-record error state; neither copies the root's
error onto finished members.

### Self-import and reentrancy

A module that requests itself during synchronous evaluation receives a
promise. The step 5 job runs after the current evaluation finishes, so the
module is already evaluated or evaluating asynchronously. A module that
awaits a request for itself, or for an ancestor still waiting on it, waits
forever, as the edition specifies. Pending promises alone do not keep the
executable alive; the existing no-progress diagnostic of the entry task
still reports that state.


Top-level `await` interactions
------------------------------

 -  **Joining pending evaluation.** A request for a module that is
    evaluating asynchronously joins its cycle root's top-level capability.
    Joined requests settle in the order their reactions were registered,
    which *dynamic-import-of-waiting-module.js* checks across an unrelated
    empty-module request.
 -  **Fulfillment order.** When an asynchronous module fulfills, the driver
    gathers its available ancestors, sorts them by async-evaluation order,
    and runs or settles them in that order. Two overlapping, independently
    started graphs therefore fulfill leaf to root, as *fulfillment-order.js*
    observes.
 -  **Rejection order.** Rejection does not use that list or its sort.
    AsyncModuleExecutionRejected records the error, rejects the module's
    top-level capability when present, and then recurses through
    `[[AsyncParentModules]]` in list order, so ancestors that are not yet
    available still receive the error. *rejection-order.js* observes the
    resulting leaf-to-root order.
 -  **Counter reset.** An implementation may reset the global async
    evaluation count when no module is pending. The driver either never
    resets it or resets it only when no module is pending, and a test starts
    a new graph after an earlier one completes while a third is pending.
 -  **Already evaluated subgraphs.** A later request whose closure includes
    a module that already finished asynchronous evaluation completes without
    waiting on it again. *module-graphs-does-not-hang.js* checks that a
    grandparent request after the parent's evaluation does not hang.
 -  **Requests during static DFS.** A request made while the static graph is
    still in its DFS cannot preempt that DFS. Its evaluation step runs in a
    later job and finds the target already evaluated or evaluating, as
    *verify-dfs.js* observes.
 -  **Errors after `await`.** A target that throws before or after an
    `await` rejects the request's promise. The error never escapes
    synchronously from `import()` and never terminates the process before a
    handler can run.
 -  **Unhandled rejections.** Internal promises follow the ordinary promise
    rejection tracker. Whatever policy the `unhandled-rejection-observation`
    lane and its reserved ADR 0030 define applies unchanged, including to a
    rejected top-level capability that no request has observed.


Collection and rooting
----------------------

The module table is a permanent root, like the global object. Through it the
collector reaches every record's namespace, environment cells, top-level
capability, evaluation error, and async parent list. A cached error
therefore stays alive for the life of the program, as single evaluation
requires.

Per-request state lives in ordinary runtime objects: the capability and the
reaction closures that capture it and the request index. Promise reaction
lists and the job queue already trace them. The sorted ancestor list that
GatherAvailableAncestors builds is either a traced heap object or an untraced
array of table indices with no allocation while it is live.

Every allocating step is a safepoint: capability creation in the call, in
Evaluate, and in ExecuteAsyncModule; reaction and closure creation; namespace
creation; and the ancestor list. Forced-collection tests run at each one.
Module code is part of the executable and never unloads, so the track adds no
code-lifetime mechanism.


Specialization
--------------

ImportCall lowers only to a generic runtime operation. The track adds no
specialized path, hint, or guard, so it needs no guard-miss test of its own.
Code around an import, such as module bodies and reaction callbacks, keeps
its existing specialization. Its tests run with specialization enabled and
disabled and with true and false hints, and must observe identical results.


Targets, hosts, and capabilities
--------------------------------

The produced executable gains no network, filesystem, package, loader,
compiler, interpreter, or code generation capability. All resolution uses the
injected build-time host resolver and loader; the Node.js and Deno compiler
hosts supply them as they do for static imports. Native execution evidence
runs on Linux AMD64 and macOS AArch64. AArch64 Linux supplies compile-link
and inspection evidence only. Structural tests show that ordinary closed
binaries and literal-import binaries contain no parser, compiler, incremental
loader, or source lookup entry.

The module table layout, driver entry points, and import operation change
the runtime ABI. The implementation unit that first changes it asks Root for
an ABI identifier; this design reserves none.

The staged proposal orders a capability baseline and retained build manifest
schema before graph work. This design narrows that prerequisite for the M5c
track. The build must retain a deterministic request record: source location,
referrer, decoded literal, canonical target, and edge kind. Capability-aware
runtime selection, component-level size baselines, and the full retained
manifest schema stay with *PLAN-DYN.md* and are not prerequisites for these
20 rows. The amendment must state this narrowing explicitly for maintainer
acceptance.


Test groups and per-path mapping
--------------------------------

### Planned groups

Each group retains the full input domain and every assertion of the original
rows it serves. Native fixtures run on both execution targets with ordinary
and forced collection.

| Group | Contract                                                                  | Layers                                                       |
| ----- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| G1    | Single evaluation across concurrent, serialized, and self requests        | native fixtures, Node.js/Deno differential, model            |
| G2    | Script and module identities for one file                                 | runner fixture, native fixture                               |
| G3    | Cached evaluation errors and cycle-root error identity                    | native fixtures, model, forced collection                    |
| G4    | Namespace reuse across dynamic and static acquisition                     | native fixtures, differential                                |
| G5    | Lazy evaluation and live binding updates                                  | native fixtures, differential                                |
| G6    | Asynchronous export values and errors observed through `import()`         | native fixtures, differential                                |
| G7    | Joining pending asynchronous evaluation and later re-entry                | native fixtures, model traces                                |
| G8    | Fulfillment and rejection propagation order and the evaluation counter    | native fixtures, model traces                                |
| G9    | Requests during static DFS                                                | native fixture, model trace                                  |
| G10   | Fresh intrinsic promises, global `Promise` rebinding, `then` exports      | native fixtures, differential                                |
| G11   | Build refusals: unadmitted forms, missing or broken targets, diagnostics  | compiler package tests                                       |
| G12   | Generated graphs with lazy targets, cycles, top-level `await`, and errors | property suite with a new seed block, Node.js and Deno       |
| G13   | Static-graph equivalence after the driver replaces the compiled schedule  | existing module fixtures and properties, full test262 UPDATE |
| G14   | Rooting and structure: request table, absent loader and compiler symbols  | forced-collection fixtures, structural inspection            |

The generated suite in G12 reserves its own aligned block in
*tests/property-seeds.yaml* and needs a Linux shard weight, as
*CONTRIBUTING.md* requires for a new property file. Its independent oracle
is the TypeScript model, and shrinking keeps graph shape, request schedule,
and the module that throws or awaits.

### Per-path mapping

| Path                                                                              | Groups  | Closure route                                          |
| --------------------------------------------------------------------------------- | ------- | ------------------------------------------------------ |
| *expressions/dynamic-import/eval-rqstd-once.js*                                   | G1      | Conditional: fixture calls the `Function` constructor  |
| *expressions/dynamic-import/eval-self-once-module.js*                             | G1      | Observation on admission                               |
| *expressions/dynamic-import/eval-self-once-script.js*                             | G1, G2  | Observation on admission, with runner referrer support |
| *expressions/dynamic-import/import-errored-module.js*                             | G3      | Observation on admission                               |
| *expressions/dynamic-import/import-fulfilled-member-of-errored-cycle.js*          | G3, G8  | Observation on admission                               |
| *expressions/dynamic-import/reuse-namespace-object-from-import.js*                | G4      | Observation on admission                               |
| *expressions/dynamic-import/reuse-namespace-object-from-script.js*                | G4      | Observation on admission                               |
| *expressions/dynamic-import/reuse-namespace-object.js*                            | G4      | Observation on admission                               |
| *expressions/dynamic-import/update-to-dynamic-import.js*                          | G5      | Conditional: fixtures call the `Function` constructor  |
| *expressions/dynamic-import/usage-from-eval.js*                                   | G4, G10 | Not closed by this track: direct eval context          |
| *module-code/top-level-await/await-dynamic-import-rejection.js*                   | G6      | Observation on admission                               |
| *module-code/top-level-await/await-dynamic-import-resolution.js*                  | G6      | Observation on admission                               |
| *module-code/top-level-await/dynamic-import-of-waiting-module.js*                 | G7      | Observation on admission                               |
| *module-code/top-level-await/dynamic-import-rejection.js*                         | G6      | Observation on admission                               |
| *module-code/top-level-await/dynamic-import-resolution.js*                        | G6      | Observation on admission                               |
| *module-code/top-level-await/fulfillment-order.js*                                | G8      | Observation on admission                               |
| *module-code/top-level-await/module-graphs-does-not-hang.js*                      | G7      | Observation on admission                               |
| *module-code/top-level-await/rejection-order.js*                                  | G8      | Observation on admission                               |
| *module-code/top-level-await/unobservable-global-async-evaluation-count-reset.js* | G8      | Observation on admission                               |
| *module-code/verify-dfs.js*                                                       | G9      | Observation on admission                               |

Paths are relative to *test/language/*. “Observation on admission” means
that, once the track is accepted, implemented, and admitted, the original
source should run unchanged and its fresh observation decides the result.
A pass then takes the observation owner. A failure is a semantic failure for
the owning implementation node to fix, never a new exclusion.

### Rows this track cannot close

Three rows stay with `node:dynamic-source-coverage-remediation` even after
admission:

 -  *usage-from-eval.js* (DS-8) calls `import()` inside direct eval code.
    Direct eval stays rejected at run time, so none of its promise or
    namespace assertions execute. G10 and G4 can witness those assertions
    for an import outside eval, but the referrer and the eval-to-ImportCall
    interaction belong to eval semantics. Closing it needs separate
    eval-context evidence under the ADR 0016 accounting rule of the
    2026-10-28 decision. Otherwise it is a candidate for a named deferral
    under item 4 of the 2026-11-01 answer.
 -  *eval-rqstd-once.js* and *update-to-dynamic-import.js* reach
    `Function('return this;')()` in their fixtures. The runtime rejects that
    call with `OSEO1001` under ADR 0016, so the original observations stay
    unsupported after admission. The statically imported analogues, such as
    *test/language/module-code/eval-rqstd-order.js*, already stay
    unsupported for the same reason. G1 and G5 can supply exact witnesses
    that obtain the global object through `globalThis` instead. Using those
    witnesses to account for the `Function` site needs the same reviewed
    ADR 0016 accounting as other source-evaluation scaffolding. Bounded
    `Function` construction is not approved and is not a route.

The remaining 17 rows need no other unadmitted feature. *fnGlobalObject.js*
is already a repository harness replacement that avoids the `Function`
constructor, and `Promise.withResolvers`, *asyncHelpers.js*, and
*compareArray.js* are already supported.


Test262 and closure consequences
--------------------------------

Admission is observation-affecting. It changes the frontend, compiler,
runtime, and the test262 runner, which must pass Script referrer paths and
load fixtures for literal requests. It therefore requires the full
`mise run test262:update`, never the scoped update. The `dynamic-import`
feature moves from the runner's observe-only set to the supported features
in the same change.

Every `dynamic-import` path is re-observed. Non-literal and attribute forms
keep their exact rejection and their records. Literal paths change
observation, and each change needs review:

 -  a path that now passes or becomes an expected negative takes the
    observation owner;
 -  a path that now fails is a semantic failure that blocks admission until
    an implementation node fixes it;
 -  a path that now meets a different unsupported prerequisite needs a fresh
    owner for that prerequisite.

Existing bounded ADR 0016 exclusions for dynamic import reopen. The audit
already says so for the 64 `import-attributes-dynamic-coverage-remediation`
paths. Every ADR 0016 dynamic-import record whose path uses only the literal
form needs a fresh assessment against the amended record, and its owner
follows the new observation. The amendment grants no new exclusion and
leaves the inventory denominator unchanged.


Proposed ADR 0016 amendment
---------------------------

Status of this text: **Proposed**, 2026-11-01. It is not accepted, and ADR
0016's dynamic-import decision bullet stays in force until the maintainer
accepts it. On acceptance, Root applies it to ADR 0016 together with the
exclusion-audit record digest and quote updates.

Proposed replacement for the second decision bullet:

> Alternative 3 is selected for the static-specifier subset defined in
> *docs/static-specifier-import-design.md*: an ImportCall whose only argument
> is a string literal, at a site in a module or in a Script with a
> build-side referrer identity. Each such request resolves during the build
> relative to the source that contains it, and its target's transitive
> static and literal closure must resolve, load, parse, link, and compile
> before native generation; a failure is a build diagnostic, not a language
> result. Dynamic-only modules evaluate on request through the same runtime
> module evaluation algorithms as the static graph, which share one record,
> namespace, evaluation state, and evaluation error per canonical identity.
> Each call returns a fresh promise from the realm's intrinsic `%Promise%`,
> and the host completes HostLoadImportedModule synchronously from the
> recorded table. Every other dynamic-import form, including computed
> specifiers, options and import attributes, phase imports, runtime source
> acquisition, and any import inside eval or `Function` source, stays
> rejected with the existing `OSEO1001` diagnostic. Implementation and
> admission require the design's test groups, the repository gates, and
> explicit admission approval; until those are recorded, every `import()`
> remains rejected.

Proposed changes elsewhere in ADR 0016:

 -  **Alternatives.** Alternative 3 becomes selected for the bounded subset.
    Alternative 4 stays selected for `eval`, the `Function` constructor
    family, and every dynamic-import form outside the subset.
 -  **Consequences.** Build-time refusals of the subset are reported as
    subset boundaries, separate from runtime language failures. The closed
    program assumption holds because no module enters the program after the
    build. Whole-program optimizations that assume a fixed evaluation
    schedule now record their reliance on the runtime driver instead.
 -  **Decision on prerequisites.** For this subset, the retained request
    record replaces the capability baseline and full manifest schema that
    *PLAN-DYN.md* lists for capability-aware runtime selection. Those remain
    prerequisites for late artifacts and runtime source compilation.
 -  **Reopening triggers.** Reopen the subset decision if package evidence
    needs computed specifiers or attributes, if the driver cannot preserve
    the edition's order for asynchronous cycles, if the synchronous host
    load choice conflicts with a host the WinterTC profile requires, or if
    rooting or target evidence fails.
 -  **Unchanged.** The `eval` and constructor-family decisions, the
    no-interpreter invariant, the conformance-label restriction, the
    inventory denominator, and the exclusion review rules stay as they are.
    The amendment grants no M5 exclusion.


Implementation units
--------------------

These are proposed graph nodes, not created by this design. Each needs the
amendment's acceptance and Root's explicit authorization first.

1.  **Runtime module evaluation driver.** Replace the compiled schedule with
    the driver for static graphs only. Gates: G13, G14's rooting fixtures,
    the existing module properties under both specialization policies, the
    extended property gate, and a full test262 UPDATE whose changed static
    observations are explained. This unit changes the runtime ABI.
2.  **Owned requests and graph closure.** Frontend conversion of the
    admitted form, Script referrers, discovery edges, request records, and
    build diagnostics. Gates: G11 and deterministic request records. The
    active profile still rejects `import()` until unit 4.
3.  **Import operation and scheduling.** EvaluateImportCall,
    ContinueDynamicImport, fresh capabilities, cached results, and the
    asynchronous settlement paths. Gates: G1 and G3 through G10, G12, and
    G14 on both execution targets.
4.  **Runner support and admission.** Script referrers and fixture loading
    in the test262 runner, the supported-feature change, the full UPDATE,
    review of every changed `dynamic-import` observation, and reassessment
    of reopened exclusions. Gate: zero semantic failures and Root's
    admission approval.
5.  **Row accounting.** Move each of the 17 observation-closed rows to its
    observation owner, and either close the three rows above with reviewed
    evidence or list them for named deferral under item 4.

Unit 1 can land before the others because it changes no admitted surface.
Units 2 and 3 are probes until unit 4.
