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

const args = process.argv.slice(2);
if (args.length > 2) {
  process.stderr.write("usage: line-match.ts [pattern [label]]\n");
  process.exit(2);
}

try {
  const pattern = new RegExp(args.length > 0 ? args[0] : "\\S", "u");
  const label =
    args.length > 1 ? args[1] : (process.env.DEMO_LABEL ?? "matches");
  const input = readFileSync(0, "utf8");
  const lines = input === "" ? [] : input.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      matches.push({ line: i + 1, text: lines[i] });
    }
  }
  process.stdout.write(JSON.stringify({ label, lines: lines.length, matches }));
  process.stdout.write("\n");
} catch {
  process.stderr.write("line-match: invalid pattern or unreadable input\n");
  process.exitCode = 2;
}
