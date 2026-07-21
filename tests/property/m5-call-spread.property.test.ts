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

const { assertAsyncProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type CallKind = "dynamic" | "intrinsic" | "method";
type SpreadMode =
  | "array"
  | "captured-next"
  | "custom"
  | "non-iterable"
  | "throw-next";

interface CallSpreadCase {
  readonly callKind: CallKind;
  readonly mode: SpreadMode;
  readonly prefix: number;
  readonly secondValues: readonly number[];
  readonly suffix: number;
  readonly throwRaw: number;
  readonly values: readonly number[];
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const large = propertySize() === "large";
const caseArbitrary = fc.record({
  callKind: fc.constantFrom<CallKind>("dynamic", "intrinsic", "method"),
  mode: fc.constantFrom<SpreadMode>(
    "array",
    "captured-next",
    "custom",
    "non-iterable",
    "throw-next",
  ),
  prefix: fc.integer({ max: 20, min: -20 }),
  secondValues: fc.array(fc.integer({ max: 20, min: -20 }), {
    maxLength: large ? 9 : 5,
  }),
  suffix: fc.integer({ max: 20, min: -20 }),
  throwRaw: fc.nat({ max: large ? 9 : 5 }),
  values: fc.array(fc.integer({ max: 20, min: -20 }), {
    maxLength: large ? 9 : 5,
  }),
});

function throwIndex(testCase: CallSpreadCase): number {
  return testCase.throwRaw % (testCase.values.length + 1);
}

function iterableSource(testCase: CallSpreadCase): string {
  if (testCase.mode === "array") return "const iterable = values;";
  if (testCase.mode === "non-iterable") return "const iterable = 5;";
  const captured =
    testCase.mode === "captured-next"
      ? "this.next = function () { return { done: true }; };"
      : "";
  const throwing =
    testCase.mode === "throw-next"
      ? `if (index === ${throwIndex(testCase)}) { ` +
        'throw new RangeError("step"); }'
      : "";
  return `
const iterable = {
  [Symbol.iterator]: function () {
    let index = 0;
    return {
      next: function () {
        steps = steps + 1;
        ${captured}
        ${throwing}
        const done = index >= values.length;
        const value = done ? undefined : values[index];
        index = index + 1;
        return { value: value, done: done };
      },
      return: function () {
        closes = closes + 1;
        return {};
      },
    };
  },
};
`;
}

const parameterNames = Array.from({ length: 20 }, (_, index) => `a${index}`);

function callSupportSource(callKind: CallKind): string {
  if (callKind === "intrinsic") return "";
  const label = callKind === "dynamic" ? "dynamic" : "method";
  const report = `function (${parameterNames.join(", ")}) {
    console.log("${label}", ${parameterNames.join(", ")});
  }`;
  if (callKind === "dynamic") {
    return `
const dynamicReport = ${report};
function selectSpreadCall() {
  mark("target", undefined);
  return dynamicReport;
}
`;
  }
  return `
const receiver = { label: "method", report: ${report} };
`;
}

function callSource(callKind: CallKind, argumentsSource: string): string {
  if (callKind === "intrinsic") {
    return `console.log("intrinsic", ${argumentsSource});`;
  }
  if (callKind === "dynamic") {
    return `selectSpreadCall()(${argumentsSource});`;
  }
  return (
    'mark("receiver", receiver)[mark("key", "report")](' +
    `${argumentsSource});`
  );
}

function printCase(testCase: CallSpreadCase): string {
  const argumentsSource =
    `mark("prefix", ${testCase.prefix}), ` +
    `...mark("spread", iterable), ` +
    `...mark("second", secondValues), ` +
    `mark("suffix", ${testCase.suffix})`;
  return `
let steps = 0;
let closes = 0;
let order = "";
function mark(label, value) {
  order = order === "" ? label : order + "," + label;
  return value;
}
const values = [${testCase.values.join(", ")}];
const secondValues = [${testCase.secondValues.join(", ")}];
${iterableSource(testCase)}
${callSupportSource(testCase.callKind)}
try {
  ${callSource(testCase.callKind, argumentsSource)}
} catch (error) {
  console.log("error", error.name);
}
console.log("state", steps, closes, order);
`;
}

function orderPrefix(callKind: CallKind): readonly string[] {
  if (callKind === "dynamic") return ["target"];
  if (callKind === "method") return ["receiver", "key"];
  return [];
}

function expectedOutput(testCase: CallSpreadCase): string {
  const beforeSpread = [...orderPrefix(testCase.callKind), "prefix", "spread"];
  if (testCase.mode === "non-iterable") {
    return `error TypeError\nstate 0 0 ${beforeSpread.join(",")}\n`;
  }
  if (testCase.mode === "throw-next") {
    return (
      "error RangeError\n" +
      `state ${throwIndex(testCase) + 1} 0 ${beforeSpread.join(",")}\n`
    );
  }
  const values = [
    testCase.prefix,
    ...testCase.values,
    ...testCase.secondValues,
    testCase.suffix,
  ];
  const printed =
    testCase.callKind === "intrinsic"
      ? values
      : [
          ...values,
          ...Array.from(
            { length: parameterNames.length - values.length },
            () => undefined,
          ),
        ];
  const steps = testCase.mode === "array" ? 0 : testCase.values.length + 1;
  const order = [...beforeSpread, "second", "suffix"].join(",");
  return (
    `${testCase.callKind} ${printed.map(String).join(" ")}\n` +
    `state ${steps} 0 ${order}\n`
  );
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
    "oseo-call-spread-property-",
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

test(
  "generated call spread cases match the M5 argument-list model",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    await assertAsyncProperty(
      "call spread preserves generated argument observations",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expected = {
          exitStatus: 0,
          stderr: "",
          stdout: expectedOutput(testCase),
        };
        const referenceResults = await references(source);
        assertMatchingObservations([expected, ...referenceResults]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-call-spread.js" },
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
              (native) => assertMatchingObservations([expected, native]),
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
          "mixed arguments for intrinsic, method, and dynamic calls with " +
          "custom iterables, captured next, and abrupt steps",
        numRuns: 10,
        profile: "M5 call spread and dynamic argument accumulation",
        seed: 0x5eed_0006,
        sizeLimit: large
          ? "9 values in each spread"
          : "5 values in each spread",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
