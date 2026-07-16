ADR 0011: Traced asynchronous continuations
===========================================

Status
------

Accepted and implemented for M4.


Context
-------

An `await` can outlive the native call that reached it. Retaining C stack frames
would make collection metadata, target ABIs, and shutdown depend on compiler
implementation details.


Decision
--------

Each admitted asynchronous function lowers to continuation-passing form. Its
entry creates a capability promise and runs synchronously until the first
`await`. Each remaining suffix becomes a private generated function. Its traced
closure environment is the continuation record and contains exactly the
bindings referenced by that suffix.

At `await`, lowering resolves the operand, attaches the continuation as a
reaction, and returns normally from native code. The reaction invokes the next
generated function through the shared dispatcher. Rejection bypasses the
fulfillment continuation and rejects the returned chain. Resolving the outer
capability with that chain preserves returned and thrown completion.

Top-level await is a scheduler checkpoint in the dependency-ordered whole-graph
script. It normalizes the value through one reaction and advances owned jobs and
timer turns only until that reaction settles. If no owned task can make
progress, it reports `OSEO3001` instead of retaining native recursion or
blocking indefinitely.


Consequences
------------

Continuation functions, closure captures, and scheduler checkpoints are
inspectable compiler output and explicit collector roots. Every allocation,
suspension, and resumption boundary is a MIR safepoint. Specialization can
occur inside an asynchronous function but cannot duplicate a suffix or
reschedule visible work.


Alternatives
------------

Stackful coroutines were rejected because they require target-specific stack
scanning and lifetime management. Replaying a function from its entry was
rejected because it repeats observable effects. Host asynchronous functions
were rejected because native executables cannot depend on a bootstrap runtime.


Replacement trigger
-------------------

Revisit continuation closure granularity if liveness measurements show
unacceptable retained state or if broader M5 control flow needs a numeric state
dispatcher. Preserve heap ownership, explicit roots, one resume per reaction,
and no suspended native stack in any replacement.
