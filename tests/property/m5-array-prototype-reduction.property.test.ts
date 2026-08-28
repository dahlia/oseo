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
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type EntryKind = number | "hole" | "undefined";
type InitialKind = "none" | "undefined" | "value";
type ReceiverKind = "array" | "object";
type ReductionMethod = "reduce" | "reduceRight";

interface ReductionCase {
  readonly entries: readonly EntryKind[];
  readonly initial: InitialKind;
  readonly method: ReductionMethod;
  readonly receiver: ReceiverKind;
}

const caseArbitrary: fc.Arbitrary<ReductionCase> = fc.record({
  entries: fc.array(
    fc.oneof(
      fc.integer({ max: 3, min: 0 }),
      fc.constant<EntryKind>("hole"),
      fc.constant<EntryKind>("undefined"),
    ),
    { maxLength: 6 },
  ),
  initial: fc.constantFrom<InitialKind>("none", "undefined", "value"),
  method: fc.constantFrom<ReductionMethod>("reduce", "reduceRight"),
  receiver: fc.constantFrom<ReceiverKind>("array", "object"),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const initialArguments = {
  none: "",
  undefined: ",\n  undefined,",
  value: ',\n  "init",',
} satisfies Readonly<Record<InitialKind, string>>;

function printCase(testCase: ReductionCase): string {
  const subject = testCase.receiver === "array" ? "[]" : "{}";
  const assignments = testCase.entries
    .map((entry, index) => {
      if (entry === "hole") return "";
      if (entry === "undefined") return `subject[${index}] = undefined;`;
      return `subject[${index}] = ${entry};`;
    })
    .filter((line) => line !== "")
    .join("\n");
  return `
const subject = ${subject};
subject.length = ${testCase.entries.length};
${assignments}
Object.defineProperty(subject, "constructor", {
  get() { console.log("constructor"); return Array; },
});
let calls = 0;
const callback = (accumulator, value, index, source) => {
  calls = calls + 1;
  console.log(
    "call",
    index,
    String(value),
    String(accumulator),
    source === subject,
  );
  return String(accumulator) + "|" + String(value) + "@" + index;
};
try {
  const result = Array.prototype.${testCase.method}.call(
    subject,
    callback${initialArguments[testCase.initial]}
  );
  console.log("result", String(result));
} catch (error) {
  console.log("type error", error instanceof TypeError);
}
console.log("calls", calls);
/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayReductionPropertyMarker = 1;
  turn = turn + 1;
}
const originalIs = Object.is;
turn = 0;
while (turn < 3) {
  console.log("shape", Object.is === originalIs);
  if (turn === 1) Object.arrayReductionPropertyMarker = 1;
  turn = turn + 1;
}
`;
}

function entryText(entry: EntryKind): string {
  return entry === "undefined" ? "undefined" : String(entry);
}

/**
 * The independent model of the reduction loop: traversal order is
 * ascending for reduce and descending for reduceRight, holes are skipped,
 * a missing initial value is replaced by the first present element in
 * traversal order, and a traversal that ends without an accumulator
 * throws a TypeError. The trace is replayed step by step here rather
 * than delegated to a host reduce call.
 */
function expected(testCase: ReductionCase): string {
  const lines: string[] = [];
  const indices = testCase.entries
    .map((_, index) => index)
    .filter((index) => testCase.entries[index] !== "hole");
  if (testCase.method === "reduceRight") indices.reverse();
  let accumulator: string | undefined;
  let seeded = false;
  if (testCase.initial === "value") {
    accumulator = "init";
    seeded = true;
  } else if (testCase.initial === "undefined") {
    accumulator = "undefined";
    seeded = true;
  }
  let calls = 0;
  for (const index of indices) {
    const value = entryText(testCase.entries[index]!);
    if (!seeded) {
      accumulator = value;
      seeded = true;
      continue;
    }
    calls += 1;
    lines.push(`call ${index} ${value} ${accumulator} true`);
    accumulator = `${accumulator}|${value}@${index}`;
  }
  lines.push(seeded ? `result ${accumulator}` : "type error true");
  lines.push(
    `calls ${calls}`,
    "hint h",
    "false hint m",
    "guard g",
    "guard g",
    "guard g",
    "shape true",
    "shape true",
    "shape true",
    "",
  );
  return lines.join("\n");
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory(
    "oseo-array-reduction-property-",
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
  "generated Array reduction methods match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Array reduction methods agree",
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
            { source, sourceId: "generated-m5-array-reduction.ts" },
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
                toolchain: zigToolchain,
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
          "reduce and reduceRight over zero to six sparse array or " +
          "ordinary array-like entries that are a small integer, an " +
          "explicit undefined, or a hole; a missing, explicit-undefined, " +
          "or string initial value; a traced callback observing " +
          "accumulator, element, index, and receiver identity; the " +
          "empty-traversal TypeError; a constructor read that neither " +
          "method may perform; false hints and a deliberate shape-guard " +
          "miss",
        numRuns: 10,
        profile: "M5 Array prototype reduction",
        seed: 0x6000_5700,
        sizeLimit:
          "at most six source indices, one traced line per callback " +
          "call, and eight hint or guard observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
