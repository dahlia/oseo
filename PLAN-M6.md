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
[*PLAN-M5.md*](./PLAN-M5.md), [*PLAN-NIO.md*](./PLAN-NIO.md),
[*PLAN-PT.md*](./PLAN-PT.md), the frozen language profiles, and accepted
records under *docs/adr/*. The completed runtime componentization recorded in
[*docs/runtime-components.md*](./docs/runtime-components.md) satisfies
the prerequisite for every large web API family: a new API lands in an
owned runtime component, not in a catch-all translation unit. Evidence
that changes one of these contracts updates the affected document in the
same change.

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
    and `AbortSignal`. `AbortSignal.timeout()` remains deferred to group 3.
    Prerequisites: stable class-shaped built-ins from M5 and reentrancy rules
    for listener invocation order.
3.  **Timers, performance, and error reporting.** Standardized `setTimeout`
    and `setInterval` behavior beyond the M4 subset, `AbortSignal.timeout()`,
    `queueMicrotask()`, `performance.now()`, `structuredClone()`, and host error
    reporting events. Prerequisites: the completed clock and wakeup integration
    checkpoint from [*PLAN-NIO.md*](./PLAN-NIO.md) and the serialization walk
    shared with later `Blob` work.
4.  **Binary payload containers.** `Blob`, `File`, and `FormData`.
    Prerequisites: groups 1 and 3.
5.  **Streams.** `ReadableStream`, `WritableStream`, `TransformStream`, and
    the compression streams. Prerequisites: the complete promise and
    queuing semantics from M5 and group 2 abort integration. Streams are
    the largest single specification in the profile and receive their own
    conformance matrix before implementation begins.
6.  **HTTP primitives.** `Headers`, `Request`, `Response`, and `fetch()`.
    Prerequisites: groups 1 through 5; accepted and implemented socket and
    name-resolution backends on Linux AMD64 and macOS AArch64, including the
    cancellation, buffer-lifetime, and fallback decisions under
    [*PLAN-NIO.md*](./PLAN-NIO.md); and the accepted TLS client and trust-store
    decision described below.
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

[*PLAN-NIO.md*](./PLAN-NIO.md) owns the platform-neutral operation and
completion ABI, platform probes, system-facility selection, fallbacks, and
deterministic test adapter. M6 consumes that boundary; it does not choose an
I/O backend inside `fetch()` or a Streams implementation.

Groups 1 and 2 extend the deterministic scheduler without native I/O; the
time-based `AbortSignal` method remains absent until group 3. The NIO clock and
wakeup checkpoint already makes existing positive-delay timers wait for elapsed
monotonic time in production before M5 exposes `Date`. Group 3 consumes that
integration to standardize timer edge behavior and add `AbortSignal.timeout()`
and `performance.now()`; it does not first activate elapsed waiting. Groups 4
and 5 can implement their data and queuing semantics before a real network
backend exists. Before group 6 begins, both supported execution targets need
accepted and implemented socket and name-resolution capabilities with
cancellation, buffer ownership, wakeup, and liveness behavior. Sandboxed tests
keep using the deterministic adapter and injected endpoints rather than public
network access. The M6-owned HTTPS security decision below is a separate
prerequisite.

Host traces are not entry evidence for M6 as a whole or for starting any group.
Once the versioned trace loader in [*PLAN-NIO.md*](./PLAN-NIO.md) lands, an
NIO-backed native completion property must retain them before that property
enters a gate. Groups 1 and 2 do not wait for this future work.

An operating-system completion becomes an Oseo task. Oseo still owns timer and
microtask ordering, rejection checkpoints, and shutdown. No platform callback
may invoke JavaScript directly or make a backend's incidental completion order
the unspecified language scheduler.


HTTPS security boundary
-----------------------

[*PLAN-NIO.md*](./PLAN-NIO.md) ends at asynchronous byte transport. M6 owns the
TLS client and trust-store decision required before group 6 begins. That
decision selects the provider or system framework on each supported target and
records its pinned version or operating-system boundary, license, update path,
C and Zig toolchain integration, static-link behavior, binary cost, and
replacement boundary. A TLS choice does not select the group 7 Web Crypto
implementation implicitly.

The decision freezes the supported TLS and ALPN baseline, SNI behavior,
certificate-chain and hostname verification, certificate-validity time source,
revocation policy, trust-store discovery and override policy, and error mapping.
Production uses the target's recorded trust source and fails with an owned
capability or TLS error when that source is unavailable. It must not silently
disable certificate or hostname verification. Handshake cancellation, shutdown,
buffer lifetime, and scheduler handoff follow the same liveness rules as the
transport beneath them.

Checked-in HTTPS tests use a loopback server, a private test CA, fixed leaf
certificates, and an injected verification time. They cover a valid chain,
unknown issuer, hostname mismatch, expired and not-yet-valid certificates,
handshake cancellation, abrupt peer shutdown, and unavailable trust material.
The test-only CA override never becomes the production default. Native probes
inspect default trust-store discovery without modifying it and retain the
selected source and capability result for Linux AMD64 and macOS AArch64;
AArch64 Linux retains compile-link evidence. No ordinary test contacts a public
HTTPS endpoint.


Compiler and runtime invariants
-------------------------------

Web APIs are runtime capabilities, not language semantics. The compiler
core stays free of web-platform knowledge; API surfaces enter through the
same intrinsic and host interfaces the M5 built-in streams use, inside
the components recorded in
[*docs/runtime-components.md*](./docs/runtime-components.md).

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
asserted. Native adapter cancellation races, partial completions, and fallback
selection remain owned by [*PLAN-NIO.md*](./PLAN-NIO.md) and feed the same
retained schedule evidence.


Performance and code size
-------------------------

Each group records generated C size, executable size, and startup cost
before and after it lands. Streams, Web Crypto, and WebAssembly receive
size budgets when their conformance matrices are written. A dependency
added for TLS, cryptography, or compression needs the same pinning, target,
and replacement-boundary treatment as the Zig toolchain.


Delivery order
--------------

1.  Freeze the targeted Minimum common web API edition, web-platform-test
    revision, deviation policy, and per-interface denominator in an
    architecture decision.
2.  Land the web-platform-test harness adapter, subset manifest, and gate
    with honest unavailable-capability reporting.
3.  Implement groups 1 and 2 as reviewed semantic units inside owned runtime
    components.
4.  Consume the completed native clock and wakeup integration checkpoint, then
    implement group 3 and the data and queuing semantics in groups 4 and 5.
5.  Complete the native socket and name-resolution adapter decision and both
    supported backends.
6.  Probe candidate TLS clients and trust sources on Linux AMD64 and macOS
    AArch64, recording Zig and C integration, static-link behavior, binary cost,
    default trust-store discovery, deterministic loopback HTTPS evidence, and
    AArch64 Linux compile-link evidence.
7.  Accept the TLS client and trust-store decision from that target evidence.
8.  Implement group 6 with deterministic transport and TLS completion
    injection.
9.  Resolve the Web Crypto dependency decision and implement group 7.
10. Resolve the WebAssembly execution decision and implement group 8.
11. Complete group 9, the deviation documentation, and the integration
    audit.
12. Publish the reproducible conformance evidence and, only when every
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
 -  the platform event adapter keeps deterministic test execution and records
    monotonic-clock, real-time, socket, and name-resolution capabilities plus
    fallbacks per target under [*PLAN-NIO.md*](./PLAN-NIO.md);
 -  `https:` fetch uses a recorded TLS provider and trust source on each
    supported target, validates certificate chains and hostnames, and passes the
    loopback security, cancellation, and failure corpus without a verification
    bypass;
 -  differential, property, sanitizer, dual-execution-target, and
    cross-link gates cover the complete web API corpus;
 -  capability, performance, and code-size reports are reproducible from
    documented tasks; and
 -  `mise run check`, `mise run test`, and the extended property task pass
    from a clean checkout.
