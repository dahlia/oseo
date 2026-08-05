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

type CauseKind = "absent" | "getter" | "value";
type IterableKind = "array" | "custom";
type MessageKind = "absent" | "object" | "string";
type ValueKind = "number" | "string";

interface ErrorValue {
  readonly kind: ValueKind;
  readonly value: number;
}

interface AggregateErrorCase {
  readonly causeKind: CauseKind;
  readonly causeValue: number;
  readonly errors: readonly ErrorValue[];
  readonly iterableKind: IterableKind;
  readonly messageKind: MessageKind;
  readonly messageValue: number;
}

interface AggregateErrorModel {
  readonly cause: string;
  readonly errors: readonly string[];
  readonly hasCause: boolean;
  readonly message: string;
  readonly order: string;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const valueArbitrary: fc.Arbitrary<ErrorValue> = fc.record({
  kind: fc.constantFrom<ValueKind>("number", "string"),
  value: fc.integer({ max: 20, min: -20 }),
});
const caseArbitrary: fc.Arbitrary<AggregateErrorCase> = fc.record({
  causeKind: fc.constantFrom<CauseKind>("absent", "getter", "value"),
  causeValue: fc.integer({ max: 20, min: -20 }),
  errors: fc.array(valueArbitrary, { maxLength: 3 }),
  iterableKind: fc.constantFrom<IterableKind>("array", "custom"),
  messageKind: fc.constantFrom<MessageKind>("absent", "object", "string"),
  messageValue: fc.integer({ max: 20, min: -20 }),
});

function errorValue(value: ErrorValue): string | number {
  return value.kind === "number" ? value.value : `s${value.value}`;
}

function model(testCase: AggregateErrorCase): AggregateErrorModel {
  const errors = testCase.errors.map((value) => String(errorValue(value)));
  const message =
    testCase.messageKind === "absent" ? "" : `m${testCase.messageValue}`;
  let order = testCase.messageKind === "object" ? "message " : "";
  if (testCase.causeKind === "getter") order += "cause ";
  if (testCase.iterableKind === "custom") {
    order += "iterator ";
    for (let index = 0; index < testCase.errors.length; index += 1) {
      order += "next value ";
    }
    order += "next ";
  }
  return {
    cause:
      testCase.causeKind === "absent"
        ? "undefined"
        : String(testCase.causeValue),
    errors,
    hasCause: testCase.causeKind !== "absent",
    message,
    order,
  };
}

function errorsSource(testCase: AggregateErrorCase): string {
  const values = testCase.errors
    .map(errorValue)
    .map((value) => JSON.stringify(value))
    .join(", ");
  if (testCase.iterableKind === "array") return `[${values}]`;
  return `{
  [Symbol.iterator]: function () {
    order = order + "iterator ";
    const values = [${values}];
    let index = 0;
    return {
      next: function () {
        order = order + "next ";
        if (index === values.length) return { done: true };
        const value = values[index];
        index = index + 1;
        return {
          done: false,
          get value() { order = order + "value "; return value; },
        };
      },
    };
  },
}`;
}

function messageSource(testCase: AggregateErrorCase): string | undefined {
  if (testCase.messageKind === "absent") return undefined;
  if (testCase.messageKind === "string") {
    return JSON.stringify(`m${testCase.messageValue}`);
  }
  return `{
  toString: function () {
    order = order + "message ";
    return ${JSON.stringify(`m${testCase.messageValue}`)};
  },
}`;
}

function optionsSource(testCase: AggregateErrorCase): string | undefined {
  if (testCase.causeKind === "absent") return undefined;
  if (testCase.causeKind === "value") {
    return `{ cause: ${testCase.causeValue} }`;
  }
  return `{
  get cause() {
    order = order + "cause ";
    return ${testCase.causeValue};
  },
}`;
}

function printCase(testCase: AggregateErrorCase): string {
  const argumentsList = [
    errorsSource(testCase),
    messageSource(testCase),
    optionsSource(testCase),
  ];
  while (argumentsList.at(-1) == null) argumentsList.pop();
  const argumentsSource = argumentsList
    .map((value) => value ?? "undefined")
    .join(", ");
  return `
let order = "";
const error = new AggregateError(${argumentsSource});
console.log(
  "identity",
  error instanceof AggregateError,
  error instanceof Error,
  error.name,
);
console.log(
  "fields",
  error.message,
  "cause" in error,
  error.cause,
  error.errors.length,
);
for (let index = 0; index < error.errors.length; index = index + 1) {
  console.log("error", index, error.errors[index]);
}
console.log("order", order);
`;
}

function expected(testCase: AggregateErrorCase): string {
  const result = model(testCase);
  const lines = [
    "identity true true AggregateError",
    `fields ${result.message} ${result.hasCause} ${result.cause} ` +
      `${result.errors.length}`,
    ...result.errors.map((value, index) => `error ${index} ${value}`),
    `order ${result.order}`,
  ];
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
    "oseo-aggregate-error-property-",
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

test("aggregate error model fixes construction order", () => {
  assert.equal(
    model({
      causeKind: "getter",
      causeValue: 3,
      errors: [
        { kind: "number", value: 1 },
        { kind: "string", value: 2 },
      ],
      iterableKind: "custom",
      messageKind: "object",
      messageValue: 4,
    }).order,
    "message cause iterator next value next value next ",
  );
});

test(
  "generated aggregate errors match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "AggregateError preserves errors, options, and construction order",
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
            { source, sourceId: "generated-m5-aggregate-error.ts" },
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
          "AggregateError over zero to three bounded primitive errors, " +
          "array and custom iterables, absent, string, and object messages, " +
          "and absent, data, and getter cause options",
        numRuns: 12,
        profile: "M5 AggregateError and error options",
        seed: 0x6000_2f00,
        sizeLimit: "zero to three errors with bounded integer payloads",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
