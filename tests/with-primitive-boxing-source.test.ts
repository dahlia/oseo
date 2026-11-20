/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
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

import assert from "node:assert/strict";
import test from "node:test";
import { compileSource, printMir } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";

for (const specialization of ["disabled", "enabled"] as const) {
  test(`with entry materializes ToObject (${specialization})`, () => {
    const compiled = compileSource(
      babelFrontend,
      {
        source: "function f(value) { with (value) { return valueOf(); } }",
        sourceId: "with-boxing.js",
      },
      { specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    const mir = printMir(compiled.mir!);
    assert.match(mir, /to-object ToObject for with binding object/u);
    assert.doesNotMatch(mir, /object-coercible/u);
    assert.ok(mir.indexOf("to-object") < mir.indexOf("<with object>"));
  });
}
