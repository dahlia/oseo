M0-B plan for the monorepo scaffold and native fixture harness
==============================================================

Status
------

Implementation status: ready, not started. [*PLAN-M0-A.md*](./PLAN-M0-A.md)
meets its exit criteria and the entry criteria below are satisfied.

This is a living plan for the second half of milestone M0. It may change when
the scaffold exposes a package cycle, a host portability failure, or a
packaging constraint that the probes did not cover.

M0-B creates the repository foundation on which M1 will implement the first
generic compiler slice. It must prove package boundaries, dual-host execution,
npm and JSR package shapes, version synchronization, C11 compilation, and
differential fixture orchestration. It must not claim support for JavaScript
syntax that still lacks generic semantics.


Entry criteria
--------------

Before M0-B starts, M0-A must provide:

 -  exact development-host and native-toolchain versions;
 -  an accepted bootstrap parser and owned-syntax boundary;
 -  a C backend, C runtime, target, and toolchain responsibility split;
 -  either accepted value, ABI, and root decisions or opaque interfaces that
    prevent their provisional representation from leaking across packages;
 -  the draft M1 language profile and unsupported-feature diagnostic format.

If any entry is still deferred, this plan must name the temporary interface and
the experiment that removes it. “Decide while implementing” is not an entry
criterion.


Package map
-----------

Create publishable packages under *packages/*. Every package has both
*package.json* for npm and *deno.json* for JSR, an explicit public entry point,
and source under its own *src/* directory.

| Package               | Responsibility                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `@oseo/compiler`      | Compiler orchestration, Oseo-owned contracts, diagnostics, target descriptions, and extension interfaces     |
| `@oseo/parser-babel`  | Babel-based implementation of the source-frontend interface                                                  |
| `@oseo/backend-c`     | Conversion of backend-neutral native input into deterministic C11 source                                     |
| `@oseo/runtime-c`     | Versioned C runtime sources and runtime-input provider                                                       |
| `@oseo/toolchain-zig` | Zig command construction, compilation, linking, and target mapping                                           |
| `@oseo/host`          | Node.js and Deno implementations of filesystem, process, temporary-directory, and diagnostic host operations |
| `@oseo/cli`           | Composition root, command-line contract, and selection of concrete adapters                                  |
| `@oseo/testkit`       | Shared unit, differential, structural, and native fixture support                                            |

The compiler package defines the interfaces. Concrete parser, backend, runtime,
toolchain, and host packages may depend on `@oseo/compiler`; the reverse
dependency is forbidden. The CLI imports the chosen implementations and wires
them together. The C backend does not depend on the C runtime or Zig toolchain.

~~~~ mermaid
flowchart BT
    parser["@oseo/parser-babel"] --> compiler["@oseo/compiler"]
    backend["@oseo/backend-c"] --> compiler
    runtime["@oseo/runtime-c"] --> compiler
    toolchain["@oseo/toolchain-zig"] --> compiler
    host["@oseo/host"] --> compiler
    testkit["@oseo/testkit"] --> compiler
    cli["@oseo/cli"] --> compiler
    cli --> parser
    cli --> backend
    cli --> runtime
    cli --> toolchain
    cli --> host
~~~~

`@oseo/testkit` consumes public contracts and injected implementations. It must
not become a back door for importing private package files.


Workspace contract
------------------

The root workspace contains these files:

| Path                           | Purpose                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| *VERSION*                      | Single source of truth for the lockstep `@oseo/*` version                                     |
| *package.json*                 | Private npm workspace root and development dependencies                                       |
| *deno.json*                    | Deno workspace, formatting, linting, checking, and manual use of aube's *node\_modules/* tree |
| *aube-workspace.yaml*          | aube workspace membership and package-manager policy                                          |
| *aube-lock.yaml*               | Sole lockfile for npm dependency installation                                                 |
| *tsconfig.json*                | Shared erasable TypeScript and declaration settings                                           |
| *tsdown.config.ts*             | Shared npm build policy for all publishable packages                                          |
| *tools/versions.ts*            | Cross-host version validation and lockstep mutation                                           |
| *.github/workflows/check.yaml* | Clean Linux x86-64 continuous-integration gate                                                |

Use _packages/\*_ as the workspace pattern in aube and Deno. Configure Deno to
use *node\_modules/* in manual mode so aube remains the package manager. Do not
let a second tool rewrite dependency state. If a Deno-only dependency later
requires *deno.lock*, introduce it through a separate documented decision rather
than allowing it to appear incidentally.

Pin Node.js, Deno, Zig, and aube to exact versions in *mise.toml*. Keep tsdown,
TypeScript, publint, and `@arethetypeswrong/core` as root development
dependencies installed by aube. Repository tasks invoke local JavaScript tools
through `aube exec`; contributors do not need npm, pnpm, or a global tsdown
installation.


Work sequence
-------------

1.  Create the root workspace.

    Add the root manifests, aube workspace file, lockfile, shared TypeScript
    settings, ignore rules, and mise pins. Start package versions at `0.0.0`
    unless an accepted release decision selects another initial value. Set the
    root npm manifest to private and every package manifest to public under the
    `@oseo` scope.

    The TypeScript configuration enforces `erasableSyntaxOnly`,
    `verbatimModuleSyntax`, explicit *.ts* extensions for source-relative
    imports, and `isolatedDeclarations`. Do not add path aliases that Node.js
    ignores at run time. Code that imports types uses `import type` or an inline
    type modifier.

2.  Implement lockstep version management.

    Store one strict SemVer value with a trailing newline in *VERSION*. Every
    package's *package.json* and *deno.json* must contain that exact version.
    Internal npm dependencies use `workspace:*`; the version tool rejects a
    hard-coded internal range.

    *tools/versions.ts* has two explicit modes: check and set. Node.js and Deno
    both execute this same file. The check mode is read-only and runs under both
    hosts. The set mode runs under Node.js, validates the complete target
    version, and computes all edits before writing. It writes sibling temporary
    files only after every input passes validation, then renames them into
    place. A failed temporary write leaves every manifest unchanged; a failed
    rename restores the original bytes and reports the rollback. Tests run
    mutation and failure cases in a temporary copy of a small fixture
    workspace.

    Expose the public task interface as:

    ~~~~ sh
    mise run check:versions
    mise run bump-versions 1.2.3
    ~~~~

    `bump-versions` runs set mode first, then invokes the two-host version check
    before succeeding.

    Declare the bump argument with mise's `usage` field. `check:versions` must
    also detect a missing package manifest, mismatched npm and JSR metadata,
    duplicate package names, a non-`@oseo` public package, and an internal
    dependency that escapes the workspace protocol. Do not add Nushell solely
    for version management.

3.  Scaffold the package boundaries.

    Give each package a minimal public entry point and package-level
    *README.md*. Add only the types and behavior needed to prove composition.
    Domain objects that M1 has not designed remain opaque. In particular, do
    not publish provisional tag masks, parser AST nodes, C runtime structure
    layouts, or MIR operation enums.

    Add an automated dependency-boundary check. It rejects imports from another
    package's private files, any concrete-package import from `@oseo/compiler`,
    direct `@oseo/runtime-c` or `@oseo/toolchain-zig` imports from
    `@oseo/backend-c`, and package cycles. A type-only import still counts as a
    dependency and must follow the graph.

4.  Establish npm and JSR package shapes.

    Use tsdown workspace mode for npm builds. The shared policy is ESM only,
    unminified output, external source maps, declaration files, and declaration
    maps. Keep every `@oseo/*` dependency external with `deps.neverBundle`.
    Explicitly write package exports in each *package.json*; do not enable
    tsdown's export-generation feature.

    Each *deno.json* exports TypeScript source from *src/*. npm exports point to
    the corresponding built JavaScript and declaration output. The C runtime
    package includes its reviewed *.c* and *.h* assets under *native/* without
    embedding them in generated JavaScript. Tests inspect the packed file list
    so those assets cannot disappear from a release.

    Run publint and attw with an ESM-only profile after every build. Pack every
    npm package with aube into a temporary directory and inspect the archive.
    Run `deno publish --dry-run --allow-dirty` for the JSR workspace so the
    validation also works on an uncommitted change. Neither validation task
    publishes a package or requires registry credentials.

5.  Add dual-host unit-test runners.

    Keep compiler-core test cases host-neutral. A shared case module exports
    named test functions and uses small host-independent assertion helpers.
    Thin Node.js and Deno runners register the same cases with their native test
    APIs. The Node.js runner uses relative imports to load compiler source
    directly outside *node\_modules/*, so native type stripping enforces the
    erasable-TypeScript subset. Deno runs the same source modules.

    Adapter and package integration tests may consume built npm output under
    Node.js and TypeScript source under Deno. This distinction must be explicit
    in task names and failure output. A passing bundled test cannot replace the
    direct compiler-core host test.

6.  Build the native fixture harness.

    Implement a test-only native module that exercises composition without
    pretending to implement JavaScript. The C backend turns that synthetic input
    into deterministic C11, the runtime package supplies a separate C
    translation unit, and the Zig toolchain compiles and links them in a fresh
    temporary directory.

    The fixture runner records stdout, stderr, exit status, target, emitted C,
    and the exact compiler invocation. It runs a reference TypeScript fixture
    under Node.js and Deno, requires the two reference observations to agree,
    then compares the native observation with them. Generated files are retained
    only on failure or when an explicit keep-artifacts option is used.

    Run the fixture natively on Linux x86-64 with strict C warnings and
    undefined-behavior sanitization. Also compile it for AArch64 Linux without
    executing it. Target selection is an explicit input to the toolchain; it
    must not silently inherit the host ABI.

    The synthetic fixture is infrastructure, not part of Oseo's supported
    language profile. M1 replaces its synthetic input with owned syntax, HIR,
    MIR, and generic lowering.

7.  Reserve the CLI and diagnostic surface.

    Add `--help`, `--version`, `--emit-c`, and `--dump-mir` to the CLI contract.
    Before M1 has a real pipeline, source input must return the documented
    unsupported-feature diagnostic with a source location and nonzero exit
    status. Do not special-case a JavaScript snippet to make the native smoke
    fixture appear to be compiled source.

    The synthetic native fixture may expose emitted C through testkit, not
    through undocumented CLI behavior. M1 will make `--emit-c` and `--dump-mir`
    useful for supported source while preserving the option names established
    here.

8.  Complete the task graph and continuous integration.

    `mise run check` is the only required aggregate gate. It covers formatting,
    linting, Node.js and Deno type checks, dual-host tests, version checks,
    dependency-boundary checks, npm builds, npm and JSR package validation, and
    native fixture tests. Focused tasks remain available for debugging:

    | Task                      | Responsibility                                              |
    | ------------------------- | ----------------------------------------------------------- |
    | `mise run fmt`            | Format supported repository files                           |
    | `mise run build`          | Build all npm artifacts with tsdown                         |
    | `mise run test:node`      | Run direct core tests and built-package tests under Node.js |
    | `mise run test:deno`      | Run source tests under Deno                                 |
    | `mise run test:native`    | Build, run, and compare the native fixture                  |
    | `mise run check:versions` | Validate lockstep package metadata under both hosts         |
    | `mise run check:packages` | Validate exports, declarations, archives, and JSR dry runs  |
    | `mise run clean`          | Remove only generated build and test artifacts              |


    The CI workflow runs on Linux x86-64 from a clean checkout, provisions tools
    through mise, performs a frozen aube install, and runs `mise run check`.
    Print pinned tool versions at the start of the job. Preserve native fixture
    diagnostics as failure artifacts. The workflow does not publish packages.


Test matrix
-----------

| Surface              | Node.js                  | Deno                     | Native x86-64      | AArch64 compile-only |
| -------------------- | ------------------------ | ------------------------ | ------------------ | -------------------- |
| Version checker      | Required                 | Required                 | Not applicable     | Not applicable       |
| Compiler-core cases  | Direct TypeScript source | Direct TypeScript source | Not applicable     | Not applicable       |
| Package integration  | Built ESM                | TypeScript source        | Not applicable     | Not applicable       |
| Parser adapter smoke | Required                 | Required                 | Not applicable     | Not applicable       |
| Native fixture       | Reference observation    | Reference observation    | Compile and run    | Compile and link     |
| Package validation   | npm archive consumer     | JSR dry run              | C assets inspected | C assets inspected   |

The matrix tests different contracts. It must not collapse into one Node.js
bundle test labeled as cross-host coverage.


Exit criteria
-------------

M0-B is complete when all of the following are true:

 -  a clean checkout requires only mise and can provision Node.js, Deno, Zig,
    aube, and all workspace dependencies;
 -  all eight `@oseo/*` packages have explicit public APIs, npm and JSR
    manifests, and the allowed dependency graph;
 -  `mise run check:versions` passes under both hosts and the bump task changes
    every package version in one tested operation;
 -  tsdown produces ESM, declaration files, source maps, and declaration maps
    for every TypeScript package without bundling another `@oseo/*` package;
 -  every npm archive passes publint and attw and contains only intended public
    files; every JSR package passes `deno publish --dry-run --allow-dirty`;
 -  the same compiler-core case corpus passes under Node.js and Deno;
 -  the native fixture compiles and runs through `zig cc`, matches both
    reference observations, and compiles for AArch64 Linux;
 -  unsupported source produces a stable, source-located diagnostic rather than
    a parser or host stack trace;
 -  `--emit-c` and `--dump-mir` appear in CLI help without claiming unavailable
    compiler functionality;
 -  `mise run check` passes locally and in the clean CI job;
 -  [*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md), and the relevant
    decision records match the implemented repository.


Work left for M1
----------------

M0-B does not define the production owned syntax tree, HIR, MIR, JavaScript
operator semantics, generic tagged-value helpers, real source-to-C lowering,
garbage collection, exceptions, or specialization. It may define opaque
interfaces and test-only data needed by the scaffold. M1 replaces those test
inputs with the first complete generic language slice.


Tooling references
------------------

The tooling assumptions in this plan were checked on July 14, 2026:

 -  [aube installation] documents mise as the
    recommended installation path.
 -  [aube workspaces] documents
    *aube-workspace.yaml* and `workspace:*` dependencies.
 -  [aube lockfiles] documents
    *aube-lock.yaml* and frozen installation.
 -  [mise Zig support] documents Zig as a
    mise core tool.
 -  [mise task arguments] documents
    the `usage` field used by the version-bump task.
 -  [tsdown declaration output],
    [dependency handling], and
    [package validation] document the npm build
    checks used here.
 -  [Node.js TypeScript support]
    documents native type stripping and the erasable syntax restrictions.
 -  [Deno workspaces] and
    [JSR publishing] document hybrid
    npm/JSR workspaces and dry-run validation.

[aube installation]: https://aube.jdx.dev/installation
[aube workspaces]: https://aube.jdx.dev/package-manager/workspaces
[aube lockfiles]: https://aube.jdx.dev/package-manager/lockfiles
[mise Zig support]: https://mise.jdx.dev/lang/zig.html
[mise task arguments]: https://mise.jdx.dev/tasks/task-arguments
[tsdown declaration output]: https://tsdown.dev/options/dts
[dependency handling]: https://tsdown.dev/options/dependencies
[package validation]: https://tsdown.dev/options/lint
[Node.js TypeScript support]: https://nodejs.org/api/typescript.html
[Deno workspaces]: https://docs.deno.com/runtime/fundamentals/workspaces/
[JSR publishing]: https://jsr.io/docs/publishing-packages
