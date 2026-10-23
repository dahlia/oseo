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

type RestrictedName = "Infinity" | "NaN" | "undefined";

interface GlobalRecordCase {
  readonly assigned: number;
  readonly name: RestrictedName;
  readonly text: "miss" | "text";
}

const caseArbitrary: fc.Arbitrary<GlobalRecordCase> = fc.record({
  assigned: fc.integer({ max: 100, min: -100 }),
  name: fc.constantFrom("Infinity", "NaN", "undefined"),
  text: fc.constantFrom("miss", "text"),
});

/**
 * One statement that observes or changes the global `eval` binding
 * without passing a String to %eval%. ADR 0016 rejects an unshadowed
 * `eval(...)` call, so calls go through a comma expression, a `with`
 * object whose fallback reaches the global property, or a tagged
 * template, which is an ordinary call passing a template object.
 */
type EvalStep =
  | { readonly kind: "call"; readonly value: number }
  | { readonly kind: "construct" }
  | { readonly kind: "delete" }
  | { readonly kind: "descriptor" }
  | { readonly kind: "hint" }
  | { readonly kind: "read" }
  | { readonly kind: "restore" }
  | { readonly kind: "shadow"; readonly value: number }
  | { readonly kind: "strict-read" }
  | { readonly kind: "tagged"; readonly parenthesized: boolean }
  | { readonly kind: "with-call"; readonly value: number }
  | { readonly kind: "with-read"; readonly own: number | undefined }
  | { readonly kind: "write"; readonly value: number };

interface EvalCase {
  readonly steps: readonly EvalStep[];
}

const evalValue = fc.integer({ max: 100, min: 0 });

const evalStepArbitrary: fc.Arbitrary<EvalStep> = fc.oneof(
  fc.record({ kind: fc.constant("call" as const), value: evalValue }),
  fc.record({ kind: fc.constant("construct" as const) }),
  fc.record({ kind: fc.constant("delete" as const) }),
  fc.record({ kind: fc.constant("descriptor" as const) }),
  fc.record({ kind: fc.constant("hint" as const) }),
  fc.record({ kind: fc.constant("read" as const) }),
  fc.record({ kind: fc.constant("restore" as const) }),
  fc.record({ kind: fc.constant("shadow" as const), value: evalValue }),
  fc.record({ kind: fc.constant("strict-read" as const) }),
  fc.record({
    kind: fc.constant("tagged" as const),
    parenthesized: fc.boolean(),
  }),
  fc.record({ kind: fc.constant("with-call" as const), value: evalValue }),
  fc.record({
    kind: fc.constant("with-read" as const),
    own: fc.option(evalValue, { nil: undefined }),
  }),
  fc.record({ kind: fc.constant("write" as const), value: evalValue }),
);

const evalCaseArbitrary: fc.Arbitrary<EvalCase> = fc.record({
  steps: fc.array(evalStepArbitrary, { maxLength: 8, minLength: 1 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function sourceFor(testCase: GlobalRecordCase): string {
  return `
var ${testCase.name} = ${testCase.assigned};
const descriptor = Object.getOwnPropertyDescriptor(this, ${JSON.stringify(
    testCase.name,
  )});
console.log(
  "descriptor",
  ${testCase.name} !== ${testCase.name}
    ? descriptor.value !== descriptor.value
    : descriptor.value === ${testCase.name},
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
);
console.log(
  "value",
  ${testCase.name} === ${testCase.name},
  ${testCase.name} === 1 / 0,
  ${testCase.name} === void 0,
);
${testCase.name} = ${testCase.assigned + 1};
console.log(
  "assignment",
  ${testCase.name} !== ${testCase.name}
    ? descriptor.value !== descriptor.value
    : descriptor.value === ${testCase.name},
);
console.log("delete", delete ${testCase.name});
let strictResult = "ok";
try {
  (function () {
    "use strict";
    ${testCase.name} = ${testCase.assigned + 2};
  })();
} catch (error) {
  strictResult = error.name;
}
console.log("strict", strictResult);
let redefine = "ok";
try {
  Object.defineProperty(this, ${JSON.stringify(testCase.name)}, {
    value: ${testCase.assigned},
  });
} catch (error) {
  redefine = error.name;
}
console.log("redefine", redefine);
/** @param {number} value */
function hinted(value) { return value + 1; }
console.log("guard", hinted(${testCase.assigned}), hinted(${JSON.stringify(
    testCase.text,
  )}));
const survivor = { value: ${testCase.name} };
for (let index = 0; index < 16; index = index + 1) {
  Object.defineProperty({}, "item", { value: { index } });
}
console.log(
  "collection",
  ${testCase.name} !== ${testCase.name}
    ? survivor.value !== survivor.value
    : survivor.value === ${testCase.name},
);
`;
}

function expected(testCase: GlobalRecordCase): string {
  const equality = testCase.name !== "NaN";
  return [
    "descriptor true false false false",
    `value ${equality} ${testCase.name === "Infinity"} ` +
      `${testCase.name === "undefined"}`,
    "assignment true",
    "delete false",
    "strict TypeError",
    "redefine TypeError",
    `guard ${testCase.assigned + 1} ${testCase.text}1`,
    "collection true",
    "",
  ].join("\n");
}

function evalStepSource(step: EvalStep): string {
  const shown = 'eval === intrinsic ? "intrinsic" : eval';
  switch (step.kind) {
    case "call":
      return (
        `try { console.log("call", (0, eval)(${step.value})); } ` +
        'catch (error) { console.log("call", error.name); }'
      );
    case "construct":
      return (
        'try { new eval(); console.log("construct", "ok"); } ' +
        'catch (error) { console.log("construct", error.name); }'
      );
    case "delete":
      return 'console.log("delete", delete eval);';
    case "descriptor":
      return (
        "{ const found = Object.getOwnPropertyDescriptor(globalThis, " +
        '"eval"); console.log("descriptor", found === undefined ? ' +
        '"missing" : [found.writable, found.enumerable, ' +
        "found.configurable].join()); }"
      );
    case "hint":
      return (
        'try { console.log("hint", hinted(eval.length)); } ' +
        'catch (error) { console.log("hint", error.name); }'
      );
    case "read":
      return (
        `try { console.log("read", typeof eval, ${shown}); } ` +
        'catch (error) { console.log("read", typeof eval, error.name); }'
      );
    case "restore":
      return "eval = intrinsic;";
    case "shadow":
      return (
        '(function (eval) { console.log("shadow", eval); })' +
        `(${step.value});`
      );
    case "strict-read":
      return (
        'console.log("strict", (function () { "use strict"; ' +
        `try { return ${shown}; } catch (error) { return error.name; } ` +
        "})());"
      );
    case "tagged":
      return (
        "try { const parts = " +
        `${step.parenthesized ? "(eval)" : "eval"}\`a\${1}b\`; ` +
        'console.log("tagged", parts.join(), parts.raw.length, ' +
        "Array.isArray(parts), Object.isFrozen(parts)); } " +
        'catch (error) { console.log("tagged", error.name); }'
      );
    case "with-call":
      return (
        `with ({}) { try { console.log("with-call", eval(${step.value})); ` +
        '} catch (error) { console.log("with-call", error.name); } }'
      );
    case "with-read":
      return (
        `with (${step.own == null ? "{}" : `{ eval: ${step.own} }`}) ` +
        `{ try { console.log("with", ${shown}); } ` +
        'catch (error) { console.log("with", error.name); } }'
      );
    case "write":
      return `eval = ${step.value};`;
  }
}

function evalSourceFor(testCase: EvalCase): string {
  return [
    "const intrinsic = eval;",
    "/** @param {number} value */",
    "function hinted(value) { return value + 1; }",
    // One cached read site. The runtime caches no property of an object
    // in dictionary mode, and a successful delete leaves the global object
    // in that mode for the rest of the run. The first call therefore runs
    // before any generated step can delete: its first iteration misses
    // the cold cache and the others hit the global object's shape. After
    // the final delete and recreation, every iteration misses and the
    // compiled generic read answers.
    "function reread() {",
    "  let same = 0;",
    "  for (let index = 0; index < 3; index = index + 1) {",
    "    if (eval === intrinsic) same = same + 1;",
    "  }",
    "  return same;",
    "}",
    'console.log("reread", reread());',
    ...testCase.steps.map(evalStepSource),
    "eval = intrinsic;",
    'console.log("reread", reread());',
    "delete eval;",
    "eval = intrinsic;",
    'console.log("reread", reread());',
    'console.log("guard", hinted(1), hinted("miss"));',
    "const survivor = { value: intrinsic };",
    "for (let index = 0; index < 16; index = index + 1) {",
    '  Object.defineProperty({}, "item", { value: { index } });',
    "}",
    'console.log("collection", survivor.value === intrinsic);',
    "",
  ].join("\n");
}

/**
 * The independent model of the global `eval` property: its value, or
 * its absence after `delete`, and whether a sloppy write recreated it as
 * an ordinary enumerable property.
 */
function evalExpected(testCase: EvalCase): string {
  let value: "intrinsic" | "missing" | number = "intrinsic";
  let enumerable = false;
  const shown = (): string =>
    value === "missing" ? "ReferenceError" : `${value}`;
  const lines: string[] = ["reread 3"];
  for (const step of testCase.steps) {
    switch (step.kind) {
      case "call":
        lines.push(
          `call ${
            value === "intrinsic"
              ? step.value
              : value === "missing"
                ? "ReferenceError"
                : "TypeError"
          }`,
        );
        break;
      case "construct":
        lines.push(
          `construct ${value === "missing" ? "ReferenceError" : "TypeError"}`,
        );
        break;
      case "delete":
        lines.push("delete true");
        value = "missing";
        break;
      case "descriptor":
        lines.push(
          `descriptor ${
            value === "missing" ? "missing" : `true,${enumerable},true`
          }`,
        );
        break;
      case "hint":
        lines.push(
          `hint ${
            value === "intrinsic"
              ? 2
              : value === "missing"
                ? "ReferenceError"
                : NaN
          }`,
        );
        break;
      case "read":
        lines.push(
          `read ${
            value === "intrinsic"
              ? "function"
              : value === "missing"
                ? "undefined"
                : "number"
          } ${shown()}`,
        );
        break;
      case "restore":
      case "write":
        if (value === "missing") enumerable = true;
        value = step.kind === "restore" ? "intrinsic" : step.value;
        break;
      case "shadow":
        lines.push(`shadow ${step.value}`);
        break;
      case "strict-read":
        lines.push(`strict ${shown()}`);
        break;
      case "tagged":
        lines.push(
          `tagged ${
            value === "intrinsic"
              ? "a,b 2 true true"
              : value === "missing"
                ? "ReferenceError"
                : "TypeError"
          }`,
        );
        break;
      case "with-call":
        lines.push(
          `with-call ${
            value === "intrinsic"
              ? step.value
              : value === "missing"
                ? "ReferenceError"
                : "TypeError"
          }`,
        );
        break;
      case "with-read":
        lines.push(`with ${step.own ?? shown()}`);
        break;
    }
  }
  return [
    ...lines,
    "reread 3",
    "reread 3",
    "guard 2 miss1",
    "collection true",
    "",
  ].join("\n");
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory("oseo-global-record-");
  const sourcePath = `${directory}/case.ts`;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
    return [
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
  } finally {
    await host.remove(directory);
  }
}

test(
  "generated global value properties match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "restricted value properties preserve their descriptors",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = sourceFor(testCase);
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
            { source, sourceId: "generated-global-object-record.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /property-get generic/u);
          } else {
            assert.doesNotMatch(mir, /guard-shape/u);
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
                assert.ok(native.counters != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "enabled") {
                  assert.ok(native.counters.guardHits > 0);
                  assert.ok(native.counters.guardMisses > 0);
                  assert.ok(native.counters.genericAdditionCalls > 0);
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
          "the three restricted value names, bounded integer writes, " +
          "descriptor identity, non-strict and strict assignment, delete, " +
          "non-configurable redefinition, truthful and false numeric hints, " +
          "both specialization policies, and forced collection",
        numRuns: 12,
        profile: "M5 Global Environment Record value properties",
        seed: 0x6000_3d00,
        sizeLimit:
          "one standard global declaration, three mutation attempts, two " +
          "hinted additions, and sixteen bounded collection allocations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

/**
 * Compare one generated bare `eval` case with Node.js and Deno, then
 * compile it under both specialization policies and require the model's
 * exact observation with collection forced at every safepoint. The
 * enabled policy must report guard hits, guard misses, and compiled
 * generic additions; the disabled policy must report no guard at all.
 */
async function assertEvalNative(testCase: EvalCase): Promise<void> {
  const source = evalSourceFor(testCase);
  const expectedObservation = {
    exitStatus: 0,
    stderr: "",
    stdout: evalExpected(testCase),
  };
  assertMatchingObservations([
    expectedObservation,
    ...(await references(source)),
  ]);
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "generated-eval-identifier.ts" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const mir = printMir(compiled.mir);
    assert.match(mir, /constant "eval"/u);
    if (specialization === "enabled") {
      assert.match(mir, /guard-shape/u);
      assert.match(mir, /property-get generic/u);
    } else {
      assert.doesNotMatch(mir, /guard-(?:object|shape)/u);
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
          assert.ok(native.counters != null);
          assert.ok(native.counters.collections > 0);
          if (specialization === "enabled") {
            assert.ok(native.counters.guardHits > 0);
            assert.ok(native.counters.guardMisses > 0);
            assert.ok(native.counters.genericAdditionCalls > 0);
          } else {
            assert.equal(native.counters.guardHits, 0);
            assert.equal(native.counters.guardMisses, 0);
          }
        },
      );
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}

test(
  "a minimized eval case deleting the property first still hits a guard",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    // Shrunk counterexample of the extended suite's seed 1592590339, path
    // 1:0:0, in this domain. Its output matched the model, but
    // the enabled policy reported no guard hit: the delete left the
    // global object in dictionary mode before any cached read ran.
    await assertEvalNative({ steps: [{ kind: "delete" }] });
  },
);

test(
  "generated bare eval identifier references match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "the bare eval identifier observes the global eval property",
      fc.asyncProperty(evalCaseArbitrary, async (testCase) => {
        await assertEvalNative(testCase);
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
          "one to eight reads, typeof, indirect and with-fallback calls with " +
          "non-String arguments, plain and parenthesized tagged template " +
          "calls, constructions, sloppy writes, restores, " +
          "deletes, descriptors, parameter shadows, own-property with " +
          "objects, and strict reads of the global eval binding, plus " +
          "truthful and false numeric hints on eval.length, both " +
          "specialization policies, and forced collection",
        numRuns: 12,
        profile: "M5 bare eval identifier references",
        seed: 0x6000_3d01,
        sizeLimit:
          "eight eval statements, integers 0 through 100, two hinted " +
          "additions, and sixteen bounded collection allocations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

/**
 * How one environment object answers the `@@unscopables` Get that
 * HasBinding performs after a successful HasProperty. The two getters are
 * observable and log; the data forms are not.
 */
type UnscopablesKind =
  | "absent"
  | "blocking"
  | "getter-deletes"
  | "getter-throws"
  | "non-object"
  | "nonblocking";

/**
 * One object in a `with` chain. A plain object owns `x` only when
 * `present`, and its HasProperty and Get are unobservable. A Proxy logs
 * every `has` and `get` for `x` and answers its two `has` calls for `x`
 * from the script, so HasBinding and GetBindingValue can disagree.
 */
type ObjectEnvironment =
  | {
      readonly kind: "plain";
      readonly present: boolean;
      readonly unscopables: UnscopablesKind;
    }
  | {
      readonly first: boolean;
      readonly kind: "proxy";
      readonly second: boolean | "throw";
      readonly unscopables: UnscopablesKind;
    };

/**
 * One reference to `x` through a chain of object environments, innermost
 * first, behind either a lexical `x` parameter or no binding at all. A
 * strict lookup sits in a nested strict function inside the sloppy
 * `with` body, so only the reference's [[Strict]] changes.
 */
interface ObjectEnvironmentLookup {
  readonly chain: readonly ObjectEnvironment[];
  readonly form: "call" | "typeof" | "value";
  readonly outer: "lexical" | "unresolvable";
  readonly strict: boolean;
}

interface ObjectEnvironmentCase {
  readonly lookups: readonly ObjectEnvironmentLookup[];
}

// Every enumeration lists its shrink target first, so a counterexample
// shrinks toward a sloppy value read of one present plain object.
const unscopablesArbitrary: fc.Arbitrary<UnscopablesKind> = fc.constantFrom(
  "absent",
  "non-object",
  "blocking",
  "nonblocking",
  "getter-deletes",
  "getter-throws",
);

const objectEnvironmentArbitrary: fc.Arbitrary<ObjectEnvironment> = fc.oneof(
  fc.record({
    kind: fc.constant("plain" as const),
    present: fc.constantFrom(true, false),
    unscopables: unscopablesArbitrary,
  }),
  fc.record({
    first: fc.constantFrom(true, false),
    kind: fc.constant("proxy" as const),
    second: fc.constantFrom<boolean | "throw">(true, false, "throw"),
    unscopables: unscopablesArbitrary,
  }),
);

const objectEnvironmentCaseArbitrary: fc.Arbitrary<ObjectEnvironmentCase> =
  fc.record({
    lookups: fc.array(
      fc.record({
        chain: fc.array(objectEnvironmentArbitrary, {
          maxLength: 3,
          minLength: 1,
        }),
        form: fc.constantFrom("value" as const, "typeof", "call"),
        outer: fc.constantFrom("lexical" as const, "unresolvable"),
        strict: fc.boolean(),
      }),
      { maxLength: 4, minLength: 1 },
    ),
  });

/**
 * The program shared by every generated lookup. `environment` builds one
 * chain object whose `x` is a strict function naming its owner, so a call
 * reports which object became `this`; `show` turns a completion into the
 * printed outcome. No helper name exists on Object.prototype, and Proxy
 * traps answer `false` for every other name, so resolving a helper
 * through the chain consumes no scripted answer and logs nothing.
 */
const objectEnvironmentPrelude = `var lines = [];
var log = [];
function show(f) {
  try {
    var value = f();
    return typeof value === "function" ? value.marker : String(value);
  } catch (error) {
    return error.constructor.name;
  }
}
function args() {
  log.push("args");
  return 0;
}
function environment(index, proxy, present, first, second, unscopables) {
  var target = {};
  var object;
  var binding = function () {
    "use strict";
    if (this === undefined) return "this-undefined";
    return this === object ? "this-env" + index : "this-other";
  };
  binding.marker = "env" + index;
  if (proxy || present) target.x = binding;
  if (unscopables === "non-object") target[Symbol.unscopables] = 1;
  if (unscopables === "blocking") target[Symbol.unscopables] = { x: true };
  if (unscopables === "nonblocking") target[Symbol.unscopables] = { x: 0 };
  if (unscopables === "getter-deletes" || unscopables === "getter-throws") {
    Object.defineProperty(target, Symbol.unscopables, {
      configurable: true,
      get: function () {
        log.push("u" + index);
        if (unscopables === "getter-throws") throw new TypeError("u");
        delete target.x;
        return undefined;
      },
    });
  }
  if (!proxy) {
    object = target;
    return object;
  }
  var answers = [first, second];
  object = new Proxy(target, {
    has: function (t, k) {
      if (k !== "x") return false;
      log.push("h" + index);
      var answer = answers.length > 0 ? answers.shift() : Reflect.has(t, k);
      if (answer === "throw") throw new RangeError("has");
      return answer;
    },
    get: function (t, k, r) {
      if (k === "x") log.push("g" + index);
      return Reflect.get(t, k, r);
    },
  });
  return object;
}
var outer = function () {
  "use strict";
  return this === undefined ? "this-undefined" : "this-other";
};
outer.marker = "outer";
for (var index = 0; index < 16; index = index + 1) {
  Object.defineProperty({}, "item", { value: { index: index } });
}
`;

function objectEnvironmentSourceFor(testCase: ObjectEnvironmentCase): string {
  const steps = testCase.lookups.map((lookup, step) => {
    const use = { call: "x(args())", typeof: "typeof x", value: "x" }[
      lookup.form
    ];
    const read = `show(function () { return ${use}; })`;
    const reference = lookup.strict
      ? `(function () {\n"use strict";\nreturn ${read};\n})()`
      : read;
    const objects = lookup.chain.map((environment, index) => {
      const answers =
        environment.kind === "proxy"
          ? `${environment.first}, ${JSON.stringify(environment.second)}`
          : "false, false";
      return (
        `var e${index} = environment(${index}, ` +
        `${environment.kind === "proxy"}, ` +
        `${environment.kind === "plain" && environment.present}, ` +
        `${answers}, ${JSON.stringify(environment.unscopables)});`
      );
    });
    // The innermost object is chain[0], so it is the last `with` opened.
    const opened = lookup.chain
      .map((_, index) => `with (e${index}) {`)
      .toReversed()
      .join(" ");
    const closed = lookup.chain.map(() => "}").join(" ");
    const parameter = lookup.outer === "lexical" ? "x" : "";
    const argument = lookup.outer === "lexical" ? "outer" : "";
    return (
      "log = [];\n" +
      `var r${step} = (function (${parameter}) {\n` +
      `${objects.join("\n")}\nvar r;\n` +
      `${opened}\nr = ${reference};\n${closed}\n` +
      `return r;\n})(${argument});\n` +
      `lines.push("lookup${step} " + r${step} + " [" + log + "]");\n`
    );
  });
  return (
    objectEnvironmentPrelude +
    steps.join("") +
    "for (var i = 0; i < lines.length; i = i + 1) console.log(lines[i]);\n"
  );
}

/**
 * The printed line of one lookup under ECMA-262 2025: HasBinding
 * (9.1.1.2.1) over the chain, GetBindingValue (9.1.1.2.6) on the selected
 * object, GetValue (6.2.5.5), `typeof` (13.5.3.1), and EvaluateCall
 * (13.3.6.1-2). It models the objects symbolically, never through an
 * engine's `with`, and logs only what the program can observe: Proxy
 * traps for `x`, the `@@unscopables` getters, and argument evaluation.
 */
function objectEnvironmentLine(
  lookup: ObjectEnvironmentLookup,
  step: number,
): string {
  const log: string[] = [];
  const present = lookup.chain.map(
    (environment) => environment.kind === "proxy" || environment.present,
  );
  const answers = lookup.chain.map((environment) =>
    environment.kind === "proxy" ? [environment.first, environment.second] : [],
  );
  const hasProperty = (index: number): boolean => {
    const environment = lookup.chain[index]!;
    if (environment.kind === "plain") return present[index]!;
    log.push(`h${index}`);
    const answer = answers[index]!.shift() ?? present[index]!;
    if (answer === "throw") throw new Error("RangeError");
    return answer;
  };
  const blocked = (index: number): boolean => {
    switch (lookup.chain[index]!.unscopables) {
      case "blocking":
        return true;
      case "getter-deletes":
        log.push(`u${index}`);
        present[index] = false;
        return false;
      case "getter-throws":
        log.push(`u${index}`);
        throw new Error("TypeError");
      default:
        return false;
    }
  };
  const get = (index: number): string | undefined => {
    if (lookup.chain[index]!.kind === "proxy") log.push(`g${index}`);
    return present[index]! ? `env${index}` : undefined;
  };
  const complete = (value: string | undefined, receiver: string): string => {
    if (lookup.form === "typeof") {
      return value === undefined ? "undefined" : "function";
    }
    if (lookup.form === "value") return value ?? "undefined";
    log.push("args");
    if (value === undefined) throw new Error("TypeError");
    return `this-${receiver}`;
  };
  let outcome: string;
  try {
    let selected = -1;
    for (let index = 0; index < lookup.chain.length; index += 1) {
      if (hasProperty(index) && !blocked(index)) {
        selected = index;
        break;
      }
    }
    if (selected >= 0) {
      let value: string | undefined;
      if (hasProperty(selected)) value = get(selected);
      else if (lookup.strict) throw new Error("ReferenceError");
      outcome = complete(value, `env${selected}`);
    } else if (lookup.outer === "lexical") {
      outcome = complete("outer", "undefined");
    } else if (lookup.form === "typeof") {
      outcome = "undefined";
    } else {
      throw new Error("ReferenceError");
    }
  } catch (error) {
    outcome = error instanceof Error ? error.message : String(error);
  }
  return `lookup${step} ${outcome} [${log.join(",")}]`;
}

function objectEnvironmentExpected(testCase: ObjectEnvironmentCase): string {
  return (
    testCase.lookups
      .map((lookup, step) => objectEnvironmentLine(lookup, step))
      .join("\n") + "\n"
  );
}

test(
  "generated object environment reads match the GetBindingValue model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "a selected object environment tests its binding again before Get",
      fc.asyncProperty(objectEnvironmentCaseArbitrary, async (testCase) => {
        const source = objectEnvironmentSourceFor(testCase);
        const expectedText = objectEnvironmentExpected(testCase);
        // V8 and JSC both skip GetBindingValue's HasProperty, so the
        // model alone is the oracle; no reference engine runs here.
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-object-environment.js" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, [], source);
          assert.ok(compiled.mir != null);
          if (specialization === "disabled") {
            assert.doesNotMatch(
              printMir(compiled.mir),
              /guard-(?:object|shape)/u,
            );
          }
          // The failure names the policy, source, model, and native
          // output above withNativeFixture's own wrapper, where the
          // property report still prints a nested message in full.
          let observed: string | undefined;
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
                observed = native.stdout;
                assertMatchingObservations([
                  { exitStatus: 0, stderr: "", stdout: expectedText },
                  native,
                ]);
                assert.ok(native.counters != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "disabled") {
                  assert.equal(native.counters.guardHits, 0);
                  assert.equal(native.counters.guardMisses, 0);
                }
              },
            );
          } catch (error) {
            throw new Error(
              `${specialization} policy\nsource:\n${source}\n` +
                `model:\n${expectedText}` +
                (observed == null ? "" : `native:\n${observed}`),
              { cause: error },
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
          "one to four value, typeof, and call references to x, sloppy or " +
          "in a nested strict function, behind a lexical or unresolvable " +
          "outer binding, through one to three plain or Proxy objects " +
          "whose has answers flip or throw and whose @@unscopables is " +
          "absent, a non-object, blocking, non-blocking, a deleting " +
          "getter, or a throwing getter, both specialization policies, " +
          "and forced collection",
        numRuns: 12,
        profile: "M5 Object Environment Record GetBindingValue",
        seed: 0x6000_3d02,
        sizeLimit:
          "four lookups over at most three environment objects each, one " +
          "nested strict function per strict lookup, and sixteen bounded " +
          "collection allocations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
