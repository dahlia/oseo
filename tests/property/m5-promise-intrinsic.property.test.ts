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

/**
 * One generated promise program. `derived` selects whether the observed
 * capabilities come from %Promise% itself or from a subclass, `species`
 * selects which SpeciesConstructor outcome `then` reaches, and
 * `receiver` selects the `this` value the statics run against.
 */
interface PromiseIntrinsicCase {
  readonly derived: boolean;
  readonly rejects: boolean;
  readonly receiver: "custom" | "intrinsic" | "non-constructor" | "non-object";
  readonly species: "default" | "throwing" | "undefined";
  readonly value: number;
}

const caseArbitrary: fc.Arbitrary<PromiseIntrinsicCase> = fc.record({
  derived: fc.boolean(),
  rejects: fc.boolean(),
  receiver: fc.constantFrom(
    "custom",
    "intrinsic",
    "non-constructor",
    "non-object",
  ),
  species: fc.constantFrom("default", "throwing", "undefined"),
  value: fc.integer({ max: 1000, min: 1 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** The source of the `this` value each static observation runs against. */
function receiverSource(testCase: PromiseIntrinsicCase): string {
  if (testCase.receiver === "intrinsic") return "Capability";
  if (testCase.receiver === "custom") return "CustomCapability";
  if (testCase.receiver === "non-constructor") return "({})";
  return "undefined";
}

function printCase(testCase: PromiseIntrinsicCase): string {
  const value = testCase.value;
  const settle = testCase.rejects ? `reject(${value});` : `resolve(${value});`;
  const derivedSetup = testCase.derived
    ? "class Capability extends Promise {}"
    : "const Capability = Promise;";
  const speciesSetup =
    testCase.species === "default"
      ? ""
      : testCase.species === "undefined"
        ? `speciesHost.constructor = { [Symbol.species]: undefined };`
        : `Object.defineProperty(speciesHost, "constructor", {
  configurable: true,
  get() { throw new EvalError("species"); },
});`;
  return `
${derivedSetup}
function CustomCapability(executor) {
  this.tag = ${value};
  executor(
    function (settled) { console.log("capability resolve", settled); },
    function () {},
  );
}
console.log(
  "metadata",
  typeof Promise,
  Promise.name,
  Promise.length,
  Promise.prototype.constructor === Promise,
  Promise[Symbol.species] === Promise,
  Capability[Symbol.species] === Capability,
);
const source = new Promise(function (resolve, reject) { ${settle} });
console.log(
  "source",
  source instanceof Promise,
  source instanceof Capability === ${String(!testCase.derived)},
  Object.prototype.toString.call(source),
);
const speciesHost = new Promise(function (resolve) { resolve(${value}); });
${speciesSetup}
let speciesOutcome = "none";
try {
  speciesOutcome = speciesHost.then(function () {}) instanceof Promise
    ? "promise"
    : "other";
} catch (error) {
  speciesOutcome = error instanceof EvalError ? "throws" : "unexpected";
}
console.log("species", speciesOutcome);
const receiver = ${receiverSource(testCase)};
let staticOutcome = "none";
try {
  const produced = Promise.resolve.call(receiver, ${value + 1});
  staticOutcome = produced instanceof Promise
    ? "promise"
    : produced instanceof CustomCapability
      ? "custom"
      : "other";
} catch (error) {
  staticOutcome = error instanceof TypeError ? "type-error" : "unexpected";
}
console.log("static receiver", staticOutcome);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(${value}, 1), hinted("${value}", 1));
const originalPromise = Promise;
const promiseGlobalObject = this;
console.log("global read", Promise === originalPromise, typeof Promise);
Promise = ${value};
console.log("global write", Promise, this.Promise === Promise);
Promise = originalPromise;
console.log("global restore", Promise === originalPromise);
console.log("global delete", delete this.Promise, "Promise" in this);
try { Promise; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
this.Promise = originalPromise;
console.log("global reinstall", Promise === originalPromise);
source.then(
  function (settled) { console.log("settled", "fulfilled", settled); },
  function (reason) { console.log("settled", "rejected", reason); },
).then(function () {
  return Capability.resolve(${value + 2});
}).then(function (chained) {
  console.log("chained", chained);
  return Capability.reject(${value + 3});
}).catch(function (reason) {
  console.log("caught", reason);
  return Capability.try(function (first) { return first + 4; }, ${value});
}).then(function (attempted) {
  console.log("try", attempted);
  const resolvers = Capability.withResolvers();
  resolvers.resolve(${value + 5});
  return resolvers.promise;
}).then(function (resolved) {
  console.log("withResolvers", resolved);
}).finally(function () {
  console.log("finally", ${value});
});
`;
}

function expected(testCase: PromiseIntrinsicCase): string {
  const value = testCase.value;
  const speciesOutcome = testCase.species === "throwing" ? "throws" : "promise";
  const staticOutcome =
    testCase.receiver === "intrinsic"
      ? "promise"
      : testCase.receiver === "custom"
        ? "custom"
        : "type-error";
  const lines = [
    `metadata function Promise 1 true true true`,
    `source true true [object Promise]`,
    `species ${speciesOutcome}`,
  ];
  if (testCase.receiver === "custom") {
    lines.push(`capability resolve ${value + 1}`);
  }
  lines.push(
    `static receiver ${staticOutcome}`,
    `hint ${value + 1} ${value}1`,
    "global read true function",
    `global write ${value} true`,
    "global restore true",
    "global delete true false",
    "global deleted read true",
    "global reinstall true",
    `settled ${testCase.rejects ? "rejected" : "fulfilled"} ${value}`,
    `chained ${value + 2}`,
    `caught ${value + 3}`,
    `try ${value + 4}`,
    `withResolvers ${value + 5}`,
    `finally ${value}`,
    "",
  );
  return lines.join("\n");
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
  const directory = await host.makeTemporaryDirectory(
    "oseo-promise-intrinsic-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
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
  "generated Promise intrinsic observations match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Promise construction, statics, species, and identity agree",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-promise-intrinsic.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /add-smi-checked/u);
            assert.match(mir, /generic-fallback/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:smi|shape)/u);
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
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters?.collections != null);
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
                `sanitizers=${nativeTarget.sanitizers.join(",")}`,
              ],
        domain:
          "one settled integer from 1 to 1000, one fulfilled or rejected " +
          "executor outcome, one %Promise% or subclass capability, one " +
          "default, undefined, or throwing SpeciesConstructor outcome, " +
          "one intrinsic, custom-constructor, non-constructor, or " +
          "non-object static receiver, a false number hint, and one " +
          "global Promise write, restore, delete, and reinstall sequence",
        numRuns: 12,
        profile: "M5 Promise intrinsic",
        seed: 0x6000_3800,
        sizeLimit:
          "one bounded integer, one executor outcome, one capability " +
          "constructor, one species outcome, one static receiver, one " +
          "false hint, and one six-step reaction chain",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
