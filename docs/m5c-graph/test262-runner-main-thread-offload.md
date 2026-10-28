Test262 runner main-thread offload
==================================

This ready, unlanded node owns no test262 paths. The user registered it on
2026-10-28 as a remediation node, depending on
`unsupported-ownership-audit`. It changes how the reviewed test262 runner
creates processes and emits split-fragment C, as
[*docs/test262-runner-offload.md*](../test262-runner-offload.md) describes.
The product CLI keeps its direct spawn path, and the execution pool stays
at eight.

The user's decision reports three cold-Zig-cache Full UPDATEs of the same
reviewed subset on t1. They are reported measurements, not new executions
in this worktree.

| Source                                          | Pool | Duration                     | Manifest                               |
| ----------------------------------------------- | ---- | ---------------------------- | -------------------------------------- |
| main `2df04b46`                                 | 8    | 4,511.925 s (75.2 min)       | `written=0`, 29,901 tests, `retries=0` |
| candidate `c814b5c5`                            | 8    | 3,146.771 s (52.4 min), −30% | `written=0`, 29,901 tests, `retries=0` |
| `c814b5c5` with pool 16, never-merge `dff06dd0` | 16   | 2,222.208 s (37.0 min), −51% | `written=0`, 29,901 tests, `retries=0` |

All three report 26,456 passes, 2,802 expected negatives and 643
unsupported, the totals then checked in. In the pool 16
run, cgroup memory, page cache included, reached its 52 GiB cap without an
OOM or retry. That run is diagnostic only: this node keeps pool eight, and
raising it is a separate follow-up that needs a D13 evidence text change,
a memory headroom check, and a check of the CI macOS lanes that share one
machine.

| Evidence                               | Pointer                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| User decision                          | ~/.local/state/oseo-m5c/decisions/done/test262-runner-main-thread-offload.md |
| Pool 8 baseline and candidate runs     | /data/m5c-offload-compare-20261028/                                          |
| Pool 16 diagnostic run                 | /data/m5c-offload-pool16-20261028/                                           |
| Phase timing that motivated the change | ~/.local/state/oseo-m5c/throughput-research/p06/report.txt                   |

Because the change touches *packages/* and *tools/*, its UPDATE is Full,
run at this node's own source.
