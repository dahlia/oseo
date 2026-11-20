/* Oseo source license
 * Copyright (C) 2018 Peter Wong.  All rights reserved.
 * The Test262 portions retain the BSD license in LICENSE.
 *
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This notice covers Oseo-authored code.
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

// The owned matchAll cases use the pinned test262 iterator comparison
// contract. Keep this reviewed harness explicit so exhaustion and the final
// undefined iterator value remain observable to the compiled program.
assert.compareIterator = function (iterator, validators, message) {
  const detail = message || "";
  let index = 0;
  for (; index < validators.length; index = index + 1) {
    const result = iterator.next();
    assert(
      !result.done,
      "Iterator ended before value " + index + ". " + detail,
    );
    validators[index](result.value);
  }
  const result = iterator.next();
  assert(result.done, "Iterator produced more than " + index + " values.");
  assert.sameValue(
    result.value,
    undefined,
    "An exhausted iterator must return undefined. " + detail,
  );
};
