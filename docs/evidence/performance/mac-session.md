Mac session preparation
=======================

*tools/perf/mac-session.ts* is an independent Node.js supervisor prepared
for a future single standard hosted `macos-15` job. It has no measurement
entry point or workflow. Its hermetic tests use fake Mac observations and
small Node.js children; they establish neither actual Mac acceptance nor
Measurement or Comparison exit. The H correctness driver and P capture
integration remain unconnected until their owning APIs land and the final
main CI is green.


Supervisor contract
-------------------

`runMacSession()` accepts explicit command vectors for build, correctness,
discovery, measure, profile, archive and upload. Every command supplies an
absolute executable and working directory, a complete replacement environment,
stdin bytes and an explicit per-command timeout or `null`. Callers supply
only nonsecret arguments, inputs and environment values: those explicit
launch inputs become evidence. The module never dumps the ambient environment
or other processes' arguments. It does not validate the kernel matrix,
artifact roles or byte/counter correctness; those belong to landed H/P
validators. A zero exit from an arbitrary command is only process completion.

Build, correctness and discovery finish before the admission snapshot.
The integration-owned `assess()` callback interprets the raw observations and
returns separate load, memory, disk, power, process and tool conditions.
Each condition retains `known`, `unknown` or `failed`; a known condition
also records its evidence and whether the reviewed limit was met. Missing or
failed probes and an unknown or rejected condition stop dependent phases.
The module supplies no resource thresholds or default successful admission.
Nonempty raw output is labeled `unassessed`, never sufficient by itself.
The callback must examine actual raw values, preserve uncertainty and reference
the reviewed scheduling decision; a fabricated evidence string proves nothing.

Source checks retain the exact commit, tree and porcelain status, including
untracked files. The checkout must match the selected clean source before
each phase and at observation boundaries. Runner identity must match the
selected run, attempt, job, runner, host and image. Native execution requires
Node.js on `darwin`/`arm64`, a runner whose OS and architecture match those
values, GitHub Actions, and a `github-hosted` environment. Admission also
checks `uname -m` and macOS 15 product-version output. Environment declarations
are provenance from the job, not an independent GitHub service attestation.
Root still verifies the actual job and image receipt.

Raw command directories contain *request.json*, *stdin.bin*, *stdout.bin*,
*stderr.bin* and *result.json*, with UTC boundaries and exit/signal/failure
information. Evidence uses a new directory outside the checkout; existing
attempts are never overwritten. Files are private by default. Evidence of a
source or identity mismatch is retained before failure. Archive and upload are
attempted
after ordinary phase failure, but must pass the same source/identity checks.
Interrupted sessions fail and preserve partial files; they do not start more
commands. The future workflow needs separate `always()` collection for this
case and for supervisor or service failure.

Each child runs asynchronously in a new POSIX process group with regular
files for all three streams. The supervisor can react to abort, `SIGINT` and
`SIGTERM` even when the measurement driver's own event loop is blocked.
Timeout or interruption sends `SIGTERM` and then `SIGKILL` during failure
cleanup.
A surviving group after the leader exits is a failure even when the leader
returned zero. Only the group created by this launch is signaled. Unrelated
users' processes are never cleanup targets.

A group still visible after cleanup is `unknown`, including a zombie awaiting
OS reaping. Descendants
that create another session escape group ownership, so this is not a sandbox
or proof of complete debugger/debugserver cleanup. P must account for those
processes separately. Supervisor `SIGKILL`, runner loss, disk failure or a hard
service timeout can prevent final records and upload; missing records cannot
be accepted as success.

There is no whole-session deadline. Integration must retain the individual
600,000 ms driver command limit, three warmups, fifteen retained timing
repetitions, 100 kernel iterations, fifteen RSS launches and eight required
captures. A driver phase may span many such commands; give its outer command
no shorter aggregate deadline. No service default of 360 minutes is assumed.
The module does not wait to prolong short artifacts, rebuild them, or change
their iteration count for profiling.


Observation scope and cost
--------------------------

The native probes are read-only commands with a fixed C locale and minimal
replacement environment. Their original byte streams remain available even
when a command fails or returns nothing. Apple OSS manuals establish the
syntax below; their snapshots do not establish availability in an actual
macOS 15 runner. Discovery must retain that runner's installed manuals/help,
versions and diagnostics before admission.

| Probe        | Request                                   | Interpretation limit                                                                                                          |
| ------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Architecture | `uname -m`                                | Must report `arm64`; cross-compilation is insufficient.                                                                       |
| OS           | `sw_vers -productVersion`                 | Product version only; macOS build number is not captured; image version is recorded separately; verify installed manual/help. |
| Load         | `sysctl vm.loadavg`                       | Guest load, not hypervisor load or an isolation reservation.                                                                  |
| Memory       | `sysctl hw.memsize`                       | Total memory is not available memory.                                                                                         |
| Hardware     | `sysctl hw.model hw.ncpu`                 | Model/CPU facts visible to this guest, not physical exclusivity.                                                              |
| VM pages     | `vm_stat`                                 | No interval: accumulated page counts and page size, not a per-process RSS sample.                                             |
| Power        | `pmset -g`                                | Current guest-visible settings; physical power/thermal state may remain unknown.                                              |
| Processes    | `ps -A -c -o pid,ppid,uid,pcpu,pmem,comm` | Names only; no argv or environment; a snapshot can miss transient work.                                                       |
| Disk         | `df -k CHECKOUT`                          | Filesystem blocks in KiB; APFS capacity can be shared. Check actual artifact filesystem too if different.                     |

The [Apple `ps` manual] documents `-A`, `-c` and explicit fields; CPU usage
is a decaying average and process information is inherently inexact.
The [Apple `sysctl` manual] documents querying named keys without assignment;
the [Apple `sysctl(3)` manual] describes the machine model and CPU count.
The [Apple `vm_stat` manual] distinguishes accumulated counters from interval
deltas. The [Apple `pmset` manual] documents `-g` reads and platform-dependent
thermal support. The [Apple `df` manual] documents `-k` units and APFS shared
containers. These are syntax and interpretation references, not measurements.
[Apple remote-build documentation] uses `sw_vers -productVersion` to verify
the installed macOS release. Installed-manual/help verification remains a
real-Mac discovery condition.

Snapshots run after build/discovery, after measurement and after profiling or
failure. They launch short probe processes and write evidence. The supervisor
also keeps its Node.js event loop, signal handlers and child-lifetime monitor
active. Those costs are part of the future method and must be disclosed;
the supervisor's UTC boundaries and wall duration are not benchmark samples.
This module performs boundary observation, not continuous workload exclusion. A
future admission policy must establish the needed VM-internal scheduling scope
and any necessary observation during a long phase without hiding monitoring
cost.

A fresh hosted job VM is the intended isolation scope. Other physical-host
VMs, hypervisor contention and physical power policy remain unknown. Idle
checks on the two accounts of a self-hosted Mac mini are not reservations. This
module does not reserve a Mac mini or change accounts, services, permissions,
firewalls or global locks. Hosted memory/disk/tool unavailability remains a
failed or unknown condition. Account storage budget and actual service limits
must be verified by Root before job execution.

[Apple `ps` manual]: https://github.com/apple-oss-distributions/adv_cmds/blob/main/ps/ps.1
[Apple `sysctl` manual]: https://github.com/apple-oss-distributions/system_cmds/blob/main/sysctl/sysctl.8
[Apple `sysctl(3)` manual]: https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man3/sysctl.3.html
[Apple `vm_stat` manual]: https://github.com/apple-oss-distributions/system_cmds/blob/main/vm_stat/vm_stat.1
[Apple `pmset` manual]: https://github.com/apple-oss-distributions/PowerManagement/blob/main/pmset/pmset.1
[Apple `df` manual]: https://github.com/apple-oss-distributions/file_cmds/blob/main/df/df.1
[Apple remote-build documentation]: https://developer.apple.com/documentation/technologyoverviews/building-your-macos-game-remotely-from-your-pc


Integration still required
--------------------------

Root assigns integration after the landed H/P main checks are green and an
actual slot is admitted. It must connect the owning validators to the exact
final artifact and command vectors, then review the complete job diff and
resource budget. The supervisor cannot verify a source green receipt, an
operational reservation, a full 53-role correctness result or a useful stack
by inspecting arbitrary command exits.

The first execution of every new final file on the Mac must be excluded from
measurements; its raw evidence must be retained with path, hash and UTC order.
RSS-first needs a preceding
untimed discard/preflight for those same bytes. Keep all ordinary warmups.
Timing, RSS and profiling reuse the same final timed file hash; startup controls
and observed-counter files retain their distinct roles. H owns those records
and validators. P owns the exact capture backend, command, launch semantics,
stack interpretation and process cleanup. Its final launch command is still
pending; this preparation invents none. A short timed file that yields too
few useful captures leaves profiling incomplete under the original budget.

Archive/upload command supervision does not prove a complete archive. The
future job must seal the owning manifests, raw failure records, executables,
generated C/runtime assets and symbol/path mappings in a mode-preserving tar,
then preserve the supervisor's final records and upload receipt alongside the
archive. An archive produced before finalization cannot include later records.
Root verifies downloaded bytes, hashes, modes and completeness. Upload must
remain in the same job and use `always()` with missing files treated as an
error. No actual workflow or setup-action reference is published here.

The fake host seam always records `simulated: true` and the real process OS
and architecture. Linux child tests exercise POSIX behavior with fabricated
Mac observations. This module's POSIX process-group cleanup is unavailable on
Windows; those tests are explicitly skipped there, and native execution fails
closed. Neither platform's fixture results are actual Mac execution or CI
evidence.
