ADR 0015: Native target identifiers
===================================

Status
------

Accepted. This record supersedes the target-name ordering in
[ADR 0014](./0014-native-target-support.md), but not its target support or
execution-host decisions.


Context
-------

ADR 0014 introduced target names by passing Zig target strings through the
compiler core. Those strings put the architecture first and encode Zig's own
target grammar. Keeping them as Oseo's public identifiers would make the
compiler contract depend on one replaceable toolchain.

Oseo users choose the destination operating system before its architecture in
CLI, CI, and diagnostic contexts. Native Linux targets also need an ABI name to
distinguish GNU libc from musl. Vendor fields such as `unknown`, `pc`, and
`apple` do not select an Oseo runtime contract.

The host boundary reports an operating system and architecture. An unavailable
or unrecognized report is detection state, not an additional operating system
or architecture.


Required contract
-----------------

Native target identifiers need to be stable across backend and toolchain
replacements. They must:

 -  use Oseo-owned canonical operating-system and architecture names;
 -  distinguish ABI environments only where the distinction affects the
    artifact contract;
 -  keep external compiler spellings inside their concrete adapters;
 -  keep object format, CPU features, deployment versions, sanitizers, and
    toolchain selection outside the identifier; and
 -  represent unknown host reports without admitting an unknown build target.


Alternatives considered
-----------------------

Reusing Zig strings would avoid one small mapping, but it would expose the
default toolchain through the compiler API. Reusing LLVM-style triples would
add vendor fields that Oseo does not use and would replace one external naming
dependency with another.

Putting the architecture first would follow compiler tradition. It was
rejected for Oseo's public ID because operating-system grouping is clearer in
CLI choices, CI matrices, logs, and retained observations.

Renaming `NativeOperatingSystem` to `Platform` was rejected. The field contains
only operating-system facts. `Platform` also names broader concepts such as the
Web Platform, a complete host configuration, or an execution environment.


Decision
--------

An Oseo native target ID uses this grammar:

~~~~ text
<operating-system>-<architecture>[-<abi>]
~~~~

The canonical architecture names are `x86_64` and `aarch64`. Host adapters may
accept spellings such as `amd64`, `x64`, and `arm64`, but they normalize those
aliases before target selection. Serialized target IDs never contain aliases.

The initial target IDs are:

| Oseo target ID       | Zig target string    | Use                        |
| -------------------- | -------------------- | -------------------------- |
| `linux-x86_64-gnu`   | `x86_64-linux-gnu`   | Execute and inspect        |
| `macos-aarch64`      | `aarch64-macos`      | Execute and inspect        |
| `linux-aarch64-musl` | `aarch64-linux-musl` | Compile, link, and inspect |

`NativeArchitecture` and `NativeOperatingSystem` contain only admitted target
facts. `ExecutionHostDescription` may add `unknown` to either reported field.
`TargetDescription` never admits an unknown fact and records the optional ABI
separately.

The compiler core returns Oseo target descriptions. The Zig adapter maps their
IDs to Zig strings when it creates commands. A future LLVM, system C compiler,
or native backend owns its own mapping and does not change the Oseo ID.

`macos-aarch64` omits an ABI suffix because Oseo supports one macOS ABI
contract. Linux includes `gnu` or `musl`. A new ABI adds a new target ID only
when it changes the artifact contract.

WASI, freestanding, GPU, and other non-native environments require a separate
decision. They must not turn `NativeOperatingSystem` into a generic `Platform`
bucket or treat `wasi` and `none` as operating systems.


Consequences
------------

Oseo metadata, test262 evidence, diagnostics, CLI choices, and artifact names
use OS-first IDs. Toolchain command observations still contain the external
target string passed to that toolchain, which makes the mapping inspectable.

Changing an Oseo target ID is a public compatibility change. Adding a concrete
toolchain does not change existing IDs. Host spelling aliases are accepted only
at the normalization boundary and are never retained as target evidence.


Revisit when
------------

Revisit the grammar before admitting a non-native environment or an ABI choice
that the optional final component cannot describe. Preserve existing IDs or
record an explicit migration rather than silently changing their meaning.
