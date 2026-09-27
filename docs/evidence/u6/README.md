U6 shard assignment evidence
============================

Inputs and reproduction
-----------------------

*ci-36243816479.json.txt* and *ci-36261458909.json.txt* retain observed job
elapsed seconds, observed runtime-archive cold/warm state, measured individual
native case milliseconds, measured native runner milliseconds, and measured
test262 runner summaries. Sources are
main runs [36243816479] at `00153abe` and [36261458909] at `c9b3cc80`.
The measured reviewed count is 21,383 in each run. Native property inventories
are measured at 127 and 128 files, respectively. No manifest is regenerated.

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
not measured subprocess lifetimes. *tools/native-shard-costs.ts* keeps the
larger derived sum for each file/host across the two runs, rounded up to whole
seconds. Unknown files use the upper median of that host's table. Run-varying
costs are outside canonical evidence, and no expected classification changes.

The test262 CI runner reports only aggregate duration, pool size, retries, and
classification counts. Its per-path CI distribution is unmeasured. U10's
local Linux native-execution sums for three detached-buffer paths are retained
in *docs/evidence/u10/new-metrics.json.txt*; they are neither CI path wall times
nor measured macOS weights, so U6 does not extrapolate them into a path table.

The newer main run [36312192623] at `af9bb68c` is retained as the closest
before-run comparison.
`git diff af9bb68c 86228614 -- packages tests tools .github mise.toml` is empty
at the branch base `86228614`; all intervening changes are documentation. This
source uses the same Node.js 24.21.0 and Deno 2.9.7 pins as the experiment,
whereas the two weight-source runs use Node.js 24.18.0 and Deno 2.9.2. Its
measured inventory is the same 21,383 paths and 128 property files.
*ci-36312192623.json.txt* retains its observations; *summarize.py* replays it
after deriving weights from only the two older runs. Weights are not tuned to
this comparison or to the after run.

The observed `objectsBuilt` counter is 96 to 128 per ten-way test262 shard
in every retained run, with a derived sum of 1,117 per target per run.
Every counter is in the compact inputs. This measures current harness-object
preparation counts, not their macOS wall cost or their growth at 41,091 paths.
The after run will retain these counters too, so repeated preparation from
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
The selected combination is batch native assignment at unchanged totals plus
twelve test262 shards on each target. The estimated native execution saving
offsets the added macOS fixed cost. Extra harness preparation and cache effects
are unmeasured; the single CI run must compare combined native/test262 workload
to verify the few-minute limit.

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

Local validation passed with
`ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-shard-sizing MISE_JOBS=1`:
`mise run check` passed; `mise run test` observed 1,394 Node passes, zero
failures, five skips and two
existing sanitizer TODOs, alongside complete execution of 21,383 test262
paths; `mise run test:property:extended` observed 224 native passes with zero
failures, skips or TODOs. These are correctness gates, not cold/warm timing
experiments or evidence of performance improvement. The single branch CI
experiment is pending. CI comparison
must retain every shard, compare each source job's archive cold/warm state,
and separate fixed setup from execution. One after run cannot separate runner
variance from improvement; the two historical runs also differ in source and
archive state, so their spread is not a pure hardware-variance measurement.
