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

// Upstream doneprintHandle appends the failure value to the marker, which
// the admitted profile can now compose: generic string coercion routes an
// arbitrary object through %Object.prototype.toString%, @@toPrimitive, and
// @@toStringTag. ToString still rejects a Symbol, and an object can convert
// abruptly through a throwing method or getter, a non-callable pair, or a
// null prototype, so the composition is guarded and falls back to the bare
// marker rather than replacing a case's failure report with a thrown
// conversion.
function $DONE(error) {
  if (!error) {
    console.log("Test262:AsyncTestComplete");
    return;
  }
  let detail = "";
  try {
    if (typeof error === "object" && error !== null && "name" in error) {
      detail = error.name + ": " + error.message;
    } else {
      detail = "Test262Error: " + (error.message || error);
    }
  } catch (conversion) {
    detail = "";
  }
  console.log("Test262:AsyncTestFailure:" + detail);
}
