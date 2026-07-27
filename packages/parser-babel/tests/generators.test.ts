import assert from "node:assert/strict";
import test from "node:test";

import { compileSource, printMir } from "@oseo/compiler";

import { babelFrontend } from "../src/index.ts";

test("admits generator declarations and expressions with yield", () => {
  const result = compileSource(babelFrontend, {
    source: [
      "function* counter(start) {",
      "  const received = yield start;",
      "  yield;",
      "  return received;",
      "}",
      "const expression = function* () { yield 1; };",
      "const named = function* labelled() { yield 2; };",
      "console.log(counter(0).next().value);",
      "console.log(expression().next().value);",
      "console.log(named().next().value);",
    ].join("\n"),
    sourceId: "generators.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const generators = result.mir.functions.filter(
    (functionValue) => functionValue.generator === true,
  );
  assert.equal(generators.length, 3);
  const kinds = new Set(
    [...result.mir.script.blocks, ...generators.flatMap((one) => one.blocks)]
      .flatMap((block) => block.operations)
      .flatMap((operation) =>
        operation.kind === "function-create" ? [operation.functionKind] : [],
      ),
  );
  assert.ok(kinds.has("generator"));
});

test("ends a generator block at each suspension and resumes after it", () => {
  const result = compileSource(babelFrontend, {
    source: "function* one() { const sent = yield 5; return sent; }\none();",
    sourceId: "yield-block.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const generator = result.mir.functions.find(
    (functionValue) => functionValue.generator === true,
  );
  assert.ok(generator != null);
  const suspension = generator.blocks.find(
    (block) => block.terminator.kind === "generator-yield",
  );
  assert.ok(suspension?.terminator.kind === "generator-yield");
  assert.notEqual(suspension.terminator.resume, suspension.id);
  assert.notEqual(suspension.terminator.sent, suspension.terminator.value);
  assert.ok(
    generator.blocks.some(
      (block) =>
        suspension.terminator.kind === "generator-yield" &&
        block.id === suspension.terminator.resume,
    ),
  );
  assert.match(printMir(result.mir), /generator-yield %\d+ resume bb\d+ sent/u);
  assert.match(printMir(result.mir), /^function\* @f/mu);
});

test("keeps a bare yield's implicit undefined operand", () => {
  const result = compileSource(babelFrontend, {
    source: "function* bare() { yield; }\nbare();",
    sourceId: "bare-yield.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const generator = result.mir.functions.find(
    (functionValue) => functionValue.generator === true,
  );
  const suspension = generator?.blocks.find(
    (block) => block.terminator.kind === "generator-yield",
  );
  const terminator = suspension?.terminator;
  assert.ok(terminator?.kind === "generator-yield");
  const operand = suspension?.operations.find(
    (operation) => operation.id === terminator.value,
  );
  assert.equal(operand?.kind, "constant");
  assert.deepEqual(operand?.constant, { kind: "undefined" });
});

test("rejects generator forms outside the admitted unit", () => {
  const cases: readonly (readonly [string, RegExp])[] = [
    ["function* delegate() { yield* [1]; }", /yield\* delegation/u],
    ["async function* both() { yield 1; }", /Asynchronous and method/u],
    ["const holder = { *method() { yield 1; } };", /Asynchronous and method/u],
    [
      "function* defaulted(value = 1) { yield value; }",
      /default and binding-pattern parameters/u,
    ],
    [
      "function* destructured([value]) { yield value; }",
      /default and binding-pattern parameters/u,
    ],
  ];
  for (const [source, message] of cases) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "unsupported-generator.js",
    });
    assert.equal(result.mir, undefined, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
    assert.match(result.diagnostics[0]?.message ?? "", message, source);
  }
});

test("keeps yield inside the generator body that owns it", () => {
  // A nested non-generator body is outside the [Yield] grammar
  // parameter, so `yield` there is an ordinary sloppy identifier rather
  // than a suspension belonging to the enclosing generator.
  const nested = compileSource(babelFrontend, {
    source: "function* outer() { function inner() { yield; } yield 1; }",
    sourceId: "nested-yield.js",
  });
  assert.equal(nested.mir, undefined);
  assert.equal(nested.diagnostics[0]?.code, "OSEO1001");
  assert.match(nested.diagnostics[0]?.message ?? "", /Unknown binding/u);
  const arrow = compileSource(babelFrontend, {
    source: "function* outer() { const inner = () => yield 1; inner(); }",
    sourceId: "arrow-yield.js",
  });
  assert.equal(arrow.mir, undefined);
  assert.match(arrow.diagnostics[0]?.message ?? "", /could not be parsed/u);
});
