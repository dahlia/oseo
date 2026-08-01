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

type PropertyKind =
  | "data"
  | "get"
  | "method"
  | "set"
  | "shorthand"
  | "spread"
  | "spread-nullish";

interface PropertySpec {
  readonly kind: PropertyKind;
  /**
   * Own keys of a `spread` source, as indices into the shared `p<n>` key
   * pool the other property kinds also define, so a generated spread can
   * introduce a fresh key or overwrite an earlier definition. Ignored by
   * every other kind.
   */
  readonly spreadKeys: readonly number[];
  readonly value: number;
}

interface ObjectLiteralCase {
  readonly properties: readonly PropertySpec[];
}

/** The final state of one own key after every property is applied. */
interface KeyState {
  readonly kind: "data" | "get" | "method" | "set";
  /** Index of the property that last defined the key. */
  readonly owner: number;
  readonly value: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const propertyArbitrary: fc.Arbitrary<PropertySpec> = fc.record({
  kind: fc.constantFrom<PropertyKind>(
    "data",
    "get",
    "method",
    "set",
    "shorthand",
    "spread",
    "spread-nullish",
  ),
  spreadKeys: fc.array(fc.integer({ max: 4, min: 0 }), { maxLength: 3 }),
  value: fc.integer({ max: 20, min: -20 }),
});
/**
 * V8 enumerates an accessor defined after an object literal spread property
 * last instead of in property-creation order, so Node.js and Deno disagree
 * with ECMA-262 for that one combination and cannot act as references for it.
 * The generator rewrites such an accessor as a data property; the fixed
 * tests/fixtures/object-spread-accessor-order.js native check keeps the
 * specified order as evidence without a reference observation.
 */
const caseArbitrary: fc.Arbitrary<ObjectLiteralCase> = fc
  .record({ properties: fc.array(propertyArbitrary, { maxLength: 4 }) })
  .map((testCase) => {
    let spread = false;
    return {
      properties: testCase.properties.map((property) => {
        if (property.kind === "spread" || property.kind === "spread-nullish") {
          spread = true;
          return property;
        }
        return spread && (property.kind === "get" || property.kind === "set")
          ? { ...property, kind: "data" as const }
          : property;
      }),
    };
  });

/**
 * Independent model of the own keys an object literal ends with: a key holds
 * its first insertion position and the definition that last replaced it, and
 * a spread contributes each of its source keys as a data property.
 */
function modelKeys(
  testCase: ObjectLiteralCase,
): readonly (readonly [string, KeyState])[] {
  const insertion: string[] = [];
  const states = new Map<string, KeyState>();
  const define = (key: string, state: KeyState): void => {
    if (!states.has(key)) insertion.push(key);
    states.set(key, state);
  };
  testCase.properties.forEach((property, index) => {
    if (property.kind === "spread-nullish") return;
    if (property.kind === "spread") {
      property.spreadKeys.forEach((key, offset) => {
        define(`p${key}`, {
          kind: "data",
          owner: index,
          value: property.value + offset,
        });
      });
      return;
    }
    define(`p${index}`, {
      kind: property.kind === "shorthand" ? "data" : property.kind,
      owner: index,
      value: property.value,
    });
  });
  return insertion.map((key) => [key, states.get(key)!] as const);
}

function printCase(testCase: ObjectLiteralCase): string {
  const bindings: string[] = [];
  const tokens: string[] = [];
  testCase.properties.forEach((property, index) => {
    const name = `p${index}`;
    const store = `s${index}`;
    if (property.kind === "shorthand") {
      bindings.push(`const ${name} = ${property.value};`);
      tokens.push(name);
    } else if (property.kind === "data") {
      tokens.push(`${name}: (order = order + "${index}", ${property.value})`);
    } else if (property.kind === "get") {
      tokens.push(`get ${name}() { return ${property.value}; }`);
    } else if (property.kind === "set") {
      bindings.push(`let ${store};`);
      tokens.push(`set ${name}(v) { ${store} = v; }`);
    } else if (property.kind === "spread") {
      const entries = property.spreadKeys
        .map((key, offset) => `p${key}: ${property.value + offset}`)
        .join(", ");
      tokens.push(`...(order = order + "${index}", { ${entries} })`);
    } else if (property.kind === "spread-nullish") {
      tokens.push(`...(order = order + "${index}", null)`);
    } else {
      tokens.push(`${name}() { return ${property.value}; }`);
    }
  });
  const reads = modelKeys(testCase).map(([key, state]) => {
    if (state.kind === "method") {
      return (
        `console.log("${key}", typeof o.${key}, o.${key}(), ` +
        `o.${key}.name, "prototype" in o.${key});`
      );
    }
    if (state.kind === "set") {
      return (
        `o.${key} = ${state.value};\n` +
        `console.log("${key}", s${state.owner});`
      );
    }
    return `console.log("${key}", o.${key});`;
  });
  return `
let order = "";
${bindings.join("\n")}
const o = { ${tokens.join(", ")} };
let keyList = "";
for (const key of Object.keys(o)) { keyList = keyList + key + ","; }
console.log("keys", keyList);
${reads.join("\n")}
console.log("order", order);
`;
}

function expected(testCase: ObjectLiteralCase): string {
  const entries = modelKeys(testCase);
  const lines: string[] = [];
  lines.push(`keys ${entries.map(([key]) => `${key},`).join("")}`);
  for (const [key, state] of entries) {
    lines.push(
      state.kind === "method"
        ? `${key} function ${state.value} ${key} false`
        : `${key} ${state.value}`,
    );
  }
  let order = "";
  testCase.properties.forEach((property, index) => {
    if (
      property.kind === "data" ||
      property.kind === "spread" ||
      property.kind === "spread-nullish"
    ) {
      order += String(index);
    }
  });
  lines.push(`order ${order}`);
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
    "oseo-object-literal-property-",
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

test("object literal model orders only evaluated property definitions", () => {
  assert.equal(
    expected({
      properties: [
        { kind: "shorthand", spreadKeys: [], value: 1 },
        { kind: "data", spreadKeys: [], value: 2 },
        { kind: "method", spreadKeys: [], value: 3 },
        { kind: "data", spreadKeys: [], value: 4 },
      ],
    }),
    "keys p0,p1,p2,p3,\n" +
      "p0 1\n" +
      "p1 2\n" +
      "p2 function 3 p2 false\n" +
      "p3 4\n" +
      "order 13\n",
  );
});

test("object literal model keeps spread key positions and last values", () => {
  const testCase: ObjectLiteralCase = {
    properties: [
      { kind: "spread", spreadKeys: [2, 0], value: 7 },
      { kind: "data", spreadKeys: [], value: 1 },
      { kind: "spread-nullish", spreadKeys: [], value: 0 },
      { kind: "get", spreadKeys: [], value: 5 },
    ],
  };
  assert.equal(
    expected(testCase),
    "keys p2,p0,p1,p3,\n" +
      "p2 7\n" +
      "p0 8\n" +
      "p1 1\n" +
      "p3 5\n" +
      "order 012\n",
  );
  const source = printCase(testCase);
  assert.match(source, /\.\.\.\(order = order \+ "0", \{ p2: 7, p0: 8 \}\)/u);
  assert.match(source, /\.\.\.\(order = order \+ "2", null\)/u);
});

test(
  "generated object literals match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "object literals preserve generated values, keys, and evaluation " +
        "order",
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
            { source, sourceId: "generated-m5-object-literal.ts" },
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
          "object literals with zero to four data, shorthand, method, " +
          "getter, setter, object spread, and nullish spread properties " +
          "over a shared five-name key pool and bounded integer values, " +
          "comparing an independent key-order, last-definition, and " +
          "evaluation-order model with Node.js, Deno, and both native " +
          "specialization policies with forced collection on the enabled " +
          "path",
        numRuns: 15,
        profile: "M5 basic object literal expressions",
        seed: 0x5eed_0015,
        sizeLimit:
          "zero to four properties, zero to three spread source keys, and " +
          "bounded integer values",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

type PrototypeValueKind =
  | "boolean"
  | "null"
  | "number"
  | "object-data"
  | "object-getter"
  | "object-setter"
  | "string"
  | "symbol"
  | "undefined";

type ProtoOrdinaryKind =
  | "computed"
  | "getter"
  | "method"
  | "setter"
  | "shorthand"
  | "spread";

interface ProtoLiteralCase {
  readonly abrupt: boolean;
  readonly ordinaryKind: ProtoOrdinaryKind;
  readonly position: number;
  readonly prototypeValue: PrototypeValueKind;
}

const protoLiteralArbitrary: fc.Arbitrary<ProtoLiteralCase> = fc.record({
  abrupt: fc.boolean(),
  ordinaryKind: fc.constantFrom<ProtoOrdinaryKind>(
    "computed",
    "getter",
    "method",
    "setter",
    "shorthand",
    "spread",
  ),
  position: fc.integer({ max: 3, min: 0 }),
  prototypeValue: fc.constantFrom<PrototypeValueKind>(
    "boolean",
    "null",
    "number",
    "object-data",
    "object-getter",
    "object-setter",
    "string",
    "symbol",
    "undefined",
  ),
});

function prototypeSetup(kind: PrototypeValueKind): string {
  if (kind === "object-data") {
    return "const prototypeValue = { inherited: 7 };";
  }
  if (kind === "object-getter") {
    return `const prototypeValue = {
  get inherited() { order = order + "G"; return 7; },
};`;
  }
  if (kind === "object-setter") {
    return `let inheritedStore = 0;
const prototypeValue = {
  set inherited(value) { inheritedStore = value; },
};`;
  }
  const value =
    kind === "null"
      ? "null"
      : kind === "undefined"
        ? "undefined"
        : kind === "number"
          ? "17"
          : kind === "boolean"
            ? "false"
            : kind === "string"
              ? '"primitive"'
              : 'Symbol("prototype")';
  return `const prototypeValue = ${value};`;
}

function ordinaryProtoToken(kind: ProtoOrdinaryKind): string {
  if (kind === "computed") return '["__proto__"]: 20';
  if (kind === "shorthand") return "__proto__";
  if (kind === "method") return "__proto__() { return 23; }";
  if (kind === "getter") return "get __proto__() { return 24; }";
  if (kind === "setter") {
    return "set __proto__(value) { ownSetterStore = value; }";
  }
  return '...(order = order + "S", { ["__proto__"]: 26 })';
}

function printProtoLiteralCase(testCase: ProtoLiteralCase): string {
  const tokens = [
    'first: (order = order + "F", 1)',
    ordinaryProtoToken(testCase.ordinaryKind),
    'last: (order = order + "L", guardMiss)',
  ];
  tokens.splice(
    testCase.position,
    0,
    `__proto__: (order = order + "P", ${
      testCase.abrupt ? "fail()" : "prototypeValue"
    })`,
  );
  const ownObservation =
    testCase.ordinaryKind === "method"
      ? `console.log(
  "own-method",
  ownDescriptor.value(),
  ownDescriptor.value.name,
  "prototype" in ownDescriptor.value,
);`
      : testCase.ordinaryKind === "getter"
        ? `console.log(
  "own-getter",
  ownDescriptor.get(),
  ownDescriptor.set,
  ownDescriptor.enumerable,
  ownDescriptor.configurable,
);`
        : testCase.ordinaryKind === "setter"
          ? `object.__proto__ = 44;
console.log(
  "own-setter",
  ownSetterStore,
  ownDescriptor.get,
  ownDescriptor.set.name,
);`
          : `console.log(
  "own-data",
  ownDescriptor.value,
  ownDescriptor.writable,
  ownDescriptor.enumerable,
  ownDescriptor.configurable,
);`;
  const prototypeObservation =
    testCase.prototypeValue === "object-data"
      ? `console.log("inherited-read", object.inherited);
object.inherited = 8;
const inheritedDescriptor = Object.getOwnPropertyDescriptor(
  object,
  "inherited",
);
console.log("inherited-write", inheritedDescriptor.value);`
      : testCase.prototypeValue === "object-getter"
        ? `console.log("inherited-getter", object.inherited, order);
console.log(
  "inherited-own",
  Object.getOwnPropertyDescriptor(object, "inherited"),
);`
        : testCase.prototypeValue === "object-setter"
          ? `console.log("inherited-read", object.inherited);
object.inherited = 8;
console.log(
  "inherited-setter",
  inheritedStore,
  Object.getOwnPropertyDescriptor(object, "inherited"),
);`
          : 'console.log("inherited-read", object.inherited);';
  return `
let order = "";
let ownSetterStore = 0;
const __proto__ = 21;
${prototypeSetup(testCase.prototypeValue)}
/**
 * @param {number} left
 * @param {number} right
 */
function hintedAdd(left, right) { return left + right; }
const guardMiss = hintedAdd("x", 1);
function fail() { throw new RangeError("prototype"); }
try {
  const object = { ${tokens.join(", ")} };
  let keys = "";
  for (const key of Object.keys(object)) { keys = keys + key + ","; }
  console.log("order", order);
  console.log("keys", keys);
  const ownDescriptor = Object.getOwnPropertyDescriptor(
    object,
    "__proto__",
  );
  ${ownObservation}
  ${prototypeObservation}
  console.log("guard", guardMiss);
} catch (error) {
  console.log("abrupt", error instanceof RangeError, order);
}
`;
}

function protoEffects(testCase: ProtoLiteralCase): string {
  const effects = ["F", testCase.ordinaryKind === "spread" ? "S" : "", "L"];
  effects.splice(testCase.position, 0, "P");
  if (!testCase.abrupt) return effects.join("");
  return effects.slice(0, testCase.position + 1).join("");
}

function expectedProtoLiteralCase(testCase: ProtoLiteralCase): string {
  const effects = protoEffects(testCase);
  if (testCase.abrupt) return `abrupt true ${effects}\n`;
  const own =
    testCase.ordinaryKind === "method"
      ? "own-method 23 __proto__ false"
      : testCase.ordinaryKind === "getter"
        ? "own-getter 24 undefined true true"
        : testCase.ordinaryKind === "setter"
          ? "own-setter 44 undefined set __proto__"
          : `own-data ${
              testCase.ordinaryKind === "computed"
                ? 20
                : testCase.ordinaryKind === "shorthand"
                  ? 21
                  : 26
            } true true true`;
  const prototype =
    testCase.prototypeValue === "object-data"
      ? "inherited-read 7\ninherited-write 8"
      : testCase.prototypeValue === "object-getter"
        ? `inherited-getter 7 ${effects}G\ninherited-own undefined`
        : testCase.prototypeValue === "object-setter"
          ? "inherited-read undefined\ninherited-setter 8 undefined"
          : "inherited-read undefined";
  return (
    `order ${effects}\n` +
    "keys first,__proto__,last,\n" +
    `${own}\n${prototype}\nguard x1\n`
  );
}

test("prototype setter separates own keys and [[Prototype]]", () => {
  const testCase: ProtoLiteralCase = {
    abrupt: false,
    ordinaryKind: "spread",
    position: 2,
    prototypeValue: "object-setter",
  };
  assert.equal(
    expectedProtoLiteralCase(testCase),
    "order FSPL\n" +
      "keys first,__proto__,last,\n" +
      "own-data 26 true true true\n" +
      "inherited-read undefined\n" +
      "inherited-setter 8 undefined\n" +
      "guard x1\n",
  );
});

test(
  "generated object prototype setters match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "object prototype setters preserve prototypes and ordinary properties",
      fc.asyncProperty(protoLiteralArbitrary, async (testCase) => {
        const source = printProtoLiteralCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expectedProtoLiteralCase(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-object-prototype.ts" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
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
          "object literals with one colon-form prototype setter at any of " +
          "four positions, null, object, and primitive prototype values, " +
          "computed, shorthand, method, accessor, and spread __proto__ " +
          "properties, inherited reads and writes, effects and abrupt " +
          "completion, a false number hint and deliberate guard miss, both " +
          "specialization policies, and forced collection",
        numRuns: 16,
        profile: "M5 object literal prototype setters",
        seed: 0x5eed_0024,
        sizeLimit:
          "four definitions, one prototype setter, one ordinary __proto__ " +
          "form, and bounded scalar observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

const duplicateOrdinaryArbitrary = fc.constantFrom<ProtoOrdinaryKind>(
  "computed",
  "getter",
  "method",
  "setter",
  "shorthand",
  "spread",
);

test("generated duplicate prototype setters remain early errors", async () => {
  await assertAsyncProperty(
    "only a second colon-form prototype setter is invalid",
    fc.asyncProperty(duplicateOrdinaryArbitrary, async (ordinaryKind) => {
      const source = `
const __proto__ = 21;
({
  __proto__: null,
  ${ordinaryProtoToken(ordinaryKind)},
  "__proto__": {},
});`;
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          { source, sourceId: "duplicate-m5-object-prototype.js" },
          { specialization },
        );
        assert.equal(compiled.diagnostics[0]?.code, "OSEO0001");
        assert.equal(compiled.hir, undefined);
        assert.equal(compiled.mir, undefined);
      }
    }),
    {
      context: ["phase=parse", "expected=SyntaxError"],
      domain:
        "two noncomputed colon-form __proto__ definitions separated by one " +
        "computed, shorthand, method, accessor, or spread ordinary property",
      numRuns: 12,
      profile: "M5 object literal prototype setter early errors",
      seed: 0x5eed_0025,
      sizeLimit: "three definitions and six permitted intervening forms",
      timeLimitMilliseconds: 30_000,
    },
  );
});
