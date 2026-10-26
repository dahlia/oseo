/* eslint-disable no-await-in-loop -- Forced GC is process-local. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import process from "node:process";
import test from "node:test";

import {
  compileSource,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createDenoHost, createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import {
  annexbForInExpected,
  annexbForInProgram,
  annexbForInScenarios,
} from "./helpers/annexb-for-in.ts";
import { balancedInteropBackend } from "./helpers/balanced-backend.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host = "Deno" in globalThis ? createDenoHost() : createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const skip = nativeTarget == null ? "requires a supported native host" : false;

test(
  "for-in virtual metadata ordering and reachability survive forced GC",
  {
    skip,
  },
  async () => {
    assert.ok(nativeTarget != null);
    for (const scenario of annexbForInScenarios) {
      const input = { scenario, value: 7 };
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          {
            source: annexbForInProgram(input),
            sourceId: `annexb-for-in-${scenario}.js`,
          },
          { specialization, observeSpecialization: true },
        );
        assert.deepEqual(compiled.diagnostics, [], scenario);
        assert.ok(compiled.mir != null);
        const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
        process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
        try {
          await withNativeFixture(
            {
              backend: balancedInteropBackend,
              host,
              input: compiled.mir,
              operation: "execute",
              runtime: cRuntimeProvider,
              target: nativeTarget,
              toolchain: nativeToolchain,
            },
            (native) => {
              assert.equal(native.exitStatus, 0, scenario);
              assert.equal(native.stderr, "", scenario);
              assert.equal(native.stdout, annexbForInExpected(input), scenario);
              assert.ok(native.counters != null);
              assert.ok(native.counters.allocations > 0);
              assert.ok(native.counters.collections > 0);
            },
          );
        } finally {
          if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
        }
      }
    }
  },
);

test(
  "for-in acquisition allocation failures preserve caller roots and retry",
  {
    skip,
  },
  async () => {
    assert.ok(nativeTarget != null);
    const compiled = compileSource(babelFrontend, {
      source: "0;",
      sourceId: "annexb-for-in-allocation.js",
    });
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const source = await readFile(
      new URL("./fixtures/annexb-for-in/allocation.c", import.meta.url),
      "utf8",
    );
    await withNativeFixture(
      {
        backend: { emit: () => ({ sourceName: "allocation.c", source }) },
        host,
        input: compiled.mir,
        operation: "execute",
        runtime: cRuntimeProvider,
        target: nativeTarget,
        toolchain: nativeToolchain,
      },
      (native) => {
        assert.equal(native.exitStatus, 0);
        assert.equal(native.stderr, "");
        assert.equal(
          native.stdout,
          "for-in allocation roots and retry passed\n",
        );
      },
    );
  },
);
