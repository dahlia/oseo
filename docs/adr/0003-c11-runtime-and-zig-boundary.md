C11 backend, runtime, and Zig toolchain boundary
================================================

Status
------

Accepted. The single-target build description is superseded by
[ADR 0014](./0014-native-target-support.md).


Context
-------

The first native path should be inspectable and replaceable. Letting one module
emit C, select runtime sources, choose a target, locate Zig, and execute the
compiler would turn a bootstrap convenience into an architecture boundary.


Required contract
-----------------

Four responsibilities stay separate:

 -  the backend maps backend-neutral input to deterministic C11 source bytes;
 -  the runtime provider returns reviewed C and header inputs for a named
    runtime ABI;
 -  the target description names the target triple, C standard, ABI, required
    libraries, sanitizer policy, and output kind;
 -  the toolchain adapter turns those inputs into an explicit process request
    and returns stdout, stderr, exit status, and produced artifacts.

The backend does not locate Zig or run a process. The runtime does not know
which backend emitted its caller. The toolchain defines no JavaScript behavior.


Alternatives considered
-----------------------

A Zig runtime or *build.zig* would make Zig part of the runtime implementation.
A system `cc` would make the build depend on an unpinned compiler and headers.
Embedding runtime C into each generated translation unit would prevent separate
runtime replacement and archive testing. Postponing the split would let these
responsibilities leak into M1 packages.


Probe evidence
--------------

The M0 probe used one C translation unit as backend output and separate C and
header inputs as the runtime. It compiled and archived the runtime, linked the
generated translation unit, and performed the AArch64 cross-link. The probe was
retired after the toolchain and native integration suites exercised the same
boundaries with production inputs. Commit `52ae40e` preserves its source.


Observed results
----------------

The `x86_64-linux-gnu` fixture printed `native-boundary=42` under strict C11
warnings and undefined-behavior sanitization. The runtime was linked from a
static archive. The same sources compiled and linked as a static
`aarch64-linux-musl` executable. No Zig source or system C compiler was needed.


Decision
--------

Use C11 for the initial backend and runtime implementation. Use pinned `zig cc`
as the default compiler and linker driver and `zig ar` as the archiver. Preserve
the four boundaries above as compiler-owned interfaces. Runtime C is a separate
translation unit and static archive.

The sanitizer lane additionally uses the host Clang or GCC driver and `ar`.
Clang is selected when available; GCC is selected only when Clang is absent.
`OSEO_HOST_CC=clang` or `OSEO_HOST_CC=gcc` selects one explicitly. A selected
compiler must compile, link, and execute a deliberate ASan fault before its
runtime builds are accepted as sanitizer evidence. Missing instrumentation or
sanitizer libraries fail the lane; they never select an unsanitized build or
another compiler.

The publishable `@oseo/toolchain-host-cc` adapter implements the compiler-owned
interface. It owns compile flags, archive planning, rejection of cross-target
requests, and archive keys. Test entry points own compiler discovery and the
execution probe. The package follows the existing lockstep version, paired
npm/JSR manifests, GPL license, and package-artifact checks. This boundary
permits reuse without placing process discovery in the compiler core or
changing the default CLI.

Both runtime objects and generated C use ASan and UBSan, with recovery disabled.
The archive key includes the resolved compiler path and complete version output.
Native failure records and property replay diagnostics retain that identity.
Compiler subprocesses inherit only PATH, HOME, and TMPDIR; ambient sanitizer
options and injected libraries are rejected at lane startup.

Linux CI schedules this lane and an explicit GCC self-check. macOS CI now
configures two Apple Clang jobs on `macos-15`: self/runtime/native and
self/ordinary properties, with the same triggers as Linux. The self-check runs
first in each job. The macOS jobs have not run yet; full macOS CI ASan/UBSan
coverage remains unverified, and leak detection is excluded. A bounded local
Apple Clang sample, the job split, and timing assumptions are recorded in
[the activity audit](../sanitizer-activity.md). The host adapter rejects
cross-target build requests; the ordinary Zig gate still owns cross-link and
assembly evidence.


Consequences
------------

Another C compiler supplies its toolchain adapter and target mapping. Runtime
compilation controls may need equivalent compiler-specific spellings: the Date
component uses GCC's no-contraction pragma for GCC and retains the standard
pragma for Clang. Both preserve the same rounding contract.
Another runtime implementation supplies the same private runtime ABI. Another
native backend consumes the backend-neutral input without changing source
semantics. M0 models these inputs as opaque data without merging their
ownership.


Failure modes and replacement triggers
--------------------------------------

Revisit C11 if it cannot express required control flow without unsafe or
opaque conventions, or if generated-code inspection no longer offsets its
semantic mismatch with ECMAScript. Revisit Zig when its driver cannot build a
required supported target reproducibly. Either change requires the native
fixture and strict-warning checks to keep passing.


Links
-----

[*0001-initial-platform-and-tools.md*](./0001-initial-platform-and-tools.md)
defines the pinned toolchain and targets.
[*0005-generic-call-and-abrupt-completion.md*](./0005-generic-call-and-abrupt-completion.md)
defines the first generic C ABI.


Harness fragment amendment
--------------------------

The [harness fragment ABI](../harness-fragment-abi.md) provides a prebuilt
harness unit, a per-case unit, and a launcher. The test262 runner selects this
path by default for admitted Scripts under both Zig and the host C sanitizer
adapter. Modules, raw inputs, shadowing, strictness or source-boundary changes,
and compiler admission failures retain whole-Script compilation. Build errors
remain infrastructure failures and never trigger semantic fallback.

`OSEO_TEST262_HARNESS_REUSE=disabled` forces the original path. Cache keys cover
compiler contents, runtime ABI, source order, target, instrumentation, and
flags. The host serializes object publication; the runner verifies cached
bytes with a digest sidecar. Cache and build counters stay outside the reviewed
manifest. The ordinary CLI and default backend still compile one whole program.
