@oseo/cli
=========

This package is Oseo's composition root. It provides deterministic `--dump-mir`
and `--emit-c` modes and the asynchronous source-to-native execution workflow.
Specialization is enabled by default. `--no-specialization` selects the same
pipeline with the M1 generic graph and no guarded operations.
Parser, profile, runtime, toolchain, and host failures remain owned diagnostics
or captured native observations. Temporary-directory, runtime-asset, generated
source, process-spawn, and cleanup failures are reported as `OSEO3001` without
exposing a host stack. Once created, the native temporary directory is removed
after both successful and failed workflows.
Runtime assets are copied sequentially so every started read or write settles
before temporary-directory cleanup begins.

The command line is defined with [Optique]. Its parser requires exactly one
source path, keeps `--dump-mir` and `--emit-c` mutually exclusive, and rejects
unknown or duplicate options before compilation. Optique also derives help,
usage, version, and parse-error output from the same command-line grammar.

The npm package installs the `oseo` executable. A source path without a dump
option compiles, links, and runs the M1 program through the pinned Zig
toolchain, with M2 specialization when eligible. Programmatic callers may
override `sourceId` for diagnostics without changing the positional path used
to read the source file.

[Optique]: https://optique.dev/
