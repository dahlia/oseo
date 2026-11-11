// SPDX-License-Identifier: GPL-3.0-only
// Original Oseo workload, not a score from an external benchmark suite.

// eslint-disable-next-line no-unused-vars -- Preparation appends its caller.
function benchmark() {
  const records = [];
  for (let i = 0; i < 100; i += 1) {
    records.push({ id: i, text: 'row "' + i + '"', active: i % 2 === 0 });
  }
  const decoded = JSON.parse(JSON.stringify(records));
  let sum = 0;
  for (const row of decoded) {
    if (row.text !== 'row "' + row.id + '"') {
      throw new Error("JSON round-trip changed a string");
    }
    if (row.active) sum += row.id;
  }
  return sum;
}
