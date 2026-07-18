ADR 0012: Replaceable native event loop
=======================================

Status
------

Accepted and implemented for M4.


Context
-------

M4 needs timers, microtask checkpoints, error reporting, and deterministic
shutdown. Compiler semantics must not depend on a platform library's handle or
callback representation, and the initial cross target must keep linking without
new system dependencies.


Decision
--------

Runtime core owns the FIFO microtask queue, timer task queue, logical clock, and
liveness decision. The C runtime ABI is the replacement boundary for future
host task and I/O adapters. M4 introduces no third-party event-loop library or
platform-specific handles.

Timers are ordered by deadline and monotonically increasing insertion number.
The scheduler advances its logical clock directly to the next deadline. M4 has
no language-visible wall-clock API, so native and generated tests observe the
same ordering without sleeping.

The entry module is the first task. Each completed or suspended task drains the
FIFO microtask queue before another task begins. Shutdown is a query over
runnable jobs and referenced handles, not over allocated promises or incidental
runtime objects.


Consequences
------------

Timer behavior is deterministic in every M4 executable and cross-links with the
existing AArch64 musl target. Future I/O adapters can extend the runtime ABI
without changing compiler IR or promise semantics.

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
or when wall-clock APIs enter a selected host profile. Keep the runtime
boundary, deterministic logical-clock tests, ordering rules, and liveness query
stable across that change.
