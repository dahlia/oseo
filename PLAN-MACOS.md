macOS AArch64 native execution plan
===================================

Status
------

Implementation status: complete. Exit evidence status: pending. Oseo executes
native fixtures as
`linux-x86_64-gnu` on Linux AMD64 and `macos-aarch64` on macOS AArch64. It
retains `linux-aarch64-musl` as a portability target. Node.js and Deno source
tests continue to run on Linux, macOS, and Windows in continuous integration.

The implementation branch still needs clean-checkout Linux and macOS evidence
for `mise run check`, `mise run test`, and
`mise run test:property:extended`. The final gate durations must then be
recorded before this plan is retired.

[ADR 0014](./docs/adr/0014-native-target-support.md) records the accepted
target, host, value-layout, sanitizer, CLI, and standards-evidence contracts.
[ADR 0015](./docs/adr/0015-native-target-identifiers.md) defines stable Oseo
target IDs and their toolchain mapping boundary.
[*docs/native-target-baseline.md*](./docs/native-target-baseline.md) preserves
the before-state measurements. The CLI, probes, differential fixtures,
properties, reviewed test262 subset, and native continuous-integration matrix
use the landed target-aware behavior.

This is a cross-milestone target-expansion plan. It does not replace
[*PLAN-M5.md*](./PLAN-M5.md), [*PLAN-PT.md*](./PLAN-PT.md), or
[*PLAN-RCR.md*](./PLAN-RCR.md), and it does not increase ECMAScript coverage by
itself. It is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md), the frozen language
profiles, and accepted records under *docs/adr/*. Evidence that invalidates a
target, value-layout, toolchain, or standards-manifest contract updates the
affected document in the same change.


Goal
----

Add macOS on AArch64 as a supported native execution environment without
weakening the existing Linux on AMD64 contract. A supported environment must
compile, link, and execute the same admitted JavaScript semantics through the
same MIR, C backend, runtime ABI contract, specialization policies, and
collector protocol.

The completed work should let a contributor use either of the project's two
primary development environments:

 -  Linux on AMD64, executing `linux-x86_64-gnu`; or
 -  macOS on AArch64, executing `macos-aarch64`.

Both environments must retain explicit target selection. Host-native defaults
may choose a documented target for execution, but a cross build must never
inherit an ambient ABI silently. A target that cannot execute on the current
host may still provide compile-link or assembly evidence when the requested
operation says so explicitly.


Terminology
-----------

A *bootstrap host* runs the TypeScript compiler under Node.js or Deno. A
*native target* describes the operating system, architecture, ABI, C standard,
required libraries, sanitizer policy, and output kind used by the C toolchain.
An *execution host* is the machine that starts the produced executable.

These concepts are related but not interchangeable. Node.js running on macOS
does not make a Linux ELF executable runnable. A target description also
cannot claim that an artifact is executable without knowing the execution
host. The implementation must model target facts separately from the decision
to run an artifact on one host.


Support matrix
--------------

The intended matrix is:

| Native target        | Matching execution host | Required evidence                         |
| -------------------- | ----------------------- | ----------------------------------------- |
| `linux-x86_64-gnu`   | Linux on AMD64          | Compile, link, execute, sanitize, inspect |
| `macos-aarch64`      | macOS on AArch64        | Compile, link, execute, sanitize, inspect |
| `linux-aarch64-musl` | None in the primary CI  | Compile, link, and inspect                |

Node.js and Deno package tests continue to run on the existing operating-system
matrix. Their success is bootstrap-host evidence, not native-target evidence.

The plan does not require one executable to run on both operating systems.
Linux ELF and macOS Mach-O remain separate artifacts produced from the same MIR,
generated C, and runtime source.


Entry evidence
--------------

This section preserves the Zig-shaped identifiers used before implementation.
ADR 0015 later replaced them with stable OS-first Oseo target IDs.

The work begins from these current contracts and observations:

 -  `TargetName` admits `x86_64-linux-gnu` and `aarch64-linux-musl`;
 -  `TargetDescription.execute` is fixed by the target name rather than by the
    relationship between a target and the current host;
 -  the Zig adapter receives an explicit target, but its artifact suffix logic
    assumes exactly the current two targets;
 -  the CLI always builds and runs `x86_64-linux-gnu`;
 -  native differential fixtures, native properties, and the test262 executor
    use the same Linux execution target;
 -  architecture probes build Linux ELF executables and start them without a
    host check;
 -  the continuous-integration native job runs only on Ubuntu, while Node.js
    and Deno jobs already cover Ubuntu, macOS, and Windows;
 -  the reviewed test262 manifest records one execution target in each executed
    result; and
 -  ADR 0004 accepts the NaN-boxed layout for x86-64 and requires new address
    validation before AArch64 execution.

On an AArch64 macOS host, the current aggregate `mise test` reaches the native
probe gate, produces an `x86_64-linux-gnu` ELF executable, and fails with exit
status 126 when the shell tries to execute it. This is a task and target-model
failure, not evidence of a JavaScript semantic defect.

Preliminary local diagnostics with the pinned Zig 0.16.0 toolchain built and
ran the ABI-root probe, native-boundary probe, NaN-box and low-tag value probes,
heap fixture, and promise fixture as `aarch64-macos`. The heap and promise
fixtures also passed with address and undefined-behavior sanitizers. This is
feasibility evidence only. It does not replace checked-in differential,
property, standards, and continuous-integration results.


Scope
-----

This plan owns:

 -  an explicit `macos-aarch64` native target description;
 -  separation of target properties from execution-host capabilities;
 -  host-native target selection at the CLI composition boundary;
 -  explicit cross-target selection and unsupported-pair diagnostics;
 -  deterministic Mach-O compilation, static runtime archiving, and linking
    through the pinned Zig adapter;
 -  AArch64 address-layout and sanitizer validation;
 -  host-aware architecture probes without lost evidence;
 -  native differential, specialization, collector, property, and standards
    evidence on both supported execution targets;
 -  target-aware failure and replay metadata;
 -  Linux and macOS native continuous-integration gates; and
 -  documentation of the supported host and target matrix.

The work does not add x86-64 macOS, executable AArch64 Linux, Windows native
execution, 32-bit targets, big-endian targets, universal Mach-O binaries,
codesigning, notarization, application bundles, installers, or release
distribution. It does not add Apple framework APIs or change the M6 and M7 host
API profiles. Those capabilities require their own evidence and plans.

Replacing C11, Zig, NaN boxing, the collector, or the native backend is not an
objective. If AArch64 evidence disproves one of those choices, implementation
stops at the failing contract. The result becomes an architecture decision and
a focused follow-up rather than a target-specific workaround hidden in the
port.


Target and host model
---------------------

Target descriptions contain immutable facts about produced artifacts. They do
not contain a universal statement that an artifact can execute. The current
`execute` Boolean must be removed or replaced by an operation-specific policy
that is evaluated with an execution-host description.

The compiler core may define narrow data contracts for hosts and targets, but
it must not import `process`, Darwin APIs, Linux APIs, or Zig. Concrete Node.js
and Deno host adapters report normalized operating-system and architecture
capabilities. The CLI and test composition layers decide whether to build only,
build and inspect, or build and execute.

The normalized host vocabulary must distinguish at least:

 -  Linux from macOS;
 -  AMD64 from AArch64;
 -  a matching executable format and ABI;
 -  available sanitizer modes; and
 -  unsupported or unknown values.

Unknown host data produces an owned diagnostic. It must not fall back to
`linux-x86_64-gnu`, use the machine's default `cc` target, or mark an unexecuted
fixture as passing.

The target description records toolchain-neutral Oseo facts. The Zig adapter
maps the Oseo target ID to the exact Zig string used in every compile and link
request. Artifact names and object names derive from the stable Oseo ID rather
than a two-way `native` or `arm` suffix. Package tests cover every supported
target and reject an unrecognized target before process execution.


CLI target selection
--------------------

The CLI composition root owns default native execution selection. Linux on
AMD64 selects `linux-x86_64-gnu`; macOS on AArch64 selects `macos-aarch64`.
Other hosts receive a source-located unsupported-host diagnostic before the
toolchain starts.

An explicit target option should select cross builds or override a native
default only when the requested CLI mode supports that operation. Selecting a
non-runnable target for execute mode fails before linking. A separate
compile-only mode, if accepted, must state that it will not run the artifact.
The accepted interface and wording must be frozen in the target-support
decision before implementation.

`--emit-c` and `--dump-mir` remain host-neutral. A target choice must not change
JavaScript semantics, HIR, MIR, source locations, specialization selection, or
generic fallback. Target-specific behavior begins at backend machine details,
runtime ABI validation, toolchain planning, and artifact execution.

The CLI must expose the selected target in diagnostics or retained build
metadata. A failure report that says only that the native toolchain failed is
insufficient when two operating systems and three configured targets can
produce different artifacts.


Value and pointer validation
----------------------------

ADR 0004 stores heap references in the low 48 bits of `OseoValue`. The macOS
target cannot be accepted merely because one allocated pointer happened to fit.
The target evidence must cover every runtime heap kind and every boundary that
boxes, stores, traces, reloads, compares, or frees a heap reference.

Validation must address:

 -  the actual user-space address range seen by ordinary and sanitizer builds;
 -  pointer authentication and whether any authenticated value can enter a
    generic heap-reference slot;
 -  top-byte metadata and the prohibition on silently stripping it;
 -  integer-to-pointer and pointer-to-integer round trips under strict C11;
 -  alignment and tag-mask assumptions;
 -  collector marking and root reload after every declared safepoint; and
 -  failure behavior before any address is truncated.

The existing runtime check remains authoritative until evidence supports a
broader contract. A pointer outside the admitted payload must fail through an
owned boundary. It must not wrap, alias another object, or rely on an assertion
compiled out of a release build.

If the same NaN-boxed layout is accepted for AArch64, the updated decision must
name the measured address and sanitizer evidence. If it is rejected, a
separate follow-up may introduce a target-specific value layout only behind the
opaque `OseoValue` and private runtime ABI boundaries. JavaScript semantics and
compiler-core types must not branch on the layout.


Probe migration
---------------

The architecture probes keep two distinct forms of evidence:

1.  correctness probes execute on each supported native execution target;
2.  code-shape and portability probes compile or inspect every configured
    cross target without pretending to execute it.

The ABI-root, native-boundary, and value-layout probes select their executable
target from normalized host capabilities. Their existing x86-64 and AArch64
assembly observations remain target-named. Adding macOS execution must not
silently replace the `linux-aarch64-musl` compile-link check or relabel Mach-O
evidence as Linux AArch64 evidence.

A skipped execution is acceptable only for a target not declared executable on
that host, and the aggregate report names it as compile-only. Each primary host
must execute its matching target. A macOS gate that skips every native
correctness probe is not support.


Native and differential evidence
--------------------------------

The complete native fixture corpus runs on both supported execution targets.
Each fixture compares Node.js, Deno, specialization-disabled native execution,
and specialization-enabled native execution. The comparison covers standard
output, standard error after private counter removal, exit status, thrown
completion, and any fixture-specific observation.

Forced collection, allocation failure, root-budget failure, guard hits, every
guard miss, overflow fallback, module linking, asynchronous continuation,
promise ordering, timers, unhandled rejection, and shutdown run on macOS rather
than remaining Linux-only evidence. Structural C and MIR checks remain shared.
Selected assembly checks use target-specific instruction patterns without
changing the semantic assertion they support.

Sanitizer capability is explicit per target. The ordinary matrix keeps the
strongest stable address and undefined-behavior sanitizer coverage supported by
the pinned Zig release on each host. A missing sanitizer is a recorded target
limitation with replacement evidence, not a silently removed flag. Target
support cannot land while known memory-safety findings remain open.

Native failures retain generated C, toolchain requests, target, host,
sanitizer, process observations, and executable format. Successful runs remove
temporary artifacts through the existing host abstraction.


Property evidence
-----------------

Native property suites parameterize execution by supported target rather than
embedding `linux-x86_64-gnu`. A replay record includes both the native target
and normalized execution host alongside its seed, path, size, specialization,
collector, and sanitizer modes.

The ordinary property budget executes on both primary hosts. The extended tier
runs on both before target support is declared and whenever a change affects
target descriptions, C lowering, value representation, collector behavior,
runtime state, or specialization. Case budgets may differ only after measured
runtime evidence changes the reviewed cross-target contract. Until then, both
hosts execute the same generated domain, reviewed seeds, and case counts.

A target disagreement is a semantic or infrastructure failure according to the
observation. It is never counted as two independent passes. The minimized
source becomes an ordinary regression fixture that runs on every applicable
target.


Standards evidence
------------------

The M5 test262 manifest counts one upstream source path once. Adding a second
execution target must not double the pass count or create two classifications
for one semantic case.

Before macOS test262 execution lands, the manifest owner must choose and record
one of these shapes through an architecture decision:

 -  one semantic classification with target-indexed execution observations; or
 -  one canonical compatibility manifest plus a separate target-parity record
    derived from the same reviewed subset.

Either shape records exact target, strictness, specialization policy, harness
includes, module graph, scheduler mode, and observation. The gate rejects a
classification or observation disagreement between supported execution targets.
Host-specific canonical paths, temporary directories, and executable names do
not enter the checked-in result.

The current `linux-x86_64-gnu` manifest remains authoritative until the schema
change is accepted and regenerated deliberately. Target support work must not
mix a schema migration with unrelated additions to the reviewed test262 subset.


Continuous integration and task behavior
----------------------------------------

The native continuous-integration matrix gains one Linux on AMD64 job and one
macOS on AArch64 job. Each installs the pinned tools through `mise`, builds the
matching target explicitly, runs native fixtures and probes, and uploads
retained diagnostics on failure.

The existing Node.js and Deno operating-system matrix remains separate. It
continues to prove bootstrap-host portability, including Windows, without
claiming Windows native execution.

`mise run test` must pass from a clean checkout on both primary environments.
On each one it executes the matching native target and retains the configured
cross-target compile-link checks. Host-aware orchestration may choose different
execution targets, but it may not reduce the semantic corpus, property case
count, or failure policy without recorded evidence.

New task names are documented only after they exist. The final task interface
must make native execution, cross compilation, extended properties, and target
replay discoverable through `mise tasks` without asking contributors to invoke
Zig directly.


Documentation and decisions
---------------------------

The first implementation change adds or accepts a target-support decision that
defines the matrix, target-host separation, CLI selection rule, value-layout
status, sanitizer policy, and test262 evidence shape. It updates or supersedes
ADRs 0001, 0003, and 0004 where their accepted contracts are no longer complete.

[*DESIGN.md*](./DESIGN.md) must distinguish the initial target from supported
execution targets and describe address validation for AArch64. The
[*ROADMAP.md*](./ROADMAP.md) status and applicable milestone evidence must stop
describing AArch64 as compile-link-only after execution support lands.

[*PLAN-M5.md*](./PLAN-M5.md) and [*PLAN-PT.md*](./PLAN-PT.md) retain their
semantic and generated-test contracts while naming the expanded target evidence.
[*PLAN-RCR.md*](./PLAN-RCR.md) must preserve both execution targets through any
runtime componentization work. The active language profile and
[*docs/cli.md*](./docs/cli.md) record current target and command behavior only
after implementation.

[*CONTRIBUTING.md*](./CONTRIBUTING.md) documents which ordinary and extended
tasks apply to target, backend, runtime, property, and generator changes. It
also states that a successful cross-link is not a native semantic pass.


Delivery order
--------------

1.  Record the current Linux execution, AArch64 cross-link, probe, sanitizer,
    native fixture, property, test262, and task-duration baselines.
2.  Accept the target-support decision covering the support matrix,
    target-host model, CLI behavior, AArch64 value layout, sanitizer policy,
    and standards-evidence shape.
3.  Separate immutable target facts from host execution capability in compiler,
    host, CLI, testkit, and toolchain contracts. Preserve the existing Linux
    behavior while adding focused unit tests for unsupported pairs.
4.  Add deterministic `macos-aarch64` build plans, artifact names, static
    runtime archives, host-native CLI selection, and complete subprocess
    diagnostics.
5.  Migrate ABI-root, native-boundary, value-layout, heap, and promise probes to
    execute on both primary hosts while retaining every cross-target and
    assembly check.
6.  Run the full native differential corpus on macOS, close value-layout,
    collector, specialization, asynchronous, and sanitizer failures, and retain
    minimized regressions for every defect.
7.  Parameterize native property suites and replay metadata by target. Run the
    ordinary and extended generated domains on both execution hosts.
8.  Implement the accepted test262 evidence shape and prove the reviewed subset
    agrees without duplicating compatibility counts.
9.  Add the macOS native continuous-integration job, failure artifacts, and
    clean-checkout aggregate gate. Measure the final task budgets on both hosts.
10. Update design, roadmap, contributor, CLI, profile, plan, and decision
    documents with the landed behavior and retire obsolete Linux-only wording.

Each checkpoint keeps Linux execution green. A mechanical target-model change
does not absorb a semantic, collector, or standards defect merely because the
defect appears first on macOS.


Risks and containment
---------------------

The main technical risk is the 48-bit heap-reference payload. Runtime checks,
sanitizers, forced collection, and full heap-kind coverage contain it. The plan
does not assume that AArch64 assembly results alone prove pointer safety.

Host and target concepts can leak into compiler semantics. Keeping selection in
outer composition layers and asserting identical MIR and generated C where
appropriate contains that risk.

Sanitizer implementations and system libraries can differ across operating
systems. Target descriptions name those differences explicitly, while the
semantic observation remains shared.

Running standards and generated suites twice increases gate duration. Measured
ordinary and extended tiers may distribute work across jobs, but they cannot
replace a target's execution with an unreported skip.

The test262 manifest can inflate compatibility totals if target observations
become duplicate rows. The schema decision retains one counted semantic case
and keeps target parity as evidence attached to or derived from that case.


Exit criteria
-------------

macOS AArch64 native execution is supported only when:

 -  the accepted target decision names Linux on AMD64 and macOS on AArch64 as
    supported execution environments and retains `linux-aarch64-musl` as an
    explicit portability target;
 -  target descriptions and execution-host capabilities are separate, and no
    unknown host silently selects a native target;
 -  the CLI selects or accepts an explicit target through documented behavior
    and reports unsupported target-host pairs before execution;
 -  `macos-aarch64` builds use deterministic explicit Zig requests and produce
    reviewed Mach-O artifacts from the same MIR, C backend, and runtime inputs;
 -  AArch64 pointer, tag, alignment, collector, and sanitizer evidence satisfies
    the accepted value-layout decision without unchecked truncation;
 -  every native differential fixture executes on both supported targets and
    matches Node.js, Deno, specialization policies, and collection modes;
 -  ABI, native-boundary, value-layout, runtime, assembly, and cross-link probes
    retain their named evidence on every applicable target;
 -  ordinary native properties execute the same generated domain on both hosts,
    and replay metadata identifies the exact host and target;
 -  the extended property tier passes on both hosts for the final target,
    lowering, runtime, and specialization state;
 -  the reviewed test262 subset agrees across execution targets without
    duplicating counted source paths or hiding a target disagreement;
 -  Linux and macOS native continuous-integration jobs run the matching target,
    retain complete diagnostics, and contain no blanket native skip;
 -  `mise run check` and `mise run test` pass from clean checkouts on both
    primary development environments;
 -  all planned commands, supported targets, limitations, and replay procedures
    are documented as current behavior only after they land; and
 -  *DESIGN.md*, *ROADMAP.md*, active plans, applicable profiles, contributor
    guidance, CLI documentation, and architecture decisions agree on the final
    support matrix.

After these criteria are recorded, this plan may be retired. The durable target
contract remains in the accepted decisions, design, roadmap, CLI documentation,
language profiles, contributor guidance, and continuous-integration matrix.
