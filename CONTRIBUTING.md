Contributing to Oseo
====================

Thank you for helping build Oseo. The project has completed M4 and is expanding
measured ECMAScript compatibility during M5. Interfaces and implementation
details will continue to change as standards, generated, and native target
evidence replaces assumptions. Small, testable changes are especially valuable
at this stage.


Before you start
----------------

Read the documents that define the current project direction:

 -  [*WHITEPAPER.md*](./WHITEPAPER.md) explains the motivation and intended
    scope.
 -  [*DESIGN.md*](./DESIGN.md) records the current architectural constraints.
 -  [*ROADMAP.md*](./ROADMAP.md) defines capability milestones and their exit
    criteria.
 -  The applicable _PLAN-\*.md_ document, when one exists, defines the scope and
    acceptance criteria for the work in progress.
 -  Architecture decision records, once introduced, explain decisions that are
    costly to reverse.

The design, roadmap, plans, and decision records are living documents. They may
change throughout development. When implementation or test evidence invalidates
a documented assumption, update the relevant document in the same change rather
than preserving an obsolete plan.


Development environment
-----------------------

Oseo uses [mise] as the entry point for development
tools and repository tasks. Start with:

~~~~ sh
mise install
mise tasks
mise run check
mise run test
~~~~

`mise install` also installs two local Git hooks through
`mise run install-hooks`. The pre-commit hook runs `mise run check`. The
commit-msg hook runs `mise run check:commit-message` on the message file Git
passes it. Repeating the install refreshes both.

A commit message uses a subject of 50 columns or fewer, a blank second line,
and a body wrapped at 72. The commit-msg hook does not enforce that. It
rejects only a message whose subject reaches 80 columns, whose second line is
not blank, or whose body has a line past 100 columns that wrapping could have
shortened. It also rejects an escaped paragraph break, a doubled `\n` or `\t`
on a line already past its limit, which is what a message looks like when
shell quoting turned its line breaks into literal characters. Writing about an
escape sequence is fine; only that combination is refused.

The looser thresholds are deliberate. The hook catches a message that went
wrong mechanically and leaves style to review, so a message written to the
convention never reaches them. A rejection names the line at fault and how to
fix it, and keeps what you wrote for editing rather than discarding it.

`mise tasks` is the source of truth for commands available in the current
checkout. A command described in a design or plan document may not exist until
its implementation lands. Do not add instructions that present planned
commands as already available.

The mise aube dependency provider checks *package.json* and *aube-lock.yaml*
before every `mise run`. It performs a frozen install only when the inputs have
changed or *node\_modules/* is missing. Run `mise deps` to synchronize
dependencies without starting a repository task. Do not add task-level install
dependencies that duplicate this provider.

The workspace uses this toolchain:

 -  [actionlint] for GitHub Actions workflow validation;
 -  [aube] for JavaScript package installation and
    workspace management;
 -  [Oxfmt] for JavaScript, TypeScript, and data-file formatting;
 -  [Oxlint] for JavaScript and TypeScript linting;
 -  [ShellCheck] for shell fragments embedded in GitHub Actions workflows;
 -  [TypeScript] for static checking of repository source;
 -  [tsdown] for npm package builds;
 -  Node.js and Deno as bootstrap compiler hosts;
 -  Zig's C toolchain, invoked through `zig cc`, as the default way to compile
    generated C11 and the initial runtime.

Standalone repository-wide tools must be pinned through mise and exposed
through mise tasks. Node.js-hosted tools that load workspace packages belong
in the aube workspace manifest and must run through `aube exec` from a mise
task. Oxlint follows the latter rule because its local JavaScript plugin
requires the Node.js wrapper. Package build and test dependencies also belong
in aube workspace manifests. Oxfmt owns JavaScript, TypeScript, and supported
data files. Hongdown owns Markdown, and `mise fmt` owns *mise.toml*. Generated
lockfiles are never formatter inputs.

Anti-slop rules with existing violations remain warnings during migration.
Rules with a clean baseline stay errors. Promote each warning after its
existing findings have been resolved.

Using Zig as a C toolchain does not make Zig the runtime implementation
language. The C runtime and the native backend remain replaceable architectural
components.

When aube workspace files exist, do not introduce npm or pnpm lockfiles or use a
different package manager to modify dependency state. Do not hand-edit generated
lockfiles.

[mise]: https://mise.jdx.dev/
[actionlint]: https://github.com/rhysd/actionlint
[aube]: https://aube.jdx.dev/
[Oxfmt]: https://oxc.rs/docs/guide/usage/formatter
[Oxlint]: https://oxc.rs/docs/guide/usage/linter
[ShellCheck]: https://www.shellcheck.net/
[TypeScript]: https://www.typescriptlang.org/
[tsdown]: https://tsdown.dev/


Repository layout and package boundaries
----------------------------------------

Publishable TypeScript components live under *packages/*, not a root-level
*src/* directory. Each package owns its source, tests, manifest, build
configuration, and public API. Public packages use the reserved `@oseo/*`
scope and should be designed so that they can be published independently to npm
and JSR, even though the repository releases them together.

The initial package boundaries are expected to cover these roles:

 -  a compiler core that owns intermediate representations and extension
    interfaces;
 -  a source frontend adapter;
 -  a C11 backend;
 -  a C11 runtime;
 -  a Zig-based C toolchain adapter;
 -  Node.js and Deno host adapters;
 -  a CLI that composes concrete implementations;
 -  shared conformance and fixture utilities.

Names and exact splits may change in milestone plans. The dependency direction
is more important than the initial names: the compiler core defines interfaces,
concrete adapters implement them, and composition happens at an outer entry
point. The compiler core must not import a concrete parser, backend, runtime, or
toolchain. The C backend should emit C without owning process execution, and the
toolchain adapter should compile inputs without defining JavaScript semantics.

Avoid importing through another package's private files. Add a public entry
point or reconsider the package boundary instead.


TypeScript policy
-----------------

Oseo's compiler and development tools use ESM. Code intended to run under both
Node.js and Deno must use APIs supported by both hosts or depend on a narrow
host adapter. Keep runtime-specific process, filesystem, environment, and
module loading behavior out of the compiler core.

The cross-host compiler core should stay within an erasable TypeScript subset.
Avoid constructs that require TypeScript-specific runtime emission, including
enums, namespaces, parameter properties, and legacy decorators. Prefer explicit
data structures, tagged unions, and `import type` for type-only dependencies.

Prefer immutable data unless mutation is part of the implementation contract.
Mark object fields `readonly` by default, including fields on internal and test
types. Spell immutable array types as `readonly T[]`; use mutable `T[]` only
when the code deliberately changes that array, such as a local accumulator.
Use `interface` for named object shapes. Reserve `type` for unions,
intersections, primitive aliases, tuples, and other declarations that an
interface cannot express clearly.

Document exported APIs with JSDoc. Important internal declarations also need
JSDoc when they define a package boundary, ownership rule, invariant, or
non-obvious representation. Describe the contract and the reason it exists;
do not add comments that merely repeat the declaration's name or TypeScript
syntax.

Repository checks use `tsc --noEmit` to validate Oseo's own TypeScript source.
Source type annotations and JSDoc types in programs compiled by Oseo remain
optimization hints. The Oseo compiler must not depend on `tsc` or the
TypeScript type checker to extract them. A bootstrap parser's AST must be
converted at the frontend boundary rather than leaking into intermediate
representations or backend code.


Line length
-----------

Keep every manually maintained source, configuration, and documentation line
at or below 80 columns. Wrap prose and code instead of relying on an editor's
soft wrapping. Markdown table rows and link destinations are exempt. A URL may
also exceed the limit wherever it appears, including in a source-code comment.
Generated lockfiles are exempt and must not be hand-edited.
Vendored source under *tools/oxlint/anti-slop/* is also exempt so that it stays
directly comparable with upstream. Do not reformat it.


C and native toolchain policy
-----------------------------

The initial backend emits C11. Generated C and the runtime must avoid undefined
behavior, including in integer overflow, shifts, pointer conversions, and
floating-point edge cases. Target-dependent assumptions belong in explicit
target or ABI descriptions, not scattered through backend lowering.

Use the repository's Zig toolchain task once it is available. Cross-compilation
must select a target explicitly and must not silently inherit the developer
machine's ABI. Platform-specific work should stay behind the toolchain and host
interfaces so that another C compiler, native backend, or runtime language can
replace the initial implementation.

Linux on AMD64 and macOS on AArch64 are supported native execution
environments. AArch64 Linux is a compile-link and inspection target. A
successful cross-link is portability evidence, not a native semantic pass.
Target and host changes must preserve explicit selection, reject unsupported
pairs before execution, and retain the exact host and target in failure and
replay metadata.

Native target IDs use operating-system, architecture, and optional ABI order,
such as `macos-aarch64` and `linux-x86_64-gnu`. These are stable Oseo IDs, not
external compiler strings. A concrete toolchain adapter owns that mapping.
Keep `NativeOperatingSystem` limited to operating-system facts; unknown values
belong to host detection rather than build targets.


Semantics and optimization
--------------------------

Every accepted language construct must have defined behavior for every value
that can reach it. Add support in complete semantic units; reject unsupported
syntax or host capabilities with a source-located diagnostic.

Optimization hints must never become correctness requirements. Adding,
removing, or falsifying a TypeScript or JSDoc hint must not change observable
behavior. Every specialized path needs a deliberate guard-failure test that
proves execution reaches a compiled generic fallback. A change is not complete
if it works only when its hint is true.


Tests and checks
----------------

Write tests with or before the implementation they cover. Choose the smallest
test layer that proves the contract, then add broader coverage where the change
crosses a boundary. Depending on the work, this may include:

 -  unit tests for parsing, IR construction, lowering, runtime helpers, and
    diagnostics;
 -  differential tests against a reference Node.js or Deno execution;
 -  specialization-invariance tests with specialization enabled and disabled;
 -  deliberate guard misses and generic fallback tests;
 -  structural checks of generated IR or C when code shape is part of the
    contract;
 -  applicable ECMA-262, test262, or WinterTC conformance tests.

Every admitted M5 semantic family has one normative record indexed by
*docs/language-profile-m5/index/*. The record assesses the fixed vocabulary in
the M5 profile. A covered class names existing evidence. An omitted class gives
a reason and names existing replacement evidence for the same contract. New
families may not use `unassessed`, and `mise run check:evidence-lanes` rejects
an incomplete or stale record set.

Tests shared by Node.js and Deno must import `test` from `node:test` and
`assert` from `node:assert/strict` directly. Register tests in files that both
hosts execute unchanged. Do not add host-specific registration wrappers or
repository-local assertion helpers for APIs provided by these modules.

Place tests owned by one package under *packages/<package>/tests/* and name
executable test files *.test.ts* so Node.js and Deno discover them. Reserve the
repository-level *tests/* directory for cross-package integration, native
fixtures, built-artifact validation, and workspace tooling. A package test may
import only its public source entry point or an explicitly tested internal
module from the same package.

### Property-based tests

Use property tests when a semantic unit has a useful generated domain or state
model. Keep example, differential, structural, sanitizer, and standards tests
when they prove contracts that generated observations cannot.

Property tests use `fast-check` and the *.property.test.ts* suffix. Package
properties live under *packages/<package>/tests/*; cross-package native
properties live under *tests/property/*. The same package test source runs
unchanged under Node.js and Deno.

Define the generated domain, construction preconditions, independent oracle,
seed, size limit, case count, and failure observation in each suite. Generate
admitted structured inputs directly instead of filtering arbitrary source. Keep
that structure until the predicate prints source so shrinking can preserve
scope, graph, and schedule invariants.

Each *.property.test.ts* file is one seed family. Before adding its first
property, reserve an unused aligned 256-seed block in
*tests/property-seeds.yaml*. Assign a distinct slot to each domain in that
family and keep the assignment stable. The compatibility-ratchet check rejects
unregistered families, malformed or overlapping blocks, out-of-block seeds,
reuse across distinct domains, and stale registry entries. A deliberate seed
change also needs the exact property-seed override and replay rationale that
the ratchet requires.

New syntax, operators, values, runtime states, and module behavior extend their
applicable valid and invalid generators. A specialization adds generated hits,
every distinct miss or invalidation, false hints, and disabled-policy cases.
Changing a generator must preserve or deliberately replace its shrinking and
replay quality.

Failures report `fast-check` version, seed, replay path, profile, and domain.
Replay an ordinary or extended suite by setting `OSEO_PROPERTY_SEED` and
`OSEO_PROPERTY_PATH`; use `OSEO_PROPERTY_RUN_SCALE` and `OSEO_PROPERTY_SIZE`
only to change the reviewed case budget and size. Minimize a failure and retain
it as an ordinary regression fixture before fixing the implementation.

`mise run test` owns the ordinary property gate. Run
`mise run test:property:extended` before submitting changes to generators,
compiler lowering, runtime state, or specialization. The extended task executes
ten times the ordinary case budget under both hosts and treats an interrupted
run as a failure.

Before submitting a change, run:

~~~~ sh
mise run check
mise run test
~~~~

The `mise run test` gate already runs `test:node`, `test:deno`, `test:native`,
and `test:test262`, so it covers the native fixtures, the cross-target links,
and the complete reviewed test262 corpus. `test:node` runs `node --test` at
the repository root, which also discovers every *.property.test.ts* file, so
the ordinary property suites run inside it as well. Naming `test:native`,
`test:test262`, or `test:property:native` again after it repeats work that
takes over an hour and proves nothing new.

Also run any focused test task shown by `mise tasks` for the packages you
changed. Do not commit generated binaries, temporary C output, or debug dumps
unless they are reviewed fixtures with a documented purpose.

Changes to targets, host adapters, C lowering, the runtime, collector,
specialization, or native generators also run `mise run test:property:extended`
before submission. That is the one task the ordinary gate does not contain: it
runs the same property files at ten times the case budget. The native and
standards tasks inside the ordinary gate execute the matching host target and
retain the AArch64 Linux cross-link; do not replace a required execution with a
blanket skip.

CI partitions the native and test262 suites with `--shard INDEX/TOTAL`, for
example `mise run test:native --shard 1/3` or
`mise run test:test262 --shard 1/3`. Each shard selects a deterministic
round-robin partition of the reviewed input order.

The focused `test:property:extended:native` and
`test:property:extended:package` tasks compose the local extended property
gate. CI partitions the native component by file through Node.js:

~~~~ sh
mise run test:property:extended:native:shard \
  --test-shard=1/6 tests/property/*.property.test.ts
~~~~

Indices are one-based. Run every index for the same total and exact property
file set on each matching host. The unsharded tasks remain the local gates, and
`mise run test262:update` always regenerates the complete manifest without
sharding.

Node.js assigns files to shards by position, not by cost, so which files a
shard receives changes whenever the property file set does, and how evenly the
cost lands is accidental rather than chosen. The total is therefore sized so
that an unlucky partition still finishes well inside the job timeout: measure
the per-file cost of an unsharded `mise run test:property:extended:native` run,
and raise the total whenever the slowest host's slowest shard stops leaving
room for the corpus to keep growing. Raising it costs almost nothing, because
the shards share one fixed amount of work.


Package manifests and versions
------------------------------

All published `@oseo/*` packages use one lockstep version. Never bump a single
package independently. npm and JSR manifests for the same package must report
the same version, and internal package dependencies should use the workspace
protocol rather than hard-coded local versions.

The root *VERSION* file is the single source of truth for the lockstep version.
`mise run check:versions` verifies its strict SemVer value against every
published npm and JSR package manifest. The check also validates manifest
pairs, package names, and `workspace:*` internal dependency ranges. Do not edit
*VERSION* or one package manifest independently.

Version changes are maintainer-driven and should not be included in unrelated
contributions. Use `mise run bump-versions <version>` to update *VERSION* and
every package manifest atomically. The command restores the previous contents
if it cannot complete the full update.

npm artifacts should be ESM packages built with tsdown and include declaration
files and source maps. JSR packages should publish TypeScript source. Package
manifests are public API: keep exports explicit, do not expose private build
paths, and do not bundle other `@oseo/*` packages into an npm artifact.

`mise run check:packages` stages npm artifacts without changing their source
manifests. The staging step rewrites internal `workspace:*` dependencies to the
exact lockstep release version, then inspects the packed manifest. Every package
root must also contain a *LICENSE* file identical to the repository license so
that both npm and JSR artifacts distribute the GPL text.


Documentation and design changes
--------------------------------

Repository-facing documentation, code comments, API documentation, diagnostics,
and change descriptions are written in English unless a document explicitly
states otherwise. Use concrete terms and describe current behavior separately
from intended behavior.

Update documentation whenever a change alters a public contract, supported
language profile, command, package boundary, or milestone criterion. Record a
decision and its evidence when it changes a costly architectural choice. Use
Mermaid for diagrams rather than ASCII art so that relationships remain readable
and maintainable.


Markdown style
--------------

All Markdown documents in the repository follow these rules:

 -  Use American English spelling and punctuation. Write “behavior,” “color,”
    and “center,” not their British variants.
 -  Use sentence case for document titles and headings. Capitalize only the
    first word and proper nouns; do not use title case.
 -  Italicize filenames, directory names, file paths, glob patterns, and file
    extensions in prose. Examples include *CONTRIBUTING.md*,
    *packages/compiler/src/*, _PLAN-\*.md_, and *.ts*. Do not format these terms
    as inline code. When a path appears inside a command or code sample, leave
    it as part of that code rather than adding emphasis.
 -  Use inline code for commands, flags, language identifiers, API names, and
    exact machine-readable values.
 -  Add a language identifier to fenced code blocks when one applies.
 -  Use Mermaid for diagrams. Do not create diagrams with ASCII art.
 -  Avoid em dashes. Rewrite the sentence or use a comma, colon, or semicolon.
 -  Use italics sparingly for ordinary emphasis. Reserve bold text for warnings
    and user-interface labels.
 -  Let Hongdown manage line wrapping and list layout. Do not align Markdown
    manually with padding or repeated spaces.

When a link names a repository file, italicize the visible filename, as in
[*DESIGN.md*](./DESIGN.md). The link destination remains ordinary Markdown
syntax.


Preparing a change
------------------

Keep each change focused on one coherent problem. Avoid unrelated formatting,
dependency, or refactoring edits. In the change description, explain:

 -  the contract or behavior being changed;
 -  why the change belongs in the current milestone;
 -  how the implementation preserves generic behavior and package boundaries;
 -  which tests and repository checks were run;
 -  the compatibility counts before and after, when the change moves them,
    and the reason for any count that decreased;
 -  which living documents or decision records changed as a result.

If an experiment disproves the current plan, that is a useful result. Preserve
the evidence, update the plan, and state what should be tried next.
