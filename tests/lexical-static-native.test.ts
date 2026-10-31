/* eslint-disable no-await-in-loop -- Native variants run serially. */
import assert from "node:assert/strict";
import test from "node:test";
import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import { nativeToolchain } from "./native-toolchain.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";
const { lexicalStaticFixtures } =
  await import("./native/fixtures/lexical-static-evidence.ts");
import { lexicalBmpFixtures } from "./native/fixtures/lexical-bmp-comments.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);

for (const fixture of [...lexicalStaticFixtures, ...lexicalBmpFixtures]) {
  test(
    `${fixture.name} static native and reference observations`,
    {
      skip: nativeTarget == null ? "requires a supported native host" : false,
    },
    async () => {
      for (const reference of await hostScriptReferences(
        host,
        fixture.source,
      )) {
        assert.equal(reference.exitStatus, 0, reference.stderr);
        assert.equal(reference.stderr, "");
        assert.equal(reference.stdout, fixture.expected);
      }
      const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        for (const specialization of ["disabled", "enabled"] as const) {
          const result = compileSource(
            babelFrontend,
            {
              source: fixture.source,
              sourceId: `${fixture.name}.js`,
            },
            { specialization, observeSpecialization: true },
          );
          assert.deepEqual(result.diagnostics, []);
          assert.ok(result.mir);
          await withNativeFixture(
            {
              backend: cBackend,
              host,
              input: result.mir,
              operation: "execute",
              runtime: cRuntimeProvider,
              target: nativeTarget!,
              toolchain: nativeToolchain,
            },
            (native) => {
              assert.equal(native.exitStatus, 0, native.stderr);
              assert.equal(native.stderr, "");
              assert.equal(native.stdout, fixture.expected);
              assert.ok(native.counters!.collections > 0);
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
