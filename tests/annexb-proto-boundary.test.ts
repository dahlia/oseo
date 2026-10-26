/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { runNativeCli } from "./native-cli.ts";
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

test(
  "unrelated abrupt completions are never relabeled as Annex B",
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
const diagnostic =
  "error[OSEO1001]: The Object.prototype.__proto__ " +
  "accessor is excluded by Annex B.";

test(
  "only the excluded accessor read reports the owned unsupported diagnostic",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const expression of [
      "({}).__proto__",
      '({})["__proto__"]',
      "new Uint8Array(new ArrayBuffer(0)).__proto__",
      'Reflect.get({}, "__proto__")',
      "new Proxy({}, {}).__proto__",
      "Object.prototype.__proto__",
      "(() => { /** @param {number} value */ " +
        "function read(value) { return value.__proto__; } " +
        'read({ ["__proto__"]: 1 }); return read({}); })()',
      "(() => { class Reader { read() { return super.__proto__; } } " +
        "return new Reader().read(); })()",
      "$262.createRealm().global.Object.prototype.__proto__",
    ]) {
      for (const specialization of ["disabled", "enabled"] as const) {
        process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
        try {
          const sourceId = "annexb-proto.js";
          const native = await runNativeCli(
            {
              args: [
                "--test262-host",
                ...(specialization === "disabled"
                  ? ["--no-specialization"]
                  : []),
                sourceId,
              ],
              source:
                `console.log("before");\n${expression};\n` +
                'console.log("after");\n',
              sourceId,
              version: "0.1.0",
            },
            host,
          );
          assert.equal(native.exitStatus, 1, expression);
          assert.equal(native.stdout, "before\n", expression);
          assert.ok(
            native.stderr.includes(`annexb-proto.js:2:`),
            native.stderr,
          );
          assert.ok(native.stderr.includes(diagnostic), native.stderr);
          assert.doesNotMatch(native.stderr, /OSEO2001/u);
        } finally {
          delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        }
      }
    }
  },
);

test(
  "only a write needing the excluded setter reports the diagnostic",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const statement of [
      "({}).__proto__ = {}",
      '(() => { "use strict"; ({}).__proto__ = {}; })()',
      '({})["__proto__"] = 1',
      "Object.create({}).__proto__ = 1",
      "new Uint8Array(new ArrayBuffer(0)).__proto__ = {}",
      'Reflect.set({}, "__proto__", {})',
      'Reflect.set({}, "__proto__", {}, Object.create(null))',
      "new Proxy({}, {}).__proto__ = {}",
      'Object.assign({}, { ["__proto__"]: 1 })',
      "Object.prototype.__proto__ = {}",
      "(() => { class Writer { write() { super.__proto__ = {}; } } " +
        "new Writer().write(); })()",
      "$262.createRealm().global.Object.prototype.__proto__ = {}",
    ]) {
      for (const specialization of ["disabled", "enabled"] as const) {
        process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
        try {
          const sourceId = "annexb-proto-write.js";
          const native = await runNativeCli(
            {
              args: [
                "--test262-host",
                ...(specialization === "disabled"
                  ? ["--no-specialization"]
                  : []),
                sourceId,
              ],
              source:
                `console.log("before");\n${statement};\n` +
                'console.log("after");\n',
              sourceId,
              version: "0.1.0",
            },
            host,
          );
          assert.equal(native.exitStatus, 1, statement);
          assert.equal(native.stdout, "before\n", statement);
          assert.ok(
            native.stderr.includes("annexb-proto-write.js:2:"),
            native.stderr,
          );
          assert.ok(native.stderr.includes(diagnostic), native.stderr);
          assert.doesNotMatch(native.stderr, /OSEO2001/u);
        } finally {
          delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        }
      }
    }
  },
);

// Every write here is answered before its walk reaches an intrinsic
// %Object.prototype% that lacks the key, so the excluded setter never runs
// and a reference host prints the same lines with or without it.
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
  "writes answered before the excluded setter keep their behavior",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const specialization of ["disabled", "enabled"] as const) {
      const sourceId = "annexb-proto-write-preserved.js";
      const native = await runNativeCli(
        {
          args: [
            ...(specialization === "disabled" ? ["--no-specialization"] : []),
            sourceId,
          ],
          source: preservedWrites,
          sourceId,
          version: "0.1.0",
        },
        host,
      );
      assert.equal(native.exitStatus, 0, native.stderr);
      assert.equal(native.stdout, preservedOutput);
      assert.equal(native.stderr, "");
    }
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
  "deleted excluded dependencies keep ordinary Get and Set semantics",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const specialization of ["disabled", "enabled"] as const) {
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        const sourceId = "annexb-proto-deleted.js";
        const native = await runNativeCli(
          {
            args: [
              ...(specialization === "disabled" ? ["--no-specialization"] : []),
              sourceId,
            ],
            source: deletedIntrinsicWrites,
            sourceId,
            version: "0.1.0",
          },
          host,
        );
        assert.equal(native.exitStatus, 0, native.stderr);
        assert.equal(native.stdout, deletedIntrinsicExpected);
        assert.equal(native.stderr, "");
      } finally {
        delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      }
    }
  },
);

test(
  "excluded dependency deletion belongs to its intrinsic realm",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const specialization of ["disabled", "enabled"] as const) {
      const flags = [
        "--test262-host",
        ...(specialization === "disabled" ? ["--no-specialization"] : []),
      ];
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        const sourceId = "annexb-proto-realm-delete.js";
        const positive = await runNativeCli(
          {
            args: [...flags, sourceId],
            source:
              "const other = $262.createRealm().global;\n" +
              "delete other.Object.prototype.__proto__;\n" +
              'console.log("deleted", ' +
              "Object.create(other.Object.prototype).__proto__);\n",
            sourceId,
            version: "0.1.0",
          },
          host,
        );
        assert.equal(positive.exitStatus, 0, positive.stderr);
        assert.equal(positive.stdout, "deleted undefined\n");
        assert.equal(positive.stderr, "");
        for (const source of [
          "delete Object.prototype.__proto__;\n" +
            "$262.createRealm().global.Object.prototype.__proto__;\n",
          "const other = $262.createRealm().global;\n" +
            "delete other.Object.prototype.__proto__;\n({}).__proto__;\n",
        ]) {
          const negative = await runNativeCli(
            { args: [...flags, sourceId], source, sourceId, version: "0.1.0" },
            host,
          );
          assert.equal(negative.exitStatus, 1);
          assert.ok(negative.stderr.includes(diagnostic), negative.stderr);
          assert.doesNotMatch(negative.stderr, /OSEO2001/u);
        }
      } finally {
        delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      }
    }
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
  "invoking an excluded accessor retains the Annex dependency diagnostic",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const prefix = 'const P = Object.prototype; const K = "__proto__";\n';
    for (const source of [
      "Object.getOwnPropertyDescriptor(P, K).get();",
      "Object.getOwnPropertyDescriptor(P, K).set({});",
      "Object.getOwnPropertyDescriptor(P, K).get.call({});",
      "Object.getOwnPropertyDescriptor(P, K).set.call({}, {});",
      "Object.getOwnPropertyDescriptor(P, K).get.apply({});",
      "Object.getOwnPropertyDescriptor(P, K).set.apply({}, [{}]);",
      "Object.getOwnPropertyDescriptor(P, K).get.bind(null)();",
      "Object.getOwnPropertyDescriptor(P, K).set.bind({})({});",
      "Reflect.apply(Object.getOwnPropertyDescriptor(P, K).get, {}, []);",
      "new Proxy(Object.getOwnPropertyDescriptor(P, K).get, {})();",
      "new Proxy(Object.getOwnPropertyDescriptor(P, K).set, {})({});",
      "const d = Object.getOwnPropertyDescriptor(P, K); const copy = {};" +
        "Object.defineProperty(copy, 'x', d); copy.x;",
      "const descriptor = Object.getOwnPropertyDescriptor(P, K);" +
        "delete P.__proto__; Object.defineProperty(P, K, descriptor);" +
        "({}).__proto__;",
      "Object.defineProperty(P, K, { get: function () { return 1; } });" +
        "(1).__proto__ = 2;",
      "Object.freeze(P); ({}).__proto__;",
      "Object.freeze(new Proxy(P, {})); ({}).__proto__;",
      "Object.freeze(new Proxy(P, {" +
        "getOwnPropertyDescriptor(t, k) {" +
        "return Reflect.getOwnPropertyDescriptor(t, k); }}));" +
        "({}).__proto__;",
    ]) {
      for (const specialization of ["disabled", "enabled"] as const) {
        process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
        try {
          const sourceId = "annexb-opaque-identity.js";
          const observed = await runNativeCli(
            {
              args: [
                ...(specialization === "disabled"
                  ? ["--no-specialization"]
                  : []),
                sourceId,
              ],
              source: prefix + source,
              sourceId,
              version: "0.1.0",
            },
            host,
          );
          assert.equal(observed.exitStatus, 1);
          assert.ok(observed.stderr.includes(diagnostic), observed.stderr);
          assert.doesNotMatch(observed.stderr, /OSEO2001/u);
        } finally {
          delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        }
      }
    }
  },
);

test(
  "integrity metadata and opaque halves stay local to their intrinsic realm",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const source = `
const other = $262.createRealm().global;
Object.freeze(other.Object.prototype);
console.log("foreign", Reflect.deleteProperty(other.Object.prototype,
  "__proto__"), Object.isFrozen(other.Object.prototype));
console.log("local", delete Object.prototype.__proto__,
  Object.hasOwn(Object.prototype, "__proto__"), typeof ({}).__proto__);
`;
    for (const specialization of ["disabled", "enabled"] as const) {
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        const sourceId = "annexb-integrity-realm.js";
        const args = [
          "--test262-host",
          ...(specialization === "disabled" ? ["--no-specialization"] : []),
          sourceId,
        ];
        const observed = await runNativeCli(
          { args, source, sourceId, version: "0.1.0" },
          host,
        );
        assert.equal(observed.exitStatus, 0, observed.stderr);
        assert.equal(
          observed.stdout,
          "foreign false true\nlocal true false undefined\n",
        );
        assert.equal(observed.stderr, "");
        const untouched = await runNativeCli(
          {
            args,
            source:
              source + "Object.create(other.Object.prototype).__proto__;\n",
            sourceId,
            version: "0.1.0",
          },
          host,
        );
        assert.equal(untouched.exitStatus, 1);
        assert.ok(untouched.stderr.includes(diagnostic), untouched.stderr);
        assert.doesNotMatch(untouched.stderr, /OSEO2001/u);
      } finally {
        delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      }
    }
  },
);

test(
  "excluded accessor identities retain core metadata and native grammar",
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
  "excluded accessor identities belong to their realm across collection",
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
