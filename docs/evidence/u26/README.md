Per-account Zig cache cap on the Mac mini
=========================================

This unit derives the per-account Zig cache size cap that
[U25 evidence](../u25/README.md) set as the precondition for a second
self-hosted Mac runner, and adds it to *tools/selfhosted-mac/cleanup.sh*.
The maintainer ran two read-only measurement scripts under `sudo` on the
Mac mini that hosts `oseo-mac-1` on 2026-10-05. The coordinator wrote
them, and copies are under [*scripts/*](./scripts/). This unit read their
output as `dahlia` over SSH and timed the hook against synthetic trees as
`dahlia`. It ran no `sudo`, changed no runner, LaunchDaemon, hook
installation, repository variable, or secret, and registered no second
runner. Every number below is labeled measured or derived.


Inputs
------

[*inventory.txt*](./inventory.txt) is the output of
[*scripts/disk-inventory.sh.txt*](./scripts/disk-inventory.sh.txt) at
12:53:45 UTC: `df -Pk` of the system and data volumes, the APFS local
snapshot list, and `du -skx` of the runner account's paths and other
root-only locations, in KiB.

[*samples.tsv*](./samples.tsv) is the output of
[*scripts/disk-sampler.sh.txt*](./scripts/disk-sampler.sh.txt) from 13:09:00
to 14:52:19 UTC. Each row has free space, `du -skx` of the runner's
*\_work/*, *oseo-temp/*, Zig cache, and runtime archive directory, and
whether a `Runner.Worker` process existed. The script sleeps 30 seconds
between rows, but the `du` calls made the measured interval 36 to 221
seconds, 53.4 seconds on average, over 117 rows. A worker existed in 109
rows. The rows cover branch run `37315038080` (`m5ci-disk-sample` at
`4b20631b`), whose 15 jobs on `oseo-mac-1` ran from 13:12:58 to 14:51:05
UTC according to the GitHub jobs API: three own-key case shards, eight
test262 shards, three native support shards, and one native fixture shard.

[*du-timing.txt*](./du-timing.txt) records the hook timings below.


Measured disk use
-----------------

From *inventory.txt*, before the run:

| Path or quantity                   |         KiB |   GiB |
| ---------------------------------- | ----------: | ----: |
| Volume size (`df` 1024-blocks)     | 239,311,296 | 228.2 |
| Available                          | 124,913,084 | 119.1 |
| *~oseo-runner*, total              |  43,718,868 |  41.7 |
| *~oseo-runner/.cache/zig*          |  40,482,120 |  38.6 |
| *~oseo-runner/.local/share/mise*   |   1,171,164 |   1.1 |
| *~oseo-runner/Library/Caches/oseo* |     629,116 |   0.6 |
| *~oseo-runner/actions-runner*      |     491,780 |   0.5 |
| *actions-runner/\_diag*            |      41,680 |  0.04 |
| *actions-runner/oseo-temp*         |       4,236 | 0.004 |
| *actions-runner/\_work*            |           0 |     0 |

`tmutil listlocalsnapshots /` listed no APFS local snapshot. The used space,
volume size minus available, is a derived 109.1 GiB, and the space not used
by the Zig cache is a derived 70.5 GiB. The runner account's usage outside
its Zig cache is a derived 3.1 GiB.

From *samples.tsv*, during the 15 jobs:

 -  The Zig cache grew from a measured 38.6 to 63.6 GiB, a derived 25.0 GiB
    in total and 1.67 GiB per job on average, although it started warm.
    Bracketing each job by the samples just before its start and just after
    its end gives a derived 0.97 to 2.41 GiB per job. The brackets overlap
    neighboring jobs, so these are upper bounds. They stay below the
    3.8 GiB maximum that U25 measured for one job.
 -  *\_work/* peaked at a measured 510,964 KiB (0.49 GiB) and *oseo-temp/*
    at 4,356 KiB. The runtime archive directory stayed at 629,116 KiB.
 -  Free space fell to a measured 92.5 GiB at 14:50:58 UTC, during the last
    job.
 -  The derived non-cache use, volume size minus free space minus the Zig
    cache, rose from 70.5 GiB to 75.2 GiB at 14:38:05 UTC and fell back to
    71.0 to 72.0 GiB by the end. Of the derived 4.7 GiB rise, the measured
    485,656 KiB in *\_work/* and 104 KiB more in *oseo-temp/* at the peak
    account for 0.5 GiB. The remaining derived 4.2 GiB is outside the
    sampled paths; the sampler covered no other path, so it is
    unattributed.

The coordinator's reading used the end-of-run non-cache use of 72.1 GiB.
This unit uses the 75.2 GiB peak instead.


Deriving the cap
----------------

The cap `S` must keep 40 GiB free with two runner accounts, each holding a
full cache, both running a job. Every hook removes its account's cache when
it exceeds `S`, so a cache is at most `S` after a hook and at most `S + G`
during a job, where `G` is one job's growth. The terms, in GiB:

| Term | Value | Kind     | Source                                                        |
| ---- | ----: | -------- | ------------------------------------------------------------- |
| `T`  | 228.2 | measured | volume size, *inventory.txt*                                  |
| `F`  |  40.0 | policy   | free-space floor of *cleanup.sh*                              |
| `N`  |  75.2 | derived  | peak non-cache use with one job running, *samples.tsv*        |
| `R`  |   3.1 | derived  | second account's own non-cache use, `oseo-runner`'s as analog |
| `W`  |   0.5 | measured | one job's peak *\_work/* plus *oseo-temp/*                    |
| `X`  |   4.2 | derived  | the unattributed rise above, counted again for the second job |
| `G`  |   3.8 | measured | U25 maximum Zig cache growth of one job                       |

`N` already contains the first runner's account, one job's `W` and `X`,
and everything else on the volume. The second runner adds `R`, `W`, `X`,
and its own cache. The condition is
`N + R + W + X + 2 (S + G) + reserve <= T - F`, so
`2 S <= 97.7 - reserve`, derived. A 20 GiB reserve for other growth, such
as macOS updates, runner updates, and diagnostics, gives `S <= 38.8`. This
unit adopts the coordinator's proposed `S = 30`, which leaves a derived
37.7 GiB reserve. With one runner, the cap bounds that runner's cache at a
derived 33.8 GiB during a job and keeps a derived 119.3 GiB free at the
measured peak of other usage, instead of the measured 92.5 GiB minimum and
no bound.

`N`, `R`, and `X` were measured with one runner account. A second account
has not been measured; watch free disk during its first runs. Two runner
roots under one account remain unsafe with this hook, as U25 describes,
because both would share one *~/.cache/zig*.


Cost in warm reuse
------------------

U25 measured that a warm Zig cache saved 14 to 18 seconds for its native
fixture and test262 8/12 jobs and nothing measurable for the other three,
because every job builds in fresh per-run staging paths. Run
`37315038080` agrees: the cache grew 25.0 GiB although it started at a
warm 38.6 GiB. At the run's 1.67 GiB per job, an emptied cache reaches
30 GiB after a derived 18 jobs, so the cap would trip about once per run of
15 Mac jobs. Each trip empties the cache. If every remaining job of that
run then lost the full measured warm saving, the cost would be a derived
4.5 minutes of Mac lane time at most (15 jobs times 18 seconds); jobs that
U25 measured with no warm saving lose nothing.

The hook also measures the cache with `du` on every job start and
completion while free space is above 40 GiB. It cannot read the runner's
real cache as `dahlia`, so the timings use synthetic trees built by
[*scripts/synthetic-cache.py.txt*](./scripts/synthetic-cache.py.txt) under
*~/Desktop/*, with entry counts scaled from a 97.5 GiB Linux lane Zig cache
(2,286 *o/* directories and 2,291 *h/* files per GiB, derived). Spotlight
indexed the first trees and loaded the machine, so those timings were
discarded; the trees were then moved under a *.noindex* directory and
timed after the load average fell to 2.0 to 2.4. Measured on the Mac mini,
once each in sequence:

| Tree shape                                   | Entries | `du -skx` (s)                      | Whole hook (s)         |
| -------------------------------------------- | ------: | ---------------------------------- | ---------------------- |
| 30 GiB                                       | 205,894 | 3.29, 1.11, 1.12; 2.07, 1.25, 1.29 | 3.26, 1.11, 1.11, 1.11 |
| 63.6 GiB (the live size before installation) | 436,489 | 7.71, 4.43, 4.42                   | 39.04 with removal     |

The second group of 30 GiB `du` timings ran after the 63.6 GiB tree had
evicted it from the vnode cache, whose limit `kern.maxvnodes` is 249,770.
The whole-hook rows ran the new *cleanup.sh* `completed` phase against
`dahlia`'s real home with the tree moved to *~/.cache/zig*: the 30 GiB
shape stayed under its 30 GiB cap, and the 63.6 GiB shape with a 1 GiB cap
was measured and removed in 39.04 seconds. The live sampler gives an
indirect observation of the real cache: with no job running, its 38.6 GiB
cache plus the other three paths took 6 to 11 seconds per row beyond the
30-second sleep, slower per GiB than the synthetic shape. The Mac Zig
cache's entry count was not measured, so the hook's measurement cost on
the real cache is observed only within that bound. With the cap applied, a
hook measures at most `S + G`, about 34 GiB.


What changed
------------

*tools/selfhosted-mac/cleanup.sh* keeps the 40 GiB free-space prune as a
backstop and adds the size cap. When free space is at least 40 GiB, it runs
`du -skPx zig` inside the physically resolved *.cache* directory of the
account home that `dscl` reports, after the same checks as the prune: that
home and *.cache* have no linked component, *zig* is not a link, and
`$HOME` resolves to the same home. Above the cap it removes that cache. A
failed measurement or removal is logged and keeps the cache. The cap comes
from `OSEO_ZIG_CACHE_CAP_GIB`, a whole number of GiB from 1 to 38 that
*tools/selfhosted-mac/install-service.sh* writes into the LaunchDaemon
environment with a default of 30. The hook falls back to 30 and logs a
warning for an invalid value; the installer rejects one.
*tests/macos-lanes.test.ts* covers the cap on Linux with stubbed `dscl`,
`df`, and `du`, plus one run of the host's real `du`. The macOS runs above
used the real `dscl` and BSD `du`.

*docs/self-hosted-mac.md* gives the maintainer's commands to install the
updated hooks.


Installation and verification
-----------------------------

The measurements above predate the installation. The maintainer installed
the hooks for `oseo-mac-1` on 2026-10-06, at about 03:40 KST, with
*install-service.sh* at main `6654ccf7` and `OSEO_ZIG_CACHE_CAP_GIB=30`.
PlistBuddy printed 30, and `cmp` found the installed *cleanup.sh* equal to
the repository copy.

Branch run `37360463788`, on `m5ci-cap-verify` at a commit whose tree
equals `6654ccf7`, ran 15 Mac jobs on `oseo-mac-1`. According to the
GitHub jobs API and job logs:

 -  The first, test262 7/12 (job `111933637542`), entered the job-started
    hook at 19:02:44Z and logged
    `Pruned Zig cache because it exceeded the 30 GiB cap` at 19:08:15Z.
    The hook took a measured 5.5 min from entry to that message, which
    includes measuring and removing the 63.6 GiB live cache. The log does
    not separate the two. That is far above the measured 39.04 seconds for
    measuring and removing the synthetic 63.6 GiB tree above, so the
    synthetic shape understates the real cache's cost. The job took a
    measured 10.0 min.
 -  That prune was a one-off: the cache had grown past the cap before the
    hooks were installed. With the cap in place, a hook finds the cap plus
    one job's growth, a derived 33.8 GiB with U25's measured 3.8 GiB maximum
    growth. That is an estimate rather than a bound, but a later prune is
    expected to remove far less than this one. Its removal time has not been
    measured.
 -  The coordinator observed free disk rise from the measured 92.5 GiB
    minimum of run `37315038080` to 155 GiB after the prune.
 -  The other 14 jobs took a measured 4.3 to 6.9 min after the cache was
    emptied, with no sign of the first-execution penalty after the
    installer's daemon restart. The U17 probe was not rerun.
 -  All 15 jobs passed, a derived 87.1 min as the sum of their measured
    durations. This run was measured
    once.

Attempt 1 of the run failed only because three hosted macOS jobs were never
acquired by a hosted runner; the `--failed` rerun, attempt 2, passed.
