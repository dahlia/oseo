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

type ReceiverKind = "coercible" | "primitive" | "wrapper";
type StringPart = "ascii" | "bmp" | "lead" | "pair" | "trail";

interface StringIteratorCase {
  readonly parts: readonly StringPart[];
  readonly receiver: ReceiverKind;
}

const caseArbitrary: fc.Arbitrary<StringIteratorCase> = fc.record({
  parts: fc.array(
    fc.constantFrom<StringPart>("ascii", "bmp", "lead", "pair", "trail"),
    { maxLength: 8 },
  ),
  receiver: fc.constantFrom<ReceiverKind>("coercible", "primitive", "wrapper"),
});

const partText = {
  ascii: "a",
  bmp: "한",
  lead: "\ud834",
  pair: "\ud834\udf06",
  trail: "\udf06",
} satisfies Record<StringPart, string>;

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printCase(testCase: StringIteratorCase): string {
  const text = testCase.parts.map((part) => partText[part]).join("");
  const literal = JSON.stringify(text);
  const receiver =
    testCase.receiver === "primitive"
      ? literal
      : testCase.receiver === "wrapper"
        ? `new String(${literal})`
        : `{ toString() { console.log("coerce"); return ${literal}; } }`;
  return `
const subject = ${receiver};
const iterator = String.prototype[Symbol.iterator].call(subject);
let step;
do {
  step = iterator.next();
  printStep(step);
} while (!step.done);
printStep(iterator.next());
function printStep(result) {
  const value = result.value;
  console.log(
    value === undefined ? "undefined" : value.length,
    value === undefined ? -1 : value.charCodeAt(0),
    value === undefined || value.length < 2 ? -1 : value.charCodeAt(1),
    result.done,
  );
}
/** @param {string} value */
function hinted(value) {
  return value[Symbol.iterator]().next().value;
}
printStep({ value: hinted("hit"), done: false });
printStep({ value: hinted(new String("miss")), done: false });
let turn = 0;
while (turn < 3) {
  printStep({ value: hinted("guard"), done: false });
  if (turn === 1) String.prototype.stringIteratorPropertyMarker = 1;
  turn = turn + 1;
}
const originalIs = Object.is;
turn = 0;
while (turn < 3) {
  console.log(Object.is === originalIs);
  if (turn === 1) Object.stringIteratorPropertyMarker = 1;
  turn = turn + 1;
}
`;
}

function stepLine(value: string | undefined, done: boolean): string {
  if (value === undefined) return `undefined -1 -1 ${done}`;
  const second = value.length < 2 ? -1 : value.charCodeAt(1);
  return `${value.length} ${value.charCodeAt(0)} ${second} ${done}`;
}

/** Independent UTF-16 cursor model for StringIteratorNext. */
function expected(testCase: StringIteratorCase): string {
  const text = testCase.parts.map((part) => partText[part]).join("");
  const lines: string[] = [];
  if (testCase.receiver === "coercible") lines.push("coerce");
  let cursor = 0;
  while (cursor < text.length) {
    const first = text.charCodeAt(cursor);
    let length = 1;
    if (first >= 0xd800 && first <= 0xdbff && cursor + 1 < text.length) {
      const second = text.charCodeAt(cursor + 1);
      if (second >= 0xdc00 && second <= 0xdfff) length = 2;
    }
    lines.push(stepLine(text.slice(cursor, cursor + length), false));
    cursor += length;
  }
  lines.push(
    stepLine(undefined, true),
    stepLine(undefined, true),
    stepLine("h", false),
    stepLine("m", false),
    stepLine("g", false),
    stepLine("g", false),
    stepLine("g", false),
    "true",
    "true",
    "true",
    "",
  );
  return lines.join("\n");
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory(
    "oseo-string-iterator-property-",
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
  "generated String iterators match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "String iterator traversal agrees",
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
              sourceId: "generated-m5-string-iterator.ts",
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
          "zero to eight ASCII, BMP, surrogate-pair, lone-leading, or " +
          "lone-trailing parts through a primitive, wrapper, or coercible " +
          "receiver; false hints and deliberate shape-guard misses",
        numRuns: 12,
        profile: "M5 String iterator",
        seed: 0x6000_6900,
        sizeLimit:
          "at most sixteen UTF-16 code units, two terminal steps, and nine " +
          "hint or guard observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
