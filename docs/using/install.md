Installation
============

Install the CLI
---------------

The CLI supports Linux x86\_64 (GNU) and macOS on Apple Silicon. Install it
with one of the following commands or download a standalone archive from
[GitHub Releases].

::: code-group

~~~~ sh [mise]
mise use -g github:dahlia/oseo
~~~~

~~~~ sh [npm]
npm install -g @oseo/cli
~~~~

~~~~ sh [pnpm]
pnpm add -g @oseo/cli
~~~~

:::

With [mise] activated in your shell, the first command installs the
standalone CLI from GitHub Releases. It includes Node.js, so you do not
need a separate Node.js installation. The npm and pnpm commands install
the npm package, which requires Node.js 24 or later. If pnpm cannot find
its global bin directory, run `pnpm setup` and open a new shell before
installing.

If mise does not yet select a new release because of its minimum release
age setting, specify the version explicitly, for example
`mise use -g github:dahlia/oseo@0.1.0`.

Check your installation:

~~~~ sh
oseo --version
~~~~

On the first native build, the CLI downloads and verifies a pinned Zig
toolchain. Automatic setup needs network access and `tar` with XZ support.
Later builds can reuse the verified toolchain offline. To use an existing
Zig installation, pass `--zig PATH` to `oseo build` or `oseo run`.
Follow the [first example](./examples.md#build-and-run-the-example) to
compile a program.

For use as a library, install the [JSR packages] in Deno 2.9 or later.
For example, `deno add jsr:@oseo/cli` adds the CLI's JavaScript API to a
Deno project.

<!-- OSEO_STABLE_QUICKSTART -->

[GitHub Releases]: https://github.com/dahlia/oseo/releases
[mise]: https://mise.jdx.dev/
[JSR packages]: https://jsr.io/@oseo


Build from a checkout
---------------------

To try the current source, clone the [Oseo repository] and run these commands
from its root with [mise] installed:

~~~~ sh
mise install
mise run build
mise run oseo --help
~~~~

Building from a checkout does not install `oseo` globally. When following
examples on this site, run them from the repository root and replace
`oseo` with `mise run oseo` or its shorthand `mise oseo`. For example,
use `mise oseo build hello.ts -o hello` instead of
`oseo build hello.ts -o hello`. To pass arguments to a program with
`oseo run`, see the [checkout example in the CLI reference].

The checkout CLI runs on Node.js. The repository pins Node.js, pnpm, and Zig
through mise; `mise run build` synchronizes workspace dependencies before it
builds the packages. Native compilation uses `zig cc`. See the
[example](./examples.md#build-and-run-the-example) for a program you can
compile and run.

[Oseo repository]: https://github.com/dahlia/oseo
[checkout example in the CLI reference]: ./cli.md#command-syntax
