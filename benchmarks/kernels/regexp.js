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
  const text = "alpha:123 beta:45 gamma:6\n".repeat(100);
  const matches = text.match(/[a-z]+:[0-9]+/g);
  let sum = 0;
  for (const match of matches) {
    sum += Number(match.split(":")[1]);
  }
  return sum;
}
