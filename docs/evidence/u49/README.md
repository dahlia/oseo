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
