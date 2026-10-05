Two concurrent jobs on the Mac mini
===================================

This unit measured whether the self-hosted Mac mini that runs
`oseo-mac-1` can run two Mac-eligible CI jobs at once. The measurement ran
on 2026-10-05 from 05:21 to 10:58 UTC, at main commit `317b58bb`, as the
`dahlia` account over SSH. No runner, LaunchDaemon, security setting,
repository variable, or secret was changed, and no second runner was
registered. Every number below is labeled measured or derived. The raw
logs and 2-second samples remain under *~/m5ci-results/u25/runs/* on the
Mac.


Host and method
---------------

The host is the U21 machine: an Apple M6 with 12 logical CPUs and 16 GiB
of memory, running macOS 27.0.1. Two new clones, *~/Desktop/oseo-m5ci-u25-a/*
and *~/Desktop/oseo-m5ci-u25-b/*, were checked out at `317b58bb`, each with
its own `ZIG_GLOBAL_CACHE_DIR` (*~/m5ci-results/u25/zig-a/* and *zig-b/*),
standing in for two runner work directories. Both used the account's shared
runtime-archive directory, *~/Library/Caches/oseo/*. The U21 clone was not
touched.

[*scripts/job.sh.txt*](./scripts/job.sh.txt) runs a job's steps after
checkout and tool installation exactly as the generated workflow does:
`mise run build` and `mise run ci:runtime-archive-cache` from the
runtime-archive action, then the job's test commands with the workflow's
arguments and environment. It sets `GITHUB_ACTIONS=true` and `CI=true`,
as on a runner, and a fresh `TMPDIR` per job. The five representative jobs
are the heaviest Mac-measured job of each eligible family in
`selfHostedJobSeconds` of *tools/macos-job-costs.ts*, plus a second test262
shard:

| Key      | CI job                                 | Test command                                                                                                                          |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `t262-8` | `test262 (macos-aarch64, 8/12)`        | `mise run test:test262 --shard 8/12`                                                                                                  |
| `t262-1` | `test262 (macos-aarch64, 1/12)`        | `mise run test:test262 --shard 1/12`                                                                                                  |
| `ns-1`   | `native support (macos-aarch64, 1/12)` | `mise run test:property:extended:package`, then `mise run test:property:extended:native:shard --shard 1/12 --exclude-case-sharded …`  |
| `ok-3`   | `own-key cases (macos-aarch64, 3/3)`   | `mise run test:property:extended:native:shard tests/property/m5-object-own-keys.property.test.ts` with `OSEO_PROPERTY_CASE_SHARD=3/3` |
| `nat-3`  | `native (macos-aarch64, 3/3)`          | `mise run test:native --shard 3/3`                                                                                                    |

The own-key job also set `OSEO_PROPERTY_DURATION_FILE`, and its duration
records are reported below. A job wall here starts at `mise run build` and
ends with the last test command; it excludes checkout, tool installation,
the cache action, and runner handover.

[*scripts/sampler.py.txt*](./scripts/sampler.py.txt) sampled every
2 seconds: `kern.memorystatus_level` (the free percentage that
`memory_pressure -Q` prints), `kern.memorystatus_vm_pressure_level`
(1 normal, 2 warning, 4 critical), `vm.swapusage`, the `vm_stat` counters
for pageouts, swapins, swapouts, compressions, decompressions, free pages,
and pages occupied by the compressor, the one-minute load, and the summed
RSS of each job's process tree from `ps`. Tree RSS counts only descendants
still attached to the job script, and two-second sampling can miss shorter
peaks.

Before every experiment, and every 30 seconds during it, the Linux-side
driver [*scripts/drive.sh.txt*](./scripts/drive.sh.txt) checked
`gh api repos/dahlia/oseo/actions/runners` for `oseo-mac-1` being idle and
`gh run list` for zero queued or in-progress runs. All 674 checks in
[*idle-checks.tsv*](./idle-checks.tsv) observed an idle runner and no
active run, so no experiment was contaminated or repeated.
[*driver.log.txt*](./driver.log.txt) is the driver's log. A temporary
`caffeinate -ims` assertion kept the Mac awake and was stopped afterwards.

The order was: ten cold solo runs (each job once per clone on an empty Zig
cache), ten warm solo runs (the same again on those caches), then twelve
paired experiments. The plans are under [*scripts/*](./scripts/).


Solo baseline
-------------

[*solo.tsv*](./solo.tsv) gives each measured job wall, and
[*resources.tsv*](./resources.tsv) gives each experiment's memory counters.
Measured job walls in seconds, clone A then clone B:

| Job      | Cold         | Warm         | Peak tree RSS (MiB) | Own-key duration / limit (s) |
| -------- | ------------ | ------------ | ------------------: | ---------------------------- |
| `t262-8` | 439.8, 442.3 | 425.9, 428.0 |         4,050–4,125 |                              |
| `t262-1` | 366.7, 366.9 | 367.0, 364.5 |         3,977–5,182 |                              |
| `ns-1`   | 950.6, 953.5 | 954.2, 953.8 |         2,104–2,190 |                              |
| `ok-3`   | 348.9, 349.9 | 349.7, 349.2 |         1,238–1,252 | 347.5–348.5 / 3,600          |
| `nat-3`  | 391.8, 392.6 | 373.5, 374.4 |         1,816–1,967 |                              |

The clones agree within 3 seconds for every job and state. The warm Zig
cache saved a measured 14 to 18 seconds for `nat-3` and `t262-8` and
nothing measurable for the others; the next section explains why. Pair
slowdowns below use the mean of the two warm solo walls.

Test262 is the largest memory consumer, at 4.0 to 5.2 GiB of tree RSS with
its eight-worker pool, ahead of native support, native fixtures, and
own-key cases. Solo runs never left normal memory pressure. The memory
level stayed at 73 to 74 percent, swap stayed at 57.31 MiB with no
swapouts, and pageouts were at most 3 per run.

These SSH-launched walls are not runner-mode walls. The measured Mac CI
medians of the same jobs in `selfHostedJobSeconds` are 366 s for
`t262-8`, 345 s for `t262-1`, 752 s for `ns-1`, 442 s for `ok-3`, and
363 s for `nat-3`, and they include setup. Four of the five ran
faster in runner mode, and `ok-3` ran slower; this unit did not isolate the
cause. The slowdowns below compare SSH runs with SSH runs only.


Zig cache growth and the disk floor
-----------------------------------

[*cache-growth.tsv*](./cache-growth.tsv) bins every file of both Zig caches
by its birth time into the experiment that created it. Every run, cold or
warm, added new files: a measured 1.9 to 2.2 GiB per test262 job, 3.8 GiB
per `ns-1`, and about 1.0 GiB per `ok-3` or `nat-3`. Warm runs added as
much as cold ones because each run builds in fresh per-run staging paths,
as U5 found, so the Zig cache gives almost no reuse to these jobs.

Before deletion, `du -sk` measured 49.5 GiB of allocated space in each
cache, 99.0 GiB together. The file sizes in *cache-growth.tsv* sum to
97.8 GiB, all of it born inside an experiment window; the 1.2 GiB
difference is block allocation and directory overhead that `du` counts.
Free
disk space fell below the 60 GiB floor set for this unit between 09:08
and 09:17 UTC (derived from the cumulative file growth against the 119 GiB
free at the start) and measured 16 GiB at 11:01 UTC, when both caches were
deleted. Free space then measured 116 GiB. No CI job ran in that window. The
free space was not sampled during the runs; this is a reconstruction, not a
continuous measurement.

Before the measurements, with the coordinator's approval, the U21 Zig
caches under *~/m5ci-results/caches/* were deleted to make room: 59 GiB
across `native-serial*`, `ownkeys-*`, `test262-serial*`, and
`sanitizer-serial*`. [*deleted-caches.txt*](./deleted-caches.txt) lists
both deletions with sizes and `df` before and after. The U21 logs,
TSVs, clone, and images were kept.

This growth is an observation of the SSH clones, not of the runner
account. The runner's hooks prune its Zig cache when free space falls below
40 GiB. A second runner would add cache files at up to twice the rate.


Pairs
-----

Each pair ran two runner slots at once, one in each clone. A slot can run
two jobs back to back, as a CI lane does, so that a short job stays
overlapped with a long one. Each pairing ran twice with the clones
swapped. [*pair-jobs.tsv*](./pair-jobs.tsv) gives every job, and
[*pair-throughput.tsv*](./pair-throughput.tsv) every pair.

The slowdown is the measured pair wall divided by the warm solo mean. When
a job ran partly alone after its partner finished, the overlapped factor
is derived as the overlapped seconds divided by the solo work left for
the overlap, assuming solo speed while alone. The throughput factor is
the sum of the jobs' warm solo means divided by the pair's elapsed time.

| Pairing                         | Slot 1   | Slot 2             | Slowdown, slot 1 | Slowdown, slot 2           | Overlapped factor, slot 1 | Throughput   |
| ------------------------------- | -------- | ------------------ | ---------------- | -------------------------- | ------------------------- | ------------ |
| test262 + test262               | `t262-8` | `t262-1`           | 1.209, 1.199     | 1.195, 1.193               | 1.256, 1.241              | 1.536, 1.549 |
| native support + test262        | `ns-1`   | `t262-8`, `t262-1` | 1.233, 1.229     | 1.072, 1.073; 1.007, 1.002 | 1.367, 1.360              | 1.485, 1.490 |
| native support + own-key        | `ns-1`   | `ok-3`, `nat-3`    | 1.030, 1.035     | 1.266, 1.263; 1.034, 1.033 | 1.036, 1.042              | 1.707, 1.698 |
| own-key + test262               | `ok-3`   | `t262-8`           | 1.377, 1.374     | 0.997, 1.001               | 1.448, 1.441              | 1.613, 1.617 |
| native fixture + test262        | `nat-3`  | `t262-8`           | 1.328, 1.326     | 0.998, 1.003               | 1.404, 1.398              | 1.613, 1.615 |
| native support + native support | `ns-1`   | `ns-1`             | 1.124, 1.119     | 1.124, 1.119               | 1.124, 1.119              | 1.779, 1.787 |

The interference is asymmetric. Test262, with its eight-worker pool, ran
close to its solo speed beside a property or fixture job, a measured
0.997 to 1.073 times its solo wall, and slowed 1.19 to 1.21 beside another
test262 job. Jobs with one to three workers paid most of the cost: beside
test262, `ns-1` ran a derived 1.36 to 1.37 times slower while overlapped,
`nat-3` 1.398 to 1.404, and `ok-3` 1.44 to 1.45. Two property jobs together
slowed only 1.12. Every pair raised throughput, by a derived 1.49 to 1.79
times. Four of the six pairings exceeded U21's 1.55 for one duplicated property
shard; the two with test262 beside test262 or native support did not.

All 48 jobs passed. Every job's steps exited 0 and its failure flag was 0,
as the `exit` and `fail` columns of [*solo.tsv*](./solo.tsv) and the
`step_exits` and `fail_flag` columns of [*pair-jobs.tsv*](./pair-jobs.tsv)
record. The retained *exp.sh* and *slot.sh* do not propagate a job's
failure to the experiment, so these per-job records are the source of the
verdict. [*results.txt*](./results.txt) keeps each job's result lines: 1,782
selected test262 paths with the same pass, expected-negative, and unsupported
counts in every run of each shard; 88 of 264 native fixtures and 88 cross
builds; and zero failed or canceled property tests. No job hit a timeout.

The own-key shard used its hard limit least of all. Its measured
`durationMilliseconds` was 347.5 to 348.5 s solo (*solo.tsv*), 439.9 and 441.0
s beside `ns-1`, and 478.7 and 479.7 s beside test262 (*pair-jobs.tsv*),
against the 3,600 s limit that also bounds the sum of all three shards. Three
shards at the slowest paired value sum to a derived 1,439 s, 40 percent of the
limit.

### Memory in pairs

Measured over the 12 paired experiments, from 240 to 586 samples each:

 -  The memory pressure level stayed 1, normal, in every sample. No
    sample reached warning or critical.
 -  `kern.memorystatus_level` fell to 69 to 73 percent, against 73 to 74
    solo and idle.
 -  Swap never grew. It stayed at 57.31 MiB through the first pair,
    then fell to 49.31 MiB and stayed there. Swapouts were 0 in every pair;
    one pair recorded 4 swapins.
 -  Pageouts were 0 to 4 per pair, as in solo runs.
 -  The compressor worked harder. Pairs with two test262 pools, or test262
    beside `ns-1`, compressed up to a measured 253,085 pages (3.9 GiB)
    and decompressed up to 170,467 pages in one experiment, against at most
    5,090 compressions solo. The memory it occupied rose from about
    1,780 MiB idle to at most 2,357 MiB.
 -  The summed peak tree RSS of both jobs was at most 5,996 MiB, which
    leaves about 10 GiB of the 16 GiB for the system, file cache, and the
    compressor.
 -  The one-minute load reached 34 on 12 CPUs with two test262 pools.

The ambient load included `mediaanalysisd` at about 110 percent CPU at the
start and the Spotlight indexer, as in U21. Runner processes such as
`Runner.Listener` and `Runner.Worker` were not part of these trees; the idle
listener measured 76 MiB RSS.


Verdict
-------

Two concurrent jobs were memory-safe in each of the six measured pairings:
memory pressure stayed normal, swap did not grow, pageouts stayed at solo
levels, no deadline came close to its limit, and every test passed with
unchanged counts. None of the six measured pairings needs to be excluded for
memory or deadlines. That verdict is limited to those six. They cover every
eligible family against test262, the heaviest-memory family and the most
common partner, and native support against itself, own-key cases, and native
fixtures.

Native fixture + native fixture, own-key + own-key, and own-key + native
fixture were not measured, and this unit gives no verdict for them. Summing
each job's largest measured solo peak tree RSS gives a derived figure for
each, not a measurement, because the two peaks need not coincide and
interference can change them:

| Unmeasured pairing, derived     | Sum of solo peaks (MiB) |
| ------------------------------- | ----------------------: |
| native fixture + native fixture |   3,934 (1,967 + 1,967) |
| own-key + native fixture        |   3,219 (1,252 + 1,967) |
| own-key + own-key               |   2,504 (1,252 + 1,252) |

All three are below the measured 5,996 MiB maximum pair and the 16 GiB of
memory, but two exceed the measured 3,177 MiB peak of experiment `p-ok-ns-1`
(native support beside own-key, then native fixture), so they are not
bounded by every measured pair.

Three limits remain:

 -  This is SSH mode under `dahlia`, not runner mode. A second runner's
    jobs would run under launchd with the runner account, and its
    first-execution behavior needs the same Developer Tools grant and U17
    probe as `oseo-mac-1`.
 -  Disk, not memory, is the binding resource. A second runner doubles the
    rate at which Zig caches grow, and the existing 40 GiB prune does not
    bound either runner's cache; the next section analyzes it.
 -  Three or more concurrent jobs were not measured.


Merge-wait effect (derived)
---------------------------

[*model/u25model.py.txt*](./model/u25model.py.txt) reruns the U12 lane
model of [*PLAN-GATE.md*](../../../PLAN-GATE.md), kept as
[*model/proj.py.txt*](./model/proj.py.txt),
[*model/proj2.py.txt*](./model/proj2.py.txt), and
[*model/proj4.py.txt*](./model/proj4.py.txt), over the same ten attempts
in _model/jobs-\*.tsv_. With two Mac lanes, the model places the own-key
shards first and then the other jobs longest first, as in U12. It
multiplies every Mac job's cost by its family's factor. Rename the
*.py.txt* files to *.py* to run them. Called with a uniform 1.29, it
reproduces the U12 rows exactly.

The factors are derived per-family maxima of the overlapped factor, which
is itself derived from measured job walls:
1.26 for test262, 1.37 for native support, 1.45 for own-key cases, and 1.41
for native fixtures, each rounded up from the largest value in
*pair-jobs.tsv*. Applying them to every Mac job is pessimistic,
because most jobs either ran beside a lighter partner or partly alone. A
uniform 1.45, the largest factor of any family, is the upper check.
[*model/u25model-output.tsv*](./model/u25model-output.tsv) has the
output.

| Configuration, derived                      | Mac jobs | At 21,383 paths (min) | At 41,091 paths (min) |
| ------------------------------------------- | -------: | --------------------: | --------------------: |
| One Mac lane, U24 assignment (current main) |       15 |   82.7 / 94.1 / 108.1 | 113.3 / 130.3 / 145.1 |
| One Mac lane, recomputed medians            |       15 |   89.8 / 93.2 / 115.3 | 112.1 / 116.3 / 132.3 |
| Two Mac lanes, U21 factor 1.29              |   19, 18 |    71.8 / 76.1 / 88.7 |   90.3 / 93.2 / 110.6 |
| Two Mac lanes, derived family maxima        |   18, 18 |    76.5 / 80.4 / 90.6 |   93.2 / 96.3 / 110.6 |
| Two Mac lanes, uniform 1.45                 |   17, 18 |    80.7 / 82.5 / 93.9 |   94.4 / 97.3 / 112.5 |

Each cell gives the minimum, median, and maximum scenarios. At
41,091 paths, two Mac lanes with the derived family maxima give a derived
93.2 to 110.6 min. That holds the two-hour goal in all three scenarios,
the maximum by 9.4 min, where one Mac lane holds it only in the minimum
and median scenarios with recomputed medians. Against one lane with
recomputed medians the derived gain is 18.9, 20.0, and 21.7 min; against
the current U24 assignment it is 20.1, 34.0, and 34.5 min. At the current
21,383 paths, the gain against U24 is 6.2, 13.7, and 17.5 min.

In the maximum scenario at 41,091 paths, a hosted lane ends last at
110.6 min, with test262 10/12, the Apple-clang sanitizer property job, and
native fixture 3/3, so the Mac factors no longer set that value. In the median
scenario the second Mac lane ends last, at 96.3 min. The model omits the
measured 0.5 to 1.5 min of lane overhead, hosted waits, and the aggregate job.
Its Mac costs are runner-mode medians with factors derived from SSH
measurements applied. A
two-attempt branch run with two runner slots would need to confirm it.


Disk with a second runner (derived)
-----------------------------------

[*disk-usage.txt*](./disk-usage.txt) records a read-only measurement as
`dahlia` over SSH at 11:21 UTC, after the U25 caches were deleted. `df -Pk`
measured a 228.2 GiB volume group with 116.3 GiB free and 111.9 GiB used,
below the 256 GiB that *docs/self-hosted-mac.md* names. Of the used space, a
measured 46.0 GiB is attributable without the runner account: 12.7 GiB on
the system volume, 13.3 GiB on the preboot, recovery, and VM volumes, and
20.0 GiB that `du` could read on the data volume. The other 65.7 GiB of the
data volume is unattributed by this measurement. Known paths that `dahlia`
cannot read include the mode-700 *~oseo-runner* home, with `oseo-mac-1`'s
runner, tools, Zig cache, and runtime archive, and root-only system
directories. Attributing it needs *tools/selfhosted-mac/health.sh* or
`du` under `sudo`. The macOS 15.6.1 restore image that U21 kept in
*~/m5ci-images/* is gone, and no *.ipsw* file was visible to `dahlia`.

*tools/selfhosted-mac/cleanup.sh* runs at the start and the end of every job.
It reads free space on the shared volume and, below 40 GiB, removes the
*~/.cache/zig* of the invoking account only. The LaunchDaemon that
*tools/selfhosted-mac/install-service.sh* writes sets `ZIG_GLOBAL_CACHE_DIR`
to that same account-local path, and the workflow does not override it, so
each job grows its own account's cache. The hook is therefore a shared
free-space trigger with a per-account action, not a cap on any cache. With a
second runner under a second account, derived from that logic and the
measured 3.8 GiB maximum growth of one job:

 -  The current hook guarantees no free-space floor and no bound on the
    combined caches. A prune restores 40 GiB free only when the invoking
    account's own cache is large enough; it cannot when the other account's
    cache or other usage holds free space below 40 GiB, and a skipped prune
    reclaims nothing. Even when every hook leaves at least 40 GiB free, two
    concurrent jobs add up to 7.6 GiB between hooks, so free space can fall
    to 32.4 GiB before the jobs' work directories and temporary files, which
    this unit did not measure.
 -  A runner whose last hook saw at least 40 GiB free keeps its cache when
    it goes idle. For example, that cache can then be as large as 228.2 GiB
    minus the non-cache usage, the other cache, and 40 GiB: 142.2 GiB with
    the measured 46.0 GiB lower bound of non-cache usage and an empty other
    cache. A skipped or failed prune can leave a cache intact below 40 GiB
    free as well. Nothing on the other account shrinks it afterwards.
 -  Beside such an idle cache, the active runner sees less than 40 GiB at
    nearly every hook and prunes its own cache, which holds its own jobs'
    growth. While those prunes succeed, job growth alone cannot push free
    space below about 36.2 GiB with one active job at the measured rates.
    The active runner loses its cache each time, which cost at most the
    measured 14 to 18 s warm saving, and nothing reclaims the idle cache
    when other usage grows, such as runner updates, *oseo-temp/*,
    diagnostics, or macOS updates.
 -  With two runner roots under one account, both LaunchDaemons point
    `ZIG_GLOBAL_CACHE_DIR` at one *~/.cache/zig*, and either runner's hook
    can delete it while the other runner's job is building in it. That
    layout was not measured and is not safe with the current hook.

A lower free-space threshold would not bound the idle cache, because the
threshold is only the trigger level. A per-account size cap would: each
hook also removes its own account's cache when it exceeds a size `S`, with
the 40 GiB trigger kept as the backstop. For two accounts it suffices when
two full caches, two jobs' growth, each job's work directory and
temporary files `W` (including the runner's `TMPDIR`, *oseo-temp/*, which
the hooks never clear), the second account's own non-cache usage `R`
(runner, tools, and runtime archive), a reserve for other growth, and
today's usage leave 40 GiB free. Counting all 111.9 GiB in use
today as non-cache, which overstates it by `oseo-mac-1`'s current cache,
that bounds twice `S`, plus `R`, plus twice `W`, plus the reserve at a
derived 68.7 GiB. Neither
`R` nor `W` was measured; for scale, `dahlia`'s own mise tools and runtime
archive directory measured 1.0 and 1.8 GiB. `S` is therefore strictly below
34.3 GiB, and a 34 GiB cap would leave about 0.7 GiB for `R`, both `W`, and
the reserve, so the cap must be derived after measuring both accounts' usage
and a job's peak work-directory and temporary use under `sudo`. The measured
warm reuse is small enough that a much lower cap costs little. Two runner roots
under one account need cross-runner management instead: a separate
`ZIG_GLOBAL_CACHE_DIR` per runner, and a hook that caps and prunes each
runner's own path so that the combined size stays bounded and no prune removes
a cache in use. Neither change is made here.


Proposal, not applied
---------------------

If the maintainer decides to try two slots, these are the steps. The ones
that need `sudo` or GitHub credentials are the maintainer's to run:

1.  Register a second runner, for example `oseo-mac-2`, once and without
    `--ephemeral`. Use either a second dedicated standard account or a
    second runner root under `oseo-runner`. Pin it like the first, with
    its own LaunchDaemon installed by
    *tools/selfhosted-mac/install-service.sh*. A second account gives each
    runner its own home, and so its own Zig cache and runtime archive
    directory. This measurement used separate Zig caches but one shared
    runtime archive directory, so neither layout was measured exactly: a
    second account separates both caches, and a shared account shares
    both.
2.  Grant **Developer Tools** to that runner's *bin/Runner.Listener*,
    restart its daemon with `sudo launchctl kickstart -k`, and run the U17
    first-execution probe through it, as for `oseo-mac-1`.
3.  Precondition, not done: before the second runner takes jobs, bound
    each runner's Zig cache as the previous section derives. Under `sudo`,
    measure both accounts' disk usage and one job's peak work-directory and
    *oseo-temp/* use, keep a reserve for other growth, derive the
    per-account size cap from them (strictly below 34.3 GiB), and add it
    to *tools/selfhosted-mac/cleanup.sh* in a separate reviewed change. With
    a shared account, also give each runner its own `ZIG_GLOBAL_CACHE_DIR`
    and make the hook cap and prune each runner's path, so that the combined
    size stays bounded and one runner's prune cannot delete a cache in use.
    Watch free disk during the first runs.
4.  Setting `configuredSelfHostedLanes` in *tools/macos-lane-config.ts* to
    2 and regenerating the workflow is a separate change with its own
    two-attempt branch measurement. It would also change the availability
    probe and the generated labels. This unit changes no workflow,
    generator, or runner script.
