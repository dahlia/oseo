U13 test262 serial bottleneck: Phase A evidence
===============================================

This directory holds the reproduction scripts and compact outputs behind the
U13 Phase A section of [*gate-cost-baseline.md*](../../gate-cost-baseline.md).
Nothing here changes the reviewed corpus, the manifest, variants, targets, or
sanitizer flags. Every run in *measurements.txt* produced the same reviewed
result set as the checked-in manifest shard.


Files
-----

 -  *host.log*: the measurement host, toolchain versions, and the repository
    revision the measurements were taken at.
 -  *phase-instrumentation.diff*: the measurement-only patch. It wraps the
    per-case and per-execution boundaries in timers and lets `OSEO_U13_POOL`
    override the pool limit. It is not proposed for the repository; apply it in
    a checkout at the revision named in *host.log*, as the reproduction
    section below shows.
 -  *phase-recorder.mjs.txt*: the `node --import` preload the patch reports
    to. It
    accumulates per-phase intervals, the Node process CPU, and event-loop
    blocked time, and prints one JSON line per run.
 -  *pool-sweep.sh.txt*: runs one reviewed shard repeatedly at several pool
    limits or under a `taskset` CPU restriction, recording tree CPU and host
    load.
 -  *cpuprofile-self-time.mjs.txt*: sums self time per function from a V8
    *.cpuprofile* so main-thread CPU can be attributed to named functions.

The scripts carry a *.txt* suffix so that repository linting and
formatting skip them, as the earlier evidence directories do. Copy each to a
scratch path without that suffix before running it. The recorded runs used
these scripts unchanged except that the preload was read from its in-tree
path rather than through `RECORDER`.

 -  *measurements.txt*: the measured run table and the per-phase per-execution
    costs from the least contended run.
 -  *cpu-profile-top.txt*: the main-thread self-time attribution for one pool 8
    run.
 -  *before-after.sh.txt*: the Phase B measurement driver. Each repetition
    runs one arm's six runs and then the other's, checking every changed
    source under *packages/* and *tools/* out of `BASE` and `HEAD` in turn and
    rebuilding between arms, so the two runs of a pair are minutes apart
    rather than adjacent.
 -  *pin-recheck-cost.mjs.txt* and *pin-recheck-cost.txt*: the cost of the
    per-execution pinned-toolchain recheck, and the script that measures it.
 -  *before-after.txt*: the Phase B before-and-after table, on an
    uninstrumented tree.
 -  *property-lane.txt*: the commands and counts showing that the property and
    native-support lane repeats the same per-execution work through
    *packages/testkit*, which this unit leaves unchanged.
 -  *ci-compare.py*: compares two CI runs' test262 job and execution-step
    seconds, and their per-family job minutes.
 -  *ci-comparison.txt*: its output for branch run 36496566681 against main
    run 36369711059.


Reproducing
-----------

The Phase A instrumentation patch is written against `98e66719`, the revision
in *host.log*, and Phase B changed two of the same files. Apply it in a
separate checkout at that revision rather than in the current tree.

~~~~ sh
mkdir -p /tmp/u13
for name in phase-recorder.mjs cpuprofile-self-time.mjs pool-sweep.sh; do
  cp "docs/evidence/u13/$name.txt" "/tmp/u13/$name"
done
cp docs/evidence/u13/phase-instrumentation.diff /tmp/u13/
chmod +x /tmp/u13/pool-sweep.sh
git worktree add /tmp/u13/phase-a 98e66719
cd /tmp/u13/phase-a
git apply /tmp/u13/phase-instrumentation.diff
export ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-test262-serial-bottleneck
export RECORDER=/tmp/u13/phase-recorder.mjs
mise run build

# Pool scaling on an unrestricted host.
OUT=/tmp/u13/sweep SHARD=1/100 REPS=2 POOLS="1 3 8 16" /tmp/u13/pool-sweep.sh

# CI-shaped runs: the whole process tree is restricted to 3 or 4 CPUs, so
# availableParallelism() picks the pool the runner would pick.
OUT=/tmp/u13/cpus3 SHARD=1/100 REPS=2 POOLS=default CPUS=0-2 \
  /tmp/u13/pool-sweep.sh

# Main-thread attribution.
OSEO_U13_POOL=8 node --cpu-prof --cpu-prof-dir=/tmp/u13/prof \
  --import "$RECORDER" tools/test262.ts --shard 1/100
node /tmp/u13/cpuprofile-self-time.mjs /tmp/u13/prof/*.cpuprofile 20
~~~~

The Phase B before-and-after table is reproduced on an uninstrumented tree,
from the repository root with the Phase B commit at `HEAD`.

~~~~ sh
cp docs/evidence/u13/before-after.sh.txt /tmp/u13/before-after.sh
chmod +x /tmp/u13/before-after.sh
BASE=98e66719 OUT=/tmp/u13/ba REPS=2 /tmp/u13/before-after.sh
~~~~

A cold Oseo object and archive cache is selected with a fresh
`XDG_CACHE_HOME`; the Zig global cache stays on the lane directory in every
run, so *measurements.txt* labels only the Oseo cache as cold or warm.


Limits
------

The host is a shared developer machine running other lanes, so `load1` is
recorded for every run and each configuration was measured at least twice.
Shard 1/100 is the deterministic round-robin sample of the reviewed order, not
a hand-picked subset, but it is one 214-path sample of 21,383 paths and its
per-path cost is not identical to a whole-corpus average. Every local
experiment here was run on that one Linux host, so the estimates the baseline
section derives from them, including its projections of macOS and Linux CI
time, are labelled as estimates. The one exception is *ci-comparison.txt*,
which is measured from two GitHub runs' own timestamps and covers both hosts;
it is one run per side.

An earlier branch CI run, 36451319573 on `f483a129`, was cancelled by the
coordinator about three minutes in, after a review of that commit found the
two cache-safety defects the pinned compiler and the snapshot-only runtime
bytes now close. Every test262 job was stopped during setup, so that run holds
no execution-step time. Branch run 36496566681 on `390cf60d` then succeeded in
all 58 jobs; *ci-comparison.txt* holds its comparison against main run
36369711059, produced by *ci-compare.py*. Both runs were measured once, so the
comparison is one observation per side.
