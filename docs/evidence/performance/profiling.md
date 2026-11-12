Profiling method and acceptance
===============================

Status and contract
-------------------

This method belongs to the first Measurement checkpoint of
[*PLAN-PERF.md*](../../../PLAN-PERF.md), alongside
[*PLAN-PREVIEW.md*](../../../PLAN-PREVIEW.md). Linux GDB has recovered useful
user stacks from actual optimized synthetic programs; the
[smoke evidence](./profiling/linux-smoke/README.md) also retains a failed
late attachment. This establishes limited tool and unwind feasibility,
not corpus acceptance or measured costs. Portable capture is available. The
first hosted Mac-Deno capture failed: the serial requests outlived the
unchanged target. The approved overlapping Mac method still needs new
actual-host evidence. Generic path costs and optimization design remain out of
scope.

[ADR 0036](../../adr/0036-optimized-native-build-configuration.md) fixes the
measurement configuration: `optimized`, with `-O2` for generated C
and runtime, `-fno-sanitize=all` at compilation and link, and no `-g`.
Both `checked` and `optimized` require `-ffp-contract=off`; the existing
`-fno-lto` rule stays. The ADR records default DWARF emission by Zig 0.16.0
without `-g`, but that does not establish useful symbols or unwind information
in a particular executable. Do not add flags, strip the executable, or create a
profiling configuration to make a trace readable. If the accepted configuration
cannot support the required attribution, record the failure and ask Root
whether to reopen the ADR.

Linux AMD64 must execute `linux-x86_64-gnu`; macOS AArch64 must execute
`macos-aarch64` natively. The `linux-aarch64-musl` cross-link establishes
portability and inspection evidence only. It supplies no execution profile.
The compiler host (Node.js or Deno) is separate from the execution host;
profile the produced program, not the compiler or a compile-and-run wrapper.


Artifact and run procedure
--------------------------

Read-only tool discovery runs from the checkout through:

~~~~ sh
mise run perf:profile:discover NEW_DIRECTORY
~~~~

The parent directory must exist; the command refuses an existing output
directory. It preserves each probe's `argv`, UTC boundaries, status, signal,
error, resolved tool path, and raw `stdout` and `stderr` bytes in
*discovery.json* and sidecars. It prints the same JSON bundle, including base64
output bytes, for collection from CI logs. Require complete logs and compare
decoded bytes with sidecars when those are collected. Missing tools, timeouts,
and nonzero help statuses remain visible. A timeout, incomplete cleanup or
caught signal returns a failing status and preserves partial records after
each probe. Each probe has a 20-second deadline and its own process group;
SIGKILL ends that group even when a tool ignores SIGTERM. Discovery reports
`acceptance: unverified`. It neither captures a target nor reserves a
measurement slot. On macOS, probes are designed to inspect the selected Xcode,
`xctrace` help for `record` and `export`, available templates, and `sample`
help without installing tools or changing permissions.

The CI probe runs in the hosted `test (macos-latest, deno)` job and uploads
*profiler-tool-discovery-macos-N*, where `N` is the workflow attempt number.
Its `uname` and `sw_vers` output
identify that hosted image; they do not establish installed tools on
`oseo-mac-1` or `oseo-mac-2`. Repeat discovery on the actual capture host
through Root's approved route before accepting its profiling method.

The existing hosted Mac-Deno job also runs the synthetic native method
probe after its Deno tests and uploads *profiler-native-capture-macos-N*.
It checks the actual `darwin/arm64` host in the helper, uses a fresh directory
under `RUNNER_TEMP`, and archives the evidence with `tar` to retain executable
modes and the path mapping. Archive and upload steps use `always()` and
`if-no-files-found: error`; hard job termination can still prevent upload.
No job, runner placement, matrix, permission, required gate or timeout is added
or changed. No unverified service default is used as a time budget. The
retained serial Mac attempt failed the eight-capture requirement. New CI
evidence must validate the overlapping method before Mac acceptance.

Two commands separate caller artifacts from the synthetic build:

~~~~ sh
mise run perf:profile:capture REQUEST_JSON NEW_DIRECTORY
mise run perf:profile:smoke NEW_DIRECTORY
~~~~

`capture` never builds, strips, signs, changes extended attributes, or
modifies its input files. Its JSON request declares `kind` as
`existing-artifact` or `synthetic-method-probe`; an absolute `executable`, its
`sha256`, and a nonempty `inputs` array of absolute paths and SHA-256 values
freeze the source, generated C, runtime and build metadata supplied by the
caller. `argv`, `env` and absolute `cwd` specify the complete launch contract.
No ambient environment is added to the target. `stdinBase64`, `stdoutBase64`,
`stderrBase64` and `exitStatus` specify exact input and output bytes and the
correctness oracle. The request is independent of the corpus harness's schema;
Root must connect its final timed artifact and complete build provenance later.
A caller must not put secrets in a recorded launch environment.

The programmatic `captureArtifact(request, directory, checker)` API accepts an
optional `CaptureStdoutChecker` for `existing-artifact` requests. This permits a
caller to validate a checksum while checking variable elapsed fields, without
changing the executable or discarding its output. The CLI and synthetic probe
keep the exact-byte oracle. A checker supplies `id`, `sourcePath`,
`sourceSha256` and a synchronous `check(stdout)` function. Its actual source
file must be in the frozen `inputs` set. The source digest and actual function
representation digest are recorded in *stdout-oracle.json*; these identities do
not prove checker semantics. The final integration owner must bind the correct
semantic oracle and include its complete source/data dependencies after the
harness lands. No unlanded harness code or schema is used here.

A checker must be pure, deterministic and bounded over the retained stdout
bytes; it must not launch processes or change files. Missing source identity,
a missing callable, an exception or any result other than `true` fails the
capture with raw evidence. Expected exit status, signal/timeout checks, cleanup
and exact stderr bytes remain mandatory. *preflight-check.json* and
*target-check.json* retain output digests and the independent result, including
checker errors; target output is checked even when stack capture fails.

`smoke` uses the public compiler, C backend, runtime, Node host and Zig APIs
already available after the optimized build unit. It builds the same
unhinted two-million-iteration source as the earlier longer smoke, explicitly
selecting `optimized`, disabled specialization and no instrumentation. It
retains generated C, runtime source, actual build requests and raw compiler
outputs, the executable and tool identities. It changes no compiler flags.
This build belongs only to method verification and has no timed-artifact ID.
Both commands refuse an existing output directory. Neither runs the corpus,
collects benchmark timings or supplies missing harness acceptance.

The initial 50 ms attach delay remains. Even overlapping captures can
outlive a short native program. A failed or insufficient capture of an
unchanged timed artifact remains unaccepted; do not add program waits or
rebuild with larger iterations to make it pass. Launch-under-profiler support
would require separate tool and input-forwarding validation and is not provided
by this attach primitive.

The capture helper discovers tools again on the actual host. Linux uses eight
serial GDB attachments with the existing five-second command limit and
16-frame backtraces. macOS requires local `sample` help to confirm duration,
interval and `-file` syntax, then starts eight separate concurrent one-second
captures of the same owned target at a requested ten-millisecond interval. Each
command keeps its own twenty-second limit, raw output path and result. All
launched samplers settle before the capture phase returns, including after
interruption or failure. This bounded attach method is separate from Time
Profiler; its requested interval does not establish CPU sampling semantics or
an effective frequency. The preflight and profiled target each have a
120-second process timeout; smoke build commands have a 600-second limit. These
are cleanup bounds, not measurement populations or changes to benchmark/review
budgets.

Each capture checks the owned live child's identity before attachment and
requires the raw report to name that PID. A useful stack has a resolved
generated user frame and at least one caller, with no detected unknown frame,
hit on the 16-frame cap, truncation or loss diagnostic. Every Mac capture must
also resolve runtime context. Linux keeps its existing requirement for runtime
context in at least one capture; generated-only Linux stacks remain useful user
observations with runtime attribution unknown. Tool exit zero alone cannot
pass. The summary records all eight positions, including failed races and
unattempted stops after exit. Detected unknown/truncated frames fail the method
probe; absence of a diagnostic does not prove complete unwinding.

Mac reports must retain the live-task header, ten-millisecond request header,
image section and completion message. A target that exits before a sampler
settles, a command lifetime under one second, or incomplete raw output fails
that position. These checks cannot establish effective sampling frequency,
full live-window coverage or zero loss; actual raw inspection remains required.

*capture.json* identifies the Mac schedule as
`overlapping-samplers-one-target`, with `correlatedObservations: true`.
Each result retains its command's UTC boundaries and
`overlappingCommandIndices`. These are launch/settlement lifetimes, including
setup, report production and cleanup, rather than effective sample windows.
Eight correlated reports do not supply eight disjoint seconds or eight
independent workload executions. Concurrent profiler overhead may also change
scheduling. No target repetitions, waits, build changes or merged/copied reports
make up for a failed capture. Fake-process tests establish supervision and
rejection behavior only, never Mac, corpus or timed-hash acceptance.

A separate untimed correctness preflight preserves the Mac discard in this
probe's launch history; it does not establish whether a caller ran those bytes
earlier. Both target runs must match the oracle. Executable/input digests,
paths and modes are compared before and after, as are profiler bytes and
available ELF build-ID or Mach-O UUID command outputs. The preserved copies
and *file-map.json* map original absolute paths to numbered evidence files.
`capture.json`, per-process JSON records and byte sidecars retain host/source
state, selected nonsecret CI identifiers, failures and cleanup. GDB loss
counters remain unavailable, not zero. Separate process groups bound all
owned target, build, discovery and profiler lifetimes; on failure or a caught
signal, the helper kills owned groups and reaps its direct children. It
observes group disappearance for at most one additional second; surviving
zombies owned by another reaper remain incomplete cleanup. Uncatchable
termination and descendants that escape their group remain cleanup limits.
Frame classification reads the symbol field, excluding arguments and paths.
Generated dispatch, body, fragment and agent wrappers can provide useful
generated context, but cannot satisfy the separate runtime-context gate.

1.  After dependencies land and their main CI passes, discover the actual
    harness and build tasks with `mise tasks`. This draft does not reserve
    task names or claim that planned CLI options already work. Obtain the
    retained optimized artifact through that reviewed workflow, including
    specialization policy and output-correctness evidence.
2.  Preserve the exact executable used by the unprofiled timing run and
    compute its SHA-256 before and after profiling. Use those same bytes,
    arguments, input, environment, and working directory for sampling.
    Retain generated C, source maps if any, runtime inputs, and any existing
    symbol files. A rebuild with matching source is not proof of identity.
3.  On macOS, discard the first execution of each newly built executable
    from timing evidence because Gatekeeper assessment may affect it.
    Preserve that discarded run's command, output, status, and reason.
    Profile subsequent execution of the same bytes after the ordinary
    correctness checks. Do not remove quarantine, re-sign, or change
    Gatekeeper or developer permissions to make a run succeed.
4.  Keep unprofiled timing, sampling, and results from the separate counter
    build in distinct result sets. The plan requires `observeSpecialization` for
    guard, allocation, and collection counters in a separate build; the CLI
    does not expose it in the base contract. Record its own artifact hash
    and instrumentation settings. Counts can help interpret a hypothesis,
    but neither its timings nor profiler elapsed time enters benchmark
    results.
5.  Inspect the preserved profile for process identity, useful user frames,
    lost or truncated samples, and output correctness. Keep failures and
    partial captures. A command that exits successfully without useful
    samples has not validated this method. Short workloads may yield too
    few samples; record that limit rather than silently changing their work.

Synthetic smoke checks may test tool behavior under the ordinary heavy
lock. A profile of the performance corpus requires Root's measurement-slot
approval: Linux uses `run-gate.py --measure`; macOS requires equivalent
physical-host exclusion. Idle runner status alone does not reserve the two
accounts on the shared Mac. Save first-execution discards and all ordinary
warmups; if RSS is measured first, retain its separate untimed preflight.
Time, RSS, and profile use identical final artifact bytes; startup controls and
observed counter artifacts keep separate identities and launch histories.

Sampling describes where execution was observed under a profiler. It does
not measure per-call latency, allocation count, or benchmark throughput.
Do not multiply a sample fraction by an independent elapsed time and present
it as measured helper time. Keep each host's findings separate; neither
sample percentages nor timings justify a direct Linux-versus-macOS speed
comparison. Profiler overhead, scheduling, and different event definitions
also limit comparisons between traces.


Linux candidate: perf
---------------------

The Linux kernel's [record documentation][perf-record] covers event and
frequency selection and call-chain recording. Frame-pointer unwinding can
produce incorrect stacks when frame pointers are omitted. DWARF unwinding
requires a perf build with libunwind or libdw, usable call-frame information,
and a sufficient captured stack. These are acceptance checks, not properties
established for Oseo here. An 8,192-byte stack dump and 99 Hz are proposed
trial settings, not a validated accuracy or overhead budget.

After authorization for actual execution, confirm the installed perf's
version, local help, and `perf list`. Select an available user-only event
using the documented [`u` modifier][perf-list]; record its resolved identity.
Do not assume a hardware event exists in a VM. The following is a command
template, with `EVENT`, `ARTIFACT`, `INPUT`, and `RESULTS` supplied by the
future run:

~~~~ sh
perf record -e "$EVENT" -F 99 --strict-freq \
  --call-graph dwarf,8192 -o "$RESULTS/perf.data" \
  -- "$ARTIFACT" < "$INPUT"
perf report --stdio --header --show-nr-samples --no-children \
  -i "$RESULTS/perf.data" > "$RESULTS/perf-self.txt"
perf report --stdio --children -i "$RESULTS/perf.data" \
  > "$RESULTS/perf-inclusive.txt"
perf script --show-lost-events -i "$RESULTS/perf.data" \
  > "$RESULTS/perf-stacks.txt"
~~~~

This template illustrates stdin only; preserve the workload's actual
arguments and full command separately. `--strict-freq` makes an unsupported
requested rate fail rather than silently lowering it. Runtime throttling,
loss, and actual coverage still require inspection. Retain recorder stderr,
exit status, raw data, and each analysis command's output and failure record.
[Report documentation][perf-report] distinguishes self overhead from
inclusive children; [script documentation][perf-script] describes raw stack
output and lost-event display. Inclusive rows overlap and must not be added
to estimate total category cost.

[Kernel access rules][perf-security] depend on privileges, resource limits,
and `perf_event_paranoid`. User-only per-process sampling may fit the
upstream restriction at level 2, but that value alone does not prove permission;
container, distribution, and host restrictions remain to be tested. Preserve
permission and unwinding failures. Do not use sudo, change sysctls, grant
capabilities, or install tools under this preparation task.

[perf-record]: https://github.com/torvalds/linux/blob/master/tools/perf/Documentation/perf-record.txt
[perf-list]: https://github.com/torvalds/linux/blob/master/tools/perf/Documentation/perf-list.txt
[perf-report]: https://github.com/torvalds/linux/blob/master/tools/perf/Documentation/perf-report.txt
[perf-script]: https://github.com/torvalds/linux/blob/master/tools/perf/Documentation/perf-script.txt
[perf-security]: https://www.kernel.org/doc/html/latest/admin-guide/perf-security.html


Linux available alternative: GDB
--------------------------------

The [Linux smoke](./profiling/linux-smoke/README.md) used the installed
GDB 17.2-4.fc44 without installing perf or changing ptrace permissions.
Four attachments recovered runtime callers and generated C locations from
`-O2`, unsanitized bytes with no added `-g`, before a fifth attachment failed
after process exit. A separate fixed, longer synthetic workload completed
all eight requested attachments, including allocation and call-context
frames. These runs have different hashes and workload sizes; neither
is a timing population. Complete capture of a short program is not assured.
The [portable smoke](./profiling/portable-linux-smoke/README.md) also retains
all eight captures, exact launch/input and file identities, process-group
lifetimes and an earlier failed predicate result. It validates the portable
build/capture connection on Linux while leaving Mac and timed-corpus acceptance
pending.

After launching the frozen artifact with its exact workload contract,
identify the child PID and verify its executable identity before attaching.
On Linux, compare */proc/PID/exe* with the retained artifact's digest; check
the owned child is still alive before each attachment. A process name alone
is insufficient. The smoke used this command for each individual stop:

~~~~ sh
gdb --nx --nh --batch \
  -iex 'set auto-load off' -iex 'set debuginfod enabled off' \
  -p "$PID" -ex 'thread apply all bt 16' -ex detach
~~~~

Retain stdout, stderr, status and UTC boundaries for every attachment and
the target's separate output/status. Stop when the owned process exits;
preserve a failed race rather than counting it as a sample or retrying
against a recycled PID. Preserve the executable, generated C, runtime
sources and build flags. The smoke's virtual runtime source paths were
unavailable to GDB: symbol and line information survived, while GDB warned when
listing source. Resolve source paths to the frozen runtime source for
inspection without rebuilding the artifact.

Repeated GDB stops perturb execution and cover wall-clock attachment
points, including teardown and blocked code. They are neither uniform
on-CPU samples nor perf event samples. Record the requested stop count,
actual successful stops, frame-depth cap and missed attachments; effective
spacing includes debugger startup, symbol loading and detach. Do not
publish a sampling frequency inferred from a sleep argument. GDB supplies
no perf-style lost-event count here: mark that field unavailable, distinguish
missed stops and truncated/unknown frames, and keep every partial capture.
Do not use these stacks to estimate throughput, invocation counts or cost
percentages, or combine them with perf or Instruments populations.


macOS candidate: Instruments Time Profiler
------------------------------------------

Apple's [toolchain documentation][apple-tools] says `xctrace` ships with
Xcode, not the standalone Command Line Tools package. No actual Mac toolchain or
macOS AArch64 capture has been accepted here. Apple describes
[Time Profiler on Apple silicon][apple-cpu] as timer-based sampling of
on-CPU user stacks, with possible aliasing; heterogeneous CPU frequencies
also affect interpretation. This is distinct from the newer CPU Profiler
and Processor Trace instruments. Their availability is not a prerequisite
or a fallback assumed by this draft.

Apple's [xctrace example][apple-xctrace] confirms `record`, `--template`,
`--attach`, `--output`, and `--time-limit` for its Game Memory example.
Applying that command structure to Time Profiler is a proposed adaptation,
not a validated Oseo command:

~~~~ sh
xcrun xctrace record --template 'Time Profiler' \
  --attach "$PID" --output "$RESULTS/cpu.trace" --time-limit 30s
~~~~

Before adopting it, a Mac owner must retain the selected Xcode version,
local `xctrace` help, available templates, and a successful capture against
the identified optimized program. The attach mode misses startup and may miss an
entire short-lived process. Prefer a verified launch workflow for those
programs; its exact launch syntax, stdin and argument forwarding, and export
commands remain TODOs for the installed Apple toolchain. Do not use a shell
or compiler process as the sampling target. Preserve the native
*.trace* directory and a human-readable call tree; verify any machine export
against that trace instead of assuming a stable schema.

Apple's [execution-frequency tutorial][apple-frequency] explains that
Time Profiler sample counts do not count function invocations. It documents
a 1 ms default interval; confirm and save the effective settings for the
installed template rather than treating that default as an observation.
Record launch or attach mode, capture window, filters, thread selection,
and dropped-sample or incomplete-stack warnings. If permissions or signing
prevent capture, preserve the diagnostic and return the decision to Root.

Apple's retired [sample guide][apple-sample] documents
`sample TextEdit 5 10 -wait`, meaning a five-second capture at ten-millisecond
intervals while waiting for that named process. This confirms historical
syntax only, not current macOS AArch64 support. The portable helper now
connects a bounded `sample` fallback, gated by the installed help, process
identity, actual capture and stack checks described above. Actual overlapping
Mac execution remains pending. It is not accepted here as a launch-complete or
Time Profiler-equivalent method.

[apple-tools]: https://developer.apple.com/documentation/xcode/installing-the-command-line-tools
[apple-cpu]: https://developer.apple.com/videos/play/wwdc2025/308/
[apple-xctrace]: https://developer.apple.com/videos/play/wwdc2022/10106/
[apple-frequency]: https://developer.apple.com/tutorials/instruments/determining-execution-frequency
[apple-sample]: https://developer.apple.com/library/archive/documentation/Performance/Conceptual/LaunchTime/Articles/MeasuringLaunch.html


Symbols, frames, and attribution
--------------------------------

Unwinding and symbolication are different checks. A trace may recover a
stack but show addresses, or name a leaf without recovering its callers.
Optimization may inline or eliminate helpers, merge code, or remove native
callers through tail calls. Source-level numeric boxing may have no distinct
sampled frame. Missing helper samples therefore do not establish zero cost.
Debug information for generated C also does not by itself map native samples
to the original JavaScript expression.

For macOS, Apple's [symbol-file guidance][apple-symbols] requires matching
build UUIDs for a binary and its *.dSYM*. Preserve existing matching files
and loaded-image information if available; do not borrow symbols from a
rebuild or claim that a *.dSYM* can recover debug information never emitted.
For Linux, retain the exact executable and loaded libraries needed for
symbol lookup, including build IDs when present. Whether either optimized
artifact has sufficient symbol, line, inline, and unwind data remains open.

Later attribution should record the following evidence without assuming
helper names or runtime structure that this task has not inspected:

| Cost family     | Evidence to inspect after dependencies land                                                    | Limit to report                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Generic helpers | Resolved helper symbols and caller chains, matched to retained generated C and runtime sources | Unknown, merged, or inlined regions stay unassigned                                            |
| Allocation      | Allocation and collection frames with caller context; separately recorded allocation counters  | CPU samples are neither bytes nor allocation counts; keep collection distinct where resolvable |
| Property lookup | Generic lookup frames and callers, including generated sites where mapping exists              | Key conversion, accessors, and nested calls may overlap inclusive cost                         |
| Calls           | Dispatch and completion frames, generated callers, and callee stacks                           | Callee work is not dispatch overhead; tail calls can remove callers                            |
| Numeric boxing  | Conversion or boxing instructions and surviving helper frames matched to generated C           | Tagged-value boxing is not necessarily a heap allocation; inline costs may remain inseparable  |

Keep self samples and inclusive context separately. For a category total,
define a disjoint leaf or instruction assignment and retain an unknown
bucket. For an overlapping call-tree view, label the overlap and publish no
sum. Preserve the symbol/address-to-category mapping, its source evidence,
and ambiguous cases so later investigators can revise it. Sampling cannot
by itself establish guard-hit rates or prove that a specific generic
fallback executed.

[apple-symbols]: https://developer.apple.com/documentation/xcode/locating-a-missing-debug-symbol-file


Evidence to retain and acceptance still required
------------------------------------------------

Each future capture needs a manifest with:

 -  execution host OS, kernel, CPU/architecture, power conditions, competing
    load, and native target; compiler host and source revision/dirty state;
 -  `optimized` build configuration, specialization policy, instrumentation,
    complete generated-C/runtime compile and link flags, sanitizer state,
    compiler identity, tool versions, and preserved build metadata;
 -  SHA-256 identities and paths for the executable, source/input graph,
    generated C, available symbol files, and raw profile artifacts;
 -  workload name, input and expected-output digests, work size, seed if any,
    arguments, stdin, relevant environment, working directory, and actual
    output and exit status;
 -  profiler event or template, requested and effective interval/frequency,
    unwind mode and stack size, scope, duration, repetition, process/thread
    selection, filters, loss, throttling, and unknown or truncated frames;
 -  exact commands, stdout/stderr, statuses and failures, Gatekeeper discard
    records on macOS, raw captures, derived reports, and attribution mapping.

Linux corpus acceptance still requires a useful capture of the exact timed
optimized artifact, verified stack and symbol quality, output correctness,
and raw/report preservation; perf additionally needs actual event,
permission and unwinding checks. macOS acceptance requires either validated
Instruments capture with selected full Xcode/template/export settings or a
locally validated `sample` method with its own coverage and limits. Both
Mac routes need first-execution discard and symbol identity evidence. Show
which of the five cost families can actually be resolved and which remain
unknown. If this cannot satisfy the two-target method under ADR 0036, ask
Root for an ADR decision rather than changing the build.

The acceptance boundary is explicit:

| Requirement             | Evidence and remaining work                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux tool discovery    | perf absent; installed GDB/version/Python support recorded                                                                                    |
| Linux useful user stack | Short smoke retains a failed late attach; longer smoke completes eight useful stops                                                           |
| Five cost families      | Synthetic helper, allocation and call context survive; property lookup and numeric boxing remain unresolved, and no corpus costs are assigned |
| Same timed hash         | Smoke hash unchanged; no timing population exists for it, so this requirement remains pending                                                 |
| macOS tool discovery    | Hosted serial attempt retained discovery; each actual capture host still requires its own inventory                                           |
| macOS useful capture    | Serial attempt failed eight-capture acceptance; overlapping method requires new actual raw evidence                                           |

Root owns harness-index crosslinks, the measurement reservation, corpus
execution, outer review, checkpoint gates and publication. The two-target
profiling completion contract remains unmet until actual Mac acceptance
and same-timed-hash corpus captures are retained; Linux smoke alone does
not close it.


Sources
-------

All cited sources were retrieved on 2026-11-08. Linux links track upstream
`master` or current kernel documentation, not the installed tool version.
Apple tutorial and WWDC examples do not establish support on a particular
Mac. The sample guide is explicitly retired. Retrieval snapshots and hashes
belong to the lane handoff; no third-party command guide is used as authority.
