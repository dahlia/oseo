Contributing to Oseo
====================

Thank you for helping build Oseo. The project is currently in M0, so interfaces,
package boundaries, and tooling will change as experiments replace assumptions
with evidence. Small, testable changes are especially valuable at this stage.


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
~~~~

`mise tasks` is the source of truth for commands available in the current
checkout. M0 tooling is still being added, so a command described in a design or
plan document may not exist yet. Do not add instructions that present planned
commands as already available.

The mise aube dependency provider checks *package.json* and *aube-lock.yaml*
before every `mise run`. It performs a frozen install only when the inputs have
changed or *node\_modules/* is missing. Run `mise deps` to synchronize
dependencies without starting a repository task. Do not add task-level install
dependencies that duplicate this provider.

As the workspace is scaffolded, the intended toolchain is:

 -  [aube] for JavaScript package installation and
    workspace management;
 -  [Oxfmt] for JavaScript, TypeScript, and data-file formatting;
 -  [Oxlint] for JavaScript and TypeScript linting;
 -  [tsdown] for npm package builds;
 -  Node.js and Deno as bootstrap compiler hosts;
 -  Zig's C toolchain, invoked through `zig cc`, as the default way to compile
    generated C11 and the initial runtime.

Repository-wide tools must be pinned through mise and exposed through mise
tasks. Package build and test dependencies belong in aube workspace manifests.
Oxfmt owns JavaScript, TypeScript, and supported data files. Hongdown owns
Markdown, and `mise fmt` owns *mise.toml*. Generated lockfiles are never
formatter inputs.

Using Zig as a C toolchain does not make Zig the runtime implementation
language. The C runtime and the native backend remain replaceable architectural
components.

When aube workspace files exist, do not introduce npm or pnpm lockfiles or use a
different package manager to modify dependency state. Do not hand-edit generated
lockfiles.

[mise]: https://mise.jdx.dev/
[aube]: https://aube.jdx.dev/
[Oxfmt]: https://oxc.rs/docs/guide/usage/formatter
[Oxlint]: https://oxc.rs/docs/guide/usage/linter
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

Names and exact splits may change in the M0 plans. The dependency direction is
more important than the initial names: the compiler core defines interfaces,
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

Source type annotations and JSDoc types are optimization hints. The compiler
must not depend on `tsc` or the TypeScript type checker to extract them. A
bootstrap parser's AST must be converted at the frontend boundary rather than
leaking into intermediate representations or backend code.


Line length
-----------

Keep every manually maintained source, configuration, and documentation line
at or below 80 columns. Wrap prose and code instead of relying on an editor's
soft wrapping. Markdown table rows and link destinations are exempt. A URL may
also exceed the limit wherever it appears, including in a source-code comment.
Generated lockfiles are exempt and must not be hand-edited.


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

Before submitting a change, run:

~~~~ sh
mise run check
~~~~

Also run any focused test or native fixture task shown by `mise tasks` for the
packages you changed. Do not commit generated binaries, temporary C output, or
debug dumps unless they are reviewed fixtures with a documented purpose.


Package manifests and versions
------------------------------

All published `@oseo/*` packages use one lockstep version. Never bump a single
package independently. npm and JSR manifests for the same package must report
the same version, and internal package dependencies should use the workspace
protocol rather than hard-coded local versions.

Version changes are maintainer-driven and should not be included in unrelated
contributions. The planned stable task interface is `mise run check:versions`
for validation and `mise run bump-versions <version>` for an atomic lockstep
bump. Use those commands only after they appear in `mise tasks`; until then,
leave package versions unchanged unless the work explicitly establishes the
versioning workflow.

npm artifacts should be ESM packages built with tsdown and include declaration
files and source maps. JSR packages should publish TypeScript source. Package
manifests are public API: keep exports explicit, do not expose private build
paths, and do not bundle other `@oseo/*` packages into an npm artifact.


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
 -  which living documents or decision records changed as a result.

If an experiment disproves the current plan, that is a useful result. Preserve
the evidence, update the plan, and state what should be tried next.
