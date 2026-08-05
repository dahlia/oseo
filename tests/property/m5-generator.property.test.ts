/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/**
 * Where one generated `yield` sits inside the generator body. Each kind
 * places its suspension in a different control-flow position so a saved
 * resume point has to restore loop counters, branch selection, iterator
 * progress, and the accumulated total rather than only the top-level
 * statement index. An `iterated` step suspends while a for-of over a
 * nested generator is still in progress, so the loop's iterator state has
 * to survive the suspension and the fresh invocation that resumes it. A
 * `delegated` step suspends through `yield*`, so every resumption reaches
 * an inner generator first, and a `delegated-result` step also folds that
 * inner generator's return value into the body's own total.
 */
type StepKind =
  | "conditional"
  | "delegated"
  | "delegated-result"
  | "iterated"
  | "loop"
  | "nested"
  | "plain"
  | "sent";

interface Step {
  readonly flag: boolean;
  readonly inner: number;
  readonly kind: StepKind;
  readonly outer: number;
  readonly value: number;
}

interface GeneratorCase {
  /** Values delivered by every resumption after the first `next()`. */
  readonly sends: readonly number[];
  readonly steps: readonly Step[];
  /**
   * How many yields the driver consumes before closing the generator with
   * `return`. Zero drains the body instead, and a count beyond the body's
   * suspensions never triggers, so both completions stay in the domain.
   */
  readonly stopAfter: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const stepArbitrary: fc.Arbitrary<Step> = fc.record({
  flag: fc.boolean(),
  inner: fc.integer({ max: 2, min: 0 }),
  kind: fc.constantFrom<StepKind>(
    "conditional",
    "delegated",
    "delegated-result",
    "iterated",
    "loop",
    "nested",
    "plain",
    "sent",
  ),
  outer: fc.integer({ max: 3, min: 0 }),
  value: fc.integer({ max: 20, min: -20 }),
});

const caseArbitrary: fc.Arbitrary<GeneratorCase> = fc.record({
  sends: fc.array(fc.integer({ max: 9, min: -9 }), {
    maxLength: 3,
    minLength: 1,
  }),
  steps: fc.array(stepArbitrary, { maxLength: 4 }),
  stopAfter: fc.integer({ max: 6, min: 0 }),
});

/** One yielded value and whether its resumption feeds the running total. */
interface YieldPoint {
  readonly accumulates: boolean;
  readonly value: number;
}

/**
 * Independent model of the generated body: the ordered values every
 * suspension produces and the total the body finally returns. A `sent`
 * step adds the value its own resumption delivers, so the model also
 * pins which resumption argument reaches which yield.
 */
function modelYields(testCase: GeneratorCase): readonly YieldPoint[] {
  const points: YieldPoint[] = [];
  for (const step of testCase.steps) {
    if (step.kind === "plain") {
      points.push({ accumulates: false, value: step.value });
    } else if (step.kind === "sent") {
      points.push({ accumulates: true, value: step.value });
    } else if (step.kind === "conditional") {
      points.push({
        accumulates: false,
        value: step.flag ? step.value : step.value + 1,
      });
    } else if (step.kind !== "nested") {
      // A for-of over `source(outer)`, a `yield*` over `shifted(outer)`,
      // and a counted loop all deliver the same 0..outer-1 values, so
      // every one of them shares a single model.
      for (let index = 0; index < step.outer; index += 1) {
        points.push({ accumulates: false, value: step.value + index });
      }
    } else {
      for (let outer = 0; outer < step.outer; outer += 1) {
        for (let inner = 0; inner < step.inner; inner += 1) {
          points.push({
            accumulates: false,
            value: step.value + outer * 10 + inner,
          });
        }
      }
    }
  }
  return points;
}

function modelTotal(testCase: GeneratorCase): number {
  const sends = testCase.sends;
  let total = 0;
  modelYields(testCase).forEach((point, index) => {
    if (point.accumulates) total += sends[index % sends.length]!;
  });
  // A delegating expression evaluates to the inner generator's return
  // value, which `shifted` defines as the number of values it produced.
  for (const step of testCase.steps) {
    if (step.kind === "delegated-result") total += step.outer;
  }
  return total;
}

function printStep(step: Step, index: number): string {
  if (step.kind === "plain") return `  yield base + ${step.value};`;
  if (step.kind === "sent") return `  total += yield base + ${step.value};`;
  if (step.kind === "conditional") {
    return (
      `  if (${step.flag ? "true" : "false"}) {\n` +
      `    yield base + ${step.value};\n` +
      "  } else {\n" +
      `    yield base + ${step.value + 1};\n` +
      "  }"
    );
  }
  if (step.kind === "loop") {
    return (
      `  for (let i${index} = 0; i${index} < ${step.outer}; ` +
      `i${index} = i${index} + 1) {\n` +
      `    yield base + ${step.value} + i${index};\n` +
      "  }"
    );
  }
  if (step.kind === "delegated") {
    return `  yield* shifted(${step.outer}, base + ${step.value});`;
  }
  if (step.kind === "delegated-result") {
    return `  total += yield* shifted(${step.outer}, base + ${step.value});`;
  }
  if (step.kind === "iterated") {
    return (
      `  for (const v${index} of source(${step.outer})) {\n` +
      `    yield base + ${step.value} + v${index};\n` +
      "  }"
    );
  }
  return (
    `  for (let i${index} = 0; i${index} < ${step.outer}; ` +
    `i${index} = i${index} + 1) {\n` +
    `    for (let j${index} = 0; j${index} < ${step.inner}; ` +
    `j${index} = j${index} + 1) {\n` +
    `      yield base + ${step.value} + i${index} * 10 + j${index};\n` +
    "    }\n" +
    "  }"
  );
}

/**
 * True when the driver closes the generator before the body finishes. A
 * stop count beyond the body's suspensions never interrupts it, so the
 * same domain covers both draining and early closing.
 */
function stopsEarly(testCase: GeneratorCase): boolean {
  return (
    testCase.stopAfter > 0 && testCase.stopAfter <= modelYields(testCase).length
  );
}

function printCase(testCase: GeneratorCase): string {
  const sendList = testCase.sends.map((value) => String(value)).join(", ");
  return `
let entered = 0;
let cleaned = 0;
function* source(count) {
  for (let index = 0; index < count; index = index + 1) yield index;
}
function* shifted(count, offset) {
  for (let index = 0; index < count; index = index + 1) yield offset + index;
  return count;
}
function* generated(base) {
  entered = entered + 1;
  let total = 0;
  try {
${testCase.steps.map(printStep).join("\n")}
  } finally {
    cleaned = cleaned + 1;
  }
  return total;
}
console.log("meta", typeof generated, generated.length, generated.name);
const sends = [${sendList}];
const iterator = generated(0);
console.log("lazy", entered);
let index = 0;
let consumed = 0;
let step = iterator.next();
console.log("body", entered);
while (!step.done) {
  console.log("yield", step.value, step.done);
  consumed = consumed + 1;
  if (consumed === ${testCase.stopAfter}) break;
  step = iterator.next(sends[index % ${testCase.sends.length}]);
  index = index + 1;
}
if (!step.done) step = iterator.return("stopped");
console.log("return", step.value, step.done);
console.log("cleanup", cleaned);
console.log("after", iterator.next().value, iterator.next().done);
console.log("closed", cleaned);
`;
}

function expected(testCase: GeneratorCase): string {
  const lines = ["meta function 1 generated", "lazy 0", "body 1"];
  const points = modelYields(testCase);
  const stopped = stopsEarly(testCase);
  const consumed = stopped ? testCase.stopAfter : points.length;
  for (let index = 0; index < consumed; index += 1) {
    lines.push(`yield ${points[index]?.value} false`);
  }
  lines.push(
    stopped ? "return stopped true" : `return ${modelTotal(testCase)} true`,
  );
  // The body's `finally` runs exactly once on both completions: when the
  // last step finishes, and when a return resumption leaves a suspension.
  // A completed generator never re-enters the body, so the count holds.
  lines.push("cleanup 1");
  lines.push("after undefined true");
  lines.push("closed 1");
  return `${lines.join("\n")}\n`;
}

async function references(source: string): Promise<
  readonly [
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
  ]
> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-generator-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(sourcePath, source);
    const observations = [
      await host.run({
        args: [sourcePath],
        command: process.execPath,
        cwd: directory,
      }),
      await host.run({
        args: ["run", "--quiet", sourcePath],
        command: "deno",
        cwd: directory,
      }),
    ] as const;
    succeeded = true;
    return observations;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test("generator model orders every suspension in source order", () => {
  assert.equal(
    expected({
      sends: [2],
      steps: [
        { flag: true, inner: 0, kind: "plain", outer: 0, value: 1 },
        { flag: true, inner: 0, kind: "sent", outer: 0, value: 5 },
        { flag: false, inner: 0, kind: "conditional", outer: 0, value: 7 },
      ],
      stopAfter: 0,
    }),
    "meta function 1 generated\n" +
      "lazy 0\n" +
      "body 1\n" +
      "yield 1 false\n" +
      "yield 5 false\n" +
      "yield 8 false\n" +
      "return 2 true\n" +
      "cleanup 1\n" +
      "after undefined true\n" +
      "closed 1\n",
  );
});

test("generator model closes a body that stops before its last step", () => {
  const testCase: GeneratorCase = {
    sends: [2],
    steps: [
      { flag: true, inner: 0, kind: "plain", outer: 0, value: 1 },
      { flag: true, inner: 0, kind: "iterated", outer: 2, value: 5 },
    ],
    stopAfter: 2,
  };
  assert.ok(stopsEarly(testCase));
  assert.equal(
    expected(testCase),
    "meta function 1 generated\n" +
      "lazy 0\n" +
      "body 1\n" +
      "yield 1 false\n" +
      "yield 5 false\n" +
      "return stopped true\n" +
      "cleanup 1\n" +
      "after undefined true\n" +
      "closed 1\n",
  );
  // The suspension is inside a for-of over `source`, so the return
  // resumption also closes the loop's iterator on the way out.
  assert.match(printCase(testCase), /for \(const v1 of source\(2\)\)/u);
  // A stop count beyond the body's suspensions drains it instead.
  assert.ok(!stopsEarly({ ...testCase, stopAfter: 4 }));
});

test("generator model folds a delegated result into the body total", () => {
  const testCase: GeneratorCase = {
    sends: [5],
    steps: [
      { flag: true, inner: 0, kind: "delegated", outer: 2, value: 3 },
      { flag: true, inner: 0, kind: "delegated-result", outer: 3, value: 10 },
    ],
    stopAfter: 0,
  };
  assert.deepEqual(
    modelYields(testCase).map((point) => point.value),
    [3, 4, 10, 11, 12],
  );
  // No delegated suspension accumulates a sent value, so the total is the
  // second delegation's own result alone.
  assert.equal(modelTotal(testCase), 3);
  assert.match(printCase(testCase), /yield\* shifted\(2, base \+ 3\);/u);
  assert.match(
    printCase(testCase),
    /total \+= yield\* shifted\(3, base \+ 10\);/u,
  );
  // Stopping inside a delegation closes the inner generator first, and the
  // body's own `finally` still runs exactly once.
  assert.ok(stopsEarly({ ...testCase, stopAfter: 3 }));
});

test("generator model expands loop and nested suspensions", () => {
  const testCase: GeneratorCase = {
    sends: [3, 4],
    steps: [
      { flag: true, inner: 0, kind: "loop", outer: 2, value: 0 },
      { flag: true, inner: 2, kind: "nested", outer: 2, value: 100 },
      { flag: true, inner: 0, kind: "sent", outer: 0, value: -1 },
    ],
    stopAfter: 0,
  };
  assert.deepEqual(
    modelYields(testCase).map((point) => point.value),
    [0, 1, 100, 101, 110, 111, -1],
  );
  // The seventh yield accumulates sends[6 % 2], which is 3.
  assert.equal(modelTotal(testCase), 3);
  assert.match(printCase(testCase), /for \(let j1 = 0; j1 < 2; /u);
});

test(
  "generated generators match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "generators preserve generated suspension order, sent values, " +
        "iterator progress, and both draining and early-closing " +
        "completions",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-generator.ts" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          if (specialization === "enabled") {
            process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          }
          try {
            await withNativeFixture(
              {
                backend: cBackend,
                host,
                input: compiled.mir,
                operation: "execute",
                runtime: cRuntimeProvider,
                target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
                toolchain: zigToolchain,
              },
              (native) =>
                assertMatchingObservations([expectedObservation, native]),
            );
          } finally {
            delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          }
        }
      }),
      {
        context:
          nativeTarget == null || host.executionHost == null
            ? ["target=unsupported host=unknown"]
            : [
                `target=${nativeTarget.name}`,
                `host=${host.executionHost.operatingSystem}/` +
                  host.executionHost.architecture,
                `sanitizers=${nativeTarget.sanitizers.join(",")}`,
              ],
        domain:
          "synchronous generator bodies with zero to four suspension steps " +
          "placed at statement level, inside a conditional, inside a loop, " +
          "inside nested loops, inside a for-of over a nested " +
          "generator, and delegated through `yield*` both for its values " +
          "alone and for its result, wrapped in a cleanup-observing " +
          "try/finally, driven " +
          "by a bounded cycle of sent values and either drained or closed " +
          "with `return` after a bounded number of yields, comparing an " +
          "independent suspension-order, sent-value, cleanup, and " +
          "completion model with Node.js, Deno, and both native " +
          "specialization policies with forced collection on the enabled " +
          "path",
        numRuns: 15,
        profile: "M5 synchronous generator functions",
        seed: 0x6000_1c00,
        sizeLimit:
          "zero to four steps, loops of at most three outer and two inner " +
          "iterations, one to three bounded sent values, and a stop count " +
          "of zero to six",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
