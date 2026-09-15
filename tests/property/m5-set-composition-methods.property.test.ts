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

type ValueToken =
  | "minus-zero"
  | "nan"
  | "object-a"
  | "object-b"
  | "one"
  | "text-a"
  | "text-b"
  | "two"
  | "zero";

type MethodName =
  | "difference"
  | "intersection"
  | "isDisjointFrom"
  | "isSubsetOf"
  | "isSupersetOf"
  | "symmetricDifference"
  | "union";

type OperandKind = "map" | "set" | "set-like";

/**
 * One call on the shared receiver. A `set-like` operand declares `size`
 * independently of its values and yields `values` from `keys` verbatim,
 * duplicates and both zero signs included, so the declared size alone
 * selects between the receiver-driven and keys-driven algorithm branches.
 */
interface CompositionOperation {
  readonly declaredSize: number;
  readonly kind: OperandKind;
  readonly method: MethodName;
  readonly values: readonly ValueToken[];
}

interface CompositionCase {
  readonly operations: readonly CompositionOperation[];
  readonly receiver: readonly ValueToken[];
}

const valueArbitrary = fc.constantFrom<ValueToken>(
  "minus-zero",
  "nan",
  "object-a",
  "object-b",
  "one",
  "text-a",
  "text-b",
  "two",
  "zero",
);

const methodArbitrary = fc.constantFrom<MethodName>(
  "union",
  "intersection",
  "difference",
  "symmetricDifference",
  "isSubsetOf",
  "isSupersetOf",
  "isDisjointFrom",
);

const operationArbitrary: fc.Arbitrary<CompositionOperation> = fc.record({
  declaredSize: fc.constantFrom(0, 1, 2, 2.5, 3, 5, 8, Infinity),
  kind: fc.constantFrom<OperandKind>("map", "set", "set-like"),
  method: methodArbitrary,
  values: fc.array(valueArbitrary, { maxLength: 6 }),
});

const caseArbitrary: fc.Arbitrary<CompositionCase> = fc.record({
  operations: fc.array(operationArbitrary, { maxLength: 4, minLength: 1 }),
  receiver: fc.array(valueArbitrary, { maxLength: 6 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function expression(token: ValueToken): string {
  switch (token) {
    case "minus-zero":
      return "-0";
    case "nan":
      return "NaN";
    case "object-a":
      return "objectA";
    case "object-b":
      return "objectB";
    case "one":
      return "1";
    case "text-a":
      return '"a"';
    case "text-b":
      return '"b"';
    case "two":
      return "2";
    case "zero":
      return "0";
  }
}

function sizeExpression(size: number): string {
  return Number.isFinite(size) ? String(size) : "Infinity";
}

function printOperand(operation: CompositionOperation): string {
  const values = `[${operation.values.map(expression).join(", ")}]`;
  if (operation.kind === "set") return `new Set(${values})`;
  if (operation.kind === "map") {
    return `new Map(${values}.map((value) => [value, "entry"]))`;
  }
  return `setLike(${values}, ${sizeExpression(operation.declaredSize)})`;
}

function printCase(testCase: CompositionCase): string {
  const operations = testCase.operations.map(
    (operation) => `log.length = 0;
console.log(
  "${operation.method}",
  show(receiver.${operation.method}(${printOperand(operation)})),
  log.join(" "),
);`,
  );
  return `
const objectA = {};
const objectB = {};
const log = [];
function label(value) {
  if (value !== value) return "nan";
  if (value === 0) return "zero";
  if (value === objectA) return "object-a";
  if (value === objectB) return "object-b";
  if (value === 1) return "one";
  if (value === 2) return "two";
  if (value === "a") return "text-a";
  return "text-b";
}
function show(value) {
  if (typeof value === "boolean") return String(value);
  const labels = [];
  for (const element of value) labels.push(label(element));
  return Object.getPrototypeOf(value) === Set.prototype
    ? "{" + labels.join(",") + "}"
    : "not-a-set";
}
function same(left, right) {
  return left === right || (left !== left && right !== right);
}
function setLike(values, size) {
  return {
    size,
    has(value) {
      log.push("has:" + label(value));
      return values.some((candidate) => same(candidate, value));
    },
    keys() {
      log.push("keys");
      let index = 0;
      return {
        next() {
          log.push("next");
          index = index + 1;
          return index > values.length
            ? { done: true, value: undefined }
            : { done: false, value: values[index - 1] };
        },
        return() {
          log.push("return");
          return {};
        },
      };
    },
  };
}
const receiver = new Set([${testCase.receiver.map(expression).join(", ")}]);
console.log("receiver", receiver.size);
${operations.join("\n")}
console.log("receiver after", show(receiver));
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
`;
}

/*
 * The independent oracle. It follows the ECMA-262 Set method algorithms
 * over canonical tokens, with SameValueZero reduced to token equality
 * after mapping minus-zero to zero, and records the observable has, keys,
 * next, and return calls a logging set-like operand makes. It never uses a
 * JavaScript Set.
 */
function canonical(token: ValueToken): ValueToken {
  return token === "minus-zero" ? "zero" : token;
}

function unique(tokens: readonly ValueToken[]): ValueToken[] {
  const result: ValueToken[] = [];
  for (const token of tokens) {
    if (!result.includes(canonical(token))) result.push(canonical(token));
  }
  return result;
}

interface OperandModel {
  readonly has: (token: ValueToken, log: string[]) => boolean;
  readonly keys: (log: string[]) => readonly ValueToken[];
  readonly size: number;
}

function operandModel(operation: CompositionOperation): OperandModel {
  const members = unique(operation.values);
  if (operation.kind !== "set-like") {
    return {
      has: (token) => members.includes(canonical(token)),
      keys: () => members,
      size: members.length,
    };
  }
  return {
    has: (token, log) => {
      log.push(`has:${canonical(token)}`);
      return members.includes(canonical(token));
    },
    keys: (log) => {
      log.push("keys");
      return operation.values;
    },
    size: Math.trunc(operation.declaredSize),
  };
}

/** Walks the keys model, logging each next call and an early close. */
function stepKeys(
  operation: CompositionOperation,
  keys: readonly ValueToken[],
  log: string[],
  visit: (token: ValueToken) => boolean,
): boolean {
  const logged = operation.kind === "set-like";
  for (const token of keys) {
    if (logged) log.push("next");
    if (!visit(token)) {
      if (logged) log.push("return");
      return false;
    }
  }
  if (logged) log.push("next");
  return true;
}

function answer(value: boolean): string {
  return String(value);
}

function showMembers(tokens: readonly ValueToken[]): string {
  return `{${tokens.join(",")}}`;
}

function modelOperation(
  receiver: readonly ValueToken[],
  operation: CompositionOperation,
  log: string[],
): string {
  const other = operandModel(operation);
  const thisSize = receiver.length;
  const inReceiver = (token: ValueToken): boolean =>
    receiver.includes(canonical(token));
  switch (operation.method) {
    case "union": {
      const result = [...receiver];
      stepKeys(operation, other.keys(log), log, (token) => {
        if (!result.includes(canonical(token))) result.push(canonical(token));
        return true;
      });
      return showMembers(result);
    }
    case "intersection": {
      const result: ValueToken[] = [];
      if (thisSize <= other.size) {
        for (const token of receiver) {
          if (other.has(token, log) && !result.includes(token)) {
            result.push(token);
          }
        }
        return showMembers(result);
      }
      stepKeys(operation, other.keys(log), log, (token) => {
        if (inReceiver(token) && !result.includes(canonical(token))) {
          result.push(canonical(token));
        }
        return true;
      });
      return showMembers(result);
    }
    case "difference": {
      let result = [...receiver];
      if (thisSize <= other.size) {
        return showMembers(receiver.filter((token) => !other.has(token, log)));
      }
      stepKeys(operation, other.keys(log), log, (token) => {
        result = result.filter((member) => member !== canonical(token));
        return true;
      });
      return showMembers(result);
    }
    case "symmetricDifference": {
      let result = [...receiver];
      stepKeys(operation, other.keys(log), log, (token) => {
        const value = canonical(token);
        const already = result.includes(value);
        if (inReceiver(value)) {
          if (already) result = result.filter((member) => member !== value);
        } else if (!already) {
          result.push(value);
        }
        return true;
      });
      return showMembers(result);
    }
    case "isSubsetOf": {
      if (thisSize > other.size) return answer(false);
      return answer(receiver.every((token) => other.has(token, log)));
    }
    case "isSupersetOf": {
      if (thisSize < other.size) return answer(false);
      return answer(stepKeys(operation, other.keys(log), log, inReceiver));
    }
    case "isDisjointFrom": {
      if (thisSize <= other.size) {
        return answer(!receiver.some((token) => other.has(token, log)));
      }
      return answer(
        stepKeys(
          operation,
          other.keys(log),
          log,
          (token) => !inReceiver(token),
        ),
      );
    }
  }
}

function expected(testCase: CompositionCase): string {
  const receiver = unique(testCase.receiver);
  const lines = [`receiver ${receiver.length}`];
  for (const operation of testCase.operations) {
    const log: string[] = [];
    const result = modelOperation(receiver, operation, log);
    lines.push(`${operation.method} ${result} ${log.join(" ")}`);
  }
  lines.push(`receiver after ${showMembers(receiver)}`, "hint 5 23", "");
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
    "oseo-set-composition-property-",
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
  "generated Set composition observations match the specification model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Set composition methods agree with the GetSetRecord algorithms",
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
            { source, sourceId: "generated-m5-set-composition.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
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
                  assert.ok(native.counters.guardHits > 0);
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
          "a receiver Set of zero to six values drawn from bounded numbers, " +
          "both zero signs, NaN, strings, and two stable object identities, " +
          "followed by one to four composition calls whose operand is a " +
          "Set, a Map, or a logging set-like object with zero to six keys " +
          "and a declared size of 0, 1, 2, 2.5, 3, 5, 8, or Infinity, plus " +
          "truthful and false number hints",
        numRuns: 12,
        profile: "M5 Set composition methods",
        seed: 0x6000_7200,
        sizeLimit:
          "at most six receiver values, four calls, and six operand keys " +
          "over nine reviewed value tokens and two object identities",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
