/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

/* Oseo source license
 * Copyright (C) 2017 Ecma International.  All rights reserved.
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

// The reviewed Promise combinator roots use these upstream helpers to assert
// promise-job ordering and allSettled result records.
function checkSequence(array, message) {
  array.forEach(function (element, index) {
    if (element !== index + 1) {
      throw new Test262Error(
        (message ? message : "Steps in unexpected sequence:") +
          " '" +
          array.join(",") +
          "'",
      );
    }
  });
  return true;
}

function checkSettledPromises(settleds, expected, message) {
  const prefix = message ? message + ": " : "";
  assert.sameValue(
    Array.isArray(settleds),
    true,
    prefix + "Settled values is an array",
  );
  assert.sameValue(
    settleds.length,
    expected.length,
    prefix + "The settled values has a different length than expected",
  );
  settleds.forEach(function (settled, index) {
    assert.sameValue(
      Object.prototype.hasOwnProperty.call(settled, "status"),
      true,
      prefix + "The settled value has a property status",
    );
    assert.sameValue(
      settled.status,
      expected[index].status,
      prefix + "status for item " + index,
    );
    if (settled.status === "fulfilled") {
      assert.sameValue(
        Object.prototype.hasOwnProperty.call(settled, "value"),
        true,
        prefix + "The fulfilled promise has a property named value",
      );
      assert.sameValue(
        Object.prototype.hasOwnProperty.call(settled, "reason"),
        false,
        prefix + "The fulfilled promise has no property named reason",
      );
      assert.sameValue(
        settled.value,
        expected[index].value,
        prefix + "value for item " + index,
      );
    } else {
      // The upstream rejected branch names "the fulfilled promise" and
      // capitalizes "Reason value" at the pinned revision. The text is kept
      // verbatim so reviewed failure output matches upstream exactly.
      assert.sameValue(
        settled.status,
        "rejected",
        prefix + "Valid statuses are only fulfilled or rejected",
      );
      assert.sameValue(
        Object.prototype.hasOwnProperty.call(settled, "value"),
        false,
        prefix + "The fulfilled promise has no property named value",
      );
      assert.sameValue(
        Object.prototype.hasOwnProperty.call(settled, "reason"),
        true,
        prefix + "The fulfilled promise has a property named reason",
      );
      assert.sameValue(
        settled.reason,
        expected[index].reason,
        prefix + "Reason value for item " + index,
      );
    }
  });
}
