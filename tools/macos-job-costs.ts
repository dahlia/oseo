import { ownKeyCaseShardCosts } from "./native-shard-costs.ts";

/**
 * Unchanged entries are measured job wall seconds from main run 36516215200
 * (97278fc6), including setup and execution in one observation.
 * Native support and own-key entries are derived estimates for the changed
 * file sets, pending a branch CI measurement. Native support estimates use
 * 71 seconds of observed shard-1 fixed cost, plus the old variable cost
 * scaled by the old and new modeled worker makespans. Changed jobs are
 * listed first; the lane generator sorts all weights before assignment.
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
