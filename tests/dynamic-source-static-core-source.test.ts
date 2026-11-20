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
import { staticCore } from "./native/fixtures/dynamic-source-static-core.ts";

for (const fixture of staticCore) {
  test(`${fixture.name} preserves static source under both policies`, () => {
    assert.doesNotMatch(fixture.source, /\beval\s*\(|\bFunction\s*\(/u);
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: `${fixture.name}.js` },
        {
          specialization,
          observeSpecialization: true,
          test262Host: fixture.test262Host === true,
        },
      );
      assert.deepEqual(compiled.diagnostics, [], fixture.name);
      assert.ok(compiled.mir != null);
      const mir = printMir(compiled.mir);
      assert.match(mir, /call/u);
      if (fixture.name.startsWith("ds15-with-")) {
        assert.match(mir, /with/u);
      }
    }
  });
}
