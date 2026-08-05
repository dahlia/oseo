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
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type DeclarationKind = "const" | "let" | "var";
type InputKind = "missing" | "null" | "present";
type PatternKind = "array" | "object";

interface ForOfBindingCase {
  readonly declarationKind: DeclarationKind;
  readonly fallback: number;
  readonly first: number;
  readonly inputKind: InputKind;
  readonly patternKind: PatternKind;
  readonly second: number;
}

interface ModelResult {
  readonly first?: number;
  readonly second?: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<ForOfBindingCase> = fc.record({
  declarationKind: fc.constantFrom<DeclarationKind>("const", "let", "var"),
  fallback: fc.integer({ max: 20, min: -20 }),
  first: fc.integer({ max: 20, min: -20 }),
  inputKind: fc.constantFrom<InputKind>("missing", "null", "present"),
  patternKind: fc.constantFrom<PatternKind>("array", "object"),
  second: fc.integer({ max: 20, min: -20 }),
});

function patternSource(testCase: ForOfBindingCase): string {
  if (testCase.patternKind === "array") {
    return `[bound = ${testCase.fallback}, ...rest]`;
  }
  return `{ value: bound = ${testCase.fallback}, ...rest }`;
}

function inputSource(testCase: ForOfBindingCase): string {
  if (testCase.inputKind === "null") return "[null]";
  const first =
    testCase.inputKind === "present" ? String(testCase.first) : "undefined";
  if (testCase.patternKind === "array") {
    return `[[${first}, 7], [${testCase.second}, 8]]`;
  }
  return (
    `[{ value: ${first}, extra: 7 }, ` +
    `{ value: ${testCase.second}, extra: 8 }]`
  );
}

function printCase(testCase: ForOfBindingCase): string {
  const restValue = testCase.patternKind === "array" ? "rest[0]" : "rest.extra";
  return `
const readers = [];
let index = 0;
try {
  for (
    ${testCase.declarationKind} ${patternSource(testCase)}
    of ${inputSource(testCase)}
  ) {
    readers[index] = function () { return bound + ${restValue}; };
    index = index + 1;
  }
  console.log("values", readers[0](), readers[1]());
} catch (error) {
  console.log("error", error.name);
}
`;
}

function expected(testCase: ForOfBindingCase): ModelResult {
  if (testCase.inputKind === "null") return {};
  const first =
    testCase.inputKind === "present" ? testCase.first : testCase.fallback;
  const firstResult = first + 7;
  const secondResult = testCase.second + 8;
  return testCase.declarationKind === "var"
    ? { first: secondResult, second: secondResult }
    : { first: firstResult, second: secondResult };
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
    "oseo-for-of-binding-property-",
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

test("for-of binding model keeps lexical and var cells distinct", () => {
  const base = {
    fallback: 2,
    first: 1,
    inputKind: "present",
    patternKind: "array",
    second: 3,
  } as const;
  assert.deepEqual(expected({ ...base, declarationKind: "const" }), {
    first: 8,
    second: 11,
  });
  assert.deepEqual(expected({ ...base, declarationKind: "var" }), {
    first: 11,
    second: 11,
  });
});

test(
  "generated for-of bindings match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "for-of patterns preserve generated values and binding cells",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const modeled = expected(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout:
            modeled.first == null
              ? "error TypeError\n"
              : `values ${modeled.first} ${modeled.second}\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-for-of-binding.js" },
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
                toolchain: zigToolchain,
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
          "const, let, and var array or object for-of bindings with " +
          "defaults, rest, present, missing, and nullish inputs",
        numRuns: 10,
        profile: "M5 for-of binding patterns",
        seed: 0x6000_1700,
        sizeLimit: "two iterations with bounded integers",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
