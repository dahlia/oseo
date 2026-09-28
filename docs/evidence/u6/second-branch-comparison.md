U6 corrected branch comparison
==============================

Sources are [36312192623] (`af9bb68c`, closest before), [36343919872]
(`e98edd15`, failed first experiment), and [36358067906] (`30dab254`, corrected
branch). The correction isolates Linux own-key and raises Linux native support
from four to five shards, keeping four shards for all other files. macOS native
support remains twelve cost-based shards; test262 remains twelve positional
shards per target. Budgets, deadlines, targets, and classifications are
unchanged.

The corrected configuration has one CI observation. Runner variance is not
separated from assignment or cache effects. The first experiment failed Linux's
property deadline and cannot establish complete coverage or clean performance;
its successful macOS families remain observations of the same macOS assignments.
Neither branch run measures the projected 41,091-path corpus.

[36312192623]: https://github.com/dahlia/oseo/actions/runs/36312192623
[36343919872]: https://github.com/dahlia/oseo/actions/runs/36343919872
[36358067906]: https://github.com/dahlia/oseo/actions/runs/36358067906


Observed tail and workload
--------------------------

Corrected run 36358067906 completes successfully with all 58 jobs passing.
Derived native job maxima from observed timestamps are 34.35 macOS and
60.52 Linux minutes, versus 51.43 and 64.83 in run 36312192623. Derived
test262 maxima are 31.67 macOS and 22.92 Linux minutes, versus 34.50 and
26.25 before. These are material observed native-tail reductions, but the
unchanged macOS cohort's variation below prevents attributing the full change
to scheduling. The first experiment's macOS test262 maximum was 35.23 minutes,
so that run did not show a test262 tail improvement over the closest baseline.

The corrected native/test262 macOS job sum is derived as 556.68 minutes,
versus 603.62 before, a difference of -46.93 using unrounded inputs. Across
all macOS jobs it is 731.40 minutes (31 jobs), versus 778.12 (29 jobs), a
derived difference of -46.72 minutes. This observation meets the few-minute
workload constraint; it does not establish repeatable savings. Dividing those
unrounded totals by five slots derives wall-clock lower bounds of 146.28 and
155.62 minutes, respectively. These are workload bounds, not run makespans.
API created-to-updated intervals derive 173.23 minutes before, 159.45 for the
failed first experiment, and 163.35 for the corrected run. Queue order and
runner variance are not separated, and the failed interval is not a clean
end-to-end performance result.

*macos-job-times.json.txt* retains every macOS job's API timestamps and each
run's created/updated timestamps. Fetch these with
`gh run view RUN --repo dahlia/oseo --json headSha,jobs` and
`gh run view RUN --repo dahlia/oseo --json createdAt,updatedAt,url`; sum
`(completedAt - startedAt)` for names containing `macos-` or `macOS`. The other
seven job definitions and totals are unchanged; Node also executes the new
partition regression tests. Their observed minutes are retained below so the
all-job sums can be reproduced.

| Job                        | 36312192623 | 36343919872 | 36358067906 |
| -------------------------- | ----------- | ----------- | ----------- |
| Node                       | 49.77       | 48.42       | 49.15       |
| Deno                       | 2.52        | 1.43        | 1.80        |
| Host C sanitizers/native   | 40.40       | 33.53       | 40.50       |
| Host C sanitizers/property | 32.68       | 35.97       | 33.05       |
| Native fixture 1/3         | 15.18       | 16.67       | 14.48       |
| Native fixture 2/3         | 14.10       | 19.38       | 16.58       |
| Native fixture 3/3         | 19.85       | 15.80       | 19.15       |


Coverage and deadline validation
--------------------------------

Both corrected native-support families report 224 passes, zero failures, skips,
or TODOs, and no interrupted property. Each selected-file union equals the full
128-file inventory and is disjoint. These checks use the retained CI selections
and current inventory; the local partition tests also prove deterministic exact
union and disjointness, including unknown files and alternate totals. Test262
path identity is established by the partition tests, not aggregate CI counts.
Both corrected test262 targets retain derived summary sums of 21,383 paths,
18,343 passes, 1,560 expected negatives, and 1,480 unsupported paths. Each
reports a derived sum of 1,312 harness objects built, versus 1,117 before;
the extra 195 preparations per target have no separate timing measurement.
All corrected comparison jobs report warm runtime archives. The closest-before
macOS native jobs are warm; macOS test262 has three cold and seven warm jobs,
and both Linux families are cold. These conditions are not controlled.

Linux own-key is the only file in corrected shard `1/5`, with one logged file
worker. Its measured case duration is 41.36 minutes; the derived margin against
the unchanged sixty-minute property deadline is 18.64 minutes. The job takes
41.97 measured minutes. It passes the unchanged generated budget: the configured
sixteen examples times extended scale ten derives 160 examples; the passing log
does not separately report that successful example count. Historical own-key
case durations vary from 33.72 to 55.43 minutes across the retained main runs.
Isolation removes sibling file processes, but one run does not isolate its
contribution to the observed duration.

Linux native job max/sum is derived from the measured job timestamps as
60.52/245.67 minutes, versus 64.83/229.38 in the closest before run. The derived
Linux workload increase is 16.28 minutes using unrounded inputs. The extra
Linux job and reduced sibling contention prioritize completion of the unchanged
property budget; they add no macOS jobs. The first experiment's failed Linux
family cannot be treated as a clean workload comparator.

macOS own-key has the same three-worker cohort and file order in both branch
runs. Its measured case duration changes from 45.07 to 33.27 minutes, a derived
11.80-minute spread without a macOS assignment change. The corresponding job
durations are 46.10 and 34.35 minutes. This variation must not be credited as an
additional scheduling improvement. The closest-before own-key case is 44.31
minutes, in a different cohort; the baseline native family maximum is 51.43
measured minutes. The distribution tables retain every shard instead of
matching changed indices as equal work.


Reproduction and limits
-----------------------

The unchanged scheduling weights come only from runs 36243816479 and
36261458909; neither branch result tunes them. *README.md* and *model.txt*
retain the option comparisons, fixed-cost estimate, and future-corpus model.
The selected twelve-way test262 estimate at 41,091 paths is 69.10/72.47 minutes,
versus 82.72/86.78 at ten shards, with 1.99/1.89 estimated added macOS fixed
minutes from those two sources. Extra harness preparation and changed workload
mix are not measured by that model. Native work is held constant in the
projection. Linux's additional native job adds zero macOS jobs.

The compact inputs retain measured case/runner durations, job timestamps,
runtime-archive state, classification counters, and failure/interruption
metadata. All table rows below are observed minutes from the named run;
aggregates and differences are derived. Outside-runner time includes setup,
builds, package evidence, input loading, and reporting; it is not isolated
fixed cost. Runtime-archive warmth is not a cold/warm Zig-cache benchmark, and
no cache hit is claimed as an improvement.

~~~~ sh
python3 docs/evidence/u6/compare-ci.py \
  docs/evidence/u6/ci-36312192623.json.txt \
  docs/evidence/u6/ci-36343919872.json.txt \
  docs/evidence/u6/ci-36358067906.json.txt
~~~~

### macos-aarch64 native support

All row durations are measured minutes from the named run.
Aggregates and outside-runner differences are derived.
Shard indices with changed assignments are not matched work.

| Run         | Shard | Verdict | Archive | Job   | Runner |
| ----------- | ----- | ------- | ------- | ----- | ------ |
| 36312192623 | 1/12  | success | warm    | 19.60 | 18.66  |
| 36312192623 | 2/12  | success | warm    | 23.00 | 22.07  |
| 36312192623 | 3/12  | success | warm    | 33.60 | 32.77  |
| 36312192623 | 4/12  | success | warm    | 31.10 | 30.15  |
| 36312192623 | 5/12  | success | warm    | 51.43 | 50.83  |
| 36312192623 | 6/12  | success | warm    | 22.85 | 21.93  |
| 36312192623 | 7/12  | success | warm    | 20.43 | 19.73  |
| 36312192623 | 8/12  | success | warm    | 20.77 | 19.79  |
| 36312192623 | 9/12  | success | warm    | 12.95 | 12.20  |
| 36312192623 | 10/12 | success | warm    | 24.35 | 23.30  |
| 36312192623 | 11/12 | success | warm    | 17.75 | 16.71  |
| 36312192623 | 12/12 | success | warm    | 29.10 | 27.82  |

Run 36312192623 derived job max/sum: 51.43/306.93 min; runner max/sum:
50.83/295.97 min; outside-runner sum: 10.96 min. Derived unique selected files:
128; native summary count sums: {‘tests’: 224, ‘pass’: 224, ‘fail’: 0,
‘skipped’: 0, ‘todo’: 0}. Derived file case-sum min/median/p90/max min:
0.00/4.85/11.41/44.31

| Run         | Shard | Verdict | Archive | Job   | Runner |
| ----------- | ----- | ------- | ------- | ----- | ------ |
| 36343919872 | 1/12  | success | warm    | 46.10 | 45.08  |
| 36343919872 | 2/12  | success | warm    | 20.52 | 19.70  |
| 36343919872 | 3/12  | success | warm    | 16.87 | 16.16  |
| 36343919872 | 4/12  | success | warm    | 25.35 | 24.47  |
| 36343919872 | 5/12  | success | warm    | 18.23 | 17.54  |
| 36343919872 | 6/12  | success | warm    | 20.83 | 19.81  |
| 36343919872 | 7/12  | success | warm    | 23.47 | 22.69  |
| 36343919872 | 8/12  | success | warm    | 19.90 | 19.28  |
| 36343919872 | 9/12  | success | warm    | 23.18 | 22.41  |
| 36343919872 | 10/12 | success | warm    | 21.67 | 20.71  |
| 36343919872 | 11/12 | success | warm    | 20.75 | 19.99  |
| 36343919872 | 12/12 | success | warm    | 20.07 | 19.11  |

Run 36343919872 derived job max/sum: 46.10/276.93 min; runner max/sum:
45.08/266.93 min; outside-runner sum: 10.00 min. Derived unique selected files:
128; native summary count sums: {‘tests’: 224, ‘pass’: 224, ‘fail’: 0,
‘skipped’: 0, ‘todo’: 0}. Derived file case-sum min/median/p90/max min:
0.00/4.52/9.69/45.07

| Run         | Shard | Verdict | Archive | Job   | Runner |
| ----------- | ----- | ------- | ------- | ----- | ------ |
| 36358067906 | 1/12  | success | warm    | 34.35 | 33.28  |
| 36358067906 | 2/12  | success | warm    | 19.08 | 18.16  |
| 36358067906 | 3/12  | success | warm    | 23.40 | 22.61  |
| 36358067906 | 4/12  | success | warm    | 23.27 | 22.46  |
| 36358067906 | 5/12  | success | warm    | 24.50 | 23.48  |
| 36358067906 | 6/12  | success | warm    | 23.10 | 22.13  |
| 36358067906 | 7/12  | success | warm    | 19.03 | 18.20  |
| 36358067906 | 8/12  | success | warm    | 20.12 | 19.27  |
| 36358067906 | 9/12  | success | warm    | 20.48 | 19.73  |
| 36358067906 | 10/12 | success | warm    | 19.30 | 18.56  |
| 36358067906 | 11/12 | success | warm    | 23.30 | 22.19  |
| 36358067906 | 12/12 | success | warm    | 23.55 | 22.44  |

Run 36358067906 derived job max/sum: 34.35/273.48 min; runner max/sum:
33.28/262.51 min; outside-runner sum: 10.97 min. Derived unique selected files:
128; native summary count sums: {‘tests’: 224, ‘pass’: 224, ‘fail’: 0,
‘skipped’: 0, ‘todo’: 0}. Derived file case-sum min/median/p90/max min:
0.00/4.74/11.86/33.27

### macos-aarch64 test262

All row durations are measured minutes from the named run.
Aggregates and outside-runner differences are derived.
Shard indices with changed assignments are not matched work.

| Run         | Shard | Verdict | Archive | Job   | Runner |
| ----------- | ----- | ------- | ------- | ----- | ------ |
| 36312192623 | 1/10  | success | warm    | 27.78 | 26.71  |
| 36312192623 | 2/10  | success | warm    | 26.05 | 24.95  |
| 36312192623 | 3/10  | success | warm    | 34.38 | 33.25  |
| 36312192623 | 4/10  | success | warm    | 32.28 | 31.37  |
| 36312192623 | 5/10  | success | cold    | 26.35 | 24.98  |
| 36312192623 | 6/10  | success | cold    | 34.50 | 33.01  |
| 36312192623 | 7/10  | success | warm    | 30.68 | 29.52  |
| 36312192623 | 8/10  | success | warm    | 29.98 | 28.77  |
| 36312192623 | 9/10  | success | cold    | 27.07 | 26.16  |
| 36312192623 | 10/10 | success | warm    | 27.60 | 26.50  |

Run 36312192623 derived job max/sum: 34.50/296.68 min; runner max/sum:
33.25/285.21 min; outside-runner sum: 11.47 min. Derived classification count
sums: {‘tests’: 21383, ‘pass’: 18343, ‘expected-negative’: 1560, ‘unsupported’:
1480}; derived sum objectsBuilt: 1117.

| Run         | Shard | Verdict | Archive | Job   | Runner |
| ----------- | ----- | ------- | ------- | ----- | ------ |
| 36343919872 | 1/12  | success | warm    | 35.23 | 33.88  |
| 36343919872 | 2/12  | success | warm    | 24.18 | 23.06  |
| 36343919872 | 3/12  | success | warm    | 22.35 | 21.27  |
| 36343919872 | 4/12  | success | warm    | 28.75 | 27.36  |
| 36343919872 | 5/12  | success | warm    | 22.93 | 22.10  |
| 36343919872 | 6/12  | success | warm    | 25.73 | 24.57  |
| 36343919872 | 7/12  | success | warm    | 31.78 | 30.48  |
| 36343919872 | 8/12  | success | warm    | 27.40 | 26.41  |
| 36343919872 | 9/12  | success | warm    | 27.05 | 25.98  |
| 36343919872 | 10/12 | success | warm    | 17.35 | 16.53  |
| 36343919872 | 11/12 | success | warm    | 22.12 | 21.09  |
| 36343919872 | 12/12 | success | warm    | 21.10 | 20.10  |

Run 36343919872 derived job max/sum: 35.23/305.98 min; runner max/sum:
33.88/292.84 min; outside-runner sum: 13.15 min. Derived classification count
sums: {‘tests’: 21383, ‘pass’: 18343, ‘expected-negative’: 1560, ‘unsupported’:
1480}; derived sum objectsBuilt: 1312.

| Run         | Shard | Verdict | Archive | Job   | Runner |
| ----------- | ----- | ------- | ------- | ----- | ------ |
| 36358067906 | 1/12  | success | warm    | 23.43 | 22.33  |
| 36358067906 | 2/12  | success | warm    | 24.27 | 23.33  |
| 36358067906 | 3/12  | success | warm    | 19.50 | 18.43  |
| 36358067906 | 4/12  | success | warm    | 21.30 | 20.41  |
| 36358067906 | 5/12  | success | warm    | 22.43 | 21.44  |
| 36358067906 | 6/12  | success | warm    | 24.95 | 23.80  |
| 36358067906 | 7/12  | success | warm    | 24.45 | 23.45  |
| 36358067906 | 8/12  | success | warm    | 31.67 | 30.38  |
| 36358067906 | 9/12  | success | warm    | 18.88 | 17.88  |
| 36358067906 | 10/12 | success | warm    | 26.77 | 25.38  |
| 36358067906 | 11/12 | success | warm    | 21.85 | 20.81  |
| 36358067906 | 12/12 | success | warm    | 23.70 | 22.60  |

Run 36358067906 derived job max/sum: 31.67/283.20 min; runner max/sum:
30.38/270.24 min; outside-runner sum: 12.96 min. Derived classification count
sums: {‘tests’: 21383, ‘pass’: 18343, ‘expected-negative’: 1560, ‘unsupported’:
1480}; derived sum objectsBuilt: 1312.

### linux-x86\_64-gnu native support

All row durations are measured minutes from the named run.
Aggregates and outside-runner differences are derived.
Shard indices with changed assignments are not matched work.

| Run         | Shard | Verdict | Archive | Job   | Runner |
| ----------- | ----- | ------- | ------- | ----- | ------ |
| 36312192623 | 1/4   | success | cold    | 52.95 | 52.23  |
| 36312192623 | 2/4   | success | cold    | 64.83 | 64.26  |
| 36312192623 | 3/4   | success | cold    | 62.33 | 62.02  |
| 36312192623 | 4/4   | success | cold    | 49.27 | 48.73  |

Run 36312192623 derived job max/sum: 64.83/229.38 min; runner max/sum:
64.26/227.24 min; outside-runner sum: 2.14 min. Derived unique selected files:
128; native summary count sums: {‘tests’: 224, ‘pass’: 224, ‘fail’: 0,
‘skipped’: 0, ‘todo’: 0}. Derived file case-sum min/median/p90/max min:
0.00/5.39/12.78/33.72

| Run         | Shard | Verdict | Archive | Job   | Runner |
| ----------- | ----- | ------- | ------- | ----- | ------ |
| 36343919872 | 1/4   | failure | warm    | 65.20 | 64.53  |
| 36343919872 | 2/4   | success | warm    | 65.15 | 64.80  |
| 36343919872 | 3/4   | success | warm    | 64.27 | 63.92  |
| 36343919872 | 4/4   | success | warm    | 67.85 | 67.50  |

Run 36343919872 derived job max/sum: 67.85/262.47 min; runner max/sum:
67.50/260.76 min; outside-runner sum: 1.71 min. Derived unique selected files:
128; native summary count sums: {‘tests’: 224, ‘pass’: 223, ‘fail’: 1,
‘skipped’: 0, ‘todo’: 0}. Derived file case-sum min/median/p90/max min:
0.00/6.56/14.57/60.00 FAILED/INCOMPLETE family; interrupted durations are
censored and generated budgets incomplete.

| Run         | Shard | Verdict | Archive | Job   | Runner |
| ----------- | ----- | ------- | ------- | ----- | ------ |
| 36358067906 | 1/5   | success | warm    | 41.97 | 41.36  |
| 36358067906 | 2/5   | success | warm    | 60.52 | 60.17  |
| 36358067906 | 3/5   | success | warm    | 45.85 | 45.47  |
| 36358067906 | 4/5   | success | warm    | 37.38 | 37.03  |
| 36358067906 | 5/5   | success | warm    | 59.95 | 59.50  |

Run 36358067906 derived job max/sum: 60.52/245.67 min; runner max/sum:
60.17/243.54 min; outside-runner sum: 2.13 min. Derived unique selected files:
128; native summary count sums: {‘tests’: 224, ‘pass’: 224, ‘fail’: 0,
‘skipped’: 0, ‘todo’: 0}. Derived file case-sum min/median/p90/max min:
0.00/5.26/10.92/41.36

### linux-x86\_64-gnu test262

All row durations are measured minutes from the named run.
Aggregates and outside-runner differences are derived.
Shard indices with changed assignments are not matched work.

| Run         | Shard | Verdict | Archive | Job   | Runner |
| ----------- | ----- | ------- | ------- | ----- | ------ |
| 36312192623 | 1/10  | success | cold    | 19.88 | 19.08  |
| 36312192623 | 2/10  | success | cold    | 24.30 | 18.71  |
| 36312192623 | 3/10  | success | cold    | 15.47 | 14.80  |
| 36312192623 | 4/10  | success | cold    | 25.22 | 24.33  |
| 36312192623 | 5/10  | success | cold    | 11.52 | 10.90  |
| 36312192623 | 6/10  | success | cold    | 26.25 | 25.47  |
| 36312192623 | 7/10  | success | cold    | 20.05 | 19.51  |
| 36312192623 | 8/10  | success | cold    | 13.95 | 12.94  |
| 36312192623 | 9/10  | success | cold    | 15.03 | 14.36  |
| 36312192623 | 10/10 | success | cold    | 15.35 | 14.60  |

Run 36312192623 derived job max/sum: 26.25/187.02 min; runner max/sum:
25.47/174.71 min; outside-runner sum: 12.31 min. Derived classification count
sums: {‘tests’: 21383, ‘pass’: 18343, ‘expected-negative’: 1560, ‘unsupported’:
1480}; derived sum objectsBuilt: 1117.

| Run         | Shard | Verdict | Archive | Job   | Runner |
| ----------- | ----- | ------- | ------- | ----- | ------ |
| 36343919872 | 1/12  | success | warm    | 16.63 | 15.98  |
| 36343919872 | 2/12  | success | warm    | 16.62 | 16.00  |
| 36343919872 | 3/12  | success | warm    | 9.47  | 8.90   |
| 36343919872 | 4/12  | success | warm    | 16.70 | 16.12  |
| 36343919872 | 5/12  | success | warm    | 21.52 | 20.91  |
| 36343919872 | 6/12  | success | warm    | 21.63 | 21.05  |
| 36343919872 | 7/12  | success | warm    | 13.17 | 12.62  |
| 36343919872 | 8/12  | success | warm    | 13.48 | 12.94  |
| 36343919872 | 9/12  | success | warm    | 10.15 | 9.67   |
| 36343919872 | 10/12 | success | warm    | 13.37 | 12.74  |
| 36343919872 | 11/12 | success | warm    | 16.43 | 15.86  |
| 36343919872 | 12/12 | success | warm    | 12.18 | 11.65  |

Run 36343919872 derived job max/sum: 21.63/181.35 min; runner max/sum:
21.05/174.42 min; outside-runner sum: 6.93 min. Derived classification count
sums: {‘tests’: 21383, ‘pass’: 18343, ‘expected-negative’: 1560, ‘unsupported’:
1480}; derived sum objectsBuilt: 1312.

| Run         | Shard | Verdict | Archive | Job   | Runner |
| ----------- | ----- | ------- | ------- | ----- | ------ |
| 36358067906 | 1/12  | success | warm    | 10.55 | 10.11  |
| 36358067906 | 2/12  | success | warm    | 16.28 | 15.62  |
| 36358067906 | 3/12  | success | warm    | 15.63 | 15.06  |
| 36358067906 | 4/12  | success | warm    | 9.97  | 9.50   |
| 36358067906 | 5/12  | success | warm    | 11.60 | 11.11  |
| 36358067906 | 6/12  | success | warm    | 17.57 | 16.99  |
| 36358067906 | 7/12  | success | warm    | 16.67 | 16.11  |
| 36358067906 | 8/12  | success | warm    | 22.92 | 22.19  |
| 36358067906 | 9/12  | success | warm    | 17.02 | 16.46  |
| 36358067906 | 10/12 | success | warm    | 16.25 | 15.61  |
| 36358067906 | 11/12 | success | warm    | 16.45 | 15.83  |
| 36358067906 | 12/12 | success | warm    | 17.20 | 15.99  |

Run 36358067906 derived job max/sum: 22.92/188.10 min; runner max/sum:
22.19/180.56 min; outside-runner sum: 7.54 min. Derived classification count
sums: {‘tests’: 21383, ‘pass’: 18343, ‘expected-negative’: 1560, ‘unsupported’:
1480}; derived sum objectsBuilt: 1312.
