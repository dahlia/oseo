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
import type { FixtureObservation } from "../../packages/testkit/src/index.ts";
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type ArithmeticOperator =
  | "%"
  | "&"
  | "*"
  | "**"
  | "+"
  | "-"
  | "/"
  | "<<"
  | ">>"
  | ">>>"
  | "^"
  | "|";
type ComparisonOperator = "<" | "<=" | "==" | "===" | ">" | ">=";
type Radix = 2 | 8 | 10 | 16;

interface Operand {
  readonly radix: Radix;
  readonly value: number;
}

interface ArithmeticCase {
  readonly form: "assignment" | "binary";
  readonly hint: "bigint" | "none" | "number";
  readonly kind: "arithmetic";
  readonly left: Operand;
  readonly operator: ArithmeticOperator;
  readonly right: Operand;
}

interface ComparisonCase {
  readonly kind: "comparison";
  readonly left: Operand;
  readonly operator: ComparisonOperator;
  readonly right: Operand;
}

interface MixedCase {
  readonly bigint: Operand;
  readonly kind: "mixed";
  readonly numberOnLeft: boolean;
  readonly operator: Exclude<ArithmeticOperator, ">>>">;
}

interface UnaryCase {
  readonly kind: "unary";
  readonly operand: Operand;
  readonly operator: "+" | "-" | "--" | "++" | "~";
  readonly prefix: boolean;
}

type BigIntCase = ArithmeticCase | ComparisonCase | MixedCase | UnaryCase;

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const radixArbitrary = fc.constantFrom<Radix>(2, 8, 10, 16);

function operandArbitrary(min: number, max: number): fc.Arbitrary<Operand> {
  return fc.record({
    radix: radixArbitrary,
    value: fc.integer({ max, min }),
  });
}

const ordinaryOperand = operandArbitrary(-10_000, 10_000);
const nonzeroOperand = fc.oneof(
  operandArbitrary(-10_000, -1),
  operandArbitrary(1, 10_000),
);
const shiftOperand = operandArbitrary(-6, 6);
const exponentBase = operandArbitrary(-12, 12);
const exponent = operandArbitrary(0, 6);
const arithmeticArbitrary: fc.Arbitrary<ArithmeticCase> = fc.oneof(
  fc.record({
    form: fc.constantFrom("assignment", "binary"),
    hint: fc.constantFrom("bigint", "none", "number"),
    kind: fc.constant("arithmetic"),
    left: ordinaryOperand,
    operator: fc.constantFrom("+", "-", "*", "&", "|", "^"),
    right: ordinaryOperand,
  }),
  fc.record({
    form: fc.constantFrom("assignment", "binary"),
    hint: fc.constant("none"),
    kind: fc.constant("arithmetic"),
    left: ordinaryOperand,
    operator: fc.constantFrom("/", "%"),
    right: nonzeroOperand,
  }),
  fc.record({
    form: fc.constantFrom("assignment", "binary"),
    hint: fc.constant("none"),
    kind: fc.constant("arithmetic"),
    left: exponentBase,
    operator: fc.constant("**"),
    right: exponent,
  }),
  fc.record({
    form: fc.constantFrom("assignment", "binary"),
    hint: fc.constant("none"),
    kind: fc.constant("arithmetic"),
    left: ordinaryOperand,
    operator: fc.constantFrom("<<", ">>", ">>>"),
    right: shiftOperand,
  }),
);
const caseArbitrary: fc.Arbitrary<BigIntCase> = fc.oneof(
  arithmeticArbitrary,
  fc.record({
    kind: fc.constant("comparison"),
    left: ordinaryOperand,
    operator: fc.constantFrom("<", "<=", "==", "===", ">", ">="),
    right: ordinaryOperand,
  }),
  fc.record({
    bigint: ordinaryOperand,
    kind: fc.constant("mixed"),
    numberOnLeft: fc.boolean(),
    operator: fc.constantFrom(
      "+",
      "-",
      "*",
      "/",
      "%",
      "**",
      "&",
      "|",
      "^",
      "<<",
      ">>",
    ),
  }),
  fc.record({
    kind: fc.constant("unary"),
    operand: ordinaryOperand,
    operator: fc.constantFrom("+", "-", "~", "++", "--"),
    prefix: fc.boolean(),
  }),
);

function literal(operand: Operand): string {
  const magnitude = Math.abs(operand.value).toString(operand.radix);
  const prefix =
    operand.radix === 2
      ? "0b"
      : operand.radix === 8
        ? "0o"
        : operand.radix === 16
          ? "0x"
          : "";
  return `${operand.value < 0 ? "-" : ""}${prefix}${magnitude}n`;
}

function arithmeticValue(testCase: ArithmeticCase): number | "TypeError" {
  const left = testCase.left.value;
  const right = testCase.right.value;
  switch (testCase.operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return Math.trunc(left / right);
    case "%":
      return left - Math.trunc(left / right) * right;
    case "**":
      return left ** right;
    case "&":
      return left & right;
    case "|":
      return left | right;
    case "^":
      return left ^ right;
    case "<<":
      return right < 0 ? left >> -right : left << right;
    case ">>":
      return right < 0 ? left << -right : left >> right;
    case ">>>":
      return "TypeError";
  }
}

function expected(testCase: BigIntCase): string {
  if (testCase.kind === "mixed") return "error TypeError\n";
  if (testCase.kind === "comparison") {
    const left = testCase.left.value;
    const right = testCase.right.value;
    const result =
      testCase.operator === "<"
        ? left < right
        : testCase.operator === "<="
          ? left <= right
          : testCase.operator === ">"
            ? left > right
            : testCase.operator === ">="
              ? left >= right
              : left === right;
    return `value ${String(result)}\n`;
  }
  if (testCase.kind === "unary") {
    const value = testCase.operand.value;
    if (testCase.operator === "+") return "error TypeError\n";
    if (testCase.operator === "~") return `value ${String(~value)}\n`;
    if (testCase.operator === "-") return `value ${String(-value)}\n`;
    const stored = value + (testCase.operator === "++" ? 1 : -1);
    const result = testCase.prefix ? stored : value;
    return `value ${String(result)} ${String(stored)}\n`;
  }
  const value = arithmeticValue(testCase);
  return value === "TypeError"
    ? "error TypeError\n"
    : testCase.form === "assignment"
      ? `value ${String(value)} ${String(value)}\n`
      : `value ${String(value)}\n`;
}

function printCase(testCase: BigIntCase): string {
  if (testCase.kind === "mixed") {
    const bigint = `(${literal(testCase.bigint)})`;
    const left = testCase.numberOnLeft ? "1" : bigint;
    const right = testCase.numberOnLeft ? bigint : "1";
    return `try {
  console.log("value", ${left} ${testCase.operator} ${right});
} catch (error) {
  console.log("error", error.name);
}\n`;
  }
  if (testCase.kind === "comparison") {
    return `console.log(
  "value",
  ${literal(testCase.left)} ${testCase.operator} ${literal(testCase.right)},
);\n`;
  }
  if (testCase.kind === "unary") {
    const operand = literal(testCase.operand);
    if (testCase.operator === "++" || testCase.operator === "--") {
      const update = testCase.prefix
        ? `${testCase.operator}value`
        : `value${testCase.operator}`;
      return `let value = ${operand};
console.log("value", ${update}, value);\n`;
    }
    return `try {
  console.log("value", ${testCase.operator}(${operand}));
} catch (error) {
  console.log("error", error.name);
}\n`;
  }
  const left = `(${literal(testCase.left)})`;
  const right = `(${literal(testCase.right)})`;
  const expression =
    testCase.form === "assignment"
      ? `let value = ${left};
const result = value ${testCase.operator}= ${right};`
      : testCase.operator === "+" && testCase.hint !== "none"
        ? `/** @param {${testCase.hint}} left
 * @param {${testCase.hint}} right */
function operate(left, right) { return left + right; }
const result = operate(${left}, ${right});`
        : `const result = ${left} ${testCase.operator} ${right};`;
  const stored = testCase.form === "assignment" ? ", value" : "";
  return `try {
  ${expression}
  console.log("value", result${stored});
} catch (error) {
  console.log("error", error.name);
}\n`;
}

async function references(
  source: string,
): Promise<readonly FixtureObservation[]> {
  const directory = await host.makeTemporaryDirectory("oseo-bigint-property-");
  const sourcePath = `${directory}/case.js`;
  let succeeded = false;
  try {
    const referenceSource = `
const oseoReferenceConsole = console;
Object.defineProperty(globalThis, "console", {
  value: {
    log(...values) {
      oseoReferenceConsole.log(values.map(String).join(" "));
    },
  },
});
${source}`;
    await host.writeTextFile(sourcePath, referenceSource);
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
    ];
    succeeded = true;
    return observations;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test("parenthesizes a negative BigInt unary operand", async () => {
  const testCase: UnaryCase = {
    kind: "unary",
    operand: { radix: 2, value: -1 },
    operator: "-",
    prefix: false,
  };
  const source = printCase(testCase);
  assert.match(source, /-\(-0b1n\)/u);
  assertMatchingObservations([
    { exitStatus: 0, stderr: "", stdout: expected(testCase) },
    ...(await references(source)),
  ]);
});

test("parenthesizes a negative BigInt exponentiation base", async () => {
  const testCase: ArithmeticCase = {
    form: "binary",
    hint: "none",
    kind: "arithmetic",
    left: { radix: 2, value: -1 },
    operator: "**",
    right: { radix: 2, value: 0 },
  };
  const source = printCase(testCase);
  assert.match(source, /\(-0b1n\) \*\* \(0b0n\)/u);
  assertMatchingObservations([
    { exitStatus: 0, stderr: "", stdout: expected(testCase) },
    ...(await references(source)),
  ]);
});

test("parenthesizes a negative mixed exponentiation base", async () => {
  const testCase: MixedCase = {
    bigint: { radix: 2, value: -1 },
    kind: "mixed",
    numberOnLeft: false,
    operator: "**",
  };
  const source = printCase(testCase);
  assert.match(source, /\(-0b1n\) \*\* 1/u);
  assertMatchingObservations([
    { exitStatus: 0, stderr: "", stdout: expected(testCase) },
    ...(await references(source)),
  ]);
});

test(
  "generated BigInt operations match the independent integer model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "BigInt primitive operations preserve exact bounded integer semantics",
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
            { source, sourceId: "generated-m5-bigint.js" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
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
              (native) => {
                assertMatchingObservations([expectedObservation, native]);
                if (
                  testCase.kind === "arithmetic" &&
                  testCase.operator === "+" &&
                  testCase.form === "binary" &&
                  testCase.hint === "number"
                ) {
                  assert.equal(native.counters?.genericAdditionCalls, 1);
                  if (specialization === "enabled") {
                    assert.equal(native.counters?.guardMisses, 1);
                  }
                }
                assert.ok((native.counters?.collections ?? 0) > 0);
              },
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
          "directly generated radix 2, 8, 10, and 16 BigInt operands for " +
          "arithmetic, bitwise, shift, comparison, compound assignment, " +
          "update, mixed numeric error, false number hint, and bigint hint",
        numRuns: 10,
        profile: "M5a BigInt primitive",
        seed: 0x6000_0800,
        sizeLimit:
          "one operation over magnitudes at most 10000, shift counts at " +
          "most 6, and exponents at most 6",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
