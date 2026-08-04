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

type ArgumentKind = "number" | "string";
type ElementKind = "accessor" | "field" | "method";
type ReceiverKind = "invalid" | "null" | "undefined" | "valid";

interface OptionalPrivateCase {
  readonly argument: number;
  readonly argumentKind: ArgumentKind;
  readonly elementKind: ElementKind;
  readonly receiverKind: ReceiverKind;
  readonly value: number;
}

interface OptionalPrivateModel {
  readonly order: string;
  readonly result?: number | string;
  readonly throwsTypeError: boolean;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<OptionalPrivateCase> = fc.record({
  argument: fc.integer({ max: 20, min: -20 }),
  argumentKind: fc.constantFrom<ArgumentKind>("number", "string"),
  elementKind: fc.constantFrom<ElementKind>("accessor", "field", "method"),
  receiverKind: fc.constantFrom<ReceiverKind>(
    "invalid",
    "null",
    "undefined",
    "valid",
  ),
  value: fc.integer({ max: 20, min: -20 }),
});

function argumentValue(testCase: OptionalPrivateCase): number | string {
  return testCase.argumentKind === "number"
    ? testCase.argument
    : `s${testCase.argument}`;
}

function expected(testCase: OptionalPrivateCase): OptionalPrivateModel {
  if (
    testCase.receiverKind === "null" ||
    testCase.receiverKind === "undefined"
  ) {
    return { order: "base ", throwsTypeError: false };
  }
  if (testCase.receiverKind === "invalid") {
    return { order: "base ", throwsTypeError: true };
  }
  if (testCase.elementKind === "field") {
    return {
      order: "base ",
      result: testCase.value,
      throwsTypeError: false,
    };
  }
  if (testCase.elementKind === "accessor") {
    return {
      order: "base get ",
      result: testCase.value,
      throwsTypeError: false,
    };
  }
  const argument = argumentValue(testCase);
  return {
    order: "base argument call ",
    result:
      typeof argument === "number"
        ? testCase.value + argument
        : `${testCase.value}${argument}`,
    throwsTypeError: false,
  };
}

function receiverSource(kind: ReceiverKind): string {
  if (kind === "invalid") return "invalid";
  if (kind === "null") return "null";
  if (kind === "undefined") return "undefined";
  return "valid";
}

function expressionSource(testCase: OptionalPrivateCase): string {
  const receiver = receiverSource(testCase.receiverKind);
  if (testCase.elementKind === "field") {
    return `base(${receiver})?.#field`;
  }
  if (testCase.elementKind === "accessor") {
    return `base(${receiver})?.#accessor`;
  }
  return `base(${receiver})?.#method(argument())`;
}

function printCase(testCase: OptionalPrivateCase): string {
  const argument = JSON.stringify(argumentValue(testCase));
  return `
let order = "";
function hintedAdd(left: number, right: number) {
  return left + right;
}
class Box {
  #field;
  constructor(value) {
    this.#field = value;
  }
  get #accessor() {
    order = order + "get ";
    return this.#field;
  }
  #method(value) {
    order = order + "call ";
    return hintedAdd(this.#field, value);
  }
  static read(receiver) {
    try {
      const result = ${expressionSource(testCase)};
      console.log("result", result, "order", order);
    } catch (error) {
      console.log("error", error instanceof TypeError, "order", order);
    }
  }
}
const valid = new Box(${testCase.value});
const invalid = {};
function base(value) {
  order = order + "base ";
  return value;
}
function argument() {
  order = order + "argument ";
  return ${argument};
}
Box.read(${receiverSource(testCase.receiverKind)});
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
    "oseo-optional-private-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(sourcePath, source);
    const observations = [
      await host.run({
        args: ["--experimental-strip-types", sourcePath],
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

test("optional private model keeps the brand check after the guard", () => {
  assert.deepEqual(
    expected({
      argument: 2,
      argumentKind: "number",
      elementKind: "method",
      receiverKind: "null",
      value: 3,
    }),
    { order: "base ", throwsTypeError: false },
  );
  assert.deepEqual(
    expected({
      argument: 2,
      argumentKind: "number",
      elementKind: "accessor",
      receiverKind: "invalid",
      value: 3,
    }),
    { order: "base ", throwsTypeError: true },
  );
});

test(
  "generated optional private access matches the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "optional private access preserves guards, brands, and receivers",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const modeled = expected(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: modeled.throwsTypeError
            ? `error true order ${modeled.order}\n`
            : `result ${modeled.result ?? "undefined"} order ` +
              `${modeled.order}\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-optional-private.ts" },
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
          "optional private field, accessor, and method access over null, " +
          "undefined, valid-brand, and invalid-brand receivers with " +
          "bounded values, argument effects, and truthful or false hints",
        numRuns: 12,
        profile: "M5 optional private access",
        seed: 0x5eed_003c,
        sizeLimit:
          "one optional private access with bounded values and effects",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
