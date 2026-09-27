U3 fixed-cost cache audit evidence
==================================

The documentation-only audit in
[*gate-cost-baseline.md*](../../gate-cost-baseline.md) rejects adding a
cross-job aube store cache on the local cost evidence. No cache or workflow
change is implemented and no branch run was triggered. None of these
measurements establishes Zig compilation cache warmth.


CI inputs
---------

The source runs are 36243816479 at `00153abe`, 36261458909 at `c9b3cc80`
and 36312192623 at `af9bb68c`. Each *ci-RUN.json.txt* retains the job name,
ID, host, selected step timestamps, mise-action revision, observed cache
input and restore/miss markers, tool-install summary, and aube install/linking
markers. The named cold macOS example also retains sparse extraction progress.
No native execution or test-case log is copied. These are historical
observations, not a before/after cache experiment. Raw GitHub logs may expire;
the compact inputs preserve every observation used by the U3 tables.

Recompute the table means, named-job comparisons and local content checks
without network access:

~~~~ sh
python3 docs/evidence/u3/summarize.py
~~~~

To re-extract a source run while its logs remain available:

~~~~ sh
export ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-job-fixed-cost
run=36312192623
gh run view "$run" --repo dahlia/oseo --json headSha,jobs \
  > /tmp/u3-jobs.json
gh api "repos/dahlia/oseo/actions/runs/$run/logs" > /tmp/u3-logs.zip
python3 docs/evidence/u3/extract-ci.py "$run" \
  /tmp/u3-jobs.json /tmp/u3-logs.zip > /tmp/u3-compact.json.txt
~~~~

Step durations and all means/sums are derived from measured timestamps.
Aube `in Ns` values are its measured install reports, rounded by the tool.
The linking tail starts at the first linking progress message, so it is
only an observed portion of installation. Its complement includes fetching,
unpacking and store population, not an isolated network-download duration.


Local inputs
------------

*local-linux.json.txt* and *local-macos.json.txt* preserve measured subprocess
seconds from Python `time.perf_counter()`, archive byte sizes, file counts,
content bytes and content hashes. The associated cold/warm install logs
confirm downloads on the empty-store install. The macOS warm logs report
`reused 62`; Linux prints only an install summary, without a download or
reuse count. The restored-store state is established by the probe procedure
and recorded content hashes. Each host has one empty-store sample and two
restored-store trials. Save, deletion and fingerprint time are excluded from
restore/install time. Every warm trial deletes all root/package *node\_modules*
directories and extracts the saved store into an absent directory before the
frozen install. No dependency freshness marker or built output is restored.

Both probes used source `16e8c62e`, Node 24.21.0 and aube 2.5.0. The macOS
probe ran in a bundle clone at *~/Desktop/oseo-m5ci-job-fixed-cost* on
`ssh macbook-air`; the Linux probe used an exported tree at
*/tmp/u3-linux-install*. All subprocess environments select the assigned
`ZIG_GLOBAL_CACHE_DIR` even though this probe never invokes Zig.

The preserved source files are *probe-linux.py.txt* and *probe-macos.py.txt*.
They are unmodified copies of the scripts that produced the reported
trials; cache-directory cleanup tolerates an absent directory. The macOS script
uses GNU tar with zstd for creation and GNU tar with unzstd for extraction. An
earlier BSD-tar experiment introduced AppleDouble files and was discarded; its
observations are not included. Linux's uncompressed local tar is a favorable
control, which excludes decompression, GitHub lookup and network transfer costs.

To reproduce, prepare a new disposable checkout of `16e8c62e` with its
pinned tools installed. Do not use a checkout holding personal changes:
these scripts delete that checkout's *node\_modules* trees and, on macOS,
any existing *probe-store* and *probe-cache* directories. Keep the probe
source outside that checkout so it is not an installation input. From the
repository holding this evidence, for a fresh Linux checkout:

~~~~ sh
u3_probe_root=/absolute/path/to/disposable-checkout
u3_aube=$(cd "$u3_probe_root" && mise which aube)
u3_node=$(cd "$u3_probe_root" && mise which node)
python3 docs/evidence/u3/probe-linux.py.txt \
  "$u3_probe_root" "$u3_aube" "$u3_node"
~~~~

For macOS, copy *probe-macos.py.txt* outside a new Desktop clone. With
Homebrew GNU tar/zstd installed, run it under `/usr/bin/python3`, passing
the clone's absolute path and pinned aube/Node paths obtained with
`/opt/homebrew/bin/mise which`. The script records per-command logs and
*probe-result.json* at the clone root; save them before a repeat overwrites
those paths. No clone is committed or pushed.

The digest hashes sorted relative file paths plus SHA-256 of regular-file
bytes; it excludes timestamps, modes and link identity. Store contents matched
between the fresh install and both extractions on each host. This proves
local archive content preservation, not a GitHub exact-key implementation or
that two different hosts produce identical stores. No cache key is implemented,
so key-mutation and prefix-match behavior are not asserted.
