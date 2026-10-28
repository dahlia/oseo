Test262 runner offload
======================

The reviewed runner delegates process creation to one small Node process and
split-fragment C emission to one reusable worker thread. Compiler lowering,
harness identity checks, object preparation, observation collection, retries,
manifest serialization, and summary formatting retain their existing paths. The
measured execution pool limit remains eight.

The spawn helper owns command pipes and sends one complete observation per
request over advanced Node IPC. It does not import compiler implementations.
The host keeps its existing UTF-8 decoding and signal-status mapping. Each
request captures the parent's environment and absolute cwd; commands inherit
the umask the helper started with. The helper
inherits the runner's process group so existing external timeout supervisors
can terminate commands and descendants together. Individual helper loss is a
new infrastructure failure; it rejects pending requests without replay. Group
supervision remains necessary for descendant cleanup after such a failure.

The emission worker receives structured clones of harness/body IR and source
mapping, then calls the same `emitScriptFragments` implementation. Structured
cloning retains non-JSON numbers and optional values. Replies are correlated by
request ID; completion order cannot reorder manifest records. The worker is
lazy and unreferenced while idle. Its heap and C-string copies add memory and
IPC cost, which must be included in remote measurements. Other emission paths
still use the synchronous backend. Cleanup already uses asynchronous filesystem
operations and is unchanged.


Comparison controls
-------------------

Both services are enabled by default only in the test262 runner. Set
`OSEO_TEST262_SPAWN_DELEGATION=disabled` for direct spawning or
`OSEO_TEST262_EMISSION_WORKER=disabled` for synchronous C emission. Setting
both selects the prior execution mechanisms on the same candidate source.
Neither control changes the manifest schema or the product CLI default.

On the remote host, first run the focused host and emission tests, including
the real helper, large-output, error, signal, idle-exit, and process-group
cleanup cases. Repeat on macOS before treating that platform as validated.
Build the published host package and verify its helper entry point too.

Measure the same fixed input and cache state in alternating baseline/candidate
order, first with pool eight. Compare direct/synchronous, helper-only,
worker-only, and combined configurations. Preserve the command envelope and
source identity. Record wall time, main-thread ELU/CPU, helper CPU/RSS, total
CPU/RSS, active child counts, spawn latency, C emission, and cleanup spans.
Verify identical canonical manifest bytes, observation counts, variants,
first-attempt outcomes, retries, and summary counts. Timing fields naturally
vary. Stop on a semantic, harness, or infrastructure failure.

The expected effect is lower main-thread fork cost and fewer gaps in child
admission while C is emitted. The p06 measurement attributes 1,252 seconds of
system CPU to spawning and about 795 CPU seconds, or 805 seconds of wall time,
to C emission. These are overlapping work totals, not additive wall-time
savings. One cold-cache Full UPDATE pair on the remote host, recorded in the
[node work note], took 75.2 minutes without the offload and 52.4 minutes with
it at pool eight, and neither run changed the checked-in manifest. Raising the
pool is separate follow-up work. A higher default still requires remote
evidence, a memory headroom check, and an identical canonical manifest.

[node work note]: ./m5c-graph/test262-runner-main-thread-offload.md
