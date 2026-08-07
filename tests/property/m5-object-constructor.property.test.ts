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

interface ObjectConstructorCase {
  readonly alternatePrototype: boolean;
  readonly flag: boolean;
  readonly integer: number;
  readonly text: "alpha" | "beta" | "z";
}

const caseArbitrary: fc.Arbitrary<ObjectConstructorCase> = fc.record({
  alternatePrototype: fc.boolean(),
  flag: fc.boolean(),
  integer: fc.integer({ max: 1000, min: -1000 }),
  text: fc.constantFrom("alpha", "beta", "z"),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printCase(testCase: ObjectConstructorCase): string {
  const selected = testCase.alternatePrototype ? "alternate" : "base";
  return `
const base = { marker: "base" };
const alternate = { marker: "alternate" };
const selected = ${selected};
const target = { own: true };
const numberWrapper = Object(${testCase.integer});
const stringWrapper = Object(${JSON.stringify(testCase.text)});
const secondStringWrapper = Object(${JSON.stringify(testCase.text)});
const booleanWrapper = new Object(${testCase.flag});
console.log(
  "identity",
  Object(target) === target,
  new Object(target) === target,
  Object() !== Object(),
  new Object() !== new Object(),
);
console.log(
  "wrappers",
  typeof numberWrapper,
  Object.getPrototypeOf(numberWrapper) === Number.prototype,
  Object.prototype.toString.call(numberWrapper),
  Object.prototype.toString.call(booleanWrapper),
);
console.log(
  "string wrapper",
  stringWrapper[0],
  stringWrapper.length,
  Object.getPrototypeOf(stringWrapper) ===
    Object.getPrototypeOf(secondStringWrapper),
  Object.prototype.toString.call(stringWrapper),
);
console.log(
  "same value",
  Object.is(NaN, NaN),
  Object.is(0, -0),
  Object.is(${testCase.integer}, ${testCase.integer}),
  Object.is(${JSON.stringify(testCase.text)}, ${JSON.stringify(testCase.text)}),
  Object.is(target, target),
  Object.is({}, {}),
);
console.log(
  "prototype",
  Object.setPrototypeOf(target, selected) === target,
  Object.getPrototypeOf(target) === selected,
  target.marker,
  Object.setPrototypeOf(${testCase.integer}, selected),
);
try { Object.getPrototypeOf(null); } catch (error) {
  console.log("null prototype read", error instanceof TypeError);
}
try { Object.setPrototypeOf(target, 1); } catch (error) {
  console.log("invalid prototype write", error instanceof TypeError);
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log(
  "hint",
  hinted(${testCase.integer}, 1),
  hinted(${JSON.stringify(testCase.text)}, 1),
);
const originalIs = Object.is;
let turn = 0;
while (turn < 3) {
  console.log("guard", Object.is === originalIs);
  if (turn === 1) Object.marker = ${testCase.integer};
  turn = turn + 1;
}
const originalObject = Object;
Object = ${testCase.integer};
console.log("global write", Object, this.Object === Object);
Object = originalObject;
console.log("global restore", Object === originalObject);
`;
}

function expected(testCase: ObjectConstructorCase): string {
  const selected = testCase.alternatePrototype ? "alternate" : "base";
  return [
    "identity true true true true",
    `wrappers object true [object Number] [object Boolean]`,
    `string wrapper ${testCase.text[0]} ${testCase.text.length} true ` +
      "[object String]",
    "same value true false true true true false",
    `prototype true true ${selected} ${testCase.integer}`,
    "null prototype read true",
    "invalid prototype write true",
    `hint ${testCase.integer + 1} ${testCase.text}1`,
    "guard true",
    "guard true",
    "guard true",
    `global write ${testCase.integer} true`,
    "global restore true",
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
    "oseo-object-constructor-property-",
  );
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
  "generated Object construction and prototype operations match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Object wrapping, SameValue, prototypes, and identity agree",
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
            { source, sourceId: "generated-m5-object-constructor.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /add-smi-checked/u);
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
                toolchain: zigToolchain,
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
          "one integer from -1000 to 1000, one boolean, one of three " +
          "strings, one of two prototype objects, primitive and object " +
          "construction, SameValue pairs, prototype reads and writes, a " +
          "false number hint, one constructor shape miss, and one global " +
          "Object write and restore",
        numRuns: 12,
        profile: "M5 Object constructor",
        seed: 0x6000_3600,
        sizeLimit:
          "one bounded integer, one boolean, one short string, two prototype " +
          "objects, four wrappers, two repeated intrinsic observations, and " +
          "one global mutation sequence",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
