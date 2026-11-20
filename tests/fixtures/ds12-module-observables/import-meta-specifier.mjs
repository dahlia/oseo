// Copyright (C) 2018 Leo Balter. All rights reserved.
// The Test262 portions follow the BSD license in
// LICENSE.

/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This notice covers Oseo-authored code. Material derived from
 * Test262 retains its BSD license.
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

const meta = import.meta;
assert.sameValue(Object.getPrototypeOf(meta), null);
if (
  !Object.prototype.hasOwnProperty.call(meta, "toString") &&
  !Object.prototype.hasOwnProperty.call(meta, "valueOf") &&
  !Object.prototype.hasOwnProperty.call(meta, Symbol.toPrimitive)
) {
  assert.throws(TypeError, () => String(meta));
}
console.log("ok");
