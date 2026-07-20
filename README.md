Oseo
====

A JavaScript and TypeScript engine that compiles every function to native
code ahead of time, using type annotations as guarded optimization hints.
No interpreter, no JIT, no deoptimization.


How it works
------------

Every function is compiled into a generic path that implements the full
language semantics of the current release. Wherever Oseo can generate a cheap
runtime guard for a value's kind, type, or shape, it compiles a specialized
path alongside. A failed guard branches straight into the generic path, which
is already sitting in the binary, compiled, not interpreted. Nothing gets
deoptimized because nothing was left uncompiled.

This follows the lineage of Common Lisp implementations like SBCL and of Chez
Scheme rather than the interpreter-plus-speculative-JIT design of mainstream
JavaScript engines. There is no profiling tier to warm up.

Normally `tsc` erases type annotations before an engine ever sees the code.
Because Oseo compiles from the original source, it keeps those annotations, and
JSDoc types in plain JavaScript, as optimization hints that select which
specialized path to generate. Every resulting assumption stays guarded at
runtime, since a `: number` annotation can be wrong through `any`, type
assertions, or interop with untyped code. Oseo does not type-check: it reads
annotations at the syntax level and never depends on `tsc`.


Current status
--------------

Oseo is early and under active development. It has completed milestone M4,
which brought native module graphs, promises, asynchronous execution, and a
native event loop. Work is now in M5, broadening measured ECMAScript
compatibility.

Oseo currently supports an explicit language profile rather than the whole of
ECMA-262, and it does not yet claim conformance to any edition. Releases
publish their supported profile and test262 results instead. Supported native
execution targets are Linux on AMD64 and macOS on AArch64, with AArch64 Linux
kept as a compile-link and inspection target.


Documentation
-------------

 -  [*WHITEPAPER.md*](./WHITEPAPER.md) explains the motivation and intended
    scope, and why the design is worth building now.
 -  [*DESIGN.md*](./DESIGN.md) records the architectural constraints and how the
    compiler, runtime, and backend fit together.
 -  [*ROADMAP.md*](./ROADMAP.md) defines the capability milestones and their
    exit criteria.
 -  [*CONTRIBUTING.md*](./CONTRIBUTING.md) covers the development environment,
    package boundaries, and coding policy.


Getting started
---------------

Oseo uses [mise] as the entry point for development tools and repository tasks.

~~~~ sh
mise install
mise tasks
mise run check
mise run test
~~~~

`mise tasks` lists the commands available in the current checkout. A command
described in a design or plan document may not exist until its implementation
lands.

[mise]: https://mise.jdx.dev/


About the name
--------------

*Oseo* (/o.sʌ/, “OH-suh”) is the Sino-Korean reading of [鼯鼠], the flying
squirrel. A flying squirrel moves through the trees like any squirrel, and then
spreads the patagium along its sides and glides when the terrain calls for it.
Generic execution is always there and always correct; a checked specialization
takes the faster route when the ground allows it.

[鼯鼠]: https://en.wiktionary.org/wiki/%E9%BC%AF%E9%BC%A0


License
-------

Oseo is distributed under the terms of the GNU General Public License version 3.
See [*LICENSE*](./LICENSE) for the full text.
