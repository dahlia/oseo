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
