macOS native sanitizer split
============================

The `host C sanitizers (macOS, native)` job ran the runtime fixtures and all
500 native fixtures with their three scenarios in one hosted `macos-15` job.
Candidate run 41191483370 attempt 1 cancelled it at 75.5 minutes; attempt 2
of the same commit passed in 58.9. The maintainer's 2026-11-01 decision
*~/.local/state/oseo-m5c/decisions/macos-native-sanitizer-timeout-20261101.md*,
item 2, splits the job into file shards. Every shard is required by the
`native` aggregate and the shards cover the whole input set. A separate change
raises the native suite's timeout to 90 minutes; the split keeps one matrix
row per job, so a per-row `timeout` composes with it.


Shards
------

`node tests/native.ts --shard INDEX/TOTAL` already partitions the Linux
sanitizer job. It runs the common prelude in every shard, assigns fixture
*i* to shard `i % TOTAL + 1`, and assigns scenario *s* the same way. Those
positions partition the fixture list and the three scenarios, so the shards
of one total cover the suite exactly once. The runtime fixtures do not shard
and run only in the first shard, as on Linux.

`mise run test:sanitizer:native --shard 7/100` ran on the macOS 27 AArch64
Mac mini with `OSEO_HOST_CC=clang` and reported 5 of 500 native fixtures
matching on `macos-aarch64`. That confirms the flag on the macOS sanitizer
toolchain. The hosted `macos-15` runner first executes the flag in the
candidate CI run that carries this change.


Costs
-----

The `native progress` lines of four hosted logs give each fixture's and
scenario's duration: main runs 41201259627 (`999f3416`) and 41212096408
(`4e4d8a4a`), and run 41191483370 attempts 1 and 2 (`216503f8`). Attempt 1
was cancelled and is excluded. These are derived from summed step durations,
not measured shard walls.

| Run                  | Prelude | Fixtures | Scenarios     | Two shards  | Three shards    |
| -------------------- | ------: | -------: | ------------- | ----------- | --------------- |
| 41201259627          |    23 s |  2,452 s | 52, 214, 51 s | 1,400 1,415 | 967 1,070 802   |
| 41212096408          |    36 s |  2,758 s | 60, 263, 65 s | 1,573 1,646 | 1,101 1,237 917 |
| 41191483370 (att. 2) |    31 s |  2,542 s | 70, 279, 74 s | 1,499 1,527 | 1,027 1,176 854 |

The runtime step took 6.43, 7.48 and 7.75 minutes in those three runs. With
the generator's 60-second setup, a 6-second preflight, the 449-second runtime
median and the per-shard medians, the two shards cost 2,014 and 1,593
seconds. The replaced 2,337-second entry was stale: the same three runs
measured the unsplit job at 54.05, 61.72 and 58.92 minutes. At the slowest
measured runner, 1.38 times attempt 2, the first shard would take about 46
minutes.

Two shards were chosen over three. Three shards lower the first job to about
1,540 seconds, but the extra job costs another setup and preflight on a lane
that already has an hour of margin under either limit.


Placement
---------

A hosted lane that holds a sanitizer job reserves itself for that job, because
a lane that follows one inherits its spread (U41, U42). With two Mac lanes, a
reserved lane per native shard raises the modeled makespan from 111.9 to 125.9
minutes: the third reservation leaves only two hosted lanes for the hosted-only
Node.js shards and the Mac-eligible overflow. The generator therefore reserves
one hosted lane per sanitizer suite. Both native shards chain on that lane, the
property suite keeps its own, and no other job joins either. The modeled
makespan stays at 111.9 minutes, and the account's five hosted slots carry the
same two sanitizer reservations as before.

The chained lane ends at 3,607 seconds, about one extra setup and preflight
above the unsplit job's measured median. With six Mac lanes, and with the
rented pair, that lane is now the hosted floor of the model. Without Mac lanes
the reservation does not apply and the LPT partition places each shard like
any other job.

The `native` aggregate requires both native shards. The property suite keeps
its existing standing; this decision covers the native suite only.
