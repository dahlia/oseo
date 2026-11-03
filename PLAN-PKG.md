Package track plan
==================

Status
------

Implementation status: planned, not started. The maintainer approved this
track on 2026-11-02. It separates the use of installed ecosystem packages from
Node.js compatibility: a program should be able to `import` a package that
npm, pnpm, or Yarn installed into *node\_modules*, and the build should
compile it into the closed module graph, before `node:*` modules, `Buffer`,
`process`, or CommonJS exist. Those remain M7. Neither track is a
prerequisite of the other as a whole; a scenario records the capabilities it
needs from each.

The track has no milestone number and runs alongside M6 and
[*PLAN-LANGUAGE.md*](./PLAN-LANGUAGE.md). It adds no installer, package
manager, or repository command. The implemented resolver remains the one that
[*docs/cli.md*](./docs/cli.md) describes until a tested implementation and its
documentation land together.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-M6.md*](./PLAN-M6.md), [*PLAN-DYN.md*](./PLAN-DYN.md),
[*PLAN-CLI.md*](./PLAN-CLI.md), [*PLAN-RELEASE.md*](./PLAN-RELEASE.md),
[ADR 0009](./docs/adr/0009-module-identity-and-linking.md),
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md), and the records under
*docs/adr/*. Evidence that changes one of those contracts updates the
affected document in the same change.


Goal
----

A server program written for Oseo should use the pure-JavaScript part of the
npm ecosystem without a bundler and without a Node.js compatibility layer.
The build resolves bare specifiers through the installed tree, selects each
package's ESM entry through *package.json* `exports`, follows the static
import graph into dependencies, and compiles the result as one closed graph.
Nothing is loaded after the executable starts.

The first target class is packages that ship ECMAScript modules and rely on
nothing outside the M5 language profile: parsers, routers that operate on
strings, validators, template engines, and data structures. The headline
target is Hono. The surveys recorded in
[*docs/evidence/package-audit/README.md*](./docs/evidence/package-audit/README.md)
show that Hono's routers, URL utilities, cookie helpers, and HTML helper need
only the resolver, and that an in-memory `app.fetch(new Request(…))` scenario
needs `Request`, `Response`, and `Headers` but neither network `fetch()` nor
streams. The ladder below reaches Hono through packages that need strictly less.

Every result is reported per package, per exact version, and per scenario.
A failure names the package, the selected condition path, the importer chain,
and the class of the problem: language, runtime API, module resolution,
package format or convention, native dependency, or external system
behavior. The track never labels a package name as supported.


Out of scope
------------

 -  An Oseo package manager, lockfile resolver, or registry client.
    `oseo add` and `oseo remove` stay a long-term idea in
    [*ROADMAP.md*](./ROADMAP.md).
 -  Yarn Plug'n'Play layouts. The `node-modules` linker is the supported Yarn
    configuration.
 -  CommonJS loading and ESM interoperation, `node:*` modules, `Buffer`,
    `process`, and Node-API addons. M7 owns them. This track detects
    CommonJS and classifies it; it does not execute it.
 -  Loading source or artifacts after the executable starts.
    [*PLAN-DYN.md*](./PLAN-DYN.md) owns dynamic import and runtime
    compilation; a build-time-resolvable `import()` admitted there becomes
    another static edge of the graph this track builds.
 -  TypeScript type checking. Type annotations remain optimization hints
    under [*DESIGN.md*](./DESIGN.md).
 -  Fetching JSR packages from jsr.io. A JSR package that pnpm or Yarn
    installed through JSR's npm compatibility layer is an ordinary installed
    package; direct source acquisition is an open question below.


Starting point
--------------

The following facts about the current implementation shape the units. They
were checked on 2026-11-02 and 2026-11-03.

 -  `fileModuleResolver` in *packages/host/src/index.ts* accepts only
    specifiers that begin with `./` or `../` and rejects everything else
    with one diagnostic. The `ModuleResolver` interface in
    *packages/compiler/src/syntax.ts* is synchronous, although the graph
    builder that calls it is already asynchronous.
 -  `canonicalizeFileModuleUrl` normalizes the spelling of a `file:` URL. It
    does not resolve symbolic links, so a pnpm tree would give the same
    file two identities.
 -  `Diagnostic` carries a code, a source identifier, a range, a message,
    and free-text notes. It has no structured package provenance, and the
    graph builder returns no graph when any diagnostic exists, discarding
    the modules it had already resolved.
 -  The command line prints the first graph diagnostic only.
 -  Dynamic `import()` and `eval` are rejected when a module is parsed, even
    in a function that never runs.
 -  A read of a name that no declaration resolves compiles to a global
    object property read: `typeof` answers `"undefined"` and any other read
    throws `ReferenceError` when it executes. A native probe on 2026-11-03
    confirmed that a package which references `Buffer`, `Intl`, or
    `TextEncoder` only inside a function body compiles, runs, and fails
    only on the path that reaches the reference. Plain uses of the
    `Function` global such as `instanceof Function` work; only its
    constructor forms are outside the profile.
 -  The TypeScript frontend rejects `import type`, type references to
    non-primitive types, and optional parameters. A package that ships only
    TypeScript source is therefore unusable today even when the resolver
    finds it. Published JavaScript is the realistic input for the first
    checkpoints.
 -  The audit of 48 pinned packages in
    [*docs/evidence/package-audit/README.md*](./docs/evidence/package-audit/README.md)
    found 13 packages whose selected ESM graph needs only the resolver, and
    showed that `exports` conditions, nested *package.json* `type` fields, and
    `Function` constructor aliases decide verdicts that a reading of the README
    would get wrong.


Resolution contract
-------------------

The resolver follows the ECMAScript module resolution of Node.js 24 for the
constructs it admits, so a package that works under Node.js with the same
conditions resolves to the same files under Oseo. Differences are deliberate
and listed here. Proposed
[ADR 0033](./docs/adr/0033-installed-package-resolution.md) freezes this
contract with its alternatives and revisit triggers; the list below is its
content.

### Specifier classes

 -  Relative and absolute `file:` specifiers keep their M4 behavior and name
    exact files. No extension is probed and no directory index is assumed.
 -  A bare specifier names a package and an optional subpath. The package
    directory is the first *node\_modules/<name>* found while walking up
    from the importer's directory after symbolic links are resolved. Scoped
    names use two path segments.
 -  A specifier beginning with `#` resolves through the `imports` field of
    the importer's package scope. The scope is the nearest enclosing
    *package.json*. A root project's `imports` never applies inside a
    dependency.
 -  A package may import itself by name when its scope's `name` matches; the
    self-reference resolves through that scope's `exports`, never through
    an installed copy found higher in the tree.
 -  `node:` specifiers are classified as a runtime API finding owned by M7,
    not as a resolution failure. `data:`, `http:`, and `https:` specifiers
    are rejected; [*PLAN-DYN.md*](./PLAN-DYN.md) and M6 own remote source.

### Conditional exports

 -  The active condition set for executable source is `oseo` and `import`.
    `default` always matches. Keys are visited in the manifest's own order,
    and the first key that is active or `default` wins, exactly as Node.js
    resolves `exports`. Oseo does not reorder `oseo` ahead of `import`; an
    author who wants Oseo to select a different file writes the `oseo` key
    first.
 -  `types`, `node`, `browser`, `deno`, `bun`, `development`, and
    `production` are never active by default. `node` is not activated merely
    because the compiler runs under Node.js. A project may add conditions
    through the command-line surface that [*PLAN-CLI.md*](./PLAN-CLI.md)
    defines; `types` is rejected there because a declaration file is not
    executable source.
 -  Subpath keys match exactly first, then by pattern with the longest
    matching prefix. A `null` target blocks the subpath. An array target is
    tried in order and an entry is skipped only when its target is
    syntactically invalid, never because its file is missing.
 -  A target must begin with `./`, stay inside the package, and contain no
    *node\_modules* segment. A manifest that mixes subpath keys and condition
    keys at the same level is invalid and reported as a package convention
    finding.
 -  When a package has `exports`, a subpath it does not export is a
    resolution failure. The resolver never falls back to `main` or to the
    real file path.
 -  When a package has no `exports`, the root resolves through `main` with
    the legacy probes that Node.js applies, and a deep import names an exact
    file. The non-standard `module`, `browser`, and top-level `source`
    fields are ignored; the audit shows that `neverthrow` and
    `@msgpack/msgpack` therefore resolve to CommonJS and are M7's.
 -  A selected target that fails to compile is reported. The resolver does
    not retry another condition, because that would run a different
    implementation than the one the author selected.

### Module format

 -  `.mjs` is a module and `.cjs` is CommonJS. `.js` follows the `type` field
    of the nearest enclosing *package.json*; a nested manifest such as
    *browser/package.json* in `yaml` overrides the package root.
 -  A `.js` file whose scope has no `type` is classified as CommonJS. Oseo
    does not adopt the syntax detection that Node.js applies to ambiguous
    files until a corpus result shows the cost of the omission; see the open
    questions.
 -  A CommonJS entry, a CommonJS file reached by a static import, and a
    `require`-only export branch are three distinct package format findings.
    None of them is reported as a syntax error.
 -  JSON modules keep their M5c contract: a `with { type: "json" }`
    attribute, a default export, and module-kind validation.
 -  A `.ts` or `.mts` file is admitted as source when its syntax is within
    the admitted profile. Until the TypeScript source unit lands, a package
    that selects such a file reports the first rejected construct with
    package provenance.

### Identity

 -  The canonical identity of every module, including the entry and every
    relative import, is the resolved real path, as Node.js uses by default.
    pnpm places a package's dependencies beside its real location, so
    resolving from the symbolic link would not find them.
 -  The specifier as written and the symbolic link target are recorded in
    the resolution trace. Diagnostics show the path the user wrote.
 -  Two package instances are never merged because their name, version, or
    content match. Different installation paths may see different peer
    dependencies, and a shared singleton would run the wrong one.

### Host boundary

The `ModuleResolver` interface becomes asynchronous. The host implementation
splits into a package index that reads one package directory at a time,
memoizes it, and records the manifest digest and real path it read, and a
pure resolution core that operates on that index. The core is shared by the
Node.js and Deno hosts and is tested with fixture indexes without a file
system. The host never delegates to `require.resolve()` or
`import.meta.resolve()`, so the host runtime's version cannot change which
file Oseo compiles.


Diagnostics and the resolution trace
------------------------------------

`Diagnostic` gains one optional structured field for package provenance: the
package name and version, the package directory, the condition path that
selected the file, and the importer chain from the entry. The first rendered
line does not change; the notes gain a rendering of the provenance. Only
resolution and package diagnostics fill the field at first. Existing
diagnostics are unchanged.

The graph builder returns a resolution trace whether or not it returns a
graph: every module it visited, every resolution edge with its specifier,
selected condition path, real path, and format, every manifest digest it
read, and every failed edge with its diagnostic. The trace is a separate type
from the executable graph and cannot be compiled. It exists so that the
compatibility laboratory can record where a package failed, how far
resolution reached before it failed, and which packages a scenario touched.

The trace, the compiler version, the active conditions, the package
instances and versions, the manifest and source digests, and the real-path
map are the build's reproducibility record. The source hash recorded in the
graph is a fast content identity and not an integrity proof. The laboratory
records the install tool, its version, and the lockfile digest of the install
step beside that record; Oseo does not parse lockfiles.

Printing more than the first diagnostic is a command-line change and belongs
to [*PLAN-CLI.md*](./PLAN-CLI.md).


TypeScript source and the `oseo` condition
------------------------------------------

Oseo reads parameter, return, and variable annotations as specialization
hints, and npm packages usually publish `tsc` output, which has none. A
package may offer Oseo its TypeScript source through an `oseo` condition:

~~~~ json
{
  "name": "example",
  "type": "module",
  "files": ["dist", "src"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "oseo": "./src/index.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  }
}
~~~~

The condition means that the author verified the entry against the admitted
Oseo profile. It is not a promise about every Oseo version, and it is never
required: a package without it resolves through `import` and `default` like
any other. Bun's `bun` condition is the closest precedent and resolves
TypeScript directly; Parcel's `source` is a top-level field, not a condition;
no widely honored `source` export condition was found on 2026-11-02. A
project may activate `bun` or any other condition explicitly, and the
selected code is diagnosed like any other.

Shipping the condition is not enough. The tarball must contain the source and
every file it imports, and the source must resolve under the rules above. A
TypeScript file that imports `./util.js` while only *util.ts* is published
does not resolve; the resolver does not rewrite `.js` to `.ts`. A separate
source-resolution profile may admit that rewrite later for packages that
opt in, after its effect on packages that ship both files is measured.

Reading source does not by itself buy optimization. Oseo does not type
check, so it sees only written annotations, and most local variables carry
none. The TypeScript source unit therefore measures, on the same package:
the published JavaScript, the source with its annotations, and the source
with annotations erased, comparing results, exceptions, guard success rates,
generated code, and allocation. Boundary hints from `.d.ts` files are a later
candidate with the same measurement and are not implemented by this plan.

Before the condition is useful, the frontend must admit the TypeScript syntax
that published source uses: `import type` and `export type`, type references
to non-primitive types erased to no hint, optional parameters, and the
remaining erasable annotation forms. `enum`, `namespace`, decorators, and
parameter properties are not required by the candidate list and stay
rejected until a corpus result needs them. Each admission keeps the
type-erased program's semantics and is covered by the hint-invariance gates
in [*DESIGN.md*](./DESIGN.md).


JSR
---

JSR's npm compatibility layer transpiles TypeScript to JavaScript and
generates declaration files, and pnpm 10.9 and Yarn 4.9 install JSR packages
through that layer. An inspection of a compatibility tarball on 2026-11-02
found the original `.ts` file beside the generated `.js` and `.d.ts`, with
`exports` pointing at the `.js` file. Three claims therefore stay separate in
this plan: such a package resolves as an ordinary installed package; its
tarball may contain source; and that source compiles under the Oseo profile.
The first follows from the resolver. The second varies by package and
revision, so a fixture pins the tarball URL, not only the version. The third
is the TypeScript source unit's question.

JSR requires explicit types on exported APIs, which makes JSR-first
packages good candidates for the source unit; `@std/bytes`, `@std/encoding`,
`@std/collections`, and `@std/semver` are dependency-free examples. Reading
source from jsr.io directly, as Deno does, would need a fetch step, a cache,
version selection, and integrity rules. That is the beginning of an
installer and is not part of this track. The decision is revisited after the
first corpus checkpoint with real install artifacts in hand.

[*PLAN-RELEASE.md*](./PLAN-RELEASE.md) uses JSR as a publication channel for
the `@oseo/*` packages. That is unrelated to consuming JSR packages as input.


Corpus and laboratory
---------------------

The compatibility laboratory in [*ROADMAP.md*](./ROADMAP.md) is this track's
evidence engine. *tools/package-audit.ts* audits published artifacts without
running Oseo and selects candidates; a scenario then runs a pinned package
version through Oseo and records the outcome. The audit's verdicts are
inspection results and never stand in for a scenario result.

Each scenario record carries the package and version, the install tool and
lockfile digest, the entry and subpath, the active conditions, the selected
condition path, the package instances reached with their real paths, the
importer chain to the first failure, the failure class, the execution target,
and the result after each relevant checkpoint. Regions beyond the first
failure are not counted as passing or as further confirmed blockers.

The ladder below orders the first corpus. Versions are the ones the audit
inspected; a scenario pins them.

| Rung | Needs                            | Packages                                                                                         | What it verifies                                                                     |
| ---- | -------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1a   | resolver                         | `cookie` 2.0.1, `regexparam` 3.0.0, `smol-toml` 1.9.1                                            | string `exports`; `import` over a CommonJS `main`; a nine-file relative graph        |
| 1b   | resolver                         | `trouter` 4.0.0, `nanoid/non-secure` 6.0.2, `date-fns/addDays` 4.4.0                             | a dependency package; subpath exports whose root entry would fail                    |
| 1b   | resolver                         | `hono/utils/url`, `hono/utils/cookie`, the five Hono routers, `hono/html` at 4.13.16             | `./utils/*` patterns, a 77-key `exports` map, a CommonJS `main` that must be ignored |
| 1c   | resolver                         | `rou3`, `path-to-regexp`, `ts-pattern`, `marked`, `mustache`, `html-entities`, `dequal`, `klona` | breadth of pure computation                                                          |
| 1c   | resolver                         | `@sinclair/typebox` 0.34.52                                                                      | a 200-file graph                                                                     |
| 2    | `Request`, `Response`, `Headers` | `hono` GET through `app.fetch()`, `hono/tiny`, middleware, `hono/validator`                      | the smallest meaningful Hono scenario                                                |
| 3    | M6 encoding and URL group        | `itty-router`, `urlpattern-polyfill`, `micromark`, `js-base64`, `hono/jsx`, `hono/jwt`           | `URL` and `TextEncoder`, including top-level `new TextEncoder()`                     |

Rung 2 depends on the HTTP objects checkpoint that
[*PLAN-M6.md*](./PLAN-M6.md) separates from network `fetch()`. The audit
showed that Hono's single-`c.text()` path constructs a `Response` from a
string and reads `Request.url` and `Request.method`, and nothing else from
that group.

The audit also fixed the negative fixtures that the resolver tests carry:

 -  `neverthrow` 8.2.0 and `@msgpack/msgpack` 3.1.3 have no `exports`, a
    CommonJS `main`, and an ESM `module` field, and must resolve to
    CommonJS;
 -  `superstruct` 2.0.2 ships `.mjs` files but no `exports`, and must
    resolve to its CommonJS `main`;
 -  `yaml` 2.9.1 has `type: commonjs` at the root and `type: module` in
    *browser/package.json*, and its `default` target must be classified as
    a module;
 -  `markdown-it` 15.0.3 is a module whose dependency `punycode.js` is
    CommonJS, and must fail with a package format finding that names the
    dependency;
 -  `hono/utils/color` contains `import()` inside a function and must fail
    at parse time with package provenance;
 -  `zod` 4.6.7 aliases `Function` and must report the constructor form,
    not pass as free of dynamic source;
 -  `valibot` 1.5.0 references `Intl.Segmenter` and `TextEncoder` only
    inside functions and must compile, with the scenario that avoids them
    passing and the scenario that reaches them failing at run time with
    `ReferenceError`.


Relationship to other plans
---------------------------

 -  M6 supplies the web globals that rungs 2 and 3 need. This track asks
    [*PLAN-M6.md*](./PLAN-M6.md) for one sub-checkpoint: `Headers`,
    `Request`, and `Response` as in-memory objects before the socket, name
    resolution, and TLS decisions that `fetch()` requires.
 -  M7 owns CommonJS loading, `node:*`, `Buffer`, `process`, and the
    package corpus that depends on them. The resolver, trace, and
    classification built here are what M7's corpus runs through.
 -  [*PLAN-DYN.md*](./PLAN-DYN.md) owns dynamic import. Its
    build-time-resolvable subset, scheduled under
    [*PLAN-LANGUAGE.md*](./PLAN-LANGUAGE.md), turns a literal `import()`
    into a static edge that this resolver serves. Nothing here admits
    source loading after start.
 -  [*PLAN-CLI.md*](./PLAN-CLI.md) owns the command-line surface for extra
    conditions and the printing of every graph diagnostic.
 -  [*PLAN-RELEASE.md*](./PLAN-RELEASE.md) is unaffected. This track is not
    a release gate unless the maintainer names it one.
 -  [ADR 0009](./docs/adr/0009-module-identity-and-linking.md) already keeps
    the resolver and loader outside the compiler core as replaceable host
    policy. Proposed
    [ADR 0033](./docs/adr/0033-installed-package-resolution.md) amends its
    identity rule to real paths.


Verification
------------

 -  Fixture trees under *tests/fixtures/* reproduce npm and pnpm layouts,
    including symbolic links, scoped packages, `imports` maps,
    self-references, subpath patterns, `null` targets, missing targets,
    nested `type` fields, and each negative fixture above. The pure
    resolution core is tested against them without a file system, and the
    host index is tested against them on disk.
 -  The Node.js and Deno compiler hosts produce the same resolution trace
    from the same tree.
 -  Property tests under [*PLAN-PT.md*](./PLAN-PT.md) generate `exports`
    maps and specifiers and compare the core against the Node.js 24
    resolver on the host for every construct this contract admits.
 -  Each supported scenario executes natively on Linux AMD64 and macOS
    AArch64 with identical observations under specialization enabled and
    disabled, and keeps compile-link evidence on AArch64 Linux.
 -  A compiled pure-computation scenario runs in a directory that contains
    neither sources nor *node\_modules*.
 -  Changing a manifest, a condition, a source file, or a symbolic link
    target between two builds changes the recorded trace or fails the
    build; it never silently changes which code runs.
 -  `mise run check` and `mise run test` pass at every checkpoint.


Delivery order
--------------

1.  Record the resolution contract, condition set, format policy, identity
    rule, provenance field, and trace shape in an architecture decision, with
    the alternatives considered and the triggers for revisiting it.
2.  Land the host boundary and observation model: the asynchronous
    `ModuleResolver`, the package index and pure core, real-path identity
    for every module, the `Diagnostic` provenance field, and the trace
    returned on failure. Existing alias, cycle, live-binding, and JSON tests
    pass unchanged.
3.  Land installed ESM graphs: bare and scoped specifiers, `exports`,
    `imports`, self-references, patterns, the legacy fallback, and format
    classification, with the npm and pnpm fixtures. Run rung 1a natively on
    both execution targets and publish the first scenario records. This is
    the track's first checkpoint.
4.  Expand the corpus through rungs 1b and 1c, land the negative fixtures,
    and publish the laboratory records with the reproducible install step.
5.  When the HTTP objects checkpoint in [*PLAN-M6.md*](./PLAN-M6.md) lands,
    run rung 2 and record the Hono scenario.
6.  Land the TypeScript source unit: the `oseo` condition, the frontend
    admissions it needs, a fixture whose tarball ships the source, and the
    three-way measurement. JavaScript package usability does not wait for
    this unit.
7.  Decide, from the corpus records, whether direct JSR source acquisition
    is worth a plan of its own.

At every checkpoint the affected documents, the evidence README, and the
roadmap are updated in the same change.


Exit criteria
-------------

The track is complete when:

 -  the accepted architecture decision describes the implemented resolver
    and no listed difference from Node.js is undocumented;
 -  every fixture class above passes on both hosts and the trace is
    identical between them;
 -  every rung 1 and rung 2 scenario runs natively on both execution targets
    with published records, and every negative fixture fails with the
    recorded classification and provenance;
 -  the `oseo` condition is implemented, documented for package authors, and
    measured against published JavaScript on at least three packages;
 -  the laboratory record format is documented and generated by a
    repository task; and
 -  [*ROADMAP.md*](./ROADMAP.md), [*DESIGN.md*](./DESIGN.md), and
    [*docs/cli.md*](./docs/cli.md) describe the implemented behavior.


Open questions
--------------

 -  Whether to adopt the module syntax detection that Node.js applies to a
    `.js` file in a scope without `type`, or to keep the explicit CommonJS
    classification. The audit found no early candidate that needs
    detection; the first corpus checkpoint revisits this.
 -  The command-line spelling for extra conditions and whether a project
    manifest may also declare them.
 -  Whether a source-resolution profile that rewrites `.js` to `.ts` for
    opted-in packages is worth its ambiguity.
 -  Whether `.d.ts` boundary hints at call sites into published JavaScript
    recover enough of the source unit's benefit to make a separate unit.
 -  Whether the corpus scenarios run in continuous integration from vendored
    install trees or only from a documented local task, given that the
    install step needs the network.
