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

/* oxlint-disable unicorn/consistent-function-scoping */
// A CaseBlock function is instantiated once for the whole switch, ahead
// of every case test, so an earlier clause already observes a function
// declared in a later clause as callable before physically reaching the
// clause that declares it. This runs as a direct native check because
// Deno 2.9.2 loses that CaseBlock-wide instantiation for a forward
// reference the same way it loses a case-level `let` TDZ in
// switch-tdz.js, so the ordinary differential fixture protocol cannot
// compare it. Node.js prints "function" for this source, matching the
// specification.
function fallthroughOrder(value) {
  const seen = [];
  switch (value) {
    case 1:
      seen.push(typeof beforeDeclaration);
    case 2:
      seen.push(beforeDeclaration());
      function beforeDeclaration() {
        return "declared-in-case-2";
      }
      seen.push(beforeDeclaration());
      break;
    default:
      seen.push("default");
  }
  return `${seen}`;
}
console.log(fallthroughOrder(1));
console.log(fallthroughOrder(2));
console.log(fallthroughOrder(3));
