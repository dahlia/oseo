Installation
============

<!-- OSEO_STABLE_QUICKSTART -->


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
