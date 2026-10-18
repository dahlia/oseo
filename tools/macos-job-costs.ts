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
  "host C sanitizers (macOS, native)": 2478, // 22
  "test262 (macos-aarch64, 12/12)": 2212, // 1
  "host C sanitizers (macOS, property)": 2179, // 22
  "native support (macos-aarch64, 5/12)": 2063, // 1 since b59ac914
  "test262 (macos-aarch64, 2/12)": 2054, // 4
  "test262 (macos-aarch64, 11/12)": 1976, // 2
  "native support (macos-aarch64, 8/12)": 1963, // 3 since b59ac914
  "test262 (macos-aarch64, 7/12)": 1941, // 1
  "native support (macos-aarch64, 1/12)": 1940, // retained
  "native support (macos-aarch64, 2/12)": 1924, // 2
  "test262 (macos-aarch64, 3/12)": 1906, // 1
  "test262 (macos-aarch64, 5/12)": 1665, // 7
  "test262 (macos-aarch64, 10/12)": 1644, // 1
  "native support (macos-aarch64, 4/12)": 1630, // 3
  "test262 (macos-aarch64, 4/12)": 1599, // 3
  "native support (macos-aarch64, 6/12)": 1575, // 4
  "native support (macos-aarch64, 7/12)": 1553, // 3 since b59ac914
  "test262 (macos-aarch64, 8/12)": 1543, // 3 since b59ac914
  "test262 (macos-aarch64, 6/12)": 1459, // 1
  "test262 (macos-aarch64, 9/12)": 1456, // retained
  "native support (macos-aarch64, 10/12)": 1432, // 1
  "native support (macos-aarch64, 9/12)": 1330, // retained
  "native support (macos-aarch64, 3/12)": 1323, // retained
  "native support (macos-aarch64, 11/12)": 1313, // retained
  "test (macos-latest, node, 3/4)": 1311, // 18
  "native support (macos-aarch64, 12/12)": 1294, // retained
  "test262 (macos-aarch64, 1/12)": 1288, // retained
  "native (macos-aarch64, 1/3)": 1117, // 4
  "native (macos-aarch64, 3/3)": 1014, // retained
  "test (macos-latest, node, 2/4)": 996, // 18
  "own-key cases (macos-aarch64, 2/3)": 995, // retained
  "test (macos-latest, node, 1/4)": 971, // 18
  "native (macos-aarch64, 2/3)": 917, // retained
  "test (macos-latest, node, 4/4)": 864, // 18
  "own-key cases (macos-aarch64, 3/3)": 854, // retained
  "own-key cases (macos-aarch64, 1/3)": 810, // retained
  "reflect cases (macos-aarch64, 1/3)": 777, // 1 since 731ffba9
  "reflect cases (macos-aarch64, 3/3)": 770, // 1 since 731ffba9
  "reflect cases (macos-aarch64, 2/3)": 696, // 1 since 731ffba9
  "test (macos-latest, deno)": 105, // 22
};

/**
 * Measured median `oseo-mac-1` walls, rounded to whole seconds, for every
 * job that has run on that runner. The observations come from the
 * Mac-lane attempts of the seven runs above that did not run the job
 * hosted; the trailing comment gives their count:
 *
 *  -  5: both attempts of 37194069657, 37206614757, and both attempts of
 *     37215661294;
 *  -  3: both attempts of 37194069657 and 37206614757;
 *  -  2: both attempts of 37215661294.
 *
 * The generator models such a job on the Mac lane by this value instead
 * of converting its hosted weight, because one family ratio could not fit
 * jobs whose derived ratios against the earlier weights ranged from 2.7 to
 * 6.4. A job's Mac walls ranged by a derived 3 to 84 seconds across its
 * observations; hosted walls of all 34 jobs ranged by 6 to 1,004 seconds.
 */
interface SelfHostedJobSeconds {
  readonly [name: string]: number;
}

export const selfHostedJobSeconds: SelfHostedJobSeconds = {
  "native support (macos-aarch64, 1/12)": 752, // 5
  "native support (macos-aarch64, 2/12)": 488, // 5
  "native support (macos-aarch64, 4/12)": 449, // 5
  "own-key cases (macos-aarch64, 3/3)": 442, // 5
  "reflect cases (macos-aarch64, 3/3)": 180, // 1
  "reflect cases (macos-aarch64, 1/3)": 180, // 2
  "reflect cases (macos-aarch64, 2/3)": 179, // 2
  "own-key cases (macos-aarch64, 1/3)": 433, // 5
  "native support (macos-aarch64, 10/12)": 375, // 5
  "own-key cases (macos-aarch64, 2/3)": 374, // 5
  "test262 (macos-aarch64, 8/12)": 366, // 5
  "native (macos-aarch64, 3/3)": 363, // 2
  "native support (macos-aarch64, 6/12)": 354, // 2
  "test262 (macos-aarch64, 1/12)": 345, // 3
  "test262 (macos-aarch64, 2/12)": 336, // 3
  "test262 (macos-aarch64, 11/12)": 329, // 3
  "native support (macos-aarch64, 8/12)": 324, // 2
  "native support (macos-aarch64, 12/12)": 295, // 2
};

/**
 * Derived ratios that convert a hosted median without a Mac observation
 * into Mac elapsed seconds through
 * `macosFixedSetupSeconds + (cost - setup) / ratio`.
 *
 * Each value is the derived pooled ratio `sum(hosted median - setup) /
 * sum(Mac wall - setup)` over every Mac observation of the jobs in
 * `selfHostedJobSeconds`, rounded down to one decimal: 4.24 for test262
 * over 14 observations, 3.20 for native support over 26, 3.15 for native
 * fixtures over 2, and 2.34 for own-key cases over 15. Native fixtures use
 * 3.1 from one job's two attempts; the earlier derived U21 value was 2.2.
 * Own-key cases always have a measured Mac median, so their ratio only
 * guards a future job without one.
 *
 * Reflect namespace case shards borrow the own-key ratio. All three have a
 * measured Mac wall, so the value only guards a future fourth shard, and
 * U38 derived their hosted estimates from this same ratio, which makes it
 * a borrowed measurement rather than independent evidence for them.
 *
 * The host C sanitizer family is not Mac-lane eligible, so its ratio
 * reaches no schedule. It records a measurement anyway. U37 ran both
 * macOS suites on the first Mac mini over SSH and measured a derived
 * 2.725 for the native suite over three solo walls and 3.198 for the
 * property suite over two, pooling to 2.9. That is below the 3.2 and 4.2
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
  "native support": 3.2,
  "own-key cases": 2.3,
  "reflect cases": 2.3,
  native: 3.1,
  test262: 4.2,
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
 * Each measured value is the largest overlapped factor of that pairing in
 * *docs/evidence/u25/pair-jobs.tsv*, rounded up to two decimals: the
 * overlapped seconds of a job divided by the solo work left for the
 * overlap, both derived from measured SSH job walls with separate Zig
 * caches. Native support beside own-key and native fixture jobs was
 * measured only as one sequence of both partners, so 1.05 covers both.
 * Native fixture + native fixture, own-key + own-key, and own-key + native
 * fixture were not measured; each uses the family's largest measured
 * factor, 1.41 or 1.45, as a pessimistic stand-in. The generator keeps all
 * own-key shards on one Mac lane, so own-key + own-key cannot occur.
 */
interface SelfHostedPairSlowdowns {
  readonly [family: string]: Readonly<Record<string, number>>;
}

export const selfHostedPairSlowdowns: SelfHostedPairSlowdowns = {
  "reflect cases": {
    test262: 1.45,
    "native support": 1.27,
    "own-key cases": 1.45,
    native: 1.45,
    "reflect cases": 1.07,
  },
  test262: {
    test262: 1.26,
    "native support": 1.08,
    "own-key cases": 1.01,
    native: 1.01,
    "reflect cases": 1.26,
  },
  "native support": {
    test262: 1.37,
    "native support": 1.13,
    "own-key cases": 1.05,
    native: 1.05,
    "reflect cases": 1.37,
  },
  "own-key cases": {
    test262: 1.45,
    "native support": 1.27,
    "own-key cases": 1.45,
    native: 1.45,
    "reflect cases": 1.45,
  },
  native: {
    test262: 1.41,
    "native support": 1.04,
    "own-key cases": 1.41,
    native: 1.41,
    "reflect cases": 1.41,
  },
};
