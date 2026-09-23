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
import { nativeToolchain } from "../native-toolchain.ts";

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
                toolchain: nativeToolchain,
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

type PromiseResolveMode =
  | "base-from-derived"
  | "derived-from-base"
  | "matching-derived"
  | "matching-intrinsic"
  | "thenable"
  | "throwing";

interface PromiseResolveCase {
  readonly mode: PromiseResolveMode;
  readonly value: number;
}

const promiseResolveArbitrary: fc.Arbitrary<PromiseResolveCase> = fc.record({
  mode: fc.constantFrom(
    "base-from-derived" as const,
    "derived-from-base" as const,
    "matching-derived" as const,
    "matching-intrinsic" as const,
    "thenable" as const,
    "throwing" as const,
  ),
  value: fc.integer({ max: 1000, min: 1 }),
});

function printPromiseResolveCase(testCase: PromiseResolveCase): string {
  const { mode, value } = testCase;
  const candidateSetup =
    mode === "matching-derived" || mode === "base-from-derived"
      ? `candidate = GeneratedPromise.resolve(${value});
candidateConstructor = GeneratedPromise;`
      : mode === "thenable"
        ? `candidate = { then(resolve) { resolve(${value}); } };`
        : `candidate = Promise.resolve(${value});
candidateConstructor = Promise;`;
  const selectedConstructor =
    mode === "matching-derived" || mode === "derived-from-base"
      ? "GeneratedPromise"
      : "Promise";
  const getterBody =
    mode === "throwing"
      ? `throw constructorError;`
      : mode === "thenable"
        ? `throw new EvalError("thenable constructor");`
        : `return candidateConstructor;`;
  return `
class GeneratedPromise extends Promise {}
let candidate;
let candidateConstructor;
let constructorReads = 0;
const constructorError = new EvalError("constructor getter");
${candidateSetup}
Object.defineProperty(candidate, "constructor", {
  configurable: true,
  get() {
    constructorReads = constructorReads + 1;
    ${getterBody}
  },
});
let resolved;
try {
  resolved = ${selectedConstructor}.resolve(candidate);
  console.log(
    "sync",
    resolved === candidate,
    resolved instanceof Promise,
    resolved instanceof GeneratedPromise,
    constructorReads,
  );
  resolved.then(function (settled) { console.log("settled", settled); });
} catch (error) {
  console.log("throw", error === constructorError, constructorReads);
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(${value}, 1), hinted("${value}", 1));
`;
}

function expectedPromiseResolve(testCase: PromiseResolveCase): string {
  const { mode, value } = testCase;
  if (mode === "throwing") {
    return `throw true 1\nhint ${value + 1} ${value}1\n`;
  }
  const same = mode === "matching-derived" || mode === "matching-intrinsic";
  const derived = mode === "derived-from-base" || mode === "matching-derived";
  const reads = mode === "thenable" ? 0 : 1;
  return (
    `sync ${String(same)} true ${String(derived)} ${reads}\n` +
    `hint ${value + 1} ${value}1\n` +
    `settled ${value}\n`
  );
}

test(
  "generated PromiseResolve constructor reads match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "PromiseResolve reads promise constructors before identity reuse",
      fc.asyncProperty(promiseResolveArbitrary, async (testCase) => {
        const source = printPromiseResolveCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expectedPromiseResolve(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            {
              source,
              sourceId: "generated-m5-promise-resolve-read.ts",
            },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /guard-shape/u);
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
                target: nativeTarget!,
                toolchain: nativeToolchain,
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
          "one intrinsic or derived promise with a matching, different, " +
          "or throwing constructor read, or one thenable whose constructor " +
          "must remain unread, crossed with one bounded integer",
        numRuns: 12,
        profile: "M5 PromiseResolve constructor read",
        seed: 0x6000_3801,
        sizeLimit:
          "one constructor relation, one bounded integer, one observable " +
          "getter, and one fulfillment reaction",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

type PromiseResolveContinuation =
  | "async-from-sync"
  | "async-function-await"
  | "async-generator-await"
  | "async-generator-return";

interface PromiseResolveContinuationCase {
  readonly continuation: PromiseResolveContinuation;
  readonly value: number;
}

type ContinuationCaseArbitrary = fc.Arbitrary<PromiseResolveContinuationCase>;

const promiseResolveContinuationArbitrary: ContinuationCaseArbitrary =
  fc.record({
    continuation: fc.constantFrom(
      "async-from-sync" as const,
      "async-function-await" as const,
      "async-generator-await" as const,
      "async-generator-return" as const,
    ),
    value: fc.integer({ max: 1000, min: 1 }),
  });

function printPromiseResolveContinuation(
  testCase: PromiseResolveContinuationCase,
): string {
  const { continuation, value } = testCase;
  const repetitions = (value % 4) + 2;
  const observation =
    continuation === "async-function-await"
      ? `async function observe() {
  let caught = 0;
  for (let index = 0; index < ${repetitions}; index = index + 1) {
    try {
      await candidate;
      console.log("unexpected fulfillment");
    } catch (error) {
      if (error === constructorError) caught = caught + 1;
    }
  }
  console.log("continuation async function", caught, constructorReads);
}
observe();`
      : continuation === "async-generator-await"
        ? `async function* observe() {
  let caught = 0;
  for (let index = 0; index < ${repetitions}; index = index + 1) {
    try {
      await candidate;
      console.log("unexpected fulfillment");
    } catch (error) {
      if (error === constructorError) caught = caught + 1;
    }
  }
  console.log("continuation async generator catch", caught,
    constructorReads);
  return ${value};
}
observe().next().then(function (step) {
  console.log("continuation async generator", step.value, step.done);
});`
        : continuation === "async-generator-return"
          ? `async function* observe() {
  throw new Error("must not resume");
}
let returned;
try {
  returned = observe().return(candidate);
  console.log("continuation return sync", returned instanceof Promise,
    constructorReads);
} catch (error) {
  console.log("unexpected synchronous throw", error === constructorError);
}
returned.then(
  function () { console.log("unexpected fulfillment"); },
  function (error) {
    console.log("continuation async generator return",
      error === constructorError, constructorReads);
  },
);`
          : `const iterable = {
  [Symbol.iterator]() {
    return {
      next() { return { done: false, value: candidate }; },
    };
  },
};
async function observe() {
  try {
    for await (const settled of iterable) {
      console.log("unexpected fulfillment", settled);
      break;
    }
  } catch (error) {
    console.log("continuation async from sync", error === constructorError,
      constructorReads);
  }
}
observe();`;
  return `
let constructorReads = 0;
const constructorError = new EvalError("constructor getter");
const candidate = Promise.resolve(${value});
Object.defineProperty(candidate, "constructor", {
  configurable: true,
  get() {
    constructorReads = constructorReads + 1;
    throw constructorError;
  },
});
${observation}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(${value}, 1), hinted("${value}", 1));
`;
}

function expectedPromiseResolveContinuation(
  testCase: PromiseResolveContinuationCase,
): string {
  const { continuation, value } = testCase;
  const hint = `hint ${value + 1} ${value}1\n`;
  const repetitions = (value % 4) + 2;
  if (continuation === "async-function-await") {
    return `continuation async function ${repetitions} ${repetitions}\n` + hint;
  }
  if (continuation === "async-generator-await") {
    return (
      `continuation async generator catch ${repetitions} ` +
      `${repetitions}\n` +
      hint +
      `continuation async generator ${value} true\n`
    );
  }
  if (continuation === "async-generator-return") {
    return (
      `continuation return sync true 1\n` +
      hint +
      `continuation async generator return true 1\n`
    );
  }
  return hint + `continuation async from sync true 1\n`;
}

test(
  "generated PromiseResolve abrupt continuations match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "PromiseResolve abrupt reads reach asynchronous continuations",
      fc.asyncProperty(
        promiseResolveContinuationArbitrary,
        async (testCase) => {
          const source = printPromiseResolveContinuation(testCase);
          const expectedObservation = {
            exitStatus: 0,
            stderr: "",
            stdout: expectedPromiseResolveContinuation(testCase),
          };
          assertMatchingObservations([
            expectedObservation,
            ...(await references(source)),
          ]);
          for (const specialization of ["disabled", "enabled"] as const) {
            const compiled = compileSource(
              babelFrontend,
              {
                source,
                sourceId: "generated-m5-promise-resolve-continuation.ts",
              },
              { observeSpecialization: true, specialization },
            );
            assert.deepEqual(compiled.diagnostics, []);
            assert.ok(compiled.mir != null);
            const mir = printMir(compiled.mir);
            if (specialization === "enabled") {
              assert.match(mir, /guard-smi/u);
              assert.match(mir, /guard-shape/u);
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
                  target: nativeTarget!,
                  toolchain: nativeToolchain,
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
        },
      ),
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
          "one native Promise with a throwing constructor getter crossed " +
          "with async-function await, async-generator await or return, or " +
          "an asynchronous-from-synchronous iterator continuation, and one " +
          "bounded integer",
        numRuns: 12,
        profile: "M5 PromiseResolve abrupt continuations",
        seed: 0x6000_3802,
        sizeLimit:
          "one asynchronous continuation, one bounded integer, one " +
          "observable getter, and up to five rejected or caught " +
          "resumptions",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
