// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
