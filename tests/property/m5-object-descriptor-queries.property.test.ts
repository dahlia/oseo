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

type PropertyKey = "0" | "2" | "alpha" | "omega" | "symbol";

type PrimitiveKind = "bigint" | "boolean" | "number" | "string" | "symbol";

/** One own property the generated target is created with. */
interface PropertySpec {
  readonly accessor: boolean;
  readonly configurable: boolean;
  readonly enumerable: boolean;
  readonly key: PropertyKey;
  readonly value: number;
  readonly writable: boolean;
}

interface DescriptorQueryCase {
  readonly abruptTargetNullish: boolean;
  readonly absentQuery: boolean;
  readonly falseHint: boolean;
  readonly nextNumber: number;
  readonly nextText: "a" | "beta" | "z";
  readonly primitive: PrimitiveKind;
  readonly properties: readonly PropertySpec[];
  readonly queryIndex: number;
}

const propertyArbitrary: fc.Arbitrary<PropertySpec> = fc.record({
  accessor: fc.boolean(),
  configurable: fc.boolean(),
  enumerable: fc.boolean(),
  key: fc.constantFrom<PropertyKey>("0", "2", "alpha", "omega", "symbol"),
  value: fc.integer({ max: 100, min: -100 }),
  writable: fc.boolean(),
});

const caseArbitrary: fc.Arbitrary<DescriptorQueryCase> = fc.record({
  abruptTargetNullish: fc.boolean(),
  absentQuery: fc.boolean(),
  falseHint: fc.boolean(),
  nextNumber: fc.integer({ max: 100, min: -100 }),
  nextText: fc.constantFrom("a", "beta", "z"),
  primitive: fc.constantFrom("number", "string", "boolean", "bigint", "symbol"),
  properties: fc.array(propertyArbitrary, { maxLength: 5, minLength: 0 }),
  queryIndex: fc.integer({ max: 4, min: 0 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/**
 * OrdinaryOwnPropertyKeys over the generated vocabulary: the property
 * that first claims a key owns its creation position, integer-index
 * keys lead in ascending numeric order, and the symbol key trails every
 * string key however early it was created.
 */
function ownProperties(testCase: DescriptorQueryCase): readonly PropertySpec[] {
  const created: PropertySpec[] = [];
  for (const property of testCase.properties) {
    if (created.some((existing) => existing.key === property.key)) continue;
    created.push(property);
  }
  const indexKeys = created.filter(
    (property) => property.key === "0" || property.key === "2",
  );
  indexKeys.sort((left, right) => Number(left.key) - Number(right.key));
  return [
    ...indexKeys,
    ...created.filter(
      (property) => property.key === "alpha" || property.key === "omega",
    ),
    ...created.filter((property) => property.key === "symbol"),
  ];
}

function keySource(key: PropertyKey): string {
  return key === "symbol" ? "symbolKey" : JSON.stringify(key);
}

function definition(property: PropertySpec): string {
  const shared =
    `  configurable: ${property.configurable},\n` +
    `  enumerable: ${property.enumerable},\n`;
  const rest = property.accessor
    ? `  get: function () { return ${property.value}; },\n`
    : `  value: ${property.value},\n  writable: ${property.writable},\n`;
  return (
    `Object.defineProperty(target, ${keySource(property.key)}, {\n` +
    shared +
    rest +
    "});\n"
  );
}

function primitiveSource(testCase: DescriptorQueryCase): string {
  switch (testCase.primitive) {
    case "bigint":
      return `${Math.abs(testCase.nextNumber)}n`;
    case "boolean":
      return String(testCase.nextNumber > 0);
    case "number":
      return String(testCase.nextNumber);
    case "string":
      return JSON.stringify(testCase.nextText);
    case "symbol":
      return `Symbol(${JSON.stringify(testCase.nextText)})`;
  }
}

const queryKeys: readonly PropertyKey[] = [
  "0",
  "2",
  "alpha",
  "omega",
  "symbol",
];

function queryKey(testCase: DescriptorQueryCase): PropertyKey {
  return queryKeys[testCase.queryIndex] ?? "alpha";
}

function printCase(testCase: DescriptorQueryCase): string {
  const definitions = ownProperties(testCase).map(definition).join("");
  const query = testCase.absentQuery
    ? JSON.stringify("absent")
    : keySource(queryKey(testCase));
  const hintedArgument = testCase.falseHint
    ? JSON.stringify(testCase.nextText)
    : String(testCase.nextNumber);
  return `
const symbolKey = Symbol("generated");
const target = {};
${definitions}function fields(descriptor) {
  if (descriptor === undefined) return "absent";
  let text = "";
  for (const field in descriptor) text = text + field + ":";
  return text + typeof descriptor.get + ":" + descriptor.value + ":" +
    descriptor.writable + ":" + descriptor.enumerable + ":" +
    descriptor.configurable;
}
function order(object) {
  let text = "";
  for (const key in object) text = text + key + ",";
  return text;
}
const single = Object.getOwnPropertyDescriptor(target, ${query});
console.log("single", fields(single));
const all = Object.getOwnPropertyDescriptors(target);
console.log("order", order(all));
console.log("entry 0", fields(all["0"]));
console.log("entry 2", fields(all["2"]));
console.log("entry alpha", fields(all.alpha));
console.log("entry omega", fields(all.omega));
console.log("entry symbol", fields(all[symbolKey]));
const primitive = ${primitiveSource(testCase)};
console.log(
  "primitive",
  typeof primitive,
  order(Object.getOwnPropertyDescriptors(primitive)),
  fields(Object.getOwnPropertyDescriptor(primitive, "0")),
  fields(Object.getOwnPropertyDescriptor(primitive, "length")),
);
const keyLog = [];
const abruptKey = {
  toString: function () {
    keyLog.push("key");
    throw new RangeError("key");
  },
};
let abrupt = "ok";
try {
  Object.getOwnPropertyDescriptor(${
    testCase.abruptTargetNullish ? "null" : "target"
  }, abruptKey);
} catch (error) {
  abrupt = error.name;
}
console.log("abrupt", abrupt, keyLog.length);
function hinted(value: number) { return value + 1; }
console.log("hint", hinted(${hintedArgument}));
let turn = 0;
while (turn < 3) {
  const allocated = { turn };
  console.log(
    "guard",
    order(Object.getOwnPropertyDescriptors(allocated)),
    Object.getOwnPropertyDescriptor(allocated, "turn").value,
  );
  if (turn === 0) Object.descriptorQueryMarker = true;
  turn = turn + 1;
}
`;
}

function modeledFields(property: PropertySpec | undefined): string {
  if (property == null) return "absent";
  return property.accessor
    ? "get:set:enumerable:configurable:function:undefined:undefined:" +
        `${property.enumerable}:${property.configurable}`
    : "value:writable:enumerable:configurable:undefined:" +
        `${property.value}:${property.writable}:${property.enumerable}:` +
        `${property.configurable}`;
}

function modeledPrimitive(testCase: DescriptorQueryCase): readonly string[] {
  if (testCase.primitive !== "string") {
    return [testCase.primitive, "", "absent", "absent"];
  }
  const text = testCase.nextText;
  const indices = Array.from(text, (_, index) => `${index},`).join("");
  const first = text[0] ?? "";
  return [
    "string",
    `${indices}length,`,
    `value:writable:enumerable:configurable:undefined:${first}:false:true:` +
      "false",
    "value:writable:enumerable:configurable:undefined:" +
      `${text.length}:false:false:false`,
  ];
}

function expected(testCase: DescriptorQueryCase): string {
  const created = ownProperties(testCase);
  const found = testCase.absentQuery
    ? undefined
    : created.find((property) => property.key === queryKey(testCase));
  const stringOrder = created
    .filter((property) => property.key !== "symbol")
    .map((property) => `${property.key},`)
    .join("");
  const entry = (key: PropertyKey): string =>
    modeledFields(created.find((property) => property.key === key));
  const primitive = modeledPrimitive(testCase);
  const hint = testCase.falseHint
    ? `${testCase.nextText}1`
    : String(testCase.nextNumber + 1);
  return [
    `single ${modeledFields(found)}`,
    `order ${stringOrder}`,
    `entry 0 ${entry("0")}`,
    `entry 2 ${entry("2")}`,
    `entry alpha ${entry("alpha")}`,
    `entry omega ${entry("omega")}`,
    `entry symbol ${entry("symbol")}`,
    `primitive ${primitive.join(" ")}`,
    testCase.abruptTargetNullish ? "abrupt TypeError 0" : "abrupt RangeError 1",
    `hint ${hint}`,
    "guard turn, 0",
    "guard turn, 1",
    "guard turn, 2",
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
    "oseo-object-descriptor-queries-",
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
  "generated Object descriptor queries match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "reported descriptors and own-key order agree",
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
            { source, sourceId: "generated-object-descriptor-queries.ts" },
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
          "up to five own data and accessor properties over index, string, " +
          "and symbol keys with independently generated attributes and " +
          "creation orders, a present or absent single query, five " +
          "primitive conversion targets, a nullish or object target ahead " +
          "of an abrupt key conversion, truthful or false numeric hints, " +
          "both specialization policies, one Object shape invalidation, " +
          "and forced collection at every safepoint",
        numRuns: 12,
        profile: "M5 Object descriptor queries",
        seed: 0x6000_3900,
        sizeLimit:
          "one object with at most five own properties, one bounded string " +
          "primitive, two reported descriptor sets, three guarded queries, " +
          "and one bounded numeric or string hint",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
