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

type TemplateKind =
  | "multiple"
  | "nested"
  | "no-substitution"
  | "raw-cooked"
  | "simple";

interface TaggedTemplateCase {
  readonly first: number;
  readonly kind: TemplateKind;
  readonly second: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<TaggedTemplateCase> = fc.record({
  first: fc.integer({ max: 20, min: -20 }),
  kind: fc.constantFrom<TemplateKind>(
    "multiple",
    "nested",
    "no-substitution",
    "raw-cooked",
    "simple",
  ),
  second: fc.integer({ max: 20, min: -20 }),
});

function printCase(testCase: TaggedTemplateCase): string {
  const values =
    `const first = ${testCase.first};\n` +
    `const second = ${testCase.second};\n`;
  if (testCase.kind === "no-substitution") {
    return (
      values +
      "function tag(strings) {\n" +
      '  console.log("no", strings[0] === "plain",\n' +
      '    strings.raw[0] === "plain", strings.length);\n' +
      "  return 7;\n" +
      "}\n" +
      'console.log("result", tag`plain`);\n'
    );
  }
  if (testCase.kind === "simple") {
    return (
      values +
      "function tag(strings, value) {\n" +
      '  console.log("simple", strings[0] === "left",\n' +
      '    strings.raw[0] === "left", value);\n' +
      "  return value + 1;\n" +
      "}\n" +
      'console.log("result", tag`left${first}right`);\n'
    );
  }
  if (testCase.kind === "multiple") {
    return (
      values +
      "function tag(strings, left, right) {\n" +
      '  console.log("multiple", strings[0] === "a",\n' +
      '    strings[1] === "b", strings.raw[2] === "c",\n' +
      "    left, right);\n" +
      "  return left + right;\n" +
      "}\n" +
      'console.log("result", tag`a${first}b${second}c`);\n'
    );
  }
  if (testCase.kind === "raw-cooked") {
    return (
      values +
      "function tag(strings, value) {\n" +
      '  console.log("raw", strings[0] === "line\\n",\n' +
      '    strings.raw[0] === "line\\\\n", value);\n' +
      "  return value;\n" +
      "}\n" +
      'console.log("result", tag`line\\n${first}tail`);\n'
    );
  }
  return (
    values +
    "function tag(strings, value) {\n" +
    '  const inner = strings[0] === "inner";\n' +
    '  console.log(inner ? "inner" : "outer",\n' +
    "    inner,\n" +
    '    strings.raw[1] === (inner ? "end" : "tail"),\n' +
    "    value);\n" +
    "  return value + (inner ? 1 : 2);\n" +
    "}\n" +
    'console.log("result",\n' +
    "  tag`outer${tag`inner${first}end`}tail`);\n"
  );
}

function expected(testCase: TaggedTemplateCase): string {
  if (testCase.kind === "no-substitution") {
    return "no true true 1\nresult 7\n";
  }
  if (testCase.kind === "simple") {
    return `simple true true ${testCase.first}\nresult ${testCase.first + 1}\n`;
  }
  if (testCase.kind === "multiple") {
    return (
      `multiple true true true ${testCase.first} ${testCase.second}\n` +
      `result ${testCase.first + testCase.second}\n`
    );
  }
  if (testCase.kind === "raw-cooked") {
    return `raw true true ${testCase.first}\nresult ${testCase.first}\n`;
  }
  return (
    `inner true true ${testCase.first}\n` +
    `outer false true ${testCase.first + 1}\n` +
    `result ${testCase.first + 3}\n`
  );
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
    "oseo-tagged-template-property-",
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

test("tagged template model distinguishes cooked and raw strings", () => {
  assert.equal(
    expected({ first: 3, kind: "raw-cooked", second: 0 }),
    "raw true true 3\nresult 3\n",
  );
  assert.equal(
    expected({ first: 3, kind: "nested", second: 0 }),
    "inner true true 3\nouter false true 4\nresult 6\n",
  );
});

test(
  "generated tagged templates match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "tagged templates preserve strings, values, and nested calls",
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
            { source, sourceId: "generated-m5-tagged-template.js" },
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
          "no-substitution, simple, multiple, nested, and escaped " +
          "templates over bounded integer substitutions",
        numRuns: 12,
        profile: "M5 tagged templates",
        seed: 0x6000_2b00,
        sizeLimit: "one tagged expression with zero to two nested calls",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
