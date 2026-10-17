Apple clang sanitizers on a Mac lane
====================================

This unit measured whether the two `host C sanitizers (macOS, …)` jobs
belong on a self-hosted Mac lane. The measurement ran on 2026-10-17 from
08:07 to 10:21 UTC, at main commit `80d2394a`, as the `dahlia` account over
SSH. No runner, LaunchDaemon, security setting, repository variable, or
secret was changed, and no second runner was registered. Every number
below is labeled measured or derived. The raw logs remain under
*~/m5ci-results/u37/runs/* on the Mac.

The family was the last one in `macosJobCosts` whose
`selfHostedFamilySpeedRatios` entry was a placeholder rather than a
measurement. That placeholder, `1`, had made the model report a regression
for a reason the model itself invented, so no sweep over it could answer
the question.


Host and method
---------------

The host is the first Mac mini, which runs `oseo-mac-1` and `oseo-mac-2`:
an Apple M6 with 12 logical CPUs and 16 GiB of memory, running macOS
27.0.1 with Spotlight indexing disabled. Two clones,
*~/Desktop/oseo-m5ci-u37-a/* and *-b/*, were checked out at `80d2394a`,
each with its own `ZIG_GLOBAL_CACHE_DIR`
(*~/m5ci-results/u37/zig-a/* and *zig-b/*), standing in for two runner work
directories.

[*scripts/job.sh.txt*](./scripts/job.sh.txt) runs a job's steps after
checkout and tool installation exactly as the generated workflow does:
`mise run build` and `mise run ci:runtime-archive-cache` with
`OSEO_NATIVE_TOOLCHAIN=host-cc` from the runtime-archive action, then the
job's test commands with the workflow's environment. It sets
`OSEO_HOST_CC=clang`, `GITHUB_ACTIONS=true`, and `CI=true`, as on a
runner, and a fresh `TMPDIR` per job. The two jobs are the complete
family:

| Key        | CI job                                | Test commands                                                                                             |
| ---------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `san-nat`  | `host C sanitizers (macOS, native)`   | `mise run test:sanitizer:self`, `mise run test:sanitizer:runtime`, `mise run test:sanitizer:native`       |
| `san-prop` | `host C sanitizers (macOS, property)` | `mise run test:sanitizer:self`, then `mise run test:sanitizer:property` with `OSEO_PROPERTY_TIME_SCALE=6` |

The property job retains the workflow's fixed time scale of 6, which
widens only the interrupt limit and leaves every case budget and seed
fixed. A job wall here starts at `mise run build` and ends with the last
test command; it excludes checkout and tool installation, as the U25 walls
do.

[*scripts/drive.sh.txt*](./scripts/drive.sh.txt) drove the experiments
from the Linux workstation. Before each one it waited for `oseo-mac-1` and
`oseo-mac-2` to report idle through
`gh api repos/dahlia/oseo/actions/runners`, and while one ran it sampled
their busy state every 30 seconds, so a wall that overlapped a CI job
could be discarded rather than believed. No sample recorded a busy lane,
and no step of any experiment exited non-zero.

The first pass ran the pair shape cold so that both clones ended warm.
Warming only clone `a` would have left the paired `san-prop` measuring a
cold cache instead of the concurrency it is meant to isolate.

Apple clang 21.0.0 (`clang-2100.3.34.2`) is installed on all three Mac
minis, each with the `libclang_rt.asan_osx_dynamic.dylib` and
`libclang_rt.ubsan_osx_dynamic.dylib` runtimes. Nothing about the
toolchain prevents these jobs from running on a Mac lane.


Measured walls
--------------

Full step timings are in [*solo.tsv*](./solo.tsv), with one row per job
per experiment and the concurrent job named.

| Job        | Experiments                            | Measured walls        | Derived mean |
| ---------- | -------------------------------------- | --------------------- | ------------ |
| `san-nat`  | `solo-nat`, `solo-nat-2`, `solo-nat-3` | 954.1, 949.9, 953.3 s | 952.5 s      |
| `san-prop` | `warm-prop-a`, `solo-prop`             | 698.0, 692.7 s        | 695.3 s      |

The hosted medians in `macosJobCosts` are 2,492 seconds for `san-nat` over
8 observations and 2,092 for `san-prop` over 8. Converting them the way
the rest of the table does, `(hosted median - setup) / (Mac wall - setup)`
with a 60-second setup share, gives a derived 2.725 for `san-nat` and
3.198 for `san-prop`. Pooled over both, the family ratio is a derived
2.9219, which rounds down to **2.9** by the convention the other families
use.

That makes this the slowest-converting Mac-eligible candidate except
own-key cases: `test262` is 4.2, `native support` 3.2, and native
fixtures 3.1.


Measured concurrency
--------------------

[*pair-jobs.tsv*](./pair-jobs.tsv) reports the three experiments that ran
both jobs at once, one per Mac lane of the same machine. The
`overlapped_factor` column follows the U25 definition: the overlapped
seconds of a job divided by the solo work left for that overlap. The
shorter job overlaps for its whole wall; the longer one finishes alone.

| Pair        | `san-nat` factor | `san-prop` factor |
| ----------- | ---------------- | ----------------- |
| `warm-pair` | 1.400            | 1.081             |
| `pair`      | 1.380            | 1.076             |
| `pair-2`    | 1.373            | 1.072             |

Rounded up to two decimals, the largest factors are **1.41** and **1.09**.
The whole-wall slowdowns, 1.21 to 1.23, are not the model's input and are
reported only to keep the raw ratio visible. A reader who takes 1.22 as
the pair factor understates the penalty, because two thirds of the longer
job's wall overlaps and the rest runs alone.

The 1.41 figure is the worst value in `selfHostedPairSlowdowns`, tied with
own-key cases beside native fixtures.


Derived effect on the schedule
------------------------------

[*model.tsv*](./model.tsv) records what `macosLanes(6)` produces once the
measured walls, the 2.9 ratio, and the pair factors are in the model, with
unmeasured pairings against this family given the pessimistic stand-in the
table's convention requires.

| Variant                      | Derived makespan | Hosted jobs | Hosted total | Per-lane bound |
| ---------------------------- | ---------------- | ----------- | ------------ | -------------- |
| Baseline, both suites hosted | 49.1 min         | 10          | 221.0 min    | 44.2 min       |
| Both suites Mac-eligible     | 56.9 min         | 12          | 234.3 min    | 46.9 min       |
| Property suite only          | 55.8 min         | 11          | 229.3 min    | 45.9 min       |
| Native suite only            | 49.1 min         | 11          | 224.8 min    | 45.0 min       |

Every variant is worse than the baseline, and the result does not depend
on the placement heuristic. The hosted total and its per-lane lower bound
are properties of the assignment's job set, not of the order the greedy
pass considered them, and both rise in every variant. Even a perfect
hosted packing would start from 45.0 to 46.9 minutes against the
baseline's 44.2.

The mechanism is capacity arithmetic, not instrumentation cost. Moving
both suites off the hosted pool removes a derived 76.4 hosted minutes.
Running them on Mac lanes consumes a measured 27.5 Mac-lane minutes, and
because a Mac-lane minute is worth 2.5 to 4.2 hosted minutes, the
test262 and `native support` work displaced to make room costs about 90
hosted minutes. The family's own 2.9 is below the 3.2 and 4.2 of the work
it evicts, so the exchange loses whichever suite makes it.


What this unit concludes
------------------------

The `host C sanitizers` family stays on hosted `macos-15` lanes. The
reason recorded in *tools/macos-job-costs.ts* is now a measurement rather
than an absent one: the family converts at 2.9, below every family it
would displace, and its own pair factor is the worst in the matrix.

Two limits are worth stating. The ratio rests on one hosted median per
suite, each over 8 observations, and the Mac side has three solo walls for
`san-nat` and two for `san-prop`; the spread within each set is under half
a percent, so the means are tight, but a change in either suite's corpus
invalidates the ratio rather than scaling it. The pair factors were
measured only for this family against itself. Every pairing against
another family uses the pessimistic stand-in, so a measurement of those
could only lower the penalty, and the `native only` variant shows that
even a penalty of zero on the displaced work leaves the hosted bound
above the baseline.

The measurement also does not argue for keeping the jobs hosted on cost
grounds. It says the opposite about billed minutes: the two jobs spend a
measured 75.9 minutes of hosted macOS time per run, which Mac lanes would
absorb in 27.5. Reclaiming that bill would need Mac capacity this
configuration does not have, so it is a reason to revisit the question if
a fourth Mac mini joins, not a reason to accept 2.7 to 5.5 minutes of
makespan now.
