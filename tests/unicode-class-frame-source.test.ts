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

test("private names use one bounded creation and binding operation", () => {
  const compiled = compileSource(babelFrontend, {
    source: "class Shape { #first; #second; read() { return this.#first; } }",
    sourceId: "private-name-frame.js",
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir);
  const operations = compiled.mir.script.blocks.flatMap(
    (block) => block.operations,
  );
  const names = operations.filter((op) => op.kind === "private-name-create");
  assert.equal(names.length, 2);
  for (const name of names) {
    assert.ok(name.bindingId != null);
    assert.equal(
      operations.some(
        (op) =>
          op.bindingId === name.bindingId &&
          (op.kind === "initialize" || op.kind === "binding-reset"),
      ),
      false,
    );
  }
  assert.match(cBackend.emit(compiled.mir).source, /oseo_private_name_bind/u);
});

test("a wide private class fits the unchanged native frame budget", () => {
  const fields = Array.from({ length: 8327 }, (_, i) => `#p${i};`).join("\n");
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source: `class Shape { ${fields} }`, sourceId: "wide-private.js" },
      { specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir);
    const source = cBackend.emit(compiled.mir).source;
    const charge = source.match(/oseo_frame_enter\(\s*&context, (\d+)u\)/u);
    assert.ok(charge);
    assert.ok(Number(charge[1]) < 65536, charge[0]);
  }
});
