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

import { babelFrontend, babelModuleFrontend } from "../src/index.ts";

// These are fixed Script and Module goals, with no source compilation at
// runtime. Constructor/eval source goals remain the ADR 0016 boundary.
for (const source of [
  "import.meta;",
  "function f() { import.meta; }",
  "function f(a = import.meta) {}",
  "function* f() { import.meta; }",
  "function* f(a = import.meta) {}",
  "async function f() { import.meta; }",
  "async function f(a = import.meta) {}",
  "async function* f() { import.meta; }",
  "async function* f(a = import.meta) {}",
]) {
  test(`import.meta follows the enclosing parse goal: ${source}`, () => {
    const input = { source, sourceId: "goal.js" };
    const script = babelFrontend.parse(input);
    assert.equal(script.parsed, false);
    assert.ok(script.diagnostics.length > 0);
    const module = babelModuleFrontend.parseModule(input);
    assert.equal(module.parsed, true);
    assert.deepEqual(module.diagnostics, []);
    assert.ok(module.module);
  });
}
