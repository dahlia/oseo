Performance evidence
====================

No comparison has been measured here. The build and measurement drivers
implement the corpus harness for the first Measurement checkpoint of
[*PLAN-PERF.md*](../../../PLAN-PERF.md). Root owns the Wave2 measurement
slot and publication on both native hosts. Driver validation does not
complete the checkpoint's exit criteria.


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

`mise run perf:build` uses the landed compiler, backend and Zig APIs to
build Oseo with `buildConfiguration: "optimized"` and no sanitizers. It
stages all generated C and runtime assets in private build directories,
without archive reuse. Native *build.json* records the source, policy,
observation selection, runtime ABI, generated units and exact build plan.
The build journal retains each child request and raw output. No retained
CLI or other unlanded implementation is required. Prepared native commands
name the timed or startup build destination. The backend assigns C filenames;
the build manifest records the complete emitted unit list.

Set `OSEO_PERF_DIRECTORY` to a fresh absolute directory before building,
under ignored *artifacts/.oseo-perf/* or outside the checkout.
The driver writes *built.json* and its detached *built.sha256*, linking
source, resolved executable, generated C, native build metadata and build
journal digests. Resolve dependencies before the measurement slot. Builds,
preparation and correctness preflights use the heavy gate outside timing.

`mise run perf:correctness` checks a fresh clean-source build without a
measurement slot. Use the same producing host and tools, with fresh absolute
paths outside the checkout:

~~~~ sh
OSEO_PERF_DIRECTORY="$RUNNER_TEMP/oseo-perf-build" mise run perf:build
OSEO_PERF_DIRECTORY="$RUNNER_TEMP/oseo-perf-build" \
OSEO_PERF_RESULTS="$RUNNER_TEMP/oseo-perf-check" mise run perf:correctness
~~~~

The correctness driver uses the existing manifest validator, byte journal
and output/counter checkers. It runs all 36 timed-role, 8 observed-role and
9 startup-role commands serially with their saved inputs. Kernel commands
keep 100 iterations and startup commands keep one. It checks source, host,
tool, pin and artifact identities before and after execution.
*correctness.json* links the completed roles and eight counter records to the
build manifest and raw journal. Every launch record has `retained: false` and
`timingEligible: false`; raw clocks are diagnostics. No timing or RSS
populations are collected, and the measurement policy stays at 3 warmups, 15
repetitions, 100 kernel iterations and 15 separate RSS launches.

A rejected manifest or source, failed launch, invalid UTF-8, wrong output,
missing counter or changed identity leaves *failure.json*, the copied build
manifest when available and all raw records from attempted launches. A failed
role links to its last launch and the completed prefix; no success summary is
written. On macOS, the first standalone launch is recorded as an excluded
discard.

The existing hosted Mac Deno CI job requires a `darwin/arm64` runner and
runs build and correctness after its Deno tests. Uploads from failed runs
preserve raw records, command logs, commit and tree identities, and host
identity. A hashed tar archive
preserves absolute path mappings, executable modes, build assets and resolved
engine files. Required upload steps fail when files are absent. The CI job keeps
its existing timeout settings; each child command retains its 600,000 ms
limit. A completed upload alone proves neither correctness nor Mac acceptance.

`mise run perf:measure` runs the sealed matrix without building. Set
`OSEO_PERF_DIRECTORY` to the build directory, `OSEO_PERF_RESULTS` to a new
absolute directory, `OSEO_PERF_RUN_ID` to the run identifier, and
`OSEO_PERF_CONDITIONS` to a JSON object with `power`, `backgroundLoad`,
`cachePolicy: "warm-process-launch"` and `notes`. The command rejects a
changed producing host, revision, pin, lockfile or tool version. Root must
assign the exclusive Wave2 slot first: Linux uses the approved heavy gate
with `--measure`; macOS requires its separate physical-host reservation.
The Linux wrapper does not run on macOS.

*build-manifest.json* and *run.json* bind the raw journal to frozen files.
Fixed-corpus launches select environment entries needed by the build tools,
caches, temporary directories, locale and timezone. Credentials and ambient
engine options are excluded before the child runs. `Journal` requires
explicit cwd, stdin and environment, including any demo adapter variables.
Executable commands preserve their dispatch paths while identities hash
resolved target files, so symlink dispatch does not change `argv[0]`. The
real executor checks RSS-tool availability before starting any population.

Every launch preserves explicit stdin, individual arguments, environment,
working directory, UTC boundaries, monotonic boundaries, status and signal.
*raw/requests.jsonl* records an attempt before spawning;
*raw/launches.jsonl* links its original stdin/stdout/stderr byte files and
digests before kernel text decoding. Before accepting a build matrix or a
completed run, the drivers recheck every raw stream and request/launch link.
Invalid UTF-8 bytes remain intact. Spawn
errors, wrong output and nonzero exits leave *failure.json* and all prior
attempts; they produce no successful *measurements.json*.

Set `OSEO_PERF_RSS_FIRST=1` to collect RSS before each kernel's timing
population and exercise the excluded preflight. The default runs timing
before RSS.

The driver rotates the nine forms serially through all runtime and startup
rounds, then collects separate RSS and observed populations. It verifies
frozen hashes around each population. On macOS, the first warmup of every
new standalone executable is retained only as a discard record. An RSS-first
collection performs an excluded correctness preflight before its fifteen
RSS launches. Observed artifacts receive their own excluded preflight.
Neither observed time nor first-launch time enters the retained populations.

`Journal` in *tools/perf/* provides the audited byte transport for demo
evidence adapters. Its underlying `executeRaw()` helper preserves legacy
inheritance when cwd or environment are omitted. Demo adapters use `Journal`
with explicit inputs. Demo registration and byte oracles belong to the
comparison lane; they do not extend the four-kernel schema.

For each policy, the build driver creates a separate executable from the
same source and iteration count with `observeSpecialization: true`. Running
that executable yields `guardHits`, `guardMisses`, `overflowMisses`,
`genericAdditionCalls`, `allocations`, and `collections` through the existing
private observation protocol. Missing or invalid counters fail the run. Its
artifact digest must differ from the uninstrumented executable's digest. Timing
and RSS runners reject observation markers; observation runs do not supply
timing populations.

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
record, which references the last completed journal launch and its command,
raw output files, status, signal and phase. Errors outside a launch remain
described separately; failures never become zero-valued measurements.

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
or validated attribution method is claimed by this driver.
