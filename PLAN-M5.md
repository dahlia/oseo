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
honest unsupported classifications. The current reviewed manifest records 224
passes, 226 expected negatives, and 185 unsupported profile features with no
semantic or harness failures.

Delivery item 7 is resolved for dynamic source:
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md) keeps `eval`, the
`Function` constructor, and dynamic import explicitly unsupported with owned
diagnostics and the `dynamic-source` manifest tag.
[*PLAN-DYN.md*](./PLAN-DYN.md) records the deferred capability and evidence
track without reopening the M5 decision. Realms, agents, and shared memory
remain classified through missing harness capabilities.
Delivery item 4 is substantially in progress. The admitted syntax now
covers every scalar operator family (`typeof`, `void`, `%`, `**`,
bitwise and shift operators, unary `+` and `~`, `&&`, `||`, `??`, the
conditional and comma operators, loose equality, `in`, and
`instanceof`), `var` declarations with function-scope hoisting,
synchronous arrow functions, untagged template literals, and the
control-flow statements `do-while`, classic `for` with per-iteration
lexical environments, `switch`, and labeled statements, each with
native differential, structural, and reviewed test262 evidence
recorded in [*docs/language-profile-m5.md*](./docs/language-profile-m5.md).
The named error intrinsics, the first intrinsics-and-built-ins unit,
are implemented: `Error` and the six NativeError constructors are
runtime-owned values, runtime semantic errors are typed catchable
instances, and the test262 runner executes runtime negatives against
the rendered error identity. Generic `ToPrimitive` is implemented as
one shared runtime conversion behind every coercing operator,
template substitutions, property keys, error messages, and timer
delays, with `@@toPrimitive` dispatch deferred to the symbols unit.
Symbol values, the `Symbol` intrinsic, symbol property keys, and the
well-known symbols are implemented, with `Symbol.toPrimitive`
dispatched by the generic conversion. The synchronous iterator
protocol is implemented as an owned runtime surface with a first-class
array iterator, and `Promise.all` and `Promise.race` consume any
object iterable through it, closing the iterator when a combinator
rejects after a step, completing the delivery item 4 groundwork; the
`for-of` statement now consumes the same object-iterator protocol with
lexical, assignment, and cleanup semantics. Array literal spread now consumes
that protocol through dynamic own-property accumulation, preserving holes,
captured `next` methods, and the specified absence of `IteratorClose` on
acquisition or step failures. Call and constructor spread use a rooted dynamic
argument list. Standalone array binding declarations now admit `const`, `let`,
and hoisted `var` with
elisions, defaults, nested array patterns, and rest through the same iterator
protocol, with conditional `IteratorClose` and direct awaited initialization.
Standalone object binding declarations now admit `const`, `let`, and hoisted
`var` with static, computed, shorthand, renamed, defaulted, and nested object or
array properties and a final identifier rest target. They preserve nullish
checks, property-key and default order, direct awaited initialization, ordered
enumerable own-key copying, and string and symbol exclusions. Catch parameter
destructuring is now implemented: catch clauses admit the same
recursive array and object patterns, including defaults and rest, with fresh
catch cells, iterator cleanup, and abrupt propagation through `finally`.
Synchronous `for-of` declaration heads now admit those recursive patterns for
`const`, `let`, and `var`, preserving lexical temporal dead zones, fresh
per-iteration cells, `var` hoisting, nested cleanup, and outer iterator close
on pattern failure. Standalone destructuring assignment now admits
recursive array and object patterns whose leaves and rest targets are existing
identifiers or member references. It evaluates the right operand once, returns
that original value, preserves default and rest behavior, conditionally closes
array iterators, and retains immutable and imported binding errors. Member
object and key expressions run before iterator steps, source reads, and
defaults, while key conversion and storage remain after value selection.
Awaited member targets, parameter patterns, and classic `for` head
destructuring remain later work. The runtime component boundaries
recorded in [*docs/runtime-components.md*](./docs/runtime-components.md)
are implemented, so that work is no longer blocked on them. Delivery
items 5, 6, 8, and 9 remain open.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-DYN.md*](./PLAN-DYN.md), [*PLAN-NIO.md*](./PLAN-NIO.md),
[*PLAN-PT.md*](./PLAN-PT.md), [*PLAN-REGEXP.md*](./PLAN-REGEXP.md), the frozen
language profiles, and accepted records under *docs/adr/*. The completed
runtime componentization recorded in
[*docs/runtime-components.md*](./docs/runtime-components.md) provides the
component boundaries that large intrinsic tables and built-in families build
on. Evidence that changes one of these contracts updates the affected document
in the same change.


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

Array literal spread is complete for object iterables. Its generated property
suite uses seed `0x5eed0005`, compares an independent accumulation model with
Node.js, Deno, and both native specialization policies, and forces collection
on the enabled path. Five reviewed test262 cases pin iterator acquisition and
step failures. Call argument spread now uses a rooted dynamic argument list and
preserves target-first, left-to-right evaluation without `IteratorClose` on
spread failures. Constructor argument spread shares the list while evaluating
its callee before arguments and allocating the receiver only after accumulation
succeeds. The generated property suite uses seed `0x5eed0006` across intrinsic,
method, and dynamic calls and ordinary construction, both native specialization
policies, and forced collection. Native fixtures also cover `Promise`
construction. Ten reviewed test262 cases pin iterator acquisition and step
failures across calls and construction.

Standalone `const`, `let`, and `var` array binding declarations now own
recursive parser-independent patterns. Their lowering evaluates the initializer
once, steps from left to right, applies defaults only to `undefined`, drains
rest elements, and closes a non-exhausted iterator on normal or abrupt pattern
completion. The generated property suite uses seed `0x5eed0007`, compares an
independent binding and cleanup model with Node.js, Deno, and both native
specialization policies, and forces collection on the enabled path. Fixed
native fixtures retain temporal dead zones, function-name inference, nested
close order, step failure, close-completion precedence, `var` hoisting,
redeclaration, and direct awaited writes. Reviewed test262 evidence completes
the same syntax unit: 24 passing cases cover `const`, `let`, and `var` values,
defaults for holes and exhausted iterators, function-name inference, nested
patterns, rest, and iterator done-state handling.

Standalone object binding declarations reuse the same recursive binding leaves
without iterator cleanup. They check `RequireObjectCoercible` before a computed
key, apply `ToPropertyKey` and `GetV` from left to right, select defaults only
for `undefined`, and compose nested object and array patterns. A final
identifier rest target snapshots own keys in ECMAScript order, excludes each
previously evaluated property key, reads the remaining enumerable own values
through the generic property path, and creates ordinary data properties on a
fresh object. The generated property suites use seeds `0x5eed0008` and
`0x5eed0009` across ordinary, primitive, and nullish inputs, static and
computed string and symbol exclusions, both native specialization policies, and
forced collection. Twenty-four reviewed test262 cases cover all three
declaration kinds, nullish coercibility, trailing shorthand properties,
function-name inference for function, arrow, and covered expressions, rest
exclusions, fresh data descriptors, and non-enumerable omission.

Catch parameters now reuse those recursive patterns and binding leaves. Every
catch binding is created uninitialized before the pending thrown value enters
`BindingInitialization`. Array patterns keep conditional `IteratorClose`,
object patterns keep nullish checks and ordered property reads, and a pattern
failure skips the catch body while propagating through the enclosing
`finally`. The generated property suite uses seed `0x5eed000a` across array
and object patterns, present, missing, and nullish inputs, defaults, rest, both
native specialization policies, and forced collection. Fixed native fixtures
retain fresh catch cells, function-name inference, iterator cleanup and
step-failure behavior, and `finally` execution after pattern failure. Sixteen
reviewed test262 cases cover array values, defaults, function-name inference,
nested rest, object nullish failure, trailing properties, and object rest
descriptors.

Synchronous `for-of` declaration heads now accept the same recursive patterns
for `const`, `let`, and `var`. Every lexical name enters its temporal dead zone
before the iterable expression and receives a fresh cell before each
`BindingInitialization`; `var` leaves write their existing hoisted cells.
Nested array patterns close from the inside out, and a default, target, or
object-coercibility failure closes the outer `for-of` iterator after any inner
cleanup. The generated property suite uses seed `0x5eed000b` across array and
object patterns, all three declaration kinds, present, missing, and nullish
inputs, both native specialization policies, and forced collection. Fixed
native fixtures retain closure cells, function-name inference, object rest,
`var` retention, and outer close after a pattern failure. Six reviewed test262
cases pin nullish object-pattern failure across all three declaration kinds.
Another 42 selected binding cases reach the pattern head but remain honestly
unsupported because their upstream loop body uses compound assignment, which
is outside the admitted expression profile.

Standalone destructuring assignment now accepts recursive array and object
patterns with existing identifier or member leaves and rest targets. The right
operand evaluates once before pattern work and remains the assignment
expression result. A member leaf evaluates its object and computed-key
expression before the corresponding iterator step, source property read, or
default, then converts the key and stores only after selecting the assigned
value. Defaults, nested patterns, array and object rest, computed source keys,
conditional `IteratorClose`, immutable-binding errors, imported-binding
errors, and abrupt completion reuse the declaration paths without creating
cells. The generated property suite uses seed `0x5eed000c` across identifier
and member targets, array and object patterns, present, missing, and nullish
inputs, both native specialization policies, and forced collection. Fixed
native fixtures retain expression-result identity, function-name inference,
member-reference order, step failure without close, target failure with close,
and computed-key suppression on nullish object input. Await inside a member
target remains unsupported until it joins the admitted continuation positions.
Fourteen reviewed test262 cases pin identifier and member writes, nested
patterns, defaults, rest, result identity, nullish and immutable-target errors,
and function-name inference under both strictness and specialization policies.

### Intrinsics and built-in objects

Establish the intrinsic graph, well-known symbols, iterator protocols, error
objects, and property attributes needed by standard constructors and prototype
methods. Add numeric, string, array, object, function, collection, regular
expression, date, and binary-data families in dependency order.

[*PLAN-REGEXP.md*](./PLAN-REGEXP.md) owns the regular expression family. It
keeps one owned pattern and matcher model across dynamic construction and
ahead-of-time literal compilation, preserves fresh object identity and
`lastIndex`, and defers the matcher backend choice until code-size, Unicode,
resource, and target probes compare the candidates. Regular expressions remain
outside the active profile until that plan admits a coherent semantic
checkpoint.

An intrinsic enters through a table or owned runtime interface whose identity
and attributes are testable. Generated C must not duplicate mutable singleton
state accidentally. Generic algorithms remain authoritative when a fast path
cannot prove its preconditions. Large intrinsic tables and built-in
families extend the runtime components recorded in
[*docs/runtime-components.md*](./docs/runtime-components.md). A family
whose semantics the admitted
profile can already express may instead be self-hosted in the compiled
subset, as [*ROADMAP.md*](./ROADMAP.md) records under M8, keeping only its
primitive operations in the C runtime.

The `Date` family depends on the completed clock and wakeup integration
checkpoint in [*PLAN-NIO.md*](./PLAN-NIO.md), not only on an epoch-based
real-time read. That checkpoint enables the real-time capability and routes
existing production timer waits through the separate monotonic clock in the
same release. `Date.now()` and `Date` operations that obtain the current time
read real time; elapsed scheduling uses monotonic time. Tests inject both clock
domains explicitly. A built-in must not read the bootstrap host's clock or
derive epoch time from the M4 logical scheduler.

The global object enters through this stream in dependency order:
standard constructors become real intrinsic values first, the global
binding model then connects top-level Script `var` and function
declarations to global-object properties while Script lexical
declarations stay declarative and module bindings stay module-scoped, and
`globalThis` is admitted last, after an architecture decision resolves
dynamically created global bindings against closed-world name resolution.
The M6 surface audit in [*PLAN-M6.md*](./PLAN-M6.md) depends on this
order. The future dynamic-source capability track in
[*PLAN-DYN.md*](./PLAN-DYN.md) and interactive session in
[*PLAN-REPL.md*](./PLAN-REPL.md) also depend on the decision, but neither adds
work to the M5 delivery queue.

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

[*PLAN-REPL.md*](./PLAN-REPL.md) treats source accepted between interactive
submissions as a tool-level compilation boundary. It does not admit `eval` or
change this standards classification. Any incremental artifact or code-lifetime
evidence it produces must update the applicable architecture decisions before a
running session can load new code.

[*PLAN-DYN.md*](./PLAN-DYN.md) separates closed source, finite precompiled
dynamic modules, late native artifacts, and runtime source compilation. It
does not reopen this M5 boundary. A feature enters the language profile only
after its own entry criteria and an update to ADR 0016.


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
