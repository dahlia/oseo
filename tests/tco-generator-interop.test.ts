/* eslint-disable no-await-in-loop -- Forced collection is process-local. */
import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createDenoHost, createNodeHost } from "../packages/host/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import {
  balancedInteropBackend,
  compileInterop,
  continuationBudget,
  interopCases,
  interopGuard,
} from "./helpers/tco-generator-interop.ts";
import { nativeToolchain } from "./native-toolchain.ts";
import {
  resourceDiagnostic,
  toolchainFrameContract,
} from "./proper-tail-call-resources.ts";

const host =
  Object.getOwnPropertyDescriptor(globalThis, "Deno")?.value == null
    ? createNodeHost()
    : createDenoHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

test(
  "fixed native continuation/TCO interaction, both policies and forced GC",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    assert.ok(nativeTarget != null);
    const contract = toolchainFrameContract(nativeToolchain, nativeTarget);
    for (const policy of ["disabled", "enabled"] as const) {
      for (const fixture of [...interopCases, interopGuard(contract, policy)]) {
        const mir = compileInterop(fixture, policy);
        if (fixture.name.startsWith("wide-")) {
          continuationBudget(
            mir,
            toolchainFrameContract(nativeToolchain, nativeTarget),
          );
        }
        const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
        process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
        try {
          const observation = withNativeFixture(
            {
              backend: balancedInteropBackend,
              host,
              input: mir,
              operation: "execute",
              runtime: cRuntimeProvider,
              target: nativeTarget,
              toolchain: nativeToolchain,
            },
            (native) => {
              assert.equal(fixture.guard, false, "guard must fail execution");
              assert.equal(native.exitStatus, 0);
              assert.equal(native.stderr, "");
              assert.equal(native.stdout, fixture.stdout);
              assert.ok(native.counters != null);
              assert.ok(native.counters.allocations > 0);
              assert.ok(native.counters.collections > 0);
            },
          );
          if (fixture.guard) {
            await assert.rejects(observation, (error) => {
              assert.ok(error instanceof Error);
              assert.ok(error.cause instanceof Error);
              const prefix = "Native fixture failed (1):\n";
              assert.ok(error.cause.message.startsWith(prefix));
              assert.match(
                error.cause.message.slice(prefix.length),
                resourceDiagnostic(`${fixture.name}.js`, "frame-budget"),
              );
              return true;
            });
          } else {
            await observation;
          }
        } finally {
          if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
        }
      }
    }
  },
);
