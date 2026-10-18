Mac lane cost refresh (U41)
===========================

U40 closed with the six Mac lanes determining when a main run finishes,
and with one lane running 57.67 minutes of work while another ran 34.02.
This records what the cost inputs behind that imbalance were measuring,
what replaced them, and what the replacement does to the derived
partition.

Every figure below comes from the six main and branch runs since
`b59ac914`, the runs whose macOS shard contents match the tree:
39076279469, 39080313970, 39084043803, 39104204370, 39108338578, and
39112383050.


The lane comparison does not establish a machine effect
-------------------------------------------------------

The first hypothesis was that the three Mac minis differ in speed, since
`selfHostedJobSeconds` held 18 entries all measured on `oseo-mac-1`. The
observations do not support it.

Normalizing each of the 178 Mac observations in the window by the median
of its own job gives these medians by lane: 0.96, 0.93, 1.01, 1.00, 1.03,
and 1.04. The standard deviation of the normalized value across all 178 is
0.18. The lane medians therefore sit inside the per-observation spread,
and because the placement is deterministic, most jobs run on only one or
two lanes in this window, so the comparison cannot separate a machine
effect from job mix either way. The earlier reading of 0.92, 1.38, 1.91,
2.11, 1.98, and 1.77 compared each lane against the cost inputs rather
than against the jobs, so it measured the inputs.


The stale entries estimated one-lane work worse than the conversion
-------------------------------------------------------------------

Dividing each job's refreshed one-lane estimate by whatever the generator
used before U41 separates the two sources of that estimate:

| source of the earlier figure | n   | median | range       |
| ---------------------------- | --- | ------ | ----------- |
| `selfHostedJobSeconds` entry | 18  | 1.43   | 0.52 - 1.89 |
| family ratio conversion      | 15  | 1.00   | 0.76 - 1.23 |

The conversion was unbiased on this window and the entries were not. The
entries came from runs 37194069657, 37206614757, and 37215661294, when
one or two Mac lanes ran and the macOS shards held different files, so
they describe work that no longer exists on a machine that no longer runs
alone. Both groups contain individual misses: the conversion's widest are
0.76 for `native (macos-aarch64, 1/3)` and 1.23 for
`test262 (macos-aarch64, 9/12)`.

The own-key shards are the extreme and they account for the imbalance
directly. In shard order the entries read 433, 374, and 442 seconds; the
refreshed one-lane estimates are 242, 203, and 232. One rule keeps all
three on `oseo-mac-1`, so the placement charged that lane 1,249 seconds
for an estimated 677 seconds of one-lane work and filled it no further.

Per-job entries remain the right representation rather than one ratio per
family, because the derived ratio
`(hosted median - setup) / (one-lane - setup)` varies that much inside a single
family: 2.25 to 5.43 across the twelve `native support` shards and 2.77 to 5.09
across the twelve test262 shards.


The refreshed table
-------------------

The table now covers all 33 Mac-eligible jobs rather than 18. Each entry
is the median of three to six observations, and each observation is
normalized by removing the modeled pair slowdown of whatever ran on the
other lane of the same machine. The value therefore states one-lane work
and `selfHostedPairSlowdowns` applies on top of it during placement. The
normalization inverts what `selfHostedLaneEnds` computes, taking a job's
one-lane work as the integral of its elapsed time divided by the factor in
force at each moment.

Normalizing moved the per-job figures by factors of 1.02 to 1.45. It
leaves substantial variation: the median per-job ratio of largest
observation to smallest falls from 1.56 to 1.46.

| job                                     | n   | one-lane | contended | superseded |
| --------------------------------------- | --- | -------- | --------- | ---------- |
| `native support (macos-aarch64, 1/12)`  | 6   | 897      | 1054      | 752        |
| `native support (macos-aarch64, 2/12)`  | 6   | 707      | 865       | 488        |
| `native support (macos-aarch64, 8/12)`  | 3   | 612      | 688       | 324        |
| `native support (macos-aarch64, 5/12)`  | 5   | 546      | 716       | ratio      |
| `test262 (macos-aarch64, 12/12)`        | 6   | 544      | 646       | ratio      |
| `native support (macos-aarch64, 11/12)` | 6   | 536      | 622       | ratio      |
| `test262 (macos-aarch64, 2/12)`         | 6   | 535      | 628       | 336        |
| `native support (macos-aarch64, 10/12)` | 6   | 528      | 598       | 375        |
| `native support (macos-aarch64, 7/12)`  | 3   | 512      | 686       | ratio      |
| `native support (macos-aarch64, 12/12)` | 6   | 510      | 612       | 295        |
| `test262 (macos-aarch64, 11/12)`        | 6   | 503      | 603       | 329        |
| `test262 (macos-aarch64, 1/12)`         | 6   | 503      | 557       | 345        |
| `native support (macos-aarch64, 3/12)`  | 4   | 492      | 564       | ratio      |
| `native support (macos-aarch64, 6/12)`  | 6   | 489      | 603       | 354        |
| `test262 (macos-aarch64, 9/12)`         | 6   | 484      | 539       | ratio      |
| `test262 (macos-aarch64, 7/12)`         | 6   | 481      | 537       | ratio      |
| `test262 (macos-aarch64, 5/12)`         | 6   | 465      | 550       | ratio      |
| `test262 (macos-aarch64, 4/12)`         | 6   | 465      | 530       | ratio      |
| `test262 (macos-aarch64, 10/12)`        | 6   | 439      | 462       | ratio      |
| `native support (macos-aarch64, 9/12)`  | 6   | 433      | 494       | ratio      |
| `test262 (macos-aarch64, 3/12)`         | 6   | 423      | 467       | ratio      |
| `native (macos-aarch64, 3/3)`           | 6   | 421      | 516       | 363        |
| `test262 (macos-aarch64, 8/12)`         | 3   | 409      | 420       | 366        |
| `test262 (macos-aarch64, 6/12)`         | 6   | 406      | 417       | ratio      |
| `native (macos-aarch64, 2/3)`           | 6   | 369      | 436       | ratio      |
| `native support (macos-aarch64, 4/12)`  | 6   | 349      | 371       | 449        |
| `native (macos-aarch64, 1/3)`           | 3   | 306      | 418       | ratio      |
| `reflect cases (macos-aarch64, 3/3)`    | 3   | 298      | 407       | 180        |
| `reflect cases (macos-aarch64, 2/3)`    | 5   | 296      | 301       | 179        |
| `reflect cases (macos-aarch64, 1/3)`    | 5   | 287      | 415       | 180        |
| `own-key cases (macos-aarch64, 1/3)`    | 6   | 242      | 327       | 433        |
| `own-key cases (macos-aarch64, 3/3)`    | 6   | 232      | 334       | 442        |
| `own-key cases (macos-aarch64, 2/3)`    | 6   | 203      | 264       | 374        |

Rederiving `selfHostedFamilySpeedRatios` from the refreshed table gives
4.05 for test262 over 12 jobs, 3.16 for native support over 12, 3.13 for
native fixtures over 3, 2.94 for the Reflect namespace shards over 3, and
4.98 for own-key cases over 3. The stored ratios are those values rounded
down to one decimal, against 4.2, 3.2, 3.1, 2.3, and 2.3 before. The
Reflect namespace ratio had been borrowed from own-key cases, and U38 used
that same borrowed ratio to derive the shards' hosted estimates; U40 then
replaced those estimates with hosted observations, so 2.9 is derived from
one hosted and five Mac observations of each shard rather than borrowed.
Every Mac-eligible job now has a table entry, so these ratios reach no job
the generator places today.


What the refresh does to the partition
--------------------------------------

Evaluated under the refreshed costs, the partition the old costs produced
has a maximum lane end of 52.51 derived minutes, and the partition the
refreshed costs produce has 48.29, a fall of 4.22.

The refreshed Mac costs send more work to hosted lanes, and the first
partition they produced put a Reflect namespace shard behind
`host C sanitizers (macOS, property)`. That job's 25 archived
observations run from 1,559 to 3,146 seconds with a median of 2,226, and
its companion `host C sanitizers (macOS, native)` from 2,144 to 2,765 with
a median of 2,469. Reserving a hosted lane for each sanitizer raises the
modeled maximum from 48.23 to 48.29 minutes at median cost. Substituting
the property job's measured p90 of 2,680 seconds leaves that maximum at
48.29 rather than raising it to 56.27, which is the result of that one
sensitivity test and not a general claim about runtime tails.

The derived 48.29 is not a wall-clock prediction. Evaluated under the
refreshed costs the old partition derives 52.51 against measured Mac lane
ends of 58.25, 55.53, 51.35, 51.27, 47.35, and 34.60 in run 39112383050,
so the model reproduces `oseo-mac-1` at 34.4 and `oseo-mac-2` at 46.9
almost exactly and underpredicts the other four by 9 to 11 percent. The
longest Linux file shard took 46.27 and 47.58 minutes in the last two
runs, within 2.02 minutes of the new modeled maximum; that comparison
does not establish the remaining wall-clock benefit.

Changes to shard contents or hardware require revalidating the affected
estimates, because no value here is independent of the partition, the
machine, and the pairing that produced it.


What the first run measured
---------------------------

Branch run 39121592150 at `354b9906` passed in 62.93 minutes, 4.26
minutes longer than the last main run. The Mac lane finish spread fell
from 23.65 minutes to 3.80, but hosted lane three determined completion.

Mac lane work, finish time, and idle time, in minutes. Total work divided
equally across six lanes is 47.99 minutes, which is a share of work and
not an attainable finish, since a finish also carries the 0.42-minute
probe:

| lane         | work  | end   | idle |
| ------------ | ----- | ----- | ---- |
| `oseo-mac-4` | 50.27 | 50.85 | 0.17 |
| `oseo-mac-3` | 49.43 | 50.05 | 0.20 |
| `oseo-mac-1` | 48.08 | 48.78 | 0.28 |
| `oseo-mac-6` | 46.85 | 47.47 | 0.20 |
| `oseo-mac-5` | 46.83 | 47.40 | 0.15 |
| `oseo-mac-2` | 46.48 | 47.05 | 0.15 |

The latest finish sits 2.86 minutes above that work-only bound, against
9.10 in run 39112383050, and no lane held more than 0.28 minutes of idle.

Hosted lane three finished at 62.92. It held
`test (macos-latest, node, 3/4)` and then
`test262 (macos-aarch64, 1/12)`, which the refreshed Mac costs sent
hosted for the first time since the `b59ac914` repartition. Its hosted
entry was a retained 1,288 seconds and it ran 1,932, a ratio of 1.50 and
10.73 minutes above its estimate. The lane also waited 9.17 minutes for a
runner between its two jobs. The other nine hosted jobs ran between 0.68
and 1.07 times their entries.

The longest Linux file shard took 46.55 minutes, within the preceding six
runs' range of 44.12 to 48.18. `test (ubuntu-latest, node)` took 48.67
minutes, 0.07 above its preceding range of 34.85 to 48.60.


Refreshed hosted medians
------------------------

Twelve `macos-aarch64` jobs have a hosted observation in the seven-run
window, which is every job the placement has sent hosted since
`b59ac914`. All twelve now carry that window's median and its count, and
six of them moved. Seconds:

| job                                    | superseded | refreshed | n   |
| -------------------------------------- | ---------- | --------- | --- |
| `test262 (macos-aarch64, 1/12)`        | 1288       | 1932      | 1   |
| `native (macos-aarch64, 1/3)`          | 1117       | 1236      | 3   |
| `native support (macos-aarch64, 9/12)` | 1330       | 1421      | 1   |
| `native support (macos-aarch64, 3/12)` | 1323       | 1264      | 2   |
| `native (macos-aarch64, 2/3)`          | 917        | 904       | 1   |
| `reflect cases (macos-aarch64, 3/3)`   | 770        | 640       | 3   |

The other 21 `macos-aarch64` jobs have never run hosted in the window, so
nothing in CI can refresh them, and 18 of those carry an entry measured
before their shard contents changed. Deriving a hosted median for them
from the measured one-lane Mac seconds and the family ratio was tried and
rejected. The per-job ratio `(hosted median - setup) / (one-lane - setup)`
varies inside a family: the five `native support` shards with a window
hosted observation derive 2.79, 3.30, 3.45, 3.65, and 4.12, and the three
Reflect namespace shards 2.44, 2.69, and 3.16. These ratios do not
establish a reliable conversion for a job without a hosted observation.

The partition is instead checked against that exposure as a scenario.
With the refreshed placement held fixed, substituting inverse conversions
for all 21 unobserved entries raises hosted lane three from 43.42 to 46.10
derived minutes and hosted lane four from 42.22 to 43.53. The maximum
remains 48.17 on `oseo-mac-6`.

The two unobserved jobs the placement now sends hosted are
`native support (macos-aarch64, 12/12)`, with an entry of 1,294 seconds
and a conversion of 1,455, and `native support (macos-aarch64, 10/12)`,
with 1,432 and 1,511. These substitutions leave the modeled maximum
unchanged; their hosted durations remain unmeasured in the window.
