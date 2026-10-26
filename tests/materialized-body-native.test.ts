/* eslint-disable no-await-in-loop -- The native vector is ordered. */
import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import {
  compileSource,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { balancedInteropBackend } from "./helpers/balanced-backend.ts";
import {
  materializedBodySource,
  materializedBodyStdout,
  materializedBodyThrowLine,
  materializedBodyThrowSource,
} from "./materialized-body-cases.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host = createNodeHost();
const target = targetForExecutionHost(
  host.executionHost ?? { architecture: "unknown", operatingSystem: "unknown" },
);

/** Keep exact native failures distinct from compiler/transport failures. */
function failureChain(error: Error): string {
  const cause = error.cause;
  return (
    error.message + (cause instanceof Error ? `\n${failureChain(cause)}` : "")
  );
}

test(
  "packed materialized bodies preserve suspension, diagnostics and guards",
  { skip: target == null ? "requires a supported native host" : false },
  async () => {
    assert.ok(target != null);
    const referenceDirectory = await host.makeTemporaryDirectory(
      "oseo-materialized-body-reference-",
    );
    const sourcePath = `${referenceDirectory}/case.js`;
    await host.writeTextFile(sourcePath, materializedBodySource);
    const expected = {
      exitStatus: 0,
      stdout: materializedBodyStdout,
      stderr: "",
    };
    assertMatchingObservations([
      expected,
      await host.run({
        command: "node",
        args: [sourcePath],
        cwd: referenceDirectory,
      }),
      await host.run({
        command: "deno",
        args: ["run", "--quiet", sourcePath],
        cwd: referenceDirectory,
      }),
    ]);
    await host.remove(referenceDirectory);
    const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const specialization of ["disabled", "enabled"] as const) {
        for (const scenario of ["suspend", "throw", "resource"] as const) {
          const compiled = compileSource(
            babelFrontend,
            {
              source:
                scenario === "throw"
                  ? materializedBodyThrowSource
                  : materializedBodySource,
              sourceId: "materialized-body.ts",
            },
            { specialization, observeSpecialization: true },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const input =
            scenario === "resource"
              ? {
                  ...compiled.mir,
                  script: { ...compiled.mir.script, rootSlotCount: 1_048_576 },
                }
              : compiled.mir;
          const execute = () =>
            withNativeFixture(
              {
                backend: balancedInteropBackend,
                host,
                input,
                keepArtifacts: process.env.OSEO_KEEP_ARTIFACTS === "1",
                operation: "execute",
                runtime: cRuntimeProvider,
                target,
                toolchain: nativeToolchain,
              },
              (native) => {
                assert.equal(scenario, "suspend");
                assertMatchingObservations([expected, native]);
                assert.ok(native.counters != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "enabled") {
                  assert.ok(native.counters.guardMisses > 0);
                } else {
                  assert.equal(native.counters.guardHits, 0);
                  assert.equal(native.counters.guardMisses, 0);
                }
                assert.match(native.emittedC, /switch \(body->entry_index\)/u);
                assert.ok(
                  native.compilerInvocation.some((command) =>
                    command.includes("generated-unit-2.c"),
                  ),
                );
              },
            );
          if (scenario === "suspend") await execute();
          else {
            await assert.rejects(execute, (error: Error) => {
              assert.ok(error instanceof Error);
              const chain = failureChain(error);
              assert.match(chain, /Native fixture failed \(1\):/u);
              if (scenario === "throw") {
                assert.ok(
                  chain.includes(
                    `materialized-body.ts:${materializedBodyThrowLine}:1:`,
                  ),
                );
                assert.match(chain, /RangeError: packed throw/u);
              } else {
                assert.match(chain, /OSEO2001/u);
                assert.match(chain, /Maximum active native frame budget/u);
              }
              return true;
            });
          }
        }
      }
    } finally {
      if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
    }
  },
);
