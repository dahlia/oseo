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

/* oxlint-disable no-shadow, block-scoped-var */
/* oxlint-disable unicorn/consistent-function-scoping */
// This fixture deliberately exercises a block function and a var binding
// with one name. Module code is always strict, so no Annex B extension
// could apply even on a host that implements it.
var value = "module outer";
let readBlock;

{
  readBlock = function () {
    return value();
  };
  function value() {
    return "module block";
  }
  console.log("module block", value());
}

console.log("module outer", value, readBlock());

export const retained = value;
