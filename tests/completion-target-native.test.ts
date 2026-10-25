/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import {
  compileSource,
  describeTarget,
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
import { runNativeCli } from "./native-cli.ts";
import { hostCcLane, nativeToolchain } from "./native-toolchain.ts";
import { completionTargetSource } from "./native/fixtures/completion.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory("oseo-tail-reference-");
  const path = `${directory}/case.js`;
  let succeeded = false;
  try {
    await host.writeTextFile(path, source);
    const observations = [
      await host.run({
        args: [path],
        command: process.execPath,
        cwd: directory,
      }),
      await host.run({
        args: ["run", "--quiet", path],
        command: "deno",
        cwd: directory,
      }),
    ] as const;
    succeeded = true;
    return observations;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

/*
 * The shrunk counterexample of the non-tail property's catch-finally
 * context, as the property printed it but rewrapped: the first hop's body
 * sits in a catch inside a finally that always returns, so no completion
 * of that finally is ever resumed. Its C once labeled the unreachable
 * after block, which -Werror rejects.
 */
const finallyChain = `"use strict";
let steps = 0;
const hop0 = (n) => { steps += 1; try { steps += 0; } finally {
  try { throw 0; } catch (error0) {
    if (n === 0) { return "done 0"; }
    return (() => { try { throw 0; } catch (error) {
      return hop1.apply(null, [n - 1]); } finally { steps += 0; } })();
  } } };
const hop1 = (n) => { steps += 1; if (n === 0) { return "done 1"; }
  return (() => { try { throw 0; } catch (error) {
    return hop0.apply(null, [n - 1]); } finally { steps += 0; } })(); };

const bound0 = hop0.bind(null);
const proxy0 = new Proxy(hop0, {});
const trap0 = new Proxy(function () {}, {
  apply(target, thisArgument, values) { return hop0(...values); },
});
const tag0 = (strings, ...values) => hop0(...values);


const bound1 = hop1.bind(null);
const proxy1 = new Proxy(hop1, {});
const trap1 = new Proxy(function () {}, {
  apply(target, thisArgument, values) { return hop1(...values); },
});
const tag1 = (strings, ...values) => hop1(...values);

try {
  console.log(hop0(0), steps);
} catch (error) {
  console.log(error.constructor.name, error.message, steps);
}
`;

test(
  "compiles a non-tail chain whose finally always returns",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const expected = { exitStatus: 0, stderr: "", stdout: "done 0 1\n" };
    assertMatchingObservations([expected, ...(await references(finallyChain))]);
    const sourceId = "finally-chain.js";
    for (const args of [[sourceId], ["--no-specialization", sourceId]]) {
      const native = await runNativeCli(
        { args, source: finallyChain, sourceId, version: "0.1.0" },
        host,
      );
      assertMatchingObservations([expected, native]);
    }
  },
);

test(
  "general finally and suspended completion targets retain native semantics",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    assert.ok(nativeTarget != null);
    const zigNativeTarget =
      nativeTarget.name === "macos-aarch64"
        ? "aarch64-macos"
        : nativeTarget.name === "linux-x86_64-gnu"
          ? "x86_64-linux-gnu"
          : assert.fail(`unsupported execution target: ${nativeTarget.name}`);
    const [nodeReference, denoReference] = await references(
      completionTargetSource,
    );
    assertMatchingObservations([nodeReference, denoReference]);
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        {
          source: completionTargetSource,
          sourceId: "completion-targets.ts",
        },
        { observeSpecialization: true, specialization, test262Host: false },
      );
      assert.deepEqual(compiled.diagnostics, [], "completion targets");
      assert.ok(compiled.mir != null);
      const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        await withNativeFixture(
          {
            backend: balancedInteropBackend,
            host,
            input: compiled.mir,
            keepArtifacts: process.env.OSEO_KEEP_ARTIFACTS === "1",
            operation: "execute",
            runtime: cRuntimeProvider,
            target: nativeTarget,
            toolchain: nativeToolchain,
          },
          (native) => {
            assertMatchingObservations([nodeReference, denoReference, native]);
            assert(native.counters != null, "completion targets: counters");
            assert(native.emittedC.includes("OseoResult"), "generic call ABI");
            assert.ok(native.counters.collections > 0);
            if (specialization === "disabled") {
              assert.equal(native.counters.guardHits, 0);
              assert.equal(native.counters.guardMisses, 0);
              assert.equal(native.counters.overflowMisses, 0);
            }
            assert(
              native.compilerInvocation
                .filter((line) => line.startsWith("zig cc "))
                .every((line) => line.includes(zigNativeTarget)),
              "native compiler invocation records an explicit target",
            );
          },
        );
      } finally {
        if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
      }
      // The original general fixture cross-linked its enabled policy.
      // The host C sanitizer lane still executes only its matching host.
      if (!hostCcLane && specialization === "enabled") {
        await withNativeFixture(
          {
            backend: balancedInteropBackend,
            host,
            input: compiled.mir,
            keepArtifacts: process.env.OSEO_KEEP_ARTIFACTS === "1",
            operation: "compile",
            runtime: cRuntimeProvider,
            target: describeTarget("linux-aarch64-musl"),
            toolchain: nativeToolchain,
          },
          (cross) => {
            assert(
              cross.compilerInvocation
                .filter((line) => line.startsWith("zig cc "))
                .every((line) => line.includes("aarch64-linux-musl")),
              "cross compiler invocation records an explicit target",
            );
          },
        );
      }
    }
  },
);
