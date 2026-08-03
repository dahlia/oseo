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

type DirectTarget =
  | "declared"
  | "function"
  | "missing"
  | "number"
  | "object"
  | "string"
  | "temporal-dead-zone";

type WithFallback = "lexical" | "missing" | "temporal-dead-zone";

type WithSupplied = "absent" | "function" | "number" | "undefined";

type TypeofCase =
  | {
      readonly form: "direct";
      readonly strict: boolean;
      readonly target: DirectTarget;
    }
  | {
      readonly fallback: WithFallback;
      readonly form: "with";
      readonly supplied: WithSupplied;
    };

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const caseArbitrary: fc.Arbitrary<TypeofCase> = fc.oneof(
  fc.record({
    form: fc.constant("direct" as const),
    strict: fc.boolean(),
    target: fc.constantFrom(
      "declared" as const,
      "function" as const,
      "missing" as const,
      "number" as const,
      "object" as const,
      "string" as const,
      "temporal-dead-zone" as const,
    ),
  }),
  // A `with` statement is non-strict-only, so the object-environment
  // dimension has no strict variant.
  fc.record({
    fallback: fc.constantFrom(
      "lexical" as const,
      "missing" as const,
      "temporal-dead-zone" as const,
    ),
    form: fc.constant("with" as const),
    supplied: fc.constantFrom(
      "absent" as const,
      "function" as const,
      "number" as const,
      "undefined" as const,
    ),
  }),
);

/**
 * The independent oracle: the single line each generated program prints.
 * A direct unresolvable reference and an all-miss object-environment
 * chain answer the specification's `"undefined"`, while a reachable
 * binding read in its temporal dead zone stays the catchable
 * ReferenceError.
 */
function model(testCase: TypeofCase): string {
  if (testCase.form === "direct") {
    if (testCase.target === "temporal-dead-zone") return "ReferenceError\n";
    if (testCase.target === "declared" || testCase.target === "missing") {
      return "undefined\n";
    }
    return `${testCase.target}\n`;
  }
  if (testCase.supplied !== "absent") return `${testCase.supplied}\n`;
  if (testCase.fallback === "missing") return "undefined\n";
  if (testCase.fallback === "lexical") return "number\n";
  return "ReferenceError\n";
}

function directDeclaration(target: DirectTarget): string {
  if (target === "declared") return "var probe;";
  if (target === "function") return "function probe() {}";
  if (target === "number") return "let probe = 3;";
  if (target === "object") return "let probe = { key: 1 };";
  if (target === "string") return 'let probe = "text";';
  return "";
}

function suppliedLiteral(supplied: Exclude<WithSupplied, "absent">): string {
  if (supplied === "function") return "function () {}";
  if (supplied === "number") return "7";
  return "undefined";
}

function printCase(testCase: TypeofCase): string {
  if (testCase.form === "direct") {
    return `
${testCase.strict ? '"use strict";' : ""}
${directDeclaration(testCase.target)}
function scope() {
  try {
    console.log(typeof probe);
  } catch (caught) {
    console.log(caught.name);
  }
  ${testCase.target === "temporal-dead-zone" ? "let probe;" : ""}
}
scope();
`;
  }
  const environment =
    testCase.supplied === "absent"
      ? "{}"
      : `{ probe: ${suppliedLiteral(testCase.supplied)} }`;
  return `
function scope() {
  ${testCase.fallback === "lexical" ? "let probe = 5;" : ""}
  const environment = ${environment};
  try {
    with (environment) {
      console.log(typeof probe);
    }
  } catch (caught) {
    console.log(caught.name);
  }
  ${testCase.fallback === "temporal-dead-zone" ? "let probe;" : ""}
}
scope();
`;
}

async function references(source: string): Promise<
  readonly {
    readonly exitStatus: number;
    readonly stderr: string;
    readonly stdout: string;
  }[]
> {
  const directory = await host.makeTemporaryDirectory("oseo-typeof-property-");
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

test("typeof model separates unresolvable and dead-zone reads", () => {
  assert.equal(
    model({ form: "direct", strict: true, target: "missing" }),
    "undefined\n",
  );
  assert.equal(
    model({ form: "direct", strict: false, target: "temporal-dead-zone" }),
    "ReferenceError\n",
  );
  assert.equal(
    model({ fallback: "missing", form: "with", supplied: "absent" }),
    "undefined\n",
  );
  assert.equal(
    model({ fallback: "temporal-dead-zone", form: "with", supplied: "number" }),
    "number\n",
  );
});

test(
  "generated typeof expressions match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "typeof answers unresolvable references without a binding read",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: model(testCase),
        };
        const referenceResults = await references(source);
        assertMatchingObservations([expectedObservation, ...referenceResults]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-typeof.js" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          if (testCase.form === "direct" && testCase.target === "missing") {
            // The unresolvable direct operand folds to its result string,
            // so the lowered program holds no typeof operation at all.
            const mir = printMir(compiled.mir);
            assert.match(mir, /constant "undefined"/u);
            assert.doesNotMatch(mir, /unary typeof/u);
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
          "direct typeof over unresolvable, var-declared, initialized " +
          "number, string, object, and function bindings and a temporal " +
          "dead zone, in strict and non-strict scripts, and typeof through " +
          "a with object environment with supplied function, number, and " +
          "undefined values against missing, lexical, and dead-zone " +
          "fallbacks",
        numRuns: 16,
        profile: "M5 typeof unresolved references",
        seed: 0x5eed_002c,
        sizeLimit: "one observed typeof expression per generated program",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
