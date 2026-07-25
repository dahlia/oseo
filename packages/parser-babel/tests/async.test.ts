import assert from "node:assert/strict";
import test from "node:test";

import { compileSource } from "@oseo/compiler";

import { babelFrontend, babelModuleFrontend } from "../src/index.ts";

test("lowers async functions into owned continuations", () => {
  const result = compileSource(babelFrontend, {
    source: [
      "async function add(value) {",
      "  const first = await Promise.resolve(value);",
      "  const second = await 2;",
      "  return first + second;",
      "}",
      "const expression = async function (value) { return await value; };",
      "const arrow = async (value) => await value;",
      "function observe(value) { console.log(value); }",
      "add(1).then(observe);",
      "expression(2).then(observe);",
      "arrow(3).then(observe);",
    ].join("\n"),
    sourceId: "async.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  assert.ok(result.mir.functions.length >= 9);
  const operations = [
    ...result.mir.script.blocks,
    ...result.mir.functions.flatMap((functionValue) => functionValue.blocks),
  ].flatMap((block) => block.operations);
  assert.ok(
    operations.some(
      (operation) =>
        operation.target?.kind === "promise-intrinsic" &&
        operation.target.method === "asyncCall",
    ),
  );
  assert.ok(
    operations.some(
      (operation) =>
        operation.target?.kind === "promise-intrinsic" &&
        operation.target.method === "awaitThen",
    ),
  );
  const functionKinds = new Set(
    operations.flatMap((operation) =>
      operation.kind === "function-create" ? [operation.functionKind] : [],
    ),
  );
  assert.ok(functionKinds.has("async"));
  assert.ok(functionKinds.has("async-arrow"));
  assert.ok(functionKinds.has("arrow"));
});

test("lowers non-simple async parameters inside the async execution", () => {
  const result = compileSource(babelFrontend, {
    source: [
      "async function defaults(value = 1) { return value; }",
      "async function patterns({ value }, [other]) {",
      "  return value + other;",
      "}",
      "const rest = async (...values) => values.length;",
      "defaults();",
      "patterns({ value: 2 }, [3]);",
      "rest(4, 5);",
    ].join("\n"),
    sourceId: "async-parameters.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
});

test("diagnoses excessive async continuation depth", () => {
  const accepted = compileSource(babelFrontend, {
    source: `async function deep() {\n${"await 0;\n".repeat(256)}}`,
    sourceId: "accepted-async.js",
  });
  assert.deepEqual(accepted.diagnostics, []);
  assert.ok(accepted.mir != null);

  const result = compileSource(babelFrontend, {
    source: `async function deep() {\n${"await 0;\n".repeat(1_200)}}`,
    sourceId: "deep-async.js",
  });
  assert.equal(result.mir, undefined);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(result.diagnostics[0]?.message ?? "", /at most 256/u);
  assert.equal(result.diagnostics[0]?.range.start.line, 258);
});

test("counts awaited destructuring assignments as async continuations", () => {
  const result = compileSource(babelFrontend, {
    source:
      "async function deep() {\nlet value;\n" +
      "[value] = await [0];\n".repeat(257) +
      "}\n",
    sourceId: "deep-await-destructuring-assignment.js",
  });
  assert.equal(result.mir, undefined);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(result.diagnostics[0]?.message ?? "", /at most 256/u);
});

test("preserves async returns and bindings across await", () => {
  const result = compileSource(babelFrontend, {
    source: [
      "async function choose(value) {",
      "  if (value) return 1;",
      "  return 2;",
      "}",
      "async function returnedDeclaration() {",
      "  return later();",
      "  function later() { return 3; }",
      "}",
      "async function thrownDeclaration() {",
      "  throw later();",
      '  function later() { return "reason"; }',
      "}",
      "async function lexicalAfterReturn() {",
      "  return later;",
      "  let later = 4;",
      "}",
      "async function hoisted() {",
      "  const value = later();",
      "  await 0;",
      "  function later() { return 5; }",
      "  return value;",
      "}",
      "async function lexical() {",
      "  console.log(later);",
      "  await 0;",
      "  let later = 6;",
      "  return later;",
      "}",
      "async function finalValue() {",
      "  try { return 1; } finally { return 2; }",
      "}",
      "const promise = Promise.resolve(3);",
      "promise.then = function () { return 4; };",
      "async function internalAwait() { return await promise; }",
    ].join("\n"),
    sourceId: "async-scope.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
});

test("validates unreachable async statements", () => {
  const loop = compileSource(babelFrontend, {
    source: "async function invalid() { return 1; class Later {} }",
    sourceId: "async-unreachable-loop.js",
  });
  assert.equal(loop.mir, undefined);
  assert.match(loop.diagnostics[0]?.message ?? "", /ClassDeclaration/u);

  const awaitValue = compileSource(babelFrontend, {
    source: "async function invalid() { throw 1; if (true) await 0; }",
    sourceId: "async-unreachable-await.js",
  });
  assert.equal(awaitValue.mir, undefined);
  assert.match(awaitValue.diagnostics[0]?.message ?? "", /Await/u);

  const continuation = compileSource(babelFrontend, {
    source: "async function invalid() { await 0; return 1; class Later {} }",
    sourceId: "async-unreachable-continuation.js",
  });
  assert.equal(continuation.mir, undefined);
  assert.match(continuation.diagnostics[0]?.message ?? "", /ClassDeclaration/u);
});

test("rejects nested async await operands", () => {
  for (const source of [
    "async function nested(ready) { return await (await ready); }",
    "async function nested(ready) { await (await ready); }",
    "async function nested(ready) { const value = await (await ready); }",
    "async function nested(ready) { return 1; return await (await ready); }",
  ]) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "nested-await.js",
    });
    assert.equal(result.mir, undefined);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001");
    assert.match(result.diagnostics[0]?.message ?? "", /Nested await/u);
  }
});

test("lowers timer globals while preserving lexical shadowing", () => {
  const direct = compileSource(babelFrontend, {
    source: [
      "function task() {}",
      "const handle = setTimeout(task, 0);",
      "clearTimeout(handle);",
    ].join("\n"),
    sourceId: "timers.js",
  });
  assert.deepEqual(direct.diagnostics, []);
  const targets = direct.mir?.script.blocks
    .flatMap((block) => block.operations)
    .flatMap((operation) =>
      operation.target == null ? [] : [operation.target],
    );
  assert.ok(
    targets?.some(
      (target) =>
        target.kind === "timer-intrinsic" && target.method === "setTimeout",
    ),
  );
  assert.ok(
    targets?.some(
      (target) =>
        target.kind === "timer-intrinsic" && target.method === "clearTimeout",
    ),
  );

  const shadowed = compileSource(babelFrontend, {
    source: "function call(setTimeout, task) { return setTimeout(task, 0); }",
    sourceId: "shadowed-timer.js",
  });
  assert.deepEqual(shadowed.diagnostics, []);
  assert.ok(
    shadowed.mir?.functions
      .flatMap((functionValue) => functionValue.blocks)
      .flatMap((block) => block.operations)
      .some((operation) => operation.target?.kind === "dynamic"),
  );
});

test("rejects type-only imports instead of creating runtime bindings", () => {
  const result = babelModuleFrontend.parseModule({
    source: 'import type { Model } from "./types.ts";',
    sourceId: "file:///app/main.ts",
  });
  assert.equal(result.parsed, false);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(result.diagnostics[0]?.message ?? "", /Type-only imports/u);
});

test("rejects module attributes before lowering module entries", () => {
  for (const source of [
    'import data from "./data.json" with { type: "json" };',
    'import data from "./data.json" with {};',
    'export { value } from "./data.js" with { type: "json" };',
    'export * from "./data.js" with { type: "json" };',
  ]) {
    const result = babelModuleFrontend.parseModule({
      source,
      sourceId: "file:///app/main.js",
    });
    assert.equal(result.parsed, false);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001");
    assert.match(result.diagnostics[0]?.message ?? "", /attributes/u);
    assert.deepEqual(result.diagnostics[0]?.range.start, {
      column: 1,
      line: 1,
    });
  }

  const comment = babelModuleFrontend.parseModule({
    source: 'import data from "./data.js" /* with {} */;',
    sourceId: "file:///app/comment.js",
  });
  assert.ok(comment.parsed);
  assert.deepEqual(comment.diagnostics, []);
});
