U10 historical measurement evidence
===================================

Purpose and provenance
----------------------

These reference fixtures make the historical per-path investigation in
[*gate-cost-baseline.md*](../../gate-cost-baseline.md) independently
checkable. They preserve measurement sources and compact observed output from
*/tmp/u10-evidence/*, collected for U10 before commit `e5a38882`. They contain
no cache, runtime archive, header tree, binary, or generated C. The C probe is
manually written diagnostic source, retained for this documented purpose.
No new native timings were measured for this preservation change.

The original bench and control instrumentation templates were extracted from
*u10-measure.py* and *u10-instrument.py* in the raw directory. The new-path
instrumentation template also incorporates the original inline edits recovered
from the U10 Codex session `01a0e28c-aab4-7583-9934-8fc60f427b7a`: mapping
working directories to source IDs and writing metrics on process exit. These
are preserved source templates with formatting only.
The TypeScript templates use *.ts.txt* because historical runner internals do
not form a supported tool API and these files must not be treated as live
TypeScript by lint/type checks. Captured JSON uses *.json.txt* to retain
exact reference values and long source-path keys without treating these
observations as live formatter inputs. Copy them through *prepare.py* only into
a disposable checkout at the named historical commit.

*prepare.py*, *compact.py*, and *summarize.py* are preservation helpers added
in this follow-up. The original corpus and CI extraction drivers are retained
as *u10-corpus.py* and *u10-ci-summary.py*, with source lines wrapped.
The CI driver also retains the runtime-archive restore log line, added during
this preservation pass. The latter reads the saved response
from `gh run view RUN --json headSha,jobs` and that run's downloaded job logs.
Each run preserves its `headSha` and `jobs`; recomputation checks the SHA
against the named historical commit. The corpus driver requires PyYAML
with its LibYAML `CSafeLoader`. Those original raw CI files need not exist
to recompute the checked-in table.


Table inputs
------------

| Baseline table/claim             | Checked-in input                            | Calculation                                                                                                                               |
| -------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| macOS execution steps            | *ci-summary.json.txt*                       | `stepSeconds` by run, job, and shard in `name`                                                                                            |
| CI path rates and growth         | *ci-summary.json.txt*, *corpus.json.txt*    | Sum `stepSeconds`, divide by `all.paths`; endpoint growth is `100 * (last / first - 1)`                                                   |
| CI cache and worker observations | *ci-summary.json.txt*                       | Sum `builds.objectsBuilt`, `builds.objectsReused`, and `runtimeArchiveRestored`; `final` retains pool/retry counts                        |
| Variant counts and growth        | *corpus.json.txt*                           | `all.variants`, `old.variants`, `new.variants`; endpoint growth uses the same formula                                                     |
| Linux cold/warm sample           | *runs.json.txt*                             | Run keys `REV-cold`, `REV-warm1`, `REV-warm2`; runner is `metadata.durationMilliseconds / 1000`, wall/user/system are `time` fields       |
| CPU/wall column                  | *runs.json.txt*                             | `(time.userSeconds + time.systemSeconds) / time.wallSeconds`                                                                              |
| Warm sample mean growth          | *runs.json.txt*                             | Average each endpoint's two warm runner times, then `100 * (last / first - 1)`                                                            |
| Unchanged-classification control | *runs.json.txt*, *control-metrics.json.txt* | Keys `REV-instrument-warmN`; sum each phase's `milliseconds` and divide by 1000                                                           |
| Generated-C identity and volume  | *control-metrics.json.txt*                  | Shared exact `sourceMultiset` after equality checks for all four runs; file count is sum of `count`, byte count is sum of `bytes * count` |
| New-path trial times             | *runs.json.txt*                             | Keys `new-prime`, `new-warm1`, `new-warm2`, with the same runner/time fields                                                              |
| Three security-path native sums  | *new-metrics.json.txt*                      | Sum the four observed intervals under each full path in `nativeMillisecondsByPath`, divide by 1000                                        |
| 97.4/97.3 percent attribution    | *new-metrics.json.txt*                      | For each warm run, divide the sum of those three paths' intervals by the sum of every path's native intervals, multiply by 100            |
| Sanitized collector probe        | *gc-probe.log*                              | Direct `objects` and `cpu_seconds` values by commit, kind, and trial, emitted by *gc-probe.c*                                             |

The exact frozen selections are *paths.json.txt* (209 old paths),
*stable-paths.json.txt* (206 unchanged-classification paths), and
*new-paths.json.txt* (315 endpoint additions). They are measurement inputs,
not reviewed subset replacements. *runs.json.txt* retains summary, variant,
build/reuse, pool, and retry observations for every recorded run, including
control primers. It omits full manifests and redundant dependency/group
summaries.

*compact.py* records the original JSON/log filename for each run and strips
subprocess arguments and temporary directories. The phase rule is exactly
`native` when the command contains `/fixture-`, otherwise `compile/link` when
its first argument is `cc`, otherwise `identity/other`. Every interval is
retained at its original precision. New-path native intervals remain grouped
by full source ID; their array order is completion order, not a strictness or
specialization label. The four control source multisets were equal, so one
copy preserves all `(name, bytes, SHA-256, multiplicity)` observations.
Control exit statuses include one observed expected-negative native exit per
run; that does not represent a manifest mismatch.

Recompute without building:

~~~~ sh
python3 docs/evidence/u10/summarize.py
~~~~

This prints derived means, ratios, phase sums, C file/byte counts, and the
unrounded attribution percentages. Round only the final value to the table's
precision. Probe rows are direct observations, not derived projections.
To re-extract compact JSON when the original raw directory is available:

~~~~ sh
python3 docs/evidence/u10/compact.py /tmp/u10-evidence /tmp/u10-compact
~~~~


Rerun at a historical commit
----------------------------

Use a disposable detached checkout and retain the path to this evidence
folder outside it. Build that checkout with `mise run build` before timing;
that prerequisite cost was excluded from the Linux tables. The following
example prepares the endpoint control. Substitute *paths.json.txt* and `plain`
for the old sample, or *new-paths.json.txt* and `new` for the endpoint
additions.

~~~~ sh
python3 /absolute/path/to/docs/evidence/u10/prepare.py \
  /tmp/oseo-u10-history \
  /absolute/path/to/docs/evidence/u10/stable-paths.json.txt control
cd /tmp/oseo-u10-history
ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-test262-per-path-rise \
  mise run build
ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-test262-per-path-rise \
  XDG_CACHE_HOME=/tmp/u10-replay/cache-aff3ade3 \
  U10_RESULT=/tmp/u10-replay/aff3ade3-instrument-warm1.json \
  /usr/bin/time -f 'wall=%e user=%U system=%S maxrss=%M' \
  mise exec -- node tools/u10-bench.ts
~~~~

Create the result directory first. Use historical Node.js 24.18.0 and Zig
0.16.0 to match the observed tool versions. The bench asserts serialized
manifest equality against the selected commit's canonical expectations and
writes only the result file. Control instrumentation embeds metrics there;
new-path instrumentation writes a separate *.json.metrics* file. Remove the
two temporary *tools/u10-*.ts\* files before switching historical commits.

The old sample uses all nine commits named in its table. Control runs use
`32ece7f4` and `aff3ade3`; new-path runs use `aff3ade3`. For an old-sample
cold replay, start with empty Zig and per-commit Oseo caches, only when this
lane is idle and its cache can be cleared. Reuse the same lane directory for
both warm trials. Do not create suffixed Zig cache directories. Control runs
use an untimed primer followed by two warm trials; new-path runs start with
populated Zig/runtime caches and mixed harness state, then two warm repeats.
The original cache contents are deliberately not retained, so exact mixed
build/reuse counts require recreating that state. Timings on another host
are new measurements, not replacements for the preserved observations.

For the C probe, use the matching historical
*packages/runtime-c/native/* headers and the archive produced in that
commit's Oseo runtime archive cache. Run both `symbol` and `typed` twice.
The command below repeats the original compile/link options; output is outside
the repository. Prefix captured stdout with commit, kind, and trial as in
*gc-probe.log*.

~~~~ sh
ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-test262-per-path-rise \
  mise exec -- zig cc -target x86_64-linux-gnu -std=c11 \
  -Wall -Wextra -Werror -pedantic \
  -I packages/runtime-c/native -fsanitize=address,undefined -fno-lto \
  /absolute/path/to/docs/evidence/u10/gc-probe.c \
  /absolute/path/to/matching-runtime.a -o /tmp/u10-replay/gc-probe
/tmp/u10-replay/gc-probe symbol
/tmp/u10-replay/gc-probe typed
~~~~
