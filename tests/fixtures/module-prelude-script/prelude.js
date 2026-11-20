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

// A sloppy Script the realm evaluates before the module graph links.
var counter = 0;
let lexical = "script let";
const fixed = "script const";
var shadowed = "global";
function record(label) {
  counter += 1;
  log.push(label + ":" + counter);
}
var log = [];
implicitGlobal = "sloppy";
var sloppyThis = (function () {
  return this === globalThis;
})();
var retained = (function () {
  const cells = [];
  for (let index = 0; index < 64; index += 1) cells.push({ index });
  return () => cells.reduce((sum, cell) => sum + cell.index, 0);
})();
