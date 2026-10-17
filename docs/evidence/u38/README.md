Reflect namespace case shards on a Mac lane
===========================================

This unit measured the three dedicated case-shard jobs that U38 introduced
for *tests/property/m5-reflect-namespace.property.test.ts*, so the lane
model could place them from measurement instead of estimate. The
measurement ran on 2026-10-17 from 17:00 to 17:16 UTC, at main commit
`bf236836`, as the `dahlia` account over SSH. No runner, LaunchDaemon,
security setting, repository variable, or secret was changed. Every number
below is labeled measured or derived. The raw logs remain under
*~/m5ci-results/u38/runs/* on the Mac.


Why this file was partitioned
-----------------------------

U31 established that the maximum Linux `native support` file shard is
pinned by this one file, which no file partition can split. Run
39025004305 confirmed it directly. The file's shard ran four files on four
workers, and the job's own log timed the file's three suites at a measured
1,072,978, 453,649 and 225,682 milliseconds against a 1,785-second job, so
the file alone set the shard's wall:

| Suite                                                               | `numRuns` | Interrupt limit | Measured     | Share of limit |
| ------------------------------------------------------------------- | --------- | --------------- | ------------ | -------------- |
| generated Reflect reflection matches the M5 model                   | 120       | 3,600,000 ms    | 1,072,978 ms | 29.8%          |
| generated module namespace writes keep the exotic refusal           | 240       | 3,000,000 ms    | 453,649 ms   | 15.1%          |
| generated built-in new targets read prototype where the clause says | 120       | 3,600,000 ms    | 225,682 ms   | 6.3%           |

The limits are the suites' `timeLimitMilliseconds` times the extended
task's run scale of ten. The file uses no `fc.pre`, which case sharding
forbids, and its scaled case budgets are far above three, so the shard
guard in `propertyRunSettings` admits a total of three.


Host and method
---------------

The host is the first Mac mini, which runs `oseo-mac-1` and `oseo-mac-2`:
an Apple M6 with 12 logical CPUs and 16 GiB of memory, running macOS
27.0.1 with Spotlight indexing disabled. Two clones,
*~/Desktop/oseo-m5ci-u38-a/* and *-b/*, were checked out at `bf236836`,
each with its own `ZIG_GLOBAL_CACHE_DIR`.

[*scripts/job.sh.txt*](./scripts/job.sh.txt) runs the job's steps after
checkout and tool installation exactly as the generated workflow does:
`mise run build` and `mise run ci:runtime-archive-cache` from the
runtime-archive action, then
`mise run test:property:extended:native:shard` on the one file with
`OSEO_PROPERTY_CASE_SHARD` set and no duration file, which is the shape
the workflow gives these jobs.
[*scripts/drive.sh.txt*](./scripts/drive.sh.txt) waited for `oseo-mac-1`
and `oseo-mac-2` to report idle before each experiment and sampled their
busy state every 30 seconds. No sample recorded a busy lane and no step
exited non-zero.

The experiment named `warm` is the first, cold pass; it runs the pair shape
so that both clones end warm. Its walls mix the cold runtime-archive and
Zig cache cost with concurrency, so they are reported but are not the
pair factor.


Measured walls
--------------

Full step timings are in [*solo.tsv*](./solo.tsv).

| Job    | Case shard | Measured solo wall |
| ------ | ---------- | ------------------ |
| `rn-1` | 1/3        | 179.7 s            |
| `rn-2` | 2/3        | 179.4 s            |
| `rn-3` | 3/3        | 180.0 s            |

The three shards agree within 0.3 percent, which is what a round-robin
case filter over three balanced suites should produce. Each shard ran all
three suites and reported three passing tests, and the shard that ran
beside another measured 191.7 seconds against an unsharded Mac equivalent
of about 615, so the filter did reduce the case count rather than silently
pass the whole file.

[*pair-jobs.tsv*](./pair-jobs.tsv) reports the two experiments that ran two
of these jobs at once, one per Mac lane of the same machine. Using the U25
definition, the overlapped seconds of a job divided by the solo work left
for that overlap, the warm pair gives a measured 1.069 on both sides.
Rounded up, the pair factor is **1.07**, the lowest in
`selfHostedPairSlowdowns`. These jobs are short and nearly equal in
length, so they overlap for essentially their whole walls.


Derived model values
--------------------

The hosted `macos-15` medians in `macosJobCosts` are estimates, not
medians: CI has never run these jobs. They apply the own-key family's
measured ratio of 2.3, the only one measured for this job shape, to the
measured Mac walls, giving 336 seconds each. A proportional route, scaling
the own-key hosted medians by the ratio of the two files' Mac walls, gives
383, so 336 is the lower of the two.

Two other bases were rejected, and the reason matters for anyone refreshing
these numbers. Hosted Linux walls do not convert, because the 1,754
seconds the file measured in run 39025004305 were measured while three
other files shared the same runner; treating a third of that as a
dedicated job gives 615 seconds and implies a Mac lane 3.25 times faster
than hosted Linux, where the own-key case shards measure 1.14. The U6
weight table does not convert either, because it overstates the two
case-sharded files by a derived 1.31 against 2.50.

The family ratio of 2.3 is therefore a borrowed measurement, and the
hosted medians were derived from it, so neither is independent evidence
for this family. All three jobs have a measured Mac wall, which the lane
model uses directly, so the ratio only guards a future fourth shard. The
first run that places one of these jobs hosted replaces the estimate with
an observation.

Pairings against other families were not measured. Each uses the largest
factor any family suffers beside that partner, a derived 1.45 beside
test262, own-key cases and native fixtures and 1.27 beside native support,
rather than this family's own 1.07, which would understate a pairing with
heavier work.


Derived effect on the schedule
------------------------------

Excluding the file from the native file shards lowers both hosts' maximum
shard, measured against the checked-in weight model:

| Partition             | Before   | After    |
| --------------------- | -------- | -------- |
| Linux, 7 file shards  | 38.3 min | 33.4 min |
| macOS, 12 file shards | 38.0 min | 22.7 min |

The Linux spread tightens from 34.7 to 38.3 minutes to 32.1 to 33.4, and
the macOS spread from 22.5 to 38.0 down to 21.1 to 22.7. Both lose their
single-file floor, so raising a total lowers the maximum again, which U31
showed it could not do while this file was present.

The three new macOS jobs cost the lane model nothing. With six Mac lanes
the derived macOS makespan stays at 49.1 minutes and the hosted job set is
unchanged at 221.0 derived minutes, because every new job is Mac-lane
eligible and the lanes had the headroom: Mac lane ends move from 36.3 to
42.1 minutes to 36.0 to 43.0.

That 49.1 figure is an upper bound on what the change achieves on macOS.
The model still charges `native support (macos-aarch64, 1/12)` its
retained hosted median of 1,940 seconds, which was measured while that
shard still carried this file. Lowering it now would be inventing an
observation, so it stays until a run measures the cheaper shard.


What the first run measured
---------------------------

Branch run 39053800730 ran the change. All six new jobs passed, at a
measured 8.5, 9.0 and 8.5 minutes on hosted Linux and 7.0, 4.6 and 5.5 on
Mac lanes. The Linux walls sit just under the 9.8-minute upper bound above,
so a third of the contended figure was a fair ceiling and the dedicated
job is only slightly cheaper than it.

The predicted Linux gain did not appear, and the prediction's basis is
what failed. The model expected all seven file shards to land between
32.1 and 33.4 derived minutes. They measured 48.4, 39.4, 30.6, 25.3,
37.9, 47.9 and 45.0, a spread of 23 minutes against a predicted 1.3, and
the error tracks how many files a shard holds:

| Shard | Files | Modeled  | Measured | Measured / modeled |
| ----- | ----- | -------- | -------- | ------------------ |
| 1     | 12    | 32.4 min | 48.4 min | 1.49               |
| 2     | 16    | 33.0 min | 39.4 min | 1.19               |
| 3     | 16    | 33.1 min | 30.6 min | 0.92               |
| 4     | 28    | 32.1 min | 25.3 min | 0.79               |
| 5     | 20    | 33.1 min | 37.9 min | 1.14               |
| 6     | 20    | 33.4 min | 47.9 min | 1.43               |
| 7     | 20    | 33.0 min | 45.0 min | 1.36               |

The checked-in U6 weights therefore no longer describe this corpus. They
underestimate a shard with few files and overestimate one with many, so
the balanced partition the cost rule computes is not the partition CI
runs. Every derived minute in the section above rests on those weights and
should be read as arithmetic on a stale table, not as a prediction this
run confirmed.

The Linux maximum went from a measured 50.7 minutes in run 39025004305 to
48.4 here. That is inside ordinary variance: runs 39012514327 and
39025004305 differed by 3.9 minutes with no change that touched CI
scheduling. One run cannot separate a 2.3-minute move from that noise.

The structural finding U31 made is still fixed. No shard is owned by one
file any longer: shard 1/7 held four files before and holds twelve now.
What that bought is that a larger total can lower the maximum again,
which it could not while this file was present. What it did not buy is a
lower wall today, because another file became the pole of the shard that
sets it, and shard 1/7 itself rose from a measured 40.3 minutes to 48.4
as the partition redistributed.

Refreshing the weight table from CI logs, by the procedure in
*docs/evidence/u6/README.md*, is the prerequisite for trusting any further
partition change on Linux.
