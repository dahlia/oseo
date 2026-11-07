// SPDX-License-Identifier: GPL-3.0-only
// Original Oseo workload, not a score from an external benchmark suite.

// eslint-disable-next-line no-unused-vars -- Preparation appends its caller.
function benchmark() {
  const text = "alpha:123 beta:45 gamma:6\n".repeat(100);
  const matches = text.match(/[a-z]+:[0-9]+/g);
  let sum = 0;
  for (const match of matches) {
    sum += Number(match.split(":")[1]);
  }
  return sum;
}
