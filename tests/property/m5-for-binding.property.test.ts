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

interface ForBindingCase {
  readonly declarationKind: DeclarationKind;
  readonly extra: number;
  readonly fallback: number;
  readonly inputKind: InputKind;
  readonly patternKind: PatternKind;
  readonly value: number;
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
const caseArbitrary: fc.Arbitrary<ForBindingCase> = fc.record({
  declarationKind: fc.constantFrom<DeclarationKind>("const", "let", "var"),
  extra: fc.integer({ max: 20, min: -20 }),
  fallback: fc.integer({ max: 20, min: -20 }),
  inputKind: fc.constantFrom<InputKind>("missing", "null", "present"),
  patternKind: fc.constantFrom<PatternKind>("array", "object"),
  value: fc.integer({ max: 20, min: -20 }),
});

function patternSource(testCase: ForBindingCase): string {
  return testCase.patternKind === "array"
    ? `[bound = ${testCase.fallback}, ...rest]`
    : `{ value: bound = ${testCase.fallback}, ...rest }`;
}

function inputSource(testCase: ForBindingCase): string {
  if (testCase.inputKind === "null") return "null";
  const value =
    testCase.inputKind === "present" ? String(testCase.value) : "undefined";
  return testCase.patternKind === "array"
    ? `[${value}, ${testCase.extra}]`
    : `{ value: ${value}, extra: ${testCase.extra} }`;
}

function printCase(testCase: ForBindingCase): string {
  const restValue = testCase.patternKind === "array" ? "rest[0]" : "rest.extra";
  const restUpdate =
    testCase.patternKind === "array"
      ? "rest = [rest[0] + 1]"
      : "rest = { extra: rest.extra + 1 }";
  const update =
    testCase.declarationKind === "const"
      ? "index++"
      : `index++, bound++, ${restUpdate}`;
  return `
const readers = [];
let index = 0;
try {
  for (
    ${testCase.declarationKind} ${patternSource(testCase)} =
      ${inputSource(testCase)};
    index < 2;
    ${update}
  ) {
    readers[index] = function () { return bound + ${restValue}; };
  }
  console.log("values", readers[0](), readers[1]());
} catch (error) {
  console.log("error", error.name);
}
`;
}

function expected(testCase: ForBindingCase): ModelResult {
  if (testCase.inputKind === "null") return {};
  const value =
    testCase.inputKind === "present" ? testCase.value : testCase.fallback;
  const base = value + testCase.extra;
  if (testCase.declarationKind === "const") {
    return { first: base, second: base };
  }
  if (testCase.declarationKind === "let") {
    return { first: base, second: base + 2 };
  }
  return { first: base + 4, second: base + 4 };
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
    "oseo-for-binding-property-",
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

test("classic for binding model distinguishes lexical and var cells", () => {
  const base = {
    extra: 4,
    fallback: 2,
    inputKind: "present",
    patternKind: "array",
    value: 3,
  } as const;
  assert.deepEqual(expected({ ...base, declarationKind: "const" }), {
    first: 7,
    second: 7,
  });
  assert.deepEqual(expected({ ...base, declarationKind: "let" }), {
    first: 7,
    second: 9,
  });
  assert.deepEqual(expected({ ...base, declarationKind: "var" }), {
    first: 11,
    second: 11,
  });
});

test(
  "generated classic for bindings match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "classic for patterns preserve values and binding cells",
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
            { source, sourceId: "generated-m5-for-binding.js" },
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
          "const, let, and var classic for array or object bindings with " +
          "defaults, rest, present, missing, and nullish inputs",
        numRuns: 10,
        profile: "M5 classic for binding patterns",
        seed: 0x5eed_0010,
        sizeLimit: "two iterations with bounded integers",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
