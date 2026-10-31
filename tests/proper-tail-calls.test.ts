/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
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
import {
  emittedFrameCharges,
  recursionEvents,
  resourceDiagnostic,
  simulateResources,
  toolchainFrameContract,
} from "./proper-tail-call-resources.ts";

/*
 * Chains of the length test262's tcoHelper.js requires. Node.js and Deno
 * have no proper tail calls, so each program takes its depth as a source
 * constant: the references run it at a depth their stacks hold, which
 * checks the depth-independent model output, and Oseo must print the same
 * output at 100,000 steps.
 */
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const deepDepth = 100_000;
const referenceDepth = 1_000;

interface DeepProgram {
  readonly expected: string;
  readonly name: string;
  readonly source: (depth: number) => string;
}

const programs: readonly DeepProgram[] = [
  {
    // The two reviewed test262 shapes, tco-member.js and tco-call.js.
    expected: "true true\n",
    name: "tagged templates",
    source: (depth) => `"use strict";
const depth = ${depth};
let memberFinished = false;
function member(_, n) {
  if (n === 0) { memberFinished = true; return; }
  return member\`\${n - 1}\`;
}
let callFinished = false;
function getCall() { return call; }
function call(_, n) {
  if (n === 0) { callFinished = true; return; }
  return getCall()\`\${n - 1}\`;
}
member(null, depth);
call(null, depth);
console.log(memberFinished, callFinished);
`,
  },
  {
    expected: "if switch try for-in label logical conditional comma optional\n",
    name: "statement and expression positions",
    source: (depth) => `"use strict";
const depth = ${depth};
function viaIf(n) { if (n === 0) return "if"; else return viaIf(n - 1); }
function viaSwitch(n) {
  switch (n) { case 0: return "switch"; default: return viaSwitch(n - 1); }
}
function viaTry(n) {
  try { n += 0; } catch (error) { return error; } finally {
    if (n === 0) return "try";
    return viaTry(n - 1);
  }
}
function viaForIn(n) {
  for (const key in { key: 1 }) {
    if (n === 0) return "for-in";
    return viaForIn(n - 1);
  }
}
function viaLabel(n) {
  label: { if (n === 0) return "label"; }
  return viaLabel(n - 1);
}
function viaLogical(n) {
  return n === 0 ? "logical" : n > 0 && (null ?? viaLogical(n - 1));
}
function viaConditional(n) {
  return n > 0 ? viaConditional(n - 1) : "conditional";
}
function viaComma(n) { return n === 0 ? "comma" : (n, viaComma(n - 1)); }
const holder = {
  step(n) { return n === 0 ? "optional" : holder?.step(n - 1); },
};
console.log(
  viaIf(depth), viaSwitch(depth), viaTry(depth), viaForIn(depth),
  viaLabel(depth), viaLogical(depth), viaConditional(depth),
  viaComma(depth), holder.step(depth),
);
`,
  },
  {
    expected: "call apply reflect bound proxy trap true\n",
    name: "forwarding callees and mutual recursion",
    source: (depth) => `"use strict";
const depth = ${depth};
function viaCall(n) { return n === 0 ? "call" : viaCall.call(null, n - 1); }
function viaApply(n) {
  return n === 0 ? "apply" : viaApply.apply(null, [n - 1]);
}
function viaReflect(n) {
  return n === 0 ? "reflect" : Reflect.apply(viaReflect, null, [n - 1]);
}
function viaBound(n) { return n === 0 ? "bound" : bound(n - 1); }
const bound = viaBound.bind(null);
function viaProxy(n) { return n === 0 ? "proxy" : proxy(n - 1); }
const proxy = new Proxy(viaProxy, {});
function viaTrap(n) { return n === 0 ? "trap" : trapped(n - 1); }
const trapped = new Proxy(function () {}, {
  apply(target, thisArgument, values) { return viaTrap(...values); },
});
const isOdd = (n) => n === 0 ? false : isEven(n - 1);
function isEven(n) { return n === 0 ? true : isOdd(n - 1); }
console.log(
  viaCall(depth), viaApply(depth), viaReflect(depth), viaBound(depth),
  viaProxy(depth), viaTrap(depth), isEven(depth),
);
`,
  },
  {
    expected: "object this TypeError\n",
    name: "constructor result rules",
    source: (depth) => `"use strict";
const depth = ${depth};
function makeObject(n) {
  return n === 0 ? { made: "object" } : makeObject(n - 1);
}
function none(n) { return n === 0 ? undefined : none(n - 1); }
function primitive(n) { return n === 0 ? 1 : primitive(n - 1); }
class Base {}
class Child extends Base {
  constructor(mode) {
    super();
    this.made = "this";
    if (mode === "object") return makeObject(depth);
    return mode === "none" ? none(depth) : primitive(depth);
  }
}
let failure;
try {
  new Child("primitive");
} catch (error) {
  failure = error.constructor.name;
}
console.log(new Child("object").made, new Child("none").made, failure);
`,
  },
];

/**
 * Non-tail positions that must keep nesting frames in strict code. Each
 * chain would enter `f` 301 times, so it stops at a native resource guard.
 * `iterations` counts the built-in calls a for-of head makes before each
 * body runs: `@@iterator`, then `next`. Only the small operand frame is
 * known to reach the call depth limit on every toolchain; the wider frames
 * reach whichever guard their toolchain's frame charge selects.
 */
const nonTailPrograms: readonly {
  readonly iterations: number;
  readonly name: string;
  readonly smallFrame: boolean;
  readonly source: string;
}[] = [
  {
    iterations: 0,
    name: "a try block",
    smallFrame: false,
    source: `"use strict";
function f(n) {
  try { return n === 0 ? 0 : f(n - 1); } catch (error) { throw error; }
}
f(300);
`,
  },
  {
    iterations: 2,
    name: "a for-of body",
    smallFrame: false,
    source: `"use strict";
function f(n) {
  for (const value of [n]) return value === 0 ? 0 : f(value - 1);
}
f(300);
`,
  },
  {
    iterations: 0,
    name: "an operand with work after the call",
    smallFrame: true,
    source: `"use strict";
function f(n) { return n === 0 ? 0 : f(n - 1) + 0; }
f(300);
`,
  },
];

function compile(source: string, sourceId: string) {
  const compiled = compileSource(babelFrontend, { source, sourceId });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  return compiled.mir;
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory("oseo-tail-reference-");
  const path = `${directory}/case.js`;
  let succeeded = false;
  try {
    await host.writeTextFile(path, source);
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

for (const program of programs) {
  test(
    `runs 100,000 proper tail calls: ${program.name}`,
    { skip: nativeTarget == null ? "requires a supported native host" : false },
    async () => {
      const expected = { exitStatus: 0, stderr: "", stdout: program.expected };
      assertMatchingObservations([
        expected,
        ...(await references(program.source(referenceDepth))),
      ]);
      await withNativeFixture(
        {
          backend: cBackend,
          host,
          input: compile(program.source(deepDepth), "deep-tail-calls.js"),
          operation: "execute",
          runtime: cRuntimeProvider,
          target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
          toolchain: nativeToolchain,
        },
        (native) => assertMatchingObservations([expected, native]),
      );
    },
  );
}

for (const program of nonTailPrograms) {
  test(
    `keeps nesting a strict call outside tail position: ${program.name}`,
    { skip: nativeTarget == null ? "requires a supported native host" : false },
    async () => {
      const sourceId = "non-tail-calls.js";
      // The CLI compiles with specialization enabled, as `compile` does.
      const charges = emittedFrameCharges(
        cBackend.emit(compile(program.source, sourceId)),
      );
      const [slots, ...others] = charges.functions.values();
      assert.ok(slots != null);
      assert.deepEqual(others, []);
      const outcome = simulateResources(
        toolchainFrameContract(
          nativeToolchain,
          nativeTarget ?? describeTarget("linux-x86_64-gnu"),
        ),
        charges.script,
        recursionEvents(slots, 301, program.iterations),
      );
      if (outcome.kind === "completed") {
        assert.fail("A 301-call non-tail chain fit the native resources.");
      }
      if (program.smallFrame) assert.equal(outcome.kind, "call-depth");
      const native = await runNativeCli(
        {
          args: [sourceId],
          source: program.source,
          sourceId,
          version: "0.1.0",
        },
        host,
      );
      assert.equal(native.exitStatus, 1, native.stderr);
      assert.equal(native.stdout, "");
      assert.match(native.stderr, resourceDiagnostic(sourceId, outcome.kind));
    },
  );
}

/*
 * The shrunk counterexample of the non-tail property's catch-finally
 * context, as the property printed it but rewrapped: the first hop's body
 * sits in a catch inside a finally that always returns, so no completion
 * of that finally is ever resumed. Its C once labeled the unreachable
 * after block, which -Werror rejects.
 */
const finallyChain = `"use strict";
let steps = 0;
const hop0 = (n) => { steps += 1; try { steps += 0; } finally {
  try { throw 0; } catch (error0) {
    if (n === 0) { return "done 0"; }
    return (() => { try { throw 0; } catch (error) {
      return hop1.apply(null, [n - 1]); } finally { steps += 0; } })();
  } } };
const hop1 = (n) => { steps += 1; if (n === 0) { return "done 1"; }
  return (() => { try { throw 0; } catch (error) {
    return hop0.apply(null, [n - 1]); } finally { steps += 0; } })(); };

const bound0 = hop0.bind(null);
const proxy0 = new Proxy(hop0, {});
const trap0 = new Proxy(function () {}, {
  apply(target, thisArgument, values) { return hop0(...values); },
});
const tag0 = (strings, ...values) => hop0(...values);


const bound1 = hop1.bind(null);
const proxy1 = new Proxy(hop1, {});
const trap1 = new Proxy(function () {}, {
  apply(target, thisArgument, values) { return hop1(...values); },
});
const tag1 = (strings, ...values) => hop1(...values);

try {
  console.log(hop0(0), steps);
} catch (error) {
  console.log(error.constructor.name, error.message, steps);
}
`;

test(
  "compiles a non-tail chain whose finally always returns",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const expected = { exitStatus: 0, stderr: "", stdout: "done 0 1\n" };
    assertMatchingObservations([expected, ...(await references(finallyChain))]);
    const sourceId = "finally-chain.js";
    for (const args of [[sourceId], ["--no-specialization", sourceId]]) {
      const native = await runNativeCli(
        { args, source: finallyChain, sourceId, version: "0.1.0" },
        host,
      );
      assertMatchingObservations([expected, native]);
    }
  },
);

test(
  "clearTimeout tail steps preserve arguments, realms, and constructor results",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const source = `"use strict";
const log = [];
const callbacks = [];
const token = {};
const foreign = $262.createRealm().global;
function cancel(handle) {
  return clearTimeout((log.push("handle"), handle),
    (log.push("extra"), { live: true }));
}
function spread(handle) {
  return clearTimeout(...{
    [Symbol.iterator]() {
      let index = 0;
      return { next() {
        log.push("next" + index);
        if (index++ === 0) return { value: handle, done: false };
        if (index === 2) return { value: { live: true }, done: false };
        return { done: true };
      } };
    },
  });
}
function absent() { return clearTimeout(); }
function inert() {
  return clearTimeout({ [Symbol.toPrimitive]() { throw token; } });
}
function abrupt(handle) { return clearTimeout(handle, fail()); }
function fail() { throw token; }
console.log("result", cancel(setTimeout(() => callbacks.push("bad"), 0)));
console.log("spread", spread(setTimeout(() => callbacks.push("bad"), 0)));
console.log("empty", absent());
const kept = setTimeout(() => callbacks.push("kept"), 0);
try { abrupt(kept); } catch (error) {
  console.log("argument", error === token);
}
class Base {}
class Derived extends Base {
  constructor() { super(); this.live = "this"; return clearTimeout(); }
}
class Uninitialized extends Base { constructor() { return clearTimeout(); } }
console.log("derived", new Derived().live);
try { foreign.Reflect.construct(Uninitialized, []); } catch (error) {
  console.log("realm", error instanceof ReferenceError,
    error instanceof foreign.ReferenceError);
}
function ordinary(handle) { clearTimeout(handle); return "ordinary"; }
console.log(ordinary(setTimeout(() => callbacks.push("bad"), 0)));
console.log("order", log.join(","));
setTimeout(() => console.log("callbacks", callbacks.join(",")), 0);
`;
    const commonOutput =
      "result undefined\nspread undefined\nempty undefined\n" +
      "argument true\nderived this\nrealm true false\nordinary\n" +
      "order handle,extra,next0,next1,next2\n";
    const expected = {
      exitStatus: 0,
      stderr: "",
      stdout: commonOutput + "callbacks kept\n",
    };
    // Oseo's direct host contract ignores non-number handles. Deno
    // coerces an object handle, so this assertion has its own explicit
    // native oracle instead of a shared reference expectation.
    const nativeSource =
      source +
      `
function ordinaryInert() {
  clearTimeout({ [Symbol.toPrimitive]() { throw token; } });
  return undefined;
}
console.log("host contract", inert() === undefined,
  ordinaryInert() === undefined);
`;
    // Reflect.construct from the foreign realm is the caller here, so the
    // uninitialized-this ReferenceError comes from that caller's realm, as
    // [[Construct]] restores the caller context before GetThisBinding.
    // Node.js and Deno create it in the constructor's realm instead; that
    // qualified reference divergence stays in the shared expectation, and
    // the native oracle asserts the specified realm.
    const nativeExpected = {
      ...expected,
      stdout:
        commonOutput.replace("realm true false", "realm false true") +
        "host contract true true\ncallbacks kept\n",
    };
    // Both reference hosts supply a realm through node:vm; only the test
    // harness owns it, and compiled code uses the existing $262 surface.
    const shim =
      'import { runInNewContext } from "node:vm";\n' +
      "globalThis.$262 = { createRealm() {\n" +
      'return { global: runInNewContext("globalThis") }; } };\n';
    assertMatchingObservations([
      expected,
      ...(await references(shim + source)),
    ]);
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source: nativeSource, sourceId: "clear-timeout-tail.js" },
        { specialization, test262Host: true },
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
            target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
            toolchain: nativeToolchain,
          },
          (native) => assertMatchingObservations([nativeExpected, native]),
        );
      } finally {
        if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
      }
    }
  },
);
