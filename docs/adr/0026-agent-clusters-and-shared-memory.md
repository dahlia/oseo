ADR 0026: Agent clusters and shared memory
==========================================

Status
------

Accepted for M5b node `atomics-and-shared-memory`. The coordinator reserved
this record's number, runtime ABI `m5-123`, and property seed block
`0x60007f00` through `0x60007fff` for this node.


Context
-------

[ADR 0013](./0013-m5-edition-and-manifest.md) keeps agent clusters and shared
memory inside the M5 claim and classifies every case that needs the optional
`$262.agent` harness capability as unsupported until the runtime and harness
can observe it. The `atomics-single-agent` node admitted `SharedArrayBuffer`
and `Atomics` for a realm that is the only agent of its cluster and left 112
reviewed paths with that capability named. Those cases start agents from
source text, broadcast a `SharedArrayBuffer` to them, collect their reports,
and notify and wait across them, as test262's *INTERPRETING.md* defines.

Two constraints shape the decision. First, `$262.agent.start` takes a source
string, and [ADR 0016](./0016-dynamic-source-boundary.md) keeps every form
that compiles source text at run time outside the profile. Second, the
runtime and generated C must stay free of undefined behavior, and every
TypedArray, DataView, and ArrayBuffer path reads and writes Data Blocks with
ordinary C accesses, so two threads touching one Shared Data Block at once
would be a C data race.


Required contract
-----------------

 -  A program built for the test262 host has a `$262` global whose `agent`
    object provides `start`, `broadcast`, `getReport`, `sleep`, and
    `monotonicNow` in the main agent and `receiveBroadcast`, `report`,
    `leaving`, `sleep`, and `monotonicNow` in every other agent. An ordinary
    program has no `$262` binding.
 -  Each agent has its own realm, heap, collector, clock adapter, and event
    loop. Heap values never cross agents; a Shared Data Block does.
 -  The WaiterList store is the cluster's: one FIFO per block and byte index
    holding blocking and asynchronous waiters of every agent.
    `Atomics.notify` wakes a blocking waiter, resolves its own agent's
    `waitAsync` promise synchronously, and resolves another agent's promise
    in that agent as a task, as NotifyWaiter specifies.
 -  One agent always makes forward progress, and no agent blocks another
    except through a blocking API.
 -  No source text is compiled at run time.


Alternatives considered
-----------------------

Postponing kept the 112 reviewed paths unsupported with no owner, which ADR
0019 does not permit for a behavior inside the claim.

Agents that run truly in parallel would make every Data Block access a
potential data race in C. Removing that would need atomic, relaxed accesses
on every shared path of the TypedArray, DataView, and ArrayBuffer components
and in specialized generated element access, a much larger change that would
also make every native agent observation nondeterministic.

Agents as separate processes sharing memory through a mapped file would need
every Shared Data Block allocated in shared mappings, file descriptors passed
between processes, and a process-shared WaiterList with its own futex or
kernel event on each target; it gains no semantics over threads.

Compiling agent sources at run time is the dynamic-source capability ADR 0016
excludes. Discovering the exact start strings by a first execution and
recompiling was considered: it needs no placeholder argument but runs every
case at least twice and fails on any source computed after an agent already
runs.


Probe evidence
--------------

 -  *packages/runtime-c/native/runtime\_agent.c* implements the cluster, the
    turn handoff, the cluster WaiterList, broadcasts, reports, and `$262`.
 -  *packages/compiler/src/agent-programs.ts* finds and compiles the
    templates; *packages/cli/tests/index.test.ts* covers their shapes and
    every rejection.
 -  *tests/native/fixtures/atomics-and-shared-memory.ts* holds five fixtures
    that Node.js and Deno, through the worker prelude in
    *tests/native/agent-reference.ts*, and both native specialization policies
    run with collection forced at every safepoint.
 -  *tests/native/scenarios/agents.ts* holds the native-only checks.
 -  *tests/property/m5-atomics-and-shared-memory.property.test.ts* generates
    clusters at seed `0x60007f00` against an interleaving-independent model.
 -  `mise run test262:update` executes the 112 reviewed agent paths.


Observed results
----------------

On Linux AMD64, all 112 reviewed agent paths pass under all four variants.
The fixtures and the generated suite agree with
Node.js and Deno. The native-only checks observe FIFO notification order
across agents, the rejected template and source shapes, an agent's uncaught
error ending the process, and a stalled cluster reporting that it cannot make
progress. macOS AArch64 execution is not observed on this host; the runtime
component compiles for `aarch64-macos` and `aarch64-linux-musl`.


Decision
--------

**One executing thread, many agents.** Each agent runs on a POSIX thread of
its own with an 8 MiB stack, but the agents of one cluster share one
executing thread in the sense of ECMA-262's forward progress clause: exactly
one agent, the one holding the turn, evaluates at a time. The turn passes
when the holder suspends in `Atomics.wait`, `$262.agent.sleep`,
`$262.agent.broadcast`, `$262.agent.start`, or an event loop with nothing
due, when it finishes, and at the yield points every `Atomics` operation and
`$262.agent.getReport` offer, where the longest-ready agent takes it. A
blocked agent waits in its own clock adapter, and whoever makes it ready
wakes that adapter. Every cluster state change happens under one mutex, and
every Shared Data Block access happens on the thread that holds the turn
after the handoff that gave it the turn, so no two threads ever touch a block
concurrently and no C access races. A plain loop that never yields keeps the
turn, which the forward progress clause permits for agents that share an
executing thread.

**Shared Data Blocks.** A SharedArrayBuffer's block is a reference-counted
record holding the bytes, its current length, and its growable maximum. A
broadcast gives each receiving agent a new SharedArrayBuffer object of its
own realm over the same block, and every object reads the length from the
block, so a grow in one agent is the length all of them observe.

**The cluster WaiterList.** When a cluster exists, blocking waiters and each
agent's `waitAsync` waiters share the cluster's FIFO per block and byte index.
A blocking waiter waits for a notification or its deadline; an asynchronous
waiter's promise stays rooted in its own agent, and a notification from
another agent moves it to that agent's inbox, which its event loop takes as a
task that resolves the promise to `"ok"`. A timeout job finds a waiter that a
notification already removed and does nothing. Deadlines in a cluster count
the current whole millisecond as started, so a measured wait is never shorter
than its timeout.

**Liveness and termination.** An agent's event loop keeps waiting while it
has incoming work, timers, pending `waitAsync` waiters, or a broadcast
callback it has not left with `leaving()`. The main agent keeps waiting for
its own pending waiters only while another agent can still make progress.
When the main agent's event loop ends the process ends, as d8 terminates its
workers, and an agent that is still waiting never evaluates again. An agent
that ends with an uncaught throw prints its error and ends the process with
status 1, and a cluster whose every agent waits without a deadline while the
main agent is blocked reports `OSEO3001` “The agent cluster cannot make
progress.” and exits, because such a case could otherwise only hang.

**Ahead-of-time agent programs.** `$262` is an ordinary global reference,
which the host object installed on the global object resolves; without the
host it throws the ReferenceError of an unresolvable name. With the CLI's
`--test262-host` option the compiler also compiles every
`$262.agent.start` whose argument is a template literal or a string literal
into an agent program linked beside the main unit. Only a call whose `$262`
resolves to the global object's property, directly or through a Script-level
`var` or function binding, counts; a call through a lexical binding or an
intervening `with` object is an ordinary call whose argument is not agent
source. Each agent program is a translation unit of its own that
repeats the main unit's file-scope definitions, so `--emit-c`, which prints
one unit, rejects a program with an agent template with `OSEO3001`; native
execution builds and links every unit. Each substitution becomes
a hole that the agent program reads through `oseo_agent_hole`. At run time
`start` matches its source string against the templates: the literal runs
must match exactly and each hole must hold a decimal integer literal without
a leading zero, optionally with the BigInt suffix `n`, which the hole's read
returns as a Number or a BigInt. Anything else is `OSEO2001` “Agent source
text outside the ahead-of-time agent programs is not admitted.”, the ADR 0016
boundary.

The equivalence argument is grammatical. A decimal literal and the
placeholder identifier are both one PrimaryExpression token, so they parse
to the same structure wherever both parse as one token and the identifier is
an ordinary read. The compiler therefore rejects a template unless the
characters beside each hole cannot join a literal into another token (no
identifier character, digit, dot, backslash, or non-ASCII character), the
text with `0` in every hole parses, and every placeholder resolves as exactly
one identifier read outside any `with` object environment, at exactly the
byte span where it was inserted. A placeholder name is fresh against the
template's text both as written and with every Unicode escape decoded, so no
identifier the template spells can shadow or impersonate a hole. A hole inside
a string, comment, or regular expression, in a binding or assignment position,
under `delete`, or as a property name is rejected at compile time. Function
source text keeps the start source's literal text at each hole, so
`Function.prototype.toString` reflects the source the agent was started with.

**The reviewed runner.** A case that reads `$262.agent` is built with
`--test262-host` and executed; its execution records no `scheduler` value,
because it runs under this real-clock cluster rather than the
`deterministic-logical-clock` scheduler of ADR 0013. The manifest schema and
classification vocabulary are unchanged. The reviewed *atomicsHelper.js* is
the upstream helper except that `$262.agent.setTimeout` forwards to the host
timer, which this profile reaches only as a call target. A `CanBlockIsFalse`
case keeps the `non-blocking-agent` capability.


Consequences
------------

 -  `OseoContext` gains the agent record and the broadcast callback root;
    *oseo\_runtime.h* gains the agent program table types,
    `oseo_test262_host_install`, and `oseo_agent_hole`; `OseoArrayBuffer` gains
    its block reference; the built-in code registry gains range index 28 for
    the eight `$262.agent` functions; the runtime input gains
    *runtime\_agent.c*; and `abiVersion` moves to `m5-123`.
 -  *runtime\_agent.c* is the second runtime translation unit that asks for
    operating-system interfaces beyond C11, POSIX threads. Every supported
    target provides them in its C library, so no link flag changes.
 -  Native agent observations are deterministic up to the operating system's
    timing of deadlines, while the references run agents in parallel, so a
    differential fixture prints only what every interleaving produces.
 -  The harness has no `$262` members beyond `agent`; cases that need
    `createRealm`, `detachArrayBuffer`, `evalScript`, or `gc` keep their
    existing classifications.


Failure modes and replacement triggers
--------------------------------------

 -  A reviewed case whose agents must run truly in parallel, or whose plain
    spin loop needs another agent to run, requires revisiting the shared
    executing thread and the C access policy together.
 -  A case that computes an agent source that no template describes, or a
    hole that holds anything but a decimal integer or BigInt literal, reaches
    the ADR 0016 boundary; supporting it would be dynamic source.
 -  A macOS AArch64 run that cannot wake a blocked agent, or measures a wait
    shorter than its timeout, reopens the thread and wakeup mapping.


Links
-----

 -  [ADR 0013](./0013-m5-edition-and-manifest.md): manifest schema,
    `$262.agent` classification, and the scheduler record.
 -  [ADR 0016](./0016-dynamic-source-boundary.md): the dynamic source
    boundary agent programs stay inside.
 -  [ADR 0025](./0025-native-clock-and-wakeup.md): the clock adapter agents
    wait and wake through.
 -  [*PLAN-M5.md*](../../PLAN-M5.md) and the
    [*M5 language profile*](../language-profile-m5.md).
