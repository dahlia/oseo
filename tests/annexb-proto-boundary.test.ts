/* eslint-disable no-await-in-loop -- Native observations are isolated. */

/*
 * The Object.prototype.__proto__ accessor of ECMA-262 20.1.3.8. Each
 * program runs natively under both specialization policies with collection
 * forced at every safepoint. Node.js is the reference: Deno 2.9.7 replaces
 * the accessor with a shim that never changes a prototype, so it only
 * checks the identity metadata it reports separately.
 */

import assert from "node:assert/strict";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { runNativeCli } from "./native-cli.ts";
import { agentReferencePrelude } from "./native/agent-reference.ts";
import { realmReferencePrelude } from "./native/realm-reference.ts";
import {
  annexbIntegrityExpected,
  annexbIntegrityProgram,
  annexbIntegrityScenarios,
} from "./helpers/annexb-integrity.ts";

import {
  annexbIdentityExpected,
  annexbIdentityDenoExpected,
  annexbIdentityProgram,
} from "./helpers/annexb-identity.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** The Node.js output of one Script, with a reference `$262` on request. */
async function nodeReference(
  source: string,
  test262Host: boolean,
): Promise<string> {
  const directory = await host.makeTemporaryDirectory("oseo-proto-ref-");
  try {
    const path = join(directory, "case.js");
    await host.writeTextFile(
      path,
      (test262Host ? agentReferencePrelude + realmReferencePrelude : "") +
        source,
    );
    const observed = await host.run({
      command: process.execPath,
      args: [path],
      cwd: directory,
    });
    assert.equal(observed.exitStatus, 0, observed.stderr);
    assert.equal(observed.stderr, "");
    return observed.stdout;
  } finally {
    await host.remove(directory);
  }
}

/**
 * Runs one Script natively under both policies with forced collection and
 * requires Node.js's output, and `expected` too when the test pins it.
 */
async function differential(
  source: string,
  sourceId: string,
  options: { readonly expected?: string; readonly test262Host?: boolean } = {},
): Promise<void> {
  const test262Host = options.test262Host === true;
  const reference = await nodeReference(source, test262Host);
  if (options.expected != null) assert.equal(reference, options.expected);
  for (const specialization of ["disabled", "enabled"] as const) {
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      const native = await runNativeCli(
        {
          args: [
            ...(test262Host ? ["--test262-host"] : []),
            ...(specialization === "disabled" ? ["--no-specialization"] : []),
            sourceId,
          ],
          source,
          sourceId,
          version: "0.1.0",
        },
        host,
      );
      assert.equal(native.stderr, "", `${specialization}: ${source}`);
      assert.equal(native.exitStatus, 0, source);
      assert.equal(native.stdout, reference, `${specialization}: ${source}`);
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}

/** Names the prototypes a read in these programs can return. */
const describe = `
function describe(value) {
  if (value === null) return "null";
  if (value === Object.prototype) return "Object.prototype";
  if (value === Uint8Array.prototype) return "Uint8Array.prototype";
  if (value === parent) return "parent";
  return typeof value;
}
const parent = { tag: "parent" };
`;

test(
  "unrelated abrupt completions keep their own errors",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const source of [
      'throw new RangeError("prior"); ({}).__proto__;',
      '({ get __proto__() { throw new RangeError("getter"); } }).__proto__;',
      'new Proxy({}, { get() { throw new RangeError("proxy"); } }).__proto__;',
      "const value = null; value.__proto__;",
    ]) {
      for (const specialization of ["disabled", "enabled"] as const) {
        const sourceId = "unrelated-proto-failure.js";
        const native = await runNativeCli(
          {
            args: [
              ...(specialization === "disabled" ? ["--no-specialization"] : []),
              sourceId,
            ],
            source,
            sourceId,
            version: "0.1.0",
          },
          host,
        );
        assert.equal(native.exitStatus, 1);
        assert.match(native.stderr, /error\[OSEO2001\]:/u);
        assert.doesNotMatch(native.stderr, /OSEO1001/u);
        assert.match(native.stderr, /OSEO_THROWN (?:RangeError|TypeError)/u);
      }
    }
  },
);
test(
  "accessor reads reach the getter on every path",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const expression of [
      "({}).__proto__",
      '({})["__proto__"]',
      "new Uint8Array(new ArrayBuffer(0)).__proto__",
      'Reflect.get({}, "__proto__")',
      'Reflect.get(Object.prototype, "__proto__", Object.create(parent))',
      "new Proxy({}, {}).__proto__",
      "new Proxy(Object.create(parent), {}).__proto__",
      "Object.prototype.__proto__",
      "(1).__proto__.__proto__",
      "(() => { /** @param {number} value */ " +
        "function read(value) { return value.__proto__; } " +
        'read({ ["__proto__"]: 1 }); return read({}); })()',
      "(() => { class Reader { read() { return super.__proto__; } } " +
        "return new Reader().read(); })()",
      "$262.createRealm().global.Object.prototype.__proto__",
    ]) {
      await differential(
        `${describe}console.log("before");\n` +
          `console.log(describe(${expression}));\nconsole.log("after");\n`,
        "annexb-proto.js",
        { test262Host: expression.includes("$262") },
      );
    }
  },
);

test(
  "accessor writes reach the setter on every path",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const [statement, target] of [
      ["const o = {}; o.__proto__ = parent;", "o"],
      ['const o = {}; (() => { "use strict"; o.__proto__ = parent; })();', "o"],
      ['const o = {}; o["__proto__"] = parent;', "o"],
      ["const o = Object.create({}); o.__proto__ = parent;", "o"],
      [
        "const o = Object.create({}); o.__proto__ = 1;",
        "Object.getPrototypeOf(o)",
      ],
      [
        "const o = new Uint8Array(new ArrayBuffer(0)); o.__proto__ = parent;",
        "o",
      ],
      ['const o = {}; Reflect.set({}, "__proto__", parent, o);', "o"],
      [
        'const o = Object.create(null); Reflect.set({}, "__proto__", ' +
          "parent, o);",
        "o",
      ],
      ["const o = new Proxy({}, {}); o.__proto__ = parent;", "o"],
      ['const o = Object.assign({}, { ["__proto__"]: parent });', "o"],
      ["Object.prototype.__proto__ = null; const o = Object.prototype;", "o"],
      [
        "class Writer { write() { super.__proto__ = parent; } } " +
          "const o = new Writer(); o.write();",
        "o",
      ],
      [
        "const other = $262.createRealm().global; const o = {}; " +
          "other.Object.prototype.__lookupSetter__('__proto__').call(o, " +
          "parent);",
        "o",
      ],
    ] as const) {
      const shown = target === "o" ? "Object.getPrototypeOf(o)" : target;
      await differential(
        `${describe}${statement}\nconsole.log(describe(${shown}), ` +
          'Object.hasOwn(o, "__proto__"));\n',
        "annexb-proto-write.js",
        { test262Host: statement.includes("$262") },
      );
    }
  },
);

// Every write here is answered before its walk reaches the intrinsic
// accessor, so the setter never runs.
const preservedWrites = `const log = [];
const ownData = { ["__proto__"]: 1 };
ownData.__proto__ = 2;
log.push([
  "own data",
  ownData.__proto__,
  Object.getPrototypeOf(ownData) === Object.prototype,
]);
let ownStore = 0;
const ownAccessor = {
  get __proto__() { return ownStore; },
  set __proto__(value) { ownStore = value; },
};
ownAccessor.__proto__ = 3;
log.push(["own accessor", ownStore, ownAccessor.__proto__]);
const ownReadOnly = Object.defineProperty({}, "__proto__", {
  value: 4,
  writable: false,
});
ownReadOnly.__proto__ = 5;
let strictReadOnly = "none";
(() => {
  "use strict";
  try {
    ownReadOnly.__proto__ = 6;
  } catch (error) {
    strictReadOnly = error instanceof TypeError;
  }
})();
log.push(["own read-only", ownReadOnly.__proto__, strictReadOnly]);
const dataParent = { ["__proto__"]: 7 };
const dataChild = Object.create(dataParent);
dataChild.__proto__ = 8;
log.push([
  "inherited data",
  dataChild.__proto__,
  Object.hasOwn(dataChild, "__proto__"),
  dataParent.__proto__,
  Object.getPrototypeOf(dataChild) === dataParent,
]);
let inheritedStore = null;
const accessorParent = {
  set __proto__(value) {
    inheritedStore = [value, this === accessorChild];
  },
};
const accessorChild = Object.create(accessorParent);
accessorChild.__proto__ = 9;
log.push([
  "inherited accessor",
  inheritedStore.join(),
  Object.hasOwn(accessorChild, "__proto__"),
]);
const readOnlyParent = Object.defineProperty({}, "__proto__", {
  value: 10,
  writable: false,
});
const readOnlyChild = Object.create(readOnlyParent);
readOnlyChild.__proto__ = 11;
log.push([
  "inherited read-only",
  readOnlyChild.__proto__,
  Object.hasOwn(readOnlyChild, "__proto__"),
]);
const trapped = [];
const trapProxy = new Proxy({}, {
  set(target, key, value, receiver) {
    trapped.push(key, value, receiver === trapProxy);
    return true;
  },
});
trapProxy.__proto__ = 12;
const proxyChild = Object.create(trapProxy);
proxyChild.__proto__ = 13;
log.push([
  "proxy trap",
  trapped.join(),
  Object.hasOwn(proxyChild, "__proto__"),
]);
const nullProto = Object.create(null);
nullProto.__proto__ = 14;
const nullChild = Object.create(nullProto);
nullChild.__proto__ = 15;
log.push([
  "null prototype",
  nullProto.__proto__,
  Object.getPrototypeOf(nullProto) === null,
  nullChild.__proto__,
  Object.hasOwn(nullChild, "__proto__"),
]);
const receiver = {};
const reflected = Reflect.set(
  Object.create(null),
  "__proto__",
  16,
  receiver,
);
log.push([
  "reflect receiver",
  reflected,
  Object.hasOwn(receiver, "__proto__"),
  receiver.__proto__ === 16,
]);
const literalParent = { label: "literal" };
const literal = { __proto__: literalParent };
log.push([
  "literal setter",
  Object.getPrototypeOf(literal) === literalParent,
  literal.label,
  Object.hasOwn(literal, "__proto__"),
]);
const ordinary = {};
Object.setPrototypeOf(ordinary, literalParent);
Object.defineProperty(ordinary, "__proto__", {
  value: 17,
  writable: true,
  enumerable: true,
  configurable: true,
});
log.push(["define and setPrototypeOf", ordinary.label, ordinary.__proto__]);
let userStore = 0;
Object.defineProperty(Object.prototype, "__proto__", {
  set(value) { userStore = value; },
  configurable: true,
});
({}).__proto__ = 18;
delete Object.prototype.__proto__;
log.push(["user accessor on Object.prototype", userStore]);
const primitive = 1;
primitive.__proto__ = {};
log.push(["primitive base", typeof primitive]);
const numericView = new Uint8Array(2);
numericView["1"] = 19;
log.push(["typed-array numeric key", numericView[1]]);
for (const entry of log) console.log(entry.join(" "));
`;
const preservedOutput = `own data 2 true
own accessor 3 3
own read-only 4 true
inherited data 8 true 7 true
inherited accessor 9,true false
inherited read-only 10 false
proxy trap __proto__,12,true,__proto__,13,false false
null prototype 14 true 15 true
reflect receiver true true true
literal setter true literal false
define and setPrototypeOf literal 17
user accessor on Object.prototype 18
primitive base number
typed-array numeric key 19
`;

test(
  "writes answered before the intrinsic setter keep their behavior",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await differential(preservedWrites, "annexb-proto-write-preserved.js", {
      expected: preservedOutput,
    });
  },
);

const deletedIntrinsicWrites = `
const primitiveKinds = [1, true, "s", 1n, Symbol("s")];
const userCalls = [];
Object.defineProperty(Object.prototype, "__proto__", {
  set: function (value) {
    "use strict";
    userCalls.push(typeof this + ":" + value);
  },
  configurable: true,
});
for (const primitive of primitiveKinds) {
  primitive.__proto__ = 7;
  (function (value) { "use strict"; value.__proto__ = 7; })(primitive);
}
console.log("user", userCalls.join(","));
console.log("delete", delete Object.prototype.__proto__,
  Object.hasOwn(Object.prototype, "__proto__"),
  Object.prototype.__proto__, ({}).__proto__);
for (const primitive of primitiveKinds) {
  primitive.__proto__ = 9;
  let strict = "none";
  try {
    (function (value) { "use strict"; value.__proto__ = 9; })(primitive);
  } catch (error) { strict = error.name; }
  console.log("primitive", typeof primitive, strict,
    Reflect.set({}, "__proto__", 9, primitive));
}
const ordinary = {};
ordinary.__proto__ = 21;
console.log("own", ordinary.__proto__, Object.hasOwn(ordinary, "__proto__"),
  Object.getPrototypeOf(ordinary) === Object.prototype);
let setterCalls = 0;
let getterCalls = 0;
let setterKind = "none";
Object.defineProperty(Object.prototype, "__proto__", {
  get: function () { getterCalls++; return 22; },
  set: function () {
    "use strict";
    setterCalls++;
    setterKind = typeof this;
    throw new RangeError("user setter");
  },
  configurable: true,
});
let abrupt = "none";
try { (function () { "use strict"; (1).__proto__ = 23; })(); }
catch (error) { abrupt = error.name; }
console.log("abrupt", abrupt, setterCalls, getterCalls, setterKind);
console.log("getter", (1).__proto__, getterCalls);
delete Object.prototype.__proto__;
console.log("delete again", (1).__proto__, Object.prototype.__proto__);
Object.defineProperty(Object.prototype, "__proto__", {
  value: 31, writable: false, configurable: false,
});
const failedDelete = delete Object.prototype.__proto__;
let strictDelete = "none";
try { (function () { "use strict"; delete Object.prototype.__proto__; })(); }
catch (error) { strictDelete = error.name; }
console.log("failed delete", failedDelete, strictDelete,
  Object.prototype.__proto__);
`;
const deletedIntrinsicExpected =
  "user number:7,number:7,boolean:7,boolean:7,string:7,str" +
  "ing:7,bigint:7,bigint:7,symbol:7,symbol:7\n" +
  "delete true false undefined undefined\n" +
  "primitive number TypeError false\n" +
  "primitive boolean TypeError false\n" +
  "primitive string TypeError false\n" +
  "primitive bigint TypeError false\n" +
  "primitive symbol TypeError false\n" +
  "own 21 true true\n" +
  "abrupt RangeError 1 0 number\n" +
  "getter 22 1\n" +
  "delete again undefined undefined\n" +
  "failed delete false TypeError 31\n";

test(
  "a replaced or deleted intrinsic accessor leaves ordinary Get and Set",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await differential(deletedIntrinsicWrites, "annexb-proto-deleted.js", {
      expected: deletedIntrinsicExpected,
    });
  },
);

test(
  "accessor deletion belongs to its intrinsic realm",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await differential(
      `${describe}const other = $262.createRealm().global;
delete other.Object.prototype.__proto__;
console.log("foreign deleted",
  Object.create(other.Object.prototype).__proto__,
  describe(({}).__proto__));
delete Object.prototype.__proto__;
const fresh = $262.createRealm().global;
console.log("local deleted", ({}).__proto__,
  new fresh.Object().__proto__ === fresh.Object.prototype);
`,
      "annexb-proto-realm-delete.js",
      { test262Host: true },
    );
  },
);

test(
  "intrinsic integrity metadata preserves ordered core operations",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const scenario of annexbIntegrityScenarios) {
      const input = { scenario, value: 7 };
      for (const specialization of ["disabled", "enabled"] as const) {
        process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
        try {
          const sourceId = `annexb-integrity-${scenario}.js`;
          const observed = await runNativeCli(
            {
              args: [
                ...(specialization === "disabled"
                  ? ["--no-specialization"]
                  : []),
                sourceId,
              ],
              source: annexbIntegrityProgram(input),
              sourceId,
              version: "0.1.0",
            },
            host,
          );
          assert.equal(observed.exitStatus, 0, observed.stderr);
          assert.equal(observed.stdout, annexbIntegrityExpected(input));
          assert.equal(observed.stderr, "");
        } finally {
          delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        }
      }
    }
  },
);

test(
  "forwarded and copied accessor halves run their bodies",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const prefix =
      `${describe}const P = Object.prototype; const K = "__proto__";\n` +
      "const d = Object.getOwnPropertyDescriptor(P, K);\n" +
      "const o = Object.create(parent);\n";
    for (const source of [
      "console.log(describe(d.get.call(o)));",
      "console.log(d.set.call(o, null), Object.getPrototypeOf(o));",
      "console.log(describe(d.get.apply(o)));",
      "console.log(d.set.apply(o, [null]), Object.getPrototypeOf(o));",
      "console.log(describe(d.get.bind(o)()));",
      "d.set.bind(o)(P); console.log(describe(Object.getPrototypeOf(o)));",
      "console.log(describe(Reflect.apply(d.get, o, [])));",
      "console.log(describe(new Proxy(d.get, {}).call(o)));",
      "new Proxy(d.set, {}).call(o, P);" +
        "console.log(describe(Object.getPrototypeOf(o)));",
      "for (const fn of [d.get, d.set]) { try { fn(); } catch (error) " +
        "{ console.log(error.constructor === TypeError); } }",
      "const copy = Object.create(parent);" +
        "Object.defineProperty(copy, 'x', d); console.log(describe(copy.x));",
      "delete P.__proto__; Object.defineProperty(P, K, d);" +
        "console.log(describe(o.__proto__), Reflect.ownKeys(P).at(-1));",
      "Object.defineProperty(P, K, { get: function () { return 1; } });" +
        "console.log(o.__proto__, (1).__proto__ = 2);",
      "Object.freeze(P); console.log(describe(o.__proto__));" +
        "o.__proto__ = null; console.log(Object.getPrototypeOf(o));",
      "Object.freeze(new Proxy(P, {})); console.log(Object.isFrozen(P)," +
        "describe(({}).__proto__));",
      "Object.freeze(new Proxy(P, {" +
        "getOwnPropertyDescriptor(t, k) {" +
        "return Reflect.getOwnPropertyDescriptor(t, k); }}));" +
        "console.log(Object.isFrozen(P), describe(({}).__proto__));",
    ]) {
      await differential(prefix + source + "\n", "annexb-accessor-body.js");
    }
  },
);

test(
  "integrity changes stay local to their intrinsic realm",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await differential(
      `const other = $262.createRealm().global;
Object.freeze(other.Object.prototype);
console.log("foreign", Reflect.deleteProperty(other.Object.prototype,
  "__proto__"), Object.isFrozen(other.Object.prototype));
console.log("local", delete Object.prototype.__proto__,
  Object.hasOwn(Object.prototype, "__proto__"), typeof ({}).__proto__);
console.log("foreign read", Object.create(other.Object.prototype).__proto__
  === other.Object.prototype);
`,
      "annexb-integrity-realm.js",
      {
        expected:
          "foreign false true\nlocal true false undefined\n" +
          "foreign read true\n",
        test262Host: true,
      },
    );
  },
);

test(
  "accessor identities retain core metadata and native grammar",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async (t) => {
    const base = await readFile(
      new URL("test262/harness/base.js", import.meta.url),
      "utf8",
    );
    const matcher = await readFile(
      new URL(import.meta.resolve("test262/harness/nativeFunctionMatcher.js")),
      "utf8",
    );
    const source =
      `${base}\n${matcher}\n${annexbIdentityProgram(17)}\n` +
      "const d = Object.getOwnPropertyDescriptor(Object.prototype, " +
      '"__proto__");\nassertNativeFunction(d.get);\n' +
      "assertNativeFunction(d.set);\n" +
      "Object.freeze(new Proxy(Object.prototype, { " +
      "getOwnPropertyDescriptor(t, k) { " +
      "return Reflect.getOwnPropertyDescriptor(t, k); } }));\n" +
      'console.log("forwarded", Object.isFrozen(Object.prototype), ' +
      'Object.getOwnPropertyDescriptor(Object.prototype, "__proto__").get ' +
      "=== d.get);\n" +
      "assert.throws(TypeError, function () { Object.defineProperty(" +
      'Object.prototype, "__proto__", { get: function () {} }); });\n';
    const expected = annexbIdentityExpected + "forwarded true true\n";
    const directory = await host.makeTemporaryDirectory("oseo-identity-ref-");
    try {
      const path = join(directory, "case.js");
      await host.writeTextFile(path, source);
      for (const [command, args] of [
        ["node", [path]],
        ["deno", ["run", "--quiet", path]],
      ] as const) {
        await host.writeTextFile(
          path,
          command === "deno" ? annexbIdentityProgram(17) : source,
        );
        const observed = await host.run({ command, args, cwd: directory });
        assert.deepEqual(observed, {
          exitStatus: 0,
          stderr: "",
          stdout: command === "deno" ? annexbIdentityDenoExpected : expected,
        });
      }
      for (const policy of ["disabled", "enabled"] as const) {
        process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
        try {
          const observed = await runNativeCli(
            {
              args: [
                ...(policy === "disabled" ? ["--no-specialization"] : []),
                "annexb-identities.js",
              ],
              source,
              sourceId: "annexb-identities.js",
              version: "0.1.0",
            },
            host,
          );
          t.diagnostic(JSON.stringify({ policy, observed }));
          assert.deepEqual(observed, {
            executed: true,
            exitStatus: 0,
            stderr: "",
            stdout: expected,
          });
        } finally {
          delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        }
      }
    } finally {
      await host.remove(directory);
    }
  },
);

test(
  "accessor identities belong to their realm across collection",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async (t) => {
    const source = `
const K = "__proto__";
const local = Object.getOwnPropertyDescriptor(Object.prototype, K);
const other = $262.createRealm().global;
const foreign = Object.getOwnPropertyDescriptor(other.Object.prototype, K);
console.log("realm", local.get !== foreign.get, local.set !== foreign.set,
  Object.getPrototypeOf(local.get) === Function.prototype,
  Object.getPrototypeOf(foreign.get) === other.Function.prototype);
Object.freeze(other.Object.prototype);
console.log("foreign", Reflect.defineProperty(other.Object.prototype, K,
  { get: foreign.get }), Reflect.defineProperty(other.Object.prototype, K,
  { get: local.get }));
console.log("local", delete Object.prototype.__proto__,
  Object.hasOwn(other.Object.prototype, K));
`;
    for (const policy of ["disabled", "enabled"] as const) {
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        const observed = await runNativeCli(
          {
            args: [
              "--test262-host",
              ...(policy === "disabled" ? ["--no-specialization"] : []),
              "annexb-identity-realms.js",
            ],
            source,
            sourceId: "annexb-identity-realms.js",
            version: "0.1.0",
          },
          host,
        );
        t.diagnostic(JSON.stringify({ policy, observed }));
        assert.deepEqual(observed, {
          executed: true,
          exitStatus: 0,
          stderr: "",
          stdout:
            "realm true true true true\nforeign true false\n" +
            "local true true\n",
        });
      } finally {
        delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      }
    }
  },
);
