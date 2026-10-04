import { ownKeyCaseShardCosts } from "./native-shard-costs.ts";

/**
 * Unchanged entries are measured job wall seconds from main run 36516215200
 * (97278fc6), including setup and execution in one observation.
 * Native support and own-key entries are derived planning weights for the
 * changed file sets. Branch run 37121778924 observed every changed job:
 * the native-support weight sum was a derived 427 seconds below observed
 * wall, while all three 1,300-second own-key weights exceeded observed
 * walls. One run does not establish repeatable costs, so these remain
 * planning weights.
 * Native support estimates use 71 seconds of observed shard-1 fixed cost
 * plus the old variable cost scaled by modeled worker makespans. The lane
 * generator sorts all weights by cost before assignment.
 */
interface MacosJobCosts {
  readonly [name: string]: number;
}

/** Observed and labeled derived weights used only for lane assignment. */
export const macosJobCosts: MacosJobCosts = {
  // Derived from 71 + (3,018 - 71) times 2,283 / 3,566.
  "native support (macos-aarch64, 1/12)": 1958,
  // 1,189 modeled case seconds plus a derived 111-second allowance reaches
  // a round 1,300-second planning weight; the allowance is not observed.
  "own-key cases (macos-aarch64, 1/3)":
    ownKeyCaseShardCosts["macos-aarch64"] + 111,
  "own-key cases (macos-aarch64, 2/3)":
    ownKeyCaseShardCosts["macos-aarch64"] + 111,
  "own-key cases (macos-aarch64, 3/3)":
    ownKeyCaseShardCosts["macos-aarch64"] + 111,
  "test (macos-latest, node)": 2875,
  "host C sanitizers (macOS, native)": 2197,
  "test262 (macos-aarch64, 8/12)": 2007,
  "host C sanitizers (macOS, property)": 1923,
  "test262 (macos-aarch64, 5/12)": 1636,
  "native support (macos-aarch64, 9/12)": 1504,
  "native support (macos-aarch64, 4/12)": 1410,
  "native support (macos-aarch64, 2/12)": 1351,
  "native support (macos-aarch64, 7/12)": 1325,
  "native support (macos-aarch64, 8/12)": 1333,
  "native support (macos-aarch64, 11/12)": 1307,
  "native support (macos-aarch64, 5/12)": 1237,
  "test262 (macos-aarch64, 2/12)": 1317,
  "test262 (macos-aarch64, 9/12)": 1275,
  "native support (macos-aarch64, 6/12)": 1236,
  "test262 (macos-aarch64, 12/12)": 1262,
  "native support (macos-aarch64, 3/12)": 1236,
  "test262 (macos-aarch64, 7/12)": 1237,
  "native support (macos-aarch64, 12/12)": 1175,
  "test262 (macos-aarch64, 11/12)": 1184,
  "test262 (macos-aarch64, 10/12)": 1154,
  "test262 (macos-aarch64, 4/12)": 1137,
  "test262 (macos-aarch64, 3/12)": 1122,
  "native support (macos-aarch64, 10/12)": 1091,
  "test262 (macos-aarch64, 6/12)": 1083,
  "test262 (macos-aarch64, 1/12)": 1074,
  "native (macos-aarch64, 3/3)": 1039,
  "native (macos-aarch64, 2/3)": 915,
  "native (macos-aarch64, 1/3)": 850,
  "test (macos-latest, deno)": 113,
};

/**
 * Derived ratios calibrated from the first three Mac-lane runs, branch
 * run 37194069657 attempts 1 and 2 and main run 37206614757.
 * Each run placed the same 11 jobs on `oseo-mac-1`, giving 12 test262,
 * 12 native-support, and 9 own-key job observations.
 *
 * A ratio converts one entry of `macosJobCosts` into Mac elapsed seconds
 * through `macosFixedSetupSeconds + (cost - setup) / ratio`, so it is
 * calibrated against that weight rather than against a hosted job. Each
 * value is the derived pooled ratio `sum(cost - setup) / sum(observed
 * wall - setup)` over all three runs, rounded down to one decimal. The
 * per-run pooled values were 4.39, 4.61, and 4.63 for test262; 2.83,
 * 2.88, and 3.03 for native support; and 3.15, 3.27, and 3.43 for
 * own-key cases, so each chosen value is central rather than the best
 * run. Against the same jobs' hosted walls in all-hosted runs
 * 37167895777 and 37121778924, the derived pooled ratios were 4.4 for
 * test262 and 2.9 for native support, but 2.2 for own-key cases: their
 * 1,300-second weights exceed the 704 to 1,085 hosted seconds observed
 * there. Own-key cases always run on this lane when it exists, so the
 * weight-calibrated value predicts their Mac time.
 *
 * The native fixture family has no runner-mode observation yet, because
 * the previous ratios never placed one of its jobs on the Mac lane. It
 * keeps the derived 2.2 from the U21 one-machine repeats in
 * docs/evidence/u21/README.md. The host C sanitizer and cross-platform
 * test families stay at 1 because they are not Mac-lane eligible.
 */
interface SelfHostedFamilySpeedRatios {
  readonly [family: string]: number;
}

export const selfHostedFamilySpeedRatios: SelfHostedFamilySpeedRatios = {
  "native support": 2.9,
  "own-key cases": 3.2,
  native: 2.2,
  test262: 4.5,
  "host C sanitizers": 1,
  test: 1,
};

/**
 * Lane-level allowance for the readiness probe and serial job handover.
 * In the three runs above, the `mac_ready` job started a measured 3 to 5
 * seconds after the run attempt started and took 15, 18, and 32 seconds;
 * the first Mac job then waited 2 to 3 seconds, and the ten later
 * handovers took 29 to 32 seconds in total. These measured intervals sum
 * to a derived 49, 58, and 68 seconds.
 * Sixty seconds is a central value for that sum, so the model need not
 * represent each handover. Hosted lanes waited a measured median of 7
 * to 8 seconds per job, which the model also omits.
 */
export const selfHostedProbeSeconds = 60;

/** Rounded derived setup share per job from the U6 fixed-cost audit. */
export const macosFixedSetupSeconds = 60;
