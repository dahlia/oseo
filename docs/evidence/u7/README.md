U7 duplicate-work audit evidence
================================

These files preserve inputs and extraction rules for the U7 section of
[*gate-cost-baseline.md*](../../gate-cost-baseline.md). CI inputs were observed
from main runs 36243816479 and 36261458909; no workflow was triggered. Each
compact file retains its run ID, full commit SHA, job name/ID, selected API
step timestamps, later-build interval timestamps and end markers, and measured
Node tooling-test durations. Captured JSON uses *.json.txt* as historical
reference data, following the U10 evidence convention.

Recompute the displayed totals without network access:

~~~~ sh
python3 docs/evidence/u7/summarize.py
~~~~

*extract-ci.py* reads a saved `gh run view` response and ZIP runner logs.
It removes ANSI color escapes, identifies each exact
`[build] $ aube exec -- tsdown --workspace` launch, excludes the first build
in the job, and ends each later interval at the next log line matching
`\[test:[^\]]+\] \$`. That is the test task's shell launch, not its final
completion, first test case, or a build output message. The timestamp
subtraction includes dispatch overhead. For the check job, each named
`duration_ms` summary measures only its Node unit-test subprocess.

To refresh the compact evidence from the same historical sources, using run
36261458909 as the example:

~~~~ sh
run=36261458909
gh run view "$run" --repo dahlia/oseo --json headSha,jobs > /tmp/u7-jobs.json
gh api "repos/dahlia/oseo/actions/runs/$run/logs" > /tmp/u7-logs.zip
python3 docs/evidence/u7/extract-ci.py \
  "$run" /tmp/u7-jobs.json /tmp/u7-logs.zip > /tmp/u7-compact.json.txt
~~~~

Repeat with run 36243816479 for its other column. GitHub log retention may
prevent a later re-download; the compact observations preserve the measured
inputs used here, although they do not preserve the complete runner log.
Neither sample establishes an implementation speedup or Zig cache state.

The local property counterexample uses fast-check 4.9.0 with Node 24.21.0
and the harness at `86180894`. *property-probe.mjs.txt* is preserved JavaScript
for stdin execution, rather than a live repository test or build entry point.
It records the arguments delivered to an `fc.assert` predicate using
`fc.integer()` and the actual `propertyParameters` function. It does not use
`fc.sample`, whose sampling bias would be a different observation.
*property-probe.log* is the measured output. Run from the repository root:

~~~~ sh
export ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-duplicate-work-audit
mise exec -- node --input-type=module \
  < docs/evidence/u7/property-probe.mjs.txt
~~~~

This probe executes no native build. It demonstrates distinct first cases
under the configured seeds, not a comparison of every property's generated
corpus. The source-level seed and size differences independently rule out
claiming that extended suites duplicate all ordinary evidence.
