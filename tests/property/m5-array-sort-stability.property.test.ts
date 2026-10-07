/* eslint-disable no-await-in-loop -- Native observations are isolated. */
/**
 * Generated large literals use normal collection within their two-case,
 * 180-second ordinary budget. The pinned 2,048-element fixture forces
 * collection at every safepoint under both policies; the 4,096-element
 * fixture uses normal collection. Instrumentation costs about 80 CPU seconds
 * per 2,048-element execution. Pinned fixtures have no individual timeout;
 * the sanitizer native CI job has a 75-minute limit.
 */
import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import fc from "fast-check";
import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  printMir,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { nativeToolchain } from "../native-toolchain.ts";
import {
  // Share the executable bucket model with the pinned lifetime fixtures.
  largeArraySortSource,
} from "../native/fixtures/array-prototype-sort.ts";
const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const large = process.env.OSEO_PROPERTY_SIZE === "large";
const cases = fc.record({
  length: fc.integer({ min: 2048, max: large ? 4096 : 2056 }),
  groups: fc.integer({ min: 3, max: 7 }),
  offset: fc.integer({ min: 0, max: 2 }),
  method: fc.constantFrom<"sort" | "toSorted">("sort", "toSorted"),
});
test(
  "large array literals retain stable sorting within the frame budget",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "large Array sorting preserves every identity",
      fc.asyncProperty(cases, async ({ length, groups, offset, method }) => {
        // The source checks each expected tag using independent key buckets,
        // rather than duplicating the runtime's merge algorithm.
        const source = largeArraySortSource(length, groups, offset, method);
        const expected = {
          exitStatus: 0,
          stderr: "",
          stdout:
            `stable true true ${length}\n` +
            `identity true true ${method === "sort"}\n` +
            (method === "toSorted" ? "unchanged true\n" : "") +
            "hint h\nfalse hint m\nguard g\nguard g\nguard g\n",
        };
        const directory = await host.makeTemporaryDirectory("oseo-large-sort-");
        try {
          const path = `${directory}/case.ts`;
          await host.writeTextFile(
            path,
            `(0, eval)(${JSON.stringify(source)});\n`,
          );
          assertMatchingObservations([
            expected,
            await host.run({
              command: process.execPath,
              args: [path],
              cwd: directory,
            }),
            await host.run({
              command: "deno",
              args: ["run", "--quiet", path],
              cwd: directory,
            }),
          ]);
        } finally {
          await host.remove(directory);
        }
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-large-sort.ts" },
            { specialization, observeSpecialization: true },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          if (specialization === "enabled") {
            assert.match(printMir(compiled.mir), /guard-shape/u);
            assert.match(printMir(compiled.mir), /property-get generic/u);
          }
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
              if (specialization === "enabled") {
                assert.ok(native.counters.guardHits > 0);
                assert.ok(native.counters.guardMisses > 0);
              } else {
                assert.equal(native.counters.guardHits, 0);
                assert.equal(native.counters.guardMisses, 0);
              }
            },
          );
        }
      }),
      {
        context:
          nativeTarget == null
            ? ["target=unsupported"]
            : [`target=${nativeTarget.name}`],
        domain:
          "large object array literals, three to seven duplicated keys, " +
          "cyclic key offsets, sort and toSorted, complete independent " +
          "bucket ordering and identity checks, false hints and a " +
          "deliberate shape guard miss",
        numRuns: 2,
        profile: "M5c Array sort stability",
        seed: 0x6000_8400,
        sizeLimit: large
          ? "2048 to 4096 literal objects"
          : "2048 to 2056 literal objects",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
