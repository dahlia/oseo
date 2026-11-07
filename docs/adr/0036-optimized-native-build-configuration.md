ADR 0036: Checked and optimized native build configurations
===========================================================

Status
------

Accepted on 2026-11-08 for the optimized build unit shared by
[*PLAN-PREVIEW.md*](../../PLAN-PREVIEW.md) and the measurement checkpoint of
[*PLAN-PERF.md*](../../PLAN-PERF.md). Until that unit lands, every native
build uses the configuration described under *Context*.

This record amends the sanitizer column of
[ADR 0014](./0014-native-target-support.md). The column then describes the
checked configuration only. ADR 0014's target and host model, value layout,
command-line target rules, and standards evidence stay in force.


Context
-------

Every native build today has one configuration, and it is a checking
configuration rather than a fast one.

`describeTarget()` in *packages/compiler/src/native.ts* gives
`linux-x86_64-gnu` and `macos-aarch64` the sanitizer list `address` and
`undefined`, and gives `linux-aarch64-musl` none. The Zig adapter turns the
list into one combined `-fsanitize=` argument. The host C compiler adapter in
*packages/toolchain-host-cc/* ignores the list's contents for flag selection
and always passes `-fsanitize=address,undefined -fno-sanitize-recover=all`,
`-g`, and `-fno-omit-frame-pointer`.

The pinned Zig 0.16.0 drops `address` from a combined `-fsanitize=` argument,
as the [sanitizer activity audit](../sanitizer-activity.md) records, so Zig
builds carry UndefinedBehaviorSanitizer but not AddressSanitizer. Address
checking comes only from the host C compiler lane.

Both adapters compile the runtime objects with `-O2` and generated C with no
optimization flag. Without `-O`, `zig cc` compiles in its debug mode, which
also enables trapping UndefinedBehaviorSanitizer. A probe of a signed overflow
under Zig 0.16.0 for `linux-x86_64-gnu`, with no sanitizer flag, trapped
without `-O` and wrapped silently with `-O2`. An explicit
`-fsanitize=undefined` keeps the instrumentation at `-O2`, which is why the
runtime archive carries UBSan today; only `-fno-sanitize=all` removes it. Both
adapters add `-fno-lto` at the final link when additional generated sources or
prebuilt objects are linked.

The [M5 performance and code-size report](../evidence/m5-performance/README.md)
measured this configuration. Its executable sizes, latencies, and resident
sets describe an instrumented debug build, and a comparison with Node.js,
Deno, or Bun on those numbers would not measure Oseo's generated code.


Required contract
-----------------

The preview and the performance track need:

 -  a build configuration whose generated C and runtime are optimized and
    carry no sanitizer, selected explicitly and recorded in build metadata;
 -  no change to JavaScript semantics between configurations, including
    floating-point results, integer conversions, and failure diagnostics;
 -  the existing checking configuration kept intact, so sanitizer evidence
    does not regress;
 -  distinct cache identities for the two configurations; and
 -  a gate that detects a behavior difference between them.


Alternatives considered
-----------------------

 -  Making the default build optimized and keeping sanitizers only in test
    lanes was rejected. `oseo run` is how contributors reproduce a failure,
    and the sanitizer evidence in ADR 0014 assumes ordinary native runs are
    checked.
 -  Treating the sanitizer list as a target fact and adding unsanitized
    copies of each target, such as a `linux-x86_64-gnu-release` ID, was
    rejected. [ADR 0015](./0015-native-target-identifiers.md) defines target
    IDs as artifact facts; a configuration is a build choice for the same
    artifact kind, and doubling the IDs would double target parity records.
 -  Passing the optimization level and sanitizers as free-form compiler flags
    from the command line was rejected. Arbitrary flags would let a user
    select `-ffast-math` or `-fno-strict-overflow` style options that change
    semantics, and cache identity would depend on uninterpreted strings.
 -  Adopting `-O3` or link-time optimization in this record was deferred.
    The generic path costs checkpoint of *PLAN-PERF.md* measures them
    against `-O2` on the corpus first.
 -  Postponing the decision was rejected. Without it the measurement
    checkpoint has nothing to measure, and an implementation would fix the
    configuration's flags and gates by code.


Probe evidence
--------------

The context above comes from reading the adapters at the 2026-11-08 *main*
and from one local probe. The probe compiled a ten-line C file with the
pinned Zig 0.16.0 for `linux-x86_64-gnu`, passing no sanitizer flag, without
`-O`, with `-O2`, and with `-O2 -fno-sanitize=all`, and inspected the result
for UBSan symbols. A first-pass reviewer repeated it with
`-fsanitize=address,undefined -O2` and observed the trap and the UBSan
symbols. A second
probe compiled `a * b + c` on doubles for `macos-aarch64` without `-O`, with
`-O2`, and with `-O2 -ffp-contract=off`, and searched the assembly for fused
multiply-add instructions.

The implementation must provide the remaining evidence: the native
fixture corpus executed in both configurations on both execution targets,
symbol inspection showing that optimized executables contain no sanitizer
runtime, and a floating-point contraction check in generated code.


Observed results
----------------

Without `-O`, the probe executable contained 69 UBSan symbols and aborted on
the overflow. With `-O2`, with or without `-fno-sanitize=all`, it contained
none and printed the wrapped value. With `-fsanitize=address,undefined -O2`
it kept UBSan and aborted, so `-O2` alone does not remove a requested
sanitizer. The contraction probe emitted no fused
multiply-add instruction in any of the three modes. The probe establishes
Zig's default for that input only; it does not show that Zig never contracts.


Decision
--------

### Two configurations

A native build has one of two configurations:

| Configuration | Generated C | Runtime | Sanitizers                 | Debug info |
| ------------- | ----------- | ------- | -------------------------- | ---------- |
| `checked`     | no `-O`     | `-O2`   | the target's list          | as today   |
| `optimized`   | `-O2`       | `-O2`   | none (`-fno-sanitize=all`) | no `-g`    |

`checked` is today's configuration, with its current flags in each adapter plus
the floating-point flag below. The ADR 0014 sanitizer column becomes the list a
target requests in `checked`. `optimized` passes `-O2` to every C compilation,
`-fno-sanitize=all` to every compilation and link, and no `-g`. Zig 0.16.0 still
emits its default DWARF sections without `-g`, and `-g0` does not remove them;
only stripping at link time does. Stripping changes executable size and
profiling, so it belongs to the size investigation and the profiling method
rather than to this record.

Both configurations pass `-ffp-contract=off` to every compilation, so a
fused multiply-add never changes a Number result regardless of a compiler's
default. The *runtime\_date.c* `FP_CONTRACT` pragma stays as a second guard.
Neither configuration passes `-ffast-math`, `-fno-strict-aliasing`,
`-fwrapv`, or any option that changes C semantics; generated C and the
runtime keep avoiding undefined behavior through explicit helpers, as
*CONTRIBUTING.md* requires, and must not start depending on such an option.

The `-fno-lto` rule is unchanged in both. Link-time optimization, `-O3`,
symbol stripping, and size options stay outside this record until
*PLAN-PERF.md* measures them.

### Representation

`TargetDescription.sanitizers` keeps naming what a target supports in
`checked`. A new `NativeBuildConfiguration` value, `checked` or
`optimized`, travels in `NativeBuildInput` beside the target. Toolchain
adapters derive flags from both. The compiler core defines the type and
passes it through; it does not choose flags.

The host C compiler adapter supports `checked` only and rejects `optimized`
before constructing a command. It exists to prove instrumentation, and an
unsanitized host C build would duplicate the Zig path without adding
evidence.

The frame-cost macros stay adapter-owned. `optimized` uses the runtime
defaults, as the Zig `checked` build does today.

### Selection

`oseo run` keeps building `checked` by default. `oseo build` builds
`optimized` by default. Both accept `--build-config checked|optimized` to
select the other. The text modes, `--dump-mir` and `--emit-c`, are
configuration-neutral and reject the option, as they reject `--target`.

Build metadata, native failure records, and property replay diagnostics name
the configuration next to the target and compiler identity.

### Cache identity

The runtime archive key and the harness object key include the
configuration. The current keys already hash the complete flag list, so the
two configurations cannot share an archive; the configuration name is added
so the key states it rather than relying on that hash.

### Gates

The native fixture corpus runs in both configurations on both execution
targets on every pull request, through a new `test:native:optimized` task
that `mise run test` includes. Each fixture's output and exit status must
match across configurations as well as the Node.js and Deno references.

The reviewed test262 corpus and the native property suites keep running in
`checked` on pull requests. A scheduled job and the exit gate of each
*PLAN-PERF.md* checkpoint run them in `optimized` on both execution
targets. A disagreement is a defect in the compiler or runtime, not a
manifest change: there is one manifest, and it describes both
configurations.


Consequences
------------

`oseo build` produces executables that can be compared with other runtimes,
and the measurement checkpoint has a defined configuration to report. The
M5 report stays a record of the instrumented build.

The native fixture lane roughly doubles its build time, because every
fixture is built twice. The test262 and property costs on pull requests do
not change. The new task shards with `--shard INDEX/TOTAL` the same round-robin
way as `test:native`, and the CI matrix gains its jobs in the change that adds
it.

A defect that only an optimizer exposes, such as code that relied on
undefined behavior the debug build happened to tolerate, now becomes a
fixture or scheduled-job failure rather than staying latent. The UBSan
evidence from `checked` remains the guard against introducing such code.

The command-line option becomes public in [*docs/cli.md*](../cli.md) when
the implementation lands, and [*PLAN-CLI.md*](../../PLAN-CLI.md) records it
in its option inventory.


Failure modes and replacement triggers
--------------------------------------

Reopen this decision if:

 -  a fixture, test262 case, or property differs between configurations and
    the cause is a compiler option rather than a defect;
 -  `-O2` builds of large generated programs exceed the native job limits;
 -  a supported compiler cannot honor `-ffp-contract=off` or
    `-fno-sanitize=all`;
 -  *PLAN-PERF.md* measurements justify `-O3`, link-time optimization, or a
    size configuration; or
 -  a third configuration, such as optimized with debug info for profiling,
    becomes necessary. The profiling method of *PLAN-PERF.md* is the
    expected source of that request.


Links
-----

 -  [ADR 0003](./0003-c11-runtime-and-zig-boundary.md) defines the C11
    runtime and Zig toolchain boundary.
 -  [ADR 0014](./0014-native-target-support.md) defines targets and the
    sanitizer column this record amends.
 -  [ADR 0015](./0015-native-target-identifiers.md) defines target IDs.
 -  [ADR 0037](./0037-retained-native-executables.md) defines where
    `oseo build` writes its output.
 -  [*PLAN-PERF.md*](../../PLAN-PERF.md) and
    [*PLAN-PREVIEW.md*](../../PLAN-PREVIEW.md) consume this configuration.
