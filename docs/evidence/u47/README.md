The readiness probe's first stage (U47)
=======================================

`macOS self-hosted availability` runs *tools/selfhosted-mac/availability.ts*
for about twenty seconds and decides, per Mac lane, whether that lane's
runner is usable. Every lane job reads one of its outputs in `runs-on`, so
all six lanes wait for it. It needs a GitHub-hosted Ubuntu runner to make
that decision, and until this unit it asked for one with no prerequisites,
alongside every other job in the run.

Durations and waits below are in minutes. A run figure is measured from the
creation of the run's first job to the completion of its last.


What the probe's wait measured
------------------------------

The probe's allocation wait is the interval between its creation and its
start. Peak concurrent hosted jobs counts GitHub-hosted jobs only, from
their observed start and completion times, against the account's ceiling of
40.

| run         | hosted Ubuntu jobs | peak concurrent | probe wait |
| ----------- | ------------------ | --------------- | ---------- |
| 39144030177 | 37                 | 37              | 0.02       |
| 39149674951 | 37                 | 35              | 0.03       |
| 39154284680 | 37                 | 30              | 0.03       |
| 39206357696 | 37                 | 37              | 0.03       |
| 39227927384 | 37                 | 38              | 0.05       |
| 39234170440 | 37                 | 39              | 2.43       |
| 39244971256 | 43                 | 39              | 6.97       |

The two runs that waited are the two whose observed peak reached 39. Both
quantities are measured the same way in all seven runs, and five runs at a
peak of 30 to 38 waited 0.05 or less. Seven runs do not establish the
relationship, and the account's concurrency is shared with whatever else
is running, which these observations do not cover.

Job count alone does not predict the wait: run 39234170440 waited 2.43
with the same 37 hosted Ubuntu jobs as the five runs that did not. Run
39244971256 added six jobs and waited 6.97. In that run thirty-five Ubuntu
jobs started within 0.05 and the probe started thirty-sixth, so that run
received fewer slots for its Ubuntu jobs than it had Ubuntu jobs. That is
one run's observation, not a stable allowance.

The order in which GitHub allocated the rest is not something these
observations explain and not something the workflow selects. Within one
matrix the jobs that waited were scattered rather than trailing: run
39244971256 started `native (linux-x86_64-gnu, 1/3)` at 0.03 and its
shards two and three at 7.32 and 7.48, and
`reflect cases (linux-x86_64-gnu)` shards two and three at 0.05 against
shard one at 8.97. Position in the workflow file does not predict it
either, because the probe is the twelfth of fifty-two job definitions.


What the wait costs
-------------------

No lane job can start until its runner is chosen, so the probe's
completion bounds every lane start. Holding the later allocation and
execution times fixed, each additional minute of probe waiting delays
every lane end by a minute.

| quantity                | run 39227927384 | run 39244971256 |
| ----------------------- | --------------- | --------------- |
| probe wait              | 0.05            | 6.97            |
| earliest Mac lane start | 0.42            | 7.33            |
| Mac lane work, lowest   | 43.02           | 39.43           |
| Mac lane work, highest  | 46.03           | 47.35           |
| Mac lane idle           | 0.15 to 0.30    | 0.15 to 0.30    |
| latest Mac lane end     | 46.67           | 54.83           |
| run end                 | 48.53           | 55.25           |

The 6.92 difference in probe waiting appears as a 6.91 difference in lane
starts, the two agreeing within the rounding of the underlying timestamps.
The lane-work ranges overlap and the lane idle ranges match, so the 8.16
between the two latest lane ends is that lane-start difference plus
variation in lane work. These are two runs of different revisions, so this
is an account of where run 39244971256's minutes went, not an isolated
measurement of the probe's effect.


What changes
------------

The generated workflow now makes every other job depend on the probe,
directly or transitively, which leaves the probe as the only job in the
workflow eligible for a runner when a run starts. That removes competition
from the run's own jobs; the probe can still wait for capacity another run
is using. A hosted Mac lane's head takes the prerequisite directly, the
rest of each hosted lane still chains to its predecessor, self-hosted lane
jobs already named the probe, and the native aggregate reaches it through
the shards it already requires.

The jobs that take the prerequisite directly but do not read the probe's
outputs also gain `if: ${{ !cancelled() }}`. Without it a failed probe
would skip them, turning one failed twenty-second job into a run that
tested nothing. The native aggregate keeps its own `if: ${{ always() }}`.
With no Mac lane configured the generator emits no probe job and adds no
prerequisite, which *tests/macos-lanes.test.ts* checks along with the lane
chaining.

The cost is that every other job starts after the probe finishes. In the
five runs above whose probe did not wait it completed 0.32 to 0.40 into
the run, so that is what the change spends when a run's probe would not
have waited.


What the branch run measured
----------------------------

Branch run 39292194312 at `5c780ffb` finished green, its last job
completing 55.92 minutes after the first was created. The probe's exposure
is gone and the change cost what it was expected to cost:

| quantity                | run 39227927384 | run 39244971256 | run 39292194312 |
| ----------------------- | --------------- | --------------- | --------------- |
| probe wait              | 0.05            | 6.97            | 0.05            |
| probe completion        | 0.38            | 7.28            | 0.43            |
| earliest Mac lane start | 0.42            | 7.33            | 0.48            |
| Mac lane work, lowest   | 43.02           | 39.43           | 39.72           |
| Mac lane work, highest  | 46.03           | 47.35           | 46.13           |
| latest Mac lane end     | 46.67           | 54.83           | 46.75           |

All six lanes started at 0.48 against the 0.42 to 0.43 of run
39227927384, so in a run whose probe would not have waited the
prerequisite cost 0.06. One run does not establish that it costs this
little in general, and no run since has saturated the ceiling, which is
the case the change exists for.

The run did not get shorter, because the queueing moved rather than
disappearing. Its Linux side ended at 55.42 on
`native support (linux-x86_64-gnu, 5/7)`, which waited 8.57 minutes and
then ran 46.42:

| job                                      | wait | duration | end   |
| ---------------------------------------- | ---- | -------- | ----- |
| `native support (linux-x86_64-gnu, 5/7)` | 8.57 | 46.42    | 55.42 |
| `native support (linux-x86_64-gnu, 2/7)` | 9.10 | 44.25    | 53.78 |
| `native support (linux-x86_64-gnu, 3/7)` | 3.28 | 42.98    | 46.70 |
| `native support (linux-x86_64-gnu, 6/7)` | 0.03 | 47.90    | 48.37 |

Thirty-four of the run's forty Ubuntu jobs started by 0.48 and five
waited, two of them these long shards; summed Ubuntu allocation waiting
was 26.6 job-minutes, between the 5.1 of run 39227927384 and the 59.6 of
run 39244971256. A wait on a long job is added to the Linux side, while
the same wait on a short job is absorbed, so which jobs lose the
allocation decides the side. *docs/evidence/u48/README.md* takes up the
job count that produces those losers.

The macOS side of this run was not a Mac lane. Its hosted lanes ended at
41.93, 44.48, 48.13, 49.42 and 51.57, and the last of those carried 50.80
minutes of work against 0.33 of waiting, so removing its waiting entirely
would leave it near 51.2. *docs/evidence/u49/README.md* takes that up.


What this does not address
--------------------------

The ceiling itself is unchanged, so the jobs that do not gate the Mac
lanes still queue when hosted demand exceeds the slots a run receives. Run
39244971256 measured 59.6 job-minutes of Ubuntu allocation waiting over 43
jobs, seven of them above two minutes, against 5.1 over 37 jobs in run
39227927384. Reverting U46's `globalThis cases` jobs returns the count to
40, still above the thirty-five Ubuntu jobs that run observed starting at
once.

Whether a run gains anything depends on whether its probe would have
waited, which is not known in advance; five of these seven runs would have
paid the probe's duration for nothing. One later run cannot separate the
change from variation in either side's work.

Nothing here makes the probe unnecessary. A Mac lane's runner has to be
chosen before its first job starts, and that decision needs a runner of
its own.
