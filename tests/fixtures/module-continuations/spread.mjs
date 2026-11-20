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

let iteratorCount = 0;
const source = {
  [Symbol.iterator]: function () {
    iteratorCount += 1;
    console.log("spread iterator", iteratorCount);
    let emitted = false;
    return {
      next: function () {
        if (emitted) return { value: undefined, done: true };
        emitted = true;
        return { value: 4, done: false };
      },
    };
  },
};

const values = [...source, await Promise.resolve(5)];
console.log("spread values", values[0], values[1], iteratorCount);
