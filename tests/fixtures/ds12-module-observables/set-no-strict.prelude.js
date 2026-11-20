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
// Upstream: await-ns-set-no-strict.js

var sym = Symbol("test262");

function observe(ns) {
  assert.sameValue(Reflect.set(ns, "local1"), false, "Reflect.set: local1");
  assert.sameValue((ns.local1 = null), null, "AssignmentExpression: local1");

  assert.sameValue(Reflect.set(ns, "local2"), false, "Reflect.set: local2");
  assert.sameValue((ns.local2 = null), null, "AssignmentExpression: local2");

  assert.sameValue(Reflect.set(ns, "renamed"), false, "Reflect.set: renamed");
  assert.sameValue((ns.renamed = null), null, "AssignmentExpression: renamed");

  assert.sameValue(Reflect.set(ns, "indirect"), false, "Reflect.set: indirect");
  assert.sameValue(
    (ns.indirect = null),
    null,
    "AssignmentExpression: indirect",
  );

  assert.sameValue(Reflect.set(ns, "default"), false, "Reflect.set: default");
  assert.sameValue((ns.default = null), null, "AssignmentExpression: default");

  assert.sameValue(
    Reflect.set(ns, Symbol.toStringTag, null),
    false,
    "Reflect.set: Symbol.toStringTag",
  );
  assert.sameValue(
    (ns[Symbol.toStringTag] = null),
    null,
    "AssignmentExpression: Symbol.toStringTag",
  );

  assert.sameValue(Reflect.set(ns, sym), false, "Reflect.set: sym");
  assert.sameValue((ns[sym] = null), null, "AssignmentExpression: sym");
}
