/**
 * Each entry is the median, rounded to whole seconds, of the job's measured
 * hosted `macos-15` or `macos-latest` walls (`started_at` to
 * `completed_at`) in seven run attempts: all-hosted runs 37121778924 and
 * 37167895777, Mac-lane branch run 37194069657 attempts 1 and 2, main run
 * 37206614757, and branch run 37215661294 attempts 1 and 2. Every job ran
 * in all seven, but a job placed on `oseo-mac-1` in an attempt has no
 * hosted wall there. The trailing comment gives the number of hosted
 * observations when it is below seven:
 *
 *  -  2: the two all-hosted runs only;
 *  -  4: the two all-hosted runs and both attempts of 37215661294;
 *  -  5: the two all-hosted runs, both attempts of 37194069657, and
 *     37206614757.
 *
 * An even count uses the mean of the two middle observations. The medians
 * replace the earlier main-run 36516215200 walls and derived own-key and
 * native-support planning weights, several of which lay below every
 * later observation of their job. The lane generator sorts hosted jobs
 * by these weights before assignment.
 */
interface MacosJobCosts {
  readonly [name: string]: number;
}

/** Measured hosted medians used only for lane assignment. */
export const macosJobCosts: MacosJobCosts = {
  "test (macos-latest, node)": 2772,
  "host C sanitizers (macOS, native)": 2252,
  "host C sanitizers (macOS, property)": 2189,
  "native support (macos-aarch64, 1/12)": 1940, // 2
  "test262 (macos-aarch64, 6/12)": 1540,
  "test262 (macos-aarch64, 8/12)": 1500, // 2
  "test262 (macos-aarch64, 9/12)": 1456,
  "test262 (macos-aarch64, 5/12)": 1398,
  "native support (macos-aarch64, 7/12)": 1367,
  "native support (macos-aarch64, 4/12)": 1363, // 2
  "native support (macos-aarch64, 9/12)": 1330,
  "native support (macos-aarch64, 3/12)": 1323,
  "native support (macos-aarch64, 11/12)": 1313,
  "native support (macos-aarch64, 5/12)": 1308,
  "native support (macos-aarch64, 12/12)": 1294, // 5
  "test262 (macos-aarch64, 1/12)": 1288, // 4
  "native support (macos-aarch64, 10/12)": 1270, // 2
  "test262 (macos-aarch64, 10/12)": 1225,
  "test262 (macos-aarch64, 7/12)": 1200,
  "native support (macos-aarch64, 8/12)": 1194, // 5
  "test262 (macos-aarch64, 12/12)": 1190,
  "native support (macos-aarch64, 6/12)": 1182, // 5
  "test262 (macos-aarch64, 2/12)": 1180, // 4
  "test262 (macos-aarch64, 4/12)": 1163,
  "test262 (macos-aarch64, 11/12)": 1156, // 4
  "native support (macos-aarch64, 2/12)": 1117, // 2
  "test262 (macos-aarch64, 3/12)": 1110,
  "native (macos-aarch64, 3/3)": 1014, // 5
  "own-key cases (macos-aarch64, 2/3)": 995, // 2
  "native (macos-aarch64, 2/3)": 917,
  "native (macos-aarch64, 1/3)": 886,
  "own-key cases (macos-aarch64, 3/3)": 854, // 2
  "own-key cases (macos-aarch64, 1/3)": 810, // 2
  "test (macos-latest, deno)": 110,
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
 * guards a future job without one. The host C sanitizer and
 * cross-platform test families stay at 1 because they are not Mac-lane
 * eligible.
 */
interface SelfHostedFamilySpeedRatios {
  readonly [family: string]: number;
}

export const selfHostedFamilySpeedRatios: SelfHostedFamilySpeedRatios = {
  "native support": 3.2,
  "own-key cases": 2.3,
  native: 3.1,
  test262: 4.2,
  "host C sanitizers": 1,
  test: 1,
};

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
