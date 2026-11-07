Performance evidence
====================

No comparison has been measured here. The preparation tools implement the
corpus and evidence skeleton for the first Measurement checkpoint of
[*PLAN-PERF.md*](../../../PLAN-PERF.md). Root owns the Wave2 measurement
slot, integration with optimized native builds, and publication on both
native hosts. Preparation does not complete the checkpoint's exit criteria.


Preparation and integration
---------------------------

`mise run perf:prepare` records the host and tool identities and prepares
sources and argv recipes without executing them. Bun is pinned to 1.4.4 and
SEA's `postject` tool to 1.0.0-alpha.6 in *mise.toml*. Node.js, Deno, and Zig
use the repository pins. Missing tooling fails preparation. Resolve and
record each executable path and version again at build time; a preparation
record is not proof of the tool that built an artifact.

Each kernel and the minimal startup control has nine forms: Oseo with
specialization enabled and disabled, Node.js, `node --jitless`, Deno, Bun,
Node.js SEA, `deno compile`, and `bun build --compile`. A form's commands
are argv arrays so spaces in source and executable paths remain intact.
The SEA plan copies the pinned Node.js executable, creates and injects the
blob, and removes and restores its ad hoc signature on macOS. The SEA
source is a self-contained Script with no imports; snapshot and code cache
are disabled. See the [Node.js SEA documentation], [Deno compile reference],
and [Bun executable documentation] for the underlying command contracts.

Oseo forms deliberately have no build recipe yet. Root must replace their
`blocked` state only after wiring the accepted optimized configuration
through the compiler and retained executable API. It must record
`buildConfiguration: "optimized"`, no sanitizers, the selected policy,
complete build argv, toolchain identity, cache disposition, and artifact
digests. A checked build is never eligible. No compiler, lowering, runtime,
or target code is copied into this harness.

For each policy, Root also builds a separate executable from the same source
and iteration count with `observeSpecialization: true`. Running that executable
yields `guardHits`, `guardMisses`, `overflowMisses`, `genericAdditionCalls`,
`allocations`, and `collections` through the existing private observation
protocol. Missing or invalid counters fail the run. Its artifact digest must
differ from the uninstrumented executable's digest. Timing and RSS runners
reject observation markers; observation runs do not supply timing populations.

[Node.js SEA documentation]: https://nodejs.org/docs/latest-v24.x/api/single-executable-applications.html
[Deno compile reference]: https://docs.deno.com/runtime/reference/cli/compile/
[Bun executable documentation]: https://bun.sh/docs/compiler/executables


Method and limits
-----------------

The initial policy fixes 100 kernel iterations per process, three warmup
processes, and fifteen retained repetitions per form. Every process checks
every iteration. A process exits between repetitions, so JIT warmup occurs
within its batch and is included in the runtime. Warmup launches prime file
and engine caches; they do not preserve a JIT between processes. Engine
order rotates each round to distribute drift. Workloads run serially.
Record any changed iteration policy as a separate run before executing it;
never shorten a failing run or discard an outlier.

The wrapper records batch runtime with `Date.now()` around the kernel loop,
including self-checks. Its millisecond resolution can produce zero for short
batches; preserve those zeros and report the resolution limit. Dividing by
100 yields amortized iteration time, not an independently measured latency.
The subprocess executor separately records monotonic process wall time.

Startup uses the matching engine or a separately built minimal startup
executable; its output and exit status are checked. It includes process
creation, engine initialization, output, and teardown on a warm filesystem
cache. It is not cold boot or time to first instruction. Never subtract its
median from the kernel median to invent a steady-state time.

RSS is sampled in separate processes, fifteen per form, with the same
kernel input. `/usr/bin/time -f 'PERF_RSS_KIB %M'` on Linux reports KiB;
`/usr/bin/time -l` on macOS reports bytes. Both values are normalized to bytes.
Retain stdout, stderr, status, and signal from each invocation. A failed
process, missing self-check, or missing RSS record fails the run. Wrapper
overhead never enters the timing sample. Interpreted forms have no standalone
executable-size or generated-C metric; record `null`, not zero or the size of
the system runtime.

Record sizes and SHA-256 digests of the actual executables. Generated C size is
the total byte size of every generated translation unit and split wrapper,
excluding runtime sources and headers. Record each file so a reader can verify
the total. Keep the binaries and generated C alongside the metadata, subject to
the project's artifact retention policy. Stripping and LTO are outside this
checkpoint's build contract.

For each population retain all raw values, minimum, maximum, median,
nearest-rank p95, mean, population standard deviation, and median absolute
deviation. *tools/perf/sampling.ts* provides these statistics and independent
runtime, startup, RSS, and counter runners. Unit tests use injected executors
and do not perform comparison measurements. Incomplete populations fail
validation rather than being summarized as successful partial runs.


Directory and publication contract
----------------------------------

Use *docs/evidence/performance/<run-id>/<target>/* for durable evidence,
where `<target>` is `linux-x86_64-gnu` or `macos-aarch64`. Keep raw records
in *measurements.json*, build commands and outputs in *builds/*, process
observations in *raw/*, executables in *bin/*, and generated C in *c/*.
Large artifacts may live in an external artifact store when the evidence
record contains their immutable location and digest. Do not check in an
empty or fabricated measured run.

*tools/perf/evidence.ts* defines schema 1. A measured record identifies its
phase, revision and clean-tree state, host OS and architecture, CPU model,
logical CPU count, physical memory, exact engine and compiler versions,
lockfile and pin digests, sampling policy, power mode, background load,
cache policy, and limitations. A prepared plan has `phase: "prepared"` and
cannot be validated as measured evidence. Raw samples identify their kernel,
variant, and repetition index. Failures belong in the run's separate failure
record with command, output, signal, and phase; they never become zero-valued
measurements.

Publication requires native execution on both hosts at the same revision
and sampling policy. Keep their results separate; cross-linking AArch64
Linux is not a macOS execution result. State host-specific differences in
SDK, power policy, CPU frequency control, filesystem caching, and concurrent
load before comparing results. Report slower Oseo results as measured.
Root must run the optimized corpus and property exit gates and complete
the two-host evidence before declaring Measurement complete.

A portable profiling method remains a Measurement dependency. After the
optimized artifacts exist, Root can retain Linux `perf` and macOS Instruments
Time Profiler captures with the matching executable digest, symbols, command,
and tool version. Group stacks by generic helpers, allocation/collection,
property lookup, calls, and numeric boxing, and retain unattributed samples.
Neither profiler is required to prepare this corpus, and no profiling result
or validated attribution method is claimed by this skeleton.
