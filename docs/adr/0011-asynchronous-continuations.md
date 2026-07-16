ADR 0011: Traced asynchronous continuations
===========================================

Status
------

Accepted for M4.


Context
-------

An `await` can outlive the native call that reached it. Retaining C stack frames
would make collection metadata, target ABIs, and shutdown depend on compiler
implementation details.


Decision
--------

Each asynchronous function lowers to a state machine with an entry and private
resume entry. Calling it creates a capability promise and a traced continuation
record. The record contains a numeric state, live lexical cells or values, the
capability, and the minimum completion data needed after suspension.

At `await`, lowering resolves the operand as a promise, stores values live
across suspension, registers fulfillment and rejection reactions, and returns
normally from native code. A reaction job enters the resume entry with one
normal or thrown completion. Dead locals remain in the ordinary native frame.

Top-level await uses the same continuation contract on a module evaluation
record. The module graph, rather than native recursion, owns dependency
resumption and cycle-progress detection.


Consequences
------------

Continuation layouts are inspectable compiler output and explicit collector
roots. Every allocation, suspension, and resumption boundary is a MIR
safepoint. Specialization can occur inside an asynchronous function but cannot
change state numbering or reschedule visible work.


Alternatives
------------

Stackful coroutines were rejected because they require target-specific stack
scanning and lifetime management. Replaying a function from its entry was
rejected because it repeats observable effects. Host asynchronous functions
were rejected because native executables cannot depend on a bootstrap runtime.


Replacement trigger
-------------------

Revisit the record layout if liveness measurements show unacceptable retained
state. Preserve heap ownership, explicit roots, one resume per reaction, and no
suspended native stack in any replacement.
