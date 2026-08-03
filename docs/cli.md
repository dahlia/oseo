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

Oseo uses mise to install its development tools and aube to synchronize the
workspace. Build the packages before invoking the executable from a repository
checkout:

~~~~ sh
mise install
mise deps
mise run build
node packages/cli/dist/main.js --help
~~~~

The packaged `@oseo/cli` command installs an executable named `oseo`. The
remaining examples use that shorter name. In a development checkout, replace
`oseo` with `node packages/cli/dist/main.js`.

The executable requires Node.js 24 or later. Native execution also requires
Zig's C toolchain. `mise install` supplies the pinned Zig version used by the
repository.


Command syntax
--------------

~~~~ text
oseo [--module] [--no-specialization] [--target TARGET]
  [--no-runtime-archive-reuse] SOURCE
oseo [--dump-mir | --emit-c] [--module] [--no-specialization] SOURCE
oseo --help
oseo --version
~~~~

`SOURCE` is the path of one JavaScript or TypeScript script or module entry.
Oseo reads the file from that path; standard input and `-` are not supported.
Options may appear before or after the source path.

| Option                       | Behavior                                     |
| ---------------------------- | -------------------------------------------- |
| `--dump-mir`                 | Print Oseo's textual MIR without compiling C |
| `--emit-c`                   | Print the generated C11 translation unit     |
| `--module`                   | Compile the source as an ECMAScript module   |
| `--no-specialization`        | Compile only the generic native path         |
| `--no-runtime-archive-reuse` | Rebuild the C runtime archive for this run   |
| `--target TARGET`            | Select an explicit native execution target   |
| `--help`                     | Print help generated from the CLI grammar    |
| `--version`                  | Print the lockstep Oseo package version      |

`--dump-mir` and `--emit-c` are mutually exclusive. Unknown options,
duplicate options, a missing source path, and extra positional arguments are
rejected before Oseo reads or compiles the source file.


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
status. It removes the temporary directory after both successful and failed
workflows.

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
`macos-aarch64` on macOS AArch64. Both targets use address and
undefined-behavior sanitization. Every Zig request names the target explicitly.
`linux-aarch64-musl` remains a compile-link and inspection target in repository
tasks; the CLI does not pretend that it can execute on either primary host.

These names are stable Oseo target IDs in operating-system, architecture, and
optional ABI order. They are not Zig target strings. The Zig adapter maps them
to its architecture-first spelling when it creates a compiler request.

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
oseo --dump-mir add.ts
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
oseo --emit-c add.ts
~~~~

Redirect the output when a separate file is more convenient:

~~~~ sh
oseo --emit-c add.ts > generated.c
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
oseo --no-specialization --dump-mir add.ts
oseo --no-specialization --emit-c add.ts
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
`file:` URL. Bare specifiers, *package.json* resolution, and dynamic import
remain unsupported.


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
