U4 harness object cache measurement evidence
============================================

Purpose and provenance
----------------------

These files preserve the sources of the U4 local timing series and the object
byte and cache occupancy observations in
[*gate-cost-baseline.md*](../../gate-cost-baseline.md). U4 rejected a cross-job
harness object cache, and the one positive cold-minus-warm pair in the series,
63 s on macOS at pool 8, supplies the per-object rate behind that decision and
behind the projected bound at 41,091 paths. That rate therefore needs a citable
source rather than a recollected number.

Every log line here is verbatim from the original run logs or command output.
The shard logs are compacted: each run's per-path progress output is dropped
and its header, build counters, corpus summary, wall time, and exit line are
kept. Nothing was re-measured to produce them. The directory holds no object,
cache, archive, or binary.

The measurement ran on 2026-09-27 and 2026-09-28 from the branch
*m5ci-harness-object-cache*. Timestamps taken from the originating session's
own tool calls are marked as such and converted to `+09:00`; timestamps inside
a run log are the log's own.


Preserved observations
----------------------

[*linux-timings.log*](./linux-timings.log) holds all eleven local Linux runs:
the pool 8 warm-up, two cold and two warm runs at pool 8, and three cold and
three warm runs at pool 3. [*macos-timings.log*](./macos-timings.log) holds all
seven macOS runs: the pool 8 warm-up, one cold and one warm run at pool 8, and
two cold and two warm runs at pool 3. Each run records `objectsBuilt` and
`objectsReused`, so the cold and warm labels in the table are checkable rather
than asserted, and each records the upstream test262 revision, the native
target, the selected path count, and the pool it actually used.

[*object-sizes.log*](./object-sizes.log) holds the object byte measurement, with
the exact `tar -cf - *.o | zstd -3 -T0 -c | wc -c` invocation behind the
compressed figure. It preserves two observations. The first was taken while the
first cold run was still building, covers 92 of 96 objects, and produced the
33.5 MB and 226.0 MB values an earlier draft of the baseline carried. The
second covers all 96 and is the one the baseline now cites. The `MB` columns are
the commands' own divisions by 1048576, so they are binary megabytes, and the
baseline labels them MiB for that reason; the exact byte totals are in the file.
The restore rate the baseline applies to them comes from a decimal-megabyte
cache size, so the transfer estimate converts first.

[*cache-usage.log*](./cache-usage.log) holds the repository cache occupancy. The
original observation preserves the usage totals, 4,058,176,690 active bytes in
69 entries, but listed only the first 8 of those entries. A complete listing
taken during this preservation pass reports byte-for-byte the same usage, so it
describes the same cache state, and it shows twelve mise tool caches of 297 to
425 MB, not the four the truncated view suggested. Those twelve hold
3,884,787,042 of the 4,058,176,690 active bytes; the baseline's 3.78 GB is that
total in binary gigabytes. The baseline was corrected to the complete
listing.

[*saturation.log*](./saturation.log) holds the three structural observations
the same section cites: the reviewed subset's distinct harness signatures per
shard and per shard total, the pinned upstream suite's 75 signatures and the
300-key ceiling they imply, and the 51 of 79 first-parent steps on main that
leave every key input unchanged. The scripts that produced them are preserved
as [*shard-signatures.ts.txt*](./shard-signatures.ts.txt),
[*upstream-signatures.ts.txt*](./upstream-signatures.ts.txt), and
[*key-churn.sh.txt*](./key-churn.sh.txt); all three were re-run during this
preservation pass and reproduced the preserved output exactly.

[*environment.log*](./environment.log) records both hosts and establishes the
measured revision. The macOS clone has no *.git*, so its revision is
established by content: 129 of the 130 tracked files that the harness object
key covers are byte-identical to `e76e235b`, and the one that differs,
*tools/test262.ts*, is reproduced exactly by applying
[*pool3.patch.txt*](./pool3.patch.txt) to that revision. The file also gives
the host CPU, core count, OS version, `availableParallelism`, Zig pin, cache
directories, and the storage-fullness observations, including the 94 percent
reading the baseline cites.

[*pool3.patch.txt*](./pool3.patch.txt) is the pool-size override applied to the
throwaway macOS clone and nowhere else, as a unified diff that `git apply`
accepts. [*linux-scripts.sh.txt*](./linux-scripts.sh.txt) and
[*macos-scripts.sh.txt*](./macos-scripts.sh.txt) preserve the drivers that
produced the logs, including the inline Python replacement that originally
applied that patch. Script sources use *.txt* so that repository
formatting, lint, and line-length checks do not treat these historical files as
maintained source. None of them is a supported tool API. The three read-only
scans in *saturation.log* are safe to re-run against a checkout, and that file
gives the exact commands; the measurement drivers are not, because they delete
cache directories and launch hour-long gate runs.


Recomputing the table
---------------------

[*summarize.py*](./summarize.py) reads only the files in this directory and
prints the baseline's wall-time table, the cold-minus-warm differences it
derives before rounding, the per-object rates, the two projections built on
them, and the byte scalings. It also fails if a run in either log contradicts
what the baseline says every run shares: the same shard selection, and cold
runs that built 96 objects against warm runs that reused 96.

Three inputs it applies are constants declared at the top of the script rather
than values it recomputes: the ten shards' CI object counts, the 300-key
ceiling, and the 51/79 input-stability proportion. The first comes from the CI
job logs through the commands the baseline lists, and the other two are
reproduced by *saturation.log*'s scripts. The script does not derive the
transfer cost model, the cache occupancy, or the CI timing spreads; those are
separate observations or, in the transfer model's case, an estimate with no
observation behind it.

~~~~ sh
python3 docs/evidence/u4/summarize.py
~~~~


Not preserved
-------------

The ten shards' per-shard object counts come from the CI job logs, through the
commands the baseline lists, not from a file here.

The baseline says the runtime archive and toolchain were already present in
every run in its table. No log line records that; it rests on the run order,
because each table run followed that host's warm-up in the same cache
directory, and the drivers show that the directory persisted.

No macOS object bytes were measured; the aggregate byte projection assumes
macOS objects compress like these Linux ones. No GitHub Actions cache action
was ever exercised, so every transfer, publication, and eviction figure in that
part of the baseline remains an estimate with no observation behind it.
