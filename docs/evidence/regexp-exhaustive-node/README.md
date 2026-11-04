Ordinary exhaustive RegExp placement
====================================

*tests/property/m5-regexp-literal-exhaustive.property.test.ts* runs in one
dedicated ordinary Node.js job on each of Linux and macOS, outside the weighted
Node shards. Its four native properties keep one sweep each (`numRuns: 1`),
seeds `0x60009500` to `0x60009503`, and the 600-second interrupt. The jobs use
one file worker and no `OSEO_PROPERTY_TIME_SCALE`. The generators, oracle, and
extended and sanitizer placements are unchanged.


Why the file left the shards
----------------------------

The file entered the ordinary shards without a weight in
*tools/node-shard-costs.ts*, so the placement modeled it as a light file and
put it beside heavy ones. Its plain domains, A1.1 and A2.1, each compile and run
65,521 literals and take most of their interrupt when they share a runner.

Main run [41692393326] at `47240f4a` failed `test (macos-latest, node, 2/6)` in
both attempts. Attempt 1 interrupted A2.1 at 600.1 seconds after A1.1 had taken
494.4. Attempt 2 interrupted both A1.1 and A2.1 at 600.0 seconds, while A1.4
took 183.5 and A2.4 265.7. No interrupted property finished its sweep, so
the failures say nothing about the literals themselves.

[41692393326]: https://github.com/dahlia/oseo/actions/runs/41692393326


CI observations
---------------

*observations.tsv* lists every native property duration that the jobs in
*jobs.tsv* reported: the ordinary Node shard that carried the file in the 12
main runs from [41280117339] to [41728591316], attempt 2 of run
[41692393326], and that run set's 60 hosted Linux extended case-shard jobs.
A case-shard job runs this file alone, two sweeps per property, so its rows
give one sweep, half the reported duration. macOS case shards ran on the Mac
lanes, not hosted runners, and are left out.

Per-sweep seconds, minimum, median, and maximum:

| Placement                        | Jobs | A1.1                | A1.4               | A2.1                | A2.4              |
| -------------------------------- | ---: | ------------------- | ------------------ | ------------------- | ----------------- |
| Linux ordinary shard, shared     |   12 | 247.3, 355.3, 504.1 | 52.8, 80.9, 108.4  | 193.3, 293.6, 380.9 | 42.9, 66.0, 90.3  |
| macOS ordinary shard, shared     |   13 | 176.2, 443.0, 600.0 | 28.5, 104.6, 183.5 | 148.7, 406.1, 600.1 | 27.5, 83.0, 265.7 |
| Linux extended case shard, alone |   60 | 147.1, 259.1, 317.5 | 29.5, 56.7, 68.5   | 142.9, 255.3, 311.8 | 31.4, 57.2, 69.5  |

On hosted Linux the file alone ran a plain sweep in at most 317.5 seconds,
53% of the interrupt. Beside other file workers the same sweep took a median
1.37 times longer and reached 504.1 seconds.

No hosted macOS run has measured the file alone. The three fastest shared
macOS observations, from runs [41728591316], [41398158326], and [41597847447],
took 176.2 to 230.8 seconds for A1.1 and 148.7 to 171.8 for A2.1; the other
ten took 388.2 to 600.0 for A1.1. Other file workers can only add time to a
sweep, so the fastest shared observations approximate an uncontended one;
runners of the same label still differ in speed, so this is not a bound. About
230 seconds, 38% of the interrupt, is the best available estimate for the
dedicated job.

[41280117339]: https://github.com/dahlia/oseo/actions/runs/41280117339
[41398158326]: https://github.com/dahlia/oseo/actions/runs/41398158326
[41597847447]: https://github.com/dahlia/oseo/actions/runs/41597847447
[41728591316]: https://github.com/dahlia/oseo/actions/runs/41728591316


Annex B escaped domains
-----------------------

The two escaped domains, A1.4 and A2.4, accepted 14,737 literals before the
`annexb-syntax` unit. That unit accepts Annex B identity escapes, so they now
accept all 65,521, as the plain domains do. Their seeds and budgets did not
change.

That unit measured the file locally with `--test-concurrency=1` on one Linux
AMD64 host, alternating its base and its change. The host carried a load
average of 17 to 40 during the runs, so these are paired comparisons, not
clean standalone figures:

| Tree                |  A1.1 |  A1.4 |  A2.1 |  A2.4 | File wall |
| ------------------- | ----: | ----: | ----: | ----: | --------: |
| Base, first pass    | 200.2 |  47.8 | 194.8 |  57.6 |       521 |
| Change, first pass  | 215.4 | 233.1 | 215.7 | 248.8 |       929 |
| Base, second pass   | 189.5 |  39.6 | 177.5 |  33.6 |       462 |
| Change, second pass | 139.1 | 175.2 | 121.2 |  77.0 |       527 |

An earlier run of the base on the same host took 65.5, 14.4, 65.2, and 13.9
seconds. In the paired runs an escaped domain took 0.64 to 1.26
times as long as the plain domain of the same pass. The estimates below
therefore treat an escaped sweep as up to 1.26 times a plain one.


Where a sweep spends its time
-----------------------------

Nearly all of a sweep is the native build. One 4,096-literal program of A1.1,
profiled on a 16-core Linux AMD64 host with warm caches, took 0.15 seconds to
compile to MIR, 0.35 to emit 13.4 MB of C, 3.4 to 3.6 for the single `zig cc`
invocation, and 0.025 to execute. The reference run and the MIR checks took
about 10 milliseconds. The build's 14 compilation units each include the whole
emitted file: the shared unit compiles in 0.14 seconds and each body unit in
about 1.1, so a build costs about 15 CPU-seconds serially and 23 when Zig runs
units in parallel.

Zig 0.16 does not run one clang process per core. Pinning the same build to *n*
CPUs with `taskset` and counting `zig cc`'s child processes gave at most one
child on 3 CPUs, two on 4, four on 6, and eight on 16. `zig cc` has no option
or environment variable that raises the count. On 3 CPUs, a build took 14.5
seconds of wall time for 14.5 CPU-seconds, so it was serial. Hosted
`macos-latest` runners have 3 vCPUs, so each program there presumably builds
its units one at a time, while hosted 4-vCPU Linux runners get two. This was
measured on Linux only; no macOS host was available to count children.

The first native property also pays for cold caches. On 3 CPUs, a first
program whose Zig cache and runtime archive cache were both empty spent 40.4
seconds in its build steps, against 13.7 with only the archive missing. The
difference is Zig building its own target libraries. Hosted runners start with
an empty Zig cache, and the runtime archive cache misses whenever the runtime
changes, as it did on macOS in main run [41913235211]. The cost falls on A1.1,
which explains part of A1.1's lead over A2.1 on the same domain size:

| Run [41913235211]                                  |               A1.1 |  A1.4 |  A2.1 | A2.4 |
| -------------------------------------------------- | -----------------: | ----: | ----: | ---: |
| `RegExp literals exhaustive (ubuntu-latest, node)` |              321.4 |  61.0 | 259.1 | 60.1 |
| `RegExp literals exhaustive (macos-latest, node)`  | 600.0, interrupted | 116.9 | 405.1 | 88.8 |

[41913235211]: https://github.com/dahlia/oseo/actions/runs/41913235211


Concurrent program builds
-------------------------

Each property now builds and checks up to three of its programs at once
(`programConcurrency` in the test file). The program set, the rotation, the
function size, each program's specialization policy, and each program's
assertions are unchanged. Programs start in sweep order. After a failure no
new program starts; the sweep waits for those already running and reports the
earliest failing program in sweep order. Every program before the failing one
has started by then, so this is the same program a serial sweep would report.

The table pairs the base and this change on one 16-thread Linux AMD64 host,
alternating trees: four 3-CPU runs, then four 16-CPU runs. Each run was
`node --test --test-concurrency=1` on the file in its own systemd scope, with
`taskset -c 0-2` for the 3-CPU rows. The Zig cache and the runtime archive
cache were warm. Foreign CPU is the host's busy CPU time outside the run's
scope, as a median of 5-second samples; the second 3-CPU pair shared the host
with other work.

| CPUs | Pair | Sweep      |  A1.1 | A1.4 |  A2.1 | A2.4 | Foreign CPUs |
| ---: | ---: | ---------- | ----: | ---: | ----: | ---: | -----------: |
|    3 |    1 | Serial     | 226.2 | 50.5 | 218.0 | 50.6 |         0.65 |
|    3 |    1 | Concurrent |  99.2 | 25.4 |  96.6 | 25.2 |         0.85 |
|    3 |    2 | Serial     | 269.4 | 56.7 | 244.0 | 56.7 |         2.84 |
|    3 |    2 | Concurrent | 131.1 | 30.2 | 116.0 | 30.6 |         3.84 |
|   16 |    1 | Serial     |  66.2 | 14.5 |  62.1 | 15.0 |         3.02 |
|   16 |    1 | Concurrent |  51.5 | 13.5 |  56.3 | 13.6 |         4.06 |
|   16 |    2 | Serial     |  80.2 | 14.9 |  66.0 | 15.0 |         3.88 |
|   16 |    2 | Concurrent |  52.9 | 12.6 |  49.4 | 11.8 |         3.51 |

On 3 CPUs the plain sweeps ran 2.1 to 2.3 times faster in both pairs, not
three times. The test process's own work, about half a second of MIR
compilation and C emission per program, and Zig's per-build overhead share
the same three CPUs. The escaped sweeps have four programs, the last one
partial, so they finish in two rounds and ran 1.9 to 2.0 times faster. Once
the `annexb-syntax` unit makes those domains 16 programs, their sweeps should
scale like the plain ones. On 16 CPUs, where Zig already runs eight children,
the plain sweeps ran 1.1 to 1.5 times faster.

Each clang process peaked at about 280 MB on Linux, so three concurrent
builds on a 3-vCPU, 7 GB macOS runner should stay near 1 GB of compiler
memory.

The macOS figures remain a derivation until a hosted run measures them. If a
hosted macOS build is serial as on 3 Linux CPUs, and the sweep speeds up as
it did there, A2.1 should drop from 273 to 414 seconds to about 120 to 200.
A1.1 also pays the cold-cache cost, which concurrency does not reduce. On 3
Linux CPUs that cost was about 27 seconds. Hosted macOS runs have put A1.1 up
to about 200 seconds above A2.1, and at least 195 in run [41913235211], where
A1.1 was interrupted. If that whole gap is cold-cache cost, A1.1 takes about
320 to 400 seconds, and up to about 430 with the `annexb-syntax` unit's 7%
growth. That is 72% of the interrupt, just past the 70% that leaves 30%
headroom. If the gap is mostly runner variance, A1.1 lands near A2.1.

If a candidate run shows A1.1 above 420 seconds, building a small native
program in a test before the properties would move the cold-cache cost out of
A1.1's interrupt, leaving A1.1 near A2.1. That changes no limit, but it moves
time rather than removing it, and it is not part of this change.


Expected job durations
----------------------

These estimates predate the concurrent program builds above.

Setup to the first test took 31 to 33 seconds in the ordinary shards of run
[41692393326]; the file's build-time properties took 17 to 35 seconds in the
observations above.

| Host  | Basis                                  | Before, minutes | With Annex B escapes, minutes | Slowest property, share of interrupt |
| ----- | -------------------------------------- | --------------: | ----------------------------: | -----------------------------------: |
| Linux | case-shard median sweep                |              12 |                            21 |                43%, 54% with escapes |
| Linux | case-shard maximum sweep               |              14 |                            25 |                53%, 67% with escapes |
| macOS | fastest shared sweeps, A1.1 at 230.8 s |              10 |                            18 |                38%, 48% with escapes |

The Linux margin rests on 60 measured standalone jobs. The macOS estimate
rests on three shared observations and is not yet a measurement: the first
candidate run's dedicated macOS job is the one to confirm it.

The macOS lane entry in *tools/macos-job-costs.ts* is a 2,460-second
scheduling allowance: four 600-second interrupts and one minute of setup. It
is neither a timing estimate nor a bound. The interrupts limit only the four
native properties, and the job has no `timeout-minutes` of its own, so setup,
the package build, and the file's other tests run outside it.


Scheduling and coverage
-----------------------

`dedicatedNodeFiles` in *tools/native-shard.ts* lists the file. On both hosts
`nodeShardInventory` in *tools/node-shard.ts* removes it before the weighted
partition, as it removes `dedicatedMacosNodeFiles` on macOS.
*tests/node-shard.test.ts* checks against the real tree that each host's shards
and its dedicated jobs run Node's discovered inventory exactly once, and that
every modeled shard still ends within 40 minutes. The file has no shard weight,
so the six macOS shard walls in *tools/macos-job-costs.ts*, which are derived
from that model, stay as they are.

The jobs are `RegExp literals exhaustive (ubuntu-latest, node)` and
`RegExp literals exhaustive (macos-latest, node)`. Both run
`mise run test:node --test-concurrency=1` on the file, and `native` requires
both, including failure, skip, and cancellation. The lane generator places the
macOS job on one of the five hosted lanes, chained like the Array job, so it
takes no new hosted slot. The Linux job adds one hosted Ubuntu job to the run,
which U48 in *PLAN-GATE.md* counts against the slots a run receives.

The generator's modeled maximum changes as follows:

|      Mac lanes | Before, seconds | After, seconds |
| -------------: | --------------: | -------------: |
|              0 |          15,794 |         16,094 |
|              4 |       4,766.065 |      5,002.796 |
|              6 |           4,264 |          4,264 |
| 8 (configured) |           4,264 |          4,264 |

At the configured eight lanes the property sanitizer lane still sets the
maximum, so the change adds no modeled critical path. These are schedule
estimates, not observed CI durations.


Reproduction
------------

~~~~ sh
mkdir logs
tail -n +2 docs/evidence/regexp-exhaustive-node/jobs.tsv | cut -f3 |
  while read -r job; do
    gh api --allow-escape-sequences \
      "repos/dahlia/oseo/actions/jobs/$job/logs" > "logs/$job.log"
  done
python3 -B docs/evidence/regexp-exhaustive-node/extract.py logs
~~~~

The last command prints *observations.tsv*.
