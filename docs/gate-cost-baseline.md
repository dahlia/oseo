Evidence gate cost baseline
===========================

Current CI baseline (observed 2026-09-27)
-----------------------------------------

The current baseline uses successful main runs [36243816479] and
[36261458909]. Their commits are `00153abe` and `c9b3cc80`, respectively.
Each has a measured reviewed count of 21,383 paths, read from that commit's
*tests/test262/results.yaml* by the command below. The measured path sets
in *tests/test262/subset.yaml* are identical; a derived comparison finds
33 classification promotions between the commits. Equal counts therefore
permit workload normalization, but do not establish identical execution work.

All current wall times are measured from GitHub job or step timestamps.
Sums, maxima, means, spreads, ratios, fixed-cost allocations, and normalized
rates are derived from those measurements. Table captions identify their
source runs; each row in the detailed tables identifies its source job.
Job times exclude queue waiting, include setup and cleanup, and are elapsed
runner minutes rather than billing-rounded minutes. The execution series
below uses step times, which exclude job setup and cleanup. No CI run was
triggered.

The coordinator's M5CI planning brief for this measurement task specifies a
ceiling of 628 macOS minutes and identifies its baseline source as main run
[35456667007] at `32ece7f4`. That commit's measured reviewed count is
20,841 using the count command below. The brief itself is not checked into
this repository. The baseline run's derived macOS family total is 629.52 min
from measured job timestamps, or 629 min when the aggregate is floored.
The brief's 628-minute ceiling was retained as the planning budget; its exact
value is not reproduced by rounding or flooring the preserved timestamps.
The measured source is preserved in the family table below.
On 2026-10-05 the maintainer superseded that ceiling with a push-to-green
goal of about two hours per merge, without reducing coverage; see
[Merge-wait goal and projection (U12)](../PLAN-GATE.md#merge-wait-goal-and-projection-u12)
in [*PLAN-GATE.md*](../PLAN-GATE.md). The ceiling stays here as historical
context for the measurements below. The target is the measured inventory of
41,091 applicable paths recorded in [*PLAN-M5C.md*](../PLAN-M5C.md) and
reported by `mise run check:test262-inventory`. Against that planning ceiling,
neither current run fits even at its measured smaller workload. Scaling test262
alone by path count would ignore fixed cost, classifications, runner spread,
and the separately measured property bottleneck.

[35456667007]: https://github.com/dahlia/oseo/actions/runs/35456667007
[36243816479]: https://github.com/dahlia/oseo/actions/runs/36243816479
[36261458909]: https://github.com/dahlia/oseo/actions/runs/36261458909

### U21 dedicated Mac mini day-one measurements

The new dedicated Mac mini is an Apple M6 with 12 logical CPUs and 16 GiB
RAM. It runs macOS 27.0.1 (26A434), Apple clang 21.0.0, and mise-pinned
Zig 0.16.0. These observed host facts and the commands are in
[*docs/evidence/u21/README.md*](./evidence/u21/README.md). All Mac job
measurements use main commit `2434dd8b`. The machine remains unregistered
as a GitHub runner, and the self-hosted routing switch remains off.

The exact U17 probe measured 48 fresh binaries in each cohort, twice
under each policy. With the default policy, the serial first pass took
11.29–12.90 s for Zig or Apple clang across the two trials, and an
immediate second pass took 0.32–0.36 s. After the user granted Developer
Tools permission to the SSH wrapper in the GUI, the serial first pass
took 0.108–0.109 s for both compilers in both new trials. Three launch
workers reduced the default-policy first pass to 4.29–4.36 s in three
of four trials; one Apple-clang trial took 0.218 s and remains an
unexplained outlier. These measurements show the first-execution penalty
on this M6 and its mitigation for SSH descendants. The eventual launchd
runner needs a separate permission check.

The hosted reference is main run [36721134885] at the same SHA. Its
four compared macOS steps were each measured once at that SHA. Main run
[36657614384] is a second observation at the older SHA `df5cb7a1`, so it
shows a spread but is not an exact-SHA repeat. The table uses step wall
seconds, excluding checkout, mise install, runtime archive restore, and
job cleanup. Mac setup and test wall times are reported separately. The
Mac's cold and warm Zig caches are separate from the hosted cache state.
The Mac cold steps also built their representative runtime archive keys
inside the timed step, while every compared hosted job hit its action
cache key in setup. Additional variant keys can be created by both
machines, and [*mac-archive-counts.tsv*](./evidence/u21/mac-archive-counts.tsv)
records their Mac-side counts. Thus the cold ratios below mix archive
states. The warm ratios are closer in
cache state, but still use different operating systems and, for the
sanitizer, different Apple clang versions.
All four compared hosted jobs reported runtime archive cache hits in
[*docs/evidence/u21/hosted-cache.txt*](./evidence/u21/hosted-cache.txt).
All retained Mac family steps below ran after the user enabled Developer
Tools access for the SSH wrapper. Their ratios are conditional on that
grant; the unconfigured launchd runner may face the default-policy
first-execution cost.
Only the 48-binary probe has a same-host default-policy comparison;
the M6 test262 shard was measured only after the GUI grant.

| Family and shard              | Hosted same SHA | First Mac cold | First Mac warm | Derived hosted/Mac cold | Derived hosted/Mac warm |
| ----------------------------- | --------------: | -------------: | -------------: | ----------------------: | ----------------------: |
| test262 1/12                  |         1,508 s |       224.06 s |       200.26 s |      6.73 (pool 8 vs 3) |      7.53 (pool 8 vs 3) |
| native fixture 1/3            |           817 s |       272.71 s |       242.95 s |                    3.00 |                    3.36 |
| extended native property 1/12 |         2,815 s |     1,074.85 s |     1,069.89 s |                    2.62 |                    2.63 |
| Apple-clang sanitizer native  |         1,935 s |       723.74 s |       719.09 s |                    2.67 |                    2.69 |

The second Mac sequence used the same SHA, shard, seed, worker width,
and toolchain within each family. The ratios again use the one same-SHA
hosted step per family as their numerator:

| Family and shard              | Second Mac cold | Second Mac warm | Derived r cold | Derived r warm |
| ----------------------------- | --------------: | --------------: | -------------: | -------------: |
| test262 1/12                  |        431.30 s |        408.14 s |           3.50 |           3.69 |
| native fixture 1/3            |        365.54 s |        330.64 s |           2.24 |           2.47 |
| extended native property 1/12 |      1,155.07 s |      1,138.32 s |           2.44 |           2.47 |
| Apple-clang sanitizer native  |        944.02 s |        844.51 s |           2.05 |           2.29 |

These are measured task seconds and derived ratios, not a confidence
interval. [*serial-repeats.tsv*](./evidence/u21/serial-repeats.tsv)
retains the Mac start/end times and pass verdicts. The repeat driver
ran detached from SSH, and its exact first-execution policy was not
separately probed. Neither sequence establishes runner-mode speed.
The second sequence preserved the first sequence's test262 counts,
88 native host fixtures plus 89 cross-builds, six extended-property
tests, and all 264 sanitizer fixtures, with no reported failure.

The test262 run selected 1,782 of 21,383 reviewed paths and passed all
expected classifications in each first-pair Mac trial: 1,535 passes, 131
expected negatives, and 116 unsupported-profile cases. The native fixture shard
passed 88 of 264 host fixtures and all 89 AArch64 Linux cross-builds in each
first-pair trial. A first native cold attempt measured 540.51 s of wall time
but overlapped a Tailscale/SSH outage and was excluded from the speed ratios.
Its own harness reported 286.79 s; the 253.72 s gap is derived from those two
observations and may include sleep or another unknown pause. A temporary
user-level `caffeinate` assertion preceded the retained cold and warm trials.

These ratios compare complete task steps at their actual worker widths.
The Mac test262 pool used eight workers, while the hosted macOS runner
used three, as the [U21 width records] show. Its ratios describe
one-runner whole-shard throughput, not per-worker speed, and cannot be
used unchanged for two concurrent Mac jobs.
The older-SHA hosted test262 step took 1,188 s instead of 1,508 s;
substituting it would yield derived 5.30 cold and 5.93 warm ratios.
That is a sensitivity illustration, not an exact-SHA repeat or a
confidence interval. Both hosted runs reported a three-worker pool.
The Mac's second same-SHA test262 sequence measured 431.30 s cold and
408.14 s warm with the same eight-worker pool and all 1,782 paths
passing. Against the same hosted step, its derived ratios are 3.50
and 3.69. [*repeat-load-sample.txt*](./evidence/u21/repeat-load-sample.txt)
begins one second into the second warm step and shows `mediaanalysisd`
active then. No process sample covers the second cold step, and the
source of the spread was not isolated. It limits the precision
of any scheduling ratio from the first sequence.

The Mac's native fixture job
used the same shard definition as hosted, and its first retained cold
trial used a fresh Zig cache. The macOS runtime-archive directory was
shared across families despite separate `XDG_CACHE_HOME` values. The
native trial's key file was born after that cold trial began, as
[*mac-archives.tsv*](./evidence/u21/mac-archives.tsv) records. The
hosted native job also hit the runtime archive cache.
The second native fixture sequence measured 365.54 s cold and 330.64 s
warm, yielding derived 2.24 and 2.47 ratios against the same hosted
step. All 88 host fixtures and 89 cross-builds passed again.
The extended-property shard used three workers and the same three files
on both machines. Its own-keys file dominated the wall time: measured
1,074.20 s cold and 1,069.14 s warm on the Mac, versus 2,812.75 s in
the same-SHA hosted job. The derived same-width own-keys file ratios are
2.62 and 2.63. The 4.96 s difference between the two Mac shard steps
is measured once at each cache state; it is too small to claim a cache
benefit without repetitions within each state.
The second same-SHA Mac sequence measured 1,155.07 s cold and
1,138.32 s warm for the same shard, with its own-keys file taking
1,154.42 s and 1,137.64 s. The derived same-width file ratios against
the hosted 2,812.75 s are 2.44 and 2.47. This same-state spread
exceeds either within-sequence cold-to-warm gap.
The native fixture and Apple-clang sanitizer harness iterate fixtures
sequentially in one Node process on both machines at this SHA; this is
source-derived, rather than a runtime-reported worker count.

The Apple-clang sanitizer native step passed all 264 fixtures in every
Mac trial. The Mac used Apple clang 21 on macOS 27; the hosted reference used
Apple clang 17 on macOS 15. Its derived 2.67 and 2.69 ratios measure
throughput across distinct toolchains and cannot substitute for the hosted
sanitizer verdict. The native step's 4.65 s cold-to-warm gap was measured
once per state and is too small to attribute to cache reuse. The measured
Mac self-check and runtime sanitizer steps took 1.26 s and 70.65 s once;
the same-SHA hosted steps took 8 s and 308 s.
The second Mac sequence measured 944.02 s cold and 844.51 s warm for
the native step, with separate self-check and runtime setup of 4.25 s
and 74.15 s. Its 99.51 s cold-to-warm gap exceeds the first pair's
4.65 s, so neither pair establishes a cache saving. The second
derived native-step ratios are 2.05 and 2.29 across the different
Apple clang and macOS versions.

For two-runner capacity, two clones with separate Zig caches ran the same
extended native-property 1/12 shard at once. Both jobs passed six tests in
each of the cold and warm pairs. The measured pair elapsed time was 1,381 s
in each state, versus 1,074.85 s cold and 1,069.89 s warm for one serial
job. The derived throughput gain over two serial jobs was 1.56 cold and
1.55 warm; each job's latency increased about 27–28%. Thirty-second
samples recorded as little as `243M` unused memory cold and `260M` warm,
with sampled swap unchanged at 63.12 MiB. This one repeated-shard test
supports a capacity benefit, but its small sampled memory margin does not
justify enabling two runner services before mixed-job validation.
Both processes used one macOS runtime-archive directory, with distinct
keys because their Zig cache paths differed. Contention on a shared key
in an eventual runner setup was not measured.

Tart 2.40.1 installed and booted Apple macOS 15.6.1 and 26.6.2 restore
images on the M6, with each guest observed in `running` state with a DHCP
address. [*docs/evidence/u21/vm-images.txt*](./evidence/u21/vm-images.txt)
records the verified image digests and timestamps. The 15.6.1
guest differs from hosted `macos-15` 15.7.9; neither guest has a measured
Command Line Tools version or Oseo gate result. The bare host's pinned-Zig
jobs keep the `macos-aarch64` target class but carry macOS 27 provenance.
Apple-clang sanitizer evidence remains on hosted macOS 15 with clang 17.
The self-hosted route remains disabled pending an explicit choice between
a measured guest setup and a Zig-only bare-host assignment.

[U21 width records]: ./evidence/u21/README.md
[36657614384]: https://github.com/dahlia/oseo/actions/runs/36657614384
[36721134885]: https://github.com/dahlia/oseo/actions/runs/36721134885

### Runner-mode Mac lane runs (U23)

Five run attempts have executed with `OSEO_SELFHOSTED_MAC_ENABLED` on and
`oseo-mac-1` online. The table reads every value from the GitHub jobs API
for the named attempt. Push-to-green time runs from the attempt's
`run_started_at` to the last job's `completed_at`. Job minutes are summed
job walls from `started_at` to `completed_at`, so they exclude queue waiting.
Mac jobs are those whose `runner_name` is `oseo-mac-1`; hosted macOS jobs
are the other jobs of the 34-job macOS matrix. The Linux-hosted
`macOS self-hosted availability` probe is counted in neither. Lane ends are
minutes after `run_started_at`. All values are measured and rounded to
0.1 min.

| Source run, attempt | Commit     | Push-to-green | Mac jobs | Mac job min | Mac lane end | Hosted jobs | Hosted job min | Last hosted end |
| ------------------- | ---------- | ------------: | -------: | ----------: | -----------: | ----------: | -------------: | --------------: |
| [37194069657], 1    | `1c64f3cd` |         107.9 |       11 |        81.5 |         82.3 |          23 |          505.0 |           107.5 |
| [37194069657], 2    | `1c64f3cd` |         111.1 |       11 |        83.7 |         84.7 |          23 |          514.8 |           111.1 |
| [37206614757], 1    | `e115c408` |         113.5 |       11 |        79.0 |         80.2 |          23 |          527.1 |           113.1 |
| [37215661294], 1    | `29f11948` |         112.2 |       12 |        79.5 |         80.4 |          22 |          499.8 |           111.8 |
| [37215661294], 2    | `29f11948` |         105.3 |       12 |        78.8 |         80.3 |          22 |          489.4 |           104.8 |

The second and third Mac lane ends were recorded as 84.6 and 80.1 min in
[*PLAN-GATE.md*](../PLAN-GATE.md). The first used `created_at`, which
follows that attempt's `run_started_at` by 2 s; the second is 80.15 min
rounded down. The first three attempts placed the same 11 jobs on the Mac.
The two `29f11948` attempts placed the same 12 jobs there.

The earlier three push-to-green times span a derived 5.6 min. The two
attempts of `29f11948` alone span 6.9 min. Their derived mean of 108.7 min
is 2.1 min below the earlier mean of 110.8 min, less than either spread.
With two and three samples whose ranges overlap, these runs cannot
distinguish a retune effect on push-to-green time from runner variation. The
Mac lane ends of 80.4 and 80.3 min also lie inside the earlier 80.2 to 84.7
min. Hosted macOS job minutes fell by a derived 5.2 to 37.7 min with one fewer
hosted job, but the earlier three attempts alone span 22.1 min, so the size of
that reduction is not established.

Every Mac job in both `29f11948` attempts printed macOS 27.0.1 and reported
action cache hits for its mise and runtime-archive keys. The runner's
cleanup removed its whole Zig global cache after
`native support (macos-aarch64, 1/12)`, the last Mac job of attempt 1,
because free disk fell below 40 GiB. Attempt 2 therefore started with an
empty Zig cache and pruned nothing. Attempt 1 started with the cache left
by earlier runs; main run [37206614757] had pruned it after its first Mac
job. The Mac job minutes measured 78.8 in attempt 2 against 79.5 in
attempt 1. With one attempt per starting state and different job order,
this does not isolate a cold-cache effect, which was not measured
separately. It does not contradict the U5 finding that per-run staging
paths defeat Zig cache reuse.

The lane model in `29f11948` converts a Mac job's weight through
`60 + (weight - 60) / ratio` seconds and adds a 60-second probe allowance.
Each Mac job's modeled minutes below are derived from that formula; the
attempt columns are measured job walls from run [37215661294]:

| Mac job                                 | Weight (s) | Ratio | Modeled | Attempt 1 | Attempt 2 |
| --------------------------------------- | ---------: | ----: | ------: | --------: | --------: |
| `test262 (macos-aarch64, 8/12)`         |      2,007 |   4.5 |     8.2 |       6.1 |       6.0 |
| `native support (macos-aarch64, 1/12)`  |      1,958 |   2.9 |    11.9 |      12.5 |      12.2 |
| `native support (macos-aarch64, 4/12)`  |      1,410 |   2.9 |     8.8 |       6.6 |       6.6 |
| `native support (macos-aarch64, 2/12)`  |      1,351 |   2.9 |     8.4 |       8.1 |       8.1 |
| `native support (macos-aarch64, 8/12)`  |      1,333 |   2.9 |     8.3 |       5.5 |       5.3 |
| `own-key cases (macos-aarch64, 1/3)`    |      1,300 |   3.2 |     7.5 |       6.3 |       6.4 |
| `own-key cases (macos-aarch64, 2/3)`    |      1,300 |   3.2 |     7.5 |       6.2 |       6.2 |
| `own-key cases (macos-aarch64, 3/3)`    |      1,300 |   3.2 |     7.5 |       6.2 |       6.2 |
| `native support (macos-aarch64, 6/12)`  |      1,236 |   2.9 |     7.8 |       5.9 |       5.9 |
| `native support (macos-aarch64, 12/12)` |      1,175 |   2.9 |     7.4 |       5.0 |       4.9 |
| `native support (macos-aarch64, 10/12)` |      1,091 |   2.9 |     6.9 |       5.1 |       5.0 |
| `native (macos-aarch64, 3/3)`           |      1,039 |   2.2 |     8.4 |       6.1 |       6.0 |

The five hosted lanes are serial chains in the generated order. The
modeled end is the derived sum of the chain's weights. Overhead is the
measured lane end minus the measured sum of its job walls, so it contains
the first start delay and every handoff:

| Lane | Jobs in chain order                                                          | Modeled end | Attempt 1 end | Attempt 2 end | Overhead 1 | Overhead 2 |
| ---- | ---------------------------------------------------------------------------- | ----------: | ------------: | ------------: | ---------: | ---------: |
| 1    | `test (macos-latest, node)`, native support 5/12, test262 4/12, native 1/3   |       101.7 |         100.5 |         104.5 |        0.5 |        0.6 |
| 2    | sanitizers native, test262 9/12, test262 11/12, test262 1/12                 |        95.5 |         104.3 |         104.8 |        0.5 |        0.6 |
| 3    | sanitizers property, native support 11/12, native support 3/12, test262 6/12 |        92.5 |         111.8 |          99.7 |        0.6 |        0.6 |
| 4    | test262 5/12, 2/12, 7/12, 3/12, `test (macos-latest, deno)`                  |        90.4 |          83.6 |          84.0 |        0.6 |        0.6 |
| 5    | native support 9/12, 7/12, test262 12/12, 10/12, native 2/3                  |       102.7 |         102.5 |          99.5 |        0.7 |        0.7 |
| Mac  | the 12 jobs above, plus the 1.0-min probe allowance                          |        99.5 |          80.4 |          80.3 |        0.9 |        1.5 |

The Mac lane's attempt 2 overhead includes the availability probe, which
started a measured 0.67 min after `run_started_at`. Over seven runs,
all-hosted [37121778924] and [37167895777] plus the five attempts above,
hosted `test262 (macos-aarch64, 6/12)` measured 1,366 to 1,617 s against
its 1,083-second weight. Hosted `host C sanitizers (macOS, property)`
measured 1,723 to 2,727 s, with a 2,189-second median, against 1,923 s.
[*PLAN-GATE.md*](../PLAN-GATE.md) explains these gaps and derives the
recommended next retune.

[37121778924]: https://github.com/dahlia/oseo/actions/runs/37121778924
[37167895777]: https://github.com/dahlia/oseo/actions/runs/37167895777
[37194069657]: https://github.com/dahlia/oseo/actions/runs/37194069657
[37206614757]: https://github.com/dahlia/oseo/actions/runs/37206614757
[37215661294]: https://github.com/dahlia/oseo/actions/runs/37215661294

### Median-weight Mac lane runs (U24)

Branch run [37237684441] at `54d2c336` applied the U24 median weights and
passed in both attempts. Main run [37230598930] at `840c387e`, which still
used the U23 assignment, finished between the U24 commit and its branch
push. The table uses the U23 definitions above, so the hosted counts exclude
the Linux-hosted availability probe. All values are measured and rounded to
0.1 min:

| Source run, attempt | Commit     | Push-to-green | Mac jobs | Mac job min | Mac lane end | Hosted jobs | Hosted job min | Last hosted end |
| ------------------- | ---------- | ------------: | -------: | ----------: | -----------: | ----------: | -------------: | --------------: |
| [37230598930], 1    | `840c387e` |         106.8 |       12 |        79.0 |         79.8 |          22 |          479.9 |           106.4 |
| [37237684441], 1    | `54d2c336` |          98.3 |       15 |        80.8 |         82.0 |          19 |          443.6 |            97.9 |
| [37237684441], 2    | `54d2c336` |          95.8 |       15 |        81.8 |         83.0 |          19 |          449.3 |            95.5 |

Both U24 attempts placed the same 15 jobs on `oseo-mac-1`, the 15 that the
generator assigns there. The modeled ends below are derived from
*tools/macos-job-costs.ts*: hosted lanes sum their medians, and the Mac lane
adds measured Mac medians, ratio-converted hosted medians, and the 60-second
probe allowance. Overhead is the measured lane end minus the measured sum of
its job walls:

| Lane | Jobs in chain order                                                               | Modeled end | Attempt 1 end | Attempt 2 end | Overhead 1 | Overhead 2 |
| ---- | --------------------------------------------------------------------------------- | ----------: | ------------: | ------------: | ---------: | ---------: |
| 1    | `test (macos-latest, node)`, native support 10/12, test262 11/12                  |        86.6 |          85.7 |          85.7 |        0.4 |        0.5 |
| 2    | sanitizers native, native support 5/12, test262 2/12, `test (macos-latest, deno)` |        80.8 |          79.7 |          84.0 |        0.5 |        0.6 |
| 3    | sanitizers property, native support 11/12, native support 6/12, native 2/3        |        93.3 |          88.9 |          95.5 |        0.5 |        0.6 |
| 4    | native support 1/12, 9/12, 8/12, native 3/3                                       |        91.3 |          97.9 |          91.4 |        0.5 |        0.5 |
| 5    | test262 6/12, native support 7/12, test262 10/12, native support 2/12             |        87.5 |          94.0 |          95.4 |        0.5 |        0.6 |
| Mac  | the 15 jobs listed below, without a chain; observed pickup order varied           |        93.5 |          82.0 |          83.0 |        1.1 |        1.1 |

The 12 Mac jobs other than the own-key shards were test262 8/12, 9/12,
5/12, 1/12, 7/12, 12/12, 4/12, and 3/12, native support 4/12, 3/12, and
12/12, and native 1/3. The seven Mac jobs with a measured Mac median were
modeled at 45.1 min and measured 40.6 and 41.6 min. The eight converted
from hosted medians were modeled at 47.4 min and measured 40.2 min in
both attempts. Against their hosted medians, the converted test262 jobs
ran at a derived pooled ratio of 5.43 in both attempts, against the
modeled 4.2. The converted native support and native jobs ran at 3.60
and 3.55, and 3.12 and 3.18, against 3.2 and 3.1.

[*PLAN-GATE.md*](../PLAN-GATE.md) compares these runs with the prediction
and with the earlier spread.

[37230598930]: https://github.com/dahlia/oseo/actions/runs/37230598930
[37237684441]: https://github.com/dahlia/oseo/actions/runs/37237684441

### Two-lane Mac runs (U27)

Branch run [37398055382] at `11634e90` ran with two runners on the Mac
mini, `oseo-mac-1` and `oseo-mac-2`, both online; the maintainer registered
`oseo-mac-2` on 2026-10-06. Attempt 2 was a full rerun. The table uses the
U23 definitions above, with Mac jobs split by `runner_name`, and the hosted
counts exclude the Linux-hosted availability probe. All values are measured
and rounded to 0.1 min:

| Source run, attempt | Commit     | Wall to last job | `oseo-mac-1` jobs, min, end | `oseo-mac-2` jobs, min, end | Hosted jobs | Hosted job min | Last hosted end |
| ------------------- | ---------- | ---------------: | --------------------------- | --------------------------- | ----------: | -------------: | --------------: |
| [37398055382], 1    | `11634e90` |             79.6 | 10, 78.5, 79.3              | 9, 69.1, 69.9               |          15 |          332.3 |            72.7 |
| [37398055382], 2    | `11634e90` |             78.9 | 10, 77.5, 78.5              | 9, 70.7, 71.7               |          15 |          338.2 |            77.8 |

Attempt 1 was red only in the Linux-hosted `test (ubuntu-latest, node)`
job; every macOS job passed in both attempts. Only attempt 2's wall to the
last job is therefore a push-to-green time. Each attempt placed the 19
generated Mac jobs on their generated runners. The one-lane runs after
U24 measured 98.6 min (main run [37251028948] at `bdf2dddd`), 99.5 min
(branch run [37315038080] at `4b20631b`, with the U26 disk sampler on the
Mac), and 100.2 min (main run [37332256715] at `6654ccf7`, attempt 1, red
only in the same Linux job), beside the 98.3 and 95.8 min of [37237684441].
The two-lane attempts are a derived 16.2 to 21.3 min shorter, measured in
one run of one commit. The derived prediction was 77.2 min, with a 72.1 to
86.5 min per-run range; the last macOS job ended at a measured 79.3 and
78.5 min, inside that range. The coordinator measured 115 GiB free on the
Mac after the runs.

Two-lane Mac job walls are longer than one-lane ones. The 19 Mac jobs
summed a measured 147.5 and 148.2 min. Against each job's one-lane
`oseo-mac-1` median, the derived pooled ratio was 1.297 and 1.282 on
`oseo-mac-1` and 1.176 and 1.242 on `oseo-mac-2`, for the 17 jobs with a
one-lane median. [*PLAN-GATE.md*](../PLAN-GATE.md) derives the per-job
pair factors, compares them with U25, and projects the measured walls to
41,091 paths at a derived 103.1 and 104.0 min.
[*evidence/u27/*](./evidence/u27/) holds the job rows and scripts.

[37251028948]: https://github.com/dahlia/oseo/actions/runs/37251028948
[37315038080]: https://github.com/dahlia/oseo/actions/runs/37315038080
[37332256715]: https://github.com/dahlia/oseo/actions/runs/37332256715
[37398055382]: https://github.com/dahlia/oseo/actions/runs/37398055382

### U16 static macOS lane branch observations

GitHub Actions run and job timestamps provide one measured observation at
each branch revision. Run [36598029271] at `d0a39f79` failed only in the
unchanged Linux `host C sanitizers (Linux)` timer-order fixture. Run
[36640728403] at `82bba77e` succeeded. The second run's 58 displayed job
names match all 58 names in comparison main run [36516215200]; the first
run appended matrix suffixes. Both branch runs executed all 31 macOS jobs. The
first revision remains a timing sample, not a successful gate.

The table derives each lane's first job start and last job finish in minutes
relative to the run's `created_at`. The first start is the initial start
delay. A handoff gap is the next job's `started_at` minus its predecessor's
`completed_at`; it includes GitHub's successor scheduling and runner
assignment. The individual gaps follow chain order in seconds, with their
sum in minutes. Minute values are derived from measured job timestamps and
rounded to 0.01 min.
The lane membership is the generated plan in
[*docs/evidence/u16/README.md*](./evidence/u16/README.md).

| Source run  | Lane | First start (min) | Last finish (min) | Handoff gaps (s, chain order) | Gap sum (min) |
| ----------- | ---- | ----------------- | ----------------- | ----------------------------- | ------------- |
| 36598029271 | 1    | 0.10              | 148.17            | 11, 7, 7, 10, 7               | 0.70          |
| 36598029271 | 2    | 0.15              | 162.52            | 10, 7, 8, 8, 8                | 0.68          |
| 36598029271 | 3    | 0.15              | 142.67            | 5, 8, 6, 8, 8                 | 0.58          |
| 36598029271 | 4    | 0.15              | 138.42            | 9, 11, 7, 8, 6                | 0.68          |
| 36598029271 | 5    | 0.12              | 141.47            | 9, 10, 7, 6, 12, 10           | 0.90          |
| 36640728403 | 1    | 0.13              | 140.67            | 6, 6, 10, 7, 10               | 0.65          |
| 36640728403 | 2    | 0.13              | 159.98            | 11, 8, 12, 8, 9               | 0.80          |
| 36640728403 | 3    | 0.15              | 146.25            | 8, 8, 7, 8, 10                | 0.68          |
| 36640728403 | 4    | 0.17              | 134.17            | 7, 8, 6, 8, 9                 | 0.63          |
| 36640728403 | 5    | 0.10              | 124.95            | 8, 9, 8, 5, 8, 11             | 0.82          |

Run `36598029271` was created at `2026-09-29T16:28:58Z`; its last recorded
update was at `19:11:35Z`, a derived 162.62 min. It has no
push-to-green observation. Run `36640728403` was created at
`2026-09-29T22:38:08Z` and last updated at `2026-09-30T01:18:14Z`:
160.10 min from workflow creation to green. Workflow creation is the
available timestamp proxy for the push; neither duration measures the
push-to-workflow-creation delay. Derived sums of measured macOS job times are
729.02 and 701.75 min, respectively, versus 718.15 min in comparison
main run `36516215200` at `97278fc6`. That run's derived
creation-to-completion time is 175.83 min. These branch observations are
13.21 and 15.73 min shorter than that one main run, respectively; this
difference is not separated from runner variance. Another successful main
run, [36369711059] at `98e66719`, also had 31 macOS jobs and a measured
five-job peak. Its derived creation-to-completion time was 165.55 min and
its macOS job sum was 775.63 min. The branch wall differences from this
second same-size sample are only 2.93 and 5.45 min, while their job sums
differ by 46.61 and 73.88 min. This spread prevents a causal wall-time
improvement claim from these single-run comparisons.

In comparison main run `36516215200`, the 50.30 min
`native support (macos-aarch64, 1/12)` job started 125.42 min after run
creation and finished last among macOS jobs at 175.72 min. The same job
started at 0.10 and 0.13 min in the branch runs. This directly observes
the intended dispatch-order change; it does not isolate its wall-time effect
from job-duration spread. The measured peak macOS concurrency was five in
both same-size main runs and both
branch runs.

The derived ideal longest lane is 8872 s (147.87 min, or 147.9 at one
decimal place) from the main run's measured whole-job costs, with immediate
starts and handoffs. Lane 2 was the last macOS chain in both branch runs.
Its derived 14.65 and 12.11 min finish gaps from that model contain only
0.68 and 0.80 min of derived handoff gaps, plus 0.15 and 0.13 min of initial
assignment delay. The remaining 13.82 and 11.18 min are differences in
summed job wall time from the model's source run. Thus chain assignment
delays explain part of the model gap, but these one-run samples cannot
attribute the larger job-time difference to the lane change.

[36369711059]: https://github.com/dahlia/oseo/actions/runs/36369711059
[36516215200]: https://github.com/dahlia/oseo/actions/runs/36516215200
[36598029271]: https://github.com/dahlia/oseo/actions/runs/36598029271
[36640728403]: https://github.com/dahlia/oseo/actions/runs/36640728403

### Family costs and shard imbalance

Derived count/sum/max and max/mean from measured `startedAt`/`completedAt`
in `gh run view RUN --repo dahlia/oseo --json headSha,jobs` follow.
Each platform total sums only its listed families; Linux's separate `check`
and the platform-independent aggregation job are excluded. Windows is outside
this measurement. The `native support` family is the extended native property
file shards, plus extended package properties on its first shard.

Run 35456667007 at `32ece7f4`, derived minutes from its measured job
timestamps (20,841 measured reviewed paths):

| Host  | Family            | Jobs | Sum min | Max min | Max/mean |
| ----- | ----------------- | ---- | ------- | ------- | -------- |
| macOS | host C sanitizers | 2    | 63.65   | 34.35   | 1.08     |
| macOS | native            | 3    | 37.48   | 12.65   | 1.01     |
| macOS | native support    | 12   | 262.82  | 58.55   | 2.67     |
| macOS | test              | 2    | 39.30   | 37.05   | 1.89     |
| macOS | test262           | 10   | 226.27  | 25.12   | 1.11     |
| Linux | host C sanitizers | 1    | 63.02   | 63.02   | 1.00     |
| Linux | native            | 3    | 40.98   | 14.63   | 1.07     |
| Linux | native support    | 4    | 223.53  | 78.42   | 1.40     |
| Linux | test              | 2    | 33.45   | 32.42   | 1.94     |
| Linux | test262           | 10   | 140.78  | 18.08   | 1.28     |

Derived platform totals: macOS 629.52 min, Linux 501.77 min. Flooring each
macOS family's sum and maximum gives host C sanitizers 63/34 min, native
37/12 min, native support 262/58 min, test 39/37 min, and test262 226/25 min.
The sum of those floored family sums is 627 min; flooring the aggregate
separately gives 629 min.

Run 36243816479, derived minutes from its measured job timestamps:

| Host  | Family            | Jobs | Sum min | Max min | Max/mean |
| ----- | ----------------- | ---- | ------- | ------- | -------- |
| macOS | native support    | 12   | 310.20  | 68.13   | 2.64     |
| macOS | test262           | 10   | 326.08  | 43.93   | 1.35     |
| macOS | host C sanitizers | 2    | 75.00   | 40.07   | 1.07     |
| macOS | test              | 2    | 41.85   | 40.35   | 1.93     |
| macOS | native            | 3    | 42.32   | 16.50   | 1.17     |
| Linux | native support    | 4    | 235.75  | 86.23   | 1.46     |
| Linux | test262           | 10   | 192.40  | 25.40   | 1.32     |
| Linux | host C sanitizers | 1    | 64.82   | 64.82   | 1.00     |
| Linux | test              | 2    | 37.38   | 36.23   | 1.94     |
| Linux | native            | 3    | 39.10   | 14.73   | 1.13     |

Derived platform totals: macOS 795.45 min, Linux 569.45 min.

Run 36261458909, derived minutes from its measured job timestamps:

| Host  | Family            | Jobs | Sum min | Max min | Max/mean |
| ----- | ----------------- | ---- | ------- | ------- | -------- |
| macOS | native support    | 12   | 284.85  | 51.58   | 2.17     |
| macOS | test262           | 10   | 320.40  | 45.83   | 1.43     |
| macOS | host C sanitizers | 2    | 67.10   | 35.85   | 1.07     |
| macOS | test              | 2    | 46.18   | 43.15   | 1.87     |
| macOS | native            | 3    | 45.58   | 17.42   | 1.15     |
| Linux | native support    | 4    | 247.68  | 87.02   | 1.41     |
| Linux | test262           | 10   | 192.28  | 24.97   | 1.30     |
| Linux | host C sanitizers | 1    | 70.73   | 70.73   | 1.00     |
| Linux | test              | 2    | 23.88   | 22.90   | 1.92     |
| Linux | native            | 3    | 44.22   | 15.87   | 1.08     |

Derived platform totals: macOS 764.12 min, Linux 578.80 min.

### U6 shard assignment experiment

U6's [cost distribution and option analysis](./evidence/u6/README.md) retains
native case costs and test262 shard durations from runs 36243816479 and
36261458909. It selects a deterministic cost-based native file partition at
unchanged macOS totals, with estimated tail reduction and no estimated macOS
workload increase. The estimates replay concurrent case durations and do not
establish an improvement. Branch run 36343919872 failed Linux own-key at the
unchanged 3,600-second property deadline after a reported 149 examples;
its generated budget is incomplete. The
[failed-run analysis](./evidence/u6/failed-branch-run.md) records measured
costs and scheduling assumptions. Its
[full per-shard comparison](./evidence/u6/first-branch-comparison.md) records
a one-run measured macOS native job maximum of 46.10 minutes versus 51.43
in run 36312192623, and test262 maximum of 35.23 versus 34.50 minutes.
Their derived combined job sum differs by -20.70 macOS minutes; runner
variance is not separated, and runtime-archive conditions differ. The
correction isolates Linux own-key in its first shard and raises Linux native
support from four to five, retaining four shards for all remaining files; its
corrected branch run 36358067906 passed all 58 jobs. Its
[full comparison](./evidence/u6/second-branch-comparison.md) retains derived
macOS native/test262 job maxima from observed timestamps of 34.35/31.67 minutes
versus 51.43/34.50 before, and derived total macOS workload of 731.40 versus
778.12 minutes. Five-slot wall lower bounds are derived as 146.28 versus 155.62
minutes. This is one corrected observation; variance and cache effects are not
separated. The same macOS own-key cohort varies by a derived 11.80 case-minutes
between branch runs. Linux singleton own-key passes in 41.36 measured
case-minutes, with a derived 18.64-minute margin against its unchanged property
deadline. Test262 keeps its round-robin assignment and raises the total from
ten to twelve. Using run 36261458909's derived slowest residual rate, the
estimate leaves 47.53 minutes against the 120-minute timeout, up from 33.22, at
a derived 1.89 minutes of added macOS fixed cost. Extra harness preparation has
no separate timing measurement; the corrected combined-workload observation
meets the limit without establishing repeatable savings.

### U17 hosted first executable launch probe

Branch run [36594796547]
at `1b5970ff` measured `macos-15`, `macos-latest`, and `ubuntu-latest`
once each on 2026-09-29 UTC. All jobs passed. The
[probe and compact outputs](./evidence/u17/README.md) preserve the exact
script, environment, per-binary durations, build costs, and policy logs.
The workflow experiment branch must never be merged; these results come
from a separate documentation branch based on `main`. The
[historical Mac mini comparison](./evidence/u17/mac-mini-baseline.txt)
is preserved with its report provenance.

The tested hosted images did not exhibit the Mac mini's reported
sustained serialized first-execution cost. For fresh Zig binaries on
macOS 15.7.9, measured totals for 48 first launches were 428.907 ms at
concurrency one and 133.483 ms at concurrency three; repeats took
446.241 and 107.836 ms. On macOS 26.6.2, the corresponding first totals
were 507.555 and 174.809 ms, versus 503.678 and 197.351 ms on repeat.
Fresh shared-library loads measured 0.938–2.348 ms across the macOS
compiler/image cells. Builds and installation are excluded from these
launch/load measurements; cold and warmed Zig build costs are recorded
separately in the evidence.

Apple-clang macOS 15 first totals measured 361.789/111.009 ms for
concurrency one/three. The macOS 26 concurrent first pass had outliers:
813.272 ms total versus 202.850 ms on repeat, with a derived maximum
individual launch of 400.838 ms. Its cause was not isolated, and that
cohort does not establish a concurrency speedup. Both macOS images
reported assessments enabled and SIP disabled without any policy change
by the probe. `syspolicyd` was active; these observations do not prove
that security checks are absent or identify the image setting responsible.

The research report's candidate 3, rented dedicated Mac capacity, still
needs this probe measured in the actual guest under its default policy.
Candidate 4, measuring family speed before spending, remains necessary:
use the same SHA, image, toolchain, shard, seeds, budgets, and cache state
for test262, extended properties, and Apple-clang sanitizers. This
single tiny-program measurement replaces the inference about hosted
first-exec cost; it establishes no repeatable gate speedup or rented-Mac
throughput ratio. Production workflow coverage is unchanged.

[36594796547]: https://github.com/dahlia/oseo/actions/runs/36594796547

### U3 fixed-cost cache audit

U3 leaves the workflow unchanged. Mise already caches the installed tools;
an additional aube store cache did not meet the local cost test below. Npm
builds are too short to justify another cross-job artifact restore. This
is an audit-only result, with no claimed runner-minute reduction and no
branch CI experiment. The coordinator directed an audit-only commit if
local store restore was not clearly cheaper than the install's download
part. No install or build is skipped, and no coverage changes.

#### Existing CI step decomposition

Sources are runs 36243816479, 36261458909 and 36312192623, fetched with
`gh run view RUN --repo dahlia/oseo --json headSha,jobs` and
`gh api repos/dahlia/oseo/actions/runs/RUN/logs`. The third run is at
`af9bb68c`; runtime versions differ from the first two as recorded under U8.
These are historical observations, not before/after measurements of a change.
The same named jobs appear in each run. The
[compact inputs and reproduction scripts](./evidence/u3/README.md)
preserve these observations after GitHub log retention expires.

Each row below covers all 29 macOS jobs or all 20 Linux test-family jobs;
Linux's separate `check`, Windows and aggregation are excluded. Step seconds
are measured timestamp differences; displayed means are derived. The archive
step includes the initial npm build, key calculation and runtime archive
restore, so its column must not be added to those substeps again.

| Run         | Host  | Checkout mean s | Mise-action mean s | Runtime archive action mean s |
| ----------- | ----- | --------------- | ------------------ | ----------------------------- |
| 36243816479 | macOS | 4.07            | 40.34              | 5.90                          |
| 36261458909 | macOS | 3.97            | 35.97              | 5.41                          |
| 36312192623 | macOS | 3.62            | 39.21              | 5.52                          |
| 36243816479 | Linux | 2.00            | 13.85              | 3.20                          |
| 36261458909 | Linux | 1.85            | 14.45              | 3.30                          |
| 36312192623 | Linux | 1.85            | 61.20              | 2.95                          |

Mise-action is the largest setup step, but its name hides the dependency
install that the `[deps.aube]` provider runs when the postinstall hook
invokes `mise run install-hooks`. Its `cache` input
already defaults to `true`, as the run logs confirm. The action restores
its mise data directory, including installed tools. The source inspected
was the action revision reported by run 36312192623,
[`c2a87611`].
Its default key includes platform/image and configuration content; a mise
version is included only when the workflow supplies that input. Adding a
second installed-tool cache would duplicate the existing restore.

The next table splits that step using runner-log markers. Restore means are
derived from measured intervals between `Restoring mise cache` and the
restored-key/miss message, including miss lookups. Dependency means are
derived from aube's measured `in Ns` summary, including download, store
population and linking. The observed cache counts are restored/missing
entries, not evidence about the Zig compilation cache.

| Run         | Host  | Mise restored/missing jobs | Mise restore/lookup mean s | Aube install mean s |
| ----------- | ----- | -------------------------- | -------------------------- | ------------------- |
| 36243816479 | macOS | 29/0                       | 13.12                      | 26.51               |
| 36261458909 | macOS | 29/0                       | 11.50                      | 23.74               |
| 36312192623 | macOS | 24/5                       | 10.42                      | 21.99               |
| 36243816479 | Linux | 20/0                       | 5.95                       | 7.46                |
| 36261458909 | Linux | 20/0                       | 5.90                       | 7.97                |
| 36312192623 | Linux | 2/18                       | 1.34                       | 4.00                |

For the same `native (macos-aarch64, 1/3)` job, the measured tool-install
summaries report zero new tools and nine already installed in 14/11/46 ms,
respectively. Aube instead downloads 61 packages, measured at 30.9 MB,
in 25.8/18.1/23.5 s. The derived tails from the first `linking` progress
message to its completion are 11.25/10.09/11.02 s. Subtracting those tails
from aube's summary gives derived earlier intervals of 14.55/8.01/12.48 s.
Those intervals include fetching, unpacking and content-addressed store
population; they are not isolated network-download measurements. A store
cache replaces fetching and store population with archive extraction; the
mandatory frozen install still performs linking.

The matching `native (linux-x86_64-gnu, 1/3)` job reports zero new tools in
5/6 ms in the first two runs, then nine tools installed in 12.9 s on a
mise miss in the third. Its measured aube installs are 9.2/6.5/4.9 s,
downloading 61 packages at 33.0 MB. For a cold macOS example in the third
run, `test262 (macos-aarch64, 6/10)` installs nine tools in a measured
17.6 s; progress reports Zig extracting at elapsed 8.8, 11.9 and 15.0 s.
Concurrent, sparse tool progress does not separate total download and
extraction times. The third Linux action mean mixes cold and warm tool
states and includes cache saves; it is not evidence of slower aube installs.

The initial npm build is inside the small runtime archive action above.
U7's per-job table separately records later npm builds at derived intervals
of about 1.1–8.9 s, including task dispatch. A cached dist would add a
restore and complete build-input key while most jobs repeat only one short
build. No measured net benefit supports that additional cache here.

#### Local store restore experiment

The local probe used source `16e8c62e`, Node 24.21.0 and aube 2.5.0. Linux
used an exported tree at */tmp/u3-linux-install*; macOS used a bundle clone
at *~/Desktop/oseo-m5ci-job-fixed-cost* on `ssh macbook-air`. It did not
modify or commit in the macOS project checkout. Every probe subprocess had
`ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-job-fixed-cost`; no Zig build
was part of this experiment.

`CI=true`, `AUBE_STORE_DIR` and `AUBE_CACHE_DIR` selected initially empty
probe directories. The cold operation was `aube install --frozen-lockfile`.
Before each warm trial, the probe deleted the store and all root/package
*node\_modules* directories, extracted the saved store, and ran the same
frozen install. It did not restore *node\_modules* or dependency freshness
state. The [preserved probes and outputs](./evidence/u3/README.md) use Python
`time.perf_counter()` to measure subprocess wall time. The
macOS restore command used Homebrew GNU tar and `unzstd`, matching the
cache action's extraction tools. Both archive creation and extraction
used GNU tar; an earlier BSD-tar probe was discarded because it introduced
AppleDouble metadata files. Linux's uncompressed local tar is a
favorable lower-cost control, with no decompression or network transfer.

| Local host  | Empty-store install s, measured once | Restore s, measured trials | Mandatory warm install s, measured trials | Restore + install s, derived trials |
| ----------- | ------------------------------------ | -------------------------- | ----------------------------------------- | ----------------------------------- |
| Linux x64   | 2.99                                 | 1.41/1.38                  | 1.20/1.22                                 | 2.61/2.59                           |
| macOS arm64 | 10.96                                | 5.37/5.15                  | 6.70/6.84                                 | 12.07/11.99                         |

The macOS archive was measured at 46,831,390 bytes compressed,
containing 58,811 regular files and 192,167,185 bytes of
file content. Content comparison hashes relative file paths and each file's
SHA-256 in sorted path order, excluding filesystem timestamps. The fresh
store and both extracted stores had the same observed digest,
`81867af02dc30e8fbde9d051824a8ae6ae99efb38235ad20ae5a9d271b2cf9c1`.
Linux's corresponding digest also matched both restores, with 58,812 files
and 198,987,020 bytes of content:
`ee130b59f525e1d452b513d3a37254aa3b9b66ba1a5df9ad0e8c40516ba7311c`. This
verifies local archive byte preservation, not an implemented GitHub cache or
dependency-output cache.

The macOS compressed extraction plus frozen install is slower than the
empty-store install even before cache lookup,
download or action startup. The Linux control leaves only a derived
0.38/0.40 s against one cold sample, before those omitted costs. Neither
supports a measured cross-job saving. No new cache key is implemented,
so exact-key miss mutation tests and branch cold/warm cache comparisons
are not applicable. Aube store caching, *node\_modules* caching and dist
caching remain disabled; the existing runtime archive and mise caches are
unchanged. These local store-cold/store-warm observations say nothing
about Zig cache warmth or GitHub runner variance.

To reproduce the store probe, use a disposable checkout of `16e8c62e`
with its pinned tools installed. Export `CI=true`, point `AUBE_STORE_DIR`
and `AUBE_CACHE_DIR` at new absolute *probe-store* and *probe-cache*
directories inside that checkout, and put the pinned Node binary on `PATH`.
Set the assigned Zig cache variable above. The measured subprocess commands
were:

~~~~ sh
aube install --frozen-lockfile
# macOS archive creation and each restore:
gtar --use-compress-program='zstd -T0' -cf store-clean.tar.zst \
  -C "$PWD" probe-store
gtar --use-compress-program=unzstd -xf store-clean.tar.zst -C "$PWD"
# Linux control archive creation and each restore:
tar -cf store.tar -C "$PWD" probe-store
tar -xf store.tar -C "$PWD"
~~~~

Before each restore remove only those disposable probe directories and all
root/package *node\_modules* directories; the archive stays outside the store.
Run the frozen install after each extraction. Measure each subprocess with
`time.perf_counter()` around `subprocess.run(..., check=True)`, redirecting
its stdout/stderr to a log outside the measured store. For the content digest,
use this reader immediately after the cold install and each restore, before
the subsequent install changes any bookkeeping files:

~~~~ python
import hashlib
from pathlib import Path

store = Path("probe-store")
digest = hashlib.sha256()
for path in sorted(store.rglob("*")):
    if path.is_file():
        digest.update(str(path.relative_to(store)).encode() + b"\0")
        digest.update(hashlib.sha256(path.read_bytes()).digest())
print(digest.hexdigest())
~~~~

[`c2a87611`]: https://github.com/jdx/mise-action/tree/c2a87611a18de5b3828c5652fe268e992400cb5c

### U7 duplicate-work audit

This audit inspected *mise.toml*, *.github/workflows/main.yaml*, the
runtime-archive cache action, and the property harness at `86180894`.
The coordinator assigned repeated npm builds to U3 and explicitly directed
U7 to retain the focused Linux checks. U7 therefore changes documentation
only: the coordinator retained the small isolated selection-test duplicate,
no workflow or task changes were made, and no branch CI run was requested.

The table's costs are measured execution-step seconds from run 36261458909
using `gh run view 36261458909 --repo dahlia/oseo --json headSha,jobs`.
A slash separates the two compared executions, not hosts. Sharded costs are
derived sums of measured step intervals, including task builds and startup;
they are enclosing costs, not separately measured duplicate-case costs.
The Node step includes all discovered tests. No savings estimate is inferred
from these costs. Separate fixed build costs follow below.

| Candidate                                                        | Compared configurations and evidence                                                                                                                                                      | Duplicate decision                                                                                                                   | macOS step s                                              | Linux step s                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------- |
| Ordinary native properties versus native support                 | Node, execution-host target, Zig in both; ordinary suite seed/small/1x versus override seed 1592590339/large/10x; concurrency also differs                                                | No: seeds differ; larger domain and budget do not prove a case superset                                                              | 2537 / 16474 (12-shard sum)                               | 1346 / 14753 (4-shard sum)                                |
| Ordinary package properties versus focused extended package task | Same files under each respective Node or Deno host; suite seed/small/1x versus seeds 1592590337 and 1592590338/large/10x                                                                  | No: distinct seeds and size; Node and Deno must also remain separate                                                                 | Node 2537, Deno 47 / combined extended 10                 | Node 1346, Deno 38 / combined extended 13                 |
| Deno root native properties versus native support                | `test:deno` is `deno test -A packages`, not root discovery; native support selects _tests/property/\*.property.test.ts_ under Node                                                        | No: Deno does not select the root native property files                                                                              | 47 / 16474                                                | 38 / 14753                                                |
| Ordinary native/runtime tests versus host C sanitizer tasks      | Node and matching target, but ordinary Zig versus explicitly selected host-cc with ASan/UBSan; Linux compiler override also verifies GCC                                                  | No: compiler lane and instrumentation are separate evidence                                                                          | Node 2537 / runtime 273, property 1823                    | Node 1346 / runtime 290, property 1849                    |
| Native fixtures versus native support and test262                | *tests/native.ts* selects fixture records; native support selects property files; *tools/test262.ts* selects reviewed corpus paths; fixture `test262Host` installs an API, not the corpus | No identical input/observation matrix established                                                                                    | native 2582 / property 16474 / test262 18686 (shard sums) | native 2585 / property 14753 / test262 11291 (shard sums) |
| Native fixtures versus sanitizer native fixtures                 | Same fixture runner and execution target, Zig versus host-cc with ASan/UBSan                                                                                                              | No: separate compiler lane                                                                                                           | 2582 / 1810                                               | 2585 / 2068                                               |
| Sanitizer self checks repeated across macOS jobs                 | Real Apple Clang instrumentation probes in *tests/host-cc-sanitizer.test.ts*, separate native/property job processes                                                                      | Keep real compiler probes: each job must independently validate its compiler; isolated selection cases are recorded separately below | 7 / 5                                                     | n/a                                                       |
| Linux sanitizer self checks                                      | Default compiler selection versus explicit `OSEO_HOST_CC=gcc`                                                                                                                             | No for real probes: default prefers Clang when installed; explicit override supplies GCC evidence                                    | n/a                                                       | 4 / 4                                                     |
| Focused tooling unit tests in check versus root Node discovery   | Same Linux/Node test sources; check uses full-history checkout and baseline/range setup, Node uses shallow checkout; isolated file selection versus root concurrent discovery             | Unproven identical complete configuration; retain per coordinator, costs below                                                       | n/a (check is Linux only)                                 | check step 66 / Node 1346                                 |
| Isolated compiler-selection unit cases                           | *tests/host-cc-selection.test.ts* runs the same three fake-compiler cases in root Node and sanitizer self; each child gets a fully specified isolated environment                         | Yes for these cases; retain per coordinator because the few-second bound does not justify full gates and a CI cycle                  | Inside Node 2537 and self steps 7 / 5                     | Inside Node 1346 and self steps 4 / 4                     |
| Repeated npm package builds                                      | Cache action runs `build`; later independent mise invocations repeat the same workspace build; sanitizer env differs but build command/config has no native compiler selection            | Yes for repeated npm build work; delegated to U3, retained by U7                                                                     | Per-job table below                                       | Per-job table below                                       |
| Linux versus macOS jobs, Node versus Deno jobs                   | Different OS/arch or JavaScript host, including macOS execution and Apple Clang sanitizer lanes                                                                                           | No: preserve host evidence                                                                                                           | Listed separately above                                   | Listed separately above                                   |

#### Property seed and case inclusion evidence

*packages/testkit/tests/property-support.ts* returns `seed ?? options.seed`:
an environment seed replaces the suite's seed, rather than adding a replay of
it. Absent overrides, `propertySize` returns `small` and run scale is one.
Extended native shards set seed 1592590339, scale 10, and size `large`.
Extended package tasks run each host with seeds 1592590337 and 1592590338,
scale 10, and size `large`. Every shard keeps its configured seed and budget.
No removed run's cases need reconstruction because no run is removed.

For a concrete generator difference, the package runner property changes
maximum list length from 32 to 128; native for-await-of properties also
select their generator bounds with `propertySize`. A larger domain does not
establish that its deterministic generated sequence contains a smaller one.
Even fixed-domain properties use the replaced seed. The same-seed/path premise
needed for a first-N inclusion proof is absent, so no such proof is claimed.

A measured local counterexample used fast-check 4.9.0 and the actual
`propertyParameters`/`propertySize` functions via
[*docs/evidence/u7/property-probe.mjs.txt*](./evidence/u7/property-probe.mjs.txt).
The preserved probe uses `fc.assert`, recording predicate arguments rather than
`fc.sample`; [its output](./evidence/u7/property-probe.log) and the
[reproduction commands](./evidence/u7/README.md) are retained. With suite seed
`0x60001200`, budget 12, and `fc.integer()`, the ordinary first four
observations were 556484374, 1586950928, 1425465318, and 10. The
extended-native configuration produced 24, -2147483644, 1324788078, and
-226402400, at budget 120. The first extended-package seed produced -820612415,
107459006, -23, and 1035396571, also at budget 120. This is a harness
counterexample, not a measurement of native gate cost or an exhaustive
comparison of suite outputs. Source inspection establishes the seed mismatch;
the probe demonstrates why a budget multiplier alone is insufficient. Ordinary
evidence stays on each currently selected host.

#### Focused Linux tooling checks

Measured Node runner `duration_ms` from each run's check-job log follows.
These times cover the unit-test subprocess, excluding the subsequent checker
CLI in the native guard/toolchain tasks. They are not additive wall-clock
savings because check tasks execute concurrently. The enclosing check steps
were measured at 67 s and 66 s respectively. No macOS check job exists.

| Test file                          | Measured s, run 36243816479 | Measured s, run 36261458909 |
| ---------------------------------- | --------------------------- | --------------------------- |
| *tests/anti-slop.test.ts*          | 11.941                      | 12.515                      |
| *tests/native-host-guards.test.ts* | 2.797                       | 2.751                       |
| *tests/native-toolchains.test.ts*  | 7.708                       | 6.684                       |

The focused tasks execute actual unit tests and then, where configured, a
repository scan; the scan is not the same work as its unit tests. This audit
records repeated test-file selection without asserting a behavior difference
caused by checkout depth or concurrency, or claiming identical complete
configuration. The coordinator directed retention of this Linux-only work.

#### Repeated npm build input for U3

The runtime-archive composite action first runs `mise run build`, including
for Deno jobs on non-Windows hosts. Each later independent task invocation
with `depends = ["build"]` runs it again. Within a single mise dependency
DAG, shared dependencies run once; this audit does not count them twice.
The build is `aube exec -- tsdown --workspace`, with `clean: true`, validating
ESM, declarations, publint, and attw. No build source input is intentionally
changed between these invocations. Native compiler choice affects native
execution, not this npm build command.

Each row below identifies the source job by its workflow name. Columns are
derived per-job sums of measured runner-log timestamp intervals from each
later `[build] $ aube exec -- tsdown --workspace` line to the next test-task
launch; the initial cache-action build is excluded. They include dispatch
cost and are neither an isolated tsdown duration nor measured recoverable
savings. Logs were retrieved with
`gh api repos/dahlia/oseo/actions/runs/RUN/logs`; main run IDs are in the
column headings. The [extraction script](./evidence/u7/extract-ci.py)
retains compact timestamp inputs and exact end markers for both runs;
[reproduction instructions](./evidence/u7/README.md) cover every table.
No Zig cold/warm speedup is claimed: this is npm build work,
and the observed runtime archive states do not establish Zig cache contents.

| Source job                              | Later builds per job | Derived repeated interval s, 36243816479 | Derived repeated interval s, 36261458909 |
| --------------------------------------- | -------------------- | ---------------------------------------- | ---------------------------------------- |
| host C sanitizers (Linux)               | 5                    | 8.32                                     | 8.93                                     |
| host C sanitizers (macOS, native)       | 3                    | 6.37                                     | 7.40                                     |
| host C sanitizers (macOS, property)     | 2                    | 2.45                                     | 2.70                                     |
| native (linux-x86\_64-gnu, 1/3)         | 1                    | 1.42                                     | 1.90                                     |
| native (linux-x86\_64-gnu, 2/3)         | 1                    | 1.71                                     | 1.95                                     |
| native (linux-x86\_64-gnu, 3/3)         | 1                    | 2.06                                     | 1.95                                     |
| native (macos-aarch64, 1/3)             | 1                    | 1.87                                     | 1.26                                     |
| native (macos-aarch64, 2/3)             | 1                    | 1.31                                     | 1.63                                     |
| native (macos-aarch64, 3/3)             | 1                    | 1.77                                     | 1.88                                     |
| native support (linux-x86\_64-gnu, 1/4) | 2                    | 3.81                                     | 3.94                                     |
| native support (linux-x86\_64-gnu, 2/4) | 1                    | 1.72                                     | 1.90                                     |
| native support (linux-x86\_64-gnu, 3/4) | 1                    | 1.20                                     | 1.46                                     |
| native support (linux-x86\_64-gnu, 4/4) | 1                    | 2.16                                     | 1.72                                     |
| native support (macos-aarch64, 10/12)   | 1                    | 1.62                                     | 2.33                                     |
| native support (macos-aarch64, 11/12)   | 1                    | 1.15                                     | 1.45                                     |
| native support (macos-aarch64, 12/12)   | 1                    | 1.68                                     | 1.41                                     |
| native support (macos-aarch64, 1/12)    | 2                    | 2.92                                     | 2.50                                     |
| native support (macos-aarch64, 2/12)    | 1                    | 2.95                                     | 1.45                                     |
| native support (macos-aarch64, 3/12)    | 1                    | 1.10                                     | 1.55                                     |
| native support (macos-aarch64, 4/12)    | 1                    | 1.72                                     | 2.10                                     |
| native support (macos-aarch64, 5/12)    | 1                    | 1.67                                     | 2.15                                     |
| native support (macos-aarch64, 6/12)    | 1                    | 1.60                                     | 1.70                                     |
| native support (macos-aarch64, 7/12)    | 1                    | 1.14                                     | 2.23                                     |
| native support (macos-aarch64, 8/12)    | 1                    | 1.92                                     | 1.44                                     |
| native support (macos-aarch64, 9/12)    | 1                    | 1.71                                     | 1.23                                     |
| test (macos-latest, node)               | 1                    | 1.46                                     | 1.70                                     |
| test (ubuntu-latest, node)              | 1                    | 1.75                                     | 1.32                                     |
| test262 (linux-x86\_64-gnu, 10/10)      | 1                    | 1.12                                     | 1.68                                     |
| test262 (linux-x86\_64-gnu, 1/10)       | 1                    | 1.93                                     | 1.91                                     |
| test262 (linux-x86\_64-gnu, 2/10)       | 1                    | 1.75                                     | 1.51                                     |
| test262 (linux-x86\_64-gnu, 3/10)       | 1                    | 1.91                                     | 1.86                                     |
| test262 (linux-x86\_64-gnu, 4/10)       | 1                    | 1.89                                     | 1.94                                     |
| test262 (linux-x86\_64-gnu, 5/10)       | 1                    | 1.91                                     | 1.97                                     |
| test262 (linux-x86\_64-gnu, 6/10)       | 1                    | 1.73                                     | 1.88                                     |
| test262 (linux-x86\_64-gnu, 7/10)       | 1                    | 1.85                                     | 1.49                                     |
| test262 (linux-x86\_64-gnu, 8/10)       | 1                    | 2.25                                     | 1.93                                     |
| test262 (linux-x86\_64-gnu, 9/10)       | 1                    | 1.71                                     | 1.15                                     |
| test262 (macos-aarch64, 10/10)          | 1                    | 1.22                                     | 2.29                                     |
| test262 (macos-aarch64, 1/10)           | 1                    | 1.97                                     | 1.19                                     |
| test262 (macos-aarch64, 2/10)           | 1                    | 1.93                                     | 1.68                                     |
| test262 (macos-aarch64, 3/10)           | 1                    | 2.24                                     | 2.79                                     |
| test262 (macos-aarch64, 4/10)           | 1                    | 1.66                                     | 1.70                                     |
| test262 (macos-aarch64, 5/10)           | 1                    | 2.57                                     | 1.14                                     |
| test262 (macos-aarch64, 6/10)           | 1                    | 1.39                                     | 1.51                                     |
| test262 (macos-aarch64, 7/10)           | 1                    | 2.13                                     | 1.39                                     |
| test262 (macos-aarch64, 8/10)           | 1                    | 1.33                                     | 1.67                                     |
| test262 (macos-aarch64, 9/10)           | 1                    | 2.88                                     | 1.16                                     |

Deno's cache-action build has no later `build` dependency to duplicate.
`test:deno` reads package source entry points through the Deno workspace,
not built npm output; its initial npm build is an unconsumed-build candidate
for U3. This does not establish whether the restored runtime archive is used.
Windows skips that action and builds once for Node. U3 owns whether and how
to reuse the already validated npm output; U7 does not remove its validation.
These two different-commit samples describe observed costs, not an
implementation improvement. There is no before/after branch comparison and
no claimed macOS minute reduction from this documentation-only audit.

### U8 macOS host split audit

U8 inspected the workflow and mise tasks at `875506fe` (including U7),
then compared the historical sources and logs for runs 36243816479,
36261458909 and [36312192623] at `af9bb68c`. The first two runs used
Node 24.18.0 and Deno 2.9.2; the third and current checkout use Node 24.21.0
and Deno 2.9.7. Within each run, Linux and macOS use the same pinned runtime,
source revision, task command and ordinary property inputs. These samples are
not three repetitions of one unchanged configuration or workload.

The coordinator explicitly requested an audit-only result after the initial
source inspection: do not introduce a Node discovery runner for a small share
of the job, and do not spend a CI cycle on a narrow Deno exclusion. U8 therefore
moves no component. Provably movable evidence exists, but its attributable
Node case time is a derived 0.14/0.14/0.21 min, far below the coordinator's
specified 10-minute follow-up threshold. This does not mean every remaining
file proves a macOS-specific contract. Uncertain host and timing evidence is
listed below and retained. No recovered runner minutes are claimed.

#### Classification and complete inventories

The categories are macOS-only evidence, host-independent with equivalent Linux
coverage, host-independent without equivalent Linux coverage, and unclear.
`timing-verdict` is an unclear movement decision for semantically independent
files whose pass verdict includes elapsed time or property interruption.
`independent-linux`, `macos-only` and `unclear` are local audit identifiers
in the [per-file inventory](./evidence/u8/file-costs.md), not changes to any
reviewed conformance vocabulary. The inventory lists every historical Node
test file, including files introduced between samples, its classification and
its derived measured-case cost. The [step inventory](./evidence/u8/job-steps.md)
names every macOS job instance and non-skipped step in all source runs.

No inspected component is established as host-independent *and* missing the
matching Linux runtime configuration. That is narrower than treating any
Linux native result as equivalent to macOS native execution. Node coverage
never substitutes for Deno, nor Node 24.18.0 for Node 24.21.0. Extended seeds,
size and case budgets never substitute for ordinary ones (U7).

Every family has these shared steps; this classification applies to each
named instance in the step inventory:

| Step/component                                                                    | Classification                                            | Source evidence and disposition                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkout, job initialization, mise installation/dependencies, post-action cleanup | Unclear as standalone coverage; operational prerequisites | The workflow installs the pinned macOS tool binaries and workspace dependencies. These steps establish no independent language verdict and stay with each macOS gate.                                                                                               |
| Cache-action `mise run build` and each task's `build` dependency                  | Host-independent, equivalent Linux configuration          | *mise.toml* runs `aube exec -- tsdown --workspace`; package configs validate ESM/declarations/publint/attw, not generated native programs. Linux runs the same build, but each macOS consumer needs its artifacts. Reuse is U3's scope, not a removable macOS test. |
| Cache-key computation                                                             | macOS-specific preparation, retained                      | *tests/ci-runtime-archive-cache.ts* selects the actual execution host/target and compiler identity; Zig and host-cc keys differ. It prepares the archive for that native target, not a Linux-equivalent assertion.                                                  |
| Cache restore, exact-hit rejection/removal, post-cache save                       | Unclear as standalone coverage; retained infrastructure   | The composite action restores the complete key's archive and removes prefix matches. A hit is an archive observation, not a measurement of Zig cold/warm state.                                                                                                     |
| Conditional failure/cancellation artifact upload                                  | macOS-specific diagnostic preservation, retained          | Native, support, test262 and sanitizer jobs upload that runner's native temporary artifacts. Removing this loses failure evidence from the actual native host.                                                                                                      |

Job-specific steps/components follow. Setup costs are not attributed to pure
case durations, and target-dependent work is never moved by file-name alone.

| Job family and step/component                                                  | Classification                                                                  | Source evidence and disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test` Node: compiler/backend/parser semantic unit files                       | Host-independent, equivalent Linux Node configuration                           | The invoked compiler functions build/print owned HIR/MIR, link supplied module graphs, parse/match supplied regex data, or hash supplied harness inputs with Web Crypto. The C backend emits strings. Test imports use assertions, `node:test` and these pure APIs; compiler/backend source has no process/FS/host adapter invocation. Parser files use Babel and owned conversion APIs. Explicit target descriptions are supplied data, not host detection. Keep *statements.test.ts* separate below.                                                                                                             |
| `test` Node: CLI/testkit unit files                                            | Host-independent, equivalent Linux Node configuration                           | *packages/cli/tests/index.test.ts* supplies fake `CompilerHost`/`NativeToolchain` objects to native-named orchestration APIs; their `run` methods return observations, never spawn. *packages/testkit/tests/index.test.ts* uses Map-backed files and fake process results. Native-looking API names do not establish native execution here.                                                                                                                                                                                                                                                                        |
| `test` Node: runtime input/symbol/registry/graph unit files and Unicode tables | Host-independent, equivalent Linux Node configuration                           | Runtime *index.test.ts*/*symbols.test.ts* inspect provider metadata and capabilities. *builtin-code-registry.test.ts*/*intrinsic-graph.test.ts* read the checked-in C assets and compare text/registry entries without compiling them. *packages/unicode/tests/tables.test.ts* checks pinned lookup/encoding data. Native clone/assembly files are excluded from this group.                                                                                                                                                                                                                                       |
| `test` Node: pure integration and inventory files                              | Host-independent, equivalent Linux Node configuration                           | *harness-fragments.test.ts* reads fixed harness text then compiles/prints fragments without a toolchain; *regexp-literal-aot.test.ts* only lowers/emits data; *regexp-matcher.test.ts* compares the TS matcher to the JS RegExp oracle. *shard.test.ts*/*structured-data.test.ts* operate on supplied values. *test262-inventory.test.ts* parses supplied frontmatter and policy values. Unicode oracle/generator tests read pinned inputs and compare deterministic sets/digests/text, without native execution or OS branches.                                                                                   |
| `test` Node: evidence-lanes and M5b/M5c graph unit files                       | Host-independent, equivalent Linux Node configuration                           | Evidence-lane tests pass in-memory source strings/path sets and explicit reader callbacks. Graph tests validate synthetic records plus the checked-in graph/manifest through deterministic readers in *tools/m5b-graph.ts*/*tools/m5c-graph.ts*. No native execution, host API oracle or elapsed-time verdict is used. Reading repository bytes is input acquisition, not testing filesystem locks/permissions.                                                                                                                                                                                                    |
| `test` Node: parser *statements.test.ts*                                       | Unclear for movement; semantics independent, timing verdict retained            | Semantic parse/conversion assertions share the pure frontend, but `performance.now()` bounds large-file conversion and structured-hint scaling ratios. Linux runs the same Node version, but that does not prove a macOS timing regression. Retain the complete file.                                                                                                                                                                                                                                                                                                                                              |
| `test` Node: ordinary native properties and runtime/harness integration        | macOS-only evidence                                                             | Native property helpers, *harness-native.test.ts*, *harness-resource.test.ts*, *native-runtime-archive-cache.test.ts*, *test262-fragments.test.ts*, *runtime-*.test.ts\* except the mocked *runtime-archive-cache.test.ts*, and native clock tests build/execute through the selected native toolchain and actual host. Linux's target is different. The five pure property files below are excluded from this category.                                                                                                                                                                                           |
| `test` Node: pure RegExp/Unicode properties                                    | Unclear for movement; semantics independent, interruption verdict retained      | *m5-regexp-pattern*, *m5-regexp-matcher*, *m5-regexp-pattern-extensions*, *m5-regexp-unicode-property-escapes* and *unicode-tables* property files use generated TS data and the pinned matcher/Unicode tables or JS RegExp oracle, with no native build/execute. `assertProperty` sets `interruptAfterTimeLimit` and `markInterruptAsFailure`; the macOS timing verdict is retained.                                                                                                                                                                                                                              |
| `test` Node: host/tooling/mixed files                                          | Unclear; retained                                                               | Host tests use real temp paths, locks, environment or processes; Zig unit tests actually compile archives and sanitizer probes; host-cc plan tests select their target from `process.platform`. Guard/toolchain/lint/commit/boundary/version tests invoke external tools or real filesystem/process behavior. *regexp-probes.test.ts* exercises process/resource measurements, and *test262-runner.test.ts* mixes manifest validation with temp-file, VM/harness, retry and scheduling checks. See the per-file inventory; pure subcases inside these mixed files are not presumed to make the whole file movable. |
| `test` Deno: `deno test -A packages`                                           | Mixed; same pure package components have equivalent Linux Deno coverage         | Linux runs the same command and Deno pin. Compiler/backend/parser/CLI/testkit pure contracts above run unchanged under Deno too. Package properties retain interruption verdicts; parser statements retain timing verdicts. Host adapters exercise Deno/Node compatibility and real host behavior. Runtime TypedArray clone and Zig activity tests compile/execute on the host; date floating-point tests inspect host-compiler assembly. The whole job cannot move.                                                                                                                                               |
| `native`: `test:native --shard N/3` native outputs and scenarios               | macOS-only evidence                                                             | *tests/native.ts* selects `targetForExecutionHost`, executes admitted native fixtures with specialization/GC policies, compares outputs and runs *tests/native/scenarios/shard-{0,1,2}.ts*. Native reference Node/Deno comparisons belong to that output check; Linux native outputs are not equivalent.                                                                                                                                                                                                                                                                                                           |
| `native`: cross-link and assembly checks inside the same step                  | Unclear for movement; retained                                                  | The cross target is `linux-aarch64-musl` on both hosts, but *tests/native.ts* invokes the actual host Zig adapter to compile/link it and inspects configured assembly paths. This proves that host toolchain's cross-build capability, not a pure TS contract. Parse/emission assertions inside the native step are not isolated wall-time measurements.                                                                                                                                                                                                                                                           |
| `native support`: shard 1 extended package step                                | Unclear for movement; semantics independent, interruption verdict retained      | Exactly the two *packages/testkit/tests/*.property.test.ts\* files run under both Node and Deno for seeds 1592590337/1592590338, scale 10 and size `large`; Linux shard 1 has the same runtime pins and inputs. Graph/list generators, explicit replay parameter checks and Promise microtasks perform no native or host API execution. Their helper retains time-limit failure, so the macOS verdict stays conservatively.                                                                                                                                                                                        |
| `native support`: extended native shard step                                   | macOS-only evidence for native files; unclear for the five pure timing files    | Scale 10, seed 1592590339 and size `large` select *tests/property/*.property.test.ts\* through *tools/run-native-tests.ts*. The wrapper derives concurrency from `availableParallelism` and CI status. Most files build/execute the macOS target. The five pure files above remain for interruption evidence, not because all files in this directory are native. Linux uses four shards versus macOS twelve; identical filenames do not imply identical scheduling.                                                                                                                                               |
| `test262`: `test:test262 --shard N/10`                                         | macOS-only evidence for execution; unclear for separating parse-only components | *tools/test262.ts* selects the native execution target and calls `runNativeCli` or fragment execution for reviewed paths. Structural/parse rejection, frontmatter/manifest handling and harness construction also run within the step. Some are semantically independent, but no isolated per-path timing or proof of target-independent complete verdicts is established here. Preserve every reviewed path and shard.                                                                                                                                                                                            |
| Host C sanitizers: self preflight in each native/property job                  | macOS-only evidence                                                             | *tests/native-toolchain.ts* probes the actual Apple Clang ASan runtime; *host-cc-sanitizer.test.ts* compiles intentionally invalid runtime/generated C and requires sanitizer reports. The selection file also contains mocked compiler-selection subprocess cases; their host/process behavior is unclear, and preflight stays in each job. Linux Clang/GCC is not Apple Clang.                                                                                                                                                                                                                                   |
| Host C sanitizers: runtime/native or property step                             | macOS-only evidence; pure timing property subfiles retained                     | `OSEO_NATIVE_TOOLCHAIN=host-cc`, `OSEO_HOST_CC=clang` select Apple Clang on macOS. The native job runs runtime fixtures and native scenarios; the property job runs all ordinary property files with concurrency four and macOS time scale six. Linux's compiler and time scale three differ. The workflow does not invoke `test:sanitizer:test262`.                                                                                                                                                                                                                                                               |

#### Measured costs and attribution limits

The following wall times are **measured** from GitHub step/job timestamps.
The source jobs are `test (macos-latest, node)`,
`test (macos-latest, deno)` and
`native support (macos-aarch64, 1/12)` in the named run.
The last row is only the package step on that shard, not its native execution.
All other job instances/steps are preserved in the step inventory.

| Measured component s                            | 36243816479 | 36261458909 | 36312192623 |
| ----------------------------------------------- | ----------: | ----------: | ----------: |
| Node whole job                                  |        2421 |        2589 |        2986 |
| Node test step, including repeated build        |        2368 |        2537 |        2943 |
| Deno whole job                                  |          90 |         182 |         151 |
| Deno test step                                  |          38 |          47 |          62 |
| Extended package step, including repeated build |          11 |          10 |          10 |

The next table contains **derived sums of measured Node case durations**, not
wall-time allocations. Node's spec output exposes each case's `ms`, but no
file subprocess start/end or per-file duration summary. The extraction starts
at the Node task launch and stops before its final summary; it does not count
build-tool checkmarks or repeated failure details. It maps names against the
run's historical source, preserves ambiguous cases separately, and never
assigns them from apparent output order. The per-file inventory and compact
JSON retain the inputs. No proportional allocation of the Node wall time is
valid: file subprocesses overlap, and their setup/import/scheduling cost is
not measured by case callbacks.

| Derived case seconds in macOS Node job                 | 36243816479 | 36261458909 | 36312192623 |
| ------------------------------------------------------ | ----------: | ----------: | ----------: |
| Provably independent, matching Linux Node coverage     |       8.132 |       8.372 |      12.740 |
| Native/host compiler evidence retained                 |    4471.151 |    4816.922 |    5640.646 |
| Semantically independent timing-verdict files retained |       1.163 |       1.095 |       1.175 |
| Unclear mixed/host/tooling files retained              |     117.161 |      97.742 |      88.366 |
| Ambiguous source-file attribution                      |      21.751 |      25.106 |      22.163 |

Native case sums exceed job wall time because cases from separate files
execute concurrently. The independent row is attributable case work, not a
measured saving or a complete per-file cost. All independent files have
uniquely attributable cases in their matching Linux Node job in each run.
The largest independent file in run 36312192623 is the M5c graph check at a
derived 7.405 s; its checked-in manifest validation accounts for most of the
increase from the earlier samples. Configuration/workload changes and runner
variance remain confounded, so this is not a speedup comparison.

Pure components nested in mixed native/standards steps have no isolated
measured cost. Their enclosing step costs are preserved, but cannot be credited
as movable. Initial npm builds, repeated build intervals, dependency install,
cache and checkout costs are fixed/setup costs, already decomposed by U7/U3;
none is added to the independent case row. No Zig cache-cold/warm comparison
is made and no archive-cache hit is credited as optimization.

Run [36300567111] independently observed a macOS Node failure at
*packages/parser-babel/tests/statements.test.ts:1330*: the object hint scaling
ratio assertion reported 7.52. That is an observation of a host-sensitive
timing verdict, not evidence that removing the macOS test preserves coverage.
Parse-only semantics, hint-scaling ratios and property interruption are assessed
separately; all timing-verdict files remain.

A future Node host split would need a reviewed discovery runner that excludes
only explicit audited files on macOS, retains default discovery coverage for
new files, and leaves full Linux Node coverage and macOS native tests intact.
Node 24 has no test-file exclusion flag; a name-based skip would be too broad.
The attributable movable share here is below 10 min in every observed run and
does not justify that runner change. Exact recovery would require a controlled
CI experiment measuring process/import cost and overlap, not extrapolation
from summed case `ms`. U8 introduces no runner, changes no workflow/mise task,
and requests no CI run. The projection's entire `test` family remains an upper
ceiling, not an evidenced host-split saving.

[36300567111]: https://github.com/dahlia/oseo/actions/runs/36300567111
[36312192623]: https://github.com/dahlia/oseo/actions/runs/36312192623

### macOS test262 execution series

The measured series below covers every main workflow run from `32ece7f4`
through `6b435b4f`, including failed and cancelled runs. Sources are the
linked runs' measured step `startedAt`/`completedAt` timestamps from
`gh run view RUN --repo dahlia/oseo --json headSha,jobs`. Execution seconds
are the derived sum across all ten macOS shards of the step named
`Run mise run test:test262 --shard N/10`. They exclude job setup and cleanup,
but retain any startup and builds inside that execution step. Reviewed paths
are measured from each commit's manifest with the count command below;
seconds per path are derived by dividing the execution sum by that count.
Each commit was measured once, with no same-commit repeated sample.

| Commit     | Source run    | Measured paths | Derived execution s | Derived s/path | Observed run result |
| ---------- | ------------- | -------------- | ------------------- | -------------- | ------------------- |
| `32ece7f4` | [35456667007] | 20,841         | 13103               | 0.629          | success             |
| `e99620d5` | [35463308291] | 20,898         | 14123               | 0.676          | success             |
| `aff3ade3` | [35493049199] | 21,156         | 16096               | 0.761          | success             |
| `c56ef034` | [35744754987] | 21,156         | 16605               | 0.785          | success             |
| `09587080` | [35767988349] | 21,214         | 16428               | 0.774          | success             |
| `475dfbad` | [35865767695] | 21,265         | 15761               | 0.741          | success             |
| `970d6207` | [35928647398] | 21,265         | 16590               | 0.780          | success             |
| `5255312d` | [35956640498] | 21,265         | 16873               | 0.793          | success             |
| `a7b3ba2b` | [36009350844] | 21,312         | 15895               | 0.746          | success             |
| `890bb6dd` | [36083917728] | 21,341         | 16956               | 0.795          | failure             |
| `18e860a0` | [36111689857] | 21,312         | incomplete          | not comparable | cancelled           |
| `c8188414` | [36115335755] | 21,312         | 18666               | 0.876          | success             |
| `d6742c11` | [36134286493] | 21,341         | 16724               | 0.784          | success             |
| `97022608` | [36199093039] | 21,341         | 16290               | 0.763          | success             |
| `1ca8353a` | [36226406621] | 21,383         | 16159               | 0.756          | success             |
| `00153abe` | [36243816479] | 21,383         | 18935               | 0.886          | success             |
| `c9b3cc80` | [36261458909] | 21,383         | 18686               | 0.874          | success             |
| `6b435b4f` | [36300567111] | 21,383         | 17678               | 0.827          | failure             |

The cancelled run at `18e860a0` completed only shards 4/10, 7/10, and 8/10;
it has no complete execution sum or comparable per-path rate. All ten macOS
test262 execution steps succeeded in each other listed run, including the
failed runs. Run 36083917728 failed its Linux Node test job, and run
36300567111 failed its macOS Node test job; those failures are outside the
measured test262 steps.

The derived step-level per-path cost rose from 0.629-0.676 s/path in the
first two runs to an observed 0.741-0.886 s/path band from `aff3ade3` onward.
The measured path count grew from 20,841 to 21,383, a derived increase of
about 2.6%. The 0.741-0.886 band is the observed run-to-run spread, not a
trend within that band. The cause of the higher per-path cost is not yet
identified; runner variance and Zig cache hits are not improvements.

Against run 35456667007, run 36243816479 adds a derived 99.82 min of macOS
test262 job time, of which 97.20 min is inside the measured execution steps
(`(18935 - 13103) / 60`). Holding the older step rate constant while adding
542 paths accounts for only a derived 5.68 min
(`13103 * 542 / 20841 / 60`). Run 36261458909 similarly adds a derived
94.13 min of job time and 93.05 min of execution-step time. Thus most of the
increase in macOS test262 minutes relative to the 226.27-minute test262
family in the brief's baseline source run is per-path execution cost, rather
than corpus size or job fixed cost. The 628-minute ceiling covers all five
macOS families; this decomposition applies only to its test262 family. This is
a workload-normalized observation, not an attribution to a particular
implementation change or a measured isolated speedup.

[35463308291]: https://github.com/dahlia/oseo/actions/runs/35463308291
[35493049199]: https://github.com/dahlia/oseo/actions/runs/35493049199
[35744754987]: https://github.com/dahlia/oseo/actions/runs/35744754987
[35767988349]: https://github.com/dahlia/oseo/actions/runs/35767988349
[35865767695]: https://github.com/dahlia/oseo/actions/runs/35865767695
[35928647398]: https://github.com/dahlia/oseo/actions/runs/35928647398
[35956640498]: https://github.com/dahlia/oseo/actions/runs/35956640498
[36009350844]: https://github.com/dahlia/oseo/actions/runs/36009350844
[36083917728]: https://github.com/dahlia/oseo/actions/runs/36083917728
[36111689857]: https://github.com/dahlia/oseo/actions/runs/36111689857
[36115335755]: https://github.com/dahlia/oseo/actions/runs/36115335755
[36134286493]: https://github.com/dahlia/oseo/actions/runs/36134286493
[36199093039]: https://github.com/dahlia/oseo/actions/runs/36199093039
[36226406621]: https://github.com/dahlia/oseo/actions/runs/36226406621

### Fixed cost and cache evidence

The measured steps API is `gh api repos/dahlia/oseo/actions/jobs/JOB`. Nested
steps in the composite cache action are absent there, so their measured
runner-log `duration_ms` fields come from
`gh api repos/dahlia/oseo/actions/runs/RUN/logs`. The log archive also supplies
dependency timings, repeated builds, and cache-hit evidence.

In the detailed tables, C is measured checkout time. T is derived mise tool
setup time: its measured action interval minus D and M. D is the measured
interval from `[deps.aube] aube` to `[deps.aube]` completion. M is the measured
mise cache-restore interval from `Restoring mise cache` to the restored-key
message. R is measured runtime archive restore or miss-lookup time. B is
derived total build time: the initial nested build's measured duration plus
later measured intervals from `[build]` launch to the next test-task launch.
Those later intervals include task dispatch overhead and builds repeated by
test tasks. The tables use seconds, rounded only after calculation.

F is a derived fixed-cost proxy, not a separately timed no-test job. It is
job elapsed time minus the interval from cache-action completion to final
test-step completion, plus the repeated build intervals. It includes checkout,
mise setup, dependency install, builds, archive key generation, cache lookup,
action gaps, setup, and cleanup. Some test-runner startup remains in the
residual, so the normalized rates below include that cost. C/T/D/B/M/R do
not sum to F because F also retains those otherwise unassigned intervals.
The native-support first shard's package-property step is variable evidence
work and is subtracted separately for the per-native-file rate, after
removing its already allocated repeated build cost.

Every measured job restored the mise tool-installation cache. That is a warm
Zig *installation*, not proof of a warm Zig compilation cache. Neither
commit's workflow restores a Zig compilation-cache directory; the derived
start state is cold on fresh hosted runners, with in-job warming possible.
These jobs' compilation-cache contents were not inspected, so this cold
inference must not be presented as measured cache contents for them. U5 has
since measured those contents locally; see
[Zig compilation cache sharing](#zig-compilation-cache-sharing-u5).
Runtime archive cold/warm states below are observed cold misses and warm
exact-key restores, respectively,
from `Cache not found for input keys: oseo-runtime...` or
`Cache restored from key: oseo-runtime...`. The workflow removes a non-exact
restore before compilation. Harness objects are not restored by CI.

Cold and warm runtime-archive residual rates are kept separate below.
A cache hit or a tool-install cache restore is not an implementation
improvement. Host C sanitizer jobs use the host compiler and its archive;
the inferred Zig compilation-cache state is inapplicable to their execution.

Deno test jobs have no repeated build inside their test task, so their
F is an integer difference of the measured API timestamps; Node jobs add
a log-timed repeated build by the same formula. The observed macOS Deno
job `108457960713` is an outlier: its API completion is 18:47:09 UTC,
while its final step ends at 18:45:47 UTC in run 36261458909. The derived
82 s reporting tail is retained in its derived F of 135.00 s and the family
total because both use job timestamps. It is not measured useful setup work;
this proxy includes post-step reporting latency as well as executed cleanup.
The derived means include this outlier, not a normalized replacement.

| Host  | Run         | Mean C | Mean T | Mean D | Mean B | Mean M | Mean R | Mean F |
| ----- | ----------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| macOS | 36243816479 | 4.07   | 2.72   | 24.51  | 4.40   | 13.12  | 1.40   | 59.82  |
| macOS | 36261458909 | 3.97   | 2.71   | 21.76  | 4.23   | 11.50  | 1.20   | 56.81  |

Derived macOS means in seconds above use every measured job in the
listed families of each run. The per-job values follow.

macOS, run 36243816479: measured source jobs; derived allocations in seconds.
C/D/M/R are measured intervals; T/B/F are derived as defined above.
The elapsed column is measured seconds; cache is observed runtime state.

| Job                  | Source job ID | Elapsed | C    | T    | D     | B     | M     | R    | F     | Cache |
| -------------------- | ------------- | ------- | ---- | ---- | ----- | ----- | ----- | ---- | ----- | ----- |
| sanitizers native    | 108409155499  | 2404.00 | 5.00 | 3.03 | 27.92 | 10.07 | 23.05 | 2.59 | 87.37 | warm  |
| sanitizers property  | 108409155477  | 2096.00 | 3.00 | 2.20 | 22.51 | 5.24  | 14.29 | 0.49 | 62.45 | cold  |
| native 1/3           | 108409155521  | 990.00  | 3.00 | 2.26 | 23.74 | 4.35  | 11.00 | 2.08 | 54.87 | warm  |
| native 2/3           | 108409155536  | 725.00  | 3.00 | 2.74 | 22.89 | 3.26  | 10.37 | 2.13 | 52.31 | warm  |
| native 3/3           | 108409155599  | 824.00  | 4.00 | 2.67 | 24.71 | 3.88  | 8.62  | 0.49 | 50.77 | warm  |
| native support 1/12  | 108409155577  | 1301.00 | 8.00 | 2.06 | 22.58 | 5.46  | 11.36 | 2.68 | 61.92 | warm  |
| native support 10/12 | 108409155596  | 1245.00 | 4.00 | 2.42 | 25.12 | 3.79  | 10.47 | 1.32 | 55.62 | warm  |
| native support 11/12 | 108409155646  | 916.00  | 3.00 | 2.17 | 17.03 | 2.91  | 9.80  | 1.84 | 46.15 | warm  |
| native support 12/12 | 108409155587  | 1111.00 | 3.00 | 3.47 | 26.11 | 4.17  | 10.42 | 0.44 | 55.68 | warm  |
| native support 2/12  | 108409155515  | 1449.00 | 5.00 | 3.26 | 27.84 | 6.97  | 14.90 | 0.59 | 67.95 | cold  |
| native support 3/12  | 108409155559  | 1636.00 | 3.00 | 2.35 | 20.68 | 2.42  | 6.97  | 0.37 | 40.10 | warm  |
| native support 4/12  | 108409155507  | 1930.00 | 4.00 | 2.54 | 25.17 | 4.78  | 13.29 | 0.47 | 61.72 | cold  |
| native support 5/12  | 108409155582  | 4088.00 | 4.00 | 2.80 | 24.68 | 3.81  | 10.52 | 0.46 | 58.67 | warm  |
| native support 6/12  | 108409155597  | 1548.00 | 5.00 | 3.14 | 25.60 | 4.69  | 14.25 | 1.29 | 61.60 | warm  |
| native support 7/12  | 108409155527  | 1216.00 | 3.00 | 2.19 | 20.11 | 2.91  | 8.71  | 0.20 | 43.14 | cold  |
| native support 8/12  | 108409155548  | 1140.00 | 4.00 | 3.33 | 20.29 | 4.60  | 14.37 | 1.90 | 55.92 | warm  |
| native support 9/12  | 108409155541  | 1032.00 | 4.00 | 2.56 | 25.44 | 4.31  | 15.00 | 0.47 | 62.71 | cold  |
| test Deno            | 108409155533  | 90.00   | 3.00 | 2.97 | 25.30 | 1.59  | 10.73 | 0.50 | 52.00 | cold  |
| test Node            | 108409155552  | 2421.00 | 4.00 | 3.11 | 25.41 | 3.74  | 10.47 | 0.42 | 54.46 | cold  |
| test262 1/10         | 108409155660  | 1726.00 | 5.00 | 2.99 | 27.07 | 4.51  | 16.94 | 2.02 | 66.97 | warm  |
| test262 10/10        | 108409155669  | 1636.00 | 3.00 | 2.27 | 19.21 | 2.95  | 10.52 | 2.02 | 50.22 | warm  |
| test262 2/10         | 108409155714  | 1680.00 | 3.00 | 3.25 | 24.85 | 4.22  | 14.91 | 1.24 | 62.93 | warm  |
| test262 3/10         | 108409155512  | 1930.00 | 5.00 | 2.28 | 28.58 | 4.56  | 16.13 | 2.12 | 68.24 | warm  |
| test262 4/10         | 108409155693  | 2023.00 | 5.00 | 3.12 | 25.73 | 4.28  | 14.16 | 2.08 | 64.66 | warm  |
| test262 5/10         | 108409155679  | 2636.00 | 6.00 | 3.01 | 35.38 | 5.99  | 19.61 | 2.48 | 85.57 | warm  |
| test262 6/10         | 108409155642  | 2004.00 | 5.00 | 1.83 | 22.21 | 3.24  | 16.97 | 1.24 | 60.39 | warm  |
| test262 7/10         | 108409155700  | 2030.00 | 4.00 | 3.12 | 27.22 | 4.96  | 14.66 | 2.21 | 66.13 | warm  |
| test262 8/10         | 108409155661  | 1945.00 | 3.00 | 3.21 | 22.75 | 3.34  | 12.04 | 2.08 | 58.33 | warm  |
| test262 9/10         | 108409155696  | 1955.00 | 4.00 | 2.59 | 24.56 | 6.63  | 15.85 | 2.33 | 65.88 | warm  |

macOS, run 36261458909: measured source jobs; derived allocations in seconds.
C/D/M/R are measured intervals; T/B/F are derived as defined above.
The elapsed column is measured seconds; cache is observed runtime state.

| Job                  | Source job ID | Elapsed | C    | T    | D     | B    | M     | R    | F      | Cache |
| -------------------- | ------------- | ------- | ---- | ---- | ----- | ---- | ----- | ---- | ------ | ----- |
| sanitizers native    | 108457960695  | 2151.00 | 4.00 | 2.14 | 23.20 | 9.92 | 13.67 | 0.63 | 68.40  | cold  |
| sanitizers property  | 108457960702  | 1875.00 | 4.00 | 2.25 | 16.97 | 5.27 | 7.78  | 0.81 | 49.70  | warm  |
| native 1/3           | 108457960797  | 704.00  | 3.00 | 1.92 | 16.15 | 2.61 | 8.92  | 1.74 | 42.26  | warm  |
| native 2/3           | 108457960803  | 1045.00 | 3.00 | 2.64 | 22.83 | 4.23 | 11.53 | 1.91 | 55.63  | warm  |
| native 3/3           | 108457960750  | 986.00  | 5.00 | 2.41 | 25.47 | 4.45 | 14.11 | 1.25 | 59.88  | warm  |
| native support 1/12  | 108457960760  | 1242.00 | 4.00 | 2.37 | 18.40 | 4.16 | 11.23 | 1.16 | 48.50  | warm  |
| native support 10/12 | 108457960871  | 1398.00 | 3.00 | 3.83 | 27.35 | 5.14 | 14.82 | 2.00 | 66.33  | warm  |
| native support 11/12 | 108457960824  | 722.00  | 4.00 | 2.44 | 23.14 | 3.78 | 8.42  | 0.60 | 49.45  | warm  |
| native support 12/12 | 108457960818  | 1116.00 | 4.00 | 2.09 | 21.24 | 3.17 | 9.67  | 0.99 | 48.41  | warm  |
| native support 2/12  | 108457960753  | 1319.00 | 4.00 | 1.99 | 22.17 | 3.97 | 12.84 | 2.07 | 55.45  | warm  |
| native support 3/12  | 108457960772  | 2341.00 | 4.00 | 2.43 | 23.56 | 3.90 | 12.02 | 2.02 | 55.55  | warm  |
| native support 4/12  | 108457960741  | 1723.00 | 4.00 | 2.84 | 25.38 | 4.56 | 12.78 | 0.36 | 57.10  | cold  |
| native support 5/12  | 108457960771  | 3095.00 | 3.00 | 2.13 | 19.15 | 5.59 | 10.71 | 0.41 | 50.15  | cold  |
| native support 6/12  | 108457960812  | 1130.00 | 4.00 | 2.21 | 17.53 | 3.51 | 11.26 | 1.11 | 47.70  | warm  |
| native support 7/12  | 108457960758  | 1283.00 | 4.00 | 2.00 | 21.70 | 4.47 | 13.31 | 0.39 | 55.23  | cold  |
| native support 8/12  | 108457960845  | 958.00  | 3.00 | 2.96 | 21.99 | 3.56 | 11.05 | 1.84 | 52.44  | warm  |
| native support 9/12  | 108457960811  | 764.00  | 3.00 | 2.93 | 18.32 | 3.01 | 6.75  | 0.53 | 42.23  | warm  |
| test Deno            | 108457960713  | 182.00  | 5.00 | 2.77 | 25.19 | 2.65 | 10.04 | 0.29 | 135.00 | cold  |
| test Node            | 108457960817  | 2589.00 | 4.00 | 2.82 | 27.43 | 3.88 | 9.75  | 0.20 | 53.70  | cold  |
| test262 1/10         | 108457960962  | 1954.00 | 3.00 | 3.05 | 15.90 | 2.85 | 12.05 | 2.01 | 47.19  | warm  |
| test262 10/10        | 108457960777  | 1752.00 | 5.00 | 3.10 | 25.25 | 5.70 | 11.65 | 0.42 | 59.29  | cold  |
| test262 2/10         | 108457960923  | 1701.00 | 6.00 | 3.58 | 24.76 | 4.68 | 15.67 | 2.10 | 69.68  | warm  |
| test262 3/10         | 108457960799  | 2750.00 | 5.00 | 2.80 | 26.77 | 5.85 | 15.43 | 2.06 | 70.79  | warm  |
| test262 4/10         | 108457960954  | 1802.00 | 4.00 | 2.88 | 17.95 | 3.77 | 11.18 | 1.18 | 47.70  | warm  |
| test262 5/10         | 108457960913  | 1644.00 | 4.00 | 3.26 | 15.67 | 2.81 | 8.07  | 0.49 | 40.14  | warm  |
| test262 6/10         | 108457960977  | 1630.00 | 3.00 | 3.96 | 22.66 | 5.02 | 11.38 | 1.18 | 56.51  | warm  |
| test262 7/10         | 108457960899  | 1808.00 | 5.00 | 2.42 | 18.26 | 3.09 | 13.32 | 1.11 | 51.39  | warm  |
| test262 8/10         | 108457960821  | 2257.00 | 5.00 | 3.00 | 24.47 | 4.34 | 14.52 | 1.97 | 62.67  | warm  |
| test262 9/10         | 108457960879  | 1926.00 | 3.00 | 3.26 | 22.27 | 2.60 | 9.46  | 1.86 | 49.16  | warm  |

| Host  | Run         | Mean C | Mean T | Mean D | Mean B | Mean M | Mean R | Mean F |
| ----- | ----------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| Linux | 36243816479 | 2.00   | 2.40   | 5.49   | 4.09   | 5.95   | 0.28   | 26.06  |
| Linux | 36261458909 | 1.85   | 2.53   | 6.02   | 4.25   | 5.90   | 0.27   | 26.47  |

Derived Linux means in seconds above use every measured job in the
listed families of each run. The per-job values follow.

Linux, run 36243816479: measured source jobs; derived allocations in seconds.
C/D/M/R are measured intervals; T/B/F are derived as defined above.
The elapsed column is measured seconds; cache is observed runtime state.

| Job                | Source job ID | Elapsed | C    | T    | D    | B     | M    | R    | F     | Cache |
| ------------------ | ------------- | ------- | ---- | ---- | ---- | ----- | ---- | ---- | ----- | ----- |
| sanitizers all     | 108409155518  | 3889.00 | 2.00 | 2.11 | 4.18 | 10.18 | 6.71 | 0.33 | 36.32 | cold  |
| native 1/3         | 108409155524  | 786.00  | 2.00 | 2.08 | 7.30 | 3.05  | 5.63 | 0.28 | 26.42 | cold  |
| native 2/3         | 108409155604  | 676.00  | 2.00 | 1.70 | 7.78 | 3.52  | 5.52 | 0.34 | 26.71 | cold  |
| native 3/3         | 108409155580  | 884.00  | 2.00 | 2.63 | 4.83 | 4.07  | 5.54 | 0.19 | 23.06 | cold  |
| native support 1/4 | 108409155547  | 5174.00 | 3.00 | 2.29 | 3.23 | 5.96  | 7.49 | 0.38 | 27.81 | cold  |
| native support 2/4 | 108409155530  | 2981.00 | 1.00 | 2.62 | 9.40 | 4.57  | 4.98 | 0.23 | 27.72 | cold  |
| native support 3/4 | 108409155623  | 2331.00 | 2.00 | 2.52 | 6.95 | 3.02  | 4.53 | 0.21 | 25.20 | cold  |
| native support 4/4 | 108409155531  | 3659.00 | 2.00 | 2.24 | 5.48 | 4.51  | 7.28 | 0.34 | 31.16 | cold  |
| test Deno          | 108409155475  | 69.00   | 2.00 | 2.52 | 6.13 | 2.07  | 5.35 | 0.24 | 24.00 | cold  |
| test Node          | 108409155494  | 2174.00 | 2.00 | 2.34 | 4.97 | 3.79  | 5.69 | 0.24 | 23.75 | cold  |
| test262 1/10       | 108409155674  | 1128.00 | 2.00 | 2.52 | 4.92 | 3.96  | 5.56 | 0.22 | 21.93 | cold  |
| test262 10/10      | 108409155570  | 685.00  | 2.00 | 2.55 | 5.30 | 2.33  | 5.15 | 0.27 | 24.12 | cold  |
| test262 2/10       | 108409155571  | 992.00  | 2.00 | 2.45 | 2.74 | 3.56  | 5.80 | 0.32 | 22.75 | cold  |
| test262 3/10       | 108409155579  | 1524.00 | 2.00 | 2.31 | 6.09 | 3.94  | 5.60 | 0.21 | 24.91 | cold  |
| test262 4/10       | 108409155583  | 1454.00 | 2.00 | 2.68 | 5.02 | 3.89  | 8.30 | 0.37 | 27.89 | cold  |
| test262 5/10       | 108409155592  | 1166.00 | 2.00 | 2.24 | 5.35 | 3.94  | 6.42 | 0.30 | 26.91 | cold  |
| test262 6/10       | 108409155670  | 1376.00 | 2.00 | 3.12 | 3.74 | 3.57  | 6.14 | 0.32 | 24.73 | cold  |
| test262 7/10       | 108409155585  | 1156.00 | 2.00 | 2.08 | 4.08 | 3.79  | 4.84 | 0.19 | 20.85 | cold  |
| test262 8/10       | 108409155652  | 1242.00 | 2.00 | 3.10 | 4.61 | 4.50  | 7.28 | 0.35 | 27.25 | cold  |
| test262 9/10       | 108409155610  | 821.00  | 2.00 | 1.99 | 7.75 | 3.57  | 5.26 | 0.26 | 27.71 | cold  |

Linux, run 36261458909: measured source jobs; derived allocations in seconds.
C/D/M/R are measured intervals; T/B/F are derived as defined above.
The elapsed column is measured seconds; cache is observed runtime state.

| Job                | Source job ID | Elapsed | C    | T    | D     | B     | M    | R    | F     | Cache |
| ------------------ | ------------- | ------- | ---- | ---- | ----- | ----- | ---- | ---- | ----- | ----- |
| sanitizers all     | 108457960626  | 4244.00 | 1.00 | 2.64 | 3.18  | 11.06 | 8.18 | 0.36 | 37.93 | cold  |
| native 1/3         | 108457960805  | 821.00  | 2.00 | 3.19 | 4.48  | 3.94  | 7.33 | 0.36 | 26.90 | cold  |
| native 2/3         | 108457960732  | 880.00  | 2.00 | 2.48 | 5.27  | 4.00  | 5.25 | 0.19 | 23.95 | cold  |
| native 3/3         | 108457960737  | 952.00  | 2.00 | 2.57 | 5.31  | 3.97  | 5.12 | 0.20 | 22.95 | cold  |
| native support 1/4 | 108457960742  | 5221.00 | 2.00 | 2.06 | 4.18  | 6.53  | 6.75 | 0.30 | 27.94 | cold  |
| native support 2/4 | 108457960740  | 3795.00 | 2.00 | 2.30 | 4.86  | 3.94  | 5.84 | 0.23 | 23.90 | cold  |
| native support 3/4 | 108457960789  | 2543.00 | 1.00 | 2.22 | 6.62  | 2.97  | 4.17 | 0.25 | 22.46 | cold  |
| native support 4/4 | 108457960764  | 3302.00 | 3.00 | 1.92 | 8.31  | 4.04  | 5.77 | 0.33 | 29.72 | cold  |
| test Deno          | 108457960766  | 59.00   | 2.00 | 3.00 | 5.16  | 1.81  | 4.85 | 0.25 | 21.00 | cold  |
| test Node          | 108457960815  | 1374.00 | 2.00 | 2.21 | 10.52 | 4.31  | 4.27 | 0.23 | 29.32 | cold  |
| test262 1/10       | 108457960854  | 1170.00 | 2.00 | 1.83 | 3.59  | 4.08  | 7.58 | 0.36 | 26.91 | cold  |
| test262 10/10      | 108457960874  | 909.00  | 1.00 | 2.37 | 5.77  | 4.06  | 5.86 | 0.33 | 25.68 | cold  |
| test262 2/10       | 108457960861  | 922.00  | 2.00 | 3.04 | 9.02  | 3.62  | 3.94 | 0.17 | 27.51 | cold  |
| test262 3/10       | 108457960808  | 1498.00 | 2.00 | 2.91 | 5.87  | 3.89  | 5.22 | 0.19 | 22.86 | cold  |
| test262 4/10       | 108457960843  | 1494.00 | 2.00 | 2.21 | 4.31  | 4.15  | 5.48 | 0.21 | 22.94 | cold  |
| test262 5/10       | 108457960878  | 1189.00 | 2.00 | 2.92 | 3.81  | 4.03  | 6.27 | 0.26 | 23.97 | cold  |
| test262 6/10       | 108457960807  | 1495.00 | 1.00 | 2.89 | 5.19  | 3.99  | 7.91 | 0.37 | 27.88 | cold  |
| test262 7/10       | 108457960834  | 920.00  | 2.00 | 2.96 | 13.73 | 3.50  | 8.30 | 0.35 | 38.49 | cold  |
| test262 8/10       | 108457960951  | 1225.00 | 2.00 | 2.75 | 5.31  | 3.95  | 4.94 | 0.22 | 22.93 | cold  |
| test262 9/10       | 108457960903  | 715.00  | 2.00 | 2.20 | 5.89  | 3.24  | 4.91 | 0.28 | 24.15 | cold  |

### Per-path and per-file residual cost

Derived test262 rates are `(job seconds - F) / shard paths`. The measured
ordered path set is the commit's *tests/test262/subset.yaml*, reconstructed
in global upstream path order by the manifest reader. *tools/shard.ts* selects
zero-based positions modulo the shard total. Applying that command's
selection to the measured count gives derived counts of 2,139 paths for
shards 1 through 3 and 2,138 for the remaining shards. The denominator counts
all reviewed paths, including unsupported paths; it is not native execution
or variant throughput. The source logs confirm each shard's result count.

Derived native-support rates are
`(job seconds - F - package evidence seconds) / selected native property files`.
Package evidence seconds are derived from the measured package-property step
minus its repeated build interval, which is already included in F; subtracting
the whole step again would double-count that build. The exact file list comes
from the measured expanded `node tools/run-native-tests.ts` command in each job
log, not today's checkout. Node's `--test-shard=INDEX/TOTAL` selects
round-robin positions in that ordered list. A Git tree comparison and the
expanded commands show one additional property file in the later run, so
selected file sets can shift. These are wall-time residuals per selected file
with concurrent execution; they are not mean standalone file latency or
processor-seconds per file. Neither rate supports a linear projection over a
changed semantic workload.

The following derived ranges separate observed runtime archive states.
Every figure is seconds per reviewed path or selected property file from
the indicated run's measured job logs and timestamps.

| Run         | Host  | Family         | Archive | Jobs | Min s/unit | Max s/unit |
| ----------- | ----- | -------------- | ------- | ---- | ---------- | ---------- |
| 36243816479 | macOS | test262        | warm    | 10   | 0.742      | 1.193      |
| 36243816479 | macOS | native support | cold    | 4    | 96.929     | 169.844    |
| 36243816479 | macOS | native support | warm    | 8    | 86.985     | 366.303    |
| 36243816479 | Linux | test262        | cold    | 10   | 0.309      | 0.701      |
| 36243816479 | Linux | native support | cold    | 4    | 72.056     | 160.499    |
| 36261458909 | macOS | test262        | cold    | 1    | 0.792      | 0.792      |
| 36261458909 | macOS | test262        | warm    | 9    | 0.736      | 1.253      |
| 36261458909 | macOS | native support | cold    | 3    | 111.615    | 276.805    |
| 36261458909 | macOS | native support | warm    | 9    | 67.255     | 207.768    |
| 36261458909 | Linux | test262        | cold    | 10   | 0.323      | 0.690      |
| 36261458909 | Linux | native support | cold    | 4    | 78.767     | 161.940    |

The first native-support shard package allocation is recorded explicitly
below: step seconds are measured from the source job API; build and package
evidence seconds are derived from the step and its measured build interval.

| Run         | Host  | Source job ID | Step s | Build s  | Package evidence s |
| ----------- | ----- | ------------- | ------ | -------- | ------------------ |
| 36243816479 | Linux | 108409155547  | 12.000 | 1.765833 | 10.234             |
| 36243816479 | macOS | 108409155577  | 11.000 | 1.338042 | 9.662              |
| 36261458909 | Linux | 108457960742  | 13.000 | 2.022509 | 10.977             |
| 36261458909 | macOS | 108457960760  | 10.000 | 1.337959 | 8.662              |

Absent cache categories have no measurement. Per-shard denominators and
derived rates follow; A/B identify runs 36243816479/36261458909.
Source job IDs and observed runtime cache states are in the fixed-cost
tables. Each rate uses its own job's F, with no cold/warm averaging.

macOS per-shard derived rates:

| Shard                | A units | A s/unit | A archive | B units | B s/unit | B archive |
| -------------------- | ------- | -------- | --------- | ------- | -------- | --------- |
| native support 1/12  | 11      | 111.765  | warm      | 11      | 107.712  | warm      |
| native support 10/12 | 10      | 118.938  | warm      | 10      | 133.167  | warm      |
| native support 11/12 | 10      | 86.985   | warm      | 10      | 67.255   | warm      |
| native support 12/12 | 10      | 105.532  | warm      | 10      | 106.759  | warm      |
| native support 2/12  | 11      | 125.550  | cold      | 11      | 114.868  | warm      |
| native support 3/12  | 11      | 145.082  | warm      | 11      | 207.768  | warm      |
| native support 4/12  | 11      | 169.844  | cold      | 11      | 151.446  | cold      |
| native support 5/12  | 11      | 366.303  | warm      | 11      | 276.805  | cold      |
| native support 6/12  | 11      | 135.128  | warm      | 11      | 98.391   | warm      |
| native support 7/12  | 11      | 106.623  | cold      | 11      | 111.615  | cold      |
| native support 8/12  | 10      | 108.408  | warm      | 11      | 82.324   | warm      |
| native support 9/12  | 10      | 96.929   | cold      | 10      | 72.177   | warm      |
| test262 1/10         | 2139    | 0.776    | warm      | 2139    | 0.891    | warm      |
| test262 10/10        | 2138    | 0.742    | warm      | 2138    | 0.792    | cold      |
| test262 2/10         | 2139    | 0.756    | warm      | 2139    | 0.763    | warm      |
| test262 3/10         | 2139    | 0.870    | warm      | 2139    | 1.253    | warm      |
| test262 4/10         | 2138    | 0.916    | warm      | 2138    | 0.821    | warm      |
| test262 5/10         | 2138    | 1.193    | warm      | 2138    | 0.750    | warm      |
| test262 6/10         | 2138    | 0.909    | warm      | 2138    | 0.736    | warm      |
| test262 7/10         | 2138    | 0.919    | warm      | 2138    | 0.822    | warm      |
| test262 8/10         | 2138    | 0.882    | warm      | 2138    | 1.026    | warm      |
| test262 9/10         | 2138    | 0.884    | warm      | 2138    | 0.878    | warm      |

Linux per-shard derived rates:

| Shard              | A units | A s/unit | A archive | B units | B s/unit | B archive |
| ------------------ | ------- | -------- | --------- | ------- | -------- | --------- |
| native support 1/4 | 32      | 160.499  | cold      | 32      | 161.940  | cold      |
| native support 2/4 | 32      | 92.290   | cold      | 32      | 117.847  | cold      |
| native support 3/4 | 32      | 72.056   | cold      | 32      | 78.767   | cold      |
| native support 4/4 | 31      | 117.027  | cold      | 32      | 102.259  | cold      |
| test262 1/10       | 2139    | 0.517    | cold      | 2139    | 0.534    | cold      |
| test262 10/10      | 2138    | 0.309    | cold      | 2138    | 0.413    | cold      |
| test262 2/10       | 2139    | 0.453    | cold      | 2139    | 0.418    | cold      |
| test262 3/10       | 2139    | 0.701    | cold      | 2139    | 0.690    | cold      |
| test262 4/10       | 2138    | 0.667    | cold      | 2138    | 0.688    | cold      |
| test262 5/10       | 2138    | 0.533    | cold      | 2138    | 0.545    | cold      |
| test262 6/10       | 2138    | 0.632    | cold      | 2138    | 0.686    | cold      |
| test262 7/10       | 2138    | 0.531    | cold      | 2138    | 0.412    | cold      |
| test262 8/10       | 2138    | 0.568    | cold      | 2138    | 0.562    | cold      |
| test262 9/10       | 2138    | 0.371    | cold      | 2138    | 0.323    | cold      |

### Same-job spread and dominant files

Derived observed spread below is the absolute difference between matched
job names in the two source runs. It is a conservative comparison floor,
not an isolated measurement of hardware variance: runtime keys differ,
some jobs change cold/warm state, the reviewed classifications change, and
property-file membership changes. Every job was measured once per commit;
no same-commit repeated sample was collected. A claimed difference smaller
than the matched job's observed spread is noise here, not improvement.
The full per-job elapsed tables permit the same comparison for every shard.

| Host  | Family            | Min spread min | Max spread min | Largest-spread job  |
| ----- | ----------------- | -------------- | -------------- | ------------------- |
| macOS | native support    | 0.08           | 16.55          | native support 5/12 |
| macOS | test262           | 0.35           | 16.53          | test262 5/10        |
| macOS | host C sanitizers | 3.68           | 4.22           | sanitizers native   |
| macOS | test              | 1.53           | 2.80           | test Node           |
| macOS | native            | 2.70           | 5.33           | native 2/3          |
| Linux | native support    | 0.78           | 13.57          | native support 2/4  |
| Linux | test262           | 0.28           | 3.93           | test262 7/10        |
| Linux | host C sanitizers | 5.92           | 5.92           | sanitizers all      |
| Linux | test              | 0.17           | 13.33          | test Node           |
| Linux | native            | 0.58           | 3.40           | native 2/3          |

The measured slowest macOS native-support job in both runs is shard 5/12:
source jobs `108409155582`
and `108457960771`. Its derived max/mean imbalance is reported above.
The measured long test durations in that shard are:

| Run         | Dominant source file                                   | Measured test ms | Derived min |
| ----------- | ------------------------------------------------------ | ---------------- | ----------- |
| 36243816479 | *tests/property/m5-object-own-keys.property.test.ts*   | 3565117.519      | 59.42       |
| 36243816479 | *tests/property/m5-reflect-namespace.property.test.ts* | 1263249.691      | 21.05       |
| 36261458909 | *tests/property/m5-object-own-keys.property.test.ts*   | 2578696.311      | 42.98       |
| 36261458909 | *tests/property/m5-reflect-namespace.property.test.ts* | 990989.023       | 16.52       |

On Linux, the measured slowest native-support job is shard 1/4 in both
runs. Source jobs `108409155547` and `108457960742` report measured own-key
test durations of 3,286,293.570 ms and 3,326,074.799 ms, respectively
(derived 54.77 min and 55.43 min); their measured Reflect durations are
1,283,650.209 ms and 1,307,274.984 ms (derived 21.39 min and 21.79 min).
These observations come from the same two run logs.

These are individual test observations in their named source files, not
an additive decomposition of shard wall time: Node executes files
concurrently, and competing files affect each other's duration. They identify
the own-key and Reflect property files as the work to inspect when balancing
shards. They do not establish a speedup between these commits.

### Harness object count and cross-job cache value

The test262 runner builds one harness object for each distinct combination of
harness sources, strictness, and specialization policy that a shard reaches,
and reuses it for every later case in the same process. Whether sharing those
objects between CI jobs is worth doing depends on how many distinct objects one
shard builds, which this section calls k, and on how much wall time removing
those builds recovers.

k is measured, not derived. Every reviewed test262 job prints
`test262-builds` with `objectsBuilt` and `objectsReused`, and the two baseline
runs agree exactly:

| Shard | k (objects built) | Reused |
| ----- | ----------------: | -----: |
| 1/10  |                96 |      0 |
| 2/10  |                96 |      0 |
| 3/10  |               116 |      0 |
| 4/10  |               128 |      0 |
| 5/10  |               128 |      0 |
| 6/10  |               108 |      0 |
| 7/10  |               109 |      0 |
| 8/10  |               112 |      0 |
| 9/10  |               116 |      0 |
| 10/10 |               108 |      0 |

The sum is 1,117 objects for the ten shards of one target, and the mean is
111.7. The same ten values appear in run [36243816479] and run
[36261458909], on `macos-aarch64` and on `linux-x86_64-gnu` alike, so k is a
property of the shard's reviewed path set rather than of the host. Shard 1/10
was also measured locally on Linux and built the same 96 objects.
`objectsReused` counts hits in the persistent object directory, and it is zero
in every job because that directory starts empty on a fresh runner. Later cases
in the same job still share each prepared object through the runner's own
promise map, which is why k is far below the number of split attempts.

k saturates well below the path count, because it is bounded by the harness
include vocabulary rather than by the corpus. The reviewed corpus of 21,383
paths uses 53 distinct combinations of the asynchronous flag and the ordered
include list, which bounds the whole corpus at 212 keys once the two
strictness modes and the two specialization policies are counted. Scanning the
pinned upstream suite at revision `f2d1435644797268dca1f7988cad5a4e89ccd8d2`,
excluding *intl402/*, *staging/*, and fixture files, finds 48,583 script files
carrying only 75 distinct combinations, so all of test262 is bounded at 300.
The measured growth matches that ceiling: a 101-path shard built 36 objects in
the harness-split measurement recorded above, and a 2,139-path shard of the
same corpus builds 96. Twenty-one times the paths yields 2.7 times the
objects.

Cold and warm shard wall times were measured on two hosts, at each host's own
pool size and again at 3. The reviewed runner sets its pool to
`min(8, availableParallelism())`, which the job logs report as 3 on the
`macos-15` runner and 4 on `ubuntu-latest`; the pool 3 rows model the macOS
runner's concurrency, and the Linux runner's pool of 4 was not reproduced. Cold
means that the host harness object directory was removed before the run; warm
means every object was reused. Each run executed the same shard 1/10, 2,139
reviewed paths, k of 96. The runtime archive and toolchain were already present
in every run in the table. Each host also ran one earlier warm-up with a cold
runtime archive and Zig cache, 432.98 s on Linux at pool 8 and 1,649 s on macOS
at pool 8; the macOS warm-up was 49 s faster than the table's cold run despite
starting colder, which is the spread these hosts show.

Both hosts ran the source of `e76e235b`, the commit this branch started from;
the macOS clone carried one patch, an explicit pool-size override, and nothing
else. Every run's log lines, the two hosts' environments, that patch, the
drivers, and the revision check are preserved under
[*docs/evidence/u4/*](./evidence/u4/README.md), along with the saturation and
key-churn scans below. `python3 docs/evidence/u4/summarize.py` recomputes this
table, the differences and per-object rates that follow it, and the two
projections built on them, from those logs; the object counts, the 300-key
ceiling, and the input-stability proportion it applies are constants sourced
elsewhere in this section rather than recomputed.

| Host               | Pool | Harness cache | Wall seconds           | Mean   |
| ------------------ | ---- | ------------- | ---------------------- | ------ |
| Linux, Ryzen 7700X | 8    | cold          | 410.40, 414.95         | 412.68 |
| Linux, Ryzen 7700X | 8    | warm          | 396.37, 429.29         | 412.83 |
| Linux, Ryzen 7700X | 3    | cold          | 646.21, 635.43, 651.63 | 644.42 |
| Linux, Ryzen 7700X | 3    | warm          | 623.72, 671.19, 599.78 | 631.56 |
| macOS, Apple M4    | 8    | cold          | 1698                   | 1698   |
| macOS, Apple M4    | 8    | warm          | 1635                   | 1635   |
| macOS, Apple M4    | 3    | cold          | 2052, 2343             | 2197.5 |
| macOS, Apple M4    | 3    | warm          | 2105, 2482             | 2293.5 |

The derived cold-minus-warm difference, computed before rounding, is -0.16 s
on Linux at pool 8, 12.86 s on Linux at pool 3, 63 s on macOS at pool 8, and
-96 s on macOS at pool 3. In two of the four configurations the warm runs were
the slower ones, so no configuration separates the cache from its own sample's
spread. The three warm Linux runs at pool 3 span 71.41 s, a wider range than
the 12.86 s the cache is credited with there. The four macOS runs at pool 3
ran consecutively and got monotonically slower, 2052, 2105, 2343, and 2482 s.
Host drift is the explanation these observations suggest, and it is not
established here; either way the cache effect is not separable from the 430 s
those four runs span.

One proportion in the same logs suggests why the saving is small, without
establishing it. Shard 1/10 performs 7,195 split attempts against 96 harness
objects, so harness preparation is 1.3 percent of the compile and link units
the shard starts, and a pool with other work to schedule can overlap it. The
earlier 101-path measurement in [*PLAN-GATE.md*](../PLAN-GATE.md) has 36
objects against 316 variants, a ratio nine times larger, which is the most
likely reason its relative saving was larger; that comparison is a hypothesis
about the mechanism, not a second measurement.

The Linux pool 3 figures use `taskset -c 0-2`, which `availableParallelism`
honors; every such run reported `pool=3`. That models the macOS runner's pool
on the Linux host; it is not the Linux runner's own pool of 4. The macOS pool
3 figures come from a throwaway clone whose runner was patched to accept an
explicit pool size. Neither host is a GitHub runner. The `macos-15` runner
completed the same shard in 1,890 s at pool 3 in run [36261458909], faster
than either local macOS pool 3 run, and this Mac mini's storage was 94 percent
full during the series. These hosts supply the inputs to the conditional
estimate below; they do not reproduce the runner.

The only two configurations with a positive difference give a per-object wall
saving of 0.656 s on macOS at pool 8 and 0.134 s on Linux at pool 3. Applying
the larger of those to the measured 1,117 objects of the ten macOS shards gives
a derived 733 s, or 12.2 min, for one complete CI run at the current workload.
That figure is an estimate conditioned on three assumptions: that the one
positive macOS pair measures the cache rather than the host, that every job
restores an exact hit, and that a GitHub runner behaves like this Mac mini. The
two baseline runs do not establish an improvement of this size either way:
their derived same-job spread for a macOS test262 shard ranges from 0.35 to
16.53 min, and each job was measured once per commit, so demonstrating a change
this small would need matched repeated measurements of the same job.

At the projected corpus of 41,091 paths the same rate gives a larger bound,
and the estimate above must not be carried over unchanged. Each shard would
select up to 4,110 paths instead of up to 2,139, and the upstream signature
count bounds a shard at 300 distinct keys, so ten shards are bounded at 3,000
objects and a derived 1,969 s, or 32.8 min, at the unrounded 63/96 s for each.
That is a bound rather than an expectation, because a shard covering a tenth
of the corpus need not reach every signature, and it rests on the same
per-object rate that two of the four configurations did not reproduce. It is
the figure that would justify revisiting U4, and revisiting it would need the
per-object saving confirmed on a runner first.

A cross-job cache does not hit on every run. The harness object key covers
*aube-lock.yaml*, every TypeScript source and manifest of the compiler,
backend, parser, CLI, and Unicode packages, the runtime assets in
*packages/runtime-c/*, the reviewed harness sources in *tests/test262/harness/*,
the target, the toolchain identity from `zig env`, and the compile flags. Over
the 79 first-parent steps on main ending at `e76e235b`, a measured 51 leave
every one of those inputs unchanged and 28 change at least one, a derived 64.6
percent. That is a historical input-stability proportion, not an observed cache
hit rate, and using it as one assumes the next run's key matches the previous
run's published entry. Every branch that changes the compiler misses until
its own first run publishes, and a GitHub Actions cache written on a branch is
not visible to other branches.

Object bytes were measured on the same shard; the transfer cost around them is
an estimate built from other caches. The 96 objects occupy a measured 239.4
MiB, with a mean of 2.49 MiB and a maximum of 6.47 MiB, and compress to 35.5
MiB with `tar | zstd -3`; the largest shard's 128 objects scale that to a
derived 47 MiB, or 49.6 MB. The M column above measures restoring the 306 MB
macOS mise cache in 10.52 to 19.61 s, a derived 15.6 to 29.1 MB/s, which puts
that 49.6 MB restore at a derived 1.7 to 3.2 s of transfer. Assuming
publication costs twice a restore and that the action overhead resembles the 2
s the R column shows for the runtime archive, a hit costs a derived 4 to 5 s
and a miss, which restores nothing but still publishes, a derived 5 to 8 s; ten
shards are then a derived 0.6 to 1.4 macOS min either way, aggregated before
rounding rather than from those whole seconds. Those assumptions are not
measured here, and a branch run measuring the action itself would replace
them. Scaling the compressed 35.5 MiB by the measured 1,117
objects of the ten shards and by the two targets, which assumes macOS objects
compress like these Linux ones, gives a derived 825 MiB, or 865 MB, for each
distinct key, against a measured 4.06 GB, a derived 3.78 GiB, of the 10 GB
repository limit already held in 69 entries, twelve of them mise tool caches of
297 to 425 MB. Whether that pressure evicts those entries, and what the
resulting reinstalls would cost, is an unquantified risk rather than a measured
cost.

The object byte measurement, with the exact compression invocation behind the
35.5 MiB, and the cache occupancy listing are preserved in
[*object-sizes.log*](./evidence/u4/object-sizes.log) and
[*cache-usage.log*](./evidence/u4/cache-usage.log). The objects measured are
`linux-x86_64-gnu`; no macOS object bytes were measured. The entry counts come
from a complete listing of the same cache state, which reports byte-for-byte
the same usage as the original observation; an earlier truncated listing of 8
of the 69 entries is why this paragraph previously named four mise caches.

Reproducing these observations:

~~~~ sh
# k for every shard of a CI run, from that run's job logs.
gh run view 36261458909 --json jobs \
  --jq '.jobs[] | select(.name | test("test262 "))
        | [.databaseId, .name] | @tsv'
gh api --allow-escape-sequences repos/dahlia/oseo/actions/jobs/JOB/logs \
  | grep -a 'test262-builds\|pool='

# Cold and warm shard wall time on the local host.
rm -rf "${XDG_CACHE_HOME:-$HOME/.cache}/oseo/harness-objects"
time mise run test:test262 --shard 1/10   # cold, prints objectsBuilt
time mise run test:test262 --shard 1/10   # warm, prints objectsReused

# Object bytes for one shard's cache directory.
find "${XDG_CACHE_HOME:-$HOME/.cache}/oseo/harness-objects" -name '*.o' \
  -printf '%s\n' | awk '{s+=$1} END {print NR, s}'

# Repository cache pressure.
gh api repos/dahlia/oseo/actions/cache/usage
~~~~

On macOS the cache directory is *~/Library/Caches/oseo/harness-objects*, which
`XDG_CACHE_HOME` does not redirect. The pool size follows
`availableParallelism`, so `taskset -c 0-2` gives a pool of 3 on Linux and
nothing in the checked-in runner sets an explicit pool on macOS.

The derived recovery for U4 at the current workload is therefore 12.2 macOS
min for a complete run on its most favorable assumptions, a derived 7.9 min if
the 64.6 percent input-stability proportion is taken as a hit rate, less a
derived 0.6 to 1.4 min of transfer paid on every run. Two of the four measured
configurations, including the one at the macOS runner's own pool size, show no
saving at all. That is below the 15 macOS min the unit set as its threshold, so
no cross-job harness object cache was implemented. The derived 32.8 min bound
at 41,091 paths is the condition under which that decision should be taken
again.

### Zig compilation cache sharing (U5)

U5 asks whether restoring the Zig global compilation cache between CI jobs
would save more macOS runner time than the transfer costs. The answer is do
nothing, but not because every variant loses: the two variants worth
considering are estimated to save a little more than they cost, and these
measurements do not establish an improvement from either one large enough to
justify implementing a cache that can serve a wrong entry. The unit leaves the
workflow unchanged, claims no runner-minute reduction, and triggered no branch
CI run. It replaces the cold-cache inference recorded under
[fixed cost and cache evidence](#fixed-cost-and-cache-evidence) with measured
cache contents.

The reason the prize is so small is not that the cache is small. It is that
Oseo's `zig cc` invocations are mostly not reproducible between runs: each
build stages its sources in a fresh temporary directory whose path reaches the
command line, so a second run of the same shard recomputes nearly every entry
instead of reusing it.

#### What a second identical run reuses

The series below ran `mise run test:test262 --shard 1/10` four times on the
Linux workstation against `linux-x86_64-gnu`, alternating an emptied and a
retained `ZIG_GLOBAL_CACHE_DIR`. It models a CI job by restoring the runtime
archive once and keeping it, as the runtime archive cache action does, and by
removing the harness object directory before every arm, because CI never
restores one. A competing gate ran throughout; the measured one-minute load
average at the start of the arms ranged from 12.97 to 18.59. Every arm executed
the same 2,139 reviewed paths and reported 1,831 passes, 162 expected
negatives, 146 unsupported profile features, and no failures.

| Arm    | Wall s | New *o/* entries | Cache KiB after | *o/* entries after |
| ------ | -----: | ---------------: | --------------: | -----------------: |
| cold 1 | 628.91 |           14,637 |       2,529,612 |             14,637 |
| warm 1 | 607.12 |           14,606 |       5,003,220 |             29,243 |
| cold 2 | 628.46 |           14,637 |       2,529,612 |             14,637 |
| warm 2 | 618.08 |           14,606 |       5,003,220 |             29,243 |

The two cold arms agree to 0.45 s and produce byte-identical cache sizes, and a
third cold run taken separately for the payload measurement reports 627.68 s
with the same 14,637 entries and the same 2,529,612 KiB, so the series is
reproducible rather than a single observation. Each warm arm began with every
one of the preceding cold arm's 14,637 entries present and still created 14,606
new ones. Taking both arms to issue the same number of cacheable invocations, a
warm run reuses a derived 31 entries, a derived 0.21 percent of them, and
roughly doubles the cache instead of reusing it.

This is the most favorable sharing case that can be constructed: the same
shard, the same commit, the same host, and a cache built by the immediately
preceding run. Cross-job sharing inside one CI run is strictly worse, because
shards select disjoint paths.

The derived cold-minus-warm difference is 16.08 s on derived means of 628.68
and 612.60 s, a derived 2.6 percent. The separately measured
`linux-x86_64-gnu` target-constant build below accounts for 8.66 to 8.96 s of
it, and the remainder is not separable from the load drift between arms. No
part of this difference is evidence for a cross-job cache, because a restored
cache would supply only the entries a warm local cache also supplies.

#### The other two native families

The test262 result is not uniform across the workflow, so the same comparison
ran on the other two native families.

The `native support` family, which is twelve of the macOS jobs, behaves exactly
like test262. One extended property shard reuses a derived 31 of 3,211 entries,
a derived 0.97 percent, and the pair is 381.42 s cold against 378.04 s warm, a
derived 3.38 s. Each arm was measured once. The shard is:

~~~~ sh
mise run test:property:extended:native:shard \
  --test-shard=1/12 tests/property/*.property.test.ts
~~~~

The `native` family, three of the macOS jobs, is the exception: it reuses most
of its entries. The competing gate finished between the first pair's arms, so
only the second pair is a usable wall-time comparison; both of its arms ran at
a measured one-minute load average of 1.42 and 1.29.

| Arm    |  Load | Wall s | New *o/* entries | Cache KiB after |
| ------ | ----: | -----: | ---------------: | --------------: |
| cold 1 | 16.44 | 504.08 |            1,547 |         910,068 |
| warm 1 |  2.06 | 407.63 |              345 |       1,708,688 |
| cold 2 |  1.42 | 430.11 |            1,500 |         902,632 |
| warm 2 |  1.29 | 396.26 |              345 |       1,701,252 |

The comparable pair reuses a derived 1,155 of 1,500 entries, a derived 77.0
percent, and its derived cold-minus-warm difference is 33.85 s of 430.11, a
derived 7.9 percent. Most of a native shard's wall time is execution rather
than compilation, so even a high reuse rate converts into a small wall saving.
This family is priced with the other options below.

The 31 entries that test262 and `native support` each reuse are the same small
set: the two target-constant libraries and the 29 C startup and libc objects
that the composition below classifies. Everything else in those two families is
per-case.

#### Why the entries miss

A separate probe compiled one harness translation unit twice with identical
bytes and identical flags except the staging directory the toolchain embeds,
the `-ffile-prefix-map=<working-directory>=/oseo/harness` argument that
*packages/toolchain-zig/src/index.ts* builds. Each staging path produced its own
cache entry, and the two *harness.o* outputs differed in SHA-256, so the
divergence is in the produced object and not only in the key. Repeating the
invocation in the same staging directory added no entry.

Harness objects stage under a `makeTemporaryDirectory("oseo-harness-")`
directory in *packages/compiler/src/native-fragments.ts*, and test262 cases and
native fixtures stage the same way, so this applies to the whole native build
path. Oseo's own harness object cache, measured under U4, is keyed by content
and therefore reuses objects that the Zig cache cannot.

#### What the cache holds

Classifying every *o/* entry of the cache one cold shard leaves, a measured
14,637 entries and 2,397,447,175 bytes, gives the following. The byte column is
each class's own measured total; the MiB column rounds it.

| Class                         | Entries |         Bytes |     MiB |
| ----------------------------- | ------: | ------------: | ------: |
| Per-case *case.o*             |   7,195 | 1,611,645,568 | 1,537.0 |
| Per-case *launcher.o*         |   7,195 |   347,167,712 |   331.1 |
| Per-case *harness.o*          |      96 |   251,047,640 |   239.4 |
| Per-case *generated.o*        |      64 |   150,883,120 |   143.9 |
| Agent objects                 |      56 |    22,621,936 |    21.6 |
| C startup and libc objects    |      29 |     1,329,435 |     1.3 |
| Zig target-constant libraries |       2 |    12,751,764 |    12.2 |

The 96 harness objects reproduce exactly the measured k of 96 that the harness
object section records for shard 1/10, which is an independent check that this
classification counts the same builds U4 counted.

The last two rows are the only entries whose inputs carry no staging path, and
they are 31 entries, a derived 0.21 percent of the entries and a derived 0.59
percent of the *o/* bytes. That is the same 31 that both the test262 and the
`native support` warm arms reused, so the reuse those two families get is
exactly this stable set and nothing else. Everything above those rows is
per-case.

#### Target-constant build cost and payload

Building *libcompiler\_rt.a* and *libubsan\_rt.a* for a target is the one cost a
fresh job pays that is the same in every job. It was measured by linking a
trivial C program with the exact flags the toolchain adapter builds, twice for
each target, against an emptied cache.

| Host and target             | Cold link s  | Warm link s  | Cache MiB / files | Compressed |
| --------------------------- | ------------ | ------------ | ----------------- | ---------- |
| macOS, `macos-aarch64`      | 4.20, 4.66   | 0.06         | 49 / 823          | 19.98 MB   |
| macOS, `linux-aarch64-musl` | 14.01, 14.77 | 0.10 to 0.11 | 78 / 2,999        | 25.38 MB   |
| Linux, `linux-x86_64-gnu`   | 8.66, 8.96   | 0.02         | 55 / 898          | 19.30 MB   |
| Linux, `linux-aarch64-musl` | 22.01, 23.15 | 0.02         | 77 / 2,999        | 22.89 MB   |

The macOS rows were measured on an Apple Silicon Mac over `ssh macbook-air`
with two trials for each target. Its compressed figures are `tar | gzip -6`,
because that host has no `zstd`; the Linux figures are `tar | zstd -3 -T0`.

Only `macos-aarch64` is paid by every macOS job. The `linux-aarch64-musl` row
is paid by the one macOS `native` job whose shard holds the cross-target
structural scenario in *tests/native/scenarios/shard-0.ts*.

#### Transfer cost from observed runner throughput

These come from the runner logs of run [36312192623]. The mise cache is the
largest payload those jobs move and gives the end-to-end rate a Zig cache would
see, since both are a `zstd` tarball moved by the same action. The `macos15`
and `macos26` runner images hold that cache under different keys and at
slightly different sizes.

| Observation         | Job          | Bytes       | Interval s | Derived MB/s |
| ------------------- | ------------ | ----------- | ---------- | ------------ |
| mise cache restore  | 108600171379 | 306,078,528 | 9.885      | 30.96        |
| mise cache restore  | 108600171403 | 306,078,528 | 11.085     | 27.61        |
| mise cache restore  | 108600171460 | 306,078,528 | 11.983     | 25.54        |
| mise cache restore  | 108600171522 | 306,192,714 | 6.211      | 49.30        |
| mise cache save     | 108600171356 | 306,192,714 | 22.763     | 13.45        |
| runtime archive hit | 108600171403 | 3,257,528   | 0.952      | latency      |
| runtime archive hit | 108600171460 | 3,257,528   | 1.584      | latency      |

Restore intervals run from the `Cache hit for:` line to the action's own
completion, which is `Cache restored successfully` for the mise rows and
`Cache restored from key` for the runtime archive rows, so they include
download, `unzstd` and `gtar`. The nonzero network rates the mise
intervals report range from 32.0 to 154.4 MB/s; the end-to-end rate is lower
because decompression and extraction dominate. The save row's own log does not
state the size of the entry it wrote; that byte count is the same `macos26` key
measured when job 108600171522 restored it. The two small runtime archive hits
show what a restore costs when transfer is negligible, 0.952 and 1.584 s, which
is the per-step overhead any added cache pays.

#### The three options, priced

Sharing the whole cache. One shard's cache is a measured 2,529,612 KiB and
compresses to a measured 292,789,226 bytes. At the measured restore band that
is a derived 5.9 to 11.5 s for each job, and the save is a derived 21.8 s at
the derived save rate. Against that, a warm cache reuses a derived 0.21
percent of entries. The restore alone costs more than the 4.20 to 4.66 s
target-constant build it would skip, and the per-case bulk it carries is not
reused. Storage forbids it independently: the 27 macOS shard keys alone are a
derived 7.91 GB for each commit, and with the 19 Linux keys a derived 13.47 GB,
against a measured 4,058,176,690 active bytes already held in 69 entries of the
10 GB repository limit, a derived 5.94 GB of headroom. Neither set fits. A
single shared key cannot substitute, because shards compile disjoint cases and
whichever job saved first would define the entry; three macOS jobs in run
36312192623 already log `Failed to save: Unable to reserve cache with key` for
the one runtime archive key, because they raced to publish it.

Caching only the target-constant part. This is exactly keyable on the Zig
version, the target and the flags, and it carries no per-case content, so it is
the only option that is safe to key. Its payload is a measured 19.98 MB, a
derived 0.41 to 0.78 s of transfer, plus the measured 0.952 to 1.584 s of
per-step overhead, so a hit costs a derived 1.36 to 2.37 s to save a measured
4.20 to 4.66 s. The net is positive, a derived 1.83 to 3.30 s for each of the
27 macOS jobs that select Zig, a derived 0.83 to 1.49 min for a whole run, and
a miss pays a derived 1.49 s of save instead of saving anything. Against the
derived macOS family totals of 764.12 and 795.45 min recorded earlier in this
file, that is a derived 0.10 to 0.19 percent.

Caching only the `native` family, the one that reuses. One native shard's cache
is a measured 902,632 KiB, a derived 104.5 MB compressed at the ratio the
test262 payload measured, so a restore is a derived 2.1 to 4.1 s plus the same
per-step overhead against a derived 33.85 s saving. That leaves a derived 28.18
to 30.78 s net for each job. There are only three macOS `native` jobs, so a
whole run gains a derived 1.41 to 1.54 min net, or a derived 0.91 to 0.99 min
once the 64.6 percent input-stability proportion recorded for U4 is applied as
a hit rate. Against the same family totals that is a derived 0.18 to 0.20
percent before the hit-rate discount and a derived 0.11 to 0.13 percent after
it.

Two of the 29 macOS jobs are excluded from the 27 above, and one of the 20
Linux jobs from the 19: the `host C sanitizers` jobs set
`OSEO_NATIVE_TOOLCHAIN=host-cc` and select Apple Clang or the host GCC, so no
Zig cache reaches their work.

#### Result

Do nothing. Neither positive option is established well enough to act on. The
derived same-job spread for a macOS test262 shard is 0.35 to 16.53 min,
recorded earlier in this file, and although that spread describes one job
rather than a whole run, a derived 0.83 to 1.49 min for the target-constant
option or a derived 1.41 to 1.54 min for the `native` option is small beside
it. Both also rest on a restore band and a per-step overhead measured from a
different cache rather than from the one being proposed. These measurements
therefore do not establish a runner-level improvement large enough to justify
implementing either cache. The
`native` option additionally rests on a wall saving measured on this Linux host
rather than a macOS runner and on a compressed payload that is derived rather
than measured. Against that, each option adds a cache entry that can be
restored wrongly, and the whole-cache option loses outright while exceeding the
repository cache limit.

The condition for revisiting is therefore a change in the staging paths, not a
change in the cache. The same paths that defeat the Zig cache between jobs
defeat it inside a single job, which is why one shard writes a measured 2.41
GiB of which it reuses a derived 0.21 percent of the entries on a repeat.
Making the invocations path-independent would be a change to the compiler's
staging, not a CI cache. How far that would raise the reusable fraction of the
other families is not measured here; the `native` family's derived 77.0 percent
shows only what is reachable where the staging path happens not to reach most
of the command lines. This unit measured that boundary rather than crossing
it.

The preserved sources are in [*docs/evidence/u5/*](./evidence/u5/README.md).

### Reproducing the CI measurements

Retrieve main runs, retaining failed and cancelled runs when reproducing the
execution series, and read the reviewed count from each commit rather than
using the current checkout:

~~~~ sh
gh run list --repo dahlia/oseo --branch main --limit 100
run_id=36261458909
sha=$(gh run view "$run_id" --repo dahlia/oseo --json headSha \
  --jq .headSha)
git show "$sha":tests/test262/results.yaml > /tmp/r.yaml
node --input-type=module - <<'JSCOUNT'
import { readFileSync } from "node:fs";
import { parse } from "yaml";
const s = parse(readFileSync("/tmp/r.yaml", "utf8")).summary;
console.log(s.passes + s.expectedNegatives +
  s.unsupportedProfileFeatures);
JSCOUNT
gh run view "$run_id" --repo dahlia/oseo --json headSha,jobs
gh api repos/dahlia/oseo/actions/jobs/108457960771
gh api "repos/dahlia/oseo/actions/runs/$run_id/logs" > /tmp/run.zip
~~~~

Use the job IDs returned by each run, match full job names across samples,
and inspect both cache-restore messages and nested action durations in the
zip logs. The source jobs retain the expanded shard file list and the test
observations. API timestamps have second resolution; nested log timestamps
and durations have finer resolution, but normalized rates remain derived
allocations with the startup limitation stated above.

### Native case runtime profile (U11 Phase A)

U11 profiles the ordinary policy at `8e8b6766` without changing runtime or
compiler sources. Diagnostic wrappers and compact outputs are preserved in
[*evidence/u11/README.md*](./evidence/u11/README.md). Every sanitized run
requests the same `-fsanitize=address,undefined` flags as the Zig gate and uses
only `ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-native-case-runtime-cost`.
Runtime objects retain `-O2`; generated C retains the gate's flags. Dependency
installation and `mise run build` are outside native execution measurements.

The ordinary allocator does not trigger collection after an allocation count
or live-heap threshold. *runtime\_core.c* sets `collect_every_safepoint` only
when `OSEO_GC_EVERY_SAFEPOINT` is present; *runtime\_memory.c* and other
safepoints collect conditionally on that field. Without the override,
`oseo_context_destroy` collects at teardown. The profiles below count every
collection directly, without enabling specialization observation.

The case is upstream
*test/built-ins/TypedArray/prototype/copyWithin/coerced-values-end-detached.js*,
with its original 10,000-element array, non-strict mode, and specialization
enabled. The reviewed TypedArray harness exercises several constructor-argument
factories, including ordinary arrays and array-like objects. It repeatedly
fills and copies those large property vectors before reaching the detachment
assertion. The same source passes in the profiled and ordinary executions.

`oseo_internal_own_property_index` scans every property's key until it finds
a match or exhausts the vector. A growing dense vector therefore makes
repeated insertion and iteration quadratic in its element count. Inclusive
lookup CPU and key-comparison counts distinguish that work from collector
tracing. This is category (b), a per-element property slow path, rather than
category (a), an allocation-trigger policy. The array size is required security
evidence; quadratic key lookup is an implementation cost.

Measured native process CPU seconds and counts from the named profile runs in
*evidence/u11/measurements.json.txt* follow. CPU uses `clock()` inside the
executable; the collector column includes teardown collection. Lookup CPU
includes profiler overhead. Each accepted profile is measured once.

| Run        | Workload                                                  | Native CPU s | Collector CPU s | Lookup CPU s | Collections | Allocation attempts |
| ---------- | --------------------------------------------------------- | -----------: | --------------: | -----------: | ----------: | ------------------: |
| `profile3` | Original security case, one variant, gate flags           |   107.299830 |        0.275869 |    95.770142 |           1 |          12,983,881 |
| `nosan1`   | Same case and profile, sanitizer flags removed as control |    54.145868 |        0.211097 |    43.263758 |           1 |          12,983,881 |
| `shard2`   | Reviewed shard 3/200, all variants, gate flags            |     2.784129 |        0.068596 |     0.606263 |         370 |           2,903,620 |

Derived from `profile3`: collection is 0.2571 percent of process CPU,
lookup is 89.2547 percent, and non-collector CPU is 107.023961 s.
The measured lookup splits into 47.160606 s for hits and 48.609536 s for
misses. The observed 12,880,590 lookups perform 14,447,751,233 key comparisons;
14,329,854,054 are on objects with at least 1,000 properties, a derived
99.184 percent. The unsanitized control has identical counts and is a derived
1.982 times faster in process CPU. It explains instrumentation cost and proposes
no sanitizer change. Removing collection entirely could save at most the
measured 0.276 s from this profile, and would violate the runtime contract.

The accepted fine shard contains a measured 107 paths, with 93 passes,
8 expected negatives, 6 unsupported results, and no failure or retry. All
370 native executions have a captured profile; canonical serialized records
match the checked-in manifest exactly. The runner uses one execution slot to
keep attribution serial. The three security cases are absent from this sample.
Measured summed native elapsed intervals are 4.370522 s; summed process CPU is
2.784129 s. The two quantities include different startup/completion costs and
are not interchangeable. Derived collector and lookup shares of native CPU
are 2.4638 and 21.7757 percent. No comparison in this sample involves an object
with at least 1,000 properties.

This sample estimates collector share in ordinary reviewed work; it does not
measure a whole-corpus total or the unreviewed remainder. Its zero large-vector
comparisons give no basis for multiplying the exceptional three-path cost by
41,091. The same linear lookup exists throughout the runtime, but its quadratic
large-vector cost is workload-dependent. The known three paths remain the
measured concentration from U10; neither U10 nor this fine sample establishes
a corpus-wide saving from a property-lookup optimization.

Measured execution and command times from the same artifact follow. Native
elapsed is the process launch/completion interval; command wall/user/system
include compile/link and wrapper work. Runtime compilation requests the gate
flags in every sanitized row. All rows use the shared, already populated Zig
lane. The cold/warm column describes only the relevant Oseo cache entries.

| Run         | Oseo cache                           | Native elapsed s | Command wall s | User s | System s |
| ----------- | ------------------------------------ | ---------------: | -------------: | -----: | -------: |
| `profile3`  | Cold revised profile archive/harness |          107.716 |         126.20 | 115.77 |    10.77 |
| `shard2`    | Warm profile archive/harness         |            4.371 |          65.71 |  56.56 |    38.06 |
| `nosan1`    | Cold explanatory-control namespace   |           54.409 |          65.19 |  56.02 |     9.64 |
| `baseline1` | Cold ordinary namespace              |           90.136 |         108.86 | 105.49 |     3.43 |
| `baseline2` | Warm ordinary namespace              |           90.121 |          91.33 |  90.65 |     1.00 |

Both ordinary case runs pass with empty output. Their native intervals agree
within a derived 0.016 s; the command-time reduction is cache preparation, not
a runtime improvement. The profile interval exceeds their mean by a derived
19.5 percent. Counts and timers add work, so the profile's inclusive lookup
share and hit-time ceiling are diagnostic quantities, not measured potential
savings in an uninstrumented gate. The fine shard's CPU percentages likewise
estimate attribution under profiling; timing overhead affects its denominator.
No cold Zig measurement or before/after runtime comparison is claimed.

Phase B was stopped at the required coordinator decision. The coordinator
authorized a Phase A-only commit and deferred the guarded-slot proposal
because it would add hot-path semantic risk while M5c is about to own the
runtime. The measured successful-lookup CPU gives a derived 43.952-percent
ceiling on that proposal for this one variant; its estimated practical saving
was 25–40 percent, not an observed improvement. No runtime experiment or CI
configuration change was approved or made.

A proper indexed element representation is the lossless runtime lever: it
would preserve the large security arrays while avoiding repeated linear key
searches. Its CI value grows if further large-array cases enter the corpus;
this sample supplies no count or cost for those future cases. Collector
trigger changes do not address the measured bottleneck. This unit claims zero
recovered CI capacity and leaves runtime design to its owning work.

macOS was not measured, as the coordinator explicitly allowed after Phase A.
All timings here are local Linux observations on the shared host described in
*evidence/u11/host.log*. They are not macOS estimates. Reviewed paths, variants,
manifests, revision pins, classifications, sanitizer flags, targets, and
property budgets remain unchanged.

### Reviewed test262 runner scaling (U13 Phase A)

U13 asks why 2.7 times the reviewed execution pool buys only 1.2 to 1.5 times
the throughput. The unit's opening hypothesis was that per-case parsing,
lowering, and C generation run on the Node.js main thread while only the
native build and run are parallel. That hypothesis is refuted. Frontend,
lowering, and C emission are a measured 2.5 to 3.2 s of a 43.3 s main-thread
CPU budget. The serial cost is per-execution work the runner repeats
identically for every native execution: rereading the whole C runtime source
set, hashing it into a runtime-archive key, and starting one extra process to
identify the toolchain.

Scripts, the measurement-only instrumentation patch, and the compact outputs
are preserved in [*evidence/u13/README.md*](./evidence/u13/README.md), with
the host in *evidence/u13/host.log*. Every run used only
`ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-test262-serial-bottleneck` and
reproduced the checked-in manifest shard exactly. No reviewed path, variant,
mode, target, sanitizer flag, retry policy, or verdict was changed, and
nothing in this section is a repository change.

The workload is the reviewed shard 1/100, a measured 214 paths and 730 native
executions. All rows are means of at least two runs on one shared Linux host;
per-run values and host load are in *evidence/u13/measurements.txt*. The
`cpus` column is a `taskset` restriction on the whole process tree, which
models a small CI runner because the compiler subprocesses are restricted
too. Unrestricted rows vary the pool directly on 16 logical CPUs. Node CPU is
the runner process's own user plus system seconds; tree CPU adds every child.

| CPUs | Pool | Measured wall s | Measured runner s | Measured node CPU s | Measured tree CPU s |
| ---- | ---- | --------------- | ----------------- | ------------------- | ------------------- |
| 16   | 1    | 122.9           | 115.2             | 46.9                | 174.6               |
| 16   | 3    | 55.0            | 48.5              | 45.9                | 179.2               |
| 16   | 8    | 45.9            | 39.6              | 48.3                | 192.8               |
| 16   | 16   | 49.4            | 42.7              | 51.7                | 205.9               |
| 3    | 3    | 64.1            | 57.8              | 42.2                | 151.4               |
| 4    | 4    | 53.8            | 47.7              | 42.4                | 155.3               |

Eight times the pool gives a derived 2.68 times the throughput, and sixteen
times gives 2.49. Fitting Amdahl's law against the measured pool 1 wall time
gives a derived serial fraction of 0.171 at pool 3, 0.284 at pool 8, and 0.362
at pool 16. A fraction that grows with the worker count is the signature of a
fixed single-threaded resource rather than a constant serial share. The
measured node CPU identifies it: it stays within 42.0 to 52.8 s across every
configuration from pool 1 to pool 16 and from 3 CPUs to 16, while wall time
falls from 122.9 to 45.9 s. At pool 8 the runner process consumes a measured
48.3 CPU s in a 45.9 s run, so it holds slightly more than one core
continuously. The implied serial fraction is a derived 0.382, and the
predicted floor of 46.9 s matches the measured 45.9 s minimum.

The same table explains the unit's opening observation. Raising the pool from
3 to 8 on a large host is a derived 1.20 times, which sits inside the 1.2 to
1.5 times band observed on the Apple M4. A 3-core runner reaches 64.1 s where
the same host at pool 3 with 16 CPUs available reaches 55.0 s, so the two
regimes differ: on a large host the single runner process is the constraint,
and on a 3-core runner total CPU is.

Main-thread CPU was attributed with `--cpu-prof` on one pool 8 run, giving a
measured 43.34 s of sampled self time. The heaviest entries are in
*evidence/u13/cpu-profile-top.txt*.

| Main-thread work                                  | Measured self s | Derived share |
| ------------------------------------------------- | --------------- | ------------- |
| `spawn` in *node:internal/child\_process*         | 15.26           | 35.2%         |
| Runtime-archive key: hash, `TextEncoder`, SHA-256 | 11.88           | 27.4%         |
| YAML parsing of the reviewed subset and manifest  | 3.42            | 7.9%          |
| Garbage collector                                 | 1.79            | 4.1%          |
| Idle                                              | 1.76            | 4.1%          |
| Frontend, lowering, and C emission (instrumented) | 2.78            | 6.4%          |

Three measured facts name the repeated work. The C runtime is 47 files and
3,350,652 bytes. `executeNativeWorkflow` reads all of it, stringifies it, and
SHA-256 hashes it once per native execution, so one 214-path shard performs a
derived 2.446 GB of rereads and 730 identical key computations. It also starts
one `zig env` process per execution purely to identify the toolchain, a
measured 730 of the at least 2,190 process starts the instrumentation
observed. Every start is charged to the main thread, and the runner's measured
peak resident set is about 1,010 MiB, which is what makes each one expensive.

Per-execution costs are cleanest in the uncontended pool 1 run, where nothing
overlaps. Every interval below is elapsed time around an awaited operation,
not processor time: the identity probe's interval is mostly a child process,
and the key's interval is hashing plus its awaited digest. The archive key is
a measured 17.21 ms per execution and the identity probe a measured 9.39 ms,
against a measured 154.2 ms of runner time per execution. The two together are
a derived 17.3 percent of fully serialized per-execution elapsed time. By
contrast the body compile is a measured 0.57 ms, harness fragment emission
2.41 ms, and case parsing 0.24 ms. Processor time for the same work is
attributed separately by the profile above: the key group's 11.88 s of
main-thread self time is measured, a derived 27.4 percent of the sampled
total, and the identity probes are a derived 11.7 percent of it. That second
figure applies their 730 of the observed 2,190 process starts to the measured
`spawn` self time, which assumes every start costs the same. The profile does
not separate an identity-probe start from a build or an execution start, so
that assumption is unverified. It is plausible because the dominant term in a
start is copying the parent's page tables, which does not depend on the
child.

Both values are invariant within one runner process: the runtime sources, the
target, the captured toolchain environment, and the toolchain identity do not
change between executions of one run. Computing them once per process would
therefore produce byte-identical keys, the same cache lookups, the same build
plans, and the same executions. The ordinary `oseo` CLI performs exactly one
execution per process, so it would observe no change at all.

Two estimates bound the saving, and both rest on an assumption this
instrumentation does not establish. The first assumes the 26.60 ms of removed
elapsed work per execution is also 26.60 ms of processor time somewhere in the
tree, which is only true to the extent that the probe's child and the hashing
actually occupy a processor. On that assumption, removing a derived 19.4 s of
tree CPU per 214-path shard lowers the CPU floor on a 3-core runner from a
derived 50.5 to 44.0 s and on a 4-core runner from 38.8 to 34.0 s. Holding the
measured ratio of wall time to that floor constant estimates 55.9 s on 3 CPUs
and 47.1 s on 4, a derived 12.4 to 12.8 percent. The second uses the profile's
main-thread attribution instead, and inherits the equal-cost-per-start
assumption above: on a large host, where the runner process is the binding
constraint, the profile removes a derived 39.2 percent of main-thread CPU,
which estimates 31 to 36 s against the measured 45.9 s at pool 8, a derived
22 to 33 percent. These are estimates from the measured
decomposition, not an observed before-and-after. The Phase B section below
replaces them with a measured result.

Applying the 12.4 to 12.8 percent small-runner estimate to the measured CI
series gives the derived figures below. The macOS row uses the measured
10-shard execution-step sums already recorded above, which exclude job setup
and cleanup. The Linux row uses measured 10-job family totals, because this
document does not separate the Linux test262 execution step from its job fixed
cost; its saving is therefore stated only as a percentage of the execution
portion. The 41,091-path column scales the measured per-path rate by a derived
1.922 and assumes the same per-path cost, which the corpus has not
demonstrated.

| Host  | Measured current s, 21,383 paths | Derived saving, 21,383 paths | Derived saving, 41,091 paths |
| ----- | -------------------------------- | ---------------------------- | ---------------------------- |
| macOS | 16,159 to 18,935 execution       | 2,000 to 2,420 s             | 3,850 to 4,650 s             |
| Linux | 8,447 to 11,544 whole job        | 12.4 to 12.8% of execution   | 12.4 to 12.8% of execution   |

Cold and warm Oseo caches were separated at pool 8 with a fresh
`XDG_CACHE_HOME`. A cold object and archive cache measured 46.0 s and the two
warm runs 42.9 and 42.7 s, a derived 7.2 percent. The lane Zig cache was
populated in both, so this separates only the Oseo harness objects and runtime
archives. Fixed per-run cost, measured as wall time minus the runner's own
duration, is 6.3 s on the 3-core configuration and is not a per-path cost.

Two further observations are recorded without a proposal. The summed
runtime-asset read interval grows from a measured 3.3 s at pool 1 to 260.3 s
at pool 16 while the work is unchanged, which is queueing on the default
four-thread libuv pool. Reading the checked-in manifest costs a measured 3.4 s
of YAML parsing per run regardless of shard size, which matters only for small
shards.

### Reviewed test262 prepared runtime (U13 Phase B)

Phase A named two per-execution costs that one runner process repeats without
ever producing a different answer: rereading and rehashing the C runtime into a
runtime-archive key, and starting one `zig env` process to identify the
toolchain. Phase B derives both once per process and reuses them.

The contract change is explicit rather than ambient. `prepareNativeRuntime`
is a new public entry point in `@oseo/cli` that reads the runtime assets,
identifies the toolchain, pins the executable that identity describes, and
derives the archive key, once for one host, toolchain, target, and runtime
provider. `runNativeUnits` takes the result as a new optional argument and
then performs no per-execution runtime read, identity probe, or key
derivation. A caller that passes nothing behaves exactly as before, so
`runNativeCli`, the published CLI, the testkit native workflow, the native
fixtures, and the property suites are unchanged. Only the reviewed test262
fragment executor passes a prepared runtime, and it derives it from the same
initialization that already builds the harness object key.

Two properties make the reuse safe, and both are enforced rather than
documented. First, the prepared snapshot is the only source of runtime bytes:
every build that uses a prepared runtime stages the snapshotted contents, so
the bytes compiled and archived are always the bytes hashed into the key, and
a runtime file edited after preparation is neither read nor compiled. A test
edits a runtime file after preparation and asserts that the staged bytes and
the archive key are still the snapshot's, and that preparing again derives a
different key. Second, the compiler is pinned. `prepareNativeRuntime` asks the
toolchain which executable its identity output describes, resolves that path to
its real location, fingerprints every watched path, repeats the identity probe
through the resolved executable, and fingerprints again, accepting the
preparation only when the repeat names the same executable and the same
watched paths and nothing moved around it; a single probe would otherwise
leave a window in which a replacement pairs a new compiler with an old
identity, and accepting a repeat that watched different paths would record an
identity describing a directory nothing rechecks. The fingerprint compares the
inode change time as well as the device, inode, size, modification time, and
resolved path, so an in-place rewrite that restores the size and the
modification time is still caught; a host that cannot report a change time
refuses to prepare rather than comparing the weaker set. Every build of that
preparation then invokes the resolved path rather than a search-path name, and
the fingerprints are rechecked after validation, after the archive cache lock
is acquired, immediately before the compiler runs, and once the build has
finished, before any artifact it produced is executed or published. The harness
object build uses the same pinned path and the same checkpoints. A mismatch
raises and is propagated rather than falling back to a build without archive
reuse, so a compiler replaced in place, or a reported path repointed at a
different file, cannot build, run, or publish under the previous compiler's
key. Tests cover a replaced, a relinked, and a removed compiler, one rewritten
in place with its size and modification time preserved, a confirming probe that
names different watched paths, a host that reports no change time, one swapped
inside the confirming probe, one swapped during the lock wait, and one swapped
during the build with an archive published, with an archive already cached, and
with archive reuse disabled, plus an uncached harness object whose pin fails at
each of its three checkpoints. A toolchain that cannot name its executable, or
a host that cannot fingerprint files, refuses to prepare rather than reusing an
unpinned identity.

What a prepared runtime checks, and when, is worth separating. At preparation
the identity is taken twice and bracketed by fingerprints, as above. At every
later use `runNativeUnits` compares the execution's compiler host, toolchain,
target, captured environment snapshot, runtime ABI version and runtime asset
set against the recorded ones, and re-fingerprints the watched paths; it does
not probe the identity again. A search path that later resolves to a different
installation therefore does not change what a prepared runtime builds with,
because the pinned executable keeps being used, while an unprepared execution
would pick up the new one. In the other direction the fingerprints catch a
rewrite of the pinned executable that unchanged identity output alone would
miss.

One limitation is shared with the per-execution path rather than introduced
here. A watched library directory is fingerprinted as a directory, and the
archive key hashes the toolchain's identity output rather than its library
tree, so an in-place edit to a file beneath that directory which leaves
`zig env` output unchanged is observed by neither path. That belongs to the
runtime-archive key itself and predates this unit;
[*PLAN-GATE.md*](../PLAN-GATE.md) records it as a candidate follow-up.

Each recheck is one `realpath` and one `stat` per watched path, with no
process start. The inode change time the comparison
includes comes out of that same stat, so it costs no extra call. Measured on
the same host, four rechecks of the two paths the Zig identity reports cost
59.8 to 64.2 ms for a whole 730-execution shard, a measured 0.082 to
0.088 ms per execution, against the per-execution saving below. Its cost is a
derived 0.5 to 0.6 percent of that saving. The figures are in
[*evidence/u13/pin-recheck-cost.txt*](./evidence/u13/pin-recheck-cost.txt).

A prepared runtime also records the host, toolchain, target, environment
snapshot, ABI version, ordered asset set, and a digest of the asset contents
it came from, taking immutable copies of the target, its sanitizer list, the
environment variables, the ABI version, and each asset's location before any
await. `runNativeUnits` compares those against the execution's own inputs and
raises `PreparedNativeRuntimeMismatchError` on any difference, after removing
the temporary directory and before any build plan is created. Hosts and
toolchains are compared by identity, so a host that would read different
runtime bytes and a toolchain with different flags are both refused. Package
tests cover a rejected host, toolchain, target, sanitizer list, asset
location, environment snapshot, and runtime provider, and assert that no build
plan was created in any of them. Two further tests run the same units with and
without a prepared runtime, against both a missing and a published archive,
and assert that the result, the archive key, the cache lookups, the written
artifacts, and the build plan are identical apart from the pinned compiler
path, that the prepared execution reads no runtime asset and starts no
identity probe, and that preparing reads exactly the assets one per-execution
workflow reads. The existing Zig identity-probe retry test is unchanged and
still passes: it uses `runNativeCli`, which never takes a prepared runtime.

Before and after were measured on the same 214-path reviewed shard on one
Linux host, with the whole process tree restricted by `taskset` to the CI
runners' core counts, on an uninstrumented tree. Before is `98e66719`; every
source this unit changes under *packages/* and *tools/* is checked out and
rebuilt between arms, because the runner loads several of those packages from
their built output. Both arms run inside one session, which alternates them
once per repetition rather than run by run: a repetition runs all six of one
arm's runs and then all six of the other's. Each arm has four warm and two
cold runs per core count. Cold empties the Oseo object and archive cache; the
lane Zig cache stays populated throughout, so this separates only the Oseo
caches. Per-run values are in
[*evidence/u13/before-after.txt*](./evidence/u13/before-after.txt).

| CPUs | Cache | Measured before s | Measured after s | Derived change | Derived tree CPU change |
| ---- | ----- | ----------------- | ---------------- | -------------- | ----------------------- |
| 3    | warm  | 57.13             | 44.40            | -22.3%         | -16.0%                  |
| 3    | cold  | 68.58             | 56.39            | -17.8%         | -12.1%                  |
| 4    | warm  | 47.80             | 35.23            | -26.3%         | -15.6%                  |
| 4    | cold  | 56.33             | 44.77            | -20.5%         | -12.4%                  |

The host's one-minute load stayed between 1.3 and 5.6 across the session, and
the widest spread inside any arm is a derived 1.28 s, far under the effect.
Pairing each run against the run of the other arm at the same core count,
cache state, and repetition gives derived means of 17.8 and 20.5 percent cold
and 22.3 and 26.3 percent warm at three and four cores, and all twelve pairs
are reductions, from a derived 16.9 to 26.9 percent. Host drift is reduced but
not controlled, because the two runs of a pair are minutes apart rather than
adjacent.

The saving is a derived 15.8 to 17.4 ms of wall time per native execution
across the four arms, each arm's measured difference divided by its 730
executions, against the Phase A measurement of 26.60 ms of removable elapsed
work per execution. It exceeds the Phase A estimate of 12.4 to 12.8 percent
because that estimate assumed only the CPU floor moved, while the runner
process's single thread was also releasing the pool earlier.

Applying the measured 17.8 to 26.3 percent band to the measured macOS
execution-step sums of 16,159 to 18,935 s at 21,383 paths estimates 2,876 to
4,980 s, a derived 47.9 to 83.0 min per run. At 41,091 paths the same per-path
rate estimates a derived 92.1 to 159.5 min. Those estimates were made on a
Linux host restricted to three and four cores, not on a GitHub macOS runner.
One branch CI run has since measured the change, and the paragraphs below
record it. An earlier branch run, 36451319573 on `f483a129`, was cancelled by
the coordinator about three minutes in, after a review of that commit found the
two cache-safety defects this section's pinning and snapshot-bytes rules now
close; every test262 job was stopped during setup, so it produced no step time.

Branch run [36496566681] on `390cf60d` succeeded in all 58 jobs and is
compared here against main run [36369711059] on `98e66719`, the same twelve
shard totals on both hosts. Both runs were measured once. Per-shard values are
in [*evidence/u13/ci-comparison.txt*](./evidence/u13/ci-comparison.txt),
produced by *evidence/u13/ci-compare.py* from each run's measured job and step
timestamps.

| Host  | Measured before s | Measured after s | Derived change | Derived saving |
| ----- | ----------------- | ---------------- | -------------- | -------------- |
| macOS | 17,878            | 14,018           | -21.6%         | 64.3 min       |
| Linux | 12,130            | 9,664            | -20.3%         | 41.1 min       |

Those are the sums of the twelve `Run mise run test:test262 --shard N/12`
steps, which exclude job setup and cleanup. The corresponding family job-minute
totals fall from a measured 308.37 to 243.10 min on macOS, a derived 21.2
percent, and from 206.42 to 165.20 min on Linux, a derived 20.0 percent. Both
land inside the 17.8 to 26.3 percent band measured locally, and the macOS
saving lands inside the estimated 47.9 to 83.0 min.

One run per side cannot separate that from runner variance, and the per-shard
numbers show why: individual test262 shards move between a derived -53.1 and
+12.4 percent. The families this change does not touch moved in the same pair
of runs too, by a derived -18.9 percent (Linux host C sanitizers), -17.3 and
-15.0 percent (the `test` families), -11.8 percent (macOS native), and +8.7,
+2.2 and +1.8 percent (Linux native and both native-support families). What
the run establishes is that all 58 jobs succeeded and that the change is
consistent with the local measurement in direction and rough size on both
hosts; it does not on its own measure the saving to the precision of the local
before-and-after, and it cannot show the absence of a regression in any
individual job, several of which took longer than their counterpart.

Native support and property native executions do go through the same shape of
per-execution work, through `packages/testkit`'s own native workflow rather
than through `@oseo/cli`. One measured run of
*tests/property/m5-array-buffer.property.test.ts* starts 24 native executions
and exactly 24 `zig env` identity probes, one per execution, alongside 24
`zig cc` builds. At the Phase A per-execution figure that file holds a derived
0.64 s of removable serial work against a measured 18.42 and 19.29 s of clean
wall time, a derived 3.4 percent. The share is much smaller there than in the
reviewed test262 runner because each of those executions compiles and links a
whole program, while a reviewed test262 execution links against an already
built harness object and a cached runtime archive, so the per-execution
constant is a far larger fraction of it. Those lanes are a different function
and were deliberately left unchanged in this unit.

Reviewed paths, variants, strictness modes, specialization policies, targets,
sanitizer flags, retry policy, verdicts, result order, budgets, and timeouts
are unchanged, and the run reproduces the checked-in manifest shard exactly in
every measured run above.

[36496566681]: https://github.com/dahlia/oseo/actions/runs/36496566681

### Reviewed test262 process starts (U14 Phase A)

U14 asks what the reviewed runner now spends on starting processes, and
whether any of it can be removed without changing what is executed or proven.
The answer is that it is the largest remaining main-thread cost on Linux,
that the measurement that finds it on Linux does not find it on macOS, and
that the one lossless lever measured here therefore has no demonstrated macOS
saving. This section is a measurement; the unit implements no repository
change and claims no recovered CI capacity.

Scripts, the throwaway prototype, and the compact outputs are preserved in
[*evidence/u14/README.md*](./evidence/u14/README.md), with the hosts in
*evidence/u14/host.log*. Every reviewed run used only
`ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-native-spawn-cost`. A reviewed run
without `--update` serializes the shard it produced and throws when it differs
from the checked-in partitions, so every run recorded here reproduced the
checked-in manifest shard exactly. No reviewed path, variant, mode, target,
sanitizer flag, retry policy, budget, or verdict was changed.

The workload is the reviewed shard 1/100, a measured 214 paths and 730 native
executions, with one four times larger sample at shard 1/25, a measured 856
paths and 2,937 native executions. The Linux host is the shared developer
machine in *evidence/u14/host.log*; its one-minute load is recorded for every
run.

Main-thread CPU was attributed with `--cpu-prof` on one pool 8 run of shard
1/100, giving a measured 31.33 s of sampled self time.

| Main-thread work                          | Measured self s | Derived share |
| ----------------------------------------- | --------------- | ------------- |
| `spawn` in *node:internal/child\_process* | 11.45           | 36.6%         |
| Idle                                      | 5.46            | 17.4%         |
| YAML parsing                              | 1.10            | 3.5%          |
| `createHarnessObjectKey`                  | 0.98            | 3.1%          |
| Garbage collector                         | 0.94            | 3.0%          |

Starting processes is now the largest item by a factor of ten over the next
one that is not idle. U13's profile of the same shard before its change
measured 43.34 s sampled, of which `spawn` was 15.26 s and the
runtime-archive key group 11.88 s. U13 removed the key group and one of the
three starts per execution, so the share of what remains rose while its
absolute value fell.

Without the profiler, a preload that wraps `ChildProcess.prototype.spawn`
counts every start and records the main-thread time blocked inside the call.
There are exactly two starts per native execution, one `zig cc` compile and
link and the native executable itself. That accounts for the 730
`fixture-linux-x86_64-gnu` starts and for 730 of the 736 `zig` starts, and
the remaining six are unclassified overhead. The recorder groups starts by the
executable's basename and retained no arguments, so it cannot say what they
were, and more than one caller reaches the compiler under that name: besides
a harness object build, `prepareNativeRuntime` runs two `zig env` identity
probes while the executor initializes.

| Shard | Measured starts | Measured blocked s | Measured runner s | Derived share |
| ----- | --------------- | ------------------ | ----------------- | ------------- |
| 1/100 | 1,466           | 9.73               | 21.80             | 44.6%         |
| 1/100 | 1,466           | 9.65               | 21.22             | 45.5%         |
| 1/25  | 5,930           | 53.38              | 103.88            | 51.4%         |

The cost is the parent's size, not the child's. On Linux libuv starts a
process with `fork`, which copies the parent's page tables, and the reviewed
runner's measured peak resident set is 996,640 kB at shard 1/100 and
1,148,912 kB at shard 1/25. A synthetic parent shows the relationship
directly: 300 sequential starts of a trivial child cost a measured 1.830 ms
each at a 99.6 MiB resident set and 22.311 ms each at 1,054.2 MiB, a derived
22.0 ms per GiB. The parent's own system time over those 300 starts grows
with it, from a measured 241.9 to 3,147.0 ms, a derived 44 and 47 percent of
the summed call time; kernel time in the parent that grows with the parent's
own size is what copying its page tables looks like, and this measurement
does not attribute the remainder of the call. The same relationship holds
inside the runner at a lower slope: grouping the run's own starts by the
resident set at the moment of the start gives a measured 4.403 ms median in
the 400 to 500 MiB group and 6.922 ms in the 600 to 700 MiB group, an
estimated 12.9 ms per GiB between those groups' midpoints.

The same measurement on macOS does not find this cost. On an Apple M4 a
start costs a measured 0.265 ms at a 96.1 MiB resident set and 0.263 ms at
898.5 MiB, flat within its own noise across a tenfold range, which is what
libuv starting a process with `posix_spawn` there would predict. Scaling
that rate to the 1,466 starts of a 1/100 shard estimates 0.4 s in total
against the Linux 9.7 s. Those macOS figures are micro-benchmarks on a
desktop M4, not GitHub macOS runner measurements and not a reviewed run, and
no macOS before-and-after was taken. What they support is that there is no
demonstrated macOS saving here, not a measured macOS runner time.

Why the runner holds about a gigabyte is worth recording, because it is what
makes each start expensive. The recorder samples `heapUsed` once a second
without observing collection boundaries, so the smallest sample in a window
is a proxy for the live set rather than an observation of it. That proxy
grows from a measured 97 to 243 MiB over the 856 paths of shard 1/25, an
estimated 0.17 MiB retained per path, while the largest `heapTotal` sample,
which covers the whole heap rather than old space alone, is 918 MiB against a
1,083 MiB resident set. The shape is consistent with a resident set dominated
by heap reserve for per-case allocation churn over a retained component that
grows with the path count; it does not by itself exclude a leak, and this
unit did not look further. Reducing the resident set is in any case not
free. Capping the old space with
`--max-old-space-size=256` halves the measured peak resident set, from
1,010,984 to 548,248 kB, but the two four-core measurements disagree on the
sign of the wall-time change and a cap sized against a 214-path sample risks
an out-of-memory failure on a CI shard of 1,782 paths. More collector time
would explain paying for the smaller resident set; these rows record no
collector duration and do not test it. Those four rows were also taken on a
contended host, at loads between 8.4 and 11.1, and are recorded as a
direction rather than a result.

Moving the start onto a `worker_threads` worker was measured and is worse. A
worker shares the parent's address space, so the same page tables are still
copied and only the thread charged for the copy moves. At a 650 MiB ballast,
300 starts through a worker take a measured 9,641.5 ms of wall time against
5,732.8 ms directly, and the whole process's system time is 4,442.5 ms
against 2,542.6 ms. The worker's own 31.447 ms per start is time blocked on
the worker thread and is not comparable with the 18.846 ms blocked on the
main thread in the direct arm. A second heap for the fork to copy would
explain the increase; this measurement does not test that.

The lever that does work on Linux is a small long-lived helper process that
owns the starts, so that the page tables copied are the helper's rather than
the runner's. In the same synthetic comparison the blocked time per start
falls from a measured 18.846 to 0.009 ms and the parent's system time over
300 starts from 2,542.6 to 6.8 ms. It was measured on the reviewed runner
with a throwaway prototype, preserved as
*evidence/u14/spawn-helper-prototype.diff*, which adds an environment-gated
branch to the Node host's `run` that forwards the request to the helper over
an IPC channel. The two arms of the A/B differ only by that environment
variable, so they alternate run by run with no rebuild between them. Every
individual run, with its own wall time, runner duration, and host load, is
preserved in *evidence/u14/ab-runs.tsv.txt*; the means below are arithmetic
means over the complete pairs of each group.

Cache conditions were not controlled. Both the Oseo compiler cache, which
`XDG_CACHE_HOME` locates, and the lane's `ZIG_GLOBAL_CACHE_DIR` persisted
across every run, the driver neither reset nor warmed them and recorded no
cache state, and it ran the base arm before the helper arm in every
repetition rather than reversing the order within a pair. Any warming
that continued across the sequence would therefore land on the helper arm, so
these reductions are the difference between the arms as they were run and do
not isolate the helper's effect from cache state. What the preserved per-run
data shows against such a trend is weak: base wall time does not fall
monotonically across the repetitions of three of the four groups.

| Configuration       | Pairs | Measured base wall s | Measured helper wall s | Derived change |
| ------------------- | ----- | -------------------- | ---------------------- | -------------- |
| 3 CPUs, shard 1/100 | 3     | 53.82                | 50.11                  | -6.9%          |
| 4 CPUs, shard 1/100 | 3     | 45.24                | 40.87                  | -9.7%          |
| 16 CPUs, pool 8     | 3     | 32.93                | 29.57                  | -10.2%         |
| 4 CPUs, shard 1/25  | 3     | 180.60               | 157.00                 | -13.1%         |

All twelve position-paired comparisons are reductions, from a derived 5.9 to
18.0 percent, and the runner's own reported duration moves with them, by a
derived 7.9, 11.1, 12.7, and 13.6 percent. The saving is larger on the four
times larger shard, which is what the resident-set relationship predicts: the
mean resident set during shard 1/25 is a measured 657.0 MiB against 589.8 and
604.3 MiB during shard 1/100, and a CI shard is 1/12 of the corpus rather
than 1/25. An earlier pair of shard 1/25 repetitions taken while another lane
was running, at loads between 9.8 and 12.5, gave -7.4 and +6.7 percent; at
that load the arms differ by less than the host does, and the three
repetitions in the table replace them.

This is recorded as a measured candidate for local Linux gate speed and is
deliberately not adopted in M5CI. The milestone's binding host is macOS,
where the measurement above demonstrates no saving, and the change would
add a second process-execution layer between the runner and every compiler
and fixture start, with its own lifetime, its own failure modes, and a new
place for the byte identity of captured output and the classification of
`EAGAIN`, `ENOMEM`, and `ENOENT` start failures to drift. Adopting it would
be a trade of that risk against Linux minutes that are not the constraint.
The condition for revisiting it is a scenario in which Linux test262 becomes
the binding family, or a change that makes the runner's resident set grow
enough that the Linux lane's own tail matters.

One observation belongs to whoever next looks at the runner's memory rather
than to this unit. The retained component of an estimated 0.17 MiB per path
comes from 856 paths on one host and from sampled heap sizes rather than
collection boundaries; this unit did not identify what holds it, and a CI
shard holds roughly twice as many paths as the largest sample here.

### Historical per-path test262 investigation

The measurement sources, exact per-run values, and table-to-artifact map
are preserved in [*evidence/u10/README.md*](./evidence/u10/README.md).
Its recomputation commands cover every table and derived percentage in
this investigation, including the native attribution and generated-C hashes.

The largest measured new cost is three 10,000-element TypedArray
`copyWithin` detachment security cases admitted by `1a879b2e`. They
account for a derived 97.4/97.3 percent of summed native elapsed
time among the 315 newly reviewed paths in two warm Linux runs. The
fixed old-path sample's warm-trial mean runner time grows from 31.99
to 34.01 seconds, a derived 6.3 percent; the
CI series grows 21.0 percent in normalized step time. U10 finds no lost
reuse or runner change, retains the required semantic work, and claims
no recovered CI capacity. The macOS remainder is not causally allocated
by these Linux measurements.

The U10 comparison uses the historical commits `32ece7f4`,
`e99620d5`, and `aff3ade3`. The measured CI execution steps below
come from main runs 35456667007, 35463308291, and 35493049199;
`gh run view RUN --json headSha,jobs` supplies timestamps and
`gh run view RUN --job JOB --log` supplies runner metadata. Each commit
has one CI run in this comparison, so these measurements do not establish
a repeatable CI improvement or an exact causal allocation.

Measured macOS execution-step seconds and source job IDs, from
[*ci-summary.json.txt*](./evidence/u10/ci-summary.json.txt):

| Shard | 32ece7f4 job | Step s | e99620d5 job | Step s | aff3ade3 job | Step s |
| ----- | ------------ | ------ | ------------ | ------ | ------------ | ------ |
| 1/10  | 105933065487 | 1444   | 105950927491 | 1525   | 106031164715 | 1736   |
| 2/10  | 105933065424 | 1442   | 105950927505 | 1593   | 106031164796 | 1425   |
| 3/10  | 105933065463 | 1308   | 105950927497 | 1341   | 106031164885 | 1233   |
| 4/10  | 105933065510 | 1104   | 105950927440 | 1523   | 106031165008 | 1916   |
| 5/10  | 105933065474 | 1213   | 105950927415 | 1239   | 106031165096 | 1936   |
| 6/10  | 105933065464 | 1450   | 105950927498 | 1766   | 106031164745 | 1477   |
| 7/10  | 105933065576 | 1153   | 105950927494 | 1565   | 106031164849 | 1824   |
| 8/10  | 105933065570 | 1448   | 105950927449 | 1085   | 106031164759 | 1167   |
| 9/10  | 105933065434 | 1421   | 105950927495 | 1279   | 106031164782 | 1603   |
| 10/10 | 105933065675 | 1120   | 105950927552 | 1207   | 106031164930 | 1779   |

The derived sums are 13,103, 14,123, and 16,096 seconds. Dividing by
the measured reviewed counts of 20,841, 20,898, and 21,156 gives
0.629, 0.676, and 0.761 seconds per path. The derived rate increase is 21.0
percent; the execution-sum increase is 22.8 percent. Job setup is outside these
steps. The mise task's prerequisite package build remains inside each step and
has not been subtracted here. Shard indices use each commit's reviewed order,
so an equal index does not select an equal path set across these commits.

All thirty observed runner logs report `pool=3` and `retries=0`.
The measured harness-object build/reuse sums are 954/0, 954/0, and
992/0, respectively. The cold harness state was already present at the
baseline, so it is not a newly lost cache in this interval. The measured
runtime archive restore-hit counts are 9/10, 7/10, and 10/10. The
TypedArray run has the highest normalized cost despite restoring every
archive; archive misses cannot explain that endpoint increase.

The measured canonical execution-variant counts are 68,275, 68,557,
and 69,552, obtained by reading every partition from
`git archive REV tests/test262/results` and counting
`execution.variants`. Their derived endpoint increase is 1.87 percent.
The original 20,841 paths account for 68,275, 68,341, and 68,344
variants; 22 old paths become pass with Symbol support and one more
with TypedArray mutation. The measured new-path counts are 57 at
`e99620d5` and 315 at `aff3ade3`, with 216 and 1,208 variants.
The runtime changes are `a41aeb0b` (Symbol), its identity/lifetime
repairs `9ecf1642`, `7df433ae`, and `61a5214d`, and `1a879b2e`
(TypedArray mutation). The historical test262 runner, fragment runner,
compiler sources, and C backend sources have identical bytes between
the endpoints.

The Linux comparison ran on Linux 7.2.7-200.fc44.x86\_64, an AMD Ryzen
7 7700X with eight physical cores and sixteen hardware threads, using
Node.js 24.18.0 and Zig 0.16.0. The initial host snapshot was an
unpreserved observation: 34 GiB available memory, 254 MiB free swap,
190 GiB free on the temporary filesystem, and load averages of
0.99/1.08/0.86. Its source output and timestamp were not retained, so
these figures are not artifact-backed measurements.

The preserved, sanitized
[*host-pressure.log*](./evidence/u10/host-pressure.log) contains later
observations with their original timestamps. Its swap row at
`2026-09-27T20:15:08+09:00` records zero free bytes. These are shared-host
measurements, not an isolated-host benchmark. The statement that no other
`mise run test` gate was observed at checkpoints is also an unpreserved
observation; no timestamped process-list output supports it.

A detached historical checkout was built at every commit with

~~~~ sh
ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-test262-per-path-rise \
  mise run build
~~~~

Package installation and those builds are outside the timing table. The exact
209 path strings were frozen from shard `3/100` of the `32ece7f4` reviewed
order, rather than reselecting a shard at each commit. The preserved
[*bench.ts.txt*](./evidence/u10/bench.ts.txt) wrapper
calls `createReviewedManifest`, uses each commit's current reviewed entries for
those strings, and asserts equality with `serializeTest262Manifest` of the
corresponding canonical records. It never writes the reviewed subset or results.

The measured command was GNU time around
`mise exec -- node tools/u10-bench.ts`, with the lane above and a separate
`XDG_CACHE_HOME` for each commit. Before each cold run, both the lane's
Zig cache and that commit's Oseo cache were empty. Two warm runs retained
both caches after the cold run. Every cold run built 52 harness objects;
every warm run reused all 52 and built none. All runs used the observed
eight-worker bound and no retry.

Measured runner, command-wall, user, and system seconds follow; CPU/wall
is derived from the latter three measurements. Runner time excludes
manifest preparation and verification outside `createReviewedManifest`.
The difference between command wall and runner time is a derived wrapper
cost, not a native-execution estimate.

Inputs: [*runs.json.txt*](./evidence/u10/runs.json.txt), keyed by commit and
cache trial. CPU/wall is `(user + system) / wall`; the derived warm increase
compares the endpoints' two-trial mean runner seconds.

| Commit     | Cache | Runner s | Wall s | User s | System s | CPU/wall |
| ---------- | ----- | -------- | ------ | ------ | -------- | -------- |
| `32ece7f4` | cold  | 56.84    | 62.86  | 149.56 | 76.43    | 3.60     |
| `32ece7f4` | warm1 | 32.30    | 38.17  | 98.62  | 66.72    | 4.33     |
| `32ece7f4` | warm2 | 31.68    | 37.62  | 98.53  | 66.41    | 4.38     |
| `a41aeb0b` | cold  | 62.90    | 68.88  | 167.35 | 83.35    | 3.64     |
| `a41aeb0b` | warm1 | 34.07    | 40.22  | 105.89 | 70.11    | 4.38     |
| `a41aeb0b` | warm2 | 34.14    | 40.08  | 106.38 | 70.46    | 4.41     |
| `9ecf1642` | cold  | 57.94    | 63.93  | 154.76 | 77.59    | 3.63     |
| `9ecf1642` | warm1 | 33.93    | 40.10  | 103.83 | 69.76    | 4.33     |
| `9ecf1642` | warm2 | 33.86    | 39.88  | 104.87 | 69.58    | 4.37     |
| `7df433ae` | cold  | 57.83    | 63.81  | 155.19 | 77.76    | 3.65     |
| `7df433ae` | warm1 | 33.34    | 39.32  | 104.18 | 69.57    | 4.42     |
| `7df433ae` | warm2 | 33.33    | 39.28  | 103.15 | 68.98    | 4.38     |
| `61a5214d` | cold  | 57.40    | 63.39  | 154.54 | 77.87    | 3.67     |
| `61a5214d` | warm1 | 32.63    | 38.63  | 102.14 | 68.65    | 4.42     |
| `61a5214d` | warm2 | 33.63    | 39.67  | 102.98 | 69.59    | 4.35     |
| `e99620d5` | cold  | 58.14    | 64.10  | 158.52 | 78.53    | 3.70     |
| `e99620d5` | warm1 | 38.51    | 44.56  | 114.78 | 76.15    | 4.28     |
| `e99620d5` | warm2 | 34.98    | 41.16  | 108.06 | 71.52    | 4.36     |
| `9e71f689` | cold  | 58.01    | 64.01  | 156.47 | 78.13    | 3.67     |
| `9e71f689` | warm1 | 34.72    | 40.78  | 106.30 | 71.05    | 4.35     |
| `9e71f689` | warm2 | 34.84    | 41.01  | 108.44 | 71.66    | 4.39     |
| `1a879b2e` | cold  | 61.09    | 68.19  | 160.37 | 80.73    | 3.54     |
| `1a879b2e` | warm1 | 33.30    | 39.35  | 106.01 | 69.67    | 4.46     |
| `1a879b2e` | warm2 | 33.90    | 39.97  | 105.02 | 69.90    | 4.38     |
| `aff3ade3` | cold  | 61.91    | 70.35  | 164.74 | 81.36    | 3.50     |
| `aff3ade3` | warm1 | 33.88    | 40.28  | 106.56 | 70.05    | 4.38     |
| `aff3ade3` | warm2 | 34.14    | 40.31  | 104.46 | 70.61    | 4.34     |

The measured baseline sample has 167 passes, 17 expected negatives,
25 unsupported paths, and 668 variants. Symbol support promotes three
sample paths, giving 170 passes, 17 expected negatives, 22 unsupported,
and 677 variants at every later point. Every sample has zero semantic,
harness, or infrastructure failures and matches its own reviewed records.
These historical promotions are workload changes, not manifest edits by U10.

The warm-trial mean runner time rises from 31.99 to 34.01 seconds, a
derived 6.3 percent, below the 21.0 percent CI step-rate increase. The observed
increase appears in the `a41aeb0b` samples, which also include the three
promotions. The subsequent repairs and TypedArray implementation do not produce
another consistent warm step in this sample. `61a5214d` and `e99620d5` have
identical trees, yet their measured warm ranges are 32.63–33.63 and 34.98–38.51
seconds. This observed variation precludes assigning small timing differences
to the merge itself.

The unchanged-classification control removes those three promotions,
leaving the same 206 paths, 167 passes, 17 expected negatives,
22 unsupported results, and 665 recorded variants at both endpoints.
An instrumented wrapper records elapsed `host.run` intervals and hashes
the generated launcher/body C before writing it. Two module variants use
the whole-Script fallback and are outside this fragment-host instrumentation;
all 665 variants still execute and match the reviewed results.
After an untimed-for-comparison primer, the two warm runs capture 663
compile/link and 663 native-executable calls each. The 1,326 observed C
files have identical name/length/SHA-256 multisets at both endpoints,
totaling a derived 29,969,883 bytes each. Larger generated body C is
therefore not the source of the fixed control's cost.

Measured command/runner seconds and derived sums of observed subprocess
elapsed seconds follow. Those sums include process creation and asynchronous
completion delivery, overlap under eight workers, and are neither CPU
time nor task-wall allocations. Instrumentation has its own overhead,
so these runner times are not comparisons with the uninstrumented table.

Inputs: [*runs.json.txt*](./evidence/u10/runs.json.txt) and
[*control-metrics.json.txt*](./evidence/u10/control-metrics.json.txt). Divide
each phase's summed milliseconds by 1000; the shared C hash multiset preserves
all four runs after exact equality checks.

| Commit     | Trial | Runner s | Wall s | User s | System s | Compile/link sum s | Native sum s |
| ---------- | ----- | -------- | ------ | ------ | -------- | ------------------ | ------------ |
| `32ece7f4` | warm1 | 35.23    | 41.45  | 104.87 | 71.70    | 90.24              | 14.72        |
| `32ece7f4` | warm2 | 35.28    | 41.70  | 103.63 | 71.82    | 88.21              | 15.10        |
| `aff3ade3` | warm1 | 37.15    | 43.36  | 107.23 | 74.33    | 92.94              | 15.67        |
| `aff3ade3` | warm2 | 34.45    | 40.73  | 102.87 | 70.91    | 87.18              | 14.44        |

The observed control ranges overlap in both phases. It does not establish
a repeatable slowdown of unchanged old cases or a generated-C regression.

All 315 paths newly reviewed between the endpoints were then measured
at `aff3ade3`, using the same runner wrapper and the unchanged reviewed
expectations. The first run retained the populated Zig/runtime caches
and had a mixed harness cache: 32 objects built and 24 reused. Each
instrumented warm repeat reused all 56 harness objects and built none.
Every run retained 303 passes, 12 unsupported results, 1,208 variants,
eight workers, no retry, and no failure.

Measured command and runner seconds, from the same GNU-time command:

Inputs: [*runs.json.txt*](./evidence/u10/runs.json.txt), keys `new-prime`,
`new-warm1`, and `new-warm2`.

| New-path trial | Harness state | Runner s | Wall s | User s  | System s |
| -------------- | ------------- | -------- | ------ | ------- | -------- |
| new-prime      | mixed         | 310.12   | 316.56 | 1459.54 | 166.20   |
| new-warm1      | warm          | 331.54   | 337.61 | 1575.73 | 168.97   |
| new-warm2      | warm          | 326.58   | 332.87 | 1513.92 | 170.19   |

The three expensive paths are under the upstream
*test/built-ins/TypedArray/prototype/copyWithin/* directory:
*coerced-values-end-detached.js*,
*coerced-values-end-detached-prototype.js*, and
*coerced-values-start-detached.js*. Each explicitly fills an array of
length 10,000 before constructing typed arrays and detaching a buffer
during index coercion. The upstream comment identifies the large array
as a way to expose access after the memory has been freed. All three
paths were added to the reviewed subset by `1a879b2e`. The test262
runner leaves the collector policy unset, so these measurements use
the runtime's ordinary collection policy, as described in ADR 0018.

Derived sums from the warm repeats' observed `host.run` intervals in
[*new-metrics.json.txt*](./evidence/u10/new-metrics.json.txt). Sum each path's
four native milliseconds and divide by 1000. For each attribution percentage,
divide the three-path sum by all paths' native sum and multiply by 100:

| Path stem                                  | Variants/run | First native sum s | Second native sum s |
| ------------------------------------------ | ------------ | ------------------ | ------------------- |
| *coerced-values-end-detached.js*           | 4            | 455.46             | 428.25              |
| *coerced-values-end-detached-prototype.js* | 4            | 463.77             | 427.43              |
| *coerced-values-start-detached.js*         | 4            | 433.86             | 417.31              |

The derived three-path totals are 1,353.09 and 1,272.99 seconds,
out of 1,389.12 and 1,308.36 seconds for all new-path native
calls: 97.4 and 97.3 percent. Compile/link sums for the
same runs are 208.21 and 215.08 seconds. This isolates the added
cost to required native security-case work rather than a much larger
generated program or newly lost reuse. It does not convert Linux timings
into a macOS budget estimate.

A separate sanitized C probe materializes Symbol or the TypedArray
prototype, collects once to remove transient objects, counts the remaining
owned heap objects, and times 10,000 further `oseo_collect` calls with
`clock()`. It links each commit's retained runtime archive using
`zig cc -target x86_64-linux-gnu -std=c11 -Wall -Wextra -Werror -pedantic`,
the matching headers, `-fsanitize=address,undefined`, and `-fno-lto`.
This is a diagnostic microbenchmark, not gate time or an executed-case
budget. Object counts and CPU seconds are measured; no full-gate
projection is derived from them.

Inputs: [*gc-probe.log*](./evidence/u10/gc-probe.log), emitted by the
preserved [*gc-probe.c*](./evidence/u10/gc-probe.c) source. The object and
CPU columns copy observed values directly, with no derived projection.

| Commit     | Symbol objects | Symbol CPU s, two trials | TypedArray objects | TypedArray CPU s, two trials |
| ---------- | -------------- | ------------------------ | ------------------ | ---------------------------- |
| `32ece7f4` | 363            | 0.074722/0.076069        | 1049               | 0.225213/0.225948            |
| `a41aeb0b` | 391            | 0.082519/0.082485        | 1079               | 0.232866/0.231823            |
| `9ecf1642` | 391            | 0.084049/0.085079        | 1079               | 0.233143/0.232689            |
| `7df433ae` | 391            | 0.082937/0.082685        | 1079               | 0.230107/0.229598            |
| `61a5214d` | 391            | 0.084244/0.083773        | 1079               | 0.233293/0.235265            |
| `1a879b2e` | 391            | 0.084416/0.083141        | 1127               | 0.240724/0.239648            |
| `aff3ade3` | 391            | 0.082979/0.082814        | 1127               | 0.242209/0.240837            |

Symbol support expands the retained intrinsic graph; TypedArray mutation
adds six method objects and their descriptors. Tracing the larger graphs
is observable in this probe. The unchanged-classification task control
still has overlapping phase times, so this microbenchmark does not assign
the CI rise or the small fixed-sample difference to GC alone.

U10 records a measured semantic-work explanation and implements no
infrastructure change. No lost cache, pool reduction, extra retry, or
larger generated body for unchanged old cases was demonstrated. Reducing
the upstream security arrays would discard the evidence that made these
paths worth admitting. A future collector
or runtime optimization must retain those arrays, every recorded variant,
and the same native targets and sanitizer flags.

The single-run macOS series cannot establish an exact allocation of its
21.0 percent rise between these new cases, historical promotions, and
runner spread. Repeated macOS runs of fixed old and new path sets would
be needed for that allocation. U10 claims zero recovered CI capacity;
the reviewed manifests, classifications, and language profile are unchanged.


Historical local baseline (2026-07-25)
--------------------------------------

The sections below preserve the observed local measurements originally
recorded for [*PLAN-GATE.md*](../PLAN-GATE.md). The baseline commit is
`0bd5f38e1762666a7cca40c059abdcd8dcf94118`, dated 2026-07-25, with a measured
681 reviewed paths from `git show 0bd5f38:tests/test262/results.yaml`.
They describe that historical corpus, not current CI cost.

Historical task timings, host facts, counts, decomposition samples, cgroup
peaks, and sampler readings below are observed single-host measurements from
the named commands. Ratios, differences, percentages, and concurrency
aggregates are derived from those observations. Earlier `e57a184` samples
also date to 2026-07-25. Archive reuse and concurrency were recorded at
`ddaf4a91` and `a5b3e105` on 2026-07-26 with the same measured 681 paths;
the explicitly named `9eb7de2` footprint sample also dates to 2026-07-26.
Later inventory and partition checkpoints below label their own larger
corpus and commands; the partition checkpoint was recorded at `6676520b`
on 2026-08-05. Cache warmth was not fully established for the original
baseline, so these historical values are not cold/warm CI comparisons.

Sanitizer audit (observed 2026-09-17): historical Zig 0.16.0 runs did not
provide ASan coverage. The separate Linux host C sanitizer lane verifies
instrumentation; its measured scope is recorded in the
[activity audit](sanitizer-activity.md). This does not retroactively validate
earlier gates or establish macOS ASan coverage for those historical samples.
Zig address self-checks remain TODOs.

### Measurement host

| Fact              | Value                                        |
| ----------------- | -------------------------------------------- |
| Operating system  | Linux 7.1.4-200.fc44.x86\_64                 |
| Processor         | AMD Ryzen 7 7700X, 8 cores, 16 threads       |
| Memory            | 61 GiB total, 8 GiB available during the run |
| Temporary storage | *tmpfs* on */tmp*, 31 GiB, 80 percent used   |
| Oseo target       | `linux-x86_64-gnu`                           |
| Sanitizers        | `address`, `undefined`                       |
| Zig               | 0.16.0                                       |
| Node.js           | 24.18.0                                      |
| Deno              | 2.9.2                                        |

The memory and temporary storage rows are recorded because they are the host
conditions during the failing runs described below, not because a cause was
established. Native executions allocate their working directories under
*/tmp*, which is memory-backed on this host.

The reviewed test262 corpus at the baseline commit holds 681 paths at
upstream revision `f2d1435644797268dca1f7988cad5a4e89ccd8d2`. The
checked-in manifest records 310 passes, 245 expected negatives, 126
unsupported profile features, and no semantic or harness failures. It also
records 1,192 specialization observations, so one manifest run performs
1,192 native compile-and-execute cycles.

### Observed gate durations

| Task                            | Wall    | User    | System  | CPU / wall |
| ------------------------------- | ------- | ------- | ------- | ---------- |
| `mise run test:test262`         | 980.2 s | 641.1 s | 339.0 s | 1.00       |
| `mise run test:property:native` | 42.8 s  | 285.9 s | 135.0 s | 9.84       |

The property task passed 29 tests and averaged 9.84 processor-seconds for each
second of wall clock. The test262 task averaged 1.00, which is one
core-equivalent on average rather than a guarantee about any instant. Its
reviewed subset executes through one sequential `for` loop that awaits each
case in *tools/test262.ts*.

The test262 run executed the complete reviewed subset and then reported
infrastructure failures during validation, so its duration measures the
complete corpus. The failures are described under load sensitivity below.

An earlier sample of the property task at commit `e57a184` recorded 52.9 s of
wall clock with a ratio of 8.52, and an earlier sample of the test262 task at
that commit recorded 1,102.7 s with a ratio of 1.01. Absolute wall clock
varies with the warmth of the Zig compilation cache and with competing load,
so the ratio is the comparable figure across hosts and runs.

System time is 34 percent of the processor time the test262 task
consumes. Each native execution copies the reviewed runtime assets into a
fresh working directory and starts 13 toolchain processes.

### Native execution decomposition

These three components were measured separately on the same host with the
same target and sanitizer flags:

| Component                                                     | Wall       | Processor |
| ------------------------------------------------------------- | ---------- | --------- |
| One complete `runNativeCli` execution of `const x = 1 + 1;`   | 717-750 ms | not taken |
| Runtime archive build, first sample                           | 641 ms     | not taken |
| Runtime archive build, later sample                           | 333 ms     | 255 ms    |
| Generated C compile, link, and run against a prebuilt archive | 20-43 ms   | not taken |

The two archive samples differ because Zig caches compilation and the later
sample repeated identical sources and flags. Which sample resembles a gate
execution is not established: the gate copies sources into a fresh working
directory for every execution, so its include paths differ from these samples
and may or may not produce the same cache keys.

Derived from the observed task duration: 980.2 s divided by 1,192 recorded
observations is 822 ms of task wall clock for each native cycle. That figure
includes runner overhead and is not a direct measurement of one native
execution. The archive build's share of it is not established here, and no
residual figure is projected from these samples.

What the samples do show is that linking and running a trivial program against
an existing archive costs 20-43 ms, while building the archive costs 333 to
641 ms. Across the recorded pairs that is a factor of roughly 8 to 32. The
archive depends on the reviewed runtime sources and headers, the compile flags,
the resolved toolchain identity, one immutable admitted-environment snapshot,
the exact inherited environment policy, and the target and sanitizer
selection. Ambient compiler inputs outside that policy are removed. None of
those change between reviewed cases in one gate run, and the archive is rebuilt
for every execution.

### Per-execution footprint before archive reuse

The runtime archive checkpoint first measured one complete `runNativeCli`
execution of `const x = 1 + 1;` at commit `9eb7de2`. The execution ran alone
in a transient user systemd service with memory accounting enabled. The
service cgroup reported the peak resident memory for the Node.js process and
all of its native toolchain children.

The new _oseo-cli-\*_ working directory was sampled every 5 ms from creation
through the final pre-removal observation. Allocated storage is the sum of
filesystem blocks reported by `lstat`; apparent storage is the sum of file
and directory sizes. Preexisting _oseo-cli-\*_ directories were excluded.

| Measurement                   | Peak                      |
| ----------------------------- | ------------------------- |
| Resident memory, process tree | 192.9 MiB                 |
| Temporary storage, allocated  | 7,786,496 bytes, 7.43 MiB |
| Temporary storage, apparent   | 7,731,724 bytes, 7.37 MiB |

The service completed successfully. Its 1.567 s service runtime and 1.555 s
processor time include the 5 ms filesystem sampler and are not gate-duration
measurements. The gate comparison below measures wall and processor time
without that sampler.

The same source, sampler, and cgroup measurement were repeated after the
runtime archive checkpoint with a valid archive already present:

| Measurement                   | Before                    | Reuse                     | Reduction |
| ----------------------------- | ------------------------- | ------------------------- | --------- |
| Resident memory, process tree | 192.9 MiB                 | 47.8 MiB                  | 75.2%     |
| Temporary storage, allocated  | 7,786,496 bytes, 7.43 MiB | 4,616,192 bytes, 4.40 MiB | 40.7%     |
| Temporary storage, apparent   | 7,731,724 bytes, 7.37 MiB | 4,610,180 bytes, 4.40 MiB | 40.4%     |

The reuse measurement completed successfully in 238 ms of service runtime and
210 ms of processor time. Those durations still include the sampler and remain
outside the unsampled gate comparison. The footprint reduction is the input to
the later bounded-concurrency decision; the persistent 1,438,318-byte archive
is shared cache state rather than per-execution temporary storage.

### Runtime archive reuse checkpoint

The checkpoint comparison ran on the same operating system, processor, target,
and tool versions as the baseline. Host pressure differed between the two
test262 samples and is recorded rather than normalized away:

| Fact                      | Reuse sample       | Bypass sample      |
| ------------------------- | ------------------ | ------------------ |
| Memory available at start | 6.1 GiB            | 23.9 GiB           |
| */tmp* capacity           | 31 GiB             | 31 GiB             |
| */tmp* use at start       | 80 percent         | 18 percent         |
| Load average at start     | 11.18/9.67/9.98    | 13.34/39.73/47.90  |
| Nearby CPU I/O wait       | about 25 percent   | 25 percent         |
| Oseo target               | `linux-x86_64-gnu` | `linux-x86_64-gnu` |
| Sanitizers                | address, undefined | address, undefined |
| Zig                       | 0.16.0             | 0.16.0             |
| Node.js                   | 24.18.0            | 24.18.0            |
| Deno                      | 2.9.2              | 2.9.2              |

The bypass sample began only after a competing eight-worker Node.js test had
finished and memory had recovered. Both successful test262 samples executed
the same 681 reviewed paths and reported 310 passes, 245 expected negatives,
126 unsupported profile features, and no semantic or harness failures.

| Task and path                            | Wall       | User     | System   | CPU / wall |
| ---------------------------------------- | ---------- | -------- | -------- | ---------- |
| `mise run test:test262`, reuse           | 270.64 s   | 216.75 s | 76.21 s  | 1.08       |
| `mise run test:test262`, explicit bypass | 1,180.85 s | 783.15 s | 396.83 s | 1.00       |
| `mise run test:property:native`, reuse   | 8.93 s     | 67.31 s  | 30.13 s  | 10.91      |

The successful bypass is the same-checkout control for the test262 result.
Reuse removed 910.21 s of wall clock, 77.1 percent of the bypass duration, and
887.02 processor-seconds, 75.2 percent of the bypass processor time. The gate
was 4.36 times faster with reuse. Compared with the older baseline, native
property wall clock fell from 42.8 s to 8.93 s and its processor time fell from
420.9 s to 97.44 s.

The test262 difference establishes the net share of the complete runtime
archive rebuild path that reuse removes. It includes avoiding runtime source
copies and includes the new key calculation and cache lookup overhead, so it
does not claim that 77.1 percent is isolated `zig cc` time. It does establish
that repeated runtime preparation, rather than the generated-program link and
execution alone, occupied most of the gate.

One earlier bypass attempt is excluded from the table. A competing
eight-worker Node.js test started during that run; the host reached 55 GiB in
use, exhausted all 8 GiB of swap, and exceeded a load average of 70. The Oseo
run then reported many unrelated expected passes as harness failures after
1,098.22 s. No Oseo or Zig child remained afterward. The successful isolated
bypass above replaces that load-contaminated sample rather than averaging it
into the checkpoint result.

### Concurrent reviewed execution checkpoint

The concurrent checkpoint ran on the same operating system, processor, target,
and tool versions as the reuse sample. No unrelated native build or other heavy
test task ran at the same time.

| Fact                      | Concurrent sample                      |
| ------------------------- | -------------------------------------- |
| Operating system          | Linux 7.1.4-200.fc44.x86\_64           |
| Processor                 | AMD Ryzen 7 7700X, 8 cores, 16 threads |
| Memory available at start | 25 GiB                                 |
| Swap at start             | 8.0 GiB used, 104 KiB free             |
| */tmp* capacity           | 31 GiB                                 |
| */tmp* use at start       | 32 percent                             |
| Load average at start     | 0.71/0.39/0.80                         |
| Oseo target               | `linux-x86_64-gnu`                     |
| Sanitizers                | address, undefined                     |
| Zig                       | 0.16.0                                 |
| Node.js                   | 24.18.0                                |
| Deno                      | 2.9.2                                  |

The worker bound is eight, one for each physical core. A host with less
available parallelism uses and reports that lower effective bound. The bound
counts concurrent native executions rather than reviewed paths: the pool
schedules one work item for each strictness and specialization variant, so one
path's variants can hold several slots at once and a single long path no longer
serializes every execution behind one worker. A subset with fewer paths than
the configured bound clamps against that work-item count instead of the path
count.

A path's first variant runs alone as a probe, because a case that stops at
that variant records only that variant, and ADR 0013 requires every executed
combination to be listed and compared. Once the probe shows that the case does
not stop there, the remaining variants start together, and every one of their
outcomes is awaited, recorded, and compared before the result is decided. No
combination executes that the result would not list. The measured reused
footprint makes the resource comparison explicit:

| Resource          | Per execution | Eight-worker aggregate | Constrained successful capacity |
| ----------------- | ------------- | ---------------------- | ------------------------------- |
| Resident memory   | 47.8 MiB      | 382.4 MiB              | 6.1 GiB available               |
| Temporary storage | 4.40 MiB      | 35.2 MiB               | about 6.2 GiB available         |

The capacity column uses the more constrained successful reuse sample rather
than the less constrained concurrent sample. Both capacities admit more than
eight measured working sets. The processor has eight physical cores, so CPU
rather than memory or temporary storage sets the bound. The 16 logical threads
do not double the physical execution resources available to the CPU-intensive
compiler and linker work.

The complete reviewed subset retained 310 passes, 245 expected negatives, 126
unsupported profile features, and no semantic or harness failures. Its
serialized canonical manifest matched the checked-in sequential manifest byte
for byte, so *results.yaml* and the digest in *target-parity.yaml* did not
change. The run performed no retry.

| Task and path                                 | Wall    | User     | System  | CPU / wall |
| --------------------------------------------- | ------- | -------- | ------- | ---------- |
| `mise run test:test262`, reuse, eight workers | 44.57 s | 256.73 s | 89.23 s | 7.76       |

Derived from the observations, concurrent execution removed 226.07 s from the
270.64 s sequential reuse path, a reduction of 83.5 percent. The gate was 6.07
times faster, and its processor-time-to-wall ratio rose from 1.08 to 7.76.

The CLI narrows a process-start failure caused by temporary host process
resource exhaustion before the harness considers a retry. Only that diagnostic
is retried, once at most for each native variant. Deterministic toolchain
failure, temporary-directory failure, ordinary executable-launch failure, and
cleanup failure remain first-attempt harness failures. Duration, the effective
pool bound, and total retries appear in run output and failure metadata, never
in the canonical manifest.

### Applicable-test inventory check

ADR 0020 adds `mise run check:test262-inventory` to the default check gate.
The task walks the 47,381 candidate paths, parses their frontmatter, regenerates
the complete path index in memory, and compares it with the checked-in
inventory. It executes no standards case.

The isolated sample ran on the same operating system, processor, memory,
storage, and tool versions as the concurrent sample above. No native build or
other heavy test task ran at the same time.

| Task                               |   Wall |   User | System | CPU / wall |
| ---------------------------------- | -----: | -----: | -----: | ---------: |
| `mise run check:test262-inventory` | 4.93 s | 4.61 s | 1.06 s |       1.15 |

The process peaked at 364,616 KiB of resident memory. The exact-regeneration
check is retained because it detects changes to candidate paths, frontmatter,
the edition policy, and the generated index in one invariant. If it enters the
default check's critical path as the corpus grows, the replacement keeps exact
regeneration while using bounded reads or a separate CI comparison rather than
weakening the inventory validation.

### Manifest partitioning and failure classification checkpoint

The combined checkpoint ran on the following host. The memory, swap, and load
facts were recorded immediately before the exact manifest regeneration. The
temporary-storage capacity was recorded on the same host after the task.

| Fact                      | Checkpoint sample                       |
| ------------------------- | --------------------------------------- |
| Operating system          | Linux 7.1.5-201.fc44.x86\_64            |
| Processor                 | AMD Ryzen 7 7700X, 8 cores, 16 threads  |
| Memory available at start | 43 GiB                                  |
| Swap at start             | 7.1 GiB used, 925 MiB free              |
| Temporary storage         | Btrfs root volume, 930 GiB, 86 GiB free |
| Load average at start     | 1.36/0.76/0.84                          |
| Oseo target               | `linux-x86_64-gnu`                      |
| Sanitizers                | address, undefined                      |
| Zig                       | 0.16.0                                  |
| Node.js                   | 24.18.0                                 |
| Deno                      | 2.9.2                                   |

The exact regeneration used the eight-worker reviewed pool and no retry. The
ratchet measurement used the final partition format and compared it with the
single-file manifest at commit `7ddd2c6`.

| Task                                   | Wall     | User       | System     | CPU / wall |
| -------------------------------------- | -------- | ---------- | ---------- | ---------- |
| `mise run test262:update`              | 500.10 s | 2,947.07 s | 1,049.63 s | 7.99       |
| `mise run check:compatibility-ratchet` | 2.90 s   | 3.69 s     | 0.45 s     | 1.43       |

The regenerated manifest retained the pinned revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2` and all 4,861 reviewed paths. It
records exactly 2,934 passes, 1,355 expected negatives, 572 unsupported
profile features, and no semantic, harness, or infrastructure failures. The
ratchet also retained 57 generated domains, 50 distinct seeds, and an
aggregate ordinary case budget of 2,686. This checkpoint has no timing target.

Before partitioning, *results.yaml* contained 4,861 records in 155,346 lines.
After partitioning, the 3,851-line index names 1,161 nonempty files containing
154,813 lines in total. The largest partition contains 16 records and 528
lines. *target-parity.yaml* remains a seven-line entry-point record, while its
digest covers that index and every ordered partition.

### Load sensitivity

Neither baseline full-corpus run of the reviewed subset completed without
infrastructure failures on this host.

| Run | Commit    | Competing load       | Result                  |
| --- | --------- | -------------------- | ----------------------- |
| 1   | `e57a184` | Native builds        | `semantic=0 harness=3`  |
| 2   | `0bd5f38` | None from this shell | `semantic=0 harness=32` |

Every affected path was then executed in isolation through
`createReviewedManifest` and reported its expected classification: 3 of 3 for
run 1, and 32 of 32 for run 2, which reported 30 passes and 2 expected
negatives. No semantic failure occurred in either run.

The run 2 failures are contiguous in reviewed order rather than distributed by
feature, and they are `OSEO3001` native infrastructure diagnostics rather than
semantic mismatches or compile diagnostics. `OSEO3001` did not name a cause,
and the baseline runs did not measure their peak resident memory or peak
temporary storage. The host facts above are snapshots, not measurements taken
during those failing windows, so the baseline observations alone do not
identify the cause of either failure.

What the runs do establish is narrower. No semantic failure occurred. Every
affected path reported its expected classification when executed alone. The
command-line entry point removes its working directory on the failure path as
well as the success path, so the run did not accumulate directories.

The later archive-reuse checkpoint measured one reused execution at 47.8 MiB
peak process-tree resident memory and 4.40 MiB peak allocated temporary
storage. Its excluded bypass sample also observed a specific resource failure:
a competing eight-worker Node.js test drove memory in use to 55 GiB, exhausted
all 8 GiB of swap, and raised the load average above 70 before unrelated
expected passes were reported as harness failures. That observation identifies
memory and swap exhaustion for the excluded sample. It does not establish that
the earlier baseline failures had the same cause.

At the throughput baseline, `OSEO3001` mapped a resource failure and a harness
defect to one classification. Bounded concurrency therefore used the measured
reused footprint, recorded its aggregate bound, and ran without unrelated
heavy load. The combined checkpoint above now separates exhausted
infrastructure failures from harness defects after narrowing the diagnostic
that permits one retry.

### Reproduction

~~~~ sh
mise run test:test262
OSEO_RUNTIME_ARCHIVE_REUSE=disabled mise run test:test262
mise run test:property:native
mise run check:test262-inventory
~~~~

The decomposition used `zig cc` directly with the flags the toolchain
adapter builds for `linux-x86_64-gnu`, and `runNativeCli` from
*packages/cli/src/index.ts* for the complete execution. Zig maintains its
own compilation cache, so a repeated identical build may be warmer than a
first build on a clean host.

### Preserved comparison points

Later throughput work must preserve:

 -  one counted result for each upstream source path;
 -  the reviewed result order that shard reconstruction selects from;
 -  the reviewed property seeds, sizes, and case counts;
 -  execution under both specialization policies with collection forced at
    every safepoint;
 -  the strict warning, undefined-behavior, and address sanitizer flags; and
 -  the reviewed classifications recorded in the checked-in manifest.

The historical observations remain comparison points for their named
checkpoints. Current CI measurements are recorded at the start of this file.
