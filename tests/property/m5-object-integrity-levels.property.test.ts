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

type IntegrityOperation = "freeze" | "preventExtensions" | "seal";

interface PropertySpec {
  readonly accessor: boolean;
  readonly configurable: boolean;
  readonly enumerable: boolean;
  readonly key: "0" | "alpha" | "omega";
  readonly value: number;
  readonly writable: boolean;
}

interface IntegrityCase {
  readonly falseHint: boolean;
  readonly nextNumber: number;
  readonly nextText: "a" | "beta" | "z";
  readonly operation: IntegrityOperation;
  readonly properties: readonly PropertySpec[];
}

const propertyArbitrary: fc.Arbitrary<PropertySpec> = fc.record({
  accessor: fc.boolean(),
  configurable: fc.boolean(),
  enumerable: fc.boolean(),
  key: fc.constantFrom("0", "alpha", "omega"),
  value: fc.integer({ max: 100, min: -100 }),
  writable: fc.boolean(),
});

const caseArbitrary: fc.Arbitrary<IntegrityCase> = fc.record({
  falseHint: fc.boolean(),
  nextNumber: fc.integer({ max: 100, min: -100 }),
  nextText: fc.constantFrom("a", "beta", "z"),
  operation: fc.constantFrom("preventExtensions", "seal", "freeze"),
  properties: fc.array(propertyArbitrary, { maxLength: 4, minLength: 0 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function ownProperties(testCase: IntegrityCase): readonly PropertySpec[] {
  const properties: PropertySpec[] = [];
  for (const property of testCase.properties) {
    if (properties.some((existing) => existing.key === property.key)) continue;
    properties.push(property);
  }
  return properties;
}

function definition(property: PropertySpec): string {
  const body = property.accessor
    ? `get: function () { return ${property.value}; },\n` +
      `  set: function (value) { stored = value; },\n`
    : `value: ${property.value},\n  writable: ${property.writable},\n`;
  return (
    `Object.defineProperty(target, ${JSON.stringify(property.key)}, {\n` +
    `  configurable: ${property.configurable},\n` +
    `  enumerable: ${property.enumerable},\n  ${body}});\n`
  );
}

function printCase(testCase: IntegrityCase): string {
  const definitions = ownProperties(testCase).map(definition).join("");
  const hintedArgument = testCase.falseHint
    ? JSON.stringify(testCase.nextText)
    : String(testCase.nextNumber);
  return `
let stored = 0;
const target = {};
${definitions}const returned = Object.${testCase.operation}(target);
console.log(
  "state",
  returned === target,
  Object.isExtensible(target),
  Object.isSealed(target),
  Object.isFrozen(target),
);
for (const key of ["0", "alpha", "omega"]) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  console.log(
    "descriptor",
    key,
    descriptor === undefined ? "absent" : typeof descriptor.get,
    descriptor === undefined ? undefined : descriptor.value,
    descriptor === undefined ? undefined : descriptor.writable,
    descriptor === undefined ? undefined : descriptor.enumerable,
    descriptor === undefined ? undefined : descriptor.configurable,
  );
}
let defineResult = "ok";
try {
  Object.defineProperty(target, "newKey", { value: 1 });
} catch (error) {
  defineResult = error.name;
}
console.log("define", defineResult, target.newKey);
for (const primitive of [undefined, null, true, 1, "x", Symbol("x"), 1n]) {
  const primitiveResult = Object.${testCase.operation}(primitive);
  console.log(
    "primitive",
    typeof primitive,
    primitiveResult === primitive,
    Object.isExtensible(primitive),
    Object.isSealed(primitive),
    Object.isFrozen(primitive),
  );
}
/** @param {number} value */
function hinted(value) { return value + 1; }
console.log("hint", hinted(${hintedArgument}));
let turn = 0;
while (turn < 3) {
  const guarded = { turn };
  Object.${testCase.operation}(guarded);
  console.log("guard", Object.isExtensible(guarded), guarded.turn);
  if (turn === 0) Object.integrityMarker = true;
  turn = turn + 1;
}
`;
}

function descriptorLine(
  testCase: IntegrityCase,
  key: PropertySpec["key"],
): string {
  const property = ownProperties(testCase).find((item) => item.key === key);
  if (property == null) {
    return `descriptor ${key} absent undefined undefined undefined undefined`;
  }
  const writable = property.accessor
    ? "undefined"
    : String(testCase.operation === "freeze" ? false : property.writable);
  const configurable = String(
    testCase.operation === "preventExtensions" ? property.configurable : false,
  );
  return property.accessor
    ? `descriptor ${key} function undefined ${writable} ` +
        `${property.enumerable} ${configurable}`
    : `descriptor ${key} undefined ${property.value} ${writable} ` +
        `${property.enumerable} ${configurable}`;
}

function expected(testCase: IntegrityCase): string {
  const properties = ownProperties(testCase);
  const sealed = properties.every(
    (property) =>
      testCase.operation !== "preventExtensions" || !property.configurable,
  );
  const frozen =
    sealed &&
    properties.every((property) => property.accessor || !property.writable);
  const state =
    testCase.operation === "freeze"
      ? "state true false true true"
      : testCase.operation === "seal"
        ? `state true false true ${frozen}`
        : `state true false ${sealed} ${frozen}`;
  const hint = testCase.falseHint
    ? `${testCase.nextText}1`
    : String(testCase.nextNumber + 1);
  const primitiveKinds = [
    "undefined",
    "object",
    "boolean",
    "number",
    "string",
    "symbol",
    "bigint",
  ];
  return [
    state,
    descriptorLine(testCase, "0"),
    descriptorLine(testCase, "alpha"),
    descriptorLine(testCase, "omega"),
    "define TypeError undefined",
    ...primitiveKinds.map((kind) => `primitive ${kind} true false true true`),
    `hint ${hint}`,
    "guard false 0",
    "guard false 1",
    "guard false 2",
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
  const directory = await host.makeTemporaryDirectory("oseo-integrity-");
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
  "generated Object integrity levels match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "integrity transitions and queries agree",
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
            { source, sourceId: "generated-object-integrity-levels.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-shape/u);
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
          "up to four own data and accessor properties over index and " +
          "string keys with independently generated attributes, all three " +
          "integrity transitions and queries, post-transition definition, " +
          "seven primitive classes, truthful or false numeric hints, both " +
          "specialization policies, one Object shape invalidation, and " +
          "forced collection at every safepoint",
        numRuns: 12,
        profile: "M5 Object integrity levels",
        seed: 0x6000_3c00,
        sizeLimit:
          "one object with at most three distinct own properties, seven " +
          "primitive observations, three guarded transitions, and one " +
          "bounded numeric or string hint",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
