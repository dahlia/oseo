/* Oseo source license
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

/*
 * The reviewed cases that include deepEqual.js compare ordinary arrays,
 * nested arrays, primitives, and undefined. Keep the harness at that admitted
 * surface instead of importing upstream's diagnostic formatter, whose Date,
 * Error, Reflect, typed-array, and iterator references widen the profile even
 * when an assertion succeeds.
 */
function __oseoDeepEqual(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  let index = 0;
  while (index < left.length) {
    if (!__oseoDeepEqual(left[index], right[index])) return false;
    index = index + 1;
  }
  return true;
}

assert.deepEqual = function (actual, expected, message) {
  assert(
    __oseoDeepEqual(actual, expected),
    message || "Expected values to be structurally equal.",
  );
};
