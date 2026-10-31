/* eslint-disable no-await-in-loop -- Native builds are isolated and serial. */
import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import { cBackend } from "../packages/backend-c/src/index.ts";
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
import { nativeToolchain } from "./native-toolchain.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";
import { staticCore } from "./native/fixtures/dynamic-source-static-core.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);

for (const fixture of staticCore) {
  test(
    `${fixture.name} observes the complete static subject with forced GC`,
    { skip: nativeTarget == null ? "requires a supported native host" : false },
    async () => {
      const expected = { exitStatus: 0, stderr: "", stdout: "ok\n" };
      assertMatchingObservations([
        expected,
        ...(await hostScriptReferences(host, fixture.source)),
      ]);
      const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source: fixture.source, sourceId: `${fixture.name}.js` },
            {
              specialization,
              observeSpecialization: true,
              test262Host: fixture.test262Host === true,
            },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          await withNativeFixture(
            {
              backend: cBackend,
              host,
              input: compiled.mir,
              operation: "execute",
              runtime: cRuntimeProvider,
              target: nativeTarget!,
              toolchain: nativeToolchain,
            },
            (native) => {
              assertMatchingObservations([expected, native]);
              assert.ok(native.counters != null);
              assert.ok(native.counters.allocations > 0);
              assert.ok(native.counters.collections > 0);
              assert.match(native.emittedC, /oseo_call/u);
              if (fixture.test262Host) {
                assert.match(native.emittedC, /oseo_test262_host_install/u);
              }
            },
          );
        }
      } finally {
        if (saved == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        else process.env.OSEO_GC_EVERY_SAFEPOINT = saved;
      }
    },
  );
}
