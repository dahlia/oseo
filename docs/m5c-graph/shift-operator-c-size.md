Shift operator C size
=====================

This ready, unlanded node owns no test262 paths. The user registered it on
2026-10-28 as a product performance node, depending on
`unsupported-ownership-audit`.

A phase-timed Full UPDATE of main `6aab0fc8` on t1 (never-merge
instrumentation commit `7adf8d40`, manifest unchanged) measured these
paths. The timings include instrumentation overhead and a cold Zig cache,
so treat them as relative.

| Path under *test/language/expressions/*   | C bytes, 4 variants | Compile and link, 4 variants |
| ----------------------------------------- | ------------------- | ---------------------------- |
| *right-shift/S11.7.2\_A4\_T1.js*          | 101,471,532         | 50.245 s                     |
| *right-shift/S11.7.2\_A4\_T2.js*          | 101,459,080         | 48.921 s                     |
| *right-shift/S11.7.2\_A4\_T3.js*          | 100,280,048         | 48.317 s                     |
| *right-shift/S11.7.2\_A4\_T4.js*          | 99,888,664          | 48.562 s                     |
| *unsigned-right-shift/S11.7.3\_A4\_T1.js* | 100,325,176         | 46.240 s                     |
| *unsigned-right-shift/S11.7.3\_A4\_T2.js* | 100,312,724         | 46.959 s                     |
| *unsigned-right-shift/S11.7.3\_A4\_T3.js* | 106,489,144         | 48.887 s                     |
| *unsigned-right-shift/S11.7.3\_A4\_T4.js* | 106,475,884         | 47.772 s                     |

Each path's four variants together emit about 100 MB of C, so each variant
emits about 25 MB and takes about 12 seconds to compile and link. The
phase report sums both columns over the four variants; the raw records for
*right-shift/S11.7.2\_A4\_T1.js* show 25,363,858 to 25,371,908 bytes per
variant.
The left-shift siblings probably share the shape. An earlier tail study
found the cause: in one variant of
*unsigned-right-shift/S11.7.3\_A4\_T3.js*, 24.03 MB of its 26.49 MB of
body C (90.71%) was the same completion branch table emitted 528 times.
These are retained measurements, not new executions in this worktree.

| Evidence                                  | Pointer                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| User decision                             | ~/.local/state/oseo-m5c/decisions/done/product-performance-nodes-20261028.md |
| Phase report, “Top 30 slowest item paths” | ~/.local/state/oseo-m5c/throughput-research/p06/report.txt                   |
| Raw `OSEO_PHASE` records                  | /data/m5c-phase-diag-20261028/remote-20261027T212428Z-2c437718e422/          |
| Duplicated completion table study (P07)   | ~/.local/state/oseo-m5c/throughput-research/r10-test262-tail.md              |

The bounded remedy is to share identical completion-target tables or
otherwise stop the duplication in the C backend. Keep both specialization
policies, GC behavior and generic fallback behavior. Record before and
after C bytes, compile time and per-variant native time here.
