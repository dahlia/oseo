M5 performance and code-size report
===================================

This report records compile time, generated C size, executable size, peak
resident set size, runtime allocation counts, and execution latency for the
native fixtures of the common differential loop in *tests/native.ts*. It is
the performance and code-size part of the M5 exit report; the capability part
is [*m5-exit-report.md*](../../m5c-closure/m5-exit-report.md).

The numbers describe one machine at one commit. They are a baseline for later
comparison on the same host, not a benchmark result or a cross-host claim.


Workloads
---------

The workloads are the fixtures that `nativeFixtureGroups` in
*tests/native/fixture-inventory.ts* lists, in the same order that
*tests/native.ts* builds them. Each fixture is compiled the way that loop
compiles it: `compileSource` with the default frontend, `observeSpecialization`
enabled, and the fixture's `test262Host` flag; then `withNativeFixture` with
the C backend, the C runtime, and the agent programs of a test262-host
fixture.

Files under *tests/native/fixtures/* that the loop does not list are named at
the end of the generated section. Some are data modules that a listed module
imports, so they are measured through it. The rest belong to dedicated tests
whose harnesses supply host scripts, scenario drivers, or source-shape checks
that this tool does not reproduce. A listed fixture that fails to build or
execute is reported with its error and left out of every table.


What is measured
----------------

The target is the one `targetForExecutionHost` selects for the execution host,
and the tool refuses to run when `canExecuteTarget` rejects that pair. The
toolchain is `nativeToolchain` from *tests/native-toolchain.ts*, which is Zig
unless `OSEO_NATIVE_TOOLCHAIN=host-cc` selects the sanitizer lane. The report
covers only the default specialization policy, `enabled`.

For each fixture the tool records:

 -  generated C bytes: the UTF-8 size of the emitted C source, plus the short
    split-unit wrappers that include it, for the program and its agents. The
    C runtime is not counted;
 -  executable bytes: the size of the linked executable;
 -  frontend time: wall clock of `compileSource` (parsing, HIR, and MIR) plus
    the backend's C emission;
 -  C build time: wall clock of the toolchain build plan's requests, which
    compile the generated C and link it with the runtime archive;
 -  latency: wall clock of five executions, reported as the median, minimum,
    and maximum;
 -  peak RSS: one further execution under `/usr/bin/time -f %M` on Linux or
    `/usr/bin/time -l` on macOS, in KiB, or `n/a` without either;
 -  runtime allocations and collections: the counters from the
    `OSEO_OBSERVATIONS` stderr marker of the first latency run.

The counters come from the same build as the latency runs, because the loop
always compiles with `observeSpecialization`. Executions run in the artifact
directory with `TZ=UTC` and without `OSEO_GC_EVERY_SAFEPOINT`, so collections
follow the runtime's default schedule rather than the forced one that
*tests/native.ts* selects for some fixtures.

Before the first fixture, a warm-up build publishes the runtime archive to the
host cache. Every measured build then links the cached archive, and the C
build time excludes compiling the runtime itself. Each workload's
`runtimeArchive` field in the raw data records which case applied.


Commands
--------

~~~~ sh
mise run report:m5-performance:update
~~~~

This measures every fixture, writes *measurements.json*, and replaces the
generated section below. A full run takes on the order of ten minutes on the
recorded host. It builds and executes one fixture at a time; do not run it
beside other native jobs if the timings matter.

~~~~ sh
mise run report:m5-performance -- --json /tmp/measurements.json
~~~~

This performs the same measurement and prints the section without changing
the checked-in files. The underlying tool also accepts `--runs N`,
`--specialization disabled`, and repeated `--only NAME` for a partial run;
`--update` refuses the last two, so the checked-in report always covers every
fixture under the default policy.

*tests/m5-performance-report.test.ts* checks that the generated section below
matches *measurements.json*. No check compares the numbers with a fresh
measurement, because they depend on the host.


Method limits
-------------

 -  All numbers come from one host, recorded in the first table. Nothing here
    supports a claim about another machine or operating system.
 -  Times are wall clock from `performance.now()` around each step, so they
    include process creation and whatever else the machine was doing. Five
    executions show spread, not a variance estimate.
 -  Cache state matters. The runtime archive is cached, and Zig's own cache
    sees a new staging directory per build, so generated C is compiled cold.
    Page cache and CPU frequency state are not controlled.
 -  Peak RSS is the whole process's resident set as the OS reports it,
    including the runtime's heap reservation, code pages, and libc. It is not
    the size of live JavaScript objects.
 -  Allocation and collection counters are event counts, not bytes.
 -  The supported native targets compile every executable with AddressSanitizer
    and UndefinedBehaviorSanitizer, as `describeTarget` defines them. The Zig
    build plan compiles the runtime archive at `-O2` and passes no
    optimization flag for the generated C. Sizes, latency, and RSS therefore
    describe instrumented builds, not an optimized release configuration,
    which M5 does not define.
 -  Executable size includes the sanitizer runtimes and whatever symbols the
    build plan keeps.


Measurements
------------

<!-- Generated by `mise run report:m5-performance:update`; do not edit. -->

<!-- End of generated measurements. -->
