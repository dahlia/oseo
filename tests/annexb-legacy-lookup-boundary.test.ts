/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";

import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { runNativeCli } from "./native-cli.ts";
import { agentReferencePrelude } from "./native/agent-reference.ts";
import { realmReferencePrelude } from "./native/realm-reference.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const methods = ["__lookupGetter__", "__lookupSetter__"] as const;

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

/**
 * Requires the native output of one Script under both policies to match
 * Node.js and Deno, which both implement the four legacy methods.
 */
async function differential(
  source: string,
  sourceId: string,
  test262Host = false,
): Promise<void> {
  const directory = await host.makeTemporaryDirectory("oseo-lookup-ref-");
  let reference = "";
  try {
    const path = join(directory, "case.js");
    await host.writeTextFile(
      path,
      (test262Host ? agentReferencePrelude + realmReferencePrelude : "") +
        source,
    );
    const outputs: string[] = [];
    for (const [command, args] of [
      [process.execPath, [path]],
      ["deno", ["run", "--quiet", path]],
    ] as const) {
      const observed = await host.run({ command, args, cwd: directory });
      assert.equal(observed.exitStatus, 0, observed.stderr);
      assert.equal(observed.stderr, "");
      outputs.push(observed.stdout);
    }
    assert.equal(outputs[1], outputs[0], source);
    reference = outputs[0]!;
  } finally {
    await host.remove(directory);
  }
  for (const specialization of ["disabled", "enabled"] as const) {
    const native = await observe(source, sourceId, specialization);
    assert.equal(native.stderr, "", `${specialization}: ${source}`);
    assert.equal(native.exitStatus, 0, source);
    assert.equal(native.stdout, reference, `${specialization}: ${source}`);
  }
}

test(
  "lookups reaching the intrinsic find the legacy methods",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const method of methods) {
      for (const expression of [
        `({}).${method}("x")`,
        `({})["${method}"] === Object.prototype.${method}`,
        `Reflect.get({}, "${method}") === Object.prototype.${method}`,
        `new Proxy({}, {}).${method}("x")`,
        `Object.create(Object.create({})).${method}("x")`,
        `typeof Object.prototype.${method}`,
        // The upstream shape: a private accessor is no own property.
        `(() => { class C { get #m() { return 1; } set #m(v) {} ` +
          `check() { return this.${method}("#m"); } } ` +
          "return new C().check(); })()",
        "(() => { /** @param {object} value */ " +
          `function read(value) { return value.${method}("k"); } ` +
          `read({ ${method}() { return 1; } }); return read({}); })()`,
        `(() => { class Reader { read() { return super.${method}("k"); } } ` +
          "return new Reader().read(); })()",
        `typeof $262.createRealm().global.Object.prototype.${method}`,
      ]) {
        await differential(
          `console.log("before");\nconsole.log(${expression});\n` +
            'console.log("after");\n',
          "annexb-legacy-lookup.js",
          expression.includes("$262"),
        );
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
      ['({}).__defineGetter__("x", 1);', "Type"],
      [
        'Object.preventExtensions({}).__defineSetter__("x", function (v) {});',
        "Type",
      ],
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
const descriptor =
  Object.getOwnPropertyDescriptor(Object.prototype, "__lookupGetter__");
console.log(typeof descriptor.value, descriptor.writable,
  descriptor.enumerable, descriptor.configurable);
console.log(Reflect.has(Object.prototype, "__lookupSetter__"));
console.log(
  Object.getOwnPropertyNames(Object.prototype).includes("__lookupGetter__"),
);
`;
    await differential(source, "lookup-shadows.js");
  },
);
