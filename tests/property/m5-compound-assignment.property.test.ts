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

type Operator =
  | "%"
  | "&"
  | "&&"
  | "*"
  | "**"
  | "+"
  | "-"
  | "/"
  | "<<"
  | ">>"
  | ">>>"
  | "??"
  | "^"
  | "|"
  | "||";
type TargetKind = "identifier" | "member";

interface CompoundAssignmentCase {
  readonly left: number;
  readonly nullish: boolean;
  readonly operator: Operator;
  readonly right: number;
  readonly targetKind: TargetKind;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<CompoundAssignmentCase> = fc.record({
  left: fc.integer({ max: 8, min: -8 }),
  nullish: fc.boolean(),
  operator: fc.constantFrom<Operator>(
    "%",
    "&",
    "&&",
    "*",
    "**",
    "+",
    "-",
    "/",
    "<<",
    ">>",
    ">>>",
    "??",
    "^",
    "|",
    "||",
  ),
  right: fc.oneof(
    fc.integer({ max: -1, min: -4 }),
    fc.integer({ max: 4, min: 1 }),
  ),
  targetKind: fc.constantFrom<TargetKind>("identifier", "member"),
});

function initialValue(testCase: CompoundAssignmentCase): number | null {
  return testCase.operator === "??" && testCase.nullish ? null : testCase.left;
}

function binaryResult(
  operator: Exclude<Operator, "&&" | "??" | "||">,
  left: number,
  right: number,
): number {
  if (operator === "%") return left % right;
  if (operator === "&") return left & right;
  if (operator === "*") return left * right;
  if (operator === "**") return left ** right;
  if (operator === "+") return left + right;
  if (operator === "-") return left - right;
  if (operator === "/") return left / right;
  if (operator === "<<") return left << right;
  if (operator === ">>") return left >> right;
  if (operator === ">>>") return left >>> right;
  if (operator === "^") return left ^ right;
  return left | right;
}

function expected(testCase: CompoundAssignmentCase) {
  const left = initialValue(testCase);
  if (testCase.operator === "&&") {
    return {
      result: left === 0 ? left : testCase.right,
      rightCount: left === 0 ? 0 : 1,
      writeCount: left === 0 ? 0 : 1,
    };
  }
  if (testCase.operator === "||") {
    return {
      result: left === 0 ? testCase.right : left,
      rightCount: left === 0 ? 1 : 0,
      writeCount: left === 0 ? 1 : 0,
    };
  }
  if (testCase.operator === "??") {
    return {
      result: left == null ? testCase.right : left,
      rightCount: left == null ? 1 : 0,
      writeCount: left == null ? 1 : 0,
    };
  }
  return {
    result: binaryResult(testCase.operator, testCase.left, testCase.right),
    rightCount: 1,
    writeCount: 1,
  };
}

function printCase(testCase: CompoundAssignmentCase): string {
  const initial = initialValue(testCase);
  const target =
    testCase.targetKind === "member" ? "object()[key()]" : "target";
  return `
let objectCount = 0;
let keyCount = 0;
let conversionCount = 0;
let rightCount = 0;
const holder = { value: ${String(initial)} };
const propertyKey = {
  [Symbol.toPrimitive]: function () {
    conversionCount += 1;
    return "value";
  },
};
let target = ${String(initial)};
function object() {
  objectCount += 1;
  return holder;
}
function key() {
  keyCount += 1;
  return propertyKey;
}
function right() {
  rightCount += 1;
  return ${testCase.right};
}
const result = ${target} ${testCase.operator}= right();
console.log(
  "" + result,
  "" + ${testCase.targetKind === "member" ? "holder.value" : "target"},
  objectCount,
  keyCount,
  conversionCount,
  rightCount,
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
    "oseo-compound-assignment-property-",
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

test("compound assignment model keeps short-circuit writes conditional", () => {
  assert.deepEqual(
    expected({
      left: 1,
      nullish: false,
      operator: "||",
      right: 2,
      targetKind: "identifier",
    }),
    { result: 1, rightCount: 0, writeCount: 0 },
  );
});

test(
  "generated compound assignments match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "compound assignments preserve reference and short-circuit behavior",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const modeled = expected(testCase);
        const memberCount = testCase.targetKind === "member" ? 1 : 0;
        const conversionCount = memberCount * (1 + modeled.writeCount);
        const result = String(modeled.result);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout:
            `${result} ${result} ${memberCount} ${memberCount} ` +
            `${conversionCount} ${modeled.rightCount}\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-compound-assignment.js" },
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
          "all compound operators over identifier and computed member " +
          "targets with observable property-key conversion, bounded " +
          "integers, and direct nullish cases",
        numRuns: 10,
        profile: "M5 compound assignment",
        seed: 0x6000_0c00,
        sizeLimit: "one target, one right operand, and bounded integers",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
