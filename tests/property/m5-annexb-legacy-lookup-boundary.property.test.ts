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

type Method = "__lookupGetter__" | "__lookupSetter__";
type Hint = "absent" | "false" | "truthful";

/** One prototype-chain level, listed from the outermost to the receiver. */
type Level = "empty" | "getter" | "method" | "noncallable";

/** A chain whose lookup may stop at a user level or reach the method. */
interface ShadowCase {
  readonly hint: Hint;
  readonly levels: readonly Level[];
  readonly method: Method;
  readonly root: "intrinsic" | "null" | "proxy";
  readonly value: number;
}

/** A chain of data-only levels over an intrinsic %Object.prototype%. */
interface BoundaryCase {
  readonly depth: number;
  readonly hint: Hint;
  readonly method: Method;
  readonly warm: number;
}

const methods: fc.Arbitrary<Method> = fc.constantFrom(
  "__lookupGetter__",
  "__lookupSetter__",
);
const hints: fc.Arbitrary<Hint> = fc.constantFrom(
  "absent",
  "false",
  "truthful",
);

/**
 * A chain of empty levels over the intrinsic prototype reaches the
 * legacy method itself, which finds no accessor named `k`.
 */
const shadowCases: fc.Arbitrary<ShadowCase> = fc.record({
  hint: hints,
  levels: fc.array(
    fc.constantFrom<Level>("empty", "getter", "method", "noncallable"),
    { minLength: 1, maxLength: 3 },
  ),
  method: methods,
  root: fc.constantFrom<ShadowCase["root"]>("intrinsic", "null", "proxy"),
  value: fc.integer({ min: -20, max: 20 }),
});
const boundaryCases: fc.Arbitrary<BoundaryCase> = fc.record({
  depth: fc.integer({ min: 0, max: 3 }),
  hint: hints,
  method: methods,
  warm: fc.integer({ min: 1, max: 2 }),
});
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function hintLine(hint: Hint): string {
  return hint === "absent"
    ? ""
    : `/** @param {${hint === "false" ? "number" : "object"}} value */`;
}

function shadowSource(input: ShadowCase): string {
  const root =
    input.root === "intrinsic"
      ? "Object.prototype"
      : input.root === "null"
        ? "null"
        : "new Proxy({}, { get(target, key, observed) { " +
          `return key === "${input.method}" ? function (k) { ` +
          'return "proxy " + k + " " + (this === receiver) + " " + ' +
          "(observed === receiver); } : undefined; } })";
  const levels = input.levels.map((level, index) => {
    // Definition, not assignment: an inherited getter-only accessor would
    // make an assignment a silent no-op.
    const descriptor =
      level === "method"
        ? "value: function (k) { " +
          `return "L${index} " + k + " " + (this === receiver); }`
        : level === "getter"
          ? "get() { return function (k) { " +
            `return "G${index} " + k + " " + (this === receiver); }; }`
          : `value: ${input.value + index}`;
    const define =
      level === "empty"
        ? ""
        : `Object.defineProperty(current, "${input.method}", ` +
          `{ ${descriptor}, configurable: true });`;
    return `current = Object.create(current);\n${define}`;
  });
  return `
${hintLine(input.hint)}
function read(value) { return value.${input.method}; }
function call(value, key) {
  try { return read(value).call(value, key); } catch (error) {
    return error instanceof TypeError ? "TypeError" : "other";
  }
}
let receiver;
let current = ${root};
${levels.join("\n")}
receiver = current;
const warm = { ${input.method}(k) { return "warm " + k; } };
console.log(call(warm, "w"));
console.log(call(receiver, "k"));
console.log(Object.prototype.hasOwnProperty.call(receiver, "${input.method}"));
`;
}

/**
 * Independent lookup model: the innermost non-empty level decides, and an
 * all-empty chain over the intrinsic calls the real method, which finds
 * no `k` and returns undefined.
 */
function shadowExpected(input: ShadowCase): string {
  let result =
    input.root === "proxy"
      ? "proxy k true true"
      : input.root === "intrinsic"
        ? "undefined"
        : "TypeError";
  for (const [index, level] of input.levels.entries()) {
    if (level === "method") result = `L${index} k true`;
    else if (level === "getter") result = `G${index} k true`;
    else if (level === "noncallable") result = "TypeError";
  }
  const own = input.levels.at(-1) !== "empty";
  return ["warm w", result, String(own), ""].join("\n");
}

/**
 * A chain of `depth` levels over an object that inherits from the
 * intrinsic and holds two accessor halves the program defines with the
 * matching legacy method. Every even level holds a data property, so the
 * first level's `other0` shadows the accessor of that name.
 */
function boundarySource(input: BoundaryCase): string {
  const half = input.method === "__lookupGetter__" ? "Getter" : "Setter";
  const warm = [
    `const first = { ${input.method}(k) { return "warm " + k; } };`,
    "console.log(read(first).call(first, 1));",
    `const second = Object.create({ ${input.method}(k) { ` +
      'return "inherited " + k; } });',
    "console.log(read(second).call(second, 2));",
  ].slice(0, input.warm * 2);
  const levels = Array.from(
    { length: input.depth },
    (_, index) =>
      "current = Object.create(current);" +
      // Definition, not assignment: the inherited accessor half would
      // turn an assignment into a setter call or a silent no-op.
      (index % 2 === 0
        ? ` Object.defineProperty(current, "other${index}", ` +
          `{ value: ${index} });`
        : ""),
  );
  return [
    "",
    hintLine(input.hint),
    `function read(value) { return value.${input.method}; }`,
    ...warm,
    "function half() { return 1; }",
    "let current = {};",
    `current.__define${half}__("k", half);`,
    `current.__define${half}__("other0", half);`,
    ...levels,
    'console.log("before");',
    'console.log(read(current).call(current, "k") === half);',
    'console.log(read(current).call(current, "other0") === half);',
    'console.log(read(current).call(current, "missing"));',
    'console.log("after");',
    "",
  ].join("\n");
}

/** Independent model of the boundary domain's output. */
function boundaryStdout(input: BoundaryCase): string {
  return [
    "warm 1",
    ...(input.warm > 1 ? ["inherited 2"] : []),
    "before",
    "true",
    // A first level's data property other0 shadows the accessor.
    String(input.depth === 0),
    "undefined",
    "after",
    "",
  ].join("\n");
}

/** Compiles one generated program and checks its specialization shape. */
function compiled(source: string, specialization: "disabled" | "enabled") {
  const output = compileSource(
    babelFrontend,
    { source, sourceId: "generated-lookup.js" },
    { observeSpecialization: true, specialization },
  );
  assert.deepEqual(output.diagnostics, []);
  assert.ok(output.mir != null);
  const mir = printMir(output.mir);
  if (specialization === "enabled") {
    assert.match(mir, /guard-shape/u);
    assert.match(mir, /property-get generic/u);
  } else {
    assert.doesNotMatch(mir, /guard-(?:object|shape)/u);
  }
  return output.mir;
}

// The title is the U6 shard-log key (docs/evidence/u6/linux-shards.py), so
// it keeps its pre-implementation wording.
test(
  "generated shadowed legacy lookup chains preserve the core lookup model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "user methods, getters, null roots, proxies, and the real method",
      fc.asyncProperty(shadowCases, async (input) => {
        const source = shadowSource(input);
        const oracle = {
          exitStatus: 0,
          stderr: "",
          stdout: shadowExpected(input),
        };
        const directory = await host.makeTemporaryDirectory("oseo-lookup-");
        try {
          const path = `${directory}/case.js`;
          await host.writeTextFile(path, source);
          assertMatchingObservations([
            oracle,
            await host.run({
              command: process.execPath,
              args: [path],
              cwd: directory,
            }),
            await host.run({
              command: "deno",
              args: ["run", "--quiet", path],
              cwd: directory,
            }),
          ]);
        } finally {
          await host.remove(directory);
        }
        for (const specialization of ["disabled", "enabled"] as const) {
          process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          try {
            await withNativeFixture(
              {
                backend: cBackend,
                host,
                input: compiled(source, specialization),
                operation: "execute",
                runtime: cRuntimeProvider,
                target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
                toolchain: nativeToolchain,
              },
              (native) => {
                assertMatchingObservations([oracle, native]);
                assert.ok((native.counters?.collections ?? 0) > 0);
                if (specialization === "enabled") {
                  assert.ok((native.counters?.guardMisses ?? 0) > 0);
                }
              },
            );
          } finally {
            delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          }
        }
      }),
      {
        context: [`target=${nativeTarget?.name ?? "unsupported"}`],
        domain: "annexb-legacy-lookup-shadowed-chains",
        numRuns: 12,
        profile: "Annex B legacy accessor lookups",
        seed: 0x6000_8800,
        sizeLimit: "one to three chain levels and three observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

// The title is the U6 shard-log key (docs/evidence/u6/linux-shards.py), so
// it keeps its pre-implementation wording.
test(
  "generated chains reaching the intrinsic report the owned rejection",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "a read over intrinsic Object.prototype finds the real method",
      fc.asyncProperty(boundaryCases, async (input) => {
        const source = boundarySource(input);
        const oracle = {
          exitStatus: 0,
          stderr: "",
          stdout: boundaryStdout(input),
        };
        const directory = await host.makeTemporaryDirectory("oseo-lookup-");
        try {
          const path = `${directory}/case.js`;
          await host.writeTextFile(path, source);
          assertMatchingObservations([
            oracle,
            await host.run({
              command: process.execPath,
              args: [path],
              cwd: directory,
            }),
            await host.run({
              command: "deno",
              args: ["run", "--quiet", path],
              cwd: directory,
            }),
          ]);
        } finally {
          await host.remove(directory);
        }
        for (const specialization of ["disabled", "enabled"] as const) {
          process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          try {
            await withNativeFixture(
              {
                backend: cBackend,
                host,
                input: compiled(source, specialization),
                operation: "execute",
                runtime: cRuntimeProvider,
                target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
                toolchain: nativeToolchain,
              },
              (native) => {
                assertMatchingObservations([oracle, native]);
                assert.ok((native.counters?.collections ?? 0) > 0);
                if (specialization === "enabled") {
                  assert.ok((native.counters?.guardMisses ?? 0) > 0);
                }
              },
            );
          } finally {
            delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          }
        }
      }),
      {
        context: [`target=${nativeTarget?.name ?? "unsupported"}`],
        domain: "annexb-legacy-lookup-intrinsic-boundary",
        numRuns: 8,
        profile: "Annex B legacy accessor lookups",
        seed: 0x6000_8801,
        sizeLimit:
          "one or two warm reads, up to three levels, and three lookups",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
