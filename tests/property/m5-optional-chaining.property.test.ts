/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
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

type BaseKind = "null" | "object" | "undefined";
type ChainKind =
  | "call"
  | "computed"
  | "grouped-method-call"
  | "member"
  | "member-call"
  | "optional-method-call"
  | "sequence";

interface OptionalChainCase {
  readonly argument: number;
  readonly baseKind: BaseKind;
  readonly chainKind: ChainKind;
  readonly nestedNullish: boolean;
  readonly value: number;
}

interface OptionalChainModel {
  readonly order: string;
  readonly result?: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<OptionalChainCase> = fc.record({
  argument: fc.integer({ max: 20, min: -20 }),
  baseKind: fc.constantFrom<BaseKind>("null", "object", "undefined"),
  chainKind: fc.constantFrom<ChainKind>(
    "call",
    "computed",
    "grouped-method-call",
    "member",
    "member-call",
    "optional-method-call",
    "sequence",
  ),
  nestedNullish: fc.boolean(),
  value: fc.integer({ max: 20, min: -20 }),
});

function nullishSource(kind: BaseKind): string {
  if (kind === "null") return "null";
  if (kind === "undefined") return "undefined";
  return "holder";
}

function expressionSource(testCase: OptionalChainCase): string {
  if (testCase.chainKind === "call") {
    const base =
      testCase.baseKind === "object"
        ? "callable"
        : nullishSource(testCase.baseKind);
    return `base(${base})?.(argument())`;
  }
  if (testCase.chainKind === "optional-method-call") {
    const method =
      testCase.baseKind === "object"
        ? "callable"
        : nullishSource(testCase.baseKind);
    return `base({ method: ${method} }).method?.(argument())`;
  }
  const base = nullishSource(testCase.baseKind);
  if (testCase.chainKind === "computed") {
    return `base(${base})?.[key()]`;
  }
  if (testCase.chainKind === "grouped-method-call") {
    return `(base(${base})?.method)?.(argument())`;
  }
  if (testCase.chainKind === "member") return `base(${base})?.value`;
  if (testCase.chainKind === "member-call") {
    return `base(${base})?.method(argument())`;
  }
  return `base(${base})?.nested?.[key()]`;
}

function expected(testCase: OptionalChainCase): OptionalChainModel {
  const baseNullish =
    testCase.baseKind === "null" || testCase.baseKind === "undefined";
  if (testCase.chainKind === "optional-method-call") {
    return baseNullish
      ? { order: "base " }
      : {
          order: "base argument call ",
          result: testCase.value + testCase.argument,
        };
  }
  if (baseNullish) return { order: "base " };
  if (testCase.chainKind === "computed") {
    return { order: "base key ", result: testCase.value };
  }
  if (testCase.chainKind === "member") {
    return { order: "base ", result: testCase.value };
  }
  if (
    testCase.chainKind === "call" ||
    testCase.chainKind === "grouped-method-call" ||
    testCase.chainKind === "member-call"
  ) {
    return {
      order: "base argument call ",
      result: testCase.value + testCase.argument,
    };
  }
  return testCase.nestedNullish
    ? { order: "base " }
    : { order: "base key ", result: testCase.value };
}

function printCase(testCase: OptionalChainCase): string {
  const nested = testCase.nestedNullish
    ? "null"
    : `{ value: ${testCase.value} }`;
  return `
let order = "";
const holder = {
  value: ${testCase.value},
  nested: ${nested},
  method(value) {
    order = order + "call ";
    return this.value + value;
  },
};
function callable(value) {
  order = order + "call ";
  return ${testCase.value} + value;
}
function base(value) {
  order = order + "base ";
  return value;
}
function key() {
  order = order + "key ";
  return "value";
}
function argument() {
  order = order + "argument ";
  return ${testCase.argument};
}
const result = ${expressionSource(testCase)};
console.log("result", result, "order", order);
`;
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
    "oseo-optional-chaining-property-",
  );
  const sourcePath = `${directory}/case.js`;
  let succeeded = false;
  try {
    await host.writeTextFile(sourcePath, source);
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

test("optional chaining model skips guarded keys and arguments", () => {
  assert.deepEqual(
    expected({
      argument: 2,
      baseKind: "null",
      chainKind: "member-call",
      nestedNullish: false,
      value: 3,
    }),
    { order: "base " },
  );
  assert.deepEqual(
    expected({
      argument: 2,
      baseKind: "object",
      chainKind: "sequence",
      nestedNullish: false,
      value: 3,
    }),
    { order: "base key ", result: 3 },
  );
});

test(
  "generated optional chains match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "optional chains preserve guards, receivers, and evaluation order",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const modeled = expected(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout:
            `result ${modeled.result ?? "undefined"} order ` +
            `${modeled.order}\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-optional-chaining.js" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          if (specialization === "enabled") {
            process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          }
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
              (native) =>
                assertMatchingObservations([expectedObservation, native]),
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
          "optional member, computed, call, method call, and multi-step " +
          "chains over null, undefined, and objects with guarded key and " +
          "argument effects",
        numRuns: 12,
        profile: "M5 optional chaining",
        seed: 0x6000_2400,
        sizeLimit: "one optional chain with bounded values and effects",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

type WithSelection = "blocked" | "inherited" | "miss" | "own";
type WithCalleeKind = "function" | "null" | "number" | "undefined";
type WithVanish = "delete" | "none" | "throw";

/**
 * One optional call `f?.(argument())` outside tail position whose callee
 * resolves through a traced `with` Proxy. `selection` fixes what the
 * Proxy's target holds: an own or inherited `f`, an own `f` that
 * `@@unscopables` blocks, or none. A miss or a block reaches an optional
 * outer `with` object, then a lexical or global `f`. `vanish` answers
 * GetBindingValue's second `has` on a selected Proxy as present, missing,
 * or abrupt. A strict caller is a strict function nested in the body.
 */
interface WithOptionalCallCase {
  readonly argument: number;
  readonly callee: WithCalleeKind;
  readonly fallback: "global" | "lexical";
  readonly outer: boolean;
  readonly selection: WithSelection;
  readonly strict: boolean;
  readonly vanish: WithVanish;
}

const withCallArbitrary: fc.Arbitrary<WithOptionalCallCase> = fc.record({
  argument: fc.integer({ max: 20, min: -20 }),
  callee: fc.constantFrom<WithCalleeKind>(
    "function",
    "null",
    "number",
    "undefined",
  ),
  fallback: fc.constantFrom("global" as const, "lexical" as const),
  outer: fc.boolean(),
  selection: fc.constantFrom<WithSelection>(
    "blocked",
    "inherited",
    "miss",
    "own",
  ),
  strict: fc.boolean(),
  vanish: fc.constantFrom<WithVanish>("delete", "none", "throw"),
});

function calleeSource(kind: WithCalleeKind): string {
  if (kind === "function") return "callee";
  if (kind === "number") return "1";
  return kind;
}

function innerTargetSource(testCase: WithOptionalCallCase): string {
  const f = calleeSource(testCase.callee);
  if (testCase.selection === "own") return `{ f: ${f} }`;
  if (testCase.selection === "inherited") return `Object.create({ f: ${f} })`;
  if (testCase.selection === "blocked") {
    return `{ f: ${f}, [Symbol.unscopables]: { f: true } }`;
  }
  return "{}";
}

function printWithCallCase(testCase: WithOptionalCallCase): string {
  const call = testCase.strict
    ? '(function () {\n      "use strict";\n' +
      "      var r = f?.(argument());\n      return r;\n    })()"
    : "f?.(argument())";
  const body = `with (inner) {\n    result = ${call};\n  }`;
  const wrapped = testCase.outer ? `with (outer) {\n  ${body}\n  }` : body;
  const lexical = testCase.fallback === "lexical";
  const binding = `var f = ${calleeSource(testCase.callee)};`;
  return `
var log = [];
var answers = ["first", ${JSON.stringify(testCase.vanish)}];
function callee(value) {
  "use strict";
  log.push("call");
  return [this, value];
}
function argument() {
  log.push("argument");
  return ${testCase.argument};
}
var outer = { f: ${calleeSource(testCase.callee)} };
var inner = new Proxy(${innerTargetSource(testCase)}, {
  has(target, key) {
    if (key !== "f") return false;
    var answer = answers.shift();
    log.push("has:" + answer);
    if (answer === "throw") throw new RangeError("has");
    if (answer === "delete") return false;
    return Reflect.has(target, key);
  },
  get(target, key, receiver) {
    if (key === "f" || key === Symbol.unscopables) {
      log.push("get:" + String(key));
    }
    return Reflect.get(target, key, receiver);
  },
});
function name(value) {
  if (value === inner) return "inner";
  if (value === outer) return "outer";
  if (value === undefined) return "undefined";
  return "other";
}
${lexical ? "" : binding}
function run() {
  ${lexical ? binding : ""}
  var result;
  try {
  ${wrapped}
  } catch (error) {
    return error.constructor.name;
  }
  return result === undefined
    ? "undefined"
    : name(result[0]) + " " + result[1];
}
var shown = run();
console.log(log.join(" "));
console.log("result", shown);
`;
}

/**
 * ECMA-262 2025 ResolveBinding, GetBindingValue, and the optional call's
 * EvaluateCall for the generated case, written independently of the
 * compiler. An Object Environment Record's HasBinding asks `has`, then
 * reads `@@unscopables`; GetBindingValue asks `has` again before Get. The
 * call's `this` is WithBaseObject: the selected object, or `undefined`
 * for a declarative or global binding.
 */
function expectedWithCall(testCase: WithOptionalCallCase): string {
  const log: string[] = ["has:first"];
  const finish = (result: string): string =>
    `${log.join(" ")}\nresult ${result}\n`;
  let receiver = "undefined";
  let value: WithCalleeKind = testCase.callee;
  const present = testCase.selection !== "miss";
  if (present) log.push("get:Symbol(Symbol.unscopables)");
  if (present && testCase.selection !== "blocked") {
    log.push(`has:${testCase.vanish}`);
    if (testCase.vanish === "throw") return finish("RangeError");
    if (testCase.vanish === "delete") {
      if (testCase.strict) return finish("ReferenceError");
      value = "undefined";
    } else {
      log.push("get:f");
    }
    receiver = "inner";
  } else if (testCase.outer) {
    receiver = "outer";
  }
  if (value === "null" || value === "undefined") return finish("undefined");
  log.push("argument");
  if (value === "number") return finish("TypeError");
  log.push("call");
  return finish(`${receiver} ${testCase.argument}`);
}

test("with optional call model keeps WithBaseObject as this", () => {
  const base = {
    argument: 2,
    callee: "function",
    fallback: "lexical",
    outer: true,
    strict: false,
    vanish: "none",
  } as const;
  assert.equal(
    expectedWithCall({ ...base, selection: "inherited" }),
    "has:first get:Symbol(Symbol.unscopables) has:none get:f argument " +
      "call\nresult inner 2\n",
  );
  assert.equal(
    expectedWithCall({ ...base, selection: "blocked" }),
    "has:first get:Symbol(Symbol.unscopables) argument call\n" +
      "result outer 2\n",
  );
  assert.equal(
    expectedWithCall({ ...base, outer: false, selection: "miss" }),
    "has:first argument call\nresult undefined 2\n",
  );
  assert.equal(
    expectedWithCall({ ...base, selection: "own", vanish: "delete" }),
    "has:first get:Symbol(Symbol.unscopables) has:delete\n" +
      "result undefined\n",
  );
  assert.equal(
    expectedWithCall({
      ...base,
      selection: "own",
      strict: true,
      vanish: "delete",
    }),
    "has:first get:Symbol(Symbol.unscopables) has:delete\n" +
      "result ReferenceError\n",
  );
});

test(
  "generated with optional calls match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "optional calls through with keep WithBaseObject as their receiver",
      fc.asyncProperty(withCallArbitrary, async (testCase) => {
        const source = printWithCallCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expectedWithCall(testCase),
        };
        // V8 skips GetBindingValue's second `has`, so the reference
        // engines cannot observe this trace; native runs meet the model.
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-with-optional-call.js" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
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
                if (specialization === "disabled") {
                  assert.equal(native.counters.guardHits, 0);
                  assert.equal(native.counters.guardMisses, 0);
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
          "one non-tail optional call f?.(argument()), sloppy or from a " +
          "strict nested function, whose callee resolves through a traced " +
          "with Proxy holding an own, inherited, unscopables-blocked, or " +
          "no f, an optional outer with object, and a lexical or global " +
          "fallback, with a function, null, undefined, or non-callable " +
          "callee and a present, missing, or abrupt second has",
        numRuns: 10,
        profile: "M5 optional chaining",
        seed: 0x6000_2401,
        sizeLimit: "one optional call, two with objects, and one integer",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
