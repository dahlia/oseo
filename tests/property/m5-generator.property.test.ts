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
 * resume point has to restore loop counters, branch selection, and the
 * accumulated total rather than only the top-level statement index.
 */
type StepKind = "conditional" | "loop" | "nested" | "plain" | "sent";

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
    } else if (step.kind === "loop") {
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

function printCase(testCase: GeneratorCase): string {
  const sendList = testCase.sends.map((value) => String(value)).join(", ");
  return `
let entered = 0;
function* generated(base) {
  entered = entered + 1;
  let total = 0;
${testCase.steps.map(printStep).join("\n")}
  return total;
}
console.log("meta", typeof generated, generated.length, generated.name);
const sends = [${sendList}];
const iterator = generated(0);
console.log("lazy", entered);
let index = 0;
let step = iterator.next();
console.log("body", entered);
while (!step.done) {
  console.log("yield", step.value, step.done);
  step = iterator.next(sends[index % ${testCase.sends.length}]);
  index = index + 1;
}
console.log("return", step.value, step.done);
console.log("after", iterator.next().value, iterator.next().done);
`;
}

function expected(testCase: GeneratorCase): string {
  const lines = ["meta function 1 generated", "lazy 0", "body 1"];
  for (const point of modelYields(testCase)) {
    lines.push(`yield ${point.value} false`);
  }
  lines.push(`return ${modelTotal(testCase)} true`);
  lines.push("after undefined true");
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
    }),
    "meta function 1 generated\n" +
      "lazy 0\n" +
      "body 1\n" +
      "yield 1 false\n" +
      "yield 5 false\n" +
      "yield 8 false\n" +
      "return 2 true\n" +
      "after undefined true\n",
  );
});

test("generator model expands loop and nested suspensions", () => {
  const testCase: GeneratorCase = {
    sends: [3, 4],
    steps: [
      { flag: true, inner: 0, kind: "loop", outer: 2, value: 0 },
      { flag: true, inner: 2, kind: "nested", outer: 2, value: 100 },
      { flag: true, inner: 0, kind: "sent", outer: 0, value: -1 },
    ],
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
      "generators preserve generated suspension order, sent values, and " +
        "completion",
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
          "and inside nested loops, driven by a bounded cycle of sent " +
          "values, comparing an independent suspension-order, sent-value, " +
          "and completion model with Node.js, Deno, and both native " +
          "specialization policies with forced collection on the enabled " +
          "path",
        numRuns: 15,
        profile: "M5 synchronous generator functions",
        seed: 0x5eed_0016,
        sizeLimit:
          "zero to four steps, loops of at most three outer and two inner " +
          "iterations, and one to three bounded sent values",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
