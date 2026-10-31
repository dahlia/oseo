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
