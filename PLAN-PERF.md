Performance plan
================

Status
------

Implementation status: planned, not started. This plan defines how Oseo
measures and improves the speed of compiled programs. It reserves no
milestone and changes no language semantics or compatibility counts. Its
first checkpoint runs alongside [*PLAN-PREVIEW.md*](./PLAN-PREVIEW.md), which
uses its measurements.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-GC.md*](./PLAN-GC.md), [*PLAN-BACKEND.md*](./PLAN-BACKEND.md),
[*PLAN-REGEXP.md*](./PLAN-REGEXP.md), the
[M2 specialization contract](./docs/specialization-m2.md), and the records
under *docs/adr/*. Evidence that changes one of those contracts updates the
affected document in the same change.


Goal
----

Speed is the property that should distinguish Oseo over time, more than
executable size. The white paper's design compiles a generic path for every
function and, where a cheap guard can select one, a specialized path beside
it. A failed guard enters the generic path that is already compiled, so there
is nothing to deoptimize.

Engines with speculative JIT tiers, such as V8 and JavaScriptCore, reach high
peak speed on long-running dynamic code by observing values at run time.
Oseo cannot observe before it compiles. It can instead use facts a JIT engine
cannot rely on: the module graph is closed at build time and contains no
`eval` or `Function` source under
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md), optimization time is
spent once at build time, and source type annotations can select specialized
paths. Whether that is enough to match JIT engines is not known. This plan
measures the gap first and prioritizes work based on the measurements.


Current state
-------------

Two specializations exist. M2 added a guarded small-integer addition for a
function with exactly two `number` parameters whose body is `return a + b;`,
as the [M2 contract](./docs/specialization-m2.md) records. M3 added
specialized named property reads: an object guard and a private monomorphic
cache per static named-key site select a fixed-slot load, and a miss runs
one generic lookup and may relearn the slot, as
[ADR 0008](./docs/adr/0008-object-layout-and-shapes.md) and the
[M3 language profile](./docs/language-profile-m3.md#specialization) record.
Fixed-slot stores, call specialization, and unboxed numbers in loops do not
exist. After M3, performance work was limited to measured fixes such as
[ordinary array indexed lookup](./docs/m5c-graph/ordinary-array-indexed-lookup-performance.md);
M4, M5, and the language plan were otherwise correctness work.

The frontend reads the primitive annotations `any`, `bigint`, `boolean`,
`null`, `number`, `string`, `undefined`, and `unknown`, the same names in
JSDoc tags, and primitive members of inline object, tuple, and array
annotations on destructuring patterns. Only the M2 addition consumes hints.

Both execution targets build every executable as a checking build:
`describeTarget()` requests AddressSanitizer and UndefinedBehaviorSanitizer,
although the pinned Zig passes only the latter, as the
[sanitizer activity audit](./docs/sanitizer-activity.md) records. The
runtime archive is compiled with `-O2`, and the generated C receives no
optimization flag, which leaves `zig cc` in its debug mode. Link-time
optimization is disabled with `-fno-lto` when prebuilt objects or additional
generated sources are linked.

The
[M5 performance and code-size report](./docs/evidence/m5-performance/README.md)
times the native test fixtures on one machine in that instrumented
configuration. It is a baseline for those fixtures, not a benchmark, and it
compares Oseo with no other engine. There is no benchmark corpus and no
repeatable profiling method. Two investigations sampled stacks by hand:
[regexp property escape match cost](./docs/m5c-graph/regexp-property-escape-match-cost.md)
used GDB, and the array lookup node above names no tool.


Rules
-----

Every optimization in this plan follows the rules in
[*DESIGN.md*](./DESIGN.md) and [*CONTRIBUTING.md*](./CONTRIBUTING.md).
Hints never become correctness requirements: removing or falsifying an
annotation changes speed, never behavior. Each specialized path has
specialization-invariance tests and deliberate guard misses that reach the
compiled generic fallback. A sound typed mode, in which annotations are
trusted without guards, would change that rule and is outside this plan
unless an ADR accepts it.

A checkpoint states the measured cost it targets before implementation and
reports the measured change after it. An optimization without a measured
improvement on the corpus does not land.


Checkpoints
-----------

### Measurement

Measuring speed needs an optimized build first. This checkpoint implements
the `optimized` configuration that
[ADR 0036](./docs/adr/0036-optimized-native-build-configuration.md) defines:
`-O2` generated C and runtime with no sanitizers, selected explicitly, beside
the `checked` configuration that stays the default for `oseo run` and the
test gates. The corpus runs `optimized`. The native fixture corpus runs both
configurations on every pull request, and the test262 and native property
suites run `optimized` in a scheduled job and at each checkpoint's exit, so
that the two configurations cannot diverge in behavior unnoticed.

A benchmark corpus and harness come next. The corpus uses well-known
kernels whose licenses allow redistribution, for example Richards,
DeltaBlue, n-body, a ray tracer, JSON processing, and regular expression
matching, limited to the admitted language profile and the input subset of
[*PLAN-PREVIEW.md*](./PLAN-PREVIEW.md). Each benchmark checks its own output
so that a fast wrong result fails.

The harness runs each benchmark compiled by Oseo with specialization enabled
and disabled, and under `node`, `node --jitless`, Deno, and Bun, and builds
the single-executable forms that [*PLAN-PREVIEW.md*](./PLAN-PREVIEW.md)
compares: Node.js single executable applications, `deno compile`, and
`bun build --compile`. Bun and any single-executable tooling are pinned
through mise, as [*CONTRIBUTING.md*](./CONTRIBUTING.md) requires. The
`--jitless` run separates Oseo's distance from an interpreter from its
distance from an optimizing JIT. It records run time, startup time, peak
resident set, executable size, and generated C size from the optimized
build, and the guard, allocation, and collection counters from a separate
build compiled with the compiler's `observeSpecialization` option, on Linux
AMD64 and macOS AArch64, so that instrumentation does not distort the
timings. Results and their
method live in an evidence directory, presented as findings with their
limits.

A profiling method that works on both targets is part of this checkpoint, so
that later checkpoints can attribute time to generic helpers, allocation,
property lookup, calls, and numeric boxing.

### Generic path costs

Before adding specialized paths, the generic path should cost as little as
possible, because every guard miss and every unhinted program runs it. This
checkpoint profiles the corpus, reduces the largest measured generic costs in
the runtime and the generated C, and evaluates C compiler options, including
link-time optimization across the runtime and generated code.

### Property access

Named reads already have a monomorphic per-site cache with fixed-slot loads.
This checkpoint extends that model where the corpus shows property cost:
fixed-slot stores, polymorphic sites, indexed and computed keys, and shapes
predicted from object literal sites and class constructors without
annotations. A miss still uses generic property lookup without
reconstructing a frame, as [*DESIGN.md*](./DESIGN.md) requires.

### Calls

The closed module graph lets the compiler resolve many call targets at build
time. This checkpoint adds direct calls guarded by the callee identity, and
inlining where the measurements show call overhead.

### Numbers and hints

Unboxed doubles and 32-bit integers in loops and local variables, with
guarded entry and exit. The hint vocabulary grows beyond primitive names:
array element types, object and class instance types, and return types
become specialization inputs. Destructuring patterns already map primitive
members of inline annotations; non-primitive annotations on identifier
bindings, type references that need resolution, and interfaces compile only
after the erasable TypeScript unit
of [*PLAN-PREVIEW.md*](./PLAN-PREVIEW.md) lands.

### Whole-program inference

Type and shape inference over the closed graph, so that code without
annotations also reaches specialized paths. Annotations then refine what
inference finds rather than being the only source of type facts.

The order after the measurement checkpoint is provisional. Each later
checkpoint starts when the corpus shows that its cost is among the largest
remaining ones.


Relationship to other plans
---------------------------

Allocation and collection costs found by the harness feed
[*PLAN-GC.md*](./PLAN-GC.md), which owns collector changes. A measured
limit of C as the code-generation target is a replacement trigger under
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md), not a migration decided here.
Regular expression matcher costs belong to
[*PLAN-REGEXP.md*](./PLAN-REGEXP.md).


Exit criteria
-------------

This is a continuing track. Its first checkpoint is complete when the
optimized build configuration, the corpus, the harness, the profiling
method, and the first published comparison exist on both native targets and
run from a mise task, and the existing native gates pass in both the
sanitized and the optimized configurations. Each later checkpoint is complete
when its targeted cost has a measured reduction on the corpus, its
specialized paths pass invariance and guard-miss tests, and the evidence
document records the change.
