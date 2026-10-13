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
import { runNativeCli } from "../native-cli.ts";
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type Method = "__lookupGetter__" | "__lookupSetter__";
type Hint = "absent" | "false" | "truthful";

/** One prototype-chain level, listed from the outermost to the receiver. */
type Level = "empty" | "getter" | "method" | "noncallable";

/** A chain whose ordinary lookup never reaches the omitted method. */
interface ShadowCase {
  readonly hint: Hint;
  readonly levels: readonly Level[];
  readonly method: Method;
  readonly root: "intrinsic" | "null" | "proxy";
  readonly value: number;
}

/** A chain of empty levels over an intrinsic %Object.prototype%. */
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
 * Generates admitted chains directly: a chain of empty levels over the
 * intrinsic prototype would reach the profile boundary, so the outermost
 * level becomes a user method instead of filtering the case away.
 */
const shadowCases: fc.Arbitrary<ShadowCase> = fc
  .record({
    hint: hints,
    levels: fc.array(
      fc.constantFrom<Level>("empty", "getter", "method", "noncallable"),
      { minLength: 1, maxLength: 3 },
    ),
    method: methods,
    root: fc.constantFrom<ShadowCase["root"]>("intrinsic", "null", "proxy"),
    value: fc.integer({ min: -20, max: 20 }),
  })
  .map((input) =>
    input.root === "intrinsic" &&
    input.levels.every((level) => level === "empty")
      ? Object.assign({}, input, {
          levels: ["method" as const, ...input.levels.slice(1)],
        })
      : input,
  );
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

/** Independent lookup model: the innermost non-empty level decides. */
function shadowExpected(input: ShadowCase): string {
  let result = input.root === "proxy" ? "proxy k true true" : "TypeError";
  for (const [index, level] of input.levels.entries()) {
    if (level === "method") result = `L${index} k true`;
    else if (level === "getter") result = `G${index} k true`;
    else if (level === "noncallable") result = "TypeError";
  }
  const own = input.levels.at(-1) !== "empty";
  return ["warm w", result, String(own), ""].join("\n");
}

function boundarySource(input: BoundaryCase): readonly [string, number] {
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
      (index % 2 === 0 ? ` current.other${index} = ${index};` : ""),
  );
  const lines = [
    "",
    hintLine(input.hint),
    `function read(value) { return value.${input.method}; }`,
    ...warm,
    "let current = Object.prototype;",
    ...levels,
    'console.log("before");',
    "read(current);",
    'console.log("after");',
    "",
  ];
  // The rejected read is the member expression inside read().
  const line = lines.findIndex((text) => text.startsWith("function read"));
  return [lines.join("\n"), line + 1];
}

function boundaryStdout(input: BoundaryCase): string {
  return [
    "warm 1",
    ...(input.warm > 1 ? ["inherited 2"] : []),
    "before",
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

test(
  "generated shadowed legacy lookup chains preserve the core lookup model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "user methods, getters, null roots, and proxies precede the boundary",
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
        profile: "M5 optional legacy lookup boundary",
        seed: 0x6000_8800,
        sizeLimit: "one to three chain levels and three observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

test(
  "generated chains reaching the intrinsic report the owned rejection",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "a missing read over intrinsic Object.prototype rejects at its line",
      fc.asyncProperty(boundaryCases, async (input) => {
        const [source, line] = boundarySource(input);
        const sourceId = "generated-lookup.js";
        // The runtime reports no counters after an uncatchable diagnostic,
        // so this domain pins the exact output and the specialized read
        // shape; the shadowed domain measures misses through the same read.
        for (const specialization of ["disabled", "enabled"] as const) {
          compiled(source, specialization);
          process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          try {
            const native = await runNativeCli(
              {
                args: [
                  ...(specialization === "disabled"
                    ? ["--no-specialization"]
                    : []),
                  sourceId,
                ],
                source,
                sourceId,
                version: "0.1.0",
              },
              host,
            );
            assert.equal(native.exitStatus, 1);
            assert.equal(native.stdout, boundaryStdout(input));
            assert.equal(
              native.stderr,
              `${sourceId}:${line}:31: error[OSEO1001]: The ` +
                `Object.prototype.${input.method} method is excluded by ` +
                "the M5 optional legacy accessor policy.\n",
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
        profile: "M5 optional legacy lookup boundary",
        seed: 0x6000_8801,
        sizeLimit: "one or two warm reads and up to three empty levels",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
