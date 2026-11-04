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
ten took 388.2 to 600.0 for A1.1. A shared observation is an upper bound on an
uncontended sweep on the same kind of runner, so about 230 seconds, 38% of the
interrupt, is the best available estimate for the dedicated job.

[41280117339]: https://github.com/dahlia/oseo/actions/runs/41280117339
[41398158326]: https://github.com/dahlia/oseo/actions/runs/41398158326
[41597847447]: https://github.com/dahlia/oseo/actions/runs/41597847447
[41728591316]: https://github.com/dahlia/oseo/actions/runs/41728591316


Annex B escaped domains
-----------------------

The two escaped domains, A1.4 and A2.4, accept 14,737 literals today. Once the
`annexb-syntax` unit accepts Annex B identity escapes, they accept all 65,521,
as the plain domains do. Their seeds and budgets do not change.

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


Expected job durations
----------------------

Setup to the first test took 31 to 33 seconds in the ordinary shards of run
[41692393326]; the file's build-time properties took 17 to 35 seconds in the
observations above.

| Host  | Basis                                  | Today, minutes | With Annex B escapes, minutes | Slowest property, share of interrupt |
| ----- | -------------------------------------- | -------------: | ----------------------------: | -----------------------------------: |
| Linux | case-shard median sweep                |             12 |                            21 |                43%, 54% with escapes |
| Linux | case-shard maximum sweep               |             14 |                            25 |                53%, 67% with escapes |
| macOS | fastest shared sweeps, A1.1 at 230.8 s |             10 |                            18 |                38%, 48% with escapes |

The Linux margin rests on 60 measured standalone jobs. The macOS estimate
rests on three shared observations and is not yet a measurement: the first
candidate run's dedicated macOS job is the one to confirm it.

The macOS lane entry in *tools/macos-job-costs.ts* is a 2,460-second
scheduling allowance: four 600-second interrupts and one minute of setup. It
bounds the job, since a property that reaches its interrupt fails, and it is
not a timing estimate.


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
