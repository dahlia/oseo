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

| Path under *test/built-ins/RegExp/property-escapes/generated/* | Native execution, 4 variants | Compile and link, 4 variants | C bytes, 4 variants |
| -------------------------------------------------------------- | ---------------------------- | ---------------------------- | ------------------- |
| *ID\_Start.js*                                                 | 11.608 s                     | 31.527 s                     | 13,992,528          |
| *General\_Category\_-\_Other.js*                               | 12.936 s                     | 35.409 s                     | 16,098,848          |
| *Grapheme\_Base.js*                                            | 11.659 s                     | 41.862 s                     | 18,402,230          |
| *General\_Category\_-\_Other\_Letter.js*                       | 12.676 s                     | 25.233 s                     | 11,689,792          |
| *ID\_Continue.js*                                              | 11.611 s                     | 37.213 s                     | 16,395,770          |
| *strings/RGI\_Emoji.js*                                        | 0.344 s                      | 40.610 s                     | 22,123,274          |

These are retained measurements, not new executions in this worktree. The
C byte column sums the four variants: the raw `c_emission` records give
about 3.5 MB per variant for *ID\_Start.js*, not 14 MB.

| Evidence                          | Pointer                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------- |
| User decision                     | ~/.local/state/oseo-m5c/decisions/done/product-performance-nodes-20261028.md |
| Phase report, “Per-family totals” | ~/.local/state/oseo-m5c/throughput-research/p06/report.txt                   |
| Raw `OSEO_PHASE` records          | /data/m5c-phase-diag-20261028/remote-20261027T212428Z-2c437718e422/          |


Where the cost is
-----------------

On G `e2ff16d4` (2026-10-28, local linux-x86\_64-gnu, Zig toolchain), the
regular expressions are not the cost. Each generated case builds its match
and non-match strings with the harness's `buildString`, which together
cover almost every code point, one `codePoints[length++] = codePoint` store
and one `String.fromCodePoint.apply` element read per code point. The four
`testPropertyEscapes` calls then each match one string.

 -  Replacing `testPropertyEscapes` with an empty function in
    *ID\_Start.js* left about 3.56 s of about 3.71 s native execution CPU
    (three interleaved runs, *raw/split-G.txt*), so matching takes about
    0.15 s. Set membership in *runtime\_regexp\_matcher.c* is
    already a binary search over the inversion list (`set_has`).
 -  The regular expression tables are small: each literal emits about
    10 KB of instructions and set boundaries. The C bulk is the
    `buildString` range arrays, about 1 KB of generic array-literal
    lowering per two-element range.
 -  gdb stack sampling of the native *ID\_Start.js* binary put 16 of 60
    samples in number formatting (`oseo_internal_number_text`, `snprintf`,
    `strtod` and their libc internals; *raw/prof-G-ID\_Start-spec.txt*),
    the largest single owner: every numeric property key and every
    array-like element read converts an integer index to text through the
    Number::toString shortest round-trip search, up to 17 `snprintf` and
    `strtod` pairs per call. The rest is spread over generic loop lowering
    (per-iteration binding cells, property-vector lookups, string-table
    interning) with no single owner.

The fix formats integers of magnitude below 2^53 directly in
`oseo_internal_number_text` (*runtime\_primitive.c*). Every such integer is
a double whose neighbors lie at most one apart, so no decimal with fewer
significant digits reads back as it and Number::toString's digits are the
integer's own, in plain notation because it is below 10^21. Every other
value, including -0, fractions, 2^53 and larger, NaN and the infinities,
keeps the existing path. Generated C, both specialization policies, GC
behavior and every fallback are unchanged. The `--emit-c` output of all
28 measured variants has the same SHA-256 under G and U
(*raw/c-hashes-G.txt*, *raw/c-hashes-U.txt*).

Tests: the native `number-prototype` fixture gains an integer-text line
(one digit, sign, 2^32 boundaries, 2^52, 2^52 + 0.5, ±(2^53 − 1), ±2^53,
2^53 + 2, 10^20, a 21-digit integer, an array index at 2^32 − 2 and integer
object keys) checked against Node.js and Deno under both policies with GC
at every safepoint. *packages/runtime-c/tests/number-text.test.ts* checks
structurally that the integer branch precedes the round-trip search and
calls neither `snprintf` nor `strtod`.


Before and after
----------------

Measured on 2026-10-28 with a focused script (not a gate). Before is G;
after is the working tree whose *runtime\_primitive.c* is the blob in U
(SHA-256 `1f86d621…`), with `mise run build` after each switch. The
scripts, inputs, raw records with every sample and exit status, profiles
and C hashes are retained in
*/data/m5c-regexp-property-escape-match-cost-20261028/* (README there).
The script assembles
*base.js*, *regExpUtils.js* and the test, emits C, compiles, links and runs
each variant through `runNativeCli` on the native-test toolchain, keeping
each executable. The before and after executables then ran interleaved
three times (*raw/ab.txt*, all 168 runs exited 0); the table gives the
minimum user plus system CPU. Compile and link is the wall time of the
generated-C toolchain request with a warm runtime archive, from
*raw/bench-before.txt* and *raw/bench-after.txt*. The host
load average was about 20 on 16 cores, so compile and link wall time is
noisy; the generated C is identical before and after, so the compile and
link difference is load, not the change. This assembly includes the
harness in the test's C; the test262 runner's prebuilt harness fragment
makes its C smaller. *General\_Category\_-\_Decimal\_Number.js* is a small
property included as a control.

| Path                                  | Variant         |   C bytes | Compile+link before |  after | Exec CPU before (min of 3) |  after | Change |
| ------------------------------------- | --------------- | --------: | ------------------: | -----: | -------------------------: | -----: | -----: |
| ID\_Start                             | sloppy/enabled  | 3,914,631 |              4.43 s | 4.99 s |                     3.17 s | 2.24 s |   -29% |
| ID\_Start                             | strict/enabled  | 3,911,898 |              4.35 s | 4.58 s |                     3.28 s | 2.27 s |   -31% |
| ID\_Start                             | sloppy/disabled | 3,876,418 |              4.42 s | 4.70 s |                     3.76 s | 1.93 s |   -49% |
| ID\_Start                             | strict/disabled | 3,873,685 |              4.47 s | 5.13 s |                     3.58 s | 2.24 s |   -37% |
| General\_Category\_-\_Other           | sloppy/enabled  | 4,498,380 |              4.65 s | 4.78 s |                     3.62 s | 2.43 s |   -33% |
| General\_Category\_-\_Other           | strict/enabled  | 4,495,647 |              4.60 s | 5.20 s |                     3.97 s | 2.42 s |   -39% |
| General\_Category\_-\_Other           | sloppy/disabled | 4,460,167 |              4.85 s | 4.37 s |                     4.09 s | 2.51 s |   -39% |
| General\_Category\_-\_Other           | strict/disabled | 4,457,434 |              4.77 s | 4.64 s |                     3.83 s | 2.38 s |   -38% |
| Grapheme\_Base                        | sloppy/enabled  | 5,148,513 |              4.62 s | 5.07 s |                     3.50 s | 1.97 s |   -44% |
| Grapheme\_Base                        | strict/enabled  | 5,145,787 |              4.56 s | 5.07 s |                     3.20 s | 1.88 s |   -41% |
| Grapheme\_Base                        | sloppy/disabled | 5,110,300 |              4.70 s | 5.35 s |                     3.53 s | 2.36 s |   -33% |
| Grapheme\_Base                        | strict/disabled | 5,107,574 |              4.52 s | 4.88 s |                     3.17 s | 2.11 s |   -33% |
| General\_Category\_-\_Other\_Letter   | sloppy/enabled  | 3,268,345 |              3.23 s | 4.43 s |                     4.31 s | 2.27 s |   -47% |
| General\_Category\_-\_Other\_Letter   | strict/enabled  | 3,265,619 |              3.31 s | 4.26 s |                     3.68 s | 2.26 s |   -39% |
| General\_Category\_-\_Other\_Letter   | sloppy/disabled | 3,230,133 |              3.54 s | 4.16 s |                     3.58 s | 2.21 s |   -38% |
| General\_Category\_-\_Other\_Letter   | strict/disabled | 3,227,407 |              3.34 s | 4.19 s |                     4.16 s | 2.32 s |   -44% |
| ID\_Continue                          | sloppy/enabled  | 4,586,699 |              4.21 s | 4.86 s |                     3.65 s | 2.12 s |   -42% |
| ID\_Continue                          | strict/enabled  | 4,583,966 |              4.12 s | 4.95 s |                     3.66 s | 2.40 s |   -34% |
| ID\_Continue                          | sloppy/disabled | 4,548,486 |              4.19 s | 4.78 s |                     3.13 s | 1.87 s |   -40% |
| ID\_Continue                          | strict/disabled | 4,545,753 |              3.95 s | 4.86 s |                     3.07 s | 1.98 s |   -36% |
| RGI\_Emoji                            | sloppy/enabled  | 6,477,300 |              4.01 s | 5.22 s |                     0.09 s | 0.09 s |    +0% |
| RGI\_Emoji                            | strict/enabled  | 6,474,568 |              3.88 s | 5.15 s |                     0.12 s | 0.11 s |    -8% |
| RGI\_Emoji                            | sloppy/disabled | 6,439,087 |              4.09 s | 4.85 s |                     0.09 s | 0.09 s |    +0% |
| RGI\_Emoji                            | strict/disabled | 6,436,355 |              4.09 s | 4.73 s |                     0.11 s | 0.10 s |    -9% |
| General\_Category\_-\_Decimal\_Number | sloppy/enabled  |   914,743 |              1.98 s | 2.23 s |                     4.85 s | 2.96 s |   -39% |
| General\_Category\_-\_Decimal\_Number | strict/enabled  |   912,007 |              1.72 s | 2.31 s |                     4.48 s | 2.88 s |   -36% |
| General\_Category\_-\_Decimal\_Number | sloppy/disabled |   876,531 |              1.80 s | 2.12 s |                     4.06 s | 3.01 s |   -26% |
| General\_Category\_-\_Decimal\_Number | strict/disabled |   873,795 |              1.76 s | 1.97 s |                     4.65 s | 2.81 s |   -40% |

Total native execution CPU over the 28 variants: before 90.39 s, after
56.22 s (−37.8 %).

Native execution is the family's dominant cost in the phase report
(5,385 s of the 5,518 s over the 441 generated paths, against 1,133 s of
compile and link), so the expected Full UPDATE saving is roughly a third of
that execution time. Compile and link of the largest paths remains about
4 to 5 s per variant here, driven by generic array-literal lowering of the
`buildString` range tables rather than by regular expression tables. Making
constant array literals table-driven would be a separate backend change and
is not part of this node.
