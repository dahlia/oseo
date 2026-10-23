U6 shard assignment evidence
============================

Current weight source
---------------------

Refreshing the file weights lowers the modeled Linux maximum over seven
shards from 47.3 minutes to 44.1, holding one run's measured case costs
fixed. The first CI run of that partition measured 46.52 minutes against
47.77 before it, so most of the modeled 3.2 minutes did not appear; the
section on what the first run measured records why. The remaining 44.1 minutes
belongs to one file, *tests/property/m5-globalthis-binding.property.test.ts*,
whose summed case durations give it a 2,647-second weight. No whole-file
partition can model a shorter longest shard than that weight. The aggregate
work bound over all 132 refreshed files and 28 Linux workers is 35.7 minutes.
The next three weights are
*tests/property/m5-compound-assignment.property.test.ts* at 1,838 seconds,
*tests/property/m5-array-sort-stability.property.test.ts* at 1,637, and
*tests/property/m5-proxy-exotic-object.property.test.ts* at 1,559.

Run [39076279469] at `b59ac914` is the first CI run of the refreshed
partition, and *ci-39076279469.json.txt* retains its observations. Its
Linux maximum measured 46.52 minutes against 47.77 for run 39070198868,
which ran the superseded partition. The 3.2-minute modeled gain above did
not appear, and 1.25 minutes is inside the variation these two runs show.

The reason is that a derived weight is not reproducible between runs.
Across the 132 files, only 53 on Linux and 59 on macOS land within 20
percent of their value two hours earlier; Linux ratios span 0.50 to 1.80
and macOS 0.46 to 3.34. What is stable is the aggregate and the extremes:
Linux totals moved 0.951 times and macOS 1.032, and
*tests/property/m5-globalthis-binding.property.test.ts* measured 2,647
then 2,750 seconds on Linux. A weight sums a file's cases as they ran
concurrently with whatever else shared the job, so it moves with the
neighbors a partition happens to give it. The 0.26-to-3.59 range against
the superseded table therefore mixes real corpus growth with this
variation and is not evidence of drift alone.

The partitioning rule is sound in both runs. Replaying run 39076279469's
partition with its own case sums in observed order matches all seven walls
within 0.68 minutes, as the earlier run matched within 0.53.

The table choice barely matters while one file sets the maximum. Scored
against both runs' observed costs, the partition chosen from run
39070198868, the one chosen from run 39076279469, and the one chosen from
a maximum over both all give the same 45.8-minute worst case; only the
superseded partition is worse, at 47.3. Restoring a two-run maximum would
change no partition decision. Case-sharding
*tests/property/m5-globalthis-binding.property.test.ts* is the one change
that can lower the Linux maximum, and it is the next unit.

*tools/native-shard-costs.ts* now derives from main run [39070198868] at
`c78d9df1`, which observed all seven Linux and all twelve macOS file
shards under one set of toolchain pins, Node.js 24.21.0 and Deno 2.9.7.
*ci-39070198868.json.txt* retains its measured case durations. Each
refreshed entry is that file's summed case milliseconds divided by 1,000
and rounded up. `python3 docs/evidence/u6/summarize.py` derives the same
weights internally and reproduces *model.txt*; it does not read or check
the TypeScript table, which was compared against its derivation by hand.
The refresh covers 132 files per host. The two entries in
`caseShardedNativeFiles` keep their older values, because CI excludes
those files from the file shards and this run did not observe them there.

The superseded table was stale file by file rather than uniformly. Across
both hosts its entries range from 0.26 to 3.59 times the refreshed weight
for the same file, the extremes being
*tests/property/m5-import-attributes.property.test.ts* on Linux and
*tests/property/m5-math-namespace.property.test.ts* on macOS.

Replaying this run's own partition in its observed file order gives a
47.3-minute longest shard against 47.8 measured, with per-shard
differences of 0.38 to 0.53 minutes; *model.txt* carries all seven.
`selectNativeTestShard` already simulates each shard's workers and assigns
a batch to the shard with the shortest modeled completion, so this replay
is evidence that stale weights, not the partitioning rule, produced the
error. One run's agreement does not establish the model across runs.

Two limits apply. The refresh replaces a maximum over two historical
observations with a single newer observation, so it provides no estimate
of run-to-run variation and the weights are not conservative bounds.
Second, the hosts are not comparable across sources: over the 132
refreshed files, total weight falls 18 percent on macOS and rises 10
percent on Linux, or 16 and 9 percent over the complete tables. The
superseded macOS figures were measured on hosted runners, most macOS file
shards now run on Mac lanes, and this run's macOS jobs ran at three, six,
nine and twelve workers, which also changes how much concurrent time a
case accumulates. Per-job median ratios of refreshed to superseded weight
range from 0.55 to 1.42 with no monotone relationship to worker count.
These observations do not separate hardware, concurrency, file cohort and
implementation change.


Exceptions to the current table
-------------------------------

The current weight-source runs above observed two families before later
changes grew them. Only these four entries override that upstream table;
all other refreshed weights, including compound assignment at 1,838 Linux
and 1,242 macOS seconds, remain intact. None of the four changes file
inventory, seeds, case budgets, sizes, shard totals or interrupt limits.

### Destructuring assignment

The iterator-next-callability extension grows the existing destructuring
assignment family. Run 39070198868 sums its two recorded registrations to
210,558.734682 milliseconds on Linux and 127,460.293458 on macOS; those
baseline observations remain in the complete CI input and do not measure
the extended family.

CI run [39473400560] at `3170ba94` measures the extended family on both
hosts. Job `native support (linux-x86_64-gnu, 4/7)` records six case
durations summing to 1,219,306.454043 milliseconds, rounded up to the
1,220-second Linux weight; job `native support (macos-aarch64, 1/12)`
records six summing to 605,363.979249 milliseconds, rounded up to 606 on
macOS. Both sums include every registration of the file, as the source
run's do. They are concurrent case sums from one run, not job or file
wall times, and they are not conservative bounds.

The inputs are retained outside the repository under
*/data/oseo-m5c-reviews/*: the run metadata
*iterator-c1-ci-complete.json*, the log archive *iterator-c1-ci-logs.zip*,
the U8 registration index *iterator-c1-ci-test-names.json*, and the
extracted *iterator-c1-ci-extracted.json*. Rerunning
*docs/evidence/u6/extract-ci.py* at `30dab254` on the first three, with
run ID `39473400560`, reproduces the fourth byte for byte. These values
replace the earlier local Linux observation of 916,409.436758 milliseconds
and its provisional 987-second macOS estimate from the historical 198/184
host ratio; the CI observation measures macOS directly.

[39473400560]: https://github.com/dahlia/oseo/actions/runs/39473400560

### Object binding

The `destructuring-binding-target-order` node adds two native
registrations to *tests/property/m5-object-binding.property.test.ts*.
Run 39070198868 measured the earlier file at 131 Linux and 122 macOS
seconds. On October 21, 2026 a local Linux single-file extended run at
`4be1c732` (tree `084bb54e`) executed

~~~~ sh
mise run test:property:extended:native:shard \
  --shard 1/1 tests/property/m5-object-binding.property.test.ts
~~~~

with the task's unchanged `OSEO_PROPERTY_RUN_SCALE=10`,
`OSEO_PROPERTY_SEED=1592590339` and `OSEO_PROPERTY_SIZE=large`, one file
worker, `MISE_JOBS=1`, and no CPU quota. All five registrations passed:

 -  `object binding model checks nullish inputs before computed keys`:
    0.78685 milliseconds;
 -  `generated object bindings match the M5 property model`:
    87,772.211719 milliseconds;
 -  `with keyed binding model resolves before GetV and the default`:
    0.61342 milliseconds;
 -  `a minimized with keyed case reports forced collections`:
    1,424.412803 milliseconds; and
 -  `generated with-scoped keyed bindings match the M5 property model`:
    145,501.326048 milliseconds.

Their sum is 234,699.350840 milliseconds, rounded up to the 235-second
Linux weight; excluding the two model tests would not change it. This is
one local observation of a file running alone, not a CI measurement, file
wall time, or ordinary property cost, and it estimates no variation. The
raw output, timestamps and exit status are retained outside the
repository under
*/data/m5c-destructuring-binding-target-order/cost-refresh-20261021/*.

The scheduling table was edited after the wrapper selected this single
file and before the measurement ended. The HEAD, property file, and
native implementation stayed unchanged; the final working tree had one
modified scheduling file. These durations cover the selected file and
do not establish a clean-tree gate for the final scheduling table.

The current macOS cost of this file is unmeasured. Its 219-second weight
is the provisional estimate `ceil(235 * 122/131)`, using the file's own
host ratio in run 39070198868. It is not a Mac observation, pass, or
bound, and must be replaced with an actual macOS CI case sum.


Inputs and reproduction
-----------------------

*ci-36243816479.json.txt* and *ci-36261458909.json.txt* retain observed job
elapsed seconds, observed runtime-archive cold/warm state, measured individual
native case milliseconds, measured native runner milliseconds, and measured
test262 runner summaries. Sources are
main runs [36243816479] at `00153abe` and [36261458909] at `c9b3cc80`.
The measured reviewed count is 21,383 in each run. Native property inventories
are measured at 127 and 128 files, respectively. No manifest is regenerated.

*ci-36343919872-linux-1.json.txt* retains the interrupted branch job's measured
case durations, conclusion, counts, reported command/marker/failure timestamps,
and reported interruption-example count. Its scope is that one failed Linux
job, not the whole run. The historical compact inputs were regenerated with the
same extractor schema, including native counts and package-to-native intervals;
their case durations and the checked-in scheduling weights are unchanged.

The single-job input was produced from run metadata filtered to completed job
`108689202335`, retaining `headSha`. Its log was fetched with:

~~~~ sh
gh api --allow-escape-sequences \
  repos/dahlia/oseo/actions/jobs/108689202335/logs > job.log
~~~~

It was packaged as ZIP member *1\_native support (linux-x86\_64-gnu, 1\_4).txt*;
the extractor received that filtered metadata and single-entry archive with run
ID `36343919872` and the registration index for `e98edd15`. This avoids
requesting unfinished jobs or the unavailable run-level archive.

Fetch the source API and log archive with:

~~~~ sh
gh run view RUN --repo dahlia/oseo --json headSha,jobs > jobs.json
gh api repos/dahlia/oseo/actions/runs/RUN/logs > logs.zip
~~~~

The historical title index is produced by the existing U8
*docs/evidence/u8/test-names.mjs.txt* helper at each run's `headSha`, as
specified in *docs/evidence/u8/README.md*. *extract-ci.py* matches case titles
only within the exact historical selected property file set and fails on an
ambiguous match or a file with no observations. It never executes test sources.

~~~~ sh
python3 docs/evidence/u6/extract-ci.py RUN \
  jobs.json logs.zip names.json > ci-RUN.json.txt
python3 docs/evidence/u6/summarize.py
~~~~

*model.txt* preserves the latter command's derived/estimated output. Summed
case milliseconds divided by 1,000 are derived per-file scheduling weights,
not measured subprocess lifetimes. Historically
*tools/native-shard-costs.ts* kept the larger derived sum for each
file/host across the two runs named above; the current table instead takes
one run's sum, as the section on the current weight source records. Unknown
files use the upper median of that host's table. Run-varying costs are
outside canonical evidence, and no expected classification changes.

The test262 CI runner reports only aggregate duration, pool size, retries, and
classification counts. Its per-path CI distribution is unmeasured. U10's
local Linux native-execution sums for three detached-buffer paths are retained
in *docs/evidence/u10/new-metrics.json.txt*; they are neither CI path wall times
nor measured macOS weights, so U6 does not extrapolate them into a path table.

Three groups of entries were estimates or single-file measurements under
the superseded table: *tests/property/m5-array-sort-stability.property.test.ts*
from run 37884543813, the import-attributes family from an October 10, 2026
local Linux observation scaled by ten, and the class constructor
early-error family from an October 12, 2026 local Linux extended run. Run
39070198868 measures all three on both hosts, so none of them remains an
estimate and the reasoning that produced those values is superseded. Their
history is in this file's Git log.

M5c node `array-tolocalestring-arguments` adds fixed and generated locale
argument tests to *tests/property/m5-array-prototype-copying.property.test.ts*.
A local Linux whole-file extended run on 2026-10-22 at source `28d30410`
(tree `5777b8cb`) naturally exited zero with all four registrations passing
and none skipped. Their printed leaf durations were 162,487.199058,
0.866493, 15,456.485224, and 154,482.44049 milliseconds, for the existing
generated domain at seed `0x60004700`, the locale model unit test, the fixed
locale case, and the new generated locale domain at seed `0x60004701`. The
sum is 332,426.991265 milliseconds; rounding its seconds up gives the Linux
weight of 333. Build-tool durations are excluded. This is one local
case-duration sum, not a native CI or whole-suite result. The separate
process wall time was 333.811043 seconds.

The command was `mise run test:property:extended:native:shard --shard 1/1`
with this exact property file. It retained task scale 10, seed 1592590339,
size `large`, one file worker, and the existing per-domain budgets and
limits. The capacity profile was `generous` (`desktop-idle`), with no CPU
quota and a 104G memory cap. The source HEAD and tree were clean before and
after the run; the property digest was
`b1c712195b8033f989b676d5d87964e3127776ebb991cda290b686818269db46`. The
raw result, stdout, stderr, and duration lines are retained under
*/data/m5c-array-caller-promise-finish-20261022/*.

macOS remains unmeasured. Its weight of 347 is explicitly provisional:
`ceil(333 * 339 / 326)`, using this file's measured host ratio in run
39070198868. These replace the earlier provisional weights of 655 Linux and
681 macOS seconds, which scaled that run's weights by an earlier local ratio.
Replace the macOS estimate with an actual matching-host case sum when
available. This measurement establishes no final candidate CI or full
test262 UPDATE result and changes no case budgets, seeds, deadlines, or
shard totals.

The newer main run [36312192623] at `af9bb68c` is retained as the closest
before-run comparison.
`git diff af9bb68c 86228614 -- packages tests tools .github mise.toml` is empty
at the branch base `86228614`; all intervening changes are documentation. This
source uses the same Node.js 24.21.0 and Deno 2.9.7 pins as the experiment,
whereas the two weight-source runs use Node.js 24.18.0 and Deno 2.9.2. Its
measured inventory is the same 21,383 paths and 128 property files.
*ci-36312192623.json.txt* retains its observations; *summarize.py* replays
it, and at the time derived weights from only the two older runs. It now
derives them from run 39070198868 and replays all three historical runs.
Weights are not tuned to this comparison or to the after run.

The observed `objectsBuilt` counter is 96 to 128 per ten-way test262 shard
in the three retained main runs, with a derived sum of 1,117 per target per run.
Every counter is in the compact inputs. This measures current harness-object
preparation counts, not their macOS wall cost or their growth at 41,091 paths.
The first branch run retains these counters too: the derived target sum
is 1,312, an increase of 195 objects per target. Repeated preparation from
raising totals stays visible instead of being treated as fixed setup alone.

This additional replay estimates macOS execution max/sum at 50.81/295.62
minutes with positional assignment and 44.31/286.23 with the selected batch
partition, an estimated sum change of -9.39 minutes. Linux's corresponding
estimates are 64.17/226.97 and 58.58/215.37, a sum change of -11.60 minutes.
The same contention and cache limitations apply. Its derived observed job
max/sum is 51.43/306.93 macOS native minutes and 34.50/296.68 macOS
test262 minutes; these are further before observations, not improvements.

*summarize.py* also separates each family's job sum from its reported runner
sum. The derived difference is time outside that runner interval, including
setup, builds, package evidence on native shard one, input loading, and the
reporting tail. It is not an isolated fixed-cost measurement: test262's
canonical manifest parsing grows with the corpus. The baseline's separately
derived F remains the input to the extra-job projection. Archive cold/warm
observations are retained per job; Zig cache warmth is not established by
these runner summaries, and no cache hit is credited as an improvement.

[36243816479]: https://github.com/dahlia/oseo/actions/runs/36243816479
[36261458909]: https://github.com/dahlia/oseo/actions/runs/36261458909
[36312192623]: https://github.com/dahlia/oseo/actions/runs/36312192623


Model and decision
------------------

The native model simulates Node's file slots: start the next file on the first
available slot, add its summed case seconds, and take the maximum slot load.
Model widths are fixed at three for macOS and four for Linux, matching the
baseline hosted runner capacities. They do not change the actual concurrency
policy. A batch contains that many files, ordered by descending weight then
path; it goes to the shortest modeled shard, breaking ties by shard index.
Within each shard expensive files start first. Cost-sharded execution uses
Node's `run({ files })` API, because its CLI sorts file arguments again.
The wrapper logs the selected files and actual worker count for CI audits.
Every input appears once.

The first branch experiment interrupted Linux own-key at its unchanged
property deadline. The [failed-run analysis](./failed-branch-run.md) preserves
its measured durations, incomplete budget, and concurrent-file placement.
The corrected Linux candidate reserves a singleton first shard for own-key
when the total exceeds one and raises CI's total from four to five; four
cost-batched shards still execute every remaining file. A singleton uses one
file worker. macOS assignment and totals remain unchanged by the correction.

The positional replay estimates macOS tails of 67.13/50.73 minutes versus
observed job elapsed times of 68.13/51.58 minutes in the two source runs.
Its estimated summed execution is 298.45/273.89 minutes. The differences
include setup, build, file initialization, package evidence on shard one, and
reporting. Individual cases were measured concurrently; changed contention can
change their costs. These estimates do not prove a CI speedup or savings.

All following figures are derived/estimated minutes from those two run logs,
listed in run order 36243816479/36261458909:

| Native option | macOS execution max | macOS execution sum | Change in execution sum | Added macOS fixed cost |
| ------------- | ------------------- | ------------------- | ----------------------- | ---------------------- |
| Positional 12 | 67.13/50.73         | 298.45/273.89       | 0/0                     | 0/0                    |
| Plain LPT 12  | 59.42/42.98         | 321.86/284.07       | +23.42/+10.19           | 0/0                    |
| Batch 12      | 59.42/42.98         | 293.19/264.69       | -5.26/-9.20             | 0/0                    |
| Batch 13      | 59.42/42.98         | 295.98/266.01       | -2.47/-7.88             | +1.00/+0.95            |
| Batch 14      | 59.42/42.98         | 296.49/269.45       | -1.96/-4.43             | +1.99/+1.89            |

The fixed cost uses the baseline's derived macOS mean F of 59.82/56.81 seconds
per job. The native corpus is independent of reviewed test262 path count, so
these native estimates remain the same at 41,091 paths under the plan's
held-family assumption. Raising totals does not reduce the modeled native
maximum, because one expensive file remains indivisible. Plain LPT puts cheap
files beside each shard's expensive work and wastes parallel slots; its modeled
macOS workload increase fails the few-minute budget. Batch 12 is selected.

Linux's derived file-sum min/median/p90/max is
0.20/349.97/711.21/3,286.29 seconds in run 36243816479 and
0.28/349.12/722.84/3,326.07 in run 36261458909. macOS's corresponding
figures are 0.15/307.99/669.71/3,565.12 and
0.10/274.57/681.93/2,578.70 seconds. These are derived distributions of
measured case sums, not isolated file latencies. All files and cases are in the
compact inputs; all shard replays and Linux higher-total options are in
*model.txt*. At unchanged Linux total four the batch model estimates
55.44/58.37 minute maxima versus positional 85.52/86.30, with estimated
execution sums falling by 13.48/15.39 minutes.


Test262 options and timeout margin
----------------------------------

All following estimates use the baseline's measured job timestamps, derived
mean F, and constant residual rates. Repartitioning can change the workload
mix and cache costs, so raising totals does not guarantee the listed maximum.
The 41,091-path model assumes unchanged classification and variant mix.

| Test262 option        | Current macOS job max min | 41,091-path macOS job max min | Added macOS fixed min |
| --------------------- | ------------------------- | ----------------------------- | --------------------- |
| Positional 10         | 43.93/45.83 derived       | 82.72/86.78 estimated         | 0/0                   |
| Ideal cost balance 10 | 32.61/32.04 estimated     | 61.69/60.82 estimated         | 0/0                   |
| Positional 12         | 36.78/38.35 estimated     | 69.10/72.47 estimated         | +1.99/+1.89           |

Ideal cost balance assumes divisible work with no scheduling overhead; it is
an optimistic bound, not an implementable result from the available logs.
Raising totals estimates max as `F + (oldMax - F) * 10 / 12`; full-corpus
projection uses the baseline's slowest residual rate of 1.193/1.253 seconds
per path. Linux derived ten-shard maxima from observed job timestamps are
25.40/24.97 minutes; its job and runner durations for every shard remain in the
compact inputs. No cross-host cost substitution is used.

Current test262 workload is derived at 326.08/320.40 macOS minutes; the
41,091-path projection is 616.75/608.03 minutes at the baseline's
0.886/0.874-second family rates. Twelve jobs add only the fixed increments
above under this constant-work model. The ten-job worst projection still
leaves a derived 33.22-minute margin against the 120-minute timeout, so U6
raises the total to twelve for more margin as the corpus doubles. The least
favorable derived twelve-shard estimate leaves 47.53 minutes, an increase of
14.31 minutes of margin for 1.89 minutes of fixed cost from run 36261458909.
The initial combination was batch native assignment at unchanged totals plus
twelve test262 shards on each target. The Linux correction above supersedes
that platform's native total; it adds no macOS job. The estimated macOS native
execution saving offsets the added macOS fixed cost. Extra harness preparation
and cache effects are unmeasured; the corrected CI observation below compares
combined native/test262 workload against the few-minute limit.

Across all macOS families, the measured baseline's derived sums are
795.45/764.12 minutes at the current count and the plan projects
1,086.12/1,051.74 at 41,091. With five macOS slots the corresponding derived
wall lower bounds are 159.09/152.82 and 217.22/210.35 minutes. Applying only
the batch-12 estimated execution deltas gives estimated workloads of
790.19/754.92 and 1,080.86/1,042.54, and wall lower bounds of
158.04/150.98 and 216.17/208.51 minutes. These native-only bounds remain
workload-bound. The selected combination adds two test262 shards, giving
estimated workloads of 792.18/756.81 and 1,082.85/1,044.43 minutes, with lower
bounds of 158.44/151.36 and 216.57/208.89. The added fixed cost raises each
native-only bound by a derived 0.40/0.38 minutes. Tail control does not promise
an equivalent end-to-end wall reduction; raising totals is timeout insurance.


Validation and CI experiment
----------------------------

Native coverage tests partition the actual property file inventory, include
an unknown file, check disjointness and union equality, and verify independence
from input order. The test262 checked-in manifest test does the same union and
disjointness checks at CI's raised total twelve. Empty native partitions never
launch Node's default discovery, which would otherwise repeat the full suite.

Local correctness gates used
`ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-shard-sizing MISE_JOBS=1`.
At the first commit, `mise run check` passed, `mise run test` observed
1,394 Node passes, zero failures, five skips, two existing sanitizer TODOs,
and 21,383/21,383 test262 paths, and `mise run test:property:extended`
observed 224 native passes. After the Linux correction, the extended gate
again observed 224 passes, zero failures/skips/TODOs in 3,138.99 seconds.
The focused
`node --test tests/native-shard.test.ts tests/native-test-workers.test.ts`
command observed fourteen passes, including the wrapper's generated signal
tests. The corrected full `mise run test` exited zero in 5,668.60 seconds: Node
reported 1,403 tests, 1,396 passes, zero failures, five skips and the same two
TODOs; native fixtures matched 264/264 outputs and 265 cross-target builds
passed; test262 reported 21,383/21,383 paths with the unchanged
classifications, pool eight, and zero retries. Its local test262 objects were
reused (172 reused, zero built). These timings and cache observations are
correctness-gate context, not isolated scheduling improvements. Final
`mise run check` passed in 65.87 seconds. Independent Claude Fable 5.1 review
ended with `No issues found.` before the corrected implementation commit
`30dab254`. The explicitly authorized second branch run [36358067906] passed
all 58 jobs. The first branch experiment 36343919872 failed its Linux property
deadline and has incomplete generated work. Every native-support/test262 CI
shard and its archive state is retained below.

The completed failed experiment's full retained input is
*ci-36343919872.json.txt*. *first-branch-comparison.md* retains every native
support/test262 shard on both hosts against the closest before run, plus the
other macOS job durations and full-workload lower bound. Reproduce its tables
with *compare-ci.py* and the two compact inputs; all aggregates are derived
from measured durations/counters. The first-run Linux interruption prevents a
complete verdict, despite unchanged selected-file unions and path counts.

The [corrected-run comparison](./second-branch-comparison.md) retains every
shard from all three comparison runs. Its derived macOS native/test262 job
maxima from observed timestamps are 34.35/31.67 minutes, versus 51.43/34.50
before; derived combined macOS workload is 556.68 versus 603.62 minutes. All
macOS jobs sum to a derived 731.40 versus 778.12 minutes, with five-slot wall
lower bounds of 146.28 versus 155.62. This is one corrected run; variance and
cache effects are not separated. The same macOS own-key cohort varies by a
derived 11.80 case-minutes across branch observations. Linux singleton own-key
passes its unchanged budget in 41.36 measured case-minutes, leaving a derived
18.64-minute deadline margin. The full retained input is
*ci-36358067906.json.txt*; *macos-job-times.json.txt* retains the other macOS
job timestamps and complete workload denominator.

The macOS own-key assignment retains a deadline risk. Run 36243816479
measured that case at 3,565,117 ms, leaving a derived 34.88-second margin
against its configured 3,600-second extended deadline. The new macOS cohort
places it with reflect-namespace and proxy-exotic-object at three file workers.
Both branch observations passed, at measured case durations of 45.07 and
33.27 minutes, but their derived 11.80-minute spread exceeds that historical
margin. Those observations do not establish that this cohort preserves the
margin under runner variance. This documentation-only integration retains the
reviewed partition; a macOS singleton reservation remains a possible follow-up
if the coordinator authorizes changing the implementation and validating it.
U19 later moved the own-key file into three case-shard jobs on each host;
see the case-sharding section of [*PLAN-GATE.md*](../../../PLAN-GATE.md).

The final evidence-only `mise run check` also passed in 64.98 observed seconds
with the assigned Zig cache and `MISE_JOBS=1`; this is gate context, not a
performance measurement.

A complete local Linux `mise run test:property:extended` run on 2026-10-15
measured a summed case duration of 1132.411863192 seconds across all nine
registrations in *tests/property/m5-globalthis-binding.property.test.ts*.
The Linux weight is 1133 seconds, rounded up from that sum. The macOS weight
is also 1133, an explicitly unmeasured provisional estimate reusing the local
Linux sum, without a guaranteed conservative bound. These are not CI
measurements or file wall times. Replace both entries with actual native
CI case sums when available, including a fresh macOS observation. This
update changes no case budgets, seeds, deadlines or shard totals.

The `compound-member-assignment-key-order` node adds slot `0x60000c01` and
fixed native cases to *tests/property/m5-compound-assignment.property.test.ts*.
A local Linux single-file extended run on 2026-10-15, with the extended task's
`OSEO_PROPERTY_RUN_SCALE`, `OSEO_PROPERTY_SEED`, and `OSEO_PROPERTY_SIZE`
values, first measured 482.918 seconds across its seven registrations, of
which the five native registrations summed 482.916 seconds; that set the
earlier 483-second weight. Within a later local Linux
`mise run test:property:extended` on a candidate tree based on main
`6214c68c` with this node's uncommitted repair applied, all seven
registrations of this file then present passed, and its five native case
durations summed 599.532 seconds while the host ran under CPUQuota=1400%,
nice 5 and MemoryMax=48G; that historical measurement first set the
600-second weight. The node later moved the original BigInt observable-key
case from *tests/native/fixtures/bigint.ts* into this file as an eighth,
native fixed registration, with a reference-only console prelude. Within a
later local Linux `mise run test:property:extended` on a candidate tree based
on main `9e78357d` with the uncommitted repair (raw diff `03311b88`), all
eight registrations of this file passed, and its six native case durations
summed 599.822 seconds under the same CPUQuota=1400%, nice 5 and
MemoryMax=48G. These record this file's measurements only, not the outcome
of either whole run. The Linux weight stays 600 seconds, rounded up from the
later sum; the two model-only registrations, 0.833 and 0.672 milliseconds,
are not counted.
The macOS weight is also 600, an explicitly unmeasured provisional estimate
reusing the Linux value. Neither is a CI measurement, a file wall time, or an
isolated-file latency; replace both with native CI case sums when available.

The `parenthesized-assignment-function-name` node adds slot `0x60000c02`, a
native registration with ten ordinary cases, and one model-only registration to
*tests/property/m5-compound-assignment.property.test.ts*. On 2026-10-20 UTC a
focused local Linux x86-64 ordinary run of that registration alone, selected
by `--test-name-pattern=parenthesized` with a warm lane Zig cache, measured
7.981 seconds.

A local Linux x86-64 whole-file extended run at clean result
`a9cbe8cd68c58858afb65ea3a8e56f2da14bf234` naturally exited zero with all
ten registrations passing and none skipped. Their exact printed leaf
durations sum to 576282.402279000 milliseconds (576.282402279 seconds),
giving a Linux weight of 577 seconds after rounding up. This includes
model-only registrations and excludes build and plugin timing. The separate
process wall time was 577.672844 seconds.

The run kept task scale 10, seed 1592590339, size `large`, one file worker,
and the existing budgets and interrupt limits. The clean HEAD, tree and
property SHA-256 matched before and after execution. The property digest
was:
`8519ee57473b05d14a4f0816aceb522bac0068b18be7555815cef8bd31f7d5f6`.

Raw result, stdout, stderr and exact timing tokens remain under:
*/data/oseo-m5c-reviews/parenthesized-function-name-focused-extended1/*.

macOS remains unmeasured. Its modeled weight is 390 seconds,
`ceil(577 * 1242 / 1838)`, using the pre-Parent whole-file host weights in main
`dc1a00d9`, rather than the provisional 1,918/1,322 weights. This is one local
Linux case sum and an unmeasured macOS model, not final native CI, a
whole-suite result, or a full UPDATE. No case budget, seed, deadline or shard
total changes.

The `typed-array-construction-order` node adds slot `0x60006e01`, one fixed
native registration, one reference-only registration, and one compile-only
structural registration to
*tests/property/m5-typed-array-constructors.property.test.ts*. A local Linux
whole-file extended run on 2026-10-20 at source `dd61722a` naturally exited
zero with all five registrations passing and none skipped. Their printed
leaf durations were 259,680.754467, 989.162278, 11.824009, 21,001.860632,
and 240,342.915425 milliseconds. The sum is 522,026.516811 milliseconds;
rounding its seconds up gives the Linux weight of 523. Build-tool durations
are excluded. This is one local case-duration sum, including the reference
and structural registrations, not a native CI or whole-suite result. The
separate process wall time was 523.791058 seconds.

The command was `mise run test:property:extended:native:shard --shard 1/1`
with this exact property file. It retained task scale 10, seed 1592590339,
size `large`, one file worker, and the existing per-domain budgets and
limits. The capacity profile was `generous` (`desktop-idle`), with no CPU
quota or memory cap. The source HEAD, tree, clean worktree, and property
SHA-256 were identical before and after the run; the property digest was
`69e2c66eb0aac37433d468e3f330f6b7a7f0043fbebf55ce2bb5fae83390f322`.
The raw result, stdout, stderr, and duration lines are retained under
*/data/oseo-m5c-reviews/typed-array-construction-order-focused-extended1/*.

macOS remains unmeasured. Its weight of 225 is explicitly provisional:
`ceil(523 * 298 / 694)`, using this file's earlier measured host ratio in
run 39070198868. These replace the earlier provisional doubled weights of
1,388 Linux and 596 macOS seconds. Replace the macOS estimate with an actual
matching-host case sum when available. This measurement establishes no
final candidate CI or full test262 UPDATE result and changes no case
budgets, seeds, deadlines, or shard totals.

The TypedArray search-and-join property file now includes fixed and
generated toLocaleString element-argument coverage alongside its existing
search, join, and mutation cases.

A local Linux x86-64 whole-file extended run at clean source
`47d2d685fd3b06f0adb98bd96bec7d82df2bfac9` naturally exited zero with all
five registrations passing and none skipped, cancelled, or failed. Their
exact printed leaf durations sum to 285353.510650000 milliseconds
(285.353510650 seconds), giving a Linux weight of 286 seconds after rounding
up. That sum excludes build and plugin timing. The separate process wall
time was 286.831809 seconds.

The run kept task scale 10, seed 1592590339, size `large`, one file worker,
and all existing budgets and interrupt limits. Clean HEAD, tree, and
property SHA-256 matched before and after execution. The property digest
was:
`3090fae024d2e6736c5d3694cc911074d1af56ea308b866da326196ead3173f9`.

Raw result, stdout, stderr and exact timing tokens remain in
*/data/oseo-m5c-reviews/*, under
*typed-array-tolocalestring-arguments-focused-extended1/*
and its *actual-47d2d685/* child directory.

macOS remains unmeasured for this source. Its provisional weight is 135
seconds, the ceiling of the rounded Linux weight 286 times 174/369. That
ratio comes from the prechange file weights (macOS 174, Linux 369) in CI run
39070198868 at c78d9df1, as recorded by the checked-in table header. It
models the changed file from the earlier host ratio; it is neither a current
macOS measurement nor a conservative upper bound. Replace it with an actual
matching-host CI case sum when available. This is one local Linux whole-file
case sum, not final candidate CI, the fixed native fixture run, a
whole-suite gate, or a full UPDATE. No case budget, seed, deadline, or shard
total changes.

The `typed-array-feature-admission` node adds slot `0x60006e02`, its
compile-free oracle registration, and the fixed `typed-array-float16` native
fixture. The new generated domain keeps the family's 12-case ordinary
budget, both specialization policies, and forced collection. Until this
node's measurement, the file kept the weights above, 523 Linux and 225 macOS
seconds, which describe the pre-Float16Array file at source `dd61722a`.

A first local Linux whole-file extended run of this file at source
`e911ff73` exited 1 after 536.077 seconds of process wall time: six of its
seven registrations passed, and the generated Float16Array conversion
registration failed on a native Number formatting counterexample. That run
produced no accepted case sum and set no weight. Its raw result, stdout, and
stderr are retained under
*/data/oseo-m5c-reviews/f16-on-typed-R-focused-extended1/*.

The repair changed the shared shortest-decimal formatter. It added slot
`0x60004901` to *tests/property/m5-number-prototype.property.test.ts*: powers
of two and their one-ulp neighbors across the binary16, binary32, and
binary64 exponent ranges, checked against an independent exact BigInt
Number::toString oracle, with a 16-case ordinary budget. The existing
`0x60004900` domain, the Float16Array property, and every other domain keep
their draws, seeds, budgets, and limits.

At clean source `9085fef649cb3d034a589a7cd6bc528587255b20`, tree
`81497a11ffd3ad336866b9c8a617a388b3dddb4e`, both files were then run on local
Linux x86-64, each once through
`mise run test:property:extended:native:shard --shard 1/1` with that exact
property file. Each run kept task scale 10, seed 1592590339, size `large`,
the default Zig toolchain, one file worker, and the existing budgets and
interrupt limits. The capacity profile was `generous` (`desktop-idle`), with
no CPU quota or memory cap. Both exited zero naturally, with every
registration passing and none failed, skipped, or cancelled. The source HEAD,
tree, clean worktree, and the SHA-256 of each property file and runner were
identical before and after each run.

In *tests/property/m5-typed-array-constructors.property.test.ts* the seven
printed leaf durations were 238,215.316583, 1,121.824991, 14.123737,
20,937.132678, 260,192.567362, 0.981388, and 137,356.727887 milliseconds.
Their sum is 657,838.674626 milliseconds, so the Linux weight is 658 seconds
after rounding up. The property digest was
`ef8f8b1f2d88099bbbcd0ae35de4953f4a932f3242e6503a3a2b59909e3ee20d`.

In *tests/property/m5-number-prototype.property.test.ts* the two printed leaf
durations were 268,059.162287 and 146,054.989313 milliseconds. Their sum is
414,114.151600 milliseconds, so the Linux weight is 415 seconds after
rounding up. The property digest was
`30ca2e403cd207593193dd8fcc1e07aab2793d3b6750166740676c7a557b0ae0`.

The constructor sum includes its reference-only, compile-only structural,
and oracle registrations. Both sums exclude build, setup, and plugin timing.
They are not file wall times: the separate process wall times were 659.230165
and 415.788884 seconds. The raw result, per-file stdout and stderr, and
duration lines are retained in *run-actual-9085-20261021T0318/* under
*/data/m5c-f16-fixed-657-whole-file-measurement-preparation/*.

macOS remains unmeasured for both files. Their weights of 283 and 242
seconds are explicitly provisional, `ceil(658 * 298 / 694)` and
`ceil(415 * 544 / 936)`. Each ratio comes from that file's actual
complete-host case sums in run 39070198868 at `c78d9df1`, retained in
*ci-39070198868.json.txt*: the constructor file measured 693,527.437126
milliseconds on Linux and 297,143.357 on macOS, and the Number prototype
file 935,677.973483 and 543,173.108125. The table checked into that source
commit is superseded and was not used. Replace both macOS estimates with
actual matching-host case sums when available. These are local Linux case
sums and unmeasured macOS models, not native CI, a whole-suite result, or a
full test262 UPDATE. This update changes no case budgets, seeds, deadlines,
or shard totals.

The `regexp-pattern-extensions` property family now includes a native
generated dynamic group-name domain alongside its compiler model and pinned
identifier-table registrations.

A local Linux x86-64 whole-file extended run at clean composed source
`ef014905727a1a83e82677967cfa906fd2c09710` (tree
`cbf8c75cbdd325c7dea3aa231648d34a723765ac`) naturally exited zero with all
three registrations passing and none skipped, cancelled, or failed. Their
exact printed leaf durations are 72.050594 milliseconds for generated
pattern extensions, 1.14754 milliseconds for the group-name table, and
43021.130237 milliseconds for generated dynamic group names. They sum to
43094.328371000 milliseconds (43.094328371 seconds), giving a Linux weight
of 44 seconds after rounding up. That sum excludes build and plugin timing.
The Node test process reported 43310.739077 milliseconds; the mise task
finished in 44.63 seconds.

The run kept task scale 10, seed 1592590339, size `large`, one file worker,
and all existing budgets and interrupt limits. The branch was clean before
and after execution, and the property SHA-256 was:
`4ce4961db79a3d984d6da63cfb377831b370558e67244ee0986a41a46a190f8d`.

Raw result, stdout, stderr and exact timing tokens remain under:
*/data/m5c-regexp-computed-focused-prepare-20261023/logs/property-extended.log*.

macOS remains unmeasured. Its scheduling weight is the same 44 seconds as
Linux, solely as a Linux-based placeholder. The previous 1/1 entries
described the old compile-free-only file and provide no native host
calibration. This 1:1 choice is neither a measured host ratio nor a claimed
conservative upper bound. Replace the macOS placeholder with an actual
matching-host CI case sum when available. This is one local Linux case sum,
not final native CI, a whole-suite result, or a full UPDATE. No case budget,
seed, deadline, or shard total changes.

The `computed-member-reference-key-order` node adds slot `0x60000c03`, four
fixed native registrations, one native-only diagnostic registration, and one
model-only registration to
*tests/property/m5-compound-assignment.property.test.ts*. It also changes
the native oracle of slot `0x60000c00` without changing its generator or
budget. A local Linux x86-64 whole-file extended run on 2026-10-23 UTC, from
01:12:32 to 01:33:03, exited zero with all seventeen registrations passing
and none skipped. Their printed leaf durations sum to 1,229,239.865193
milliseconds (1,229.239865193 seconds), giving a Linux weight of 1,230
seconds after rounding up. That sum includes the model-only registrations
and excludes build timing. The new domain's generated registration took
360,068.256 milliseconds and its fixed Reference cases 225,203.202. The
earlier registrations took 637,876.904 milliseconds in sum, against the
576,282 of the previous whole-file measurement.

The command was
`mise run test:property:extended:native:shard --shard 1/1` with this exact
property file. It kept task scale 10, seed 1592590339, size `large`, one file
worker, and the existing per-domain budgets and limits. The capacity profile
was `generous` (`desktop-idle`), with no CPU quota and MemoryMax 104G. The run
used the node's uncommitted candidate on base `560162cd`. The property
SHA-256 matched the frozen copy before and after the run:
`1611ec44d2bbbb43f021f74e6d8b5a9ffa706ad7e597a0aa0d95e94159304ff0`.

An earlier validation run of the same command, from 00:51:11 to 01:12:06,
also passed all seventeen registrations, with a sum of 1,254,444
milliseconds. It started about eleven seconds before a behavior-neutral
lint refactor and a string split reached the file, so it does not set the
weight. The raw result, stdout, stderr, and duration lines of both runs
are retained under
*/data/m5c-computed-member-reference-key-order-20261023/impl/heavy/*.

macOS remains unmeasured. Its weight of 832 seconds is an explicitly
provisional estimate, `ceil(1230 * 1242 / 1838)`, the same host ratio the
previous 390-second estimate used. This is one local Linux case sum and an
unmeasured macOS model, not native CI, a whole-suite result, or a full
test262 UPDATE. The weight of *m5-update-expression.property.test.ts* is
unchanged: its program only prints one more slot. No case budget, seed,
deadline, or shard total changes.

The `eval-intrinsic-value` node keeps the existing
*m5-global-object-record.property.test.ts* family and its slots
`0x60003d00`, `0x60003d01`, and `0x60003d02`, with the same generators,
case counts, and interrupt limits. A local Linux x86-64 whole-file extended
run on 2026-10-23 UTC, from 03:45:25 to 03:59:00, exited zero with all four
registrations passing and none skipped. Their printed leaf durations were
177,835.926278, 1,223.549717, 236,254.023391, and 397,419.862621
milliseconds. Their sum is 812,733.362007 milliseconds (812.733362007
seconds), giving a Linux weight of 813 seconds after rounding up. That sum
excludes build, setup, and plugin timing. The test runner reported
813,032.25161 milliseconds. The mise task wall time was 814.80 seconds,
including the build dependency.

The command was
`mise run test:property:extended:native:shard --shard 1/1` with this exact
property file. It kept task scale 10, seed 1592590339, size `large`, one file
worker, and the existing per-domain budgets and limits. The capacity profile
was `generous` (`desktop-idle`), with no CPU quota and MemoryMax 104G. The
lock wait was 0 seconds. The source commit was
`c933f64d23b681b8f648b6d0bbc560e8904f845b`, tree
`50a09b2c467580d4162104bf674fea855e66fe66`, and the worktree was clean
before and after the run. The property SHA-256 matched before and after:
`8faabc37930c40ddae37ef5a20b63db81f686bd3a0da2596d2e0ec1820d81a16`.

The raw stdout, stderr, capacity, lock, and command log are retained under
*/data/m5c-eval-computed-focused-prepare-20261023/*. macOS remains
unmeasured. Its weight of 498 seconds is an explicitly provisional
historical-ratio model, `ceil(813 * 210 / 343)`, using the previous Linux
343-second and macOS 210-second entries; it is not a macOS observation.
This is one local Linux case sum and an unmeasured macOS model, not native
CI, a whole-suite result, or a full test262 UPDATE. It changes no case
budget, seed, deadline, or shard total. The computed-node weight of 1,230
Linux and 832 macOS seconds is unchanged.

[36358067906]: https://github.com/dahlia/oseo/actions/runs/36358067906
