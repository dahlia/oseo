Shortening the Linux side (U46)
===============================

Branch run 39206357696 and main run 39227927384 were the first two runs in
the window whose Linux side finished last. Both met U44's condition for
revisiting Linux sharding. U46 changes the partitioning of three Linux jobs
whose durations in run 39227927384 were 48.13, 43.90, and 39.20 minutes.

The window is the fifteen main and branch runs since `b59ac914`.


What the partition was already doing
------------------------------------

Within one run the seven `native support (linux-x86_64-gnu, k/7)` shards
spread widely: in run 39227927384 they ran 48.13, 46.13, 45.98, 45.63,
43.23, 41.60, and 26.23 minutes. Taking each shard's fastest duration over
the fifteen runs instead gives 24.93, 23.67, 23.27, 23.20, 25.68, 25.80,
and 24.28 minutes: a range of 2.60 minutes and a maximum 1.06 times the
mean. Those minima are consistent with a balanced partition, but they come
from different runs and do not isolate runner speed. Across this window
each shard's own durations span a factor of about 1.85.

Durations and the derived column below are in minutes. The third column is
each shard's summed test-case duration from its log divided by four, the
worker count, and is not a measured elapsed time.

| shard | job duration | derived test time / 4 | longest single test |
| ----- | ------------ | --------------------- | ------------------- |
| 6/7   | 48.13        | 46.69                 | 15.15               |
| 1/7   | 46.13        | 38.77                 | 37.00               |
| 5/7   | 45.98        | 43.73                 | 12.04               |
| 2/7   | 45.63        | 44.01                 | 21.85               |
| 4/7   | 43.23        | 41.88                 | 15.41               |
| 7/7   | 41.60        | 41.00                 | 15.97               |
| 3/7   | 26.23        | 25.11                 | 13.19               |

For six of the seven shards the job duration is within 1.5 to 5.2 percent
of that derived figure, which is consistent with substantial parallel work
but does not establish that throughput alone set their elapsed time. Shard
one is the exception, at 46.13 against 38.77.

Shard one carries four files on four workers. Attributing every timed test
in its log to its file gives these summed test-case durations:

| file                      | tests | summed test-case duration |
| ------------------------- | ----- | ------------------------- |
| *m5-globalthis-binding*   | 9     | 2,732 s                   |
| *m5-compound-assignment*  | 8     | 2,239 s                   |
| *m5-array-sort-stability* | 1     | 2,220 s                   |
| *m5-proxy-exotic-object*  | 2     | 2,106 s                   |

Those four sum to 9,297 seconds, and 9 further seconds went to tests this
attribution could not place, which is where the 38.77 above comes from. The
job took 2,768 seconds. The largest file sum plus about 20 seconds of setup
is 2,752, which is 16 seconds below the job. These figures are consistent
with that one file limiting the shard; they do not measure its elapsed time
directly.

File sharding does not split a file. For every total from 7 to 14,
`selectNativeTestShard` reports the same modeled maximum of 2,647 derived
seconds.


Why the case shard is Linux only
--------------------------------

*tools/native-shard-costs.ts* weighs each file per host in derived seconds.
The two files already in the case-shard list are heavy on both hosts; this
one is not.

| file                    | linux-x86\_64-gnu | macos-aarch64 |
| ----------------------- | ----------------- | ------------- |
| *m5-object-own-keys*    | 3,327             | 3,566         |
| *m5-reflect-namespace*  | 2,299             | 2,283         |
| *m5-globalthis-binding* | 2,647             | 855           |

Its macOS weight of 855 is below the heaviest file outside the case-shard
list there, at 1,242. That comparison and the five concurrent macOS slots
the account has favor leaving it in the macOS file shards. The exclusion is
therefore per host: `caseShardedNativeFiles(platform)` returns the two
shared files everywhere and adds this one on Linux.

The file has nine top-level tests across four property domains and uses no
`fc.pre`, which case sharding forbids. Its longest single test measured 857
seconds. Those observations do not establish how evenly three case shards
will divide it.

Its shards record no duration, for the reason the Reflect namespace shards
record none: the recorder exclusively creates one record per job, so more
than one property domain per file cannot each record without a
record-format change. Each shard keeps the whole property's interrupt limit
and fails on interruption.

The shard total stays at seven. With this file excluded the heaviest
remaining Linux file has 2,239 derived seconds, and dividing run
39227927384's remaining work over seven shards of four workers gives about
38.5 minutes. Those figures alone do not establish whether a higher total
would reduce elapsed time.


What the ceiling allows
-----------------------

| quantity                               | run 39227927384 |
| -------------------------------------- | --------------- |
| GitHub-hosted jobs                     | 49              |
| hosted job-minutes                     | 965.5           |
| hosted job-minutes divided by 40 slots | 24.1            |
| longest single hosted job              | 48.13           |
| peak concurrent hosted jobs            | 39              |
| run end                                | 48.53           |

The hosted job count rises from 49 to 55. That run peaked at 39 concurrent
hosted jobs against the account's ceiling of 40. Its 965.5 hosted
job-minutes divided by 40 give an idealized capacity floor of 24.1 minutes
against a longest hosted job of 48.13, and Linux setup measured 18 to 23
seconds per job across all nine of its long jobs, with
`test:property:extended:package`, which only the first `native support`
shard runs, taking 13 seconds. These figures suggest room for shorter jobs;
they do not establish the queueing or elapsed-time effect of adding them.


What changes
------------

| job                                        | before | after, estimated |
| ------------------------------------------ | ------ | ---------------- |
| `native support (linux-x86_64-gnu, k/7)`   | 48.13  | about 38.5       |
| `test (ubuntu-latest, node)`               | 43.90  | about 15, in 3   |
| `host C sanitizers (Linux, property)`      | 39.20  | about 20, in 2   |
| `globalThis cases (linux-x86_64-gnu, k/3)` | new    | about 15         |

The estimates divide run 39227927384's measured work across the new
partitions while holding that run's runner speeds fixed. They are
conditional estimates, not measured outcomes or predictions for a later
run.

Two of the three use Node's own `--test-shard`, which partitions the files
it discovers so the union of the shards equals the unsharded set by
construction. The flag precedes every positional path in both, which Node
requires: given six files and three shards, placing it after a positional
ran all six in every shard rather than two in each.


What the branch run measured
----------------------------

Branch run 39244971256 at `21bbd8af` finished green. Its last job
completed 55.25 minutes after the first was created, against 48.53 for
main run 39227927384; the run-level timestamps give 55.27 and 48.57 for
the same two runs. Every run figure below uses the job boundary. The three
new partitions divided their work; the estimate for the partition U46 left
in place did not hold.

| job                                        | estimated  | measured            |
| ------------------------------------------ | ---------- | ------------------- |
| `test (ubuntu-latest, node, k/3)`          | about 15   | 12.68, 17.28, 11.80 |
| `host C sanitizers (Linux, property, k/2)` | about 20   | 13.40, 25.40        |
| `globalThis cases (linux-x86_64-gnu, k/3)` | about 15   | 7.42, 9.02, 9.38    |
| `native support (linux-x86_64-gnu, k/7)`   | about 38.5 | 47.43 longest       |

The 38.5 above is the mean of seven shards, not the longest of them. The
section that derived it divided one run's remaining work over seven shards
of four workers, which is an average by construction. Carrying it into a
column of job durations turned it into a claim about the longest shard,
and the longest shard is what determines Linux completion.

The case shards did what they were built to do:
`native support (linux-x86_64-gnu, 1/7)` fell from 46.13 to 26.43 minutes.
Linux completion did not follow, because shard one is usually not the
longest shard. Over the fifteen runs since `b59ac914`, shard six was the
longest in eight of them and shard one in three, the rest going to shards
two, four and five. Per-shard durations over the same runs, in minutes:

| shard | minimum | median | maximum |
| ----- | ------- | ------ | ------- |
| 1/7   | 24.93   | 45.82  | 46.55   |
| 2/7   | 23.67   | 44.68  | 46.07   |
| 3/7   | 23.27   | 42.48  | 43.48   |
| 4/7   | 23.20   | 43.60  | 44.33   |
| 5/7   | 25.68   | 42.68  | 46.23   |
| 6/7   | 25.80   | 47.55  | 48.23   |
| 7/7   | 24.28   | 41.60  | 45.57   |

Shard six has the highest median and the highest maximum of the seven,
and it ran 47.43 in the branch run against 48.13 before. Its 57 timed
cases summed to 10,947 seconds, which over four workers is 45.61 minutes
against 47.43 elapsed, and its longest single case measured 855 seconds.
That is consistent with a throughput constraint and bounds any single
case well below the job, but it does not establish which file determined
the job's completion.

That table also contradicts this record's earlier reading of shard one.
A shard limited by 2,732 seconds of test time on a single worker cannot
finish in 1,496 seconds, and shard one's minimum is 24.93 minutes.
Comparing the same shard's cases between two runs shows the size of the
variation: all nineteen cases over five seconds ran 1.55 to 1.73 times
slower in run 39206357696 than in run 39227927384, median 1.66, summing
9,926 against 6,024 seconds. The file set, the case set, the four workers
and the runner image were the same in both, which narrows what else
differed without identifying it. A file-duration sum from one job is
therefore not a fixed lower bound for that file in another job, and the
two readings of shard one agreed only because its case durations and its
elapsed time moved together.

The other two splits are the ones that reached the job that had been
longest. Over the six runs before this one,
`test (ubuntu-latest, node)` was the longest Linux job in five:

| run         | longest Linux job                        | duration |
| ----------- | ---------------------------------------- | -------- |
| 39144030177 | `test (ubuntu-latest, node)`             | 48.63    |
| 39149674951 | `test (ubuntu-latest, node)`             | 48.80    |
| 39154284680 | `test (ubuntu-latest, node)`             | 48.67    |
| 39206357696 | `test (ubuntu-latest, node)`             | 48.52    |
| 39227927384 | `native support (linux-x86_64-gnu, 6/7)` | 48.13    |
| 39234170440 | `test (ubuntu-latest, node)`             | 49.33    |

With both split, every shard of both finished earlier than
`native support (linux-x86_64-gnu, 6/7)`, which ended the branch run's
Linux side at 47.48. One run does not separate that from variation in
either job's duration.

The run still took 55.25 minutes, and the macOS side accounts for it. All
six Mac lanes started at 7.33 minutes instead of the 0.42 to 0.43 of run
39227927384, because the `macOS self-hosted availability` probe waited 6.97
minutes for a hosted runner against 0.05 there. The lane-work ranges
overlapped, 39.43 to 47.35 minutes against 43.02 to 46.03, and lane idle
time stayed between 0.15 and 0.30 in both runs. Holding the later
allocation and execution times fixed, each minute the probe waits delays
every lane end by a minute, which is how a 6.92-minute difference in probe
waiting appears as a 6.91-minute difference in lane starts. Summed Ubuntu
allocation waiting rose from 5.1 job-minutes over 37 jobs, one of them
above two minutes, to 59.6 over 43, seven of them above two minutes and
the longest 9.42.

So the six added jobs were affordable in job-minutes and not in
allocation. This record's earlier reading of the ceiling compared 24.1
idealized minutes against a 48.13-minute job and concluded there was room.
That comparison bounds the makespan; it says nothing about which jobs
absorb the queueing, and one of them is a twenty-second job on which every
Mac lane depends. *docs/evidence/u47/README.md* records that mechanism and
what changed for it.

The three `globalThis cases` jobs are reverted. They add three jobs to a
run that observed thirty-five of its Ubuntu jobs starting at once, and the
branch run observed no reduction in the longest Linux job. The per-shard
minima above are within about 6 percent of their mean, though they come
from different runs and do not control for runner performance; these
observations do not establish how much a refreshed weight table could
improve the longest shard. The node and sanitizer splits stay.


What this does not address
--------------------------

Shortening the Linux side stops paying once the macOS side becomes the
limit. Across the six runs before this one the Linux side ended between
5.88 minutes before the macOS side and 1.52 minutes after it, so neither
side is reliably the one that holds the run. The branch run left Linux at
47.48. In those six runs the macOS side ended at 46.67, 47.72, 49.63,
50.22, 53.77 and 63.17, exceeding 47.48 in five of the six. Reducing Linux
completion below 47.48 shortens a run only when its macOS side ends
earlier than that, which among those six would have saved 0.81 minutes
once and nothing otherwise.

Both of the sources of variance U44 measured, and the repository does not
control, produced this run's outcome. An individual Linux job's duration
varies by close to a factor of two between runs, which is what let one
job's derived file sum read as a latency bound. Allocation waiting varies
with what else the account is running, which is what the six added jobs
met. *docs/evidence/u47/README.md* removes the probe's exposure to other
jobs in the same run; nothing here reduces either source.
