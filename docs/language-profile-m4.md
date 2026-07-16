M4 language profile
===================

Status
------

Implementation status: complete. This document records the source and host
behavior admitted by M4. It extends the M3 profile and is an implementation
contract, not a claim of complete ECMAScript module or asynchronous
conformance.


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
 -  top-level `await`, including an entry without another module declaration.

Import and export specifiers are string literals without attributes. Imported
bindings are immutable aliases to exporter cells. Exported `let` bindings are
live. Reads before initialization produce the same temporal-dead-zone failure
as an ordinary lexical binding.

A namespace object has stable identity per module. Its own string keys are the
resolved export names sorted by UTF-16 code-unit order. Reads are live,
properties are enumerable and non-configurable, and assignment, definition,
or deletion fails. The namespace has a `null` prototype.

Duplicate exports, missing imports, ambiguous star exports, and unresolved
specifiers fail during parsing or resolution with an owned, source-located
diagnostic. Evaluation failures remain thrown JavaScript values.


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
remain unsupported. Type-only imports and exports remain unsupported until a
later profile freezes whether and where Oseo erases them.


Evaluation profile
------------------

All module environments are instantiated before any module body executes.
Synchronous dependencies evaluate before importers. Strongly connected
components use source dependency order with a canonical-identifier tie break,
so filesystem enumeration and C declaration order cannot affect execution.

A canonical module is discovered and emitted once. A second spelling that
resolves to the same canonical URL reuses the same linked environment and
namespace. A thrown module body stops the dependency-ordered native script and
propagates through the host error boundary without replaying visible effects.


Promise profile
---------------

M4 admits `new Promise(executor)`, `Promise.resolve`, `Promise.reject`,
`Promise.all`, `Promise.race`, `promise.then`, `promise.catch`, and
`promise.finally`. `Promise.all` and `Promise.race` accept M4 arrays; the
general iterator protocol remains outside the profile. Executors run
synchronously. Settlement is idempotent and reactions always enter the runtime
FIFO microtask queue.

Resolution adopts M4 promises, rejects self-resolution with a catchable
runtime-created language error, and assimilates an object or function with a
callable `then` property through a queued job. Named `TypeError` intrinsic
identity remains outside M4. Errors while reading or calling `then` reject the
capability. Species constructors and subclassing are outside M4.

An unhandled rejection is reported after the microtask checkpoint in which it
first has no rejection handler. Attaching a handler before that checkpoint
suppresses the report. A later handler records one test-observable handled
count; M4 exposes no language-level rejection event.


Asynchronous syntax
-------------------

M4 admits asynchronous function declarations and expressions, asynchronous
arrow functions, and top-level `await` in modules. Within an asynchronous
function, `await` may be an expression statement, the complete initializer of
one `const` or `let` declaration, or the complete operand of `return`. These
forms may repeat sequentially. Await inside another expression or control-flow
statement remains unsupported. Asynchronous generators and `for await` remain
unsupported.

Calling an asynchronous function immediately returns an M4 promise. The
frontend converts each suspension suffix into a private continuation closure.
`await` uses promise resolution, returns from the native call, and resumes that
closure through one queued reaction. Captured environments retain locals across
suspension without retaining a native C stack frame. A thrown completion
rejects the function promise. A returned value fulfills it after promise
resolution.

Linked module bodies enter one dependency-ordered native script. A top-level
await checkpoint settles its reaction before the following importer body runs.
The checkpoint advances owned jobs and timer turns only while they can settle
the awaited value. A pending graph with no owned source of progress fails
deterministically with `OSEO3001`.


Event-loop profile
------------------

M4 exposes `setTimeout(callback, delay, ...arguments)` and
`clearTimeout(handle)`. Delays convert with `ToNumber`, negative and non-finite
delays become zero, and values at or above `UINT32_MAX` clamp to that maximum.
Timer handles are unique numeric values in the M4 runtime.

One event-loop turn runs the earliest timer task, breaking equal-deadline ties
by insertion order, and then drains the microtask queue completely. The entry
module evaluation is the first task and receives a microtask checkpoint when it
completes or suspends. M4 uses a deterministic logical clock and advances it to
the next deadline. Wall-clock observation is outside this language profile.

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

Property tests generate canonical module graphs and arbitrary synchronous
cycles for deterministic linking. Bounded native properties generate promise
settlement commands, repeated suspension points, live locals, timer deadlines,
cancellation, task-created microtasks, and pending promises. An independent
model records expected FIFO jobs, task order, shutdown, and output.

Each generated case is replayable from its seed and path. Specialization-on,
specialization-off, ordinary collection, and collection at every safepoint must
produce the same language-visible observation.
