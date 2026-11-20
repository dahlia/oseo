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

// Reading a later clause's lexical binding before its clause runs is a
// TDZ error observable across the shared case-block scope. This runs as
// a direct native check because Deno 2.9.2 transpiles a case-level let
// in .ts sources in a way that loses the TDZ, so the ordinary
// differential fixture protocol cannot compare it. Node.js prints
// "case tdz" for this source, matching the specification.
function readBeforeClause(value) {
  switch (value) {
    case 1:
      return typeof later;
    case 2:
      let later = "set";
      return later;
  }
  return "none";
}
try {
  console.log(readBeforeClause(1));
  // eslint-disable-next-line no-unused-vars -- Catch is the observation.
} catch (caught) {
  console.log("case tdz");
}
console.log(readBeforeClause(2), readBeforeClause(3));
