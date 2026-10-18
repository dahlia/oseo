Untested hosted entries (U43)
=============================

U42 landed and its branch run took 57.27 minutes, the first run under
58.67 since the Mac lanes were balanced. The latest-finishing job was on a
hosted macOS lane: `native support (macos-aarch64, 11/12)` ran 29.88
minutes against a 21.88-minute model, and its lane finished 56.92 minutes
after the run began. For the third run running, that latest-finishing
Mac-eligible job was one the placement had just sent to a hosted lane
against an entry no run since `b59ac914` had tested.

The hosted-duration observations below come from the nine main and branch
runs since `b59ac914`, the runs whose macOS shard contents match the
tree:
39076279469, 39080313970, 39084043803, 39104204370, 39108338578,
39112383050, 39121592150, 39126360392, and 39132976769.


What the last three runs measured
---------------------------------

| run         | job sent hosted                         | entry (s) | duration (s) | duration / entry |
| ----------- | --------------------------------------- | --------- | ------------ | ---------------- |
| 39121592150 | `test262 (macos-aarch64, 1/12)`         | 1,288     | 1,932        | 1.50             |
| 39126360392 | `native support (macos-aarch64, 10/12)` | 1,432     | 1,900        | 1.33             |
| 39132976769 | `native support (macos-aarch64, 11/12)` | 1,313     | 1,793        | 1.37             |
| 39132976769 | `native (macos-aarch64, 3/3)`           | 1,014     | 1,254        | 1.24             |

Run 39132976769 also hosted `native support (macos-aarch64, 9/12)`, whose
1,421-second entry rested on one observation from run 39121592150. It ran
1,475 seconds, 4 percent above its entry, while the two untested entries in
the same run ran 24 and 37 percent above theirs.


First observations and placement decisions
------------------------------------------

The first reading of this was that entries predating the repartition are
systematically low, and the U42 record rejected that on the five such
entries the window had observed, whose ratios had a median of 0.99. Neither
the reading nor the rejection used a sample that can test the question. U41
and U42 recalculated those entries from observations in this window, so
comparing the same observations with the resulting medians is an in-sample
check, not a test of the entries that preceded them.

A comparison that avoids that reuse is a job's first observation in the
window against an entry that predates it. Eight exist: 0.81, 0.93, 0.99,
1.07, 1.24, 1.33, 1.37, and 1.50 times the entry, a mean of 1.16, five of
the eight above 1. This small and selected sample does not establish
whether such entries systematically understate a hosted duration.

What it does show is where the large ratios sit. The four largest belong to
the four jobs the placement had just chosen to host. That is consistent
with a placement that gives each job the lane whose projected finish is
earliest selecting, among uncertain hosted costs, the estimates that come
out smallest. These observations do not isolate that effect from
differences between the jobs or from which lanes were free, and better
entries would reduce it. The allowance below is a precaution against the
possibility, not a correction of a measured bias.


What the placement now charges
------------------------------

Run 39132976769 added the first window observation for
`native support (macos-aarch64, 11/12)` and `native (macos-aarch64, 3/3)` and a
second for `native support (macos-aarch64, 9/12)`, so three entries move: 1,313
to 1,793, 1,014 to 1,254, and 1,421 to 1,448. Sixteen of the 33 Mac-eligible
jobs now have an entry a run since `b59ac914` has tested, and
`measuredHostedJobs` lists them. The list names the tested jobs rather than the
untested ones so that a newly added shard defaults to untested.

When the placement projects a finish for a Mac-eligible job on a hosted
lane, it multiplies that job's hosted median by
`hostedUnmeasuredAllowance` unless the job is on that list. The factor is
1.5, the largest ratio in those eight observations. It is a scenario
multiplier, not an expected duration and not a bound on a future one.

What it prices is that the two errors cost differently. At the tabulated
costs, the allowance raises the modeled maximum from 49.95 to 50.78
minutes. Without it the placement hosts `test262 (macos-aarch64, 9/12)`
against an untested 1,456-second entry, on a lane whose other job brings it
to 42.62 modeled minutes; charging that job 1.50 times its entry adds 12.13
minutes to the lane and raises the maximum to 54.75. The allowance hosts
`native support (macos-aarch64, 9/12)` instead, tested over two
observations, and the maximum stays 50.78 under the same assumption, 3.97
minutes lower. This is the same shape of trade as the sanitizer lane
reservation.

Every factor tested between 1.2 and 1.8, namely 1.2, 1.4, 1.5, and 1.8,
produced the same partition. What the result rests on is the ordering
between an untested entry and the tested alternatives, which 1.2 already
establishes.

The allowance is applied in the placement projection and nowhere else.
`macosLaneEnds` continues to sum the unadjusted hosted entries, so the
derived maximum stays a model output over per-job medians rather than a
risk-adjusted one; it is not an estimate of a median run duration, and it
omits queueing and start offsets. A test asserts that each hosted lane end
equals the sum of its members' entries.


What this does not address
--------------------------

The placement change does not address shared concurrency limits or Linux
completion times. The account is on GitHub Pro, which allows 40 concurrent
jobs and 5 concurrent macOS jobs across every repository it owns, and run
39126360392 accumulated 37.7 job-minutes of hosted macOS queueing while
another repository occupied two of those five slots. In run 39132976769 the
latest Linux job finished 52.92 minutes after the run began, against 46.27
in the main run before it, and the Linux jobs accumulated 43.9 job-minutes
of queueing. Neither figure is an elapsed delay: the waits overlap.
