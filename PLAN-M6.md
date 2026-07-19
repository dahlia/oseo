M6 plan for the Minimum common web API
======================================

Status
------

Implementation status: planned, not started. M6 implements the web-platform
surface standardized by WinterTC's [Minimum common web API] while M5
continues toward its ECMA-262 claim. Individual API groups may begin as soon
as their engine prerequisites are stable; completing M6 and making a
WinterTC conformance claim still depends on the ECMAScript requirements
named by the targeted standard edition.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-M5.md*](./PLAN-M5.md), [*PLAN-PT.md*](./PLAN-PT.md), the frozen
language profiles, and accepted records under *docs/adr/*. The runtime
componentization in [*PLAN-RCR.md*](./PLAN-RCR.md) is the prerequisite for
every large web API family: a new API lands in an owned runtime component,
not in a catch-all translation unit. Evidence that changes one of these
contracts updates the affected document in the same change.

[Minimum common web API]: https://min-common-api.proposal.wintertc.org/


Goal
----

M6 gives Oseo the shared web-platform surface that every major edge runtime
already provides: encoding, URLs, events, abort signals, timers, structured
cloning, blobs, streams, `fetch()`, Web Crypto, and the required
WebAssembly APIs. A group is complete only when its interfaces, methods,
and properties pass the applicable web-platform tests, its behavior is
rooted in the collector, and its failures surface as owned diagnostics or
the specified language values.

Intermediate releases publish per-interface coverage without describing
partial coverage as WinterTC conformance. Oseo claims conformance only when
every interface in the targeted Minimum common web API edition passes, the
documented deviations satisfy that edition's server-runtime rules, and the
underlying ECMAScript implementation meets the requirement the standard
names.


Entry evidence
--------------

M6 group work begins from these contracts:

 -  the M4 native scheduler owns promise jobs, timers, a deterministic
    logical clock, and shutdown, and pending promises alone do not keep an
    executable alive;
 -  generated programs reach host capabilities only through the documented
    runtime ABI, never by calling Node.js or Deno;
 -  the compatibility manifest and test262 harness report honest
    classifications, and [ADR 0016](./docs/adr/0016-dynamic-source-boundary.md)
    keeps dynamic source evaluation explicitly unsupported;
 -  property suites retain seeds, replay paths, and structured inputs under
    [*PLAN-PT.md*](./PLAN-PT.md); and
 -  strict C warnings, sanitizers, Linux AMD64 execution, macOS AArch64
    execution, and AArch64 Linux compile-link evidence gate every native
    change.


Standards boundary
------------------

An architecture decision opens M6 by freezing the targeted Minimum common
web API edition, the web-platform-test revision, and the deviation policy
for server runtimes. The record classifies every interface in the standard
as planned, deferred, or deviating, so coverage reports have a stable
denominator, exactly as [ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md)
fixed the ECMA-262 claim boundary.

Web-platform tests join the repository the way test262 did: a pinned
revision, a reviewed subset manifest with per-case classifications, an
owned harness adapter that reports unavailable capabilities honestly, and a
gate that rejects drift from reviewed classifications. The harness adapter
implements *testharness.js* observation rather than replacing tested
behavior with native shortcuts.


Dependency-ordered API groups
-----------------------------

Each group lands as one or more coherent semantic units with its
prerequisites named. The order may change when web-platform tests expose a
shared prerequisite; changing it updates this plan in the same change.

1.  **Text encoding and URLs.** `TextEncoder`, `TextDecoder`, `URL`, and
    `URLSearchParams`. Prerequisites: a UTF-8 transcoding boundary for the
    runtime's UTF-16 strings and the binary-data built-ins from the M5
    stream, because encoding APIs produce `Uint8Array` values.
2.  **Events and abort signals.** `Event`, `EventTarget`, `AbortController`,
    and `AbortSignal`, including `AbortSignal.timeout()` on the M4 timer
    queue. Prerequisites: stable class-shaped built-ins from M5 and
    reentrancy rules for listener invocation order.
3.  **Timers, performance, and error reporting.** Standardized `setTimeout`
    and `setInterval` behavior beyond the M4 subset, `queueMicrotask()`,
    `performance.now()`, `structuredClone()`, and host error reporting
    events. Prerequisites: a monotonic clock host interface and the
    serialization walk shared with later `Blob` work.
4.  **Binary payload containers.** `Blob`, `File`, and `FormData`.
    Prerequisites: groups 1 and 3.
5.  **Streams.** `ReadableStream`, `WritableStream`, `TransformStream`, and
    the compression streams. Prerequisites: the complete promise and
    queuing semantics from M5 and group 2 abort integration. Streams are
    the largest single specification in the profile and receive their own
    conformance matrix before implementation begins.
6.  **HTTP primitives.** `Headers`, `Request`, `Response`, and `fetch()`.
    Prerequisites: groups 1 through 5 and the native event-loop I/O
    decision below.
7.  **Web Crypto.** `crypto.getRandomValues()`, `crypto.randomUUID()`, and
    `SubtleCrypto`. Prerequisites: binary data and a reviewed cryptography
    dependency decision; Oseo does not implement primitives itself without
    recorded rationale.
8.  **WebAssembly.** The JavaScript and web APIs required by the targeted
    edition. Prerequisites: an architecture decision on the execution
    strategy, because ahead-of-time compiled WebAssembly shares the
    constraints recorded in
    [ADR 0016](./docs/adr/0016-dynamic-source-boundary.md).
9.  **Remaining globals and integration.** `globalThis` surface audit,
    `console` beyond the M1 intrinsic, base64 and timer edge behavior, and
    the documented server-runtime deviations.


Native I/O boundary
-------------------

Groups 1 through 5 extend the existing deterministic scheduler without new
system dependencies. `fetch()` and any future socket or file capability
need readiness notification, wall-clock observation, and network access
that the M4 event loop deliberately excluded.

Before group 6 begins, an architecture decision defines the platform event
adapter behind the runtime ABI: which system facilities each supported
target uses, how readiness integrates with timer and microtask ordering,
how tests inject a deterministic replacement, and how sandboxed test
execution avoids real network dependence. The deterministic logical clock
remains the default for tests; wall-clock and network behavior are opt-in
capabilities recorded in target descriptions.


Compiler and runtime invariants
-------------------------------

Web APIs are runtime capabilities, not language semantics. The compiler
core stays free of web-platform knowledge; API surfaces enter through the
same intrinsic and host interfaces the M5 built-in streams use, inside
components owned under [*PLAN-RCR.md*](./PLAN-RCR.md).

Every new heap kind defines tracing before allocation can collect it.
Callbacks, listeners, stream queues, and in-flight operations are rooted
explicitly, and forced collection runs at every new safepoint in the test
corpus. Specialization remains optional and honest: no web API may depend
on a hint being true, and every fast path keeps a compiled generic
fallback.

APIs that the profile does not yet implement are absent or throw the
specified error; they are never silently stubbed. A partially implemented
interface is a reviewed, documented state, not a quiet approximation.


Testing strategy
----------------

Each API group contributes, before it is considered complete:

 -  unit tests for the runtime component and its collector coverage;
 -  differential tests against Node.js and Deno where both hosts implement
    the same standardized behavior;
 -  reviewed web-platform-test cases wired through the owned harness
    adapter, with honest unsupported classifications;
 -  property suites extending the [*PLAN-PT.md*](./PLAN-PT.md) models,
    including generated event orderings, stream command sequences, abort
    schedules, and encoding round trips; and
 -  forced-collection and failure-injection runs across the new
    safepoints.

The M4 deterministic schedule model grows with each group: abort signals,
stream reactions, and fetch completions become generated schedule commands
so event-loop liveness and ordering claims stay tested rather than
asserted.


Performance and code size
-------------------------

Each group records generated C size, executable size, and startup cost
before and after it lands. Streams, Web Crypto, and WebAssembly receive
size budgets when their conformance matrices are written. A dependency
added for cryptography or compression needs the same pinning, target, and
replacement-boundary treatment as the Zig toolchain.


Delivery order
--------------

1.  Freeze the targeted Minimum common web API edition, web-platform-test
    revision, deviation policy, and per-interface denominator in an
    architecture decision.
2.  Land the web-platform-test harness adapter, subset manifest, and gate
    with honest unavailable-capability reporting.
3.  Implement groups 1 through 3 in order, each as reviewed semantic units
    inside owned runtime components.
4.  Record the native I/O boundary decision, then implement groups 4 and 5.
5.  Implement group 6 against the platform event adapter with
    deterministic test injection.
6.  Resolve the Web Crypto dependency decision and implement group 7.
7.  Resolve the WebAssembly execution decision and implement group 8.
8.  Complete group 9, the deviation documentation, and the integration
    audit.
9.  Publish the reproducible conformance evidence and, only when every
    criterion below holds, the WinterTC conformance statement.

Each checkpoint updates the standards manifest, the affected profile and
package documentation, and the living design documents in the same change.


Exit criteria
-------------

M6 is complete only when:

 -  one named Minimum common web API edition and web-platform-test revision
    define the claim, with every interface classified against them;
 -  Oseo passes the applicable web-platform tests for every interface,
    method, and property in that edition, at a pinned revision, from the
    checked-in manifest;
 -  documented deviations satisfy that edition's rules for server
    runtimes;
 -  the underlying ECMAScript implementation meets the ECMA-262 requirement
    named by the standard, through the completed
    [*PLAN-M5.md*](./PLAN-M5.md) claim or a recorded boundary decision;
 -  every API group lives in an owned runtime component with complete
    tracing, rooting, forced-collection, and failure-injection coverage;
 -  the platform event adapter keeps deterministic test execution and
    records wall-clock and network capabilities per target;
 -  differential, property, sanitizer, dual-execution-target, and
    cross-link gates cover the complete web API corpus;
 -  capability, performance, and code-size reports are reproducible from
    documented tasks; and
 -  `mise run check`, `mise run test`, and the extended property task pass
    from a clean checkout.
