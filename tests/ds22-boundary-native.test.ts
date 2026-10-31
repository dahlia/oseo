/* eslint-disable no-await-in-loop -- Each fixture owns its native process. */
import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createDenoHost, createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import {
  ds22BoundaryCoreExpected,
  ds22BoundaryCoreFixtures,
} from "./native/fixtures/ds22-boundary-core.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host = "Deno" in globalThis ? createDenoHost() : createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

for (const fixture of ds22BoundaryCoreFixtures) {
  test(
    `${fixture.name} observes the complete static subject with forced GC`,
    {
      skip: nativeTarget == null ? "requires a supported native host" : false,
    },
    async () => {
      assert.ok(nativeTarget != null);
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          {
            source: fixture.source,
            sourceId: `${fixture.name}.js`,
          },
          { specialization, observeSpecialization: true },
        );
        assert.deepEqual(compiled.diagnostics, []);
        assert.ok(compiled.mir != null);
        const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
        process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
        try {
          await withNativeFixture(
            {
              backend: cBackend,
              host,
              input: compiled.mir,
              operation: "execute",
              runtime: cRuntimeProvider,
              target: nativeTarget,
              toolchain: nativeToolchain,
            },
            (native) => {
              assert.equal(native.exitStatus, 0, native.stderr);
              assert.equal(native.stderr, "");
              assert.equal(
                native.stdout,
                ds22BoundaryCoreExpected(fixture.name),
              );
              assert.ok(native.counters != null);
              assert.ok(native.counters.allocations > 0);
              assert.ok(native.counters.collections > 0);
              if (specialization === "disabled") {
                assert.equal(native.counters.guardHits, 0);
                assert.equal(native.counters.guardMisses, 0);
              }
            },
          );
        } finally {
          if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
        }
      }
    },
  );
}
