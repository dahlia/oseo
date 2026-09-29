/**
 * Measured job wall seconds from main run 36516215200 (97278fc6).
 * Includes setup and execution; one observation, not isolated path costs.
 * Source: GitHub job timestamps, reproduced by the M5CI schedule model.
 */
interface MacosJobCosts {
  readonly [name: string]: number;
}

/** Measured whole-job weights used only to derive lane assignment. */
export const macosJobCosts: MacosJobCosts = {
  "native support (macos-aarch64, 1/12)": 3018,
  "test (macos-latest, node)": 2875,
  "host C sanitizers (macOS, native)": 2197,
  "test262 (macos-aarch64, 8/12)": 2007,
  "host C sanitizers (macOS, property)": 1923,
  "test262 (macos-aarch64, 5/12)": 1636,
  "native support (macos-aarch64, 9/12)": 1556,
  "native support (macos-aarch64, 4/12)": 1447,
  "native support (macos-aarch64, 2/12)": 1406,
  "native support (macos-aarch64, 7/12)": 1389,
  "native support (macos-aarch64, 8/12)": 1370,
  "native support (macos-aarch64, 11/12)": 1360,
  "native support (macos-aarch64, 5/12)": 1319,
  "test262 (macos-aarch64, 2/12)": 1317,
  "test262 (macos-aarch64, 9/12)": 1275,
  "native support (macos-aarch64, 6/12)": 1273,
  "test262 (macos-aarch64, 12/12)": 1262,
  "native support (macos-aarch64, 3/12)": 1255,
  "test262 (macos-aarch64, 7/12)": 1237,
  "native support (macos-aarch64, 12/12)": 1189,
  "test262 (macos-aarch64, 11/12)": 1184,
  "test262 (macos-aarch64, 10/12)": 1154,
  "test262 (macos-aarch64, 4/12)": 1137,
  "test262 (macos-aarch64, 3/12)": 1122,
  "native support (macos-aarch64, 10/12)": 1107,
  "test262 (macos-aarch64, 6/12)": 1083,
  "test262 (macos-aarch64, 1/12)": 1074,
  "native (macos-aarch64, 3/3)": 1039,
  "native (macos-aarch64, 2/3)": 915,
  "native (macos-aarch64, 1/3)": 850,
  "test (macos-latest, deno)": 113,
};
