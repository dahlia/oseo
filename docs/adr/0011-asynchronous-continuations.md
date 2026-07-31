ADR 0011: Traced asynchronous continuations
===========================================

Status
------

Accepted and implemented for M4 and M5a.


Context
-------

An `await` can outlive the native call that reached it. Retaining C stack frames
would make collection metadata, target ABIs, and shutdown depend on compiler
implementation details.


Decision
--------

M4 lowered each admitted asynchronous function to continuation-passing form.
Its direct statement-level await points became private generated suffix
functions with traced closure environments.

M5a Unit 7.4 replaces that frontend split for ordinary asynchronous functions
and arrows with a traced suspension frame. The frame uses the generator-shaped
root and completion layout already owned by the runtime, but the object that
carries it is private and never becomes the call result. A call creates one
capability promise, runs synchronously until the body completes or reaches
`await`, and keeps locals, expression temporaries, pending completions, and
collector roots in the frame while native code returns.

At `await`, lowering resolves the operand and attaches fulfillment and
rejection reactions through the centralized promise reaction constructor. A
reaction resumes the saved block through the shared generated dispatcher.
Fulfillment supplies the expression value. Rejection raises a throw completion
at the suspension point, so every enclosing handler, finalizer, and iterator
cleanup keeps its ordinary precedence. A body return resolves the capability,
and an uncaught throw rejects it.

M5a Unit 7.5 uses the same frame for `for await` iterator steps inside an
ordinary asynchronous function or asynchronous generator and for `yield*`
delegation steps inside an asynchronous generator. Generated code starts a
promise-producing iterator operation, retains its promise and any direct-value
result mode in traced root slots, and returns to the caller. Fulfillment and
rejection resume the saved block through the same dispatcher before the
iterator result is inspected. Async-from-Sync continuation promises use an
internal fulfillment reaction, so awaiting the synchronous step value also
retains no native frame.

M5a Unit 7.6 uses the same frame for `AsyncIteratorClose` reached by abrupt
`for await` completion in an ordinary asynchronous function or asynchronous
generator, and by a native asynchronous `yield*` delegation whose iterator has
no `throw` method. The close start retains its promise, saved throw mode, and
wrapper result mode in traced roots. Its reaction resumes generated code,
which applies close-result validation and restores the saved completion with
the required precedence. A never-settling close therefore leaves its owning
operation pending.

AsyncFromSyncIteratorContinuation attaches a rejection reaction when
`closeOnRejection` applies to a non-done step. That reaction closes the wrapped
synchronous iterator before rejecting with the original reason, without
retaining the native stack or allowing a close failure to replace that reason.
When a wrapped synchronous `yield*` iterator has no `throw` method, its wrapper
performs synchronous `IteratorClose` over the underlying record before
rejecting. The asynchronous generator frame awaits that rejection without
reading or awaiting the close result's `done` or `value` fields.

Top-level await is a scheduler checkpoint in the dependency-ordered whole-graph
script. It normalizes the value through one reaction and advances owned jobs and
timer turns only until that reaction settles. If no owned task can make
progress, it reports `OSEO3001` instead of retaining native recursion or
blocking indefinitely.

Module top-level `for await` retains the module checkpoint path. Unit 7.7 owns
that boundary.


Consequences
------------

Suspension blocks, saved roots and completions, and scheduler checkpoints are
inspectable compiler output and explicit collector state. Every allocation,
suspension, and resumption boundary is a MIR safepoint. Specialization can
occur inside an asynchronous function but cannot duplicate a suspension path
or reschedule visible work.


Alternatives
------------

Stackful coroutines were rejected because they require target-specific stack
scanning and lifetime management. Replaying a function from its entry was
rejected because it repeats observable effects. Host asynchronous functions
were rejected because native executables cannot depend on a bootstrap runtime.


Replacement trigger
-------------------

Revisit suspension-frame liveness if measurements show unacceptable retained
state. Preserve heap ownership, explicit roots, one resume per reaction, the
centralized construction and dispatch boundaries of ADR 0022, and no suspended
native stack in any replacement.
