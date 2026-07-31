import assert from "node:assert/strict";
import test from "node:test";

import { compileSource, printMir } from "@oseo/compiler";
import type { MirFunction } from "@oseo/compiler";

import { babelFrontend } from "../src/index.ts";

function asyncGeneratorOf(source: string): MirFunction {
  const result = compileSource(babelFrontend, {
    source,
    sourceId: "async-generators.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const generators = result.mir.functions.filter(
    (functionValue) => functionValue.asyncGenerator === true,
  );
  assert.equal(generators.length, 1);
  const generator = generators[0];
  assert.ok(generator != null);
  // An asynchronous generator body is a generator body, so it keeps the
  // saved frame the suspension machinery already owns.
  assert.equal(generator.generator, true);
  return generator;
}

test("admits asynchronous generator declarations and expressions", () => {
  const result = compileSource(babelFrontend, {
    source: [
      "async function* counter(start) {",
      "  const received = yield start;",
      "  return received;",
      "}",
      "const expression = async function* () { yield 1; };",
      "const named = async function* labelled() { yield 2; };",
      "counter(0).next();",
      "expression().next();",
      "named().next();",
    ].join("\n"),
    sourceId: "async-generators.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const generators = result.mir.functions.filter(
    (functionValue) => functionValue.asyncGenerator === true,
  );
  assert.equal(generators.length, 3);
  const kinds = new Set(
    [...result.mir.script.blocks, ...generators.flatMap((one) => one.blocks)]
      .flatMap((block) => block.operations)
      .flatMap((operation) =>
        operation.kind === "function-create" ? [operation.functionKind] : [],
      ),
  );
  assert.ok(kinds.has("async-generator"));
  assert.match(printMir(result.mir), /async function\* @f/u);
});

test("suspends an asynchronous generator await instead of draining", () => {
  const generator = asyncGeneratorOf(
    "async function* awaiting(value) { console.log(await value); }\n" +
      "awaiting(1).next();",
  );
  const suspVals = generator.blocks.flatMap((block) =>
    block.terminator.kind === "generator-yield" ? [block.terminator] : [],
  );
  assert.equal(suspVals.length, 1);
  const suspension = suspVals[0];
  assert.ok(suspension?.kind === "generator-yield");
  assert.equal(suspension.awaited, true);
  // A rejected operand raises a throw completion at the await position,
  // and no return completion can reach one, so only that branch exists.
  assert.ok(suspension.throwResume != null);
  assert.equal(suspension.returnResume, undefined);
  // The blocking top-level await entry point stays out of the body.
  assert.ok(
    generator.blocks.every((block) =>
      block.operations.every((operation) => operation.detail !== "await"),
    ),
  );
});

function suspensions(
  generator: MirFunction,
): readonly (MirFunction["blocks"][number]["terminator"] & {
  readonly kind: "generator-yield";
})[] {
  return generator.blocks.flatMap((block) =>
    block.terminator.kind === "generator-yield" ? [block.terminator] : [],
  );
}

test("awaits a yield operand before the suspension reports it", () => {
  const generator = asyncGeneratorOf(
    "async function* yielding() { yield 1; }\nyielding().next();",
  );
  const taken = suspensions(generator);
  // One `yield` lowers to three suspensions: AsyncGeneratorYield awaits
  // the operand, the step reports it, and a return resumption awaits the
  // value it delivers before the body leaves.
  assert.equal(taken.length, 3);
  const awaited = taken.filter((one) => one.awaited === true);
  const reporting = taken.filter((one) => one.awaited !== true);
  assert.equal(awaited.length, 2);
  assert.equal(reporting.length, 1);
  const step = reporting[0];
  assert.ok(step != null);
  assert.ok(step.returnResume != null);
  assert.ok(step.throwResume != null);
  // Unlike a synchronous `yield*`, no asynchronous suspension forwards
  // an inner result object.
  assert.equal(step.resultObject, undefined);
  for (const one of awaited) assert.equal(one.returnResume, undefined);
});

test("awaits the operand of an asynchronous generator return", () => {
  const returned = asyncGeneratorOf(
    "async function* returning() { return 1; }\nreturning().next();",
  );
  const returnedAwaits = suspensions(returned);
  assert.equal(returnedAwaits.length, 1);
  assert.equal(returnedAwaits[0]?.awaited, true);
  const bare = asyncGeneratorOf(
    "async function* returning() { return; }\nreturning().next();",
  );
  // A bare `return` names no operand and awaits nothing, so it leaves
  // the body without suspending at all.
  assert.equal(suspensions(bare).length, 0);
});

test("delegates an asynchronous yield* through the async protocol", () => {
  const generator = asyncGeneratorOf(
    "async function* delegating() { yield* [1]; }\ndelegating().next();",
  );
  const operations = generator.blocks.flatMap((block) => block.operations);
  const kinds = new Set(operations.map((operation) => operation.kind));
  assert.ok(kinds.has("iterator-await-start"));
  assert.ok(kinds.has("iterator-await-result"));
  assert.ok(!kinds.has("iterator-delegate-next"));
  assert.ok(!kinds.has("iterator-delegate-return"));
  assert.ok(!kinds.has("iterator-delegate-throw"));
  const starts = operations.filter(
    (operation) => operation.kind === "iterator-await-start",
  );
  assert.deepEqual(
    new Set(starts.map((operation) => operation.iteratorStepKind)),
    new Set(["delegate-next", "delegate-return", "delegate-throw"]),
  );
  assert.ok(
    starts.every((operation) => operation.iteratorValueOnlyResult != null),
  );
  const throwResult = operations.find(
    (operation) =>
      operation.kind === "iterator-await-result" &&
      operation.iteratorStepKind === "delegate-throw",
  );
  assert.equal(throwResult?.arguments.length, 3);
  assert.ok(
    suspensions(generator).filter((suspension) => suspension.awaited === true)
      .length >= starts.length,
  );
});

test("separates async generator parameter initialization from its body", () => {
  const generator = asyncGeneratorOf(
    "async function* consume({ value = 1 } = {}) { yield value; }\n" +
      "consume();",
  );
  assert.ok(generator.generatorBodyStart != null);
  assert.notEqual(generator.generatorBodyStart, 0);
  const callBlocks = generator.blocks.filter(
    (block) => block.id < generator.generatorBodyStart!,
  );
  assert.ok(
    callBlocks.some((block) =>
      block.operations.some(
        (operation) => operation.kind === "object-coercible",
      ),
    ),
  );
  assert.ok(
    callBlocks.every((block) => block.terminator.kind !== "generator-yield"),
  );
  assert.ok(
    generator.blocks
      .filter((block) => block.id >= generator.generatorBodyStart!)
      .some((block) => block.terminator.kind === "generator-yield"),
  );
});

test("admits await in expression positions but not in patterns", () => {
  const admitted: readonly string[] = [
    "async function* g(p) { const a = (await p) + 1; }",
    "async function* g(p, f) { f(await p, 1); }",
    "async function* g(p) { const a = [1, await p, 3]; }",
    "async function* g(p) { const a = { key: await p }; }",
    "async function* g(o, p) { [o.x] = [await p]; }",
    "async function* g(p) { if (await p) console.log(1); }",
  ];
  for (const source of admitted) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "async-generator-await-position.js",
    });
    assert.deepEqual(result.diagnostics, [], source);
  }
  /* The frontend lowers a pattern's subexpressions before the suspension
   * machinery reaches them, so these positions stay rejected inside an
   * asynchronous generator body the way they are elsewhere. */
  const rejected: readonly (readonly [string, RegExp])[] = [
    [
      "async function* g(o, p) { [o[await p]] = [1]; }",
      /destructuring assignment target/u,
    ],
    [
      "async function* g(p) { const { [await p]: v } = {}; }",
      /object binding property name/u,
    ],
    [
      "async function* g(p) { const { a = await p } = {}; }",
      /binding default/u,
    ],
    [
      "async function* g(p) { const [a = await p] = []; }",
      /array binding default/u,
    ],
  ];
  for (const [source, message] of rejected) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "async-generator-await-position.js",
    });
    assert.equal(result.mir, undefined, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
    assert.match(result.diagnostics[0]?.message ?? "", message, source);
  }
});

test("keeps ordinary async distinct in a traced suspension frame", () => {
  const result = compileSource(babelFrontend, {
    source: "async function plain(value) { const x = await value; }\nplain(1);",
    sourceId: "plain-async.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const asynchronous = result.mir.functions.find(
    (functionValue) => functionValue.asyncFunction === true,
  );
  assert.ok(asynchronous != null);
  assert.notEqual(asynchronous.asyncGenerator, true);
  assert.equal(asynchronous.generator, true);
  assert.equal(
    asynchronous.blocks.filter(
      (block) =>
        block.terminator.kind === "generator-yield" &&
        block.terminator.awaited === true,
    ).length,
    1,
  );
});

test("admits async generator method definitions in objects and classes", () => {
  const result = compileSource(babelFrontend, {
    source: `
      const obj = {
        async *objMethod() { yield 1; }
      };
      class C {
        async *classMethod() { yield 2; }
        static async *staticMethod() { yield 3; }
        async *#privateMethod() { yield 4; }
      }
    `,
    sourceId: "async-generator-methods.js",
  });
  assert.ok(result.mir != null);
  const generators = result.mir.functions.filter(
    (f) => f.asyncGenerator === true,
  );
  assert.equal(generators.length, 4);
});
