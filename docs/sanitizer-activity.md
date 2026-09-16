Sanitizer activity and the host C lane
======================================

The native target descriptions request `address` and `undefined`, but the
pinned Zig 0.16.0 build does not provide AddressSanitizer coverage. Passing the
flags and completing a gate do not establish that ASan ran. This finding
qualifies the sanitizer claims in the design, native-target ADR, plans, runtime
documentation, and gate-cost records. The Linux host C lane below supplies
separate verified instrumentation. Historical Zig runs and macOS execution
still lack ASan evidence; the declared target policy has not changed.


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


Host C sanitizer lane
---------------------

The sanitizer lane uses a separate host compiler; Zig remains the ordinary
compiler. The new `@oseo/toolchain-host-cc` package plans builds;
*tests/native-toolchain.ts* selects an absolute compiler path and verifies its
runtime before composing the native test entry points. The adapter has paired
npm and JSR manifests at the lockstep version and its own GPL license. Its only
workspace dependency is the compiler interface package.

The lane selects `clang` when available and otherwise selects `gcc`. Set
`OSEO_HOST_CC=clang` or `OSEO_HOST_CC=gcc` to require one. Selection never
falls back after a failed probe. The probe compiles and executes a known heap
overflow and requires the ASan diagnostic. Build failures name missing runtime
libraries through the compiler's linker output. Foreign targets are rejected;
the existing Zig task retains cross-link and assembly checks.

~~~~ sh
mise run test:sanitizer:self
mise run test:sanitizer:runtime
mise run test:sanitizer:native
mise run test:sanitizer:property
mise run test:sanitizer:test262 --shard 3/200
OSEO_HOST_CC=gcc mise run test:sanitizer:self
~~~~

The runtime task uses one test-file worker; the property task uses four and
retains the ordinary seeds, sizes, and case counts. Generated native fixtures
still exercise the suite's specialization and forced collection modes. The
sanitizer native task omits only Zig-specific assembly and cross-link checks;
all executable scenarios remain. The ordinary native gate still runs the
assembly and cross-link checks.

The archive reuse key includes the exact resolved compiler path, full version
output, archiver path, compile flags, target, runtime contents, and captured
build environment. Failure metadata and property replay diagnostics include the
compiler identity. Compiler subprocesses inherit only PATH, HOME, and TMPDIR.
The lane refuses ambient ASAN\_OPTIONS, LSAN\_OPTIONS, UBSAN\_OPTIONS,
LD\_PRELOAD, and DYLD\_INSERT\_LIBRARIES so these cannot suppress a diagnostic.
UBSan recovery is disabled in both runtime and generated code.

On this Linux host, Clang 22.1.8 passed all four self-check assertions:
address and undefined behavior in a runtime archive member and generated C.
The host address probe calls malloc through a volatile function pointer, so
GCC cannot terminate it with an object-size UBSan check before ASan reports the
heap overflow. Both sanitizers stay enabled with recovery disabled. The
unchanged Zig address cases remain TODOs. GCC 16.2.1 is installed and
`gcc -print-file-name=libasan.so` returns a linker-script path, but its link
fails because */usr/lib64/libasan.so.8.0.0* and
*/usr/lib64/libubsan.so.1.0.0* are absent. The explicit GCC lane fails at
preflight, naming those missing libraries. GCC execution coverage is not
established on this host, and no system packages or sanitizer suppressions were
added.

Compiling the Date component with GCC also required its compiler-specific
spelling of the existing no-contraction pragma. The guarded directive keeps the
same rounding contract; Clang and Zig retain the original standard pragma. A
compile-only regression checks strict warnings, ASan instrumentation, and the
absence of fused multiply-add instructions with both installed compilers,
without needing GCC's missing link runtime. All 41 runtime translation units
also compiled to ASan/UBSan-instrumented GCC objects with the adapter flags in
30.55 seconds (measured); no warning or compiler error occurred. This is
compile evidence, not GCC execution evidence.


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


Linux measurements (2026-09-17)
-------------------------------

These measurements use base `28d640daaae8e80162d784cb2727dff8af1e3d4f`
plus this lane, on Linux x86-64, kernel 7.1.12-200.fc44, with an AMD Ryzen 7
7700X (16 logical CPUs). The compiler is */usr/bin/clang-22*, Fedora Clang
22.1.8-4.fc44. This is a shared host: other work continued, and observed load
averages were around 11–13 during preparation. These are elapsed observations,
not isolated benchmarks or GitHub runner predictions.

Each command includes its mise package-build dependency. The host runtime
archive cache was available; generated programs are compiled by the host driver
on every invocation. Runtime C fixtures build their own archives. Two early
native runs were stopped while test wiring was incomplete and are excluded.
The successful native run includes all executable scenarios; a separate focused
run also verified scenario 0 after its cross-link checks were separated.

| Command                                         | Measured elapsed | Result                                                          |
| ----------------------------------------------- | ---------------: | --------------------------------------------------------------- |
| `mise run test:sanitizer:self`                  |           3.65 s | 4 sanitizer assertions and 3 selection assertions pass          |
| `mise run test:sanitizer:runtime`               |          87.63 s | 4 C fixtures pass                                               |
| `mise run test:sanitizer:native`                |       1,219.54 s | 245 fixtures and all executable scenarios pass                  |
| `mise run test:sanitizer:property`              |         758.58 s | 200 tests across 114 files pass at ordinary budgets, 4 workers  |
| `mise run test:sanitizer:test262 --shard 3/200` |          52.93 s | 99/19,770 paths: 76 pass, 10 expected negatives, 13 unsupported |

No ASan, LeakSanitizer, or UBSan diagnostic occurred in Oseo's runtime or
generated code in these successful runs. The intentional self-check faults are
separate: ASan reports a heap overflow and UBSan reports signed overflow.
The clock property also passed a focused host-lane run in 17.49 seconds.
No sanitizer suppression was used and no runtime algorithm was changed.

The test262 runner reported 42.71041 seconds internally, with eight workers and
zero retries. Multiplying that execution time by `19,770 / 99` estimates
8,529.14 seconds, about 142 minutes, for the corpus at the same effective
throughput. The shard consumed 230.72 user plus 64.15 system CPU seconds;
scaling those gives about 16.4 CPU-hours. These are estimates from one shard,
not a full-corpus result. Case mix, cache state, host contention, and runner
capacity can change the cost.

That cost is too high for this change's additional per-PR gate: the measured
self, runtime, native, and property tasks together take 34.49 minutes, while
full test262 would add roughly 142 minutes at the sampled throughput. Linux CI
therefore schedules those four tasks and an explicit GCC self-check, but not
full sanitizer test262. Sharded periodic or on-demand corpus runs remain an
option if their compute budget is accepted. No unsharded test262 run was made.


Apple Clang proposal, not execution evidence
--------------------------------------------

No macOS job is added. This Linux host cannot measure Apple Clang or verify
macOS ASan/UBSan execution, and Linux LeakSanitizer results do not establish
macOS leak checking.

For capacity planning only, consider Apple Clang taking one or two times the
34.49-minute Linux lane measurement, excluding test262. Those assumptions give
about 35 or 69 runner-minutes. Dividing by the maintainer's stated five macOS
slots gives an added capacity floor of 6.90 or 13.80 minutes; a stated
156-minute existing floor would become approximately 163 or 170 minutes. These
are estimates, not measured compiler-speed ratios. They exclude extra setup,
queueing, and cold-cache costs.

The proposed next step is to run the self-check and a small native shard
manually on an Apple Clang AArch64 host, record its full compiler identity, and
then measure the complete lane before budgeting any CI job. Until that evidence
exists, historical and current macOS ASan coverage remains unverified.
