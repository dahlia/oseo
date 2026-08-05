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

type MethodTarget =
  | "object"
  | "class-prototype"
  | "class-static"
  | "class-private";

interface GeneratorMethodCase {
  readonly target: MethodTarget;
  readonly baseValue: number;
  readonly steps: readonly number[];
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const caseArbitrary: fc.Arbitrary<GeneratorMethodCase> = fc.record({
  baseValue: fc.integer({ max: 100, min: -100 }),
  steps: fc.array(fc.integer({ max: 50, min: -50 }), {
    maxLength: 4,
    minLength: 1,
  }),
  target: fc.constantFrom<MethodTarget>(
    "object",
    "class-prototype",
    "class-static",
    "class-private",
  ),
});

function synthesizeSource(c: GeneratorMethodCase): string {
  const yields = c.steps.map((s) => `yield ${s} + base;`).join("\n");
  if (c.target === "object") {
    return `
      const base = ${c.baseValue};
      const holder = {
        *m() {
          ${yields}
        }
      };
      for (const val of holder.m()) {
        console.log(val);
      }
    `;
  }
  if (c.target === "class-prototype") {
    return `
      const base = ${c.baseValue};
      class C {
        *m() {
          ${yields}
        }
      }
      const inst = new C();
      for (const val of inst.m()) {
        console.log(val);
      }
    `;
  }
  if (c.target === "class-static") {
    return `
      const base = ${c.baseValue};
      class C {
        static *m() {
          ${yields}
        }
      }
      for (const val of C.m()) {
        console.log(val);
      }
    `;
  }
  return `
    const base = ${c.baseValue};
    class C {
      *#m() {
        ${yields}
      }
      run() {
        for (const val of this.#m()) {
          console.log(val);
        }
      }
    }
    new C().run();
  `;
}

test(
  "generator method definitions match Node.js and Deno",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "generator method definitions match Node.js and Deno",
      fc.asyncProperty(caseArbitrary, async (testCase: GeneratorMethodCase) => {
        const source = synthesizeSource(testCase);
        const compiled = compileSource(babelFrontend, {
          source,
          sourceId: "test.js",
        });
        assert.ok(compiled.mir != null, "Source must compile to MIR");
        const expectedStdout = testCase.steps
          .map((s) => `${s + testCase.baseValue}\n`)
          .join("");

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
                stdout: expectedStdout,
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
          "generator method definitions in object literals and class bodies " +
          "(prototype, static, private), comparing Node.js, Deno, and native",
        numRuns: 15,
        profile: "M5 generator method definitions",
        seed: 0x6000_1900,
        sizeLimit: "small generator methods with yield sequences",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
