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

The M5CI CI capacity work now has a merge-wait goal: one push should reach a
green run in about two hours or less. The maintainer chose this goal on
2026-10-05 in place of the earlier ceiling of 628 macOS runner minutes per
run, without giving up any coverage. The old ceiling and its evidence remain
below, marked as superseded. The new goal, the measured values, and the
projection at 41,091 reviewed paths are in
[Merge-wait goal and projection (U12)](#merge-wait-goal-and-projection-u12).


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

The tables below preserve the measured ten-shard baseline. U6 raises current
CI test262 totals to twelve; its tail, fixed-cost, and combined-workload
comparison is in [U6 evidence](./docs/evidence/u6/README.md).
The corrected Linux native-support total is five, including a singleton
own-key shard; the historical rates and tables below retain their source
run totals.

This projection extends the measured CI baseline in
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md) from its measured
21,383 reviewed paths to the measured 41,091-path edition denominator that
[*PLAN-M5C.md*](./PLAN-M5C.md) records and `mise run check:test262-inventory`
reports. It contains no new measurement and triggered no CI run. Every figure
is either quoted from that baseline as measured or derived from it by the model
stated below, and each is labeled.

The merge-wait goal in
[Merge-wait goal and projection (U12)](#merge-wait-goal-and-projection-u12)
superseded this ceiling on 2026-10-05. This section keeps the ceiling and its
projection as the record of that decision.

The planning ceiling was 628 macOS runner minutes for one CI run. The baseline
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
 -  the shard totals stay at their measured baseline values, test262 10 and
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
sets those tasks name. Job counts are measured from the baseline workflow
matrices.

| Family            | macOS jobs | What one job executes                                                                                                            | Scales with reviewed paths       |
| ----------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| test262           | 10         | `mise run test:test262 --shard N/10`, which is `node tools/test262.ts`                                                           | Yes, linearly in the sharded set |
| native support    | 12         | `test:property:extended:native:shard` over _tests/property/\*.property.test.ts_, and `test:property:extended:package` on shard 1 | No                               |
| host C sanitizers | 2          | `test:sanitizer:self`, then `runtime` and `native`, or `property`                                                                | No                               |
| test              | 2          | `test:node`, which is `node --test` at the root, and `test:deno`                                                                 | Only in parse-bound components   |
| native            | 3          | `mise run test:native --shard N/3`, which is `node tests/native.ts`                                                              | No                               |

In this baseline model, only `test262` selects its work from the reviewed
path set. *tools/shard.ts*
takes zero-based positions modulo the shard total from the reviewed order the
manifest reader reconstructs, so each of the ten macOS shards receives one
tenth of whatever the reviewed set holds.

The `native support` family runs the observed 128 files matched by
_tests/property/\*.property.test.ts_ under the wrapper's cost-based `--shard`,
plus the package property suites on shard 1. Its unit is a property file, and
the baseline's derived rates for it are seconds per selected property file, not
per reviewed path. Nothing in the task reads the reviewed manifest: the three
property files whose sources mention test262 cover the harness promise helper,
the shared-memory agent harness, and the native function matcher, none of which
enumerates reviewed paths. The deterministic partition and its measured-weight
model are documented in [*CONTRIBUTING.md*](./CONTRIBUTING.md) and
[U6 evidence](./docs/evidence/u6/README.md). The family therefore grows when
property files, domains, or case budgets are added, which is the separately
measured bottleneck the baseline records, and not when the corpus grows.

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

The projected longest test262 shard at the baseline total of 10 holds a derived
4,110 paths, since 41,091 is 10 times 4,109 plus 1. At the family-level rates
that shard is a derived 44.03 to 44.08 min at 0.629 s/path, depending on which
run's mean F is used, and 61.69 min at 0.886 with run 36243816479's F. The
baseline's derived per-shard residual rates spread wider than the family mean.
The slowest macOS shards are 1.193 s/path in run 36243816479 and 1.253 s/path in
run 36261458909, which with each run's own mean F project a derived 82.72 min
and 86.78 min for the slowest shard. Against the workflow's 120-minute
`test_test262` timeout that leaves a derived 33.22 min of headroom in the least
favorable case, so the baseline shard total does not itself breach the timeout
at 41,091 paths.

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
objects, a derived sum of 1,117 and a derived mean of 111.7. The same ten
values appear on `linux-x86_64-gnu`, so k belongs to the shard's reviewed path
set rather than to the host. The reported reuse count is zero in every one of
those jobs because the persistent object directory starts empty on a fresh
runner; later cases in the same job still share each prepared object through
the runner's promise map. U6 independently preserves these measured counters in
three source runs at 21,383 measured paths in
[U6 evidence](./docs/evidence/u6/README.md).

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

Zig compilation cache, U5. The cache contents are now measured rather than
inferred, and the unit is closed as do nothing. A byte-identical repeat of one
test262 shard reuses a derived 31 of 14,637 cache entries, a derived 0.21
percent, because Oseo stages every build in a fresh temporary directory whose
path reaches the compile and link command lines. The `native support` family
behaves the same way at a derived 31 of 3,211. Only the three-job `native`
family reuses, at a derived 1,155 of 1,500, and two options are estimated to
save slightly more than they cost: caching Zig's target-constant libraries is a
derived 0.83 to 1.49 min for a whole run, and caching the `native` family is a
derived 1.41 to 1.54 min net, or a derived 0.91 to 0.99 min once U4's 64.6
percent input-stability proportion is applied. Both are small beside the
derived 0.35 to 16.53 min same-job spread for one macOS test262 shard, and both
rest on a transfer band measured from a different cache, so these measurements
do not establish a runner-level improvement large enough to justify
implementing either. Sharing the whole
cache loses outright and does not fit the repository cache limit: one shard is
a measured 292.8 MB compressed, so the 27 macOS keys alone are a derived 7.91
GB against a derived 5.94 GB of headroom. This projection therefore assigns U5
no derived recovery, and the plan's own note that doing nothing is a valid
result stands. The condition for revisiting is path-independent staging in the
compiler, not a new cache. The measurements are in
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md) and their sources
in [*docs/evidence/u5/*](./docs/evidence/u5/README.md).

Reviewed runner per-execution cost, U13. This is the same family again, and
it is now measured rather than estimated. U13 Phase A found that the reviewed
test262 runner's throughput is bounded by its own single process rather than by
the pool: the measured Node process CPU stays at 42.0 to 52.8 s across pool 1
to 16 and 3 to 16 CPUs while wall time falls from 122.9 to 45.9 s for the same
214-path shard. Frontend, lowering, and C emission are a measured 6.4 percent
of that main-thread budget. The cost is per-execution work that never produces
a different answer: rereading and rehashing the 3,350,652-byte C runtime into a
runtime-archive key, and starting one `zig env` process to identify the
toolchain, for each of the shard's 730 native executions. Phase B derives both
once per runner process through an explicit prepared value that is rejected
when the execution's host, toolchain, target, runtime provider, or environment
snapshot differs, and which pins the compiler the recorded identity describes
so that a replaced or repointed executable cannot build under the previous
one's key. The measured before-and-after on the same shard, with the two arms
alternating by batch inside one session, is a 22.3 percent warm and 17.8
percent cold reduction with three cores, and 26.3 and 20.5 percent with four,
at 12.1 to 16.0 percent less tree CPU; all twelve position-paired comparisons
are reductions. Applying that 17.8 to 26.3 percent band to the measured macOS
execution-step sums estimates a derived 47.9 to 83.0 min per run at 21,383
paths and 92.1 to 159.5 min at 41,091. The 41,091-path figure is the one to
set against the derived gaps of +215.99 and +458.12 min, which are themselves
stated at 41,091 paths: it is a derived 43 to 74 percent of the smallest and 20
to 35 percent of the largest, so U13 narrows the gap materially without
closing it. That comparison applies the measured
fraction to a projection of the measured macOS execution-step sums rather than
to each scenario's own job-by-job decomposition, which this plan does not
carry at 41,091 paths. That band is measured on a Linux host restricted to
three and four cores. Branch CI run 36496566681 on `390cf60d` has since
measured the change against main run 36369711059. The twelve test262
execution steps sum to a measured 17,878 s before and 14,018 s after on macOS,
a derived 21.6 percent, and 12,130 s before and 9,664 s after on Linux, a
derived 20.3 percent, which is a derived 64.3 and 41.1 min. The whole-job
totals of the same family fall from a measured 308.37 to 243.10 min on macOS
and 206.42 to 165.20 min on Linux, a derived 21.2 and 20.0 percent. Both step
figures land inside the local band. One run per side cannot separate that from
runner variance: individual shards moved between a derived -53.1 and +12.4
percent, and families this change does not touch moved by up to a derived 18.9
percent in the same pair of runs. All 58 jobs of the branch run succeeded. U13
recovers runner minutes without touching reviewed paths, variants, targets,
sanitizer flags, budgets, or verdicts. Its measurements and their sources are
in [*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md) and
[U13 evidence](./docs/evidence/u13/README.md).

One limitation surfaced while reviewing U13 and is recorded here rather than
fixed by it, because it predates the unit and belongs to the runtime-archive
key. The key an adapter derives hashes the toolchain's identity output, which
for Zig is `zig env`: a version string and a set of paths. It does not hash
the contents of the library tree that identity points at. An in-place edit to
a file beneath that directory, a rewritten header or a replaced nested file,
therefore changes what a build compiles against without changing the key, on
the per-execution path and the prepared path alike. U13's pinned toolchain
matches that guarantee and adds an executable fingerprint on top of it; it
does not close the gap. Closing it means hashing the library tree, or
recording a stronger toolchain identity, and belongs to whichever unit owns
the archive key rather than to this one.

Reviewed runner process starts, U14. U14 measured what the reviewed runner
spends on starting processes after U13 and found the largest remaining
main-thread item on Linux: a derived 36.6 percent of sampled main-thread
self time, and a measured 9.65 to 9.73 s of main-thread time blocked inside
the start call against a 21.2 to 21.8 s runner duration on the same 214-path
shard, at two starts per native execution. The cost is the parent's size
rather than the child's, because libuv starts a process with `fork` on Linux
and each start copies the page tables of the roughly one-gigabyte runner. The
same measurement on macOS does not find it, which is what `posix_spawn`
would predict: a flat measured 0.263 to 0.265 ms per start across a tenfold
range of resident set, on a desktop M4 rather than a GitHub runner. A small
long-lived helper process that owns the starts was measured on the reviewed
shard with a throwaway prototype and reduces Linux wall time by a derived 6.9
to 13.1 percent across four configurations, with all twelve paired
comparisons reductions. U14 therefore has no demonstrated macOS runner
minutes to recover and is not adopted in M5CI; it is recorded as a measured
candidate for local Linux gate speed. The measurements are in
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md) and their sources
in [U14 evidence](./docs/evidence/u14/README.md).

Shard sizing, U6. Raising the test262 or native support shard total leaves the
executed work unchanged, so it recovers no runner minutes and adds a derived
1 min or so of fixed cost for each added macOS job. Its effect is on the tail
and the timeout margin. At 41,091 paths the projected wall-clock lower bound is
set by the workload term at 169 to 217 min, while the longest job is a derived
44 to 87 min, so rebalancing does not move the projected lower bound either. U6
is timeout insurance and tail control here, not workload recovery.

U6 implements twelve test262 shards with the same round-robin selection,
cost-based native file batching at the unchanged macOS totals, and five
Linux native-support shards instead of four. Linux shard one isolates
own-key with one file worker; the other four retain the remaining files.
Branch run 36343919872 failed own-key at the unchanged configured 3,600-second
property deadline after 149 reported examples. The corrected branch run
36358067906 passed all 58 observed jobs and was measured once. Its derived
macOS family total is 731.40 min versus 778.12 min in source run 36312192623,
and its derived five-slot wall lower bound is 146.28 min versus 155.62 min.
Those lower totals are not separable from runner variance and cache effects;
they do not establish runner-minute recovery or change this projection's
reachability conclusion. The measured timestamps, derived comparisons, and
failed-run analysis remain in [U6 evidence](./docs/evidence/u6/README.md).

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
derived runner minutes in these stacks. U6's once-measured green run does
not justify subtracting its lower observed total from either projection.

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

### Merge-wait goal and projection (U12)

On 2026-10-05 the maintainer replaced the M5CI goal. The old goal was a
ceiling of 628 macOS runner minutes for one CI run at 41,091 reviewed paths,
taken from main run `35456667007` at `32ece7f4` with 20,841 measured paths.
Every coverage-preserving lever, U1 through U8 and U10 through U22, was
measured, and the projection above stayed above that ceiling: a derived 844
to 1,086 min before the self-hosted Mac lane, with the stacks above leaving
150 to 214 min that no measured lever closed. The previous section left two
options, an unidentified lever or a maintainer decision to move the ceiling.
The maintainer took the second and kept coverage. No reviewed path, case
count, seed, property budget, shard total, job, target, sanitizer lane,
timeout, or verdict changed for this decision.

The goal is now merge wait: the push-to-green wall time of one merge should
be about two hours or less. Push-to-green runs from the attempt's
`run_started_at` to the last job's `completed_at`, read from the GitHub jobs
API. The 628-minute ceiling is superseded, not deleted. Its derivation in the
sections above remains the record of why the goal changed. Hosted macOS
runner minutes are no longer a goal. GitHub's standard hosted runners,
macOS included, are free for this public repository, so those minutes cost
merge wait only through the five concurrent macOS slots.

#### Measured push-to-green

Every value below was read from the GitHub jobs API for the named attempt
and is measured, rounded to 0.1 min. The wall to the last job is the
push-to-green time when the attempt is green. The assignment column names the
Mac lane assignment the run used: none for all-hosted runs, U22 for the ratios
merged at `e115c408`, U23 for the ratios merged at `840c387e`, U24 for the
median weights merged at `bdf2dddd`, and U27 for the two Mac lanes of branch
`m5ci-mac-second-lane`. Mac job minutes are summed job walls on runner
`oseo-mac-1`, or on `oseo-mac-1` and `oseo-mac-2` together for U27; hosted
macOS job minutes are the other jobs of the macOS matrix, excluding the
Linux-hosted availability probe.

| Run, attempt     | Commit     | Assignment | Wall to last job | Hosted macOS job min | Mac job min |
| ---------------- | ---------- | ---------- | ---------------: | -------------------: | ----------: |
| `36312192623`, 1 | `af9bb68c` | none       |            173.2 |                778.1 |         n/a |
| `36496566681`, 1 | `390cf60d` | none       |            147.0 |                705.6 |         n/a |
| `36516215200`, 1 | `97278fc6` | none       |            175.8 |                718.2 |         n/a |
| `36640728403`, 1 | `82bba77e` | none       |            160.1 |                701.8 |         n/a |
| `36704198556`, 1 | `49a38d5d` | none       |            155.5 |                728.1 |         n/a |
| `36721134885`, 1 | `2434dd8b` | none       |            159.0 |                755.7 |         n/a |
| `37121778924`, 1 | `2528f040` | none       |            172.1 |                734.8 |         n/a |
| `37167895777`, 1 | `2fadb275` | none       |            156.6 |                716.0 |         n/a |
| `37194069657`, 1 | `1c64f3cd` | U22        |            107.9 |                505.0 |        81.5 |
| `37194069657`, 2 | `1c64f3cd` | U22        |            111.1 |                514.8 |        83.7 |
| `37206614757`, 1 | `e115c408` | U22        |            113.5 |                527.1 |        79.0 |
| `37215661294`, 1 | `29f11948` | U23        |            112.2 |                499.8 |        79.5 |
| `37215661294`, 2 | `29f11948` | U23        |            105.3 |                489.4 |        78.8 |
| `37230598930`, 1 | `840c387e` | U23        |            106.8 |                480.0 |        79.0 |
| `37237684441`, 1 | `54d2c336` | U24        |             98.3 |                443.6 |        80.8 |
| `37237684441`, 2 | `54d2c336` | U24        |             95.8 |                449.3 |        81.8 |
| `37251028948`, 1 | `bdf2dddd` | U24        |             98.6 |                446.6 |        95.5 |
| `37315038080`, 1 | `4b20631b` | U24        |             99.5 |                469.4 |        97.4 |
| `37332256715`, 1 | `6654ccf7` | U24        |            100.2 |                470.3 |        83.5 |
| `37398055382`, 1 | `11634e90` | U27        |             79.6 |                332.3 |       147.5 |
| `37398055382`, 2 | `11634e90` | U27        |             78.9 |                338.2 |       148.2 |

Main run `36312192623` at `af9bb68c` measured 173.2 min when this work
started. After U13 (`390cf60d`, merged as `97278fc6`) and U16 (`82bba77e`,
merged as `df5cb7a1`), the seven green all-hosted attempts measured 147.0 to
175.8 min. Main run `36657614384` at `df5cb7a1` is omitted: its first attempt
failed at a measured 145.4 min, and its second attempt reran only the failed
job. With the U22 and U23 assignments, the six green attempts measured 105.3
to 113.5 min. The five U24 attempts measured 95.8 to 100.2 min, and the two
U27 attempts 79.6 and 78.9 min. Attempt 1 of main run `37332256715` and
attempt 1 of branch run `37398055382` were red only in the Linux-hosted
`test (ubuntu-latest, node)` job; every macOS job passed, so their values
are the measured wall to the last job, not a green verdict. Run `37315038080`
is the U26 disk-sampling branch run, with a sampler running on the Mac, and
its Mac job minutes include that run's cache state. Every value above is one
attempt. The seven all-hosted attempts after U13 span an
observed 28.8 min, but they straddle U16 and other merged work, so that
spread is not runner variance alone. The six U22 and U23 attempts span an
observed 8.2 min, and a difference of that size between two single attempts
does not by itself separate an assignment effect from runner variation.
Main run `37251028948`, the first main run with the U24 assignment, measured
98.6 min. The U27 attempts lie a derived 16.2 to 21.3 min below the five U24
attempts, more than either group's own spread of 4.4 and 0.7 min; the U27
section below compares them with the derived prediction.

#### Projection at 41,091 paths

This projection is derived. It uses the same split as the projection above:
test262 work scales linearly in reviewed paths, and every other family is
held, because its inputs are property files, native fixtures, or sanitizer
suites. Its inputs are the per-job walls of the ten newest green attempts:
all-hosted runs `37121778924` and `37167895777`, and the eight Mac-lane
attempts above. The model is:

 -  Each job's hosted and Mac costs are the minimum, median, and maximum of
    its own observations on that runner class, which gives three cost
    scenarios. Every job that one of the evaluated assignments places on
    the Mac has at least two Mac observations.
 -  A test262 job keeps the 60-second fixed setup share of
    *tools/macos-job-costs.ts*. Its remainder is multiplied by
    41,091 / 21,383, a derived 1.922. The 21,383 is the current reviewed
    count that test262 job logs report as `tests=1782/21383` in runs
    `37206614757` and `37237684441`.
 -  A Mac-eligible job with no Mac observation is converted from its hosted
    cost in the same scenario by a pooled ratio, the sum of hosted medians less
    setup divided by the sum of Mac medians less setup over jobs with both: a
    derived 4.91 for test262, 3.63 for native support, and 3.21 for native
    fixtures. These differ from the rounded 4.2, 3.2, and 3.1 in
    *tools/macos-job-costs.ts* because they include the U24 attempts, in
    which the converted test262 jobs ran faster than modeled. Only the
    recomputed assignment below uses them.
 -  Each scenario holds one assignment fixed and sums its lanes' costs. The
    Mac lane starts after the 60-second probe allowance. The U22, U23, and
    U24 rows hold each job on the lane that `macosLanes(1)` in
    *tools/generate-macos-lanes.ts* assigns at `e115c408`, `840c387e`, and
    `bdf2dddd`, respectively. U24 is the assignment on current main.
 -  The recomputed rows are not a merged assignment. They model the U24
    rule, own-key case shards on the Mac lane first and then the other jobs
    longest first to whichever of five hosted lanes or one Mac lane would
    finish them sooner, applied to median costs from the ten attempts. At
    41,091 paths the assignment uses the scaled medians, standing in for
    medians that would be measured at that path count. Only Zig-backed
    families are Mac-eligible.
 -  The model omits hosted job waits, the aggregate job, and the Linux and
    Windows jobs. At 41,091 paths the longest Linux test262 shard is a
    derived 35.9 min at its median. The longest unscaled job is the Linux
    sanitizer job, at a measured 64.6-min median and 72.2-min maximum. Both
    stay below the macOS makespan.

| Assignment, scenario        | Derived at 21,383 | Derived at 41,091 |
| --------------------------- | ----------------: | ----------------: |
| U22 (`e115c408`), minimum   |              93.3 |             130.6 |
| U22 (`e115c408`), median    |             105.1 |             155.9 |
| U22 (`e115c408`), maximum   |             119.8 |             181.0 |
| U23 (`840c387e`), minimum   |              89.9 |             139.9 |
| U23 (`840c387e`), median    |             105.4 |             156.8 |
| U23 (`840c387e`), maximum   |             121.2 |             193.8 |
| U24 (`bdf2dddd`), minimum   |              82.7 |             113.3 |
| U24 (`bdf2dddd`), median    |              94.1 |             130.3 |
| U24 (`bdf2dddd`), maximum   |             108.1 |             145.1 |
| Recomputed medians, minimum |              89.8 |             112.1 |
| Recomputed medians, median  |              93.2 |             116.3 |
| Recomputed medians, maximum |             115.3 |             132.3 |

At the current paths each fixed assignment's median evaluation lies near
its measured attempts. U24 gives 94.1 min against a measured 98.3 and 95.8
min, 4.2 and 1.7 min above it. U23 gives 105.4 min against a measured
112.2, 105.3, and 106.8 min, and U22 gives 105.1 min against a measured
107.9, 111.1, and 113.5 min. The modeled U24 Mac lane ends at a derived 83.2
min at the median, against a measured 82.0 and 83.0 min. The maximum
scenario puts every job at its own worst observation at once, which no
single measured run did; it is a pessimistic bound rather than an expected
value.

At 41,091 paths the U24 assignment grows by a derived 30.6 to 37.0 min,
because the scaled test262 jobs stay on the lanes chosen for their current
weights. At the median, hosted lane 5 grows from 89.7 to 130.3 min with
test262 6/12 and 10/12, and the Mac lane grows from 83.2 to 112.4 min with
eight test262 shards. The two-hour goal therefore holds with the current
U24 assignment only in the minimum scenario, by 6.7 min. It does not hold at
the median, a derived 130.3 min, or in the maximum scenario, 145.1 min, both
before the unmodeled overhead. The U22 and U23 assignments, at a derived
130.6 to 193.8 min, do not hold it in any scenario.

The recomputed assignment holds the goal in the minimum and median
scenarios, the median by 3.7 min, which is less than one run's spread. In
the maximum scenario it exceeds two hours by 12.3 min. At the current paths
it gives no improvement over U24: its median is 0.9 min lower and its
maximum 7.2 min higher. Its effect at 41,091 paths comes from assigning the
scaled test262 jobs, so it depends on recomputing the medians as reviewed
paths grow.

These rows model one Mac lane. With the two Mac lanes of U27, the
projection from the measured two-lane job walls of branch run
`37398055382` gives a derived 103.1 and 104.0 min at 41,091 paths, and the
U27 model a derived 106.3 min; the U27 section below derives both.

The goal also depends on the Mac runners being online. When the readiness
probe falls back to hosted macOS for every lane, the same model gives a derived
177.2 to 228.2 min on five hosted lanes at 41,091 paths, against 136.4 to 177.9
min at the current paths. Both use the longest-first assignment, because the
fallback schedule is not modeled separately.

Shard totals are held at the current twelve for test262 and twelve for
macOS native support. Raising the test262 total is allowed and lowering it
is not. With each total's family work split evenly, one fixed setup share
per job, and the recomputed assignment, the median scenario gives a derived
118.2, 120.0, and 121.5 min at 16, 20, and 24 test262 shards against 116.3
min at twelve. The minimum scenario gives 113.5, 113.2, and 112.7 min
against 112.1, and the maximum gives 131.8, 130.5, and 138.5 min against
132.3. Raising the total therefore does not improve the median scenario,
and no modeled total makes the goal hold in the maximum scenario. The
longest scaled hosted test262 job at twelve shards is a derived 48.3 min at
its median and 55.1 min at its maximum, below the 120-minute job timeout,
so raising the total is not needed for timeout margin either.

U22, U23, U24, and U27 are applied. Two concurrent Mac jobs, lever 2 of
earlier revisions of this list, is no longer a remaining lever: U27 runs
them as two runners on the Mac mini, measured in branch run `37398055382`
below. With the measured two-lane walls, the derived makespan at 41,091
paths is 103.1 and 104.0 min with the U27 assignment held fixed. The
remaining coverage-preserving levers, none of which is applied, are:

1.  Recompute the median tables in *tools/macos-job-costs.ts* from the
    newer attempts, including the U24 and U27 attempts, and again as
    reviewed paths grow. The one-lane recomputed rows above estimate a
    derived 112.1 to 132.3 min at 41,091 paths. In the U27 projection the
    hosted lanes that carry two test262 shards end last, so recomputing the
    assignment from scaled medians would rebalance them; that two-lane
    recomputation is not modeled. A two-attempt branch measurement must
    confirm any recomputed assignment.
2.  Add a second Mac with the same measured speed as an independent lane.
    With the recomputed one-lane assignment over the two Macs, the U12
    model gives a derived 78.3 to 103.0 min; it does not model two runners
    on each machine. It also halves the exposure to one machine's absence.
3.  Raise shard totals only as tail or timeout insurance. Under this model
    they do not improve the median makespan or make the goal hold in the
    maximum scenario.

Hosted macOS runner minutes at 41,091 paths are restated for reference
only. With every macOS job on hosted runners, the same inputs give a
derived 834.5, 962.4, and 1,091.1 min for the three scenarios. At the
current paths they give 642.2, 737.7, and 832.7 min, against a measured
716.0 and 734.8 min in the two all-hosted runs. These figures use
different inputs from the 844 to 1,086 min projected above, which predates
U13 and the own-key case shards, and neither is a goal any more.

#### Two concurrent Mac jobs (U25)

[U25 evidence](./docs/evidence/u25/README.md) measured two concurrent Mac
jobs, then lever 2, on the Mac mini at `317b58bb`, over SSH in two clones with
separate Zig caches, using the exact post-checkout commands of five
Mac-eligible jobs. It ran 20 solo and 12 paired experiments, and the runner was
idle in all 674 checks. All 48 jobs passed with unchanged counts. In every
paired 2-second sample the memory pressure level stayed normal. Swap did not
grow and recorded no swapouts. Pageouts were 0 to 4 per experiment, as in solo
runs, and the summed peak RSS of both jobs was at most a measured 5,996 MiB.
The compressor absorbed the extra demand, compressing up to 3.9 GiB in one pair.

The slowdowns were asymmetric. Test262 ran a measured 0.997 to 1.073
times its solo wall beside a property or fixture job and 1.19 to 1.21 times
slower beside another test262 job. Beside test262, the jobs with fewer workers
ran a derived 1.36 to 1.37 (native support), 1.398 to 1.404 (native fixture),
and 1.44 to 1.45 (own-key) times slower while overlapped. Pair throughput was a
derived 1.49 to 1.79. The own-key shard's measured duration was at most 479.7 s
against its 3,600 s limit. None of the six measured pairings needs to be
excluded. Native fixture + native fixture, own-key + own-key, and own-key +
native fixture were not measured and have no verdict; their sums of solo peaks,
derived, are 2,504 to 3,934 MiB.

With those family maxima applied to every Mac job, the U12 model gives
a derived 93.2, 96.3, and 110.6 min at 41,091 paths. That is 18.9 to
21.7 min below one Mac lane with recomputed medians, and it holds the goal
in all three scenarios. A uniform 1.45 gives 94.4 to 112.5 min. At the
current paths the gain over the U24 assignment is a derived 6.2 to
17.5 min. Disk is the binding resource. Every job, warm or cold, added
0.9 to 3.8 GiB of Zig cache files, so a second runner doubles cache growth
under the existing 40 GiB prune. That prune is a shared free-space trigger
that removes only the invoking account's cache, so it bounds neither cache
alone: an idle runner can keep a derived 142.2 GiB of cache on the measured
228.2 GiB volume, and the hook guarantees no free-space floor. A second
runner is therefore preconditioned on a per-account Zig cache size cap,
derived strictly below 34.3 GiB once both accounts' usage and a job's peak
work-directory and temporary use are measured under `sudo`, with a reserve
for other growth. A shared account also needs a separate
cache per runner and a hook that caps and prunes each runner's path. Neither
is applied. Runner mode, the second runner's Developer Tools grant, and its U17
probe are untested. The README lists the maintainer steps. Nothing was
applied in U25; U26 below installed the cap on `oseo-mac-1`.

#### Per-account Zig cache cap (U26)

[U26 evidence](./docs/evidence/u26/README.md) used a `sudo` inventory and
disk samples taken during the 15 Mac jobs of branch run `37315038080`. The
runner account's cache grew a measured 38.6 to 63.6 GiB, a job's work
directory peaked at a measured 0.49 GiB, and non-cache use peaked at a
derived 75.2 GiB. Keeping 40 GiB free with two accounts at the cap, both
running a job, gives a derived cap of at most 38.8 GiB with a 20 GiB
reserve. The hooks now remove the invoking account's cache above
`OSEO_ZIG_CACHE_CAP_GIB`, 30 GiB by default and at most 38 GiB, and keep the 40
GiB free-space prune as a backstop. The cap's lost warm reuse costs at most a
derived 4.5 min of Mac lane time per trip, about once per run, excluding
the prune itself, and a measured 1.1 to 3.3 s per
hook to measure a cache of that shape. A second runner is still not
registered, and the shared-account layout remains unsupported.

The maintainer installed the U26 hooks for `oseo-mac-1` on 2026-10-06
(about 03:40 KST) with *install-service.sh* at main `6654ccf7` and
`OSEO_ZIG_CACHE_CAP_GIB=30`; PlistBuddy printed 30, and `cmp` found the
installed *cleanup.sh* equal to the repository copy. Branch run
`37360463788` (`m5ci-cap-verify`, a commit whose tree equals `6654ccf7`)
verified it. Its first Mac job, test262 7/12 (job `111933637542`), entered
the job-started hook at 19:02:44Z and logged at 19:08:15Z that it pruned
the Zig cache for exceeding the 30 GiB cap. The hook, measuring and
removing the 63.6 GiB cache, took a measured 5.5 min from entry to that
message, against the measured 39 s for a
synthetic tree of that size, and made that job a measured 10.0 min. This
was a one-off cost of the oversized cache: a later prune removes the 30 GiB
cap plus one job's growth, a derived 33.8 GiB with U25's measured 3.8 GiB
maximum growth, an estimate rather than a bound. The coordinator
observed free disk rise from the measured 92.5 GiB U26 minimum to 155 GiB.
The other 14 Mac jobs took a measured 4.3 to 6.9 min after the cache was
emptied, with no sign of a first-execution penalty after the installer's
daemon restart, though the U17 probe was not rerun. All 15 Mac jobs passed
in a derived 87.1 min, the sum of their measured durations, measured once.
Attempt 1 failed only because three hosted macOS jobs were never acquired by a
hosted runner; the `--failed` rerun, attempt 2, passed.

#### Two Mac lanes (U27)

The generator now emits two optional Mac lanes, `oseo-mac-1` and
`oseo-mac-2`, beside the five hosted lanes, for two persistent runners on
the same Mac mini under two standard accounts. The maintainer registered
`oseo-mac-2` on 2026-10-06; while it is offline, its lane falls back to
hosted `macos-15`. The
readiness job's single probe makes one decision per lane: a lane selects
its runner only when exactly one runner carries the lane's label, that
runner's name is the label, it carries no other lane's label, and it is
online and idle. A busy, offline, or ambiguous runner sends only its own
lane to hosted, and an API failure sends both. Eligibility stays Zig-only,
routing stays push-only, and the job names, the aggregate's required set,
shard totals, and coverage are unchanged. The three own-key case shards stay
together on the `oseo-mac-1` lane, so one readiness decision still gives
their duration sum one runner class. The installer and health check take
the runner from `OSEO_RUNNER_LABEL`, `oseo-mac-1` by default, and the
installer prints the same `oseo-mac-1` property list as before, byte for
byte, which *tests/macos-lanes.test.ts* checks against a fixture written by
the previous installer's plist writer.

The model treats the two Mac lanes as two queues sharing one machine. Each
lane starts after the 60-second readiness allowance and runs its jobs back
to back from their one-lane costs, the same measured Mac medians or
converted hosted medians as before. While both lanes are busy, a job
advances at its one-lane speed divided by a pair factor for its family and
its partner's family; while the other lane is idle or done, it advances at
one-lane speed. The factors in `selfHostedPairSlowdowns` of
*tools/macos-job-costs.ts* are the largest overlapped factor that U25
derived for each measured pairing, rounded up: 1.26 for test262 beside
test262, at most 1.08 for test262 beside another family, 1.37, 1.13, and
1.05 for native support beside test262, native support, and the other two,
1.45 and 1.27 for own-key cases beside test262 and native support, and 1.41
and 1.04 for native fixtures beside test262 and native support. The three
unmeasured pairings use the family's largest factor. This model was chosen
over U25's family maxima applied to every Mac job because U25 measured the
interference to be asymmetric, test262 ran at a measured 0.997 to 1.073
times its solo wall beside a property or fixture job, and a lane's tail
runs alone. The greedy assignment places each job on the lane with the
earliest derived end among the lanes the placement changes, which on a Mac
lane includes the other Mac lane that the new overlap delays. With one Mac
lane this reduces to the previous rule and reproduces the U24 assignment.

`node tools/macos-lane-report.ts` prints the derived values below. With the
current cost tables, the derived macOS makespan is 77.2 min with two Mac
lanes, against 93.5 min for the current one-lane assignment. The two-lane
assignment puts 19 jobs on the Mac, 10 on `oseo-mac-1` and 9 on
`oseo-mac-2`, and its lanes end at a derived 66.3 to 77.2 min, with the
`oseo-mac-1` lane last. Evaluated against each of the ten measured attempts in
*docs/evidence/u25/model/*, with each attempt's measured wall for a job
that ran on the same runner class there and the cost tables otherwise, the
derived makespan is 72.1 to 86.5 min with two Mac lanes and 91.7 to
102.7 min with one. Two lanes are lower in every attempt, by a derived 16.2
to 25.3 min. These are derived scheduling estimates at the current 21,383
paths. The generated Mac jobs need only the readiness job, so each runner
may take its lane's queued jobs in any order, and the model's order is one of
them. Over the generated order and 1,000 seeded random orders of each Mac
lane, the report gives a derived 76.3 to 78.3 min with current costs, and
the per-run range over the same orders is also a derived 72.1 to 86.5 min. That
is a sample of orders, not a bound. Chaining the Mac jobs would fix the order
but would also chain them when the probe falls back to hosted, so they stay
unchained. The pair factors come from SSH runs, not runner mode, and the model
omits the measured 0.5 to 1.5 min of lane overhead. A pessimistic check that
slows every Mac job of the two-lane assignment by 1.45 for its whole wall,
beyond any test262 factor U25 measured, gives a derived 96.1 min. The fallback
schedule while `oseo-mac-2` is offline, nine more hosted jobs without a
predecessor chain, is not modeled and is expected to be slower than the
one-lane assignment.

The maintainer registered `oseo-mac-2` with the steps in
[*docs/self-hosted-mac.md*](./docs/self-hosted-mac.md), and the two-attempt
branch run below measured the change.

#### Measured runs of the two Mac lanes

Branch run `37398055382` at `11634e90` ran with both runners online. Attempt
2 was a full rerun. Every value in the table is measured from the GitHub
jobs API with the definitions of the U12 table above and rounded to
0.1 min; lane ends are minutes after the attempt's `run_started_at`. The
[*U27 evidence*](./docs/evidence/u27/) keeps the job rows and scripts.

| Attempt | Wall to last job | `oseo-mac-1` jobs, min, end | `oseo-mac-2` jobs, min, end | Hosted macOS jobs, min, last end |
| ------: | ---------------: | --------------------------- | --------------------------- | -------------------------------- |
|       1 |             79.6 | 10, 78.5, 79.3              | 9, 69.1, 69.9               | 15, 332.3, 72.7                  |
|       2 |             78.9 | 10, 77.5, 78.5              | 9, 70.7, 71.7               | 15, 338.2, 77.8                  |

Attempt 1 was red only because the Linux-hosted `test (ubuntu-latest, node)`
job failed in the known flaky test “supervisor SIGTERM cancels and reaps the
detached fixture” of *tests/native-fixture.test.ts*; every macOS job passed in
both attempts, so the wall to the last job is a push-to-green time only for
attempt 2. Both attempts placed exactly the generated 10 and 9 jobs on
their lanes, so neither lane fell back. Each runner took its lane's jobs in an
order that differed from the generated one and between the attempts. The last
macOS job ended at a measured 79.3 and 78.5 min; the native aggregate then
ended the run 0.3 and 0.4 min later.

The measured makespan matches the derived prediction within its stated
range. It is 2.1 and 1.3 min above the derived 77.2 min, inside the derived
72.1 to 86.5 min per-run range, and 1.0 and 0.2 min above the derived 76.3
to 78.3 min order sample. The lanes deviated in opposite directions. With
each attempt's observed pickup order, the model ends `oseo-mac-1` at a
derived 77.1 and 77.3 min, 2.2 and 1.2 min before its measured end, and
`oseo-mac-2` at 73.8 min in both, 3.9 and 2.1 min after its measured end.
The measured lane overhead, lane end minus the sum of its job walls, was
0.8 min on both lanes in attempt 1 and 1.0 min on both in attempt 2,
against the model's 1.0 min allowance. The measured walls to the last job
are a derived 16.2 to 21.3 min below the five one-lane U24 attempts above.

The pair slowdowns below are derived per job with U25's overlapped factor:
the job's overlapped seconds divided by the work left for the overlap,
which is its one-lane median less its non-overlapped seconds. The
one-lane median is the median of the job's measured `oseo-mac-1` walls in
the eight Mac-lane attempts of the U12 model and one-lane runs
`37251028948`, `37315038080`, and `37332256715`. It has 3 to 11
observations per job, and one job's one-lane walls range by up to a
derived 100 s, so a single factor carries that noise; four factors below
fell under 1, one of them rounding to 1.00. `native support` 7/12 and 9/12 have
never run one-lane on the Mac and have no factor. The table keeps the 24 jobs
that overlapped the other lane for at least 80 percent of their wall and spent
at least two thirds of that overlap beside one partner family; it omits eight
jobs with a more even mix or a shorter overlap. Each factor comes from runner
mode with separate accounts, where U25 used SSH clones:

| Job family     | Main partner   | Observed factors                   | Model factor | U25 overlapped factor |
| -------------- | -------------- | ---------------------------------- | -----------: | --------------------- |
| test262        | test262        | 1.40, 1.41                         |         1.26 | 1.19 to 1.26          |
| test262        | native support | 0.89, 1.00, 1.14, 1.31             |         1.08 | 1.00 to 1.07          |
| test262        | own-key cases  | 1.01, 1.07                         |         1.01 | 1.00                  |
| native support | native support | 1.14, 1.18, 1.27, 1.36, 1.56, 1.66 |         1.13 | 1.12                  |
| native support | own-key cases  | 0.93, 0.95, 1.08                   |         1.05 | 1.04, with `nat-3`    |
| native support | test262        | 1.41                               |         1.37 | 1.36 to 1.37          |
| own-key cases  | native support | 1.15, 1.45, 1.61                   |         1.27 | 1.26 to 1.27          |
| own-key cases  | test262        | 1.78                               |         1.45 | 1.44 to 1.45          |
| native fixture | native support | 1.14, 1.30                         |         1.04 | 1.03                  |

Every observation exceeded the model factor in the rows for test262 beside
test262, native support beside native support or test262, own-key beside
test262, and native fixture beside native support, and at least one did in
each other row. Pooled over each lane's jobs
with a one-lane median, the derived wall-to-median ratio was 1.297 and
1.282 on `oseo-mac-1` (10 jobs) and 1.176 and 1.242 on `oseo-mac-2` (7 of 9
jobs) in attempts 1 and 2. That is below the uniform 1.45 of the
pessimistic check above and close to the U21 latency factor of 1.29. The
model still matched the makespan because the lanes' errors offset;
refitting `selfHostedPairSlowdowns` to these observations needs more
attempts and is not done here.

`oseo-runner2` was created on 2026-10-06, so attempt 1's `oseo-mac-2` jobs
started without a Zig cache from earlier runs; cold and warm cache effects
were not measured separately. The own-key duration records of attempt 2
were a measured 392.5, 563.6, and 466.8 s for shards 1 to 3, a derived
1,422.9 s sum against the 3,600 s hard limit. That leaves a derived
2,177.1 s margin; the sum is a derived 39.5% of the limit. Shard 2, which
overlapped test262 for most of its wall, exceeded U25's measured 479.7 s
maximum. Attempt 1's records were no longer downloadable after the full
rerun (HTTP 404).

The comparable one-lane sums come from the measured records of the eight
one-lane Mac-lane runs. Each run keeps only the records of its latest
attempt that ran the own-key jobs, so three earlier attempts have none. In
each, the three shards ran on `oseo-mac-1` with no other job on the Mac:
`37194069657` 2, `37206614757` 1, `37215661294` 2, `37230598930` 1,
`37237684441` 2, `37251028948` 1, `37315038080` 1, and `37332256715` 1.
Their derived sums were 930.5 to 960.2 s, a derived 25.8% to 26.7% of the
limit, leaving 2,639.8 to 2,669.5 s; no one-lane shard exceeded a
measured 337.3 s. The two-lane sum is a derived 462.7 to 492.4 s, or 1.48
to 1.53 times, above those, so the second lane cost a derived 462.7 to
492.4 s of the deadline margin in this one attempt. The margin is still
more than half the limit. One attempt does not show whether that holds
with other pickup orders, which decide how long each shard overlaps
test262.
[*docs/evidence/u27/own-key-durations.tsv*](./docs/evidence/u27/own-key-durations.tsv)
keeps every record. The coordinator measured 115 GiB free on the Mac after the
runs, above the 40 GiB backstop.

At 41,091 paths, this projection is derived from the measured two-lane job
walls. It holds each job on the lane it ran on and adds, for every test262
job, its measured wall less the 60-second setup share times 0.922, the
growth to 41,091 / 21,383 of the path-proportional part. Lanes are serial,
so each lane end grows by the sum of its test262 increments:

| Attempt | Derived at 41,091 | Hosted lanes 1 to 5            | `oseo-mac-1` | `oseo-mac-2` |
| ------: | ----------------: | ------------------------------ | -----------: | -----------: |
|       1 |             103.1 | 83.9, 92.7, 84.3, 103.1, 102.4 |         87.3 |         83.4 |
|       2 |             104.0 | 92.5, 96.6, 67.1, 99.7, 104.0  |         86.0 |         85.3 |

Hosted lanes 4 and 5, each with two test262 shards, end last. The same U27
model with current costs, the generated assignment held fixed, and test262
scaled likewise gives a derived 106.3 min. The goal therefore holds with a
derived 16.0 to 16.9 min of margin from the measured walls and 13.7 min
from the model, against a derived 112.1 to 132.3 min for the recomputed
one-lane assignment and 113.3 to 145.1 min for the fixed U24 assignment in
the U12 projection. Unlike those scenarios, these values come from two
attempts of one commit, not per-job minimum, median, and maximum
observations. They keep the measured interference per second of test262
work, although longer Mac test262 jobs would change which jobs overlap, and
they omit hosted job waits and the fallback schedule.

#### Hosted fallback property deadlines (U28)

Main run `37506307446` at `12394d8a` started while main run `37499455406`
at `45af71ff` still held both Mac lanes. The readiness probe observed both
runners busy and emitted hosted `macos-15` for `r1` and `r2`, so all 19
Mac-lane jobs ran hosted beside the 15 hosted-lane jobs. Attempt 1 failed
in two jobs, both with `markInterruptAsFailure`:
`native support (macos-aarch64, 9/12)` interrupted six properties at their
1,800,000 ms extended limit after a measured 87.2 min, and
`test (macos-latest, node)` interrupted the ordinary own-key property at its
360,000 ms limit after 15 of 16 cases. A `--failed` rerun passed both. Because
the orchestrator lands commits back to back, a push commonly probes while the
previous run's lanes are busy, so this is the fallback schedule's ordinary
state, not a rare one. [*U28 evidence*](./docs/evidence/u28/) keeps the job
rows, the per-property durations, and the own-key records of both runs.

The two runs ran the same four native support shards on `oseo-mac-2` and
on hosted runners. For the passing properties, the pooled hosted/Mac
duration ratio (sum of hosted seconds over sum of two-lane Mac seconds)
was a derived 2.64 in shard 1/12 (6 properties), 1.06 in 7/12 (12), 1.75
in 9/12 (10), and 1.84 in 10/12 (12); the largest single ratio of a
property longer than ten seconds was 3.16, and a seven-second property
reached 8.23. The matched job walls of the nine passing Mac-lane native
support jobs pooled to a derived 2.86, or 3.12 after the 60-second setup
share, against the 3.2 family ratio of *tools/macos-job-costs.ts* and the
3.55 and 3.60 that U24 measured. Those Mac walls are two-lane walls that
U27 measured at 1.18 to 1.30 times one-lane walls. On the hosted runner the
passing extended properties used a derived 6 to 45 percent of their
limits; on the Mac lane 5 to 25 percent.

The six interrupted properties of shard 9/12 are outside that range. From
the measured cases completed at the interrupt, their hosted need
extrapolates to a derived 2,383, 2,455, and 2,572 s for the three that ran
together first (7.5 to 9.0 times their Mac durations, 1.3 to 1.4 times
their limit) and 5,635, 5,833, and 6,006 s for the three that followed
(31 to 33 times their Mac durations, 3.1 to 3.3 times their limit). The
same runner had completed the shard's first ten properties at 1.2 to 3.2
times their Mac durations, so the job degraded during its last hour. Even
an interrupt limit that let all six finish would have ended the job after
its 90-minute timeout, at a derived 167 min, so that attempt is a rerun
under any deadline. The ordinary own-key property of
`test (macos-latest, node)` measured 299.9 s in `37499455406`, 251.8 s in
attempt 2 of `37506307446`, and over 360.0 s at 15 of 16 cases in attempt
1, a derived 384 s need; the budget's comment extrapolated 295 s on
ubuntu-latest, which measured 286.7 s in `37499455406`.

The change makes the interrupt limits follow the runner while every budget
stays fixed, through the existing `OSEO_PROPERTY_TIME_SCALE`:

 -  A Mac-lane `native support` job carries a job-level
    `OSEO_PROPERTY_TIME_SCALE` read from its lane's readiness output: 1
    when the output names the self-hosted runner, and
    `hostedFallbackTimeScale`, 4, when it is hosted or empty. Four is the
    derived ceiling of the 3.2 family ratio and covers every pooled ratio
    above, including the 3.12 matched job-wall ratio and U24's 3.60; it does
    not cover the degraded shard, which no limit under the job timeout covers.
    With zero configured lanes every job is hosted by design and carries no
    scale.
 -  The `test` matrix step sets `OSEO_PROPERTY_TIME_SCALE` to 2 when
    `runner.os` is macOS and 1 elsewhere. That job is always hosted, so the
    scale is not a Mac ratio: it gives the macOS runner the margin the
    360,000 ms budget was written with, since the measured 252 to 384 s
    need sits at 70 to 107 percent of the limit. The Deno job on macOS
    receives the same factor on package properties with 5 and 10 s limits.
 -  Own-key case shards keep the original 3,600,000 ms limit on either
    runner class. Their duration record stores the effective limit, and
    `check:property-case-durations` requires it to equal the original and
    compares the recorded sum with it; the macOS sums measured 2,343 to
    2,878 s in the three runs whose own-key shards ran hosted, a derived 65
    to 80 percent of the aggregate deadline, against 1,486 s on the
    two-lane Mac.
    Test262 and native fixture jobs run no fast-check property, and the
    host C sanitizer jobs keep their existing 3 and 6.
 -  No `timeout-minutes` changes. A passing job is not lengthened by a
    wider interrupt limit, and the only job that needed more than 90 min
    was the degraded shard above.

Case counts, `numRuns`, seeds, sizes, shard totals, targets, the required
check names, and the failure of an interrupted run are unchanged. Two
larger changes were considered and left to the maintainer:

 -  The probe could wait for a lane instead of falling back. A busy lane
    is the orchestrator's previous run, whose Mac work ends a measured
    70 to 80 min after it starts, so the wait would often be shorter than
    the hosted fallback's own slowdown; but a `mac_ready` job that waits
    holds a Linux runner, delays every lane job behind it, and still
    cannot reserve the runner against a third push. A bounded wait with a
    hosted fallback at expiry would need its own measured runs.
 -  The decision could be per job rather than per run, with each job
    probing before it starts or letting GitHub queue it on the runner
    label. Per-job probing needs the token in every job or a probe job per
    lane job, and queuing on the label with no fallback is what the
    current design avoids. The own-key shards also need one runner class
    for their duration sum, which a per-job decision would have to keep.

### macOS static capacity lanes (U16)

The workflow now generates five macOS job chains from measured whole-job
costs in *tools/macos-job-costs.ts*. All 31 macOS workloads and all 58 check
names remain present. Each successor uses `!cancelled()` so predecessor
failure does not skip coverage; the native aggregate requires success from
every native and test262 shard. *tools/main-workflow.template.yaml* owns the
commands, and `mise run check:macos-lanes` rejects generated workflow drift.

The derived longest lane is 8872 s (147.87 min, or 147.9 at one decimal
place) using measured durations from main run `36516215200`; this models
five exclusive slots and excludes additional queue delays. The measured
peak was five macOS jobs in that run and same-size main run `36369711059`,
where the jobs were eligible together. Both branch runs also reached five,
as constrained by the new lanes. Workflow concurrency is unchanged, so
other runs can still compete for those slots.

The first branch run, `36598029271` at `d0a39f79`, falsified the original
one-entry-matrix name model: GitHub appended matrix values to literal job
names. The corrected generator binds values directly and emits no macOS
matrices; its 58 rendered names are compared with the measured names from
main run `36516215200`. The first revision remains a lane timing sample.
Its unchanged Linux sanitizer job failed before compiling the
`monotonic-timer-wakeups` fixture when Node and Deno disagreed on timer
ordering in a differential reference comparison. The fixture's 30 ms
spacing assumption did not hold in this run;
the name fix does not eliminate that risk. This run has no push-to-green
time, and its lane timings are a failed-run observation. The corrected
configuration passed branch run `36640728403` at `82bba77e`. Its 58
displayed check names match main run `36516215200`. From workflow creation
to completion, the first branch run took a derived 162.62 min and the green
second run took 160.10 min. Their derived sums of measured macOS job times
were 729.02 and 701.75 min; comparison main run `36516215200` took a
derived 175.83 min and 718.15 macOS job minutes. The branch runs differ
from it by 13.21 and 15.73 min in wall time; these differences are not
separated from runner variance. A second main run with 31 macOS jobs,
`36369711059`, took a derived 165.55 min and 775.63 macOS
job minutes. Its branch wall differences are 2.93 and 5.45 min. The longest
macOS job in `36516215200` started last among macOS jobs, 125.42 min after
workflow creation; it started at 0.10 and 0.13 min in the branch runs.
This verifies a changed dispatch order, while the wall-time effect remains
unseparated. In lane 2,
the final lane in both branch runs, derived handoff gaps totaled 0.68 and
0.80 min, with initial start delays of 0.15 and 0.13 min. The remaining
13.82 and 11.18 min above the 147.87 min ideal
model came from different summed job wall times. The failed run has no
push-to-green result; the green run's 160.10 min uses workflow creation as
the available push timestamp proxy. The per-lane measurements are in
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md).
[U16 evidence](./docs/evidence/u16/README.md) records the complete lane plan,
check name inventory, and scheduling limits.


U19 property case partition
---------------------------

The extended native CI gate now executes the own-key property in three
case-shard jobs on each native host. Every job generates the same 160-case
sequence (16 reviewed runs times the existing extended scale of 10), with
the same seed, replay path, generator, and size. Job `k` of three executes
the predicate for generated indices congruent to `k - 1` modulo three.
The three job sets are disjoint and cover the unsharded set. The existing
native-support job names and file-shard totals remain unchanged; those jobs
exclude this one file, and the `native` aggregate requires every new job.
The Proxy and Reflect properties remain in the file shards for this first
measurement. This branch run does not isolate their per-property costs:
the macOS support shard 1/12 ran Reflect, Proxy, and Math together with
three file workers. Their case-shard value remains undecided.

Each job retains the original 3,600,000 ms extended hard interrupt limit.
Every successful job uploads the interval measured around its property
assertion. The `native` aggregate requires all six records and sums the
three durations separately for Linux and macOS, failing either sum above
3,600,000 ms through `mise run check:property-case-durations`. This
preserves the original aggregate deadline while allowing
case costs to vary. An interrupt remains a failure. A failing shard runs the
usual shrinker, and its seed and path replay the counterexample without the
shard filter. The first counterexample may differ from an unsharded run.
Case-sharded properties must be precondition-free, so every shard generates
the same run sequence. The local `mise run test:property:extended` task
remains unsharded.

The previous unsharded macOS own-key interval was observed at 3,565,117 ms
in run `36243816479`, leaving a derived 34,883 ms margin (0.97%) below the
3,600,000 ms limit. Other U6 branch observations differed by a derived
11.80 case-minutes, so the margin is sensitive to runner variance. Each
case shard repeats generation of the complete stream; summing three runs
can cost more than one unsharded run even when all predicates pass. The
branch CI run reports each host's measured three-shard sum and derived
margin, as well as every per-job duration. A negative margin fails the gate;
the deadline is not relaxed to absorb variance.

The scheduling weights for the three new macOS jobs are derived estimates:
1,300 seconds each from the U6 measured 3,566 concurrent case seconds for
the own-key file divided by three, plus estimated setup margin. The macOS
native-support shard 1 weight is a derived 1,958 seconds from 71 seconds of
observed fixed cost plus its remaining variable cost times the modeled
worker-load ratio 2,283/3,566. All twelve native-support weights use the
same derived ratio rule because excluding own-keys changes their file sets.
The U6 concurrent-duration inputs came from CI runs `36243816479` and
`36261458909`; the 3,018-second job observation came from main run
`36516215200`. These are estimates for the changed job layout;
the branch CI observation below compares them with measured per-job times
and separates fixed setup cost from case execution. The corresponding
Linux U6 weight is 3,327 concurrent case seconds, or a derived 1,109
seconds per case shard.

With only five hosted macOS slots, the changed layout has a derived longest
lane of 9,414 seconds versus the baseline model's 8,872 seconds. U19 must
merge together with the Mac mini capacity lanes in U20; merging U19 alone
would make the modeled hosted-lane wait longer. The lane values remain
pre-run scheduling estimates; one branch run cannot establish repeatable
lane timing or turn these estimates into observed results.

The `native` aggregate also adds checkout, pinned tool installation,
workspace dependency setup, artifact download, and the duration check.
Its previous job wall time was an observed three seconds in main run
`36516215200`; its new fixed cost is reported below and remains outside
the 9,414-second macOS lane model.

One branch CI observation from run `37121778924` measured the six new
case-shard jobs. Job wall and task-step times below come from GitHub job
timestamps, rounded to whole seconds. Property intervals come from the
uploaded duration records, rounded to one decimal second. The final column
is the derived difference between job wall and task-step time; it includes
job setup, checkout, tool installation, the workspace build and runtime
archive cache setup in the composite action, artifact upload, and cleanup.
It does not include generated-case execution.

| Host               | Shard | Observed job wall (s) | Observed task step (s) | Observed property (s) | Derived other (s) |
| ------------------ | ----: | --------------------: | ---------------------: | --------------------: | ----------------: |
| `linux-x86_64-gnu` |   1/3 |                   556 |                    523 |                 521.0 |                33 |
| `linux-x86_64-gnu` |   2/3 |                 1,053 |                    671 |                 669.1 |               382 |
| `linux-x86_64-gnu` |   3/3 |                   547 |                    517 |                 514.6 |                30 |
| `macos-aarch64`    |   1/3 |                   916 |                    861 |                 858.9 |                55 |
| `macos-aarch64`    |   2/3 |                 1,085 |                  1,032 |               1,029.2 |                53 |
| `macos-aarch64`    |   3/3 |                   806 |                    753 |                 750.8 |                53 |

The 382-second derived non-task interval on Linux shard 2/3 includes an
observed 372-second `jdx/mise-action` step; the other Linux shards' mise
steps were observed at 23 and 20 seconds. These are fixed setup variations
in this run, not evidence that a generated case became slower. The task
step also includes the Node test runner around the measured property.
Shard 2/3 had the largest property interval on both hosts: a derived
30% above shard 3/3 on Linux and 37% above it on macOS. The repeated
ordering suggests an uneven generated-case cost distribution; the longer
Linux mise step is a separate fixed-cost effect. All three Linux case
jobs logged a missing mise tool cache for the same key, so that step
variation is not explained by different cache-hit states.

The gate reported a measured Linux sum of 1,704,680.7 ms, derived from the
three duration records, leaving a derived 1,895,319.3 ms margin to the
unchanged 3,600,000 ms deadline. The same gate reported a measured macOS
sum of 2,638,897.5 ms, derived from its records, leaving a derived
961,102.5 ms margin. All six job logs report a runtime archive cache hit;
Zig object cache reuse was not separately measured. The case jobs used
separate runners and warm runtime archives; no cold-run comparison was
measured. Their different job wall times do not establish a repeatable
speedup over the historical unsharded job. The case jobs also have a
different scope from the former native-support shard.

Main run `36516215200` observed the unsharded own-key property at
2,944,315.2 ms on macOS within a three-file, three-worker cohort and at
2,276,373.5 ms on Linux as a one-file singleton. Relative to those
observations, the branch run's case-shard sums were a derived 305,417.7 ms
(10.4%) lower on macOS and 571,692.8 ms (25.1%) lower on Linux, using
the one-decimal values stated here. The macOS case jobs ran own-keys
alone, unlike the old three-file cohort. The U6 macOS own-key jobs passed
in failed branch run `36343919872` and corrected run `36358067906`;
their observed durations ranged from 33.27 to 45.07 case-minutes,
bracketing the new 43.98-minute derived sum. The first run failed on a
Linux property deadline, so its macOS duration is a valid job observation
but not an end-to-end green-run result. These one-run differences do not
establish that partitioning made the same cases cheaper; the strict
aggregate rule remains useful when case cost or runner load varies.

The macOS case-job planning weight was a derived 1,300 seconds per shard,
versus observed job walls of 916, 1,085, and 806 seconds in run
`37121778924`. The Linux U6 planning weight was a derived 1,109 seconds
per shard, versus observed 556, 1,053, and 547 seconds. These one-run
observations do not recalibrate the planning weights in
*tools/macos-job-costs.ts* or the five-slot lane model built from them:
setup varied across jobs, and repeat runs would be needed to separate
scheduling behavior from runner variance. The twelve derived macOS
native-support weights sum to 16,163 seconds; their observed job walls
summed to 16,590 seconds in run `37121778924`.
Seven of twelve weights were below observed walls, and the total was a
derived 427 seconds low. The derived 9,414-second five-slot model remains
a pre-run planning estimate, not an observed completion time or a bound
on future runs.

The unchanged native-support shard 1 job names allow a before/after
observation, although removing the own-key file changed their workloads.
Main run `36516215200` observed 3,018 s for macOS shard 1/12, including
2,947 s in its property step and a derived 71 s outside that step.
Branch run `37121778924` observed 1,963 s for the same named job,
including 1,882 s in its native-property step and a derived 81 s of
package property work and setup. For Linux shard 1/5, the main run
observed 2,310 s total and 2,279 s in its property step, with a derived
31 s outside it. The branch run observed 3,010 s total, including
2,965 s in its native-property step and a derived 45 s of package
property work and setup. The old Linux job was a reserved own-key
singleton with one file worker; the new job ran 20 other files with four
workers. Its two wall times therefore compare unrelated workloads.
The macOS job had three files and three workers on each side, with
own-keys replaced by Math. Each comparison is one observation per run,
so neither establishes a repeatable per-file speedup or slowdown.

The branch run's required `native` aggregate passed. Its log reports
the two measured duration sums above and the unchanged 3,600,000 ms
limit for each host. Its observed job wall time was 24 s, compared with
the observed 3 s of the old aggregate in main run `36516215200`.
The new run spent observed whole-second step intervals of 2 s setting
up, 3 s requiring all dependencies, 2 s checking out, 12 s installing
mise tools, and 1 s downloading all six artifacts. The duration-check
step completed within one GitHub timestamp second. The aggregate runs
no generated case; this 24-second wall time is fixed gate overhead for
the changed workflow, measured once.

### One optional self-hosted Mac lane (U22)

The workflow now generates one optional `oseo-mac-1` lane beside five hosted
macOS lanes. `OSEO_SELFHOSTED_MAC_ENABLED` is off until the operator completes
registration and the runner-path U17 probe. The readiness job uses a
repository-scoped Administration: read token only on a push and falls back
to hosted `macos-15` when the switch, token, API, or runner is unavailable.
Pull requests remain hosted. The lane accepts only Zig-backed test262,
extended native-property, own-key case, and native-fixture jobs. Apple clang
host sanitizers and `macos-latest` Node.js/Deno jobs stay hosted.
Optional jobs have no predecessor chain, so they can fill the five hosted
slots concurrently when the readiness probe selects fallback.
All three own-key case shards use the same readiness decision so their
duration sum represents one Mac class under the unchanged hard limit.

The scheduling ratios are conservative derived estimates from the U21
one-machine cold/warm and repeat observations: 3.5 for test262, 2.2 for
native fixtures, and 2.4 for extended properties. They exclude a derived
60-second fixed setup share per job and do not claim runner-mode speedup.
The persistent registration removes the proposed per-job token and
registration step. The first branch CI run keeps the switch off and checks
all jobs on hosted runners. A later branch run with the switch on must
measure the same jobs at least twice, separate cold and warm caches, and
record the macOS version printed by every macOS job. No coverage count,
shard total, seed, target, or sanitizer lane changes here.

### Measured Mac-lane ratios (U23)

The first three runs with the switch on, branch run `37194069657`
attempts 1 and 2 and main run `37206614757`, each placed the same 11
jobs on `oseo-mac-1`. Their measured push-to-green times were 107.9,
111.1, and 113.5 min. The Mac lane finished at a measured 82.3, 84.6,
and 80.1 min after run creation, while the hosted macOS lanes ran until
the end. The U22 ratios had predicted 101.0 min of Mac job time; the
measured sums were 81.5, 83.7, and 79.0 min.

*tools/macos-job-costs.ts* now uses derived pooled ratios calibrated
against the cost weights the model consumes: 4.5 for test262, 2.9 for
native support, and 3.2 for own-key cases. Each is rounded down from
the pooled value over all three runs and lies inside the per-run range,
which was 4.39 to 4.63, 2.83 to 3.03, and 3.15 to 3.43, respectively.
Against the same jobs' hosted walls in all-hosted runs `37167895777`
and `37121778924`, the derived runner-mode ratios were 4.4, 2.9, and
2.2. The own-key difference comes from its 1,300-second weight, which
exceeds the 704 to 1,085 hosted seconds measured there. The native
fixture ratio stays at the derived U21 value of 2.2 because no native
fixture job had run on the Mac. The cache states of the three runs were
not separated, and their per-run ratios show no monotonic trend.

With these ratios the generator moves `native (macos-aarch64, 3/3)` and
`native support (macos-aarch64, 6/12, 8/12, 12/12)` to the Mac and
`test262 (macos-aarch64, 1/12, 2/12, 11/12)` to hosted lanes, for 12
Mac jobs. The model predicts a derived 102.7-min macOS makespan and
482.7 hosted macOS minutes, against 105.1 min and 502.9 min for the U22
ratios with the same costs. The observed push-to-green times exceeded
the old prediction by 2.8 to 8.4 min. The model omits job waiting and
the aggregate, and the hosted sanitizer jobs, for example, ran a derived
11 to 23 percent above their weights. Adding any further
eligible job to the Mac would raise its predicted lane above the
makespan, so the greedy assignment is kept.

A second concurrent Mac lane was modeled but not enabled. U21 measured
1.55 times the throughput for two concurrent jobs, a derived per-job
latency factor of 1.29. Under that factor the model predicts a derived
82.1-min makespan with 17 Mac jobs; a latency factor of 1.5 still
predicts 86.2 min. U21 also observed about 243 MB of free memory with
two concurrent jobs, so enabling it needs a memory measurement under
runner mode first. Job names, the aggregate's required set, Zig-only
eligibility, hosted fallback, shard totals, and coverage are unchanged.

### Measured runs of the U23 ratios

Branch run `37215661294` at `29f11948` passed in both attempts, with the
same 12 jobs on `oseo-mac-1`. The measured push-to-green times were 112.2
and 105.3 min, the Mac lane ended at 80.4 and 80.3 min, and the last hosted
macOS job ended at 111.8 and 104.8 min. The model had predicted a derived
102.7-min makespan with a 99.5-min Mac lane, so the prediction did not
hold. Against the earlier measured 107.9, 111.1, and 113.5 min, the
difference is smaller than the run-to-run spread, so these runs cannot
distinguish a retune effect from runner variation.
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md) records the
measured per-run, per-job, and per-lane values.

The model erred on both sides. The Mac jobs measured 79.5 and 78.8 min
against a derived 98.5 modeled minutes, about 0.8 times the model:

 -  The five Mac jobs also run in earlier attempts were modeled at
    44.2 min and measured 38.4 and 37.9 min.
 -  Native support 6/12, 8/12, and 12/12, newly moved to the Mac, were
    modeled at 23.5 min and measured 16.4 and 16.1 min. Against their
    weights they ran at derived ratios of 4.0 to 4.8, not 2.9.
 -  Native fixture 3/3 was modeled at 8.4 min with the U21 ratio 2.2 and
    measured 6.1 and 6.0 min, a derived ratio of 3.2.
 -  The three own-key shards were modeled at 22.5 min and measured 18.7
    and 18.8 min.

Only `native support (macos-aarch64, 1/12)` ran slower than modeled. Its
derived ratio against its weight is 2.7, and it dominated the earlier
pooled native-support ratio. Within that family, per-job ratios against
the current weights range from a derived 2.7 to 4.8, and within test262
from 3.6 to 6.4. One ratio per family cannot fit both.

The hosted side was underestimated. Lane 3 ended a measured 19.3 and 7.2
min after its modeled 92.5 min; it set the makespan in attempt 1.
`test262 (macos-aarch64, 6/12)` measured 26.6 and 24.8 min against an
18.1-min weight that lies below all seven hosted observations, 1,366 to
1,617 s, of runs `37121778924`, `37167895777`, and the five Mac-lane
attempts. `host C sanitizers (macOS, property)` measured 42.4 and 28.7 min
against a 32.0-min weight. Its weight lies inside the observed 1,723 to
2,727 s range, but 266 s below the 2,189-second median, so that job is
mostly noisy. Lane 2 ended 8.8 and 9.3 min late in both attempts:
`test262 (macos-aarch64, 1/12)` measured 21.5 and 21.4 min against a
17.9-min weight below its four hosted observations, and test262 9/12
measured 25.4 and 24.3 min against 21.3. Queueing does not explain the
gap: each hosted lane's measured start delay and handoffs summed to 0.5 to
0.7 min per attempt, and the Mac lane's to 0.9 and 1.5 min against the
modeled 1.0 min.

Pooled over all five Mac-lane attempts against the current weights and
rounded down, the corrected derived ratios would be 4.8 for test262 over
14 job observations, 3.2 for native support over 26, 3.5 for own-key
cases over 15, and 3.2 for native fixtures over 2. Changing only these
ratios moves 14 jobs to the Mac. The model then predicts a derived 92.0
min. Evaluated against the hosted medians and the measured Mac
medians, the same assignment gives a derived 97.3 min, because the stale
hosted weights remain.

The recommended next retune changes three things. It is not applied here:

1.  Replace every hosted weight with the median of the job's hosted
    observations in the seven runs. Jobs placed on the Mac in all five
    Mac-lane attempts have only 2 hosted observations, and others have
    up to 7. For example, the median is 1,540 s for test262 6/12 instead of
    1,083, 2,189 s for the sanitizer property job instead of 1,923, and 1,288 s
    for test262 1/12 instead of 1,074.
2.  Model a Mac job by its measured Mac median when one exists, which
    covers 15 jobs. Convert any other job from its hosted median with
    ratios pooled against hosted medians: a derived 4.2 for test262, 3.2
    for native support, and 3.1 for native fixtures.
3.  Assign the three own-key shards before the other jobs. They must run
    on the Mac lane, and with hosted-median weights of 810 to 995 s the
    longest-first order would place them near the end. The model would then
    overload that lane to a derived 106.4 min.

With these inputs the greedy assignment puts 15 jobs on the Mac and
gives a derived, unvalidated scheduling estimate of a 93.3-min makespan,
set by the Mac lane. Hosted lanes end at a derived 80.8 to 92.8 min,
using 439.1 hosted macOS job minutes. The current assignment evaluated
the same way gives 106.1 min and 494.5 min. That evaluation lies between
the measured 105.3 and 112.2 min, so the medians model this run better
than the weights did. Medians omit the measured 0.5 to 1.5 min of lane
overhead and per-job spread, and the current assignment's 106.1-min
estimate was exceeded by 6.1 min in one attempt. Only a branch
measurement of the retuned assignment can establish its makespan. The
retune needed generator and cost-table changes and the usual two-attempt
branch measurement; the two U24 sections below record both. Job names,
eligibility, the aggregate's required set, shard totals, and coverage
would not change.

### Median weights (U24)

*tools/macos-job-costs.ts* now applies the recommended retune. Every
hosted weight is the measured median of the job's hosted walls in the
seven run attempts above: all-hosted runs `37121778924` and
`37167895777`, branch run `37194069657` attempts 1 and 2, main run
`37206614757`, and branch run `37215661294` attempts 1 and 2. A job
placed on the Mac in some attempts has 2, 4, or 5 hosted observations;
the table records the count. A new `selfHostedJobSeconds` table holds the
measured median Mac wall of each of the 15 jobs that ran on `oseo-mac-1`,
with 2, 3, or 5 observations each. The generator models those jobs on the
Mac lane by that median. Other eligible jobs convert their hosted median
through derived ratios pooled against hosted medians and rounded down:
4.2 for test262, 3.2 for native support, and 3.1 for native fixtures.
With a Mac lane, the generator places the three own-key case shards
first, then the rest longest first. Main run `37230598930` of `840c387e`
was still running when the medians were taken and is not included.

The resulting assignment puts 15 jobs on the Mac: the three own-key
shards, test262 1/12, 3/12, 4/12, 5/12, 7/12, 8/12, 9/12, and 12/12,
native support 3/12, 4/12, and 12/12, and native 1/3. Its derived model
gives a 93.5-min makespan, set by the Mac lane at 93.5 min, with hosted
lanes ending at 80.8 to 93.3 min and 439.6 hosted macOS job minutes. The
model omits the measured 0.5 to 1.5 min of lane overhead.

The assignment was chosen for its worst case across runs, not only its
median fit. Each candidate was evaluated against each of the seven
attempts separately, using that attempt's measured wall for every job
that ran on the same runner class, and otherwise the job's median or,
for a Mac job never observed there, the attempt's hosted wall converted
by the family ratio. These are derived evaluations of measured inputs:

| Assignment rule                        | Mac jobs | Per-run makespan (min) | Mac lane last |
| -------------------------------------- | -------: | ---------------------: | ------------: |
| U23 weights and ratios (previous)      |       12 |            103.7–115.3 |           0/7 |
| Medians, own-key shards first (chosen) |       15 |             91.7–102.7 |           2/7 |
| Medians, longest first                 |       15 |            100.7–110.2 |           7/7 |
| Hosted means, Mac medians              |       14 |             94.0–100.8 |           0/7 |
| Hosted upper quartiles, Mac medians    |       15 |              92.7–99.9 |           4/7 |
| Hosted maxima, Mac maxima              |       15 |             97.1–104.0 |           2/7 |

The previous U23 assignment's derived evaluation of the two `29f11948`
attempts gives 111.2 and 104.3 min, against their measured 112.2 and
105.3 min, so the per-run evaluation omits about one minute of overhead.
Because every rule was fitted to the same seven attempts, the table also
overstates how well upper quantiles generalize. Leave-one-out
evaluation, which derives the weights from six attempts and evaluates
the seventh, gives the chosen rule a derived worst case of 101.9 min and
a mean of 97.7 min. Hosted means gave 104.5 and 99.1, hosted upper
quartiles 108.4 and 98.7, and maxima on both runner classes 101.8 and
99.8 min. No other rule tested had both a lower worst case and a lower
mean, so the medians are kept.

The Mac lane would be the last lane in a derived 2 of 7 per-run
evaluations, ending at 89.9 to 95.4 min. In the other five, hosted lane 3
ends last: it holds `host C sanitizers (macOS, property)`, the job with
the widest measured hosted range of 1,723 to 2,727 s. One Mac job's walls
ranged by at most a measured 84 s, and the Mac lane's derived ends vary
less than any hosted lane's. That spread is understated, because the
evaluation uses a median or converted value for each Mac job not observed
on the Mac in that attempt. If every job took its slowest observed
wall, the derived makespan would be 107.1 min with the Mac lane at
102.3 min. A Mac lane that runs last has no hosted slot to spill to, but
neither does a hosted chain. Its jobs run hosted only when the readiness
probe selects fallback, and that fallback schedule is not modeled. These
derived estimates predate the branch measurement; the next section records
the two measured attempts and compares them with this model.

### Measured runs of the median weights

Branch run `37237684441` at `54d2c336` passed in both attempts with the
15 planned jobs on `oseo-mac-1`. The measured push-to-green times were 98.3
and 95.8 min. The Mac lane ended at 82.0 and 83.0 min, and the last hosted
macOS job at 97.9 and 95.5 min. Hosted macOS jobs used 443.6 and 449.3
measured job minutes over 19 jobs, against the derived 439.6.
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md) records the
per-run and per-lane values.

Six earlier measured runs with the Mac lane on had push-to-green times of
107.9, 111.1, 113.5, 112.2, 105.3, and 106.8 min. The last is main run
`37230598930` at `840c387e`, which still used the U23 assignment and
finished before this branch was pushed. Both U24 attempts lie below that
spread's minimum, by a derived 7.0 and 9.5 min, so the difference is not
within the observed run-to-run noise. Their derived mean of 97.0 min is
12.5 min below the earlier mean of 109.5 min. With two samples, the size of
the improvement is not established; a slow hosted runner could still produce
a run inside the old spread.

The derived 93.5-min model makespan was exceeded by 4.8 and 2.3 min, and
it was not set by the Mac lane as predicted. Both attempts lie inside the
derived 91.7 to 102.7 min per-run evaluation. The two sides erred in
opposite directions:

 -  The Mac lane ended 11.5 and 10.5 min before its modeled 93.5 min. Its
    seven jobs with Mac medians from earlier attempts were modeled at
    45.1 min and measured 40.6 and 41.6 min. The eight jobs converted from
    hosted medians were modeled at 47.4 min and measured 40.2 min twice;
    the converted test262 jobs ran at a derived pooled ratio of 5.43,
    against the modeled 4.2.
 -  Hosted lanes 4 and 5 ended a derived 6.62 and 6.50 min after their modeled
    ends in attempt 1, and lanes 2, 3, and 5 ended 3.15, 2.10, and 7.95 min
    after theirs in attempt 2. The largest per-job excess was native support
    7/12, measured at 1,537 and 1,605 s against its 1,367-second median. Native
    support 2/12 measured 1,292 and 1,297 s against a 1,117-second median from
    only two hosted observations.

The Mac lane therefore sat idle for a derived 16.0 and 12.5 min before
the last hosted job ended. Recomputing both median tables with these two
attempts would likely move more hosted work onto the Mac. That retune is
not applied here and would need its own two-attempt measurement. Job
names, the aggregate's required set, Zig-only eligibility, hosted
fallback, shard totals, and coverage did not change.
