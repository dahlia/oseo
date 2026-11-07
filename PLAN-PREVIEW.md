Technical preview plan
======================

Status
------

Implementation status: planned, not started. This plan defines a short
checkpoint that makes Oseo demonstrable to people outside the project before
M6 begins: ordinary TypeScript programs compile, the CLI retains a native
executable, a program can read its arguments and input and set its exit
status, and a few demonstration programs come with measured comparisons
against Node.js, Deno, and Bun. It reserves no milestone, changes no
ECMAScript compatibility count, and does not decide a release, which
[*PLAN-RELEASE.md*](./PLAN-RELEASE.md) keeps open.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-CLI.md*](./PLAN-CLI.md), [*PLAN-NIO.md*](./PLAN-NIO.md),
[*PLAN-PKG.md*](./PLAN-PKG.md), [*PLAN-PERF.md*](./PLAN-PERF.md), the
[ECMAScript 2026 language profile](./docs/language-profile-es2026.md), and
the records under *docs/adr/*. Evidence that changes one of those contracts
updates the affected document in the same change.


Goal
----

A visitor should be able to take a small TypeScript program, build it into a
native executable for Linux or macOS, run it on input, and see how its size,
startup time, memory use, and throughput compare with the mainstream
runtimes. The preview shows what Oseo already does well and where it is still
slow. It makes no performance claim that the comparison does not measure.


Current boundary
----------------

Four gaps keep the current checkout from supporting that demonstration.

TypeScript support covers annotations only. On an identifier binding, an
annotation must be one of the eight hint names `any`, `bigint`, `boolean`,
`null`, `number`, `string`, `undefined`, and `unknown`; `const xs: number[]`
is rejected with OSEO1001. On a declaration or parameter destructuring pattern,
inline object, tuple, and array annotations are accepted and map their
primitive members to the bound names, as the
[*@oseo/parser-babel* README](./packages/parser-babel/README.md) describes.
Type references that need alias or interface resolution, `interface` and `type`
declarations, the `as` and `satisfies` operators, and generic parameters are
rejected; a type-reference spread inside a destructuring annotation, such as
`[number, ...Array<string>]`, is accepted and left unhinted. Most TypeScript
programs written for another runtime therefore fail before compilation.

Every executable built for Linux AMD64 or macOS AArch64 is a checking
build. `describeTarget()` in *packages/compiler/src/native.ts* requests
AddressSanitizer and UndefinedBehaviorSanitizer for both execution targets,
the generated C receives no optimization flag, and without one `zig cc`
compiles in its debug mode. There is no optimized
build configuration.

The CLI compiles a source, runs the result from a temporary directory, and
deletes it. There is no command that keeps the executable or builds it for
another target, as [*PLAN-CLI.md*](./PLAN-CLI.md) describes.

A compiled program can print with `console.log()`, schedule timers, and read
the clock. It cannot read its command-line arguments, environment, or
standard input, and it cannot choose its exit status.

The
[M5 performance and code-size report](./docs/evidence/m5-performance/README.md)
measured the native test fixtures on one machine: a median executable of
12,021,452 bytes, with the smallest at 10,522,048 bytes, a median execution
latency of 6.8 ms, and a median peak resident set of 6,104 KiB. Those
fixtures are test programs, not workloads, they are instrumented builds, and
the report compares Oseo with nothing else.


Work units
----------

### Erasable TypeScript syntax

The compiler accepts the TypeScript syntax that only describes types and
erases it before lowering: annotations of any form at every position,
`interface` and `type` declarations, `as`, `satisfies`, and non-null
assertions, generic parameters and arguments, `declare` declarations,
overload signatures, optional parameters, and type-only imports and exports.
The boundary is the erasable subset that Node.js type stripping accepts.
Syntax with runtime semantics, such as `enum`, `namespace` with values,
parameter properties, and legacy decorators, keeps its current OSEO1001
rejection.

These are the frontend admissions that the TypeScript source unit of
[*PLAN-PKG.md*](./PLAN-PKG.md) also needs. This unit lands them; that plan
keeps its `oseo` export condition, its source-tarball fixture, and its
three-way measurement.

An annotation that the current rules do not map to a hint, such as a type
reference, produces no hint rather than an error. The existing primitive and
destructuring-pattern mappings are unchanged. Hints stay optimization input
only, as [*DESIGN.md*](./DESIGN.md) requires; extending the hint vocabulary
belongs to [*PLAN-PERF.md*](./PLAN-PERF.md).

Node.js 24 and Deno run *.ts* sources directly, so differential tests compare
native output with both hosts. A property suite generates programs with
erasable syntax inserted at every admitted position and checks that the
compiled program behaves exactly like the same program with the syntax
removed.

### Optimized build configuration

The measurement checkpoint of [*PLAN-PERF.md*](./PLAN-PERF.md) adds a build
configuration without sanitizers and with optimized generated C. The preview
uses it for the demonstration executables and every comparison. The
sanitized configuration stays the default for the test gates, which rely on
it.

### Retained native executables

This unit implements delivery steps 2 and 5 of [*PLAN-CLI.md*](./PLAN-CLI.md)
and the root, `run`, `build`, output-mode, and target tests of its step 3:
the destination and replacement contract, those failing tests, and the split of
temporary execution from retained `build` output, including moving `--dump-mir`
and `--emit-c` under `build` and building for every reviewed target with
cross-compilation to AArch64 Linux. `build` selects the optimized configuration
above. Because `build` is a subcommand, the unit also lands the part of
step 4 that the subcommand grammar needs: typed command modules for the root,
`run`, and `build`, and the static generated registry that dispatches them.
The help and completion tests of step 3 and the shell completion of step 4
stay with that plan.

### Program input and exit status

Programs get a small part of the Node.js process API. WinterTC's
[CLI API proposal] is a draft
that does not yet define standard input or output and does not name its
argument property, so the preview does not target it. Node.js is the
interface most existing command-line code uses, and the same subset becomes
the first part of M7's `process` surface instead of a surface M7 must
replace.

The candidate subset is `process.argv`, `process.env`, `process.exitCode`,
`process.exit()`, `process.stdout.write()` and `process.stderr.write()` for
strings, and synchronous reading of standard input through
`readFileSync(0)` from `node:fs`. An architecture decision fixes the exact
members and how they deviate from Node.js before implementation. It must
answer at least these questions:

 -  whether `process` is a global, a `node:process` module, or both, and how
    `node:fs` enters the closed module graph;
 -  what `process.argv[0]` and `process.argv[1]` contain for a native
    executable;
 -  how strings are encoded on output and decoded on input, and what
    `readFileSync(0)` returns without an encoding argument when `Buffer` is
    not available;
 -  what happens on a closed pipe or a write error;
 -  how `process.exit()` interacts with pending timers, promise jobs, and
    buffered output; and
 -  which uses outside the subset are rejected at build time and with which
    diagnostics.

Streams on `process.stdin`, `Buffer`, and other `node:fs` operations are out
of scope. They depend on the file transport of [*PLAN-NIO.md*](./PLAN-NIO.md),
the stream semantics of [*PLAN-M6.md*](./PLAN-M6.md), and the Node.js APIs
of M7.

[CLI API proposal]: https://github.com/WinterTC55/proposal-cli-api

### Demonstration programs

Two or three programs live under *examples/* with tests. Each one runs
unchanged under Node.js and Deno with the same output, uses only the admitted
language and the input subset above, and shows a property the comparison
measures. One candidate set, to be confirmed in the unit:

 -  a ray tracer that writes a PPM image to standard output;
 -  a text-processing tool that reads standard input and uses regular
    expressions and JSON; and
 -  a numeric kernel that runs with correct hints, without hints, and with
    deliberately wrong hints, producing the same output each time.

The third program shows the guarded specialization model: only the timing
changes. Its guard-hit and guard-miss counts come from a separate build
compiled with the compiler's `observeSpecialization` option, which the CLI
does not expose; the timed executables carry no instrumentation.

### Comparison measurements

An evidence document records, for each demonstration program, the
executable size, startup time, peak resident set, and run time of Oseo's
executable against `node`, Deno, and Bun, and against their single-executable
forms: Node.js single executable applications, `deno compile`, and
`bun build --compile`. Measurements run on Linux AMD64 and macOS AArch64 with
the method and its limits stated, using the harness from the first checkpoint
of [*PLAN-PERF.md*](./PLAN-PERF.md), which pins Bun and the single-executable
tools through mise. A result where Oseo is slower is reported as measured.

### Executable size investigation

The smallest fixture executable is 10.5 MB in the sanitized configuration.
This optional unit measures the optimized configuration, finds what takes
the remaining space, for example the linked runtime, symbols, or Unicode and
regular expression tables, and records which reductions are safe. It
implements a reduction only when the measurement and its tests show that no
semantics change.


Decisions to record
-------------------

The preview needs three decisions before the units that depend on them.
Each has an accepted record:

 -  [ADR 0036](./docs/adr/0036-optimized-native-build-configuration.md)
    defines the `checked` and `optimized` build configurations, their
    compiler options, how they are selected, and which gates run them. It
    amends the sanitizer column of ADR 0014;
 -  [ADR 0037](./docs/adr/0037-retained-native-executables.md) defines the
    retained-executable destination and replacement contract that
    [*PLAN-CLI.md*](./PLAN-CLI.md) requires before `build` lands; and
 -  [ADR 0038](./docs/adr/0038-process-input-and-exit-subset.md) defines the
    process subset, its Node.js deviations, and its relation to M7.

The erasable TypeScript boundary changes the source-language profile, not
the ECMAScript claim. The [M1 language profile](./docs/language-profile-m1.md)
records only the M1 slice, and the M5 claim has moved to ECMAScript 2026, so
the boundary is recorded as a family indexed by the
[ECMAScript 2026 language profile](./docs/language-profile-es2026.md), which
`mise run check:evidence-lanes` validates. That record also states the
current hint vocabulary, including `bigint`, which no profile lists today.


Verification
------------

Each unit follows [*CONTRIBUTING.md*](./CONTRIBUTING.md): fixed native
fixtures, differential tests against Node.js and Deno, property suites where
a generated domain helps, and `mise run check` and `mise run test` on the
landing commit. The erasable-syntax unit runs the full test262 update because
it changes the frontend. The demonstration programs run in CI on both native
targets so that a regression breaks the build instead of the demo.


Exit criteria
-------------

The preview is complete when:

 -  programs that use the erasable TypeScript subset compile and behave like
    their stripped JavaScript on both compiler hosts;
 -  `oseo build` retains optimized executables for Linux AMD64 and macOS
    AArch64 and cross-links AArch64 Linux, under a recorded destination
    policy, and the native gates pass in the optimized configuration;
 -  the process subset is accepted in an ADR, implemented, and covered by
    differential tests;
 -  the demonstration programs build, run, and pass their tests in CI;
 -  the comparison evidence is published with its method and limits; and
 -  *README.md* and *docs/cli.md* describe how to build and run the
    demonstrations from a checkout.
