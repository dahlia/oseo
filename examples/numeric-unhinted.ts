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

import { readFileSync } from "node:fs";
import process from "node:process";

function add(a, b) {
  return a + b;
}

const args = process.argv.slice(2);
const iterations = args.length > 0 ? Number(args[0]) : 1000;
if (
  args.length > 1 ||
  !Number.isInteger(iterations) ||
  iterations < 1 ||
  iterations > 1000000
) {
  process.stderr.write("usage: numeric [iterations] (1..1000000)\n");
  process.exit(2);
}

try {
  const input = readFileSync(0, "utf8");
  const pairs =
    input.trim() === ""
      ? [
          [1, 2],
          [3, 4],
          [5, 6],
        ]
      : JSON.parse(input);
  if (!Array.isArray(pairs) || pairs.length > 1024) {
    throw new Error("expected at most 1024 pairs");
  }
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error("expected pairs");
    }
    // JSON objects and arrays box to themselves; primitives do not.
    for (const value of pair) {
      if (Object(value) === value) {
        throw new Error("expected JSON primitives");
      }
    }
  }
  const results = [];
  for (let i = 0; i < iterations; i++) {
    for (let j = 0; j < pairs.length; j++) {
      const result = add(pairs[j][0], pairs[j][1]);
      results[j] = Object.is(result, -0) ? "-0" : result;
    }
  }
  process.stdout.write(JSON.stringify({ iterations, results }) + "\n");
} catch {
  process.stderr.write("numeric: expected a JSON array of primitive pairs\n");
  process.exitCode = 2;
}
