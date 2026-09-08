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

type Entry = number | "hole" | "undefined";
type IteratorMethod = "entries" | "keys" | "values";
type ReceiverKind = "array" | "object";
type MutationKind = "append" | "none" | "truncate";

interface IteratorCase {
  readonly entries: readonly Entry[];
  readonly method: IteratorMethod;
  readonly mutation: MutationKind;
  readonly receiver: ReceiverKind;
}

const caseArbitrary: fc.Arbitrary<IteratorCase> = fc.record({
  entries: fc.array(
    fc.oneof(
      fc.integer({ max: 4, min: -2 }),
      fc.constant<Entry>("hole"),
      fc.constant<Entry>("undefined"),
    ),
    { maxLength: 6 },
  ),
  method: fc.constantFrom<IteratorMethod>("entries", "keys", "values"),
  mutation: fc.constantFrom<MutationKind>("append", "none", "truncate"),
  receiver: fc.constantFrom<ReceiverKind>("array", "object"),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function assignment(entry: Entry, index: number): string {
  if (entry === "hole") return "";
  if (entry === "undefined") return `subject[${index}] = undefined;`;
  return `subject[${index}] = ${entry};`;
}

function printCase(testCase: IteratorCase): string {
  const subject = testCase.receiver === "array" ? "[]" : "{}";
  const assignments = testCase.entries
    .map(assignment)
    .filter((line) => line !== "")
    .join("\n");
  const mutation =
    testCase.mutation === "append"
      ? testCase.receiver === "array"
        ? `subject[subject.length] = 9;`
        : `subject[subject.length] = 9;
subject.length = subject.length + 1;`
      : testCase.mutation === "truncate"
        ? `subject.length = 1;`
        : "";
  return `
const subject = ${subject};
subject.length = ${testCase.entries.length};
${assignments}
const iterator = Array.prototype.${testCase.method}.call(subject);
let step = iterator.next();
printStep(step);
${mutation}
while (!step.done) {
  step = iterator.next();
  printStep(step);
}
subject[subject.length] = 10;
printStep(iterator.next());
function printStep(result) {
  if (Array.isArray(result.value)) {
    console.log(
      result.value[0] + ":" + String(result.value[1]),
      result.done,
    );
  } else {
    console.log(String(result.value), result.done);
  }
}
/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayIteratorPropertyMarker = 1;
  turn = turn + 1;
}
const originalIs = Object.is;
turn = 0;
while (turn < 3) {
  console.log("shape", Object.is === originalIs);
  if (turn === 1) Object.arrayIteratorPropertyMarker = 1;
  turn = turn + 1;
}
`;
}

function entryText(entry: Entry): string {
  return entry === "hole" || entry === "undefined"
    ? "undefined"
    : String(entry);
}

function yielded(method: IteratorMethod, entry: Entry, index: number): string {
  if (method === "keys") return String(index);
  const value = entryText(entry);
  return method === "entries" ? `${index}:${value}` : value;
}

/**
 * This independent model advances one cursor against a length read on every
 * step, yields holes as undefined for value-bearing kinds, applies the one
 * mutation after the first step, and closes permanently after exhaustion.
 */
function expected(testCase: IteratorCase): string {
  const entries = [...testCase.entries];
  const lines: string[] = [];
  let length = entries.length;
  let index = 0;
  let done = false;
  const step = (): void => {
    if (done || index >= length) {
      done = true;
      lines.push("undefined true");
      return;
    }
    lines.push(`${yielded(testCase.method, entries[index]!, index)} false`);
    index += 1;
  };
  step();
  if (testCase.mutation === "append") {
    entries[length] = 9;
    length += 1;
  } else if (testCase.mutation === "truncate") {
    length = 1;
  }
  for (let attempts = 0; attempts <= entries.length; attempts += 1) {
    if (done) break;
    step();
  }
  step();
  lines.push(
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
    "oseo-array-iterator-property-",
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
  "generated Array iterator methods match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Array iterator methods agree",
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
            {
              source,
              sourceId: "generated-m5-array-iterators.ts",
            },
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
          "entries, keys, and values over zero to six sparse Array or " +
          "ordinary array-like entries that are a bounded integer, an " +
          "explicit undefined, or a hole; live append, truncation, or no " +
          "mutation after the first step; false hints and a deliberate " +
          "shape-guard miss",
        numRuns: 12,
        profile: "M5 Array prototype iterators",
        seed: 0x6000_6400,
        sizeLimit:
          "at most seven yielded indices, two terminal steps, and eight " +
          "hint or guard observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
