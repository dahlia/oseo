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

The emitted C for one 4,096-literal program is about 14 MB. A top-level
program of more than about 4,000 literal statements exceeds the native frame
budget, and under ASan a function of 1,024 does too, which is why programs
group literals into functions of at most 256.


Placement
---------

**Extended native shards.** The Linux weight is the extended run's summed
case durations, 1,585 seconds, recorded like the other later files in
*docs/evidence/u6/*. macOS has no measurement of this file. Its entry is
921 seconds, the Linux weight scaled by the 353/608 macOS-to-Linux
ratio of *m5-regexp-literal-aot.property.test.ts*, whose generated literals
compile the same way. This is a provisional estimate, not a measured
duration.

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
until a hosted run measures it. With the two configured Mac lanes the modeled
makespan stays at 111.9 minutes before and after, and the property lane ends
at 71.1 minutes. With six Mac lanes that lane becomes the hosted floor at
4,264 seconds. Without Mac lanes the all-hosted fallback rises from 216.4
minutes after the native split to 223.9.
