ADR 0010: Runtime-owned promise jobs
====================================

Status
------

Accepted and implemented for M4.


Context
-------

Produced executables cannot delegate promise semantics to Node.js or Deno.
Reaction order, thenable assimilation, and unhandled rejection timing must
remain visible to tests and independent of incidental allocation or shutdown.


Decision
--------

Promises, reactions, capabilities, and jobs are traced runtime objects. A
promise has one pending, fulfilled, or rejected state and an ordered reaction
list. Only the first settlement changes state.

The runtime owns one FIFO microtask queue. Promise settlement enqueues reaction
jobs and never invokes a handler inline. Thenable assimilation also uses a job
so reading and calling foreign `then` behavior cannot recurse through the
native stack without a queue boundary.

Unhandled rejection tracking observes rejected promises at the end of a
microtask checkpoint. It retains explicit pending-report, reported, and handled
states. The host boundary receives reports after queue drainage, never from the
collector or process destructor.


Consequences
------------

Jobs are explicit roots and queue operations are failure-injection points.
Draining a job releases completed reactions. Tests can model settlement and
queue order without wall time or host promises.

Promise built-ins share the ordinary call and abrupt-completion ABI. Promise
allocation and reaction execution are MIR safepoints.


Alternatives
------------

Host promises were rejected because they would embed bootstrap runtimes and
make ordering host-dependent. Inline reactions were rejected because they do
not implement ECMAScript jobs. A queue hidden inside generated C was rejected
because compiler and collector tests could not inspect its roots.


Replacement trigger
-------------------

Revisit queue storage when measurements show that one FIFO structure is a
material bottleneck. Any replacement must preserve FIFO observation, explicit
rooting, deterministic checkpoints, and the same generic promise semantics.
