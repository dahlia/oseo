U8 host split audit evidence
============================

The audit in [*gate-cost-baseline.md*](../../gate-cost-baseline.md) uses main
runs 36243816479 at `00153abe`, 36261458909 at `c9b3cc80`, and
36312192623 at `af9bb68c`. These are historical observations, not a U8
before/after experiment. U8 changes documentation only, as the coordinator
requested after reviewing the initial candidates.

Each *ci-RUN.json.txt* preserves measured job/step timestamps for every macOS
job and the Linux Node comparison job. It also preserves ordered measured Node
case durations in milliseconds, their source files and audit categories, and
ambiguous-case durations separately. Repeated case names, case log timestamps
and candidate-path lists are omitted because no table reads them. Job and step
durations and per-file/category sums are recomputed from retained inputs. The
source-path inventory comes from the run's own commit, not this checkout. All
listed independent files have uniquely attributable cases in the same run's
Linux Node job too.

[*file-costs.md*](./file-costs.md) lists every historical test source file and
its category. [*job-steps.md*](./job-steps.md) lists every macOS job and each
non-skipped workflow step, including setup and cleanup. The shared setup and
job-specific classifications in the main audit apply to each named instance.
The category identifiers are local audit labels, not language-profile or
ADR 0013 classification changes.

Regenerate the displayed inventories and verify both U8 baseline cost tables
without network access:

~~~~ sh
python3 docs/evidence/u8/summarize.py
mise exec -- hongdown --write docs/evidence/u8/*.md
~~~~

Reproduce the trimmed observations from saved GitHub inputs:

~~~~ sh
export ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-host-split-audit
run=36312192623
revision=af9bb68c5216ed300cbeed52ac7c77682e7fd54a
gh run view "$run" --repo dahlia/oseo --json headSha,jobs \
  > /tmp/u8-jobs.json
gh api "repos/dahlia/oseo/actions/runs/$run/logs" > /tmp/u8-logs.zip
mise exec -- node --input-type=module - "$revision" \
  < docs/evidence/u8/test-names.mjs.txt > /tmp/u8-names.json
python3 docs/evidence/u8/extract-ci.py "$run" \
  /tmp/u8-jobs.json /tmp/u8-logs.zip /tmp/u8-names.json \
  > /tmp/u8-compact.json.txt
~~~~

Use the corresponding commit above for the other runs. GitHub log retention may
prevent future retrieval. The checked-in compact observations preserve the
inputs used for the derived tables without requiring a new CI run.

*test-names.mjs.txt* parses historical test sources with Babel; it never
imports or executes them. The extractor starts at the exact Node test-task
launch, excluding build-tool checkmarks, and stops at the runner's first final
`tests` summary, excluding repeated failure details. It first tries literal
registration names, then literal labels in test tables, then template patterns.
Only a unique source-file match receives a duration. Ambiguous names are not
assigned by apparent output order; their durations remain unallocated.

A per-file sum is derived from its measured case durations. It omits process
startup, module loading outside callbacks, Node scheduling and untimed helper
work, and can be incomplete when names are ambiguous. It is neither a measured
file subprocess duration nor additive job wall time. Node file subprocesses
run concurrently. Summed native case time can exceed measured job wall time;
there is no defensible proportional wall-time allocation from these logs.

The pure-file classification is established by the source audit, not by the
name extractor or a heuristic absence of `zig`. Unclear files stay unclear even
when their case cost is small. Pure properties retain their interruption
verdicts and the parser statements file retains its explicit timing verdicts.
No native timing improvement is measured, and archive hits do not identify Zig
cold/warm cache state. No cold/warm native speedup is claimed.
