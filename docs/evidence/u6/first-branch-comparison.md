U6 first branch comparison
==========================

Source runs are [36312192623] (`af9bb68c`, before) and [36343919872]
(`e98edd15`, first branch experiment). The latter completed with failure:
Linux own-key interrupted its unchanged generated budget. This is one after
run, so runner variance is not separated. Native shard indices contain
different files; test262 totals changed from ten to twelve.

The per-shard tables below retain every comparison job. Native file inventories
are derived as equal/disjoint unions of 128 selected paths on each host in both
runs; Linux's first branch still has an incomplete generated budget. Both
test262 targets retain derived summary sums of 21,383 paths, 18,343 passes,
1,560 expected negatives, and 1,480 unsupported paths. Local partition tests
prove exact path/file union and disjointness; CI summary counts alone do not
prove path identity.

All first-branch comparison jobs observed warm runtime archives. Before-run
macOS native support was also warm; macOS test262 had three cold and seven warm
jobs. Both before-run Linux families were cold. These are runtime archive
observations, not separately measured cold/warm Zig-cache benchmarks. No cache
hit or isolated scheduling gain is claimed.

The derived macOS native job max fell from 51.43 to 46.10 minutes, and its
job sum from 306.93 to 276.93 minutes. Test262 max rose from 34.50 to 35.23,
and its job sum from 296.68 to 305.98 minutes. Their combined derived sum fell
from 603.62 to 582.92 minutes, a difference of -20.70 minutes using unrounded
inputs. This is compatible with the workload constraint in this observation,
but is not an isolated improvement measurement. The test262 tail does not show
a macOS improvement against this closest before run. The twelve-shard timeout
projection remains an estimate, not a measured doubled corpus.

Measured harness-object counters derive target sums of 1,117 before and
1,312 after, an increase of 195 objects per target. Their preparation cost is
inside the runner interval and has not been separately measured. The
outside-runner differences below include setup, builds, package evidence,
input loading and reporting, and must not be called pure fixed cost.

Other macOS jobs were unchanged. Their measured elapsed minutes from the same
run API job timestamps are retained here to make full-workload sums auditable:

| Job                        | 36312192623 | 36343919872 |
| -------------------------- | ----------- | ----------- |
| Node                       | 49.77       | 48.42       |
| Deno                       | 2.52        | 1.43        |
| Host C sanitizers/native   | 40.40       | 33.53       |
| Host C sanitizers/property | 32.68       | 35.97       |
| Native fixture 1/3         | 15.18       | 16.67       |
| Native fixture 2/3         | 14.10       | 19.38       |
| Native fixture 3/3         | 19.85       | 15.80       |

Across all macOS jobs, derived workload is 778.12 minutes before (29 jobs)
and 754.12 after (31 jobs), a difference of -24.00 minutes. Dividing unrounded
workload by five slots derives wall-clock lower bounds of 155.62 and 150.82
minutes, respectively. These are lower bounds, not measured run makespans or
scheduling savings, and include variation in unchanged jobs.

Reproduce the following tables from the retained compact inputs:

~~~~ sh
python3 docs/evidence/u6/compare-ci.py \
  docs/evidence/u6/ci-36312192623.json.txt \
  docs/evidence/u6/ci-36343919872.json.txt
~~~~

[36312192623]: https://github.com/dahlia/oseo/actions/runs/36312192623
[36343919872]: https://github.com/dahlia/oseo/actions/runs/36343919872

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
