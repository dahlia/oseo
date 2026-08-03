Oseo command-line evolution plan
================================

Status
------

Implementation status: planned, not started. This plan defines the command
model, composition boundary, and packaging rules for evolving Oseo's current
single-command interface into an extensible command program. It does not add a
command by itself, reserve a numbered milestone, or change JavaScript
semantics or compatibility counts.

The implemented command line remains the contract described in
[*docs/cli.md*](./docs/cli.md) until a tested implementation and its user
documentation land together. Planned syntax in this document must not be
presented as available before that change.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*CONTRIBUTING.md*](./CONTRIBUTING.md),
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md),
[*PLAN-RELEASE.md*](./PLAN-RELEASE.md),
[*PLAN-REPL.md*](./PLAN-REPL.md),
[ADR 0014](./docs/adr/0014-native-target-support.md), and
[ADR 0015](./docs/adr/0015-native-target-identifiers.md). Evidence that
changes one of those contracts updates the affected document in the same
change.


Goal
----

Oseo should give compilation, artifact production, and execution distinct
command-line contracts without duplicating the compiler pipeline behind them.
The common case stays short: `oseo app.ts` compiles and runs the entry, while
`oseo run app.ts` states the same operation explicitly. `oseo build app.ts`
produces an artifact without claiming that the current host can execute it.

The command tree should grow by adding typed command modules rather than by
adding another mode flag and another branch to one parser. Help, shell
completion, parse errors, and handler dispatch come from the same Optique
definitions. The definitions remain statically visible to npm packaging, JSR
publication, and the planned standalone CLI build.


Current boundary
----------------

The current parser accepts exactly one source path. With no output-mode flag,
the CLI compiles the source, links a native executable in a temporary
directory, runs it, forwards its output and status, and removes the directory.
`--dump-mir` and `--emit-c` replace execution with textual compiler output.
`--target` applies only to native execution and must name a target that the
current host can execute.

That grammar made the first native workflow easy to exercise, but its `mode`
field now joins three different products: MIR text, generated C, and an
executed temporary binary. A retained native artifact would add a fourth mode
with different target and lifetime rules. Subcommands make those differences
part of the user-visible grammar instead of leaving them as conditionals after
parsing.


Command model
-------------

The planned top-level forms are:

~~~~ text
oseo [RUN_OPTIONS] SOURCE
oseo run [RUN_OPTIONS] SOURCE
oseo build [BUILD_OPTIONS] SOURCE
oseo help [COMMAND...]
oseo completion SHELL
oseo --completion SHELL
oseo --help
oseo --version
~~~~

`oseo SOURCE` is a root-command shortcut for `oseo run SOURCE`, not a separate
workflow. Both forms use the same parser definition and handler. The explicit
`run` form is the canonical syntax in reference material because it remains
unambiguous as the command tree grows. Introductory examples may use the
shortcut where its shorter spelling helps.

Top-level command names are reserved in the shortcut position. Most source
entries include a *.js* or *.ts* extension or a directory component, so an
ordinary invocation such as `oseo build.ts` does not conflict with
`oseo build`. A caller with an extensionless source named `build` can use
either `oseo ./build` or `oseo run build`. The same rule applies to other
top-level and meta-command names.

The command program keeps `--help` and `--version` at the root. Help and shell
completion are public in both command and option form. The implementation
configures Optique with `help: "both"` and `completion: "both"` explicitly so
this contract does not depend on library defaults. Supported forms include
`oseo help build`, `oseo build --help`, `oseo completion bash`, and
`oseo --completion bash`.


Run command
-----------

`oseo run SOURCE` owns compile-and-execute behavior. It compiles the source or
closed module graph, creates a temporary native build, starts the resulting
program, forwards its standard output, standard error, and exit status, and
removes the temporary directory on both success and failure. The root shortcut
does exactly the same work.

When `--target` is absent, `run` selects the target for the normalized
execution host. An explicit target must still pass `canExecuteTarget()` before
compilation starts. A target that Oseo can build but the current host cannot
execute is rejected by `run`; the caller must use `build` for that target.

The existing `--module`, `--no-specialization`, `--target`, and
`--no-runtime-archive-reuse` behavior belongs to `run` where it affects this
workflow. `run` does not accept `--dump-mir` or `--emit-c`.


Build command
-------------

`oseo build SOURCE` owns retained and inspectable compiler output. Its normal
mode produces a native executable at a caller-visible destination and does not
start it. Before this mode lands, the plan or an architecture decision must
record the destination option, default file name, overwrite policy, executable
suffix, permission behavior, and atomic replacement rules. The current
temporary-execution workflow provides no safe defaults for those choices.

Native `build` accepts every supported target that the selected toolchain can
produce. It does not apply `canExecuteTarget()`, because cross-compilation is a
declared purpose of the command. In particular, `linux-aarch64-musl` remains a
valid compile-link and inspection target even on a host that cannot run the
result. Native executable mode also accepts `--no-runtime-archive-reuse` for a
deliberate uncached runtime build.

`--dump-mir` and `--emit-c` move under `build` and remain mutually exclusive.
They preserve their current textual behavior:

 -  `oseo build --dump-mir SOURCE` writes deterministic MIR to standard
    output without invoking the native toolchain.
 -  `oseo build --emit-c SOURCE` writes generated C11 to standard output
    without compiling or linking it.

These two modes are target-neutral. They reject `--target` and
`--no-runtime-archive-reuse` rather than accepting options that cannot affect
their result. The compiler-input options `--module` and
`--no-specialization` remain available because they can change the selected
source goal or emitted program.

The old direct forms `oseo --dump-mir SOURCE` and `oseo --emit-c SOURCE` are
not compatibility aliases. They become parse errors when the subcommand
grammar lands. Oseo has not published a release, so carrying two placements
would add ambiguity without preserving a released contract.


Command modules and discovery
-----------------------------

The first implementation unit upgrades the CLI to a stable Optique release
that includes `@optique/discover`, at least version 1.2.0. Direct Optique
dependencies move together so parser, runner, and discovery behavior come from
one compatible release line.

Each user command is a module whose default export is created with
`defineCommand()`. Its parser, help metadata, and thin handler stay together.
The initial source layout is:

~~~~ text
packages/cli/src/
  commands/
    index.ts
    build.ts
    run.ts
  commands.generated.ts
  index.ts
  main.ts
~~~~

*commands/index.ts* defines the root shortcut. *commands/run.ts* defines the
explicit command. They import their shared parser and handler from outside the
discovered directory so the two definitions cannot drift. Helper modules do
not live under *commands/*, where a matching filename would become an
unintended command.

Oseo does not scan *commands/* at application startup. Runtime discovery uses
dynamic imports that a bundler or single-file compiler cannot reliably see,
while [*PLAN-RELEASE.md*](./PLAN-RELEASE.md) requires a statically analyzable
CLI module graph. The `optique-discover` generator writes
*commands.generated.ts* with static imports and a `commandsFromModules()`
registry. *main.ts* passes that registry to `runProgram({ commands })`.

The generated registry is checked in because JSR publishes package source and
the standalone CLI build must see the same static graph. Repository generation
and check tasks keep it synchronized with *commands/*. A stale registry is a
check failure. Developers may use generator watch mode while adding, removing,
or renaming command modules, but the ordinary build never depends on a
long-running watcher.

Optique synthesizes the `help` and `completion` meta commands from the command
tree. They do not need command modules of their own. Their output and shell
scripts are derived from the same generated registry used for dispatch.


Application boundary
--------------------

Command discovery organizes the outer application; it does not move compiler
work into Optique handlers. The compiler, module graph, backend, runtime,
toolchain, and host interfaces keep their current dependency direction. A
command handler translates its parsed value into an Oseo workflow request and
renders the resulting owned diagnostics or process observation.

`run` and native `build` share source loading, goal selection, compilation,
backend emission, runtime-input preparation, toolchain planning, and cache
reuse. Their artifact lifecycle differs after a successful link. `run` starts
the temporary executable and removes it. `build` publishes the executable to
the destination fixed by its artifact contract and never starts it. This split
belongs at a workflow boundary, not inside the compiler core or backend.

The current package tests can supply source text, a diagnostic source ID, a
version, and a fake `CompilerHost`, then inspect a `CliResult` without mutating
global process streams. The migration preserves that capability even if the
public function names change before the first release. `runProgram()` receives
explicit arguments, output callbacks, and an exit callback in tests. Command
handlers call host-independent or host-injected workflow functions rather than
reading `process.argv` or constructing a concrete host themselves.

Help, version, completion, and parse errors remain Optique-owned output.
Compiler diagnostics and native process output remain Oseo-owned results. The
outer executable is the only layer that writes those results to the real
process streams and assigns `process.exitCode`.


Relationship to other plans
---------------------------

[*PLAN-RELEASE.md*](./PLAN-RELEASE.md) owns distribution channels, standalone
archives, and toolchain acquisition. This plan owns the command graph embedded
in each distribution. Every channel must expose the same commands and generated
help for one lockstep Oseo version.

[*PLAN-REPL.md*](./PLAN-REPL.md) owns persistent-session semantics,
incremental native units, code lifetime, terminal behavior, and its entry
criteria. This plan does not add a REPL command or move that deferred work into
the active queue. When the REPL implementation satisfies its own plan, it can
join this command graph without changing the `run` and `build` contracts.

[*PLAN-BACKEND.md*](./PLAN-BACKEND.md) owns project-wide code-generation
choices. The `build` command publishes output from the selected backend but
does not select a new backend or make backend behavior part of command parsing.

[*docs/cli.md*](./docs/cli.md) remains a guide to implemented behavior. It
changes only when the corresponding command, tests, and packaging checks land.


Compatibility and diagnostics
-----------------------------

The root shortcut preserves the current common invocation and native execution
semantics. The deliberate command-line changes are the new explicit `run` and
`build` commands, public help and completion commands, and the relocation of
the two compiler-output flags.

Unknown or duplicate options, missing source arguments, and extra positional
arguments fail before source loading. Optique owns their usage and suggestion
output. An extensionless shortcut argument that equals a registered command
name selects that command; the explicit `run` spelling and a path beginning
with `./` remain escape hatches for source files with those names.

The shortcut makes every other non-option token a valid source candidate. A
misspelled command such as `oseo buid` therefore reaches source loading and
reports an unreadable source instead of an unknown-command suggestion. This is
the deliberate cost of preserving `oseo SOURCE`. The common *.js* and *.ts*
paths remain visually distinct from command names, and the explicit `run`
form is available whenever intent needs to be stated.

Successful help, version, and completion requests exit with status `0`.
Command-line parse errors and Oseo diagnostics exit with status `1`. A program
started by `run` keeps its own exit status, standard output, and standard error.
`build` never observes a produced program's exit status because it does not
start the artifact.


Verification
------------

The command transition needs focused tests under both Node.js and Deno. The
suite proves at least these contracts:

 -  `oseo SOURCE` and `oseo run SOURCE` reach the same parser and workflow;
 -  registered command names win at the shortcut position, while `./NAME` and
    `run NAME` still address an extensionless source;
 -  `build` accepts supported cross-targets and `run` rejects targets the host
    cannot execute before compilation;
 -  `--dump-mir` and `--emit-c` work only under `build`, stay mutually
    exclusive, and do not start the toolchain;
 -  help and completion work in command and option form with command-specific
    output;
 -  parser failures do not read source files or start host processes;
 -  fake-host tests retain deterministic output, status, cleanup, and artifact
    observations without spawning the executable;
 -  the generated registry contains every command module exactly once and is
    unchanged after regeneration; and
 -  built npm ESM, published JSR source, and the standalone CLI smoke test use
    the same statically imported command graph.

`mise run check` and `mise run test` remain the ordinary gates. The standalone
archive smoke test joins the release gate when that pipeline exists; it must
run from a clean extraction without a repository command directory available
for discovery.


Delivery order
--------------

1.  Add this plan and its roadmap link without changing the implemented CLI.
2.  Freeze the retained-executable destination and replacement contract in
    this plan or an architecture decision.
3.  Add failing Node.js and Deno tests for the planned root, `run`, `build`,
    help, completion, output-mode, and target behaviors.
4.  Upgrade Optique, introduce the static generated registry, and move command
    parsing and dispatch into typed command modules while preserving the
    host-injected workflow boundary.
5.  Split temporary execution from retained artifact publication, move
    `--dump-mir` and `--emit-c` under `build`, and enforce the distinct target
    policies.
6.  Update *docs/cli.md*, package documentation, examples, generation checks,
    and clean-package smoke tests in the implementation change that makes the
    new syntax available.

Each checkpoint leaves the repository checks green. A partial checkpoint must
not document a planned command as usable or leave the generated command
registry stale.


Exit criteria
-------------

The initial command-line evolution is complete when the root shortcut,
explicit `run`, native `build`, MIR and C output modes, help, and completion
all satisfy the contracts above on both compiler hosts. `build` must retain a
native artifact under a recorded destination policy, support reviewed
cross-targets, and never execute its result. `run` must preserve temporary
cleanup and reject non-executable host-target pairs before compilation.

The same statically imported command registry must pass source tests, built
package tests, JSR dry publication, and the applicable standalone CLI smoke
test. Future command modules extend this living plan only when they change a
cross-command contract; feature-specific semantics remain in their owning plan
or decision record.
