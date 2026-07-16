M4 language profile
===================

Status
------

This document freezes the source and host behavior admitted by M4. It extends
the M3 profile and is an implementation contract, not a claim of complete
ECMAScript module or asynchronous conformance.


Source goal
-----------

M4 accepts a closed graph of ECMAScript modules. Every module is known before
native code generation, and the generated executable embeds no Node.js or Deno
runtime. Script input remains available for the M1 through M3 fixture corpus.


Module grammar
--------------

An M4 module may use the M3 statement and expression profile plus:

 -  side-effect imports;
 -  default, named, and namespace imports;
 -  local named and default exports;
 -  indirect named exports and star exports;
 -  exported function, `const`, and `let` declarations; and
 -  top-level `await` after asynchronous evaluation lands.

Import and export specifiers are string literals without attributes. Imported
bindings are immutable aliases to exporter cells. Exported `let` bindings are
live. Reads before initialization produce the same temporal-dead-zone failure
as an ordinary lexical binding.

A namespace object has stable identity per module. Its own string keys are the
resolved export names sorted by UTF-16 code-unit order. Reads are live,
properties are enumerable and non-configurable, and assignment, definition,
or deletion fails. The namespace has a `null` prototype.

Duplicate exports, missing imports, ambiguous star exports, unresolved
specifiers, and invalid module cycles fail during parsing or resolution with an
owned, source-located diagnostic. Evaluation failures remain thrown JavaScript
values.


Resolution profile
------------------

The CLI accepts one entry file or `file:` URL. Relative `./` and `../`
specifiers resolve against the importing canonical `file:` URL. The compiler
host may also be given an explicit map of canonical URLs for tests. Percent
encoding and dot segments are normalized before identity comparison.

Bare specifiers, *node\_modules/* lookup, *package.json* fields, CommonJS, JSON,
WebAssembly, import attributes, network loading in produced executables, and
host-dependent search paths are outside M4. A source hash is recorded for each
canonical module so a graph changes deterministically when its source changes.

Dynamic `import()` remains unsupported. `eval` and the `Function` constructor
remain unsupported.


Evaluation profile
------------------

All module environments are instantiated before any module body executes.
Synchronous dependencies evaluate before importers. Strongly connected
components use source dependency order with a canonical-identifier tie break,
so filesystem enumeration and C declaration order cannot affect execution.

A module body executes at most once. A second spelling that resolves to the
same canonical URL reuses the same module record, environment, namespace, and
evaluation result. A thrown evaluation stores a failed state and propagates the
same failure to importers without replaying visible effects.


Promise profile
---------------

M4 admits `new Promise(executor)`, `Promise.resolve`, `Promise.reject`,
`Promise.all`, `Promise.race`, `promise.then`, `promise.catch`, and
`promise.finally`. Executors run synchronously. Settlement is idempotent and
reactions always enter the runtime FIFO microtask queue.

Resolution adopts M4 promises, rejects self-resolution with `TypeError`, and
assimilates an object or function with a callable `then` property through a
queued job. Errors while reading or calling `then` reject the capability.
Species constructors and subclassing are outside M4.

An unhandled rejection is reported after the microtask checkpoint in which it
first has no rejection handler. Attaching a handler before that checkpoint
suppresses the report. A later handler produces one handled notification.


Asynchronous syntax
-------------------

M4 admits asynchronous function declarations and expressions, asynchronous
arrow functions, `await` within them, and top-level `await` in modules.
Asynchronous generators and `for await` remain unsupported.

Calling an asynchronous function immediately returns an M4 promise. `await`
uses promise resolution, suspends without retaining a native C stack frame,
and resumes through one queued reaction. A thrown completion rejects the
function promise. A returned value fulfills it after promise resolution.

An importer waits for asynchronous dependencies before evaluating. A cycle of
top-level awaits that cannot make progress fails deterministically with an
owned `OSEO3001` diagnostic naming the canonical cycle.


Event-loop profile
------------------

M4 exposes `setTimeout(callback, delay, ...arguments)` and
`clearTimeout(handle)`. Delays convert with `ToNumber`, negative and non-finite
delays become zero, and larger delays clamp to a documented runtime maximum.
Timer handles are opaque values.

One event-loop turn runs the earliest ready timer task, breaking equal-deadline
ties by insertion order, and then drains the microtask queue completely. The
entry module evaluation is the first task and receives a microtask checkpoint
when it completes or suspends. A deterministic test clock replaces wall time in
fixtures and property tests.

The executable exits when there is no runnable job and no referenced timer or
host handle that can make progress. A pending promise alone does not keep it
alive. An uncaught task failure or an unhandled rejection is reported through
the host error boundary and makes the executable fail after the current
microtask checkpoint.


Withheld prerequisites
----------------------

Import attributes, dynamic import, package resolution, CommonJS, generators,
asynchronous generators, weak references, finalization, and web-platform APIs
remain outside M4. Unsupported syntax receives an owned source-located
diagnostic. No withheld form may fall through to approximate behavior.


Generated domains
-----------------

Property tests generate canonical module graphs, import aliases, live updates,
synchronous and asynchronous cycles, promise command sequences, suspension
points, timer schedules, and rejection-handler timing. The model records the
expected module states, cells, jobs, tasks, and observations independently of
the implementation.

Each generated case is replayable from its seed and path. Specialization-on,
specialization-off, ordinary collection, and collection at every safepoint must
produce the same language-visible observation.
