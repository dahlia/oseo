Exhaustive RegExp literal evidence
==================================

*tests/property/m5-regexp-literal-exhaustive.property.test.ts* witnesses the
four DS-17 BMP literal paths of
[*dynamic-source-regexp-exhaustive.md*](../../m5c-graph/dynamic-source-regexp-exhaustive.md)
over their complete domains. This note records its cost and where CI runs it.


Domain and budget
-----------------

Each original selects 65,521 BMP code units. Build-time tests compile every
one as a literal in both strictness modes, which takes about 2 seconds per
plain domain and 4 per escaped domain. The plain domains accept all 65,521;
the escaped domains accept 14,737 and reject 50,784 as Annex B only.

Four native properties, one per original, execute every accepted literal
once: 160,516 literals in 40 programs of at most 4,096. One run is one
complete sweep, so `numRuns` is 1. The generated layout is the rotation of
the sweep, the function size, and the specialization phase that alternates
policies by program. The family reserves seed block `0x60009500` to
`0x600095ff`; the four properties use slots 0 to 3.

The interrupt limit is 600 seconds per property. A sanitizer lane widens it
only through its existing `OSEO_PROPERTY_TIME_SCALE`, 3 on Linux and 6 on
macOS, as CONTRIBUTING.md allows for that lane.


Measurements
------------

All runs used one 16-thread Linux AMD64 host under the heavy-lock capacity
prefix, with only this file running. Seconds are the four native properties'
durations, in path order A1.1, A1.4, A2.1, A2.4.

| Lane                      | Native properties (s)      | File wall (s) |
| ------------------------- | -------------------------- | ------------: |
| Zig, ordinary             | 117.5, 14.3, 89.6, 14.3    |           248 |
| Host clang ASan and UBSan | 387.2, 96.6, 319.0, 57.3   |           873 |
| Zig, extended (×10)       | 713.2, 154.6, 580.9, 125.9 |         1,585 |

Candidate CI run 41257794727 ran the file inside the extended native file
shards, before it was case-sharded:

| Job                                     | Runner and file workers   | Native properties (s)                   |
| --------------------------------------- | ------------------------- | --------------------------------------- |
| native support (linux-x86\_64-gnu, 3/7) | hosted `ubuntu-latest`, 4 | 4,274.6, 586.5, unfinished, not started |
| native support (macos-aarch64, 1/12)    | Mac lane `oseo-mac-2`, 12 | 938.9, 223.9, 514.1, 113.8              |

The Linux job reached its 120-minute timeout 2,292 seconds into A2.1. Its
two finished properties took 6.0 and 3.8 times their local extended
durations. The macOS job took 1,959 seconds, of which the file's properties
were 1,790.6.

The emitted C for one 4,096-literal program is about 14 MB. A top-level
program of more than about 4,000 literal statements exceeds the native frame
budget, and under ASan a function of 1,024 does too, which is why programs
group literals into functions of at most 256.


Placement
---------

**Extended native shards.** The file is in `caseShardedNativeFiles` in
*tools/native-shard.ts*, so the native file shards leave it out and the
`regexp exhaustive cases` jobs run it in five case shards on each native
host. The `native` aggregate requires all ten. The extended budget runs
each property's sweep ten times, and the case-shard filter gives shard *k*
the sweeps numbered *k* − 1 and *k* + 4, counting from zero, so every sweep
still runs exactly once on each host. Seeds, sizes, generators and the
6,000-second extended interrupt limit of each property are unchanged. As with
the Reflect namespace shards, the jobs write no duration record, because the
file has four properties and the recorder writes one record per job. Without
the file, both hosts' file-shard partitions are the ones from before the file
was added.

The Linux weight in *tools/native-shard-costs.ts* is 8,821 seconds, derived
from the CI run above. It sums the two measured properties and two
estimates: A2.1 and A2.4 take their local durations scaled by the measured
property of the same literal kind, 6.0 for plain and 3.8 for escaped,
giving 3,481.7 and 477.6 seconds. That is 882 seconds per sweep. The figure
comes from one job that shared four workers with three other files, so it
is not a dedicated job's time, and the two estimates are not measurements.

A Linux shard therefore needs an estimated 1,764 seconds of properties plus
about a minute of setup and build-time tests, 31 minutes in all, or about
half of the jobs' 60-minute timeout. A1.1, the slowest property, needs an
estimated 855 seconds of its 6,000-second limit per shard.

macOS has no hosted measurement of the file. The Mac lane job above gives
the derived 516 seconds per shard that *tools/macos-job-costs.ts* records:
one fifth of the four properties plus the 157.8 seconds the rest of that
job took, less its package suite. The hosted entry converts that at the
3.4 native support ratio to 1,610 seconds, and the shards borrow the native
support pair slowdowns. The Mac figure was measured beside eleven other
files and a busy partner lane, so it overstates one-lane work. The macOS
entry in the weight table stays the provisional 921 seconds, the earlier
local Linux weight of 1,585 seconds scaled by the 353/608 macOS-to-Linux
ratio of *m5-regexp-literal-aot.property.test.ts*; it now weighs only other
wrapper invocations.

The five Linux shards raise the run's hosted Ubuntu jobs from 35 to 40, the
count that U48 in *PLAN-GATE.md* reduced because some of them waited for
a slot.

**Ordinary Node.js shards.** The file adds about four minutes of local Zig
work to one shard on each host. No ordinary shard runs near a limit.

**Sanitizer property jobs.** The shared jobs were near their limits: the
Linux shards have a 60-minute timeout and shard 2 took 32 to 43 minutes, and
the unsharded macOS job measured a 41-minute median and a 52-minute maximum
under 75. The sanitizer run above would add 15 to 30 minutes of serial work
to one of them. `dedicatedSanitizerPropertyFiles` in *tools/native-shard.ts*
therefore lists the file, and the shared jobs run
`mise run test:sanitizer:property:shared`, which keeps Node's positional
shards over the complete list and drops only the listed file. Each host runs
it in a dedicated sanitizer job that the `native` aggregate requires.
*tests/sanitizer-property-shard.test.ts* checks that the shared shards match
Node's own `--test-shard` selections and that shards plus dedicated jobs
cover the inventory exactly once.

The Linux job is one extra ubuntu job with a 45-minute timeout. The macOS
job chains on the property sanitizer lane, under the same rule that chains
the two native sanitizer shards, so it takes no hosted slot. Its 1,812-second
lane entry is a planning allowance, twice the local clang wall plus setup,
until a hosted run measures it.

With the weighted Node shards, the native sanitizer split and the
exhaustive case shards, the property sanitizer lane ends at 4,264 seconds
and the chained native sanitizer lane at 3,607. The generator models these
maxima:

| Mac lanes      | Modeled maximum, minutes | Set by                  |
| -------------- | -----------------------: | ----------------------- |
| 0              |                    263.2 | property sanitizer lane |
| 2              |                    139.1 | a Mac lane              |
| 6              |                     71.1 | property sanitizer lane |
| 8 (configured) |                     71.1 | property sanitizer lane |

From six Mac lanes up, the property sanitizer lane is the hosted floor. This
command, run from the repository root, prints the maxima;
`node tools/macos-lane-report.ts` prints every lane end for the configured
count:

~~~~ sh
node -e '
import("./tools/generate-macos-lanes.ts").then((lanes) => {
  for (const n of [0, 2, 6, 8]) {
    const ends = lanes.macosLaneEnds(lanes.macosLanes(n));
    console.log(n, Math.max(...ends) / 60);
  }
});'
~~~~

The job's own cost was modeled on the lane's branch before the Node shards
merged. From the native split at `5bfef8748` to the dedicated job at
`51ff5b61b`, the two-lane maximum stayed at 111.9 minutes and the all-hosted
maximum rose from 216.4 to 223.9.
