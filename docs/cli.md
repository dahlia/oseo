Oseo command-line guide
=======================

Status
------

This guide describes the command line implemented by the current Oseo
checkout. Oseo accepts the frozen M3 and M4 source-language profiles and
enables the implemented specializations when a function is eligible.
Language features planned for later milestones are not available through
this command line.


Run the CLI from a checkout
---------------------------

Oseo uses mise to install its development tools and pnpm to synchronize the
workspace. Build the packages before invoking the executable from a repository
checkout:

~~~~ sh
mise install
mise deps
mise run build
node packages/cli/dist/main.js --help
~~~~

The `@oseo/cli` package installs an executable named `oseo`. The
remaining examples use that shorter name. In a development checkout, replace
`oseo` with `node packages/cli/dist/main.js`.

The executable requires Node.js 24 or later. Native execution also requires
Zig's C toolchain. `mise install` supplies the pinned Zig version used by the
repository.


Command syntax
--------------

~~~~ text
oseo [RUN_OPTIONS] SOURCE
oseo run [RUN_OPTIONS] SOURCE
oseo build [BUILD_OPTIONS] SOURCE
oseo --help
oseo --version
~~~~

`SOURCE` is the path of one JavaScript or TypeScript script or module entry.
Oseo reads the file from that path; standard input and `-` are not supported.
Options may appear before or after the source path. `run` compiles and
executes a temporary program; the root shortcut uses the same workflow.
`build` retains an executable without starting it.

Command names are reserved in the shortcut form before `--`, even after a
run option. Use `./build`, `run build`, or `-- build` for a source named
*build*. For example, `oseo --module -- build` treats *build* as the module
source.

| Option                       | Behavior                                     |
| ---------------------------- | -------------------------------------------- |
| `--dump-mir`                 | Print Oseo's textual MIR without compiling C |
| `--emit-c`                   | Print the generated C11 translation unit     |
| `-o PATH`, `--output PATH`   | Retain a native executable at PATH           |
| `--build-config CONFIG`      | Select checked or optimized native output    |
| `--module`                   | Compile the source as an ECMAScript module   |
| `--script SCRIPT`            | Evaluate a Script before the module entry    |
| `--no-specialization`        | Compile only the generic native path         |
| `--no-runtime-archive-reuse` | Rebuild the C runtime archive for this run   |
| `--target TARGET`            | Select an explicit native target             |
| `--help`                     | Print help generated from the CLI grammar    |
| `--version`                  | Print the lockstep Oseo package version      |

`--dump-mir` and `--emit-c` belong only to `build` and are mutually
exclusive. Their old root placements are parse errors. Text modes reject
`--output`, `--target`, `--build-config`, and `--no-runtime-archive-reuse`.

`--build-config checked|optimized` selects the native configuration. `run`
defaults to `checked`; `build` defaults to `optimized`. Unknown options,
duplicate options, a missing source path, and extra positional arguments are
rejected before Oseo reads or compiles the source file.

The `checked` configuration keeps the target's sanitizer requests.
`--build-config optimized` compiles generated C and the runtime with `-O2` and
disables sanitizers. Both configurations disable floating-point contraction and
preserve JavaScript behavior. The MIR and C text modes reject `--build-config`
because their output is configuration-neutral. Runtime archives and harness
objects have separate cache identities for each configuration.
[ADR 0036](./adr/0036-optimized-native-build-configuration.md) defines the
compiler options and verification gates.


Retain a native executable
--------------------------

~~~~ sh
oseo build src/hello.ts
oseo build src/hello.ts -o artifacts/hello
oseo build src/hello.ts --target linux-aarch64-musl
~~~~

The default destination is *./hello* in the caller's working directory.
An explicit target appends its ID, as in *./hello-linux-aarch64-musl*.
`--output PATH` (or `-o PATH`) selects another destination. Its parent must
already exist. Successful builds print nothing and never start the artifact.

An existing destination must be a regular ELF or Mach-O file. Directories,
symlinks, other files, and any source in the build graph are refused with
`OSEO3001`. There is no force option. The destination is inspected before
native compilation and again at publication; an intervening replacement is
refused by device and inode.

Publication copies unchanged linker bytes and permissions into a sibling
file, then links or renames it into place. Failures before publication leave
the previous destination unchanged and remove the sibling file; cleanup
failures are reported after the original failure. Filesystems without hard
links use the fallback and race boundary recorded in
[ADR 0037](./adr/0037-retained-native-executables.md). Publication is atomic
for readers but does not promise crash durability.


Compile and run a script
------------------------

Save this program as *add.ts*:

~~~~ ts
function add(left: number, right: number) {
  return left + right;
}

console.log(add(20, 22));
~~~~

Run it with no output-mode option:

~~~~ sh
oseo add.ts
~~~~

The command compiles the script and the Oseo C runtime in a temporary
directory, links a native executable, and runs it. The example prints:

~~~~ text
42
~~~~

Oseo forwards the native program's standard output, standard error, and exit
status. It removes the temporary directory whether the run succeeds or fails.

Native execution reuses a host-cached C runtime archive when the host and
toolchain support that optimization. Use `--no-runtime-archive-reuse` to
rebuild the archive deliberately, such as when investigating a suspected
stale cache:

~~~~ sh
oseo --no-runtime-archive-reuse add.ts
~~~~

The option applies only to native execution. `--dump-mir` and `--emit-c`
reject it because neither mode starts the native toolchain.

Native execution selects `linux-x86_64-gnu` on Linux AMD64 and
`macos-aarch64` on macOS AArch64. The default checked configuration requests
address and undefined-behavior sanitization. `linux-aarch64-musl` remains a
compile-link and inspection target accepted by `build`, not an execution target
on either primary host.

These names are stable Oseo target IDs in operating-system, architecture, and
optional ABI order. They are not Zig target strings. Every Zig request names
the target explicitly. The Zig adapter maps them to its architecture-first
spelling when it creates a compiler request.

Use `--target` to state the execution target explicitly:

~~~~ sh
oseo --target macos-aarch64 add.ts
~~~~

The target must match the normalized execution host. Unknown hosts and
mismatched pairs fail with `OSEO3001` before the toolchain starts. `--dump-mir`
and `--emit-c` are target-neutral and reject `--target` rather than changing or
silently ignoring it.


Inspect MIR
-----------

Use `--dump-mir` to inspect the Oseo-owned middle-level intermediate
representation:

~~~~ sh
oseo build --dump-mir add.ts
~~~~

The output records the specialization policy, basic blocks, values,
safepoints, and control-flow successors. For the eligible function in the
example, enabled mode includes `guard-smi`, `add-smi-checked`, a generic
addition block, and a join block.

MIR output is deterministic for the same source and compiler version. It is a
debugging and testing format, not a stable interchange format between Oseo
versions.


Emit C11
--------

Use `--emit-c` to print the generated C translation unit:

~~~~ sh
oseo build --emit-c add.ts
~~~~

Redirect the output when a separate file is more convenient:

~~~~ sh
oseo build --emit-c add.ts > generated.c
~~~~

The generated unit calls private functions supplied by Oseo's C runtime. It is
not a standalone C program and is primarily intended for backend inspection,
tests, and toolchain debugging.


Disable specialization
----------------------

Specialization is enabled by default. The current specialized path applies
only to a narrow two-parameter addition function whose parameters both have
compatible `number` hints. Every assumption is checked at run time, and a
failed guard enters the compiled generic addition block.

Use `--no-specialization` to select the generic graph explicitly:

~~~~ sh
oseo --no-specialization add.ts
oseo build --no-specialization --dump-mir add.ts
oseo build --no-specialization --emit-c add.ts
~~~~

The option may change MIR, generated C, and native code shape. It must not
change source acceptance, output, errors, side-effect order, or other
JavaScript-visible behavior. The detailed optimization contract is recorded in
[*specialization-m2.md*](./specialization-m2.md).


Module entries
--------------

The CLI compiles one script or one closed module graph. A source is treated
as a module when its path ends in *.mjs* or *.mts*, when it contains module
declarations, or when `--module` is passed. Use `--module` when a *.js*
module entry has no import or export declaration, such as a module whose
only module-specific syntax is top-level `await`; goal-symbol sniffing
cannot distinguish every such source from a script.

Relative `./` and `../` imports resolve against the entry's canonical
`file:` URL. Bare specifiers and *package.json* resolution remain
unsupported.

`import()` with one string literal argument resolves during the build, in a
module and in a script entry alike; a script resolves it against its own
path. Each target and its closure join the executable and evaluate on their
first request. A target that cannot be resolved, loaded, parsed, or linked
fails the build. Every other `import()` form is rejected.

`--script SCRIPT` evaluates one Script in the same realm before the module
graph links, as a test harness runs before a module test. Its `var`,
function, and lexical declarations form the global environment of every
module in the graph, including imported ones; a module's own declarations
and imports hide them. The option applies only to a module entry, and a
script entry is rejected with a diagnostic.


Source-language limits
----------------------

Oseo compiles the language profiles frozen through M4: primitives, objects,
arrays, closures, exceptions, closed module graphs, promises, restricted
asynchronous functions, top-level `await`, and timers. The living M5 profile
grows this surface checkpoint by checkpoint.
TypeScript annotations and JSDoc types are optimization hints. Oseo does not
run the TypeScript type checker.

Web APIs, Node.js APIs, and package resolution are not part of the current
source profile. See [*language-profile-m3.md*](./language-profile-m3.md) and
[*language-profile-m4.md*](./language-profile-m4.md) for the exact accepted
syntax and semantics, and
[*language-profile-m5.md*](./language-profile-m5.md) for the boundary the
current milestone measures against. [*ROADMAP.md*](../ROADMAP.md) describes
intended later milestones without presenting them as current CLI features.


Output and diagnostics
----------------------

Successful `--dump-mir` and `--emit-c` commands write their result to standard
output and exit with status `0`. `--help` and `--version` also use standard
output and status `0`. Command-line parse errors and Oseo diagnostics use
standard error and status `1`.

The default execution mode returns the native program's exit status. Its
ordinary output is not mixed with Oseo diagnostics.

Source and host diagnostics begin with this form:

~~~~ text
<sourceId>:<line>:<column>: error[<code>]: <message>
~~~~

The current diagnostic classes are:

| Code       | Meaning                                              |
| ---------- | ---------------------------------------------------- |
| `OSEO0001` | The bootstrap parser could not parse the source      |
| `OSEO1001` | Valid syntax is outside the current language profile |
| `OSEO2001` | Execution crossed a defined runtime boundary         |
| `OSEO3001` | The host could not provide a required capability     |

An unreadable source file, a toolchain process that cannot start, or a failed
native host workflow produces `OSEO3001`. Oseo reports an owned diagnostic
instead of exposing a parser exception, host stack trace, or native toolchain
stack.


Troubleshooting
---------------

If the command reports that the source file could not be read, check the path
and file permissions. The CLI resolves the path in the calling process's
current working directory.

If the native toolchain could not be started, run `mise install` in a
repository checkout and confirm that `zig version` succeeds in the same shell.
The `--dump-mir` and `--emit-c` modes can still isolate frontend or backend
problems because they do not start the toolchain.

If Oseo reports `OSEO1001`, compare the source form with
[*language-profile-m3.md*](./language-profile-m3.md) and
[*language-profile-m4.md*](./language-profile-m4.md), and check the known-gap
list in [*language-profile-m5.md*](./language-profile-m5.md). A `.ts`
filename does not imply that Oseo accepts the full TypeScript language or
performs type checking.

Run `oseo --help` when scripting the command. Its usage and option descriptions
come from the same grammar that parses each invocation.
