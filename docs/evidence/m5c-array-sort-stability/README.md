Array sort stability within the frame budget
============================================

M5c node `array-sort-stability` owns exactly
*test/built-ins/Array/prototype/sort/stability-2048-elements.js*. It admits
that unchanged path without raising the native frame ceiling, changing
comparison order, or weakening the upstream stability assertions.


Minimized cause
---------------

Constructing an array literal of 2,048 objects with two fields, followed
only by `console.log(a.length)`, reproduces
`OSEO2001 Maximum active native frame budget exceeded`. No call to `sort` is
necessary. Generate its source with:

~~~~ ts
const source = `const a = [${Array.from(
  { length: 2048 },
  (_, index) => `{ name: "A${index}", rating: 2 }`,
).join(",")}]; console.log(a.length);`;
~~~~

The disabled-policy MIR requests 94,237 logical identities: 22,534
safepoints, 22,534 status checks, and 24,584 root annotations account for
69,652 of them. These annotations produce no stored JavaScript value.
The C backend previously used the largest operation ID as the storage
range, making annotations consume the same frame budget as real values.
The runtime's stable bottom-up merge is iterative and is never reached
by this reproduction.

The backend now assigns dense storage identities to values while retaining
the public SSA MIR. It remaps operation arguments, block parameters and
edge arguments, return and branch operands, argument-list references,
checked scalar results, auxiliary iterator roots, and generator suspension
values. Every value retains a distinct slot for the whole frame; separately
reserved capacity is preserved. The minimized program's C root allocation
is 24,587 slots and prints `2048`. The existing 65,536-slot active frame
ceiling remains in effect, so larger actual-value frames and aggregate
recursive frames still have a finite boundary.

Callable entries retain conservative logical frame charges
separately from compact heap-root allocation. Unoptimized sanitizer code
keeps C expression temporaries on the stack, so compacting heap roots must
not admit deeper wide recursion. A 3,000-binding frame uses 6,017 heap-root
slots but Zig's unoptimized UBSan object reserves 1,033,856 C stack bytes;
charging only compact roots allowed a segmentation fault before OSEO2001.
The unchanged wide-recursion scenario now retains its budget diagnostic,
and a 1,000-binding regression checks both specialization policies. Script
entries also need a native-stack bound: the 25,000-declaration script from
the coordinator's review exhausted an 8 MiB stack with a 50,006-slot
compact charge. Script charges now include two units for each binding access
in addition to dense value slots. These account for cell-lookup or creation
and binding-access result-returning calls, without charging sparse SSA gaps or
array-literal annotations. Heap root allocation stays compact. Both
whole-script and fragment entries use this separate charge, and the
25,000-declaration regression checks OSEO2001 under both policies.
The exact source declares `const v0=0;` through `const v24999=24999;`,
then calls `console.log(v24999)`. Before the fix it terminates with SIGSEGV
under disabled specialization on Linux x86-64 with an 8 MiB stack. After
the fix both policies report the owned frame-budget diagnostic before
entry, with the same 50,006-slot heap allocation and a separate 100,008-slot
charge. Neither the 65,536-slot ceiling nor any case budget changes.


Evidence
--------

*packages/backend-c/tests/index.test.ts* pins annotation compaction, source
MIR immutability, auxiliary iterator and argument-list remapping, generator
state, and large argument scans. The focused compiler and backend suites
pass 171 and 21 tests respectively, and TypeScript checking passes.

*tests/native/fixtures/array-prototype-sort.ts* pins 2,048-element `sort`
and 4,096-element `toSorted` literals. Both compare every sorted element
against an independent cyclic-key bucket model and its original object
identity. The copy case checks that every source element is unchanged.
*tests/native.ts* executes both specialization policies, requires actual
guard hits and a deliberate shape miss reaching generic fallback, and
forces collection at every safepoint throughout construction and sorting
in the 2,048-element fixture. The 4,096-element fixture uses normal
collection policy, pins zero observed collections before teardown, and
requires more than 4,096 allocations. Normal policy does not collect
under allocation pressure in this runtime.

The initial focused replay forced collection in all four executions and
passed; its 4,096-element timing is an experiment, not the final schedule:

| Length | Policy   | Seconds | Collections | Guard hits | Guard misses |
| ------ | -------- | ------- | ----------- | ---------- | ------------ |
| 2,048  | disabled | 78      | 132,018     | 0          | 0            |
| 2,048  | enabled  | 69      | 115,377     | 16,641     | 24,835       |
| 4,096  | disabled | 275     | 292,472     | 0          | 0            |
| 4,096  | enabled  | 245     | 254,805     | 37,667     | 54,053       |

The final normal-policy 4,096-element replay passes under both policies:
23.254 seconds disabled and 23.448 seconds enabled, with zero collections
before teardown and 149,217 and 111,550 allocations respectively. Enabled
execution records 37,667 guard hits and 54,053 misses. Together with the
selected forced 2,048-element runs (78.052 and 69.495 seconds), the four
pinned executions add about 194 seconds of measured Zig wall time. Native
fixtures are not individually sharded; the new property's estimates are
registered in *tools/native-shard-costs.ts*.

*tests/property/m5-array-sort-stability.property.test.ts* reserves seed
block `0x60008400` through `0x600084ff`, with two ordinary cases and a
180-second interrupt. It generates literal lengths from 2,048 to 2,056,
extending to 4,096 in the extended tier, three to seven keys, cyclic offsets,
and both methods. Its executable bucket model is independent of merge
sorting; Node.js and Deno agree with every complete order and identity
check. The ordinary focused property passes in about 66 seconds. Its
extended tier passes 20 cases under both policies in 837 seconds,
including generated lengths beyond 2,048.

The unchanged upstream test also passes strict and non-strict execution
under disabled and enabled specialization, using the checked-in base
harness. The existing generated sorting property at seed `0x60005100`
passes its ten ordinary cases with forced collection under both policies.
Fable round one found a line-length gate failure and suggested explicit
reserve and control-flow edge checks; those were added. Round two returned
exactly `No issues found.` with no backend remapping defects. Round three
corrected the fixture timeout rationale; round four identified the
impossible normal-policy collection assertion, which now pins zero
collections and more than 4,096 allocations while keeping guard evidence.
After repairing the aggregate gate's callable-stack regression, round five
returned exactly `No issues found.`. The review converged within five
rounds using `claude-fable-5-1`.

An initial experiment forcing collection at every safepoint in every
large generated case hit the 180-second interrupt. The coordinator approved
normal collection for generated cases. Final Fable review found that the
pinned runner has no individual execution timeout: the actual constraint
is the sanitizer native CI job's 75-minute limit. The coordinator superseded
the earlier scheduling approval: force collection at every safepoint in
the 2,048-element fixture under both policies, and use normal collection
in the 4,096-element fixture. All semantic checks and property case and
time budgets remain unchanged. No runtime collection policy changes.


Manifest and gates
------------------

After rebasing onto `b2998120`, the complete reviewed regeneration
passes 21,677 paths in 2,741 seconds with eight native workers and no
retries. Reviewed paths move from 21,676 to 21,677, passes from 18,669 to
18,670, and unreviewed inventory from 19,415 to 19,414. Expected negatives
remain 1,560 and unsupported profile features remain 1,447, with zero
semantic, harness, or infrastructure failures and no out-of-scope
classification changes. The ledger records the target as `[pass, observation]`.
Observation-batch-01 shrinks from 307 to 306 paths and no longer depends
on this node; its landing and status fields remain unchanged. The graph
baseline follows the complete manifest, and its summary remains unchanged.

The initial aggregate gate passed the complete Test262 set but exposed
the wide-recursion stack charge regression described above. The unchanged
scenario is preserved; the backend now separates physical roots from the
conservative callable frame charge. The focused 3,000-binding
enabled replay and 1,000-binding replays under both policies now report
OSEO2001. Backend tests and repository checks pass; the fifth Fable review
is clean. The final full regeneration repeats all 21,677 paths in
2,798 seconds with no classification changes or rewritten partitions.
The final repository check passes, and `MISE_JOBS=1 mise run test` passes
in 4,836 seconds after the authorized hash refresh below. The extended
gate passes all package properties and all 226 native tests in 3,473
seconds, with zero failures, skips, cancellations, or TODOs in its native
suite. All gates use the lane cache and run detached in sequence.

The final graph-only rebase onto `0d898824` applies the coordinator's
69-node graph and landing marks without changing runtime observations.
Its graph changes are the baseline counts and batch-01 path count and
dependency; its own landing and status remain for the coordinator. Graph
and batch validators, all 15 graph tests, and the complete repository
check pass after rebasing. Remote CI and landing remain coordinator work.


Whole-Script output baseline
----------------------------

The final aggregate passed native fixtures but exposed the intentional C
output change in *tests/harness-fragment-baseline.json*. Regeneration
replayed the pre-change backend at `b2998120` against the current printed
HIR and MIR and reproduced all 44 old hashes. All 44 new hashes differ
only because emitted C source changes its compact root identities,
allocation sizes, auxiliary storage identities, and annotation padding
in frame accounting; non-source metadata and printed HIR/MIR are unchanged.
The focused harness fragment suite passes all 14 tests. Existing whole
and fragment semantic comparisons and native fixtures passed before the
baseline refresh. The coordinator authorized this derived-data refresh
and requested a focused supplemental Fable review, which returned
exactly `No issues found.`.

The coordinator's script-entry stack review requires a second refresh:
the separate binding-access charge changes whole-Script entry C.
Replaying backend commit `fb5d1cb0` reproduces all 44 prior hashes;
printed HIR/MIR and non-source metadata remain unchanged.

The standalone Zig ASan probes are existing TODO cases rather than gate
failures. Two isolated runs exit successfully with UBSan passing and ASan
TODOs; no toolchain code or expectation changes were needed.


Script-entry review and current-main regeneration
-------------------------------------------------

After the coordinator's review, script binding accesses add two native
charge units independently of dense heap roots. Fresh replays on an
8 MiB stack reject the exact 25,000-declaration script with OSEO2001
under both specialization policies. The unchanged upstream stability
test passes strict and non-strict variants under both policies; wide
recursion keeps OSEO2001, and the 4,096-element fixture passes both
policies. All 24 backend tests pass.

The fix was committed before rebasing onto `4032a770`. Reindexing the
merged partitions and the complete 22,011-path regeneration then pass
with 18,995 passes, 1,560 expected negatives, and 1,456 unsupported
results in 2,882 seconds, with zero retries or classification changes.
Current main has 22,010 reviewed paths and 18,994 passes; this lane adds
only its owned stability path, leaving 19,080 inventory paths unreviewed.
The derived ledger and observation batches are regenerated from that
manifest, and the graph baseline follows it without changing node status
or landing fields.

The final Fable review found two obsolete pre-rebase commit references in
the hash-refresh evidence. Both now name reachable commit `fb5d1cb0`;
the follow-up round returned exactly `No issues found.`.

The repository check passes after formatting the new evidence paragraph.
The serial aggregate gate passes in 5,154 seconds: all 272 native fixtures
agree with Node.js and Deno, and all 22,011 reviewed Test262 paths match
the manifest. Node reports 1,539 tests with zero failures, five
skips, and the two existing Zig ASan TODO cases. The extended gate passes
in 3,469 seconds, including all 226 native tests with zero failures,
cancellations, skips, or TODOs. Package properties pass under both hosts.

The coordinator then requested a final rebase onto `813c95d6`, which adds
macOS CI scheduling and a graph-only destructuring prerequisite. The
rebase preserves the regenerated baseline together with main's new node,
collision groups, and batch-05 dependency. Compiler, runtime, harness,
and reviewed observations are unchanged by that rebase. The coordinator
explicitly retained the full regeneration, ordinary, and extended gate
results and requested only repository and focused graph/CI checks after
rebasing. Remote CI and landing remain coordinator work.

After the final rebase, the complete repository check, all 43 macOS-lane
and M5c graph tests, and the graph, ledger, and observation-batch checks
pass. The graph retains all 73 nodes, including main's new prerequisite,
with its node status and landing fields unchanged by this lane.


Sanitizer repair after the revert
---------------------------------

CI run 37685350484 exposed two failures after the first landing: clang's
unoptimized sanitizer IR for a wide script used 13.8 GiB of peak compiler
memory locally, and the 1,000-binding recursion overflowed the macOS ASan stack
before its logical charge exhausted the frame ceiling.

The runtime exposes its unchanged 65,536-slot ceiling to generated C. A
preprocessor guard replaces any function body whose entry charge always exceeds
that ceiling with a small diagnostic stub. The outer entry still requests its
original charge before running any source operation. Both 25,000-declaration
cases remain in the native scenario, under both specialization policies, so
their rejection contract is still exercised under every selected toolchain.
Their bodies never enter sanitizer IR.

The successful script companion uses 4,096 declarations. It proves ordinary
non-recursive script execution without retaining the former 16,000-declaration
admitted build, whose clang -O0 IR was itself a compiler memory stressor. The
rejected cases still reach the original frame boundary; this companion does not
substitute for them. The large-literal fixtures and backend charge assertions
retain independent admission and layout evidence.

The host C toolchain explicitly supplies `OSEO_CALLABLE_FRAME_MULTIPLIER=8u` to
generated and harness C. Generated callers charge and release the same
logical count through `OSEO_CALLABLE_FRAME_COST`, preserving the 32-slot
fixed overhead and multiplying only the additional slots. The ordinary
toolchain defaults to one. The multiplier applies only to callable frames,
which can accumulate through recursion; script admission still accounts for
compact roots plus binding accesses. The 1,000-binding recursion first proves
its base case can enter, then requires OSEO2001 at depth 100. Runtime ABI
`m5-128` records this new generated-code contract without changing a structure
or function signature.

Measurements below passed, and the Linux host C sanitizer gate matched all
272 native fixtures in 1,363 seconds. Full manifest regeneration matched
all 22,424 paths in 3,126 seconds with 19,309 passes, 1,648 expected negatives,
and 1,467 unsupported paths; no other classification moved. Ledger,
observation batches, and graph baseline were regenerated. The static,
ordinary, and extended gates passed with the lane Zig cache. Both
independent reviewers were clean in round four. macOS native execution is
unavailable here.


Tracked continuation-dispatch boundary
--------------------------------------

Astra's second review found an existing gap outside this repair: resumed
generator and async bodies have no aggregate native-frame charge. A wide
generator recursively calling another generator's `next()` can accumulate
C frames after each construction charge has been released. This change
retains the existing dispatcher behavior. At the coordinator's direction,
*docs/m5c-graph/nodes/generator-dispatch-stack-charge.yaml* records a bounded
follow-up with nested generator and async evidence across every toolchain,
including host C sanitizers. It remains an M5 exit dependency, and the graph
serializes its manifest regeneration with independent remediation nodes.


Measured compiler and frame usage
---------------------------------

On Linux x86-64, Clang 22.1.8 compiled the affected programs at its default
`-O0` with ASan, UBSan, debug information, and frame pointers through the
selected `host-cc` toolchain. `/usr/bin/time -v` wrapped each generated-program
compile and link. Builds ran serially, began with at least 20 GiB available,
and stayed below the 8 GiB stop threshold. The historical 13.8 GiB peak comes
from the dispatch's pre-revert reproduction; that unsafe build was not rerun.

| Probe                           | Policy   | Peak compiler RSS (KiB) | Build seconds | Result                  |
| ------------------------------- | -------- | ----------------------- | ------------- | ----------------------- |
| 1,000-binding callable          | Disabled | 418,400                 | 2.63          | Admitted, then OSEO2001 |
| 1,000-binding callable          | Enabled  | 418,992                 | 2.02          | Admitted, then OSEO2001 |
| 4,096-declaration script        | Disabled | 2,436,080               | 11.57         | Prints 4095             |
| 4,096-declaration script        | Enabled  | 2,435,920               | 12.40         | Prints 4095             |
| 25,000-const declaration script | Disabled | 112,524                 | 0.23          | OSEO2001 before entry   |
| 25,000-const declaration script | Enabled  | 112,160                 | 0.23          | OSEO2001 before entry   |
| 25,000-var declaration script   | Disabled | 122,768                 | 0.26          | OSEO2001 before entry   |
| 25,000-var declaration script   | Enabled  | 122,736                 | 0.26          | OSEO2001 before entry   |

The revised probes peak at 2.32 GiB, and the unchanged rejection probes peak
at 120 MiB. Both callable probes print `compact admitted` before their
budget diagnostic; neither an immediate rejection nor a sanitizer crash
satisfies that observation.

The same 1,000-binding callable was compiled, without linking, for Linux x64
and macOS AArch64 with `-fstack-usage` and both sanitizers. Freestanding
compilation uses the runtime header and Clang's target integer types, omitting
only unused system math and allocation includes. Both specialization policies
report 345,912 stack bytes on Linux and 547,072 on macOS. The macOS prologue
subtracts `0x85000 + 0x8e0`, saves 32 bytes, and aligns to 32 bytes, giving a
547,103-byte upper bound for this generated frame, including alignment slack.

Its original 4,038-slot charge admits sixteen simultaneous callable frames,
whose macOS generated frames alone exceed 8 MiB. The explicit host C charge
is now `32 + (4038 - 32) * 8 = 32080`. Only two such frames fit below the
unchanged 65,536-slot ceiling, so their generated macOS stack use is bounded
by 1,094,206 bytes before the third entry reports OSEO2001. This is compiler
layout and Linux execution evidence, not a macOS native semantic pass; Apple
Clang and macOS execution remain CI evidence.

Raw measurements and disassembly are retained under
*/data/array-sort-sanitizer-task\_09aaf50a4a8f/*.


Final local gates after the repair
----------------------------------

Every gate used */data/zig-cache/m5c-array-sort-stability/* and ran serially
with `MISE_JOBS=1`.

| Gate                                             | Result                                                      | Seconds |
| ------------------------------------------------ | ----------------------------------------------------------- | ------- |
| `mise run check`                                 | Pass, zero compatibility overrides                          | 96      |
| `mise run test`                                  | Pass, including 22,424 corpus paths and 272 native fixtures | 5,364   |
| `mise run test:property:extended`                | Pass, 226 native tests and package properties               | 5,909   |
| `mise run test:sanitizer:native`                 | Pass, 272 native fixtures                                   | 1,363   |
| `mise run test262:update -- --accept-promotions` | Pass, all partitions unchanged                              | 3,126   |

The ordinary Node gate reports 1,541 passes, zero failures, five existing
skips, and two existing todos. Deno reports 759 passes, zero failures, and
two existing ignored tests. Extended native tests report no failures,
skips, or todos. The twenty-case large-literal property completed in
1,389 seconds within its unchanged 1,800-second deadline. No case count,
seed, size limit, timeout, shard total, or frame ceiling was lowered.
