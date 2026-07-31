ADR 0022: Asynchronous context propagation boundary
===================================================

Status
------

Proposed. This record defers asynchronous context propagation: the TC39
AsyncContext proposal, and an `AsyncLocalStorage` compatibility layer built
on the same mechanism. It preserves the runtime boundaries that later
propagation needs, and it decides placement and prerequisites, not the
design. Until this record is accepted, the reservations it places in
[*PLAN-NIO.md*](../../PLAN-NIO.md) and the review obligations it names are
provisional.


Context
-------

The [AsyncContext proposal] adds `AsyncContext.Variable` and
`AsyncContext.Snapshot`. For promise continuations and the scheduling
callbacks the proposal itself specifies, a callback runs in the context
mapping that was current where it was registered, not where it happens to
run; for other web APIs, integration rules still under design may select a
causal or empty context instead. [`AsyncLocalStorage`][Node.js async context] is
established Node.js prior art with equivalent propagation semantics, and
the server frameworks and observability libraries that M7 may target use
it. Before this record, no Oseo plan, profile, or decision constrained
future work on the feature's behalf.

The proposal remains at stage 2, and its generator capture rules and web
integration remain unsettled.
[ADR 0020](./0020-m5-applicable-test-inventory.md) places proposal paths
outside the M5 applicable-test inventory, so implementing the proposal now
would not change measured M5 coverage and would commit Oseo to provisional
semantics.

Deferral depends on the runtime keeping its current construction and
dispatch boundaries. `reaction_create()` constructs promise reactions,
`enqueue_job()` constructs queued jobs, and `jobs_run_next()` dispatches
them in *runtime\_promise.c*. Timer callbacks enter JavaScript through
`run_timer_turn()` in *runtime\_event\_loop.c*, currently the only
host-task boundary. `OseoContext` already carries traced state in
`async_call_capability`: `oseo_promise_async_call()` saves and restores
that field around the initial asynchronous call, and `run_reaction_job()`
saves and restores source-location state around reaction callbacks.
[ADR 0011](./0011-asynchronous-continuations.md) lowers ordinary `await`
resumption to a promise reaction, and an asynchronous generator also
resumes through an ordinary reaction, so later propagation can attach to
reaction construction and dispatch rather than to suspension-frame layouts.
M5 asynchronous expansion, the native I/O adapter, and M6 event work must
preserve equivalent boundaries.

[AsyncContext proposal]: https://github.com/tc39/proposal-async-context
[Node.js async context]: https://nodejs.org/docs/latest/api/async_context.html


Required contract
-----------------

Until a later record admits the feature, the runtime preserves:

 -  centralized constructors for promise reactions and queued jobs, each
    able to gain a traced snapshot field without adding construction
    paths;
 -  a common dispatcher for queued jobs, and one JavaScript re-entry point
    per host task source, each able to install and restore agent state
    around the callback it invokes;
 -  `OseoContext` as the agent-state record, able to gain a
    current-snapshot field with ordinary initialization, tracing, and
    teardown;
 -  a snapshot slot on the runtime-side operation record of
    [*PLAN-NIO.md*](../../PLAN-NIO.md) and on the microtask record that M6
    introduces, plus an installation point at M6 event dispatch; and
 -  the layering of [*DESIGN.md*](../../DESIGN.md): the engine owns
    language-level propagation, and M7 implements `AsyncLocalStorage` in
    terms of that propagation rather than as a second mechanism.


Alternatives considered
-----------------------

1.  **Implement AsyncContext now.** Rejected. The generator capture rules
    and web integration are unsettled at stage 2, the feature is outside
    the ADR 0020 inventory, and no admitted consumer exists before M6 and
    M7.
2.  **Shim `AsyncLocalStorage` in M7 without an engine primitive.**
    Rejected. `await` does not call the public `Promise.prototype.then`,
    so patching public promise methods cannot propagate context across an
    `await`. The result would be an `AsyncLocalStorage`-shaped API with
    incomplete propagation, exactly what the compatibility rule in
    [*ROADMAP.md*](../../ROADMAP.md) forbids.
3.  **Add snapshot fields to existing M4 records now.** Rejected. Unused
    `OseoValue` fields would grow `OseoContext` and the reaction, job, and
    timer records and would need initialization and tracing before any
    consumer exists. The runtime ABI is private, so those fields can land
    together with the feature. Records that *PLAN-NIO.md* and M6 introduce
    follow the required contract above instead.
4.  **Postpone behind stated invariants.** Selected. The construction and
    dispatch boundaries above already exist. Preserving them adds no state
    to current runtime records and keeps later propagation changes
    localized to those boundaries.


Decision
--------

 -  `AsyncContext.Variable`, `AsyncContext.Snapshot`, and
    `AsyncLocalStorage` stay outside every current milestone, and no
    release claims them. `node:async_hooks` remains subject to M7's
    separate evidence-driven API selection.
 -  The invariants in the required contract become review obligations for
    the M5 asynchronous streams, [*PLAN-NIO.md*](../../PLAN-NIO.md), and
    M6 design work. A change that must split one of these boundaries
    updates this record in the same change instead of bypassing it.
 -  [*PLAN-NIO.md*](../../PLAN-NIO.md) reserves a snapshot slot on its
    runtime-side operation record. For an I/O operation, restoration
    happens where its completion becomes an Oseo task; the slot never
    crosses the adapter contract.
 -  M6 designs `queueMicrotask()` so that a call-time snapshot field can
    be added without changing observable dispatch order. Event dispatch
    keeps an installation point where a snapshot can be installed around
    listener invocation; which snapshot a listener observes follows the
    proposal's web-integration rules once they settle, and listener
    records do not commit to retaining registration-time snapshots.
 -  Context propagation through every admitted asynchronous form now has a
    return-to-caller suspension owner. Unit 7.4 moved ordinary asynchronous
    `await` into a traced frame, Unit 7.5 did the same for framed `for await`
    steps and asynchronous generator `yield*` delegation, and Unit 7.6 moved
    framed asynchronous iterator closing through that owner. Unit 7.7 gives
    module top-level await and `for await` step and close operations a private
    traced module continuation. AsyncContext remains unadmitted until its own
    plan selects the snapshot representation and proposal semantics.
 -  The admitting plan defines the snapshot representation and measures
    capture cost and the added per-reaction, per-job, and per-timer
    retention under the accounting contract of
    [*PLAN-GC.md*](../../PLAN-GC.md).


Consequences
------------

 -  Reviews of asynchronous, native I/O, and event changes check the
    construction and dispatch boundaries above; those tracks do not
    otherwise depend on the stage 2 proposal.
 -  Later propagation changes stay localized to `OseoContext` and the
    reaction, job, timer, and operation records, following the two
    save-and-restore precedents the runtime already contains. The
    admitting plan still owns the API, representation, and
    proposal-specific semantics.
 -  Closing the drain-based module suspension gaps removes that prerequisite
    without selecting or admitting an AsyncContext API.
 -  No *PLAN-ACTX.md* exists yet. When a replacement trigger below fires,
    that plan is written with this record in its entry evidence, and this
    record moves to accepted or superseded.


Failure modes and replacement triggers
--------------------------------------

Reopen or promote this record when:

 -  the proposal advances past stage 2 with settled capture rules for
    generators and the web integration;
 -  M7 package-compatibility evidence shows that targeted packages fail
    without `AsyncLocalStorage`;
 -  the prerequisite suspension gaps close, so the feature can be
    scheduled against current milestones; or
 -  work in any track cannot proceed without splitting a recorded
    boundary, in which case the revised invariant is recorded here before
    the split lands.


Links
-----

 -  [ADR 0010](./0010-promise-jobs.md) owns the FIFO job queue and the
    construction and dispatch paths this record depends on.
 -  [ADR 0011](./0011-asynchronous-continuations.md) places ordinary
    `await` resumption on a promise reaction, the boundary later capture
    attaches to, and its replacement trigger already demands liveness
    measurement for retained state.
 -  [ADR 0012](./0012-native-event-loop.md) owns the host-task boundary
    that timer callbacks and future I/O completions cross.
 -  [ADR 0020](./0020-m5-applicable-test-inventory.md) keeps proposal
    paths outside the M5 denominator, which is why deferral costs no
    measured coverage.
 -  [*PLAN-NIO.md*](../../PLAN-NIO.md) reserves the operation-record
    snapshot slot and names the restoration point for I/O completions.
 -  [*PLAN-M6.md*](../../PLAN-M6.md) owns the listener and microtask
    registration designs this record constrains.
 -  [*DESIGN.md*](../../DESIGN.md) records the layering that places the
    primitive in the engine and `AsyncLocalStorage` in the Node.js layer.
 -  [*PLAN-GC.md*](../../PLAN-GC.md) owns the accounting under which the
    eventual retention increase is measured.
