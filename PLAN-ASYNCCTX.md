AsyncLocalStorage compatibility plan
====================================

Status
------

Implementation status: planned, not scheduled. The work is not urgent. This
plan defines a Node.js-compatible `AsyncLocalStorage` built on an engine-owned
context propagation primitive. It reserves no milestone and adds no repository
command.

Proposed [ADR 0022](./docs/adr/0022-async-context-boundary.md) governs
placement. It keeps `AsyncLocalStorage` outside every current milestone,
requires the engine to own propagation, and requires M7 to build
`AsyncLocalStorage` on that propagation rather than as a second mechanism. ADR
0022 names the future plan *PLAN-ACTX.md*; this is that plan. Starting work
requires accepting or superseding ADR 0022.

This plan is governed by [*DESIGN.md*](./DESIGN.md),
[*ROADMAP.md*](./ROADMAP.md), [*PLAN-NIO.md*](./PLAN-NIO.md),
[*PLAN-M6.md*](./PLAN-M6.md), [*PLAN-GC.md*](./PLAN-GC.md),
[*PLAN-PT.md*](./PLAN-PT.md), and the records under *docs/adr/*.


Scope
-----

The plan covers `AsyncLocalStorage` from `node:async_hooks`:

 -  the constructor;
 -  `run(store, callback, ...args)`, `exit(callback, ...args)`, and
    `getStore()`;
 -  `enterWith(store)` and `disable()`; and
 -  the static `AsyncLocalStorage.bind(fn)` and
    `AsyncLocalStorage.snapshot()`.

`AsyncResource` is in scope where packages need it to carry context:
`runInAsyncScope`, `bind`, and the static `AsyncResource.bind`. Its
`asyncId`, `triggerAsyncId`, and `emitDestroy` belong to the async hooks ID
model, which this plan does not adopt; see the open questions.

Out of scope:

 -  the TC39 AsyncContext proposal and any `AsyncContext` global, which a
    later plan can build on the same primitive;
 -  `createHook`, `executionAsyncId`, `executionAsyncResource`, and the rest
    of `node:async_hooks`; and
 -  `diagnostics_channel` and other modules that use async context.


Reference behavior
------------------

The reference is the pinned Node.js 24.21.0. Node.js 24 implements
`AsyncLocalStorage` over `AsyncContextFrame`, whose `enterWith` and promise
behavior can differ from the older async hooks implementation. The first
checkpoint records the observed behavior for every case below, under the
pinned version, instead of assuming it. Deno 2.9.7 also provides
`node:async_hooks` and serves as a second reference where it agrees.


Engine primitive
----------------

The runtime gains one current-snapshot field in `OseoContext`. A snapshot is an
immutable, traced map from `AsyncLocalStorage` instance to store. `run` and
`exit` install a derived snapshot for the duration of the callback and restore
the previous one on every exit, including a throw. `enterWith` replaces the
current snapshot until the enclosing propagation boundary restores it.

ADR 0022 names where a snapshot is captured and restored. Capture happens when
the work is scheduled; restoration happens around the callback that runs it:

 -  promise reactions, through `reaction_create()` and the reaction job
    dispatch in *runtime\_promise.c*;
 -  `await` resumption, which ADR 0011 lowers to a promise reaction, and
    asynchronous generator resumption;
 -  queued jobs through `enqueue_job()` and `jobs_run_next()`;
 -  timers through `run_timer_turn()` in *runtime\_event\_loop.c*;
 -  native I/O completions, through the snapshot slot that
    [*PLAN-NIO.md*](./PLAN-NIO.md) reserves on its operation record; and
 -  M6 `queueMicrotask()` and event dispatch, through the slot and
    installation point that [*PLAN-M6.md*](./PLAN-M6.md) keeps.

`FinalizationRegistry` cleanup callbacks, unhandled-rejection reporting, and
agent message handlers are listed separately in the first checkpoint, with the
reference behavior for each.

When no `AsyncLocalStorage` exists, the snapshot is empty and capture copies
one pointer. The plan measures that cost per reaction, job, and timer, and the
retention cost of non-empty snapshots under
[*PLAN-GC.md*](./PLAN-GC.md). No specialization depends on whether a store is
set; a program with and without specialization observes the same stores.


Module exposure
---------------

`node:async_hooks` is a Node.js built-in module. M7 owns `node:` module
resolution and Node.js API selection, as [*ROADMAP.md*](./ROADMAP.md)
describes. This plan needs either that mechanism or a narrower built-in module
seam that M7 later absorbs. The engine primitive can land first, because it
has no public API until the module exists.


Work units
----------

1.  Reference observation: record Node.js 24.21.0 and Deno 2.9.7 behavior for
    every API and boundary above.
2.  Placement decision: accept or supersede ADR 0022 with the snapshot
    representation and the measured empty-snapshot cost.
3.  Engine primitive: the snapshot field and capture and restore at every
    existing boundary, tested through an internal fixture API.
4.  Module seam for `node:async_hooks`.
5.  `AsyncLocalStorage` and the selected `AsyncResource` methods.
6.  NIO and M6 boundaries, as each consumer lands.

Evidence follows *CONTRIBUTING.md*. A property suite generates schedules of
`run`, `exit`, `enterWith`, promise chains, `await`, timers, and throws, and
compares every `getStore()` result with an independent model of the snapshot
rules. Differential tests compare native output with both reference hosts.


Open questions
--------------

 -  Do target packages need `AsyncResource.asyncId()` and `triggerAsyncId()`?
    If so, the plan needs a bounded ID model.
 -  Should the module seam land before M7, or should this plan wait for M7's
    built-in module mechanism?
 -  If TC39 AsyncContext advances first, should the primitive follow its
    snapshot semantics where they differ from `AsyncContextFrame`?
