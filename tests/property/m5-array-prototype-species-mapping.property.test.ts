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

type MappingMethod = "filter" | "map";
type ReceiverKind = "array" | "object";
type SpeciesKind = "custom" | "null" | "undefined";

interface MappingCase {
  readonly entries: readonly (number | null)[];
  readonly method: MappingMethod;
  readonly offset: number;
  readonly receiver: ReceiverKind;
  readonly species: SpeciesKind;
  readonly threshold: number;
}

const caseArbitrary: fc.Arbitrary<MappingCase> = fc.record({
  entries: fc.array(fc.option(fc.integer({ max: 9, min: -9 }), { nil: null }), {
    maxLength: 4,
  }),
  method: fc.constantFrom<MappingMethod>("filter", "map"),
  offset: fc.integer({ max: 5, min: -5 }),
  receiver: fc.constantFrom<ReceiverKind>("array", "object"),
  species: fc.constantFrom<SpeciesKind>("custom", "null", "undefined"),
  threshold: fc.integer({ max: 7, min: -7 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function speciesSource(kind: SpeciesKind): string {
  switch (kind) {
    case "custom":
      return "Species";
    case "null":
      return "null";
    case "undefined":
      return "undefined";
  }
}

function printCase(testCase: MappingCase): string {
  const assignments = testCase.entries
    .map((value, index) =>
      value == null ? "" : `subject[${index}] = ${value};`,
    )
    .join("\n");
  const subject = testCase.receiver === "array" ? "[]" : "{}";
  const callbackResult =
    testCase.method === "map"
      ? `value + ${testCase.offset}`
      : `value < ${testCase.threshold}`;
  return `
const subject = ${subject};
subject.length = ${testCase.entries.length};
${assignments}
function Species(length) {
  console.log("construct", length);
  this.requestedLength = length;
}
const holder = {};
Object.defineProperty(holder, Symbol.species, {
  get() { console.log("species"); return ${speciesSource(testCase.species)}; },
});
Object.defineProperty(subject, "constructor", {
  get() { console.log("constructor"); return holder; },
});
const marker = { marker: true };
const result = Array.prototype.${testCase.method}.call(
  subject,
  function (value, index, object) {
    console.log("call", value, index, object === subject, this === marker);
    return ${callbackResult};
  },
  marker,
);
console.log(
  "result",
  Array.isArray(result),
  result instanceof Species,
  result.requestedLength,
  result.length,
);
for (let index = 0; index < ${testCase.entries.length}; index = index + 1) {
  console.log(
    "entry",
    index,
    Object.prototype.hasOwnProperty.call(result, String(index)),
    result[index],
  );
}
/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
console.log("guard", hinted("guard"));
String.prototype.speciesMappingPropertyMarker = 1;
console.log("guard", hinted("guard"));
`;
}

function expected(testCase: MappingCase): string {
  const custom = testCase.receiver === "array" && testCase.species === "custom";
  const lines: string[] = [];
  if (testCase.receiver === "array") {
    lines.push("constructor", "species");
    if (custom) {
      lines.push(
        `construct ${testCase.method === "map" ? testCase.entries.length : 0}`,
      );
    }
  }
  const output: (number | undefined)[] = [];
  for (let index = 0; index < testCase.entries.length; index += 1) {
    const value = testCase.entries[index];
    if (value == null) continue;
    lines.push(`call ${value} ${index} true true`);
    if (testCase.method === "map") {
      output[index] = value + testCase.offset;
    } else if (value < testCase.threshold) {
      output.push(value);
    }
  }
  const resultLength = custom
    ? "undefined"
    : String(
        testCase.method === "map" ? testCase.entries.length : output.length,
      );
  const requestedLength = custom
    ? testCase.method === "map"
      ? testCase.entries.length
      : 0
    : "undefined";
  lines.push(
    `result ${String(!custom)} ${String(custom)} ` +
      `${requestedLength} ${resultLength}`,
  );
  for (let index = 0; index < testCase.entries.length; index += 1) {
    lines.push(
      `entry ${index} ${String(index in output)} ` + String(output[index]),
    );
  }
  lines.push("hint h", "false hint m", "guard g", "guard g", "");
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
    "oseo-array-species-mapping-property-",
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
  "generated Array species mapping matches the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Array species mapping methods agree",
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
            { source, sourceId: "generated-m5-array-species-mapping.ts" },
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
          "map and filter over zero to four sparse array or ordinary " +
          "array-like entries; default, null, and custom species; bounded " +
          "integer mapping and selection; callback receiver and argument " +
          "identity; a false string hint and one deliberate shape-guard miss",
        numRuns: 16,
        profile: "M5 Array prototype species mapping",
        seed: 0x6000_4400,
        sizeLimit:
          "at most four initial indices, one constructor and species read, " +
          "one mapping callback per present entry, four hint observations, " +
          "and one result entry observation per initial index",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
