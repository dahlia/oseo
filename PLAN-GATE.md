Evidence gate throughput plan
=============================

Status
------

Implementation status: planned. This plan defines the cost contract for the
reviewed evidence gates and the checkpoints that keep that cost usable as the
reviewed corpus grows. It does not change any language semantic, any
classification vocabulary by itself, or the amount of evidence a semantic unit
must supply.

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
applicability judgment auditable is a separate question owned by
[ADR 0018](./docs/adr/0018-recorded-evidence-coverage.md).

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

The toolchain adapter accepts a prebuilt runtime archive instead of compiling
11 translation units for every execution. The reuse key covers every input that
can change the artifact: the reviewed runtime sources and headers, the runtime
ABI version, the complete compile and link flags, the toolchain identity and
version, the target and ABI facts, and the sanitizer selection. The CLI stops
copying the reviewed runtime sources into a fresh working directory when a
valid archive for that key already exists.

The baseline does not establish the archive build's share of a gate execution,
so no residual figure is projected. This checkpoint measures it: the gate is
run once with reuse and once through the bypass path, and both durations are
recorded as wall clock and processor time. The same reuse applies to the two
native builds each property case performs.

Archive reuse precedes concurrency because it removes the largest measured
wall-time component of a native execution and reduces each worker's runtime
build artifacts. The baseline did not record processor time for the other
components, and it did not measure the per-execution footprint, so this
ordering is a precaution rather than a demonstrated dependency.

It must land with its bypass path and a test that proves a changed runtime
source produces a different key.

Owner: the toolchain and runtime package boundaries in
[*DESIGN.md*](./DESIGN.md).

### Concurrent reviewed execution

The reviewed subset executes through a bounded worker pool instead of one
sequential loop in *tools/test262.ts*. Results are collected into reviewed
subset order, not completion order. The pool bound is explicit and recorded in
failure metadata so that a concurrency-dependent observation is reproducible.

The bound is chosen against measured peak resident memory and temporary
storage, not only against the processor count. Concurrency multiplies whatever
working set each execution holds, and the baseline records two runs that
reported native infrastructure failures at a concurrency of one without
identifying the exhausted resource.

`OSEO3001` also covers deterministic toolchain, temporary-directory,
executable-launch, and cleanup failures, so retrying every occurrence would
mask real defects. This checkpoint first narrows the diagnostic to name a
retryable cause, then retries only that cause a bounded number of times.

The retry count is reported in the run output and in failure metadata, not in
the canonical manifest. *target-parity.yaml* pins one digest over that
manifest, so a field that varies with host conditions would change the digest
on every run. Keeping retry counts outside it also means this checkpoint adds
no manifest field and changes no classification vocabulary, so it needs no
ADR 0013 amendment.

No wall-clock target is projected here. The 9.84 ratio belongs to a different
workload, and the remaining work does not necessarily parallelize with the same
efficiency. The bound and the expected effect are selected from the processor
time, peak resident memory, and peak temporary storage measured after archive
reuse lands.

Owner: the standards harness expansion in [*PLAN-M5.md*](./PLAN-M5.md).

### Seed allocation registry

Property seeds are allocated sequentially without a registry, so two
concurrently developed units can select the same seed. An identical seed does
not fail; it silently removes generated diversity.

A checked-in registry allocates a reserved block for each family. Changing a
generator must still preserve or deliberately replace its shrinking and replay
quality.

Owner: [*PLAN-PT.md*](./PLAN-PT.md).

### Infrastructure failure classification

The concurrency checkpoint retries an infrastructure failure but still
reports it through the harness classification. This checkpoint separates the
two, so a resource failure and a harness defect stop reaching the gate through
one vocabulary.

ADR 0013 records that renaming a classification is a breaking manifest change
that lands together with the schema expansion. This checkpoint therefore lands
as one reviewed change that extends the manifest schema, updates the
classification vocabulary, regenerates the canonical manifest, and amends
[ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md).

### Manifest record partitioning

At the baseline the manifest holds 681 records in 19,676 lines, and
*target-parity.yaml* pins one digest over one canonical file. At the corpus
size the claim requires, one checked-in file holds a number of records that no
reviewer can inspect and that every concurrent unit conflicts on.

Records are partitioned by a deterministic key, the summary and digest are
derived from the ordered partitions, and shard reconstruction continues to
select from the reviewed order. This is a record-format change and extends
ADR 0013 in the same reviewed change.

### Per-family evidence lanes

The seed registry and the record partitioning remove the two mechanical reasons
concurrent semantic units conflict. The remaining contention is editorial: the
reviewed status prose in [*PLAN-M5.md*](./PLAN-M5.md),
[*ROADMAP.md*](./ROADMAP.md), and
[*docs/language-profile-m5.md*](./docs/language-profile-m5.md) grows by append,
and the profile is the only one of the three with a normative record.

The profile becomes the single per-family record under a fixed template. The
plan and roadmap status sections reference it instead of paraphrasing it. Only
then do concurrent family lanes stop serializing on documentation.

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

The seed registry, the failure classification, the record partitioning, and the
evidence lanes have no timing target. They are accepted on their own terms: a
registry that makes a colliding seed impossible, a classification that
separates a resource failure from a harness defect in the manifest, a record
format that two concurrent units can extend without conflicting, and a profile
template that carries one normative record for each family. Each still records
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
 -  property seeds are allocated from a checked-in registry;
 -  each admitted family has one normative profile record that concurrent
    units extend without conflicting; and
 -  every preserved invariant above has a test that fails when it is broken.
