/* eslint-disable no-await-in-loop -- Native builds run serially. */
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
import { classFixtures } from "./native/fixtures/classes.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);
const skip = nativeTarget == null ? "requires a supported native host" : false;

for (const kind of ["getter", "setter"]) {
  test(
    `private ${kind} core coverage without legacy lookup`,
    { skip },
    async () => {
      const fixture = classFixtures.find(
        (item) => item.name === `class-private-${kind}-public-absence`,
      )!;
      const expected = {
        exitStatus: 0,
        stderr: "",
        stdout: `private ${kind} core ok\n`,
      };
      assertMatchingObservations([
        expected,
        ...(await hostScriptReferences(host, fixture.source)),
      ]);
      const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        for (const specialization of ["disabled", "enabled"] as const) {
          for (const strict of [false, true]) {
            const compiled = compileSource(
              babelFrontend,
              {
                source: `${strict ? '"use strict";\n' : ""}${fixture.source}`,
                sourceId: `${fixture.name}.js`,
              },
              { specialization, observeSpecialization: true },
            );
            assert.deepEqual(compiled.diagnostics, []);
            await withNativeFixture(
              {
                backend: cBackend,
                host,
                input: compiled.mir!,
                operation: "execute",
                runtime: cRuntimeProvider,
                target: nativeTarget!,
                toolchain: nativeToolchain,
              },
              (native) => {
                assertMatchingObservations([expected, native]);
                assert.ok(native.counters!.collections > 0);
                if (specialization === "enabled") {
                  assert.ok(native.counters!.guardMisses > 0);
                }
              },
            );
          }
        }
      } finally {
        if (saved == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        else process.env.OSEO_GC_EVERY_SAFEPOINT = saved;
      }
    },
  );
}
