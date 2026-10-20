Charging the hosted lanes what they measured (U49)
==================================================

U45 refined the macOS lane placement by moving and exchanging single jobs
after the greedy pass, accepting a move only when it lowered the model's
highest lane end. Two of the moves it accepted sent
`native support (macos-aarch64, 11/12)` and `12/12` from Mac lanes to
hosted lanes, where they measured about two and a half times their Mac
durations.

| job                                     | on a Mac lane | hosted              |
| --------------------------------------- | ------------- | ------------------- |
| `native support (macos-aarch64, 11/12)` | 10.53, 9.95   | 25.23, 17.30, 26.07 |
| `native support (macos-aarch64, 12/12)` | 9.15, 9.03    | 21.73, 25.00, 25.48 |

Durations are in minutes. The Mac-lane observations are runs 39206357696
and 39227927384, on `oseo-mac-5` and `oseo-mac-2`; the hosted ones are
runs 39234170440, 39244971256 and 39292194312, the three since U45.

The model prices hosted execution of this family higher too, at the 3.4
of `selfHostedFamilySpeedRatios`, which is above the ratio these ten
observations show. It accepted the moves anyway, under the hosted costs
*tools/macos-job-costs.ts* carried at the time.


What the hosted lanes measured
------------------------------

Reconstructing run 39292194312's hosted lane chains from the generated
`needs` edges gives five chains and their observed waiting:

| chain                                | end   | work  | waiting |
| ------------------------------------ | ----- | ----- | ------- |
| sanitizers (macOS, native)           | 41.93 | 41.35 | 0.15    |
| sanitizers (macOS, property)         | 44.48 | 43.93 | 0.12    |
| node 1/4, node 4/4, reflect 3/3      | 48.13 | 44.28 | 3.42    |
| node 2/4, deno, native support 11/12 | 49.42 | 46.18 | 2.77    |
| node 3/4, native support 12/12       | 51.57 | 50.80 | 0.33    |

Ends are minutes from the run's first job creation. Every hosted job now
needs the probe, which completed at 0.43, so each chain's end is 0.43 plus
its waiting plus its work; that reproduces all five to within 0.04.

The longest chain waited 0.33 minutes, so its 50.80 minutes of work is
what put it at 51.57, later than every Mac lane in that run, which ended
between 40.35 and 46.75. The model gave that chain 42.18 minutes, from
1,311 seconds for the Node.js shard and 1,220 for the `native support`
shard. It gave the sanitizer property chain 36.32 against 43.93 measured.

Those two entries are the ones the model had least evidence for. U44 set
`native support (macos-aarch64, 12/12)` to 1,220 from two hosted
observations, 1,044 and 1,397 seconds; the three since are 1,304, 1,500
and 1,529.


What changes
------------

Seven entries take the median of their hosted observations in the window
since `b59ac914`, which are the entries whose median had moved by at least
five percent:

| entry                                   | before | after | observations |
| --------------------------------------- | ------ | ----- | ------------ |
| `host C sanitizers (macOS, native)`     | 2478   | 2337  | 18           |
| `host C sanitizers (macOS, property)`   | 2179   | 2452  | 18           |
| `native support (macos-aarch64, 11/12)` | 1636   | 1514  | 5            |
| `native support (macos-aarch64, 12/12)` | 1220   | 1397  | 5            |
| `test (macos-latest, node, 1/4)`        | 971    | 884   | 18           |
| `reflect cases (macos-aarch64, 2/3)`    | 696    | 643   | 3            |
| `reflect cases (macos-aarch64, 3/3)`    | 640    | 685   | 6            |

With those values the refinement places
`native support (macos-aarch64, 12/12)` on a Mac lane. Generating the
workflow from the committed table with only that entry refreshed leaves it
hosted; refreshing `11/12` as well moves it, and the remaining five decide
which Mac lane. The pair is what the earlier placement turned on, not
either entry alone.

`11/12` stays hosted, paired with the Node.js shard, at a modeled 47.08
against the 46.18 minutes of work that pairing measured, which waiting
carried to an end of 49.42. The model's highest lane end rises from 47.00
to 47.31 minutes, and the highest Mac-lane end in `macosLaneEnds` from
2,820 to 2,839 seconds, because a Mac lane now carries the shard the
hosted lane gave up.

A higher modeled maximum is the point. The previous 47.00 was reached by
charging a hosted lane less than it measured, and the refinement's
objective is that maximum, so an entry below its observations buys
placements that do not hold.


What this does not address
--------------------------

The refreshed values are medians, not bounds. The observations are wide:
`host C sanitizers (macOS, property)` ranges from 1,700 to 3,146 seconds
over its eighteen, and `native support (macos-aarch64, 11/12)` from 1,038
to 1,793 over its five. A lane modeled at 47 minutes can still land well
above it, and the hosted lanes carry the entries with the widest spread.

Four of the seven entries rest on six or fewer observations, so they will
move again: both `native support` shards, which the placement turns on,
and both `reflect cases` shards. Separately, the two sanitizer entries
replace values the table had recorded from twenty-two observations with
medians over eighteen; the eighteen are the window since `b59ac914` and
the twenty-two reach further back, so this trades sample size for recency
on jobs that always run hosted.

Nothing here reduces the macOS work. Five hosted lanes and six Mac lanes
hold what the model now prices at 47.31 minutes at the longest. A greedy
pass and a first-improvement local search reached that placement, so it is
not shown to be the shortest one available, and the account's five
concurrent hosted macOS slots cap how many hosted lanes there can be.

This lands with U48 and one run cannot separate their contributions.


What the branch run measured
----------------------------

Run 39351734495 at `57e0d6da` placed `native support (macos-aarch64, 12/12)` on
a Mac lane, where it started at 0.43 and ran 11.50 minutes against the 21.73 to
25.48 it had measured hosted. The 50.80-minute hosted chain is gone. The hosted
macOS side ended at 49.77 against run 39292194312's 51.57. The Mac lanes, which
now include the returned shard, ended at 47.68 against 46.75.

The Mac-lane figure is near what the refreshed table predicts: 47.68
measured against the 2,839 seconds, or 47.32 minutes, the model gives the
longest Mac lane. Six of the seven refreshed entries measured between 0.90
and 1.14 times their new values. `reflect cases (macos-aarch64, 3/3)`
measured 0.71 of its new 685 seconds, a value its six observations already
span.

The hosted chains ended at 36.00, 38.97, 40.63, 44.72 and 49.77. The
longest holds `test (macos-latest, node)` shards 2/4, 1/4 and 4/4, with
48.97 minutes of work and 0.42 of waiting. The model gives those three
45.73 minutes and gives the `node 3/4` and
`native support (macos-aarch64, 11/12)` chain 47.08, so it expects the second
to be the longer by 1.35; measured work put the first ahead by 4.85, that
second chain having measured 44.12.

With these modeled costs and the current ten indivisible hosted jobs, the
generated placement minimizes the longest hosted macOS lane. Partitioning
those ten across the five lanes exhaustively gives a lowest achievable
maximum of 2,825 seconds, or 47.08 minutes, and the placement reaches it.
Going below that needs different job costs, different job boundaries,
different eligibility, or more concurrency than the account's five hosted
macOS slots and the six self-hosted lanes on three Mac minis provide.


What the main runs measured
---------------------------

Main runs 39422744044 at `d4e23e90` and 39455962104 at `77616a77` ran the
same workflow and placement as branch run 39351734495; the commits between
them changed only Markdown. Completion times are minutes from the run's first
job creation. Linux work excludes the `native`, `test262`, `test`, and `check`
aggregates, Mac-lane work sums the self-hosted job durations, and Ubuntu
waiting is summed waiting in job-minutes.

| run         | end   | Linux work | hosted macOS | Mac lanes | Mac-lane work | Ubuntu waiting |
| ----------- | ----- | ---------- | ------------ | --------- | ------------- | -------------- |
| 39351734495 | 49.77 | 47.30      | 49.77        | 47.68     | 263.2         | 2.5            |
| 39422744044 | 54.00 | 45.47      | 50.03        | 53.62     | 292.0         | 1.5            |
| 39455962104 | 50.63 | 48.80      | 48.55        | 47.60     | 259.6         | 1.4            |

The 54.00-minute run drew slow Mac lanes. Each lane held the same jobs in
all three runs, and the lanes' summed work was 263.2 and 259.6 minutes in
the other two against 292.0 in that one, with every lane 6 to 20 percent
slower than in the branch run. Its last Mac-lane job,
`reflect cases (macos-aarch64, 1/3)`, ended at 53.62, and the `native`
aggregate closed the run at 54.00. The six self-hosted lanes share three Mac
minis, two lanes per machine. The cause of the longer job durations was not
measured.

The Linux figures earlier in these records took the latest Ubuntu job end,
which includes that aggregate even though it waits for the macOS case
shards. Excluding aggregates, the latest Ubuntu work ended at 47.30 in the
branch run, not 48.00. Summed Ubuntu waiting stayed between 1.4 and 2.5
job-minutes across the three runs.

A `workflow_dispatch` run, 39436099733, was started to repeat the measurement
and canceled. The readiness probe runs only on push events, so every Mac lane
fell back to the five hosted macOS slots and the run could not measure the Mac
lanes.
