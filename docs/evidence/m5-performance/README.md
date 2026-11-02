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
generated section below. A full run took about five and a half minutes on the
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
 -  Allocation and collection counters are event counts, not bytes. Under the
    default collector schedule, a fixture whose heap never reaches the first
    collection threshold reports zero collections.
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

| Field                          | Value                                      |
| ------------------------------ | ------------------------------------------ |
| Commit                         | `60deb29c8666f6ee7da8fe4661fa2cf53bcf8ebe` |
| Clean tree                     | yes                                        |
| Measured at                    | 2026-11-02                                 |
| Operating system               | `Linux 7.2.11-200.fc44.x86_64`             |
| Architecture                   | x64                                        |
| CPU                            | AMD Ryzen 7 7700X 8-Core Processor         |
| Logical CPUs                   | 16                                         |
| Memory                         | 124.2 GiB                                  |
| Node.js                        | v24.21.0                                   |
| Zig                            | 0.16.0                                     |
| Native target                  | `linux-x86_64-gnu`                         |
| Sanitizers                     | `address`, `undefined`                     |
| Specialization policy          | enabled                                    |
| Executions per workload        | 5                                          |
| Peak RSS command               | /usr/bin/time -f %M                        |
| Runtime archive before warm-up | cached                                     |
| Measurement wall time          | 328.7 s                                    |

502 fixtures from 90 modules were measured.
Totals sum over fixtures. The RSS row has no total because peak RSS
does not add across processes.

| Metric                           |         Total |     Median |        Min |        Max |
| -------------------------------- | ------------: | ---------: | ---------: | ---------: |
| Generated C bytes                |   290,170,894 |  306,751.5 |      5,270 | 16,929,875 |
| Executable bytes                 | 6,533,634,024 | 12,021,452 | 10,522,048 | 89,690,048 |
| Frontend, MIR, and C emission ms |      10,134.7 |       11.1 |        0.5 |      711.6 |
| C compile and link ms            |     269,218.1 |      496.0 |       56.0 |    5,510.5 |
| Median execution latency ms      |       4,850.8 |        6.8 |        3.5 |      338.9 |
| Peak RSS KiB                     |           n/a |      6,104 |      3,504 |    215,060 |
| Runtime allocations              |       129,484 |         92 |          5 |     26,801 |
| Runtime collections              |             0 |          0 |          0 |          0 |

Each module row sums its fixtures, except the executable and peak RSS
columns, which report the largest fixture. Latency sums per-fixture
medians. Frontend time includes C emission.

| Module                                 | Fixtures |     C bytes | Largest executable bytes | Frontend ms | C build ms | Latency ms | Largest peak RSS KiB | Allocations | Collections |
| -------------------------------------- | -------: | ----------: | -----------------------: | ----------: | ---------: | ---------: | -------------------: | ----------: | ----------: |
| *array-buffer.ts*                      |        1 |   3,360,279 |               28,111,896 |       113.0 |    1,117.7 |        9.5 |               15,160 |       1,121 |           0 |
| *array-constructor.ts*                 |        7 |   3,090,118 |               16,717,088 |       100.7 |    3,199.8 |       35.9 |                8,724 |         702 |           0 |
| *array-prototype-change-by-copy.ts*    |        1 |   1,005,309 |               15,576,472 |        34.1 |      823.7 |        6.1 |                8,352 |         317 |           0 |
| *array-prototype-copying.ts*           |        1 |   1,853,289 |               20,093,064 |        61.5 |    1,010.1 |        6.9 |               10,740 |         455 |           0 |
| *array-prototype-index-search.ts*      |        1 |   1,153,815 |               15,827,568 |        34.0 |      907.8 |        5.1 |                8,208 |         218 |           0 |
| *array-prototype-iterative.ts*         |        1 |     810,556 |               14,956,128 |        22.0 |      793.3 |        5.4 |                7,704 |         219 |           0 |
| *array-prototype-iterators.ts*         |        1 |     905,032 |               14,948,600 |        27.6 |      930.4 |        5.8 |                7,768 |         230 |           0 |
| *array-prototype-mutation.ts*          |        1 |     993,617 |               14,879,080 |        29.7 |      767.7 |        8.1 |                7,664 |         231 |           0 |
| *array-prototype-predicate-search.ts*  |        1 |   1,598,674 |               19,465,608 |        52.0 |    1,036.6 |        7.0 |               10,720 |         487 |           0 |
| *array-prototype-reduction.ts*         |        1 |   1,145,154 |               16,897,040 |        33.2 |    1,009.5 |        6.4 |                9,068 |         366 |           0 |
| *array-prototype-sort.ts*              |        4 |  27,976,911 |               89,690,048 |     1,179.4 |   10,124.3 |      111.7 |               67,104 |      13,364 |           0 |
| *array-prototype-species-mapping.ts*   |        1 |     922,114 |               15,422,064 |        24.6 |      836.9 |        7.8 |                8,060 |         195 |           0 |
| *async-generators.ts*                  |       11 |   4,346,496 |               14,228,216 |       114.5 |    5,193.2 |       91.4 |                7,804 |       2,615 |           0 |
| *async-iteration.ts*                   |       11 |   2,637,587 |               14,470,424 |        68.7 |    4,454.0 |       88.0 |                7,644 |       2,215 |           0 |
| *async.ts*                             |        7 |   1,728,649 |               12,589,256 |        47.2 |    2,864.0 |      375.5 |                6,452 |       1,052 |           0 |
| *atomics-and-shared-memory.ts*         |        5 |   2,652,301 |               13,874,152 |       102.1 |    3,010.2 |      108.8 |                9,860 |         479 |           0 |
| *atomics-single-agent.ts*              |        2 |   3,389,474 |               20,839,528 |        99.9 |    1,949.6 |      118.6 |               11,504 |       1,152 |           0 |
| *bigint-intrinsic.ts*                  |        1 |   2,550,082 |               21,956,520 |        83.8 |    1,030.5 |        9.1 |               12,088 |       2,735 |           0 |
| *bigint.ts*                            |        2 |     453,473 |               12,950,024 |        21.2 |      769.9 |       13.5 |                6,812 |         548 |           0 |
| *binding-reference-evidence.ts*        |        3 |     669,008 |               11,663,784 |        27.5 |    1,106.1 |       14.4 |                6,052 |         221 |           0 |
| *bindings.ts*                          |       34 |  10,338,636 |               17,992,480 |       347.8 |   14,791.6 |      228.9 |                9,484 |       3,092 |           0 |
| *boolean-intrinsic.ts*                 |        1 |     997,263 |               14,682,568 |        29.6 |      920.3 |        7.0 |                7,584 |         135 |           0 |
| *callable-object-evidence.ts*          |       18 |   2,559,790 |               11,968,832 |       110.2 |    4,826.0 |       88.1 |                5,972 |         693 |           0 |
| *class-private-name-lifetimes.ts*      |        1 |     189,046 |               11,841,952 |         7.7 |      453.4 |        6.5 |                5,976 |          75 |           0 |
| *classes.ts*                           |       59 |  12,278,898 |               16,943,952 |       427.1 |   18,945.9 |      391.1 |                9,096 |       4,596 |           0 |
| *completion-records.ts*                |       82 |  56,961,204 |               14,609,816 |     1,744.1 |   64,181.5 |      705.5 |                9,704 |       8,788 |           0 |
| *construction-static-contracts.ts*     |        1 |     127,503 |               11,127,896 |         5.4 |      255.5 |        5.3 |                5,672 |          48 |           0 |
| *cross-realm.ts*                       |        6 |   6,427,745 |               20,705,480 |       226.6 |    4,029.1 |       47.1 |                9,992 |         664 |           0 |
| *data-view.ts*                         |        1 |   2,091,078 |               20,781,072 |        62.9 |    1,056.0 |       18.2 |               12,972 |       3,420 |           0 |
| *date-family.ts*                       |        2 |   2,563,946 |               21,049,728 |       110.6 |    1,203.0 |       68.2 |               11,404 |       1,399 |           0 |
| *direct-eval-non-string.ts*            |        1 |     531,282 |               13,096,896 |        19.5 |      833.4 |        6.3 |                6,720 |         167 |           0 |
| *ds22-boundary-core.ts*                |        6 |     420,899 |               11,006,184 |        19.7 |    1,030.4 |       28.4 |                5,508 |         132 |           0 |
| *dynamic-source-residual.ts*           |       17 |  18,332,696 |               19,375,344 |       548.6 |   14,259.0 |      312.6 |               33,140 |       3,030 |           0 |
| *dynamic-source-static-core.ts*        |       43 |   3,368,382 |               12,050,576 |       209.2 |    7,369.9 |      183.6 |                5,912 |         817 |           0 |
| *expressions.ts*                       |       24 |   2,108,877 |               13,484,904 |        81.5 |    3,909.1 |      155.4 |                6,932 |         979 |           0 |
| *function-intrinsic-chains.ts*         |        2 |   2,297,537 |               17,126,160 |        69.1 |    1,717.5 |       17.0 |                8,984 |         680 |           0 |
| *functions.ts*                         |       22 |   4,263,763 |               13,679,056 |       201.7 |    6,563.8 |      113.5 |                6,904 |       1,435 |           0 |
| *generators.ts*                        |        6 |   3,210,297 |               15,264,832 |        91.8 |    3,388.5 |       52.1 |                9,968 |       3,130 |           0 |
| *generic-string-coercion.ts*           |        1 |   1,240,636 |               15,955,472 |        37.7 |      979.1 |        7.7 |                8,404 |         265 |           0 |
| *global-numeric-functions.ts*          |        1 |   2,316,033 |               20,353,480 |        75.4 |    1,103.0 |        9.5 |               10,580 |         699 |           0 |
| *global-object-record.ts*              |        2 |   1,368,389 |               13,611,128 |        50.8 |    1,793.4 |       10.2 |                7,004 |         400 |           0 |
| *globalthis-binding.ts*                |        1 |   1,115,712 |               15,120,464 |        52.1 |      905.5 |        5.7 |                7,844 |         116 |           0 |
| *iterator-helpers-eager.ts*            |        1 |   1,413,881 |               17,327,288 |        39.2 |      998.1 |       10.5 |               10,084 |         702 |           0 |
| *iterator-helpers-lazy.ts*             |        1 |   2,004,893 |               19,496,048 |        62.5 |      972.2 |        9.3 |               10,736 |         882 |           0 |
| *iterator-intrinsic.ts*                |        1 |   1,110,515 |               15,275,544 |        36.8 |      882.2 |       10.2 |                7,772 |         206 |           0 |
| *json-parse.ts*                        |        1 |   1,067,580 |               14,642,176 |        30.5 |      878.7 |        7.8 |                8,232 |         975 |           0 |
| *json-stringify.ts*                    |        1 |     965,686 |               14,437,976 |        27.9 |      770.6 |        7.5 |                7,524 |         317 |           0 |
| *lexical-bmp-comments.ts*              |        2 |      18,039 |               10,545,128 |       314.6 |      129.1 |       14.9 |                5,376 |          15 |           0 |
| *lexical-static-evidence.ts*           |       23 |   6,186,633 |               13,364,008 |       190.2 |   10,346.5 |      163.0 |                6,740 |         421 |           0 |
| *map-intrinsic.ts*                     |        1 |   1,471,521 |               17,455,104 |        41.8 |      950.5 |        7.7 |                9,204 |         423 |           0 |
| *math-namespace.ts*                    |        1 |   1,925,755 |               18,119,376 |        77.3 |      998.2 |        7.7 |                9,952 |         209 |           0 |
| *non-blocking-agent.ts*                |        1 |     176,139 |               12,109,560 |         5.8 |      490.7 |        6.9 |                6,108 |          26 |           0 |
| *number-intrinsic.ts*                  |        1 |   1,410,272 |               16,428,312 |        42.9 |      986.0 |        7.1 |                8,336 |         212 |           0 |
| *number-prototype.ts*                  |        1 |   1,314,860 |               17,647,120 |        41.3 |      945.6 |       11.1 |                9,732 |         678 |           0 |
| *object-own-keys.ts*                   |        3 |   3,714,891 |               21,078,704 |       126.8 |    2,437.6 |       17.0 |               11,708 |         840 |           0 |
| *objects.ts*                           |       27 |  16,589,235 |               18,355,936 |       584.3 |   17,078.0 |      145.8 |                9,780 |       5,837 |           0 |
| *primitive-receiver-inherited-set.ts*  |        2 |     130,634 |               10,869,784 |         5.6 |      304.0 |       14.7 |                5,436 |          68 |           0 |
| *promise-intrinsic.ts*                 |        2 |   4,875,855 |               20,935,312 |       139.0 |    2,022.8 |       20.8 |               11,940 |       1,636 |           0 |
| *proper-tail-calls.ts*                 |        3 |   1,421,254 |               14,822,640 |        56.8 |    1,336.4 |      256.6 |              215,060 |      26,892 |           0 |
| *proxy-exotic-object.ts*               |        2 |   2,713,549 |               21,114,384 |        87.7 |    1,070.3 |       19.0 |               12,208 |         927 |           0 |
| *receivers.ts*                         |        4 |     285,962 |               11,102,544 |        11.3 |      605.3 |       26.6 |                5,612 |         122 |           0 |
| *reflect-namespace.ts*                 |        1 |   4,382,719 |               28,297,392 |       160.3 |    1,098.3 |       10.5 |               16,028 |       1,077 |           0 |
| *regexp-anchored-repeat.ts*            |        1 |     296,987 |               12,709,960 |         9.6 |      673.1 |      338.9 |              101,108 |         784 |           0 |
| *regexp-intrinsic.ts*                  |        1 |     930,152 |               14,093,072 |        31.5 |      937.0 |        7.5 |                7,552 |         269 |           0 |
| *regexp-literal-aot.ts*                |        1 |     895,022 |               13,723,952 |        53.1 |      783.4 |        8.5 |                7,348 |         996 |           0 |
| *regexp-pattern-extensions.ts*         |        1 |     691,910 |               13,104,128 |        23.6 |      753.7 |        7.4 |                7,208 |         534 |           0 |
| *regexp-prototype-and-exec.ts*         |        1 |   1,912,075 |               19,369,168 |        60.2 |      989.0 |        9.8 |               10,640 |       1,486 |           0 |
| *regexp-static-evidence.ts*            |        1 |     419,329 |               12,283,240 |        13.5 |      585.9 |        8.6 |                6,456 |         170 |           0 |
| *regexp-symbol-methods.ts*             |        1 |   1,609,710 |               17,808,656 |        53.0 |      964.1 |        9.1 |                9,560 |         821 |           0 |
| *set-composition-methods.ts*           |        1 |   1,973,125 |               19,944,064 |        81.9 |      989.3 |       14.9 |               14,764 |       3,727 |           0 |
| *set-intrinsic.ts*                     |        1 |   1,563,391 |               16,836,376 |        47.3 |      986.6 |        8.0 |                8,960 |         568 |           0 |
| *string-intrinsic.ts*                  |        1 |   1,830,908 |               18,293,136 |        54.5 |    1,065.8 |        7.9 |                9,560 |         315 |           0 |
| *string-iterator.ts*                   |        1 |     611,512 |               13,065,848 |        19.6 |      850.3 |        7.0 |                6,656 |         215 |           0 |
| *string-prototype-access.ts*           |        1 |   1,082,305 |               15,263,152 |        30.5 |      942.0 |        8.0 |                7,636 |         217 |           0 |
| *string-prototype-case.ts*             |        1 |     657,197 |               14,159,640 |        23.3 |      845.9 |        6.6 |                7,368 |         227 |           0 |
| *string-prototype-match-and-split.ts*  |        1 |   1,514,546 |               18,188,096 |        42.3 |      938.8 |        7.6 |               10,004 |         555 |           0 |
| *string-prototype-pad.ts*              |        1 |     586,353 |               13,799,816 |        17.2 |      798.8 |        7.2 |                7,040 |         170 |           0 |
| *string-prototype-replace.ts*          |        1 |   1,355,504 |               18,329,824 |        35.2 |      990.7 |        8.9 |                9,676 |         532 |           0 |
| *string-prototype-search-and-slice.ts* |        1 |     777,030 |               14,607,496 |        22.4 |      754.7 |        7.5 |                7,576 |         225 |           0 |
| *symbol-intrinsic.ts*                  |        1 |   1,462,130 |               17,408,656 |        39.6 |      970.3 |        8.6 |                9,300 |         373 |           0 |
| *typed-array-constructors.ts*          |        2 |   3,187,112 |               23,393,808 |       113.6 |    1,582.3 |       14.3 |               12,704 |       1,291 |           0 |
| *typed-array-core.ts*                  |        1 |   3,216,581 |               25,247,216 |       105.4 |    1,035.3 |       10.8 |               13,740 |       1,923 |           0 |
| *typed-array-float16.ts*               |        1 |     951,944 |               14,798,648 |        31.6 |      956.2 |        7.2 |                8,368 |         642 |           0 |
| *typed-array-iterative.ts*             |        1 |   1,374,545 |               17,491,392 |        37.7 |    1,066.5 |        8.2 |                9,532 |         689 |           0 |
| *typed-array-mutation.ts*              |        1 |   2,122,380 |               18,816,424 |        64.2 |    1,020.8 |        8.9 |               11,064 |       1,251 |           0 |
| *typed-array-search-and-join.ts*       |        1 |   1,769,628 |               19,272,176 |        53.6 |    1,061.5 |        7.5 |               10,372 |         850 |           0 |
| *typed-array-sort.ts*                  |        1 |     980,110 |               15,861,432 |        28.0 |      984.0 |        7.0 |                8,788 |         510 |           0 |
| *typed-array-statics.ts*               |        1 |   1,484,230 |               16,338,752 |        40.8 |      940.1 |        7.7 |                9,580 |         949 |           0 |
| *uri-handling-functions.ts*            |        1 |   1,145,962 |               15,513,232 |        41.9 |      964.4 |        9.2 |                8,040 |         291 |           0 |
| *weak-collections.ts*                  |        1 |   2,237,793 |               22,472,080 |        71.2 |    1,036.3 |       10.4 |               12,916 |       2,757 |           0 |
| Total                                  |      502 | 290,170,894 |               89,690,048 |    10,134.7 |  269,218.1 |    4,850.8 |              215,060 |     129,484 |           0 |

No fixture in the common loop failed to build or execute.

90 of the 115 files under *tests/native/fixtures/* are common-loop modules. The
others are imported by one and measured through it, or excluded:
a dedicated test owns them with a harness this tool does not
reproduce, or they are not modules.

| File                                  | Disposition                    | Owners                                                                                                                                       |
| ------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| *annex-b-mixed-core.ts*               | Excluded: dedicated harness    | *tests/annex-b-mixed-core-native.test.ts*                                                                                                    |
| *completion-record-cases.LICENSE*     | Excluded: unreferenced         | none                                                                                                                                         |
| *completion-record-cases.ts*          | Measured through its owner     | *completion-records.ts*                                                                                                                      |
| *compound-reference-base.ts*          | Excluded: dedicated harness    | *tests/compound-reference-base-evidence.test.ts*, *tests/compound-reference-base-source.test.ts*, *global-lexical-configurable-var.ts*       |
| *derived-constructor-realms.ts*       | Excluded: dedicated harness    | *tests/dynamic-source-residual-evidence.test.ts*, *tests/dynamic-source-residual-source.test.ts*, *tests/property/m5-class.property.test.ts* |
| *eval-code-inline-evidence.ts*        | Excluded: dedicated harness    | *tests/eval-code-inline-evidence.test.ts*                                                                                                    |
| *function-constructor-evidence.ts*    | Excluded: dedicated harness    | *tests/function-constructor-evidence.test.ts*                                                                                                |
| *global-lexical-configurable-var.ts*  | Excluded: dedicated harness    | *tests/global-lexical-configurable-var-evidence.test.ts*, *tests/global-lexical-configurable-var-source.test.ts*                             |
| *host-script-bindings.ts*             | Excluded: dedicated harness    | *tests/host-script-bindings.test.ts*, *tests/host-script-source.test.ts*                                                                     |
| *host-script-directives.ts*           | Excluded: dedicated harness    | *tests/host-script-directives-source.test.ts*, *tests/host-script-directives.test.ts*                                                        |
| *host-script-evidence-cases.ts*       | Excluded: dedicated harness    | *tests/host-script-evidence.test.ts*, *host-script-evidence.ts*                                                                              |
| *host-script-evidence.ts*             | Excluded: dedicated harness    | *tests/eval-code-inline-evidence.test.ts*, *tests/host-script-evidence.test.ts*                                                              |
| *host-script-runtime-owned.ts*        | Excluded: dedicated harness    | *tests/host-script-runtime-owned-source.test.ts*, *tests/host-script-runtime-owned.test.ts*                                                  |
| *host-script-trainc-cases.ts*         | Excluded: dedicated harness    | *tests/host-script-trainc-source.test.ts*, *host-script-trainc.ts*                                                                           |
| *host-script-trainc.ts*               | Excluded: dedicated harness    | *tests/host-script-trainc-evidence.ts*, *tests/host-script-trainc-source.test.ts*                                                            |
| *residual-class-cases.ts*             | Measured through its owner     | *dynamic-source-residual.ts*                                                                                                                 |
| *residual-completion-cases.ts*        | Measured through its owner     | *dynamic-source-residual.ts*                                                                                                                 |
| *scope-arguments-evidence.ts*         | Excluded: dedicated harness    | *tests/scope-arguments-native.test.ts*                                                                                                       |
| *template-site-identity.ts*           | Measured through its owner     | *bindings.ts*                                                                                                                                |
| *trainc-ordinary-evidence.ts*         | Excluded: dedicated harness    | *tests/trainc-ordinary-evidence.test.ts*, *tests/trainc-ordinary-source.test.ts*                                                             |
| *with-get-binding-value.ts*           | Excluded: dedicated harness    | *tests/native.ts*                                                                                                                            |
| *with-keyed-binding-target-order.ts*  | Excluded: dedicated harness    | *tests/native.ts*, *tests/with-var-loop-head.test.ts*                                                                                        |
| *with-primitive-boxing.ts*            | Measured through its owner     | *bindings.ts*                                                                                                                                |
| *with-var-loop-head-resolution.ts*    | Measured through its owner     | *bindings.ts*                                                                                                                                |
| *yield-star-noncallable-throw.js.txt* | Excluded: data its owners read | *tests/yield-star-throw-callability.test.ts*, *tests/yield-star-throw-model.test.ts*                                                         |

<!-- End of generated measurements. -->
