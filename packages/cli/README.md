@oseo/cli
=========

This package is Oseo's composition root. It provides deterministic `--dump-mir`
and `--emit-c` modes and the asynchronous source-to-native execution workflow.
Specialization is enabled by default. `--no-specialization` selects the same
pipeline with the M1 generic graph and no guarded operations.
The default source frontends receive the exact ECMA-262 Unicode property
resolver from `@oseo/unicode` here. The Babel adapter and compiler core remain
independent of the concrete pinned tables.
Parser, profile, runtime, toolchain, and host failures remain owned diagnostics
or captured native observations. Temporary-directory, runtime-asset, generated
source, process-spawn, and cleanup failures are reported as `OSEO3001` without
exposing a host stack. Once created, the native temporary directory is removed
after both successful and failed workflows.
Runtime assets are copied sequentially so every started read or write settles
before temporary-directory cleanup begins.

Native execution reuses a host-cached runtime archive when the host and
toolchain expose that capability. A cache hit reads every reviewed runtime
asset for key calculation, copies only the headers needed by generated C, and
links without compiling the runtime translation units again. The
`--no-runtime-archive-reuse` option is the deliberate rebuild path for
investigating suspected staleness. Concurrent cold executions serialize one
archive build per key. Cache setup, lookup, lease, and publication failures are
optional optimization failures, so execution continues with a temporary
uncached build. Each execution captures one compiler environment snapshot and
uses it for the identity probe, key, and build requests. A failed or empty
identity observation is not retained. An unavailable snapshot, including under
Deno without `--allow-env`, disables reuse but preserves ordinary native
compilation.

The command line is defined with [Optique]. Its parser requires exactly one
source path, keeps `--dump-mir` and `--emit-c` mutually exclusive, and rejects
unknown or duplicate options before compilation. Optique also derives help,
usage, version, and parse-error output from the same command-line grammar.

The npm package installs the `oseo` executable. A source path without a dump
option compiles, links, and runs a script or a closed M4 `file:` module graph
through the pinned Zig toolchain, with guarded specialization when eligible.
Module entries may use only relative file specifiers. Programmatic callers may
override `sourceId` for script diagnostics without changing the positional path
used to read the source file.

Native execution selects `linux-x86_64-gnu` on Linux AMD64 and
`macos-aarch64` on macOS AArch64. `--target` makes that choice explicit and is
valid only for native execution. Unsupported or mismatched host-target pairs
fail before compilation rather than producing or starting an incompatible
artifact.
The option accepts stable OS-first Oseo target IDs. The Zig adapter maps them
to Zig's architecture-first strings when it creates compiler requests.

An entry with imports, exports, or top-level await enters the module-graph
workflow. Top-level await does not need an otherwise unused module declaration.
The produced executable drains runtime-owned promise jobs and timer tasks; it
does not embed the Node.js or Deno host used to compile it.

[Optique]: https://optique.dev/
