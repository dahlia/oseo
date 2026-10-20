/**
 * Each entry is the median, rounded to whole seconds, of the job's measured
 * hosted `macos-15` or `macos-latest` walls (`started_at` to
 * `completed_at`). The lane generator sorts hosted jobs by these weights
 * before assignment, and `modeledJobSeconds` converts a weight to a Mac
 * estimate for any job without a measured Mac wall.
 *
 * The table has four vintages, which a reader must not mix up:
 *
 *  -  Fourteen entries were refreshed from nine run attempts that
 *     observed the job on a hosted runner: main runs 38734773531,
 *     38724558390, 38707734330, 38688027859, 38681888021, 38606086453,
 *     38593093817 and 38574256610, and attempt 2 of branch run
 *     38551733723. A trailing count below nine gives the number of
 *     hosted observations, and an even count uses the mean of the two middle
 *     ones. Run 38724558390 then measured the refreshed entries at 0.79
 *     to 1.11 times their value and the retained ones at 0.95 to 1.86,
 *     which is why the two vintages must not be read as equivalent.
 *     Single-observation entries remain the least trustworthy: a job
 *     that normally runs on a Mac lane was placed hosted once.
 *  -  Ten entries were refreshed again by U40 from the hosted
 *     observations of twenty-two run attempts between 2026-10-14 and
 *     2026-10-18; see *docs/evidence/u40/README.md*. Seven belong to the
 *     families no Mac lane runs, so every attempt observed them and their
 *     counts are eighteen or twenty-two. The other three are the
 *     `macos-aarch64` jobs that placement sends hosted in every run, and
 *     their comment names a revision: the macOS file shards changed
 *     contents at `c78d9df1` and again at `b59ac914`, so only the three
 *     attempts from `b59ac914` onward measure the partition now in the
 *     tree, and a longer window would average two partitions. Nine of the
 *     ten moved by under eleven percent. The exception,
 *     `native support (macos-aarch64, 8/12)`, moved from 1,499 to 1,963
 *     because 1,499 was one observation of a partition that no longer
 *     exists.
 *  -  Thirteen entries are marked `retained`. Four Mac lanes carry them
 *     in every run, so none of the nine attempts observed them hosted and
 *     their hosted median cannot be refreshed from CI as it stands. They
 *     keep the median of the earlier seven attempts: all-hosted runs
 *     37121778924 and 37167895777, branch run 37194069657 attempts 1 and
 *     2, main run 37206614757, and branch run 37215661294 attempts 1
 *     and 2.
 *
 *  -  Three entries are marked `derived`, the `reflect cases` shards that
 *     U38 introduced. CI has never run them, so they have no hosted
 *     observation at all, and these are estimates rather than medians.
 *     U38 measured their Mac walls at 179.7, 179.4 and 180.0 seconds, and
 *     the estimate applies the own-key family's ratio, 2.3, which is the
 *     only one measured for this job shape: one property file, one case
 *     shard, the extended wrapper, a dedicated runner. A proportional
 *     route, scaling the own-key hosted medians by the ratio of the two
 *     files' Mac walls, gives 383 instead, so 336 is the lower of the two
 *     and places the job on a Mac lane a little more readily than a true
 *     median might. Two bases were rejected. Hosted Linux walls do not
 *     convert: the 1,754 seconds that run 39025004305 measured for this
 *     file shared one runner with three other files, so they are not a
 *     dedicated job's time, and own-key measures a Mac lane at 1.14 times
 *     hosted Linux against 3.25 for that figure. The U6 weight table does
 *     not either, because it overstates the two files by a derived 1.31
 *     against 2.50. The first run that places one of these hosted
 *     replaces the estimate.
 *
 * The refreshed entries rose against their retained neighbours, so the
 * table is likely to understate the retained ones and to place them on a
 * Mac lane more readily than it should. Dedicated all-hosted runs are not
 * needed to close that gap: raising an entry moves its job between the
 * hosted and Mac lanes, and each run that places one hosted yields the
 * observation that corrects it, which is how five retained entries were
 * refreshed here. The earlier basis replaced main-run 36516215200 walls
 * and derived
 * own-key and native-support planning weights, several of which lay below
 * every later observation of their job.
 */
interface MacosJobCosts {
  readonly [name: string]: number;
}

/** Measured hosted medians used only for lane assignment. */
export const macosJobCosts: MacosJobCosts = {
  "host C sanitizers (macOS, property)": 2452, // 18
  "host C sanitizers (macOS, native)": 2337, // 18
  "test262 (macos-aarch64, 12/12)": 2212, // 1
  "native support (macos-aarch64, 5/12)": 2063, // 1 hosted since b59ac914
  "test262 (macos-aarch64, 2/12)": 2054, // 4
  "test262 (macos-aarch64, 11/12)": 1976, // 2
  "native support (macos-aarch64, 8/12)": 1963, // 3 hosted since b59ac914
  "test262 (macos-aarch64, 7/12)": 1941, // 1
  "native support (macos-aarch64, 1/12)": 1940, // retained
  "test262 (macos-aarch64, 1/12)": 1932, // 1 hosted since b59ac914
  "native support (macos-aarch64, 2/12)": 1924, // 2
  "test262 (macos-aarch64, 3/12)": 1906, // 1
  "native support (macos-aarch64, 10/12)": 1900, // 1 hosted since b59ac914
  "test262 (macos-aarch64, 5/12)": 1665, // 7
  "test262 (macos-aarch64, 10/12)": 1644, // 1
  "native support (macos-aarch64, 4/12)": 1630, // 3
  "test262 (macos-aarch64, 4/12)": 1599, // 3
  "native support (macos-aarch64, 6/12)": 1575, // 4
  "native support (macos-aarch64, 7/12)": 1553, // 3 hosted since b59ac914
  "test262 (macos-aarch64, 8/12)": 1543, // 3 hosted since b59ac914
  "native support (macos-aarch64, 11/12)": 1514, // 5 hosted since b59ac914
  "native support (macos-aarch64, 9/12)": 1475, // 3 hosted since b59ac914
  "test262 (macos-aarch64, 6/12)": 1459, // 1
  "test262 (macos-aarch64, 9/12)": 1456, // retained
  "native support (macos-aarch64, 12/12)": 1397, // 5 hosted since b59ac914
  "test (macos-latest, node, 3/4)": 1311, // 18
  "native support (macos-aarch64, 3/12)": 1293, // 5 hosted since b59ac914
  "native (macos-aarch64, 1/3)": 1236, // 6 hosted since b59ac914
  "native (macos-aarch64, 2/3)": 1162, // 3 hosted since b59ac914
  "native (macos-aarch64, 3/3)": 1160, // 2 hosted since b59ac914
  "test (macos-latest, node, 2/4)": 996, // 18
  "own-key cases (macos-aarch64, 2/3)": 995, // retained
  "test (macos-latest, node, 1/4)": 884, // 18
  "test (macos-latest, node, 4/4)": 864, // 18
  "own-key cases (macos-aarch64, 3/3)": 854, // retained
  "own-key cases (macos-aarch64, 1/3)": 810, // retained
  "reflect cases (macos-aarch64, 1/3)": 690, // 2 hosted since b59ac914
  "reflect cases (macos-aarch64, 3/3)": 685, // 6 hosted since b59ac914
  "reflect cases (macos-aarch64, 2/3)": 643, // 3 hosted since b59ac914
  "test (macos-latest, deno)": 105, // 22
};

/**
 * The Mac-lane eligible jobs whose `macosJobCosts` entry rests on a hosted
 * observation from a run since `b59ac914`, the repartition that last
 * changed macOS shard contents. A job absent from this list has an entry
 * of an older vintage, or none of its own, so its hosted cost is an
 * estimate the current tree has never tested.
 *
 * The distinction exists because the placement minimizes a projected lane
 * finish, so among uncertain hosted costs it may select the estimates that
 * come out smallest; `hostedUnmeasuredAllowance` prices that possibility.
 * Listing the tested jobs rather than the untested ones makes a newly
 * added shard default to untested.
 */
export const measuredHostedJobs: readonly string[] = [
  "native (macos-aarch64, 1/3)",
  "native (macos-aarch64, 2/3)",
  "native (macos-aarch64, 3/3)",
  "native support (macos-aarch64, 10/12)",
  "native support (macos-aarch64, 11/12)",
  "native support (macos-aarch64, 12/12)",
  "native support (macos-aarch64, 3/12)",
  "native support (macos-aarch64, 5/12)",
  "native support (macos-aarch64, 7/12)",
  "native support (macos-aarch64, 8/12)",
  "native support (macos-aarch64, 9/12)",
  "reflect cases (macos-aarch64, 1/3)",
  "reflect cases (macos-aarch64, 2/3)",
  "reflect cases (macos-aarch64, 3/3)",
  "test262 (macos-aarch64, 1/12)",
  "test262 (macos-aarch64, 8/12)",
];

/**
 * Factor the placement applies to the hosted cost of a Mac-lane eligible
 * job outside `measuredHostedJobs` when it projects a finish on a hosted
 * lane. It is a scenario multiplier, not an expected wall and not a bound
 * on a future one, and it reaches no reported cost: `macosLaneEnds` still
 * sums unadjusted entries.
 *
 * Nine runs since `b59ac914` observed eight such jobs hosted for the
 * first time, against entries that predate the window. Their walls were
 * 0.81, 0.93, 0.99, 1.07, 1.24, 1.33, 1.37, and 1.50 times the entry, a
 * mean of 1.16 with five of the eight above 1. That sample is too small
 * and too selected to establish whether these entries systematically
 * understate; what it shows is that the four largest ratios belong to the
 * four jobs the placement had just chosen to host.
 *
 * The value is the largest of those ratios, because the two errors cost
 * differently. An entry that understates puts the job at the end of a
 * hosted chain, and in three consecutive runs such a job ran 8 to 11
 * minutes past its projection. Charging too much instead moves the job to
 * one Mac lane, or leaves the hosted slot to a tested job; here it raises
 * the derived maximum by 0.83 minutes. See *docs/evidence/u43/README.md*.
 */
export const hostedUnmeasuredAllowance = 1.5;

/**
 * Estimated one-lane Mac seconds for every current Mac-lane job, rounded
 * to whole seconds. The generator models such a job by this value instead
 * of converting its hosted weight, because the derived ratio between the
 * two varies inside a single family: from 2.23 to 5.22 across the twelve
 * `native support` shards and 3.78 to 5.36 across the twelve test262
 * shards.
 *
 * Each entry is the median of five to eight observations from the eight
 * runs since `b59ac914`, the runs whose macOS shard contents match the
 * tree. Each observation is normalized by removing the modeled pair
 * slowdown of whatever ran on the other lane of the same machine, which
 * inverts what `selfHostedLaneEnds` computes. The value therefore states
 * one-lane work, and the generator applies `selfHostedPairSlowdowns` on
 * top of it during placement.
 *
 * Because the normalization divides by those factors, the table and
 * `selfHostedPairSlowdowns` have to be derived together. U42 raised the
 * factors and recomputed every entry under them, which moved the table a
 * median 0.97 of its U41 values. The twelve observations whose partner
 * lane was idle for over three quarters of the wall are the independent
 * check: they measure a median 0.99 of their entry here, against 0.94 of
 * the U41 entry.
 *
 * The trailing comment gives the observation count; a count below eight
 * means the placement sent the job to a hosted lane in some of those runs.
 * Changes to shard contents or hardware require revalidating the affected
 * estimates. U41 replaced the whole table and
 * *docs/evidence/u41/README.md* records what the 18 entries before it were
 * measuring and how far off they were.
 */
interface SelfHostedJobSeconds {
  readonly [name: string]: number;
}

export const selfHostedJobSeconds: SelfHostedJobSeconds = {
  "native support (macos-aarch64, 1/12)": 878, // 8
  "native support (macos-aarch64, 2/12)": 678, // 8
  "native support (macos-aarch64, 8/12)": 622, // 5
  "native support (macos-aarch64, 5/12)": 540, // 7
  "native support (macos-aarch64, 11/12)": 517, // 8
  "test262 (macos-aarch64, 12/12)": 506, // 8
  "native support (macos-aarch64, 10/12)": 504, // 7
  "native support (macos-aarch64, 7/12)": 502, // 5
  "native support (macos-aarch64, 12/12)": 501, // 7
  "test262 (macos-aarch64, 2/12)": 492, // 8
  "native support (macos-aarch64, 3/12)": 487, // 6
  "test262 (macos-aarch64, 11/12)": 484, // 8
  "test262 (macos-aarch64, 7/12)": 482, // 8
  "native support (macos-aarch64, 6/12)": 473, // 8
  "test262 (macos-aarch64, 8/12)": 451, // 5
  "test262 (macos-aarch64, 4/12)": 445, // 8
  "test262 (macos-aarch64, 5/12)": 444, // 8
  "test262 (macos-aarch64, 10/12)": 441, // 8
  "test262 (macos-aarch64, 3/12)": 433, // 8
  "test262 (macos-aarch64, 9/12)": 429, // 8
  "test262 (macos-aarch64, 6/12)": 423, // 8
  "native support (macos-aarch64, 9/12)": 421, // 7
  "test262 (macos-aarch64, 1/12)": 409, // 7
  "native (macos-aarch64, 3/3)": 404, // 8
  "native support (macos-aarch64, 4/12)": 361, // 8
  "native (macos-aarch64, 1/3)": 355, // 5
  "native (macos-aarch64, 2/3)": 350, // 7
  "reflect cases (macos-aarch64, 3/3)": 331, // 5
  "reflect cases (macos-aarch64, 2/3)": 281, // 7
  "reflect cases (macos-aarch64, 1/3)": 270, // 6
  "own-key cases (macos-aarch64, 1/3)": 241, // 8
  "own-key cases (macos-aarch64, 3/3)": 205, // 8
  "own-key cases (macos-aarch64, 2/3)": 197, // 8
};

/**
 * Derived ratios that convert a hosted median without a Mac observation
 * into Mac elapsed seconds through
 * `macosFixedSetupSeconds + (cost - setup) / ratio`.
 *
 * Each value is the derived pooled ratio `sum(hosted median - setup) /
 * sum(one-lane Mac seconds - setup)` over the entries of
 * `selfHostedJobSeconds`, rounded down to one decimal. U42 rederived all
 * five from its refreshed table: before rounding, 4.37 for test262 over
 * 12 jobs, 3.40 for native support over 12, 3.22 for native fixtures over
 * 3, 2.67 for the Reflect namespace shards over 3, and 5.48 for own-key
 * cases over 3. U41 had 4.05, 3.16, 3.13, 2.94, and 4.98, and the values
 * before it were 4.2, 3.2, 3.1, 2.3, and 2.3.
 *
 * The Reflect namespace shards had borrowed the own-key ratio, and U38
 * used that same borrowed ratio to derive their hosted estimates, which
 * U40 then replaced with hosted observations. Their 2.9 is no longer
 * borrowed from either side.
 *
 * Every Mac-eligible job has an entry in `selfHostedJobSeconds`, so these
 * ratios reach no job the generator places today. They guard a future
 * shard or family that arrives without a Mac observation.
 *
 * The host C sanitizer family is not Mac-lane eligible, so its ratio
 * reaches no schedule. It records a measurement anyway. U37 ran both
 * macOS suites on the first Mac mini over SSH and measured a derived
 * 2.725 for the native suite over three solo walls and 3.198 for the
 * property suite over two, pooling to 2.9. That is below the 3.4 and 4.3
 * of the native support and test262 work a Mac lane would have to evict
 * to fit them, and the same unit measured their pair factor at a worst
 * 1.41, so the family loses the exchange in every variant; see
 * *docs/evidence/u37/README.md*. The earlier value here was a
 * placeholder 1, which made the model report a regression of its own
 * invention and could not be swept. Cross-platform test jobs stay at 1
 * because they are not Mac-lane eligible and no Mac wall was measured.
 */
interface SelfHostedFamilySpeedRatios {
  readonly [family: string]: number;
}

export const selfHostedFamilySpeedRatios: SelfHostedFamilySpeedRatios = {
  "native support": 3.4,
  "own-key cases": 5.4,
  "reflect cases": 2.6,
  native: 3.2,
  test262: 4.3,
  "host C sanitizers": 2.9,
  test: 1,
};

/**
 * `OSEO_PROPERTY_TIME_SCALE` for a Mac-lane job whose readiness probe fell
 * back to hosted `macos-15`. The ordinary and extended interrupt limits
 * were budgeted on hosted runners before the Mac lanes existed, and the
 * lanes now give the same properties two to three times the margin, so a
 * fallback job widens only its interrupt limit back to a comparable
 * margin. Every case budget, seed, size, and shard total stays fixed, and
 * an interrupted run still fails.
 *
 * The value is the derived ceiling of the 3.2 native support family ratio
 * above, which pools 26 Mac observations of job walls after the setup
 * share; U24 measured 3.55 and 3.60 for native support jobs converted from
 * hosted medians. Per property, main run 37499455406 (both Mac lanes) and
 * attempt 1 of main run 37506307446 (both lanes hosted) ran the same four
 * native support shards: the pooled hosted/Mac duration ratios of their
 * passing properties were a derived 2.64, 1.06, 1.75, and 1.84, with a
 * 3.16 maximum, against two-lane Mac walls that U27 measured at 1.18 to
 * 1.30 times one-lane walls. Four covers every one of those ratios. It
 * does not cover the six properties that attempt 1 interrupted in shard
 * 9/12, whose extrapolated hosted need was a derived 7.5 to 33 times
 * their Mac duration, and no interrupt limit under the 90-minute job
 * timeout would have; see *docs/evidence/u28/*.
 *
 * Only `native support` jobs carry the scale. Own-key case shards keep the
 * original limit because their duration record pins it and
 * `check:property-case-durations` compares the records' sum with that
 * limit; test262 and native fixture jobs run no fast-check property.
 *
 * Since U29 a busy lane queues its jobs on the runner instead of falling
 * back, so the scale applies only when the lane's runner is offline,
 * disabled, ambiguous, or wedged, or the probe failed; a queued job runs
 * on the Mac with scale 1 however long it waited.
 */
export const hostedFallbackTimeScale = 4;

/**
 * Lane-level allowance for the readiness probe and serial job handover.
 * In branch run 37194069657 attempts 1 and 2 and main run 37206614757, the
 * `mac_ready` job started a measured 3 to 5 seconds after the run attempt
 * started and took 15, 18, and 32 seconds; the first Mac job then waited
 * 2 to 3 seconds, and the ten later handovers took 29 to 32 seconds in
 * total. These measured intervals sum to a derived 49, 58, and 68 seconds.
 * Sixty seconds is a central value for that sum, so the model need not
 * represent each handover. Hosted lanes waited a measured median of 7
 * to 8 seconds per job, which the model also omits.
 */
export const selfHostedProbeSeconds = 60;

/** Rounded derived setup share per job from the U6 fixed-cost audit. */
export const macosFixedSetupSeconds = 60;

/**
 * Derived slowdown of a Mac-lane job, by its family and the family of the
 * job running at the same time on the other Mac lane of the same machine.
 * A job progresses at `1 / factor` of its one-lane speed while the other
 * lane is busy, and at its one-lane speed while that lane is idle or done.
 *
 * A value with a trailing comment is a U42 estimate from the 238 Mac-lane
 * job observations in the eight runs since `b59ac914`. Holding the U41
 * `selfHostedJobSeconds` entries fixed, each observation states that the
 * job's
 * elapsed time, split by which family occupied the other lane, must
 * divide back to its one-lane value; a regularized least-squares fit over
 * those equations gives the factors. The comment gives the contended hours
 * that back the value.
 *
 * The other values are the U25 estimates, each the largest overlapped
 * factor of that pairing in *docs/evidence/u25/pair-jobs.tsv*, rounded up
 * to two decimals. The fit had under 48 minutes of contended time for
 * each of them and drove several below the model's minimum of 1.00, so
 * they keep the measured stand-in. Native support beside own-key and
 * native fixture jobs was measured only as one sequence of both partners,
 * so 1.05 covers both. Native fixture + native fixture, own-key +
 * own-key, and own-key + native fixture were not measured; each uses the
 * family's largest measured factor, 1.41 or 1.45, as a pessimistic
 * stand-in. The generator keeps all own-key shards on one Mac lane, so
 * own-key + own-key cannot occur.
 *
 * The refit raises every pairing that a balanced Mac placement creates in
 * quantity, because U25 overlapped its partners for part of their walls
 * and most CI observations have a busy partner for over nine tenths of
 * their wall. The higher factors also size the Mac side against its
 * hardware: applying the 1.31 contended ratio the runs measure as a
 * uniform factor over six lanes, the 33 jobs' 242.6 one-lane minutes come
 * to an illustrative 53.0 minutes of wall clock. See
 * *docs/evidence/u42/README.md*.
 */
interface SelfHostedPairSlowdowns {
  readonly [family: string]: Readonly<Record<string, number>>;
}

export const selfHostedPairSlowdowns: SelfHostedPairSlowdowns = {
  "reflect cases": {
    test262: 1.54, // 0.78 h
    "native support": 1.27,
    "own-key cases": 1.45,
    native: 1.45,
    "reflect cases": 1.07,
  },
  test262: {
    test262: 1.37, // 5.46 h
    "native support": 1.23, // 4.89 h
    "own-key cases": 1.01,
    native: 1.01,
    "reflect cases": 1.26,
  },
  "native support": {
    test262: 1.39, // 4.89 h
    "native support": 1.2, // 7.22 h
    "own-key cases": 1.05,
    native: 1.05,
    "reflect cases": 1.37,
  },
  "own-key cases": {
    test262: 1.45,
    "native support": 1.34, // 1.19 h
    "own-key cases": 1.45,
    native: 1.45,
    "reflect cases": 1.45,
  },
  native: {
    test262: 1.45, // 1.53 h
    "native support": 1.18, // 0.86 h
    "own-key cases": 1.41,
    native: 1.41,
    "reflect cases": 1.41,
  },
};
