U14 native spawn cost: Phase A evidence
=======================================

This directory holds the measurement scripts, the throwaway prototype, and the
compact outputs behind the U14 Phase A section of
[*gate-cost-baseline.md*](../../gate-cost-baseline.md). Nothing here changes
the reviewed corpus, the manifest, variants, targets, or sanitizer flags.
Every reviewed run recorded in *measurements.txt* completed without the
runner's own manifest comparison failing, which is what makes the results
identical: a run without `--update` serializes the shard it produced and
throws when it differs from the checked-in partitions.


Files
-----

 -  *host.log*: the Linux measurement host, the macOS comparison host, the
    toolchain versions, and the repository revision.
 -  *spawn-rss.mjs.txt*: a synthetic parent that allocates a chosen resident
    set and then times the synchronous `child_process.spawn()` call for a run
    of trivial child processes. It isolates the relationship between the
    parent's resident set and the cost of starting a process.
 -  *spawn-recorder.mjs.txt*: a `node --import` preload that wraps
    `ChildProcess.prototype.spawn`, the frame the V8 profile attributes the
    process start to. It counts every start the reviewed runner performs,
    groups them by command, records the main-thread time blocked inside the
    call and the resident set at that moment, and samples the resident set and
    V8 heap every second.
 -  *helper.mjs.txt* and *helper-bench.mjs.txt*: a standalone comparison of
    starting processes directly against starting them through one small
    long-lived helper process, from parents of two sizes.
 -  *worker-spawn.mjs.txt*: the same comparison for a `worker_threads` worker,
    which shares the parent's address space.
 -  *proto-helper.mjs.txt* and *spawn-helper-prototype.diff*: the
    measurement-only prototype. The diff adds an environment-gated branch to
    the Node host's `run` that forwards the request to the helper over an IPC
    channel. It is not proposed for the repository; apply it in a checkout at
    the revision named in *host.log*.
 -  *ab.sh.txt*: the A/B driver. The two arms differ only by the environment
    variable that selects the helper, so they alternate run by run with no
    rebuild between them.
 -  *ab-runs.tsv.txt*: every A/B run in the order the driver ran them, with
    its own wall time, runner duration, and host load, including the two
    repetitions taken under contention that no table uses.
 -  *measurements.txt*: every measured run, with host load.

The scripts carry a *.txt* suffix so that repository linting and formatting
skip them, as the earlier evidence directories do. Copy each to a scratch path
without that suffix before running it.


Reproducing
-----------

~~~~ sh
mkdir -p /tmp/u14
for name in spawn-rss.mjs spawn-recorder.mjs helper.mjs helper-bench.mjs \
    worker-spawn.mjs proto-helper.mjs ab.sh; do
  cp "docs/evidence/u14/$name.txt" "/tmp/u14/$name"
done
chmod +x /tmp/u14/ab.sh
export ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-native-spawn-cost

# 1. The relationship between the parent's resident set and a process start.
for mb in 50 250 500 1000; do node /tmp/u14/spawn-rss.mjs "$mb" 300; done

# 2. Main-thread attribution for one reviewed shard.
node --cpu-prof --cpu-prof-dir=/tmp/u14/prof tools/test262.ts --shard 1/100
cp docs/evidence/u13/cpuprofile-self-time.mjs.txt /tmp/u14/self-time.mjs
node /tmp/u14/self-time.mjs /tmp/u14/prof/*.cpuprofile 22

# 3. The census of the starts the runner performs, without the profiler.
OSEO_U14_OUT=/tmp/u14/spawns.jsonl OSEO_U14_LABEL=head \
  node --import /tmp/u14/spawn-recorder.mjs tools/test262.ts --shard 1/100

# 4. Direct against helper and worker-thread process starts.
for mode in direct helper; do
  for mb in 50 650; do node /tmp/u14/helper-bench.mjs "$mb" 300 "$mode"; done
done
node /tmp/u14/worker-spawn.mjs 650 300

# 5. The reviewed A/B, with the prototype applied and the workspace rebuilt.
git apply docs/evidence/u14/spawn-helper-prototype.diff
mise run build
OUT=/tmp/u14/ab-cpu4 REPS=3 CPUS=0-3 HELPER=/tmp/u14/proto-helper.mjs \
  /tmp/u14/ab.sh
~~~~


Limits
------

The Linux host is a shared developer machine running other lanes, so the
one-minute load is recorded for every run and each configuration was measured
at least twice. Shard 1/100 is the deterministic round-robin sample of the
reviewed order, not a hand-picked subset, but it is one 214-path sample of
21,383 paths. The macOS numbers here are micro-benchmarks on an Apple M4
desktop, not GitHub macOS runner measurements and not a reviewed run. What
they support is that no growth with the parent's resident set was observed
there and that no macOS saving was demonstrated, not that the platform is
free of every cost this unit is about.

The A/B was run against persistent caches. The Oseo compiler cache, which
`XDG_CACHE_HOME` locates, and the lane's `ZIG_GLOBAL_CACHE_DIR` survived
every run, the driver neither reset nor warmed them and recorded no cache
state, and it ran the base arm before the helper arm in every repetition. The
reductions it reports therefore do not separate the helper's effect from
possible cache warming across the sequence.

The `/usr/bin/time` resource figures for a helper arm are not comparable with
a direct arm's: the compiler and fixture processes are the helper's children
rather than the runner's, so the runner's own accounting no longer includes
them. Wall time and the runner's reported duration are the comparable
measures, and the A/B table uses those.
