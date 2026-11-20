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

// Copyright (C) 2018 Leo Balter. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
// Static adaptation of the pinned test262 source:
// Upstream: custom-primitive.js
import * as ns0 from "./custom-tostring_FIXTURE.mjs";
import * as ns1 from "./custom-valueof_FIXTURE.mjs";

async function fn() {
  const str = await Promise.resolve(ns0);
  const value = await Promise.resolve(ns1);

  assert.sameValue(String(str), "1612", "namespace uses the imported toString");
  assert.sameValue(
    Number(str),
    1612,
    "namespace fallsback to toString as its prototype is null",
  );

  assert.sameValue(Number(value), 42, "namespace uses the imported valueOf");
  assert.sameValue(
    String(value),
    "42",
    "namespace fallsback to valueOf as its prototype is null",
  );
}

asyncTest(fn);
