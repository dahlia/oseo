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

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

const wellKnownNames = [
  "asyncIterator",
  "hasInstance",
  "isConcatSpreadable",
  "iterator",
  "match",
  "matchAll",
  "replace",
  "search",
  "species",
  "split",
  "toPrimitive",
  "toStringTag",
  "unscopables",
] as const;

interface WellKnownSymbolCase {
  readonly first: number;
  readonly order: readonly number[];
  readonly second: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const symbolIndex = fc.integer({ max: wellKnownNames.length - 1, min: 0 });
const caseArbitrary: fc.Arbitrary<WellKnownSymbolCase> = fc.record({
  first: symbolIndex,
  order: fc.uniqueArray(symbolIndex, { maxLength: 6, minLength: 1 }),
  second: symbolIndex,
});

function printCase(testCase: WellKnownSymbolCase): string {
  const observations = testCase.order
    .map((index, position) => {
      const name = wellKnownNames[index];
      return `
const value${position} = Symbol.${name};
const descriptor${position} = Object.getOwnPropertyDescriptor(
  Symbol,
  ${JSON.stringify(name)},
);
console.log(
  ${JSON.stringify(name)},
  typeof value${position},
  value${position},
  value${position} === Symbol.${name},
  descriptor${position}.writable,
  descriptor${position}.enumerable,
  descriptor${position}.configurable,
);`;
    })
    .join("\n");
  const first = wellKnownNames[testCase.first];
  const second = wellKnownNames[testCase.second];
  return `${observations}
console.log("pair", Symbol.${first} === Symbol.${second});
`;
}

function expected(testCase: WellKnownSymbolCase): string {
  const observations = testCase.order.map((index) => {
    const name = wellKnownNames[index];
    return `${name} symbol Symbol(Symbol.${name}) true false false false`;
  });
  observations.push(
    `pair ${testCase.first === testCase.second ? "true" : "false"}`,
  );
  return `${observations.join("\n")}\n`;
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
    "oseo-well-known-symbol-property-",
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

test("well-known symbol model fixes names and descriptions", () => {
  assert.equal(wellKnownNames.length, 13);
  assert.equal(wellKnownNames[0], "asyncIterator");
  assert.equal(wellKnownNames[12], "unscopables");
});

test(
  "generated well-known symbols match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "well-known symbols preserve identity, description, and descriptors",
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
            { source, sourceId: "generated-m5-well-known-symbols.ts" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
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
              (native) =>
                assertMatchingObservations([expectedObservation, native]),
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
          "one to six distinct members of the 13-symbol edition table, " +
          "plus an arbitrary identity comparison",
        numRuns: 16,
        profile: "M5 well-known symbol table",
        seed: 0x6000_3000,
        sizeLimit: "at most six table members per generated program",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
