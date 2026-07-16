ADR 0012: Replaceable native event loop
=======================================

Status
------

Accepted for M4.


Context
-------

M4 needs timers, microtask checkpoints, error reporting, and deterministic
shutdown. Compiler semantics must not depend on a platform library's handle or
callback representation, and the initial cross target must keep linking without
new system dependencies.


Decision
--------

Runtime core owns host-neutral task, timer, clock, wakeup, and liveness
interfaces. The first POSIX adapter uses the C11-compatible platform clock and
sleep boundary already supplied by the Zig libc target. It introduces no
third-party event-loop library.

Timers are ordered by deadline and monotonically increasing insertion number.
Tests inject a clock and advance directly to the next deadline. Production
execution sleeps only when a referenced timer is the next possible source of
progress.

The entry module is the first task. Each completed or suspended task drains the
FIFO microtask queue before another task begins. Shutdown is a query over
runnable jobs and referenced handles, not over allocated promises or incidental
runtime objects.


Consequences
------------

Timer behavior is deterministic in tests and cross-links with the existing
AArch64 musl target. Future I/O adapters can integrate through the same wakeup
and liveness boundary without changing compiler IR or promise semantics.

Clock and sleep failures are owned host diagnostics. Thrown callbacks and
unhandled rejections pass through one host error reporter after the checkpoint.


Alternatives
------------

Embedding libuv was deferred because M4 timers do not justify its platform and
build surface. Busy polling was rejected because it wastes resources and makes
shutdown unclear. Using Node.js or Deno scheduling was rejected because native
executables must remain independent.


Replacement trigger
-------------------

Adopt a measured event library when sockets or filesystem readiness require it
or when timer measurements show the initial adapter is inadequate. Keep the
runtime interface, injected-clock tests, ordering rules, and liveness query
stable across that change.
