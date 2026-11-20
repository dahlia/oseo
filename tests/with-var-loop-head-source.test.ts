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
import { compileSource } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";

for (const test262Host of [false, true]) {
  for (const head of ["for (var x in { a: 1 })", "for (var x of [1])"]) {
    test(`with resolution: ${head} host=${test262Host}`, () => {
      const compiled = compileSource(
        babelFrontend,
        {
          source: `var x; with ({ x: 0 }) { ${head} {} }`,
          sourceId: "head.js",
        },
        { test262Host },
      );
      assert.deepEqual(compiled.diagnostics, []);
      const environment = compiled.hir!.body.find(
        (entry) => entry.kind === "with",
      );
      assert.equal(environment?.kind, "with");
      if (environment?.kind !== "with" || environment.body.kind !== "block")
        assert.fail("missing with body");
      const loop = environment.body.body[0];
      if (loop?.kind !== "for-in" && loop?.kind !== "for-of")
        assert.fail("missing loop");
      assert.equal(loop.target.kind, "binding");
      if (loop.target.kind !== "binding") assert.fail("missing reference");
      assert.equal(loop.target.withObjectBindingIds?.length, 1);
      assert.equal(loop.target.withGlobalFallback != null, test262Host);
    });
  }
}
