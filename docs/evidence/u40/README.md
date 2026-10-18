Hosted macOS lane placement (U40)
=================================

Main run 39084043803 finished 12.31 minutes above the lower bound its five
hosted macOS lanes imply. Its six Mac lanes ran 5.21 minutes above theirs
and still finished 13.73 minutes before the run ended. This records why,
and what changed.


What the placement did
----------------------

`macosLanes` in *tools/generate-macos-lanes.ts* walks the jobs in
descending hosted median and gives each one the lane whose projected
finish is earliest. A job a Mac lane can run compares an empty Mac lane,
which costs the 60-second readiness allowance plus its Mac wall, against
an empty hosted lane, which costs its whole hosted median. The Mac lane
wins until the Mac lanes are loaded past that median. At that crossover
the three next jobs took the three hosted lanes the sanitizer suites had
left empty, one job each, and the four Node `test` shards, which no Mac
lane can run, were then stacked behind them.

Run 39084043803 measured what that cost. `test262 (macos-aarch64, 8/12)`,
`native support (macos-aarch64, 7/12)`, and
`native support (macos-aarch64, 8/12)` took 30.80, 29.33, and 33.33
minutes on hosted `macos-15` runners against an 8.30-minute mean over the
30 jobs that ran on Mac lanes. `test (macos-latest, node, 3/4)` was
chained behind the slowest of the three, started at 38.43 minutes, and
ended the run at 60.43.

The placement is static. The readiness probe chooses a runner class for
the six Mac lanes only; these three jobs carry a literal
`runs-on: macos-15` and no `mac_ready` dependency, so the same three lanes
hold the same three jobs in every run from one generated file.


The ordering change
-------------------

Jobs no Mac lane can run are now placed before the rest whenever a Mac
lane exists. Their lanes are loaded first, so an eligible job projecting a
finish on a hosted lane sees that load instead of an empty lane, and the
projection stops understating what following a hosted-only job costs. With
no Mac lane configured, every job is hosted and the descending order is
the LPT partition, so the order is unchanged there.

Derived maximum lane end over eleven lanes, by combination:

| cost table | order                  | derived max |
| ---------- | ---------------------- | ----------- |
| superseded | eligible jobs first    | 49.10       |
| refreshed  | eligible jobs first    | 50.72       |
| superseded | hosted-only jobs first | 44.24       |
| refreshed  | hosted-only jobs first | 43.53       |

The ordering carries the change. The refreshed table on its own raises the
derived maximum, because it raises `host C sanitizers (macOS, property)`
and `test (macos-latest, node, 3/4)`, which set a hosted lane's ceiling in
either order. These are derived minutes under one cost function, not a
measurement of either arrangement.


Refreshed hosted medians
------------------------

Hosted walls, `started_at` to `completed_at`, from the 22 run attempts
between 2026-10-14T15:52Z and 2026-10-18T00:47Z. Seconds.

| job                                    | superseded | refreshed | n   | min  | max  |
| -------------------------------------- | ---------- | --------- | --- | ---- | ---- |
| `host C sanitizers (macOS, native)`    | 2492       | 2478      | 22  | 2144 | 2765 |
| `host C sanitizers (macOS, property)`  | 2092       | 2179      | 22  | 1559 | 2803 |
| `test (macos-latest, node, 3/4)`       | 1122       | 1311      | 18  | 1036 | 1533 |
| `test (macos-latest, node, 2/4)`       | 1050       | 996       | 18  | 830  | 1282 |
| `test (macos-latest, node, 1/4)`       | 1037       | 971       | 18  | 667  | 1057 |
| `test (macos-latest, node, 4/4)`       | 854        | 864       | 18  | 372  | 1053 |
| `test (macos-latest, deno)`            | 107        | 105       | 22  | 65   | 133  |
| `native support (macos-aarch64, 8/12)` | 1499       | 1963      | 3   | 1861 | 2000 |
| `native support (macos-aarch64, 7/12)` | 1501       | 1553      | 3   | 1480 | 1760 |
| `test262 (macos-aarch64, 8/12)`        | 1507       | 1543      | 3   | 1287 | 1848 |

The seven jobs with eighteen or twenty-two observations belong to families
no Mac lane runs, so every attempt observed them hosted. The three with
three observations are the ones placement sent hosted, and their window
starts at `b59ac914`: the macOS file shards dropped the two case-sharded
files at `c78d9df1` and were repartitioned at `b59ac914`, so shard 8/12
held twelve different files before and after, with two in common. A longer
window would average two partitions. Three observations estimate no
run-to-run variation, and U39 measured a derived property weight moving by
up to 3.34 times between two runs two hours apart, so these three entries
are the least settled in the table.

`native support (macos-aarch64, 8/12)` moved furthest, from 1,499 to
1,963 seconds. Its earlier value was a single observation of a partition
that no longer exists. The other nine moved by under eleven percent, which
is the useful result: the always-hosted entries were already close, and
the single-observation entries were not.


What the first run measured
---------------------------

Branch run 39104204370 at `731ffba9` is green and ran the new order. The
four Node `test` shards started within ten seconds of the run and were
done by 24.57 minutes; in run 39084043803 one of them ended the run at
60.43. That part worked.

The run still took 60.17 minutes, and the hosted lanes are still why.

| hosted lane                                                   | derived end | measured end |
| ------------------------------------------------------------- | ----------- | ------------ |
| `host C sanitizers (macOS, native)`                           | 41.30       | 39.28        |
| sanitizers property, `reflect cases (macos-aarch64, 3/3)`     | 41.92       | 59.78        |
| `test` node 3/4, `native (macos-aarch64, 1/3)`                | 40.47       | 39.52        |
| `test` node 2/4, deno, `native support (macos-aarch64, 5/12)` | 40.15       | 56.07        |
| `test` node 1/4, node 4/4, `reflect cases` 1/3 and 2/3        | 41.78       | 58.17        |

The ordering change freed slack under the sanitizer ceiling, and the
placement filled it with Mac-eligible jobs whose hosted entries were the
two kinds this table calls least trustworthy. Hosted wall against table
value for every job the run placed hosted:

| job                                    | table | measured | ratio |
| -------------------------------------- | ----- | -------- | ----- |
| `reflect cases (macos-aarch64, 1/3)`   | 336   | 777      | 2.31  |
| `reflect cases (macos-aarch64, 3/3)`   | 336   | 770      | 2.29  |
| `reflect cases (macos-aarch64, 2/3)`   | 336   | 696      | 2.07  |
| `native support (macos-aarch64, 5/12)` | 1308  | 2063     | 1.58  |
| `host C sanitizers (macOS, property)`  | 2179  | 2641     | 1.21  |
| `native (macos-aarch64, 1/3)`          | 1117  | 1105     | 0.99  |
| `test (macos-latest, node, 2/4)`       | 996   | 949      | 0.95  |
| `host C sanitizers (macOS, native)`    | 2478  | 2351     | 0.95  |
| `test (macos-latest, node, 3/4)`       | 1311  | 1160     | 0.88  |
| `test (macos-latest, deno)`            | 105   | 86       | 0.82  |
| `test (macos-latest, node, 4/4)`       | 864   | 690      | 0.80  |
| `test (macos-latest, node, 1/4)`       | 971   | 767      | 0.79  |

The split is along vintage, not along family. Every entry with eighteen or
more observations, and the four-observation `native (macos-aarch64, 1/3)`,
measured between 0.79 and 1.21 times its value. The three `reflect cases`
estimates and the retained `native support (macos-aarch64, 5/12)` are the
only entries above 1.21, and they are the two the table flagged: U38
derived the `reflect cases` figures without any hosted observation, and
the retained entry predates the `b59ac914` repartition. Those four are now
refreshed from this run, one observation each. The derived maximum lane
end moves from 43.53 to 43.50, and the placement sends
`native support (macos-aarch64, 5/12)` and two `reflect cases` shards to
Mac lanes.

Two terms the model still does not carry. A hosted macOS job starting
mid-run waits for a machine: the gaps between consecutive jobs in a lane
were 0.12, 0.12, 0.14, 0.73, 1.68, and 3.54 minutes, and then 8.93 before
`reflect cases (macos-aarch64, 1/3)`, with four of the five hosted lanes
free of other work at that moment, so the wait was allocation and not the
five-lane limit. And the pools other than hosted macOS now bound the run
near where it already runs: the Mac lanes carried 262.45 job-minutes over
28 jobs and finished at 50.18, and the longest Linux file shard measured
46.05. The `native` aggregate ended the run at 60.17 waiting on
`reflect cases (macos-aarch64, 3/3)`.


What the second run measured
----------------------------

Branch run 39108338578 at `5c8e8e56` is green and took 56.98 minutes,
against 60.17 for the first run of this order and 60.43 for the last main
run under the old one. The self-hosted Mac lanes, not the hosted lanes,
determined when it finished.

Every job placed on a hosted lane measured between 0.78 and 1.20 times
its table value, the range the previous run's well-observed entries held:

| job                                    | table | measured | ratio |
| -------------------------------------- | ----- | -------- | ----- |
| `test (macos-latest, deno)`            | 105   | 126      | 1.20  |
| `native (macos-aarch64, 1/3)`          | 1117  | 1242     | 1.11  |
| `test (macos-latest, node, 2/4)`       | 996   | 1096     | 1.10  |
| `host C sanitizers (macOS, native)`    | 2478  | 2372     | 0.96  |
| `test (macos-latest, node, 4/4)`       | 864   | 825      | 0.95  |
| `native support (macos-aarch64, 3/12)` | 1323  | 1232     | 0.93  |
| `test (macos-latest, node, 3/4)`       | 1311  | 1165     | 0.89  |
| `reflect cases (macos-aarch64, 3/3)`   | 770   | 640      | 0.83  |
| `test (macos-latest, node, 1/4)`       | 971   | 786      | 0.81  |
| `host C sanitizers (macOS, property)`  | 2179  | 1700     | 0.78  |

`reflect cases (macos-aarch64, 3/3)` is the one entry here that the
previous run refreshed, and it is the only `reflect cases` shard this
placement leaves hosted. In this run it measured 0.83 times its table
value; the earlier observation was 2.29 times the U38 estimate it
replaced. The retained `native support (macos-aarch64, 3/12)` has no
refresh and measured 0.93.

Three of the five lanes finished at or before their derived end. Lane
four exceeded it by 0.98 minutes and lane three by 13.80:

| hosted lane                                                     | derived | measured |
| --------------------------------------------------------------- | ------- | -------- |
| `host C sanitizers (macOS, native)`                             | 41.30   | 39.65    |
| `host C sanitizers (macOS, property)`                           | 36.32   | 31.85    |
| `test` node 3/4, `native (macos-aarch64, 1/3)`                  | 40.47   | 54.27    |
| `test` node 2/4, deno, `native support (macos-aarch64, 3/12)`   | 40.40   | 41.38    |
| `test` node 1/4, node 4/4, `reflect cases (macos-aarch64, 3/3)` | 43.42   | 37.90    |

Lane three's two jobs took 0.35 minutes less than their combined table
values. Its 12.87-minute wait before the first job started and the
1.28-minute gap between the two account for the overrun after that
saving. No other hosted lane waited more than 3.52 minutes to start.

The six Mac lanes carried 290.18 job-minutes over 30 jobs, with 0.18 to
0.20 minutes of idle each, and their ends ran from 35.47 to 56.58:

| lane         | work  | end   |
| ------------ | ----- | ----- |
| `oseo-mac-3` | 55.98 | 56.58 |
| `oseo-mac-4` | 52.93 | 53.52 |
| `oseo-mac-5` | 50.32 | 50.92 |
| `oseo-mac-6` | 48.20 | 48.80 |
| `oseo-mac-2` | 47.87 | 48.45 |
| `oseo-mac-1` | 34.88 | 35.47 |

The `native` aggregate ended the run at 56.95 waiting on
`test262 (macos-aarch64, 12/12)`, the last job on `oseo-mac-3`. Dividing
the observed work equally gives 48.36 minutes per lane, or 48.76
including the 0.40-minute probe. That idealized figure sits about eight
minutes below the latest Mac lane finish, and it assumes work is
divisible and that durations do not change when a job moves to another
lane. The longest Linux file shard took 47.58 minutes.

The cost inputs may explain part of the imbalance.
`selfHostedJobSeconds` holds 18 measured Mac walls, all of them from
`oseo-mac-1`; every other job converts a hosted median through a family
speed ratio. Mean measured-to-table ratios in this run were 0.92, 1.38,
1.91, 2.11, 1.98, and 1.77 for lanes one through six, over four, three,
three, three, two, and two entries. These averages do not separate job
mix, machine speed, and contention between the two lanes that share a Mac
mini. The next unit starts from this run's 30 durations and lane
assignments, which support a cost refresh but do not establish how a job
would perform on a different lane.


What the merged run measured
----------------------------

Main run 39112383050 at `2b3eb0af` is green and took 58.67 minutes,
against 60.43 for the previous main run.

Every hosted lane's first job started within 0.18 minutes of the run, and
no gap between consecutive jobs in a lane exceeded 0.15 minutes. The
branch run's 12.87-minute initial wait did not recur. Hosted durations
against table value were 0.82, 0.95, 0.96, 0.98, 1.04, 1.04, 1.11, 1.14,
1.27, and 1.44.

The Mac lanes bound the run again with the same shape, carrying 294.90
job-minutes over 30 jobs with at most 0.20 minutes of idle each:

| lane         | work  | end   |
| ------------ | ----- | ----- |
| `oseo-mac-3` | 57.67 | 58.25 |
| `oseo-mac-4` | 54.95 | 55.53 |
| `oseo-mac-6` | 50.78 | 51.35 |
| `oseo-mac-5` | 50.72 | 51.27 |
| `oseo-mac-2` | 46.77 | 47.35 |
| `oseo-mac-1` | 34.02 | 34.60 |

Equal division gives 49.15 minutes per lane. The longest Linux file shard
measured 46.27 minutes, 1.31 below the second branch run.

The 1.44 ratio is `host C sanitizers (macOS, property)`, and its spread
is the one hosted figure that now matters. Its last four observations are
2,501, 2,641, 1,700, and 3,146 seconds, a factor of 1.85 between the
smallest and the largest, against a 2,179-second median over 22
observations. At 3,146 seconds it took 52.43 minutes and finished 52.62
minutes into the run, the latest hosted finish. With that finish
unchanged, balancing the Mac lanes alone could not have brought the run
below 52.62. Under the current cost model the family stays hosted: it
converts at 2.9, against the 3.2 and 4.2 of the families it would
displace. Splitting the job is one option to measure.
