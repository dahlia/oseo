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

// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
// Static adaptation of the pinned test262 source:
// Upstream: eval-rqstd-once.js

import {} from "./eval-rqstd-once_FIXTURE.mjs";
import "./eval-rqstd-once_FIXTURE.mjs";
import * as ns1 from "./eval-rqstd-once_FIXTURE.mjs";
import dflt1 from "./eval-rqstd-once_FIXTURE.mjs";
export {} from "./eval-rqstd-once_FIXTURE.mjs";
// Retain the original default-plus-empty-named import form.
// oxfmt-ignore
import dflt2, {} from "./eval-rqstd-once_FIXTURE.mjs";
export * from "./eval-rqstd-once_FIXTURE.mjs";
export * as ns2 from "./eval-rqstd-once_FIXTURE.mjs";
export * as class from "./eval-rqstd-once_FIXTURE.mjs";
import dflt3, * as ns3 from "./eval-rqstd-once_FIXTURE.mjs";
export default null;

var global = globalThis;

assert.sameValue(global.test262, 262, "global property was defined");

console.log("ok");
