ADR 0025: Native clock and wakeup checkpoint
============================================

Status
------

Accepted for M5b node `nio-clock-wakeup-checkpoint`. It closes delivery items
3 and 4 of [*PLAN-NIO.md*](../../PLAN-NIO.md) for monotonic time, epoch real
time, and wakeup, delivers the clock half of item 2, and freezes the clock,
wakeup, and liveness part of item 1. Operations, completions, cancellation,
and buffers remain open for the socket and name-resolution checkpoint.

The coordinator reserved this record's number, runtime ABI `m5-108`, and
property seed block `0x60007000` through `0x600070ff` for this node; ADR 0024,
ABI `m5-106` and `m5-107`, and seed blocks `0x60006e00` and `0x60006f00`
belong to other lanes.


Context
-------

[ADR 0012](./0012-native-event-loop.md) gave M4 a runtime-owned timer queue
whose logical clock jumped straight to the next deadline. That kept native
tests fast and deterministic, but a production `setTimeout(callback, 100)`
ran its callback without waiting, and the runtime had no monotonic clock, no
real-time capability outside the `Date` component's direct C11 read, and no
way for another thread to end a wait. The `Date` family, M6 timers and
performance work, and every later native I/O consumer need those three
facilities behind one boundary that a deterministic implementation can
replace.


Required contract
-----------------

 -  Monotonic time and epoch real time are separate capabilities. Only
    monotonic time drives a deadline; a real-time adjustment in either
    direction changes later real-time readings and nothing else.
 -  The deterministic scheduler remains the semantic oracle. Tests inject
    both clocks, wait results, and wakeups without sleeping, and those
    synthetic commands never become operations a platform adapter implements.
 -  Production waiting goes through one platform-neutral runtime boundary that
    carries no platform handle, never runs JavaScript, never owns a job queue,
    and never keeps an executable alive.
 -  Waiting blocks; it never polls. Another thread can end a wait.
 -  An unavailable or restricted facility selects a recorded fallback, or the
    capability is reported absent and its use is an owned diagnostic.
 -  Linux AMD64 and macOS AArch64 execute the adapter; AArch64 Linux links it.


Alternatives considered
-----------------------

Postponing the checkpoint would keep production timers instantaneous and leave
`Date` reading the host clock directly, which PLAN-NIO forbids once a clock
adapter exists, and it would give M6 nothing to consume.

libuv supplies clocks, timers, and an async wakeup handle on both targets, but
it owns its own loop, handle lifetimes, and worker pool, and brings a
third-party build and link surface. For one monotonic read, one real-time
read, and one wakeable wait it has no measurable advantage over the system
interfaces it wraps. It stays the portable baseline for the socket probes.

A Linux `io_uring` timeout operation with an eventfd would also wait and wake,
but it needs kernel feature detection, is disabled by some container seccomp
profiles and by `kernel.io_uring_disabled`, and gains nothing for a single wait
source. The socket checkpoint can register the selected eventfd in a ring or in
`epoll` without changing this contract. `epoll` with `timerfd` adds two
descriptors where `ppoll` on one eventfd already reaches nanosecond timeouts.

A condition variable with `pthread_cond_timedwait` cannot join a later
descriptor-based completion source, and macOS has no
`pthread_condattr_setclock`, so it would measure deadlines against real time.
Dispatch on macOS needs Blocks, framework linkage, and system worker threads
that the liveness rule would then have to account for.

`CLOCK_BOOTTIME` on Linux and `CLOCK_MONOTONIC` on macOS both count system
suspension, so every timer would fire at once on resume. The selected clocks
stop during suspension on both targets, matching Linux `CLOCK_MONOTONIC` and
the host reference runtimes' timer clocks.


Probe evidence
--------------

 -  *packages/runtime-c/native/runtime\_clock.c* and
    *packages/runtime-c/native/runtime\_clock\_posix.c* implement the boundary
    and the platform adapter.
 -  *tests/native-io/probes/clock-wakeup.c* drives the platform adapter
    through five facility configurations using only the adapter table.
 -  *tests/native-io/deterministic-clock.c* is the deterministic adapter, and
    *tests/native-io/clock-scheduler.c* runs the runtime's own timer queue
    against either adapter from a schedule on standard input.
 -  *tests/native-io/clock-wakeup.test.ts* keeps the probe, platform
    scheduler, deterministic trace, test262 timer-free, and AArch64 Linux link
    evidence in `mise run test`, compiled with address and undefined-behavior
    sanitizers for the host.
 -  *tests/property/nio-clock-wakeup.property.test.ts* generates schedules
    against an independent model at seeds `0x60007000` and `0x60007001`.
 -  The native fixture `monotonic-timer-wakeups` in
    *tests/native/fixtures/async.ts* compares Node.js, Deno, and both native
    specialization policies with collection forced at every safepoint.
 -  `mise run probe:native-io:clock` rebuilds the probe at `-O2` without
    sanitizers and prints the report below with its compiler invocation;
    `-- --link-only aarch64-linux-musl` links it for AArch64 Linux, and
    `-- --json PATH` retains the structured record.

The recorded run used Zig 0.16.0 with target `x86_64-linux-gnu` on Linux
7.1.12-200.fc44.x86\_64 (Fedora 44, glibc 2.43) on a 16-thread host whose
load average was about 17 to 30 from other lanes.


Observed results
----------------

Observed on Linux AMD64, one run, 100,000 reads per cost figure:

| Configuration      | Selected wait and wakeup  | Read cost, monotonic and real | Idle 200 ms wait                 | Wakeup from another thread     |
| ------------------ | ------------------------- | ----------------------------- | -------------------------------- | ------------------------------ |
| primary            | `ppoll` on `eventfd`      | 18.3 ns and 20.6 ns           | 200.130 ms elapsed, 0.010 ms CPU | returned 0.012 ms after wake   |
| pipe-fallback      | `poll` on a pipe          | 37 ns and 20.4 ns             | 200.182 ms elapsed, 0.010 ms CPU | returned 0.014 ms after wake   |
| sleep-fallback     | `clock_nanosleep`, absent | 18.5 ns and 20.1 ns           | 200.060 ms elapsed, 0.010 ms CPU | not delivered; deadline at 300 |
| real-time-fallback | `ppoll` on `eventfd`      | 19.5 ns and 4.4 ns (`time`)   | 200.207 ms elapsed, 0.011 ms CPU | returned 0.013 ms after wake   |
| monotonic-absent   | none                      | absent and 20.2 ns            | wait fails with no reading       | not measured                   |

 -  `CLOCK_MONOTONIC` and `CLOCK_REALTIME` report 1 ns resolution; the `time`
    fallback has one-second resolution and read 427 ms from `timespec_get`.
    The primary real-time reading was 0 ms from `timespec_get`. That compares
    two reads of one host clock; it is not an external accuracy measurement,
    which would need a network time source the probe does not use.
 -  Every monotonic sequence was non-decreasing, and every completed deadline
    wait reached its monotonic deadline.
 -  Two wakeups requested before a wait coalesced into one early return; the
    next wait reached its deadline. An indefinite wait returned on a wakeup
    from another thread with a wakeup facility, and failed at once without
    one.
 -  Opening the adapter added one descriptor for `eventfd`, two for the pipe,
    and none for the sleep fallback, and closing it restored the count. The
    process kept one thread while the adapter was open.
 -  Through the scheduler harness, a 150 ms timer with a cross-thread wakeup at
    40 ms and a canceled 60 s timer finished after about 150 ms with under
    1 ms of CPU time, and the canceled deadline caused no wait.
 -  *runtime\_clock.c* compiles to 1,820 bytes of text and
    *runtime\_clock\_posix.c* to 2,265 bytes at `-O2` for `x86_64-linux-gnu`.
 -  The probe and harness link for `aarch64-linux-musl` with the Linux adapter
    selected, and the runtime sources also compile for `aarch64-macos` from
    this host.

Not observed: macOS AArch64 execution. This host cannot run that target, so
the macOS selection rests on the documented system interfaces and on the same
*tests/native-io/clock-wakeup.test.ts* assertions, which select the macOS
facility names on that host and run inside its native `mise run test` gate. No
macOS timing is recorded here, and the first macOS run that measures differently
is a replacement trigger below.


Decision
--------

The runtime owns `OseoClockAdapter`, declared in *oseo\_runtime.h*: monotonic
nanoseconds, real-time milliseconds, a wait toward an optional monotonic
deadline that reports deadline, wakeup, or failure, a thread-safe coalescing
wakeup, a capability record, and close. *runtime\_clock.c* installs and opens
adapters, keeps the realm's monotonic origin and cached scheduler time, and
converts millisecond deadlines to adapter waits. *runtime\_clock\_posix.c* is
the one runtime translation unit that includes operating-system headers.

| Target        | Monotonic          | Real time                     | Wait and wakeup                                                     |
| ------------- | ------------------ | ----------------------------- | ------------------------------------------------------------------- |
| Linux         | `CLOCK_MONOTONIC`  | `CLOCK_REALTIME`, then `time` | `ppoll` on `eventfd`, then `poll` on a pipe, then `clock_nanosleep` |
| macOS         | `CLOCK_UPTIME_RAW` | `CLOCK_REALTIME`, then `time` | `kevent` on `EVFILT_USER`, then `poll` on a pipe, then `nanosleep`  |
| Other hosts   | absent             | `time`                        | absent                                                              |
| Deterministic | injected           | injected                      | scripted, never sleeps                                              |

Selection happens once, when a realm first needs a clock. A missing monotonic
clock has no fallback: substituting real time would let a wall-clock
adjustment move deadlines. The sleep fallback reports cross-thread wakeup as
absent, and an indefinite wait without a wakeup facility fails. Facility
requirements are Linux 2.6.27 for `eventfd` flags with `ppoll` and
`clock_nanosleep`, and macOS 10.12 for `CLOCK_UPTIME_RAW`; `kqueue` with
`EVFILT_USER` and pipes are older than both. The adapter links only the C
library on every target: no new system library, framework, or thread.
`OSEO_CLOCK_RESTRICT_*` bits make the adapter treat a facility as unavailable
at that same selection point, which is how the fallbacks are tested.

The scheduler starts the realm's clock at the first `setTimeout`, taking the
monotonic origin then. A task computes each deadline as the scheduler time it
cached when it started plus the converted delay, in whole milliseconds. A
timer turn unlinks canceled timers at the head, rereads the monotonic clock,
waits through the adapter while the earliest live deadline is still ahead,
caches the elapsed time, and runs that timer before draining microtasks. An
early wakeup only rereads the clock. A missing monotonic clock reports
`OSEO2001` “The host monotonic clock is unavailable.”, and a failed wait
reports `OSEO2001` “The host clock wait failed.” The scheduler never waits
without a deadline yet, because no referenced native operation exists; that
branch of the contract is for the operation checkpoint.

The deterministic adapter is test code under *tests/native-io/*, not a runtime
asset, and no production executable can select it. Its wait resumes exactly
at the deadline unless its script says otherwise, so it reproduces ADR 0012's
logical clock. Real-time reads reach callers through `oseo_clock_real_time`;
this checkpoint adds no JavaScript-visible consumer, and
`date-nio-clock-integration` moves `Date` onto it.

The checkpoint admits no language-profile family. `setTimeout` and
`clearTimeout` are host scheduling surface: their conversion, ordering, and
shutdown rules stay those of the frozen M4 event-loop profile, and only the
elapsed time a production wait takes changes. Its evidence therefore lives in
the fixed native, property, and differential suites named above rather than
in an M5 family record.


Consequences
------------

 -  Production executables now take real monotonic time to reach a timer
    deadline. A test or fixture with a long delay is correspondingly slow, and
    a delay near the existing `UINT32_MAX` millisecond clamp waits that long.
    That clamp predates this decision; M6 owns timer conversion.
 -  Timers with deadlines known when they are registered keep ADR 0012's
    order. A late operating-system wakeup can move a deadline registered in a
    later turn past one registered earlier, exactly as it can in Node.js and
    Deno, and differential fixtures space distinct deadlines for that reason.
    The deterministic adapter shows the order the contract implies for any
    scripted lateness.
 -  The reviewed test262 manifest keeps its `deterministic-logical-clock`
    scheduler value. No reviewed case or harness include schedules a timer, so
    no reviewed execution opens the adapter, and a test keeps that true.
 -  `OseoContext` gains the adapter pointer, its state, the origin, the
    restriction bits, and a started flag; *oseo\_runtime.h* gains the adapter
    types and six entry points; the runtime input gains two sources; and
    `abiVersion` moves to `m5-108`. Generated C is unchanged.
 -  `Date` still reads the host clock directly until
    `date-nio-clock-integration`.
 -  The operation, completion, cancellation, buffer, and referenced-operation
    liveness contracts, the versioned trace loader, and socket and resolver
    probes remain later PLAN-NIO work.


Failure modes and replacement triggers
--------------------------------------

 -  A macOS AArch64 run of *tests/native-io/clock-wakeup.test.ts* that fails,
    shows idle CPU use, or cannot wake from another thread reopens the macOS
    row.
 -  A supported kernel or sandbox that rejects `eventfd`, pipes, or the
    selected clock in practice, rather than through restriction bits, needs
    its own probe record.
 -  The socket checkpoint may replace the wait facility with the completion
    source it selects, provided the wakeup, fallback, and liveness evidence
    here still passes.
 -  A reviewed test262 case that schedules a timer requires revisiting the
    manifest scheduler record before it enters the subset.


Links
-----

 -  [*PLAN-NIO.md*](../../PLAN-NIO.md)
 -  [ADR 0012](./0012-native-event-loop.md)
 -  [ADR 0013](./0013-m5-edition-and-manifest.md)
 -  [ADR 0022](./0022-async-context-boundary.md)
 -  [*docs/runtime-components.md*](../runtime-components.md)
