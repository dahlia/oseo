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

import "./cycle-a.mjs";

export let bState = "b pending";
console.log("cycle b start");

/**
 * @param {number} left
 * @param {number} right
 */
function hintedAdd(left, right) {
  return left + right;
}

const guardMiss = hintedAdd(
  {
    valueOf: function () {
      console.log("guard miss fallback");
      return "x";
    },
  },
  1,
);
await Promise.resolve();
bState = "b ready";
console.log("cycle b done", guardMiss);
