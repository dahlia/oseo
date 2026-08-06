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
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

interface ObjectPrototypeCase {
  readonly enumerable: boolean;
  readonly key: "7" | "alpha" | "omega";
  readonly parentValue: number;
  readonly tag: "Generated" | "Model" | null;
  readonly value: number;
}

const caseArbitrary: fc.Arbitrary<ObjectPrototypeCase> = fc.record({
  enumerable: fc.boolean(),
  key: fc.constantFrom("7", "alpha", "omega"),
  parentValue: fc.integer({ max: 20, min: -20 }),
  tag: fc.option(fc.constantFrom("Generated", "Model"), { nil: null }),
  value: fc.integer({ max: 20, min: -20 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printCase(testCase: ObjectPrototypeCase): string {
  const tag =
    testCase.tag == null
      ? ""
      : `value[Symbol.toStringTag] = ${JSON.stringify(testCase.tag)};`;
  return `
const parent = { inherited: ${testCase.parentValue} };
const value = Object.create(parent);
Object.defineProperty(value, ${JSON.stringify(testCase.key)}, {
  value: ${testCase.value},
  writable: true,
  enumerable: ${testCase.enumerable},
  configurable: true,
});
${tag}
let turn = 0;
while (turn < 2) {
  console.log(
    "own",
    value.hasOwnProperty(${JSON.stringify(testCase.key)}),
    value.propertyIsEnumerable(${JSON.stringify(testCase.key)}),
  );
  if (turn === 0) delete value[${JSON.stringify(testCase.key)}];
  turn = turn + 1;
}
console.log(
  "prototype",
  parent.isPrototypeOf(value),
  value.isPrototypeOf(parent),
);
console.log("tag", value.toString());
value.toString = function () { return "localized-${testCase.value}"; };
console.log("locale", value.toLocaleString());
console.log(
  "value",
  value.valueOf() === value,
  value.constructor === parent.constructor,
);
`;
}

function expected(testCase: ObjectPrototypeCase): string {
  const tag = testCase.tag ?? "Object";
  return [
    `own true ${testCase.enumerable}`,
    "own false false",
    "prototype true false",
    `tag [object ${tag}]`,
    `locale localized-${testCase.value}`,
    "value true true",
    "",
  ].join("\n");
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
    "oseo-object-prototype-property-",
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

test(
  "generated Object.prototype methods match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Object.prototype methods preserve descriptors and prototype identity",
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
            { source, sourceId: "generated-m5-object-prototype.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-object/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /property-get generic/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:object|shape)/u);
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
                toolchain: zigToolchain,
              },
              (native) => {
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters?.collections != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "enabled") {
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
          "one ordinary object with an index or string property, an " +
          "enumerability bit, a bounded value, one prototype, an optional " +
          "string @@toStringTag, and a deletion-driven shape guard miss",
        numRuns: 12,
        profile: "M5 Object.prototype methods",
        seed: 0x6000_3200,
        sizeLimit:
          "one own property, one inherited property, one optional tag, and " +
          "two repeated method observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
