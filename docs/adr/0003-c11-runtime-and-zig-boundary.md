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


Consequences
------------

Another C compiler replaces only the toolchain adapter and target mapping.
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
