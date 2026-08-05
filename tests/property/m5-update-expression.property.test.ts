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

type InputKind = "boolean" | "null" | "number" | "string";
type Operator = "++" | "--";
type TargetKind = "binding" | "member" | "nullish-member";

interface UpdateCase {
  readonly input: number;
  readonly inputKind: InputKind;
  readonly operator: Operator;
  readonly prefix: boolean;
  readonly targetKind: TargetKind;
}

interface UpdateModel {
  readonly result: number;
  readonly stored: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<UpdateCase> = fc.record({
  input: fc.integer({ max: 20, min: -20 }),
  inputKind: fc.constantFrom<InputKind>("boolean", "null", "number", "string"),
  operator: fc.constantFrom<Operator>("++", "--"),
  prefix: fc.boolean(),
  targetKind: fc.constantFrom<TargetKind>(
    "binding",
    "member",
    "nullish-member",
  ),
});

function inputSource(testCase: UpdateCase): string {
  if (testCase.inputKind === "boolean") {
    return testCase.input % 2 === 0 ? "false" : "true";
  }
  if (testCase.inputKind === "null") return "null";
  if (testCase.inputKind === "string") {
    return JSON.stringify(String(testCase.input));
  }
  return String(testCase.input);
}

function numericInput(testCase: UpdateCase): number {
  if (testCase.inputKind === "boolean") return testCase.input % 2 === 0 ? 0 : 1;
  if (testCase.inputKind === "null") return 0;
  return testCase.input;
}

function expected(testCase: UpdateCase): UpdateModel {
  const previous = numericInput(testCase);
  const stored = previous + (testCase.operator === "++" ? 1 : -1);
  return {
    result: testCase.prefix ? stored : previous,
    stored,
  };
}

function printCase(testCase: UpdateCase): string {
  const target =
    testCase.targetKind === "binding" ? "binding" : "object()[key()]";
  const update = testCase.prefix
    ? `${testCase.operator}${target}`
    : `${target}${testCase.operator}`;
  const stored =
    testCase.targetKind === "binding" ? "binding" : "holder.second";
  const updateStatement =
    testCase.targetKind === "nullish-member"
      ? `let result = false;
try {
  ${update};
} catch (error) {
  result = error instanceof TypeError;
}`
      : `const result = ${update};`;
  return `
let binding = ${inputSource(testCase)};
const holder = { first: ${inputSource(testCase)}, second: 100 };
let objectCount = 0;
let keyCount = 0;
let conversionCount = 0;
const keyValue = {
  [Symbol.toPrimitive]: function () {
    conversionCount = conversionCount + 1;
    if (conversionCount === 1) return "first";
    return "second";
  },
};
function object() {
  objectCount = objectCount + 1;
  return ${testCase.targetKind === "nullish-member" ? "null" : "holder"};
}
function key() {
  keyCount = keyCount + 1;
  return keyValue;
}
${updateStatement}
console.log(
  "values",
  result,
  ${stored},
  objectCount,
  keyCount,
  conversionCount,
);
`;
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
    "oseo-update-expression-property-",
  );
  const sourcePath = `${directory}/case.js`;
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

test("update model distinguishes prefix and postfix results", () => {
  const base = {
    input: 2,
    inputKind: "string",
    operator: "++",
    targetKind: "binding",
  } as const;
  assert.deepEqual(expected({ ...base, prefix: false }), {
    result: 2,
    stored: 3,
  });
  assert.deepEqual(expected({ ...base, prefix: true }), {
    result: 3,
    stored: 3,
  });
});

test(
  "generated update expressions match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "update expressions preserve numeric results and target references",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const modeled = expected(testCase);
        const member = testCase.targetKind !== "binding";
        const nullish = testCase.targetKind === "nullish-member";
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout:
            `values ${nullish ? "true" : modeled.result} ` +
            `${nullish ? 100 : modeled.stored} ` +
            `${member ? 1 : 0} ${member ? 1 : 0} ` +
            `${nullish || !member ? 0 : 2}\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-update-expression.js" },
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
          "prefix and postfix increment or decrement of identifier and " +
          "member targets, including a nullish base, with number, numeric " +
          "string, boolean, and null input",
        numRuns: 10,
        profile: "M5 update expressions",
        seed: 0x6000_2e00,
        sizeLimit: "one update with bounded numeric input",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
