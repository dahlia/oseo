Linux duration and the binding macOS side (U44)
===============================================

U43 landed as `0dca3e8f` and its main run, 39154284680, passed in 63.50
minutes against 50.60 for the branch run of the same tree. The U43 record
left one question open. Across the twelve runs it covered,
`test (ubuntu-latest, node)` took 24.72 to 36.17 minutes in six runs and
48.18 to 49.30 in the other six, with nothing in between, and what
accounted for the difference was not established. This record locates the
difference, measures what sharding the job would return, and refreshes the
three entries run 39154284680 observed hosted.

The window is the thirteen main and branch runs since `b59ac914`, the
repartition that last changed macOS shard contents: 39076279469,
39080313970, 39084043803, 39104204370, 39108338578, 39112383050,
39121592150, 39126360392, 39132976769, 39139466097, 39144030177,
39149674951, and 39154284680. Run 39154284680 falls in the longer group.


Where the Linux job spends its minutes
--------------------------------------

`mise run test:node` accounts for all but 16 to 23 seconds of the job in
each of the thirteen runs, so the checkout, mise, and cache steps account
for almost none of the spread.

| run         | region           | `Finished in` (s) | longest test (s) |
| ----------- | ---------------- | ----------------- | ---------------- |
| 39132976769 | `southcentralus` | 1,462.97          | 271              |
| 39139466097 | `westus2`        | 1,582.64          | 290              |
| 39108338578 | `westus3`        | 2,069.41          | 382              |
| 39112383050 | `westus3`        | 2,092.57          | 395              |
| 39080313970 | `westus3`        | 2,129.93          | 411              |
| 39104204370 | `westus3`        | 2,146.02          | 405              |
| 39084043803 | `eastus`         | 2,871.78          | 535              |
| 39144030177 | `westus2`        | 2,892.94          | 537              |
| 39154284680 | `westus`         | 2,894.24          | 541              |
| 39121592150 | `westcentralus`  | 2,896.33          | 529              |
| 39076279469 | `eastus`         | 2,896.56          | 541              |
| 39149674951 | `northcentralus` | 2,907.41          | 541              |
| 39126360392 | `westus2`        | 2,931.85          | 562              |

The longest test, `fixed compound member references follow the ECMA-262 model`,
tracks the suite. Its share of `Finished in` is 0.185 in run 39132976769 and
0.187 in run 39149674951, the two runs compared below.

Over the 1,623 test names both runs report, the later duration divided by
the earlier has a median of 1.98 among the 146 tests that took more than 10
seconds in the earlier run, with quartiles of 1.92 and 2.04. The whole
expensive part of the suite moved by one factor. The 654 tests under 1
millisecond in the earlier run have a median ratio of 1.75 with quartiles
of 1.42 and 2.08: slower in the same direction, but at that scale the
measurements are too coarse to carry a factor, and whether a short test
also waits on a worker slot is not resolved here.

The fields the logs report do not separate the two groups. The runner image
was `20261012.334.1` and the hosted compute agent `20261012.601` in all
thirteen runs, and the Azure region differs within each group rather than
between them: `westus2` served both the 1,582.64-second run and the
2,931.85-second run.


Duration ratios across the nine long Linux jobs
-----------------------------------------------

Nine Linux jobs run long enough to decide when the Linux side finishes:
`test (ubuntu-latest, node)` (`ubu` below),
`host C sanitizers (Linux, property)` (`san`), and the seven
`native support (linux-x86_64-gnu, k/7)` shards. Each cell is the job's
duration in that run divided by its own fastest duration over the thirteen.
The spread column is computed from unrounded ratios, so it need not equal
the difference of the rounded cells beside it.

| run         | ubu  | san  | 1/7  | 2/7  | 3/7  | 4/7  | 5/7  | 6/7  | 7/7  | spread |
| ----------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ------ |
| 39076279469 | 1.97 | 1.58 | 1.87 | 1.00 | 1.00 | 1.91 | 1.40 | 1.03 | 1.77 | 0.97   |
| 39080313970 | 1.45 | 1.90 | 1.00 | 1.60 | 1.87 | 1.90 | 1.40 | 1.04 | 1.60 | 0.90   |
| 39084043803 | 1.95 | 1.36 | 1.85 | 1.67 | 1.83 | 1.01 | 1.00 | 1.87 | 1.79 | 0.95   |
| 39104204370 | 1.46 | 1.59 | 1.84 | 1.90 | 1.83 | 1.90 | 1.51 | 1.37 | 1.00 | 0.90   |
| 39108338578 | 1.41 | 1.59 | 1.86 | 1.44 | 1.84 | 1.90 | 1.49 | 1.84 | 1.40 | 0.49   |
| 39112383050 | 1.43 | 1.00 | 1.13 | 1.95 | 1.83 | 1.39 | 1.52 | 1.56 | 1.73 | 0.95   |
| 39121592150 | 1.97 | 1.60 | 1.87 | 1.89 | 1.83 | 1.58 | 1.51 | 1.00 | 1.75 | 0.97   |
| 39126360392 | 1.99 | 1.38 | 1.86 | 1.57 | 1.67 | 1.90 | 1.10 | 1.85 | 1.03 | 0.97   |
| 39132976769 | 1.00 | 1.83 | 1.81 | 1.91 | 1.33 | 1.63 | 1.52 | 1.85 | 1.76 | 0.91   |
| 39139466097 | 1.08 | 1.06 | 1.84 | 1.90 | 1.60 | 1.88 | 1.11 | 1.86 | 1.76 | 0.84   |
| 39144030177 | 1.97 | 1.95 | 1.02 | 1.92 | 1.57 | 1.90 | 1.38 | 1.48 | 1.78 | 0.94   |
| 39149674951 | 1.97 | 1.86 | 1.85 | 1.87 | 1.85 | 1.90 | 1.52 | 1.37 | 1.26 | 0.71   |
| 39154284680 | 1.97 | 1.85 | 1.03 | 1.90 | 1.82 | 1.00 | 1.08 | 1.85 | 1.28 | 0.97   |

The ratios group near 1.00, 1.10, 1.40, 1.55, 1.85, and 1.97. These are
groupings read off the table, not identified runner configurations; a job's
baseline is its own fastest observation, not a common reference, so the
ratios compare a job to itself and not to each other.

What the table does settle is that a run does not get one factor for its
Linux jobs. The spread within a run is 0.49 to 0.97 in all thirteen, so a
run that runs one job near 1.0 runs another near 1.9. The consequence is
that the slowest of nine jobs is near the top of the range in every run,
and the Linux side's end is far steadier than any job in it: the longest
Linux job other than `test (ubuntu-latest, node)` ran between 46.05 and
48.30 minutes in all thirteen runs, a 2.25-minute range, while the
individual jobs vary by close to a factor of two.


What sharding the Linux job would return
----------------------------------------

Minutes below are measured from the moment the run was created, so they
include allocation waiting. The macOS column covers hosted and self-hosted
macOS jobs together.

| run         | last Linux job                           | Linux end | macOS end | margin |
| ----------- | ---------------------------------------- | --------- | --------- | ------ |
| 39149674951 | `test (ubuntu-latest, node)`             | 48.83     | 50.22     | 1.39   |
| 39139466097 | `native support (linux-x86_64-gnu, 6/7)` | 51.35     | 53.62     | 2.27   |
| 39132976769 | `native support (linux-x86_64-gnu, 6/7)` | 52.92     | 56.92     | 4.00   |
| 39144030177 | `test (ubuntu-latest, node)`             | 48.68     | 53.77     | 5.09   |
| 39076279469 | `test (ubuntu-latest, node)`             | 48.63     | 54.52     | 5.89   |
| 39154284680 | `test (ubuntu-latest, node)`             | 57.28     | 63.17     | 5.89   |
| 39108338578 | `native support (linux-x86_64-gnu, 2/7)` | 47.58     | 56.58     | 9.00   |
| 39121592150 | `native support (linux-x86_64-gnu, 2/7)` | 50.95     | 62.47     | 11.52  |
| 39112383050 | `native support (linux-x86_64-gnu, 2/7)` | 46.27     | 58.25     | 11.98  |
| 39084043803 | `native support (linux-x86_64-gnu, 6/7)` | 48.22     | 60.43     | 12.21  |
| 39080313970 | `host C sanitizers (Linux, property)`    | 47.17     | 59.77     | 12.60  |
| 39104204370 | `native support (linux-x86_64-gnu, 1/7)` | 46.10     | 59.77     | 13.67  |
| 39126360392 | `test (ubuntu-latest, node)`             | 49.33     | 65.82     | 16.49  |

The Linux side finished first in all thirteen runs, by 1.39 to 16.49
minutes. In ten of them the `native` aggregate closed the run 0.33 to 0.45
minutes after the last macOS job, its own duration; in the other three a
hosted `test (macos-latest, node, k/4)` job was the last job of the run.

The closest margin is run 39149674951, the shortest of the thirteen. There
`test (ubuntu-latest, node)` ended at 48.83 and the next Linux job at
46.25, so shortening the first one, with every other job's timing held
fixed, moves the Linux end by 2.58 minutes and the run's end by none. The
other twelve runs have a larger margin and the same conclusion.

The run creates 49 GitHub-hosted jobs: 37 Ubuntu, 10 hosted macOS, and 2
Windows. The account's ceiling is 40 concurrent jobs with 5 of them macOS,
which *docs/evidence/u43/README.md* records as permanent. Run 39154284680
accumulated 88.1 job-minutes of allocation waiting over its Ubuntu jobs,
with six waits between 8.45 and 10.97 minutes, and hosted lane five waited
14.90 minutes before its first job started. Whether that wait came from the
40-job ceiling, the 5-job macOS ceiling, or runner availability is not
identified here; the first two are both oversubscribed, since 39 non-macOS
hosted jobs plus 5 macOS slots exceed 40. Extra Linux shards would draw on
the same 40, so they are not free, and these runs show no completion-time
gain from shortening this Linux job alone. A macOS end below about 48
minutes is the point at which to measure the question again.


What the macOS side holds
-------------------------

Run 39154284680 ran 473.6 job-minutes of macOS work, an even share of 43.1
minutes over the eleven lanes.

| lanes               | jobs | job-minutes | even share | observed ends  |
| ------------------- | ---- | ----------- | ---------- | -------------- |
| six self-hosted Mac | 30   | 266.3       | 44.4       | 43.47 to 47.17 |
| five hosted macOS   | 10   | 207.3       | 41.5       | 34.13 to 63.17 |

The Mac lanes ended within 3.70 minutes of each other, straddling their
even share, and it was the third consecutive run in which all six finished
inside their modeled ends. How much further the placement could improve
them is not established by that.

The hosted slots are where the room is, and two jobs hold 74.8 of their
207.3 job-minutes, 36 percent: `host C sanitizers (macOS, property)` ran
40.82 minutes and `host C sanitizers (macOS, native)` 34.02.
`selfHostedEligible` excludes that family for the reason
*docs/evidence/u37/README.md* records, so neither can move to a Mac lane
under the current policy. While the longer of the two takes 40.82 minutes,
no arrangement of the ten hosted jobs ends the hosted side before that,
against an even share of 41.5, so the hosted end cannot approach its even
share until those two suites are shorter. Sharding them is the next thing
to try, and the effect on the hosted end remains to be measured.
`test:sanitizer:property:shard` exists already, and the Linux native suite
already runs as `host C sanitizers (Linux, {shard}/3)`.


The refreshed entries
---------------------

Run 39154284680 hosted three Mac-eligible jobs. Each entry becomes the
median of its hosted observations in the window, in seconds.

| job                                    | entry | observations                             | new entry |
| -------------------------------------- | ----- | ---------------------------------------- | --------- |
| `native (macos-aarch64, 2/3)`          | 904   | 904, 1,162, 1,220                        | 1,162     |
| `native (macos-aarch64, 1/3)`          | 1,239 | 1,105, 1,171, 1,236, 1,236, 1,242, 1,334 | 1,236     |
| `native support (macos-aarch64, 3/12)` | 1,293 | 1,232, 1,248, 1,293, 1,295, 1,352        | 1,293     |

The run's own durations were 1.35, 0.95, and 1.05 times the entry in force
for it. The 1.35 is the fifth consecutive run ended by a Mac-eligible job
the placement sent to a hosted lane, after 1.37, 1.13, 1.34, and 1.29, and
every one of those five entries had been tested in the window. U43 recorded
that `measuredHostedJobs` membership does not predict an overrun; a fifth
case does not change that, and this refresh corrects the entry rather than
the distinction.

Raising `native (macos-aarch64, 2/3)` from 904 to 1,162 sends it to Mac
lane four and brings `reflect cases (macos-aarch64, 2/3)` onto hosted lane
five in its place. The modeled hosted maximum falls from 45.65 to 42.45
minutes and the modeled Mac maximum from 49.10 to 48.79, so the derived
maximum becomes 48.79. The other two entries move no job: 1,239 to 1,236 is
3 seconds, and 1,293 is unchanged.

Hosted lane five spent 14.90 of its 63.17 minutes waiting for its first job
to start, and `test (ubuntu-latest, node)` spent 8.62 of its 57.28. Holding
every duration and the job order fixed and removing the allocation waiting
ends the lane at 48.27, that job at 48.67, and the run at about 48.7, with
the two sides within 0.4 minutes of each other. The placement is not what
cost run 39154284680 its 63.50 minutes, and this refresh is aimed at the
48.27 rather than at the 63.17.


What this does not address
--------------------------

Two sources of variance here are outside the repository's control. An
individual Linux job's duration varies by close to a factor of two between
executions, and allocation waiting varies with what else the account is
running. Neither cause is isolated by these measurements. Placement and
shard counts cannot select the runner a job lands on or change the
account's ceilings, though they do change the work per job and the number
of slots the run asks for.

This record does not identify the runner configurations. The six groups in
the ratio table are consistent with a small set of machine types, but no
job in the workflow reports its processor count or model, so the grouping
is all the evidence there is. A step printing `nproc` and `/proc/cpuinfo`
would let those fields be compared against job durations; it would not by
itself establish the cause of the variation, and it has not been added.
