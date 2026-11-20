// Copyright (C) 2018 Leo Balter. All rights reserved.
// Copyright (C) 2018 Rick Waldron. All rights reserved.
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
// Upstream: nested-async-gen-return-await-eval-gtbndng-indirect-update.js
import * as importedNamespace from "./eval-gtbndng-indirect-update_FIXTURE.mjs";

async function* f() {
  return await Promise.resolve(importedNamespace);
}

f()
  .next()
  .then(({ value: imported }) => {
    assert.sameValue(imported.x, 1);

    // This function is exposed on the global scope (instead of as an exported
    // binding) in order to avoid possible false positives from assuming correct
    // behavior of the semantics under test.
    globalThis.test262update();

    assert.sameValue(imported.x, 2);
  })
  .then($DONE, $DONE)
  .catch($DONE);
