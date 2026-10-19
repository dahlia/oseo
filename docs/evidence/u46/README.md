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


What this does not address
--------------------------

Run 39227927384's Linux side ended at 48.18 minutes and its macOS side at
46.67, a margin of 1.51 by those figures. Holding the other timings fixed,
shortening the Linux jobs to about 38 would leave the macOS side as the
likely limit, and a run end near 47 is consistent with U45's modeled
maximum of 47.00 against that run's measured 48.53. That side-completion
margin is not the estimated reduction in the run's duration.

Further macOS reductions could then shorten the run until another job or
an allocation delay became limiting. Before this change a macOS reduction
of a minute or two would have left the run's end where a Linux job near 48
put it.

Nothing here addresses the two sources of variance U44 measured and the
repository does not control: an individual Linux job's duration varies by
close to a factor of two between runs, and allocation waiting varies with
what else the account is running.
