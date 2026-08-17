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

type CopyMethod =
  | "concat"
  | "flat"
  | "flatMap"
  | "join"
  | "slice"
  | "toLocaleString"
  | "toString";
type ReceiverKind = "array" | "object";
type SpeciesKind = "custom" | "null";

interface CopyCase {
  readonly end: number;
  readonly entries: readonly (number | null)[];
  readonly extra: readonly (number | null)[];
  readonly method: CopyMethod;
  readonly offset: number;
  readonly receiver: ReceiverKind;
  readonly separator: string;
  readonly species: SpeciesKind;
  readonly start: number;
}

const caseArbitrary: fc.Arbitrary<CopyCase> = fc.record({
  end: fc.integer({ max: 7, min: -7 }),
  entries: fc.array(fc.option(fc.integer({ max: 9, min: -9 }), { nil: null }), {
    maxLength: 5,
  }),
  extra: fc.array(fc.option(fc.integer({ max: 9, min: -9 }), { nil: null }), {
    maxLength: 3,
  }),
  method: fc.constantFrom<CopyMethod>(
    "concat",
    "flat",
    "flatMap",
    "join",
    "slice",
    "toLocaleString",
    "toString",
  ),
  offset: fc.integer({ max: 4, min: -4 }),
  receiver: fc.constantFrom<ReceiverKind>("array", "object"),
  separator: fc.constantFrom(",", "|", "::"),
  species: fc.constantFrom<SpeciesKind>("custom", "null"),
  start: fc.integer({ max: 7, min: -7 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function assignments(
  name: string,
  values: readonly (number | null)[],
  locale = false,
): string {
  return values
    .map((value, index) => {
      if (value == null) return "";
      const expression = locale
        ? `{ toLocaleString() { return ${JSON.stringify(String(value))}; } }`
        : String(value);
      return `${name}[${index}] = ${expression};`;
    })
    .join("\n");
}

function printCase(testCase: CopyCase): string {
  const subject = testCase.receiver === "array" ? "[]" : "{}";
  const species = testCase.species === "custom" ? "Species" : "null";
  let invocation: string;
  switch (testCase.method) {
    case "concat":
      invocation = "Array.prototype.concat.call(subject, extra)";
      break;
    case "flat":
      invocation = "Array.prototype.flat.call(subject)";
      break;
    case "flatMap":
      invocation = `Array.prototype.flatMap.call(
  subject,
  (value) => [value, value + ${testCase.offset}],
)`;
      break;
    case "join":
      invocation = `Array.prototype.join.call(
  subject,
  ${JSON.stringify(testCase.separator)},
)`;
      break;
    case "slice":
      invocation = `Array.prototype.slice.call(
  subject,
  ${testCase.start},
  ${testCase.end},
)`;
      break;
    case "toLocaleString":
      invocation = "Array.prototype.toLocaleString.call(subject)";
      break;
    case "toString":
      invocation = "Array.prototype.toString.call(subject)";
      break;
  }
  return `
const subject = ${subject};
subject.length = ${testCase.entries.length};
${assignments(
  "subject",
  testCase.entries,
  testCase.method === "toLocaleString",
)}
const extra = [];
extra.length = ${testCase.extra.length};
${assignments("extra", testCase.extra)}
function Species(length) {
  console.log("construct", length);
  this.requestedLength = length;
}
const holder = {};
Object.defineProperty(holder, Symbol.species, {
  get() { console.log("species"); return ${species}; },
});
Object.defineProperty(subject, "constructor", {
  get() { console.log("constructor"); return holder; },
});
if (${JSON.stringify(testCase.method)} === "concat") {
  subject[Symbol.isConcatSpreadable] = true;
}
const result = ${invocation};
if (
  ${JSON.stringify(testCase.method)} === "join" ||
  ${JSON.stringify(testCase.method)} === "toLocaleString" ||
  ${JSON.stringify(testCase.method)} === "toString"
) {
  console.log("string result", result);
} else {
  console.log(
    "result",
    Array.isArray(result),
    result instanceof Species,
    result.requestedLength,
    result.length,
  );
  for (let index = 0; index < 10; index = index + 1) {
    console.log(
      "entry",
      index,
      Object.prototype.hasOwnProperty.call(result, String(index)),
      result[index],
    );
  }
}
/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayCopyingPropertyMarker = 1;
  turn = turn + 1;
}
const originalIs = Object.is;
turn = 0;
while (turn < 3) {
  console.log("shape", Object.is === originalIs);
  if (turn === 1) Object.arrayCopyingPropertyMarker = 1;
  turn = turn + 1;
}
`;
}

function clamp(index: number, length: number): number {
  return index < 0 ? Math.max(length + index, 0) : Math.min(index, length);
}

function expectedValues(testCase: CopyCase): readonly (number | null)[] {
  switch (testCase.method) {
    case "concat":
      return [...testCase.entries, ...testCase.extra];
    case "flat":
      return testCase.entries.filter((value): value is number => value != null);
    case "flatMap":
      return testCase.entries.flatMap((value) =>
        value == null ? [] : [value, value + testCase.offset],
      );
    case "join":
    case "toLocaleString":
    case "toString":
      return [];
    case "slice": {
      const start = clamp(testCase.start, testCase.entries.length);
      const end = clamp(testCase.end, testCase.entries.length);
      return end <= start ? [] : testCase.entries.slice(start, end);
    }
  }
}

function expected(testCase: CopyCase): string {
  const lines: string[] = [];
  const usesSpecies =
    testCase.receiver === "array" &&
    ["concat", "flat", "flatMap", "slice"].includes(testCase.method);
  const values = expectedValues(testCase);
  if (usesSpecies) {
    lines.push("constructor", "species");
    if (testCase.species === "custom") {
      const requested = testCase.method === "slice" ? values.length : 0;
      lines.push(`construct ${requested}`);
    }
  }
  if (testCase.method === "join" || testCase.method === "toLocaleString") {
    const joined = testCase.entries
      .map((value) => (value == null ? "" : String(value)))
      .join(testCase.method === "join" ? testCase.separator : ",");
    lines.push(`string result ${joined}`);
  } else if (testCase.method === "toString") {
    const rendered =
      testCase.receiver === "array"
        ? testCase.entries
            .map((value) => (value == null ? "" : String(value)))
            .join(",")
        : "[object Object]";
    lines.push(`string result ${rendered}`);
  } else {
    const custom = usesSpecies && testCase.species === "custom";
    const requested = custom
      ? testCase.method === "slice"
        ? values.length
        : 0
      : "undefined";
    const length =
      custom && (testCase.method === "flat" || testCase.method === "flatMap")
        ? "undefined"
        : values.length;
    lines.push(
      `result ${String(!custom)} ${String(custom)} ${requested} ${length}`,
    );
    for (let index = 0; index < 10; index += 1) {
      const value = values[index];
      lines.push(
        `entry ${index} ${String(value != null)} ` +
          `${String(value == null ? undefined : value)}`,
      );
    }
  }
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
    "oseo-array-copying-property-",
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
  "generated Array copying methods match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Array copying methods agree",
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
            { source, sourceId: "generated-m5-array-copying.ts" },
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
          "concat, flat, flatMap, join, slice, toLocaleString, and " +
          "toString over zero to five " +
          "sparse array or ordinary array-like numeric entries, with " +
          "locale wrappers for toLocaleString; zero to three " +
          "concat entries; default and custom species; bounded slice " +
          "indices, flatMap offsets, and separators; false hints and a " +
          "deliberate shape-guard miss",
        numRuns: 10,
        profile: "M5 Array prototype copying and flattening",
        seed: 0x6000_4700,
        sizeLimit:
          "at most five source indices, three concat indices, ten result " +
          "observations, one species construction, and eight hint or " +
          "guard observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
