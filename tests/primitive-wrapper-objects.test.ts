/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import process from "node:process";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { nativeToolchain } from "./native-toolchain.ts";
import { runNativeCli } from "./native-cli.ts";
import {
  createReviewedManifest,
  parseReviewedSubset,
} from "../tools/test262.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

async function readTest262File(name: string): Promise<string> {
  return await readFile(new URL(`./test262/${name}`, import.meta.url), "utf8");
}

/** Run as a global Script even when the reference host loads ESM. */
async function compare(
  source: string,
  expected: string,
  referenceExpected = expected,
  test262Host = false,
): Promise<void> {
  assert.ok(nativeTarget != null);
  const directory = await host.makeTemporaryDirectory("oseo-wrapper-fixed-");
  const path = `${directory}/case.js`;
  const realmShim = test262Host
    ? `
import { runInNewContext } from "node:vm";
globalThis.$262 = {
  createRealm() { return { global: runInNewContext("globalThis") }; },
};
`
    : "";
  await host.writeTextFile(
    path,
    `${realmShim}(0, eval)(${JSON.stringify(source)});\n`,
  );
  const observation = { exitStatus: 0, stderr: "", stdout: expected };
  try {
    for (const command of [process.execPath, "deno"]) {
      const reference = await host.run({
        args: command === "deno" ? ["run", "--quiet", path] : [path],
        command,
        cwd: directory,
      });
      assertMatchingObservations([
        { ...observation, stdout: referenceExpected },
        reference,
      ]);
    }
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source, sourceId: "primitive-wrapper-fixed.js" },
        { observeSpecialization: true, specialization, test262Host },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir != null);
      const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        await withNativeFixture(
          {
            backend: cBackend,
            host,
            input: compiled.mir,
            operation: "execute",
            runtime: cRuntimeProvider,
            target: nativeTarget,
            toolchain: nativeToolchain,
          },
          (native) => {
            assertMatchingObservations([observation, native]);
            assert.ok((native.counters?.collections ?? 0) > 0);
          },
        );
      } finally {
        if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
      }
    }
  } finally {
    await host.remove(directory);
  }
}

const bindingSource = `
function box() {
  this.marker = 17;
  const captured = () => this;
  return [this, this, captured];
}
function strict() { "use strict"; return this; }
function defaults(value = this) { return value === this; }
for (const value of [false, true, -0, NaN, Infinity, "a\\ud800b",
  Symbol("live"), -123456789012345678901n]) {
  const first = box.call(value);
  const second = box.apply(value, []);
  const saved = first[0];
  const kind = typeof value;
  const intrinsic = kind === "boolean" ? Boolean :
    kind === "number" ? Number : kind === "string" ? String :
    kind === "symbol" ? Symbol : BigInt;
  console.log("box", typeof saved, saved === first[1],
    saved === first[2].call({}), saved !== second[0],
    Object.getPrototypeOf(saved) === intrinsic.prototype,
    Object.is(intrinsic.prototype.valueOf.call(saved), value),
    saved.marker, Object.is(strict.call(value), value),
    defaults.call(value));
  const bound = box.bind(value);
  const proxied = new Proxy(box, {});
  console.log("forward", typeof bound()[0],
    Object.is(proxied.call(value)[0].valueOf(), value),
    Object.is(Reflect.apply(box, value, [])[0].valueOf(), value));
}
const object = {};
console.log("objects", box.call(object)[0] === object,
  box.call(null)[0] === globalThis,
  box.call(undefined)[0] === globalThis,
  strict.call(null) === null, strict.call(undefined) === undefined);
const stringBox = box.call("\\ud83d\\ude00")[0];
const index = Object.getOwnPropertyDescriptor(stringBox, "0");
const length = Object.getOwnPropertyDescriptor(stringBox, "length");
console.log("string", stringBox.length, stringBox[0].charCodeAt(0),
  index.writable, index.enumerable, index.configurable,
  length.writable, length.enumerable, length.configurable);
for (const primitive of [false, 7, "x", Symbol("s"), 9n]) {
  const boxed = box.call(primitive)[0];
  const kind = typeof primitive;
  const intrinsic = kind === "boolean" ? Boolean :
    kind === "number" ? Number : kind === "string" ? String :
    kind === "symbol" ? Symbol : BigInt;
  for (const invalid of [{}, Object.create(intrinsic.prototype),
    new Proxy(boxed, {})]) {
    try { intrinsic.prototype.valueOf.call(invalid); }
    catch (error) { console.log("brand", error instanceof TypeError); }
  }
}
`;

test(
  "sloppy calls bind one fresh branded wrapper",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await compare(
      bindingSource,
      [
        ...Array.from({ length: 8 }, () => [
          "box object true true true true true 17 true true",
          "forward object true true",
        ]).flat(),
        "objects true true true true true",
        "string 2 55357 false true false false false false",
        ...Array.from({ length: 15 }, () => "brand true"),
        "",
      ].join("\n"),
    );
  },
);

test(
  "suspensions and lexical arrows retain the bound object",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await compare(
      `
function* generator(value = this) {
  const arrow = () => this;
  yield this === value;
  yield arrow;
  yield this;
}
const iterator = generator.call(123n);
console.log("default", iterator.next().value);
const arrow = iterator.next().value;
const box = iterator.next().value;
console.log("generator", arrow() === box, box.valueOf() === 123n);
async function asynchronous(value = this) {
  const arrow = () => this;
  await Promise.resolve();
  console.log("async", this === value, arrow() === this,
    this.valueOf() === "retained");
}
asynchronous.call("retained");
async function* asynchronousGenerator(value = this) {
  yield this === value;
  await Promise.resolve();
  yield this;
  yield this;
}
async function consume() {
  const iterator = asynchronousGenerator.call(false);
  const first = await iterator.next();
  const second = await iterator.next();
  const third = await iterator.next();
  console.log("async generator", first.value,
    second.value === third.value, second.value.valueOf());
}
consume();
`,
      "default true\ngenerator true true\nasync true true true\n" +
        "async generator true true false\n",
    );
  },
);

test(
  "ToObject consumers keep boxes and GetV keeps primitives",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await compare(
      `
let lengthReceiver;
let iteratorReceiver;
const trace = [];
Object.defineProperty(Number.prototype, Symbol.iterator, {
  configurable: true,
  get() { "use strict"; iteratorReceiver = this;
    trace.push("iterator:" + typeof this); return undefined; },
});
Object.defineProperty(Number.prototype, "length", {
  configurable: true,
  get() { "use strict"; lengthReceiver = this;
    this.saved = 21; trace.push("length:" + typeof this); return 1; },
});
Object.defineProperty(Number.prototype, "0", {
  configurable: true,
  get() { "use strict";
    trace.push("index:" + (this === lengthReceiver)); return this.saved; },
});
console.log("from", Array.from(3)[0], typeof iteratorReceiver,
  typeof lengthReceiver, trace.join(","));
delete Number.prototype[Symbol.iterator];
delete Number.prototype.length;
delete Number.prototype["0"];
for (const value of [false, 3, "x", Symbol("s"), 8n]) {
  const intrinsic = typeof value === "boolean" ? Boolean :
    typeof value === "number" ? Number : typeof value === "string" ?
    String : typeof value === "symbol" ? Symbol : BigInt;
  const oldTag = Object.getOwnPropertyDescriptor(
    intrinsic.prototype, Symbol.toStringTag);
  const seen = [];
  Object.defineProperty(intrinsic.prototype, Symbol.toStringTag, {
    configurable: true,
    get() { "use strict"; seen.push(this); return "custom"; },
  });
  console.log("tag", Object.prototype.toString.call(value),
    typeof seen[0], Object.is(seen[0].valueOf(), value));
  const direct = value[Symbol.toStringTag];
  console.log("reference", direct, Object.is(seen[1], value));
  if (oldTag) Object.defineProperty(intrinsic.prototype,
    Symbol.toStringTag, oldTag);
  else delete intrinsic.prototype[Symbol.toStringTag];
}
Object.defineProperty(Boolean.prototype, "toString", {
  configurable: true,
  get() { "use strict";
    console.log("locale getter", typeof this);
    return function () { "use strict"; return typeof this; };
  },
});
console.log("locale", Object.prototype.toLocaleString.call(false));
`,
      "from 21 number object iterator:number,length:object,index:true\n" +
        Array.from(
          { length: 5 },
          () => "tag [object custom] object true\nreference custom true\n",
        ).join("") +
        "locale getter boolean\nlocale boolean\n",
      // ECMA-262 2025 20.1.3.6 steps 3 and 15 require Get on the
      // ToObject result. V8 instead passes the primitive to this getter.
      "from 21 number object iterator:number,length:object,index:true\n" +
        ["boolean", "number", "string", "symbol", "bigint"]
          .map(
            (kind) =>
              `tag [object custom] ${kind} true\nreference custom true\n`,
          )
          .join("") +
        "locale getter boolean\nlocale boolean\n",
    );
  },
);

test(
  "binding precedes parameter effects and preserves abrupt calls",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await compare(
      `
const trace = [];
function call(value = (trace.push("default"), this)) {
  trace.push("body");
  console.log("same", value === this);
  throw this;
}
try { call.call(Symbol("reason")); } catch (error) {
  console.log("thrown", typeof error, error.valueOf().description);
}
console.log("trace", trace.join(","));
for (const value of [null, undefined]) {
  try { Array.from(value); } catch (error) {
    console.log("nullish", error instanceof TypeError);
  }
}
let inspected = false;
const source = { get [Symbol.iterator]() { inspected = true; } };
try { Array.from(source, 1); } catch (error) {
  console.log("order", error instanceof TypeError, inspected);
}
`,
      "same true\nthrown object reason\ntrace default,body\n" +
        "nullish true\nnullish true\norder true false\n",
    );
  },
);

test("call-entry binding is rooted before parameters and suspension", () => {
  const compiled = compileSource(babelFrontend, {
    source: `
function ordinary(value = this) { return this === value; }
function* suspended(value = this) { yield this === value; }
function strict() { "use strict"; return this; }
`,
    sourceId: "wrapper-entry.js",
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  const emitted = cBackend.emit(compiled.mir).source;
  for (const name of ["ordinary", "suspended", "strict"]) {
    const fn = compiled.mir.functions.find((entry) => entry.name === name);
    assert.ok(fn != null);
    const start = emitted.indexOf(
      `static OseoResult oseo_function_${fn.id}(\n`,
    );
    assert.ok(start >= 0);
    const definition = emitted.slice(start, emitted.indexOf("\n}\n", start));
    const binding = definition.indexOf("receiver = result.value;");
    if (name === "strict") {
      assert.equal(binding, -1);
      assert.doesNotMatch(definition, /oseo_this_value/u);
    } else {
      assert.ok(binding >= 0);
      assert.match(
        definition.slice(0, binding),
        /roots\[\d+\] = result.value;/u,
      );
      assert.ok(binding < definition.indexOf("oseo_environment_clone"));
      if (name === "suspended") {
        assert.ok(binding < definition.indexOf("oseo_generator_create"));
      }
    }
  }
});

test(
  "the forty owned wrapper standards paths execute every variant",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    assert.ok(nativeTarget != null);
    const paths = (
      await readFile(
        new URL(
          "./fixtures/primitive-wrapper-objects/owned-paths.txt",
          import.meta.url,
        ),
        "utf8",
      )
    )
      .trim()
      .split("\n");
    assert.equal(paths.length, 40);
    assert.equal(new Set(paths).size, 40);
    const subset = parseReviewedSubset(await readTest262File("subset.yaml"));
    const selected = subset.tests.filter((entry) => paths.includes(entry.path));
    assert.deepEqual(
      selected.map((entry) => entry.path),
      paths,
    );
    const includes = new Map<string, string>();
    for (const name of [
      "resizableArrayBufferUtils.js",
      "testTypedArray.js",
      "compareArray.js",
    ]) {
      includes.set(name, await readTest262File(`harness/${name}`));
    }
    const { manifest } = await createReviewedManifest(
      { ...subset, tests: selected },
      new URL("../node_modules/test262/", import.meta.url).pathname,
      {
        base: await readTest262File("harness/base.js"),
        done: await readTest262File("harness/doneprintHandle.js"),
        includes,
      },
      {
        target: nativeTarget.name,
        execute: async (request) =>
          await runNativeCli(
            {
              args: [
                ...(request.specialization === "disabled"
                  ? ["--no-specialization"]
                  : []),
                request.sourceId,
              ],
              source: request.source,
              sourceId: request.sourceId,
              version: "0.1.0",
            },
            host,
          ),
      },
      { acceptPromotions: true, poolLimit: 1, retryLimit: 1 },
    );
    assert.equal(manifest.results.length, 40);
    assert.equal(manifest.summary.passes, 40);
    assert.equal(manifest.summary.semanticFailures, 0);
    for (const result of manifest.results) {
      assert.equal(result.classification, "pass", result.case.path);
      assert.equal(
        result.execution?.variants.length,
        result.case.strictness.length * 2,
        result.case.path,
      );
    }
  },
);

test(
  "foreign call helpers box in the ordinary callee realm",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const source = `
const foreign = $262.createRealm().global;
const intrinsics = [Boolean, Number, String, Symbol, BigInt];
const values = [false, -0, "live", Symbol("live"), 1234567890123456789n];
function box() { return this; }
function strict() { "use strict"; return this; }
for (let index = 0; index < values.length; index++) {
  const value = values[index];
  const a = foreign.Function.prototype.call.call(box, value);
  const b = foreign.Reflect.apply(box, value, []);
  const c = foreign.Array.prototype.map.call([1], box, value)[0];
  console.log("realm", Object.getPrototypeOf(a) === intrinsics[index].prototype,
    Object.getPrototypeOf(b) === intrinsics[index].prototype,
    Object.getPrototypeOf(c) === intrinsics[index].prototype,
    a !== b, b !== c,
    Object.is(foreign.Reflect.apply(strict, value, []), value));
}
globalThis.Number = function () { throw "global constructor called"; };
console.log("intrinsic", Object.getPrototypeOf(box.call(1)) ===
  intrinsics[1].prototype);
`;
    const expected =
      "realm true true true true true true\n".repeat(5) + "intrinsic true\n";
    await compare(source, expected, expected, true);
  },
);

test(
  "boxing allocation failures balance roots and retry all five kinds",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    assert.ok(nativeTarget != null);
    const compiled = compileSource(babelFrontend, {
      source: "0;",
      sourceId: "wrapper-allocation.js",
    });
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const source = await readFile(
      new URL(
        "./fixtures/primitive-wrapper-objects/allocation.c",
        import.meta.url,
      ),
      "utf8",
    );
    await withNativeFixture(
      {
        backend: { emit: () => ({ sourceName: "allocation.c", source }) },
        host,
        input: compiled.mir,
        operation: "execute",
        runtime: cRuntimeProvider,
        target: nativeTarget,
        toolchain: nativeToolchain,
      },
      (native) => {
        assert.equal(
          native.stdout,
          "wrapper allocation failures and retries passed\n",
        );
        assert.equal(native.stderr, "");
      },
    );
  },
);
