/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
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

/*
 * Behavior behind three allocation reductions: a function creates no
 * `arguments` object that no reference reaches, the runtime shares live
 * short strings, and an iterator step through the intrinsic
 * %ArrayIteratorPrototype%.next skips the result object nothing can
 * observe. Every observable Get, accessor, and Proxy trap must still run
 * in order, and a replaced `next` must reach the generic path, whose
 * result accessors run. Forced collection at every safepoint checks that
 * no shortcut leaves a value unrooted.
 */
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const source = `const log = [];
// Element getters and a Proxy observe every Get each iterator step makes.
const source = [1, 2, 3];
Object.defineProperty(source, 1, {
  get() { log.push("getter"); return 20; },
});
const proxy = new Proxy(source, {
  get(target, key, receiver) {
    if (typeof key === "string") log.push("get " + key);
    return Reflect.get(target, key, receiver);
  },
});
function collect(...values) { return values.join(","); }
console.log("spread", collect(...source), collect(...proxy), log.join("|"));
const growing = [1];
const seen = [];
for (const value of growing) {
  seen.push(value);
  if (growing.length < 4) growing.push(value + 1);
}
console.log("for-of growth", seen.join());
console.log(
  "kinds",
  [...[5, 6].keys()].join(),
  JSON.stringify([...[5, 6].entries()]),
);
const throwing = [1, 2];
Object.defineProperty(throwing, 1, {
  get() { throw new RangeError("element"); },
});
try {
  const [first, second] = throwing;
  console.log("abrupt none", first, second);
} catch (error) {
  console.log("abrupt", error.constructor.name);
}
// A replaced next takes the generic path, whose result accessors run.
const ArrayIteratorPrototype = Object.getPrototypeOf([][Symbol.iterator]());
const originalNext = ArrayIteratorPrototype.next;
let step = 0;
ArrayIteratorPrototype.next = function () {
  step += 1;
  const current = step;
  return {
    get done() { log.push("done " + current); return current > 2; },
    get value() { log.push("value " + current); return current * 10; },
  };
};
log.length = 0;
console.log("replaced", collect(...[7, 8, 9]), log.join("|"));
ArrayIteratorPrototype.next = originalNext;
console.log("restored", collect(...[7, 8, 9]));
// An iterator whose next was read before the replacement keeps it.
const early = [1, 2][Symbol.iterator]();
const earlyNext = early.next;
ArrayIteratorPrototype.next = function () { return { done: true }; };
console.log(
  "captured",
  JSON.stringify(earlyNext.call(early)),
  JSON.stringify([...[3, 4]]),
);
ArrayIteratorPrototype.next = originalNext;
// A function keeps its arguments object exactly when a reference reaches it.
function sloppyMapped(a) { arguments[0] = 5; return a; }
function viaArrow() { return (() => arguments.length)(); }
function inDefault(a = arguments.length) { return a; }
function unused(a, b) { return a + b; }
function written() { arguments = 3; return arguments; }
function typeOf() { return typeof arguments; }
console.log(
  "arguments",
  sloppyMapped(1),
  viaArrow(1, 2, 3),
  inDefault(undefined, 2),
  unused(1, 2),
  written(),
  typeOf(),
);
`;

async function references() {
  const directory = await host.makeTemporaryDirectory("oseo-fast-reference-");
  const path = `${directory}/case.js`;
  let succeeded = false;
  try {
    // An indirect eval keeps the reference a non-strict Script, as Oseo
    // compiles it, where Deno would otherwise load a strict module.
    await host.writeTextFile(path, `(0, eval)(${JSON.stringify(source)});\n`);
    const observations = [
      await host.run({
        args: [path],
        command: process.execPath,
        cwd: directory,
      }),
      await host.run({
        args: ["run", "--quiet", path],
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
  "keeps every observable step of elided arguments and iterator results",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    assert.ok(nativeTarget != null);
    const observed = await references();
    assertMatchingObservations([...observed]);
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source, sourceId: "allocation-paths.js" },
        { observeSpecialization: true, specialization },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir != null);
      const unused = compiled.mir.functions.find(
        (functionValue) => functionValue.name === "unused",
      );
      assert.ok(unused != null);
      assert.equal(unused.argumentsBindingId, undefined);
      for (const name of ["sloppyMapped", "viaArrow", "inDefault", "written"]) {
        assert.ok(
          compiled.mir.functions.find(
            (functionValue) => functionValue.name === name,
          )?.argumentsBindingId != null,
          name,
        );
      }
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
            assertMatchingObservations([observed[0], native]);
            assert.ok(native.counters != null);
            assert.ok(native.counters.collections > 0);
          },
        );
      } finally {
        if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
      }
    }
  },
);
