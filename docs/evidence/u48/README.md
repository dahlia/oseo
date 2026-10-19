Fitting the Ubuntu jobs to the slots (U48)
==========================================

A run's GitHub-hosted jobs compete for the account's ceiling of 40
concurrent jobs. Run 39292194312 had 40 hosted Ubuntu jobs, thirty-four of
which started within 0.48 minutes; five of the rest waited, and the sixth
is the native aggregate, which waits for its shards either way. Two of the
five were `native support (linux-x86_64-gnu, 5/7)` and `2/7`, the longest
Linux jobs after shard six, so their 8.57 and 9.10 minutes of waiting were
added to the Linux side and ended it at 55.42 rather than the 48.37 that
shard six's own 47.90 minutes of work would have.

U47 removed the readiness probe from that competition by making it the
run's first stage. It did not reduce the competition among the rest, and
nothing in the workflow selects which of them waits.

Durations below are in minutes, measured in run 39292194312.


What the run's Ubuntu jobs cost
-------------------------------

| family                              | jobs | sum   | longest | mean  |
| ----------------------------------- | ---- | ----- | ------- | ----- |
| `test262 (linux-x86_64-gnu)`        | 12   | 249.2 | 27.27   | 20.76 |
| `native support (linux-x86_64-gnu)` | 7    | 284.1 | 47.90   | 40.59 |
| `host C sanitizers (Linux)`         | 5    | 87.9  | 25.25   | 17.58 |
| `test (ubuntu-latest)`              | 4    | 41.7  | 16.12   | 10.43 |
| `native (linux-x86_64-gnu)`         | 4    | 46.1  | 17.45   | 11.53 |
| `own-key cases (linux-x86_64-gnu)`  | 3    | 27.5  | 9.97    | 9.17  |
| `reflect cases (linux-x86_64-gnu)`  | 3    | 23.6  | 9.37    | 7.88  |
| `check`                             | 1    | 2.3   | 2.33    | 2.33  |
| `macOS self-hosted availability`    | 1    | 0.4   | 0.38    | 0.38  |

The `native support` family sets the side and cannot give up jobs: its
seven shards are the partition U46 measured, and fewer of them would
lengthen each. The six case-shard jobs exist to take two files out of the
file shards, which U38 and U6 measured, so consolidating them restores
what they removed. That leaves the two families whose longest job is far
below the side.


What changes
------------

Linux test262 goes from twelve shards to eight, and the Linux Node.js
suite from three to two. Both are per-entry matrix totals, so macOS is
unaffected and keeps its twelve test262 shards, which U6 chose for margin
against the 120-minute job timeout as the reviewed corpus grows.

| family                       | before             | after, estimated  |
| ---------------------------- | ------------------ | ----------------- |
| `test262 (linux-x86_64-gnu)` | 12 jobs, max 27.27 | 8 jobs, mean 31.1 |
| `test (ubuntu-latest, node)` | 3 jobs, max 16.12  | 2 jobs, mean 20.4 |

The estimates divide this run's measured work across the new totals,
holding its runner speeds fixed. They are conditional estimates, not
predictions: an individual Linux job's duration varies by close to a
factor of two between runs, so a shard can land well above its mean. Even
at twice the estimate, 62.2 and 40.8, test262 stays inside its 120-minute
timeout, and both families stay below the `native support` shards that set
the side.

The hosted Ubuntu job count falls from 40 to 35. Thirty-four started at
once in run 39292194312, so this leaves the aggregate, which waits anyway,
as the only job the count expects to queue. That one observation is not a
stable slot allowance, and other runs on the account share the ceiling.


What this does not address
--------------------------

The ceiling is unchanged and the account shares it, so a run that overlaps
another can still queue whatever it has. Nothing here reduces the Linux
work itself: the seven `native support` shards still carry 284.1 minutes of job
time and still end the Linux side near 48 when none of them waits.

Reducing the test262 total reverses part of U6's choice for Linux only.
U6 raised both targets from ten to twelve as insurance against the
120-minute timeout at 41,091 reviewed paths, estimating from macOS
figures; its Linux ten-shard maxima were 25.40 and 24.97 minutes from
observed job timestamps. Eight Linux shards at 31.1 estimated minutes
leave margin against that timeout at the current corpus, and the
projection above is this record's, not U6's. If the Linux shards approach
the timeout as the corpus grows, the total has to rise again, and at that
point the slot count is what has to give.
