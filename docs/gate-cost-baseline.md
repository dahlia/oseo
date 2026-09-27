Evidence gate cost baseline
===========================

Current CI baseline (observed 2026-09-27)
-----------------------------------------

The current baseline uses successful main runs [36243816479] and
[36261458909]. Their commits are `00153abe` and `c9b3cc80`, respectively.
Each has a measured reviewed count of 21,383 paths, read from that commit's
*tests/test262/results.yaml* by the command below. The measured path sets
in *tests/test262/subset.yaml* are identical; a derived comparison finds
33 classification promotions between the commits. Equal counts therefore
permit workload normalization, but do not establish identical execution work.

All current wall times are measured from GitHub job or step timestamps.
Sums, maxima, means, spreads, ratios, fixed-cost allocations, and normalized
rates are derived from those measurements. Table captions identify their
source runs; each row in the detailed tables identifies its source job.
Job times exclude queue waiting, include setup and cleanup, and are elapsed
runner minutes rather than billing-rounded minutes. The execution series
below uses step times, which exclude job setup and cleanup. No CI run was
triggered.

The coordinator's M5CI planning brief for this measurement task specifies a
ceiling of 628 macOS minutes and identifies its baseline source as main run
[35456667007] at `32ece7f4`. That commit's measured reviewed count is
20,841 using the count command below. The brief itself is not checked into
this repository. The baseline run's derived macOS family total is 629.52 min
from measured job timestamps, or 629 min when the aggregate is floored.
The brief's 628-minute ceiling is retained as the planning budget; its exact
value is not reproduced by rounding or flooring the preserved timestamps.
The measured source is preserved in the family table below.
The target is the measured inventory of 41,091 applicable paths recorded in
[*PLAN-M5C.md*](../PLAN-M5C.md) and reported by
`mise run check:test262-inventory`. Against that planning ceiling, neither
current run fits even at its measured smaller workload. Scaling test262
alone by path count would ignore fixed cost, classifications, runner spread,
and the separately measured property bottleneck.

[35456667007]: https://github.com/dahlia/oseo/actions/runs/35456667007
[36243816479]: https://github.com/dahlia/oseo/actions/runs/36243816479
[36261458909]: https://github.com/dahlia/oseo/actions/runs/36261458909

### Family costs and shard imbalance

Derived count/sum/max and max/mean from measured `startedAt`/`completedAt`
in `gh run view RUN --repo dahlia/oseo --json headSha,jobs` follow.
Each platform total sums only its listed families; Linux's separate `check`
and the platform-independent aggregation job are excluded. Windows is outside
this measurement. The `native support` family is the extended native property
file shards, plus extended package properties on its first shard.

Run 35456667007 at `32ece7f4`, derived minutes from its measured job
timestamps (20,841 measured reviewed paths):

| Host  | Family            | Jobs | Sum min | Max min | Max/mean |
| ----- | ----------------- | ---- | ------- | ------- | -------- |
| macOS | host C sanitizers | 2    | 63.65   | 34.35   | 1.08     |
| macOS | native            | 3    | 37.48   | 12.65   | 1.01     |
| macOS | native support    | 12   | 262.82  | 58.55   | 2.67     |
| macOS | test              | 2    | 39.30   | 37.05   | 1.89     |
| macOS | test262           | 10   | 226.27  | 25.12   | 1.11     |
| Linux | host C sanitizers | 1    | 63.02   | 63.02   | 1.00     |
| Linux | native            | 3    | 40.98   | 14.63   | 1.07     |
| Linux | native support    | 4    | 223.53  | 78.42   | 1.40     |
| Linux | test              | 2    | 33.45   | 32.42   | 1.94     |
| Linux | test262           | 10   | 140.78  | 18.08   | 1.28     |

Derived platform totals: macOS 629.52 min, Linux 501.77 min. Flooring each
macOS family's sum and maximum gives host C sanitizers 63/34 min, native
37/12 min, native support 262/58 min, test 39/37 min, and test262 226/25 min.
The sum of those floored family sums is 627 min; flooring the aggregate
separately gives 629 min.

Run 36243816479, derived minutes from its measured job timestamps:

| Host  | Family            | Jobs | Sum min | Max min | Max/mean |
| ----- | ----------------- | ---- | ------- | ------- | -------- |
| macOS | native support    | 12   | 310.20  | 68.13   | 2.64     |
| macOS | test262           | 10   | 326.08  | 43.93   | 1.35     |
| macOS | host C sanitizers | 2    | 75.00   | 40.07   | 1.07     |
| macOS | test              | 2    | 41.85   | 40.35   | 1.93     |
| macOS | native            | 3    | 42.32   | 16.50   | 1.17     |
| Linux | native support    | 4    | 235.75  | 86.23   | 1.46     |
| Linux | test262           | 10   | 192.40  | 25.40   | 1.32     |
| Linux | host C sanitizers | 1    | 64.82   | 64.82   | 1.00     |
| Linux | test              | 2    | 37.38   | 36.23   | 1.94     |
| Linux | native            | 3    | 39.10   | 14.73   | 1.13     |

Derived platform totals: macOS 795.45 min, Linux 569.45 min.

Run 36261458909, derived minutes from its measured job timestamps:

| Host  | Family            | Jobs | Sum min | Max min | Max/mean |
| ----- | ----------------- | ---- | ------- | ------- | -------- |
| macOS | native support    | 12   | 284.85  | 51.58   | 2.17     |
| macOS | test262           | 10   | 320.40  | 45.83   | 1.43     |
| macOS | host C sanitizers | 2    | 67.10   | 35.85   | 1.07     |
| macOS | test              | 2    | 46.18   | 43.15   | 1.87     |
| macOS | native            | 3    | 45.58   | 17.42   | 1.15     |
| Linux | native support    | 4    | 247.68  | 87.02   | 1.41     |
| Linux | test262           | 10   | 192.28  | 24.97   | 1.30     |
| Linux | host C sanitizers | 1    | 70.73   | 70.73   | 1.00     |
| Linux | test              | 2    | 23.88   | 22.90   | 1.92     |
| Linux | native            | 3    | 44.22   | 15.87   | 1.08     |

Derived platform totals: macOS 764.12 min, Linux 578.80 min.

### macOS test262 execution series

The measured series below covers every main workflow run from `32ece7f4`
through `6b435b4f`, including failed and cancelled runs. Sources are the
linked runs' measured step `startedAt`/`completedAt` timestamps from
`gh run view RUN --repo dahlia/oseo --json headSha,jobs`. Execution seconds
are the derived sum across all ten macOS shards of the step named
`Run mise run test:test262 --shard N/10`. They exclude job setup and cleanup,
but retain any startup and builds inside that execution step. Reviewed paths
are measured from each commit's manifest with the count command below;
seconds per path are derived by dividing the execution sum by that count.
Each commit was measured once, with no same-commit repeated sample.

| Commit     | Source run    | Measured paths | Derived execution s | Derived s/path | Observed run result |
| ---------- | ------------- | -------------- | ------------------- | -------------- | ------------------- |
| `32ece7f4` | [35456667007] | 20,841         | 13103               | 0.629          | success             |
| `e99620d5` | [35463308291] | 20,898         | 14123               | 0.676          | success             |
| `aff3ade3` | [35493049199] | 21,156         | 16096               | 0.761          | success             |
| `c56ef034` | [35744754987] | 21,156         | 16605               | 0.785          | success             |
| `09587080` | [35767988349] | 21,214         | 16428               | 0.774          | success             |
| `475dfbad` | [35865767695] | 21,265         | 15761               | 0.741          | success             |
| `970d6207` | [35928647398] | 21,265         | 16590               | 0.780          | success             |
| `5255312d` | [35956640498] | 21,265         | 16873               | 0.793          | success             |
| `a7b3ba2b` | [36009350844] | 21,312         | 15895               | 0.746          | success             |
| `890bb6dd` | [36083917728] | 21,341         | 16956               | 0.795          | failure             |
| `18e860a0` | [36111689857] | 21,312         | incomplete          | not comparable | cancelled           |
| `c8188414` | [36115335755] | 21,312         | 18666               | 0.876          | success             |
| `d6742c11` | [36134286493] | 21,341         | 16724               | 0.784          | success             |
| `97022608` | [36199093039] | 21,341         | 16290               | 0.763          | success             |
| `1ca8353a` | [36226406621] | 21,383         | 16159               | 0.756          | success             |
| `00153abe` | [36243816479] | 21,383         | 18935               | 0.886          | success             |
| `c9b3cc80` | [36261458909] | 21,383         | 18686               | 0.874          | success             |
| `6b435b4f` | [36300567111] | 21,383         | 17678               | 0.827          | failure             |

The cancelled run at `18e860a0` completed only shards 4/10, 7/10, and 8/10;
it has no complete execution sum or comparable per-path rate. All ten macOS
test262 execution steps succeeded in each other listed run, including the
failed runs. Run 36083917728 failed its Linux Node test job, and run
36300567111 failed its macOS Node test job; those failures are outside the
measured test262 steps.

The derived step-level per-path cost rose from 0.629-0.676 s/path in the
first two runs to an observed 0.741-0.886 s/path band from `aff3ade3` onward.
The measured path count grew from 20,841 to 21,383, a derived increase of
about 2.6%. The 0.741-0.886 band is the observed run-to-run spread, not a
trend within that band. The cause of the higher per-path cost is not yet
identified; runner variance and Zig cache hits are not improvements.

Against run 35456667007, run 36243816479 adds a derived 99.82 min of macOS
test262 job time, of which 97.20 min is inside the measured execution steps
(`(18935 - 13103) / 60`). Holding the older step rate constant while adding
542 paths accounts for only a derived 5.68 min
(`13103 * 542 / 20841 / 60`). Run 36261458909 similarly adds a derived
94.13 min of job time and 93.05 min of execution-step time. Thus most of the
increase in macOS test262 minutes relative to the 226.27-minute test262
family in the brief's baseline source run is per-path execution cost, rather
than corpus size or job fixed cost. The 628-minute ceiling covers all five
macOS families; this decomposition applies only to its test262 family. This is
a workload-normalized observation, not an attribution to a particular
implementation change or a measured isolated speedup.

[35463308291]: https://github.com/dahlia/oseo/actions/runs/35463308291
[35493049199]: https://github.com/dahlia/oseo/actions/runs/35493049199
[35744754987]: https://github.com/dahlia/oseo/actions/runs/35744754987
[35767988349]: https://github.com/dahlia/oseo/actions/runs/35767988349
[35865767695]: https://github.com/dahlia/oseo/actions/runs/35865767695
[35928647398]: https://github.com/dahlia/oseo/actions/runs/35928647398
[35956640498]: https://github.com/dahlia/oseo/actions/runs/35956640498
[36009350844]: https://github.com/dahlia/oseo/actions/runs/36009350844
[36083917728]: https://github.com/dahlia/oseo/actions/runs/36083917728
[36111689857]: https://github.com/dahlia/oseo/actions/runs/36111689857
[36115335755]: https://github.com/dahlia/oseo/actions/runs/36115335755
[36134286493]: https://github.com/dahlia/oseo/actions/runs/36134286493
[36199093039]: https://github.com/dahlia/oseo/actions/runs/36199093039
[36226406621]: https://github.com/dahlia/oseo/actions/runs/36226406621
[36300567111]: https://github.com/dahlia/oseo/actions/runs/36300567111

### Fixed cost and cache evidence

The measured steps API is `gh api repos/dahlia/oseo/actions/jobs/JOB`. Nested
steps in the composite cache action are absent there, so their measured
runner-log `duration_ms` fields come from
`gh api repos/dahlia/oseo/actions/runs/RUN/logs`. The log archive also supplies
dependency timings, repeated builds, and cache-hit evidence.

In the detailed tables, C is measured checkout time. T is derived mise tool
setup time: its measured action interval minus D and M. D is the measured
interval from `[deps.aube] aube` to `[deps.aube]` completion. M is the measured
mise cache-restore interval from `Restoring mise cache` to the restored-key
message. R is measured runtime archive restore or miss-lookup time. B is
derived total build time: the initial nested build's measured duration plus
later measured intervals from `[build]` launch to the next test-task launch.
Those later intervals include task dispatch overhead and builds repeated by
test tasks. The tables use seconds, rounded only after calculation.

F is a derived fixed-cost proxy, not a separately timed no-test job. It is
job elapsed time minus the interval from cache-action completion to final
test-step completion, plus the repeated build intervals. It includes checkout,
mise setup, dependency install, builds, archive key generation, cache lookup,
action gaps, setup, and cleanup. Some test-runner startup remains in the
residual, so the normalized rates below include that cost. C/T/D/B/M/R do
not sum to F because F also retains those otherwise unassigned intervals.
The native-support first shard's package-property step is variable evidence
work and is subtracted separately for the per-native-file rate, after
removing its already allocated repeated build cost.

Every measured job restored the mise tool-installation cache. That is a warm
Zig *installation*, not proof of a warm Zig compilation cache. Neither
commit's workflow restores a Zig compilation-cache directory; the derived
start state is cold on fresh hosted runners, with in-job warming possible.
The compilation-cache contents were not inspected, so this cold inference
must not be presented as measured cache contents. Runtime archive cold/warm
states below are observed cold misses/warm exact-key restores, respectively,
from `Cache not found for input keys: oseo-runtime...` or
`Cache restored from key: oseo-runtime...`. The workflow removes a non-exact
restore before compilation. Harness objects are not restored by CI.

Cold and warm runtime-archive residual rates are kept separate below.
A cache hit or a tool-install cache restore is not an implementation
improvement. Host C sanitizer jobs use the host compiler and its archive;
the inferred Zig compilation-cache state is inapplicable to their execution.

Deno test jobs have no repeated build inside their test task, so their
F is an integer difference of the measured API timestamps; Node jobs add
a log-timed repeated build by the same formula. The observed macOS Deno
job `108457960713` is an outlier: its API completion is 18:47:09 UTC,
while its final step ends at 18:45:47 UTC in run 36261458909. The derived
82 s reporting tail is retained in its derived F of 135.00 s and the family
total because both use job timestamps. It is not measured useful setup work;
this proxy includes post-step reporting latency as well as executed cleanup.
The derived means include this outlier, not a normalized replacement.

| Host  | Run         | Mean C | Mean T | Mean D | Mean B | Mean M | Mean R | Mean F |
| ----- | ----------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| macOS | 36243816479 | 4.07   | 2.72   | 24.51  | 4.40   | 13.12  | 1.40   | 59.82  |
| macOS | 36261458909 | 3.97   | 2.71   | 21.76  | 4.23   | 11.50  | 1.20   | 56.81  |

Derived macOS means in seconds above use every measured job in the
listed families of each run. The per-job values follow.

macOS, run 36243816479: measured source jobs; derived allocations in seconds.
C/D/M/R are measured intervals; T/B/F are derived as defined above.
The elapsed column is measured seconds; cache is observed runtime state.

| Job                  | Source job ID | Elapsed | C    | T    | D     | B     | M     | R    | F     | Cache |
| -------------------- | ------------- | ------- | ---- | ---- | ----- | ----- | ----- | ---- | ----- | ----- |
| sanitizers native    | 108409155499  | 2404.00 | 5.00 | 3.03 | 27.92 | 10.07 | 23.05 | 2.59 | 87.37 | warm  |
| sanitizers property  | 108409155477  | 2096.00 | 3.00 | 2.20 | 22.51 | 5.24  | 14.29 | 0.49 | 62.45 | cold  |
| native 1/3           | 108409155521  | 990.00  | 3.00 | 2.26 | 23.74 | 4.35  | 11.00 | 2.08 | 54.87 | warm  |
| native 2/3           | 108409155536  | 725.00  | 3.00 | 2.74 | 22.89 | 3.26  | 10.37 | 2.13 | 52.31 | warm  |
| native 3/3           | 108409155599  | 824.00  | 4.00 | 2.67 | 24.71 | 3.88  | 8.62  | 0.49 | 50.77 | warm  |
| native support 1/12  | 108409155577  | 1301.00 | 8.00 | 2.06 | 22.58 | 5.46  | 11.36 | 2.68 | 61.92 | warm  |
| native support 10/12 | 108409155596  | 1245.00 | 4.00 | 2.42 | 25.12 | 3.79  | 10.47 | 1.32 | 55.62 | warm  |
| native support 11/12 | 108409155646  | 916.00  | 3.00 | 2.17 | 17.03 | 2.91  | 9.80  | 1.84 | 46.15 | warm  |
| native support 12/12 | 108409155587  | 1111.00 | 3.00 | 3.47 | 26.11 | 4.17  | 10.42 | 0.44 | 55.68 | warm  |
| native support 2/12  | 108409155515  | 1449.00 | 5.00 | 3.26 | 27.84 | 6.97  | 14.90 | 0.59 | 67.95 | cold  |
| native support 3/12  | 108409155559  | 1636.00 | 3.00 | 2.35 | 20.68 | 2.42  | 6.97  | 0.37 | 40.10 | warm  |
| native support 4/12  | 108409155507  | 1930.00 | 4.00 | 2.54 | 25.17 | 4.78  | 13.29 | 0.47 | 61.72 | cold  |
| native support 5/12  | 108409155582  | 4088.00 | 4.00 | 2.80 | 24.68 | 3.81  | 10.52 | 0.46 | 58.67 | warm  |
| native support 6/12  | 108409155597  | 1548.00 | 5.00 | 3.14 | 25.60 | 4.69  | 14.25 | 1.29 | 61.60 | warm  |
| native support 7/12  | 108409155527  | 1216.00 | 3.00 | 2.19 | 20.11 | 2.91  | 8.71  | 0.20 | 43.14 | cold  |
| native support 8/12  | 108409155548  | 1140.00 | 4.00 | 3.33 | 20.29 | 4.60  | 14.37 | 1.90 | 55.92 | warm  |
| native support 9/12  | 108409155541  | 1032.00 | 4.00 | 2.56 | 25.44 | 4.31  | 15.00 | 0.47 | 62.71 | cold  |
| test Deno            | 108409155533  | 90.00   | 3.00 | 2.97 | 25.30 | 1.59  | 10.73 | 0.50 | 52.00 | cold  |
| test Node            | 108409155552  | 2421.00 | 4.00 | 3.11 | 25.41 | 3.74  | 10.47 | 0.42 | 54.46 | cold  |
| test262 1/10         | 108409155660  | 1726.00 | 5.00 | 2.99 | 27.07 | 4.51  | 16.94 | 2.02 | 66.97 | warm  |
| test262 10/10        | 108409155669  | 1636.00 | 3.00 | 2.27 | 19.21 | 2.95  | 10.52 | 2.02 | 50.22 | warm  |
| test262 2/10         | 108409155714  | 1680.00 | 3.00 | 3.25 | 24.85 | 4.22  | 14.91 | 1.24 | 62.93 | warm  |
| test262 3/10         | 108409155512  | 1930.00 | 5.00 | 2.28 | 28.58 | 4.56  | 16.13 | 2.12 | 68.24 | warm  |
| test262 4/10         | 108409155693  | 2023.00 | 5.00 | 3.12 | 25.73 | 4.28  | 14.16 | 2.08 | 64.66 | warm  |
| test262 5/10         | 108409155679  | 2636.00 | 6.00 | 3.01 | 35.38 | 5.99  | 19.61 | 2.48 | 85.57 | warm  |
| test262 6/10         | 108409155642  | 2004.00 | 5.00 | 1.83 | 22.21 | 3.24  | 16.97 | 1.24 | 60.39 | warm  |
| test262 7/10         | 108409155700  | 2030.00 | 4.00 | 3.12 | 27.22 | 4.96  | 14.66 | 2.21 | 66.13 | warm  |
| test262 8/10         | 108409155661  | 1945.00 | 3.00 | 3.21 | 22.75 | 3.34  | 12.04 | 2.08 | 58.33 | warm  |
| test262 9/10         | 108409155696  | 1955.00 | 4.00 | 2.59 | 24.56 | 6.63  | 15.85 | 2.33 | 65.88 | warm  |

macOS, run 36261458909: measured source jobs; derived allocations in seconds.
C/D/M/R are measured intervals; T/B/F are derived as defined above.
The elapsed column is measured seconds; cache is observed runtime state.

| Job                  | Source job ID | Elapsed | C    | T    | D     | B    | M     | R    | F      | Cache |
| -------------------- | ------------- | ------- | ---- | ---- | ----- | ---- | ----- | ---- | ------ | ----- |
| sanitizers native    | 108457960695  | 2151.00 | 4.00 | 2.14 | 23.20 | 9.92 | 13.67 | 0.63 | 68.40  | cold  |
| sanitizers property  | 108457960702  | 1875.00 | 4.00 | 2.25 | 16.97 | 5.27 | 7.78  | 0.81 | 49.70  | warm  |
| native 1/3           | 108457960797  | 704.00  | 3.00 | 1.92 | 16.15 | 2.61 | 8.92  | 1.74 | 42.26  | warm  |
| native 2/3           | 108457960803  | 1045.00 | 3.00 | 2.64 | 22.83 | 4.23 | 11.53 | 1.91 | 55.63  | warm  |
| native 3/3           | 108457960750  | 986.00  | 5.00 | 2.41 | 25.47 | 4.45 | 14.11 | 1.25 | 59.88  | warm  |
| native support 1/12  | 108457960760  | 1242.00 | 4.00 | 2.37 | 18.40 | 4.16 | 11.23 | 1.16 | 48.50  | warm  |
| native support 10/12 | 108457960871  | 1398.00 | 3.00 | 3.83 | 27.35 | 5.14 | 14.82 | 2.00 | 66.33  | warm  |
| native support 11/12 | 108457960824  | 722.00  | 4.00 | 2.44 | 23.14 | 3.78 | 8.42  | 0.60 | 49.45  | warm  |
| native support 12/12 | 108457960818  | 1116.00 | 4.00 | 2.09 | 21.24 | 3.17 | 9.67  | 0.99 | 48.41  | warm  |
| native support 2/12  | 108457960753  | 1319.00 | 4.00 | 1.99 | 22.17 | 3.97 | 12.84 | 2.07 | 55.45  | warm  |
| native support 3/12  | 108457960772  | 2341.00 | 4.00 | 2.43 | 23.56 | 3.90 | 12.02 | 2.02 | 55.55  | warm  |
| native support 4/12  | 108457960741  | 1723.00 | 4.00 | 2.84 | 25.38 | 4.56 | 12.78 | 0.36 | 57.10  | cold  |
| native support 5/12  | 108457960771  | 3095.00 | 3.00 | 2.13 | 19.15 | 5.59 | 10.71 | 0.41 | 50.15  | cold  |
| native support 6/12  | 108457960812  | 1130.00 | 4.00 | 2.21 | 17.53 | 3.51 | 11.26 | 1.11 | 47.70  | warm  |
| native support 7/12  | 108457960758  | 1283.00 | 4.00 | 2.00 | 21.70 | 4.47 | 13.31 | 0.39 | 55.23  | cold  |
| native support 8/12  | 108457960845  | 958.00  | 3.00 | 2.96 | 21.99 | 3.56 | 11.05 | 1.84 | 52.44  | warm  |
| native support 9/12  | 108457960811  | 764.00  | 3.00 | 2.93 | 18.32 | 3.01 | 6.75  | 0.53 | 42.23  | warm  |
| test Deno            | 108457960713  | 182.00  | 5.00 | 2.77 | 25.19 | 2.65 | 10.04 | 0.29 | 135.00 | cold  |
| test Node            | 108457960817  | 2589.00 | 4.00 | 2.82 | 27.43 | 3.88 | 9.75  | 0.20 | 53.70  | cold  |
| test262 1/10         | 108457960962  | 1954.00 | 3.00 | 3.05 | 15.90 | 2.85 | 12.05 | 2.01 | 47.19  | warm  |
| test262 10/10        | 108457960777  | 1752.00 | 5.00 | 3.10 | 25.25 | 5.70 | 11.65 | 0.42 | 59.29  | cold  |
| test262 2/10         | 108457960923  | 1701.00 | 6.00 | 3.58 | 24.76 | 4.68 | 15.67 | 2.10 | 69.68  | warm  |
| test262 3/10         | 108457960799  | 2750.00 | 5.00 | 2.80 | 26.77 | 5.85 | 15.43 | 2.06 | 70.79  | warm  |
| test262 4/10         | 108457960954  | 1802.00 | 4.00 | 2.88 | 17.95 | 3.77 | 11.18 | 1.18 | 47.70  | warm  |
| test262 5/10         | 108457960913  | 1644.00 | 4.00 | 3.26 | 15.67 | 2.81 | 8.07  | 0.49 | 40.14  | warm  |
| test262 6/10         | 108457960977  | 1630.00 | 3.00 | 3.96 | 22.66 | 5.02 | 11.38 | 1.18 | 56.51  | warm  |
| test262 7/10         | 108457960899  | 1808.00 | 5.00 | 2.42 | 18.26 | 3.09 | 13.32 | 1.11 | 51.39  | warm  |
| test262 8/10         | 108457960821  | 2257.00 | 5.00 | 3.00 | 24.47 | 4.34 | 14.52 | 1.97 | 62.67  | warm  |
| test262 9/10         | 108457960879  | 1926.00 | 3.00 | 3.26 | 22.27 | 2.60 | 9.46  | 1.86 | 49.16  | warm  |

| Host  | Run         | Mean C | Mean T | Mean D | Mean B | Mean M | Mean R | Mean F |
| ----- | ----------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| Linux | 36243816479 | 2.00   | 2.40   | 5.49   | 4.09   | 5.95   | 0.28   | 26.06  |
| Linux | 36261458909 | 1.85   | 2.53   | 6.02   | 4.25   | 5.90   | 0.27   | 26.47  |

Derived Linux means in seconds above use every measured job in the
listed families of each run. The per-job values follow.

Linux, run 36243816479: measured source jobs; derived allocations in seconds.
C/D/M/R are measured intervals; T/B/F are derived as defined above.
The elapsed column is measured seconds; cache is observed runtime state.

| Job                | Source job ID | Elapsed | C    | T    | D    | B     | M    | R    | F     | Cache |
| ------------------ | ------------- | ------- | ---- | ---- | ---- | ----- | ---- | ---- | ----- | ----- |
| sanitizers all     | 108409155518  | 3889.00 | 2.00 | 2.11 | 4.18 | 10.18 | 6.71 | 0.33 | 36.32 | cold  |
| native 1/3         | 108409155524  | 786.00  | 2.00 | 2.08 | 7.30 | 3.05  | 5.63 | 0.28 | 26.42 | cold  |
| native 2/3         | 108409155604  | 676.00  | 2.00 | 1.70 | 7.78 | 3.52  | 5.52 | 0.34 | 26.71 | cold  |
| native 3/3         | 108409155580  | 884.00  | 2.00 | 2.63 | 4.83 | 4.07  | 5.54 | 0.19 | 23.06 | cold  |
| native support 1/4 | 108409155547  | 5174.00 | 3.00 | 2.29 | 3.23 | 5.96  | 7.49 | 0.38 | 27.81 | cold  |
| native support 2/4 | 108409155530  | 2981.00 | 1.00 | 2.62 | 9.40 | 4.57  | 4.98 | 0.23 | 27.72 | cold  |
| native support 3/4 | 108409155623  | 2331.00 | 2.00 | 2.52 | 6.95 | 3.02  | 4.53 | 0.21 | 25.20 | cold  |
| native support 4/4 | 108409155531  | 3659.00 | 2.00 | 2.24 | 5.48 | 4.51  | 7.28 | 0.34 | 31.16 | cold  |
| test Deno          | 108409155475  | 69.00   | 2.00 | 2.52 | 6.13 | 2.07  | 5.35 | 0.24 | 24.00 | cold  |
| test Node          | 108409155494  | 2174.00 | 2.00 | 2.34 | 4.97 | 3.79  | 5.69 | 0.24 | 23.75 | cold  |
| test262 1/10       | 108409155674  | 1128.00 | 2.00 | 2.52 | 4.92 | 3.96  | 5.56 | 0.22 | 21.93 | cold  |
| test262 10/10      | 108409155570  | 685.00  | 2.00 | 2.55 | 5.30 | 2.33  | 5.15 | 0.27 | 24.12 | cold  |
| test262 2/10       | 108409155571  | 992.00  | 2.00 | 2.45 | 2.74 | 3.56  | 5.80 | 0.32 | 22.75 | cold  |
| test262 3/10       | 108409155579  | 1524.00 | 2.00 | 2.31 | 6.09 | 3.94  | 5.60 | 0.21 | 24.91 | cold  |
| test262 4/10       | 108409155583  | 1454.00 | 2.00 | 2.68 | 5.02 | 3.89  | 8.30 | 0.37 | 27.89 | cold  |
| test262 5/10       | 108409155592  | 1166.00 | 2.00 | 2.24 | 5.35 | 3.94  | 6.42 | 0.30 | 26.91 | cold  |
| test262 6/10       | 108409155670  | 1376.00 | 2.00 | 3.12 | 3.74 | 3.57  | 6.14 | 0.32 | 24.73 | cold  |
| test262 7/10       | 108409155585  | 1156.00 | 2.00 | 2.08 | 4.08 | 3.79  | 4.84 | 0.19 | 20.85 | cold  |
| test262 8/10       | 108409155652  | 1242.00 | 2.00 | 3.10 | 4.61 | 4.50  | 7.28 | 0.35 | 27.25 | cold  |
| test262 9/10       | 108409155610  | 821.00  | 2.00 | 1.99 | 7.75 | 3.57  | 5.26 | 0.26 | 27.71 | cold  |

Linux, run 36261458909: measured source jobs; derived allocations in seconds.
C/D/M/R are measured intervals; T/B/F are derived as defined above.
The elapsed column is measured seconds; cache is observed runtime state.

| Job                | Source job ID | Elapsed | C    | T    | D     | B     | M    | R    | F     | Cache |
| ------------------ | ------------- | ------- | ---- | ---- | ----- | ----- | ---- | ---- | ----- | ----- |
| sanitizers all     | 108457960626  | 4244.00 | 1.00 | 2.64 | 3.18  | 11.06 | 8.18 | 0.36 | 37.93 | cold  |
| native 1/3         | 108457960805  | 821.00  | 2.00 | 3.19 | 4.48  | 3.94  | 7.33 | 0.36 | 26.90 | cold  |
| native 2/3         | 108457960732  | 880.00  | 2.00 | 2.48 | 5.27  | 4.00  | 5.25 | 0.19 | 23.95 | cold  |
| native 3/3         | 108457960737  | 952.00  | 2.00 | 2.57 | 5.31  | 3.97  | 5.12 | 0.20 | 22.95 | cold  |
| native support 1/4 | 108457960742  | 5221.00 | 2.00 | 2.06 | 4.18  | 6.53  | 6.75 | 0.30 | 27.94 | cold  |
| native support 2/4 | 108457960740  | 3795.00 | 2.00 | 2.30 | 4.86  | 3.94  | 5.84 | 0.23 | 23.90 | cold  |
| native support 3/4 | 108457960789  | 2543.00 | 1.00 | 2.22 | 6.62  | 2.97  | 4.17 | 0.25 | 22.46 | cold  |
| native support 4/4 | 108457960764  | 3302.00 | 3.00 | 1.92 | 8.31  | 4.04  | 5.77 | 0.33 | 29.72 | cold  |
| test Deno          | 108457960766  | 59.00   | 2.00 | 3.00 | 5.16  | 1.81  | 4.85 | 0.25 | 21.00 | cold  |
| test Node          | 108457960815  | 1374.00 | 2.00 | 2.21 | 10.52 | 4.31  | 4.27 | 0.23 | 29.32 | cold  |
| test262 1/10       | 108457960854  | 1170.00 | 2.00 | 1.83 | 3.59  | 4.08  | 7.58 | 0.36 | 26.91 | cold  |
| test262 10/10      | 108457960874  | 909.00  | 1.00 | 2.37 | 5.77  | 4.06  | 5.86 | 0.33 | 25.68 | cold  |
| test262 2/10       | 108457960861  | 922.00  | 2.00 | 3.04 | 9.02  | 3.62  | 3.94 | 0.17 | 27.51 | cold  |
| test262 3/10       | 108457960808  | 1498.00 | 2.00 | 2.91 | 5.87  | 3.89  | 5.22 | 0.19 | 22.86 | cold  |
| test262 4/10       | 108457960843  | 1494.00 | 2.00 | 2.21 | 4.31  | 4.15  | 5.48 | 0.21 | 22.94 | cold  |
| test262 5/10       | 108457960878  | 1189.00 | 2.00 | 2.92 | 3.81  | 4.03  | 6.27 | 0.26 | 23.97 | cold  |
| test262 6/10       | 108457960807  | 1495.00 | 1.00 | 2.89 | 5.19  | 3.99  | 7.91 | 0.37 | 27.88 | cold  |
| test262 7/10       | 108457960834  | 920.00  | 2.00 | 2.96 | 13.73 | 3.50  | 8.30 | 0.35 | 38.49 | cold  |
| test262 8/10       | 108457960951  | 1225.00 | 2.00 | 2.75 | 5.31  | 3.95  | 4.94 | 0.22 | 22.93 | cold  |
| test262 9/10       | 108457960903  | 715.00  | 2.00 | 2.20 | 5.89  | 3.24  | 4.91 | 0.28 | 24.15 | cold  |

### Per-path and per-file residual cost

Derived test262 rates are `(job seconds - F) / shard paths`. The measured
ordered path set is the commit's *tests/test262/subset.yaml*, reconstructed
in global upstream path order by the manifest reader. *tools/shard.ts* selects
zero-based positions modulo the shard total. Applying that command's
selection to the measured count gives derived counts of 2,139 paths for
shards 1 through 3 and 2,138 for the remaining shards. The denominator counts
all reviewed paths, including unsupported paths; it is not native execution
or variant throughput. The source logs confirm each shard's result count.

Derived native-support rates are
`(job seconds - F - package evidence seconds) / selected native property files`.
Package evidence seconds are derived from the measured package-property step
minus its repeated build interval, which is already included in F; subtracting
the whole step again would double-count that build. The exact file list comes
from the measured expanded `node tools/run-native-tests.ts` command in each job
log, not today's checkout. Node's `--test-shard=INDEX/TOTAL` selects
round-robin positions in that ordered list. A Git tree comparison and the
expanded commands show one additional property file in the later run, so
selected file sets can shift. These are wall-time residuals per selected file
with concurrent execution; they are not mean standalone file latency or
processor-seconds per file. Neither rate supports a linear projection over a
changed semantic workload.

The following derived ranges separate observed runtime archive states.
Every figure is seconds per reviewed path or selected property file from
the indicated run's measured job logs and timestamps.

| Run         | Host  | Family         | Archive | Jobs | Min s/unit | Max s/unit |
| ----------- | ----- | -------------- | ------- | ---- | ---------- | ---------- |
| 36243816479 | macOS | test262        | warm    | 10   | 0.742      | 1.193      |
| 36243816479 | macOS | native support | cold    | 4    | 96.929     | 169.844    |
| 36243816479 | macOS | native support | warm    | 8    | 86.985     | 366.303    |
| 36243816479 | Linux | test262        | cold    | 10   | 0.309      | 0.701      |
| 36243816479 | Linux | native support | cold    | 4    | 72.056     | 160.499    |
| 36261458909 | macOS | test262        | cold    | 1    | 0.792      | 0.792      |
| 36261458909 | macOS | test262        | warm    | 9    | 0.736      | 1.253      |
| 36261458909 | macOS | native support | cold    | 3    | 111.615    | 276.805    |
| 36261458909 | macOS | native support | warm    | 9    | 67.255     | 207.768    |
| 36261458909 | Linux | test262        | cold    | 10   | 0.323      | 0.690      |
| 36261458909 | Linux | native support | cold    | 4    | 78.767     | 161.940    |

The first native-support shard package allocation is recorded explicitly
below: step seconds are measured from the source job API; build and package
evidence seconds are derived from the step and its measured build interval.

| Run         | Host  | Source job ID | Step s | Build s  | Package evidence s |
| ----------- | ----- | ------------- | ------ | -------- | ------------------ |
| 36243816479 | Linux | 108409155547  | 12.000 | 1.765833 | 10.234             |
| 36243816479 | macOS | 108409155577  | 11.000 | 1.338042 | 9.662              |
| 36261458909 | Linux | 108457960742  | 13.000 | 2.022509 | 10.977             |
| 36261458909 | macOS | 108457960760  | 10.000 | 1.337959 | 8.662              |

Absent cache categories have no measurement. Per-shard denominators and
derived rates follow; A/B identify runs 36243816479/36261458909.
Source job IDs and observed runtime cache states are in the fixed-cost
tables. Each rate uses its own job's F, with no cold/warm averaging.

macOS per-shard derived rates:

| Shard                | A units | A s/unit | A archive | B units | B s/unit | B archive |
| -------------------- | ------- | -------- | --------- | ------- | -------- | --------- |
| native support 1/12  | 11      | 111.765  | warm      | 11      | 107.712  | warm      |
| native support 10/12 | 10      | 118.938  | warm      | 10      | 133.167  | warm      |
| native support 11/12 | 10      | 86.985   | warm      | 10      | 67.255   | warm      |
| native support 12/12 | 10      | 105.532  | warm      | 10      | 106.759  | warm      |
| native support 2/12  | 11      | 125.550  | cold      | 11      | 114.868  | warm      |
| native support 3/12  | 11      | 145.082  | warm      | 11      | 207.768  | warm      |
| native support 4/12  | 11      | 169.844  | cold      | 11      | 151.446  | cold      |
| native support 5/12  | 11      | 366.303  | warm      | 11      | 276.805  | cold      |
| native support 6/12  | 11      | 135.128  | warm      | 11      | 98.391   | warm      |
| native support 7/12  | 11      | 106.623  | cold      | 11      | 111.615  | cold      |
| native support 8/12  | 10      | 108.408  | warm      | 11      | 82.324   | warm      |
| native support 9/12  | 10      | 96.929   | cold      | 10      | 72.177   | warm      |
| test262 1/10         | 2139    | 0.776    | warm      | 2139    | 0.891    | warm      |
| test262 10/10        | 2138    | 0.742    | warm      | 2138    | 0.792    | cold      |
| test262 2/10         | 2139    | 0.756    | warm      | 2139    | 0.763    | warm      |
| test262 3/10         | 2139    | 0.870    | warm      | 2139    | 1.253    | warm      |
| test262 4/10         | 2138    | 0.916    | warm      | 2138    | 0.821    | warm      |
| test262 5/10         | 2138    | 1.193    | warm      | 2138    | 0.750    | warm      |
| test262 6/10         | 2138    | 0.909    | warm      | 2138    | 0.736    | warm      |
| test262 7/10         | 2138    | 0.919    | warm      | 2138    | 0.822    | warm      |
| test262 8/10         | 2138    | 0.882    | warm      | 2138    | 1.026    | warm      |
| test262 9/10         | 2138    | 0.884    | warm      | 2138    | 0.878    | warm      |

Linux per-shard derived rates:

| Shard              | A units | A s/unit | A archive | B units | B s/unit | B archive |
| ------------------ | ------- | -------- | --------- | ------- | -------- | --------- |
| native support 1/4 | 32      | 160.499  | cold      | 32      | 161.940  | cold      |
| native support 2/4 | 32      | 92.290   | cold      | 32      | 117.847  | cold      |
| native support 3/4 | 32      | 72.056   | cold      | 32      | 78.767   | cold      |
| native support 4/4 | 31      | 117.027  | cold      | 32      | 102.259  | cold      |
| test262 1/10       | 2139    | 0.517    | cold      | 2139    | 0.534    | cold      |
| test262 10/10      | 2138    | 0.309    | cold      | 2138    | 0.413    | cold      |
| test262 2/10       | 2139    | 0.453    | cold      | 2139    | 0.418    | cold      |
| test262 3/10       | 2139    | 0.701    | cold      | 2139    | 0.690    | cold      |
| test262 4/10       | 2138    | 0.667    | cold      | 2138    | 0.688    | cold      |
| test262 5/10       | 2138    | 0.533    | cold      | 2138    | 0.545    | cold      |
| test262 6/10       | 2138    | 0.632    | cold      | 2138    | 0.686    | cold      |
| test262 7/10       | 2138    | 0.531    | cold      | 2138    | 0.412    | cold      |
| test262 8/10       | 2138    | 0.568    | cold      | 2138    | 0.562    | cold      |
| test262 9/10       | 2138    | 0.371    | cold      | 2138    | 0.323    | cold      |

### Same-job spread and dominant files

Derived observed spread below is the absolute difference between matched
job names in the two source runs. It is a conservative comparison floor,
not an isolated measurement of hardware variance: runtime keys differ,
some jobs change cold/warm state, the reviewed classifications change, and
property-file membership changes. Every job was measured once per commit;
no same-commit repeated sample was collected. A claimed difference smaller
than the matched job's observed spread is noise here, not improvement.
The full per-job elapsed tables permit the same comparison for every shard.

| Host  | Family            | Min spread min | Max spread min | Largest-spread job  |
| ----- | ----------------- | -------------- | -------------- | ------------------- |
| macOS | native support    | 0.08           | 16.55          | native support 5/12 |
| macOS | test262           | 0.35           | 16.53          | test262 5/10        |
| macOS | host C sanitizers | 3.68           | 4.22           | sanitizers native   |
| macOS | test              | 1.53           | 2.80           | test Node           |
| macOS | native            | 2.70           | 5.33           | native 2/3          |
| Linux | native support    | 0.78           | 13.57          | native support 2/4  |
| Linux | test262           | 0.28           | 3.93           | test262 7/10        |
| Linux | host C sanitizers | 5.92           | 5.92           | sanitizers all      |
| Linux | test              | 0.17           | 13.33          | test Node           |
| Linux | native            | 0.58           | 3.40           | native 2/3          |

The measured slowest macOS native-support job in both runs is shard 5/12:
source jobs `108409155582`
and `108457960771`. Its derived max/mean imbalance is reported above.
The measured long test durations in that shard are:

| Run         | Dominant source file                                   | Measured test ms | Derived min |
| ----------- | ------------------------------------------------------ | ---------------- | ----------- |
| 36243816479 | *tests/property/m5-object-own-keys.property.test.ts*   | 3565117.519      | 59.42       |
| 36243816479 | *tests/property/m5-reflect-namespace.property.test.ts* | 1263249.691      | 21.05       |
| 36261458909 | *tests/property/m5-object-own-keys.property.test.ts*   | 2578696.311      | 42.98       |
| 36261458909 | *tests/property/m5-reflect-namespace.property.test.ts* | 990989.023       | 16.52       |

On Linux, the measured slowest native-support job is shard 1/4 in both
runs. Source jobs `108409155547` and `108457960742` report measured own-key
test durations of 3,286,293.570 ms and 3,326,074.799 ms, respectively
(derived 54.77 min and 55.43 min); their measured Reflect durations are
1,283,650.209 ms and 1,307,274.984 ms (derived 21.39 min and 21.79 min).
These observations come from the same two run logs.

These are individual test observations in their named source files, not
an additive decomposition of shard wall time: Node executes files
concurrently, and competing files affect each other's duration. They identify
the own-key and Reflect property files as the work to inspect when balancing
shards. They do not establish a speedup between these commits.

### Reproducing the CI measurements

Retrieve main runs, retaining failed and cancelled runs when reproducing the
execution series, and read the reviewed count from each commit rather than
using the current checkout:

~~~~ sh
gh run list --repo dahlia/oseo --branch main --limit 100
run_id=36261458909
sha=$(gh run view "$run_id" --repo dahlia/oseo --json headSha \
  --jq .headSha)
git show "$sha":tests/test262/results.yaml > /tmp/r.yaml
node --input-type=module - <<'JSCOUNT'
import { readFileSync } from "node:fs";
import { parse } from "yaml";
const s = parse(readFileSync("/tmp/r.yaml", "utf8")).summary;
console.log(s.passes + s.expectedNegatives +
  s.unsupportedProfileFeatures);
JSCOUNT
gh run view "$run_id" --repo dahlia/oseo --json headSha,jobs
gh api repos/dahlia/oseo/actions/jobs/108457960771
gh api "repos/dahlia/oseo/actions/runs/$run_id/logs" > /tmp/run.zip
~~~~

Use the job IDs returned by each run, match full job names across samples,
and inspect both cache-restore messages and nested action durations in the
zip logs. The source jobs retain the expanded shard file list and the test
observations. API timestamps have second resolution; nested log timestamps
and durations have finer resolution, but normalized rates remain derived
allocations with the startup limitation stated above.

### Historical per-path test262 investigation

The measurement sources, exact per-run values, and table-to-artifact map
are preserved in [*evidence/u10/README.md*](./evidence/u10/README.md).
Its recomputation commands cover every table and derived percentage in
this investigation, including the native attribution and generated-C hashes.

The largest measured new cost is three 10,000-element TypedArray
`copyWithin` detachment security cases admitted by `1a879b2e`. They
account for a derived 97.4/97.3 percent of summed native elapsed
time among the 315 newly reviewed paths in two warm Linux runs. The
fixed old-path sample's warm-trial mean runner time grows from 31.99
to 34.01 seconds, a derived 6.3 percent; the
CI series grows 21.0 percent in normalized step time. U10 finds no lost
reuse or runner change, retains the required semantic work, and claims
no recovered CI capacity. The macOS remainder is not causally allocated
by these Linux measurements.

The U10 comparison uses the historical commits `32ece7f4`,
`e99620d5`, and `aff3ade3`. The measured CI execution steps below
come from main runs 35456667007, 35463308291, and 35493049199;
`gh run view RUN --json headSha,jobs` supplies timestamps and
`gh run view RUN --job JOB --log` supplies runner metadata. Each commit
has one CI run in this comparison, so these measurements do not establish
a repeatable CI improvement or an exact causal allocation.

Measured macOS execution-step seconds and source job IDs, from
[*ci-summary.json.txt*](./evidence/u10/ci-summary.json.txt):

| Shard | 32ece7f4 job | Step s | e99620d5 job | Step s | aff3ade3 job | Step s |
| ----- | ------------ | ------ | ------------ | ------ | ------------ | ------ |
| 1/10  | 105933065487 | 1444   | 105950927491 | 1525   | 106031164715 | 1736   |
| 2/10  | 105933065424 | 1442   | 105950927505 | 1593   | 106031164796 | 1425   |
| 3/10  | 105933065463 | 1308   | 105950927497 | 1341   | 106031164885 | 1233   |
| 4/10  | 105933065510 | 1104   | 105950927440 | 1523   | 106031165008 | 1916   |
| 5/10  | 105933065474 | 1213   | 105950927415 | 1239   | 106031165096 | 1936   |
| 6/10  | 105933065464 | 1450   | 105950927498 | 1766   | 106031164745 | 1477   |
| 7/10  | 105933065576 | 1153   | 105950927494 | 1565   | 106031164849 | 1824   |
| 8/10  | 105933065570 | 1448   | 105950927449 | 1085   | 106031164759 | 1167   |
| 9/10  | 105933065434 | 1421   | 105950927495 | 1279   | 106031164782 | 1603   |
| 10/10 | 105933065675 | 1120   | 105950927552 | 1207   | 106031164930 | 1779   |

The derived sums are 13,103, 14,123, and 16,096 seconds. Dividing by
the measured reviewed counts of 20,841, 20,898, and 21,156 gives
0.629, 0.676, and 0.761 seconds per path. The derived rate increase is 21.0
percent; the execution-sum increase is 22.8 percent. Job setup is outside these
steps. The mise task's prerequisite package build remains inside each step and
has not been subtracted here. Shard indices use each commit's reviewed order,
so an equal index does not select an equal path set across these commits.

All thirty observed runner logs report `pool=3` and `retries=0`.
The measured harness-object build/reuse sums are 954/0, 954/0, and
992/0, respectively. The cold harness state was already present at the
baseline, so it is not a newly lost cache in this interval. The measured
runtime archive restore-hit counts are 9/10, 7/10, and 10/10. The
TypedArray run has the highest normalized cost despite restoring every
archive; archive misses cannot explain that endpoint increase.

The measured canonical execution-variant counts are 68,275, 68,557,
and 69,552, obtained by reading every partition from
`git archive REV tests/test262/results` and counting
`execution.variants`. Their derived endpoint increase is 1.87 percent.
The original 20,841 paths account for 68,275, 68,341, and 68,344
variants; 22 old paths become pass with Symbol support and one more
with TypedArray mutation. The measured new-path counts are 57 at
`e99620d5` and 315 at `aff3ade3`, with 216 and 1,208 variants.
The runtime changes are `a41aeb0b` (Symbol), its identity/lifetime
repairs `9ecf1642`, `7df433ae`, and `61a5214d`, and `1a879b2e`
(TypedArray mutation). The historical test262 runner, fragment runner,
compiler sources, and C backend sources have identical bytes between
the endpoints.

The Linux comparison ran on Linux 7.2.7-200.fc44.x86\_64, an AMD Ryzen
7 7700X with eight physical cores and sixteen hardware threads, using
Node.js 24.18.0 and Zig 0.16.0. The initial host snapshot was an
unpreserved observation: 34 GiB available memory, 254 MiB free swap,
190 GiB free on the temporary filesystem, and load averages of
0.99/1.08/0.86. Its source output and timestamp were not retained, so
these figures are not artifact-backed measurements.

The preserved, sanitized
[*host-pressure.log*](./evidence/u10/host-pressure.log) contains later
observations with their original timestamps. Its swap row at
`2026-09-27T20:15:08+09:00` records zero free bytes. These are shared-host
measurements, not an isolated-host benchmark. The statement that no other
`mise run test` gate was observed at checkpoints is also an unpreserved
observation; no timestamped process-list output supports it.

A detached historical checkout was built at every commit with

~~~~ sh
ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-test262-per-path-rise \
  mise run build
~~~~

Package installation and those builds are outside the timing table. The exact
209 path strings were frozen from shard `3/100` of the `32ece7f4` reviewed
order, rather than reselecting a shard at each commit. The preserved
[*bench.ts.txt*](./evidence/u10/bench.ts.txt) wrapper
calls `createReviewedManifest`, uses each commit's current reviewed entries for
those strings, and asserts equality with `serializeTest262Manifest` of the
corresponding canonical records. It never writes the reviewed subset or results.

The measured command was GNU time around
`mise exec -- node tools/u10-bench.ts`, with the lane above and a separate
`XDG_CACHE_HOME` for each commit. Before each cold run, both the lane's
Zig cache and that commit's Oseo cache were empty. Two warm runs retained
both caches after the cold run. Every cold run built 52 harness objects;
every warm run reused all 52 and built none. All runs used the observed
eight-worker bound and no retry.

Measured runner, command-wall, user, and system seconds follow; CPU/wall
is derived from the latter three measurements. Runner time excludes
manifest preparation and verification outside `createReviewedManifest`.
The difference between command wall and runner time is a derived wrapper
cost, not a native-execution estimate.

Inputs: [*runs.json.txt*](./evidence/u10/runs.json.txt), keyed by commit and
cache trial. CPU/wall is `(user + system) / wall`; the derived warm increase
compares the endpoints' two-trial mean runner seconds.

| Commit     | Cache | Runner s | Wall s | User s | System s | CPU/wall |
| ---------- | ----- | -------- | ------ | ------ | -------- | -------- |
| `32ece7f4` | cold  | 56.84    | 62.86  | 149.56 | 76.43    | 3.60     |
| `32ece7f4` | warm1 | 32.30    | 38.17  | 98.62  | 66.72    | 4.33     |
| `32ece7f4` | warm2 | 31.68    | 37.62  | 98.53  | 66.41    | 4.38     |
| `a41aeb0b` | cold  | 62.90    | 68.88  | 167.35 | 83.35    | 3.64     |
| `a41aeb0b` | warm1 | 34.07    | 40.22  | 105.89 | 70.11    | 4.38     |
| `a41aeb0b` | warm2 | 34.14    | 40.08  | 106.38 | 70.46    | 4.41     |
| `9ecf1642` | cold  | 57.94    | 63.93  | 154.76 | 77.59    | 3.63     |
| `9ecf1642` | warm1 | 33.93    | 40.10  | 103.83 | 69.76    | 4.33     |
| `9ecf1642` | warm2 | 33.86    | 39.88  | 104.87 | 69.58    | 4.37     |
| `7df433ae` | cold  | 57.83    | 63.81  | 155.19 | 77.76    | 3.65     |
| `7df433ae` | warm1 | 33.34    | 39.32  | 104.18 | 69.57    | 4.42     |
| `7df433ae` | warm2 | 33.33    | 39.28  | 103.15 | 68.98    | 4.38     |
| `61a5214d` | cold  | 57.40    | 63.39  | 154.54 | 77.87    | 3.67     |
| `61a5214d` | warm1 | 32.63    | 38.63  | 102.14 | 68.65    | 4.42     |
| `61a5214d` | warm2 | 33.63    | 39.67  | 102.98 | 69.59    | 4.35     |
| `e99620d5` | cold  | 58.14    | 64.10  | 158.52 | 78.53    | 3.70     |
| `e99620d5` | warm1 | 38.51    | 44.56  | 114.78 | 76.15    | 4.28     |
| `e99620d5` | warm2 | 34.98    | 41.16  | 108.06 | 71.52    | 4.36     |
| `9e71f689` | cold  | 58.01    | 64.01  | 156.47 | 78.13    | 3.67     |
| `9e71f689` | warm1 | 34.72    | 40.78  | 106.30 | 71.05    | 4.35     |
| `9e71f689` | warm2 | 34.84    | 41.01  | 108.44 | 71.66    | 4.39     |
| `1a879b2e` | cold  | 61.09    | 68.19  | 160.37 | 80.73    | 3.54     |
| `1a879b2e` | warm1 | 33.30    | 39.35  | 106.01 | 69.67    | 4.46     |
| `1a879b2e` | warm2 | 33.90    | 39.97  | 105.02 | 69.90    | 4.38     |
| `aff3ade3` | cold  | 61.91    | 70.35  | 164.74 | 81.36    | 3.50     |
| `aff3ade3` | warm1 | 33.88    | 40.28  | 106.56 | 70.05    | 4.38     |
| `aff3ade3` | warm2 | 34.14    | 40.31  | 104.46 | 70.61    | 4.34     |

The measured baseline sample has 167 passes, 17 expected negatives,
25 unsupported paths, and 668 variants. Symbol support promotes three
sample paths, giving 170 passes, 17 expected negatives, 22 unsupported,
and 677 variants at every later point. Every sample has zero semantic,
harness, or infrastructure failures and matches its own reviewed records.
These historical promotions are workload changes, not manifest edits by U10.

The warm-trial mean runner time rises from 31.99 to 34.01 seconds, a
derived 6.3 percent, below the 21.0 percent CI step-rate increase. The observed
increase appears in the `a41aeb0b` samples, which also include the three
promotions. The subsequent repairs and TypedArray implementation do not produce
another consistent warm step in this sample. `61a5214d` and `e99620d5` have
identical trees, yet their measured warm ranges are 32.63–33.63 and 34.98–38.51
seconds. This observed variation precludes assigning small timing differences
to the merge itself.

The unchanged-classification control removes those three promotions,
leaving the same 206 paths, 167 passes, 17 expected negatives,
22 unsupported results, and 665 recorded variants at both endpoints.
An instrumented wrapper records elapsed `host.run` intervals and hashes
the generated launcher/body C before writing it. Two module variants use
the whole-Script fallback and are outside this fragment-host instrumentation;
all 665 variants still execute and match the reviewed results.
After an untimed-for-comparison primer, the two warm runs capture 663
compile/link and 663 native-executable calls each. The 1,326 observed C
files have identical name/length/SHA-256 multisets at both endpoints,
totaling a derived 29,969,883 bytes each. Larger generated body C is
therefore not the source of the fixed control's cost.

Measured command/runner seconds and derived sums of observed subprocess
elapsed seconds follow. Those sums include process creation and asynchronous
completion delivery, overlap under eight workers, and are neither CPU
time nor task-wall allocations. Instrumentation has its own overhead,
so these runner times are not comparisons with the uninstrumented table.

Inputs: [*runs.json.txt*](./evidence/u10/runs.json.txt) and
[*control-metrics.json.txt*](./evidence/u10/control-metrics.json.txt). Divide
each phase's summed milliseconds by 1000; the shared C hash multiset preserves
all four runs after exact equality checks.

| Commit     | Trial | Runner s | Wall s | User s | System s | Compile/link sum s | Native sum s |
| ---------- | ----- | -------- | ------ | ------ | -------- | ------------------ | ------------ |
| `32ece7f4` | warm1 | 35.23    | 41.45  | 104.87 | 71.70    | 90.24              | 14.72        |
| `32ece7f4` | warm2 | 35.28    | 41.70  | 103.63 | 71.82    | 88.21              | 15.10        |
| `aff3ade3` | warm1 | 37.15    | 43.36  | 107.23 | 74.33    | 92.94              | 15.67        |
| `aff3ade3` | warm2 | 34.45    | 40.73  | 102.87 | 70.91    | 87.18              | 14.44        |

The observed control ranges overlap in both phases. It does not establish
a repeatable slowdown of unchanged old cases or a generated-C regression.

All 315 paths newly reviewed between the endpoints were then measured
at `aff3ade3`, using the same runner wrapper and the unchanged reviewed
expectations. The first run retained the populated Zig/runtime caches
and had a mixed harness cache: 32 objects built and 24 reused. Each
instrumented warm repeat reused all 56 harness objects and built none.
Every run retained 303 passes, 12 unsupported results, 1,208 variants,
eight workers, no retry, and no failure.

Measured command and runner seconds, from the same GNU-time command:

Inputs: [*runs.json.txt*](./evidence/u10/runs.json.txt), keys `new-prime`,
`new-warm1`, and `new-warm2`.

| New-path trial | Harness state | Runner s | Wall s | User s  | System s |
| -------------- | ------------- | -------- | ------ | ------- | -------- |
| new-prime      | mixed         | 310.12   | 316.56 | 1459.54 | 166.20   |
| new-warm1      | warm          | 331.54   | 337.61 | 1575.73 | 168.97   |
| new-warm2      | warm          | 326.58   | 332.87 | 1513.92 | 170.19   |

The three expensive paths are under the upstream
*test/built-ins/TypedArray/prototype/copyWithin/* directory:
*coerced-values-end-detached.js*,
*coerced-values-end-detached-prototype.js*, and
*coerced-values-start-detached.js*. Each explicitly fills an array of
length 10,000 before constructing typed arrays and detaching a buffer
during index coercion. The upstream comment identifies the large array
as a way to expose access after the memory has been freed. All three
paths were added to the reviewed subset by `1a879b2e`. The test262
runner leaves the collector policy unset, so these measurements use
the runtime's ordinary collection policy, as described in ADR 0018.

Derived sums from the warm repeats' observed `host.run` intervals in
[*new-metrics.json.txt*](./evidence/u10/new-metrics.json.txt). Sum each path's
four native milliseconds and divide by 1000. For each attribution percentage,
divide the three-path sum by all paths' native sum and multiply by 100:

| Path stem                                  | Variants/run | First native sum s | Second native sum s |
| ------------------------------------------ | ------------ | ------------------ | ------------------- |
| *coerced-values-end-detached.js*           | 4            | 455.46             | 428.25              |
| *coerced-values-end-detached-prototype.js* | 4            | 463.77             | 427.43              |
| *coerced-values-start-detached.js*         | 4            | 433.86             | 417.31              |

The derived three-path totals are 1,353.09 and 1,272.99 seconds,
out of 1,389.12 and 1,308.36 seconds for all new-path native
calls: 97.4 and 97.3 percent. Compile/link sums for the
same runs are 208.21 and 215.08 seconds. This isolates the added
cost to required native security-case work rather than a much larger
generated program or newly lost reuse. It does not convert Linux timings
into a macOS budget estimate.

A separate sanitized C probe materializes Symbol or the TypedArray
prototype, collects once to remove transient objects, counts the remaining
owned heap objects, and times 10,000 further `oseo_collect` calls with
`clock()`. It links each commit's retained runtime archive using
`zig cc -target x86_64-linux-gnu -std=c11 -Wall -Wextra -Werror -pedantic`,
the matching headers, `-fsanitize=address,undefined`, and `-fno-lto`.
This is a diagnostic microbenchmark, not gate time or an executed-case
budget. Object counts and CPU seconds are measured; no full-gate
projection is derived from them.

Inputs: [*gc-probe.log*](./evidence/u10/gc-probe.log), emitted by the
preserved [*gc-probe.c*](./evidence/u10/gc-probe.c) source. The object and
CPU columns copy observed values directly, with no derived projection.

| Commit     | Symbol objects | Symbol CPU s, two trials | TypedArray objects | TypedArray CPU s, two trials |
| ---------- | -------------- | ------------------------ | ------------------ | ---------------------------- |
| `32ece7f4` | 363            | 0.074722/0.076069        | 1049               | 0.225213/0.225948            |
| `a41aeb0b` | 391            | 0.082519/0.082485        | 1079               | 0.232866/0.231823            |
| `9ecf1642` | 391            | 0.084049/0.085079        | 1079               | 0.233143/0.232689            |
| `7df433ae` | 391            | 0.082937/0.082685        | 1079               | 0.230107/0.229598            |
| `61a5214d` | 391            | 0.084244/0.083773        | 1079               | 0.233293/0.235265            |
| `1a879b2e` | 391            | 0.084416/0.083141        | 1127               | 0.240724/0.239648            |
| `aff3ade3` | 391            | 0.082979/0.082814        | 1127               | 0.242209/0.240837            |

Symbol support expands the retained intrinsic graph; TypedArray mutation
adds six method objects and their descriptors. Tracing the larger graphs
is observable in this probe. The unchanged-classification task control
still has overlapping phase times, so this microbenchmark does not assign
the CI rise or the small fixed-sample difference to GC alone.

U10 records a measured semantic-work explanation and implements no
infrastructure change. No lost cache, pool reduction, extra retry, or
larger generated body for unchanged old cases was demonstrated. Reducing
the upstream security arrays would discard the evidence that made these
paths worth admitting. A future collector
or runtime optimization must retain those arrays, every recorded variant,
and the same native targets and sanitizer flags.

The single-run macOS series cannot establish an exact allocation of its
21.0 percent rise between these new cases, historical promotions, and
runner spread. Repeated macOS runs of fixed old and new path sets would
be needed for that allocation. U10 claims zero recovered CI capacity;
the reviewed manifests, classifications, and language profile are unchanged.


Historical local baseline (2026-07-25)
--------------------------------------

The sections below preserve the observed local measurements originally
recorded for [*PLAN-GATE.md*](../PLAN-GATE.md). The baseline commit is
`0bd5f38e1762666a7cca40c059abdcd8dcf94118`, dated 2026-07-25, with a measured
681 reviewed paths from `git show 0bd5f38:tests/test262/results.yaml`.
They describe that historical corpus, not current CI cost.

Historical task timings, host facts, counts, decomposition samples, cgroup
peaks, and sampler readings below are observed single-host measurements from
the named commands. Ratios, differences, percentages, and concurrency
aggregates are derived from those observations. Earlier `e57a184` samples
also date to 2026-07-25. Archive reuse and concurrency were recorded at
`ddaf4a91` and `a5b3e105` on 2026-07-26 with the same measured 681 paths;
the explicitly named `9eb7de2` footprint sample also dates to 2026-07-26.
Later inventory and partition checkpoints below label their own larger
corpus and commands; the partition checkpoint was recorded at `6676520b`
on 2026-08-05. Cache warmth was not fully established for the original
baseline, so these historical values are not cold/warm CI comparisons.

Sanitizer audit (observed 2026-09-17): historical Zig 0.16.0 runs did not
provide ASan coverage. The separate Linux host C sanitizer lane verifies
instrumentation; its measured scope is recorded in the
[activity audit](sanitizer-activity.md). This does not retroactively validate
earlier gates or establish macOS ASan coverage for those historical samples.
Zig address self-checks remain TODOs.

### Measurement host

| Fact              | Value                                        |
| ----------------- | -------------------------------------------- |
| Operating system  | Linux 7.1.4-200.fc44.x86\_64                 |
| Processor         | AMD Ryzen 7 7700X, 8 cores, 16 threads       |
| Memory            | 61 GiB total, 8 GiB available during the run |
| Temporary storage | *tmpfs* on */tmp*, 31 GiB, 80 percent used   |
| Oseo target       | `linux-x86_64-gnu`                           |
| Sanitizers        | `address`, `undefined`                       |
| Zig               | 0.16.0                                       |
| Node.js           | 24.18.0                                      |
| Deno              | 2.9.2                                        |

The memory and temporary storage rows are recorded because they are the host
conditions during the failing runs described below, not because a cause was
established. Native executions allocate their working directories under
*/tmp*, which is memory-backed on this host.

The reviewed test262 corpus at the baseline commit holds 681 paths at
upstream revision `f2d1435644797268dca1f7988cad5a4e89ccd8d2`. The
checked-in manifest records 310 passes, 245 expected negatives, 126
unsupported profile features, and no semantic or harness failures. It also
records 1,192 specialization observations, so one manifest run performs
1,192 native compile-and-execute cycles.

### Observed gate durations

| Task                            | Wall    | User    | System  | CPU / wall |
| ------------------------------- | ------- | ------- | ------- | ---------- |
| `mise run test:test262`         | 980.2 s | 641.1 s | 339.0 s | 1.00       |
| `mise run test:property:native` | 42.8 s  | 285.9 s | 135.0 s | 9.84       |

The property task passed 29 tests and averaged 9.84 processor-seconds for each
second of wall clock. The test262 task averaged 1.00, which is one
core-equivalent on average rather than a guarantee about any instant. Its
reviewed subset executes through one sequential `for` loop that awaits each
case in *tools/test262.ts*.

The test262 run executed the complete reviewed subset and then reported
infrastructure failures during validation, so its duration measures the
complete corpus. The failures are described under load sensitivity below.

An earlier sample of the property task at commit `e57a184` recorded 52.9 s of
wall clock with a ratio of 8.52, and an earlier sample of the test262 task at
that commit recorded 1,102.7 s with a ratio of 1.01. Absolute wall clock
varies with the warmth of the Zig compilation cache and with competing load,
so the ratio is the comparable figure across hosts and runs.

System time is 34 percent of the processor time the test262 task
consumes. Each native execution copies the reviewed runtime assets into a
fresh working directory and starts 13 toolchain processes.

### Native execution decomposition

These three components were measured separately on the same host with the
same target and sanitizer flags:

| Component                                                     | Wall       | Processor |
| ------------------------------------------------------------- | ---------- | --------- |
| One complete `runNativeCli` execution of `const x = 1 + 1;`   | 717-750 ms | not taken |
| Runtime archive build, first sample                           | 641 ms     | not taken |
| Runtime archive build, later sample                           | 333 ms     | 255 ms    |
| Generated C compile, link, and run against a prebuilt archive | 20-43 ms   | not taken |

The two archive samples differ because Zig caches compilation and the later
sample repeated identical sources and flags. Which sample resembles a gate
execution is not established: the gate copies sources into a fresh working
directory for every execution, so its include paths differ from these samples
and may or may not produce the same cache keys.

Derived from the observed task duration: 980.2 s divided by 1,192 recorded
observations is 822 ms of task wall clock for each native cycle. That figure
includes runner overhead and is not a direct measurement of one native
execution. The archive build's share of it is not established here, and no
residual figure is projected from these samples.

What the samples do show is that linking and running a trivial program against
an existing archive costs 20-43 ms, while building the archive costs 333 to
641 ms. Across the recorded pairs that is a factor of roughly 8 to 32. The
archive depends on the reviewed runtime sources and headers, the compile flags,
the resolved toolchain identity, one immutable admitted-environment snapshot,
the exact inherited environment policy, and the target and sanitizer
selection. Ambient compiler inputs outside that policy are removed. None of
those change between reviewed cases in one gate run, and the archive is rebuilt
for every execution.

### Per-execution footprint before archive reuse

The runtime archive checkpoint first measured one complete `runNativeCli`
execution of `const x = 1 + 1;` at commit `9eb7de2`. The execution ran alone
in a transient user systemd service with memory accounting enabled. The
service cgroup reported the peak resident memory for the Node.js process and
all of its native toolchain children.

The new _oseo-cli-\*_ working directory was sampled every 5 ms from creation
through the final pre-removal observation. Allocated storage is the sum of
filesystem blocks reported by `lstat`; apparent storage is the sum of file
and directory sizes. Preexisting _oseo-cli-\*_ directories were excluded.

| Measurement                   | Peak                      |
| ----------------------------- | ------------------------- |
| Resident memory, process tree | 192.9 MiB                 |
| Temporary storage, allocated  | 7,786,496 bytes, 7.43 MiB |
| Temporary storage, apparent   | 7,731,724 bytes, 7.37 MiB |

The service completed successfully. Its 1.567 s service runtime and 1.555 s
processor time include the 5 ms filesystem sampler and are not gate-duration
measurements. The gate comparison below measures wall and processor time
without that sampler.

The same source, sampler, and cgroup measurement were repeated after the
runtime archive checkpoint with a valid archive already present:

| Measurement                   | Before                    | Reuse                     | Reduction |
| ----------------------------- | ------------------------- | ------------------------- | --------- |
| Resident memory, process tree | 192.9 MiB                 | 47.8 MiB                  | 75.2%     |
| Temporary storage, allocated  | 7,786,496 bytes, 7.43 MiB | 4,616,192 bytes, 4.40 MiB | 40.7%     |
| Temporary storage, apparent   | 7,731,724 bytes, 7.37 MiB | 4,610,180 bytes, 4.40 MiB | 40.4%     |

The reuse measurement completed successfully in 238 ms of service runtime and
210 ms of processor time. Those durations still include the sampler and remain
outside the unsampled gate comparison. The footprint reduction is the input to
the later bounded-concurrency decision; the persistent 1,438,318-byte archive
is shared cache state rather than per-execution temporary storage.

### Runtime archive reuse checkpoint

The checkpoint comparison ran on the same operating system, processor, target,
and tool versions as the baseline. Host pressure differed between the two
test262 samples and is recorded rather than normalized away:

| Fact                      | Reuse sample       | Bypass sample      |
| ------------------------- | ------------------ | ------------------ |
| Memory available at start | 6.1 GiB            | 23.9 GiB           |
| */tmp* capacity           | 31 GiB             | 31 GiB             |
| */tmp* use at start       | 80 percent         | 18 percent         |
| Load average at start     | 11.18/9.67/9.98    | 13.34/39.73/47.90  |
| Nearby CPU I/O wait       | about 25 percent   | 25 percent         |
| Oseo target               | `linux-x86_64-gnu` | `linux-x86_64-gnu` |
| Sanitizers                | address, undefined | address, undefined |
| Zig                       | 0.16.0             | 0.16.0             |
| Node.js                   | 24.18.0            | 24.18.0            |
| Deno                      | 2.9.2              | 2.9.2              |

The bypass sample began only after a competing eight-worker Node.js test had
finished and memory had recovered. Both successful test262 samples executed
the same 681 reviewed paths and reported 310 passes, 245 expected negatives,
126 unsupported profile features, and no semantic or harness failures.

| Task and path                            | Wall       | User     | System   | CPU / wall |
| ---------------------------------------- | ---------- | -------- | -------- | ---------- |
| `mise run test:test262`, reuse           | 270.64 s   | 216.75 s | 76.21 s  | 1.08       |
| `mise run test:test262`, explicit bypass | 1,180.85 s | 783.15 s | 396.83 s | 1.00       |
| `mise run test:property:native`, reuse   | 8.93 s     | 67.31 s  | 30.13 s  | 10.91      |

The successful bypass is the same-checkout control for the test262 result.
Reuse removed 910.21 s of wall clock, 77.1 percent of the bypass duration, and
887.02 processor-seconds, 75.2 percent of the bypass processor time. The gate
was 4.36 times faster with reuse. Compared with the older baseline, native
property wall clock fell from 42.8 s to 8.93 s and its processor time fell from
420.9 s to 97.44 s.

The test262 difference establishes the net share of the complete runtime
archive rebuild path that reuse removes. It includes avoiding runtime source
copies and includes the new key calculation and cache lookup overhead, so it
does not claim that 77.1 percent is isolated `zig cc` time. It does establish
that repeated runtime preparation, rather than the generated-program link and
execution alone, occupied most of the gate.

One earlier bypass attempt is excluded from the table. A competing
eight-worker Node.js test started during that run; the host reached 55 GiB in
use, exhausted all 8 GiB of swap, and exceeded a load average of 70. The Oseo
run then reported many unrelated expected passes as harness failures after
1,098.22 s. No Oseo or Zig child remained afterward. The successful isolated
bypass above replaces that load-contaminated sample rather than averaging it
into the checkpoint result.

### Concurrent reviewed execution checkpoint

The concurrent checkpoint ran on the same operating system, processor, target,
and tool versions as the reuse sample. No unrelated native build or other heavy
test task ran at the same time.

| Fact                      | Concurrent sample                      |
| ------------------------- | -------------------------------------- |
| Operating system          | Linux 7.1.4-200.fc44.x86\_64           |
| Processor                 | AMD Ryzen 7 7700X, 8 cores, 16 threads |
| Memory available at start | 25 GiB                                 |
| Swap at start             | 8.0 GiB used, 104 KiB free             |
| */tmp* capacity           | 31 GiB                                 |
| */tmp* use at start       | 32 percent                             |
| Load average at start     | 0.71/0.39/0.80                         |
| Oseo target               | `linux-x86_64-gnu`                     |
| Sanitizers                | address, undefined                     |
| Zig                       | 0.16.0                                 |
| Node.js                   | 24.18.0                                |
| Deno                      | 2.9.2                                  |

The worker bound is eight, one for each physical core. A host with less
available parallelism uses and reports that lower effective bound. The bound
counts concurrent native executions rather than reviewed paths: the pool
schedules one work item for each strictness and specialization variant, so one
path's variants can hold several slots at once and a single long path no longer
serializes every execution behind one worker. A subset with fewer paths than
the configured bound clamps against that work-item count instead of the path
count.

A path's first variant runs alone as a probe, because a case that stops at
that variant records only that variant, and ADR 0013 requires every executed
combination to be listed and compared. Once the probe shows that the case does
not stop there, the remaining variants start together, and every one of their
outcomes is awaited, recorded, and compared before the result is decided. No
combination executes that the result would not list. The measured reused
footprint makes the resource comparison explicit:

| Resource          | Per execution | Eight-worker aggregate | Constrained successful capacity |
| ----------------- | ------------- | ---------------------- | ------------------------------- |
| Resident memory   | 47.8 MiB      | 382.4 MiB              | 6.1 GiB available               |
| Temporary storage | 4.40 MiB      | 35.2 MiB               | about 6.2 GiB available         |

The capacity column uses the more constrained successful reuse sample rather
than the less constrained concurrent sample. Both capacities admit more than
eight measured working sets. The processor has eight physical cores, so CPU
rather than memory or temporary storage sets the bound. The 16 logical threads
do not double the physical execution resources available to the CPU-intensive
compiler and linker work.

The complete reviewed subset retained 310 passes, 245 expected negatives, 126
unsupported profile features, and no semantic or harness failures. Its
serialized canonical manifest matched the checked-in sequential manifest byte
for byte, so *results.yaml* and the digest in *target-parity.yaml* did not
change. The run performed no retry.

| Task and path                                 | Wall    | User     | System  | CPU / wall |
| --------------------------------------------- | ------- | -------- | ------- | ---------- |
| `mise run test:test262`, reuse, eight workers | 44.57 s | 256.73 s | 89.23 s | 7.76       |

Derived from the observations, concurrent execution removed 226.07 s from the
270.64 s sequential reuse path, a reduction of 83.5 percent. The gate was 6.07
times faster, and its processor-time-to-wall ratio rose from 1.08 to 7.76.

The CLI narrows a process-start failure caused by temporary host process
resource exhaustion before the harness considers a retry. Only that diagnostic
is retried, once at most for each native variant. Deterministic toolchain
failure, temporary-directory failure, ordinary executable-launch failure, and
cleanup failure remain first-attempt harness failures. Duration, the effective
pool bound, and total retries appear in run output and failure metadata, never
in the canonical manifest.

### Applicable-test inventory check

ADR 0020 adds `mise run check:test262-inventory` to the default check gate.
The task walks the 47,381 candidate paths, parses their frontmatter, regenerates
the complete path index in memory, and compares it with the checked-in
inventory. It executes no standards case.

The isolated sample ran on the same operating system, processor, memory,
storage, and tool versions as the concurrent sample above. No native build or
other heavy test task ran at the same time.

| Task                               |   Wall |   User | System | CPU / wall |
| ---------------------------------- | -----: | -----: | -----: | ---------: |
| `mise run check:test262-inventory` | 4.93 s | 4.61 s | 1.06 s |       1.15 |

The process peaked at 364,616 KiB of resident memory. The exact-regeneration
check is retained because it detects changes to candidate paths, frontmatter,
the edition policy, and the generated index in one invariant. If it enters the
default check's critical path as the corpus grows, the replacement keeps exact
regeneration while using bounded reads or a separate CI comparison rather than
weakening the inventory validation.

### Manifest partitioning and failure classification checkpoint

The combined checkpoint ran on the following host. The memory, swap, and load
facts were recorded immediately before the exact manifest regeneration. The
temporary-storage capacity was recorded on the same host after the task.

| Fact                      | Checkpoint sample                       |
| ------------------------- | --------------------------------------- |
| Operating system          | Linux 7.1.5-201.fc44.x86\_64            |
| Processor                 | AMD Ryzen 7 7700X, 8 cores, 16 threads  |
| Memory available at start | 43 GiB                                  |
| Swap at start             | 7.1 GiB used, 925 MiB free              |
| Temporary storage         | Btrfs root volume, 930 GiB, 86 GiB free |
| Load average at start     | 1.36/0.76/0.84                          |
| Oseo target               | `linux-x86_64-gnu`                      |
| Sanitizers                | address, undefined                      |
| Zig                       | 0.16.0                                  |
| Node.js                   | 24.18.0                                 |
| Deno                      | 2.9.2                                   |

The exact regeneration used the eight-worker reviewed pool and no retry. The
ratchet measurement used the final partition format and compared it with the
single-file manifest at commit `7ddd2c6`.

| Task                                   | Wall     | User       | System     | CPU / wall |
| -------------------------------------- | -------- | ---------- | ---------- | ---------- |
| `mise run test262:update`              | 500.10 s | 2,947.07 s | 1,049.63 s | 7.99       |
| `mise run check:compatibility-ratchet` | 2.90 s   | 3.69 s     | 0.45 s     | 1.43       |

The regenerated manifest retained the pinned revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2` and all 4,861 reviewed paths. It
records exactly 2,934 passes, 1,355 expected negatives, 572 unsupported
profile features, and no semantic, harness, or infrastructure failures. The
ratchet also retained 57 generated domains, 50 distinct seeds, and an
aggregate ordinary case budget of 2,686. This checkpoint has no timing target.

Before partitioning, *results.yaml* contained 4,861 records in 155,346 lines.
After partitioning, the 3,851-line index names 1,161 nonempty files containing
154,813 lines in total. The largest partition contains 16 records and 528
lines. *target-parity.yaml* remains a seven-line entry-point record, while its
digest covers that index and every ordered partition.

### Load sensitivity

Neither baseline full-corpus run of the reviewed subset completed without
infrastructure failures on this host.

| Run | Commit    | Competing load       | Result                  |
| --- | --------- | -------------------- | ----------------------- |
| 1   | `e57a184` | Native builds        | `semantic=0 harness=3`  |
| 2   | `0bd5f38` | None from this shell | `semantic=0 harness=32` |

Every affected path was then executed in isolation through
`createReviewedManifest` and reported its expected classification: 3 of 3 for
run 1, and 32 of 32 for run 2, which reported 30 passes and 2 expected
negatives. No semantic failure occurred in either run.

The run 2 failures are contiguous in reviewed order rather than distributed by
feature, and they are `OSEO3001` native infrastructure diagnostics rather than
semantic mismatches or compile diagnostics. `OSEO3001` did not name a cause,
and the baseline runs did not measure their peak resident memory or peak
temporary storage. The host facts above are snapshots, not measurements taken
during those failing windows, so the baseline observations alone do not
identify the cause of either failure.

What the runs do establish is narrower. No semantic failure occurred. Every
affected path reported its expected classification when executed alone. The
command-line entry point removes its working directory on the failure path as
well as the success path, so the run did not accumulate directories.

The later archive-reuse checkpoint measured one reused execution at 47.8 MiB
peak process-tree resident memory and 4.40 MiB peak allocated temporary
storage. Its excluded bypass sample also observed a specific resource failure:
a competing eight-worker Node.js test drove memory in use to 55 GiB, exhausted
all 8 GiB of swap, and raised the load average above 70 before unrelated
expected passes were reported as harness failures. That observation identifies
memory and swap exhaustion for the excluded sample. It does not establish that
the earlier baseline failures had the same cause.

At the throughput baseline, `OSEO3001` mapped a resource failure and a harness
defect to one classification. Bounded concurrency therefore used the measured
reused footprint, recorded its aggregate bound, and ran without unrelated
heavy load. The combined checkpoint above now separates exhausted
infrastructure failures from harness defects after narrowing the diagnostic
that permits one retry.

### Reproduction

~~~~ sh
mise run test:test262
OSEO_RUNTIME_ARCHIVE_REUSE=disabled mise run test:test262
mise run test:property:native
mise run check:test262-inventory
~~~~

The decomposition used `zig cc` directly with the flags the toolchain
adapter builds for `linux-x86_64-gnu`, and `runNativeCli` from
*packages/cli/src/index.ts* for the complete execution. Zig maintains its
own compilation cache, so a repeated identical build may be warmer than a
first build on a clean host.

### Preserved comparison points

Later throughput work must preserve:

 -  one counted result for each upstream source path;
 -  the reviewed result order that shard reconstruction selects from;
 -  the reviewed property seeds, sizes, and case counts;
 -  execution under both specialization policies with collection forced at
    every safepoint;
 -  the strict warning, undefined-behavior, and address sanitizer flags; and
 -  the reviewed classifications recorded in the checked-in manifest.

The historical observations remain comparison points for their named
checkpoints. Current CI measurements are recorded at the start of this file.
