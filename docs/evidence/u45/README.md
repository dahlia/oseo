Refining the placement after the greedy pass (U45)
==================================================

The placement assigns each macOS job to the lane with the smallest
projected finish at the moment it is placed, in descending cost order. It
never revisits a choice, so an assignment that looked best against the
lanes loaded at the time can leave the modeled maximum above what the same
job set admits. U45 adds a pass that lowers the maximum by moving and
exchanging single jobs afterward.

At the costs U44 committed the greedy maximum is 48.79 minutes and the pass
reaches 47.00. *docs/evidence/u44/README.md* records the search that found
the gap and two alternatives with higher greedy maxima at those costs.
Scoring each candidate by the resulting maximum over all eleven lanes
instead of by the candidate lane's own load reaches 51.39. Splitting the
macOS sanitizer suites gives a greedy maximum of 49.72 before refinement.


What the pass does
------------------

`refineLanes` sweeps two neighborhoods of the greedy placement. The move
neighborhood takes one job off a lane and puts it on another; the exchange
neighborhood swaps one job on a lane with one job on another. A candidate
is accepted when it is feasible and its `macosLaneEnds` maximum is lower,
first improvement wins, and the sweeps repeat until one full sweep accepts
nothing. With the lane configuration and placement rules fixed, the fixed
sweep order makes the result deterministic for a given set of cost tables,
and three consecutive runs of the generator produce identical output.
`mise run generate:macos-lanes --check` takes 0.40 seconds.

Every candidate is re-canonicalized and then checked, so a refined
placement satisfies the same rules the greedy pass maintains while it
builds one:

 -  own-key case shards lead the first Mac lane, all three together,
    because one measured deadline covers them;
 -  a hosted lane holding a macOS sanitizer job holds nothing else;
 -  a job no Mac lane can run stays on a hosted lane, and within a hosted
    lane those jobs precede the rest, each group ordered by descending
    hosted median;
 -  a Mac-eligible job reaches a hosted lane only when its entry rests on
    a hosted observation since `b59ac914`, that is, only when
    `measuredHostedJobs` lists it.

The same neighborhood searched without those checks reaches 46.98 minutes,
0.02 below the checked search's 47.00. These endpoints do not establish the
minimum achievable maximum with or without the invariants.

The pass runs only when a Mac lane exists. With none, the five hosted
lanes hold every job and the descending greedy order is the LPT partition
the pure-hosted fallback documents, which *tests/macos-lanes.test.ts*
asserts directly, so that partition is unchanged.


What moved
----------

| lane     | greedy | refined |
| -------- | ------ | ------- |
| hosted 1 | 41.30  | 41.30   |
| hosted 2 | 36.32  | 36.32   |
| hosted 3 | 42.45  | 42.18   |
| hosted 4 | 39.90  | 45.62   |
| hosted 5 | 42.18  | 41.25   |
| Mac 1    | 48.79  | 47.00   |
| Mac 2    | 47.51  | 45.47   |
| Mac 3    | 46.12  | 46.69   |
| Mac 4    | 47.88  | 46.98   |
| Mac 5    | 48.28  | 46.62   |
| Mac 6    | 48.26  | 46.98   |

The six Mac lanes end within 1.53 minutes of each other rather than 2.67,
and the maximum falls to a Mac lane at 47.00 with the next two at 46.98.
`native support (macos-aarch64, 11/12)` and `(12/12)` move onto hosted
lanes. Hosted lane four's modeled end rises from 39.90 to 45.62 minutes.
The three `native (macos-aarch64, k/3)` shards end up on the first Mac lane
together.


What this does not establish
----------------------------

No feasible single move or pairwise exchange lowers the 47.00-minute
result. That establishes local optimality in those two neighborhoods, not
global optimality, and says nothing about what a larger neighborhood or a
different starting placement would find.

The figures are model outputs over per-job medians, as every derived
maximum in these records is. The modeled maximum falls by 1.79 minutes;
this does not establish a 1.79-minute reduction in a run. Actual duration
also depends on which runner each job receives and how long it waits for
allocation, which the repository does not control and
*docs/evidence/u44/README.md* measures.
