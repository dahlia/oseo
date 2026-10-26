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


Current runtime-only source preparation
---------------------------------------

This private source ports only the Array runtime guards and six unchanged
coverage files from `5a0654b7ea80fc13b3db155d55af949e0dff5c9e` onto Set
candidate `e88f05cbaabe19242a4d15970162a9b5e3983b11`, tree
`2d5c3d46023e7eb876a40a9b06f26832b0348d5d`. It is a provisional D10.4
preparation, not an adopted performance fix. The Set candidate's publication
and effective-Main status remain Root decisions.

The earlier port remains fixed at
`60ac0f4a03aced882bcc8e694c5d35b121c054ad` on failed Set candidate
`a111c31eacb22f07ee514dab4372504b7470b161`. Its CI run `40330708448`
failed the native Object-prototype root-allocation injection: the test
expected OSEO2001 and observed OSEO3001. The corrected Set base changes
only that injection's source-match string from three root slots to four;
the diagnostic expectation remains unchanged. This preparation inherits
that repair and replays the same 13 owned Array paths from 60ac0f4a, with
only this bounded provenance update. The failed source and raw evidence
remain preserved. No runner variance or current execution success is
claimed; further native, model, Full and adoption work awaits Root GO.

The Array delta preserves Set's omitted-accessor metadata, primitive-receiver
Set and Proxy/descriptor behavior, property removal, array append, internal
headers and collector contracts. It applies only the indexed own-lookup guard,
the private dense-truncation helper and its existing length-reduction call.
It imports no compiler, packing, completion-layout, materialization, baseline,
toolchain, scheduling-weight, language-profile, ownership or exclusion change.
The six coverage files retain every original input, case, oracle, seed,
shrinking behavior, specialization policy and deadline.

The compiler, parser and backend remain byte-exact to the Set base and Main.
The original 44 whole-Script baseline stays at blob
`43a6e39af8dcd1695024e7d0a0b3e168d773ea19`; no digest update is part of this
source. Current source checks and any actual emitted tuples are recorded with
the fixed source, separately from native and performance evidence.

The same existing node is ready and unlanded. Restoring its exit-audit edge
and publication collisions changes the private graph shape to 90 nodes,
87 ready, three blocked and none parked. Its 55 landed marks are inherited
from the provisional Set candidate; Array adds no landed mark. At the start
of this preparation, effective Main was
`cf0902db05ee8a51a2801f5d70372bfc5ca37b48` with 54 landed nodes. No inventory,
closure owner, feature or observation baseline is changed here.

The donor's whole ordinary property executions are source-bound evidence.
At 5a0654, Node A naturally passed its 12-draw property, but its observer
missed live FD/kernel ownership proof; Root accepted semantic evidence only,
and the original control failure remains. Deno B and fail-closed host-cc
Node C passed the same 12-draw property with strict owned-FD/kernel proof,
source preservation and actual drains; C also passed seven sanitizer self
checks. The callback retains forced collection and both policies. Deno B's
reference executable was Deno, so it supplies no Node-reference claim.
These donor executions are not native validation of this composition,
fixed-fixture or AArch64 evidence, extended 120-draw completion, a speedup,
Full observations or CI success.

The following runtime and measurement sections are historical records on
their named fixed sources. The lookup guard, dense-truncation helper,
length-reduction function and pre-Set removal function in expanded c2b039c5
match donor 5a0654 byte for byte. Set changes the surrounding descriptor,
property and removal context, so that source bridge does not automatically
retarget old timings. Root must validate retained measurement equivalence or
authorize a faithful new before/after comparison. An actual candidate whole
property shard alone does not meet the original helper before/after
obligation, and no historical ratio below is claimed for this composition.

Performance comparison, fresh observations, impact reviews, actual native
and sanitizer evidence, and exact candidate/Main gates remain pending Root
decisions for the composed source. The actual property cohort must be
derived from the fixed composition's complete file set and inherited Set
weights; the earlier Main 6/7 whole-24 proposal is not its selection.

   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

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
are in */data/m5c-array-expanded-native-validation-20261024/REPORT.md* and
its raw run directories. `ROOT-TRACER-ASSESSMENT.md` and
*root-final-acceptance.json* there record the qualification and acceptance.
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
*/data/m5c-array-lookup-benchmark-20261024/REPORT.md* and
*/data/m5c-array-expanded-benchmark-20261024/REPORT.md*. The latter's
*comparison.json*, *measurements.json* and *root-final-acceptance.json*
retain unrounded results and Root acceptance. Zig benchmark execution does
not replace the separate primary host-ASan/UBSan/LSan evidence.


Historical compiler and candidate work
--------------------------------------

The complete earlier work note remains at this path in failed source
`f3cbc5198f9c45b75e2706b8cb2f2221d4ae8a98`. Its packing, donor, baseline
and candidate-CI records remain bound to their recorded sources, including
the failed 76-of-78 candidate and its incomplete Array draw sequence.
They are not current completion claims or compiler inputs for this source.
The old Array U/R/C53/74424 sources, private binding-helper 2ef323b2,
continuation-colocation a2ff390b, refs, stashes and raw records remain
preserved. No failed record or prior digest has been normalized or replaced.
This runtime-only preparation carries none of those compiler experiments.

The original helper, its 10,000-element chunk, upstream and Unicode data,
variant registrations, assertions and budgets remain unchanged. Historical
same-helper measurements retain their compilation, native-interval,
cache, tracing and variance qualifications. They establish no unmeasured
corpus, candidate-CI or macOS speedup for this preparation.


Current corrected-Set measurements
----------------------------------

At this later preparation stage, Root accepted the whole Array constructor
property and primitive-Set/Array interop module on fixed source
`5806cdf6869db1f24d80a7631e7fbbd6cd22f876`, tree
`21c9947fafe530e7901518b8fffcbbbf3244865c`. Node and Deno each passed both
registrations; the fail-closed host-cc Node vector passed both after seven
sanitizer self checks. The property retained twelve ordinary draws, seed
1610628864, small size and a 180,000 ms deadline, both policies and forced
collection. Deno's references used current `process.execPath` and explicit
Deno, so that vector supplies no
Node-reference claim. Positive counter and context-balance conditions were
asserted; normal successful cleanup does not retain per-case numeric rows.
Strict live lock/FD ownership, unchanged source and two empty drains were
verified. These remain source-bound Native records, not extended 120-draw,
whole-cohort, CI or performance results. Their complete packet is
[*REPORT.md*](/data/m5c-array-binding-read-helper-20261026/task_8aca3cfb73d0/ctx_fb58e3419995/corrected-set-author-vectors/REPORT.md).
The two Set state-prose changes in c46179fb leave those execution inputs
unchanged; earlier stage descriptions retain their recorded chronology.

Root also accepted one faithful original-helper comparison. Private BEFORE
`2d5a8d11f1cc16690d0f94663a9cc991fbd8a66e`, tree
`4ec94c48c019972b42cc743b321db7f246e7e135`, uses corrected Set runtime
preimages. Private AFTER `74b4a590521fbfa27f2e947ee941061c1413fbac`, tree
`8a72c530689d9f7958b66e888e8507b846a213c1`, changes exactly the three Array
runtime hunks in the two runtime files. Five identical borrowed Reg support
files remain private measurement inputs outside Array publication:
*tests/test262-regexp-utils-native.test.ts*,
*tests/test262-regexp-utils.test.ts*,
*tests/test262-well-known-intrinsics.test.ts*,
*tests/test262/harness/LICENSE* and *tests/test262/harness/regExpUtils.js*.
Neither composition is the publication candidate. Compiler, parser, backend,
baseline, helper chunk 10,000, source data, registrations, assertions,
strictness/policy variants and budgets match between the two sources.

Both ran the unchanged whole command
`mise run test:node -- tests/test262-regexp-utils-native.test.ts` with
ordinary GC. All four registrations and sixteen actual native invocations
per side exited zero, including all three original subjects' four variants.
Subject stdout/stderr remained empty and control assertions kept their
expected output. The recorded clocks are:

| Clock, seconds                 | BEFORE        | AFTER        |
| ------------------------------ | ------------- | ------------ |
| Whole direct command and build | 499.876714550 | 25.813427760 |
| Compiler/link interval union   | 32.036151171  | 9.533698797  |
| Native exec-to-exit union      | 462.997601509 | 12.613478184 |
| ASCII native union             | 234.253340244 | 5.840219975  |
| Surrogate native union         | 228.694822073 | 6.739456892  |

The observed native-union BEFORE/AFTER ratio is 36.706576x, with ASCII
40.110362x and Surrogate 33.933717x. These are single Linux observations.
AFTER follows BEFORE in the assigned cache; neither cold nor warm state is
certified. BEFORE overlapped a disposable Fable review at two CPUs/12G;
that review and Array source CHECK/hooks finished before AFTER. Both sides
used the same process-only strace and external observer. Interval categories
can overlap and are not additive exclusive phases. They measure wall time,
not CPU or exclusive helper, matcher or GC time. The millisecond helper and
word-control differences establish no reliable improvement. There is no
variance, corpus, CI, macOS or deadline inference, and adoption remains a
Root decision after the remaining gates.

Exact unrounded clocks, source/blob proofs, complete inputs, raw traces,
strict ownership, natural exits, source preservation, drains and these
qualifications are retained in
[measurement *REPORT.md*](/data/m5c-array-faithful-comparison-20261026/task_ed8b29a6ee97/ctx_600db5aa21fe/REPORT.md)
and its adjacent *COMPARISON.json*. No borrowed support file, Reg admission,
observation, ownership or exclusion is added to Array publication here.
