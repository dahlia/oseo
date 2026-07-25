Evidence gate cost baseline
===========================

Status
------

This baseline records the cost of the reviewed evidence gates immediately
before the throughput work planned in [*PLAN-GATE.md*](../PLAN-GATE.md). The
baseline commit is `0bd5f38e1762666a7cca40c059abdcd8dcf94118`.

Every number below was observed on one host. A later comparison run records
its own host facts instead of reusing these. Observed values and derived
values are separated; a derived value names the observation it divides.


Measurement host
----------------

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


Observed gate durations
-----------------------

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


Native execution decomposition
------------------------------

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
the toolchain version, and the target and sanitizer selection. None of those
change between reviewed cases in one gate run, and the archive is rebuilt for
every execution.


Load sensitivity
----------------

Neither full-corpus run of the reviewed subset completed without
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
semantic mismatches or compile diagnostics. `OSEO3001` does not name a cause,
and this baseline did not measure peak resident memory or peak temporary
storage, so the exhausted resource is not identified. The host facts above are
snapshots, not measurements taken during the failing window.

What the runs do establish is narrower. No semantic failure occurred. Every
affected path reported its expected classification when executed alone. The
command-line entry point removes its working directory on the failure path as
well as the success path, so the run did not accumulate directories.

`OSEO3001` currently maps a resource failure and a harness defect to one
classification. Before enabling concurrent execution, measure peak resident
memory and peak temporary storage for one execution, since concurrency
multiplies whatever working set each execution holds.


Reproduction
------------

~~~~ sh
mise run test:test262
mise run test:property:native
~~~~

The decomposition used `zig cc` directly with the flags the toolchain
adapter builds for `linux-x86_64-gnu`, and `runNativeCli` from
*packages/cli/src/index.ts* for the complete execution. Zig maintains its
own compilation cache, so a repeated identical build may be warmer than a
first build on a clean host.


Preserved comparison points
---------------------------

Later throughput work must preserve:

 -  one counted result for each upstream source path;
 -  the reviewed result order that shard reconstruction selects from;
 -  the reviewed property seeds, sizes, and case counts;
 -  execution under both specialization policies with collection forced at
    every safepoint;
 -  the strict warning, undefined-behavior, and address sanitizer flags; and
 -  the reviewed classifications recorded in the checked-in manifest.

Final measurements after a checkpoint belong in that checkpoint's evidence.
This file remains the before-state comparison point.
