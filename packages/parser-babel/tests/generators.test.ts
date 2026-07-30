import assert from "node:assert/strict";
import test from "node:test";

import { compileSource, printHir, printMir } from "@oseo/compiler";

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

test("leaves a suspension through its own block on a return resumption", () => {
  const result = compileSource(babelFrontend, {
    source:
      "function* guarded() { try { yield 1; } finally { yield 2; } }\n" +
      "guarded();",
    sourceId: "return-resumption.js",
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
  const { resume, returnResume } = suspension.terminator;
  assert.notEqual(returnResume, resume);
  assert.notEqual(returnResume, suspension.id);
  // The `try` body's suspension leaves through the finalizer, so a return
  // completion delivered there still runs the `finally` block.
  const returnBlock = generator.blocks.find(
    (block) => block.id === returnResume,
  );
  assert.ok(returnBlock != null);
  assert.ok(
    returnBlock.operations.some(
      (operation) => operation.completionKind === "return",
    ),
  );
  assert.equal(returnBlock.terminator.kind, "jump");
  assert.match(printMir(result.mir), /resume bb\d+ sent %\d+ return bb\d+/u);
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

test("delegates a yield* suspension to the operand's iterator", () => {
  const result = compileSource(babelFrontend, {
    source: "function* outer() { yield* [1]; }\nouter();",
    sourceId: "yield-star.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const generator = result.mir.functions.find(
    (functionValue) => functionValue.generator === true,
  );
  assert.ok(generator != null);
  const operations = generator.blocks.flatMap((block) => block.operations);
  const kinds = new Set(operations.map((operation) => operation.kind));
  assert.ok(kinds.has("iterator-get"));
  assert.ok(kinds.has("iterator-delegate-next"));
  // A return resumption reaches the inner iterator before the delegating
  // body leaves, so the delegation owns a `return` step of its own.
  assert.ok(kinds.has("iterator-delegate-return"));
  assert.ok(!kinds.has("iterator-close"));
  const suspension = generator.blocks.find(
    (block) => block.terminator.kind === "generator-yield",
  );
  assert.ok(suspension?.terminator.kind === "generator-yield");
  // The inner iterator's own result object is what the delegating
  // generator reports, so the suspension yields it unchanged.
  assert.equal(suspension.terminator.resultObject, true);
  assert.deepEqual(suspension.parameters, [suspension.terminator.value]);
  const step = operations.find(
    (operation) => operation.kind === "iterator-delegate-next",
  );
  assert.equal(step?.arguments.length, 3);
  assert.ok(step?.iteratorValueResult != null);
  assert.match(printMir(result.mir), /iterator-delegate-next/u);
  assert.match(printMir(result.mir), /iterator-delegate-return/u);
  assert.ok(result.hir != null);
  assert.match(printHir(result.hir), /yield\* \[1\]/u);
});

test("resumes a yield* delegation at the matching step", () => {
  const result = compileSource(babelFrontend, {
    source: "function* outer() { yield* [1]; }\nouter();",
    sourceId: "yield-star-resume.js",
  });
  assert.ok(result.mir != null);
  const generator = result.mir.functions.find(
    (functionValue) => functionValue.generator === true,
  );
  assert.ok(generator != null);
  const suspension = generator.blocks.find(
    (block) => block.terminator.kind === "generator-yield",
  );
  assert.ok(suspension?.terminator.kind === "generator-yield");
  const { resume, returnResume } = suspension.terminator;
  assert.ok(returnResume != null);
  const blocks = new Map(generator.blocks.map((block) => [block.id, block]));
  const targetOf = (id: number): number | undefined => {
    const terminator = blocks.get(id)?.terminator;
    return terminator?.kind === "jump" ? terminator.target : undefined;
  };
  const nextStep = targetOf(resume);
  const returnStep = targetOf(returnResume);
  assert.ok(nextStep != null && returnStep != null);
  assert.notEqual(nextStep, returnStep);
  // A normal resumption steps `next` again; a return resumption steps the
  // inner iterator's `return` instead of leaving the body directly.
  const stepKinds = (id: number): readonly string[] =>
    (blocks.get(id)?.operations ?? []).map((operation) => operation.kind);
  assert.ok(stepKinds(nextStep).includes("iterator-delegate-next"));
  assert.ok(stepKinds(returnStep).includes("iterator-delegate-return"));
});

test("rejects generator forms outside the admitted unit", () => {
  const cases: readonly (readonly [string, RegExp])[] = [
    [
      "async function* defaulted(value = 1) { yield value; }",
      /default and binding-pattern parameters/u,
    ],
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

test("admits generator method definitions in objects and classes", () => {
  const result = compileSource(babelFrontend, {
    source: `
      const obj = {
        *objMethod() { yield 1; }
      };
      class C {
        *classMethod() { yield 2; }
        static *staticMethod() { yield 3; }
        *#privateMethod() { yield 4; }
      }
    `,
    sourceId: "generator-methods.js",
  });
  assert.ok(result.mir != null);
  const generators = result.mir.functions.filter((f) => f.generator === true);
  assert.equal(generators.length, 4);
});
