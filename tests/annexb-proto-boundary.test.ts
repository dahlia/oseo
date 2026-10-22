/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { runNativeCli } from "./native-cli.ts";

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
