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

type DeleteCase =
  | {
      readonly form: "identifier";
      readonly resolved: boolean;
      readonly strict: boolean;
    }
  | {
      readonly abrupt: boolean;
      readonly form: "non-reference";
      readonly strict: boolean;
      readonly value: number;
    }
  | {
      readonly base: "live" | "null";
      readonly computed: boolean;
      readonly configurable: boolean;
      readonly conversionAbrupt: boolean;
      readonly form: "member";
      readonly strict: boolean;
      readonly value: number;
    }
  | {
      readonly base: "live" | "nested-null" | "null" | "undefined";
      readonly computed: boolean;
      readonly configurable: boolean;
      readonly conversionAbrupt: boolean;
      readonly form: "optional";
      readonly strict: boolean;
      readonly tail: boolean;
      readonly value: number;
    };

interface DeleteModel {
  readonly compileError: boolean;
  readonly stdout?: string;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const strictArbitrary = fc.boolean();
const caseArbitrary: fc.Arbitrary<DeleteCase> = fc.oneof(
  fc.record({
    form: fc.constant("identifier" as const),
    resolved: fc.boolean(),
    strict: strictArbitrary,
  }),
  fc.record({
    abrupt: fc.boolean(),
    form: fc.constant("non-reference" as const),
    strict: strictArbitrary,
    value: fc.integer({ max: 20, min: -20 }),
  }),
  fc.record({
    base: fc.constantFrom("live" as const, "null" as const),
    computed: fc.boolean(),
    configurable: fc.boolean(),
    conversionAbrupt: fc.boolean(),
    form: fc.constant("member" as const),
    strict: strictArbitrary,
    value: fc.integer({ max: 20, min: -20 }),
  }),
  fc.oneof(
    fc.record({
      base: fc.constantFrom(
        "live" as const,
        "null" as const,
        "undefined" as const,
      ),
      computed: fc.boolean(),
      configurable: fc.boolean(),
      conversionAbrupt: fc.boolean(),
      form: fc.constant("optional" as const),
      strict: strictArbitrary,
      tail: fc.constant(false as const),
      value: fc.integer({ max: 20, min: -20 }),
    }),
    fc.record({
      base: fc.constantFrom(
        "live" as const,
        "nested-null" as const,
        "null" as const,
        "undefined" as const,
      ),
      computed: fc.boolean(),
      configurable: fc.boolean(),
      conversionAbrupt: fc.boolean(),
      form: fc.constant("optional" as const),
      strict: strictArbitrary,
      tail: fc.constant(true as const),
      value: fc.integer({ max: 20, min: -20 }),
    }),
  ),
);

function model(testCase: DeleteCase): DeleteModel {
  if (testCase.form === "identifier") {
    if (testCase.strict) return { compileError: true };
    return {
      compileError: false,
      stdout: `${testCase.resolved ? "false 1" : "true kept"}\n`,
    };
  }
  if (testCase.form === "non-reference") {
    return {
      compileError: false,
      stdout: testCase.abrupt
        ? `undefined Error operand  true ${testCase.value}\n`
        : `true none operand  true ${testCase.value}\n`,
    };
  }
  const shorted =
    testCase.form === "optional" &&
    (testCase.base === "null" || testCase.base === "undefined");
  if (shorted) {
    return {
      compileError: false,
      stdout: `true none base  true ${testCase.value}\n`,
    };
  }
  const nullish = testCase.base !== "live";
  const keyOrder = testCase.computed ? "key " : "";
  const conversionOrder = testCase.computed ? "convert " : "";
  if (nullish) {
    const observation =
      testCase.form === "optional" && testCase.base === "nested-null"
        ? "nullish nullish"
        : `true ${testCase.value}`;
    return {
      compileError: false,
      stdout: `undefined TypeError base ${keyOrder} ${observation}\n`,
    };
  }
  if (testCase.computed && testCase.conversionAbrupt) {
    return {
      compileError: false,
      stdout:
        `undefined Error base ${keyOrder}${conversionOrder}` +
        ` true ${testCase.value}\n`,
    };
  }
  if (!testCase.configurable && testCase.strict) {
    return {
      compileError: false,
      stdout:
        `undefined TypeError base ${keyOrder}${conversionOrder}` +
        ` true ${testCase.value}\n`,
    };
  }
  const result = testCase.configurable ? "true" : "false";
  const present = testCase.configurable ? "false" : "true";
  const value = testCase.configurable ? "undefined" : String(testCase.value);
  return {
    compileError: false,
    stdout:
      `${result} none base ${keyOrder}${conversionOrder}` +
      ` ${present} ${value}\n`,
  };
}

function printCommon(
  testCase: Exclude<DeleteCase, { form: "identifier" }>,
): string {
  const base =
    testCase.form === "non-reference" ||
    testCase.base === "live" ||
    testCase.base === "nested-null"
      ? "holder"
      : testCase.base;
  const configurable =
    testCase.form === "non-reference" ? true : testCase.configurable;
  const conversionAbrupt =
    testCase.form === "non-reference" ? false : testCase.conversionAbrupt;
  const operandAbrupt =
    testCase.form === "non-reference" ? testCase.abrupt : false;
  const nestedNull =
    testCase.form === "optional" && testCase.base === "nested-null";
  return `
${testCase.strict ? '"use strict";' : ""}
let order = "";
const holder = {
  nested: ${nestedNull ? "null" : "{}"},
};
Object.defineProperty(
  ${
    testCase.form === "optional" &&
    testCase.tail &&
    testCase.base !== "nested-null"
      ? "holder.nested"
      : "holder"
  },
  "item",
  { configurable: ${configurable}, value: ${testCase.value} },
);
/** @returns {number} */
function base() { order = order + "base "; return ${base}; }
function key() {
  order = order + "key ";
  return {
    toString() {
      order = order + "convert ";
      ${conversionAbrupt ? 'throw new Error("key");' : ""}
      return "item";
    },
  };
}
function operand() {
  order = order + "operand ";
  ${operandAbrupt ? 'throw new Error("operand");' : ""}
  return ${testCase.value};
}
let result;
let error = "none";
`;
}

function expressionSource(
  testCase: Exclude<DeleteCase, { form: "identifier" }>,
): string {
  if (testCase.form === "non-reference") return "delete operand()";
  const key = testCase.computed ? "[key()]" : ".item";
  if (testCase.form === "member") return `delete base()${key}`;
  if (testCase.tail) return `delete base()?.nested${key}`;
  return `delete base()?.${testCase.computed ? "[key()]" : "item"}`;
}

function printCase(testCase: DeleteCase): string {
  if (testCase.form === "identifier") {
    return `
${testCase.strict ? '"use strict";' : ""}
${testCase.resolved ? "let known = 1;" : ""}
console.log(delete ${testCase.resolved ? "known" : "missing"}, ${
      testCase.resolved ? "known" : '"kept"'
    });
`;
  }
  const owner =
    testCase.form === "optional" && testCase.tail ? "holder.nested" : "holder";
  const observation =
    testCase.form === "optional" && testCase.base === "nested-null"
      ? '"nullish", "nullish"'
      : `"item" in ${owner}, ${owner}.item`;
  return `${printCommon(testCase)}
try { result = ${expressionSource(testCase)}; }
catch (caught) { error = caught.name; }
console.log(result, error, order, ${observation});
`;
}

async function references(source: string): Promise<
  readonly {
    readonly exitStatus: number;
    readonly stderr: string;
    readonly stdout: string;
  }[]
> {
  const directory = await host.makeTemporaryDirectory("oseo-delete-property-");
  const sourcePath = `${directory}/case.js`;
  try {
    await host.writeTextFile(
      sourcePath,
      `new Function(${JSON.stringify(source)})();\n`,
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
    ];
  } finally {
    await host.remove(directory);
  }
}

test("delete model distinguishes references and short paths", () => {
  assert.deepEqual(
    model({ form: "identifier", resolved: true, strict: false }),
    { compileError: false, stdout: "false 1\n" },
  );
  assert.deepEqual(
    model({
      base: "null",
      computed: true,
      configurable: true,
      conversionAbrupt: true,
      form: "optional",
      strict: false,
      tail: true,
      value: 1,
    }),
    { compileError: false, stdout: "true none base  true 1\n" },
  );
});

test(
  "generated delete expressions match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "delete preserves reference, abrupt, and optional-chain semantics",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expected = model(testCase);
        const referenceResults = await references(source);
        if (expected.compileError) {
          assert.ok(
            referenceResults.every((result) => result.exitStatus !== 0),
          );
          const compiled = compileSource(babelFrontend, {
            source,
            sourceId: "generated-m5-delete.js",
          });
          assert.equal(compiled.mir, undefined);
          assert.equal(compiled.diagnostics[0]?.code, "OSEO0001");
          return;
        }
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected.stdout ?? "",
        };
        assertMatchingObservations([expectedObservation, ...referenceResults]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-delete.js" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          if (
            specialization === "enabled" &&
            testCase.form === "optional" &&
            testCase.tail &&
            testCase.base === "live"
          ) {
            const mir = printMir(compiled.mir);
            assert.match(mir, /guard-object/u);
            assert.match(mir, /property-get generic/u);
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
                assert.ok(native.counters != null);
                assert.ok(native.counters.collections > 0);
                if (
                  specialization === "enabled" &&
                  testCase.form === "optional" &&
                  testCase.tail &&
                  testCase.base === "live"
                ) {
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
          "resolved and unresolved identifiers, non-references, ordinary " +
          "static and computed members, and optional static, computed, and " +
          "tail members across strictness, nullishness, attributes, and " +
          "initial and intermediate nullish bases, operand, key, " +
          "conversion, and abrupt effects",
        numRuns: 16,
        profile: "M5 delete expressions",
        seed: 0x6000_0f00,
        sizeLimit: "one delete expression with bounded values and effects",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
