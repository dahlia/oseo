ADR 0030: Test262 unhandled rejection policy
============================================

Status
------

Accepted for M5c node `unhandled-rejection-observation`. The maintainer
decided on 2026-11-01 to allow unhandled rejections only for test262 harness
runs, through a named, explicit host policy that does not extend
`--test262-host`. Root reserved runtime ABI `m5-147` for it. This record
changes no claim, exclusion, or classification by itself; Root's full
test262 UPDATE determines every resulting record. The claim,
source-compilation, and exclusion boundaries of
[ADR 0013](./0013-m5-edition-and-manifest.md),
[ADR 0016](./0016-dynamic-source-boundary.md), and
[ADR 0019](./0019-m5-claim-closure.md) stay intact.


Context
-------

[ADR 0010](./0010-promise-jobs.md) makes rejection tracking a runtime
responsibility at the end of a promise-job drain, and
[ADR 0012](./0012-native-event-loop.md) passes unhandled rejections through
one host reporter after each checkpoint. The native host has made that report
fatal since M4: `oseo_rejection_checkpoint` marks each rejected, unhandled,
pending-report promise reported, counts it, and returns the first reason as
a throw with its rejection source location. The program then exits nonzero
with `error[OSEO2001]: Unhandled promise rejection.`

The upstream test262 host contract tolerates unhandled rejections. Many
Promise combinator and reaction-job tests leave a derived promise rejected
on purpose while their assertions and `$DONE` completion still decide the
result. Under the fatal policy, 27 reviewed paths stopped at the first
checkpoint, and the runner classified them `unsupported-profile-feature`
with the named capability `unhandled-rejection-policy`. The M5 language
profile reserved reconciling the two policies for a separate host-profile
decision.

`--test262-host` already means something narrower. It installs `$262`,
compiles `$262.agent.start` templates and literal `evalScript` sources
ahead of time, applies only to Scripts, and makes the runner select the
real-clock agent cluster of
[ADR 0026](./0026-agent-clusters-and-shared-memory.md) instead of the
deterministic scheduler. Most of the affected cases need none of that.


Decision
--------

The rejection checkpoint has two host policies:

 -  *Fatal* is the default. Every runtime context initializes to it, and the
    compiler emits no policy setup for it. This is the M4 event-loop profile
    and the only policy an ordinary executable can have.
 -  *Observe* performs the same checkpoint work, so each report still moves
    the promise from pending-report to reported exactly once and increments
    `unhandled_rejection_count`. It then completes normally instead of
    returning the first reason as a throw.

The policy is selected explicitly at every layer, independent of the test262
host:

 -  the compiler option `unhandledRejectionPolicy` (`"fatal"` or
    `"observe"`), which records `unhandledRejectionPolicy: "observe"` on the
    MIR program and prints it in MIR dumps only when it observes;
 -  the CLI flag `--test262-observe-rejections`, accepted for Scripts with
    or without `--test262-host` and for module graphs;
 -  the runtime field `OseoContext.unhandled_rejection_policy`, which the
    generated main program, or the launcher of a split fragment build,
    assigns before it installs the test262 host or evaluates any code;
 -  the request field `unhandledRejectionPolicy` of
    `Test262ExecutionRequest`. The reviewed runner sets `"observe"` for
    every case and variant, and its native executor forwards it as the CLI
    flag. The fragment executor compiles the harness with the same option,
    and its harness cache key includes the policy.

Under `--test262-host`, the agent cluster records the main context's policy
when the host installs, and each child agent copies it into its own context
before running its program. No heap value crosses between agents.

Observation changes only the host's decision about a report. These remain
failures under both policies, with their existing diagnostics:

 -  an uncaught synchronous throw from Script or module evaluation;
 -  a thrown timer callback or finalization cleanup callback, whose caller
    keeps its own completion;
 -  a rejected module entry evaluation, read from the entry promise rather
    than the pending-report list;
 -  host diagnostics, such as a stalled internal await or an unavailable
    clock, and parse, resolution, and unsupported-feature diagnostics.

An internal await reads its awaited promise directly, so its throw
completion does not depend on the checkpoint's decision. Queue drainage,
FIFO promise jobs, rooted pending lists, late-handler accounting, and the
point at which each checkpoint runs are unchanged. An outstanding rejected
promise does not keep the event loop alive.


Why the policy cannot reach ordinary executables
------------------------------------------------

The default at each layer is fatal, and each layer adds observation only
when the previous one asked for it by name. `oseo_context_init` sets the
fatal value; only a generated setup line assigns observe, and the backend
emits that line only for a MIR program carrying the observe field; only the
compiler option creates that field; only the CLI flag or a direct compiler
caller sets the option. The `oseo` CLI never infers the flag from source
content, file names, `--test262-host`, or a test262 directive, and the
runner is the only repository caller that passes it. An executable compiled
without the flag therefore has byte-identical generated C to one compiled
before this decision, apart from the runtime it links.

The flag name keeps the test262 scope visible. It is a host contract for
standards observation, not a general tolerance switch for programs.


Tests
-----

 -  *tests/fixtures/runtime-promises.c*, run by
    *tests/runtime-promises.test.ts* with sanitizers and with
    `OSEO_GC_EVERY_SAFEPOINT=1`, checks the fatal default, observation of
    primitive and object reasons, a rejection handled before the checkpoint,
    reporting only once across repeated checkpoints, late handling, and a
    return to fatal behavior.
 -  *packages/cli/tests/unhandled-rejection-policy.test.ts* checks that
    MIR carries the policy only when it observes, that only the explicit
    flag emits the setup, that the setup precedes host installation, and
    that the flag works without `--test262-host`.
 -  *packages/backend-c/tests/fragments.test.ts* checks that only an
    observing harness launcher selects the policy and that the harness and
    body units are unchanged.
 -  *tests/test262-runner.test.ts* checks that the runner requests the
    observing policy for Script, strict, raw, asynchronous, non-blocking
    agent, and module cases.
 -  *tests/unhandled-rejection-policy-native.test.ts* runs native programs
    under both specialization policies with forced collection. It compares
    the tolerated program with Node.js run with
    `--unhandled-rejections=none`, checks that ordinary and test262-host
    executables without the flag still fail at the first rejection with its
    location, checks that a timer callback throw, a Script throw, and a
    rejected module entry still fail under observation, and checks that a
    child agent inherits both policies.


Consequences
------------

The runtime ABI becomes `m5-147` because `OseoContext` gains a field. The
runner's mapping from the fatal diagnostic to `unhandled-rejection-policy`
stays, so an execution outside the runner, or a regression that loses the
flag, still names the boundary instead of reporting a semantic failure.

The owned paths are expected to stop at their own assertions and completion
contracts instead of the checkpoint. Each one's classification is whatever
Root's full UPDATE observes; a later assertion failure or another
unsupported capability keeps that observed classification.


Failure modes and replacement triggers
--------------------------------------

Revisit this decision if a test262 case needs to observe the host's
rejection report itself, such as a `HostPromiseRejectionTracker` probe, or
if an ordinary-program profile needs a non-fatal policy. Either requires a
new decision rather than a broader meaning for this flag.


Links
-----

 -  [ADR 0010](./0010-promise-jobs.md): promise jobs and rejection tracking.
 -  [ADR 0012](./0012-native-event-loop.md): the native event loop and its
    host reporter.
 -  [ADR 0026](./0026-agent-clusters-and-shared-memory.md): the test262
    agent host.
 -  [*docs/language-profile-m5.md*](../language-profile-m5.md): standards
    harness gaps.
 -  [*docs/m5c-graph/unhandled-rejection-observation.md*](../m5c-graph/unhandled-rejection-observation.md):
    the node's work note.
