Source-qualified TCO author evidence
====================================

Historical U68 execution
------------------------

The execution source is `68e298a9a96a6d22dc2e33b9e70b7c6a86720e41`, tree
`dcca1b0bf57b63d0446fab54c676f42a2ca19739`. It directly extends Array source
`cccb7195c1eb01a3963ffa043bafe045c333ff73`. Its complete TCO overlay retains
Array's guarded lookup, insertion, truncation and generic fallbacks, the Set
Receiver/descriptor contracts, and the existing compiler body/frame contracts.
The following runs observed this combined source with unchanged inputs.
They do not rebind earlier evidence to a new source.


Focused author execution
------------------------

Six original whole-command vectors completed naturally on 2026-10-26 UTC.
Counts are test-framework registrations and overlap between vectors; they
are not unique programs, native invocations or standards-path totals.
Every vector retained the original assertions, inputs, budgets and guards.

| Vector                                                           | Framework result           | UTC start → end                   |  Wall seconds |
| ---------------------------------------------------------------- | -------------------------- | --------------------------------- | ------------: |
| Runtime C, Node                                                  | 3 passed                   | 18:45:08.003118 → 18:45:12.729069 |   4.725867548 |
| Seven integration files, Node/Zig                                | 27 passed                  | 18:50:46.041662 → 18:53:33.253539 | 167.211673700 |
| Seven integration files, Deno/Zig                                | 27 passed                  | 18:56:29.604865 → 18:59:44.722901 | 195.117923715 |
| Sanitizer self, then Node/host-cc integration and Array property | 7 self + 28 focused passed | 19:02:40.490227 → 19:05:32.917356 | 172.427066585 |
| TCO and Array ordinary properties, Node/Zig                      | 5 passed                   | 19:09:20.781022 → 19:10:00.991633 |  40.210489776 |
| TCO and Array ordinary properties, Deno/Zig                      | 5 passed                   | 19:12:49.552262 → 19:13:56.709648 |  67.157332000 |

Every vector reported zero failures and no skipped, cancelled or ignored
registrations. The first command was `mise run test:node --` with:

~~~~ text
tests/runtime-tail-calls.test.ts
tests/runtime-ephemeron.test.ts
tests/runtime-weak-collection.test.ts
~~~~

It checks handwritten runtime C, including the existing sanitizer and
ordinary/forced-collection contracts. Its AArch64 Linux outputs are
compile-link evidence, not native semantic executions.

The second command was `mise run test:node --`, and the third was
`deno test -A`, each with these seven complete files in this order:

~~~~ text
tests/proper-tail-calls.test.ts
tests/test262-tail-call-optimization.test.ts
tests/tco-generator-interop.test.ts
tests/primitive-wrapper-objects.test.ts
tests/yield-star-throw-callability.test.ts
tests/primitive-set-array-interop.test.ts
tests/primitive-set-array-interop-preparation.test.ts
~~~~

The fourth used the original failclosed shell chain:

~~~~ sh
mise run test:sanitizer:self &&
  env OSEO_NATIVE_TOOLCHAIN=host-cc mise run test:node --
~~~~

Its arguments were all seven files above, followed by the complete
*tests/property/m5-array-constructor.property.test.ts* file. The original
suite identified Clang 22.1.8. The selftests retain genuine positive
ASan/UBSan controls and separate fake compiler-selection controls.
These are Linux AMD64 native observations, without a macOS execution claim.

The fifth and sixth used `mise run test:node --` and `deno test -A`, with:

~~~~ text
tests/property/m5-proper-tail-calls.property.test.ts
tests/property/m5-array-constructor.property.test.ts
~~~~

The TCO file retains three native domains with 8/8/6 ordinary draws and
stable seeds `0x60008900` through `0x60008902`, plus its independent pure
generator-contract registration. Ordinary limits remain depth 500, six extra
arguments and 180,000 milliseconds per domain, with shrinking and replay.
Both policies and the original forced-collection controls remain active.
The Array file retains 12 draws, seed 1610628864, its 180,000-millisecond
limit, both policies and original source/oracle. No property override was
set. Fixed deep examples retain 100,000 calls; that depth is not claimed
for every generated draw. Framework names do not imply reference-host
identity: files retain their literal NodeHost/DenoHost and reference choices.

The complete source-qualified six-vector packet, exact argv, raw framework
output and individual Root acceptance records are linked from the
[focused report](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/native68-all6-result/REPORT.md).
The ordinary results do not execute the extended profile or prove deadline
margin. Extended scale ten, seed 1592590339, large size, depth 1,200, 12 extra
arguments and 1,800,000 milliseconds remain unchanged. Historical Linux 1,726
and unmeasured macOS 286 scheduling weights are not current performance
measurements.


Full reviewed-corpus observation
--------------------------------

The original whole command was:

~~~~ sh
mise run test262:update -- --accept-promotions
~~~~

It ran once with the stock eight-worker pool and zero retries, from
2026-10-26T19:34:09.908932Z to 20:53:43.952864Z, and completed naturally
with exit zero after 4,774.043792156 seconds. The matching native target
was `linux-x86_64-gnu`; the pinned suite revision remains
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`.

All 29,901 reviewed paths were observed: 25,604 pass, 2,802 expected
negatives, 1,495 unsupported, and zero semantic, harness or infrastructure
failures. The only promotions were:

 -  *test/language/expressions/tagged-template/tco-call.js*
 -  *test/language/expressions/tagged-template/tco-member.js*

Their recorded strict executions include *base.js* and the original
*tcoHelper.js*, whose `$MAX_ITERATIONS` remains 100,000, under specialization
disabled and enabled. The feature list retains exactly one
`tail-call-optimization` entry among 147 features. The command itself wrote
their two accepted expectations, two result partitions, index summaries
and parity digest; those five output files were not normalized by hand.
All 29,901 paths remain, and the other 29,899 result records stay byte-exact.

Raw stdout, stderr and natural-exit metadata were saved before result
interpretation, followed by the complete 6,690-file output union. Every
archived/live byte, mode and file-set member was independently checked.
The 6,687 partitions, subset, index and parity are preserved in the
[Full packet](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/full-current68-leading-preparation/run-full/RAW-GENERATED-UNION.json).
The
[Full audit](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/full68-result-audited/REPORT.md)
retains the complete output diff and per-record pre/postimage hashes.


Execution and admission boundaries
----------------------------------

Every run used fresh capacity-scoped limits, one Heavy slot, jobs one,
`choom -n 1000`, its assigned physical cache and a fresh external temporary
directory. Each had live owned FD/kernel-lock verification, unchanged
execution inputs at exit and after two actual empty drains, and no foreign
Heavy owner. The Full's empty drains were 20:53:47.302238Z and
20:54:02.935329Z, 15.633091941 seconds apart. Polling can miss short processes;
observed actor counts are not an exact process census. Observer overhead is
not a calibrated causal slowdown or a compiler/runtime timing decomposition.

Root accepted the Full raw evidence at 20:55:52.840598Z. It was explicitly a
D10.1 leading execution while the admission data gate awaited actual result
records. The prior Full ended at 17:17:41.946545Z; the installed-command
start gap was 8,187.962387 seconds, exceeding the 15-minute target.
Coordinator interruption/resumption, current focused evidence, the reserved
Reg predecessor and source/readiness preparation remain recorded reasons.
The Reg predecessor is scheduling metadata, not TCO source or evidence.

The result commit preserves those actual observations and their two
accepted promotions. Derived observation ownership replaces remediation
only for these two passes. Other owners and all 41,091 inventory paths,
policy, ADRs, exclusions and unreviewed reservations remain unchanged.
The other 33 TCO-tagged paths remain unreviewed under observation-batch-32;
its accepted 199-path source plan supplies no new observation or execution.

The observation plan keeps its frozen feature/harness basis, selectors,
prerequisites, memberships and B32 reservations. Its current and final
executed-variant counts increase by four for the two newly observed strict
subjects under both policies. Any resulting rounded cost fields remain
projections from the plan's existing 2026-10-07 measurement; they are not
new performance measurements or changed execution budgets.

The admission data finding closes only after the actual result/evidence
contract and affected reviews complete normally. These author observations
are not candidate/Main CI, graph landing or publication. Earlier Native935
belongs only to `05c1f074`; Array `353a9f17` focused runs, mixed Reg/TCO
observations, and the failed 39/60 extended run retain their exact sources
and outcomes. No runtime/compiler input changed while recording this result.
A later execution-input change requires a new D3 observation-reuse decision.


Bitmap source f5 author execution
---------------------------------

The later bitmap candidate is source
`f5bdd44d4e3cf6ad893c493f54ee63a9078ab47f`, tree
`338371d472c6d9a7e1e3447fd9a63f05d87533c9`. Its runner diagnostics come
from `c6512593`; the compiler and TCO runtime retain the original U68 unit,
with the added environment heap-slot bitmap and ABI `m5-139`. The separate
leaf proposal is absent. Each following command ran once and exited
naturally zero with its original assertions and inputs:

| Whole command                                                                            | Actual framework or fixture result                                                  |   Wall seconds |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------: |
| `mise exec -- node --test --test-concurrency=1 tests/runtime-environment-bitmap.test.ts` | 1 passed, no failure or skip                                                        |   23.553155532 |
| `mise run test:sanitizer:runtime`                                                        | 18 passed: 3 pure contracts and 15 native registrations, no failure or skip         |  202.889302856 |
| `mise run test:native --shard 2/3`                                                       | 96/289 native matches, 96 AArch64 Linux cross-builds, common prelude and scenario 1 | 1570.951471303 |

The first and third used stock Zig 0.16.0 on Linux AMD64. The sanitizer
task ran its complete runtime file family and normal build through
`/usr/bin/clang-22`, Clang 22.1.8 (Fedora 22.1.8-4.fc44), with the stock
ASan/UBSan lane. It is not the old hosted CI Clang 21.1.8. The shard ran
2026-10-27T02:35:27.527103Z to 03:01:38.478642Z, with its second actual
empty drain at 03:01:54.609760Z. Both policies, every-safepoint collection,
reference engines, all 96 selected fixtures in original order, cross-links,
1,500-depth chains, grow 300, programs and budgets remained unchanged.

The bitmap fixture checks both collection modes, bitmap/tag reconstruction,
word boundaries and alignment, mutation and clone isolation, live weakly
observed edges, overflow guards and create/clone OOM/retry preservation.
Its graph assertions include cycles, shared cells, ephemeron activation in
both discovery orders, multiple pending values, foreign contexts and
weak/finalization behavior. These are assertion-based observations; numeric
GC counters, isolated inner timings, allocation totals and RSS were not
emitted. The sanitizer family also retains the ephemeron and tail-call
runtime contracts. Counts from the three commands overlap.

Original unfiltered raw hashes and Root acceptances are preserved in the
[bitmap packet](/data/m5c-tco-bounded-gc-perf-20261027/task_4eedb5ab9b04/ctx_bedd260e8c13/run/RAW-FIRST.json)
and per-stage run directories under the
[validation packet](/data/m5c-tco-gc-validation-20261027/task_bde09aabab17/ctx_ea7ee72735d4/).
Each command has three identical complete source snapshots, strict kernel
FD/fstat/fdinfo ownership, raw-five-first preservation and two actual empty
drains at least 15 seconds apart. Root independently accepted those facts and
the actual outcomes. The
[paired boundaries](/data/m5c-tco-gc-validation-20261027/task_bde09aabab17/ctx_ea7ee72735d4/COMPARISON.json)
retain all 96 fixture spans and both original raw hash sets.

The same original whole shard on c651 took 1867.195057852 seconds. Its
complete TCO fixture was 1464.7648 seconds versus 1187.4117 on f5; disabled
preparation/build/execution was 749.1230 versus 590.3368, and enabled was
714.3891 versus 595.9211. Whole-command wall time was 15.8657% shorter in
this one sequential pair. Tool binary bindings and case sequence match,
but source, cwd and assigned cache paths differ; cache warmth and
background load were uncontrolled. These outer helper intervals include
preparation, build and execution. They do not establish a general or causal
speedup, isolated GC CPU share, RSS benefit, hosted CI cause or portable
CI success. No extra probe, warmup, retry or profiling command was run.

These are source-bound author executions, distinct from any optional
reviewer-overlay probe. They did not execute the later source composition
on Reg candidate `98460f7c`. The historical U68 Full and R`7cb0ce0d`, the
failed C`32363a70`/CI40421004911 and the f5 author evidence keep their exact
sources and outcomes. At source preparation, the composed source retained
Reg's complete records and TCO unsupported expectations pending an actual
new Full; source admission predicted no promotion.


Full reviewed-corpus observation on the Reg composition
-------------------------------------------------------

After Root accepted the source review of U`e2dba363`, tree
`add0cbfc57c38c22fcca3b3a66ad06e62216d948`, the same whole command ran
once on that clean source:

~~~~ sh
mise run test262:update -- --accept-promotions
~~~~

It ran from 2026-10-27T04:28:26.260071Z to 06:22:20.206408Z and completed
naturally with exit zero after 6,833.946249858 wrapper seconds. The runner
reported target `linux-x86_64-gnu`, suite revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`, the stock eight-worker pool and
zero retries. It observed all 29,901 reviewed paths: 26,054 pass, 2,802
expected negatives and 1,045 unsupported. The only promotions were
*test/language/expressions/tagged-template/tco-call.js* and *tco-member.js*,
from unsupported to pass, with no demotion. Their records retain the
*tcoHelper.js* include and both strict specialization policies. The five
generated files are preserved unchanged as the result commit's manifest
output; the closure ledger, observation batch counts and graph baseline are
derived from it.

The
[raw packet](/data/m5c-tco-on-reg-source-20261027/task_a3465c4fec88/ctx_4892b5f41887/full-update-unarmed/RESULT.json)
records the natural exit, source proofs and two empty drains. Root audited the
raw counts and promotions before the result commit. This Full is not a
candidate/Main gate pass and supplies no macOS execution. Root owns affected
review and exact candidate/Main gates.
