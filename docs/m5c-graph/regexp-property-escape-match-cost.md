RegExp property escape match cost
=================================

This ready, unlanded node owns no test262 paths. The user registered it on
2026-10-28 as a product performance node, depending on
`regexp-property-escape-harness` and `unsupported-ownership-audit`.

A phase-timed Full UPDATE of main `6aab0fc8` on t1 (never-merge
instrumentation commit `7adf8d40`, manifest unchanged) attributed
5,517.690 s of native execution to the *built-ins/RegExp* family across
1,879 paths, several times any other family, and 1,857.614 s of compile
and link. The timings include instrumentation overhead and a cold Zig
cache, so treat them as relative.

| Path under *test/built-ins/RegExp/property-escapes/generated/* | Native execution, 4 variants | Compile and link, 4 variants | C bytes per variant |
| -------------------------------------------------------------- | ---------------------------- | ---------------------------- | ------------------- |
| *ID\_Start.js*                                                 | 11.608 s                     | 31.527 s                     | 13,992,528          |
| *General\_Category\_-\_Other.js*                               | 12.936 s                     | 35.409 s                     | 16,098,848          |
| *Grapheme\_Base.js*                                            | 11.659 s                     | 41.862 s                     | 18,402,230          |
| *General\_Category\_-\_Other\_Letter.js*                       | 12.676 s                     | 25.233 s                     | 11,689,792          |
| *ID\_Continue.js*                                              | 11.611 s                     | 37.213 s                     | 16,395,770          |
| *strings/RGI\_Emoji.js*                                        | 0.344 s                      | 40.610 s                     | 22,123,274          |

These are retained measurements, not new executions in this worktree.

| Evidence                          | Pointer                                                                 |
| --------------------------------- | ----------------------------------------------------------------------- |
| User decision                     | ~/.local/state/oseo-m5c/decisions/product-performance-nodes-20261028.md |
| Phase report, “Per-family totals” | ~/.local/state/oseo-m5c/throughput-research/p06/report.txt              |
| Raw `OSEO_PHASE` records          | /data/m5c-phase-diag-20261028/remote-20261027T212428Z-2c437718e422/     |

The bounded remedy is to profile the native matcher for property escape
classes, for example class membership by linear range scans, and the size
of the emitted tables, then fix the dominant cost. Record before and after
per-variant native time, C bytes and compile time here.
