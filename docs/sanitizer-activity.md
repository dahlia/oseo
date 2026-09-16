Sanitizer activity with Zig 0.16.0
==================================

The native target descriptions request `address` and `undefined`, but the
pinned Zig 0.16.0 build does not provide AddressSanitizer coverage. Passing the
flags and completing a gate do not establish that ASan ran. This finding
qualifies the sanitizer claims in the design, native-target ADR, plans, runtime
documentation, and gate-cost records. Their ASan requirements remain unmet;
the declared target policy has not changed.


Cause and reproduction
----------------------

Zig's driver consumes a comma-separated sanitizer argument when it recognizes
*any* member. It recognizes `undefined`, `thread`, and fuzzing modes; it does
not forward the remaining `address` member. This is visible in
*src/main.zig*, lines 2275–2294 of the
[Zig 0.16.0 source release].
The matching argument order `undefined,address` has the same result.

Separate `-fsanitize=address -fsanitize=undefined` arguments preserve the ASan
instrumentation, but linking then fails on unresolved `__asan_*` symbols.
Zig does not supply the required ASan runtime in this configuration. The
upstream reports [#24377] and
[#11403] describe missing ASan
runtime linking on Linux and macOS. They concern older Zig versions; the
measurements below establish the behavior of the current pin. The
[0.16.0 release notes]
identify its LLVM version, but do not promise ASan support.

The self-check allocates one `int`, writes through a volatile pointer at index
`argc` (one with no arguments), and frees the allocation. Its index is a
runtime input, so the compiler cannot discard the write as a dead store:

~~~~ c
#include <stdlib.h>
int main(int argc, char **argv) {
    (void)argv;
    volatile int *p = malloc(sizeof(int));
    if (!p) return 2;
    p[argc] = 42;
    free((void *)p);
    return 0;
}
~~~~

~~~~ sh
export ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/asan-work
zig cc -target x86_64-linux-gnu -std=c11 \
  -fsanitize=address,undefined -g self.c -o self
./self
llvm-nm self
zig cc -target aarch64-macos -std=c11 \
  -fsanitize=address,undefined -g -c self.c -o self-macos.o
zig cc -target aarch64-macos -std=c11 \
  -fsanitize=address,undefined -g self.c -o self-macos
llvm-nm self-macos.o
llvm-nm self-macos
~~~~

Measured on Linux x86-64 on 2026-09-17:

| Compiler and target           | Flags    | Object ASan symbols | Link                               | Execution                    |
| ----------------------------- | -------- | ------------------: | ---------------------------------- | ---------------------------- |
| Zig 0.16.0, Linux x86-64 GNU  | combined |                   0 | succeeds; 0 ASan, 34 UBSan symbols | exit 0, no report            |
| Zig 0.16.0, macOS AArch64     | combined |                   0 | succeeds; 0 ASan, 34 UBSan symbols | not run on this Linux host   |
| Zig 0.16.0, macOS AArch64     | separate |                   4 | unresolved ASan symbols            | no executable                |
| System Clang 22, Linux x86-64 | combined |                   5 | succeeds; 322 ASan symbols         | exit 1, heap-buffer-overflow |

Counts are matching symbol-table lines from `llvm-nm`, not counts of checks.
Both combined-flag Zig objects contain one UBSan symbol reference. A fresh
`-v` build with a distinct preprocessor definition confirms that the combined
argument does *not* pass `address` to the Clang frontend. An address-only
argument does reach it and fails at link time. This distinguishes argument
handling from a missing instrumentation pass or optimization of the probe.

[Zig 0.16.0 source release]: https://ziglang.org/download/0.16.0/zig-0.16.0.tar.xz
[0.16.0 release notes]: https://ziglang.org/download/0.16.0/release-notes.html#LLVM-21
[#11403]: https://github.com/ziglang/zig/issues/11403
[#24377]: https://github.com/ziglang/zig/issues/24377


Regression coverage
-------------------

*packages/toolchain-zig/tests/sanitizer-activity.test.ts* uses the real adapter
and host target declaration. For every declared sanitizer it builds a standard
fault both in an optimized runtime archive member and in generated C, then
requires the corresponding diagnostic. Signed integer overflow exercises
UBSan. Under Node.js, the address cases remain executable `node:test` TODOs
naming this finding. Deno 2.9.2 ignores these TODO cases, as confirmed by the
focused Deno test run. Unsupported hosts skip native execution. Build and run
timeouts bound the probes, and the adapter's environment allowlist keeps
ambient sanitizer options out.

A TODO is an acknowledged coverage gap. Remove it only after the self-check
reports the heap overflow on both primary execution targets. If a TODO test
passes after a compiler change, check whether both primary execution targets
now meet the removal condition.


Options requiring a maintainer decision
---------------------------------------

A flag-only correction would preserve ADR 0003's compiler policy, but separating
the flags is insufficient: it needs an ASan runtime as well. No self-contained
Zig 0.16.0 flag fix was established. Adding a system sanitizer library brings
another toolchain input that needs pinning and validation on each host.

Changing Zig releases requires a pin change and fresh cross-target evidence.
An older release alone is not a proven solution: #24377 reports the runtime
linking problem in 0.14.1 too. Candidate versions must pass these self-checks
before being proposed as a replacement.

A separate, pinned Clang sanitizer CI lane can provide working ASan while
preserving Zig as the default production compiler. It adds a supported compiler,
headers, and sanitizer runtime to the evidence policy in ADR 0003; the
maintainer must approve that policy extension. Both the runtime archive and
generated C must be instrumented, and the lane must fail on sanitizer
diagnostics.

Removing `address` would make the target descriptions match the existing
coverage, but would weaken ADR 0014's target contract and leave memory errors
undetected by ASan. That also needs a maintainer decision. None of these
compiler, version, or declared-sanitizer changes accompanies this correction.


Independent Clang runtime probe
-------------------------------

An audit of base commit `912affc1d17fb60f29310338b343a83a9e7190bc` used
Fedora Clang 22.1.8, after its self-check reported the expected heap overflow.
All 41 runtime source files from `cRuntimeProvider` were compiled at `-O2`
with `-std=c11 -g -fno-omit-frame-pointer -fsanitize=address,undefined`, the
project's strict warning flags, and its runtime include directory. `llvm-ar`
archived those objects. The same sanitizer flags linked each test with that
archive and `-lm`; generated C retained the adapter's default optimization.

The measured sample comprised the heap, promises, ephemeron, and ephemeron
property C fixtures, plus 17 native fixtures in both specialization modes
(34 generated programs). The generated sample covered expressions, objects,
bindings, ArrayBuffer, TypedArray, JSON parse/stringify, RegExp, async
functions, generators, Map, and Set. Each ran normally and with
`OSEO_GC_EVERY_SAFEPOINT=1`. The ephemeron property fixture additionally used
both specialization arguments, with graph arguments `3 100 xxx 0112 012`. All
78 valid executions exited zero with empty stderr. No ASan, LeakSanitizer, or
UBSan diagnostic occurred in this sample. These results apply only to the
tested sample and do not establish that the complete runtime is free of memory
errors.

An initial invocation of the ephemeron property fixture without its required
arguments failed `assert(argument_count == 7)` in both collection modes. These
were harness invocation errors, not sanitizer diagnostics; the valid runs
above supply the required arguments. No sanitizer suppression options were
used. The intentional Clang self-check separately produced the expected
`AddressSanitizer: heap-buffer-overflow`, a four-byte write immediately after
a four-byte allocation in `self.c`.
