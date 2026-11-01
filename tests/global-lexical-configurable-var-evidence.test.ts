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
import * as witness from "./native/fixtures/global-lexical-configurable-var.ts";

const fixture = witness.globalLexicalConfigurableVarFixture;
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);

// Node.js is the reference. Deno keeps the removed [[VarNames]] check, so it
// rejects the later lexical declaration, as it does for the alias fixture in
// host-script-bindings.ts.
test(
  "a lexical Script shadows a configurable var with forced GC",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const expected = {
      exitStatus: 0,
      stderr: "",
      stdout: `${fixture.name} ok\n`,
    };
    const [node] = await hostScriptReferences(host, fixture.source);
    assertMatchingObservations([expected, node!]);
    const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          { source: fixture.source, sourceId: `${fixture.name}.js` },
          { specialization, observeSpecialization: true, test262Host: true },
        );
        assert.deepEqual(compiled.diagnostics, []);
        assert.ok(compiled.mir != null);
        // oxlint-disable-next-line no-await-in-loop -- Builds run serially.
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
          },
        );
      }
    } finally {
      if (saved == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = saved;
    }
  },
);
