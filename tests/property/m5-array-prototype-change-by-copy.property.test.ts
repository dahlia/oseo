/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
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
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type Entry = number | "hole";
type Method = "toReversed" | "toSpliced" | "with";
type Receiver = "array" | "object";
type SpliceArguments = "full" | "none" | "start" | "undefined";

interface ChangeByCopyCase {
  readonly deleteCount: number;
  readonly entries: readonly Entry[];
  readonly index: number;
  readonly items: readonly number[];
  readonly method: Method;
  readonly receiver: Receiver;
  readonly spliceArguments: SpliceArguments;
  readonly start: number;
  readonly value: number;
}

const caseArbitrary: fc.Arbitrary<ChangeByCopyCase> = fc
  .record({
    deleteCount: fc.integer({ max: 7, min: -2 }),
    entries: fc.array(
      fc.oneof(fc.integer({ max: 9, min: -9 }), fc.constant<Entry>("hole")),
      { maxLength: 6, minLength: 1 },
    ),
    indexSeed: fc.integer({ max: 12, min: -12 }),
    items: fc.array(fc.integer({ max: 9, min: -9 }), { maxLength: 3 }),
    method: fc.constantFrom<Method>("toReversed", "toSpliced", "with"),
    receiver: fc.constantFrom<Receiver>("array", "object"),
    spliceArguments: fc.constantFrom<SpliceArguments>(
      "full",
      "none",
      "start",
      "undefined",
    ),
    start: fc.integer({ max: 9, min: -9 }),
    value: fc.integer({ max: 9, min: -9 }),
  })
  .map(({ indexSeed, ...testCase }) => {
    const length = testCase.entries.length;
    const absolute = Math.abs(indexSeed) % length;
    return {
      deleteCount: testCase.deleteCount,
      entries: testCase.entries,
      index: indexSeed < 0 ? absolute - length : absolute,
      items: testCase.items,
      method: testCase.method,
      receiver: testCase.receiver,
      spliceArguments: testCase.spliceArguments,
      start: testCase.start,
      value: testCase.value,
    };
  });

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printCase(testCase: ChangeByCopyCase): string {
  const subject = testCase.receiver === "array" ? "[]" : "{}";
  const assignments = testCase.entries
    .map((entry, index) =>
      entry === "hole" ? "" : `subject[${index}] = ${entry};`,
    )
    .filter((line) => line !== "")
    .join("\n");
  const spliceInvocation =
    testCase.spliceArguments === "none"
      ? "Array.prototype.toSpliced.call(subject)"
      : testCase.spliceArguments === "start"
        ? `Array.prototype.toSpliced.call(subject, ${testCase.start})`
        : testCase.spliceArguments === "undefined"
          ? "Array.prototype.toSpliced.call(subject, undefined)"
          : `Array.prototype.toSpliced.call(\n` +
            `  subject, ${testCase.start}, ${testCase.deleteCount}` +
            `${testCase.items.map((item) => `, ${item}`).join("")}\n)`;
  const invocation =
    testCase.method === "toReversed"
      ? "Array.prototype.toReversed.call(subject)"
      : testCase.method === "toSpliced"
        ? spliceInvocation
        : `Array.prototype.with.call(` +
          `subject, ${testCase.index}, ${testCase.value})`;
  return `
const subject = ${subject};
subject.length = ${testCase.entries.length};
${assignments}
Object.defineProperty(subject, "constructor", {
  get() { console.log("constructor"); return Array; },
});
const result = ${invocation};
console.log("same", result === subject);
console.log("array", Array.isArray(result));
console.log("prototype", Object.getPrototypeOf(result) === Array.prototype);
console.log("length", result.length);
for (let index = 0; index < 9; index = index + 1) {
  const present = Object.prototype.hasOwnProperty.call(result, index);
  console.log("result", index, present, present ? String(result[index]) : "-");
}
console.log("source length", subject.length);
for (let index = 0; index < 6; index = index + 1) {
  const present = Object.prototype.hasOwnProperty.call(subject, index);
  console.log("source", index, present, present ? String(subject[index]) : "-");
}
/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayChangeByCopyPropertyMarker = 1;
  turn = turn + 1;
}
`;
}

function get(entry: Entry): number | undefined {
  return entry === "hole" ? undefined : entry;
}

function clampedStart(start: number, length: number): number {
  if (start < 0) return Math.max(length + start, 0);
  return Math.min(start, length);
}

function expectedResult(
  testCase: ChangeByCopyCase,
): readonly (number | undefined)[] {
  if (testCase.method === "toReversed") {
    const result: (number | undefined)[] = [];
    for (let index = testCase.entries.length - 1; index >= 0; index -= 1) {
      result.push(get(testCase.entries[index] ?? "hole"));
    }
    return result;
  }
  if (testCase.method === "with") {
    const actualIndex =
      testCase.index < 0
        ? testCase.entries.length + testCase.index
        : testCase.index;
    return testCase.entries.map((entry, index) =>
      index === actualIndex ? testCase.value : get(entry),
    );
  }
  const start =
    testCase.spliceArguments === "none" ||
    testCase.spliceArguments === "undefined"
      ? 0
      : clampedStart(testCase.start, testCase.entries.length);
  const deleteCount =
    testCase.spliceArguments === "none"
      ? 0
      : testCase.spliceArguments === "full"
        ? Math.min(
            Math.max(testCase.deleteCount, 0),
            testCase.entries.length - start,
          )
        : testCase.entries.length - start;
  const result: (number | undefined)[] = [];
  for (let index = 0; index < start; index += 1) {
    result.push(get(testCase.entries[index] ?? "hole"));
  }
  if (testCase.spliceArguments === "full") {
    result.push(...testCase.items);
  }
  for (
    let index = start + deleteCount;
    index < testCase.entries.length;
    index += 1
  ) {
    result.push(get(testCase.entries[index] ?? "hole"));
  }
  return result;
}

function expected(testCase: ChangeByCopyCase): string {
  const result = expectedResult(testCase);
  const lines = [
    "same false",
    "array true",
    "prototype true",
    `length ${result.length}`,
  ];
  for (let index = 0; index < 9; index += 1) {
    const present = index < result.length;
    const value = present ? result[index] : undefined;
    lines.push(
      `result ${index} ${String(present)} ` +
        `${present ? String(value) : "-"}`,
    );
  }
  lines.push(`source length ${testCase.entries.length}`);
  for (let index = 0; index < 6; index += 1) {
    const entry = testCase.entries[index];
    const present = index < testCase.entries.length && entry !== "hole";
    lines.push(
      `source ${index} ${String(present)} ` +
        `${present ? String(entry) : "-"}`,
    );
  }
  lines.push("hint h", "false hint m", "guard g", "guard g", "guard g", "");
  return lines.join("\n");
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory(
    "oseo-array-change-by-copy-property-",
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
  "generated Array change-by-copy methods match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Array change-by-copy methods agree",
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
            { source, sourceId: "generated-m5-array-change-by-copy.ts" },
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
                target: nativeTarget!,
                toolchain: nativeToolchain,
              },
              (native) => {
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "disabled") {
                  assert.equal(native.counters.guardHits, 0);
                  assert.equal(native.counters.guardMisses, 0);
                } else {
                  assert.ok(native.counters.guardHits > 0);
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
          "with, toSpliced, and toReversed over one to six sparse Array or " +
          "ordinary array-like entries, bounded replacement and insertion " +
          "values, omitted and explicit splice arguments, clamped start and " +
          "delete counts, negative with indices, " +
          "a constructor read that no method may perform, false hints, and " +
          "a deliberate shape-guard miss",
        numRuns: 12,
        profile: "M5 Array prototype change by copy",
        seed: 0x6000_7700,
        sizeLimit:
          "at most six source indices, three inserted values, nine result " +
          "observations, and eight hint or guard observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
