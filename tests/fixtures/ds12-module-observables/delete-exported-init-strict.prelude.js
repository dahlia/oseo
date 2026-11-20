// Copyright (C) 2016 the V8 project authors. All rights reserved.
// Copyright (C) 2018 Leo Balter. All rights reserved.
// Copyright (C) 2018 the V8 project authors. All rights reserved.
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

// Static adaptation of the pinned test262 source:
// Upstream: await-ns-delete-exported-init-strict.js

function observe(ns) {
  "use strict";

  assert.throws(
    TypeError,
    function () {
      delete ns.default;
    },
    "delete: default",
  );
  assert.sameValue(
    Reflect.deleteProperty(ns, "default"),
    false,
    "Reflect.deleteProperty: default",
  );
  assert.sameValue(ns.default, 42, "binding unmodified: default");

  assert.throws(
    TypeError,
    function () {
      delete ns.local1;
    },
    "delete: local1",
  );
  assert.sameValue(
    Reflect.deleteProperty(ns, "local1"),
    false,
    "Reflect.deleteProperty: local1",
  );
  assert.sameValue(ns.local1, "Test262", "binding unmodified: local1");

  assert.throws(
    TypeError,
    function () {
      delete ns.renamed;
    },
    "delete: renamed",
  );
  assert.sameValue(
    Reflect.deleteProperty(ns, "renamed"),
    false,
    "Reflect.deleteProperty: renamed",
  );
  assert.sameValue(ns.renamed, "TC39", "binding unmodified: renamed");

  assert.throws(
    TypeError,
    function () {
      delete ns.indirect;
    },
    "delete: indirect",
  );
  assert.sameValue(
    Reflect.deleteProperty(ns, "indirect"),
    false,
    "Reflect.deleteProperty: indirect",
  );
  assert.sameValue(ns.indirect, "Test262", "binding unmodified: indirect");
}
