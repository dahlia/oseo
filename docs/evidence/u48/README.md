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

The rows total the forty above. The `native` family's four jobs are its
three shards and the aggregate that collects them, and the readiness probe
is the last row, so both are counted.

The `native support` family determines Linux completion, and this change
keeps its seven shards: they are the partition U46 measured, and fewer of
them would lengthen the longest. The six case-shard jobs exist to take two
files out of the file shards, which U38 and U6 measured, so consolidating
them restores what they removed. That leaves the two families whose
longest job is far below the Linux finish.


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
factor of two between runs, so a shard can land well above its mean. At
their estimated means both families stay below the `native support` shards
that determine Linux completion. At twice the estimates, 62.2 and 40.8,
the Node.js suite still does but test262 would become the longest Linux
family, and 62.2 is still inside its 120-minute timeout.

The hosted Ubuntu job count falls from 40 to 35. Had the same thirty-four
slots been available to this run, 35 jobs would have left only the
aggregate queueing, and it waits for its shards anyway. One run's
thirty-four is not a slot allowance: nothing publishes how many a run
receives, and other runs on the account share the ceiling. Removing five
jobs reduces how many can be made to wait, not how many will be.


What this does not address
--------------------------

The ceiling is unchanged and the account shares it, so a run that overlaps
another can still queue whatever it has. Nothing here reduces the Linux
work itself: the seven `native support` shards still carry the 284.1
minutes of job time measured here, and excluding allocation waiting they
ended the Linux side at 48.37 in this run.

Reducing the test262 total reverses part of U6's choice for Linux only.
U6 raised both targets from ten to twelve as insurance against the
120-minute timeout at 41,091 reviewed paths, estimating from macOS
figures; its Linux ten-shard maxima were 25.40 and 24.97 minutes from
observed job timestamps. Eight Linux shards at 31.1 estimated minutes
leave margin against that timeout at the current corpus, and the
projection above is this record's, not U6's. If the Linux shards approach
the timeout as the corpus grows, the total has to rise again, and at that
point the slot count is what has to give.


What the branch run measured
----------------------------

Run 39351734495 at `57e0d6da` carried U48 and U49 together and ended at
49.77 minutes. Its 35 hosted Ubuntu jobs waited 2.5 job-minutes in total
against run 39292194312's 26.6, the longest single wait was 1.35 minutes
against 9.10, and 33 of the 35 started within 0.5 minutes. The Linux side
ended at 48.00 on the `native` aggregate, against 55.92; the longest Linux
job, `native support (linux-x86_64-gnu, 5/7)`, waited 0.03 minutes and ran
46.88. In this run the hosted macOS side finished last, at 49.77.

The estimates held. The eight Linux test262 shards measured a mean of 30.1
minutes against the estimated 31.1 and a longest of 35.87 against the
120-minute timeout. The two Linux Node.js shards measured 20.28 and 15.70
against the estimated 20.4.

What this run does not establish is the waiting a later run receives.
Across the preceding eighteen runs summed Ubuntu waiting ranged from 1.2
to 88.1 job-minutes and the Linux side from 48.53 to 66.25 minutes, and
the two ranges do not pair: run 39126360392 ended its Linux side at 66.25
with 1.2 job-minutes of waiting, which the per-job runner speed factor
accounts for and this change does not touch. What the change does is put
the job count below the 33 that started together here, leaving fewer jobs
that can be made to wait. Whether that lowers waiting across runs needs
more runs.
