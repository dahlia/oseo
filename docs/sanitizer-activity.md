Sanitizer activity and the host C lane
======================================

The native target descriptions request `address` and `undefined`, but the
pinned Zig 0.16.0 build does not provide AddressSanitizer coverage. Passing the
flags and completing a gate do not establish that ASan ran. This finding
qualifies the sanitizer claims in the design, native-target ADR, plans, runtime
documentation, and gate-cost records. The Linux host C lane below supplies
separate verified instrumentation. Historical Zig runs still lack ASan
evidence. A bounded Apple Clang sample below shows ASan and UBSan working
through the host C adapter on one macOS arm64 machine. The macOS CI jobs
below are configured but have not run; the sample does not verify them.
Leak detection remains excluded on macOS. The declared target policy has not
changed.


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

For a bounded ordinary property measurement, pass Node.js test options before
an explicit file set. The shard task retains four workers and the same
interrupt-time multiplier as the full sanitizer property task:

~~~~ sh
mise run test:sanitizer:property:shard \
  --test-shard=1/12 tests/property/*.property.test.ts
~~~~

The full property task and the Linux CI lane remain unsharded. The shard task
uses ordinary seeds, sizes, and case counts, not the extended property budget.

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
self, runtime, native, and property tasks together took 34.49 minutes on a
16-thread workstation and about 57 runner-minutes as one job on GitHub's
ubuntu runner, while full test262 would add roughly 142 workstation minutes at
the sampled throughput. Linux CI
therefore schedules those four tasks and an explicit GCC self-check, but not
full sanitizer test262. Sharded periodic or on-demand corpus runs remain an
option if their compute budget is accepted. No unsharded test262 run was made.


Earlier Apple Clang proposal
----------------------------

The Linux audit added no macOS job. That host could not measure Apple Clang or
verify macOS ASan/UBSan execution, and Linux LeakSanitizer results do not
establish macOS leak checking.

For capacity planning only, consider Apple Clang taking one or two times the
34.49-minute Linux lane measurement, excluding test262. Those assumptions give
about 35 or 69 runner-minutes. Dividing by the maintainer's stated five macOS
slots gives an added capacity floor of 6.90 or 13.80 minutes; a stated
156-minute existing floor would become approximately 163 or 170 minutes. These
are estimates, not measured compiler-speed ratios. They exclude extra setup,
queueing, and cold-cache costs. The 34.49 minutes they scale is a workstation
measurement; the same lane took about 57 runner-minutes on GitHub's ubuntu
runner, so these estimates were low. The measured sample below supersedes them.

The proposal was to run the self-check and a small native shard
manually on an Apple Clang AArch64 host, record its full compiler identity, and
then measure the complete lane before budgeting a CI job. The later sample
below supplies that local evidence, without establishing coverage on a GitHub
macOS runner or over the complete macOS corpus.


Apple Clang sample (2026-09-17)
-------------------------------

A fresh clone at `779e281908622d39e2a138548058438903019046` passed the host C
self-check on a MacBook Air with an M4, four performance and six efficiency
cores, 32 GiB of memory, macOS 27.0, and Apple Clang 21.0.0. Both address and
undefined-behavior faults were reported in runtime and generated code.
`OSEO_HOST_CC=gcc` passed too, but its recorded version identifies Apple Clang,
not GNU GCC. The target resolves to `macos-aarch64`.

The preflight and lane do not require LeakSanitizer. A separate leaking
program exited without a leak report under default ASan options; forcing
`detect_leaks=1` failed because the platform does not support it. This sample
therefore establishes ASan and UBSan activity, not leak detection.

The full four-fixture runtime task, native shard `1/12` with 21 of 246
fixtures and its selected scenarios, and ordinary property shard `1/12` with
14 tests across ten of 115 files passed. The property shard retained four
workers, ordinary budgets, and `OSEO_PROPERTY_TIME_SCALE=3`. These are bounded
execution observations, not a full macOS sanitizer gate. Test262 shard
`3/200` also passed: 101 of 20,168 paths, with 80 passes, seven expected
negatives, 14 unsupported results, and zero retries. No compiler or
runtime correction was needed. The additive property shard task above leaves
the Linux CI lane and all existing default tasks unchanged.


macOS CI configuration (2026-09-17)
-----------------------------------

The maintainer has chosen to run the complete self-check, runtime, native, and
ordinary property tasks on every merge. The two `test_sanitizer_macos` matrix
jobs in *.github/workflows/main.yaml* use `macos-15` and share the Linux lane's
unfiltered `push`, `pull_request`, and `workflow_dispatch` triggers. Neither
platform schedules sanitizer test262. Each macOS job runs
`test:sanitizer:self` immediately after checkout and tool installation, before
its other tests, so unsupported instrumentation fails at preflight. The native
job then runs `test:sanitizer:runtime` and `test:sanitizer:native`; the property
job runs `test:sanitizer:property`. Both require `clang`. There is no separate
GCC check because the macOS `gcc` command is an Apple Clang alias.

The [GitHub runner specification] lists `macos-15` as arm64 with three M1 CPUs
and 7 GB of RAM. The [macOS 15 arm64 image README], checked on 2026-09-17,
lists image `20260907.0337.1`, macOS 15.7.9, Clang/LLVM 17.0.0, and default
Xcode 16.4. This differs from the M4/macOS 27/Apple Clang 21 sample above.
Runner images change; the first run must record the actual image and compiler
identity and confirm the self-check diagnostics on that compiler.

The Linux runner's self, GCC self, runtime, native, and property steps took
about 0.1, 0.1, 2.7, 29.0, and 25.2 minutes. The local Apple sample's
same-shard host-C/Zig cost ratios were 0.62 for runtime, 1.08 for native, and
1.11 for ordinary properties. These ratios compare compilers on that Mac,
not Mac and Linux runner speeds. The supplied planning estimate for
the macOS lane is 65–79 runner-minutes, with a wider 50–105 minute range.
Allocating 65–79 minutes in proportion to the Linux runtime/native and
property costs gives roughly 36–44 and 29–35 minutes respectively, before the
extra job's setup and repeated self-check. These are estimates, not CI results.

Two independently queued jobs can reduce the delay at the end of a run sharing
the maintainer's five macOS slots. A single late-starting job could add almost
the entire lane's duration. Earlier splitting of the longest macOS job family
reduced a repository run from 260.8 to 181.4 minutes; that observation
motivates the split but does not predict this lane's wall time. Two jobs also
limit repeated setup costs. Each has a 75-minute timeout: about 31 minutes
above the larger central estimate, and roughly 16 minutes above its
proportional share of the 105-minute upper planning bound. That margin covers
tool installation, cold archives, runner variation, and corpus growth. Queue
time is separate; the split does not reduce total compiler work or guarantee
earlier scheduling.

The property job retains four Node workers and sets
`OSEO_PROPERTY_TIME_SCALE=6`, twice Linux's value of 3, because four compiling
workers share only three CPUs and the sample used a faster, larger machine.
The full and shard property tasks accept this environment override and default
to 3, leaving the Linux workflow at its existing settings. The multiplier
widens only the interrupt deadline; it changes no seeds, sizes, or case counts,
and `markInterruptAsFailure` remains enabled. It does not double successful
run time. The first run must establish whether this allowance is sufficient.

Both jobs upload _oseo-native-\*_ failure directories from `runner.temp` on
failure or cancellation, using distinct artifact names and the Linux lane's
warning when no files are found. Step-level `TMPDIR` makes the test output and
upload paths agree. Matrix fail-fast is disabled so one failed suite does not
cancel the other. The Linux sanitizer job has no aggregate `needs` wiring;
the macOS jobs likewise report independent checks. The `native` aggregate
continues to cover the ordinary native, native-support, and test262 shards.
At configuration time, GitHub reported no main-branch protection or applicable
rules; no server-side required-check settings were changed.

No macOS CI run has happened for this configuration. The first GitHub run must
confirm both runtime and generated-code ASan/UBSan self-checks, completion of
all runtime/native/ordinary property tests without interrupts, actual step
costs and timeout headroom, and retained diagnostics on any failure. The local
sample is evidence only for that sample. LeakSanitizer remains explicitly
excluded on macOS arm64; these jobs make no leak-detection claim.

[GitHub runner specification]: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
[macOS 15 arm64 image README]: https://github.com/actions/runner-images/blob/main/images/macos/macos-15-arm64-Readme.md
