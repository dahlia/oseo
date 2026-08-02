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

type HandlerKind = "absent" | "pattern";
type InputKind = "missing" | "null" | "present";
type PatternKind = "array" | "object";

interface OptionalCatchCase {
  readonly fallback: number;
  readonly finalizer: boolean;
  readonly handlerKind: HandlerKind;
  readonly inputKind: InputKind;
  readonly patternKind: PatternKind;
  readonly rethrow: boolean;
  readonly value: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<OptionalCatchCase> = fc.record({
  fallback: fc.integer({ max: 20, min: -20 }),
  finalizer: fc.boolean(),
  handlerKind: fc.constantFrom<HandlerKind>("absent", "pattern"),
  inputKind: fc.constantFrom<InputKind>("missing", "null", "present"),
  patternKind: fc.constantFrom<PatternKind>("array", "object"),
  rethrow: fc.boolean(),
  value: fc.integer({ max: 20, min: -20 }),
});

function patternSource(testCase: OptionalCatchCase): string {
  if (testCase.patternKind === "array") {
    return `[bound = ${testCase.fallback}, ...rest]`;
  }
  return `{ value: bound = ${testCase.fallback}, ...rest }`;
}

function inputSource(testCase: OptionalCatchCase): string {
  if (testCase.inputKind === "null") return "null";
  if (testCase.patternKind === "array") {
    const value =
      testCase.inputKind === "present" ? String(testCase.value) : "undefined";
    return `[${value}, 7]`;
  }
  const value =
    testCase.inputKind === "present" ? `value: ${testCase.value}, ` : "";
  return `{ ${value}extra: 7 }`;
}

function printCase(testCase: OptionalCatchCase): string {
  const restValue = testCase.patternKind === "array" ? "rest[0]" : "rest.extra";
  const clause =
    testCase.handlerKind === "absent"
      ? "catch"
      : `catch (${patternSource(testCase)})`;
  const observation =
    testCase.handlerKind === "absent"
      ? 'console.log("entered");'
      : `console.log("result", bound, ${restValue});`;
  const rethrow = testCase.rethrow
    ? '\n    throw new RangeError("rethrown");'
    : "";
  const finalizer = testCase.finalizer
    ? ' finally {\n    console.log("cleanup");\n  }'
    : "";
  return `
function consume(input) {
  try {
    throw input;
  } ${clause} {
    ${observation}${rethrow}
  }${finalizer}
  return "completed";
}
try {
  console.log("returned", consume(${inputSource(testCase)}));
} catch (error) {
  console.log("error", error.name);
}
`;
}

/**
 * Independent oracle: the stdout lines the case must print. An absent
 * handler always enters its body, even for a thrown nullish value,
 * while a pattern handler skips it when destructuring null fails. The
 * finalizer line follows the handler body and precedes the completion
 * the function ultimately produces.
 */
function expectedLines(testCase: OptionalCatchCase): readonly string[] {
  const lines: string[] = [];
  const patternFails =
    testCase.handlerKind === "pattern" && testCase.inputKind === "null";
  if (testCase.handlerKind === "absent") {
    lines.push("entered");
  } else if (!patternFails) {
    const bound =
      testCase.inputKind === "present" ? testCase.value : testCase.fallback;
    lines.push(`result ${bound} 7`);
  }
  if (testCase.finalizer) lines.push("cleanup");
  if (patternFails) lines.push("error TypeError");
  else if (testCase.rethrow) lines.push("error RangeError");
  else lines.push("returned completed");
  return lines;
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
    "oseo-optional-catch-property-",
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

test("optional catch model orders handler, finalizer, and completion", () => {
  assert.deepEqual(
    expectedLines({
      fallback: 2,
      finalizer: true,
      handlerKind: "pattern",
      inputKind: "null",
      patternKind: "object",
      rethrow: false,
      value: 1,
    }),
    ["cleanup", "error TypeError"],
  );
  assert.deepEqual(
    expectedLines({
      fallback: 2,
      finalizer: false,
      handlerKind: "absent",
      inputKind: "null",
      patternKind: "object",
      rethrow: true,
      value: 1,
    }),
    ["entered", "error RangeError"],
  );
  assert.deepEqual(
    expectedLines({
      fallback: 2,
      finalizer: true,
      handlerKind: "absent",
      inputKind: "present",
      patternKind: "array",
      rethrow: false,
      value: 3,
    }),
    ["entered", "cleanup", "returned completed"],
  );
});

test(
  "generated optional catch bindings match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "optional catch bindings preserve completion ordering",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: `${expectedLines(testCase).join("\n")}\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-optional-catch-binding.js" },
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
          "absent and destructured catch handlers with rethrown " +
          "completions, optional finalizers, and present, missing, and " +
          "nullish thrown inputs",
        numRuns: 10,
        profile: "M5 optional catch binding",
        seed: 0x5eed_002a,
        sizeLimit: "one handler, one finalizer, and bounded integers",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
