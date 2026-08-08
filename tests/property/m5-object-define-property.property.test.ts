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

type ValueKind =
  | "bigint"
  | "boolean"
  | "null"
  | "number"
  | "object"
  | "string"
  | "symbol";

type DescriptorMode = "abrupt-value" | "data" | "mixed";

interface DefinePropertyCase {
  readonly currentConfigurable: boolean;
  readonly currentEnumerable: boolean;
  readonly currentValue: number;
  readonly currentWritable: boolean;
  readonly falseHint: boolean;
  readonly hasConfigurable: boolean;
  readonly hasEnumerable: boolean;
  readonly hasValue: boolean;
  readonly hasWritable: boolean;
  readonly key: "7" | "alpha" | "omega";
  readonly mode: DescriptorMode;
  readonly nextBoolean: boolean;
  readonly nextNumber: number;
  readonly nextText: "a" | "beta" | "z";
  readonly present: boolean;
  readonly valueKind: ValueKind;
}

interface ModeledDescriptor {
  readonly configurable: boolean;
  readonly enumerable: boolean;
  readonly valueIdentity: boolean;
  readonly valueType: string;
  readonly writable: boolean;
}

const caseArbitrary: fc.Arbitrary<DefinePropertyCase> = fc.record({
  currentConfigurable: fc.boolean(),
  currentEnumerable: fc.boolean(),
  currentValue: fc.integer({ max: 100, min: -100 }),
  currentWritable: fc.boolean(),
  falseHint: fc.boolean(),
  hasConfigurable: fc.boolean(),
  hasEnumerable: fc.boolean(),
  hasValue: fc.boolean(),
  hasWritable: fc.boolean(),
  key: fc.constantFrom("7", "alpha", "omega"),
  mode: fc.constantFrom("data", "mixed", "abrupt-value"),
  nextBoolean: fc.boolean(),
  nextNumber: fc.integer({ max: 100, min: -100 }),
  nextText: fc.constantFrom("a", "beta", "z"),
  present: fc.boolean(),
  valueKind: fc.constantFrom(
    "number",
    "string",
    "boolean",
    "null",
    "bigint",
    "symbol",
    "object",
  ),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function valueSource(testCase: DefinePropertyCase): string {
  switch (testCase.valueKind) {
    case "bigint":
      return `${Math.abs(testCase.nextNumber)}n`;
    case "boolean":
      return String(testCase.nextBoolean);
    case "null":
      return "null";
    case "number":
      return String(testCase.nextNumber);
    case "object":
      return `{ marker: ${testCase.nextNumber} }`;
    case "string":
      return JSON.stringify(testCase.nextText);
    case "symbol":
      return `Symbol(${JSON.stringify(testCase.nextText)})`;
  }
}

function fieldGetter(name: string, value: string, abrupt = false): string {
  const body = abrupt ? `throw new RangeError("value");` : `return ${value};`;
  return `
  get ${name}() {
    order.push(${JSON.stringify(name)});
    ${body}
  },`;
}

function printCase(testCase: DefinePropertyCase): string {
  const fields = [
    testCase.hasEnumerable
      ? fieldGetter("enumerable", String(testCase.nextBoolean))
      : "",
    testCase.hasConfigurable
      ? fieldGetter("configurable", String(!testCase.nextBoolean))
      : "",
    testCase.hasValue || testCase.mode !== "data"
      ? fieldGetter("value", "nextValue", testCase.mode === "abrupt-value")
      : "",
    testCase.hasWritable
      ? fieldGetter("writable", String(testCase.nextBoolean))
      : "",
    testCase.mode === "mixed"
      ? fieldGetter("get", "function () { return 1; }")
      : "",
  ].join("");
  const initial = testCase.present
    ? `
Object.defineProperty(target, ${JSON.stringify(testCase.key)}, {
  configurable: ${testCase.currentConfigurable},
  enumerable: ${testCase.currentEnumerable},
  value: ${testCase.currentValue},
  writable: ${testCase.currentWritable},
});`
    : "";
  const hintedArgument = testCase.falseHint
    ? JSON.stringify(testCase.nextText)
    : String(testCase.nextNumber);
  return `
const target = {};
${initial}
const order = [];
const propertyKey = {
  toString: function () {
    order.push("key");
    return ${JSON.stringify(testCase.key)};
  },
};
const nextValue = ${valueSource(testCase)};
const descriptor = {${fields}
};
let outcome = "ok";
try {
  Object.defineProperty(target, propertyKey, descriptor);
} catch (error) {
  outcome = error.name;
}
console.log("outcome", outcome);
console.log(
  "order",
  order.length,
  order[0],
  order[1],
  order[2],
  order[3],
  order[4],
  order[5],
);
const observed = Object.getOwnPropertyDescriptor(
  target,
  ${JSON.stringify(testCase.key)},
);
if (observed === undefined) {
  console.log("descriptor", "absent");
} else {
  console.log(
    "descriptor",
    typeof observed.value,
    observed.value === nextValue,
    observed.writable,
    observed.enumerable,
    observed.configurable,
  );
}
function hinted(value: number) { return value + 1; }
console.log("hint", hinted(${hintedArgument}));
let turn = 0;
while (turn < 3) {
  const allocated = {};
  Object.defineProperty(allocated, "value", {
    configurable: true,
    value: { turn },
  });
  if (turn === 0) Object.definePropertyMarker = true;
  console.log("guard", allocated.value.turn);
  turn = turn + 1;
}
`;
}

function modeledValue(testCase: DefinePropertyCase): {
  readonly identity: boolean;
  readonly type: string;
} {
  switch (testCase.valueKind) {
    case "bigint":
      return { identity: true, type: "bigint" };
    case "boolean":
      return { identity: true, type: "boolean" };
    case "null":
      return { identity: true, type: "object" };
    case "number":
      return { identity: true, type: "number" };
    case "object":
      return { identity: true, type: "object" };
    case "string":
      return { identity: true, type: "string" };
    case "symbol":
      return { identity: true, type: "symbol" };
  }
}

function dataDefinitionRejected(testCase: DefinePropertyCase): boolean {
  if (!testCase.present || testCase.currentConfigurable) return false;
  if (testCase.hasConfigurable && !testCase.nextBoolean) return true;
  if (
    testCase.hasEnumerable &&
    testCase.nextBoolean !== testCase.currentEnumerable
  ) {
    return true;
  }
  if (!testCase.currentWritable) {
    if (testCase.hasWritable && testCase.nextBoolean) return true;
    if (testCase.hasValue) {
      return (
        testCase.valueKind !== "number" ||
        testCase.nextNumber !== testCase.currentValue
      );
    }
  }
  return false;
}

function modeledDescriptor(
  testCase: DefinePropertyCase,
  rejected: boolean,
): ModeledDescriptor | undefined {
  if (rejected) {
    if (!testCase.present) return undefined;
    return {
      configurable: testCase.currentConfigurable,
      enumerable: testCase.currentEnumerable,
      valueIdentity:
        testCase.valueKind === "number" &&
        testCase.nextNumber === testCase.currentValue,
      valueType: "number",
      writable: testCase.currentWritable,
    };
  }
  const value = testCase.hasValue
    ? modeledValue(testCase)
    : testCase.present
      ? {
          identity:
            testCase.valueKind === "number" &&
            testCase.nextNumber === testCase.currentValue,
          type: "number",
        }
      : { identity: false, type: "undefined" };
  return {
    configurable: testCase.hasConfigurable
      ? !testCase.nextBoolean
      : testCase.present && testCase.currentConfigurable,
    enumerable: testCase.hasEnumerable
      ? testCase.nextBoolean
      : testCase.present && testCase.currentEnumerable,
    valueIdentity: value.identity,
    valueType: value.type,
    writable: testCase.hasWritable
      ? testCase.nextBoolean
      : testCase.present && testCase.currentWritable,
  };
}

function expected(testCase: DefinePropertyCase): string {
  const order = ["key"];
  if (testCase.hasEnumerable) order.push("enumerable");
  if (testCase.hasConfigurable) order.push("configurable");
  if (testCase.hasValue || testCase.mode !== "data") order.push("value");
  const abrupt = testCase.mode === "abrupt-value";
  if (!abrupt && testCase.hasWritable) order.push("writable");
  if (!abrupt && testCase.mode === "mixed") order.push("get");
  const incompatible =
    testCase.mode === "data" && dataDefinitionRejected(testCase);
  const rejected = abrupt || testCase.mode === "mixed" || incompatible;
  const outcome = abrupt ? "RangeError" : rejected ? "TypeError" : "ok";
  const descriptor = modeledDescriptor(testCase, rejected);
  const descriptorLine =
    descriptor == null
      ? "descriptor absent"
      : `descriptor ${descriptor.valueType} ${descriptor.valueIdentity} ` +
        `${descriptor.writable} ${descriptor.enumerable} ` +
        `${descriptor.configurable}`;
  const hint = testCase.falseHint
    ? `${testCase.nextText}1`
    : String(testCase.nextNumber + 1);
  return [
    `outcome ${outcome}`,
    `order ${order.length} ${order[0]} ${order[1]} ${order[2]} ` +
      `${order[3]} ${order[4]} ${order[5]}`,
    descriptorLine,
    `hint ${hint}`,
    "guard 0",
    "guard 1",
    "guard 2",
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
    "oseo-object-define-property-",
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
  "generated Object.defineProperty operations match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "descriptor conversion and application agree",
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
            { source, sourceId: "generated-object-define-property.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /property-get method lookup/u);
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
          "an absent or data property, every independently optional data " +
          "descriptor field, configurable and non-configurable current " +
          "states, seven admitted value families, inherited key coercion, " +
          "mixed and abrupt descriptors, truthful or false numeric hints, " +
          "both specialization policies, one Object shape invalidation, " +
          "and forced collection at every safepoint",
        numRuns: 12,
        profile: "M5 Object.defineProperty",
        seed: 0x6000_3700,
        sizeLimit:
          "one property, one descriptor with at most five observed fields, " +
          "one bounded value, three guarded definitions, and one bounded " +
          "numeric or string hint",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
