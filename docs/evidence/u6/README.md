U6 shard assignment evidence
============================

The current seven Linux file shards exclude both `caseShardedNativeFiles`
and `dedicatedLinuxNativeFiles` before cost partitioning. The latter contains
only *tests/property/m5-array-constructor.property.test.ts*, which runs all
120 extended cases in a required dedicated Linux job with its unchanged
1,800-second property limit. macOS file shards keep that file. The historical
measurements below retain their original input sets; they do not measure the
dedicated job.


Current Linux weight source (2026-10-27)
----------------------------------------

The Linux table now uses three successful runs: main [40401101765] at
`d4d81be9`, candidate [40442491966] at `98460f7c`, and [40454201429] at
`6aab0fc8`. All three observed the same 134 included files, 286 test
registrations per run, and four file workers per shard. Each entry is
`ceil(median(per-run sum(case_ms)) / 1000)`: sum every reported test-case
duration in a file within each run, take the median of those three sums,
then divide by 1,000 and round up to whole seconds. These derived weights
include concurrent test time; they are not isolated file latencies, job
wall times, CPU time, or conservative bounds.

The source job IDs, ordered by shard, are:

| Shard | 40401101765 (`d4d81be9`) | 40442491966 (`98460f7c`) | 40454201429 (`6aab0fc8`) |
| ----- | ------------------------ | ------------------------ | ------------------------ |
| 1/7   | 121847031054             | 121985959542             | 122023722631             |
| 2/7   | 121847031208             | 121985959637             | 122023722692             |
| 3/7   | 121847031011             | 121985959527             | 122023722851             |
| 4/7   | 121847031261             | 121985959575             | 122023722807             |
| 5/7   | 121847031100             | 121985959675             | 122023722742             |
| 6/7   | 121847030959             | 121985959612             | 122023722630             |
| 7/7   | 121847030943             | 121985959670             | 122023722816             |

[*linux-shard-weights.tsv*](./linux-shard-weights.tsv) retains the old
weight, each run's unrounded summed milliseconds, and the refreshed weight
for every file. A `-` in the old column means the file previously used the
409-second upper-median fallback. All included files now have measurements,
including the previously unlisted Annex prototype-boundary, generator-throw,
and primitive receiver inherited-Set files. The 137-entry Linux table now
has a 435-second upper-median fallback. No included file lacks a weight.

Three excluded files have no observations in these file-shard logs:
*tests/property/m5-array-constructor.property.test.ts*,
*tests/property/m5-object-own-keys.property.test.ts*, and
*tests/property/m5-reflect-namespace.property.test.ts*. They retain their
674-, 3,327-, and 2,299-second weights, respectively. Their dedicated and
case-shard jobs remain required. macOS entries and lanes are unchanged.
The earlier observations and estimates below retain their historical
provenance; this refresh supersedes their Linux file-shard values.

[40401101765]: https://github.com/dahlia/oseo/actions/runs/40401101765
[40442491966]: https://github.com/dahlia/oseo/actions/runs/40442491966
[40454201429]: https://github.com/dahlia/oseo/actions/runs/40454201429

### Reproduction and model comparison

The downloaded inputs are *jobs.txt* and *<sha8>-<shard>.log* under
*/home/dahlia/.local/state/oseo-m5c/aws-gate-work/linux-shard-logs/*.
[*linux-shards.py*](./linux-shards.py) reads only these files and source
text. It starts at the `native-shard` marker, excluding setup tests and
package build output. Each complete reported title occurs in exactly one
selected property source. The script rejects missing or ambiguous matches,
empty file observations, duplicate membership, a missing shard, a changed
worker count, and incomplete or nonpassing test counts. It reproduces the
retained TSV and verifies the checked-in Linux table against the derivation.
It never imports or executes a property file and needs no network access.

~~~~ sh
python3 docs/evidence/u6/linux-shards.py \
  /home/dahlia/.local/state/oseo-m5c/aws-gate-work/linux-shard-logs \
  > docs/evidence/u6/linux-shard-model.txt
~~~~

[*linux-shard-model.txt*](./linux-shard-model.txt) retains exact modeled
seconds. The following loads are modeled minutes, ordered by shard index.
Both comparisons use the current 134-file inventory, with all three
excluded files omitted.
The model preserves descending cost/path order, batches of four, the first
least-loaded shard and worker on ties, and four workers per Linux shard.
The old table keeps its original fallback for the three unlisted files.
The script also verifies that the old seven-shard partition reproduces
every source log's selected file order exactly.

| Weights   | Total | Per-shard modeled minutes                                     | Mean  | Maximum | Maximum/mean |
| --------- | ----- | ------------------------------------------------------------- | ----- | ------- | ------------ |
| Old       | 7     | 44.12, 38.35, 39.28, 38.30, 37.90, 38.03, 39.98               | 39.42 | 44.12   | 1.119        |
| Old       | 8     | 44.12, 32.62, 33.88, 32.62, 32.90, 32.82, 33.83, 33.77        | 34.57 | 44.12   | 1.276        |
| Old       | 9     | 44.12, 29.43, 29.02, 29.42, 29.57, 28.78, 29.08, 29.15, 29.42 | 30.89 | 44.12   | 1.428        |
| Refreshed | 7     | 69.33, 46.67, 46.25, 47.07, 48.12, 48.40, 47.70               | 50.50 | 69.33   | 1.373        |
| Refreshed | 8     | 69.33, 39.75, 39.65, 40.25, 40.90, 40.88, 40.93, 40.85        | 44.07 | 69.33   | 1.573        |
| Refreshed | 9     | 69.33, 35.62, 34.62, 35.88, 35.25, 35.35, 37.10, 35.02, 35.42 | 39.29 | 69.33   | 1.765        |

The old table underestimates today's cost. Holding the refreshed costs
fixed and replaying the partitions chosen by the old weights gives:

| Total | Old partition scored with refreshed weights, minutes          | Maximum |
| ----- | ------------------------------------------------------------- | ------- |
| 7     | 44.55, 69.33, 35.67, 47.63, 58.10, 55.42, 36.38               | 69.33   |
| 8     | 44.55, 69.33, 38.28, 34.88, 36.87, 58.07, 48.50, 38.30        | 69.33   |
| 9     | 44.55, 69.33, 33.30, 34.70, 43.90, 34.58, 41.63, 42.07, 37.82 | 69.33   |

Keep seven shards. None of 7, 8, or 9 has a refreshed modeled maximum
within 15 percent of its mean or below today's modeled maximum.
*tests/property/m5-compound-assignment.property.test.ts* alone has case
sums of 4,376,166.421334, 4,136,065.359899, and 4,159,895.993499
milliseconds, giving a 4,160-second median weight. That indivisible file
sets the maximum for every total considered; more shards add jobs without
lowering that maximum. The old partition places it on shard 2, while the
refreshed partition places it on shard 1. Observed shard-2 runner walls
were 72.95, 68.95, and 69.35 minutes. Refreshing the table alone does not
establish a CI tail improvement. Reducing that tail requires a separate
workload change beyond this file-weight refresh.

The workflow matrix and generated workflow retain seven Linux file shards;
no regeneration is needed. Worker counts, exclusions, budgets, seeds,
and timeouts are unchanged. The unit tests check the chosen seven-shard
union plus all three excluded files against the full 137-file inventory,
reject duplicates, and require a positive measured weight for every
included file. They also check the table against all three retained sums.

### Combined with the compound assignment split

The refresh above was measured at `b4775e0b`, before the
`compound-assignment-property-cost` split and before main added two property
files. The publication that combines them keeps every refreshed weight and
changes the derivation's inventory in two ways:

 -  *tests/property/m5-compound-assignment.property.test.ts* is rebucketed.
    The script assigns each logged registration title from that file to the
    current source that defines it, so the same three runs yield
    2,086 seconds for the remaining file, 668 for
    *tests/property/m5-compound-member-fixed.property.test.ts*, and 1,408 for
    *tests/property/m5-computed-member-fixed.property.test.ts*. These equal
    the split's historical estimates below. They omit the new pure model
    properties' overhead and are not observations of the new files.
 -  *tests/property/m5-host-script-bindings.property.test.ts* and
    *tests/property/m5-proper-tail-calls.property.test.ts* landed after these
    runs and have no observations in their logs. They retain their 596- and
    1,726-second weights; the TSV records `-` samples for them, and the
    membership replay omits them because the source runs never scheduled
    them.

The Linux table now has 141 entries and a 443-second upper-median fallback.
[*linux-shard-model.txt*](./linux-shard-model.txt) is regenerated over the
combined 138-file inventory and still verifies every source log's selected
file order. Its old-table rows give the three split files no historical
weight of their own, so only the refreshed rows are tabulated here:

| Total | Per-shard modeled minutes                                     | Mean  | Maximum | Maximum/mean |
| ----- | ------------------------------------------------------------- | ----- | ------- | ------------ |
| 7     | 48.73, 48.87, 48.93, 48.77, 48.95, 48.82, 48.85               | 48.85 | 48.95   | 1.002        |
| 8     | 44.55, 43.17, 41.93, 42.93, 43.05, 44.02, 43.55, 42.98        | 43.27 | 44.55   | 1.030        |
| 9     | 44.55, 38.05, 36.90, 37.92, 38.25, 37.45, 37.42, 37.75, 38.48 | 38.53 | 44.55   | 1.156        |

The seven-shard total is unchanged. This projection assumes the historical
case costs persist; it is not a CI result.

### Local validation

The derivation reproduced the TSV and exact model output. A separate Node.js
replay through `selectNativeTestShard` matched all six old/new load vectors
at totals 7, 8, and 9, including exact coverage with no duplicates. The
macOS table and following case-shard estimates matched the pre-change source
byte for byte. No property suite, native suite, network request, commit,
or push was used.

Mise's default state directory is read-only in this sandbox. Use writable
local state and skip automatic dependency installation for offline checks:

~~~~ sh
export MISE_STATE_DIR="$PWD/.oseo-validation/state"
export MISE_CACHE_DIR="$PWD/.oseo-validation/cache"
export MISE_OFFLINE=true
mise run --no-deps check
mise run --no-deps generate:macos-lanes --check
~~~~

The workflow generator check passed. The full check stopped at
`check:lint`: aube found a missing workspace link for `@oseo/compiler` and
could not lock its read-only shared virtual store. Its completed Actions,
boundaries, evidence-lanes, inventory, line-length, and anti-slop checks
passed. A direct full TypeScript check also found missing workspace
dependencies and cascading diagnostics; no diagnostic named the changed
shard files. A focused TypeScript project extending *tsconfig.json* with
`include: []` and only *tests/native-shard.test.ts* in `files` passed.

~~~~ sh
node node_modules/typescript/bin/tsc --project tsconfig.json
mkdir -p .oseo-validation
cat > .oseo-validation/tsconfig-native-shard.json <<'JSON'
{
  "extends": "../tsconfig.json",
  "include": [],
  "files": ["../tests/native-shard.test.ts"]
}
JSON
node node_modules/typescript/bin/tsc \
  --project .oseo-validation/tsconfig-native-shard.json
~~~~

~~~~ sh
node --test --test-isolation=none --test-reporter=spec \
  tests/native-shard.test.ts
node --test --test-isolation=none --test-reporter=spec \
  tests/macos-lanes.test.ts
node node_modules/oxlint/bin/oxlint \
  tools/native-shard-costs.ts tests/native-shard.test.ts
~~~~

The in-process native shard tests had eight passes and one failure: the
existing singleton subprocess test received empty stdout and missed its
marker. A child-output probe also returned empty stdout. The macOS tests
had 35 passes and three subprocess failures: two `spawnSync` calls reported
`EPERM`, and the jactionlint subprocess timed out. These failures leave
subprocess validation incomplete in this sandbox. The unchanged workflow
passes direct jactionlint validation. Direct lint of
both changed TypeScript files passed after removing an import shadow.

The following checks avoid the affected subprocess tests. They passed seven
native partition/provenance tests and six workflow contract tests:

~~~~ sh
native_pattern='native property shards|Linux isolates|case-sharded files|'
native_pattern+='Linux jobs|Linux weights|native shards start|native wrapper'
node --test --test-isolation=none --test-name-pattern="$native_pattern" \
  tests/native-shard.test.ts
macos_pattern='every check name and concurrency policy is preserved|'
macos_pattern+='case duration contract|Linux|native support'
node --test --test-isolation=none --test-name-pattern="$macos_pattern" \
  tests/macos-lanes.test.ts
~~~~

Hongdown and Oxfmt checks, `node tools/check-lines.ts`, and
`git diff --check` passed. Hongdown retained two existing undefined historical
run-link warnings. Prose was reviewed locally under the no-network limit.


Compound assignment property partition
--------------------------------------

The `compound-assignment-property-cost` node moves only the complete fixed
compound-member and computed-member matrices into
*m5-compound-member-fixed.property.test.ts* and
*m5-computed-member-fixed.property.test.ts*. The shared
*compound-assignment-support.ts* retains their models, generators, printers,
and native/reference helpers. All seventeen original registration bodies
and the runtime syntax of all 76 original declarations compare equal to
base `6aab0fc8`; only exports and three required type annotations are added.
The matrices retain all 26 and 40 programs, respectively, both policies,
forced collection, reference discrepancies, expected observations, and
failure context. No program is batched or deleted. A separate pure audit
compares 660 structured samples and their printed source bytes across the
four original domains under ordinary and extended seeds and counts; all
match. This checks generator/printer fidelity without executing native
programs.

Every original generated domain, seed, case count, size, and deadline stays
in *m5-compound-assignment.property.test.ts*. Each new file adds a pure
model substitution property: a successful counting key converts exactly
once on a non-nullish base and never on a nullish base, and replacing it
with its returned string preserves the modeled outcome, event order, and
stored value after removing that conversion event. Each property generates
one structured subject, strictness, and an index in 0..100, with 64 ordinary
cases and a 30,000-millisecond interrupt limit. Their new blocks start at
`0x60008e00` and `0x60008f00`; all old assignments remain unchanged. The
ratchet reports 207 domains, 207 seeds, and 8,036 ordinary cases, up from
205, 205, and 7,908 on main `04aa14b3`, with zero overrides.

### Historical CI observations

The three Linux source jobs are 121847031208 in run 40401101765,
121985959637 in run 40442491966, and 122023722692 in run 40454201429.
The same-base macOS job is 122023721831 in run 40454201429. Every row
below sums the original registration durations, in seconds. The remaining
column subtracts exactly the two moved registrations; it is a workload
projection, not an observation of the new file partition.

| Source           | Whole file | Compound fixed | Computed fixed | Remaining original |
| ---------------- | ---------: | -------------: | -------------: | -----------------: |
| `d4d81be9`       |   4376.166 |        714.709 |       1469.589 |           2191.869 |
| `98460f7c`       |   4136.065 |        667.810 |       1388.887 |           2079.369 |
| `6aab0fc8`       |   4159.896 |        666.760 |       1407.595 |           2085.541 |
| macOS `6aab0fc8` |    975.957 |        108.819 |        180.367 |            686.771 |

The downloaded Linux inputs remain under
*/home/dahlia/.local/state/oseo-m5c/aws-gate-work/linux-shard-logs/*.
The macOS input, parsed per-registration records, sanitizer inputs, local
commands, source digests, and phase records remain under
*/data/m5c-compound-property-cost/*. CI reports registration totals only;
it does not report C generation, compiler, and execution phases separately.
The local phase measurements supply that distinction without inferring
unrecorded CI phase times.

The three Linux sanitizer property jobs measured 1,797.537, 1,464.219,
and 2,087.372 seconds for the original file. These are ordinary case sums,
separate from the native-support extended observations above. The last
run's two fixed matrices took 702.317 and 1,102.713 seconds; the remaining
registrations sum to 282.341 seconds. No candidate sanitizer result is
inferred from this partition.

A read-only replay of the `b4775e0b` refreshed Linux table, rebucketing
only these unchanged registrations, reduced the seven-shard model's maximum
from 4,160 to 2,866 seconds (69.33 to 47.77 minutes) over that table's
inventory. That projection excludes the new pure properties' overhead,
assumes the historical case costs persist, and is not a CI result. The
publication that combines both changes adopts the refreshed table; its
model, which also includes two later main files, is recorded above under
the current Linux weight source.

### Local measurements and scheduling inputs

The local Linux x86-64 baseline used Node.js 24.21.0, Deno 2.9.7,
Zig 0.16.0, the `generous` capacity prefix with no CPU quota and
`MemoryMax=104G`, and the worktree-specific Zig cache. Its whole ordinary
run passed all seventeen registrations in 456.923 seconds; the extended
baseline passed all seventeen in 1,145.765 seconds. These are wrapper
walls, separate from the registration sums used for scheduling.

The ordinary baseline used an external Node load hook to time front-end/C
generation, toolchain subprocesses, native execution, and reference-host
execution. The extended baseline additionally separated C emission from
the front end. Its hook loads the frozen original module bytes, whose Git
blob equals the property at `6aab0fc8`, at the original module URL; later
test extraction therefore cannot change the running baseline. Production
packages remain unchanged. Instrumentation adds timing overhead and is
not used in the candidate runs.

The extended command was `mise run test:property:extended:native:shard`
with `--import /data/m5c-compound-property-cost/phase-frozen-loader.mjs`,
`--test-reporter=spec`, and the original property file. With one explicit
file, the wrapper's Node test concurrency still executes only one file.
The task retains scale 10, seed 1592590339, size `large`, every original
case budget, and every original hard interrupt. It sets no case shard,
replay path, or time scale.

The measured extended phases below are seconds. Toolchain time includes
its identity/cache/archive requests when invoked; native execution
includes child-process startup and forced collection. Total is the
registration callback wall and also includes the front end, references,
fixture staging, and cleanup. Across the complete file the front end took
2.656 seconds, C emission 15.032, toolchain subprocesses 600.952, native
execution 451.539, and reference hosts 32.609. C generation alone is a
small part of this workload; splitting retains the large compilation and
execution observations unchanged.

| Registration                                                           | C generation | Toolchain | Native execution |   Total |
| ---------------------------------------------------------------------- | -----------: | --------: | ---------------: | ------: |
| compound assignment model keeps short-circuit writes conditional       |        0.000 |     0.000 |            0.000 |   0.000 |
| generated compound assignments match the M5 property model             |        0.363 |    26.983 |           26.304 |  63.564 |
| member reference model throws before a nullish base key                |        0.000 |     0.000 |            0.000 |   0.000 |
| fixed compound member references follow the ECMA-262 model             |        2.850 |    67.488 |           49.649 | 123.410 |
| fixed changing-key compound members convert once against V8            |        0.039 |     3.381 |            6.323 |  11.170 |
| generated compound member references convert their key once            |        2.137 |   170.966 |          110.627 | 305.286 |
| fixed awaited compound member keeps one converted key                  |        0.005 |     0.398 |            0.550 |   1.057 |
| fixed BigInt compound member keeps one converted key                   |        0.003 |     0.244 |            0.513 |   0.861 |
| computed member Reference model orders base, key, and value            |        0.000 |     0.000 |            0.000 |   0.000 |
| fixed computed member References follow the ECMA-262 model             |        6.806 |   114.617 |           86.621 | 213.708 |
| fixed relocated changing-key subjects convert once against V8          |        0.006 |     0.555 |            1.040 |   1.796 |
| fixed for-in and for-of member heads close before their errors         |        0.007 |     0.767 |            0.665 |   1.536 |
| fixed computed member References keep a primitive receiver             |        0.004 |     0.350 |            0.532 |   0.992 |
| fixed nullish computed member References report one diagnostic         |        0.007 |     0.579 |            0.636 |   1.277 |
| generated computed member References check the base, then convert once |        2.539 |   190.013 |          113.827 | 328.353 |
| assignment naming model names only bare identifier targets             |        0.000 |     0.000 |            0.000 |   0.000 |
| generated parenthesized assignment targets leave values unnamed        |        0.265 |    24.611 |           54.250 |  91.277 |

The candidate ordinary commands use `mise exec -- node --test` with
`--test-reporter=spec` and one explicit file each. All three pass without
skips: original 15 registrations in 95.970 seconds, compound fixed two in
123.347 seconds, and computed fixed two in 222.303 seconds. These are
wrapper walls. The baseline's first ordinary run also populated runtime
cache entries, while later commands reuse the cache. Light static checks
ran alongside some native work. These serial observations neither isolate
a total-work speedup nor predict concurrent CI file latency.

The candidate extended commands use the canonical task with
`--shard 1/1` and one explicit file each, retaining scale 10, seed
1592590339, size `large`, and the original per-domain limits. There is one
file worker and no native overlap. The original file passed all fifteen
registrations in 815.055 seconds, compound fixed passed two
in 129.477, and computed fixed passed two in
231.926. Their Node runner summaries were
813.663, 128.023,
and 230.515 seconds. All six candidate
ordinary/extended commands retained unchanged hashes of the three test
files and their support module.

The three serial extended walls sum to 1176.459
seconds against the 1,145.765-second instrumented baseline; their largest
file wall is 815.055 seconds. These observations show the
partition, not a reduction in total native work or proof of a CI wall
improvement. The new pure properties pass under both Node.js and Deno,
and 92 focused tooling tests pass. Full capacity-wrapped
`mise run check` passes; normal commit hooks repeat the check on the final
source.

The affected scheduling entries instead use the historical CI
registrations above. For each Linux partition, sum only its unchanged
registrations within each run, take the median of those three sums, divide
by 1,000, then round up: original 2,086 seconds, compound fixed 668, and
computed fixed 1,408. On macOS, divide the same-base source registration
sums by 1,000 and round up: original 687, compound fixed 109, and computed
fixed 181. These are historical partition estimates, not fresh candidate
file measurements or conservative bounds. They omit the new pure
properties' overhead and do not measure new file setup or placement.
Refresh from the first exact-candidate CI logs. All unrelated table entries
remain unchanged. In this `6aab0fc8`-based preparation, adding the two
entries grows each host's table from 134 to 136 entries. The unchanged
upper-median fallback consequently moves from 409 to 415 seconds on Linux and
stays at 296 on macOS. The three still-unlisted Annex prototype-boundary,
generator-throw, and primitive receiver inherited-Set files receive that
existing fallback rule; this is not a new measurement of those families.

The two new seed blocks were checked free at `6aab0fc8`, combined TCO+Host
`28d57fc5`, and observation train `f3360d7d`. Root identified the
`0x60008d00` host-script reservation before candidate native validation;
only the new families moved, to `0x60008e00` and `0x60008f00`, with no
old seed migration or override. The source, collision, and test-boundary
proofs remain in the raw packet. An initial baseline import failure before
any semantic registration ran required the new checkout's normal package
build; the failed preparation log remains preserved. The first static
check found two export-induced line-length violations, now corrected.

This changes no CI workflow, shard total, case-sharded or dedicated list,
job timeout, existing property deadline, reviewed test262 row, or production
package. Exact candidate CI, landing, and publication remain Root-owned.


Historical shared weight refresh (U39)
--------------------------------------

Refreshing the file weights lowers the modeled Linux maximum over seven
shards from 47.3 minutes to 44.1, holding one run's measured case costs
fixed. The first CI run of that partition measured 46.52 minutes against
47.77 before it, so most of the modeled 3.2 minutes did not appear; the
section on what the first run measured records why. The remaining 44.1 minutes
belongs to one file, *tests/property/m5-globalthis-binding.property.test.ts*,
whose summed case durations give it a 2,647-second weight. No whole-file
partition can model a shorter longest shard than that weight. The aggregate
work bound over all 132 refreshed files and 28 Linux workers is 35.7 minutes.
The next three weights are
*tests/property/m5-compound-assignment.property.test.ts* at 1,838 seconds,
*tests/property/m5-array-sort-stability.property.test.ts* at 1,637, and
*tests/property/m5-proxy-exotic-object.property.test.ts* at 1,559.

Run [39076279469] at `b59ac914` is the first CI run of the refreshed
partition, and *ci-39076279469.json.txt* retains its observations. Its
Linux maximum measured 46.52 minutes against 47.77 for run 39070198868,
which ran the superseded partition. The 3.2-minute modeled gain above did
not appear, and 1.25 minutes is inside the variation these two runs show.

The reason is that a derived weight is not reproducible between runs.
Across the 132 files, only 53 on Linux and 59 on macOS land within 20
percent of their value two hours earlier; Linux ratios span 0.50 to 1.80
and macOS 0.46 to 3.34. What is stable is the aggregate and the extremes:
Linux totals moved 0.951 times and macOS 1.032, and
*tests/property/m5-globalthis-binding.property.test.ts* measured 2,647
then 2,750 seconds on Linux. A weight sums a file's cases as they ran
concurrently with whatever else shared the job, so it moves with the
neighbors a partition happens to give it. The 0.26-to-3.59 range against
the superseded table therefore mixes real corpus growth with this
variation and is not evidence of drift alone.

The partitioning rule is sound in both runs. Replaying run 39076279469's
partition with its own case sums in observed order matches all seven walls
within 0.68 minutes, as the earlier run matched within 0.53.

The table choice barely matters while one file sets the maximum. Scored
against both runs' observed costs, the partition chosen from run
39070198868, the one chosen from run 39076279469, and the one chosen from
a maximum over both all give the same 45.8-minute worst case; only the
superseded partition is worse, at 47.3. Restoring a two-run maximum would
change no partition decision. Case-sharding
*tests/property/m5-globalthis-binding.property.test.ts* is the one change
that can lower the Linux maximum, and it is the next unit.

*tools/native-shard-costs.ts* now derives from main run [39070198868] at
`c78d9df1`, which observed all seven Linux and all twelve macOS file
shards under one set of toolchain pins, Node.js 24.21.0 and Deno 2.9.7.
*ci-39070198868.json.txt* retains its measured case durations. Each
refreshed entry is that file's summed case milliseconds divided by 1,000
and rounded up. `python3 docs/evidence/u6/summarize.py` derives the same
weights internally and reproduces *model.txt*; it does not read or check
the TypeScript table, which was compared against its derivation by hand.
The refresh covers 132 files per host. The two entries in
`caseShardedNativeFiles` keep their older values, because CI excludes
those files from the file shards and this run did not observe them there.

The superseded table was stale file by file rather than uniformly. Across
both hosts its entries range from 0.26 to 3.59 times the refreshed weight
for the same file, the extremes being
*tests/property/m5-import-attributes.property.test.ts* on Linux and
*tests/property/m5-math-namespace.property.test.ts* on macOS.

Replaying this run's own partition in its observed file order gives a
47.3-minute longest shard against 47.8 measured, with per-shard
differences of 0.38 to 0.53 minutes; *model.txt* carries all seven.
`selectNativeTestShard` already simulates each shard's workers and assigns
a batch to the shard with the shortest modeled completion, so this replay
is evidence that stale weights, not the partitioning rule, produced the
error. One run's agreement does not establish the model across runs.

Two limits apply. The refresh replaces a maximum over two historical
observations with a single newer observation, so it provides no estimate
of run-to-run variation and the weights are not conservative bounds.
Second, the hosts are not comparable across sources: over the 132
refreshed files, total weight falls 18 percent on macOS and rises 10
percent on Linux, or 16 and 9 percent over the complete tables. The
superseded macOS figures were measured on hosted runners, most macOS file
shards now run on Mac lanes, and this run's macOS jobs ran at three, six,
nine and twelve workers, which also changes how much concurrent time a
case accumulates. Per-job median ratios of refreshed to superseded weight
range from 0.55 to 1.42 with no monotone relationship to worker count.
These observations do not separate hardware, concurrency, file cohort and
implementation change.


Historical exceptions and estimates
-----------------------------------

The U39 weight-source runs above observed two families before later
changes grew them. The exceptions described below override that upstream table;
all other refreshed weights, including compound assignment at 1,838 Linux
and 1,242 macOS seconds, remain intact. None of the four changes file
inventory, seeds, case budgets, sizes, shard totals or interrupt limits.

### Destructuring assignment

The iterator-next-callability extension grows the existing destructuring
assignment family. Run 39070198868 sums its two recorded registrations to
210,558.734682 milliseconds on Linux and 127,460.293458 on macOS; those
baseline observations remain in the complete CI input and do not measure
the extended family.

CI run [39473400560] at `3170ba94` measures the extended family on both
hosts. Job `native support (linux-x86_64-gnu, 4/7)` records six case
durations summing to 1,219,306.454043 milliseconds, rounded up to the
1,220-second Linux weight; job `native support (macos-aarch64, 1/12)`
records six summing to 605,363.979249 milliseconds, rounded up to 606 on
macOS. Both sums include every registration of the file, as the source
run's do. They are concurrent case sums from one run, not job or file
wall times, and they are not conservative bounds.

The inputs are retained outside the repository under
*/data/oseo-m5c-reviews/*: the run metadata
*iterator-c1-ci-complete.json*, the log archive *iterator-c1-ci-logs.zip*,
the U8 registration index *iterator-c1-ci-test-names.json*, and the
extracted *iterator-c1-ci-extracted.json*. Rerunning
*docs/evidence/u6/extract-ci.py* at `30dab254` on the first three, with
run ID `39473400560`, reproduces the fourth byte for byte. These values
replace the earlier local Linux observation of 916,409.436758 milliseconds
and its provisional 987-second macOS estimate from the historical 198/184
host ratio; the CI observation measures macOS directly.

[39473400560]: https://github.com/dahlia/oseo/actions/runs/39473400560

### Object binding

The `destructuring-binding-target-order` node adds two native
registrations to *tests/property/m5-object-binding.property.test.ts*.
Run 39070198868 measured the earlier file at 131 Linux and 122 macOS
seconds. On October 21, 2026 a local Linux single-file extended run at
`4be1c732` (tree `084bb54e`) executed

~~~~ sh
mise run test:property:extended:native:shard \
  --shard 1/1 tests/property/m5-object-binding.property.test.ts
~~~~

with the task's unchanged `OSEO_PROPERTY_RUN_SCALE=10`,
`OSEO_PROPERTY_SEED=1592590339` and `OSEO_PROPERTY_SIZE=large`, one file
worker, `MISE_JOBS=1`, and no CPU quota. All five registrations passed:

 -  `object binding model checks nullish inputs before computed keys`:
    0.78685 milliseconds;
 -  `generated object bindings match the M5 property model`:
    87,772.211719 milliseconds;
 -  `with keyed binding model resolves before GetV and the default`:
    0.61342 milliseconds;
 -  `a minimized with keyed case reports forced collections`:
    1,424.412803 milliseconds; and
 -  `generated with-scoped keyed bindings match the M5 property model`:
    145,501.326048 milliseconds.

Their sum is 234,699.350840 milliseconds, rounded up to the 235-second
Linux weight; excluding the two model tests would not change it. This is
one local observation of a file running alone, not a CI measurement, file
wall time, or ordinary property cost, and it estimates no variation. The
raw output, timestamps and exit status are retained outside the
repository under
*/data/m5c-destructuring-binding-target-order/cost-refresh-20261021/*.

The scheduling table was edited after the wrapper selected this single
file and before the measurement ended. The HEAD, property file, and
native implementation stayed unchanged; the final working tree had one
modified scheduling file. These durations cover the selected file and
do not establish a clean-tree gate for the final scheduling table.

The current macOS cost of this file is unmeasured. Its 219-second weight
is the provisional estimate `ceil(235 * 122/131)`, using the file's own
host ratio in run 39070198868. It is not a Mac observation, pass, or
bound, and must be replaced with an actual macOS CI case sum.


Inputs and reproduction
-----------------------

*ci-36243816479.json.txt* and *ci-36261458909.json.txt* retain observed job
elapsed seconds, observed runtime-archive cold/warm state, measured individual
native case milliseconds, measured native runner milliseconds, and measured
test262 runner summaries. Sources are
main runs [36243816479] at `00153abe` and [36261458909] at `c9b3cc80`.
The measured reviewed count is 21,383 in each run. Native property inventories
are measured at 127 and 128 files, respectively. No manifest is regenerated.

*ci-36343919872-linux-1.json.txt* retains the interrupted branch job's measured
case durations, conclusion, counts, reported command/marker/failure timestamps,
and reported interruption-example count. Its scope is that one failed Linux
job, not the whole run. The historical compact inputs were regenerated with the
same extractor schema, including native counts and package-to-native intervals;
their case durations and the checked-in scheduling weights are unchanged.

The single-job input was produced from run metadata filtered to completed job
`108689202335`, retaining `headSha`. Its log was fetched with:

~~~~ sh
gh api --allow-escape-sequences \
  repos/dahlia/oseo/actions/jobs/108689202335/logs > job.log
~~~~

It was packaged as ZIP member *1\_native support (linux-x86\_64-gnu, 1\_4).txt*;
the extractor received that filtered metadata and single-entry archive with run
ID `36343919872` and the registration index for `e98edd15`. This avoids
requesting unfinished jobs or the unavailable run-level archive.

Fetch the source API and log archive with:

~~~~ sh
gh run view RUN --repo dahlia/oseo --json headSha,jobs > jobs.json
gh api repos/dahlia/oseo/actions/runs/RUN/logs > logs.zip
~~~~

The historical title index is produced by the existing U8
*docs/evidence/u8/test-names.mjs.txt* helper at each run's `headSha`, as
specified in *docs/evidence/u8/README.md*. *extract-ci.py* matches case titles
only within the exact historical selected property file set and fails on an
ambiguous match or a file with no observations. It never executes test sources.

~~~~ sh
python3 docs/evidence/u6/extract-ci.py RUN \
  jobs.json logs.zip names.json > ci-RUN.json.txt
python3 docs/evidence/u6/summarize.py
~~~~

*model.txt* preserves the latter command's derived/estimated output. Summed
case milliseconds divided by 1,000 are derived per-file scheduling weights,
not measured subprocess lifetimes. Historically
*tools/native-shard-costs.ts* kept the larger derived sum for each
file/host across the two runs named above; U39 instead took one run's sum.
The current Linux refresh takes three runs' median sums as recorded above.
Unknown
files use the upper median of that host's table. Run-varying costs are
outside canonical evidence, and no expected classification changes.

The test262 CI runner reports only aggregate duration, pool size, retries, and
classification counts. Its per-path CI distribution is unmeasured. U10's
local Linux native-execution sums for three detached-buffer paths are retained
in *docs/evidence/u10/new-metrics.json.txt*; they are neither CI path wall times
nor measured macOS weights, so U6 does not extrapolate them into a path table.

Three groups of entries were estimates or single-file measurements under
the superseded table: *tests/property/m5-array-sort-stability.property.test.ts*
from run 37884543813, the import-attributes family from an October 10, 2026
local Linux observation scaled by ten, and the class constructor
early-error family from an October 12, 2026 local Linux extended run. Run
39070198868 measures all three on both hosts, so none of them remains an
estimate and the reasoning that produced those values is superseded. Their
history is in this file's Git log.

M5c node `array-tolocalestring-arguments` adds fixed and generated locale
argument tests to *tests/property/m5-array-prototype-copying.property.test.ts*.
A local Linux whole-file extended run on 2026-10-22 at source `28d30410`
(tree `5777b8cb`) naturally exited zero with all four registrations passing
and none skipped. Their printed leaf durations were 162,487.199058,
0.866493, 15,456.485224, and 154,482.44049 milliseconds, for the existing
generated domain at seed `0x60004700`, the locale model unit test, the fixed
locale case, and the new generated locale domain at seed `0x60004701`. The
sum is 332,426.991265 milliseconds; rounding its seconds up gives the Linux
weight of 333. Build-tool durations are excluded. This is one local
case-duration sum, not a native CI or whole-suite result. The separate
process wall time was 333.811043 seconds.

The command was `mise run test:property:extended:native:shard --shard 1/1`
with this exact property file. It retained task scale 10, seed 1592590339,
size `large`, one file worker, and the existing per-domain budgets and
limits. The capacity profile was `generous` (`desktop-idle`), with no CPU
quota and a 104G memory cap. The source HEAD and tree were clean before and
after the run; the property digest was
`b1c712195b8033f989b676d5d87964e3127776ebb991cda290b686818269db46`. The
raw result, stdout, stderr, and duration lines are retained under
*/data/m5c-array-caller-promise-finish-20261022/*.

macOS remains unmeasured. Its weight of 347 is explicitly provisional:
`ceil(333 * 339 / 326)`, using this file's measured host ratio in run
39070198868. These replace the earlier provisional weights of 655 Linux and
681 macOS seconds, which scaled that run's weights by an earlier local ratio.
Replace the macOS estimate with an actual matching-host case sum when
available. This measurement establishes no final candidate CI or full
test262 UPDATE result and changes no case budgets, seeds, deadlines, or
shard totals.

The newer main run [36312192623] at `af9bb68c` is retained as the closest
before-run comparison.
`git diff af9bb68c 86228614 -- packages tests tools .github mise.toml` is empty
at the branch base `86228614`; all intervening changes are documentation. This
source uses the same Node.js 24.21.0 and Deno 2.9.7 pins as the experiment,
whereas the two weight-source runs use Node.js 24.18.0 and Deno 2.9.2. Its
measured inventory is the same 21,383 paths and 128 property files.
*ci-36312192623.json.txt* retains its observations; *summarize.py* replays
it, and at the time derived weights from only the two older runs. It now
derives them from run 39070198868 and replays all three historical runs.
Weights are not tuned to this comparison or to the after run.

The observed `objectsBuilt` counter is 96 to 128 per ten-way test262 shard
in the three retained main runs, with a derived sum of 1,117 per target per run.
Every counter is in the compact inputs. This measures current harness-object
preparation counts, not their macOS wall cost or their growth at 41,091 paths.
The first branch run retains these counters too: the derived target sum
is 1,312, an increase of 195 objects per target. Repeated preparation from
raising totals stays visible instead of being treated as fixed setup alone.

This additional replay estimates macOS execution max/sum at 50.81/295.62
minutes with positional assignment and 44.31/286.23 with the selected batch
partition, an estimated sum change of -9.39 minutes. Linux's corresponding
estimates are 64.17/226.97 and 58.58/215.37, a sum change of -11.60 minutes.
The same contention and cache limitations apply. Its derived observed job
max/sum is 51.43/306.93 macOS native minutes and 34.50/296.68 macOS
test262 minutes; these are further before observations, not improvements.

*summarize.py* also separates each family's job sum from its reported runner
sum. The derived difference is time outside that runner interval, including
setup, builds, package evidence on native shard one, input loading, and the
reporting tail. It is not an isolated fixed-cost measurement: test262's
canonical manifest parsing grows with the corpus. The baseline's separately
derived F remains the input to the extra-job projection. Archive cold/warm
observations are retained per job; Zig cache warmth is not established by
these runner summaries, and no cache hit is credited as an improvement.

[36243816479]: https://github.com/dahlia/oseo/actions/runs/36243816479
[36261458909]: https://github.com/dahlia/oseo/actions/runs/36261458909
[36312192623]: https://github.com/dahlia/oseo/actions/runs/36312192623


Model and decision
------------------

The native model simulates Node's file slots: start the next file on the first
available slot, add its summed case seconds, and take the maximum slot load.
Model widths are fixed at three for macOS and four for Linux, matching the
baseline hosted runner capacities. They do not change the actual concurrency
policy. A batch contains that many files, ordered by descending weight then
path; it goes to the shortest modeled shard, breaking ties by shard index.
Within each shard expensive files start first. Cost-sharded execution uses
Node's `run({ files })` API, because its CLI sorts file arguments again.
The wrapper logs the selected files and actual worker count for CI audits.
Every input appears once.

The first branch experiment interrupted Linux own-key at its unchanged
property deadline. The [failed-run analysis](./failed-branch-run.md) preserves
its measured durations, incomplete budget, and concurrent-file placement.
The corrected Linux candidate reserves a singleton first shard for own-key
when the total exceeds one and raises CI's total from four to five; four
cost-batched shards still execute every remaining file. A singleton uses one
file worker. macOS assignment and totals remain unchanged by the correction.

The positional replay estimates macOS tails of 67.13/50.73 minutes versus
observed job elapsed times of 68.13/51.58 minutes in the two source runs.
Its estimated summed execution is 298.45/273.89 minutes. The differences
include setup, build, file initialization, package evidence on shard one, and
reporting. Individual cases were measured concurrently; changed contention can
change their costs. These estimates do not prove a CI speedup or savings.

All following figures are derived/estimated minutes from those two run logs,
listed in run order 36243816479/36261458909:

| Native option | macOS execution max | macOS execution sum | Change in execution sum | Added macOS fixed cost |
| ------------- | ------------------- | ------------------- | ----------------------- | ---------------------- |
| Positional 12 | 67.13/50.73         | 298.45/273.89       | 0/0                     | 0/0                    |
| Plain LPT 12  | 59.42/42.98         | 321.86/284.07       | +23.42/+10.19           | 0/0                    |
| Batch 12      | 59.42/42.98         | 293.19/264.69       | -5.26/-9.20             | 0/0                    |
| Batch 13      | 59.42/42.98         | 295.98/266.01       | -2.47/-7.88             | +1.00/+0.95            |
| Batch 14      | 59.42/42.98         | 296.49/269.45       | -1.96/-4.43             | +1.99/+1.89            |

The fixed cost uses the baseline's derived macOS mean F of 59.82/56.81 seconds
per job. The native corpus is independent of reviewed test262 path count, so
these native estimates remain the same at 41,091 paths under the plan's
held-family assumption. Raising totals does not reduce the modeled native
maximum, because one expensive file remains indivisible. Plain LPT puts cheap
files beside each shard's expensive work and wastes parallel slots; its modeled
macOS workload increase fails the few-minute budget. Batch 12 is selected.

Linux's derived file-sum min/median/p90/max is
0.20/349.97/711.21/3,286.29 seconds in run 36243816479 and
0.28/349.12/722.84/3,326.07 in run 36261458909. macOS's corresponding
figures are 0.15/307.99/669.71/3,565.12 and
0.10/274.57/681.93/2,578.70 seconds. These are derived distributions of
measured case sums, not isolated file latencies. All files and cases are in the
compact inputs; all shard replays and Linux higher-total options are in
*model.txt*. At unchanged Linux total four the batch model estimates
55.44/58.37 minute maxima versus positional 85.52/86.30, with estimated
execution sums falling by 13.48/15.39 minutes.


Test262 options and timeout margin
----------------------------------

All following estimates use the baseline's measured job timestamps, derived
mean F, and constant residual rates. Repartitioning can change the workload
mix and cache costs, so raising totals does not guarantee the listed maximum.
The 41,091-path model assumes unchanged classification and variant mix.

| Test262 option        | Current macOS job max min | 41,091-path macOS job max min | Added macOS fixed min |
| --------------------- | ------------------------- | ----------------------------- | --------------------- |
| Positional 10         | 43.93/45.83 derived       | 82.72/86.78 estimated         | 0/0                   |
| Ideal cost balance 10 | 32.61/32.04 estimated     | 61.69/60.82 estimated         | 0/0                   |
| Positional 12         | 36.78/38.35 estimated     | 69.10/72.47 estimated         | +1.99/+1.89           |

Ideal cost balance assumes divisible work with no scheduling overhead; it is
an optimistic bound, not an implementable result from the available logs.
Raising totals estimates max as `F + (oldMax - F) * 10 / 12`; full-corpus
projection uses the baseline's slowest residual rate of 1.193/1.253 seconds
per path. Linux derived ten-shard maxima from observed job timestamps are
25.40/24.97 minutes; its job and runner durations for every shard remain in the
compact inputs. No cross-host cost substitution is used.

Current test262 workload is derived at 326.08/320.40 macOS minutes; the
41,091-path projection is 616.75/608.03 minutes at the baseline's
0.886/0.874-second family rates. Twelve jobs add only the fixed increments
above under this constant-work model. The ten-job worst projection still
leaves a derived 33.22-minute margin against the 120-minute timeout, so U6
raises the total to twelve for more margin as the corpus doubles. The least
favorable derived twelve-shard estimate leaves 47.53 minutes, an increase of
14.31 minutes of margin for 1.89 minutes of fixed cost from run 36261458909.
The initial combination was batch native assignment at unchanged totals plus
twelve test262 shards on each target. The Linux correction above supersedes
that platform's native total; it adds no macOS job. The estimated macOS native
execution saving offsets the added macOS fixed cost. Extra harness preparation
and cache effects are unmeasured; the corrected CI observation below compares
combined native/test262 workload against the few-minute limit.

Across all macOS families, the measured baseline's derived sums are
795.45/764.12 minutes at the current count and the plan projects
1,086.12/1,051.74 at 41,091. With five macOS slots the corresponding derived
wall lower bounds are 159.09/152.82 and 217.22/210.35 minutes. Applying only
the batch-12 estimated execution deltas gives estimated workloads of
790.19/754.92 and 1,080.86/1,042.54, and wall lower bounds of
158.04/150.98 and 216.17/208.51 minutes. These native-only bounds remain
workload-bound. The selected combination adds two test262 shards, giving
estimated workloads of 792.18/756.81 and 1,082.85/1,044.43 minutes, with lower
bounds of 158.44/151.36 and 216.57/208.89. The added fixed cost raises each
native-only bound by a derived 0.40/0.38 minutes. Tail control does not promise
an equivalent end-to-end wall reduction; raising totals is timeout insurance.


Validation and CI experiment
----------------------------

Native coverage tests partition the actual property file inventory, include
an unknown file, check disjointness and union equality, and verify independence
from input order. The test262 checked-in manifest test does the same union and
disjointness checks at CI's raised total twelve. Empty native partitions never
launch Node's default discovery, which would otherwise repeat the full suite.

Local correctness gates used
`ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-shard-sizing MISE_JOBS=1`.
At the first commit, `mise run check` passed, `mise run test` observed
1,394 Node passes, zero failures, five skips, two existing sanitizer TODOs,
and 21,383/21,383 test262 paths, and `mise run test:property:extended`
observed 224 native passes. After the Linux correction, the extended gate
again observed 224 passes, zero failures/skips/TODOs in 3,138.99 seconds.
The focused
`node --test tests/native-shard.test.ts tests/native-test-workers.test.ts`
command observed fourteen passes, including the wrapper's generated signal
tests. The corrected full `mise run test` exited zero in 5,668.60 seconds: Node
reported 1,403 tests, 1,396 passes, zero failures, five skips and the same two
TODOs; native fixtures matched 264/264 outputs and 265 cross-target builds
passed; test262 reported 21,383/21,383 paths with the unchanged
classifications, pool eight, and zero retries. Its local test262 objects were
reused (172 reused, zero built). These timings and cache observations are
correctness-gate context, not isolated scheduling improvements. Final
`mise run check` passed in 65.87 seconds. Independent Claude Fable 5.1 review
ended with `No issues found.` before the corrected implementation commit
`30dab254`. The explicitly authorized second branch run [36358067906] passed
all 58 jobs. The first branch experiment 36343919872 failed its Linux property
deadline and has incomplete generated work. Every native-support/test262 CI
shard and its archive state is retained below.

The completed failed experiment's full retained input is
*ci-36343919872.json.txt*. *first-branch-comparison.md* retains every native
support/test262 shard on both hosts against the closest before run, plus the
other macOS job durations and full-workload lower bound. Reproduce its tables
with *compare-ci.py* and the two compact inputs; all aggregates are derived
from measured durations/counters. The first-run Linux interruption prevents a
complete verdict, despite unchanged selected-file unions and path counts.

The [corrected-run comparison](./second-branch-comparison.md) retains every
shard from all three comparison runs. Its derived macOS native/test262 job
maxima from observed timestamps are 34.35/31.67 minutes, versus 51.43/34.50
before; derived combined macOS workload is 556.68 versus 603.62 minutes. All
macOS jobs sum to a derived 731.40 versus 778.12 minutes, with five-slot wall
lower bounds of 146.28 versus 155.62. This is one corrected run; variance and
cache effects are not separated. The same macOS own-key cohort varies by a
derived 11.80 case-minutes across branch observations. Linux singleton own-key
passes its unchanged budget in 41.36 measured case-minutes, leaving a derived
18.64-minute deadline margin. The full retained input is
*ci-36358067906.json.txt*; *macos-job-times.json.txt* retains the other macOS
job timestamps and complete workload denominator.

The macOS own-key assignment retains a deadline risk. Run 36243816479
measured that case at 3,565,117 ms, leaving a derived 34.88-second margin
against its configured 3,600-second extended deadline. The new macOS cohort
places it with reflect-namespace and proxy-exotic-object at three file workers.
Both branch observations passed, at measured case durations of 45.07 and
33.27 minutes, but their derived 11.80-minute spread exceeds that historical
margin. Those observations do not establish that this cohort preserves the
margin under runner variance. This documentation-only integration retains the
reviewed partition; a macOS singleton reservation remains a possible follow-up
if the coordinator authorizes changing the implementation and validating it.
U19 later moved the own-key file into three case-shard jobs on each host;
see the case-sharding section of [*PLAN-GATE.md*](../../../PLAN-GATE.md).

The final evidence-only `mise run check` also passed in 64.98 observed seconds
with the assigned Zig cache and `MISE_JOBS=1`; this is gate context, not a
performance measurement.

A complete local Linux `mise run test:property:extended` run on 2026-10-15
measured a summed case duration of 1132.411863192 seconds across all nine
registrations in *tests/property/m5-globalthis-binding.property.test.ts*.
The Linux weight is 1133 seconds, rounded up from that sum. The macOS weight
is also 1133, an explicitly unmeasured provisional estimate reusing the local
Linux sum, without a guaranteed conservative bound. These are not CI
measurements or file wall times. Replace both entries with actual native
CI case sums when available, including a fresh macOS observation. This
update changes no case budgets, seeds, deadlines or shard totals.

The `compound-member-assignment-key-order` node adds slot `0x60000c01` and
fixed native cases to *tests/property/m5-compound-assignment.property.test.ts*.
A local Linux single-file extended run on 2026-10-15, with the extended task's
`OSEO_PROPERTY_RUN_SCALE`, `OSEO_PROPERTY_SEED`, and `OSEO_PROPERTY_SIZE`
values, first measured 482.918 seconds across its seven registrations, of
which the five native registrations summed 482.916 seconds; that set the
earlier 483-second weight. Within a later local Linux
`mise run test:property:extended` on a candidate tree based on main
`6214c68c` with this node's uncommitted repair applied, all seven
registrations of this file then present passed, and its five native case
durations summed 599.532 seconds while the host ran under CPUQuota=1400%,
nice 5 and MemoryMax=48G; that historical measurement first set the
600-second weight. The node later moved the original BigInt observable-key
case from *tests/native/fixtures/bigint.ts* into this file as an eighth,
native fixed registration, with a reference-only console prelude. Within a
later local Linux `mise run test:property:extended` on a candidate tree based
on main `9e78357d` with the uncommitted repair (raw diff `03311b88`), all
eight registrations of this file passed, and its six native case durations
summed 599.822 seconds under the same CPUQuota=1400%, nice 5 and
MemoryMax=48G. These record this file's measurements only, not the outcome
of either whole run. The Linux weight stays 600 seconds, rounded up from the
later sum; the two model-only registrations, 0.833 and 0.672 milliseconds,
are not counted.
The macOS weight is also 600, an explicitly unmeasured provisional estimate
reusing the Linux value. Neither is a CI measurement, a file wall time, or an
isolated-file latency; replace both with native CI case sums when available.

The `parenthesized-assignment-function-name` node adds slot `0x60000c02`, a
native registration with ten ordinary cases, and one model-only registration to
*tests/property/m5-compound-assignment.property.test.ts*. On 2026-10-20 UTC a
focused local Linux x86-64 ordinary run of that registration alone, selected
by `--test-name-pattern=parenthesized` with a warm lane Zig cache, measured
7.981 seconds.

A local Linux x86-64 whole-file extended run at clean result
`a9cbe8cd68c58858afb65ea3a8e56f2da14bf234` naturally exited zero with all
ten registrations passing and none skipped. Their exact printed leaf
durations sum to 576282.402279000 milliseconds (576.282402279 seconds),
giving a Linux weight of 577 seconds after rounding up. This includes
model-only registrations and excludes build and plugin timing. The separate
process wall time was 577.672844 seconds.

The run kept task scale 10, seed 1592590339, size `large`, one file worker,
and the existing budgets and interrupt limits. The clean HEAD, tree and
property SHA-256 matched before and after execution. The property digest
was:
`8519ee57473b05d14a4f0816aceb522bac0068b18be7555815cef8bd31f7d5f6`.

Raw result, stdout, stderr and exact timing tokens remain under:
*/data/oseo-m5c-reviews/parenthesized-function-name-focused-extended1/*.

macOS remains unmeasured. Its modeled weight is 390 seconds,
`ceil(577 * 1242 / 1838)`, using the pre-Parent whole-file host weights in main
`dc1a00d9`, rather than the provisional 1,918/1,322 weights. This is one local
Linux case sum and an unmeasured macOS model, not final native CI, a
whole-suite result, or a full UPDATE. No case budget, seed, deadline or shard
total changes.

The `typed-array-construction-order` node adds slot `0x60006e01`, one fixed
native registration, one reference-only registration, and one compile-only
structural registration to
*tests/property/m5-typed-array-constructors.property.test.ts*. A local Linux
whole-file extended run on 2026-10-20 at source `dd61722a` naturally exited
zero with all five registrations passing and none skipped. Their printed
leaf durations were 259,680.754467, 989.162278, 11.824009, 21,001.860632,
and 240,342.915425 milliseconds. The sum is 522,026.516811 milliseconds;
rounding its seconds up gives the Linux weight of 523. Build-tool durations
are excluded. This is one local case-duration sum, including the reference
and structural registrations, not a native CI or whole-suite result. The
separate process wall time was 523.791058 seconds.

The command was `mise run test:property:extended:native:shard --shard 1/1`
with this exact property file. It retained task scale 10, seed 1592590339,
size `large`, one file worker, and the existing per-domain budgets and
limits. The capacity profile was `generous` (`desktop-idle`), with no CPU
quota or memory cap. The source HEAD, tree, clean worktree, and property
SHA-256 were identical before and after the run; the property digest was
`69e2c66eb0aac37433d468e3f330f6b7a7f0043fbebf55ce2bb5fae83390f322`.
The raw result, stdout, stderr, and duration lines are retained under
*/data/oseo-m5c-reviews/typed-array-construction-order-focused-extended1/*.

macOS remains unmeasured. Its weight of 225 is explicitly provisional:
`ceil(523 * 298 / 694)`, using this file's earlier measured host ratio in
run 39070198868. These replace the earlier provisional doubled weights of
1,388 Linux and 596 macOS seconds. Replace the macOS estimate with an actual
matching-host case sum when available. This measurement establishes no
final candidate CI or full test262 UPDATE result and changes no case
budgets, seeds, deadlines, or shard totals.

The TypedArray search-and-join property file now includes fixed and
generated toLocaleString element-argument coverage alongside its existing
search, join, and mutation cases.

A local Linux x86-64 whole-file extended run at clean source
`47d2d685fd3b06f0adb98bd96bec7d82df2bfac9` naturally exited zero with all
five registrations passing and none skipped, cancelled, or failed. Their
exact printed leaf durations sum to 285353.510650000 milliseconds
(285.353510650 seconds), giving a Linux weight of 286 seconds after rounding
up. That sum excludes build and plugin timing. The separate process wall
time was 286.831809 seconds.

The run kept task scale 10, seed 1592590339, size `large`, one file worker,
and all existing budgets and interrupt limits. Clean HEAD, tree, and
property SHA-256 matched before and after execution. The property digest
was:
`3090fae024d2e6736c5d3694cc911074d1af56ea308b866da326196ead3173f9`.

Raw result, stdout, stderr and exact timing tokens remain in
*/data/oseo-m5c-reviews/*, under
*typed-array-tolocalestring-arguments-focused-extended1/*
and its *actual-47d2d685/* child directory.

macOS remains unmeasured for this source. Its provisional weight is 135
seconds, the ceiling of the rounded Linux weight 286 times 174/369. That
ratio comes from the prechange file weights (macOS 174, Linux 369) in CI run
39070198868 at c78d9df1, as recorded by the checked-in table header. It
models the changed file from the earlier host ratio; it is neither a current
macOS measurement nor a conservative upper bound. Replace it with an actual
matching-host CI case sum when available. This is one local Linux whole-file
case sum, not final candidate CI, the fixed native fixture run, a
whole-suite gate, or a full UPDATE. No case budget, seed, deadline, or shard
total changes.

The `typed-array-feature-admission` node adds slot `0x60006e02`, its
compile-free oracle registration, and the fixed `typed-array-float16` native
fixture. The new generated domain keeps the family's 12-case ordinary
budget, both specialization policies, and forced collection. Until this
node's measurement, the file kept the weights above, 523 Linux and 225 macOS
seconds, which describe the pre-Float16Array file at source `dd61722a`.

A first local Linux whole-file extended run of this file at source
`e911ff73` exited 1 after 536.077 seconds of process wall time: six of its
seven registrations passed, and the generated Float16Array conversion
registration failed on a native Number formatting counterexample. That run
produced no accepted case sum and set no weight. Its raw result, stdout, and
stderr are retained under
*/data/oseo-m5c-reviews/f16-on-typed-R-focused-extended1/*.

The repair changed the shared shortest-decimal formatter. It added slot
`0x60004901` to *tests/property/m5-number-prototype.property.test.ts*: powers
of two and their one-ulp neighbors across the binary16, binary32, and
binary64 exponent ranges, checked against an independent exact BigInt
Number::toString oracle, with a 16-case ordinary budget. The existing
`0x60004900` domain, the Float16Array property, and every other domain keep
their draws, seeds, budgets, and limits.

At clean source `9085fef649cb3d034a589a7cd6bc528587255b20`, tree
`81497a11ffd3ad336866b9c8a617a388b3dddb4e`, both files were then run on local
Linux x86-64, each once through
`mise run test:property:extended:native:shard --shard 1/1` with that exact
property file. Each run kept task scale 10, seed 1592590339, size `large`,
the default Zig toolchain, one file worker, and the existing budgets and
interrupt limits. The capacity profile was `generous` (`desktop-idle`), with
no CPU quota or memory cap. Both exited zero naturally, with every
registration passing and none failed, skipped, or cancelled. The source HEAD,
tree, clean worktree, and the SHA-256 of each property file and runner were
identical before and after each run.

In *tests/property/m5-typed-array-constructors.property.test.ts* the seven
printed leaf durations were 238,215.316583, 1,121.824991, 14.123737,
20,937.132678, 260,192.567362, 0.981388, and 137,356.727887 milliseconds.
Their sum is 657,838.674626 milliseconds, so the Linux weight is 658 seconds
after rounding up. The property digest was
`ef8f8b1f2d88099bbbcd0ae35de4953f4a932f3242e6503a3a2b59909e3ee20d`.

In *tests/property/m5-number-prototype.property.test.ts* the two printed leaf
durations were 268,059.162287 and 146,054.989313 milliseconds. Their sum is
414,114.151600 milliseconds, so the Linux weight is 415 seconds after
rounding up. The property digest was
`30ca2e403cd207593193dd8fcc1e07aab2793d3b6750166740676c7a557b0ae0`.

The constructor sum includes its reference-only, compile-only structural,
and oracle registrations. Both sums exclude build, setup, and plugin timing.
They are not file wall times: the separate process wall times were 659.230165
and 415.788884 seconds. The raw result, per-file stdout and stderr, and
duration lines are retained in *run-actual-9085-20261021T0318/* under
*/data/m5c-f16-fixed-657-whole-file-measurement-preparation/*.

macOS remains unmeasured for both files. Their weights of 283 and 242
seconds are explicitly provisional, `ceil(658 * 298 / 694)` and
`ceil(415 * 544 / 936)`. Each ratio comes from that file's actual
complete-host case sums in run 39070198868 at `c78d9df1`, retained in
*ci-39070198868.json.txt*: the constructor file measured 693,527.437126
milliseconds on Linux and 297,143.357 on macOS, and the Number prototype
file 935,677.973483 and 543,173.108125. The table checked into that source
commit is superseded and was not used. Replace both macOS estimates with
actual matching-host case sums when available. These are local Linux case
sums and unmeasured macOS models, not native CI, a whole-suite result, or a
full test262 UPDATE. This update changes no case budgets, seeds, deadlines,
or shard totals.

The `regexp-pattern-extensions` property family now includes a native
generated dynamic group-name domain alongside its compiler model and pinned
identifier-table registrations.

A local Linux x86-64 whole-file extended run at clean composed source
`ef014905727a1a83e82677967cfa906fd2c09710` (tree
`cbf8c75cbdd325c7dea3aa231648d34a723765ac`) naturally exited zero with all
three registrations passing and none skipped, cancelled, or failed. Their
exact printed leaf durations are 72.050594 milliseconds for generated
pattern extensions, 1.14754 milliseconds for the group-name table, and
43021.130237 milliseconds for generated dynamic group names. They sum to
43094.328371000 milliseconds (43.094328371 seconds), giving a Linux weight
of 44 seconds after rounding up. That sum excludes build and plugin timing.
The Node test process reported 43310.739077 milliseconds; the mise task
finished in 44.63 seconds.

The run kept task scale 10, seed 1592590339, size `large`, one file worker,
and all existing budgets and interrupt limits. The branch was clean before
and after execution, and the property SHA-256 was:
`4ce4961db79a3d984d6da63cfb377831b370558e67244ee0986a41a46a190f8d`.

Raw result, stdout, stderr and exact timing tokens remain under:
*/data/m5c-regexp-computed-focused-prepare-20261023/logs/property-extended.log*.

macOS remains unmeasured. Its scheduling weight is the same 44 seconds as
Linux, solely as a Linux-based placeholder. The previous 1/1 entries
described the old compile-free-only file and provide no native host
calibration. This 1:1 choice is neither a measured host ratio nor a claimed
conservative upper bound. Replace the macOS placeholder with an actual
matching-host CI case sum when available. This is one local Linux case sum,
not final native CI, a whole-suite result, or a full UPDATE. No case budget,
seed, deadline, or shard total changes.

The `computed-member-reference-key-order` node adds slot `0x60000c03`, four
fixed native registrations, one native-only diagnostic registration, and one
model-only registration to
*tests/property/m5-compound-assignment.property.test.ts*. It also changes
the native oracle of slot `0x60000c00` without changing its generator or
budget. A local Linux x86-64 whole-file extended run on 2026-10-23 UTC, from
01:12:32 to 01:33:03, exited zero with all seventeen registrations passing
and none skipped. Their printed leaf durations sum to 1,229,239.865193
milliseconds (1,229.239865193 seconds), giving a Linux weight of 1,230
seconds after rounding up. That sum includes the model-only registrations
and excludes build timing. The new domain's generated registration took
360,068.256 milliseconds and its fixed Reference cases 225,203.202. The
earlier registrations took 637,876.904 milliseconds in sum, against the
576,282 of the previous whole-file measurement.

The command was
`mise run test:property:extended:native:shard --shard 1/1` with this exact
property file. It kept task scale 10, seed 1592590339, size `large`, one file
worker, and the existing per-domain budgets and limits. The capacity profile
was `generous` (`desktop-idle`), with no CPU quota and MemoryMax 104G. The run
used the node's uncommitted candidate on base `560162cd`. The property
SHA-256 matched the frozen copy before and after the run:
`1611ec44d2bbbb43f021f74e6d8b5a9ffa706ad7e597a0aa0d95e94159304ff0`.

An earlier validation run of the same command, from 00:51:11 to 01:12:06,
also passed all seventeen registrations. Its printed leaf durations sum to
1,254,206.335035 milliseconds; the 1,254,444.403766 milliseconds in its
summary line is the property runner's own duration, not that sum. It
started about eleven seconds before a behavior-neutral lint refactor and a
string split reached the file, so it does not set the weight. The raw
result, stdout, stderr, and duration lines of both runs are retained under
*/data/m5c-computed-member-reference-key-order-20261023/impl/heavy/*.

macOS remains unmeasured. Its weight of 832 seconds is an explicitly
provisional estimate, `ceil(1230 * 1242 / 1838)`, the same host ratio the
previous 390-second estimate used. This is one local Linux case sum and an
unmeasured macOS model, not native CI, a whole-suite result, or a full
test262 UPDATE. The weight of *m5-update-expression.property.test.ts* is
unchanged: its program only prints one more slot. No case budget, seed,
deadline, or shard total changes.

The `eval-intrinsic-value` node keeps the existing
*m5-global-object-record.property.test.ts* family and its slots
`0x60003d00`, `0x60003d01`, and `0x60003d02`, with the same generators,
case counts, and interrupt limits. A local Linux x86-64 whole-file extended
run on 2026-10-23 UTC, from 03:45:25 to 03:59:00, exited zero with all four
registrations passing and none skipped. Their printed leaf durations were
177,835.926278, 1,223.549717, 236,254.023391, and 397,419.862621
milliseconds. Their sum is 812,733.362007 milliseconds (812.733362007
seconds), giving a Linux weight of 813 seconds after rounding up. That sum
excludes build, setup, and plugin timing. The test runner reported
813,032.25161 milliseconds. The mise task wall time was 814.80 seconds,
including the build dependency.

The command was
`mise run test:property:extended:native:shard --shard 1/1` with this exact
property file. It kept task scale 10, seed 1592590339, size `large`, one file
worker, and the existing per-domain budgets and limits. The capacity profile
was `generous` (`desktop-idle`), with no CPU quota and MemoryMax 104G. The
lock wait was 0 seconds. The source commit was
`c933f64d23b681b8f648b6d0bbc560e8904f845b`, tree
`50a09b2c467580d4162104bf674fea855e66fe66`, and the worktree was clean
before and after the run. The property SHA-256 matched before and after:
`8faabc37930c40ddae37ef5a20b63db81f686bd3a0da2596d2e0ec1820d81a16`.

The raw stdout, stderr, capacity, lock, and command log are retained under
*/data/m5c-eval-computed-focused-prepare-20261023/*. macOS remains
unmeasured. Its weight of 498 seconds is an explicitly provisional
historical-ratio model, `ceil(813 * 210 / 343)`, using the previous Linux
343-second and macOS 210-second entries; it is not a macOS observation.
This is one local Linux case sum and an unmeasured macOS model, not native
CI, a whole-suite result, or a full test262 UPDATE. It changes no case
budget, seed, deadline, or shard total. The computed-node weight of 1,230
Linux and 832 macOS seconds is unchanged.

The later computed-super destructuring correction extends the fixed
Reference matrix from 36 to 40 programs and adds one compile-only
structural registration to *m5-super-targets.property.test.ts*. Both
existing generators gain null-home array and object targets. The Reference
and super-target slots keep their 20 and 16 ordinary cases, respectively,
with the same seeds, size limits, and 240,000-millisecond interrupt limits.
There is no new domain or seed allocation.

The prior whole-file measurements above are historical, before this
correction. The scheduling weights remain 1,230/832 seconds for
*m5-compound-assignment.property.test.ts* and 440/277 seconds for
*m5-super-targets.property.test.ts*, in Linux/macOS order, with their
original measurement or model qualifications. Comparable case sums from
the exact candidate CI are still needed to refresh materially stale
relative weights. Retaining these inputs is a provisional scheduling
limitation, not evidence that the changed files have the same cost. A
focused ordinary run cannot replace a whole-file extended measurement or
be combined with historical components and relabeled as one. The old raw
timings and source digests above remain preserved.

A focused Linux x86-64 ordinary run on 2026-10-23 UTC, from 08:56:50 to
09:01:47, passed four registrations with none skipped: the complete fixed
Reference matrix, the retained primitive-receiver cases, and the Reference
and super-target generated domains. Their leaf durations were
242,281.450091, 990.530819, 33,752.730639, and 20,116.070493 milliseconds,
respectively, summing to 297,140.782042 milliseconds. The runner duration
was 297,576.478999 milliseconds and wrapper wall time was 297.645185
seconds. This measures those registrations only, not either whole-file
extended cost.

The run used `mise exec -- node --test --test-concurrency=1` with an
anchored alternation of those four full registration names. It kept the
ordinary seeds, size limits, and case budgets, both policies, and forced
collection. The capacity profile was `active` (`maintainer-present`), with
CPUQuota 1400%, nice 5, and MemoryMax 88G. The shared heavy lock was held
throughout; its wait was below one millisecond. The source was the
uncommitted correction on replayed tip `c1dba333`, and both property file
SHA-256 digests matched before and after execution. The exact command,
digests, stdout, stderr, capacity snapshots, and wrapper timestamps remain
under */data/m5c-four-source-property-fix-20261023/*. These focused timings
do not change the historical whole-file weights or any case budget.

[36358067906]: https://github.com/dahlia/oseo/actions/runs/36358067906

### Primitive wrapper objects planning weights

The new *tests/property/m5-primitive-wrapper-objects.property.test.ts*
reserves 900 seconds on each host. Both entries are conservative planning
estimates, not measured extended durations or upper bounds. The two local
Linux ordinary registrations took 18,252.721235 and 23,255.609218 ms on
2026-10-23, summing to 41,508.330453 ms. This is a complete ordinary file
observation with 12 cases in each of two domains; it is neither an extended
run nor comparable candidate CI evidence. The focused process also ran four
fixed registrations and took 49.812 seconds overall.

A linear ten-times projection of those case durations is about 416 seconds.
The 900-second reservation leaves planning margin for the unmeasured larger
run, cold artifacts, host variation, and the unmeasured macOS host. It uses
no claimed macOS speed ratio. Replace both estimates with complete matching
host extended CI case sums when available. Raw commands, stdout, stderr, and
timing metadata are under
*/data/m5c-primitive-wrapper-objects-20261023/focused-ordinary.*.
No existing case budget, seed, deadline, or shard total changes.

### Script and Module declaration grammar

*tests/property/m5-script-module-declarations.property.test.ts* checks pure
parser/compiler behavior across package boundaries. It stays in
*tests/property/*, whose complete glob the native extended task collects.
Its two registrations therefore need scheduling weights even though they
build and execute no Oseo native artifact.

On October 24, 2026 KST, a local Linux observation ran from clean source
`a94d779fdb6f16bc729f21de6dc35f7688749c50`, tree
`c1f4847e81eb959aa9215e120e00e066b6fd84d1`. It started at
`2026-10-23T17:29:14.125586Z` and ended at
`2026-10-23T17:29:55.242893Z`, with exit zero and both registrations passing:

 -  `generated ModuleItems are admitted only by the Module goal`:
    21,356.579799 milliseconds; and
 -  `generated nested declarations precede unsupported conversion`:
    19,153.894982 milliseconds.

The sum is 40,510.474781 milliseconds. Rounding its seconds up gives the
provisional Linux weight of 41. The TAP runner duration, 40,785.25627
milliseconds, and the process wall, 40.985180203 seconds, are separate
observations and are not the weight. This is one local single-file extended
observation, not CI, an upper bound, or evidence of run-to-run variation.

~~~~ sh
$(oseo-capacity --prefix) env MISE_JOBS=1 MISE_TASK_JOBS=1 \
  mise run --skip-deps test:property:extended:native:shard \
  --test-reporter=tap \
  tests/property/m5-script-module-declarations.property.test.ts
~~~~

The task supplied the exact CI extended parameters:
`OSEO_PROPERTY_RUN_SCALE=10`, `OSEO_PROPERTY_SIZE=large`, and
`OSEO_PROPERTY_SEED=1592590339`. Both domains retained 64 ordinary cases,
giving 640 extended cases each and the existing scaled 300,000-millisecond
interrupt limit per domain. No replay path, case shard, or time scale was
set. There was one selected file and no file-shard flag; `--skip-deps`
omitted the package build because these properties import source directly.
The Node.js host was the pinned `v24.21.0` on `dorikom`, Linux x86\_64,
with an AMD Ryzen 7 7700X and 16 logical CPUs. The fresh capacity prefix
selected `generous`, no CPU quota, and `MemoryMax=104G`. The source tree
stayed clean throughout the measurement.

macOS is unmeasured. At measurement source `a94d779f` and pre-composition
base `8387dc9a`, each host's table held 135 entries. Sorting numerically and
selecting zero-based index `floor(135/2) = 67` gave unknown-file upper
medians of 401 Linux/286 macOS seconds. Adding only Script's explicit
41/286 entries gives 136 entries and index `floor(136/2) = 68`, with the
same upper medians. The macOS placeholder therefore kept this file's
assigned cost and the unknown-file fallback at 286 in that historical
Script-only calculation.

The integrated table at `6cbc6c9f` includes the continuation-dispatch
planning estimates below. Its 136 entries select index 68 at 406
Linux/296 macOS seconds. The increases to three existing generator/async
weights raise those unknown-file fallbacks; inserting the old median
alone does not. Script's explicit entries still assign it 41 Linux/286
macOS seconds, independently of the combined table's upper medians.
The macOS value remains a provisional unmeasured scheduling placeholder,
with no measured host ratio or bound. Refresh both host entries from
future exact-candidate extended CI case logs.

Raw TAP, stderr, timestamps, commands, runtime/machine metadata, source
hashes, the aggregate calculation, and the fallback calculation are retained
under */data/m5c-script-shard-cost-20261024/* as *measurement.stdout*,
*measurement.stderr*, *measurement.json*, *measurement-task.json*,
*before.json*, *aggregate.json*, and *base-fallback.json*. This cost update
changes no source, generated domain, seed, budget, deadline, shard total,
partition rule, or canonical test262 record.


Continuation dispatch nesting
-----------------------------

The `generator-dispatch-stack-charge` source preparation extends the existing
synchronous generator, ordinary async-await, and asynchronous generator domains
with zero through three nested dispatch wrappers. All previous semantic choices,
seeds, case budgets, size modes, and interrupt limits remain present. No
property file or seed family is added. The wrappers add compilation and
dispatch work; their relative cost has not yet been measured in an extended CI
run.

The provisional scheduling weights are twice each file's source-run weight:

| File                                  | Linux source | Linux provisional | macOS source | macOS provisional |
| ------------------------------------- | -----------: | ----------------: | -----------: | ----------------: |
| *m5-generator.property.test.ts*       |          444 |               888 |          232 |               464 |
| *m5-async-await.property.test.ts*     |          321 |               642 |          157 |               314 |
| *m5-async-generator.property.test.ts* |          226 |               452 |          190 |               380 |

These are unmeasured planning estimates in seconds, not CI observations, local
extended measurements, or conservative bounds. Replace them with each host's
summed registration durations from the exact candidate's full extended CI run.
Focused local ordinary results remain in
*/data/m5c-generator-dispatch-stack-charge-20261024/* and do not stand in for
those measurements. No shard total, input file, seed, or case budget changes.


F3-only generator-throw cost composition
----------------------------------------

The Main `f100ab8e` generator-throw weights, 47 Linux and 43 macOS seconds,
describe the old one-domain workload. F3 adds a second 15-case domain and
retires only those samples. Its original `df282b3f` 137-entry composition
had 409/296 upper medians; that is historical source-bound metadata.

This Main-based F3-only table has 135 entries per host. The unchanged upper
median rule derives 406 Linux/296 macOS seconds as unmeasured scheduling
estimates, not host costs, bounds or new native measurements. Main's Array
674/543 and every other retained entry remain unchanged. The failed Array
candidate's 1119/638 costs are not F3 measurements and are not copied.
Matching-host extended case sums and exact candidate gates remain required.
No width, shard total, seed, case budget, timeout or scheduling rule changes.


Annex prototype-boundary deletion extension
-------------------------------------------

The Annex prototype-boundary generator now includes user replacement and
successful deletion of the omitted intrinsic dependency, strict primitive
refusal and failed deletion of real descriptors. Its original domains, seed,
12-case budget and 180,000-millisecond interrupt limit remain unchanged.
The old 309-second Linux/451-second macOS samples from run 39070198868 at
`c78d9df1` do not measure this changed source and are retired. At first-repair
source 1c96126b, all remaining weights were unchanged. Its tables had 137
entries; their upper median at index `floor(137/2) = 68` was 409 Linux/296
macOS seconds. The existing unknown-file fallback assigns those values to the
changed file without a new explicit estimate. No assignment algorithm or shard
total changes.

The whole ordinary file passed once under each Linux compiler host:
`node --test tests/property/m5-annexb-proto-boundary.property.test.ts`
completed in 18.700712190 seconds, and
`deno test -A tests/property/m5-annexb-proto-boundary.property.test.ts`
in 20.994590090 seconds. Each reported one test registration. These command
walls are focused ordinary evidence, not extended case sums, CI weights,
macOS measurements or conservative bounds. Exact commands, source hashes,
resources and raw outputs remain under
*/data/m5c-primitive-set-annexb-repair-20261025/task\_f5c6ab875894/*.
The file requires matching-source extended CI case sums on both native hosts
before assigning new measured weights. Historical source-run observations
remain in *ci-39070198868.json.txt*.

The later integrity-metadata correction adds one fresh bounded subject to
each old Annex property case and leaves every old program, seed and budget
intact. The 18.701/20.995-second ordinary walls above predate that source.
No focused native or extended matching-host duration measures the expanded
source yet; its existing unknown-file fallback remains an unmeasured
scheduling value. No new weight, shard or timeout change is inferred from
plain JavaScript reference checks.


Set integrity focused ordinary Linux walls
------------------------------------------

Later, exact source `eab6f36600fa8863d17a84533711392e07d9955f` passed
eight whole ordinary Node.js/Deno commands once on Linux AMD64, with
28 actual registrations, unchanged source hashes/modes and natural owned
process/scope drain. The Annex property walls were 35.376709 seconds under
Node.js and 37.520988 under Deno; Set property-file walls were 111.521138
and 131.585252. The fixed generic Set/Array driver walls were 1.903703 and
4.741917. *PLAN-M5C.md* records all eight exact argv, counts and walls, with
full raw evidence sealed under
*/data/m5c-set-integrity-native8-20261025/task\_af9240358454/*.

These ordinary command walls measure the expanded eab6 integrity source,
separately from the earlier 1c96126b observations and source-only reference
checks. Both properties retain their original 12 cases, seeds and limits;
no filtering, scaling, timeout or retry was used. These are not extended
case sums, macOS measurements, sanitizer proof or conservative bounds.
The 134-entry 409/296 fallback remains an unmeasured composition estimate.
No 900 Set entry or other cost-table, shard or budget change follows.
Matching-source extended measurements on both native hosts and exact
candidate/Main gates remain required before assigning measured weights.

The subsequent for-in consumer correction adds a third fresh subject to the
Annex property while retaining its original two programs, arbitrary, seed,
12 cases and 180-second interrupt. Existing for-in generators retain their
domains, seeds, cases and limits. The eab6 walls above do not measure this
changed runtime/workload. Later
ordinary Linux measurements are separately source-bound: Annex property
64.951403/62.961854 seconds and Set property 153.286201/150.355762 on
46933fd3; fixed for-in/allocation 14.573503/18.845015, general for-in
30.717361/33.836163 and object-pattern for-in 36.476596/39.730977 on
97f06518, each pair Node.js/Deno. *PLAN-M5C.md* records exact argv and the
28-plus-12 registration composition, preserved failed command and raw packets.
The only intervening change enables the fixture's observation counter;
all runtime/program/generator/flag inputs for the retained first eight
commands are exact. Every measured command passed unchanged-source and
natural owned-process/scope-drain checks. No all-fourteen-on-97 result is
claimed.

These actual ordinary walls neither replace matching-host extended costs
nor bound current deadlines. No weight, fallback, shard or budget changes
follow. The required Array CI failure blocked that historical bundle;
it is not a dependency of standalone Set preparation. An earlier PASS
sample is not a current bound or publication clearance.


Standalone Set scheduling preparation on Main
---------------------------------------------

This source composition starts from exact successful Main
`cf0902db05ee8a51a2801f5d70372bfc5ca37b48`. Removing only the obsolete
Annex 309/451 entries leaves 134 entries per host and upper-median fallback
estimates of 409 Linux/296 macOS seconds. The primitive Set file uses that
existing unknown-file rule; it receives no new explicit weight. All Main
Array/TCO/F3 values and partition rules remain unchanged. The historical
measurements above keep their original source identities and do not measure
this composition or prove a deadline. Matching-host extended case sums and
exact candidate/Main gates remain required; no budget or timeout changes.


TCO source restoration on successful Main
-----------------------------------------

The Main-based source restores only historical TCO planning weights: Linux
1,726 from the complete local extended run on `87aeb56b`, and macOS 286 from
the then unknown-file fallback. Neither measures or bounds this source.
All other weights, widths, shard totals and case membership stay exact Main.

Original 8/8/6 draws, stable seeds, shrinking, replay and extended budgets
remain. Old `1fd374f6`/CI40165660431 interrupted 39/60 liveness draws; it is
failed incomplete coverage, not proof of runner variance or deadline margin.
No Array packing or indexed-runtime performance source is imported. Complete
matching-host candidate measurements remain required to replace weights.

TCO source on the pending Set candidate retains the Set retirement of Annex
samples309/451 and adds only historical TCO1726/286. The resulting135-entry
host tables keep409/296 upper-median fallbacks. No case, width, shard or
measurement claim changes; Set Full and old TCO execution stay source-bound.


Host Script bindings local Linux extended cost
----------------------------------------------

On October 27, 2026, source
`ab8d5d5c8b529abd46ba7c8b6b8fff28a040096e` (tree
`742a642a9e9de51663d93f99c3f42c0cb23f267b`) completed the existing focused
task once on Linux AMD64:

~~~~ sh
mise run test:property:extended:native:shard --shard 1/1 \
  tests/property/m5-host-script-bindings.property.test.ts
~~~~

The unchanged task uses `OSEO_PROPERTY_RUN_SCALE=10`,
`OSEO_PROPERTY_SEED=1592590339` and `OSEO_PROPERTY_SIZE=large`, one file
worker, and both original domains at 120 cases each. Each unchanged
240,000-millisecond base interrupt limit scales normally to 2,400,000.
Both specialization policies, forced collection, false hints, guard misses,
realm identity and abrupt results remain in every applicable generated case.
The two registrations passed with no failures, skips or cancellations.

Their measured durations were 299,418.921195 and 209,886.770563
milliseconds: sum 509,305.691758 milliseconds, divided by 1,000 and rounded
up to the new 510-second Linux weight. Gate wall time was
510.643981080 seconds and is not the weight. This is one complete local
extended observation, not CI, a macOS measurement, a speedup, a conservative
bound or an estimate of variation.

Before this entry, both host tables had 135 values. The existing unknown-file
upper median used index `floor(135/2) = 67`: 409 Linux/296 macOS seconds.
The macOS entry preserves that file's 296-second assignment as an explicitly
unmeasured scheduling placeholder, with no invented host ratio. After adding
only these two entries, the unchanged median rule derives 415 Linux/296
macOS seconds over 136 values. No other table entry, partition algorithm,
width, shard total, case, seed, size or interrupt limit changed.

The complete raw record, source snapshots and tool hashes remain under
*/data/m5c-host-script-bindings-20261027/*, task
`task_2d22aad7a394`, dispatch `ctx_60b42a8e012e`. Its
*native-property-extended01-unarmed/run/* directory holds the original five
raw files and three identical source snapshots; Root's accepted measurement
is *ROOT-ACCEPTED.json*. The separate
*cost-source-update/host-script-bindings-local-20261027.json* records the
exact source, physical input hash, argv, task controls, raw paths and hashes,
case-sum rounding and prior/resulting medians. Original raw SHA-256 values:

~~~~ text
gate.stdout.raw
1b3a6099c2765c247f3ecd0036943b138031d3e977842c9703997f26c5eb7f0a
gate.stderr.raw
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
commands/whole.stdout
a46dde3b43713647a9cabe0ebf5215cc7d959334a7a88e6dc6db6afbf81018f0
commands/whole.stderr
30222c44807d1c0cb5446169c30aed97d67cee4ef9595c081a0b49f1e2b414c9
commands/whole.json
1b3a6099c2765c247f3ecd0036943b138031d3e977842c9703997f26c5eb7f0a
~~~~

The process exited naturally and both actual process/scope drains were empty,
15.056243110 seconds apart. The measurement retains its ab8d source identity;
later metadata commits and any future GC composition are not new executions.
Matching-host candidate CI remains required to replace the macOS placeholder.

The later runtime-owned-call repair changes compiler inputs after this
measurement. The 510-second Linux weight remains the measured `ab8d5d5c`
scheduling baseline; it is not a fresh measurement or native pass for that
repair. macOS remains unmeasured at the 296-second fallback. A new
measurement requires the separately serialized author-heavy slot.

The subsequent Host/GC preparation on `beea6880` uses ABI `m5-140`. At
preparation it had no fresh property-cost measurement. The eight-case Node
and Deno runtime-owned-call passes on Host source `918a6d93` remain fixed
correctness observations, not property scheduling measurements. The later
composed-source measurement follows below.


Composed Host/GC local Linux extended cost
------------------------------------------

On October 27, 2026, source
`20d6119bac41c5a6c819a268476dec017a2475d6`, tree
`fbb16dadcaee5047ac692200d28efbc5ca56bd71`, ABI `m5-140`, completed once:

~~~~ sh
mise run test:property:extended:native:shard --shard 1/1 \
  tests/property/m5-host-script-bindings.property.test.ts
~~~~

The physical input SHA-256 was:

~~~~ text
30ee9e7bca3cdae7b96e081dbc6d0105df4bd7fee46546366c0be58be554b404
~~~~

The stock task retained scale 10, large size, shared seed 1592590339,
namespace seed inputs `0x60008d00` and `0x60008d01`, and 120 cases in each
of the original declaration-state and malformed-Script domains. Both
specialization policies, false hints, guard misses, forced collection,
independent oracles, shrinking and original budgets remain. Each
240,000-millisecond base deadline scales normally to 2,400,000. The actual
wrapper selected this single file with one worker; both registrations passed,
with no failures, skips, cancellations or TODOs.

Measured leaf durations were 375,794.693417 and 231,112.364509 milliseconds.
Their sum is 606,907.057926 milliseconds, or 606.907057926 seconds; rounding
seconds up gives the 607-second Linux weight. Gate wall was 608.559741115
seconds and is not the weight. The older ab8d 510-second observation above
retains its exact source identity. This replaces only the owning Linux
entry. All other weights and scheduling algorithms stay exact; both tables
still have 136 entries and derive upper-median fallbacks of 415 Linux/296
macOS seconds. macOS is unmeasured and retains its 296-second placeholder.
No host ratio, conservative bound, speed comparison or CI time is inferred.

The same fixed source also passed the handwritten runtime-C tail-call
fixture, new eight-case Node and Deno runtime-owned-call suites, original
twelve-registration Host suites under each framework, and ordinary generated
domains under each. All fourteen original subjects stay intact: thirteen
expected passes and the separate ordinary-eval ADR 0016 unsupported case.
These eight exact focused commands are Linux source-qualified correctness
observations; they establish no Full classification, admission or Main gate.

The durable packet remains under
*/data/m5c-host-script-bindings-20261027/*, task `task_2d22aad7a394`, dispatch
`ctx_60b42a8e012e`. The *native-composed-extended01/run/* directory holds the
five original raw files, three identical complete source snapshots, original
process identities and two actual empty drains; Root acceptance is
*ROOT-ACCEPTED.json*. Its parent *MEASURED-COST.json* records the exact
command/task inputs, source/physical identities and case-sum derivation.
The *integration-beea/FOCUSED-FIRST3-SUMMARY.json* and
*FOCUSED-LAST5-SUMMARY.json* record the full focused vector. Original raw
SHA-256 values, in gate stdout/stderr and command stdout/stderr/JSON order:

~~~~ text
gate.stdout.raw
d44b9812b83ca4d188d398c32ab81b6b5ac9040032ce0822b28ca21f7d07f6bc
gate.stderr.raw
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
commands/whole.stdout
288fda0ad7597f0c95efc0db2d36fd325f7f0ea475f67812e5ec86b283adea9c
commands/whole.stderr
7c0ace3e3238bd03664e0f321b1fa97c3bd204aae470a947c819c11f860d8b6c
commands/whole.json
d44b9812b83ca4d188d398c32ab81b6b5ac9040032ce0822b28ca21f7d07f6bc
~~~~

The gate exited naturally at 04:12:45.466304 UTC, root PID 1182015 with
start tick 48837315; 1,387 PID/start identities were sampled, not an
exhaustive execution count. The actual empty drains were
04:12:46.536409 and 04:13:01.592510 UTC, 15.056101484050 seconds apart.
Kernel ownership and controls passed with no foreign actor. Source snapshots
include exact tracked modes/bytes, dist/maps and dependency/tool identities.
The task's normal package build regenerated identical dist contents.

Later metadata commits do not become new executions. The cost module is
an actual extended-wrapper import and changes in this update; the observed
one-file/one-worker selection and unchanged case budgets remain explicit.
Compiled product and native fixture inputs stay exact `20d6119b`, while the
entire wrapper import closure is not claimed byte-identical. Matching-host
candidate CI and macOS measurements remain separate requirements.


Repaired Host source local Linux extended cost
----------------------------------------------

Two compiler repairs followed the `20d6119b` measurement: directive
completion values on `da99d0dd`, and global-object fallbacks for host Script
`with` pattern and loop-head writes on
`ce8ae0c84a632e414729872b5de928bac5ed4d2e` (tree
`42ebc5603083b92c9675dfbf04e7a65ef0ddd652`). Both change compiled product
inputs, so the 607-second weight above no longer describes the current
source. No author native command ran on `da99d0dd` itself.

On October 27, 2026, `ce8ae0c8` completed the same stock command once under
the heavy lock:

~~~~ sh
mise run test:property:extended:native:shard --shard 1/1 \
  tests/property/m5-host-script-bindings.property.test.ts
~~~~

The property file, its model, the seed registry and the test kit are
unchanged since `20d6119b`. The stock task again retained scale 10, large
size, shared seed 1592590339, namespace seed inputs `0x60008d00` and
`0x60008d01`, and 120 cases per domain, with the original policies, false
hints, guard misses, forced collection and deadlines. The wrapper selected
this single file with one worker; both registrations passed, with no
failures, skips, cancellations or TODOs.

Measured leaf durations were 366,133.017177 and 226,633.282946
milliseconds. Their sum is 592,766.300123 milliseconds, or 592.766300123
seconds; rounding up gives the 593-second Linux weight that replaces 607.
Gate wall was 594.017580763 seconds and is not the weight. macOS remains
unmeasured at its 296-second placeholder, every other weight is unchanged,
and both tables keep 136 entries. This is one-run scheduling data, not a
performance comparison or CI time.

The same source passed the other eight focused vectors listed for this node,
each a single natural run: directive completion four registrations, whole
Host suites thirteen, and runtime-owned calls eight, each under Node and
Deno; ordinary generated domains two under each. The Host suites include the
fourteen original subjects and the new with-fallback fixture. Raw output is
under */data/m5c-host-script-bindings-20261027/claude-native/*, one
*ce8a-NAME01/* directory per vector, with *SUMMARY-ce8a.json* recording each
command, exit status, and the clean `ce8ae0c8` identity before and after.
*SHA256SUMS-ce8a.txt* lists every raw file's hash. The extended raw hashes,
in stdout, stderr and gate JSON order, are:

~~~~ text
f8faf73ddb8eb5e6943060d1b1b4e6840d4c38739f91582a82ddae6b6ccc2d18
5b80f44ebc4c36cd5b2883baa45c5db4e7b1a0ae3c15726db5dd19bf21288fcc
a225e29f4af61041935ca2fac5b9e60dc01315147ca8285e69c07a62f66c9162
~~~~

These are Linux source-qualified correctness observations on `ce8ae0c8`.
They establish no Full classification, admission or Main gate, and the
later metadata commit that records them is not a new execution.


Host loop-head and alias repair local Linux extended cost
---------------------------------------------------------

`16bb5e917afbe90ab050805af151a5eacfb98dac` (tree
`cf9a53e9dae174604962a790d2374a294081b641`) resolves host Script `var` loop
heads through the Global Environment Record and records `const` aliases in
classic `for` heads. It changes compiled product inputs, so the 593-second
weight above no longer describes the current source.

On October 27, 2026, `16bb5e91` completed the same stock extended command
once under the heavy lock. The property file, its model, the seed registry,
the test kit and *mise.toml* are unchanged since `20d6119b`, so the task
kept its scale, size, shared seed, namespace seed inputs, 120 cases per
domain, policies, false hints, guard misses, forced collection and
deadlines. Both registrations passed, with no failures, skips,
cancellations or TODOs.

Measured leaf durations were 367,035.592429 and 228,307.203798
milliseconds. Their sum is 595,342.796227 milliseconds, or 595.342796227
seconds; rounding up gives the 596-second Linux weight that replaces 593.
Gate wall was 596.6 seconds and is not the weight. macOS remains
unmeasured at its 296-second placeholder, every other weight is unchanged,
and both tables keep 136 entries. This is one-run scheduling data, not a
performance comparison or CI time.

The same source passed the other eight focused vectors, each a single
natural run: directive completion four registrations, whole Host suites
fifteen, and runtime-owned calls eight, each under Node and Deno; ordinary
generated domains two under each. The Host suites include the fourteen
original subjects and the two new loop-head and alias fixtures. Raw output
is under */data/m5c-host-script-bindings-20261027/claude-native/*, one
*16bb5e9-NAME01/* directory per vector, with *SUMMARY-16bb5e9.json*
recording each command, exit status, and the clean `16bb5e91` identity.
*SHA256SUMS-16bb5e9.txt* lists every raw file's hash. The extended raw
hashes, in stdout, stderr and gate JSON order, are:

~~~~ text
fed73b867fc80e4e913f92d21797a1d9a49240d907b1f4fac7e85472a00452de
2b41a9c1e6e00966dd409097d2889b39142cd3ae1a2abc8803dd2f0e5baf5318
3768137cbd2a9a553a85135f1931e7deb73690dc5a3317a6e247053eb46d47c2
~~~~

These are Linux source-qualified correctness observations on `16bb5e91`,
made before its internal review. They establish no review verdict, Full
classification, admission or Main gate.


Module namespace and prelude Script candidate CI cost
-----------------------------------------------------

*tests/property/m5-module-namespace-uninitialized.property.test.ts* and
*tests/property/m5-module-prelude-script.property.test.ts* landed after the
three Linux source runs above, so neither table had an entry. Candidate
[40869736577] at `ad1a1eba` scheduled both at each host's upper-median
fallback and passed every native file shard. Its unit tests then failed
because the Linux jobs no longer covered the property inventory with
measured weights.

Both files were measured from that run's own file-shard logs. The extraction
uses the same rule as *linux-shards.py*: it starts at the `native-shard`
marker, maps each complete reported title to exactly one selected source,
requires every test to pass, and sums every case duration of a file. The
weight is that sum divided by 1,000 and rounded up.

| File                    | Host  | Job          | Cases | Case sum, ms  | Weight |
| ----------------------- | ----- | ------------ | ----- | ------------- | ------ |
| Namespace uninitialized | Linux | 123433597564 | 1     | 127167.963317 | 128    |
| Prelude Script          | Linux | 123433597780 | 2     | 485361.516405 | 486    |
| Namespace uninitialized | macOS | 123433598882 | 1     | 152327.246416 | 153    |
| Prelude Script          | macOS | 123433598882 | 2     | 360655.745708 | 361    |

The Linux jobs are file shards 2/7 and 3/7, and the macOS job is file shard
10/12. The Prelude Script sums include its pure model registration, 1.558146
milliseconds on Linux and 0.377833 on macOS.

Only one run observed these files. Each weight is a single observation, not
the three-run median the other Linux entries use, and estimates no run-to-run
variation. The TSV therefore records them like the other later files: the
weight in the old column and `-` for the three source-run samples.
*linux-shards.py* and the unit test list both files as retained. A later
three-run refresh should replace these values.

Both tables gain two entries: Linux has 143 and macOS 140. Their
upper-median fallbacks stay at 443 and 296 seconds. No other weight,
exclusion, width, or shard total changed. The regenerated
[*linux-shard-model.txt*](./linux-shard-model.txt) still reproduces every
source log's selected file order. Its refreshed seven-shard maximum is
2,991 modeled seconds, or 49.85 minutes, against a 2,948.71-second mean.

The three logs, their job list, the extraction script, and their SHA-256
sums are under
*/home/dahlia/.local/state/oseo-m5c/aws-gate-work/module-logs-40869736577/*:

~~~~ text
123433597564.log
f9a9e33ffe38c9c96e3888e79d7d8e6df470d8cd2bb530203fcf4d7b2f028975
123433597780.log
36ad9bc755979c030009c8883a7c02424e6c6b0a458d485a154cf0e3b539e89a
123433598882.log
bf13fabdf0540688093e274df059dbcdf26be32c99907de167622750e545dfd8
~~~~

[40869736577]: https://github.com/dahlia/oseo/actions/runs/40869736577
