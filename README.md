![](./artwork/logo-autocolor.svg)

Oseo
====

[![npm][npm badge]][npm]
[![JSR][JSR badge]][JSR]
[![GitHub Actions][GitHub Actions badge]][GitHub Actions]
[![License: GPL-3.0-or-later][GPL badge]][GPL]
[![GitHub Sponsors][GitHub Sponsors badge]][GitHub Sponsors]

A JavaScript and TypeScript engine that compiles every function to native
code ahead of time, using type annotations as guarded optimization hints.
No interpreter, no JIT, no deoptimization.

[npm badge]: https://img.shields.io/npm/v/@oseo/cli?logo=npm
[npm]: https://www.npmjs.com/package/@oseo/cli
[JSR badge]: https://jsr.io/badges/@oseo/cli
[JSR]: https://jsr.io/@oseo
[GitHub Actions badge]: https://github.com/dahlia/oseo/actions/workflows/main.yaml/badge.svg
[GitHub Actions]: https://github.com/dahlia/oseo/actions/workflows/main.yaml
[GPL badge]: https://img.shields.io/badge/license-GPL--3.0--or--later-blue
[GPL]: #license
[GitHub Sponsors badge]: https://img.shields.io/github/sponsors/dahlia?logo=githubsponsors
[GitHub Sponsors]: https://github.com/sponsors/dahlia


Try Oseo
--------

From a checkout on Linux AMD64 or macOS AArch64, run this from the
repository root with [mise] installed:

~~~~ sh
mise install
mise run build
mkdir -p artifacts
mise run oseo build examples/numeric-hinted.ts \
  -o artifacts/numeric
printf '[[20,22]]\n' | ./artifacts/numeric 1
~~~~

The retained executable prints `{"iterations":1,"results":[42]}`. Building
from a checkout uses Node.js and Zig; the compiled program does not need
either to run.

When the first release is published, download the standalone CLI archive
for your platform from [GitHub Releases], extract it, and use the included
`oseo` in place of `mise run oseo`, using its
path if it is not on `PATH`. The standalone CLI is planned to run without a
separately installed Node.js. It still needs Zig to compile native programs.
See the [installation guide](./docs/using/install.md) for the planned release
channels and the [development guide](./docs/development/index.md) for the
checkout setup.

[mise]: https://mise.jdx.dev/
[GitHub Releases]: https://github.com/dahlia/oseo/releases


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
JSDoc types in plain JavaScript, as optimization hints. Those hints select
which specialized path to generate. Every resulting assumption stays guarded
at runtime, since a `: number` annotation can be wrong through `any`, type
assertions, or interop with untyped code. Oseo does not type-check: it reads
annotations at the syntax level and never depends on `tsc`.


Current status
--------------

Oseo is early and under active development. It has completed milestone M5,
which measured ECMAScript compatibility on top of M4's native module graphs,
promises, asynchronous execution, and native event loop. The post-M5 language
work then moved the measurement to ECMAScript 2026 with Annex B, as the
[ECMAScript 2026 language profile](./docs/language-profile-es2026.md) records.
[*ROADMAP.md*](./ROADMAP.md) names the plans that continue from there.

Oseo currently supports an explicit language profile rather than the whole of
ECMA-262, and it does not yet claim conformance to any edition. Releases
publish their supported profile and test262 results instead. Supported native
execution targets are Linux on AMD64 and macOS on AArch64, with AArch64 Linux
kept as a compile-link and inspection target.


Documentation
-------------

 -  [Using Oseo](./docs/using/install.md) covers installation, examples, CLI
    options, and supported features.
 -  [Development](./docs/development/index.md) covers building the project
    and the documentation, and links to design and test evidence.
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
The mise setup installs the pinned pnpm release and synchronizes workspace
dependencies with a frozen lockfile. See [*CONTRIBUTING.md*](./CONTRIBUTING.md)
for the toolchain rules and dependency skills.

~~~~ sh
mise install
mise tasks
mise run check
mise run test
~~~~

`mise tasks` lists the commands available in the current checkout. A command
described in a design or plan document may not exist until its implementation
lands.


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

Oseo-authored material is licensed under the GNU General Public License,
version 3 or (at your option) any later version, unless otherwise noted.
See [*LICENSE*](./LICENSE). The Oseo-authored runtime and support incorporated
into compiled programs are under the [MIT license](./MIT-LICENSE.txt). That
license does not change the terms of your own code; retain the MIT notice
and any applicable third-party notices when distributing the output.
The [license inventory](./docs/runtime-support-surface.md) identifies those
parts and their notices.
