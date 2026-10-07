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
