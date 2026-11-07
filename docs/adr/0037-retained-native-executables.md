ADR 0037: Retained native executable destination and replacement
================================================================

Status
------

Accepted on 2026-11-08 as delivery step 2 of
[*PLAN-CLI.md*](../../PLAN-CLI.md), which requires this contract before
`oseo build` lands. Until `oseo build` lands, the CLI only executes programs
from a temporary directory, as [*docs/cli.md*](../cli.md) describes.


Context
-------

*PLAN-CLI.md* says that `oseo build SOURCE` produces a native executable at a
caller-visible destination and does not start it. It requires a recorded
destination option, default file name, overwrite policy, executable suffix,
permission behavior, and atomic replacement rule first, because the current
workflow provides no safe default for any of them.

Today the CLI creates a private temporary directory, builds into it, runs the
executable, and removes the directory. The Zig adapter's build plan names the
executable *fixture-<target>* inside the working directory it is given, and
the final `zig cc ... -o` writes that path directly. No step copies or
renames the executable afterwards.

The public `CompilerHost` in *packages/compiler/src/native.ts* offers
temporary directories, text reads and writes, removal, and subprocesses. It
has no rename, copy, or mode operation. The runtime archive cache already
publishes files by writing a sibling temporary file and renaming it into
place, in both the Node.js and Deno adapters in *packages/host/src/index.ts*.


Required contract
-----------------

`oseo build` needs:

 -  a destination the caller can name, and a predictable default;
 -  no partial or truncated file at the destination after any failure;
 -  no replacement of an existing destination unless it is a regular file with
    an ELF or Mach-O magic number, and never of the source file or a module
    in the build graph;
 -  executable permission without Oseo inventing a mode policy;
 -  the same behavior under Node.js and Deno; and
 -  cross-target output, which `run` cannot produce, without executing it.


Alternatives considered
-----------------------

 -  Requiring `--output` on every build, as `bun build --compile` does with
    `--outfile`, was rejected. `go build` and `deno compile` derive a name from
    the entry point, and the common case of building one program for the
    current host should not need an option.
 -  Writing the executable next to the source file was rejected. Sources are
    often in a checked-out tree, and a build should not create files outside
    the directory the caller is working in unless asked.
 -  Overwriting any existing regular file was rejected. A mistyped
    `--output src/main.ts` would destroy a source file. Go refuses to replace
    a file that is not an object file for the same reason.
 -  Linking directly at the destination was rejected. A failed link can leave
    a truncated file, and on macOS rewriting a signed executable in place can
    make the kernel refuse to run the new contents. A rename gives the
    destination a new file.
 -  Creating missing parent directories was rejected. A mistyped directory
    would be created silently, and no other Oseo command creates
    directories outside its caches.


Probe evidence
--------------

This record follows from reading *PLAN-CLI.md*, *packages/cli/src/index.ts*,
*packages/toolchain-zig/src/index.ts*, and the host adapters at the
2026-11-08 *main*. The implementation must add tests, under both Node.js and
Deno, for every rule in the decision, and a macOS AArch64 test that executes
a published executable after replacing an earlier one.


Observed results
----------------

None yet. Whether Zig's Mach-O linker signs `macos-aarch64` executables
ad hoc, and whether a copied executable keeps a valid signature, has not been
checked in this repository. The publication rule below copies bytes without
modification, so it does not depend on the answer, but the macOS test above
verifies it.


Decision
--------

### Command form

~~~~ sh
oseo build SOURCE [--output PATH] [--target TARGET] [--build-config CONFIG]
~~~~

`-o` is the short form of `--output`. `--output` applies only to native
output and is rejected with `--dump-mir` and `--emit-c`, which keep writing
to standard output. `--build-config` is defined by
[ADR 0036](./0036-optimized-native-build-configuration.md).

### Destination

`PATH` is resolved against the current working directory. Without
`--output`, the destination is the source file's name without its last
extension, in the current working directory: `oseo build src/hello.ts` writes
*./hello*. When `--target` is given, the default name appends `-` and the
target ID, as in *./hello-linux-aarch64-musl*, so builds for several targets
do not replace each other. No current target uses a file extension, so no
suffix is added; a future Windows target adds *.exe* in the record that
admits it.

The destination's parent directory must exist and be a directory. The build
fails before compilation if it does not.

### What may be replaced

When the destination already exists, the build checks it before
compilation, using `lstat` semantics so that a symbolic link is examined
rather than followed:

 -  a regular file whose first bytes are an ELF or Mach-O magic number is
    replaced;
 -  any other regular file, a directory, a symbolic link, or another file
    type is refused; and
 -  a destination whose real path equals the source file or any module in the
    build graph is refused, whatever its contents.

Every refusal is an `OSEO3001` diagnostic that names the destination and the
reason, with exit status 1. No option overrides it; the caller removes the
file or picks another path.

### Publication

The toolchain links into the private temporary directory as `run` does. The
CLI then copies the executable to a new file in the destination's directory,
named *.<destination name>.oseo-<random>.tmp*, and gives it the linked file's
permission bits.

Compilation can take minutes, so the check above is repeated at
publication:

 -  If the destination did not exist before compilation, the temporary file
    is hard-linked to the destination name, which fails if any file has
    appeared there since, and the temporary name is then removed. A file
    that appeared during the build is never replaced; the build fails with
    the same `OSEO3001` refusal.
 -  If the destination existed, it is examined again immediately before the
    rename. It must still be the same file, by device and inode, and still
    pass the rules above; otherwise the build fails without replacing it.
    The temporary file is then renamed over the destination.

A process that replaces the destination between that last examination and
the rename can still lose its file. Closing that window needs an exchange
operation that neither execution target offers portably, so this record
accepts it.

Some file systems, such as exFAT and many FUSE, SMB, and NFS mounts, refuse
hard links. When the hard link fails with `EPERM` or `ENOTSUP`, the build
examines the destination again and, if it is still absent, renames the
temporary file into place. A file created between that examination and the
rename is then replaced, the same window as above.

Every failure before publication removes the temporary file and leaves an
existing destination unchanged. A cleanup failure is reported after the
original failure, not instead of it.

The copied bytes are the linker's output, unchanged. Oseo does not strip,
sign, or set extended attributes. Permission bits come from the linked file,
which the linker created under the caller's umask, so Oseo applies no mode
policy of its own.

The rename is atomic for readers on the same file system. Durability across a
crash is not promised: Oseo does not call `fsync`. Concurrent builds to one
destination never leave a partial file. Whichever publishes first succeeds. A
later build fails when its final examination sees the first build's file, which
is a different inode, or when its hard link finds the name taken. Both succeed
only when both final examinations happen before the first rename, and then the
later rename wins.

### Output and status

A successful build prints nothing and exits with status 0. It never starts
the executable, for any target. Cross-target builds follow the target
policy of *PLAN-CLI.md*: every target the selected toolchain can produce is
accepted, including `linux-aarch64-musl`.

### Host boundary

Publication belongs to the CLI workflow, not to the compiler core, backend,
or toolchain adapter. The host adapters in *packages/host/* gain one narrow
operation that inspects a destination and publishes a file to it by
copy-and-rename, implemented for Node.js and Deno. `CompilerHost` keeps its
current surface.


Consequences
------------

`oseo build` can land under delivery step 5 of *PLAN-CLI.md* with tests
written from this record in step 3. The preview's demonstration programs
and comparisons use retained executables built this way.

A directory named *hello* or a script called *hello* at the default path
blocks the default build. The diagnostic tells the caller to pass `--output`.

The publication operation becomes a public host-adapter API, documented in
*packages/host/README.md*.


Failure modes and replacement triggers
--------------------------------------

Reopen this decision if:

 -  a macOS AArch64 executable published by copy fails to execute, or needs a
    signature step;
 -  a supported target needs a file extension or a sidecar file;
 -  callers need to build into a directory that does not exist yet often
    enough that the refusal costs more than it saves; or
 -  a package or release workflow needs reproducible, durable output, which
    would add `fsync` and possibly content-addressed names.


Links
-----

 -  [*PLAN-CLI.md*](../../PLAN-CLI.md) requires this record and defines the
    command model.
 -  [ADR 0014](./0014-native-target-support.md) and
    [ADR 0015](./0015-native-target-identifiers.md) define targets and their
    IDs.
 -  [ADR 0036](./0036-optimized-native-build-configuration.md) defines the
    build configuration `oseo build` selects.
