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

/*
 * Map keys cover SameValueZero's corners: both zeroes, NaN, a string and
 * a number that print alike, two objects, and an unregistered symbol.
 * WeakMap keys are three objects and two unregistered symbols; index 5
 * is the number 1, which CanBeHeldWeakly rejects.
 */
const mapKeySources = [
  "0",
  "-0",
  "NaN",
  '"1"',
  "1",
  "objects[0]",
  "objects[1]",
  "symbols[0]",
] as const;
const mapKeyLabels = ["0", "0", "NaN", "s1", "1", "o0", "o1", "y0"] as const;
const weakKeySources = [
  "objects[0]",
  "objects[1]",
  "objects[2]",
  "symbols[0]",
  "symbols[1]",
  "1",
] as const;
const weakKeyLabels = ["o0", "o1", "o2", "y0", "y1", "bad"] as const;

/** What a getOrInsertComputed callback does before it returns. */
type Effect =
  | "clear"
  | "delete-other"
  | "delete-self"
  | "none"
  | "set-self"
  | "throw";

type Operation =
  | {
      readonly kind: "computed";
      readonly key: number;
      readonly other: number;
      readonly effect: Effect;
    }
  | { readonly kind: "delete"; readonly key: number }
  | { readonly kind: "insert"; readonly key: number }
  | { readonly kind: "set"; readonly key: number };

interface UpsertCase {
  readonly map: readonly Operation[];
  readonly weak: readonly Operation[];
  readonly marker: number;
}

function operationArbitrary(keyCount: number): fc.Arbitrary<Operation> {
  const key = fc.integer({ max: keyCount - 1, min: 0 });
  return fc.oneof(
    {
      arbitrary: fc.record({ key, kind: fc.constant("insert" as const) }),
      weight: 3,
    },
    {
      arbitrary: fc.record({
        effect: fc.constantFrom<Effect>(
          "clear",
          "delete-other",
          "delete-self",
          "none",
          "set-self",
          "throw",
        ),
        key,
        kind: fc.constant("computed" as const),
        other: key,
      }),
      weight: 4,
    },
    {
      arbitrary: fc.record({ key, kind: fc.constant("set" as const) }),
      weight: 1,
    },
    {
      arbitrary: fc.record({ key, kind: fc.constant("delete" as const) }),
      weight: 1,
    },
  );
}

const caseArbitrary: fc.Arbitrary<UpsertCase> = fc.record({
  map: fc.array(operationArbitrary(mapKeySources.length), {
    maxLength: 12,
    minLength: 1,
  }),
  marker: fc.integer({ max: 1_000, min: 1 }),
  weak: fc.array(operationArbitrary(weakKeySources.length), {
    maxLength: 10,
    minLength: 1,
  }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printOperation(
  operation: Operation,
  index: number,
  target: "map" | "weak",
): string {
  const keys = target === "map" ? mapKeySources : weakKeySources;
  const key = keys[operation.key]!;
  const value = `"${target}${index}"`;
  switch (operation.kind) {
    case "insert":
      return `attempt(() => ${target}.getOrInsert(${key}, ${value}));`;
    case "set":
      return `attempt(() => (${target}.set(${key}, ${value}), "set"));`;
    case "delete":
      return `attempt(() => String(${target}.delete(${key})));`;
    case "computed": {
      const other = keys[operation.other]!;
      const effect = {
        clear: target === "map" ? `${target}.clear();` : "",
        "delete-other": `${target}.delete(${other});`,
        "delete-self": `${target}.delete(key);`,
        none: "",
        "set-self": `${target}.set(key, "inner${index}");`,
        throw: `throw new RangeError("callback");`,
      }[operation.effect];
      return (
        `attempt(() => ${target}.getOrInsertComputed(${key}, (key) => {\n` +
        `  console.log("callback", label(key));\n` +
        `  ${effect}\n` +
        `  return ${value};\n` +
        `}));`
      );
    }
  }
}

function printCase(testCase: UpsertCase): string {
  const mapOperations = testCase.map
    .map((operation, index) => printOperation(operation, index, "map"))
    .join("\n");
  const weakOperations = testCase.weak
    .map((operation, index) => printOperation(operation, index, "weak"))
    .join("\n");
  return `
const objects = [{ id: "o0" }, { id: "o1" }, { id: "o2" }];
const symbols = [Symbol("y0"), Symbol("y1")];
function label(key) {
  if (typeof key === "object") return key.id;
  if (typeof key === "symbol") return key.description;
  if (typeof key === "string") return "s" + key;
  return Object.is(key, -0) ? "-0" : String(key);
}
function attempt(operation) {
  try {
    console.log("result", String(operation()));
  } catch (error) {
    console.log(
      "throws",
      error instanceof TypeError ? "type" : error instanceof RangeError
        ? "range"
        : "other",
    );
  }
}
const map = new Map();
${mapOperations}
console.log(
  "map",
  [...map].map(([key, value]) => label(key) + "=" + value).join(","),
);
const weak = new WeakMap();
${weakOperations}
let weakState = "";
for (const key of [...objects, ...symbols]) {
  weakState = weakState + label(key) + "=" + String(weak.get(key)) + ",";
}
console.log("weak", weakState);
let turn = 0;
while (turn < 2) {
  console.log("guard", map.getOrInsert("guard", ${testCase.marker}));
  if (turn === 0) Map.prototype.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log(
  "hint",
  hinted(${testCase.marker}, 1),
  hinted("${testCase.marker}", 1),
);
`;
}

/**
 * The independent model. Each key index maps to a canonical identity
 * string, so -0 and 0 share one entry and every NaN is the same key.
 * Insertion order is the order of a JavaScript array of entries, and
 * the upsert steps follow the edition text: an absent key runs the
 * callback once, then a record the callback created takes the computed
 * value, and otherwise a new record is appended.
 */
function expected(testCase: UpsertCase): string {
  const lines: string[] = [];
  const run = (
    operations: readonly Operation[],
    target: "map" | "weak",
  ): Map<string, string> => {
    const labels = target === "map" ? mapKeyLabels : weakKeyLabels;
    const entries = new Map<string, string>();
    for (const [index, operation] of operations.entries()) {
      const key = labels[operation.key]!;
      const value = `${target}${index}`;
      if (target === "weak" && key === "bad") {
        if (operation.kind === "delete") lines.push("result false");
        else lines.push("throws type");
        continue;
      }
      switch (operation.kind) {
        case "insert":
          if (!entries.has(key)) entries.set(key, value);
          lines.push(`result ${entries.get(key)}`);
          break;
        case "set":
          entries.set(key, value);
          lines.push("result set");
          break;
        case "delete":
          lines.push(`result ${entries.delete(key)}`);
          break;
        case "computed": {
          if (entries.has(key)) {
            lines.push(`result ${entries.get(key)}`);
            break;
          }
          lines.push(`callback ${key}`);
          const other = labels[operation.other]!;
          switch (operation.effect) {
            case "clear":
              if (target === "map") entries.clear();
              break;
            case "delete-other":
              if (other !== "bad") entries.delete(other);
              break;
            case "delete-self":
              entries.delete(key);
              break;
            case "set-self":
              entries.set(key, `inner${index}`);
              break;
            case "throw":
              lines.push("throws range");
              continue;
            case "none":
              break;
          }
          entries.set(key, value);
          lines.push(`result ${value}`);
          break;
        }
      }
    }
    return entries;
  };
  const map = run(testCase.map, "map");
  lines.push(
    `map ${[...map].map(([key, value]) => `${key}=${value}`).join(",")}`,
  );
  const weak = run(testCase.weak, "weak");
  lines.push(
    `weak ${["o0", "o1", "o2", "y0", "y1"]
      .map((key) => `${key}=${weak.get(key) ?? "undefined"},`)
      .join("")}`,
  );
  return [
    ...lines,
    `guard ${testCase.marker}`,
    `guard ${testCase.marker}`,
    `hint ${testCase.marker + 1} ${testCase.marker}1`,
    "",
  ].join("\n");
}

/*
 * The pinned Node.js lacks the upsert methods, so Deno is the single
 * reference host beside the model.
 */
async function reference(source: string): Promise<{
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const directory = await host.makeTemporaryDirectory("oseo-upsert-property-");
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
    const observation = await host.run({
      args: ["run", "--quiet", sourcePath],
      command: "deno",
      cwd: directory,
    });
    succeeded = true;
    return observation;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated Map and WeakMap upsert sequences match the edition model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "getOrInsert and getOrInsertComputed agree with the keyed model",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          await reference(source),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-es2026-upsert.ts" },
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
          "one to twelve Map operations over eight SameValueZero keys and " +
          "one to ten WeakMap operations over three objects, two " +
          "unregistered symbols, and one key CanBeHeldWeakly rejects, each " +
          "a getOrInsert, set, delete, or getOrInsertComputed whose " +
          "callback returns plainly, sets or deletes its own key, deletes " +
          "another key, clears the Map, or throws, plus one prototype " +
          "shape guard miss and one false number hint",
        numRuns: 12,
        profile: "ES2026 upsert",
        seed: 0x6000_9b00,
        sizeLimit:
          "at most twelve Map and ten WeakMap operations, one callback " +
          "per computed operation, and one prototype property write",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
