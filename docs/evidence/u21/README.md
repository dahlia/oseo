Mac mini day-one evidence
=========================

The dedicated Mac mini was measured at main commit `2434dd8b` on
2026-10-03. It was not registered as a GitHub runner. The raw local logs
remain under *~/m5ci-results/* on that machine; the compact tables here
retain the observations needed for the scheduling decision.


Host and provenance
-------------------

[*mac-host.txt*](./mac-host.txt) records `sw_vers`, `uname -m`, `sysctl`,
`xcode-select`, `pkgutil`, `clang --version`, `spctl --status`,
`git rev-parse HEAD`, and `mise ls --current` over SSH. Observed:
Mac18,5 with an Apple M6, 12 logical CPUs, 16 GiB RAM, macOS 27.0.1
(26A434), Command Line Tools package 27.0.0.0.1788430756, Apple clang
21.0.0, Zig 0.16.0, and enabled security assessments. The clone is under
*~/Desktop/oseo-m5ci-u21/*; mise and Tart were installed in the user's
home directory. No runner, repository secret, or variable was created.
The retained `id` and `dsmemberutil` output confirms that `dahlia`
belongs to the `admin` group. [*mac-log-excerpts.txt*](./mac-log-excerpts.txt)
retains health output and selected test-result lines.
The final read-only sample in
[*mac-final-resources.txt*](./mac-final-resources.txt) observed 89 GiB
free, 57.31 MiB swap used, enabled security assessments, and no local
`org.oseo.runner` launchd listing. These are endpoint samples, not
peak resource measurements.


First execution
---------------

The exact [U17 probe] built 48 distinct binaries per compiler and worker
count. Each was launched twice. The two default-policy probes used separate
Zig caches. The user then granted **Developer Tools** access through the
macOS GUI to */usr/libexec/sshd-keygen-wrapper*; the two later probes used
new SSH sessions and separate Zig caches. The grant was not made by the
measurement script. [*first-exec.tsv*](./first-exec.tsv) gives every
measured 48-binary wall time in milliseconds.

| Policy          | Compiler    | Workers | First pass, trials (s) | Second pass, trials (s) |
| --------------- | ----------- | ------- | ---------------------- | ----------------------- |
| Default         | Zig         | 1       | 12.782, 12.409         | 0.359, 0.338            |
| Default         | Apple clang | 1       | 12.897, 11.292         | 0.357, 0.317            |
| Default         | Zig         | 3       | 4.362, 4.289           | 0.077, 0.070            |
| Default         | Apple clang | 3       | 4.338, 0.218           | 0.070, 0.054            |
| Developer Tools | Zig         | 1       | 0.109, 0.108           | 0.109, 0.109            |
| Developer Tools | Apple clang | 1       | 0.109, 0.109           | 0.110, 0.107            |
| Developer Tools | Zig         | 3       | 0.044, 0.045           | 0.044, 0.043            |
| Developer Tools | Apple clang | 3       | 0.044, 0.045           | 0.043, 0.043            |

These are measured wall times, not per-process CPU time. The default
serial first pass had a derived 0.235–0.269 seconds per new binary across
the two compilers and trials. Three launch workers reduced the default
first pass to 4.289–4.362 s in three of four trials; the second
Apple-clang three-worker trial
was unusually fast. [*probe-hashes.tsv*](./probe-hashes.tsv) retains
every built binary's digest;
[*probe-hash-overlap.tsv*](./probe-hash-overlap.tsv) shows no shared binary
hashes between adjacent probes for each compiler and worker count, despite the
source token being deterministic. This rules out identical binary content in
those adjacent cohorts, but not other Gatekeeper or policy caching. The
mechanism remains unverified. The Developer Tools trials showed no material
first-pass penalty. This observation applies to descendants of the SSH process
covered by the GUI grant; a future launchd runner process needs its own
permission test.

The system policy database was not cleared between probes. Separate Zig
caches, fresh paths, and distinct binary hashes make each cohort's files
fresh, but do not make the Gatekeeper state fresh. This limit may matter
for the fast second Apple-clang three-worker default trial; its cause
was not isolated.

The M6's three-worker default cohorts finished about 2.9 times faster
than its serial cohorts in three of four trials. The earlier loaded M4
did not show that scaling. This is a different host observation, not
evidence of a universal serialized assessment queue. The native fixture
harness runs sequentially, so an ungranted launchd runner would still
pay the serial first-execution cost for those fixtures.

The exact command was `python3 docs/evidence/u17/exec-probe.py.txt` with
`ZIG_GLOBAL_CACHE_DIR` set to a fresh *~/m5ci-results/probe-cache-*/
directory for each probe. The script reports cold Zig warmup compilation,
warm Zig cohort compilation, and cold versus immediate second execution
separately. Raw JSONL files are named *probe-default-1.jsonl*,
*probe-default-2.jsonl*, *probe-devtools-1.jsonl*, and
*probe-devtools-2.jsonl* in *~/m5ci-results/*.

[U17 probe]: ../u17/exec-probe.py.txt


Hosted reference
----------------

[*hosted-steps.tsv*](./hosted-steps.tsv) preserves the GitHub job and step
timestamps returned by `gh api repos/dahlia/oseo/actions/runs/RUN/jobs`
for the four compared jobs. Run [36721134885] is the only referenced run
at the exact measurement SHA, `2434dd8b`. Run [36657614384] used
`df5cb7a1` and provides a workload and runner-variance reference, not an
exact-SHA repeat. The family durations in the next table are derived from
measured step timestamps and exclude checkout, tool install, archive
restore, and job cleanup. The following setup table reports those fixed
steps separately. All four compared hosted jobs reported a runtime archive cache
hit in run 36721134885, retained in
[*hosted-cache.txt*](./hosted-cache.txt).
[*hosted-width.txt*](./hosted-width.txt) retains worker counts for both
test262 runs and the same-SHA extended-property file list from
`gh run view --log`.
Both hosted runs reported a test262 pool of three workers. Substituting
the older-SHA 1,188 s step into the same Mac denominators gives derived
5.30 cold and
5.93 warm ratios, compared with 6.73 and 7.53 for the same-SHA run.
This sensitivity check is not an exact-SHA repeat or confidence interval.

[*hosted-images.txt*](./hosted-images.txt) retains the same run's
`macos-15-arm64`/15.7.9 and `macos-26-arm64`/26.6.2 image records and
the Apple clang 17.0.0 line from the sanitizer job.

| Family and shard              | Same-SHA hosted (s) | Prior-SHA hosted (s) |
| ----------------------------- | ------------------: | -------------------: |
| test262 1/12                  |               1,508 |                1,188 |
| extended native property 1/12 |               2,815 |                2,697 |
| native fixture 1/3            |                 817 |                  853 |
| Apple-clang sanitizer native  |               1,935 |                1,764 |

The same-SHA hosted fixed setup steps were measured separately. The
archive action includes `mise run build`, cache-key computation, and
`actions/cache`, so it is not an isolated restore duration:

| Job                           | Checkout (s) | Mise action (s) | Build + archive action (s) |
| ----------------------------- | -----------: | --------------: | -------------------------: |
| test262 1/12                  |            7 |              37 |                          7 |
| extended native property 1/12 |            4 |              29 |                          4 |
| native fixture 1/3            |            3 |              32 |                          6 |
| Apple-clang sanitizer native  |            4 |              40 |                         14 |

The Mac's initial user-level tool install is a provisioning cost, not a
per-job execution step. Its mise log recorded observed individual download
times of 215.5 s for Deno, 19.8 s for Zig, and 6.4 s for Node.js, with
parallel downloads. Subsequent measured Mac `mise run build` calls took
under one second. The hosted build component was not timed separately,
so these Mac build durations cannot be compared with the composite
hosted action. GitHub's mise action also used an image tool cache, so its
step time must not be read as an uncached download rate. The relevant
Mac log lines are in [*mac-log-excerpts.txt*](./mac-log-excerpts.txt).

[36657614384]: https://github.com/dahlia/oseo/actions/runs/36657614384
[36721134885]: https://github.com/dahlia/oseo/actions/runs/36721134885


Mac serial family steps
-----------------------

Each Mac command ran from the `2434dd8b` clone with a named
`ZIG_GLOBAL_CACHE_DIR` and `TMPDIR` under *~/m5ci-results/*. The native
fixture and extended-property first-sequence trials also set a separate
`XDG_CACHE_HOME`; the repeat driver set it for all four families. The
Oseo host adapters use
*~/Library/Caches/oseo/* on macOS regardless of that variable. All
family trials shared that runtime-archive directory. Here, cold means
an empty Zig cache; warm reused the same Zig cache. The archive
directory was not reset between families.

[*mac-archives.tsv*](./mac-archives.tsv) retains one representative
archive key per family. A later `stat` inspection found each listed
key file's birth and modification times inside its first cold trial.
[*mac-archive-counts.tsv*](./mac-archive-counts.tsv) counts surviving
archive files born within the first and second cold trial windows:
test262 one,
native four, own-keys one, and sanitizer twelve in each sequence.
[*mac-archive-inventory.tsv*](./mac-archive-inventory.tsv) retains the
36 observed key filenames, birth times, modification times, and sizes
from that retrospective `stat` inspection. Files already removed before
inspection cannot be counted.
The windows use the recorded cold start and step end; the first native
window ends at its retained warm trial's start because the cold full log
was later overwritten, as described below.
The key includes the per-trial Zig environment and can also vary with
build settings, so the jobs can create more than one archive.
The representative keys were created inside the Mac timed test steps,
while all four hosted jobs reported an action cache hit during setup.
That hosted hit identifies its action key, not every variant key a test
may create. This is
retrospective filesystem evidence, not a recorded pre-test presence
check; a same-key rerun can use an existing archive. The table separates
the initial `mise run build` from the timed test command. Most raw logs
use the listed stems with *.log* appended in *~/m5ci-results/*; the
native-log exception is described below.
All retained family trials ran after the user granted Developer Tools
access to the SSH wrapper. The speed ratios below are conditional
on that SSH permission. They do not predict a launchd runner until its
own launch path receives and passes the same permission test.
No M6 test262 shard was run before the GUI grant, so these data cannot
quantify the permission's effect on the full test262 step. The paired
default and granted observations are limited to the 48-binary probe.

The extended native-property command was exactly
`mise run test:property:extended:native:shard --shard 1/12`
with `tests/property/*.property.test.ts` as the file arguments. The
repository task sets the reviewed scale 10, seed `1592590339`, and
size `large`; neither measurement changed those settings. Both Mac and
hosted selected the same three files with three workers.

The other timed test commands were `mise run test:test262 --shard 1/12`,
`mise run test:native --shard 1/3`, and
`mise run test:sanitizer:native`. Each was wrapped in
`/usr/bin/time -p`. The test262 and native commands followed a separate
`mise run build`; the sanitizer trial also ran
`mise run test:sanitizer:self` and `mise run test:sanitizer:runtime` before
its native step. These steps used the environment named above, plus
`OSEO_HOST_CC=clang` and `OSEO_NATIVE_TOOLCHAIN=host-cc` for sanitizer.
The U20 *tools/selfhosted-mac/measure.sh* `test262` mode selects shard
8/12; it was not used for this 1/12 comparison. Reproduce the recorded
ratio with the explicit 1/12 command above.

| Family and shard              | Log stem                | Cache | Build (s) | Test step (s) | Result |
| ----------------------------- | ----------------------- | ----- | --------: | ------------: | ------ |
| test262 1/12                  | test262-serial-cold-1   | cold  |      0.65 |        224.06 | pass   |
| test262 1/12                  | test262-serial-warm-1   | warm  |     prior |        200.26 | pass   |
| native fixture 1/3            | native-serial-cold-2    | cold  |      0.52 |        272.71 | pass   |
| native fixture 1/3            | native-serial-warm-2    | warm  |     prior |        242.95 | pass   |
| extended native property 1/12 | ownkeys-serial-cold-1   | cold  |      0.53 |      1,074.85 | pass   |
| extended native property 1/12 | ownkeys-serial-warm-1   | warm  |     prior |      1,069.89 | pass   |
| Apple-clang sanitizer native  | sanitizer-serial-cold-1 | cold  |      0.61 |        723.74 | pass   |
| Apple-clang sanitizer native  | sanitizer-serial-warm-1 | warm  |     prior |        719.09 | pass   |

A second cold/warm sequence at the same SHA is retained in
[*serial-repeats.tsv*](./serial-repeats.tsv). All eight repeat steps
passed. [*repeat-status.txt*](./repeat-status.txt) retains the driver's
UTC boundaries. The
detached SSH-launched driver is retained as
[*repeat-driver.sh.txt*](./repeat-driver.sh.txt). No first-exec probe
was run inside that exact detached process path, so the Developer Tools
grant's effect on it was not isolated. Its test262
steps took measured 431.30 s cold and 408.14 s warm, versus 224.06 s
and 200.26 s above. Both repeated steps passed the same 1,782 paths
and classifications. [*repeat-load-sample.txt*](./repeat-load-sample.txt)
starts one second into the second warm step and also samples native
warm and both own-keys states later. It shows `mediaanalysisd` in all
four samples, `mdworker_shared` in native warm and own-keys warm, and
XProtect in own-keys cold. No process sample was retained during the second
cold test262 step, and no sampled process's contribution to either step was
isolated. This large same-state spread makes the first trial's ratio unsuitable
as a precise scheduler constant.

At 18:05:05 UTC, the repeat driver opened
*~/m5ci-results/native-serial-cold-2.log* and overwrote the first
retained cold trial's full log. Its build time, fixture counts, and test
duration had already been captured in
[*mac-log-excerpts.txt*](./mac-log-excerpts.txt), whose heading names
the source log at extraction time. No full log for that first cold trial
remains. The first retained warm full log was copied to
*~/m5ci-results/native-serial-warm-original-2.log* before the repeat
warm step opened its original path at 18:11:11 UTC. After completion,
the repeat logs were moved to
*~/m5ci-results/native-serial-cold-repeat-2.log* and
*~/m5ci-results/native-serial-warm-repeat-2.log*. The first warm full
log and both repeat full logs remain on the Mac.
[*native-log-locations.tsv*](./native-log-locations.tsv) records the
present and missing filenames with their final `real` lines.
The second native fixture sequence measured 365.54 s cold and 330.64 s
warm with the same 88 host fixtures and 89 cross-builds passing. Its
derived same-SHA hosted/Mac ratios are 2.24 and 2.47. These also differ
materially from the first sequence's 3.00 and 3.36.

“Prior” means the standalone build happened in the paired cold trial.
Every timed `mise run test:*` still reran its build dependency, so that
small fixed cost remains inside the reported step wall time. The cold
Mac steps also include runtime archive creation, while the hosted steps
follow action cache hits; their cold ratios are descriptive comparisons
with at least one different archive state, not equivalent-cache speedups.

The cold test262 task selected 1,782 of 21,383 reviewed paths and
reported 1,535 passes, 131 expected negatives, 116 unsupported-profile
cases, and zero retries; the warm task reported the same counts. Its
path pool was eight on the 12-CPU Mac and three on hosted macOS, as
[*mac-width.txt*](./mac-width.txt) and
[*hosted-width.txt*](./hosted-width.txt) record. The test262 fragment
counter recorded 124 objects built and none reused cold, then none built
and 124 reused warm. These are fragment objects, not the runtime archive.
The native fixture
shard passed 88 of 264 host fixtures and 89 AArch64 Linux cross-builds
in each retained trial.
Its derived same-SHA hosted/Mac step ratios are 3.00 cold and 3.36
warm. Both harnesses execute fixtures sequentially.
The derived test262 whole-shard throughput ratios are 6.73 cold and
7.53 warm with eight Mac workers versus three hosted workers. They do
not measure per-worker speed and apply to one Mac job at a time.

The sanitizer native step used `OSEO_HOST_CC=clang` and
`OSEO_NATIVE_TOOLCHAIN=host-cc`, as in CI. It passed all 264 fixtures in
both trials. The Mac used Apple clang 21.0.0 and macOS 27, while the hosted
job used Apple clang 17.0.0 and macOS 15. Its derived same-SHA step ratios
are 2.67 cold and 2.69 warm, but its sanitizer verdict is a different
toolchain and OS observation. The Mac self-check and runtime steps before
the cold native trial took a measured 1.26 s and 70.65 s once, versus
8 s and 308 s from the hosted timestamps.
The native step's 4.65 s cold-to-warm gap was measured once per state and
is too small to attribute to its cache.
The second sanitizer sequence passed all 264 fixtures again. Its
native step took 944.02 s cold and 844.51 s warm, yielding derived
same-SHA hosted/Mac ratios 2.05 and 2.29. Its separate build,
self-check, and runtime setup steps took 0.54 s, 4.25 s, and 74.15 s.
The larger 99.51 s second cold-to-warm gap and the material same-state
spread prevent attributing either gap to cache reuse alone.
The native fixture harness, including this sanitizer mode, iterates
fixtures sequentially in one process in
[*tests/native.ts*](../../../tests/native.ts); neither
side configured a fixture worker pool. This source-derived width of one
differs from the runtime-reported test262 and property widths.

The extended-property shard's three Mac files all passed in each trial.
The own-keys file took a measured 1,074.20 s cold and 1,069.14 s warm;
the entire shard took 1,074.85 s and 1,069.89 s. The same-SHA hosted
own-keys file took a measured 2,812.75 s, and the older-SHA reference
took 2,692.25 s. [*hosted-ownkeys.txt*](./hosted-ownkeys.txt) preserves
both log lines. The derived same-SHA file ratios are 2.62 cold and 2.63
warm at the same three-file worker width. The file's 5.06 s cold-to-warm
gap was measured once per state and cannot be attributed to cache reuse.
The second sequence also passed all six property tests at three workers.
Its own-keys file took 1,154.42 s cold and 1,137.64 s warm; the shard
took 1,155.07 s and 1,138.32 s. Against the same hosted file step,
the derived file ratios are 2.44 and 2.47. The difference between
sequences is larger than either cold-to-warm difference, so the first
pair cannot establish a cache benefit.
The first Mac cold trial also ran
`mise run test:property:extended:package` before the shard, taking a
measured 3.70 s; the hosted first-shard package step took 9 s.

An earlier native cold attempt is retained as
*~/m5ci-results/native-serial-cold-1.log* but excluded from ratios. Its
measured wall time was 540.51 s, while its own harness reported 286.79 s.
The run overlapped a Tailscale/SSH outage; the cause of the excess wall
time was not isolated. A temporary `caffeinate -ims -t 14400` assertion
was then used for the retained cold and warm runs. It changes no
persistent power or security setting.
The repeat driver used a separate temporary
`caffeinate -ims -t 7200` assertion during its measurements.


Two simultaneous jobs
---------------------

Two local clones at `2434dd8b` ran the exact extended native-property
1/12 shard simultaneously. Each selected the same three files and three
workers, with separate Zig caches and temporary directories. Both used
the same macOS runtime-archive directory; their distinct Zig environment
paths yielded distinct archive keys in that directory. A final runner
configuration with the same Zig environment in both processes could
contend on one per-key archive lock and was not measured. This repeats
the shard to stress two runner processes; it is not a proposed replacement
for two distinct CI shards. The second clone's `mise deps` and standalone
build took measured 2.74 s and 0.56 s before either timed pair.
Both pairs also ran under the user's SSH Developer Tools grant.

[*concurrency.tsv*](./concurrency.tsv) preserves each result, and
[*concurrency-resources.tsv*](./concurrency-resources.tsv) retains sampled
resource extrema. Raw logs
are *~/m5ci-results/concurrency/{a,b}-{cold,warm}.log* on the Mac; the
driver's timestamps and 30-second resource samples are in the same
directory.

| Cache | Clone A (s) | Clone B (s) | Pair elapsed (s) |   Passes |
| ----- | ----------: | ----------: | ---------------: | -------: |
| cold  |    1,368.06 |    1,366.52 |            1,381 | 6/6 each |
| warm  |    1,371.24 |    1,372.51 |            1,381 | 6/6 each |

The pair elapsed values are derived from the measured UTC start and end
timestamps, with one-second precision. Relative to two sequential serial
shard steps, their derived throughput factors are 1.56 cold and 1.55 warm.
Each concurrent task's wall time was about 27–28% longer than its serial
counterpart. The two pairs did not show a warm-cache improvement.

The 30-second `top` samples displayed up to `15G` used, rounded by that
tool. Their lowest observed unused memory was `243M` cold and `260M`
warm. Sampled swap stayed at its initial 63.12 MiB; the smallest sampled
free disk space was 135 GiB cold and 124 GiB warm. These are sampled
extrema, not continuous peaks. This one duplicated-shard workload does
not establish the memory margin for every possible pair of CI jobs.


Guest image compatibility
-------------------------

Apple's [restore-image API] defines host compatibility through
`isSupported` and `mostFeaturefulSupportedConfiguration`. Tart 2.40.1
uses that framework to create VMs. The test downloaded the official
Apple restore images into *~/m5ci-images/*, verified each SHA-256 digest,
then used `tart create --from-ipsw` with a 40 GB ASIF disk. Both installs
completed. Each VM then reached Tart's `running` state and received a
DHCP address after `tart run --no-graphics`.
[*vm-images.txt*](./vm-images.txt) records versions, bytes, digests,
URLs, and timestamps.
The raw create, boot, and status logs remain in *~/m5ci-results/*.

The macOS 15.6.1 guest booted twice. The tested restore image is older
than the hosted `macos-15` image's observed 15.7.9; the guest was not
configured with an account or Command Line Tools, so an update offer and
Apple clang version inside the guest were not measured. The macOS 26.6.2
guest, matching the hosted `macos-latest` OS version, also booted. Neither
guest ran Oseo gates. The temporary VMs and the 26.6.2 image were removed;
the 15.6.1 image was retained for reproduction. The measured free disk
space after VM cleanup at 16:38 UTC was 107 GiB from `df -h ~`.
The later end-of-measurement sample was 89 GiB, as
[*mac-final-resources.txt*](./mac-final-resources.txt) records.

An unentitled standalone Swift probe failed to load the 15 image with
`VZErrorDomain` code `10004` (installation-service connection error).
Tart's signed and entitled app loaded, installed, and booted the same
image, so the standalone probe error is not a guest-compatibility result.
The VM checks created no guest credential, GitHub runner, or security
exception. The earlier user-granted SSH Developer Tools permission remains
enabled and must be reviewed before runner registration.

[restore-image API]: https://developer.apple.com/documentation/virtualization/vzmacosrestoreimage
