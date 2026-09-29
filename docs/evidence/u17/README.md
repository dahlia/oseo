Hosted first executable launch probe
====================================

Run [36594796547] at `1b5970ffae4f6bdbf553bcc03d3337016c102c97`
measured each hosted image once on 2026-09-29 UTC. All jobs passed.
The experiment branch, `m5ci-hosted-runner-exec-probe`, must never be
merged: it disables the full workflow's push trigger. The documentation
branch, `m5ci-exec-probe-results`, starts separately from `main` and
preserves that workflow unchanged.

The tested hosted runners did not exhibit the sustained serialized
first-execution cost reported on the user's Mac mini. This establishes
behavior for these tiny programs and this single run, not the absence of
all security checks or a repeatable CI speedup. The macOS 26 Apple-clang
concurrent cohort has first-launch outliers, preserved below.

[36594796547]: https://github.com/dahlia/oseo/actions/runs/36594796547


Method and scope
----------------

[*exec-probe.py.txt*](./exec-probe.py.txt) is the exact Python script
embedded in the executed [*exec-probe.yaml.txt*](./exec-probe.yaml.txt). Each
job installs the repository-pinned tools through `jdx/mise-action@v4`. Zig uses
an initially empty job-local `ZIG_GLOBAL_CACHE_DIR` under the runner's
temporary directory. Its throwaway build records cold compiler startup; the
measured cohorts use the subsequently warmed cache. Apple/host-clang cache
state is uncontrolled. Local validation uses
`ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-hosted-runner-exec-probe`.

Each compiler first builds and launches one throwaway executable. That
launch is visible as `warmup-exec` and excluded from cohort totals. Each
of the concurrency-one and concurrency-three cohorts then gets 48 fresh
executables with distinct embedded constants and verified distinct binary
hashes. Every executable returns zero after checking its constant.
Compilation is serial for both cohorts and is timed separately. The
first pass launches each executable once; the second pass launches the
same executable again. Thus the concurrency-three first pass never
reuses the concurrency-one binaries. Warmup absorbs process-wide startup
but does not pre-execute the measured files.

Zig invokes `zig cc -target aarch64-macos -std=c11 -O0` on macOS and
`zig cc -target x86_64-linux-gnu -std=c11 -O0` on Linux. The second
compiler uses Apple clang with `-arch arm64` on macOS and host clang with
`-target x86_64-linux-gnu` on Linux. The program is deliberately tiny;
this does not measure an Oseo fixture, sanitizer instrumentation, or a
complete gate. File hashing reads the binaries before launch, so disk
pages may already be cached even though the binaries have never executed.

Per-binary wall time includes Python process launch and waiting for
exit. Cohort wall time starts before scheduling work in an already
created thread pool and ends after every process exits. Its wall time
includes thread startup and scheduling, but excludes printing individual
measurements, compilation, tool installation, and pool shutdown.
The shared-library probe builds a fresh library per compiler and times
`ctypes.CDLL` with `RTLD_NOW` in the running Python process. The repeated
load retains the first handle, so it measures a cached load rather than
an unload/reload.

The probe changes no security setting. It records `sw_vers`, `uname`, CPU
facts, `spctl --status`, and `csrutil status`. The macOS log query uses
`log show --start` with the recorded probe-start timestamp, `--info`,
`--debug`, and the predicate `process == "syspolicyd"`.


Observed environments
---------------------

All values below are observed command output or runner metadata from run
36594796547, with full output in each image's *system.txt* and metadata
row in *measurements.jsonl.txt*.

| Label           | OS                                  | Image version   | CPU                                   | Compiler                       |
| --------------- | ----------------------------------- | --------------- | ------------------------------------- | ------------------------------ |
| `macos-15`      | macOS 15.7.9, build 24G830          | 20260907.0337.1 | Apple M1 (Virtual), 3 cores           | Zig 0.16.0; Apple clang 17.0.0 |
| `macos-latest`  | macOS 26.6.2, build 25G83           | 20260907.0351.1 | Apple M1 (Virtual), 3 cores           | Zig 0.16.0; Apple clang 21.0.0 |
| `ubuntu-latest` | Linux 6.17.0-1022-azure, glibc 2.39 | 20260920.314.1  | AMD EPYC 7763, 2 cores/4 logical CPUs | Zig 0.16.0; clang 18.1.3       |

Both macOS jobs report `assessments enabled` and
`System Integrity Protection status: disabled.` These are observed image
settings, not changes made by the experiment. They do not identify why
the launch behavior differs from the Mac mini.


Launch measurements
-------------------

All times are milliseconds from run 36594796547. Totals and individual
launch durations are measured; medians and maxima are derived from the
48 measured first-pass durations. Each compiler/concurrency cell was
measured once, followed by one repeat pass on the same binaries.

| Image         | Compiler    | Concurrency | First total ms (measured) | Second total ms (measured) | First median ms (derived) | First max ms (derived) |
| ------------- | ----------- | ----------- | ------------------------- | -------------------------- | ------------------------- | ---------------------- |
| macos-15      | zig         | 1           | 428.907                   | 446.241                    | 8.556                     | 17.630                 |
| macos-15      | zig         | 3           | 133.483                   | 107.836                    | 7.518                     | 15.477                 |
| macos-15      | apple-clang | 1           | 361.789                   | 359.246                    | 7.959                     | 12.478                 |
| macos-15      | apple-clang | 3           | 111.009                   | 140.892                    | 5.725                     | 12.635                 |
| macos-latest  | zig         | 1           | 507.555                   | 503.678                    | 8.979                     | 41.996                 |
| macos-latest  | zig         | 3           | 174.809                   | 197.351                    | 9.286                     | 16.879                 |
| macos-latest  | apple-clang | 1           | 476.023                   | 449.865                    | 8.830                     | 21.607                 |
| macos-latest  | apple-clang | 3           | 813.272                   | 202.850                    | 16.274                    | 400.838                |
| ubuntu-latest | zig         | 1           | 64.577                    | 63.909                     | 1.302                     | 1.810                  |
| ubuntu-latest | zig         | 3           | 24.075                    | 22.447                     | 1.360                     | 2.354                  |
| ubuntu-latest | host-clang  | 1           | 63.778                    | 63.696                     | 1.291                     | 1.748                  |
| ubuntu-latest | host-clang  | 3           | 22.566                    | 23.177                     | 1.350                     | 1.590                  |

The macOS 26 Apple-clang concurrency-three first pass took a measured
813.272 ms versus 202.850 ms for its repeat. First launches at indices
0, 1, and 16 took measured 358.026, 400.838, and 103.604 ms; its derived
first-pass median was 16.274 ms. That cohort does not show a concurrency
speedup and must not be averaged away. Its cause was not isolated.
Even this slower cohort is inconsistent with every fresh binary paying
the Mac mini's reported serialized cost.

The shared-library results below are measured milliseconds from the same
run. The second column is an already-loaded handle, not a fresh library.

| Image         | Compiler    | First `dlopen` ms (measured) | Repeated `dlopen` ms (measured) |
| ------------- | ----------- | ---------------------------- | ------------------------------- |
| macos-15      | Zig         | 0.938                        | 0.072                           |
| macos-15      | Apple clang | 2.348                        | 0.417                           |
| macos-latest  | Zig         | 1.264                        | 0.181                           |
| macos-latest  | Apple clang | 1.467                        | 0.326                           |
| ubuntu-latest | Zig         | 0.214                        | 0.043                           |
| ubuntu-latest | Host clang  | 0.242                        | 0.043                           |

The macOS 15 log contains connection invalidation messages. The macOS 26
log also contains private ticket lookups and telemetry. Paths are
redacted by macOS, and the experiment does not correlate these entries
with binary launch timestamps. These logs establish that `syspolicyd`
was active, not that no assessment occurred or that it caused the
outliers. Sparse persisted logs alone cannot prove absence of checks.


Fixed cost and cache state
--------------------------

The table contains measured timestamps from *run.json.txt*. Durations in
seconds are derived differences of those timestamps, recorded at whole
second precision. Job time includes setup and cleanup; step time does
not. The probe step includes diagnostics, all builds, warmups, timed
execution, shared-library loads, and the final log query. Its build cost
must not be added again to that step duration.

| Job                        | Job ID       | Job s (derived) | Checkout s (derived) | Mise install s (derived) | Probe step s (derived) |
| -------------------------- | ------------ | --------------- | -------------------- | ------------------------ | ---------------------- |
| exec probe (ubuntu-latest) | 109496806245 | 45              | 3                    | 10                       | 28                     |
| exec probe (macos-15)      | 109496806599 | 100             | 3                    | 35                       | 55                     |
| exec probe (macos-latest)  | 109496806775 | 122             | 5                    | 41                       | 68                     |

The cold Zig throwaway builds measured 13.864 s on macOS 15, 15.987 s
on macOS 26, and 13.999 s on Ubuntu. Subsequent 48-binary Zig cohorts
measured 12.054/11.538 s, 13.602/12.412 s, and 2.418/2.614 s,
respectively, for concurrency-one/concurrency-three labels. These are
serial compilation totals with warmed Zig caches, not concurrent build
speedups. Every binary has different source bytes, so compilation work
remains. Apple/host-clang builds are retained individually; their cohort cache
state is labeled `uncontrolled`. No cold/warm compiler comparison is
claimed.
The throwaway first launches measured 11.199/7.029 ms on macOS 15 and
27.388/10.380 ms on macOS 26 for Zig/Apple clang, respectively.


Implication for additional Mac capacity
---------------------------------------

The preserved [research excerpt](./mac-mini-baseline.txt) reports a
historical measured Mac mini M4/macOS 15.2 first launch of
212–225 ms and 48 fresh first launches taking 10.2–10.8 s despite higher
concurrency. Its conclusion about hosted runners was previously an
inference. This run directly measures the absence of that sustained
serialized cost on the tested hosted images. It does not measure the
Mac mini again or explain its different policy behavior.

Candidate 3, renting dedicated Mac capacity, still requires the same
fresh-binary and shared-library probe in the actual rented guest with
its default policy. Faster hardware cannot be assumed to eliminate a
serialized assessment queue. Candidate 4, measuring speed before
spending, remains necessary: compare the same SHA, shard, seeds, budgets,
Zig, Apple clang, OS image, and cache state separately for test262,
extended properties, and Apple-clang sanitizer work. The tiny-program
probe establishes no family throughput ratio or runner-minute saving.
Any rented-Mac capacity model must use those measured family ratios and
retain the existing execution, sanitizer, and evidence coverage.


Preserved evidence and reproduction
-----------------------------------

The three image directories retain exact probe measurement rows in
*measurements.jsonl.txt*, command output in *system.txt*, and the complete
returned macOS log query in *syspolicyd.txt*. Linux marks that query as
inapplicable. *run.json.txt* preserves job/step timestamps and run status.
[*extract.py.txt*](./extract.py.txt) preserves the log extraction script;
it requires every expected executable timing row before accepting a job.

Read-only retrieval used:

~~~~ sh
gh run view 36594796547 --repo dahlia/oseo \
  --json databaseId,status,conclusion,headSha,jobs
gh api --allow-escape-sequences \
  repos/dahlia/oseo/actions/jobs/109496806599/logs > macos-15.log
python3 extract.py.txt macos-15 macos-15.log
~~~~

Use the other job IDs in the fixed-cost table for their logs. GitHub's
`gh run view --log` refused logs while other jobs were still running;
the completed-job REST endpoint above supplied them. A local smoke run
uses `mise exec -- python3 exec-probe.py.txt` with the lane cache
variable. Hosted reproduction requires a separately authorized push of
the experiment branch; the preserved workflow must never replace the
normal workflow on `main`.

Validation: `mise run check` and the Linux probe smoke passed on the
experiment branch. `mise run check` also passed on the results branch.
Claude Opus 5 returned a clean review after timing,
logging, and metadata fixes. The coordinator waived full test and
extended-property gates for this isolated workflow experiment and the
separate documentation branch. Neither branch changes compatibility
counts, property budgets, targets, or production CI coverage.
