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

type IterativeMethod = "every" | "forEach" | "some";
type Mutation = "append" | "delete-next" | "fill-next" | "none" | "shrink";
type ReceiverKind = "array" | "object";

interface IterativeCase {
  readonly entries: readonly (number | null)[];
  readonly method: IterativeMethod;
  readonly mutation: Mutation;
  readonly receiver: ReceiverKind;
  readonly threshold: number;
}

const caseArbitrary: fc.Arbitrary<IterativeCase> = fc
  .record({
    entries: fc.array(
      fc.option(fc.integer({ max: 9, min: -9 }), { nil: null }),
      {
        maxLength: 4,
      },
    ),
    method: fc.constantFrom<IterativeMethod>("every", "forEach", "some"),
    mutation: fc.constantFrom<Mutation>(
      "none",
      "delete-next",
      "fill-next",
      "append",
      "shrink",
    ),
    receiver: fc.constantFrom<ReceiverKind>("array", "object"),
    threshold: fc.integer({ max: 7, min: -7 }),
  })
  .map((testCase) => ({
    entries: [1, ...testCase.entries],
    method: testCase.method,
    mutation: testCase.mutation,
    receiver: testCase.receiver,
    threshold: testCase.threshold,
  }));

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function mutationSource(testCase: IterativeCase): string {
  const length = testCase.entries.length;
  switch (testCase.mutation) {
    case "none":
      return "";
    case "delete-next":
      return "delete subject[1];";
    case "fill-next":
      return "subject[1] = 9;";
    case "append":
      return `subject[${length}] = 8; subject.length = ${length + 1};`;
    case "shrink":
      return "subject.length = 1;";
  }
}

function printCase(testCase: IterativeCase): string {
  const assignments = testCase.entries
    .map((value, index) =>
      value == null ? "" : `subject[${index}] = ${value};`,
    )
    .join("\n");
  const subject = testCase.receiver === "array" ? "[]" : "{}";
  const predicate = testCase.method === "forEach" ? "true" : "selected";
  return `
const subject = ${subject};
subject.length = ${testCase.entries.length};
${assignments}
const marker = { marker: true };
const result = Array.prototype.${testCase.method}.call(
  subject,
  function (value, index, object) {
    console.log("call", value, index, object === subject, this === marker);
    if (index === 0) { ${mutationSource(testCase)} }
    const selected = value < ${testCase.threshold};
    return ${predicate};
  },
  marker,
);
console.log("result", String(result), subject.length, subject[1]);
/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
console.log("guard", hinted("guard"));
String.prototype.iterativePropertyMarker = 1;
console.log("guard", hinted("guard"));
`;
}

function expected(testCase: IterativeCase): string {
  const values = [...testCase.entries];
  const length = values.length;
  let visibleLength = length;
  let result: boolean | undefined =
    testCase.method === "every"
      ? true
      : testCase.method === "some"
        ? false
        : undefined;
  const lines: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const value = values[index];
    if (value == null) continue;
    lines.push(`call ${value} ${index} true true`);
    if (index === 0) {
      switch (testCase.mutation) {
        case "none":
          break;
        case "delete-next":
          delete values[1];
          break;
        case "fill-next":
          values[1] = 9;
          if (testCase.receiver === "array" && length === 1) {
            visibleLength = 2;
          }
          break;
        case "append":
          values[length] = 8;
          visibleLength = length + 1;
          break;
        case "shrink":
          visibleLength = 1;
          if (testCase.receiver === "array") {
            for (let removed = 1; removed < values.length; removed += 1) {
              delete values[removed];
            }
          }
          break;
      }
    }
    const selected = value < testCase.threshold;
    if (testCase.method === "every" && !selected) {
      result = false;
      break;
    }
    if (testCase.method === "some" && selected) {
      result = true;
      break;
    }
  }
  const nextValue = String(values[1] ?? undefined);
  lines.push(
    `result ${String(result)} ${visibleLength} ${nextValue}`,
    "hint h",
    "false hint m",
    "guard g",
    "guard g",
    "",
  );
  return lines.join("\n");
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
    "oseo-array-iterative-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
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

test(
  "generated Array prototype iteration matches the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Array iterative methods agree",
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
            { source, sourceId: "generated-m5-array-iterative.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-object/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /property-get generic/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:object|shape)/u);
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
                assert.ok(native.counters?.collections != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "enabled") {
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
          "every, forEach, and some over one to five sparse array or " +
          "ordinary array-like entries; bounded integer predicates; no " +
          "mutation, deletion, future fill, append, and length shrink; " +
          "callback receiver and argument identity; a false string hint " +
          "and one deliberate shape-guard miss",
        numRuns: 16,
        profile: "M5 Array prototype iterative methods",
        seed: 0x6000_4200,
        sizeLimit:
          "at most five initial indices, one first-callback mutation, one " +
          "predicate, four hint observations, and the initial length's " +
          "iteration steps",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
