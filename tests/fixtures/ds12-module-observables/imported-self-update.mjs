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
// Upstream: imported-self-update.js
import * as ns0 from "./imported-self-update.mjs";

let x = 0;
export { x, x as y };
async function fn() {
  var imported = await Promise.resolve(ns0);
  assert.sameValue(imported.x, 0, "original value, direct binding");
  assert.sameValue(imported.y, 0, "original value, indirect binding");
  x = 1;
  assert.sameValue(imported.x, 1, "updated value, direct binding");
  assert.sameValue(imported.y, 1, "updated value, indirect binding");
}

// Do not use asyncTest: when self imported, $DONE is not defined, asyncTest
// will throw
fn().then($DONE, $DONE);
