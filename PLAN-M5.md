M5 plan for measured ECMAScript compatibility
=============================================

Status
------

Implementation status: active. M4 established closed native module graphs,
live bindings, promises, asynchronous continuations, top-level await, and a
deterministic native scheduler. M5 expands that documented subset through
measured compatibility work rather than treating ECMAScript as one feature.

The first three delivery items are complete.
[ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md) freezes the candidate
edition, optional-section policy, and manifest schema, and
[*docs/language-profile-m5.md*](./docs/language-profile-m5.md) is the living
M5 profile. The test262 harness executes module and asynchronous cases under
the deterministic native scheduler through the explicit CLI module goal, and
the dependency-indexed baseline manifest covers module linking and early
errors, top-level await, asynchronous functions, and the Promise family with
honest unsupported classifications.

Delivery item 7 is resolved for dynamic source:
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md) keeps `eval`, the
`Function` constructor, and dynamic import explicitly unsupported with owned
diagnostics and the `dynamic-source` manifest tag. Realms, agents, and
shared memory remain classified through missing harness capabilities.
Delivery item 4 is in progress: the `typeof`, `void`, and `%` operators,
the `&&`, `||`, and conditional `?:` operators, and the `do-while`
statement are admitted with native differential, structural, and reviewed
test262 evidence. Delivery items 4 through 6, 8, and 9, from the remaining
foundational expressions through closing the named edition, remain open.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-PT.md*](./PLAN-PT.md), the frozen language profiles, and accepted records
under *docs/adr/*. The runtime componentization in
[*PLAN-RCR.md*](./PLAN-RCR.md) is the prerequisite for large intrinsic tables
and built-in families. Evidence that changes one of these contracts updates
the affected document in the same change.


Goal
----

M5 broadens Oseo from the M4 subset toward a substantiated ECMA-262 conformance
claim for a named edition. Every intermediate release publishes an exact
capability and test manifest. It does not use the conformance label while known
language gaps remain inside the claimed edition and host profile.

Compatibility work proceeds in dependency order. Generic semantics, collector
ownership, abrupt completion, and source-located diagnostics land before an
optimization or a larger syntax family depends on them. A feature is complete
only when its source form, runtime semantics, negative cases, standards
evidence, generated domain, and native target evidence agree.


Entry evidence
--------------

M5 begins with these repeatable contracts:

 -  parser-owned nodes do not cross the frontend boundary;
 -  syntax, HIR, MIR, C lowering, runtime, hosts, and the toolchain remain
    separate package boundaries;
 -  generic primitive, object, array, property, closure, exception, module,
    promise, and scheduling semantics execute without a bootstrap runtime;
 -  specialization can be disabled, and every current guard retains one
    compiled generic fallback;
 -  collector roots cover environments, cells, namespaces, promises,
    continuations, jobs, timers, and thrown values;
 -  the test262 adapter records revision, metadata, strictness, phase, and
    honest unsupported classifications;
 -  deterministic property suites retain seeds, replay paths, structured
    inputs, and incomplete-run failures;
 -  Node.js, Deno, Linux AMD64 native execution, macOS AArch64 native
    execution, and AArch64 Linux compile-link evidence remains in ordinary
    repository gates; and
 -  strict C warnings, undefined-behavior sanitization, package dry runs, and
    version checks remain green.


Measurement contract
--------------------

The checked-in compatibility manifest is the source of truth for M5 progress.
Each result records the exact test262 revision, path, frontmatter, strictness
mode, harness includes, requested phase, actual phase, target, specialization
policy, and observation. Module and asynchronous cases additionally record
their graph and scheduler mode.

Results remain classified as pass, semantic failure, expected negative,
unsupported profile feature, or harness failure. Unsupported and harness
results never increase the pass count. A newly supported feature moves tests
from unsupported only after every applicable variant executes. A changed
upstream revision is a reviewed manifest change, not an automatic percentage
update.

Coverage reports group results by syntax, abstract operation, intrinsic,
built-in object, module behavior, and asynchronous behavior. Raw totals remain
available so a large group cannot hide a regression in a smaller dependency.
Known gaps link to the profile section, implementation issue, or architecture
decision that owns them.


Edition and profile boundary
----------------------------

[ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md) records the candidate
ECMA-262 edition and the exact normative and optional sections included in
the eventual claim. Annex B, internationalization, host hooks, realms,
agents, shared memory, and embedding APIs are classified explicitly rather
than being silently included or omitted.

M5 releases describe tested capabilities without using the conformance label
while known gaps remain inside that boundary. The language profile grows
monotonically within a release line. Removing an admitted behavior requires
evidence, a migration note, and an updated compatibility manifest.


Semantic dependency streams
---------------------------

M5 uses several coordinated streams. They may overlap only when their generic
prerequisites are already complete.

### Core expressions and bindings

Complete the remaining coercions, operators, declarations, destructuring,
default values, rest and spread behavior, template literals, and control-flow
forms required by later built-ins. Preserve left-to-right evaluation and
abrupt-completion order before adding specialized paths.

### Intrinsics and built-in objects

Establish the intrinsic graph, well-known symbols, iterator protocols, error
objects, and property attributes needed by standard constructors and prototype
methods. Add numeric, string, array, object, function, collection, regular
expression, date, and binary-data families in dependency order.

An intrinsic enters through a table or owned runtime interface whose identity
and attributes are testable. Generated C must not duplicate mutable singleton
state accidentally. Generic algorithms remain authoritative when a fast path
cannot prove its preconditions. Large intrinsic tables and built-in families
begin only after the affected runtime component exists under
[*PLAN-RCR.md*](./PLAN-RCR.md).

### Functions and executable syntax

Broaden parameters, arrows, classes, private state, iterators, generators, and
asynchronous control flow only after their required environment and completion
records exist. Every suspension form uses traced state and leaves no native C
stack frame alive.

### Modules and asynchronous execution

Expand module grammar, asynchronous function control flow, promise iterables,
and top-level asynchronous cycles from the M4 subset. Preserve canonical module
identity, one evaluation per module, live cells, job FIFO order, and
deterministic shutdown while broadening syntax.


Ahead-of-time challenge boundary
--------------------------------

`eval`, the `Function` constructor, dynamic import, realms, and source text
created after linking can conflict with closed ahead-of-time compilation. None
enters through an interpreter hidden in a runtime helper.

Before admitting one of these features, an architecture decision must define:

 -  when source becomes known;
 -  how bindings, strictness, realms, and module identity are preserved;
 -  whether produced artifacts remain bootstrap-runtime independent;
 -  how collection and code lifetime are rooted;
 -  which targets can execute the feature; and
 -  how test262 observations remain comparable.

A measured incompatibility may remain explicitly unsupported. M5 progress is
reported honestly even when an ahead-of-time constraint prevents a complete
claim.


Compiler and runtime invariants
-------------------------------

Every new syntax node converts immediately to Oseo-owned data. HIR resolves its
bindings and evaluation order. MIR makes calls, allocation, safepoints,
completion, suspension, and generic fallback explicit. The C backend does not
recover semantics from HIR or bootstrap parser details.

Each new heap kind defines tracing before allocation can collect it. Every raw
pointer is reacquired from a rooted value after a safepoint. Resource limits
produce owned diagnostics unless the selected edition requires a catchable
language value.

Specialization remains optional. Generated and standards tests compare enabled
and disabled execution, truthful and false hints, guard misses, forced
collection, and visible side-effect order. Compatibility work cannot make type
or JSDoc hints correctness requirements.


Property and differential expansion
-----------------------------------

M5 extends the runner, seeds, replay records, module graph model, and native
schedule model established by [*PLAN-PT.md*](./PLAN-PT.md). It does not create a
second random-program framework.

Grammar-based generators produce scope-correct programs in the active profile.
They retain structured inputs until printing and shrink without introducing
dangling bindings or unsupported syntax. Controlled invalid mutations assert
the exact diagnostic phase, code, and location.

Every new semantic family identifies:

 -  its generated values and boundary classes;
 -  its independent reference or executable model;
 -  behavior-preserving transformations;
 -  forced-collection and failure-injection points; and
 -  direct seed and path replay.

Bounded native properties remain in the ordinary gate. The extended tier runs
larger programs, more seeds, and at least ten times the ordinary case budget.
Any discovered defect leaves a minimized ordinary regression fixture.


Standards harness expansion
---------------------------

The test262 adapter grows before the corresponding manifest. Required harness
includes are implemented as reviewed source, not replaced with native shortcuts
that bypass the behavior under test. Module, asynchronous, agent, realm, and
negative-phase support each report unavailable capabilities honestly until the
harness can observe them.

Selected cases first cover one semantic dependency and its boundaries. Broader
directories enter only after their shared prerequisite is implemented. Updating
the reviewed set includes the manifest delta, unsupported reasons, runtime
cost, and any newly required harness surface.


Performance and code size
-------------------------

M5 records compile time, generated C size, executable size, peak runtime
allocation, and selected workload latency. These measurements guide ordering
and specialization, but they never waive semantic failures.

An optimization begins with a generic oracle, structural guard evidence, and a
measured bottleneck. It retains disabled-policy and guard-miss tests. A large
built-in table or generated source expansion needs a size budget and a
replacement boundary.


Delivery order
--------------

1.  Freeze the candidate edition, optional-section policy, compatibility
    manifest schema, and M5 language-profile template.
2.  Expand test262 harness observations for modules, promises, asynchronous
    functions, and top-level await already implemented in M4.
3.  Publish a dependency-indexed baseline that names every supported and
    unsupported group without inflating passes.
4.  Complete foundational expressions, coercions, bindings, errors, symbols,
    and iterator protocols required by multiple later families.
5.  Add built-in object families in dependency order with descriptor,
    collector, differential, and property evidence.
6.  Broaden function, class, generator, asynchronous, and module syntax through
    traced environment and continuation records.
7.  Resolve ahead-of-time challenge features through accepted decisions or
    explicit unsupported classifications.
8.  Increase the reviewed standards corpus and grammar-generated corpus while
    keeping ordinary and extended gates within published budgets.
9.  Close every gap inside the selected edition and publish the reproducible
    conformance evidence.

Each checkpoint lands as a coherent semantic unit. It updates the active
profile, manifest, generated domain, package documentation, and living design
documents in the same change.


Exit criteria
-------------

M5 is complete only when:

 -  one named ECMA-262 edition and optional-section policy define the claim;
 -  the checked-in manifest covers every applicable test in that boundary at an
    exact upstream revision;
 -  no semantic failure, harness failure, or unsupported result, including
    one caused only by a missing observation capability, remains inside the
    claim;
 -  every admitted syntax and built-in has generic semantics, negative cases,
    collector coverage, and source-located diagnostics;
 -  module, promise, asynchronous, and scheduler tests exercise the expanded
    profile rather than only the M4 subset;
 -  grammar-based properties shrink to valid replayable programs and compare
    Node.js, Deno, specialization policies, and collection modes;
 -  every specialization retains a compiled generic fallback and deliberate
    guard-failure evidence;
 -  strict warnings, sanitizers, Linux AMD64 execution, macOS AArch64
    execution, and AArch64 Linux compile-link checks pass across the complete
    native corpus;
 -  capability, performance, and code-size reports are reproducible from
    documented tasks; and
 -  `mise run check`, `mise run test`, and the extended property task pass from
    a clean checkout.
