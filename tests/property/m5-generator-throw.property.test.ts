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

interface ThrowCase {
  readonly catching: boolean;
  readonly throwValue: number;
  readonly yieldValue: number;
}

function synthesizeSource(testCase: ThrowCase): string {
  if (testCase.catching) {
    return `
function* gen() {
  try {
    yield ${testCase.yieldValue};
  } catch (error) {
    return "caught:" + error;
  }
}
const g = gen();
console.log(g.next().value);
console.log(g.throw(${testCase.throwValue}).value);
`;
  }
  return `
function* gen() {
  yield ${testCase.yieldValue};
}
const g = gen();
console.log(g.next().value);
try {
  g.throw(${testCase.throwValue});
} catch (error) {
  console.log("uncaught:" + error);
}
`;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

test(
  "generator throw resumptions match Node.js and Deno",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const generator = fc.record({
      catching: fc.boolean(),
      throwValue: fc.integer({ max: 1000, min: -1000 }),
      yieldValue: fc.integer({ max: 1000, min: -1000 }),
    });

    await assertAsyncProperty(
      "generator throw resumptions match Node.js and Deno",
      fc.asyncProperty(generator, async (testCase: ThrowCase) => {
        const source = synthesizeSource(testCase);
        const compiled = compileSource(babelFrontend, {
          source,
          sourceId: "test.js",
        });
        assert.ok(compiled.mir != null, "Source must compile to MIR");
        await withNativeFixture(
          {
            backend: cBackend,
            host,
            input: compiled.mir,
            keepArtifacts: process.env.OSEO_KEEP_ARTIFACTS === "1",
            operation: "execute",
            runtime: cRuntimeProvider,
            target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
            toolchain: zigToolchain,
          },
          (native) => {
            assertMatchingObservations([
              {
                exitStatus: 0,
                stderr: "",
                stdout: testCase.catching
                  ? `${testCase.yieldValue}\ncaught:${testCase.throwValue}\n`
                  : `${testCase.yieldValue}\nuncaught:${testCase.throwValue}\n`,
              },
              native,
            ]);
          },
        );
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
          "generator functions with try/catch and try/finally yield points, " +
          "resumed with g.throw(val), comparing Node.js, Deno, and native",
        numRuns: 15,
        profile: "M5 generator throw resumptions",
        seed: 0x5eed_0017,
        sizeLimit: "single yield with catching or uncaught throw",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
