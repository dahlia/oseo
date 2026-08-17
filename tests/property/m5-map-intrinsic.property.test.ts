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

type MapOperationKind = "clear" | "delete" | "get" | "has" | "set";

interface MapOperation {
  readonly keyIndex: number;
  readonly kind: MapOperationKind;
  readonly valueIndex: number;
}

interface MapIntrinsicCase {
  readonly operations: readonly MapOperation[];
}

/**
 * Six admitted keys covering SameValueZero's two collapsing cases
 * (`0` and `-0`, which the model group under canonical id `0`) beside
 * NaN, a string, and two distinct object identities.
 */
const keyExpressions: readonly string[] = [
  "0",
  "-0",
  "NaN",
  '"k"',
  "objectA",
  "objectB",
];
const keyDisplay: readonly string[] = [
  "0",
  "0",
  "NaN",
  "k",
  "objectA",
  "objectB",
];
const valueExpressions: readonly string[] = ["10", "20", "30"];

function canonicalKeyId(keyIndex: number): number {
  return keyIndex <= 1 ? 0 : keyIndex;
}

const operationArbitrary: fc.Arbitrary<MapOperation> = fc.record({
  keyIndex: fc.integer({ max: keyExpressions.length - 1, min: 0 }),
  kind: fc.constantFrom<MapOperationKind>(
    "set",
    "get",
    "has",
    "delete",
    "clear",
  ),
  valueIndex: fc.integer({ max: valueExpressions.length - 1, min: 0 }),
});

const caseArbitrary: fc.Arbitrary<MapIntrinsicCase> = fc.record({
  operations: fc.array(operationArbitrary, { maxLength: 8, minLength: 1 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printCase(testCase: MapIntrinsicCase): string {
  const lines = [
    "const objectA = {};",
    "const objectB = {};",
    "const map = new Map();",
    "function label(key) {",
    '  if (key === objectA) return "objectA";',
    '  if (key === objectB) return "objectB";',
    "  return String(key);",
    "}",
    "function joinList(list, separator) {",
    '  let result = "";',
    "  let index = 0;",
    "  for (const item of list) {",
    "    if (index > 0) result = result + separator;",
    "    result = result + item;",
    "    index = index + 1;",
    "  }",
    "  return result;",
    "}",
  ];
  testCase.operations.forEach((operation, index) => {
    const key = keyExpressions[operation.keyIndex];
    const value = valueExpressions[operation.valueIndex];
    if (operation.kind === "set") {
      lines.push(
        `console.log("op", ${index}, "set", ` +
          `map.set(${key}, ${value}) === map, map.size);`,
      );
    } else if (operation.kind === "get") {
      lines.push(`console.log("op", ${index}, "get", map.get(${key}));`);
    } else if (operation.kind === "has") {
      lines.push(`console.log("op", ${index}, "has", map.has(${key}));`);
    } else if (operation.kind === "delete") {
      lines.push(
        `console.log("op", ${index}, "delete", map.delete(${key}), ` +
          "map.size);",
      );
    } else {
      lines.push(`map.clear();`);
      lines.push(`console.log("op", ${index}, "clear", map.size);`);
    }
  });
  lines.push(
    "console.log(" +
      '"order", ' +
      'joinList([...map].map(([k, v]) => label(k) + ":" + v), ","), ' +
      "map.size);",
  );
  lines.push("const originalGet = Map.prototype.get;");
  lines.push('console.log("guard", Map.prototype.get === originalGet);');
  return lines.join("\n");
}

/**
 * Replays the same operation sequence against a plain array model of
 * `[[MapData]]`, matching the tombstone-in-place delete and the
 * append-only insertion order the C runtime implements, so this model
 * is an independent oracle rather than a second read of the runtime
 * under test.
 */
function expected(testCase: MapIntrinsicCase): string {
  interface Entry {
    readonly canonical: number;
    live: boolean;
    readonly storedKeyIndex: number;
    value: number;
  }
  const entries: Entry[] = [];
  const lines: string[] = [];
  function find(canonical: number): Entry | undefined {
    return entries.find((entry) => entry.live && entry.canonical === canonical);
  }
  testCase.operations.forEach((operation, index) => {
    const canonical = canonicalKeyId(operation.keyIndex);
    const value = Number(valueExpressions[operation.valueIndex]);
    if (operation.kind === "set") {
      const existing = find(canonical);
      if (existing != null) {
        existing.value = value;
      } else {
        entries.push({
          canonical,
          live: true,
          storedKeyIndex: operation.keyIndex,
          value,
        });
      }
      const liveCount = entries.filter((entry) => entry.live).length;
      lines.push(`op ${index} set true ${liveCount}`);
    } else if (operation.kind === "get") {
      const existing = find(canonical);
      const resultValue = existing == null ? "undefined" : existing.value;
      lines.push(`op ${index} get ${resultValue}`);
    } else if (operation.kind === "has") {
      lines.push(`op ${index} has ${find(canonical) != null}`);
    } else if (operation.kind === "delete") {
      const existing = find(canonical);
      if (existing != null) existing.live = false;
      const size = entries.filter((entry) => entry.live).length;
      lines.push(`op ${index} delete ${existing != null} ${size}`);
    } else {
      for (const entry of entries) entry.live = false;
      lines.push(`op ${index} clear 0`);
    }
  });
  const live = entries.filter((entry) => entry.live);
  const order = live
    .map((entry) => `${keyDisplay[entry.storedKeyIndex]}:${entry.value}`)
    .join(",");
  lines.push(`order ${order} ${live.length}`);
  lines.push("guard true");
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
    "oseo-map-intrinsic-property-",
  );
  const sourcePath = `${directory}/case.ts`;
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

test(
  "generated Map operation sequences match the M5 [[MapData]] model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Map keeps SameValueZero identity, insertion order, and " +
        "in-place tombstone deletion across a generated operation sequence",
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
            { source, sourceId: "generated-m5-map-intrinsic.ts" },
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
          "one to eight set, get, has, delete, or clear operations over " +
          "six admitted keys (canonical zero, NaN, a string, and two " +
          "distinct object identities) and three values, plus a " +
          "constructor property-cache shape guard miss",
        numRuns: 12,
        profile: "M5 Map intrinsic",
        seed: 0x6000_4800,
        sizeLimit:
          "at most eight [[MapData]] mutations or reads, one final " +
          "insertion-order snapshot, and one repeated intrinsic property " +
          "observation",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
