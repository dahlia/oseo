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

type RestrictedName = "Infinity" | "NaN" | "undefined";

interface GlobalRecordCase {
  readonly assigned: number;
  readonly name: RestrictedName;
  readonly text: "miss" | "text";
}

const caseArbitrary: fc.Arbitrary<GlobalRecordCase> = fc.record({
  assigned: fc.integer({ max: 100, min: -100 }),
  name: fc.constantFrom("Infinity", "NaN", "undefined"),
  text: fc.constantFrom("miss", "text"),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function sourceFor(testCase: GlobalRecordCase): string {
  return `
var ${testCase.name} = ${testCase.assigned};
const descriptor = Object.getOwnPropertyDescriptor(this, ${JSON.stringify(
    testCase.name,
  )});
console.log(
  "descriptor",
  ${testCase.name} !== ${testCase.name}
    ? descriptor.value !== descriptor.value
    : descriptor.value === ${testCase.name},
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
);
console.log(
  "value",
  ${testCase.name} === ${testCase.name},
  ${testCase.name} === 1 / 0,
  ${testCase.name} === void 0,
);
${testCase.name} = ${testCase.assigned + 1};
console.log(
  "assignment",
  ${testCase.name} !== ${testCase.name}
    ? descriptor.value !== descriptor.value
    : descriptor.value === ${testCase.name},
);
console.log("delete", delete ${testCase.name});
let strictResult = "ok";
try {
  (function () {
    "use strict";
    ${testCase.name} = ${testCase.assigned + 2};
  })();
} catch (error) {
  strictResult = error.name;
}
console.log("strict", strictResult);
let redefine = "ok";
try {
  Object.defineProperty(this, ${JSON.stringify(testCase.name)}, {
    value: ${testCase.assigned},
  });
} catch (error) {
  redefine = error.name;
}
console.log("redefine", redefine);
/** @param {number} value */
function hinted(value) { return value + 1; }
console.log("guard", hinted(${testCase.assigned}), hinted(${JSON.stringify(
    testCase.text,
  )}));
const survivor = { value: ${testCase.name} };
for (let index = 0; index < 16; index = index + 1) {
  Object.defineProperty({}, "item", { value: { index } });
}
console.log(
  "collection",
  ${testCase.name} !== ${testCase.name}
    ? survivor.value !== survivor.value
    : survivor.value === ${testCase.name},
);
`;
}

function expected(testCase: GlobalRecordCase): string {
  const equality = testCase.name !== "NaN";
  return [
    "descriptor true false false false",
    `value ${equality} ${testCase.name === "Infinity"} ` +
      `${testCase.name === "undefined"}`,
    "assignment true",
    "delete false",
    "strict TypeError",
    "redefine TypeError",
    `guard ${testCase.assigned + 1} ${testCase.text}1`,
    "collection true",
    "",
  ].join("\n");
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory("oseo-global-record-");
  const sourcePath = `${directory}/case.ts`;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
    return [
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
  } finally {
    await host.remove(directory);
  }
}

test(
  "generated global value properties match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "restricted value properties preserve their descriptors",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = sourceFor(testCase);
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
            { source, sourceId: "generated-global-object-record.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /property-get generic/u);
          } else {
            assert.doesNotMatch(mir, /guard-shape/u);
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
                assert.ok(native.counters != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "enabled") {
                  assert.ok(native.counters.guardHits > 0);
                  assert.ok(native.counters.guardMisses > 0);
                  assert.ok(native.counters.genericAdditionCalls > 0);
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
          "the three restricted value names, bounded integer writes, " +
          "descriptor identity, non-strict and strict assignment, delete, " +
          "non-configurable redefinition, truthful and false numeric hints, " +
          "both specialization policies, and forced collection",
        numRuns: 12,
        profile: "M5 Global Environment Record value properties",
        seed: 0x6000_3d00,
        sizeLimit:
          "one standard global declaration, three mutation attempts, two " +
          "guarded additions, and sixteen bounded collection allocations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
