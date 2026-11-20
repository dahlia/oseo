/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

/* Oseo source license
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

// The upstream global object helper, with the same definitions and caching.
// Upstream obtains the global object as Function("return this;")(), which
// compiles source text at runtime; ADR 0016 keeps the Function constructor
// outside the admitted dynamic source. This copy reads the initial value of
// globalThis instead, which is the global object of the only realm a case
// runs in. Reading it while the harness loads, before any case body runs,
// keeps the cached value independent of later writes to globalThis, as the
// upstream cache is. A top-level this probe would not do: module cases
// load the harness as module code, where this is undefined.
// Copyright (C) 2017 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
var __globalObject = globalThis;
function fnGlobalObject() {
  return __globalObject;
}
