Native I/O plan
===============

Status
------

Implementation status: planned, probe work not started. This plan defines the
cross-milestone native I/O boundary that connects Oseo's deterministic scheduler
to operating-system clocks, wakeups, sockets, and files. It does not reserve a
numbered milestone or select a platform backend before measured prototypes
exist.

The initial production consumers are M5's `Date` family and M6's standardized
clock work. `fetch()` is the first network consumer. Later consumers include
selected M7 file APIs, subprocess pipes, and any interactive runtime work that
waits for external events. Work may begin with isolated probes while M5
continues, but a platform backend enters the runtime only after its ABI,
fallback, and target requirements are recorded in an architecture decision.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-M5.md*](./PLAN-M5.md), [*PLAN-M6.md*](./PLAN-M6.md),
[*PLAN-PT.md*](./PLAN-PT.md), [ADR 0012](./docs/adr/0012-native-event-loop.md),
and the target decisions under *docs/adr/*. Evidence from a probe must update
the affected plan or decision instead of turning a provisional backend into an
undocumented dependency.


Goal
----

Oseo needs a completion-driven native I/O adapter that leaves JavaScript
scheduling semantics in the runtime core. A platform backend submits work,
waits efficiently, reports completion, and exposes its liveness. It never runs
JavaScript callbacks directly or owns the ECMAScript job queue.

The adapter should use a modern operating-system facility when that facility
supports the required operation, works on the selected target, and wins a
representative measurement. Every optimized backend keeps a documented
fallback for older kernels, restricted sandboxes, unavailable operations, and
setup failure. A backend name is not a performance claim.

The initial design must support five separations:

 -  deterministic tests from wall-clock and real-network execution;
 -  monotonic deadlines from epoch-based real-time observation;
 -  JavaScript task ordering from operating-system completion order;
 -  the platform-neutral runtime ABI from backend-specific handles and buffers;
 -  an operation's requested cancellation from the point at which its resources
    are safe to release.


Non-goals
---------

This plan does not require one operating-system API to implement every kind of
I/O. A target may combine a completion queue for sockets, a different path for
regular files, and a small worker pool for blocking system interfaces.

It does not require an I/O ring on a platform that has no suitable ring API.
Nor does it require Oseo to use an API merely because it is newer than the
fallback. Adoption needs compatibility, safety, and workload evidence.

The plan does not define HTTP, TLS, URL, stream, or Node.js API semantics. M6
and M7 own those surfaces. It also does not add Windows as an execution target;
Windows probes become production work only after a separate target decision
adds the toolchain, ABI, and continuous-integration evidence.

The native I/O adapter is private runtime infrastructure. It is not a stable
embedder API or a route to Node-API compatibility.


Entry evidence
--------------

Native I/O work starts from these implemented contracts:

 -  the M4 runtime owns FIFO promise jobs, timer tasks, rejection checkpoints,
    a deterministic logical clock, and shutdown;
 -  each timer task drains microtasks before the next task starts, while a
    pending promise alone does not keep an executable alive;
 -  generated programs reach host capabilities through the runtime ABI rather
    than Node.js or Deno;
 -  runtime heap objects, roots, safepoints, and function dispatch have explicit
    ownership;
 -  Linux AMD64 and macOS AArch64 execute the native corpus, while AArch64 Linux
    retains compile-link and inspection evidence; and
 -  the runtime is split into owned translation units behind one private
    internal header.

ADR 0012 deliberately excluded I/O readiness, real clocks, and system-library
handles from M4. Its logical scheduler remains the semantic oracle and the
default test implementation while this plan adds an external event source.


Adapter contract to decide
--------------------------

The first architecture decision freezes a small platform-neutral contract
before a production backend enters the runtime. The contract describes
behavior and ownership, not a union of Linux, Apple, and Windows data types.

### Operations and capabilities

The adapter reports capabilities for monotonic time, epoch-based real time,
cross-thread wakeup, socket accept, connect, receive, send, shutdown, name
resolution, and the file operations admitted by a consumer plan. Optional
operations remain absent when the target or sandbox cannot provide them.
Callers either select a recorded fallback or report an owned failure for an
unavailable capability.

Each capability record includes the backend name, minimum operating-system or
kernel requirement, supported operation and flag set, fallback, cancellation
behavior, and whether it needs a new system library. Detection occurs at run
time where an operating system can disable or vary a facility independently of
the compiled target.

### Submission and completion

Submitting an operation produces an opaque runtime-owned token. A completion
returns that token, status, transferred byte count, and operation-specific
result. Backend pointers, file descriptors, native handles, submission queue
entries, and completion queue entries do not enter compiler IR or JavaScript
heap layouts.

The contract must define queue saturation and partial progress. Submission may
apply backpressure or return an owned resource failure; it may not lose a
request. Reads and writes can complete partially, and consumers must not assume
that one submission transfers the requested length.

An operating-system completion becomes an Oseo task. The runtime runs that
task, drains the FIFO microtask queue, performs the rejection checkpoint, and
only then starts another task. A backend callback cannot call a generated
function from an arbitrary worker thread.

### Waiting, clocks, and liveness

The scheduler tells the adapter the next monotonic timer deadline, if any, and
whether a referenced native operation remains live. The adapter waits until an
I/O completion, wakeup, or deadline. It must not busy-poll by default or leave a
hidden worker that keeps the executable alive after all referenced work ends.

The real-time capability reports milliseconds from the Unix epoch for `Date`
and other APIs that require civil time. It never drives a timer deadline.
Forward or backward adjustment of the system wall clock therefore changes
subsequent real-time observations without accelerating, delaying, or replaying
scheduled tasks.

Tests replace the real adapter with a deterministic implementation that accepts
independent monotonic and real-time values plus an explicit completion sequence.
Tests can advance either clock and inject a wall-clock discontinuity without
sleeping. Production completion order may be nondeterministic where the host API
permits it; the language-level contract must say which order is observable
instead of sorting results after the fact.

### Cancellation and resource lifetime

Cancellation is a race between a request and its completion. The contract
distinguishes a cancellation request, an accepted cancellation, and the final
completion that makes buffers and handles safe to release. Every submitted
operation reaches exactly one terminal runtime state even when the operating
system reports a late completion.

An in-flight operation roots its promise, callback state, handle, and buffers.
Native code must not retain a movable heap address across a safepoint. The first
implementation may copy into runtime-owned native storage or use an explicit
pinning contract, but that choice needs collector and failure-injection tests.
Closing an adapter, ring, descriptor, or handle does not by itself prove that a
kernel or worker has stopped touching its buffers.


Platform candidates
-------------------

The candidate table guides probes. It is not an accepted backend decision.

| Target or family       | Primary candidates                                  | Required fallback or boundary                        |
| ---------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Linux                  | `io_uring` for supported socket and file operations | `epoll` for readiness and workers for blocking calls |
| macOS                  | Network.framework, Dispatch I/O, and `kqueue`       | `kqueue` plus bounded workers where needed           |
| Windows, future target | IOCP plus I/O Ring for supported file operations    | overlapped I/O or bounded workers                    |
| Deterministic tests    | in-memory clock, resolver, and completion source    | none; this is the semantic oracle                    |

Clock probes select separate native facilities for monotonic deadlines and
epoch real time on each current target. They record resolution, failure
behavior, system-library or framework linkage, and the fallback. A backend
never substitutes real time for a missing monotonic clock or derives epoch time
from a monotonic counter without an explicit synchronization contract.

Name-resolution probes select the native resolver facility and its fallback
separately from socket I/O. They record address-family behavior, cancellation,
worker or framework use, shutdown with a request in flight, system-library
linkage, and capability failure.

The Linux probe compares direct [`io_uring`][Linux io_uring manual] system
calls, `liburing`, and [libuv] as a portable baseline. It records kernel feature
detection, sandbox restrictions, static-link effects, and the AArch64 musl
cross-link. SQ polling or registered buffers are optional optimizations, not
baseline requirements.

The macOS probe treats networking and file I/O as separate questions.
[Network.framework][Apple networking guidance] offers a C interface and
system-managed transport behavior; [Dispatch I/O][Apple Dispatch I/O] offers
asynchronous descriptor operations; `kqueue` provides the lower-level readiness
path, and libuv supplies a portable baseline. The probe must account for
framework linkage, Blocks or language extensions, Zig toolchain support, binary
size, and whether the selected API keeps the shared runtime source within its
documented C contract.

[Windows I/O Ring][Windows I/O Ring API] currently exposes a
capability-versioned operation set and does not by itself replace the network
and general completion roles of IOCP. A future Windows target therefore probes
a composed backend and performs run-time capability queries. The current Linux
and macOS work must not invent a Windows ABI or make M6 wait for an unaccepted
target.

[Linux io_uring manual]: https://man7.org/linux/man-pages/man7/io_uring.7.html
[libuv]: https://docs.libuv.org/en/v1.x/design.html
[Apple networking guidance]: https://developer.apple.com/documentation/technotes/tn3151-choosing-the-right-networking-api
[Apple Dispatch I/O]: https://developer.apple.com/documentation/dispatch/dispatchio
[Windows I/O Ring API]: https://learn.microsoft.com/en-us/windows/win32/api/ioringapi/


Probe and measurement plan
--------------------------

Checked-in probes live under *experiments/native-io/*. They run through named
`mise` tasks once those tasks exist and retain source, compiler invocation,
target, operating-system version, capability results, and observations. A
benchmark number without those inputs is not architecture evidence.

The M5 and M6 native probe corpus covers:

 -  monotonic clock reads, epoch real-time reads, and a wakeup from another
    thread;
 -  name resolution for local success and owned failure, cancellation before
    dispatch and while pending, fallback selection, and adapter shutdown with a
    request in flight;
 -  loopback TCP accept, connect, partial receive, partial send, and orderly or
    abrupt shutdown;
 -  cancellation before submission, while pending, and racing with completion;
 -  queue saturation, socket or operation-handle closure, and backend shutdown
    with work in flight;
 -  a long idle wait that demonstrates the absence of busy polling; and
 -  unavailable or restricted facilities taking the documented fallback.

Native clock probes are read-only. They must not induce a wall-clock jump or
write the system real-time clock. The deterministic adapter corpus separately
injects forward and backward wall-clock discontinuities and verifies that they
change real-time observations without moving monotonic deadlines or reordering
timer tasks.

The deferred M7 file probe corpus begins only after an admitted M7 consumer
names the required operations. It covers bounded reads and writes with ordinary
and registered buffers where available, file-specific cancellation and closure,
queue saturation, and shutdown with work in flight. Those probes do not enter
the M5 or M6 corpus.

Socket probes use loopback or an injected endpoint. Native resolver smoke tests
use local names such as `localhost` and inputs rejected before a public query.
Resolver lifecycle probes connect the production adapter to a probe-owned
provider whose answer or failure can be delayed; this exercises the native
submission, cancellation, fallback, wakeup, and shutdown paths without changing
host-global resolver settings. The deterministic adapter supplies generated
answers, address families, failures, and completion times. Ordinary checks do
not depend on external DNS, public hosts, or ambient network availability.

Measurements include clock resolution and call cost, setup cost, executable and
runtime-library size, system calls, idle CPU use, allocation, throughput, and
tail latency under small and batched operations. Clock probes record monotonic
behavior, epoch accuracy, and the selected fallback. Resolver probes record the
selected facility and fallback, address-family results, cancellation outcome,
worker occupancy where applicable, and bounded shutdown time. Safety evidence
includes strict warnings, address and undefined-behavior sanitizers, forced
collection, injected allocation failure, and repeated cancellation races. A
candidate wins only for the operation and target represented by the evidence.


Testing and observability
-------------------------

Deterministic adapter conformance uses a command model that covers submit,
including generated resolve operations, inject-completion, cancel, close, wake,
advance-monotonic-time, set-real-time, reference, and unreference. It compares
terminal operation state, clock observations, visible task order, root
lifetime, and scheduler liveness. Synthetic completion and clock commands
belong only to this adapter. They are not operations that a native backend must
implement.

Native conformance drives submit, cancel, close, wake, reference, and
unreference through the same public adapter surface, then observes the host's
clock values and completion events. Clock probes check monotonic behavior,
resolution, elapsed waits within recorded tolerances, epoch accuracy, and
fallback selection. They never advance the monotonic clock or write the system
real-time clock. Wall-clock discontinuity semantics remain a deterministic
adapter test.

Property tests extend [*PLAN-PT.md*](./PLAN-PT.md). They generate completion
batches, partial transfers, cancellation races, equal-deadline timers,
wall-clock jumps, name-resolution answers and failures, task-created
microtasks, resource exhaustion, and shutdown. Failing native runs retain the
backend, target, operating-system or kernel version, capability set, seed,
replay path, and an observed merged scheduler trace. Its header binds the trace
to the versioned canonical structured-input digest and issued-operation digest
defined by [*PLAN-PT.md*](./PLAN-PT.md). Each trace event has a sequence number
and monotonic observation. Real-time capability reads are trace events that
record the returned epoch value and their position among scheduler events; a
deterministic wall-clock discontinuity records the newly injected epoch value.
The trace also records issued operations, timer deadlines supplied to each wait,
wait-return reasons, completion order and batching, operation results,
partial-transfer counts, cancellation outcomes, and the enqueue and dequeue
positions of completion, timer, and wakeup tasks. Replay validates both digests,
advances the deterministic monotonic clock to the recorded observations, sets
deterministic real time before each recorded real-time read or discontinuity,
injects each completion batch, and checks the recorded clock results and
scheduler task order. This reproduces the adapter-visible interleaving, not a
kernel or backend implementation defect. The retained native evidence remains
authoritative for such a defect. A seed and command path alone are not a replay
claim for a native race.

Test observations distinguish requested, submitted, completed, canceled,
failed, and released operations. Private counters may record waits, wakeups,
submissions, completions, fallback selections, and copied bytes. They are not
part of the program-visible API and are removed before differential output
comparison.


Relationship to compatibility work
----------------------------------

M5's `Date` family consumes the completed clock and wakeup checkpoint. That
checkpoint supplies epoch real time and moves existing production timer waits
to monotonic elapsed time together. `Date.now()` and `Date` operations that
obtain the current time use real time rather than the logical or monotonic
clock. Standards, differential, and property tests inject fixed clock values;
M5 code does not bypass this adapter to read a host clock directly.

M6 groups that use only pure data and the deterministic scheduler do not wait
for native I/O. Its standardized timeout and performance work consumes the
monotonic contract from this plan. `fetch()` begins only after the network
capabilities, cancellation, buffer ownership, and deterministic adapter have an
accepted decision and an implemented backend on both supported execution
targets, and after M6 accepts its separate TLS client and trust-store decision.

M6 owns Web API semantics, HTTP and TLS behavior, trust-store policy, streams,
abort integration, and web-platform-test evidence. This plan owns transport
submission and completion. Neither layer may bypass the other by embedding
JavaScript scheduling rules in a platform callback.

M7 selected file APIs consume the same operation, cancellation, and buffer
contracts. File capability work may extend the adapter after M6 networking
lands; M6 does not need to pre-implement the whole Node.js filesystem surface.


Delivery order
--------------

1.  Freeze the platform-neutral operation, completion, cancellation, buffer,
    clock, wakeup, and liveness model with a deterministic test adapter.
2.  Add the checked-in native probe harness and retain reproducible build,
    target, capability, safety, and measurement records.
3.  Probe monotonic time, epoch real time, and wakeup candidates and fallbacks
    on Linux AMD64 and macOS AArch64, preserving AArch64 musl compile-link
    evidence.
4.  Accept the clock and wakeup backend decision, then integrate those
    capabilities and switch existing production timer waits and deadlines from
    instant logical-clock advancement to monotonic elapsed time. Deterministic
    tests keep the injected logical scheduler oracle, and promise-job semantics
    do not change.
5.  Before native completion properties enter a gate, add the explicit
    versioned-trace loader required by [*PLAN-PT.md*](./PLAN-PT.md) and retain
    merged-scheduler-trace and deterministic trace-replay records.
6.  Probe socket and name-resolution candidates and fallbacks on Linux AMD64
    and macOS AArch64, including cancellation, framework, toolchain, and
    C-language boundary costs.
7.  Accept the socket and name-resolution backend decisions, then integrate the
    capabilities required by M6.
8.  Probe and select file backends only when an admitted M7 consumer requires
    them; file work does not gate M5 or M6.
9.  Add a Windows probe and production backend only after Windows becomes a
    supported execution target through its own decision and CI evidence.

The clock and wakeup checkpoint closes independently of socket, name-resolution,
and file investigation. Each capability checkpoint updates the adapter
decision, target descriptions, runtime component ownership, and affected
consumer plan. A probe that rejects a modern facility is useful evidence and
leaves the fallback as the selected backend instead of blocking compatibility
work.


Documentation changes
---------------------

The accepted backend decision updates [*DESIGN.md*](./DESIGN.md), target
documentation, and [*docs/runtime-components.md*](./docs/runtime-components.md)
with the stable adapter ownership and selected system dependencies.
[*ROADMAP.md*](./ROADMAP.md) records the native I/O track status without copying
the per-platform decision table.

[*PLAN-M5.md*](./PLAN-M5.md) records the real-time gate for `Date`, while
[*PLAN-M6.md*](./PLAN-M6.md) records which monotonic-clock, socket, and
name-resolution gates its API groups consume. M7 planning records file gates
when that milestone receives an active plan. Contributor and package
documentation name commands only after the corresponding probes or backends
exist.


Exit criteria
-------------

The initial native I/O track is complete when:

 -  one accepted architecture decision defines the platform-neutral adapter,
    scheduler handoff, cancellation, buffer lifetime, and liveness rules;
 -  deterministic monotonic-time, real-time, and completion injection remain
    the semantic oracle for scheduler, M5, M6, and property tests;
 -  native race failures retain an observed merged scheduler trace that places
    completions relative to timer deadlines, records epoch real-time reads, and
    replays through the deterministic adapter without reproducing kernel
    timing;
 -  the property task selects that trace through an explicit artifact path,
    validates its suite, generated-case, and issued-operation identity, and
    never ignores the input or chooses an implicit latest failure;
 -  Linux AMD64 and macOS AArch64 have measured monotonic-clock, real-time,
    wakeup, socket, and name-resolution backends plus documented fallbacks;
 -  AArch64 Linux retains compile-link and adapter capability inspection
    evidence;
 -  unsupported kernels, restricted facilities, and setup failures select a
    tested fallback or report an owned capability failure;
 -  no in-flight operation loses its rooted JavaScript state or releases a
    native buffer before terminal completion;
 -  cancellation, partial completion, saturation, shutdown, and late completion
    pass model, property, failure-injection, and sanitizer tests;
 -  M6 can implement `fetch()` without importing a platform handle into compiler
    IR or giving a backend ownership of promise-job semantics;
 -  capability and performance reports are reproducible from documented tasks;
    and
 -  `mise run check`, `mise run test`, the applicable native tasks, and the
    extended property task pass from a clean checkout.

Windows support is not an exit criterion until Windows is an accepted execution
target. Once accepted, its IOCP and I/O Ring composition must satisfy the same
adapter and evidence contracts before it is described as supported.
