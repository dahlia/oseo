Evidence gate throughput plan
=============================

Status
------

Implementation status: complete. The runtime archive reuse, concurrent
reviewed execution, compatibility ratchet, seed allocation registry,
infrastructure failure classification, and manifest record partitioning
checkpoints and per-family evidence lanes are complete.
This plan defines the cost contract for the reviewed evidence gates and the
checkpoints that keep that cost usable as the reviewed corpus grows. It does
not change any language semantic or the amount of evidence a semantic unit
must supply. Its one classification change is the named non-semantic
infrastructure checkpoint required by ADR 0013.

The measured before-state is recorded in
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md). Three
observations motivate the plan. Every native execution rebuilds a runtime
archive that does not change between reviewed cases, and across the recorded
samples building that archive is roughly 8 to 32 times slower than linking and
running a trivial program against an existing one. The reviewed test262 task
averages 1.00 processor-seconds for each second of wall clock, one
core-equivalent on a 16-thread host, while the property task averages 9.84. And
neither full-corpus run of the reviewed subset completed without native
infrastructure failures that the affected paths did not reproduce in isolation.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*CONTRIBUTING.md*](./CONTRIBUTING.md), and
[ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md). It does not restate
the measurement contract in [*PLAN-M5.md*](./PLAN-M5.md) or the property and
replay contract in [*PLAN-PT.md*](./PLAN-PT.md); it references them and names
the checkpoints that extend them.


Goal
----

At the baseline, `mise run test:test262` executes all 681 reviewed paths in a
sequential loop and rebuilds the unchanged runtime archive for each of its
1,192 native cycles. Linking and running a trivial program against an existing
archive costs 20-43 ms, while building that archive costs 333 to 641 ms,
roughly 8 to 32 times more across the recorded samples. Every unit pays the
whole accumulated corpus again, and that cost grows with the corpus rather than
with the unit.

No checkpoint changes case counts, result order, execution modes, sanitizer
coverage, or target coverage.


Non-goals
---------

This plan does not reduce required evidence. Making the existing
applicability judgment auditable is a separate question decided by
[ADR 0018](./docs/adr/0018-recorded-evidence-coverage.md); this plan only
carries the profile template that records it.

It does not replace the toolchain adapter, the C backend, or the collector, and
it does not introduce a second test runner or a second property framework.

It does not change the claim boundary, the counting rule, or any admitted
behavior. A checkpoint that would move a result from one classification to
another for a semantic reason is out of scope.

It does not add a milestone. Checkpoints land beside M5 semantic units.


Preserved invariants
--------------------

Every checkpoint preserves these, and each has a test that fails when a
checkpoint breaks it:

 -  the reviewed result order that shard reconstruction selects from,
    regardless of completion order;
 -  one counted result for each upstream source path, never duplicated,
    dropped, or merged;
 -  reuse that is indistinguishable from a rebuild, under a key covering every
    input that can change the artifact;
 -  a documented path that rebuilds without reuse, so that suspected staleness
    is testable;
 -  a canonical manifest whose digest does not vary between runs of the same
    inputs, which keeps run-varying operational metadata out of it;
 -  retry counts reported in the run output, so that a result which succeeded
    only after a retry stays distinguishable from a first-attempt pass;
 -  both specialization policies, forced collection at every safepoint, and the
    strict warning and sanitizer flags, none of which are throughput budget;
 -  a peak temporary footprint bounded by concurrency rather than by corpus
    size, with working directories removed on the failure path as well as the
    success path; and
 -  `mise run test262:update` as an unsharded operation that produces the
    canonical manifest.

Concurrency is most likely to break the first of these, and to break it
silently. `validateReviewedResults` compares the reviewed subset and the
results by index without comparing their paths, so a pool that appended
results as they completed would validate one case against another case's
expectation, and would reorder the manifest rows that shard reconstruction
selects from. The test this checkpoint adds compares each result path with the
subset path at the same index.


Checkpoints
-----------

Checkpoints are ordered by dependency. Each one records its own measurement
against [*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md).

### Runtime archive reuse

Checkpoint status: complete.

The toolchain adapter accepts a prebuilt runtime archive instead of compiling
11 translation units for every execution. The reuse key covers every input that
can change the artifact: the reviewed runtime sources and headers, the runtime
ABI version, the complete compile and link flags, the exact Zig subprocess
environment policy and immutable snapshot, the identity reported by `zig env`,
the target and ABI facts, and the sanitizer selection. The host captures the
snapshot before the identity probe and reuses it for every build request.
Ambient compiler inputs outside the allowlist, including `CPATH`, are removed
by the host. Mutable path-based overrides such as `ZIG_LIBC`,
`C_INCLUDE_PATH`, and Nix compiler flags are excluded rather than keyed by
path alone. The CLI stops copying the reviewed runtime sources into a fresh
working directory when a valid archive for that key already exists.

The toolchain adapter owns the artifact key because it owns the concrete
commands and target mapping that produce the archive. The host adapter owns the
cache directory, lifetime, existence checks, and atomic publication because
those are host filesystem policy. The CLI composes the two capabilities and
keeps `--no-runtime-archive-reuse` as the deliberate rebuild path.
Host cache directories are absolute normalized paths, including when an
embedding supplies a relative cache root.
Per-key host leases serialize cold cache publication across concurrent callers.
They record ownership and expiry so an interrupted build cannot leave a
permanent lock. Active owners renew their expiry. Release and reclamation
atomically rename the exact observed state file, then move the complete lock
directory to a unique disposal path before deletion. An exclusive state file
protects the initial ownerless directory interval. These transitions prevent
concurrent reclaimers or an expired owner from targeting a replacement lease.
Renewal may overwrite only its already-claimed state file and cannot recreate
that path after a reclaimer replaces the directory.
An unavailable cache or environment-snapshot operation falls back to that same
usable rebuild path. Deno without `--allow-env` retains ordinary
inherited-environment compilation.
Cached runtime objects compile from stable relative source and include paths.
The adapter normalizes dot segments before deriving those relative arguments.
A file-prefix map covers remaining compiler metadata, and an archive-content
regression proves that sanitized builds in different temporary directories are
byte-identical and contain neither producer path. Every workflow observes its
toolchain identity against its captured snapshot. Cache namespace names reject
`.` and `..` before host path construction.
Content-addressed archives remain until the operating system or user removes
the Oseo cache namespace. This checkpoint does not add automatic pruning;
removal is safe and the next native workflow rebuilds the archive.

The successful test262 comparison recorded 270.64 s with reuse and 1,180.85 s
through the bypass. Reuse removed 910.21 s, or 77.1 percent of the bypass wall
clock, and 887.02 processor-seconds, or 75.2 percent of its processor time.
Both runs preserved all 681 reviewed classifications. The native property task
passed all 29 tests in 8.93 s with reuse. The complete measurements, host
conditions, and one excluded load-contaminated bypass run are recorded in
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md).

Archive reuse precedes concurrency because it removes the largest measured
wall-time component of a native execution and reduces each worker's runtime
build artifacts. One reused execution reduced process-tree peak resident memory
from 192.9 MiB to 47.8 MiB and peak allocated temporary storage from 7.43 MiB
to 4.40 MiB. These measurements establish the footprint used to select the
later worker bound.

The checkpoint includes its bypass path and tests that prove a changed runtime
source produces a different key.

Owner: the toolchain and host adapter boundaries in
[*DESIGN.md*](./DESIGN.md).

### Concurrent reviewed execution

Checkpoint status: complete.

The reviewed subset executes through a bounded worker pool instead of one
sequential loop in *tools/test262.ts*. Results are collected into reviewed
subset order, not completion order. The pool bound is explicit and recorded in
failure metadata so that a concurrency-dependent observation is reproducible.

The bound is eight workers, one for each physical core on the measurement host.
The runner also caps this value at the execution host's available parallelism,
so a smaller host reports and uses its lower effective bound.
One reused execution peaked at 47.8 MiB of process-tree resident memory and
4.40 MiB of allocated temporary storage. Eight simultaneous executions
therefore bound the measured aggregate footprint at 382.4 MiB of resident
memory and 35.2 MiB of temporary storage. Even the more constrained successful
reuse sample began with 6.1 GiB of memory available and about 6.2 GiB free on
*/tmp*. Those capacities would admit more than eight measured working sets, so
the physical core count is the tighter bound. The host exposes 16 logical
threads, but the native compiler and linker work is CPU-intensive; simultaneous
multithreading is not treated as another physical-core budget.

`OSEO3001` also covers deterministic toolchain, temporary-directory,
executable-launch, and cleanup failures, so retrying every occurrence would
mask real defects. The CLI now distinguishes a process that could not start
because the host temporarily exhausted process resources from an unavailable
toolchain or executable. Only that named resource failure is retried, at most
once for each native variant. A nonzero toolchain exit, temporary-directory
failure, ordinary executable-launch failure, and cleanup failure are not
retried.

The duration, effective pool bound, and total retry count are reported in the
run output. A failed run carries the same fields in its error metadata. None
enters the canonical manifest. *target-parity.yaml* pins one digest over that
manifest, so a field that varies with host conditions would change the digest
on every run. Keeping retry counts outside it also means this checkpoint adds
no manifest field and changes no classification vocabulary, so it needs no ADR
0013 amendment.

The isolated full-corpus run completed in 44.57 s with 256.73 s of user time,
89.23 s of system time, and a processor-time-to-wall ratio of 7.76. It retained
all 681 sequential classifications, matched the checked-in canonical manifest
byte for byte, and used no retry. The prior reuse path took 270.64 s with a
ratio of 1.08. Concurrent execution removed 226.07 s, or 83.5 percent of that
wall clock, and made the gate 6.07 times faster. The complete host facts and
measurement table are recorded in
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md).

Owner: the standards harness expansion in [*PLAN-M5.md*](./PLAN-M5.md).

### Compatibility ratchet check

Checkpoint status: complete.

`mise run check:compatibility-ratchet` compares the current worktree with its
selected Git baseline. It derives the pass count and path classifications from
*results.yaml*, compares the reviewed path set in *subset.yaml*, and parses the
static `domain`, `seed`, and `numRuns` options passed to every
`assertProperty` and `assertAsyncProperty` call. It fails when the pass count
falls, a path that passed changes classification, a reviewed path disappears,
the current subset and result manifest contain different path sets, or a
generated domain loses a seed or has a smaller aggregate ordinary case budget.
The task reports both sets of counts on success and failure.

The baseline follows the context named by this plan:

 -  a pull request compares against its base commit;
 -  a push compares against the commit the push started from, so that a
    regression introduced early in a multi-commit push cannot hide behind a
    later commit that restores the count;
 -  a push that creates a reference reports no such commit, so a new branch
    falls back to its merge base with `main`, and a tag push is out of scope
    because a tag records a state the branch check already covered;
 -  a local branch compares against its merge base with `main`; and
 -  uncommitted work on a local `main` compares against `HEAD`, so an unrelated
    commit already on the branch is not counted as part of the change.

The check job now fetches complete history for its detached checkout and
fetches the exact base or `before` commit by object ID. The second fetch keeps a
force-push comparison anchored to the commit the push started from even when no
ref reaches that commit afterward. Missing commits, a missing `main` reference,
and an unavailable merge base fail the task. A tag push is the only baseline
selection that skips the comparison.

Evidence-backed reversals use
*tests/compatibility-ratchet-overrides.yaml*. One record names one of
`pass-count`, `pass-classification`, `subset-path`, `property-seed`, or
`property-case-budget`; gives the result path, reviewed path, or generated
domain it covers; states the exact `from` and `to` values; and gives a reason.
The subset/result path-set equality has no override because the measurement
contract permits no inconsistent checked-in state. Only a record absent from
the baseline can approve a current transition. A record already present in the
baseline remains historical evidence and cannot approve another transition.
A new or changed record whose exact transition does not occur is stale and
fails the task.

The language profile's admitted-item monotonicity is not checked by this
checkpoint. *docs/language-profile-m5.md* records admitted behavior as prose
without stable item identifiers, so a text comparison would claim coverage it
cannot provide. The later per-family evidence lanes checkpoint owns the fixed
profile template that can make such a comparison mechanical.

Deliberate regression tests cover every enforced invariant, exact override
matching, and stale overrides. Comparisons of merges `ad8955b`, `0918376`,
`7b5b74a`, `9d2b8ff`, and `c2b0445` against their first parents passed.
Commit `b396d20` failed with the expected eleven paths present in *subset.yaml*
and absent from *results.yaml*.

The isolated measurement and complete check ran on Linux
7.1.4-200.fc44.x86\_64 with the same AMD Ryzen 7 7700X, 8-core/16-thread
processor, tool versions, and target as the concurrent sample. Immediately
after the samples, 14 GiB of memory was available, swap was full, */tmp* was
47 percent used, and load average was 0.94/0.58/1.18. No unrelated native build
ran during either sample.

| Task                                      | Wall   | User    | System | CPU / wall |
| ----------------------------------------- | ------ | ------- | ------ | ---------- |
| `mise run check:compatibility-ratchet`    | 2.21 s | 2.98 s  | 0.37 s | 1.52       |
| `mise run check`, with compatibility task | 7.01 s | 20.03 s | 6.92 s | 3.84       |

The measured state held 1,883 passes and 3,966 paths in each manifest. The
property scan found 29 domains, 28 distinct seeds, and an aggregate ordinary
case budget of 2,290. This checkpoint has no timing target; these measurements
record the cost the next checkpoint inherits.

Owner: the measurement contract in [*PLAN-M5.md*](./PLAN-M5.md) states the
rule; this plan only carries the gate that enforces it.

### Seed allocation registry

Checkpoint status: complete.

*tests/property-seeds.yaml* assigns every reviewed property source one stable
kebab-case family ID, exact owner path, and aligned block of 256 signed 32-bit
seeds. A source file is the ownership boundary: domains in that file take
distinct slots from its block, while two calls for the same domain may reuse a
seed deliberately to exercise the same cases through different runner paths.
New families reserve any unused aligned block. This lets concurrent units pick
independent ranges, and an overlap fails mechanically when their changes meet.

The compatibility-ratchet scanner validates the registry and ordinary property
calls before comparing the current snapshot with Git. It rejects unknown
fields, versions, family IDs, owner paths, range values, non-aligned or
wrong-sized blocks, overlapping blocks, repeated families or owners,
unregistered property sources, out-of-block seeds, seed reuse across distinct
family-domain allocations, and registry entries with no reviewed property
call. Seeds must fit the signed 32-bit range accepted deterministically by
`fast-check`. The check reads sources and the registry directly, so it retains
the clean-checkout test that forbids compiler build artifacts.

The migration assigned 47 family blocks to 57 generated domains. It moved each
ordinary reviewed seed into its owning block and removed the seven duplicate
allocations by which unrelated domains had shared seed values. The scan reports
57 distinct seeds instead of 50 while retaining the aggregate ordinary case
budget of 2,686. The compatibility snapshot remains 2,934 passes across 4,861
reviewed paths. Each of the 57 old seed removals is recorded through the
existing exact-transition override path; future comparisons retain the same
monotonic property-seed and case-budget rules.

Focused regressions accept a valid allocation and deliberately reject an
unregistered family, an out-of-block seed, reuse across distinct domains,
overlapping blocks, a malformed range, and a stale entry. This checkpoint has
no timing target; its count measurement records the diversity correction and
the unchanged evidence budget without claiming a semantic or compatibility
change.

Owner: [*PLAN-PT.md*](./PLAN-PT.md).

### Infrastructure failure classification

Checkpoint status: complete.

The concurrency checkpoint retried a named infrastructure failure but still
reported an exhausted retry or another infrastructure failure through the
harness classification. The result observation now carries an optional
`failureKind` whose exact values are `harness` and `infrastructure`.
Harness-source assembly, missing harness inputs, and adapter graph defects use
the first value. Host execution exceptions, native process failures, toolchain
failures, and temporary-resource failures use the second. The derived
classifications are `harness-failure` and `infrastructure-failure`, and the
reviewed gate rejects both separately.

ADR 0013 records that renaming a classification is a breaking manifest change
that lands together with the schema expansion. This checkpoint therefore lands
as one reviewed change that extends the manifest schema, updates the
classification vocabulary, regenerates the canonical manifest, and amends
[ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md).

Focused regressions distinguish an executor exception from a harness assembly
defect and reject a manifest record whose `failureKind` and classification do
not match. The regenerated 4,861-case manifest contains zero harness,
infrastructure, or semantic failures. The shared measurement with record
partitioning is recorded below and in
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md).

### Manifest record partitioning

Checkpoint status: complete.

At the throughput baseline the manifest held 681 records in 19,676 lines. By
this checkpoint the same file held 4,861 records in 155,346 lines, and
*target-parity.yaml* pinned one digest over that canonical file. At the corpus
size the claim requires, one checked-in file held a number of records that no
reviewer could inspect and that every concurrent unit conflicted on.

The M5a inventory does not create that file. ADR 0020 stores 47,381 candidate
paths in a separate 47,390-line tab-separated index, of which 41,091 form the
edition denominator. The index records only path, boundary, and basis, while
*results.yaml* remains the source of truth for observations. This keeps
enumeration reviewable without satisfying or bypassing this checkpoint.
The isolated exact-regeneration check takes 4.93 s with a 1.15
processor-time-to-wall ratio, as recorded in
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md).

*results.yaml* is now a 3,851-line index over 1,161 nonempty partitions. A
record's group remains the first two upstream path segments, and its bucket is
the first byte of the path's SHA-256 digest. The resulting path is
*results/<group>/<key>.yaml*. The largest partition has 16 records and 528
lines. This bounded key keeps a large path group from becoming another
single-file bottleneck.

The index carries the suite revision and the summary derived from every
partition. Readers validate the exact indexed file set, sorted unique index,
partition ownership, sorted unique record paths, revision, classification and
failure-kind pairing, and exact derived summary. They reconstruct the global
upstream path order before deterministic shard selection. Regeneration writes
every partition and removes stale ones. The compatibility ratchet reads the
partition set from the worktree and from a Git baseline; its legacy baseline
reader permits this one-time schema migration without weakening current
validation.

*target-parity.yaml* continues to name *results.yaml* as the manifest entry
point. Its digest now covers the index followed by every ordered partition,
with each UTF-8 path and body length-framed before hashing. A focused
regression changes only a partition body and proves the digest changes.

The final exact regeneration retained revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`, all 4,861 records, and exactly
2,934 passes. It recorded 1,355 expected negatives, 572 unsupported profile
features, and no semantic, harness, or infrastructure failures. The ratchet
compared the partitioned worktree against the single-file baseline without a
count, path, seed, domain, or case-budget change.

| Task                                   | Wall     | User       | System     | CPU / wall |
| -------------------------------------- | -------- | ---------- | ---------- | ---------- |
| `mise run test262:update`              | 500.10 s | 2,947.07 s | 1,049.63 s | 7.99       |
| `mise run check:compatibility-ratchet` | 2.90 s   | 3.69 s     | 0.45 s     | 1.43       |

This checkpoint has no timing target. Complete host facts and the manifest
shape measurements are recorded in
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md). This
record-format change extends ADR 0013 in the same reviewed change as the
classification vocabulary.

### Per-family evidence lanes

Checkpoint status: complete.

The M5 profile now indexes one YAML record per family through matching index and
record files under *docs/language-profile-m5/*. A new family adds its own two
files and edits no shared inventory. The stable filename and kebab-case ID are
the same in both files. The fixed record template carries the title, scope,
owning contracts, and all eight evidence classes required by
[ADR 0018](./docs/adr/0018-recorded-evidence-coverage.md): `differential`,
`generated`, `specialization`, `guard-fallback`, `forced-collection`,
`structural`, `fixed`, and `standards`.

The inventory has 61 owners. The first 54 correspond to the former top-level
admission entries. Seven further owners record BigInt, object-literal prototype
setters, top-level `this`, lexical and constructed `super`, pattern-position
`await`, block-function and outer-`var` coexistence, and `debugger`. The later
delete work and Units 8.5a through 8.5c, 8.5e, and 8.5o remain folded into the
families whose contracts they extend. Async-from-sync delegated throw remains
repair evidence for asynchronous generators, not a new language family. The
frozen M3 and M4 profiles remain normative for inherited behavior, so M5 does
not invent duplicate owners for them.

All 488 class judgments were reviewed. There are 403 covered assessments and
85 deliberate omissions. A covered class names existing evidence. An omission
states why the class does not isolate a useful additional contract and names
the fixed, generated, differential, structural, or standards evidence that
replaces it. No record remains `unassessed`.

*tools/evidence-lanes.ts* uses the existing `yaml` dependency and reads the
source tree directly. It rejects malformed records, unknown or missing fields
and classes, duplicate IDs, filename and ID disagreement, missing references,
stale indexes, unindexed records, and `unassessed`. The new
`check:evidence-lanes` task is part of the default check. Focused regressions
deliberately reverse each validation rule.

The compatibility snapshot now includes the indexed family IDs. Removing an
admitted family produces an `admitted-family` monotonicity violation. That
invariant is deliberately absent from the override vocabulary. A focused
regression removes one of two baseline families and proves both the violation
and the rejected override attempt. [*PLAN-M5.md*](./PLAN-M5.md) and
[*ROADMAP.md*](./ROADMAP.md) now reference the normative records for current
family status while retaining their unit-level evidence narratives as history.

The final checks ran on Linux 7.1.5-201.fc44.x86\_64 with an AMD Ryzen 7 7700X,
8 cores and 16 threads. The host had 42 GiB of memory available, 1.4 GiB of
swap free, */tmp* at 94 percent use, and a load average of 0.56/0.35/0.33 after
the samples. Mise reported read-only cache warnings during the isolated task
measurements. This checkpoint has no timing target, so the measurements retain
that environment cost rather than adjusting it away.

| Task                                   | Wall    | User    | System | CPU / wall |
| -------------------------------------- | ------- | ------- | ------ | ---------- |
| `mise run check:evidence-lanes`        | 10.14 s | 0.14 s  | 0.06 s | 0.02       |
| `mise run check:compatibility-ratchet` | 16.17 s | 4.62 s  | 2.81 s | 0.46       |
| `mise run check`                       | 34.17 s | 23.35 s | 8.21 s | 0.92       |

The compatibility snapshot remains exactly 2,934 passes across 4,861 paths.
The property snapshot remains 57 domains, 57 distinct seeds, and an aggregate
ordinary case budget of 2,686. No semantic output or manifest was regenerated.

Owner: [*PLAN-M5.md*](./PLAN-M5.md) and the M5 language profile.


Measurement contract
--------------------

Every checkpoint records the same table the baseline records: wall clock, user
time, system time, and the processor-time-to-wall ratio for each affected
task, on a host described by the same facts. A checkpoint that changes a
counted result is a semantic change and belongs to the owning plan instead.

Archive reuse and concurrent execution are the two checkpoints with a timing
target. One that does not move its recorded duration is reverted or replanned
rather than kept for its structure.

The ratchet check, the seed registry, the failure classification, the record
partitioning, and the evidence lanes have no timing target. They are accepted
on their own terms: a check that fails on a deliberate reversal, a registry
that makes a colliding seed impossible, a classification that separates a
resource failure from a harness defect in the manifest, a record format that
two concurrent units can extend without conflicting, and a profile template
that carries one normative record for each family. Each still records
the table, because a correctness checkpoint that makes the gate slower is a
result the next checkpoint needs to know about.

Throughput measurements never waive a semantic failure, and they are not
evidence about the collector, the backend, or specialization. Those belong to
[*PLAN-GC.md*](./PLAN-GC.md), [*PLAN-BACKEND.md*](./PLAN-BACKEND.md), and the
specialization contracts already in place.


Failure modes and replacement triggers
--------------------------------------

 -  A reused archive that produces an observation a rebuild does not reproduce
    reverts archive reuse and reopens the key definition.
 -  Concurrent execution that produces a canonical manifest differing from the
    sequential one in any field invalidates concurrent execution until the
    difference is explained. Run output may differ in duration, pool bound,
    and retry counts, which are not manifest fields.
 -  Archive reuse reduces the per-execution footprint; concurrency multiplies
    whatever remains. Native infrastructure failures that persist after archive
    reuse has landed and while concurrency is bounded to the measured aggregate
    footprint mean the cause is not the footprint, and the next checkpoint
    investigates the host interface instead of continuing this order.
 -  If the wall clock after archive reuse and concurrency is dominated by the
    Node.js
    and Deno reference executions rather than native builds, the next
    checkpoint addresses reference execution instead of continuing this order.
 -  A retry that hides a genuine intermittent semantic failure reopens the
    retry policy. Retry counts exist so that this is detectable.
 -  If partitioned records prove harder to review than one file at the corpus
    size that motivated the change, record partitioning is replaced rather than
    extended.


Exit criteria
-------------

This plan is complete when:

 -  the runtime archive is built once for each distinct reuse key in a task
    run, with a documented bypass and a key-change test;
 -  the reviewed test262 and native property tasks occupy the measurement host
    rather than one core, with the processor-time-to-wall ratio recorded;
 -  a full-corpus run completes without a native infrastructure failure on a
    host that meets a documented memory and temporary storage requirement;
 -  infrastructure failures are retried, counted, and classified apart from
    harness defects under an amended ADR 0013;
 -  the manifest record format supports the corpus size the claim requires
    without a single-file conflict for every concurrent unit;
 -  a deliberate reversal of each monotonicity rule in the measurement
    contract fails the ratchet check, and an unresolvable baseline fails it
    too;
 -  property seeds are allocated from a checked-in registry;
 -  each admitted family has one normative profile record that concurrent
    units extend without conflicting; and
 -  every preserved invariant above has a test that fails when it is broken.


Prebuilt test262 harnesses
--------------------------

The test262 runner now reuses a compiled harness object for admitted Scripts.
The [fragment ABI](./docs/harness-fragment-abi.md) defines the unit boundary,
admission and whole-Script fallback. The runtime archive cache remains in use.
The environment bypass `OSEO_TEST262_HARNESS_REUSE=disabled` retains the
original assembled-source compilation for regression comparisons. Neither
path changes the reviewed manifest, variant budget, or evidence classes.

The following local measurements use the same reviewed shard, `3/200`, on a
shared Linux x86\_64 host. The task runs 101 reviewed paths: 80 pass, 7 expected
negatives, and 14 unsupported. Both compilation paths retain 316 variants
counted as execution evidence. CPU is user plus system time from GNU time,
including child processes; wall time includes task setup and manifest checks.
These are single-run measurements, not statistical estimates or CI timings.

| Adapter                   | Harness path              | Wall seconds | CPU seconds | Objects built/reused |
| ------------------------- | ------------------------- | -----------: | ----------: | -------------------- |
| Zig                       | Whole Script              |        90.10 |      305.17 | 0/0                  |
| Zig                       | Split, cold harness cache |        57.94 |      162.85 | 36/0                 |
| Zig                       | Split, warm harness cache |        29.91 |      108.83 | 0/36                 |
| Host Clang 22, ASan/UBSan | Whole Script              |       129.46 |      386.76 | 0/0                  |
| Host Clang 22, ASan/UBSan | Split, cold harness cache |        90.69 |      229.48 | 36/0                 |
| Host Clang 22, ASan/UBSan | Split, warm harness cache |        71.91 |      193.97 | 0/36                 |

Cold here means that none of this shard's harness objects were reused. The
runtime archive and toolchain installation were already available. Each split
run performed 281 additional harness C comparisons across bodies and policies;
all outputs matched their respective reference bytes. The task compared every
serialized result with the unchanged reviewed manifest. The extra
object-determinism verification option was off for these timing runs.

CI jobs use their own existing host cache directories. The workflow does not
restore or publish harness objects between shards; workers within one process
share preparation promises. Separate processes using the same cache directory
coordinate through the host's exclusive publication lock. Linux Zig and host
Clang execution were measured locally. Sharing those objects between CI jobs
was investigated and rejected. The distinct-object count for each shard is
measured in CI; the cold and warm shard wall times are measured on two hosts
outside CI, at each host's own pool and again at the macOS runner's pool of 3,
with the Linux runner's pool of 4 not reproduced; the key-input stability of
main's history is derived from measured commit counts rather than observed as a
cache hit rate; and the transfer cost is estimated from other caches. All of it
is in [*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md), where the
derived recovery is 12.2 macOS min for a complete run at the current workload
on the most favorable of the four configurations. The earlier macOS work
projection was an estimate and must not be presented as an observed CI
improvement.


Projected cost at the M5c edition denominator
---------------------------------------------

This projection extends the measured CI baseline in
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md) from its measured
21,383 reviewed paths to the measured 41,091-path edition denominator that
[*PLAN-M5C.md*](./PLAN-M5C.md) records and `mise run check:test262-inventory`
reports. It contains no new measurement and triggered no CI run. Every figure
is either quoted from that baseline as measured or derived from it by the model
stated below, and each is labeled.

The planning ceiling is 628 macOS runner minutes for one CI run. The baseline
records it as the value the M5CI planning brief specifies and states that its
exact value is not reproduced by rounding or flooring the preserved timestamps,
so it is a specified planning budget rather than a measurement. The brief names
main run 35456667007 at `32ece7f4` as its source. That run's separately derived
macOS family total is 629.52 min from measured job timestamps, or 629 min when
the aggregate is floored, at a measured 20,841 reviewed paths. Runner minutes
here are the sum of elapsed macOS job minutes, the same quantity the baseline's
family tables report; wall clock is projected separately below.

The projection model is:

 -  a family whose work is selected from the reviewed path set scales linearly
    in that count;
 -  every other family is held at its measured value, because its input
    inventory is the property file set, the native fixture set, or the
    sanitizer suites, and the reviewed corpus selects none of them;
 -  each projected test262 job keeps one job fixed cost, taken from the
    baseline's derived mean F, which is 59.82 s for run 36243816479 and 56.81 s
    for run 36261458909, while a held family keeps whatever fixed cost is
    already inside its measured minutes; and
 -  the shard totals stay at their measured current values, test262 10 and
    native support 12.

Two limits apply to every derived number below. A constant second-per-path
rate assumes that the further paths carry the same classification and variant
mix as the measured 21,383, which no measurement establishes. That remainder is
a derived 19,708 paths, the difference of the two measured counts, and
`mise run check:m5c-graph` reports the same value as `unreviewed`; the
baseline states that neither of its residual rates supports a linear
projection over a changed semantic workload. And F re-adds the repeated build
intervals that also fall inside the execution step. The baseline's B column is
total build time, the initial build plus those later intervals, and does not
separate them, so that overlap is not quantified here. It is bounded above by B
summed over a run's ten macOS test262 jobs, a derived 0.68 min for run
36261458909 and 0.74 min for run 36243816479.

### What scales with reviewed paths

The per-family scaling below is derived from the job definitions in
*.github/workflows/main.yaml*, the task bodies in *mise.toml*, and the source
sets those tasks name. Job counts are measured from the workflow matrices.

| Family            | macOS jobs | What one job executes                                                                                                            | Scales with reviewed paths       |
| ----------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| test262           | 10         | `mise run test:test262 --shard N/10`, which is `node tools/test262.ts`                                                           | Yes, linearly in the sharded set |
| native support    | 12         | `test:property:extended:native:shard` over _tests/property/\*.property.test.ts_, and `test:property:extended:package` on shard 1 | No                               |
| host C sanitizers | 2          | `test:sanitizer:self`, then `runtime` and `native`, or `property`                                                                | No                               |
| test              | 2          | `test:node`, which is `node --test` at the root, and `test:deno`                                                                 | Only in parse-bound components   |
| native            | 3          | `mise run test:native --shard N/3`, which is `node tests/native.ts`                                                              | No                               |

Only `test262` selects its work from the reviewed path set. *tools/shard.ts*
takes zero-based positions modulo the shard total from the reviewed order the
manifest reader reconstructs, so each of the ten macOS shards receives one
tenth of whatever the reviewed set holds.

The `native support` family runs the observed 128 files matched by
_tests/property/\*.property.test.ts_ under Node's `--test-shard`, plus the
package property suites on shard 1. Its unit is a property file, and the
baseline's derived rates for it are seconds per selected property file, not per
reviewed path. Nothing in the task reads the reviewed manifest: the three
property files whose sources mention test262 cover the harness promise helper,
the shared-memory agent harness, and the native function matcher, none of which
enumerates reviewed paths. The family therefore grows when property files,
domains, or case budgets are added, which is the separately measured
bottleneck the baseline records, and not when the corpus grows.

The `host C sanitizers` family runs `test:sanitizer:self`,
`test:sanitizer:runtime`, `test:sanitizer:native`, and
`test:sanitizer:property`. The workflow never invokes
`test:sanitizer:test262`, so this family executes no reviewed standards case
and its cost is independent of the corpus.

The `native` family runs `node tests/native.ts`, whose inputs are the reviewed
native fixtures. Its `test262Host` field selects the test262 host API for a
fixture; it does not read the reviewed corpus.

The `test` family is the one partial case. `node --test` at the repository root
discovers at least two components whose input grows with the reviewed count.
*tests/test262-runner.test.ts* reads the checked-in index and every partition in
its `round-trips and shards the checked-in reviewed manifest` test, and
*tests/regexp-probes.test.ts* reads the whole of *tests/test262/subset.yaml* and
searches it once for each cited probe path. This section does not claim that
list is exhaustive. Both are file reading, parse, and validation work rather
than native execution: the closest isolated measurement in the baseline is
`check:compatibility-ratchet` at 2.90 s over 4,861 records. Neither is
separately measured inside CI, so this projection holds the whole `test` family
at its derived value and records the omission rather than estimating it. The
same job also runs the observed 128 ordinary property files, which is the
duplication U7 examines.

### Projected workload at 41,091 paths

Derived macOS test262 family minutes at 41,091 paths with 10 shards held
constant. Every column is derived: the rate column is the baseline's derived
step-level seconds per path, itself a quotient of a derived execution sum over
measured step timestamps and a measured path count. Fixed cost is 10 jobs times
the derived mean F of the named run.

| Derived s/path | Source commit | Derived execution min | Derived 10-job fixed cost min | Derived family min |
| -------------- | ------------- | --------------------- | ----------------------------- | ------------------ |
| 0.629          | `32ece7f4`    | 430.77                | 9.97 (A) / 9.47 (B)           | 440.74 / 440.24    |
| 0.741          | `475dfbad`    | 507.47                | 9.97 (A) / 9.47 (B)           | 517.44 / 516.94    |
| 0.874          | `c9b3cc80`    | 598.56                | 9.97 (A) / 9.47 (B)           | 608.53 / 608.03    |
| 0.886          | `00153abe`    | 606.78                | 9.97 (A) / 9.47 (B)           | 616.75 / 616.25    |

A is run 36243816479 and B is run 36261458909. The 0.629 rate is the lowest
level in the series, and 0.741 to 0.886 is the observed current band from
`aff3ade3` onward.

The four other macOS families are held at their per-run sums, which the baseline
derives from measured job timestamps. Their derived totals are 403.25 min for
run 35456667007, 443.71 min for run 36261458909, and 469.37 min for run
36243816479.

Derived macOS workload at 41,091 paths against the 628-minute ceiling:

| Scenario                   | Derived test262 min | Derived held families min | Derived total min | Derived gap min | Derived test262 share |
| -------------------------- | ------------------- | ------------------------- | ----------------- | --------------- | --------------------- |
| 0.629, run 35456667007 set | 440.74              | 403.25                    | 843.99            | +215.99         | 52.2%                 |
| 0.629, run 36261458909 set | 440.24              | 443.71                    | 883.95            | +255.95         | 49.8%                 |
| 0.741, run 36261458909 set | 516.94              | 443.71                    | 960.65            | +332.65         | 53.8%                 |
| 0.874, run 36261458909 set | 608.03              | 443.71                    | 1051.74           | +423.74         | 57.8%                 |
| 0.886, run 36243816479 set | 616.75              | 469.37                    | 1086.12           | +458.12         | 56.8%                 |

Run 35456667007 has no F measurement of its own, so its scenario uses run
36243816479's derived mean F, the A column above, for its projected test262
jobs, and the same mean stands in for the unmeasured F inside its held families'
minutes. That is the same F the recovery stack below uses, so one fixed-cost
assumption holds across a scenario and the stack built on it.

The derived comparison points, from measured job timestamps, are 629.52 min at
20,841 paths, 764.12 min at 21,383 paths for run 36261458909, and 795.45 min at
21,383 paths for run 36243816479. Neither current run fits the ceiling at its
own smaller measured workload, so the whole projected range is above it by
construction.

The derived total macOS job fixed cost is small. With 29 macOS jobs across the
five families, the derived mean F values give 28.91 min for run 36243816479 and
27.46 min for run 36261458909, a derived 1 min or so for each job. Those are the
measured runs' totals; a projected scenario embeds a slightly different amount,
because its ten test262 jobs carry 10 times the mean F in place of their own
derived F, and U3 below gives each scenario's value. The two
components of F that a cross-job cache could plausibly remove, the measured aube
dependency interval D and the derived build interval B, give a derived 13.97 min
and 12.56 min respectively. The rest of F is checkout, mise cache restore,
action gaps, job setup and cleanup, and the post-step reporting tail that the
baseline's macOS Deno outlier shows can reach 82 s on its own.

### Projected lower bound on wall clock

macOS has five concurrent slots, so one run's wall clock is at least the
workload divided by five, and never less than its longest single job.

| Scenario                   | Derived workload min | Derived workload / 5 min | Longest job min | Longest job             |
| -------------------------- | -------------------- | ------------------------ | --------------- | ----------------------- |
| 0.629, run 35456667007 set | 843.99               | 168.80                   | 58.55           | native support, derived |
| 0.741, run 36261458909 set | 960.65               | 192.13                   | 51.71           | test262 shard, derived  |
| 0.874, run 36261458909 set | 1051.74              | 210.35                   | 60.82           | test262 shard, derived  |
| 0.886, run 36243816479 set | 1086.12              | 217.22                   | 68.13           | native support, derived |

The longest-job column is the larger of the derived projected test262 shard
below and the derived maximum job among the four held families in that
scenario's source run. In every scenario the workload term binds and the
longest job does not, so the projected wall-clock lower bound is 169 to 217
min. Substituting the slowest derived per-shard rate, which projects a derived
82.72 to 86.78 min for the longest test262 shard, does not change that: the
workload term remains at least 1.9 times the longest job.

The projected longest test262 shard at the current total of 10 holds a derived
4,110 paths, since 41,091 is 10 times 4,109 plus 1. At the family-level rates
that shard is a derived 44.03 to 44.08 min at 0.629 s/path, depending on which
run's mean F is used, and 61.69 min at 0.886 with run 36243816479's F. The
baseline's derived per-shard residual rates spread wider than the family mean.
The slowest macOS shards are 1.193 s/path in run 36243816479 and 1.253 s/path in
run 36261458909, which with each run's own mean F project a derived 82.72 min
and 86.78 min for the slowest shard. Against the workflow's 120-minute
`test_test262` timeout that leaves a derived 33.22 min of headroom in the least
favorable case, so the current shard total does not itself breach the timeout at
41,091 paths.

The derived `native support` maximum is 68.13 min in run 36243816479 and 51.58
min in run 36261458909, with a derived max/mean of 2.64 and 2.17. The observed
dominant file *tests/property/m5-object-own-keys.property.test.ts* alone reports
a derived 59.42 min in run 36243816479 and 42.98 min in run 36261458909, which
is where a rebalanced partition's tail would sit if those durations held. They
are concurrent observations, and the baseline states that competing files affect
each other's duration, so they do not establish an irreducible longest job:
repartitioning changes the contention that produced them.

### Dominant family, the gap, and estimated recovery

At 41,091 paths `test262` becomes the dominant macOS family in every scenario,
at a derived 49.8 to 57.8 percent of the projected workload. That is a change
from the present, where the derived test262 total of 320.40 to 326.08 min and
the derived native support total of 284.85 to 310.20 min are comparable. The
derived gap against the 628-minute ceiling is +215.99 min in the most favorable
scenario and +458.12 min in the least favorable one, a factor of 1.34 to 1.73.

The recovery figures below are estimates, not measurements. Each names the
measured evidence it extrapolates from and the assumption that makes it an
estimate. They are attributed first to the measured cost component they act on
and then to the plan unit that owns that component. Every subtraction is an
estimated ceiling unless it says otherwise.

Job fixed cost, U3. The derived ceiling is the whole macOS job fixed cost that
a scenario embeds, and the derived figure for the dependency and build
components alone is 13.97 min or 12.56 min of the measured runs' 28.91 min and
27.46 min. A scenario embeds 10 times the derived mean F for its projected
test262 jobs, 9.97 min at run 36243816479's mean, plus the F inside its 19
held-family jobs. That held sum is a derived 18.09 min in run 36243816479, so
the least favorable scenario's ceiling is 28.06 min. Run 35456667007 has no
per-job F, so its held families are assumed at the same mean and the most
favorable scenario's ceiling is the full 28.91 min. Even the ceiling is 13.4
percent of the smallest derived gap and 6.1 percent of the largest. U3 cannot
close this gap; its value is that it is cheap, measurable, and does not touch
coverage. Raising a shard total under U6 adds a derived 1 min or so of fixed
cost for each added macOS job, which works against this same budget.

test262 per-path execution, U4 and U10. Both act on the same family. U10 is
several times the larger, and U4 is now measured and bounded well below the
gap.

U10 recovers the observed rise from 0.629 s/path to the 0.741 to 0.886 band.
Returning to 0.629 is a derived saving of 76.70 min from 0.741, 167.79 min from
0.874, and 176.01 min from 0.886. The baseline states that the cause is not
identified; it also shows that most of the increase in macOS test262 minutes
relative to the brief's baseline run is per-path execution cost rather than
corpus size or fixed cost. The onset in the series lies between
`e99620d5` at 0.676 and `aff3ade3` at 0.761, a range whose only non-merge
commits are `9e71f689` and `1a879b2e`. That interval is a pointer for U10's own
investigation, not an attribution: the baseline records the same runs as a
run-to-run spread with no established cause, and runner variance and cache
warmth are not improvements.

U4 shares the test262 harness object cache across jobs. Its unmeasured input,
k, is now measured, and the measurement removes the case for the unit. Every
reviewed test262 job prints its own object count, and the ten macOS shards of
both baseline runs built 96, 96, 116, 128, 128, 108, 109, 112, 116, and 108
objects, a sum of 1,117 and a mean of 111.7. The same ten values appear on
`linux-x86_64-gnu`, so k belongs to the shard's reviewed path set rather than
to the host. The reported reuse count is zero in every one of those jobs
because the persistent object directory starts empty on a fresh runner; later
cases in the same job still share each prepared object through the runner's
promise map.

k saturates, and its ceiling is the harness include vocabulary rather than the
path count. The reviewed corpus of 21,383 paths uses 53 distinct combinations
of the asynchronous flag and the ordered include list, bounding it at 212 keys
across both strictness modes and both specialization policies; the whole
pinned upstream suite uses 75, bounding it at 300. A 101-path shard built 36
objects and a 2,139-path shard of the same corpus builds 96, so 21 times the
paths gave 2.7 times the objects. Doubling a shard's paths at 41,091 cannot
take k past that ceiling, and the earlier estimate of 0.13k min was therefore
being applied to a k that cannot reach the values it projected.

The wall-clock saving is also smaller than the per-object build cost suggests.
The likely reason, which the measurement does not establish, is that the
worker pool overlaps harness preparation with case execution: shard 1/10
performs 7,195 split attempts against 96 harness objects, so preparation is
1.3 percent of the compile and link units it starts. Derived cold-minus-warm
differences for that shard, computed before rounding, are -0.16 s on a Linux
host at pool 8, 12.86 s on the same host at pool 3, 63 s on an Apple M4 host
at pool 8, and -96 s on that host at pool 3. In two of the four
configurations, including the one matching the macOS runner's own pool size,
the warm runs were the slower ones, so none of them separates the cache from
its sample's spread. Taking the largest per-object wall saving anyway, 0.656
s, applied to the measured 1,117 objects of the ten macOS shards, gives a
derived 12.2 min for one complete run at the current workload, and a derived
7.9 min if the derived 64.6 percent of main steps that leave the key inputs
unchanged is taken as a hit rate, less a derived 0.6 to 1.4 min of restore and
publication that every run pays whether it hits or misses. The two baseline
runs establish no improvement of this size either way: each job was measured
once per commit and the derived same-job spread for a macOS test262 shard
ranges from 0.35 to 16.53 min, so showing a change this small would need
matched repeated measurements. At 41,091 paths the same rate gives a larger
derived bound, 32.8 min, because a shard's 300-key ceiling times ten shards
bounds it at 3,000 objects; that bound, not the current-workload figure, is
what would justify revisiting the unit. The measurement, its hosts, and the
cache-key and storage costs are recorded in
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md), and their
preserved sources in
[*docs/evidence/u4/*](./docs/evidence/u4/README.md). U4 was therefore
not implemented, and this projection subtracts nothing for it.

The harness split landed at `f131a798` and `30c9f690` on 2026-09-17, before
`32ece7f4`, so the derived 0.629 s/path rate already includes the split path
with a per-job cold harness cache. On the evidence available the two levers
therefore act on different costs. That chronology does not prove independence:
the cause of the later per-path rise is unidentified and could itself lie in
harness preparation, so U10's investigation still owns that question.

Zig compilation cache, U5. The baseline infers a cold Zig compilation cache on
fresh runners and states that it did not inspect the cache contents, so there
is no measured hit rate to project from. The runtime archive is already cached
by *.github/actions/runtime-archive-cache*, and generated program translation
units differ for each case, so the remaining reusable surface is small. This
projection assigns U5 no derived recovery, and the plan's own note that doing
nothing is a valid result stands.

Shard sizing, U6. Raising the test262 or native support shard total leaves the
executed work unchanged, so it recovers no runner minutes and adds a derived
1 min or so of fixed cost for each added macOS job. Its effect is on the tail
and the timeout margin. At 41,091 paths the projected wall-clock lower bound is
set by the workload term at 169 to 217 min, while the longest job is a derived
44 to 87 min, so rebalancing does not move the projected lower bound either. U6
is timeout insurance and tail control here, not workload recovery.

Duplicate work and host split, U7 and U8. The macOS `test` family is a derived
41.85 min in run 36243816479 and 46.18 min in run 36261458909, of which the Node
job is a derived 40.35 min and 43.15 min from its measured elapsed seconds.
Both units act inside that family: U7 on the 128 ordinary property files that
`node --test` discovers at the root while the native support shards run the
same files at ten times the case budget, and U8 on whichever evidence in it is
host independent. Their ceilings overlap and are not additive; together they
are bounded by that family's derived value in the run a scenario uses, which is
39.30 min for run 35456667007, 41.85 min for run 36243816479, and 46.18 min for
run 36261458909. When stacked after U3 they must be taken net of the fixed cost
U3 already removed from the same two jobs; otherwise that fixed cost is
subtracted twice. Where a scenario's held families come from a run the baseline
decomposes job by job, that share is those two jobs' own derived F: 52.00 s and
54.46 s in run 36243816479, a 1.77 min sum, and 135.00 s and 53.70 s in run
36261458909, a 3.15 min sum. Taking twice the mean there would substitute an
average for a quantity the baseline measures directly. Run 35456667007 has no
such decomposition, so its share is twice the derived mean F, 1.99 min at run
36243816479's mean.
Neither unit can move `test262` or `native support` off macOS, because both
execute native code on `macos-aarch64` and macOS native
execution is proven only there. The Apple Clang sanitizer coverage the
milestone also protects belongs to the separate `host C sanitizers` family, not
to these two.

### Whether 628 minutes is reachable

No projection built on measured evidence reaches 628 min. The two stacks below
compare U10 recovered against U10 unrecovered inside one scenario each, so the
held families stay fixed rather than moving with the scenario. Neither stack
subtracts U4, whose derived 12.2 min at the current workload would leave both
scenarios above the 628-minute ceiling.

The most favorable scenario is 843.99 derived min at 0.629 s/path with run
35456667007's held families, in which U10 is already recovered. Removing the
28.91 min of embedded macOS job fixed cost that U3 could reach leaves 815.08
min. Removing the whole macOS `test` family that U7 and U8 act inside, net of
the 1.99 min U3 already took from its two jobs, leaves an estimated 777.77 min,
or +149.77 min against the ceiling.

The least favorable scenario is 1086.12 derived min at 0.886 s/path with run
36243816479's held families. Recovering the rise to 0.629 under U10 leaves
910.11 min, the 28.06 min U3 could reach leaves 882.05 min, and U7 with U8 net
of the 1.77 min of derived F U3 already took from those two jobs leave an
estimated 841.97 min, or +213.97 min against the ceiling. U5 and U6 recover no
runner minutes at all.

So U3, U7, U8, and U10 taken at their estimated ceilings close a derived 30.7
percent of the excess in the most favorable scenario and 53.3 percent in the
least favorable one, roughly a third to a half, and leave 150 to 214 min that
U4 cannot close. Closing the most favorable scenario's residual through U4
alone would need k of about 1,154 distinct harness objects for each shard under
the earlier 0.78 s per object model, or a derived 1,369 under the 0.656 s the
measurement gives. The measurement excludes both: k is 96 to 128 for each shard
at the current corpus, and the whole pinned upstream suite is bounded at 300
distinct keys, so no corpus size puts k near either figure. Reachability no
longer turns on this quantity; it turns on a lever this plan has not
identified.

Those subtractions are already generous in three ways. U3's ceiling is the whole
of F, including the cleanup and reporting tails no cache can remove. U7 and U8
are credited with the entire `test` family although neither the duplication nor
the host independence is established. And both stacks use run 36243816479's
derived mean F where run 35456667007 has no F measurement of its own.

Nothing in this projection proposes reducing coverage, and this plan's preserved
invariants and the milestone coverage rules forbid it. The options that would
reduce it, such as running the full corpus less often than every merge, reducing
case counts, seeds, or property case budgets, removing reviewed paths, changing
an expected classification, or dropping a macOS job, are recorded here only as
choices that require an explicit decision from the maintainer; this plan selects
none of them. Lowering a shard total is forbidden by the same rules but belongs
in a different category: running all shards of a smaller partition still
executes the complete corpus, so its cost is longer jobs and timeout risk
rather than omitted evidence.

The explicit statement this projection owes its plan is therefore narrower
than a verdict. No coverage-lossless projection here reaches 628 min on
measured evidence. The lever that was supposed to close the remaining 150 to
214 min, U4, has now been measured and recovers a derived 12.2 min at the
current workload on its most favorable assumptions, so the remaining
alternatives are a lever this plan has not yet identified or a maintainer
decision that the ceiling itself moves. This projection makes neither and does
not claim the ceiling is reachable.
