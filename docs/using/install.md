Installation
============

Build from a checkout
---------------------

To try the current source, clone the [Oseo repository] and run these commands
from its root with [mise] installed:

~~~~ sh
mise install
mise run build
mise exec -- node packages/cli/dist/main.js --help
~~~~

The checkout CLI runs on Node.js. The repository pins Node.js, pnpm, and Zig
through mise; `mise run build` synchronizes workspace dependencies before it
builds the packages. Native compilation uses `zig cc`. See the
[example](./examples.md#build-and-run-the-example) for a program you can
compile and run.

[Oseo repository]: https://github.com/dahlia/oseo
[mise]: https://mise.jdx.dev/


Planned release channels
------------------------

These routes describe the first release plan, not published artifacts.

 -  Standalone CLI: once release archives appear on [GitHub Releases], download
    the archive for your host. The planned 0.1.0 filenames are
    *oseo-0.1.0-linux-x86\_64-gnu.tar.bz2* and
    *oseo-0.1.0-macos-aarch64.tar.bz2*. Extract the archive with `tar -xjf`
    and run `./oseo --help` from the extraction directory. This CLI does not
    require a separate Node.js or Deno installation. Native builds still
    require Zig; the release plan includes verified Zig acquisition, local
    caching, and a way to override the toolchain.
 -  npm: once the package is published, `npm install -g @oseo/cli` installs
    `oseo` for Node.js 24 or later.
 -  JSR: the planned `@oseo/*` packages are source modules for a JavaScript
    host such as Deno, not standalone executables.

[GitHub Releases]: https://github.com/dahlia/oseo/releases
