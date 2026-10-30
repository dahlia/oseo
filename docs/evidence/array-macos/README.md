Ordinary macOS Array placement
==============================

The ordinary Array constructor property keeps its 12 cases, seed
`0x60003f00`, and 180,000-millisecond interrupt. The generated domain,
shrinking, specialization policies, forced collection, guards, and oracle
are unchanged. This change only moves the file out of the four shared
hosted Node.js shards into one dedicated hosted `macos-latest` job.


CI observations (2026-10-30)
----------------------------

Read-only GitHub API job logs report these durations for “generated Array
construction and statics match the M5 property model”:

| Run           | Job          | Placement                     | Duration, seconds | Result                        |
| ------------- | ------------ | ----------------------------- | ----------------: | ----------------------------- |
| [40938388428] | 123675145283 | macOS ordinary Node shard 3/4 |      65.706487417 | Pass                          |
| [40928163264] | 123639348068 | macOS ordinary Node shard 3/4 |     105.590630875 | Pass                          |
| [40906939547] | 123564389904 | macOS ordinary Node shard 3/4 |     159.844587917 | Pass                          |
| [40946667351] | 123703942532 | macOS ordinary Node shard 3/4 |     180.016799541 | Interrupted after 11/12 cases |
| [40325009995] | 121579334388 | Dedicated Linux extended job  |    1108.108062665 | Pass                          |

The dedicated diagnostic has 120 extended cases and a different host. Its
1,108.509-second test-runner wall is a measured standalone result, but it
cannot predict a standalone ordinary macOS duration. A title search of the
latest 100 run records found this dedicated Linux diagnostic; no standalone
ordinary macOS measurement was found in the inspected logs. No CI job was
launched or rerun for this change, and no local property suite was run.
A hosted macOS standalone comparison remains pending the first candidate
CI run. Shared passing times span a factor of 2.43; contention is a reason
to isolate the file, but these observations do not establish its cause or
guarantee that isolation alone prevents every interrupt.

Reproduce the measurements without changing CI:

~~~~ sh
gh api 'repos/dahlia/oseo/actions/runs?per_page=100'
gh api 'repos/dahlia/oseo/actions/runs/40946667351/jobs?per_page=100'
gh api --allow-escape-sequences \
  repos/dahlia/oseo/actions/jobs/123703942532/logs
~~~~

Repeat the last request with the other job IDs in the table. The adjacent
*property-lines.txt* preserves the measured property lines and SHA-256
hashes of the downloaded raw job logs.

[40325009995]: https://github.com/dahlia/oseo/actions/runs/40325009995
[40906939547]: https://github.com/dahlia/oseo/actions/runs/40906939547
[40928163264]: https://github.com/dahlia/oseo/actions/runs/40928163264
[40938388428]: https://github.com/dahlia/oseo/actions/runs/40938388428
[40946667351]: https://github.com/dahlia/oseo/actions/runs/40946667351


Scheduling and coverage
-----------------------

`dedicatedMacosNodeFiles` is separate from `dedicatedLinuxNativeFiles`:
the Linux rule covers extended native properties, while the new rule covers
ordinary macOS Node.js discovery. macOS extended properties still include
Array exactly once in their file shards. Linux ordinary Node.js coverage,
Linux extended placement, and sanitizer coverage stay unchanged.

The ordinary macOS wrapper reproduces Node 24's default discovery, excludes
only the dedicated file, then lets Node partition the remaining inventory
with `--test-shard`. Synthetic tests compare the resulting union against
Node's own discovery, including all six supported extensions, naming rules,
nested test directories, and ignored dependency directories. The dedicated
job runs the entire file with one file worker, without property time scaling.
Its result is required by `native`, including failure, skip, and cancellation.
The original four ordinary check names are retained.

The new job uses the same `macos-latest` environment as ordinary Node.js
coverage. Self-hosted native lanes use `macos-15` and measured time scaling;
placing this ordinary gate there would change its environment without a
same-lane measurement. Instead the generator puts the dedicated job into
one of the existing five hosted capacity chains. It follows that chain's
predecessor even when the predecessor fails, and cannot create a sixth
hosted macOS slot. PRs, forks, and unavailable self-hosted lanes retain the
same hosted scheduling guarantee.

The new 240-second cost is a scheduling allowance, the 180-second interrupt
plus 60 seconds of setup, not a measured standalone latency or a new timeout.
The four shared shard weights are retained estimates: excluding a file also
changes Node's positional assignments, so they need a later CI refresh.
With these inputs the generator's modeled maximum changes as follows:

| Self-hosted lanes | Before, seconds | After, seconds | Difference, seconds |
| ----------------: | --------------: | -------------: | ------------------: |
|                 0 |       12229.000 |      12334.000 |            +105.000 |
|                 4 |        3803.000 |       3839.498 |             +36.498 |
|                 6 |        2838.571 |       2838.571 |               0.000 |
|    8 (configured) |        2452.000 |       2452.000 |               0.000 |

The additional job adds a modeled four runner-minutes, with no modeled
critical-path increase at eight configured Mac lanes. With every job hosted,
the modeled increase is 1.75 minutes. These are schedule estimates, not
observed end-to-end CI improvements. The intended benefit is removal of
competing file workers during this property's fixed interrupt window.
