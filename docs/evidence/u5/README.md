U5 Zig compilation cache sharing evidence
=========================================

Purpose and provenance
----------------------

These files preserve the sources of the U5 measurements in
[*gate-cost-baseline.md*](../../gate-cost-baseline.md). U5 closed sharing the
Zig global compilation cache between CI jobs as do nothing, and the decisive
observation is that a byte-identical repeat of one test262 shard reuses a
derived 0.21 percent of the cache entries the first run created. That number,
the cache size behind it, and the transfer rates it is weighed against
therefore need citable sources rather than recollected figures.

Every log line here is verbatim from the original command output. The shard
logs are compacted: each run's per-path progress output is dropped and its
header, build counters, corpus summary, wall time, and cache accounting are
kept. No compilation or timing experiment was rerun to produce them. The one
later measurement is the grouped byte classification in
[*one-shard-composition.log*](./one-shard-composition.log), taken by
reclassifying the cache that log's own run had already left on disk. The
directory holds no object, cache, archive, or binary.

The measurement ran on 2026-09-28 from the branch *m5ci-zig-cache-share*. Every
Linux subprocess used
`ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-zig-cache-share`. A competing gate
ran on the Linux host through the whole test262 series and finished during the
native series, between that series' first two arms, so each arm records its own
load average and only same-load pairs are compared.
The macOS measurements ran over `ssh macbook-air` in a probe directory under
*~/Desktop/*; they did not modify, commit, or push in the macOS project
checkout. Timestamps inside a log are that log's own.

U5 changed no workflow, triggered no branch CI run, and claims no
runner-minute reduction.


Preserved observations
----------------------

[*test262-shard-series.log*](./test262-shard-series.log) holds the four arms of
the cold and warm series: two cold and two warm runs of
`mise run test:test262 --shard 1/10` on `linux-x86_64-gnu`. Each arm records
the paths executed and their classifications, so the arms are checkable
against each other, and records the new cache entries, total cache bytes, and
total entry count, so the cold and warm labels are observations rather than
assertions. The two cold arms agree to 0.45 s and produce byte-identical cache
sizes.

[*one-shard-payload.log*](./one-shard-payload.log) holds a further cold run
whose only purpose is the transfer payload: the complete cache directory after
one shard, broken down by subdirectory, and its size under
`tar | zstd -3 -T0`. Its wall time and entry count reproduce the series' cold
arms, which is what ties this payload to that series.

[*one-shard-composition.log*](./one-shard-composition.log) holds a further cold
run and classifies every *o/* entry of the cache it leaves by the object the
entry holds, separating per-case work from the target-constant libraries. The
classifier is [*compose.py*](./compose.py). Its cache bytes and entry count
also reproduce the series' cold arms.

[*target-constant.log*](./target-constant.log) holds the cost of the one thing
a fresh job rebuilds that is identical in every job, *libcompiler\_rt.a* and
*libubsan\_rt.a* for the job's target. It links a trivial C program with the
exact flags *packages/toolchain-zig/src/index.ts* builds, twice for each
target on each host, against an emptied cache, and records the warm repeat and
the compressed payload. The macOS host has no `zstd`, so its compressed
figures are `gzip -6`.

[*path-sensitivity.log*](./path-sensitivity.log) holds the probe that explains
the miss rate. One harness translation unit is compiled twice with identical
bytes and identical flags apart from the staging directory the toolchain
embeds through `-ffile-prefix-map`. Each staging path produced its own cache
entry and a different *harness.o* SHA-256; repeating the invocation in the
same directory added no entry.

[*native-series.log*](./native-series.log) repeats the cold and warm
comparison on the other two native families, a `native` shard and a
`native support` extended property shard, to confirm that the test262 result
is a property of the staging path rather than of the test262 runner.

[*github-cache-throughput.log*](./github-cache-throughput.log) holds the runner
log lines behind the transfer rates: the mise cache restore and save intervals
and the runtime archive hits in five macOS jobs of run [36312192623]. The save
row's job does not log the size of the entry it wrote, so the file also
preserves the later job that restores that same key and does. It preserves the
three jobs whose `Failed to save: Unable to reserve cache with key` lines show
them racing for the one runtime archive key, and the repository cache
occupancy that the storage argument uses.

[*job-toolchains.txt*](./job-toolchains.txt) lists that run's jobs with the
toolchain each selects, which is how the baseline reaches 27 of 29 macOS jobs
and 19 of 20 Linux jobs using Zig.

[36312192623]: https://github.com/dahlia/oseo/actions/runs/36312192623


Recomputing the derived values
------------------------------

[*summarize.py*](./summarize.py) recomputes the derived values the baseline's
U5 section carries: the reuse counts and rates for all three families, the
cache composition shares, the observed transfer rates, and the cost of each of
the three options. Its inputs are the measured values quoted from the files
above, plus three quantities this unit did not measure and takes from other
sections of the baseline: the 64.6 percent input-stability proportion from U4
and the two macOS family totals from the family tables. Those three are named
as such in the script. It needs no network access:

~~~~ sh
python3 docs/evidence/u5/summarize.py
~~~~


Reproducing the measurements
----------------------------

The shard series, from the repository root, with a cache directory of your
own. A cold arm empties it; a warm arm keeps it. Keep the runtime archive and
remove the harness objects before each arm so the arms model a CI job:

~~~~ sh
export ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-zig-cache-share
export XDG_CACHE_HOME=/tmp/u5-xdg
rm -rf "$ZIG_GLOBAL_CACHE_DIR"                    # cold arms only
rm -rf "$XDG_CACHE_HOME/oseo/harness-objects"     # every arm
ls "$ZIG_GLOBAL_CACHE_DIR/o" | sort > /tmp/u5-before.txt
mise run test:test262 --shard 1/10
ls "$ZIG_GLOBAL_CACHE_DIR/o" | sort > /tmp/u5-after.txt
comm -13 /tmp/u5-before.txt /tmp/u5-after.txt | wc -l
du -sk "$ZIG_GLOBAL_CACHE_DIR"
python3 docs/evidence/u5/compose.py "$ZIG_GLOBAL_CACHE_DIR"
~~~~

The target-constant cost, for one target, against an emptied cache:

~~~~ sh
zig cc -target aarch64-macos -fsanitize=address,undefined -std=c11 \
  -Wall -Wextra -Werror -pedantic -O2 -c trivial.c -o t.o
zig cc -target aarch64-macos -fsanitize=address,undefined -std=c11 \
  -Wall -Wextra -Werror -pedantic t.o -o t.exe
~~~~

The transfer rates, while the source run's logs remain available:

~~~~ sh
gh run view 36312192623 --repo dahlia/oseo --json jobs \
  --jq '.jobs[] | [.databaseId, .name] | @tsv'
gh api --allow-escape-sequences repos/dahlia/oseo/actions/jobs/JOB/logs \
  | grep -a 'Cache hit for\|Received .* of \|Cache restored successfully'
gh api --allow-escape-sequences repos/dahlia/oseo/actions/jobs/JOB/logs \
  | grep -a 'Cache saved from\|Failed to save\|Cache Size'
gh api repos/dahlia/oseo/actions/cache/usage
~~~~
