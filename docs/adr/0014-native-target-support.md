ADR 0014: Native target and execution-host support
==================================================

Status
------

Accepted. This record supersedes the execution-target limitations in
[ADR 0001](./0001-initial-platform-and-tools.md), the single-target build
description in [ADR 0003](./0003-c11-runtime-and-zig-boundary.md), and the
AArch64 deferral in [ADR 0004](./0004-generic-tagged-value.md).
The target-name ordering in this record is superseded by
[ADR 0015](./0015-native-target-identifiers.md).


Context
-------

Oseo initially described `x86_64-linux-gnu` as executable and
`aarch64-linux-musl` as compile-link-only. The target description stored that
decision as an `execute` Boolean even though execution depends on both the
artifact and the current host. As a result, the aggregate test task on macOS
AArch64 built a Linux ELF executable and attempted to start it.

Adding a second execution environment also affects value-layout evidence,
sanitizer policy, command-line selection, native properties, architecture
probes, and the test262 manifest. The change must not introduce target choices
inside JavaScript semantics or double compatibility counts.


Required contract
-----------------

Later target, runtime, and compatibility work needs:

 -  immutable artifact facts separated from execution-host capabilities;
 -  explicit targets in every Zig compile and link request;
 -  deterministic host-native selection and rejection of unsupported pairs;
 -  a validated AArch64 value and pointer representation;
 -  sanitizer and cross-link policies named per target;
 -  target-aware property replay and failure metadata; and
 -  one semantic test262 classification with target parity evidence.


Alternatives considered
-----------------------

 -  Keeping `TargetDescription.execute` was rejected because executability is
    not an artifact property. The same Mach-O artifact is executable on one
    host and not on another.
 -  Letting Zig inherit its default target was rejected because ambient SDK,
    architecture, and ABI choices would make builds irreproducible.
 -  Adding a macOS-specific value layout was deferred. The existing opaque
    `OseoValue` boundary permits one later, but current checked evidence
    supports the shared layout.
 -  Recording one complete test262 row per target was rejected because it would
    double the counted cases and permit conflicting classifications.
 -  Treating a cross-link as an execution pass was rejected because it cannot
    observe JavaScript behavior, collection, or sanitizer failures.


Probe evidence
--------------

The before-state is recorded in
[*native-target-baseline.md*](../native-target-baseline.md). The implementation
used Zig 0.16.0 and ran the native, native-property, test262, and extended
property suites. The acceptance run also included the M0 architecture probes,
which were later retired after direct tests subsumed their contracts.

~~~~ sh
mise run test:native
mise run test:property:native
mise run test:test262
mise run test:property:extended
~~~~

On an Apple M4 host, the ABI-root, native-boundary, NaN-box, and low-tag probes
executed as `macos-aarch64` with address and undefined-behavior sanitizers. The
probes also inspected named `linux-x86_64-gnu`, `macos-aarch64`, and
`linux-aarch64-musl` assembly. The boundary probe retained the AArch64 Linux
compile-link.

The heap and promise fixtures, complete differential fixture corpus, forced
collection paths, allocation and root-budget failures, specialization hits and
misses, asynchronous continuations, timers, module graphs, and shutdown paths
execute successfully as Mach-O programs. The reviewed test262 subset records
the same 50 passes, 178 expected negatives, and 150 unsupported cases as the
canonical Linux manifest.

Every runtime heap allocation passes through `publish_heap`. That boundary
converts the pointer to `uintptr_t`, rejects zero or any address above the low
48-bit payload, and frees the unpublished object before returning `OSEO3001`.
The AArch64 runs exercise every admitted heap kind under forced collection and
sanitizers without reaching that failure.


Final gate evidence
-------------------

[GitHub Actions run 29653610576] verified commit `c4b0fac` from clean Ubuntu
and macOS checkouts. Both native jobs ran `mise run check`, `mise run test`,
and `mise run test:property:extended` successfully. The step timestamps and
complete job durations were:

| Native job                 | Check | Aggregate test | Extended properties | Job total |
| -------------------------- | ----: | -------------: | ------------------: | --------: |
| Ubuntu, `linux-x86_64-gnu` |  16 s |     4 min 37 s |          3 min 49 s | 9 min 9 s |
| macOS, `macos-aarch64`     |  21 s |      3 min 2 s |           3 min 4 s | 7 min 9 s |

The job totals include checkout, tool installation, and cleanup. The measured
times leave more than 35 minutes of headroom under the 45-minute native-job
limit.

[GitHub Actions run 29653610576]: https://github.com/dahlia/oseo/actions/runs/29653610576


Observed results
----------------

Ordinary macOS allocator addresses observed by the checked runtime and probe
executions fit below `0x0001000000000000`. Address and undefined-behavior
sanitizers preserve that property for the checked heap kinds. Converting each
published data pointer through `uintptr_t` and back retains identity.

No authenticated code pointer enters an `OseoValue`; the payload stores only
allocator-provided data pointers. The runtime does not strip a top byte or
pointer metadata. A pointer carrying bits outside the admitted payload fails
at `publish_heap` before it enters the allocation list or a generic heap slot.

Mach-O uses leading underscores for external assembly symbols. Structural
checks accept that object-format spelling while retaining the same semantic
requirements for generic fallback calls and inlined small-integer helpers.


Decision
--------

### Target and host model

Support these target descriptions:

| Target               | Artifact facts              | Sanitizers            |
| -------------------- | --------------------------- | --------------------- |
| `linux-x86_64-gnu`   | AMD64, Linux, ELF, C11      | Address and undefined |
| `macos-aarch64`      | AArch64, macOS, Mach-O, C11 | Address and undefined |
| `linux-aarch64-musl` | AArch64, Linux, ELF, C11    | Compile-link only     |

Node.js and Deno host adapters normalize the operating system and architecture
without choosing a target. The outer CLI and test composition layers select
`linux-x86_64-gnu` for Linux on AMD64 and `macos-aarch64` for macOS on AArch64.
Unknown hosts and mismatched target-host pairs fail before a temporary build
directory or toolchain process is created.

The native fixture API names its requested operation as `compile` or `execute`.
The target contains no universal executability flag. Cross-target compilation
continues to use explicit test and compile-only paths.

### Command-line behavior

Native execution accepts `--target` for an explicit supported override. The
selected target must match the normalized execution host. `--dump-mir` and
`--emit-c` remain target-neutral and reject `--target` rather than silently
changing or ignoring semantic compiler output. Oseo does not add a public
compile-only CLI mode in this decision.

Diagnostics name the target and exit status when a toolchain request fails.
Artifact, archive, and object names derive from the complete target identifier.

### Value layout

Accept the ADR 0004 NaN-boxed layout for `macos-aarch64` with the existing
checked 48-bit heap payload. This acceptance applies to ordinary C data
pointers produced by the checked allocator and sanitizer configurations. It
does not permit stripping pointer authentication, top-byte metadata, or wider
addresses.

The runtime boundary check remains authoritative in release builds. A future
host whose allocator can return a pointer outside the payload receives an
owned failure and requires a new representation decision before support.

### Standards evidence

Keep *tests/test262/results.yaml* as the canonical compatibility manifest with
one row per upstream path and `linux-x86_64-gnu` as its canonical target ID.
Keep *tests/test262/target-parity.yaml* as the separate target-parity
record. It pins the canonical manifest digest, suite revision, and supported
execution targets.

Each primary host executes the same reviewed subset, strictness modes,
specialization policies, harness includes, module graphs, scheduler mode, and
observations. The runner normalizes only the target ID before comparing
the complete generated manifest with the canonical bytes. Any other difference
fails the gate. This preserves one compatibility count while proving target
agreement.


Consequences
------------

Linux on AMD64 and macOS on AArch64 run the same native semantic corpus.
`linux-aarch64-musl` remains portability evidence and cannot satisfy an
execution requirement. Property failures and native fixture metadata record
the normalized host, target, and sanitizer modes.

The native continuous-integration job is a Linux and macOS matrix. Node.js and
Deno operating-system jobs remain bootstrap-host evidence. The runtime
componentization recorded in
[*runtime-components.md*](../runtime-components.md) preserved all three
build targets and both execution environments.


Failure modes and replacement triggers
--------------------------------------

Reopen this decision if:

 -  a supported allocator or sanitizer returns a pointer outside 48 bits;
 -  pointer authentication or top-byte metadata must enter a generic heap slot;
 -  a stable sanitizer mode becomes unavailable on one primary target;
 -  Linux and macOS observations disagree for one reviewed fixture or property;
 -  a new target requires compiler semantics to branch on its value layout; or
 -  the canonical-plus-parity test262 record cannot reproduce a target-specific
    disagreement.


Links
-----

 -  [*DESIGN.md*](../../DESIGN.md) defines the target-neutral compiler and
    runtime boundaries.
 -  [ADR 0015](./0015-native-target-identifiers.md) defines stable Oseo target
    IDs and their toolchain mapping boundary.
 -  [ADR 0013](./0013-m5-edition-and-manifest.md) defines the compatibility
    counting and manifest contracts retained here.
