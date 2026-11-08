Profiling method and acceptance
===============================

Status and contract
-------------------

This method belongs to the first Measurement checkpoint of
[*PLAN-PERF.md*](../../../PLAN-PERF.md), alongside
[*PLAN-PREVIEW.md*](../../../PLAN-PREVIEW.md). Linux GDB has recovered useful
user stacks from an actual optimized synthetic program; the
[smoke evidence](./profiling/linux-smoke/README.md) also retains a failed
late attachment. This establishes limited tool and unwind feasibility,
not corpus acceptance or measured costs. macOS tools and captures remain
unverified. Generic path costs and optimization design remain out of scope.

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


Artifact and run procedure, pending validation
----------------------------------------------

Read-only tool discovery runs from the checkout through:

~~~~ sh
mise run perf:profile:discover NEW_DIRECTORY
~~~~

The parent directory must exist; the command refuses an existing output
directory. It preserves each probe's argv, UTC boundaries, status, signal,
error, resolved tool path, and byte stdout/stderr in *discovery.json* and
sidecars. It prints the same JSON bundle, including base64 output bytes,
for collection from CI logs. Require complete logs and compare decoded
bytes with sidecars when those are collected. Missing tools, timeouts, and
nonzero help statuses remain visible; successful discovery reports
`acceptance: unverified`. It neither captures a target nor
reserves a measurement slot. On macOS, probes are designed to inspect the
selected Xcode, `xctrace` record/export help and templates, and `sample` help
without installing tools or changing permissions.

The CI probe runs in the hosted `test (macos-latest, deno)` job and uploads
*profiler-tool-discovery-macos-N*, where `N` is the workflow attempt number.
Its `uname` and `sw_vers` output
identify that hosted image; they do not establish installed tools on
`oseo-mac-1` or `oseo-mac-2`. Repeat discovery on the actual capture host
through Root's approved route before accepting its profiling method.

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
Xcode, not the standalone Command Line Tools package. No Mac toolchain or
macOS AArch64 artifact was inspected here. Apple describes
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
the identified optimized program. Attach misses startup and may miss an
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
syntax only, not current macOS AArch64 support. `sample` is a possible
bounded fallback to investigate with the installed manual, process identity,
and an actual capture. It is not accepted here as a launch-complete or
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
| macOS tool discovery    | Pending execution on an approved existing route                                                                                               |
| macOS useful capture    | Pending actual host/tool/settings, output, stack and discard evidence                                                                         |

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
