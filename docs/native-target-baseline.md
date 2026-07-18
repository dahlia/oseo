Native target baseline
======================

Status
------

This baseline records the target evidence immediately before implementation of
[*PLAN-MACOS.md*](../PLAN-MACOS.md). The baseline commit is
`35d90ba57cd503f82685509a0991de0449636f8c`.
Its target names preserve the Zig-shaped identifiers in that commit. ADR 0015
later introduced stable OS-first Oseo target IDs.


Linux on AMD64
--------------

The latest `main` workflow for the baseline commit completed successfully in
[GitHub Actions].
The Ubuntu native job recorded these task durations:

| Task                       | Duration | Evidence                                 |
| -------------------------- | -------- | ---------------------------------------- |
| `mise run test:native`     | 155 s    | Native execution and AArch64 cross-links |
| `mise run test:probes`     | 2 s      | ABI, parser, boundary, and value probes  |
| `mise run test:test262`    | 96 s     | Reviewed test262 manifest                |
| Complete `test-native` job | 264 s    | Setup and all native task steps          |

The native fixture corpus executed `x86_64-linux-gnu` and cross-linked
`aarch64-linux-musl`. The checked test262 manifest recorded 50 passes, 178
expected negatives, 150 unsupported profile features, and no semantic or
harness failures.

[GitHub Actions]: https://github.com/dahlia/oseo/actions/runs/29649255718


macOS on AArch64
----------------

The local baseline host was Darwin on AArch64 with an Apple M4 processor and
the pinned Zig 0.16.0 toolchain. `mise run check` passed in 1.86 seconds.
`mise run test` failed after 0.36 seconds when the ABI-root probe built an
`x86_64-linux-gnu` ELF executable and the shell attempted to start it. The
reported failure was `cannot execute binary file`.

Before the implementation, Node.js and Deno package tests ran on macOS, but
the native fixture, native property, test262, heap, promise, and architecture
probe execution paths did not provide macOS native semantic evidence.


Preserved comparison points
---------------------------

The implementation must preserve:

 -  the same reviewed runtime assets and private generated-code ABI;
 -  the Linux native fixture observations and AArch64 Linux cross-links;
 -  the reviewed property seeds, sizes, and case counts;
 -  one counted test262 result per upstream source path; and
 -  strict warnings, undefined-behavior checks, assembly inspection, forced
    collection, allocation failure, and retained native failure metadata.

Final target measurements belong in the accepted target decision and current
task documentation. This file remains the before-state comparison point.
