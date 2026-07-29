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

type BaseKind = "null" | "object" | "undefined";
type ChainKind =
  | "call"
  | "computed"
  | "grouped-method-call"
  | "member"
  | "member-call"
  | "optional-method-call"
  | "sequence";

interface OptionalChainCase {
  readonly argument: number;
  readonly baseKind: BaseKind;
  readonly chainKind: ChainKind;
  readonly nestedNullish: boolean;
  readonly value: number;
}

interface OptionalChainModel {
  readonly order: string;
  readonly result?: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<OptionalChainCase> = fc.record({
  argument: fc.integer({ max: 20, min: -20 }),
  baseKind: fc.constantFrom<BaseKind>("null", "object", "undefined"),
  chainKind: fc.constantFrom<ChainKind>(
    "call",
    "computed",
    "grouped-method-call",
    "member",
    "member-call",
    "optional-method-call",
    "sequence",
  ),
  nestedNullish: fc.boolean(),
  value: fc.integer({ max: 20, min: -20 }),
});

function nullishSource(kind: BaseKind): string {
  if (kind === "null") return "null";
  if (kind === "undefined") return "undefined";
  return "holder";
}

function expressionSource(testCase: OptionalChainCase): string {
  if (testCase.chainKind === "call") {
    const base =
      testCase.baseKind === "object"
        ? "callable"
        : nullishSource(testCase.baseKind);
    return `base(${base})?.(argument())`;
  }
  if (testCase.chainKind === "optional-method-call") {
    const method =
      testCase.baseKind === "object"
        ? "callable"
        : nullishSource(testCase.baseKind);
    return `base({ method: ${method} }).method?.(argument())`;
  }
  const base = nullishSource(testCase.baseKind);
  if (testCase.chainKind === "computed") {
    return `base(${base})?.[key()]`;
  }
  if (testCase.chainKind === "grouped-method-call") {
    return `(base(${base})?.method)?.(argument())`;
  }
  if (testCase.chainKind === "member") return `base(${base})?.value`;
  if (testCase.chainKind === "member-call") {
    return `base(${base})?.method(argument())`;
  }
  return `base(${base})?.nested?.[key()]`;
}

function expected(testCase: OptionalChainCase): OptionalChainModel {
  const baseNullish =
    testCase.baseKind === "null" || testCase.baseKind === "undefined";
  if (testCase.chainKind === "optional-method-call") {
    return baseNullish
      ? { order: "base " }
      : {
          order: "base argument call ",
          result: testCase.value + testCase.argument,
        };
  }
  if (baseNullish) return { order: "base " };
  if (testCase.chainKind === "computed") {
    return { order: "base key ", result: testCase.value };
  }
  if (testCase.chainKind === "member") {
    return { order: "base ", result: testCase.value };
  }
  if (
    testCase.chainKind === "call" ||
    testCase.chainKind === "grouped-method-call" ||
    testCase.chainKind === "member-call"
  ) {
    return {
      order: "base argument call ",
      result: testCase.value + testCase.argument,
    };
  }
  return testCase.nestedNullish
    ? { order: "base " }
    : { order: "base key ", result: testCase.value };
}

function printCase(testCase: OptionalChainCase): string {
  const nested = testCase.nestedNullish
    ? "null"
    : `{ value: ${testCase.value} }`;
  return `
let order = "";
const holder = {
  value: ${testCase.value},
  nested: ${nested},
  method(value) {
    order = order + "call ";
    return this.value + value;
  },
};
function callable(value) {
  order = order + "call ";
  return ${testCase.value} + value;
}
function base(value) {
  order = order + "base ";
  return value;
}
function key() {
  order = order + "key ";
  return "value";
}
function argument() {
  order = order + "argument ";
  return ${testCase.argument};
}
const result = ${expressionSource(testCase)};
console.log("result", result, "order", order);
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
    "oseo-optional-chaining-property-",
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

test("optional chaining model skips guarded keys and arguments", () => {
  assert.deepEqual(
    expected({
      argument: 2,
      baseKind: "null",
      chainKind: "member-call",
      nestedNullish: false,
      value: 3,
    }),
    { order: "base " },
  );
  assert.deepEqual(
    expected({
      argument: 2,
      baseKind: "object",
      chainKind: "sequence",
      nestedNullish: false,
      value: 3,
    }),
    { order: "base key ", result: 3 },
  );
});

test(
  "generated optional chains match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "optional chains preserve guards, receivers, and evaluation order",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const modeled = expected(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout:
            `result ${modeled.result ?? "undefined"} order ` +
            `${modeled.order}\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-optional-chaining.js" },
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
          "optional member, computed, call, method call, and multi-step " +
          "chains over null, undefined, and objects with guarded key and " +
          "argument effects",
        numRuns: 12,
        profile: "M5 optional chaining",
        seed: 0x5eed_0019,
        sizeLimit: "one optional chain with bounded values and effects",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
