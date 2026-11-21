`@oseo/cli`
===========

`@oseo/cli` provides `oseo`, the command for compiling JavaScript and
TypeScript ahead of time to native executables. Oseo compiles a
[supported subset] of the languages. It uses type annotations as optimization
hints, not as type checks.

[supported subset]: https://github.com/dahlia/oseo/blob/main/docs/using/features.md


Install and run
---------------

The npm package requires Node.js 24 or later:

~~~~ sh
npm install --global @oseo/cli
oseo --help
~~~~

Save `console.log(6 * 7);` in *answer.js*, then run:

~~~~ sh
oseo run answer.js
~~~~

This compiles and runs a temporary executable, prints `42`, and removes the
temporary files. Use `oseo build answer.js -o answer` to keep the executable
without running it. The resulting executable does not need Node.js or Deno.

Native execution is supported on Linux AMD64 and macOS AArch64. On first
native compilation, Oseo downloads and verifies its pinned Zig toolchain unless
you supply an existing executable with `--zig PATH`. The download requires
`tar` with XZ support. `oseo build answer.js --dump-mir` and
`oseo build answer.js --emit-c` print intermediate code and C11 respectively,
without downloading or running Zig.


Use the API
-----------

To import the API in a Node.js project, install the dependency locally with
`npm install @oseo/cli`. With Deno 2.9 or later, use
`deno add jsr:@oseo/cli`. Both routes expose the API at `@oseo/cli`.
The npm package also provides the `oseo` command.

`parseCliRequest()` parses the same arguments as the executable without reading
source files or starting processes. It returns a typed invocation or a result
containing help, version, or error output. Pass an invocation to
`executeCliInvocation()` to run it. That function uses the pinned Zig
toolchain for native compilation unless you supply a toolchain.

See the [command-line guide] for module entry points, target selection,
program arguments, and build options. See the [CLI implementation notes] for
the command registry and host workflow.

[command-line guide]: https://github.com/dahlia/oseo/blob/main/docs/using/cli.md
[CLI implementation notes]: https://github.com/dahlia/oseo/blob/main/docs/development/package-cli.md
