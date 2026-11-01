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
import {
  hostScriptTraincFixtures,
  hostScriptTraincOracleFixture,
} from "./native/fixtures/host-script-trainc.ts";
import type { Fixture } from "./native/fixture.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);

/**
 * The native evidence pieces, in fixture order. Each
 * *host-script-trainc-evidence-N.test.ts* file runs piece N - 1, so the
 * ordinary Node shards can place the pieces apart instead of running all 34
 * fixtures serially in one file. The pieces run every fixture exactly once,
 * which the source test checks.
 */
export const traincEvidencePieces: readonly (readonly Fixture[])[] = [
  hostScriptTraincFixtures.slice(0, 13),
  hostScriptTraincFixtures.slice(13, 18),
  hostScriptTraincFixtures.slice(18, 24),
  [...hostScriptTraincFixtures.slice(24), hostScriptTraincOracleFixture],
];

/** Registers the native tests for one piece of the train C evidence. */
export function registerTraincEvidence(piece: number): void {
  for (const fixture of traincEvidencePieces[piece]!) {
    registerFixture(fixture);
  }
}

function registerFixture(fixture: Fixture): void {
  test(
    `${fixture.name} observes its host Script witness with forced GC`,
    { skip: nativeTarget == null ? "requires a supported native host" : false },
    async () => {
      const expected = {
        exitStatus: 0,
        stderr: "",
        stdout: `${fixture.name} ok\n`,
      };
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
              test262Host: true,
            },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir?.test262Host?.scripts != null);
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
              assert.match(native.emittedC, /oseo_test262_host_install/u);
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
