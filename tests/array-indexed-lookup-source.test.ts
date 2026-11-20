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

import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { arrayIndexedLookupCase } from "./array-indexed-lookup-cases.ts";

test("array indexed lookup transition model matches the reference", () => {
  for (const items of [[], [-3, 0, 4, 9], [-20, 20], [0, 0, 0, 0]]) {
    const { source, stdout } = arrayIndexedLookupCase(items, 7);
    const lines: string[] = [];
    // Only the bootstrap reference executes JavaScript here. The native
    // fixture and existing generated family execute Oseo in their own lanes.
    const observe = new Function("console", source);
    observe({
      log: (...values: readonly unknown[]) => {
        lines.push(values.map(String).join(" "));
      },
    });
    assert.equal(`${lines.join("\n")}\n`, stdout);
  }
});

test("array indexed lookup regressions lower under both policies", () => {
  const { source } = arrayIndexedLookupCase([-3, 0, 4, 9], 7);
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "array-indexed-lookup-transitions.js" },
      { specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const emitted = cBackend.emit(compiled.mir);
    assert.match(emitted.source, /oseo_generated_property_get_at/u);
  }
});
