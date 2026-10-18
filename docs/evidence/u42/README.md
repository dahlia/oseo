Mac lane contention refresh (U42)
=================================

U41 balanced the six Mac lanes and the branch run that followed took
66.25 minutes, against 58.67 for the main run before it. The Mac lanes
had indeed converged, but the run ended on a hosted lane, and the
heaviest Mac lane still overran its derived end by 9.81 minutes. This
records what determined that run, why the observations support revising
the pair slowdown table, and what the refit does to the derived
partition.

Every figure below comes from the eight main and branch runs since
`b59ac914`, the runs whose macOS shard contents match the tree:
39076279469, 39080313970, 39084043803, 39104204370, 39108338578,
39112383050, 39121592150, and 39126360392.


What the second U41 run measured
--------------------------------

Run 39126360392 passed in 66.25 minutes. Hosted lane four was the last
lane to finish, 65.82 minutes after the run began, holding 49.89 minutes
of work, 15.80 minutes of waiting between jobs, and a 0.13-minute offset
before its first job: `test (macos-latest, node, 2/4)` for 16.47
minutes, a 15.20-minute wait for a runner, `test (macos-latest, deno)`
for 1.75, a 0.60-minute gap, and then
`native support (macos-aarch64, 10/12)` for 31.67 minutes against a
1,432-second entry.

That wait was the largest hosted macOS allocation wait in the eight runs.
Over all 90 hosted macOS jobs in them the wait has a median of 0.15
minutes, a p90 of 5.22, and a maximum of 15.20, and the per-run sum
ranges from 2.4 to 37.7 minutes. Run 39126360392 is the 37.7, and run
39112383050, the 58.67-minute main run it is measured against, is the
2.4. Every job in a hosted chain can incur an allocation wait, so the
difference between the two runs reflects both job durations and
allocation waits.

On the Mac side the six lanes ended 42.67, 46.48, 48.73, 48.88, 49.68,
and 57.98 minutes in, against derived ends of 43.34, 44.28, 45.42, 44.73,
46.69, and 48.17. The outlier is `oseo-mac-6`, whose six jobs took 57.30
minutes of measured work. Deconvolving each job's wall against the
modeled pair slowdown of whatever shared its machine leaves 50.55
minutes of one-lane work on that lane, against the 41.03 its entries
sum to. By machine, the run's 248.9 deconvolved minutes split 76.5,
81.7, and 90.7, putting the third Mac mini 9 percent above the
three-machine mean under the U41 factors.

The longest Linux job, `test (ubuntu-latest, node)`, finished at 49.33
minutes, within the 44.12 to 49.33 of the preceding seven runs.


The pair slowdowns understate contention
----------------------------------------

Two comparisons support revising `selfHostedPairSlowdowns` while holding
`selfHostedJobSeconds` fixed. Sorting every Mac-lane observation by how
much of its wall had a busy partner lane:

 -  The 12 observations whose partner lane was idle for over three
    quarters of the wall measured 0.81 to 1.06 of their U41 entry, median
    0.94. The one-lane table is close to right where little competes with
    it.
 -  Among the observations whose partner lane was busy for over nine
    tenths of the wall, the per-run median ratio of wall to U41 entry
    ran, in chronological order, 1.12, 1.11, 1.13, 1.23, 1.33, 1.34,
    1.30, and 1.31. The excess over the modeled factors grew as the
    placement filled the lanes, and the last four runs range from 1.30 to
    1.34.

The direction is visible in the lane model's error too. Simulating each
run's measured lane order with the U41 tables and comparing against the
gap-free sum of its measured job walls, the model over-predicted the
first three runs by 2.32 to 3.50 minutes per lane and under-predicted the
last four by 3.23 to 4.19. That sign change is consistent with slowdown
factors that understate contention in denser placements.

Deconvolution alone cannot resolve this, because it divides by the very
factors in question. Only 5 to 6 percent of Mac lane time in these runs
has an idle partner, so the data constrain the product of work and
slowdown far better than either alone. A joint fit that let both float
reproduced that: it cut the test262 entries by 20 to 38 percent and
raised test262 beside test262 to 1.82. The five nearly uncontended
test262 walls measure a median 1.13 of the entries that fit produced,
against 0.99 of the entries kept here, so it does not establish that its
lower entries state one-lane work.


The refit
---------

The refit therefore holds the one-lane table fixed and solves only for
the factors. Each of the 238 Mac-lane observations states that its wall,
split by which family occupied the other lane, must divide back to the
job's one-lane value; a regularized least-squares fit over those
equations gives the factors. Eight pairings have at least 0.78 hours of
contended time behind them and take a fitted value:

| pairing                                  | U25  | U42  | contended hours |
| ---------------------------------------- | ---- | ---- | --------------- |
| `native support` beside `native support` | 1.13 | 1.20 | 7.22            |
| `test262` beside `test262`               | 1.26 | 1.37 | 5.46            |
| `native support` beside `test262`        | 1.37 | 1.39 | 4.89            |
| `test262` beside `native support`        | 1.08 | 1.23 | 4.89            |
| `native` beside `test262`                | 1.41 | 1.45 | 1.53            |
| `own-key cases` beside `native support`  | 1.27 | 1.34 | 1.19            |
| `native` beside `native support`         | 1.04 | 1.18 | 0.86            |
| `reflect cases` beside `test262`         | 1.45 | 1.54 | 0.78            |

The rest keep their U25 values. The fit had under 48 minutes of
contended time for each of them and drove several below the model's
minimum of 1.00.

Every pairing that moved, moved up, and the four with the most evidence
are the ones a balanced Mac placement creates in quantity. U25 derived
its values over SSH from partners that overlapped for part of their
walls, taking the largest overlapped factor of each pairing as a
pessimistic stand-in. Most CI observations have a busy partner for over
nine tenths of their wall, and that stand-in turns out to be optimistic
for them.

Raising the factors makes the normalization that produced
`selfHostedJobSeconds` wrong, so every entry is recomputed under them.
The table moves a median 0.97 of its U41 values, from 0.81 to 1.16. The
12 nearly uncontended observations are a consistency check rather than a
held-out sample, since they are among the 238 and contribute to their
jobs' medians, but they carry almost no information about a factor: they
measure a median 0.99 of their new entry, against 0.94 of the U41
entry.

Together the two tables cut the lane model's error. Against the same
gap-free measured work spans, mean absolute error per lane falls from
3.09 to 2.76 minutes, the bias from 0.84 minutes low to 0.25 high, and
the worst lane from 10.57 to 8.04. Across the five most recent runs the
per-run mean absolute error ranges from 0.53 to 3.24 minutes after the
refresh, against 0.47 to 4.19 before it; the three sparse runs before
them get worse. The remaining 2.76-minute mean error is still large next
to the 0.92 minutes the sanitizer reservation costs, and these
comparisons do not separate run-to-run variation from the model error
that is left. They are also measured on the runs the factors were fit
on.


What the refresh does to the partition
--------------------------------------

The derived maximum rises from 48.17 to 50.47 minutes. No work was added:
the same 33 jobs now cost what contention makes them cost. The derived
lane ends are 41.30, 36.32, 43.73, 42.03, and 47.48 minutes hosted, and
50.47, 45.98, 47.68, 45.41, 49.12, and 47.60 on the Macs.

The new numbers also size the Mac side against its hardware. The 33 jobs
carry 242.62 minutes of one-lane work. Applying the 1.31 contended ratio
that run 39126360392 measured as a uniform factor over six lanes gives
an illustrative 53.0 minutes, so a placement that kept all of it on the
Macs would not finish much sooner. Moving 22.37 minutes of one-lane work
to hosted lanes leaves 73.42 minutes per machine, or 48.1 at that ratio.
The derived 50.47 sits above that because the machine holding
`oseo-mac-1` carries 78.22 minutes of one-lane work against 71.35 and
70.68 on the other two: the three own-key shards are pinned to one lane,
and the placement balances lane finishes rather than machine load.

Reserving a hosted lane for each macOS sanitizer job now raises the
derived maximum from 49.55 to 50.47 minutes, where under U41 it cost
0.06. Substituting the property job's measured p90 of 2,680 seconds
gives 50.47 with the reservation and 56.17 without, a modeled saving of
5.70. Over 27 observations each, that job measured 1,559 to 3,146 seconds
and the native job 2,034 to 2,765, so the property job alone carries the
spread the reservation is priced against.


Refreshed hosted medians
------------------------

Run 39126360392 added the first window observation for two
`macos-aarch64` jobs and a second for a third, so their entries become
the median of what the window holds: `native support (macos-aarch64, 10/12)`
1,432 to 1,900 over one observation, `native support (macos-aarch64, 12/12)`
1,294 to 1,044 over one, and `reflect cases (macos-aarch64, 1/3)` 777 to 690
over two.

The 1,900 is the second time a job the placement newly sent hosted ran
well past its entry, after `test262 (macos-aarch64, 1/12)` ran 1,932
against 1,288 in run 39121592150. Both entries were retained values with
no observation in the window, which invites raising every retained entry
to its inverse conversion from measured Mac seconds. Among the five jobs
whose pre-U41 entry was retained and that the window has since observed,
the ratio of observation to entry was 0.81, 0.96, 0.99, 1.33, and 1.50, a
median of 0.99. That sample is too small to support raising them all, and
it does not rule out an individual entry being low.

Two of the three Mac-eligible jobs this placement sends hosted still have
no hosted observation in the window: `native support (macos-aarch64, 11/12)`,
whose 1,313-second entry converts to 1,614, and `native (macos-aarch64, 3/3)`,
whose 1,014 converts to 1,161. Both sit closer to their conversion than the
1,288 that became 1,932, but their hosted walls are unobserved here, so
their effect on a hosted lane's finish is uncertain.
