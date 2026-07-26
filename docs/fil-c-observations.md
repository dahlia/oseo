Fil-C observations
==================

Status
------

Observation record, written on July 26, 2026. This document collects external
evidence about Fil-C and names the Oseo contracts that evidence touches. It
makes no decision and reserves no milestone work.
[ADR 0004](./adr/0004-generic-tagged-value.md) cites this document in its
replacement triggers.


What Fil-C is
-------------

[Fil-C] is Filip Pizlo's memory-safe implementation of C and C++. Its project
documentation reports that many existing programs compile with no or minimal
changes and that every memory safety violation becomes a defined panic. The
language has no `unsafe` construct, although the *stdfil.h* runtime API keeps
a small set of explicitly unsafe foreign-call functions such as
`zunsafe_call`, and the guarantee does not extend across those calls. The
GIMSO LLVM pass rewrites possibly-unsafe
operations into checked ones, InvisiCaps carry the pointer capabilities those
checks consult, and the FUGC collector defines deallocation behavior.

 -  InvisiCaps keep pointers 64 bits wide by pairing an untrusted integer
    value with a trusted capability that lives outside the program-visible
    address space. A pointer reloaded from pointer-typed memory recovers its
    capability from a hidden auxiliary allocation. A pointer loaded from a
    location that never held one gets a null capability, and an integer store
    cannot forge a capability; at most it leaves behind the capability of the
    last pointer stored there.
 -  FUGC is a parallel, concurrent, on-the-fly, non-moving collector. `free`
    atomically revokes the object's capability instead of reusing the memory,
    so use after free, double free, and invalid free panic, and unreachable
    memory is reclaimed by the collector. Threads coordinate through
    compiler-emitted pollchecks and soft handshakes instead of a global
    stop-the-world phase, and the only barrier is a Dijkstra store barrier
    during marking.
 -  GIMSO treats incoming LLVM IR as potentially adversarial, so the
    guarantee holds at the IR boundary rather than in the source language.

Fil-C currently targets x86-64 Linux, uses a nonstandard ABI, and ships
runtime distributions based on both glibc and musl. Daniel J. Bernstein
published roughly 9000 cryptographic microbenchmarks in which Fil-C-compiled
code typically took between 1x and 4x as many cycles as the same code under
clang on a Zen 4 core. The port catalog identifies pointer-integer conversion
idioms as the recurring source of changes: zlib and coreutils compiled
unchanged, sqlite needed changes only in its test suite, and Ruby needed a
patch of roughly 1 MB that redesigns `VALUE` as a pointer type.

[Fil-C]: https://fil-c.org/


External events
---------------

On July 20, 2026, Andrew Kelley filed [ziglang/zig#36237], proposing a `fil`
target ABI for Zig alongside `musl` and `gnu` that would apply Fil-C's
techniques to Zig-emitted code with no source changes. The issue is accepted
and assigned to the Upcoming milestone. The same day, Filip Pizlo opened
[pizlonator/fil-c#279] to freeze the x86-64 Fil-C ABI, stating that the
optimizations he wanted for that ABI had landed.

Neither event has shipped in a pinned release. Zig's issue tracker records a
proposal, not a delivery date, and the ABI freeze describes a plan for escape
hatches, tests, and documentation.

[ziglang/zig#36237]: https://codeberg.org/ziglang/zig/issues/36237
[pizlonator/fil-c#279]: https://github.com/pizlonator/fil-c/issues/279


Why this matters to Oseo
------------------------

Oseo compiles generated C11 and the runtime through the Zig toolchain adapter
behind explicit target selection. If Zig ships the `fil` ABI, adding a target
such as `linux-x86_64-fil` would run the entire generated program under
Fil-C's checks. For the operations a run executes, those checks cover every
possibly-unsafe operation and define its failure, while address sanitizers
instrument selected error classes and can miss a corruption that lands in
valid memory. Such a target would complement the existing sanitizer gates
rather than replace them: it still observes only executed paths, and it
covers memory safety rather than every form of C undefined behavior.

The NaN-boxed value layout is the main obstacle. ADR 0004 stores heap
addresses in the low 48 bits of quiet-NaN payloads, and an `OseoValue` at
rest is an integer-typed 64-bit word in heap slots and root frames. Fil-C
assigns no capability to an integer load, so a heap reference reloaded from a
stored `OseoValue` could not be dereferenced. This is the pattern behind
Ruby's 1 MB port, and the low-tag alternative measured in ADR 0004 shares it.
A Fil-C-compatible runtime would need a different private representation,
for example pointer-typed value slots or integer handles into pointer-typed
tables. That change would reach the runtime, backend lowering, and the
collector's root protocol, but the opaque `OseoValue` contract keeps it out
of public packages.

FUGC is also prior art for [*PLAN-GC.md*](../PLAN-GC.md). Oseo currently
collects at stop-the-world safepoints with linked explicit root frames, as
[ADR 0006](./adr/0006-root-stack-and-safepoints.md) records; FUGC shows a
contrasting design in which compiler-emitted pollchecks let each thread reach
a handshake independently, with no global pause. Its free-as-revocation model
shows one way explicit deallocation and a collector can coexist without
dangling pointers.


Watch triggers
--------------

Revisit this record, and consider reopening ADR 0004, when any of the
following happens:

 -  a pinned Zig release ships the `fil` target ABI;
 -  the Fil-C x86-64 ABI freeze in [pizlonator/fil-c#279] completes;
 -  Fil-C gains support for another Oseo target, such as `macos-aarch64` or
    AArch64 Linux;
 -  the collector plan reaches a checkpoint that reconsiders value or pointer
    representation for other reasons.


Sources
-------

 -  [Fil-C], with the mechanism documents on [InvisiCaps], [FUGC], [GIMSO],
    and [safepoints], read on July 26, 2026.
 -  [Daniel J. Bernstein's Fil-C notes], including the microbenchmark graph
    and the Filian Debian rebuild effort.
 -  [ziglang/zig#36237], the accepted `fil` ABI proposal, filed July 20,
    2026.
 -  [pizlonator/fil-c#279], the x86-64 ABI freeze plan, filed July 20, 2026.
 -  [Programs that work], the Fil-C port catalog with patch sizes.

[InvisiCaps]: https://fil-c.org/invisicaps
[FUGC]: https://fil-c.org/fugc
[GIMSO]: https://fil-c.org/gimso
[safepoints]: https://fil-c.org/safepoints
[Daniel J. Bernstein's Fil-C notes]: https://cr.yp.to/2025/fil-c.html
[Programs that work]: https://fil-c.org/programs_that_work
