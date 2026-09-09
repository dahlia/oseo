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

interface ProxyCase {
  readonly configurable: boolean;
  readonly initial: number;
  readonly next: number;
  readonly nullPrototype: boolean;
  readonly writable: boolean;
}

const caseArbitrary: fc.Arbitrary<ProxyCase> = fc.record({
  configurable: fc.boolean(),
  initial: fc.integer({ max: 9, min: -9 }),
  next: fc.integer({ max: 9, min: -9 }),
  nullPrototype: fc.boolean(),
  writable: fc.boolean(),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printCase(testCase: ProxyCase): string {
  return `
const operations = [];
const target = {};
Object.defineProperty(target, "value", {
  value: ${testCase.initial},
  writable: ${testCase.writable},
  enumerable: true,
  configurable: ${testCase.configurable},
});
const handler = {
  getPrototypeOf(value) {
    operations.push("gp");
    return Reflect.getPrototypeOf(value);
  },
  setPrototypeOf(value, prototype) {
    operations.push("sp");
    return Reflect.setPrototypeOf(value, prototype);
  },
  isExtensible(value) {
    operations.push("ie");
    return Reflect.isExtensible(value);
  },
  preventExtensions(value) {
    operations.push("pe");
    return Reflect.preventExtensions(value);
  },
  getOwnPropertyDescriptor(value, key) {
    operations.push("go:" + String(key));
    return Reflect.getOwnPropertyDescriptor(value, key);
  },
  defineProperty(value, key, descriptor) {
    operations.push("dp:" + String(key));
    return Reflect.defineProperty(value, key, descriptor);
  },
  has(value, key) {
    operations.push("h:" + String(key));
    return Reflect.has(value, key);
  },
  get(value, key, receiver) {
    operations.push("g:" + String(key));
    return Reflect.get(value, key, receiver);
  },
  set(value, key, next, receiver) {
    operations.push("s:" + String(key));
    return Reflect.set(value, key, next, receiver);
  },
  deleteProperty(value, key) {
    operations.push("d:" + String(key));
    return Reflect.deleteProperty(value, key);
  },
  ownKeys(value) {
    operations.push("ok");
    return Reflect.ownKeys(value);
  },
};
const proxy = new Proxy(target, handler);
console.log("read", proxy.value, "value" in proxy);
console.log("set", Reflect.set(proxy, "value", ${testCase.next}), target.value);
console.log("keys", Reflect.ownKeys(proxy).join(","));
console.log(
  "descriptor",
  Object.getOwnPropertyDescriptor(proxy, "value").configurable,
);
console.log("delete", Reflect.deleteProperty(proxy, "value"));
console.log(
  "prototype",
  Reflect.setPrototypeOf(proxy, ${testCase.nullPrototype ? "null" : "{}"}),
  String(Reflect.getPrototypeOf(proxy)),
);
console.log("extensions", Reflect.preventExtensions(proxy));
console.log("extensible", Reflect.isExtensible(proxy));
console.log("operations", operations.join("|"));

function callable(left, right) { return this.base + left + right; }
const callableProxy = new Proxy(callable, {
  apply(value, receiver, argumentsList) {
    return Reflect.apply(value, receiver, argumentsList);
  },
  construct(value, argumentsList, newTarget) {
    return Reflect.construct(value, argumentsList, newTarget);
  },
});
console.log("call", callableProxy.call({ base: 10 }, 1, 2));
console.log("construct", new callableProxy(1, 2) instanceof callable);

const constructionOperations = [];
function ConstructionTarget(value) { this.value = value; }
const constructionPrototype = {};
const constructionProxy = new Proxy(ConstructionTarget, {
  construct(value, argumentsList, newTarget) {
    constructionOperations.push("construct");
    return Reflect.construct(value, argumentsList, newTarget);
  },
  get(value, key, receiver) {
    constructionOperations.push("get:" + String(key));
    if (key === "prototype") return constructionPrototype;
    return Reflect.get(value, key, receiver);
  },
});
const constructed = new constructionProxy(${testCase.initial});
console.log(
  "construction path",
  constructed.value,
  Object.getPrototypeOf(constructed) === constructionPrototype,
  constructionOperations.join("|"),
);

const coercionOperations = [];
const coercionProxy = new Proxy({
  [Symbol.toPrimitive](hint) {
    coercionOperations.push("call:" + hint);
    return ${testCase.next};
  },
}, {
  get(value, key, receiver) {
    coercionOperations.push(
      key === Symbol.toPrimitive ? "get:toPrimitive" : "get:" + String(key),
    );
    return Reflect.get(value, key, receiver);
  },
});
console.log(
  "proxy to primitive",
  coercionProxy + 1,
  coercionOperations.join("|"),
);

const sealOperations = [];
const sealTarget = { value: ${testCase.initial} };
const sealProxy = new Proxy(sealTarget, {
  preventExtensions(value) {
    sealOperations.push("pe");
    return Reflect.preventExtensions(value);
  },
  ownKeys(value) {
    sealOperations.push("ok");
    return Reflect.ownKeys(value);
  },
  getOwnPropertyDescriptor(value, key) {
    sealOperations.push("go:" + String(key));
    return Reflect.getOwnPropertyDescriptor(value, key);
  },
  defineProperty(value, key, descriptor) {
    sealOperations.push("dp:" + String(key));
    return Reflect.defineProperty(value, key, descriptor);
  },
});
Object.seal(sealProxy);
console.log("seal", Object.isSealed(sealTarget), sealOperations.join("|"));

const ownKeyReads = [];
const invalidOwnKeys = {
  length: 2,
  get 0() { ownKeyReads.push("zero"); return 1; },
  get 1() { ownKeyReads.push("one"); return "later"; },
};
let invalidOwnKeyError = false;
try {
  Reflect.ownKeys(new Proxy({}, { ownKeys() { return invalidOwnKeys; } }));
} catch (error) {
  invalidOwnKeyError = error instanceof TypeError;
}
console.log("ownKeys validation", invalidOwnKeyError, ownKeyReads.join("|"));

const arrayTarget = [];
const Species = function() {};
arrayTarget.constructor = { [Symbol.species]: Species };
const arrayProxy = new Proxy(new Proxy(arrayTarget, {}), {});
console.log(
  "proxy arrays",
  Array.isArray(arrayProxy),
  Object.getPrototypeOf(Array.prototype.concat.call(arrayProxy)) ===
    Species.prototype,
  [new Proxy([${testCase.initial}, ${testCase.next}], {})].flat().join(","),
);

const revocable = Proxy.revocable({}, {});
revocable.revoke();
let revoked = false;
try { Reflect.ownKeys(revocable.proxy); }
catch (error) { revoked = error instanceof TypeError; }
console.log("revoked", revoked);

let realmRevocationError = false;
let realmRevocable;
realmRevocable = Proxy.revocable(function() {}, {
  get() { realmRevocable.revoke(); }
});
try { new realmRevocable.proxy(); }
catch (error) { realmRevocationError = error instanceof TypeError; }
console.log("realm revocation", realmRevocationError);

function revokedBuiltinRealm(constructor, argumentsList) {
  const inner = Proxy.revocable(constructor, {});
  const bound = inner.proxy.bind(null);
  const outer = new Proxy(bound, {
    get(value, key, receiver) {
      return key === "prototype" ? 5 : Reflect.get(value, key, receiver);
    }
  });
  inner.revoke();
  try { Reflect.construct(constructor, argumentsList, outer); }
  catch (error) { return error instanceof TypeError; }
  return false;
}
console.log(
  "builtin realm revocation",
  revokedBuiltinRealm(Map, []),
  revokedBuiltinRealm(Object, []),
  revokedBuiltinRealm(Number, [${testCase.initial}]),
  revokedBuiltinRealm(String, ["${testCase.next}"]),
  revokedBuiltinRealm(Error, ["${testCase.initial}"]),
  revokedBuiltinRealm(Iterator, []),
  revokedBuiltinRealm(Array, []),
  revokedBuiltinRealm(Promise, [function() {}]),
  revokedBuiltinRealm(ArrayBuffer, [0]),
  revokedBuiltinRealm(DataView, [new ArrayBuffer(0)]),
  revokedBuiltinRealm(RegExp, []),
);

const callbackProxy = new Proxy((value) => value + ${testCase.next}, {});
const comparatorProxy = new Proxy((left, right) => left - right, {});
const valueOfProxy = new Proxy(() => ${testCase.initial}, {});
let iteratorIndex = 0;
const iteratorNextProxy = new Proxy(() => ({
  done: iteratorIndex === 2,
  value: iteratorIndex = iteratorIndex + 1,
}), {});
const callableIterator = {
  [Symbol.iterator]() { return { next: iteratorNextProxy }; }
};
console.log(
  "callable consumers",
  [1, 2].map(callbackProxy).join(","),
  [2, 1].sort(comparatorProxy).join(","),
  { valueOf: valueOfProxy } + 1,
  Array.from(callableIterator).join(","),
);

/** @param {number} value */
function hinted(value) { return value + 1; }
console.log("hint", hinted(1));
console.log(
  "false hint",
  hinted(new Proxy({ valueOf() { return 2; } }, {})),
);
const shaped = { value: 1 };
let turn = 0;
while (turn < 2) {
  console.log("guard", shaped.value);
  if (turn === 0) shaped.extra = 1;
  turn = turn + 1;
}
Promise.resolve(${testCase.initial}).then(new Proxy((value) => {
  console.log("promise callback", value + 1);
}, {}));
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
  const directory = await host.makeTemporaryDirectory("oseo-proxy-property-");
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
  "generated Proxy traps preserve target invariants",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "every Proxy internal method agrees with both execution hosts",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expected = await references(source);
        assertMatchingObservations(expected);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-proxy-exotic-object.ts" },
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
                assertMatchingObservations([...expected, native]);
                assert.ok(native.counters != null);
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
                "native-collector=forced",
              ],
        domain:
          "all thirteen Proxy traps, revocation, writable and configurable " +
          "target states, null and object prototypes, specialization on and " +
          "off, a false numeric hint, and an intentional shape-guard miss",
        numRuns: 12,
        profile: "M5 Proxy exotic objects",
        seed: 0x6000_6500,
        sizeLimit: "one target, one proxy, two properties, and two arguments",
        timeLimitMilliseconds: 360_000,
      },
    );
  },
);
