@oseo/toolchain-zig
===================

`@oseo/toolchain-zig` is the default native toolchain adapter for the
[Oseo CLI]. It plans `zig cc` and `zig ar` commands to compile Oseo's
generated C, archive the runtime, and link the executable. The adapter
returns a build plan; the host runs the commands and manages the runtime
archive cache.

You do not need to install this package separately to use the CLI. On the
first native build, the CLI downloads and verifies its pinned release of
Zig unless you pass an existing executable with `--zig`:

~~~~ sh
oseo build src/hello.ts --zig /path/to/zig
~~~~

The Oseo target IDs are `linux-x86_64-gnu` and `macos-aarch64` for native
execution, and `linux-aarch64-musl` for compilation, linking, and inspection
only. Use those IDs with `--target`, not Zig's target spellings.

Oseo's native build code uses `zigToolchainAt()` to plan builds for a
specified Zig executable. The adapter is an Oseo component, not a
standalone C build tool. See the [toolchain design notes] for target
mapping and archive reuse.

[Oseo CLI]: https://github.com/dahlia/oseo/blob/main/docs/cli.md
[toolchain design notes]: https://github.com/dahlia/oseo/blob/main/docs/development/package-toolchain-zig.md
