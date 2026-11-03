/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { runNativeCli } from "./native-cli.ts";
import { nativeToolchain } from "./native-toolchain.ts";
import { agentReferencePrelude } from "./native/agent-reference.ts";
import type { Fixture } from "./native/fixture.ts";
import { legacyCallerFixtures } from "./native/fixtures/legacy-caller.ts";
import { realmReferencePrelude } from "./native/realm-reference.ts";

/*
 * ADR 0034's legacy `caller` and `arguments` properties. The differential
 * fixtures compare Oseo with Node.js alone: Deno 2.9.7 runs a V8 that no
 * longer has the extension (docs/evidence/legacy-caller/). Each fixture
 * runs under both specialization policies with collection forced at every
 * safepoint, and also links for linux-aarch64-musl. The fixed programs pin
 * what the references cannot show: top-level answers, which Node.js hides
 * behind its CommonJS wrapper, and the two places ADR 0034 departs from V8.
 */
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const skip = nativeTarget == null ? "requires a supported native host" : false;
const hostCcLane = process.env.OSEO_NATIVE_TOOLCHAIN === "host-cc";

const referencePrelude = `
const oseoReferenceConsole = console;
const oseoReferenceString = String;
Object.defineProperty(globalThis, "console", {
  value: {
    log(...values) {
      oseoReferenceConsole.log(values.map(oseoReferenceString).join(" "));
    },
  },
});
`;

async function withForcedCollection<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
  process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
  try {
    return await run();
  } finally {
    if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
  }
}

async function nodeReference(fixture: Fixture) {
  const directory = await mkdtemp(join(tmpdir(), "oseo-legacy-caller-"));
  try {
    const path = join(directory, `${fixture.name}.mjs`);
    await writeFile(
      path,
      referencePrelude +
        (fixture.test262Host === true
          ? agentReferencePrelude + realmReferencePrelude
          : "") +
        `new Function(${JSON.stringify(fixture.source)})();\n`,
    );
    const result = await host.run({
      args: [path],
      command: process.execPath,
      cwd: directory,
    });
    assert.equal(result.exitStatus, 0, result.stderr);
    return result;
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function compile(
  source: string,
  sourceId: string,
  specialization: "disabled" | "enabled",
  test262Host = false,
) {
  const compiled = compileSource(
    babelFrontend,
    { source, sourceId },
    { observeSpecialization: true, specialization, test262Host },
  );
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  return compiled;
}

test("creates only non-strict code through the non-strict entry", () => {
  // `sloppy` is the only non-strict function; the strict expression and
  // the function nested in it go through oseo_function_create.
  const compiled = compile(
    "function sloppy() {}\n" +
      "var strict = function () {\n" +
      "  'use strict';\n" +
      "  return function inner() {};\n" +
      "};\n",
    "legacy-caller-structure.js",
    "disabled",
  );
  const source = cBackend.emit(compiled.mir!).source;
  const creations = source.match(/oseo_function_create(_non_strict)?\(/g);
  assert.deepEqual([...(creations ?? [])].toSorted(), [
    "oseo_function_create(",
    "oseo_function_create(",
    "oseo_function_create_non_strict(",
  ]);
});

for (const fixture of legacyCallerFixtures) {
  test(
    `matches Node.js: ${fixture.name}`,
    { skip, timeout: 900_000 },
    async () => {
      const reference = await nodeReference(fixture);
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compile(
          fixture.source,
          `${fixture.name}.js`,
          specialization,
          fixture.test262Host === true,
        );
        await withForcedCollection(() =>
          withNativeFixture(
            {
              agents: compiled.agents ?? [],
              backend: cBackend,
              host,
              input: compiled.mir!,
              operation: "execute",
              runtime: cRuntimeProvider,
              target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
              toolchain: nativeToolchain,
            },
            (native) => {
              assertMatchingObservations([reference, native]);
              assert.ok(native.counters != null);
              assert.ok(native.counters.collections > 0, specialization);
              if (
                specialization === "enabled" &&
                fixture.name === "legacy-caller-specialization"
              ) {
                // The cached `caller` slot of the plain objects misses on
                // the function, whose `caller` lives outside its slots.
                assert.ok(native.counters.guardHits > 0);
                assert.ok(native.counters.guardMisses > 0);
              }
            },
          ),
        );
      }
      if (hostCcLane) return;
      const compiled = compile(
        fixture.source,
        `${fixture.name}.js`,
        "enabled",
        fixture.test262Host === true,
      );
      await withNativeFixture(
        {
          agents: compiled.agents ?? [],
          backend: cBackend,
          host,
          input: compiled.mir!,
          operation: "compile",
          runtime: cRuntimeProvider,
          target: describeTarget("linux-aarch64-musl"),
          toolchain: nativeToolchain,
        },
        (cross) => {
          assert.ok(
            cross.compilerInvocation
              .filter((line) => line.startsWith("zig cc "))
              .every((line) => line.includes("aarch64-linux-musl")),
          );
        },
      );
    },
  );
}

interface FixedProgram {
  readonly expected: string;
  readonly name: string;
  readonly source: string;
}

const fixedPrograms: readonly FixedProgram[] = [
  {
    // v8-probe.txt shows the same answers for a Script run through
    // `node:vm`, which has no wrapper function.
    expected: "null null null true\n",
    name: "top-level Script code",
    source: `
function f() { return f.caller; }
function a() { return a.arguments.length; }
console.log(f(), f.call(null), Reflect.apply(f, null, []), a(1, 2) === 2);
`,
  },
  {
    // ADR 0034 reports null for every call a built-in function makes,
    // except the four forwarding ones. V8 reports the function that called
    // the built-in for those it implements in C++.
    expected:
      "JSON.parse null\nJSON.stringify null\nReflect.set null\n" +
      "Object.defineProperty null\nError null\nDate null\nBigInt null\n",
    name: "built-ins that V8 implements in C++",
    source: `
var R;
function report(k) { return k.caller === null ? "null" : k.caller.name; }
function cb() { R = report(cb); return 1; }
function cbs() { cb(); return "a"; }
var cases = {
  "JSON.parse": function g() { JSON.parse("1", cb); },
  "JSON.stringify": function g() { JSON.stringify(1, cb); },
  "Reflect.set": function g() {
    var o = {};
    Object.defineProperty(o, "x", { set: cb });
    Reflect.set(o, "x", 1);
  },
  "Object.defineProperty": function g() {
    var key = { toString: function k() { R = report(k); return "a"; } };
    Object.defineProperty({}, key, { value: 1 });
  },
  Error: function g() {
    new Error({ toString: function k() { R = report(k); return ""; } });
  },
  Date: function g() { new Date({ valueOf: cb }); },
  BigInt: function g() { BigInt({ valueOf: cb }); },
};
for (var name in cases) {
  R = "not called";
  cases[name]();
  console.log(name, R);
}
`,
  },
  {
    // ADR 0034 makes both properties configurable, so a definition or
    // freeze fixes the value present at that moment and delete removes
    // the property. V8 makes them non-configurable instead, which breaks
    // the invariant the two consistent-value cases check.
    expected:
      "caller descriptor null false,false,true\n" +
      "caller delete true false length,name,arguments,prototype\n" +
      "caller inherited read throws TypeError\n" +
      "caller inherited assignment throws TypeError\n" +
      "caller strict delete true length,name,arguments,prototype\n" +
      "caller define value true number false,false,true " +
      "length,name,arguments,caller,prototype\n" +
      "caller redefine writable true number true,false,true\n" +
      "caller assigned v\n" +
      "caller define accessor true get nm ,true,true " +
      "length,name,arguments,caller,prototype,extra\n" +
      "caller for-in caller,extra\n" +
      "arguments descriptor null false,false,true\n" +
      "arguments delete true false length,name,caller,prototype\n" +
      "arguments inherited read throws TypeError\n" +
      "arguments inherited assignment throws TypeError\n" +
      "arguments strict delete true length,name,caller,prototype\n" +
      "arguments define value true number false,false,true " +
      "length,name,arguments,caller,prototype\n" +
      "arguments redefine writable true number true,false,true\n" +
      "arguments assigned v\n" +
      "arguments define accessor true get nm ,true,true " +
      "length,name,arguments,caller,prototype,extra\n" +
      "arguments for-in arguments,extra\n" +
      "caller first length,name,arguments,caller,prototype\n" +
      "then arguments length,name,arguments,caller,prototype number number\n" +
      "without name length,arguments,caller,prototype\n" +
      "without caller length,arguments,prototype\n" +
      "after a deletion length,arguments,caller,prototype null " +
      "false,false,true\n" +
      "define fixes caller outer outer outer false,false,true\n" +
      "define fixes arguments true 1 1 object false,false,true\n" +
      "frozen false false null false,false,true\n" +
      "after freeze null,null true null false,false,false null " +
      "false,false,false\n" +
      "sealed true null false,false,false null\n" +
      "non-extensible false g true true length,name,caller,prototype\n" +
      "consistent caller false false true\n" +
      "consistent arguments false false true\n" +
      "define while active a16\n" +
      "Proxy get a17\n" +
      "Proxy get caller number\n" +
      "Proxy descriptor object false,false,true\n",
    name: "configurable own properties",
    source: `
function nm(v) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "function") return v.name || "<anonymous>";
  return typeof v;
}
function attempt(fn) {
  try { return fn(); } catch (e) { return "throws " + e.constructor.name; }
}
function d(o, k) {
  var x = Object.getOwnPropertyDescriptor(o, k);
  if (x === undefined) return "absent";
  return ("value" in x ? nm(x.value) : "get " + nm(x.get)) + " " +
    [x.writable, x.enumerable, x.configurable].join();
}
function keys(f) { return Reflect.ownKeys(f).map(String).join(); }
for (var key of ["caller", "arguments"]) {
  var f = function f() {};
  console.log(key, "descriptor", d(f, key));
  console.log(key, "delete", delete f[key], Object.hasOwn(f, key), keys(f));
  console.log(key, "inherited read",
    attempt(function () { return nm(f[key]); }));
  console.log(key, "inherited assignment",
    attempt(function () { f[key] = 1; return "ok"; }));
  var s = function s() {};
  console.log(key, "strict delete",
    attempt(function () { "use strict"; return delete s[key]; }), keys(s));
  var v = function v() {};
  console.log(key, "define value", Reflect.defineProperty(v, key, { value: 1 }),
    d(v, key), keys(v));
  console.log(key, "redefine writable",
    Reflect.defineProperty(v, key, { writable: true }), d(v, key));
  v[key] = v;
  console.log(key, "assigned", nm(v[key]));
  var a = function a() {};
  a.extra = 1;
  console.log(key, "define accessor",
    Reflect.defineProperty(a, key, { get: nm, enumerable: true }),
    d(a, key), keys(a));
  var names = [];
  for (var n in a) names.push(n);
  console.log(key, "for-in", names.join());
}
function both() {}
Object.defineProperty(both, "caller", { value: 2 });
console.log("caller first", keys(both));
Object.defineProperty(both, "arguments", { value: 3 });
console.log("then arguments", keys(both), nm(both.caller), nm(both.arguments));
delete both.name;
console.log("without name", keys(both));
delete both.caller;
console.log("without caller", keys(both));
function later() {}
delete later.name;
Object.defineProperty(later, "caller", {});
console.log("after a deletion", keys(later), d(later, "caller"));
function fixed() { return [nm(fixed.caller), nm(fixed.arguments)].join(); }
function fixer() {
  Object.freeze(fixed);
  return fixed();
}
function inner() {
  return (function g() {
    Object.defineProperty(inner, "caller", {});
    return nm(inner.caller);
  })();
}
function outer() { return inner(); }
console.log("define fixes caller", outer(), nm(inner.caller),
  d(inner, "caller"));
function args(x) {
  Object.defineProperty(args, "arguments", { writable: false });
  return args.arguments === args.arguments;
}
console.log("define fixes arguments", args(1), args.arguments[0],
  args.arguments.length, d(args, "arguments"));
console.log("frozen", Object.isFrozen(fixed), Object.isSealed(fixed),
  d(fixed, "caller"));
fixer();
console.log("after freeze", fixed(), Object.isFrozen(fixed), d(fixed, "caller"),
  d(fixed, "arguments"));
function sealing() { return nm(sealing.caller); }
Object.seal(sealing);
console.log("sealed", Object.isSealed(sealing), d(sealing, "caller"),
  (function g() { return sealing(); })());
function closed() { return nm(closed.caller); }
Object.preventExtensions(closed);
console.log("non-extensible", Object.isSealed(closed),
  (function g() { return closed(); })(),
  Reflect.defineProperty(closed, "caller", { configurable: false }),
  delete closed.arguments, keys(closed));
function c1() { return Reflect.getOwnPropertyDescriptor(c1, "caller"); }
function c2() { return c1(); }
Reflect.defineProperty(c1, "caller", { writable: false, configurable: false });
var first = Reflect.getOwnPropertyDescriptor(c1, "caller");
console.log("consistent caller", first.configurable, first.writable,
  first.value === c2().value);
function a1() { return Reflect.getOwnPropertyDescriptor(a1, "arguments"); }
Reflect.defineProperty(a1, "arguments",
  { writable: false, configurable: false });
var second = Reflect.getOwnPropertyDescriptor(a1, "arguments");
console.log("consistent arguments", second.configurable, second.writable,
  second.value === a1().value);
function a16(x) {
  return attempt(function () {
    Object.defineProperty(a16, "arguments", { value: a16 });
    return nm(a16.arguments);
  });
}
console.log("define while active", a16(1));
function a17() {
  var p = new Proxy(a17, { get: function () { return a17; } });
  return attempt(function () { return nm(p.arguments); });
}
console.log("Proxy get", a17(1));
function a18() {
  var p = new Proxy(a18, {
    get: function (t, k) { return k === "caller" ? 1 : Reflect.get(t, k); },
  });
  return attempt(function () { return nm(p.caller); });
}
console.log("Proxy get caller", a18());
function a19() {
  var p = new Proxy(a19, {
    getOwnPropertyDescriptor: function (t, k) {
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
  });
  return attempt(function () { return d(p, "arguments"); });
}
console.log("Proxy descriptor", a19(1));
`,
  },
  {
    // ADR 0034 keeps the received values. V8 shows the assignment because
    // the parameter stays in an interpreter register.
    expected: "[1,2]\n",
    name: "a reassigned uncaptured parameter",
    source: `
function f(a, b) { a = 9; return JSON.stringify(Array.from(f.arguments)); }
console.log(f(1, 2));
`,
  },
];

for (const program of fixedPrograms) {
  test(`pins ${program.name}`, { skip, timeout: 900_000 }, async () => {
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compile(
        program.source,
        "legacy-caller-fixed.js",
        specialization,
      );
      await withForcedCollection(() =>
        withNativeFixture(
          {
            backend: cBackend,
            host,
            input: compiled.mir!,
            operation: "execute",
            runtime: cRuntimeProvider,
            target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
            toolchain: nativeToolchain,
          },
          (native) =>
            assertMatchingObservations([
              { exitStatus: 0, stderr: "", stdout: program.expected },
              native,
            ]),
        ),
      );
    }
  });
}

test(
  "records activations without allocating",
  { skip, timeout: 900_000 },
  async () => {
    // ADR 0034 allows no allocation per call: the allocation count of a
    // run must not grow with the number of non-strict and built-in calls.
    const allocations: number[] = [];
    for (const count of [10, 10_000]) {
      const compiled = compile(
        "function add(a, b) { return a + b; }\n" +
          "function visit(v) { total = add(total, v); }\n" +
          "var total = 0;\nvar values = [1];\n" +
          `for (var i = 0; i < ${count}; i++) values.forEach(visit);\n` +
          "console.log(total);\n",
        "legacy-caller-allocations.js",
        "disabled",
      );
      await withNativeFixture(
        {
          backend: cBackend,
          host,
          input: compiled.mir!,
          operation: "execute",
          runtime: cRuntimeProvider,
          target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
          toolchain: nativeToolchain,
        },
        (native) => {
          assert.equal(native.stdout, `${count}\n`);
          assert.ok(native.counters != null);
          allocations.push(native.counters.allocations);
        },
      );
    }
    assert.equal(allocations[0], allocations[1]);
  },
);

test(
  "reports null to a call from module top-level code",
  { skip, timeout: 900_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-legacy-module-"));
    try {
      const script = join(directory, "script.js");
      const entry = join(directory, "entry.mjs");
      await writeFile(
        script,
        "function f() { return f.caller; }\n" +
          "function g() { return f(); }\n" +
          "globalThis.f = f;\nglobalThis.g = g;\n",
      );
      await writeFile(
        entry,
        "console.log(f() === null, g() === g, f.caller === null);\n",
      );
      await withForcedCollection(async () => {
        for (const policy of [[], ["--no-specialization"]] as const) {
          const result = await runNativeCli(
            {
              args: [...policy, "--script", script, entry],
              version: "0.1.0",
            },
            host,
          );
          assert.equal(result.exitStatus, 0, result.stderr);
          assert.equal(result.stdout, "true true true\n");
        }
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  },
);
