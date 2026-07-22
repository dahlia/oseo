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

type DeclarationKind = "const" | "let" | "var";
type ExclusionKind = "computed-string" | "computed-symbol" | "static";

interface ObjectRestCase {
  readonly declarationKind: DeclarationKind;
  readonly excludedValue: number;
  readonly exclusionKind: ExclusionKind;
  readonly namedValue: number;
  readonly numericValue: number;
  readonly symbolValue: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<ObjectRestCase> = fc.record({
  declarationKind: fc.constantFrom<DeclarationKind>("const", "let", "var"),
  excludedValue: fc.integer({ max: 20, min: -20 }),
  exclusionKind: fc.constantFrom<ExclusionKind>(
    "computed-string",
    "computed-symbol",
    "static",
  ),
  namedValue: fc.integer({ max: 20, min: -20 }),
  numericValue: fc.integer({ max: 20, min: -20 }),
  symbolValue: fc.integer({ max: 20, min: -20 }),
});

function pattern(testCase: ObjectRestCase): string {
  if (testCase.exclusionKind === "static") {
    return "{ named: picked, ...rest }";
  }
  if (testCase.exclusionKind === "computed-string") {
    return '{ [(order = order + "e", "named")]: picked, ...rest }';
  }
  return '{ [(order = order + "e", excludedSymbol)]: picked, ...rest }';
}

function printCase(testCase: ObjectRestCase): string {
  return `
const copiedSymbol = Symbol("copied");
const excludedSymbol = Symbol("excluded");
let order = "";
const source = {
  3: ${testCase.numericValue + 1},
  1: ${testCase.numericValue},
  named: ${testCase.namedValue},
  [copiedSymbol]: ${testCase.symbolValue},
  [excludedSymbol]: ${testCase.excludedValue},
};
Object.defineProperty(source, "hidden", {
  value: 99,
  enumerable: false,
});
Object.setPrototypeOf(source, { inherited: 98 });
${testCase.declarationKind} ${pattern(testCase)} = source;
const keys = Object.keys(rest);
console.log("picked", picked);
console.log("keys", keys.length, keys[0], keys[1], keys[2]);
console.log(
  "values",
  rest[1],
  rest[3],
  rest.named,
  rest[copiedSymbol],
  rest[excludedSymbol],
  rest.hidden,
  rest.inherited,
);
const descriptor = Object.getOwnPropertyDescriptor(rest, "1");
console.log(
  "descriptor",
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
);
console.log("order", order);
`;
}

function expected(testCase: ObjectRestCase): string {
  const excludesSymbol = testCase.exclusionKind === "computed-symbol";
  const picked = excludesSymbol ? testCase.excludedValue : testCase.namedValue;
  const keys = excludesSymbol ? "3 1 3 named" : "2 1 3 undefined";
  const named = excludesSymbol ? String(testCase.namedValue) : "undefined";
  const excluded = excludesSymbol
    ? "undefined"
    : String(testCase.excludedValue);
  const order = testCase.exclusionKind === "static" ? "" : "e";
  return (
    `picked ${picked}\n` +
    `keys ${keys}\n` +
    `values ${testCase.numericValue} ${testCase.numericValue + 1} ` +
    `${named} ${testCase.symbolValue} ${excluded} undefined undefined\n` +
    "descriptor true true true\n" +
    `order ${order}\n`
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
    "oseo-object-rest-property-",
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

test("object rest model preserves key order and exclusions", () => {
  assert.equal(
    expected({
      declarationKind: "const",
      excludedValue: 5,
      exclusionKind: "computed-symbol",
      namedValue: 3,
      numericValue: 1,
      symbolValue: 4,
    }),
    "picked 5\n" +
      "keys 3 1 3 named\n" +
      "values 1 2 3 4 undefined undefined undefined\n" +
      "descriptor true true true\n" +
      "order e\n",
  );
});

test(
  "generated object rest bindings match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "object rest preserves generated own keys and exclusions",
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
            { source, sourceId: "generated-m5-object-rest.js" },
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
          "const, let, and var object rest bindings with static, computed " +
          "string, and computed symbol exclusions",
        numRuns: 10,
        profile: "M5 object binding rest properties",
        seed: 0x5eed_0009,
        sizeLimit: "five own properties with bounded integer values",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
