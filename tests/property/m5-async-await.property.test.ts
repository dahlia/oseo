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

const { assertAsyncProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type AwaitPosition =
  | "binary"
  | "call"
  | "compound"
  | "conditional"
  | "logical"
  | "nested";

interface AwaitCase {
  readonly falseHint: boolean;
  readonly form: "arrow" | "function";
  readonly left: number;
  readonly position: AwaitPosition;
  readonly reject: boolean;
  readonly right: number;
}

interface ModeledBody {
  readonly lines: readonly string[];
  readonly source: readonly string[];
  readonly value: number | string;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const large = propertySize() === "large";
const awaitCaseArbitrary = fc.record({
  falseHint: fc.boolean(),
  form: fc.constantFrom("arrow" as const, "function" as const),
  left: fc.integer({ max: 20, min: -20 }),
  position: fc.constantFrom(
    "binary" as const,
    "call" as const,
    "compound" as const,
    "conditional" as const,
    "logical" as const,
    "nested" as const,
  ),
  reject: fc.boolean(),
  right: fc.integer({ max: 20, min: -20 }),
});

function modeledBody(testCase: AwaitCase): ModeledBody {
  const { left, reject, right } = testCase;
  if (testCase.position === "binary") {
    return {
      lines: ["left", "operand"],
      source: [
        `const result = mark("left", ${left}) +`,
        `  await settle(mark("operand", ${right}), ${reject});`,
      ],
      value: left + right,
    };
  }
  if (testCase.position === "call") {
    return {
      lines: reject
        ? ["target", "operand"]
        : ["target", "operand", `body ${right}`],
      source: [
        'const result = mark("target", function (value) {',
        '  console.log("body", value);',
        "  return value;",
        `})(await settle(mark("operand", ${right}), ${reject}));`,
      ],
      value: right,
    };
  }
  if (testCase.position === "compound") {
    return {
      lines: ["base", "key", "operand"],
      source: [
        `const box = { value: ${left} };`,
        'const target = mark("base", box);',
        'target[mark("key", "value")] +=',
        `  await settle(mark("operand", ${right}), ${reject});`,
        "const result = target.value;",
      ],
      value: left + right,
    };
  }
  if (testCase.position === "conditional") {
    const taken = right !== 0;
    return {
      lines: reject ? ["test"] : ["test", taken ? "consequent" : "alternate"],
      source: [
        `const result = await settle(mark("test", ${right}), ${reject})`,
        `  ? mark("consequent", ${left})`,
        `  : mark("alternate", ${left + 1});`,
      ],
      value: taken ? left : left + 1,
    };
  }
  if (testCase.position === "logical") {
    return {
      lines: [
        "and skip left",
        "and take left",
        "and take operand",
        "or skip left",
        "or take left",
        "or take operand",
      ],
      source: [
        'const andSkip = mark("and skip left", 0) &&',
        '  await settle(mark("and skip operand", 1), true);',
        'const andTake = mark("and take left", 1) &&',
        `  await settle(mark("and take operand", ${right}), false);`,
        'const orSkip = mark("or skip left", 1) ||',
        '  await settle(mark("or skip operand", 1), true);',
        'const orTake = mark("or take left", 0) ||',
        `  await settle(mark("or take operand", ${right}), false);`,
        "const result = andSkip + andTake + orSkip + orTake;",
      ],
      value: right * 2 + 1,
    };
  }
  return {
    lines: ["inner", "outer"],
    source: [
      "const result = await settle(",
      `  mark("outer", await settle(mark("inner", ${right}), false)),`,
      `  ${reject},`,
      ");",
    ],
    value: right,
  };
}

function printSource(testCase: AwaitCase): string {
  const body = modeledBody(testCase);
  const declaration =
    testCase.form === "arrow"
      ? "const run = async () => {"
      : "async function run() {";
  const close = testCase.form === "arrow" ? "};" : "}";
  const guarded = testCase.falseHint
    ? [
        "const guarded = hintedAdd({",
        "  valueOf: function () {",
        '    console.log("guard miss fallback");',
        "    return result;",
        "  },",
        "}, 1);",
      ]
    : ["const guarded = hintedAdd(result, 1);"];
  return [
    "function mark(label, value) {",
    "  console.log(label);",
    "  return value;",
    "}",
    "function settle(value, reject) {",
    "  return reject ? Promise.reject(" +
      '"await rejection") : Promise.resolve(value);',
    "}",
    "function hintedAdd(left: number, right: number) {",
    "  return left + right;",
    "}",
    declaration,
    '  console.log("start");',
    "  try {",
    ...body.source.map((line) => `    ${line}`),
    ...guarded.map((line) => `    ${line}`),
    "    return guarded;",
    "  } catch (reason) {",
    '    console.log("caught", reason);',
    "    return -99;",
    "  } finally {",
    '    console.log("finally before");',
    "    await Promise.resolve(0);",
    '    console.log("finally after");',
    "  }",
    close,
    "run().then(function (value) {",
    '  console.log("result", value);',
    "});",
    "",
  ].join("\n");
}

function expectedOutput(testCase: AwaitCase): string {
  const body = modeledBody(testCase);
  const rejects = testCase.reject && testCase.position !== "logical";
  const lines = ["start", ...body.lines];
  if (rejects) {
    lines.push("caught await rejection");
  } else {
    if (testCase.falseHint) lines.push("guard miss fallback");
  }
  lines.push("finally before", "finally after");
  const value = rejects
    ? -99
    : typeof body.value === "number"
      ? body.value + 1
      : `${body.value}1`;
  lines.push(`result ${value}`);
  return `${lines.join("\n")}\n`;
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
    "oseo-async-await-property-",
  );
  const sourcePath = `${directory}/async-await.ts`;
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
  } catch (error) {
    throw new Error(
      `Reference artifacts retained at ${directory}\nsource:\n${source}`,
      { cause: error },
    );
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated ordinary async await positions preserve the modeled order",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    await assertAsyncProperty(
      "ordinary async await positions retain order and completion",
      fc.asyncProperty(awaitCaseArbitrary, async (testCase) => {
        const source = printSource(testCase);
        const expected = {
          exitStatus: 0,
          stderr: "",
          stdout: expectedOutput(testCase),
        };
        assertMatchingObservations([expected, ...(await references(source))]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-async-await.ts" },
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
              (native) => assertMatchingObservations([expected, native]),
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
          "ordinary async functions and arrows with six await positions, " +
          "fulfilled and rejected operands, and truthful or false hints",
        numRuns: 12,
        profile: "M5a ordinary async await positions",
        seed: 0x6000_0600,
        sizeLimit: large
          ? "12 generated position cases at the extended run scale"
          : "12 generated position cases",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
