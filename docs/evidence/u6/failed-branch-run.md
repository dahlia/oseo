U6 interrupted branch experiment
================================

Branch run [36343919872] at `e98edd15` is a failed experiment. Linux native
support shard `1/4` interrupted own-key statics at the unchanged property
deadline. This is incomplete generated work and must not be used as a clean
coverage or performance measurement. The run has completed with failure; the
full per-shard observation is in *first-branch-comparison.md*. The retained
input *ci-36343919872.json.txt* records all comparison jobs;
*ci-36343919872-linux-1.json.txt* preserves the earlier single-job snapshot.
Both record the interrupted job, including the censored case, counts, and
command/marker/failure timestamps. Historical inputs *ci-36243816479.json.txt*,
*ci-36261458909.json.txt*, and *ci-36312192623.json.txt* retain the comparison
jobs and package intervals.

Individual case, runner, and job durations below are measured from the named
CI logs. Per-file case sums and scheduling replays are derived. The historical
compact inputs retain each case duration; the branch job reports a warm runtime
archive, whereas the historical Linux support jobs report cold archives.
Neither cache effects nor runner variance have been separated from scheduling.

| Source run  | Own-key measured min | Native runner measured min | Job elapsed measured min | Verdict          |
| ----------- | -------------------- | -------------------------- | ------------------------ | ---------------- |
| 36243816479 | 54.77                | 85.59                      | 86.23                    | Complete/pass    |
| 36261458909 | 55.43                | 86.37                      | 87.02                    | Complete/pass    |
| 36312192623 | 33.72                | 52.23                      | 52.95                    | Complete/pass    |
| 36343919872 | 60.00                | 64.53                      | 65.20                    | Interrupted/fail |

The branch observed 58 tests, 57 passes, one failure, and no skips or TODOs.
The interrupted test reported 149 examples and seed `1592590339`. Each source
revision configures `numRuns: 16` and `timeLimitMilliseconds: 360_000`; the
extended task configures scale ten, deriving 160 examples and a 3,600-second
deadline. Those settings are preserved. The measured interrupted duration is
3,600,008.22068 milliseconds, including timer/callback overhead.

[36343919872]: https://github.com/dahlia/oseo/actions/runs/36343919872


Placement and concurrency
-------------------------

All three historical Linux runs place own-key twentieth in positional shard
`1/4`, after nineteen earlier files. The historical wrapper passes the host
`availableParallelism()` count to Node; it does not emit that count. A derived
four-file-slot replay of their measured case sums matches their own-key
critical path to within a few seconds of the measured runner interval. Thus
four is the replay assumption, not a separately logged historical measurement.

That replay derives own-key starts at 1,844.74, 1,852.03, and 1,108.59 seconds
for the three source runs. Its initial overlapping files are Math namespace,
object binding, and Object.defineProperty. These are estimated overlaps;
ordered Node reporting does not preserve a complete dispatch timeline.

The branch explicitly logs four file workers and starts own-key, Reflect,
Proxy, and Object-constructor first. The derived per-file sums of its measured
peer cases are 2,424.25, 1,759.86, and 1,284.62 seconds, respectively. It
continues assigning the remaining files to freed slots while own-key runs.
Concentrating heavy peers at the beginning is a contention risk; the logs
establish a deadline interruption, but do not establish that scheduling alone
caused its duration increase.

The first-shard-only extended package step is sequential, before native
execution. Its measured package-command to native-command intervals are
12.64/12.39/8.80 seconds historically and 12.46 seconds on the branch. The
branch own-key failure event appears about 3,600.82 measured seconds after the
native-shard marker, so the package step is outside the own-key timer.

All files sharing the historical/branch shard are listed below. Columns are
derived per-file sums of measured case minutes; n/a means the file belongs to
another shard. The failed own-key entry is censored. Co-assignment does not
imply continuous concurrent execution.

| Property filename under tests/property/               | 36243816479 | 36261458909 | 36312192623 | 36343919872 |
| ----------------------------------------------------- | ----------- | ----------- | ----------- | ----------- |
| m4-async.property.test.ts                             | 7.75        | 7.71        | 4.64        | n/a         |
| m5-aggregate-error.property.test.ts                   | n/a         | n/a         | n/a         | 3.80        |
| m5-array-binding.property.test.ts                     | n/a         | n/a         | n/a         | 3.27        |
| m5-array-buffer.property.test.ts                      | 10.48       | 10.43       | 5.90        | n/a         |
| m5-array-prototype-index-search.property.test.ts      | 7.38        | 7.43        | 4.43        | n/a         |
| m5-array-prototype-predicate-search.property.test.ts  | 7.85        | 7.86        | 4.66        | n/a         |
| m5-array-prototype-sort.property.test.ts              | n/a         | n/a         | n/a         | 5.80        |
| m5-array-spread.property.test.ts                      | 4.16        | 4.21        | 2.47        | 4.17        |
| m5-async-await.property.test.ts                       | n/a         | n/a         | n/a         | 4.76        |
| m5-atomics-single-agent.property.test.ts              | 7.16        | 7.11        | 4.41        | n/a         |
| m5-call-spread.property.test.ts                       | 3.98        | 3.97        | 2.35        | 3.97        |
| m5-catch-binding.property.test.ts                     | n/a         | n/a         | n/a         | 2.67        |
| m5-data-view.property.test.ts                         | 9.43        | 9.49        | 5.39        | n/a         |
| m5-delete.property.test.ts                            | 5.80        | 5.80        | 3.61        | n/a         |
| m5-destructuring-assignment.property.test.ts          | n/a         | n/a         | n/a         | 3.06        |
| m5-ephemeron-tracing.property.test.ts                 | n/a         | n/a         | n/a         | 0.66        |
| m5-export-default-class.property.test.ts              | n/a         | n/a         | n/a         | 0.78        |
| m5-for-await-of.property.test.ts                      | 17.76       | 17.83       | 10.74       | n/a         |
| m5-for-binding.property.test.ts                       | n/a         | n/a         | n/a         | 3.58        |
| m5-for-of-assignment.property.test.ts                 | 3.91        | 3.97        | 2.35        | 3.84        |
| m5-for-of-binding.property.test.ts                    | n/a         | n/a         | n/a         | 3.50        |
| m5-for-of.property.test.ts                            | n/a         | n/a         | n/a         | 2.85        |
| m5-function-prototype.property.test.ts                | 6.20        | 6.18        | 3.74        | n/a         |
| m5-generator-parameter.property.test.ts               | n/a         | n/a         | n/a         | 3.41        |
| m5-generator-throw.property.test.ts                   | n/a         | n/a         | n/a         | 0.78        |
| m5-generator.property.test.ts                         | 6.30        | 6.36        | 3.75        | n/a         |
| m5-globalthis-binding.property.test.ts                | 8.77        | 8.87        | 5.23        | n/a         |
| m5-iterator-helpers-eager.property.test.ts            | 5.54        | 5.64        | 3.36        | n/a         |
| m5-iterator-intrinsic.property.test.ts                | n/a         | n/a         | n/a         | 6.05        |
| m5-json-stringify.property.test.ts                    | 5.63        | 5.71        | 3.43        | n/a         |
| m5-math-namespace.property.test.ts                    | 18.74       | 19.19       | 10.90       | n/a         |
| m5-module-continuation.property.test.ts               | n/a         | n/a         | n/a         | 3.81        |
| m5-object-binding.property.test.ts                    | 2.79        | 2.83        | 1.78        | n/a         |
| m5-object-constructor.property.test.ts                | n/a         | n/a         | n/a         | 21.41       |
| m5-object-define-property.property.test.ts            | 6.74        | 6.91        | 4.06        | n/a         |
| m5-object-own-keys.property.test.ts                   | 54.77       | 55.43       | 33.72       | 60.00       |
| m5-optional-chaining.property.test.ts                 | 3.29        | 3.33        | 2.05        | 3.33        |
| m5-optional-private.property.test.ts                  | n/a         | n/a         | n/a         | 4.11        |
| m5-parameter-var.property.test.ts                     | n/a         | n/a         | n/a         | 2.50        |
| m5-pattern-await.property.test.ts                     | 8.37        | 8.51        | 5.10        | n/a         |
| m5-proxy-exotic-object.property.test.ts               | n/a         | n/a         | n/a         | 29.33       |
| m5-reflect-namespace.property.test.ts                 | 38.31       | 37.58       | 22.67       | 40.40       |
| m5-regexp-matcher.property.test.ts                    | n/a         | n/a         | n/a         | 0.11        |
| m5-regexp-pattern-extensions.property.test.ts         | 0.00        | 0.00        | 0.00        | 0.00        |
| m5-regexp-pattern.property.test.ts                    | n/a         | n/a         | n/a         | 0.02        |
| m5-regexp-unicode-property-escapes.property.test.ts   | 0.02        | 0.02        | 0.01        | 0.02        |
| m5-runtime-error-observation.property.test.ts         | n/a         | n/a         | n/a         | 6.32        |
| m5-set-intrinsic.property.test.ts                     | 5.87        | 5.93        | 3.58        | n/a         |
| m5-string-iterator.property.test.ts                   | n/a         | n/a         | n/a         | 6.68        |
| m5-string-prototype-case.property.test.ts             | 5.17        | 5.22        | 3.03        | n/a         |
| m5-string-prototype-pad.property.test.ts              | n/a         | n/a         | n/a         | 5.97        |
| m5-string-prototype-search-and-slice.property.test.ts | 9.31        | 9.46        | 5.76        | n/a         |
| m5-super-without-extends.property.test.ts             | n/a         | n/a         | n/a         | 5.14        |
| m5-tagged-template.property.test.ts                   | n/a         | 2.92        | 1.85        | 2.94        |
| m5-top-level-this.property.test.ts                    | 10.51       | n/a         | n/a         | n/a         |
| m5-typed-array-iterative.property.test.ts             | n/a         | 5.78        | 3.77        | n/a         |
| m5-typed-array-mutation.property.test.ts              | 5.97        | n/a         | n/a         | n/a         |
| m5-typed-array-search-and-join.property.test.ts       | n/a         | n/a         | n/a         | 5.50        |
| m5-typed-array-statics.property.test.ts               | n/a         | 7.15        | 4.31        | n/a         |
| m5-typeof-unresolved.property.test.ts                 | 6.24        | n/a         | n/a         | n/a         |
| m5-weak-collections.property.test.ts                  | n/a         | 7.81        | 4.92        | n/a         |
| m5-well-known-symbols.property.test.ts                | 7.53        | n/a         | n/a         | n/a         |
| unicode-tables.property.test.ts                       | n/a         | n/a         | n/a         | 0.01        |


Coverage-preserving correction
------------------------------

Linux `--shard INDEX/TOTAL` with a total greater than one reserves index one
exclusively for own-key when that file is present. CI raises the Linux support
matrix from four to five jobs, so four cost-batched shards still execute every
remaining file. The singleton has one file worker and no sibling file process.
For total one, the complete input remains in its single shard. macOS assignment
and totals are unchanged by this correction; test262 retains the raised total
of twelve on both targets.

The correction changes neither generated budgets nor the interruption verdict.
It adds one Linux job and zero macOS jobs, so its derived additional macOS fixed
cost is zero. The explicitly authorized second run 36358067906 validated
completion of the corrected partition; its observations are retained in
[second-branch-comparison.md](./second-branch-comparison.md). No success or
complete-coverage claim is made for the failed first run.

The unchanged two-run weight table gives the following derived/estimated Linux
execution model, replaying measured concurrent case sums. These estimates
assume the same file costs when isolated, so they do not predict the benefit
of removing contention or establish deadline safety. They deliberately charge
the singleton its full historical cost. The native corpus is held constant at
the projected 41,091 test262 paths, so these native estimates are unchanged
there; the existing test262 projection remains separate. macOS cost models
remain unchanged by the Linux correction.

| Source costs | Positional execution max min | Singleton plus four batches max min | Singleton plus four batches sum min | Change in Linux execution sum min |
| ------------ | ---------------------------- | ----------------------------------- | ----------------------------------- | --------------------------------- |
| 36243816479  | 85.52 derived                | 54.77 estimated                     | 261.53 estimated                    | +28.16 estimated                  |
| 36261458909  | 86.30 derived                | 55.43 estimated                     | 271.02 estimated                    | +25.58 estimated                  |
| 36312192623  | 64.17 derived                | 54.85 estimated                     | 241.35 estimated                    | +14.38 estimated                  |

The correction trades additional estimated Linux execution for deadline
isolation; Linux fixed cost for its added job has not been separately measured.
The macOS fixed-cost increment is zero because its job count is unchanged.
The replay command is `python3 docs/evidence/u6/summarize.py`, and its output
is retained in *model.txt*. Case durations were measured concurrently and can
change with peers; corrected run 36358067906 validates completion of the new
partition, without isolating scheduling from variance or cache effects.
