Two-account Mac session preparation
===================================

*tools/perf/mac-pair-session.ts* prepares an owner/companion protocol for
ordinary jobs on the two runner accounts of one physical Mac mini. It does
not submit jobs, reserve slots, connect H/P commands, or establish actual Mac
acceptance. Its hermetic tests use simulated identities and observations.
The existing [hosted session](./mac-session.md) retains its hosted VM scope.


Preparation discovery
---------------------

*tools/perf/mac-discovery.ts* provides a separate read-only diagnostic entry.
The existing optimized workflow has an explicit `mac_discovery` manual input,
defaulting to `false`. Scheduled and default manual runs retain every optimized
semantic job. Opting in selects two independent ten-minute jobs with the exact
`self-hosted`, `macOS`, `ARM64` and `oseo-mac-1` or `oseo-mac-2` labels. Neither
job waits for the other. There is no fallback, lease, admission, nonce, target
profiling, corpus or measurement execution. Existing hosted supervision remains
unchanged. These jobs supplement, and cannot replace, complete candidate CI.

Branch-ref and new-input reachability remain unknown until Root dispatches and
checks the actual workflow revision, event SHA, checkout SHA, placement and
receipts. Source preparation does not establish an available or accepted Mac
entry. Root owns dispatch, final publication base and actual Mac acceptance.

The entry requires the current job's explicit GitHub repository, run, attempt,
logical job, the exact runner name matching the label, the source SHA, and the
workspace and runner-temp environment fields. It verifies the actual process
and probed OS/architecture, account/UID/GID, hardware and boot UUIDs, pinned
Node.js, clean checkout commit and tree before and after the probes. A missing
minimum fact fails the job. Tree identity is observed from that checkout, not
an independently supplied expected tree. Numeric job and runner IDs remain
`null`; Root must join them with actual API receipts afterward. CI environment
fields and labels are caller assertions, not independent runner or hardware
attestation.

System commands have fixed executable/argument vectors and a five-second bound
per probe, followed by a one-second `SIGTERM` grace and a half-second cleanup
bound after `SIGKILL`. Timeout, truncation and unknown owned-group cleanup
remain failures; unknown cleanup prevents further probes. Output beyond one MiB
per stream is marked truncated. Group checks cannot detect escaped descendants.

Commands receive a minimal environment without ambient credentials, account
environment or Git home configuration. Tool locations and help results retain
unsupported options and nonzero exits as unknown; no target is sampled. Only
the workspace and runner-temp directories receive metadata/access checks. No
nonce contents, arbitrary home paths, account database or other processes'
arguments or environments are collected. No permission or service is changed.

Diagnostic setup uses the existing mise wrapper with tool installation
disabled; if the pinned Node.js is missing, the diagnostic command fails
instead of installing it. The workflow skips automatic dependency preparation.
An existing prepared CI job can invoke the same task:

~~~~ sh
mise run --no-deps --skip-tools perf:mac:discover
~~~~

Raw command vectors, stdout, stderr, exit/signal/error and elapsed time live in
exclusive `0700` job-private temporary directories with `0600` files, outside
the checkout. The entry's own output and derived archive omit raw observed
account and hardware identifiers. Raw files are transient and disappear with
ordinary runner cleanup; the uploaded bundle cannot reconstruct or
independently validate them. No raw-evidence acceptance is claimed. A crash,
hard kill or setup failure can leave collection incomplete, and an absent
artifact remains a failure.

Only *derived/* is archived and uploaded on the normal job path, including
failure collection before the completion hook. Its manifest binds file size,
mode and SHA-256 to source/run/attempt/job/label. Root must verify downloaded
archive contents, modes and hashes and preserve the original job failure.

The separate archive-only entry checks the CI context and file digest before
writing two fixed regular USTAR entries. Headers contain synthetic zero UID/GID,
empty owner/group names and zero modification times; payload modes remain
`0600`. Ordinary host `tar` creation would disclose the job account through
header ownership even when JSON contents contain only fingerprints. The Node.js
writer uses no host-specific ownership flags, adds no dependency, and refuses
symlinked files or stale context. Successful failure collection cannot change
the earlier failed diagnostic step. Actual upload/download and outer-container
metadata still require Root's separate receipt and privacy verification.

Checkout, setup and upload actions can log absolute paths. Whether those paths
reveal account names depends on the actual runner roots. Root must verify
whole-job log privacy as well as the downloaded container before acceptance;
the entry's own redaction does not establish that condition. No new masking,
secret distribution or runner setting is introduced here.

The upload action's success is separate from diagnostic success and actual
evidence acceptance. Private raw records have run-scoped fingerprints, rather
than public unsalted file hashes, in the derived report.

Fingerprints use SHA-256 over a JSON array containing the schema, repository,
run, attempt, source SHA, domain and observed value. Account, UID, GID,
hardware, boot and
runner-name domains remain distinct; directory owners share the UID/GID domains.
This permits equality checks between the two jobs within one run/attempt.
These are public, deterministic hashes, not encryption or authentication;
low-entropy identifiers can be guessed. They neither prove cross-run identity
nor continuous isolation. Equal UID fingerprints still violate the existing
pair contract. Linux fixtures remain simulations, native acceptance remains
`unverified` and physical isolation remains `unknown` after discovery succeeds.


Required inputs
---------------

Both callers provide the same explicit `127.0.0.1` endpoint and session nonce,
plus exact expected identities for both roles. There is no default port,
unauthenticated mode, endpoint fallback, or reconnect. Each authenticated frame
binds its simulation mode. Mixed simulated/native roles fail before admission.
Each identity binds the repository, run and attempt, final source commit and
tree, role, job, runner ID/name, account/UID, hardware UUID, boot UUID,
platform and architecture. The accounts, jobs and runner slots must differ; the
physical and boot identities must match. Native use also requires the
supervisor's actual `darwin`/`arm64` process and matching launching account/UID.

The nonce must come from an existing safe delivery path approved for both
ordinary jobs. The API requires at least 32 bytes, but length cannot establish
entropy, confidentiality or delivery safety. A predictable or public nonce is
not authentication. Actual cross-job nonce delivery is unimplemented and
remains an admission condition. There is no new secret grant, PAT, daemon,
shared-account file permission or installation. A caller must keep nonce values
out of logs, arguments and raw observations. The wire carries an HMAC-SHA-256
tag computed over the payload, never the nonce. The private journal omits
authentication tags and untrusted frame text. Loopback authenticates possession
of the nonce, not GitHub's job identity or the kernel identity of the peer
process.

The collector interface requires a fresh local identity, clean-source and
artifact-manifest digests, raw evidence references, setup state, owned-process
inventory digest and observation cost. Its `unassessed` status means the raw
records still require interpretation. An `unknown` or `failed` status, missing
raw data or changed identities fail closed. No generic collector or executable
integration is guessed here: the future caller must discover and validate the
existing platform tools and H/P APIs under the account's current rights.
Caller-supplied strings are references for review, not independent attestation.

A separate admission callback must reference the reviewed decision, operational
window, raw observation and actual nonce-delivery evidence. Missing references
or an unknown/rejected decision cannot admit a role. Root must review the
actual two accounts' job receipts, hardware/boot observations, host conditions,
external workload visibility and tool access before native use. A runner
registry snapshot is historical availability, not reservation or admission.


Barrier and supervision
-----------------------

Both jobs finish their setup commands, refresh observations and obtain their
own final admission before sending `ready`. The owner waits for the peer's
`ready`, sends `admit` and waits for `admitted` before launching any driver.
The companion holds its slot without launching measurement commands. A
message's exact peer identity and artifact digest are checked again on every
frame. Observation and assessment run in one serial queue. Before final
admission, frames carry observations without a decision. Afterward, each frame
pairs an observation with its own accepted decision; pending candidates cannot
borrow earlier decisions. Admission and each driver launch wait for queued
observations and assessments to settle. Sequence numbers start at one and
increase without gaps. Replays, wrong roles, stale attempts, restarts,
unexpected lifecycle messages, duplicate connections and transport loss fail
the attempt; a new connection cannot continue an earlier admitted window.

An early peer `ready` can wait for local setup and admission. Every later
lifecycle message requires its corresponding local send first: the owner
accepts `admitted`, `sealed` and `released` only after sending `admit`,
`finished` and `release`, respectively. The companion accepts `admit`,
`finished` and `release` only after sending `ready`, `admitted` and `sealed`.
Premature messages fail the attempt instead of satisfying a later wait.

Each supervisor runs outside its driver process. File-backed standard streams
avoid pipe backpressure, and asynchronous child launch leaves the supervisor's
event loop available while a driver blocks its own event loop. Bidirectional
heartbeats and periodic observation continue through driver and finalization
phases. Loss deadlines use the receiver's monotonic clock. An authenticated
frame arriving after the allowed gap fails before it can renew that clock, even
between watchdog ticks. The optional receipt-clock seam is simulation-only and
cannot authorize native use. Journals retain UTC and local monotonic readings
without assuming clocks on the two accounts are synchronized.

Every protocol option is explicit and recorded: heartbeat cadence and maximum
loss interval, observation cadence and timeout, barrier wait, finalization wait,
`SIGTERM` grace and cleanup bound. These options do not alter H's 600,000 ms
command limit, the 120,000 ms target limit, the Mac 20,000 ms capture limit,
eight useful captures, three warmups, fifteen retained rounds, 100 kernel
iterations or fifteen RSS launches. Driver commands require `timeoutMs: null`
at this outer layer; their reviewed inner budgets remain H/P-owned. There is
no whole-session deadline or assumed 360-minute service limit. If a slot or
admission is missing, the attempt times out before driver launch. Actual
workflow limits and storage budgets remain Root's integration inputs.

Two occupied slots and an arbitrary process list cannot prove continuous
physical isolation. Periodic process, load, memory, power, thermal and storage
observations may miss brief external work or lack visibility into other
accounts, launch services or interactive sessions. Raw observations must omit
other processes' arguments and ambient environments. Preserve visibility gaps
and unknown values rather than converting them into accepted conditions. The
module always reports `physicalIsolation: unknown` and
`nativeAcceptance: unverified`; protocol completion is not a physical isolation
or Measurement verdict.


Failure and evidence lifetime
-----------------------------

Heartbeat or observation loss, abort, source/artifact mismatch and missing final
evidence stop the attempt. Child cleanup sends `SIGTERM`, then `SIGKILL`, to the
new process group created by the launching account. The cleanup bound returns
`unknown` if that group remains visible; the result cannot become successful.
Other accounts' children and runner services are never cleanup targets.
Detached descendants, PID reuse, zombies, supervisor `SIGKILL`, disk errors and
runner/service loss require separate lifecycle evidence and Root's residual
process check. This is process supervision, not a sandbox or complete profiler
cleanup proof.

After the owner's drivers finish and the owner verifies its archive and upload,
the owner sends `finished`. The companion then finalizes its own archive/upload,
sends `sealed`, and waits for the owner's `release` before acknowledging and
ending. Both roles require verified archive digest and upload references.
The final protocol journal is written after that handshake and therefore needs
separate collection alongside the archive. Missing final journals, final upload
receipts or either job's terminal state remain incomplete evidence. A command
exit or a caller's receipt string cannot establish that downloaded bytes are
complete; Root must verify modes, hashes, raw records and source/artifact
identity.

Evidence directories are new, private and outside the source checkout. Journals
include successful and failed lifecycle messages, local observations, admission
references, child outcomes and supervisor CPU, RSS and wall cost. Observation
I/O cost remains `null` when unavailable. These costs belong in the eventual
measurement method. The future workflow needs independent failure collection
for cancellation, supervisor death and job cleanup, without changing existing
required checks or granting new permissions.


Pending integration and actual acceptance
-----------------------------------------

Root first supplies the final landed H/P source and complete main-green
receipts. The caller then connects the actual owning validators, final 53-role
correctness manifest and unchanged invocation vectors. Timing, RSS and
profiling must use the same final timed file hash. Startup controls and observed
counter artifacts retain distinct roles. Gatekeeper's first execution is
recorded and discarded; RSS-first requires preceding untimed discard/preflight
for those same bytes. The profiling backend must obtain eight useful captures
within the original budgets, preserving failures and unattempted work.

Actual two-account transport, nonce delivery, observations, setup/hook
boundaries, operational window, artifact/archive validation and process cleanup
still need separately reviewed Mac evidence. Linux and Windows fixtures cannot
fill those conditions. Runner disable, service stop, installation, system
grants, settings changes or new costs require Root to obtain the user's
approval. Preparation completion does not complete the first comparison, native
exit gates, publication or PLAN-PERF Measurement.
