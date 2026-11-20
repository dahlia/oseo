// Copyright (C) 2018 Leo Balter. All rights reserved.
// Copyright (C) 2018 Valerie Young. All rights reserved.
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
// Upstream: await-ns-get-nested-namespace-dflt-direct.js

function observe(ns) {
  var desc = Object.getOwnPropertyDescriptor(ns, "productionNS2");

  assert.sameValue(desc.enumerable, true, "ns.productionNS2: is enumerable");
  assert.sameValue(desc.writable, true, "ns.productionNS2: is writable");
  assert.sameValue(
    desc.configurable,
    false,
    "ns.productionNS2: is non-configurable",
  );

  var keys = Object.getOwnPropertyNames(ns.productionNS2);

  assert.sameValue(keys.length, 2);
  assert.sameValue(keys[0], "default");
  assert.sameValue(keys[1], "productionOther");

  desc = Object.getOwnPropertyDescriptor(ns.productionNS2, "productionOther");

  assert.sameValue(
    desc.value,
    null,
    "ns.productionNS2.productionOther: value is null",
  );
  assert.sameValue(
    desc.enumerable,
    true,
    "ns.productionNS2.productionOther: is enumerable",
  );
  assert.sameValue(
    desc.writable,
    true,
    "ns.productionNS2.productionOther: is writable",
  );
  assert.sameValue(
    desc.configurable,
    false,
    "ns.productionNS2.productionOther: is non-configurable",
  );

  desc = Object.getOwnPropertyDescriptor(ns.productionNS2, "default");

  assert.sameValue(desc.value, 42, "ns.productionNS2.default value is 42");
  assert.sameValue(
    desc.enumerable,
    true,
    "ns.productionNS2.default is enumerable",
  );
  assert.sameValue(desc.writable, true, "ns.productionNS2.default is writable");
  assert.sameValue(
    desc.configurable,
    false,
    "ns.productionNS2.default is non-configurable",
  );
}
