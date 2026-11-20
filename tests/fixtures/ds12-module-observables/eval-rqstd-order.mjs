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
// Upstream: eval-rqstd-order.js

assert.sameValue(globalThis.test262, "123456789");

import {} from "./eval-rqstd-order-1_FIXTURE.mjs";

import "./eval-rqstd-order-2_FIXTURE.mjs";

import * as ns1 from "./eval-rqstd-order-3_FIXTURE.mjs";

import dflt1 from "./eval-rqstd-order-4_FIXTURE.mjs";

export {} from "./eval-rqstd-order-5_FIXTURE.mjs";

// Retain the original default-plus-empty-named import form.
// oxfmt-ignore
import dflt2, {} from "./eval-rqstd-order-6_FIXTURE.mjs";

export * from "./eval-rqstd-order-7_FIXTURE.mjs";

import dflt3, * as ns2 from "./eval-rqstd-order-8_FIXTURE.mjs";

export * as ns3 from "./eval-rqstd-order-9_FIXTURE.mjs";

console.log("ok");
