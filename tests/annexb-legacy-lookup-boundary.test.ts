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
const methods = ["__lookupGetter__", "__lookupSetter__"] as const;

/** The exact owned rejection for one optional legacy lookup method. */
function diagnostic(method: (typeof methods)[number]): string {
  return (
    `error[OSEO1001]: The Object.prototype.${method} method is excluded ` +
    "by the M5 optional legacy accessor policy."
  );
}

/** Runs one script natively with forced collection at every safepoint. */
async function observe(
  source: string,
  sourceId: string,
  specialization: "disabled" | "enabled",
) {
  process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
  try {
    return await runNativeCli(
      {
        args: [
          "--test262-host",
          ...(specialization === "disabled" ? ["--no-specialization"] : []),
          sourceId,
        ],
        source,
        sourceId,
        version: "0.1.0",
      },
      host,
    );
  } finally {
    delete process.env.OSEO_GC_EVERY_SAFEPOINT;
  }
}

test(
  "only a missing intrinsic legacy lookup reports the owned diagnostic",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const method of methods) {
      for (const expression of [
        `({}).${method}("x")`,
        `({})["${method}"]`,
        `Reflect.get({}, "${method}")`,
        `new Proxy({}, {}).${method}("x")`,
        `Object.create(Object.create({})).${method}("x")`,
        `Object.prototype.${method}`,
        // The upstream shape: a class instance reads the method on `this`.
        `(() => { class C { get #m() { return 1; } set #m(v) {} ` +
          `check() { return this.${method}("#m"); } } ` +
          "return new C().check(); })()",
        // A shadowed call precedes the missing one. Member calls are not
        // shape-specialized, so this pins only the ordinary later miss.
        "(() => { /** @param {object} value */ " +
          `function read(value) { return value.${method}("k"); } ` +
          `read({ ${method}() { return 1; } }); return read({}); })()`,
        `(() => { class Reader { read() { return super.${method}("k"); } } ` +
          "return new Reader().read(); })()",
        `$262.createRealm().global.Object.prototype.${method}`,
      ]) {
        for (const specialization of ["disabled", "enabled"] as const) {
          const sourceId = "annexb-legacy-lookup.js";
          const native = await observe(
            `console.log("before");\n${expression};\n` +
              'console.log("after");\n',
            sourceId,
            specialization,
          );
          assert.equal(native.exitStatus, 1, expression);
          assert.equal(native.stdout, "before\n", expression);
          assert.ok(native.stderr.includes(`${sourceId}:2:`), native.stderr);
          assert.ok(native.stderr.includes(diagnostic(method)), native.stderr);
          assert.doesNotMatch(native.stderr, /OSEO2001/u);
          assert.doesNotMatch(native.stderr, /__proto__/u);
        }
      }
    }
  },
);

test(
  "unrelated called values and private accessors keep ordinary errors",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const [source, thrown] of [
      ['throw new RangeError("prior"); ({}).__lookupGetter__("x");', "Range"],
      [
        "({ get __lookupGetter__() { throw new RangeError(); } })" +
          '.__lookupGetter__("x");',
        "Range",
      ],
      [
        "new Proxy({}, { get() { throw new RangeError(); } })" +
          '.__lookupSetter__("x");',
        "Range",
      ],
      ['const value = null; value.__lookupGetter__("x");', "Type"],
      ['Object.create(null).__lookupSetter__("x");', "Type"],
      ['({ __lookupGetter__: 1 }).__lookupGetter__("x");', "Type"],
      [
        'Object.create({ __lookupSetter__: null }).__lookupSetter__("x");',
        "Type",
      ],
      ['new Proxy({}, { get() { return 1; } }).__lookupGetter__("x");', "Type"],
      ['({}).__lookupGetterX__("x");', "Type"],
      ['({}).__defineGetter__("x", function () { return 1; });', "Type"],
      ['({}).__defineSetter__("x", function (v) {});', "Type"],
      ['({})[Symbol("__lookupGetter__")]("x");', "Type"],
      // A brand check on a foreign object.
      [
        "class C { get #m() { return 1; } static read(o) { return o.#m; } } " +
          "C.read({});",
        "Type",
      ],
      // A getter-less private accessor read.
      [
        "class C { set #m(v) {} read() { return this.#m; } } new C().read();",
        "Type",
      ],
      // A setter-less private accessor write.
      [
        "class C { get #m() { return 1; } write() { this.#m = 2; } } " +
          "new C().write();",
        "Type",
      ],
    ] as const) {
      for (const specialization of ["disabled", "enabled"] as const) {
        const native = await observe(
          source,
          "unrelated-lookup-failure.js",
          specialization,
        );
        assert.equal(native.exitStatus, 1, source);
        assert.match(native.stderr, /error\[OSEO2001\]:/u, source);
        assert.doesNotMatch(native.stderr, /OSEO1001/u, source);
        assert.match(
          native.stderr,
          new RegExp(`OSEO_THROWN ${thrown}Error`, "u"),
          source,
        );
      }
    }
  },
);

test(
  "same-name user methods and core reflection keep ordinary results",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    // Reflection observes the omitted optional methods as absent. Reference
    // hosts implement 20.1.3.9, so this is a profile result, not a
    // differential claim.
    const source = `
const own = { __lookupGetter__(key) { return "own " + key; } };
console.log(own.__lookupGetter__("a"));
const inherited = Object.create({
  __lookupSetter__(key) {
    return "inherited " + key + " " + (this === child);
  },
});
const child = Object.create(inherited);
console.log(child.__lookupSetter__("b"));
class Base { __lookupGetter__(key) { return "method " + key; } }
console.log(new Base().__lookupGetter__("#m"));
const accessor = {
  get __lookupSetter__() { return (key) => "getter " + key; },
};
console.log(accessor.__lookupSetter__("c"));
const proxy = new Proxy({}, {
  get(target, key) { return () => String(key); },
});
console.log(proxy.__lookupGetter__("d"));
console.log(Object.create(null).__lookupGetter__);
console.log(
  "__lookupGetter__" in {},
  ({}).hasOwnProperty("__lookupSetter__"),
);
console.log(
  Object.getOwnPropertyDescriptor(Object.prototype, "__lookupGetter__"),
);
console.log(Reflect.has(Object.prototype, "__lookupSetter__"));
console.log(
  Object.getOwnPropertyNames(Object.prototype).includes("__lookupGetter__"),
);
`;
    for (const specialization of ["disabled", "enabled"] as const) {
      const native = await observe(source, "lookup-shadows.js", specialization);
      assert.equal(native.stderr, "");
      assert.equal(native.exitStatus, 0);
      assert.equal(
        native.stdout,
        [
          "own a",
          "inherited b true",
          "method #m",
          "getter c",
          "__lookupGetter__",
          "undefined",
          "false false",
          "undefined",
          "false",
          "false",
          "",
        ].join("\n"),
      );
    }
  },
);
