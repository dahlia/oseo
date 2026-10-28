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

The phase report's `c_emission` bytes sum all four variants (`4/4`) and
include the launcher and harness units, so the “per variant” column above
is about four times one variant's body C. For example, four times the
25,238,615 body bytes of one *S11.7.2\_A4\_T1.js* variant is 100,954,460
of its 101,471,532 bytes. The measurements below are per variant.

### Cause

Every `resume-completion` terminator emitted a `switch` on
`completion[N].target` with a case for every block of the function.
A completion record's `target` starts zeroed and only a `completion-set`
with a `completionTarget` writes it; record copies move such values
between slots. In these bodies no `completion-set` saves a target, so all
cases were dead, and their number grew with both the statement count and
the dispatch count. The C was therefore quadratic in the guarded `throw`
statements. The backend now names only the blocks that some
`completion-set` of the same function saves. Saved targets, block 0,
`default: abort();`, the throw and return paths, both specialization
policies and generator completion records are unchanged.

### Before and after

Measured on 2026-10-28 on the local 16-core host, one variant at a time
through `createTest262FragmentExecutor` with a warm harness object and a
node-local Zig cache. A wrapper around the host's `run` times
compile/link (every toolchain process) separately from the executable.
Before is G `e2ff16d4`; after is G plus this change. All 48 variants per
side exited 0 with empty output. Body C bytes are identical across the
four variants of a path.

| Path under *test/language/expressions/*   | Body C bytes per variant, before | After     | Compile and link, 4 variants, before | After    | Native execution per variant, before | After  |
| ----------------------------------------- | -------------------------------- | --------- | ------------------------------------ | -------- | ------------------------------------ | ------ |
| *left-shift/S11.7.1\_A4\_T1.js*           | 25,217,996                       | 2,522,295 | 55.827 s                             | 28.602 s | 9.5 ms                               | 6.8 ms |
| *left-shift/S11.7.1\_A4\_T2.js*           | 25,165,187                       | 2,469,486 | 52.148 s                             | 26.757 s | 9.5 ms                               | 7.5 ms |
| *left-shift/S11.7.1\_A4\_T3.js*           | 24,968,525                       | 2,272,824 | 48.589 s                             | 27.122 s | 8.8 ms                               | 7.5 ms |
| *left-shift/S11.7.1\_A4\_T4.js*           | 25,026,890                       | 2,331,189 | 49.014 s                             | 25.869 s | 9.5 ms                               | 7.5 ms |
| *right-shift/S11.7.2\_A4\_T1.js*          | 25,238,615                       | 2,542,914 | 51.455 s                             | 29.802 s | 11.5 ms                              | 8.5 ms |
| *right-shift/S11.7.2\_A4\_T2.js*          | 25,235,502                       | 2,539,801 | 50.111 s                             | 30.818 s | 9.0 ms                               | 7.5 ms |
| *right-shift/S11.7.2\_A4\_T3.js*          | 24,940,744                       | 2,245,043 | 47.914 s                             | 25.609 s | 9.8 ms                               | 7.2 ms |
| *right-shift/S11.7.2\_A4\_T4.js*          | 24,842,898                       | 2,237,514 | 48.332 s                             | 25.309 s | 9.5 ms                               | 7.0 ms |
| *unsigned-right-shift/S11.7.3\_A4\_T1.js* | 24,952,008                       | 2,256,307 | 48.556 s                             | 25.705 s | 8.8 ms                               | 7.2 ms |
| *unsigned-right-shift/S11.7.3\_A4\_T2.js* | 24,948,895                       | 2,253,194 | 49.143 s                             | 25.173 s | 10.2 ms                              | 8.0 ms |
| *unsigned-right-shift/S11.7.3\_A4\_T3.js* | 26,493,000                       | 2,327,747 | 52.180 s                             | 33.500 s | 11.8 ms                              | 9.5 ms |
| *unsigned-right-shift/S11.7.3\_A4\_T4.js* | 26,489,685                       | 2,324,432 | 57.732 s                             | 25.792 s | 12.0 ms                              | 6.5 ms |

Over the 48 variants, body C fell from 1,214,079,780 to 113,290,984
bytes (90.7%), and compile and link from 611.0 s to 330.1 s (46.0%).
The in-process interval from harness and body fragment compilation
through C emission (`emitMs`) fell from 30.5 s to 7.4 s; the script does
not time C emission alone. The left-shift siblings had the same shape.
The remaining body C still holds 511–528 guarded-throw sequences, each
with its own dispatch, now without cases; this node does not change
them. Native execution was already negligible.

The measurement script and raw JSON rows are retained in
*/data/m5c-shift-c-size-20261028/* (`measure.mts`,
`native-before.json`, `native-after.json`).

### Regression checks

*tests/completion-target-labels.test.ts* now checks that every dispatch
names exactly the saved nonzero targets of its function, and that a
shift-shaped program of guarded throws emits dispatches with no cases and
C at most linear in its statement count. Both tests fail on G.

The change moves 26 of the 44 records in
*tests/harness-fragment-baseline.json*; *docs/harness-fragment-abi.md*
records why. The comparison script and its output are
*/data/m5c-shift-c-size-20261028/baseline-compare.mts* and
*baseline-compare.out*.

The first focused run, *focused-checks.log* in the same directory, used
the code change before the baseline regeneration and a later lint-only
rename. Its unit step failed only “whole-Script output matches the main
baseline”, on the stale *labeled-statements* hash; that failure led to
the regeneration above. All checks then reran on 2026-10-28 at commit
`6068561e`, the first version of this change, with no tracked changes;
later revisions changed only this work note. The logs are in that
directory:

 -  *check-at-U.log*: `mise run check`, exit 0.
 -  *unit-at-U.log*: the backend-c package tests,
    *tests/completion-target-labels.test.ts*,
    *tests/harness-fragments.test.ts* and the other C-shape and hash
    tests, 87 passed and none failed.
 -  *native-property-at-U.log*: an untracked temporary copy of
    *tests/native.ts* narrowed to the 28 fixtures whose definitions
    contain `finally`, with the scenario shards skipped, matched Node.js
    and Deno under both specialization policies; then the property files
    *m5-proper-tail-calls*, *m5-generator*, *m5-async-generator* and
    *m5-async-await* passed 11 of 11 tests.
