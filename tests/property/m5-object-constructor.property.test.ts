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
const stringPrototype = Object.getPrototypeOf(stringWrapper);
const booleanPrototype = Object.getPrototypeOf(booleanWrapper);
const bigintPrototype = Object.getPrototypeOf(Object(1n));
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
  "prototype brands",
  Object.prototype.toString.call(booleanPrototype),
  Object.prototype.toString.call(stringPrototype),
  Object.prototype.toString.call(bigintPrototype),
);
console.log(
  "string wrapper",
  stringWrapper[0],
  stringWrapper.length,
  Object.getPrototypeOf(stringWrapper) ===
    Object.getPrototypeOf(secondStringWrapper),
  Object.prototype.toString.call(stringWrapper),
);
const stringTagLog = [];
Object.defineProperty(stringPrototype, Symbol.toStringTag, {
  configurable: true,
  get() {
    stringTagLog.push(this.length);
    return this[0];
  },
});
console.log(
  "string tag wrapper",
  Object.prototype.toString.call(${JSON.stringify(testCase.text)}),
  stringTagLog[0],
);
delete stringPrototype[Symbol.toStringTag];
const localeLog = [];
Object.defineProperty(booleanPrototype, "toString", {
  configurable: true,
  get() {
    localeLog.push(Object.getPrototypeOf(this) === booleanPrototype);
    return function () {
      localeLog.push(Object.getPrototypeOf(this) === booleanPrototype);
      return ${JSON.stringify(testCase.text)};
    };
  },
});
console.log(
  "primitive locale",
  Object.prototype.toLocaleString.call(${testCase.flag}),
  localeLog[0],
  localeLog[1],
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
const originalCreate = Object.create;
const originalDefineProperty = Object.defineProperty;
const originalGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const originalKeys = Object.keys;
Object.create = function () {
  return this === Object ? ${testCase.integer} : 0;
};
Object.defineProperty = function () { return this === Object ? 2 : 0; };
Object.getOwnPropertyDescriptor = function () {
  return this === Object ? 3 : 0;
};
Object.keys = function () { return this === Object ? 4 : 0; };
Object.assign = function () { return this === Object ? 7 : 0; };
function callPatchedAssign() { return Object.assign(); }
console.log(
  "patched statics",
  Object.create(null),
  Object.defineProperty(),
  Object.getOwnPropertyDescriptor(),
  Object.keys(),
  callPatchedAssign(),
);
const objectAlias = Object;
objectAlias.assign = function () {
  return this === Object ? ${testCase.integer} : 0;
};
console.log("alias static", Object.assign());
originalDefineProperty(objectAlias, "assign", {
  configurable: true,
  value: function () {
    return this === Object ? ${JSON.stringify(testCase.text)} : "wrong";
  },
  writable: true,
});
console.log("defined static", Object.assign());
Object.create = originalCreate;
Object.defineProperty = originalDefineProperty;
Object.getOwnPropertyDescriptor = originalGetOwnPropertyDescriptor;
Object.keys = originalKeys;
delete Object.assign;
const replacementLog = [];
const replacementObject = {};
replacementObject.create = function () { return 9; };
replacementObject.defineProperty = function () { return 10; };
replacementObject.getOwnPropertyDescriptor = function () { return 11; };
replacementObject.keys = function () { return 12; };
originalDefineProperty(replacementObject, "assign", {
  get() {
    replacementLog.push("get");
    return function (value) {
      replacementLog.push(this === replacementObject ? "receiver" : "bad");
      replacementLog.push(value);
      return 8;
    };
  },
});
function replacementArgument() {
  replacementLog.push("argument");
  return ${JSON.stringify(testCase.text)};
}
function callReplacementAssign() {
  return Object.assign(replacementArgument());
}
Object = replacementObject;
console.log(
  "replacement static",
  Object.create(null),
  Object.defineProperty(),
  Object.getOwnPropertyDescriptor(),
  Object.keys(),
  callReplacementAssign(),
  replacementLog[0],
  replacementLog[1],
  replacementLog[2],
  replacementLog[3],
);
Object = originalObject;
const stringToString = function () { return "string"; };
const booleanValueOf = function () { return false; };
const bigintToString = function () { return "bigint"; };
delete stringPrototype.valueOf;
stringPrototype.toString = stringToString;
delete booleanPrototype.toString;
booleanPrototype.valueOf = booleanValueOf;
delete bigintPrototype.valueOf;
bigintPrototype.toString = bigintToString;
stringPrototype[Symbol.toStringTag] = "Custom";
console.log(
  "primitive tag",
  Object.prototype.toString.call(${JSON.stringify(testCase.text)}),
  Object.prototype.toString.call(${testCase.flag}),
  Object.prototype.toString.call(1n),
);
for (let index = 0; index < 8; index = index + 1) {
  Object(${JSON.stringify(testCase.text)});
  Object(${testCase.flag});
  Object(1n);
}
console.log(
  "wrapper mutations",
  stringPrototype.hasOwnProperty("valueOf"),
  stringPrototype.toString === stringToString,
  booleanPrototype.hasOwnProperty("toString"),
  booleanPrototype.valueOf === booleanValueOf,
  bigintPrototype.hasOwnProperty("valueOf"),
  bigintPrototype.toString === bigintToString,
);
Object.defineProperty(booleanPrototype, Symbol.toStringTag, {
  configurable: true,
  get() { throw new RangeError("tag getter"); },
});
try { Object.prototype.toString.call(${testCase.flag}); } catch (error) {
  console.log("tag getter abrupt", error.name, error.message);
}
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
    "prototype brands [object Boolean] [object String] [object BigInt]",
    `string wrapper ${testCase.text[0]} ${testCase.text.length} true ` +
      "[object String]",
    `string tag wrapper [object ${testCase.text[0]}] ` +
      `${testCase.text.length}`,
    `primitive locale ${testCase.text} true true`,
    "same value true false true true true false",
    `prototype true true ${selected} ${testCase.integer}`,
    "null prototype read true",
    "invalid prototype write true",
    `hint ${testCase.integer + 1} ${testCase.text}1`,
    "guard true",
    "guard true",
    "guard true",
    `patched statics ${testCase.integer} 2 3 4 7`,
    `alias static ${testCase.integer}`,
    `defined static ${testCase.text}`,
    `replacement static 9 10 11 12 8 get argument receiver ${testCase.text}`,
    "primitive tag [object Custom] [object Boolean] [object BigInt]",
    "wrapper mutations false true false true false true",
    "tag getter abrupt RangeError tag getter",
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
          "Object write and restore, mutable legacy and later statics, " +
          "alias and descriptor static replacement, default wrapper " +
          "prototype brands, stable wrapper mutations, primitive " +
          "toStringTag lookup, and primitive locale receiver lookup",
        numRuns: 12,
        profile: "M5 Object constructor",
        seed: 0x6000_3600,
        sizeLimit:
          "one bounded integer, one boolean, one short string, two prototype " +
          "objects, seven wrappers, two repeated intrinsic observations, " +
          "and one global mutation sequence with wrapper and static " +
          "mutations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
