Property-based testing plan
===========================

Status
------

Implementation status: active, initial adoption in progress. M4 landed the
pinned runner, explicit replay configuration, deterministic module-graph
properties, and bounded native asynchronous schedule properties. M5 expands
these models into grammar-based compatibility work. This cross-milestone plan
does not replace [*PLAN-M5.md*](./PLAN-M5.md).

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md), the frozen language
profiles, and the accepted records under *docs/adr/*. When generated evidence
invalidates an assumption in one of those documents, the implementation change
must update the affected document rather than weakening the property.


Goal
----

Property-based tests should search the admitted JavaScript and TypeScript state
space for violations of Oseo's semantic contracts. They complement reviewed
fixtures and standards suites by generating structured programs, values, state
transitions, module graphs, and schedules, then shrinking a failure to the
smallest case that still exposes it.

The strongest properties compare independent observations:

 -  Oseo execution against Node.js and Deno reference execution;
 -  specialization-enabled execution against specialization-disabled
    execution;
 -  ordinary collection against collection forced at every safepoint;
 -  source hints against removed or deliberately false hints;
 -  equivalent module graphs, schedules, and source transformations; and
 -  implementation state against a small executable model.

A generated case is useful only when its domain and oracle are explicit. Merely
compiling random source without crashing is fuzzing evidence, not evidence that
the compiler preserved JavaScript behavior.


Relationship to the roadmap
---------------------------

M4 established generated module graphs, promise transitions, asynchronous
continuations, and task schedules. The shared runner uses unchanged package
test sources under Node.js and Deno. A bounded native suite compares generated
schedules with both hosts, both specialization policies, forced collection, and
an independent observation model.

M5 broadens this work into grammar-based differential generation across the
expanded ECMAScript profile. M5 should reuse the generator, shrinker,
observation, and replay contracts established here. It must not begin with a
second unrelated random-program framework.

The deferred interactive-development track in
[*PLAN-REPL.md*](./PLAN-REPL.md) extends the same infrastructure with structured
submission sequences, persistent bindings, code-artifact lifetimes, and prompt
schedules. Those properties begin only after the REPL session model has an
accepted contract; this plan does not invent the interactive semantics.

Property tests do not replace test262 or later web-platform tests. Standards
suites prove behavior for reviewed specification cases. Property tests explore
combinations, values, transformations, and execution states that a fixed suite
cannot enumerate economically.


Tool choice
-----------

Use [`fast-check`] as the generation, shrinking, replay, and property runner.
Pin one stable release through aube in the root development dependencies. Do
not use an experimental build or introduce another package manager lockfile.

`fast-check` remains test infrastructure. Compiler core, frontend, backend,
runtime, host, and toolchain production sources must not import it. Initial
arbitraries live beside the tests that own them. A generator becomes a public
`@oseo/testkit` API only after two or more packages need the same semantic
model and its ownership contract is stable.

Prefer compositional arbitraries such as `record`, `tuple`, `oneof`, `option`,
`array`, `letrec`, and `commands`. Do not use `gen` in replay-critical suites;
its generated dependencies do not retain the same shrinking and replay
properties as a composed arbitrary. Avoid `filter` as the main way to obtain
valid programs. Construct admitted inputs directly so the runner spends its
budget executing properties rather than discarding cases.

Keep the structured case as the property input and print source inside the
predicate. Mapping a generated program to an opaque source string before the
property runs discards the structure needed for useful shrinking and failure
reports.

Pass runner parameters explicitly through an Oseo-owned test helper. Do not
rely on process-global configuration that one suite can leak into another. The
helper owns the reviewed seed set, case count, size limit, timeout policy, and
failure reporter while returning ordinary `fast-check` parameters.

[`fast-check`]: https://fast-check.dev/


Property contracts
------------------

Every property suite defines four things in code and in its test description:

1.  The domain names the generated inputs and the applicable language profile.
2.  The preconditions state facts guaranteed by construction. Broad rejection
    with `filter` or a property-local early return is not a domain definition.
3.  The oracle names the observations or model states being compared.
4.  The failure report prints enough information to replay and understand the
    minimized case without adding debug statements.

A property must be deterministic once its seed, replay path, compiler options,
target, and injected host state are fixed. It must not depend on wall-clock
timing, filesystem enumeration order, ambient environment variables, or an
unrecorded random source.

Native properties select the supported target from normalized execution-host
facts. Replay and retained failure records include the operating system,
architecture, exact target, and sanitizer modes. Linux AMD64 and macOS AArch64
run the same ordinary and extended generated domains; AArch64 Linux remains
compile-link evidence rather than a property execution.

The property runner's success count means executed cases. Unsupported syntax,
discarded generations, reference disagreement, infrastructure failures, and
timeouts must not be counted as semantic passes.


Generated program model
-----------------------

Generate a small Oseo-owned test model rather than bootstrap-parser nodes or
raw source fragments. The model mirrors only the frozen language profile needed
by a suite. It does not become another compiler IR and must not be imported by
production code.

The initial model covers:

 -  all admitted primitive values, with named representations for `NaN`,
    infinities, and negative zero;
 -  lexical bindings, parameters, calls, returns, and admitted control flow;
 -  generic arithmetic, comparison, conversion, and concatenation;
 -  TypeScript and JSDoc hints with explicit provenance;
 -  ordinary objects, arrays, descriptors, prototypes, and property updates;
 -  closures, receivers, constructors, exceptions, and abrupt completion; and
 -  an ordered observation log that reference and native executions can print.

Generators must be scope aware. A binding reference can name only a binding
available at that point, and shrinking must not leave a dangling name. One
acceptable representation uses binding slots in the generated model and
assigns source names only when printing. The printer must produce stable source
for a fixed model and preserve the evaluation order represented by that model.

Keep valid and invalid generation separate. A valid generator produces source
accepted by the named profile. An invalid generator begins with a valid model
and applies one controlled mutation, such as an unsupported syntax form or an
invalid early error. The resulting property asserts the exact diagnostic phase,
owned error code, and source location.


Value and boundary generation
-----------------------------

Uniform random values under-sample the boundaries that distinguish JavaScript
semantics from C or tagged-word behavior. Each value arbitrary combines broad
generation with reviewed boundary classes.

Number generation includes:

 -  immediate signed 48-bit limits and their adjacent values;
 -  safe-integer limits and values just outside them;
 -  positive and negative zero;
 -  integer, fractional, subnormal, infinite, and `NaN` values;
 -  values whose addition, subtraction, or conversion crosses a boundary; and
 -  decimal source spellings that map to the same binary64 value.

String generation includes empty strings, ASCII, non-ASCII BMP code units,
surrogate code units, embedded NUL, numeric-looking strings, and property names
with special object behavior. Object and array generation emphasizes absent
properties, stored `undefined`, index boundaries, descriptor changes, prototype
replacement, and shape-invalidating mutations.

Reviewed boundary cases remain ordinary example-based tests. They may also be
passed to the property runner as explicit examples, but random generation must
not become their only coverage.


Shrinking contract
------------------

Shrinking is part of the test design. A suite is incomplete if its typical
failure leaves a program too large to understand or produces an invalid case
outside the property's domain.

Program shrinkers should try, in this order where applicable:

1.  Remove unrelated functions, statements, bindings, object properties, and
    module nodes.
2.  Reduce control-flow depth, expression depth, argument counts, and command
    sequence length.
3.  Replace complex values with boundary representatives such as `0`, `-0`, an
    empty string, `undefined`, or one small object.
4.  Reduce names, source locations, hint sets, and graph labels without changing
    the failing semantic relation.

Removing syntax must preserve binding closure, evaluation prerequisites, and
the language profile. Module-graph shrinking must preserve resolvable edges and
canonical identities unless the property deliberately tests a resolution
failure. Schedule shrinking must preserve the enqueue relations required to
reach the failing observation.

Do not disable shrinking to make a slow suite fit the ordinary test budget.
Reduce the number or size of generated cases, split the property, or move an
exploratory workload to the extended tier. Replay of a minimized failure must
remain available.


Frontend and diagnostic properties
----------------------------------

The parser adapter and frontend properties cover both accepted and rejected
source:

 -  printing a valid generated model and parsing it produces owned syntax with
    the expected structure, locations, and hints;
 -  parsing the same source twice produces identical owned output and
    diagnostics;
 -  bootstrap-parser objects, errors, and stack traces never cross the frontend
    boundary;
 -  removing comments that are not JSDoc leaves executable behavior unchanged;
 -  TypeScript and equivalent JSDoc hints select equivalent specialization;
 -  removing or falsifying a hint can change specialization selection but not
    accepted generic semantics; and
 -  each controlled invalid mutation produces a stable, source-located owned
    diagnostic at the documented phase.

Parser robustness over arbitrary bytes and unrestricted JavaScript grammar is
a separate fuzzing concern. It may reuse replay utilities, but it must report a
different evidence class and must not inflate the valid-program property count.


HIR and MIR properties
----------------------

Generated owned syntax should exercise normalization and lowering without
asserting incidental block numbers or temporary names. Add reusable validators
for representation invariants before expanding structural generation.

The validators and properties check that:

 -  every binding, block, value, parameter, and continuation reference resolves;
 -  every block has one terminator and every successor accepts the supplied
    block arguments;
 -  source evaluation order is retained before specialization;
 -  abrupt completion and exceptional edges remain explicit;
 -  every collecting operation is a declared safepoint with a sufficient root
    budget;
 -  lowering the same owned input and options twice is deterministic;
 -  disabled specialization contains no guarded operation or private fast path;
 -  an enabled guard miss and overflow edge reach the named generic block; and
 -  MIR printing remains stable enough to reproduce a minimized graph.

Direct arbitrary MIR generation is deferred until the validators define a
complete well-formedness contract. Initial suites generate source or owned
syntax and reach MIR through production stages so they do not spend most of
their cases constructing impossible compiler states.


Differential semantic properties
--------------------------------

For every valid generated program shared by the reference hosts, compare the
complete observation under Node.js, Deno, specialization-disabled native
execution, and specialization-enabled native execution. The observation
includes standard output, standard error after private counter removal, exit
status, returned values exposed by the fixture protocol, and thrown completion.

Reference disagreement is a failed or unsupported test premise, not a native
pass. The suite must retain the generated source and classify whether the
language profile accidentally admitted host-specific behavior.

Metamorphic properties may avoid a reference engine when the transformation is
known to preserve behavior. Initial transformations include:

 -  add, remove, or falsify TypeScript and JSDoc hints;
 -  rename generated lexical bindings consistently;
 -  switch specialization policy;
 -  vary non-semantic source whitespace and comments; and
 -  reorder declarations or module inputs only where the frozen profile proves
    that order unobservable.

Do not add a transformation merely because it is usually safe. JavaScript
coercion, property access, getters, exceptions, and asynchronous scheduling
make many familiar compiler rewrites observable.


Specialization properties
-------------------------

Each specialization contributes a generated domain before it is accepted. The
domain covers guard hits, each distinct guard miss, overflow or shape failure,
and a path that commits visible state before or after the guarded operation.

For every generated case:

 -  enabled and disabled observations are equal;
 -  truthful, absent, and false hints have equal observations;
 -  each selected specialization has its required guard and one compiled
    generic fallback;
 -  counters distinguish hits, misses, overflow, and generic helper calls;
 -  a miss does not replay a call, conversion, property key, or side effect; and
 -  the fast path retains its documented allocation and helper-call limits.

Counter expectations come from the generated model, not from copying the
runtime's counters after execution. A structural assertion remains necessary
when observational equality alone cannot prove that the fast path exists.


Runtime and collector properties
--------------------------------

Use model-based command sequences for stateful runtime behavior. A small model
tracks properties, attributes, prototypes, array length, closure cells, and
expected completion. Commands apply one operation to both the model and the
native program, then compare observations at deliberate checkpoints.

Collector properties run the same generated program under ordinary collection
and collection forced at every declared safepoint. Generated programs keep
values live across nested calls, closure capture, allocation, thrown
completion, constructor return, and specialized-to-generic transitions.

Failure injection is generated independently of program generation. Allocation
failure points, root-budget exhaustion, and supported host failures are selected
from declared operations. The property verifies the owned diagnostic or
language completion and confirms that cleanup restores runtime state.

Sanitizer findings fail the property even when JavaScript observations match.
The minimized source, compiler options, collection mode, failure point, and
sanitizer output belong to one retained failure record.


M4 module and asynchronous properties
-------------------------------------

The landed M4 model follows the frozen profile and architecture records. Later
extensions update the model only after their corresponding profile section and
decision are current.

Module generators create canonical module identifiers, source modules, import
and export entries, dependency edges, and controlled aliases. They cover
acyclic graphs, synchronous cycles, strongly connected components, missing or
ambiguous exports, and failures during evaluation. Properties compare live-cell
identity, namespace keys, evaluation order, failure propagation, and one native
instance per canonical module.

Promise and job generators use model-based commands for construction,
settlement, handler attachment, chaining, rejection, and queue draining. The
model checks single settlement, FIFO reaction order, self-resolution behavior,
and the frozen unhandled-rejection checkpoint.

Asynchronous-function generators choose suspension points and locals that are
live across each `await`. Properties compare continuation results, thrown
completion, collection at every suspension safepoint, and enabled or disabled
specialization without retaining a native C stack frame.

Timer and event-loop properties use an injected deterministic clock and task
source. They must not wait for real time. Generated schedules vary deadlines,
equal-deadline insertion order, microtasks created by tasks, referenced handles,
and pending promises. The model decides whether the executable should make
progress, remain alive, or exit.


Test placement and package boundaries
-------------------------------------

Package-owned properties live under *packages/<package>/tests/* and use the
*.property.test.ts* suffix. They import `test` from `node:test` and `assert`
from `node:assert/strict`, exactly like other cross-host tests. The same files
run unchanged under Node.js and Deno.

Cross-package source-to-native properties live under *tests/property/*. Test
models, printers, and arbitraries that serve only those properties stay in that
directory. Do not import them from production packages or package-owned tests.

An arbitrary shared by package tests may move to a documented public
`@oseo/testkit` subpath. That move requires a package-boundary review. The
public type must describe Oseo's test model rather than exposing a concrete
runner type as an engine contract. `@oseo/compiler` must not depend on
`@oseo/testkit` or `fast-check`.

Generated source, C, executables, and replay metadata go to a temporary
directory. Successful runs remove them. Failures retain them through the
existing native-fixture artifact protocol. Do not commit transient generated
artifacts.


Execution tiers and budgets
---------------------------

Property testing uses two execution tiers. Both are deterministic once their
reported seeds are known.

The ordinary gate runs through `mise run test`. Package-level pure properties
are discovered by the Node.js and Deno tasks. Cross-package native properties
are discovered by the Node.js task and can run alone through
`mise run test:property:native`. The initial minimum per property and reviewed
seed is:

| Property cost                          | Successful cases |
| -------------------------------------- | ---------------- |
| Pure model, printer, or runtime helper | 1,000            |
| Frontend, HIR, MIR, or C emission      | 250              |
| Native compile and execution           | 10               |

The extended tier runs through `mise run test:property:extended`. It executes at
least ten times the ordinary case count and varies size limits and reviewed
seeds. Native builds retain their execution host, target, and sanitizer
context. The task runs before a release and when a change alters generators,
lowering, the runtime, or specialization. A scheduled continuous-integration
owner and a
machine-readable aggregate summary remain adoption work.

Case floors may change only after recording test duration, generated size, and
bug-finding evidence. A time limit must mark an incomplete suite as a failure;
it must not turn unexecuted cases into a pass. Slow shrinking may continue in
the extended tier, but ordinary failures must still print a direct replay.

The ordinary gate uses a small checked-in seed set so Node.js and Deno receive
the same cases. The extended tier adds explicitly recorded seeds chosen by its
invocation. Seeds that found a defect are added to the reviewed set unless the
minimized regression fixture makes the seed redundant and the removal is
explained.


Replay and failure records
--------------------------

Every failure report includes:

 -  suite name and language profile;
 -  `fast-check` version, random generator, seed, replay path, size, and run
    count;
 -  command replay metadata for model-based properties;
 -  Node.js, Deno, target, specialization, collector, and sanitizer modes;
 -  minimized structured input and printable source;
 -  reference and native observations;
 -  private counters when enabled; and
 -  the retained artifact directory for a native failure.

The property tasks accept `OSEO_PROPERTY_SEED`, `OSEO_PROPERTY_PATH`,
`OSEO_PROPERTY_RUN_SCALE`, and `OSEO_PROPERTY_SIZE` without editing a test. A
minimized native failure can be replayed by setting the reported seed and path
before `mise run test:property:native`.

A fixed defect is represented by a reviewed example-based regression test or
fixture containing the minimized case. Seed replay is diagnostic metadata, not
the permanent regression test: a dependency update or arbitrary refactor may
change a shrink path even though the underlying compiler defect is unchanged.

Do not rerun a failing random seed until it happens to pass. A reproducible
semantic failure blocks the change. A non-reproducible failure blocks the
property suite until its unrecorded input, ambient state, or race is found and
removed.


Changes to *CONTRIBUTING.md*
----------------------------

The first implementation change updates [*CONTRIBUTING.md*](./CONTRIBUTING.md)
in the same commit. It refreshes the opening milestone description and adds a
“Property-based tests” subsection under “Tests and checks.”

The contributor guidance states that:

 -  a new semantic unit should identify useful invariants and generated domains
    during test design, even when an example test remains the smallest proof;
 -  new syntax, operators, values, runtime states, and module behavior extend
    their applicable valid and invalid generators;
 -  specializations add generated hit, miss, overflow or invalidation, false-
    hint, and disabled-policy cases;
 -  generators construct admitted structured inputs instead of filtering broad
    random source;
 -  a property keeps its structured input until the predicate prints source;
 -  tests record explicit domains, oracles, seeds, and size limits;
 -  failures are replayed with the reported metadata, minimized, and preserved
    as ordinary regression fixtures before the implementation is fixed;
 -  changing a generator must preserve or deliberately replace its shrinking
    and replay quality;
 -  example, differential, structural, sanitizer, and standards tests remain
    required where they prove a contract that generated observations cannot;
    and
 -  contributors run the applicable ordinary and extended property tasks shown
    by `mise tasks` before submitting generator, compiler, or runtime changes.

The guide also documents test placement, the *.property.test.ts* naming rule,
the distinction between the ordinary and extended tiers, and how to attach a
replay command and minimized source to a bug report or change description.


Documentation changes
---------------------

The implementation that establishes the ordinary property gate updates
[*DESIGN.md*](./DESIGN.md) to name the generator and replay contracts in the
testing strategy. It updates [*ROADMAP.md*](./ROADMAP.md) to record that the M5
grammar-based work extends infrastructure begun during M4.

Each language-profile document identifies the generated domain for newly
admitted syntax and values. Each specialization contract names its generated
hit and fallback classes. M4 profile and decision documents name the model used
for module, promise, continuation, and event-loop properties.

Commands are documented only after they exist. Dependency versions, case
budgets, supported domains, and known generation gaps describe tested current
behavior rather than intended coverage.


Delivery order
--------------

1.  Pin `fast-check` through aube and prove one unchanged *.test.ts* property
    under Node.js and Deno. Add shared configuration with explicit seeds,
    complete failure reporting, and incomplete-run failure behavior.
2.  Add value, hint, and small closed-program models for the M2 and M3 profile.
    Add stable printers and unit tests that prove generated models remain in the
    named profile.
3.  Add compiler representation validators and high-volume frontend, HIR, MIR,
    diagnostic, determinism, and specialization-structure properties.
4.  Add bounded source-to-native differential properties across reference
    hosts, specialization policies, and forced collection. Retain minimized
    artifacts on failure.
5.  Add model-based object, array, descriptor, prototype, closure, exception,
    and collector command sequences. Close any M3 defects they expose before
    treating the generator as M4 entry evidence.
6.  Add the ordinary property gate, checked-in seed set, direct replay
    interface, and extended exploration task. Measure both tiers and publish
    their initial budgets in the task descriptions.
7.  Update *CONTRIBUTING.md*, *DESIGN.md*, and *ROADMAP.md* with the landed
    workflow, task names, contributor requirements, and cross-milestone status.
8.  Extend the model and properties with each M4 module, promise, asynchronous,
    and event-loop semantic unit. Do not build all M4 generators as one final
    milestone task.
9.  Expand the same infrastructure into M5 grammar-based differential
    generation, standards-derived domains, and broader value combinations.

Each checkpoint lands with ordinary example tests for fixed defects, current
documentation, and `mise run check` plus the applicable test tasks passing. A
generator that finds an architectural contradiction is successful evidence;
record the minimized case and update the affected plan or decision before
changing the implementation contract.


Exit criteria
-------------

This plan has no single milestone completion date. Its initial adoption phase
is complete when:

 -  one pinned property runner works from the same test source under Node.js and
    Deno without entering production package dependencies;
 -  valid generators cover the implemented M2 and M3 semantic units and invalid
    generators produce owned diagnostic cases;
 -  generated cases shrink to valid, printable, directly replayable inputs;
 -  compiler validators reject malformed HIR and MIR before backend lowering;
 -  ordinary differential properties compare both reference hosts, both
    specialization policies, and forced collection within a measured budget;
 -  model-based runtime properties cover objects, arrays, prototypes, closures,
    abrupt completion, failure injection, and collection safepoints;
 -  every discovered semantic defect leaves a minimized regression fixture;
 -  the ordinary property gate is part of `mise run test`, and the extended tier
    has a documented task and scheduled continuous-integration owner;
 -  failure reports retain seeds, replay paths, source, observations, modes, and
    native artifacts without manual instrumentation;
 -  *CONTRIBUTING.md* describes when and how contributors extend, run, replay,
    shrink, and preserve property tests;
 -  *DESIGN.md*, *ROADMAP.md*, and applicable profile documents describe the
    landed property contracts accurately; and
 -  `mise run check`, `mise run test`, and the extended property task pass from
    a clean checkout.

After initial adoption, every new semantic unit and specialization treats its
generated domain and properties as ordinary acceptance criteria. M5 completes
the grammar-based expansion, but property-based testing remains a permanent
part of Oseo's correctness evidence after M5.
