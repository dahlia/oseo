TypedArray copyWithin detached cost
===================================

This ready, unlanded node owns no test262 paths. The user registered it on
2026-10-28 as a product performance node, depending on
`unsupported-ownership-audit`.

A phase-timed Full UPDATE of main `6aab0fc8` on t1 (never-merge
instrumentation commit `7adf8d40`, manifest unchanged) found the three
slowest paths of the whole run in one place. The timings include
instrumentation overhead and a cold Zig cache, so treat them as relative.

| Path under *test/built-ins/TypedArray/prototype/copyWithin/* | Native execution, 4 variants | Compile and link | C bytes per variant |
| ------------------------------------------------------------ | ---------------------------- | ---------------- | ------------------- |
| *coerced-values-end-detached.js*                             | 128.887 s                    | 0.402 s          | 3,680,829           |
| *coerced-values-end-detached-prototype.js*                   | 128.410 s                    | 0.464 s          | 3,698,972           |
| *coerced-values-start-detached.js*                           | 129.134 s                    | 0.363 s          | 3,680,885           |

Each variant spends about 32 seconds in native execution, while emitting,
compiling and linking it takes well under a second. These are retained
measurements, not new executions in this worktree.

| Evidence                                  | Pointer                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| User decision                             | ~/.local/state/oseo-m5c/decisions/product-performance-nodes-20261028.md |
| Phase report, “Top 30 slowest item paths” | ~/.local/state/oseo-m5c/throughput-research/p06/report.txt              |
| Raw `OSEO_PHASE` records                  | /data/m5c-phase-diag-20261028/remote-20261027T212428Z-2c437718e422/     |
| Report parser                             | ~/.local/state/oseo-m5c/throughput-research/p06/phase\_report.py        |

The bounded remedy is to find the runtime cause, for example a loop over a
large length after detachment, and fix it without changing semantics.
Record before and after per-variant native time, C bytes and compile time
here. The node is observation-neutral if the outputs stay unchanged; the
publication decision says which UPDATE it needs.
