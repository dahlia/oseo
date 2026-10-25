Ordinary array indexed lookup performance
=========================================

The user authorized investigation and implementation on 2026-10-24 while
RegExp utility harness review and observation continue independently. This
node targets the repeated linear own-property scans observed while the
unchanged upstream buildString helper fills and reads ordinary arrays.
It owns no new test262 path and admits no language surface or exclusion.

The initial diagnostic found 18 of 24 sampled stacks in apply argument-list
construction, five in indexed assignment, and one in length truncation.
Those samples identify candidate paths; they are not exact CPU percentages.
Lookup-only measurement on the unchanged original helper subsequently left
ASCII and Surrogate native interval unions near 158 seconds, about 1.42
times faster. The user's 2026-10-24 decision authorizes this node's bounded
expansion to insertion and length truncation. That focused measurement does
not establish whole-corpus deadline margin.

Preserve data and accessor descriptors, numeric and nonnumeric property
ordering, holes, inherited properties, unusual array states, Proxy behavior,
and generic fallback. Insertions, deletions, redefinitions, length changes,
and collection must not leave a stale lookup or a dangling reference.
Both specialization policies and forced collection remain part of evidence.

Keep the original helper, its 10,000-element chunk size, upstream source and
Unicode data, assertions, case counts, seeds, and time limits unchanged.
Do not change CI shard totals or settings. New generated domains reserve
stable seed slots and retain deliberate fallback and invalidation cases.

Measure the same fixed sources and conditions before and after the change.
Separate compilation from native execution, retain raw timing and failures,
and qualify cache and instrumentation effects. Validate complete original
harness registrations once that harness source is available for the measured
composition. A focused speedup does not establish a whole-corpus forecast or
a repaired CI deadline. Required native execution uses the single heavy slot;
source investigation and pure checks may continue during another UPDATE.

The original running UPDATE input and its results remain separate evidence.
This branch does not modify that worktree or replace its observations.
Fresh final observations, D1 impact reviews, local CHECK, and exact candidate
CI remain required before publication under the current M5c procedure.


Lookup-only source and historical evidence
------------------------------------------

The earlier lookup-only source checks arrays branded `OSEO_HEAP_ARRAY`. For a
canonical array index `i`, it checks whether property slot `i` exists and
currently holds the requested key. Only that match returns early. Every
miss retains the complete ordinary property scan, including a numeric key
stored elsewhere. The property vector remains the sole descriptor storage;
`length` remains separate array metadata.

The check neither allocates nor calls user code. It keeps no cached slot,
pointer, or absence result, so deletion, reordering, redefinition, vector
growth, and collection need no new invalidation protocol. Descriptor reads,
accessors, writes, prototype traversal, enumeration, and Proxy dispatch keep
their existing callers. No runtime layout, public API, or ABI changes.

For dense arrays populated in ascending index order, a successful indexed
lookup examines one candidate key instead of scanning preceding properties.
In that initial source, absent-key insertions still scan, and truncation
retains its existing cost.
The worst-case fallback remains linear. Runtime costs, including overhead
on fallback cases, require later measurement with fixed sources.

The fixed `array-indexed-lookup-transitions` fixture and the existing Array
constructor property sequence cover dense `apply` reads, read-only data,
accessors, holes and inherited receivers, deletion and reinsertion,
non-configurable truncation barriers, numeric-looking strings, boundary
indices, symbols, Proxy forwarding, ordinary objects, and array reuse.
The property's arbitrary, seed, case budget, and timeout stay unchanged;
its numeric payloads vary while every transition remains during shrinking.
Both native policies and forced collection remain in that existing lane.

The accepted lookup-only native evidence is pinned to source
`a541b567b79f76bb6ccac076caef39c12164971a`; its benchmark composition is
`74ba6573473635178c775b6087c3d5210db8909c`. Those results are historical,
not complete proof of the expanded runtime or its compiler/backend reanchor.
The focused expanded-source evidence below is separate. The node stays
ready and unlanded.


Insertion and length reduction source
-------------------------------------

An Array's own canonical indices are strictly below its current length.
The ordinary lookup helper therefore reports no own property for an index
at or beyond that length, without scanning the vector. This applies to
append and out-of-length insertion even after named properties or holes.
It establishes absence only on that Array: Set still walks prototypes and
honors setters and inherited read-only data, while definition keeps every
extensibility, descriptor, and writable-length check. A below-length slot
miss, noncanonical string, symbol, or non-Array keeps the existing scan.
Preallocated holes below length are not an optimized insertion case.

Length reduction first performs the existing conversions and writable
checks. A new guard then validates the complete current property vector:
every slot i must hold canonical key i and a configurable data descriptor.
Only that whole-vector match removes the affected tail in descending order.
No repeated search or shift is needed, so validation and removal are linear
in stored elements rather than quadratic. A dense prefix with trailing
holes is valid; holes or reordering within the stored prefix, named/symbol
keys, accessors, or non-configurable elements retain the unchanged generic
descending selection and deletion, including partial failure and rollback.
Common length, dictionary, and shape updates remain shared with that path.

Neither guard allocates or calls user code, and neither retains a slot or
pointer across allocation or a safepoint. The property vector remains the
only descriptor storage; there is no layout, public API, ABI, cache, or
collector-policy change. The collector traces only the live property count,
as after an ordinary removal. Truncation does not invoke getters, setters,
or finalization during the validated removal loop.

The fixed insertion/truncation transition fixture and its pure reference
and lowering checks cover dense append, partial/zero reduction, reuse with
heap values, trailing holes, definition, preallocated holes, deletion and
reinsertion, named and symbol keys before indices, accessors, inherited
setters and data, dense and out-of-order non-configurable barriers, strict
failure, failed definition making length read-only, non-extensibility,
length conversions and abrupt completion, SameValue and Proxy writes.
The existing Array constructor arbitrary, domain identity, shrinking, seed
0x60003f00, twelve cases, both policies and 180000 ms limit remain fixed.
Every transition remains present while its existing numeric payloads shrink.
The historical file weight has not measured these added transitions.

Pure Node/Deno reference and compiler checks validate the test source and
lowering without invoking a C toolchain. The following focused executions
validate the expanded runtime on their exact sources; they do not replace
the later observation, review and candidate-CI requirements.


Expanded fixed-source correctness
---------------------------------

Primary source `c2b039c573ef3f265b6af52bb7b27179c4d518f0`, tree
`38557606a2651cb8f8c5c346d5727257eb4d18de`, is the expanded implementation.
Its parent `9fde8122b929f2e95ebfd8111ec47e9a0e7c29c7` normally merges the
lookup source with fixed C3 `ccde36cd1e57d22f44d61fd919ca6ee5fe2ed04d`.
C3 changes the Script parser and generator stack-charge backend, so the
earlier a541 native proof was not treated as complete reanchor validation.

The accepted focused run retains thirty native observations: these five
fixtures under both specialization policies in each of three lanes:

 -  `array-indexed-lookup-transitions`;
 -  `array-insertion-truncation-transitions`;
 -  `array-constructor`;
 -  `array-prototype-mutation`; and
 -  `object-define-property`.

The lanes use actual NodeHost, actual DenoHost, and NodeHost with the real
Clang 22.1.8 host-compiler sanitizer toolchain. All ten fixture/policy pairs
agree across the lanes on complete expected/reference stdout, native exit
zero, empty stderr and counters. Forced safepoint collection yields positive
allocations and collections throughout. Existing applicable guard-miss,
disabled-policy, fallback and MIR assertions remain; these counters do not
measure hits in the new C runtime branches. Fixture flags and independent
Node/Deno references remain part of the retained driver evidence.

Six complete property executions, ordinary Zig and host-compiler sanitizer
for each family below, retain their arbitraries, size, shrinking/replay,
both policies, forced collection and original assertions:

| Family                   | Cases per lane | Seed       | Ordinary limit ms | Linux sanitizer limit ms |
| ------------------------ | -------------- | ---------- | ----------------- | ------------------------ |
| Array constructor        | 12             | 0x60003f00 | 180000            | 540000                   |
| Array prototype mutation | 12             | 0x60005c00 | 240000            | 720000                   |
| Object DefineOwnProperty | 12             | 0x60003700 | 180000            | 540000                   |

The existing Linux sanitizer task multiplies only the deadline by three,
not cases or size. Seven actual host-compiler readiness tests recognize
ASan heap-buffer-overflow and UBSan signed-overflow diagnostics in runtime
and generated code and check compiler selection. They include no intentional
LSan leak-readiness probe. The fixed and property runs retain default Linux
leak detection without suppression or `detect_leaks` overrides; their lack
of sanitizer diagnostics is bounded execution evidence, not a no-leaks proof.

The sanitizer controls introduce no external ptrace/strace process. One
hostCCdefine snapshot nevertheless records native PID 2732565 traced by its
same-name child 2732568. The literal
`all_observed_untraced_oom1000` predicate remains false. Root's version-matched
LLVM 22.1.8 assessment finds the pair consistent with LSan's internal
stop-the-world clone tracer; the snapshot does not establish exact helper
identity. Root accepted functional and enforcement proof with that explicit
qualification. No rerun, suppression or normalization was used, and no
universal TracerPid-zero claim is made. The earlier a541 external-ptrace/LSan
fatal attempt remains failed.

Both insertion/truncation policies also compile and link to explicit
`linux-aarch64-musl`, retaining ELF64 little-endian machine 183 artifacts.
These two cross-links execute no ARM program and supply no macOS evidence.
All twelve focused commands exited zero and drained naturally with the
actual 104G/no-CPU-quota scopes, OOM adjustment 1000 and zero OOM events.

Complete sources, driver inputs, C/MIR, requests, outputs, counter rows,
sanitizer diagnostics, resource records and the retained tracer predicate
are in `/data/m5c-array-expanded-native-validation-20261024/REPORT.md` and
its raw run directories. `ROOT-TRACER-ASSESSMENT.md` and
`root-final-acceptance.json` there record the qualification and acceptance.
Normal successful property/probe cleanup remains unchanged; retained fixed
artifacts do not imply every successful property binary was kept.


Same-original-helper measurements
---------------------------------

The private expanded diagnostic composition is
`91cc81574ef87fb2124cb745003835071ca3be87`, tree
`9b4a5236882395d20687e2d4fba10102703e1787`, sole parent lookup-only
`74ba6573473635178c775b6087c3d5210db8909c`. Its only delta from that parent
is the two actual c2 runtime files, +40/-6. Packages, tools and selected
build/dependency configuration match primary c2. The original full helper,
10,000-element chunk, registration, upstream data, assertions and ordinary
GC policy stay equal to the prior measured composition. This private source
is not the Array publication candidate or a RegExp helper admission.

Matched retained baselines are original
`3bc6ab35a6f8eb24ffdad36bd8d428e6bde568d8`, tree
`4b3aea2a6171bd4c5417c738a188b753d6533934`, and lookup-only 74ba, tree
`4bc3fa8fc57ba8a0792df113a56bba0112012f5d`. Complete packages/tools and
selected input equality between measured 74ba and reanchor 9fde justify
that specific baseline reuse. No BEFORE, warmup or repeat was rerun.

Every source/subject observation runs all four original strict/sloppy and
enabled/disabled variants, classification pass, actual execution, exit zero
and empty native stdout/stderr. Exact name filters select one original
subject; filtered registrations are not unsupported-host skips.

| Subject      | Original native union s | Lookup-only native union s | Expanded native union s | Incremental ratio | Overall ratio |
| ------------ | ----------------------- | -------------------------- | ----------------------- | ----------------- | ------------- |
| ASCII        | 224.009661              | 157.380816                 | 5.775870                | 27.247985x        | 38.783710x    |
| Surrogate    | 225.839902              | 158.263050                 | 6.585524                | 24.031960x        | 34.293383x    |
| Word control | 0.016141                | 0.016654                   | 0.014355                | 1.160126x         | 1.124433x     |

These are single Linux observations using ordinary Zig process-only
strace. Native interval union has the same exec-to-exit definition across
sources; concurrent interval sums are occupancy, not wall or CPU time.
Command clock boundaries differ: the new inner clock excludes scope
launch/drain, unlike the old outer wrapper. Compilation, normal cache
history, the time gap and tracing also affect command comparisons.
The millisecond word-control difference establishes no reliable change.
Historical ASCII 235.573s is a separate run, not a denominator above.
No variance, whole-corpus/CI/Mac speedup or deadline guarantee is established.

The complete old and new measurements, original variant diagnostics,
source hashes, compiler/link/native intervals and limits are retained in
`/data/m5c-array-lookup-benchmark-20261024/REPORT.md` and
`/data/m5c-array-expanded-benchmark-20261024/REPORT.md`. The latter's
`comparison.json`, `measurements.json` and `root-final-acceptance.json`
retain unrounded results and Root acceptance. Zig benchmark execution does
not replace the separate primary host-ASan/UBSan/LSan evidence.


Evidence validity and remaining gates
-------------------------------------

Documentation-only successors may retain this focused evidence only while
packages, tools, compiler/runtime interfaces, tests and input bodies remain
exact c2; the benchmark retains its intentionally different full helper.
Runtime, generator or interface fixes require an explicit impact assessment
and Root-routed revalidation. Existing native-shard weights are historical
CI-derived sums, not fresh measurements of the expanded transitions. The
local constructor property time is not a controlled CI weight ratio.

Array adds no fresh test262 observations. The fixed C3 input contains
29,147 reviewed paths, including all 836 B15 records and 28,311 prior
records; this node does not alter their partitions, classifications, ledger,
approvals or owners. C3's inherited prospective graph marks are conditional
on exact candidate and Main CI success. At Root's 2026-10-24T12:01:13Z
handoff, Main `44c46bfc` was still in CI and the last confirmed green Main
had 48 landed nodes. Later Main CI results are separate Root evidence;
unrelated moving refs do not invalidate this fixed snapshot.

Array stays ready, unlanded and a terminal-audit prerequisite. Publication
requires completed internal and outer reviews, a fresh full UPDATE and exact
candidate/Main CI. These focused reports do not mark the node complete or
authorize publication. Review records belong in their actual ledgers and
reports, without treating one clean stage as gate completion.


Physical completion storage correction
--------------------------------------

Two Main attempts on the exact candidate tree interrupted the unchanged
Array constructor property at its 180,000 ms limit after ten tests. The
candidate completed that property in 150,259 ms. Those observations prove
neither a semantic counterexample nor a runner flake. The full generated
program retains both fixed Array transition sequences in every case; its
larger C/MIR and repeated native builds are cost inputs, not a measured
explanation of the interrupted interval.

The source correction starts from shared composition
`99e0c9cd426573a60c7da98a2290a9c5d5f1a830`. It assigns sorted, distinct
physical slots to the completion identities actually used by each emitted
function or fragment phase. Generator entry and resumed bodies share one
layout, as do outlined helpers. Metadata and saved-value roots use the same
mapping. Logical jump destinations, cleanup depth, error provenance and
resume points do not change. Identity zero remains a real storage slot for
a directly resumed throw; a saved control target zero remains a sentinel.
There is no lifetime-based reuse or change to public MIR or runtime ABI.

Physical root allocations, generator storage counts and the appended
non-strict receiver root use the compact layout. Existing logical
`completionSlotCount`, `rootCount`, `functionFrameCosts`, callable macros,
`scriptFrameCost`, guards and enter/leave ordering keep their prior values.
Reducing storage does not lower the logical native-frame charge. Saved
completion values remain traced for the same frame or suspension lifetime.

Source tests cover sparse identities, missing slots, implicit copies,
fragment isolation, nested abrupt/finally/iterator paths and generator
return/throw/await transitions. The original property, both transition
blocks, every oracle, assertion, seed, twelve cases, specialization policy,
forced-collection check and deadline remain unchanged. Pure reference and
C emission checks do not establish native semantics or a deadline benefit.

The fixed correction is `f26a74bf60d6d85df9e467f7a8d90154bc006ec0`, tree
`abc68d461aac7b15d1881018918c45e855cc5d06`. The source-only phase executed no
native code. The separately authorized focused Linux phase below observed
that exact source; earlier U99 and runtime measurements remain bound to
their original commits.


Focused Linux completion-storage evidence
-----------------------------------------

Four original entry points passed once in order on Linux x86\_64 with Node
v24.21.0, Deno 2.9.7 references where owned by the entry point, and Zig
0.16.0. This is Node-host native execution, not a separate Deno-host native
lane. The explicit target was `linux-x86_64-gnu`; retained compiler commands
include address/undefined sanitizer flags. No independent sanitizer
readiness probe ran, so flags alone do not prove instrumentation activity.

| Original command                                                   | Raw registrations/passes/failures | Runner wall seconds | Raw stdout                                                                                               |
| ------------------------------------------------------------------ | --------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------- |
| `node --test tests/property/m5-array-constructor.property.test.ts` | 1/1/0                             | 51.196210359        | [Array](/data/m5c-completion-storage-native-20261025/task_cc1f1ec8b2fb/01-array.stdout)                  |
| `node --test tests/runtime-generator-dispatch-stack.test.ts`       | 7/7/0                             | 47.700369348        | [Dispatch](/data/m5c-completion-storage-native-20261025/task_cc1f1ec8b2fb/02-generator-stack.stdout)     |
| `node --test tests/tco-generator-interop.test.ts`                  | 1/1/0                             | 13.929496694        | [Interop](/data/m5c-completion-storage-native-20261025/task_cc1f1ec8b2fb/03-tco-interop.stdout)          |
| `node --test tests/proper-tail-calls.test.ts`                      | 9/9/0                             | 9.360440990         | [Tail calls](/data/m5c-completion-storage-native-20261025/task_cc1f1ec8b2fb/04-proper-tail-calls.stdout) |

All 18 registrations passed. The four commands exited zero with empty
stderr and no failed, cancelled or skipped tests. Each used fresh capacity,
choom 1000, one mise job and the existing nonblocking heavy runner. Exact
source/tree, tracked modes and clean status were verified; all 34 stashes
were preserved. Every runner and owned scope drained naturally before the
next command, with the last drain verified at 2026-10-24T21:29:51.169719Z.
The
[native packet](/data/m5c-completion-storage-native-20261025/task_cc1f1ec8b2fb/REPORT.md)
retains original stdout/stderr, command receipts, process/scope identities,
source bindings and a recursive SHA256 inventory.

The Array property keeps both complete transition blocks, all oracles and
assertions, twelve cases, seed 1610628864, both policies, forced GC,
positive collection/guard-miss assertions and its 180,000 ms deadline.
The existing safety suites passed their suspension/throw/return, iterator
and finally cleanup, realm/derived-constructor and TCO resource assertions.
Dispatch guards still reject with the exact `OSEO2001` frame diagnostic;
interop also asserts zero active-frame charge, call depth and root chain at
teardown. The non-tail tests retain their modeled resource rejections.
Source loops imply 59 native subject/policy variants, including 17 expected
rejections; these are not 59 raw registrations or printed numeric counters.

Successful numeric GC/guard/frame values are not printed. Successful C,
MIR and binaries are not archived by these normal test entry points.
Fourteen expected-rejection directories remain as actual error evidence:
twelve dispatch variants and two interop guards, including original C,
binaries and native observations. Their expected exit-one diagnostics do
not mean the test commands failed.

The corrected Array property duration was 50.920130469 seconds; the
separate original U99
[baseline](/data/m5c-array-native-baseline-20261025/task_595ce367bff5/REPORT.md)
was 36.480273056 seconds, with runner wall 36.736795027 seconds. Both retain
the same complete property contract. The baseline used
*/data/zig-cache/m5c-source4-no-tco-update*, while the correction used
*/data/zig-cache/m5c-primitive-wrapper-objects*. Neither was flushed or warmed
for measurement, and cache equivalence, causality and variance are
unestablished. There is no observed Linux speedup, macOS benefit or deadline
repair. The historical helper benchmarks above do not supply that proof.

A new full UPDATE must observe this backend composition from its own clean
U and retain its distinct R; historical U99 observations cannot supply
those results. Full ordinary/extended, sanitizer and cross-host gates,
exact candidate/Main CI and the Mac deadline question remain pending.
Root owns review retention, integration, publication and any separate
CI-capacity decision. No graph landing status or test262 classification
changes in this correction or its focused evidence.


Physical C-unit source preparation
----------------------------------

The single authorized ordinary diagnostic at original source `d2100e07`
passed in 61,914.844845 milliseconds, with 62.24 seconds of GNU time wall
and 124.47 seconds of aggregate user/system CPU. Its 250-millisecond owned
process samples recorded at least 87.48 seconds of compiler-family self CPU.
Twenty-three sampled generated build requests each named four C units;
22 named a reused runtime archive. Samples miss short processes and tails,
so they do not establish exact phase percentages, complete build counts,
GC cost or the cause of failed extended CI. The source-bound raw report is
*/data/m5c-array-ordinary-observation-20261025/task\_3a45bc280d31/REPORT.md*.

The bounded emitter change retains the aggregate C source and the existing
unit assignments. Each native unit materializes only the definitions its
selector already admitted, preserving common declarations and each static
object's definition/extern ownership. Generic resource guards stay intact.
Blank excluded lines and an aggregate-source `#line` mapping preserve logical
C source coordinates. The change does not alter outlining widths, compiler
flags, the native ABI, collection, roots or logical frame charges.
The existing context-balance and generator-frame test backends propagate
their exact teardown replacement to each physical unit as well as the
aggregate. This preserves the assertion sites previously reached through
the aggregate include, without adding assertions to units without a hook.

The complete original Array property and both transition helpers stay
byte-identical, with both policies, independent Node/Deno oracles, false
hints, generic fallback, positive forced collection and guard-miss assertions.
No fixed subblock or varying payload is extracted from its coupled program.
Pure token-equivalence and source-structure tests are preparation evidence;
they do not establish a native pass, measured speedup or deadline repair.
Root owns later native admission, affected independent reviews, D3/UPDATE
judgment and exact candidate/Main CI before this node can land.


Current Array-only source on successful F3 Main
-----------------------------------------------

The current preparation composes exact Array `646fadd5` source on green
Main `128d63fc`, tree `6753319f91a7e4805e63becb5e5f4db39586a767`.
Main run `40205743337` succeeded in all 78 jobs and the workflow. F3 remains
landed with its current implementation, corrected contracts and two property
domains. The historical evidence above retains its original inputs and
limitations; it supplies no new native or performance result for this source.

Main's non-Array runtime bytes remain, including the current F3 iterator and
all descriptor, property, primitive, Proxy and internal-header code. Only
Array indexed lookup/insertion and dense truncation runtime changes are
composed. The backend and private assertion mapper retain Array646's
completion layout, general dispatch/sentinel fixes and physical units.
Shared backend/helper contracts require D1.9 impact assessment.

This node remains ready and unlanded. Set, RegExp and TCO implementation and
admission are absent from the preparation delta. The live joint `808391c8`
Full continues independently and its R is not certified for these different
inputs. Root owns actual D3, future native/Full decisions, independent review
retention and final publication. All reviewed data and reservations remain
exact Main; this phase observes no corpus or native program.
