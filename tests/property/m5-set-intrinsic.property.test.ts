/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  printMir,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type ValueToken =
  | "minus-zero"
  | "nan"
  | "object-a"
  | "object-b"
  | "one"
  | "text-a"
  | "text-b"
  | "two"
  | "zero";

interface SetOperation {
  readonly kind: "add" | "clear" | "delete" | "has" | "iterate";
  readonly value?: ValueToken;
}

interface SetCase {
  readonly initial: readonly ValueToken[];
  readonly operations: readonly SetOperation[];
}

const valueArbitrary = fc.constantFrom<ValueToken>(
  "minus-zero",
  "nan",
  "object-a",
  "object-b",
  "one",
  "text-a",
  "text-b",
  "two",
  "zero",
);

const operationArbitrary: fc.Arbitrary<SetOperation> = fc.oneof(
  fc.record({ kind: fc.constant("add"), value: valueArbitrary }),
  fc.record({ kind: fc.constant("delete"), value: valueArbitrary }),
  fc.record({ kind: fc.constant("has"), value: valueArbitrary }),
  fc.record({ kind: fc.constant("clear") }),
  fc.record({ kind: fc.constant("iterate") }),
);

const caseArbitrary: fc.Arbitrary<SetCase> = fc.record({
  initial: fc.array(valueArbitrary, { maxLength: 7 }),
  operations: fc.array(operationArbitrary, { maxLength: 12, minLength: 1 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function expression(token: ValueToken): string {
  switch (token) {
    case "minus-zero":
      return "-0";
    case "nan":
      return "NaN";
    case "object-a":
      return "objectA";
    case "object-b":
      return "objectB";
    case "one":
      return "1";
    case "text-a":
      return '"a"';
    case "text-b":
      return '"b"';
    case "two":
      return "2";
    case "zero":
      return "0";
  }
}

function label(token: ValueToken): string {
  if (token === "minus-zero" || token === "zero") return "zero";
  return token;
}

function printOperation(operation: SetOperation): string {
  if (operation.kind === "clear") {
    return 'set.clear(); console.log("clear", set.size);';
  }
  if (operation.kind === "iterate") {
    return `for (const value of set) console.log("value", label(value));
console.log("iterate", set.size);`;
  }
  assert(operation.value != null);
  const value = expression(operation.value);
  if (operation.kind === "add") {
    return `console.log(
  "add",
  label(${value}),
  set.add(${value}) === set,
  set.size,
);`;
  }
  return `console.log(
  "${operation.kind}",
  label(${value}),
  set.${operation.kind}(${value}),
  set.size,
);`;
}

function printCase(testCase: SetCase): string {
  return `
const objectA = {};
const objectB = {};
function label(value) {
  if (value !== value) return "nan";
  if (value === 0) return "zero";
  if (value === objectA) return "object-a";
  if (value === objectB) return "object-b";
  if (value === 1) return "one";
  if (value === 2) return "two";
  if (value === "a") return "text-a";
  return "text-b";
}
const set = new Set([${testCase.initial.map(expression).join(", ")}]);
console.log("initial", set.size);
${testCase.operations.map(printOperation).join("\n")}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
`;
}

interface ModelElement {
  readonly token: ValueToken;
  present: boolean;
}

function sameToken(left: ValueToken, right: ValueToken): boolean {
  if (
    (left === "minus-zero" || left === "zero") &&
    (right === "minus-zero" || right === "zero")
  ) {
    return true;
  }
  return left === right;
}

function findPresent(
  elements: readonly ModelElement[],
  token: ValueToken,
): number {
  return elements.findIndex(
    (element) => element.present && sameToken(element.token, token),
  );
}

function addModel(elements: ModelElement[], token: ValueToken): void {
  if (findPresent(elements, token) >= 0) return;
  elements.push({
    present: true,
    token: token === "minus-zero" ? "zero" : token,
  });
}

function expected(testCase: SetCase): string {
  const elements: ModelElement[] = [];
  for (const token of testCase.initial) addModel(elements, token);
  const lines = [
    `initial ${elements.filter((element) => element.present).length}`,
  ];
  for (const operation of testCase.operations) {
    if (operation.kind === "iterate") {
      for (const element of elements) {
        if (element.present) lines.push(`value ${label(element.token)}`);
      }
      lines.push(
        `iterate ${elements.filter((element) => element.present).length}`,
      );
      continue;
    }
    if (operation.kind === "clear") {
      for (const element of elements) element.present = false;
      lines.push("clear 0");
      continue;
    }
    assert(operation.value != null);
    const index = findPresent(elements, operation.value);
    if (operation.kind === "add") {
      addModel(elements, operation.value);
      lines.push(
        `add ${label(operation.value)} true ` +
          elements.filter((element) => element.present).length,
      );
      continue;
    }
    if (operation.kind === "delete") {
      if (index >= 0) elements[index]!.present = false;
      lines.push(
        `delete ${label(operation.value)} ${String(index >= 0)} ` +
          elements.filter((element) => element.present).length,
      );
      continue;
    }
    lines.push(
      `has ${label(operation.value)} ${String(index >= 0)} ` +
        elements.filter((element) => element.present).length,
    );
  }
  lines.push("hint 5 23", "");
  return lines.join("\n");
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
  const directory = await host.makeTemporaryDirectory("oseo-set-property-");
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
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

test(
  "generated Set observations match the insertion-order model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Set add, delete, has, clear, and iteration agree",
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
            { source, sourceId: "generated-m5-set.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /generic-fallback/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:smi|shape)/u);
          }
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
                toolchain: nativeToolchain,
              },
              (native) => {
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters?.collections != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "enabled") {
                  assert.ok(native.counters.guardHits > 0);
                  assert.ok(native.counters.guardMisses > 0);
                }
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
          "zero to seven initial values drawn from bounded numbers, both " +
          "zero signs, NaN, strings, and two stable object identities, " +
          "followed by one to twelve add, delete, has, clear, or ordered " +
          "iteration operations, plus truthful and false number hints",
        numRuns: 12,
        profile: "M5 Set intrinsic",
        seed: 0x6000_6b00,
        sizeLimit:
          "at most seven initial values and twelve operations over nine " +
          "reviewed value tokens, one Set, and two stable object identities",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
