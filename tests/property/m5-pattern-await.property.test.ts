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

/**
 * The four pattern subexpressions that suspend. `target` is the computed
 * member of an assignment target, `key` is a computed binding property
 * name, and the two `default` positions are the array and object binding
 * defaults.
 */
type PatternPosition = "array-default" | "key" | "object-default" | "target";

/** The body form that owns the traced suspension frame. */
type BodyForm = "arrow" | "async-generator" | "function";

interface PatternAwaitCase {
  readonly fallback: number;
  readonly falseHint: boolean;
  readonly form: BodyForm;
  readonly position: PatternPosition;
  readonly reject: boolean;
  /** Whether the input supplies the value the pattern selects. */
  readonly supplied: boolean;
  readonly value: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const large = propertySize() === "large";

/* The domain is generated as admitted structured cases rather than
 * filtered from arbitrary source, so every shrink step still prints a
 * program whose pattern, body form, and settlement stay in the profile. */
const patternAwaitCaseArbitrary: fc.Arbitrary<PatternAwaitCase> = fc.record({
  fallback: fc.integer({ max: 20, min: -20 }),
  falseHint: fc.boolean(),
  form: fc.constantFrom<BodyForm>("arrow", "async-generator", "function"),
  position: fc.constantFrom<PatternPosition>(
    "array-default",
    "key",
    "object-default",
    "target",
  ),
  reject: fc.boolean(),
  supplied: fc.boolean(),
  value: fc.integer({ max: 20, min: -20 }),
});

/** The pattern statements for one case, indented into the body. */
function patternSource(testCase: PatternAwaitCase): readonly string[] {
  const { fallback, reject, supplied, value } = testCase;
  const settle = (label: string, operand: string): string =>
    `await settle(mark("${label}", ${operand}), ${reject})`;
  if (testCase.position === "target") {
    return [
      "const box = {};",
      `const input = mark("source", [${supplied ? value : ""}]);`,
      `[box[${settle("pattern", '"slot"')}]] = input;`,
      "const selected = box.slot;",
    ];
  }
  if (testCase.position === "key") {
    const input = supplied ? `{ slot: ${value} }` : "{}";
    return [
      `const input = mark("source", ${input});`,
      `const { [${settle("pattern", '"slot"')}]: selected } = input;`,
    ];
  }
  if (testCase.position === "object-default") {
    const input = supplied ? `{ slot: ${value} }` : "{}";
    return [
      `const input = mark("source", ${input});`,
      `const { slot: selected = ${settle("pattern", String(fallback))} } =`,
      "  input;",
    ];
  }
  return [
    `const input = mark("source", [${supplied ? value : ""}]);`,
    `const [selected = ${settle("pattern", String(fallback))}] = input;`,
  ];
}

/** Whether the case reaches its `await` at all. */
function suspends(testCase: PatternAwaitCase): boolean {
  return (
    testCase.position === "target" ||
    testCase.position === "key" ||
    !testCase.supplied
  );
}

/** The value the pattern selects, or `undefined` when it selects none. */
function selectedValue(testCase: PatternAwaitCase): number | undefined {
  if (testCase.position === "target" || testCase.position === "key") {
    return testCase.supplied ? testCase.value : undefined;
  }
  return testCase.supplied ? testCase.value : testCase.fallback;
}

function printSource(testCase: PatternAwaitCase): string {
  const guarded = testCase.falseHint
    ? [
        "const guarded = hintedAdd({",
        "  valueOf: function () {",
        '    console.log("guard miss fallback");',
        "    return selected;",
        "  },",
        "}, 1);",
      ]
    : ["const guarded = hintedAdd(selected, 1);"];
  const open =
    testCase.form === "arrow"
      ? "const run = async () => {"
      : testCase.form === "async-generator"
        ? "async function* run() {"
        : "async function run() {";
  const close = testCase.form === "arrow" ? "};" : "}";
  const driver =
    testCase.form === "async-generator"
      ? [
          "run().next().then(function (step) {",
          '  console.log("result", step.value);',
          "});",
        ]
      : [
          "run().then(function (value) {",
          '  console.log("result", value);',
          "});",
        ];
  return [
    "function mark(label, value) {",
    "  console.log(label);",
    "  return value;",
    "}",
    "function settle(value, reject) {",
    "  return reject",
    '    ? Promise.reject("pattern rejection")',
    "    : Promise.resolve(value);",
    "}",
    "function hintedAdd(left: number, right: number) {",
    "  return left + right;",
    "}",
    open,
    '  console.log("start");',
    "  try {",
    ...patternSource(testCase).map((line) => `    ${line}`),
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
    ...driver,
    "",
  ].join("\n");
}

/**
 * The independent oracle. It predicts the printed order and completion
 * from the case record alone, without consulting a reference host or the
 * printed program.
 */
function expectedOutput(testCase: PatternAwaitCase): string {
  const rejects = testCase.reject && suspends(testCase);
  const lines = ["start", "source"];
  if (suspends(testCase)) lines.push("pattern");
  if (rejects) {
    lines.push("caught pattern rejection");
  } else if (testCase.falseHint) {
    lines.push("guard miss fallback");
  }
  lines.push("finally before", "finally after");
  const selected = selectedValue(testCase);
  const result = rejects ? -99 : selected == null ? Number.NaN : selected + 1;
  lines.push(`result ${String(result)}`);
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
    "oseo-pattern-await-property-",
  );
  const sourcePath = `${directory}/pattern-await.ts`;
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

// A supplied value skips the default, so its operand never suspends and
// a rejected operand cannot reach the enclosing catch.
test("a supplied binding default neither suspends nor rejects", () => {
  const supplied: PatternAwaitCase = {
    fallback: 3,
    falseHint: false,
    form: "function",
    position: "object-default",
    reject: true,
    supplied: true,
    value: 5,
  };
  assert.equal(suspends(supplied), false);
  assert.equal(
    expectedOutput(supplied),
    ["start", "source", "finally before", "finally after", "result 6", ""].join(
      "\n",
    ),
  );
});

test(
  "generated pattern await positions preserve the modeled order",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "pattern await positions retain order, selection, and completion",
      fc.asyncProperty(patternAwaitCaseArbitrary, async (testCase) => {
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
            { source, sourceId: "generated-m5-pattern-await.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          /* Both policies collect at every safepoint, because the values a
           * pattern prepares before its suspension must stay reachable from
           * the resumed frame's root slots whether or not specialization is
           * in effect. */
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
                assertMatchingObservations([expected, native]);
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
          "computed assignment-target members, computed binding property " +
          "names, and array and object binding defaults in asynchronous " +
          "functions, arrows, and asynchronous generators, with supplied " +
          "and missing selections, fulfilled and rejected operands, and " +
          "truthful or false hints",
        numRuns: 16,
        profile: "M5a pattern-position await suspension",
        seed: 0x5eed_0028,
        sizeLimit: large
          ? "16 generated pattern cases at the extended run scale"
          : "16 generated pattern cases",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
