import assert from "node:assert/strict";
import process from "node:process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { describeTarget } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { zigToolchain } from "../packages/toolchain-zig/src/index.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixture = `${root}/tests/fixtures/native-reference.ts`;
const host = createNodeHost();

async function requireSuccess(
  command: string,
  args: readonly string[],
): Promise<{
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const result = await host.run({ args, command, cwd: root });
  if (result.exitStatus !== 0) {
    throw new Error(`${command} reference fixture failed:\n${result.stderr}`);
  }
  return result;
}

const nodeReference = await requireSuccess(process.execPath, [fixture]);
const denoReference = await requireSuccess("deno", ["run", "--quiet", fixture]);
assertMatchingObservations([nodeReference, denoReference]);

await withNativeFixture(
  {
    backend: cBackend,
    host,
    input: {
      kind: "m0-synthetic-native-module",
      outputLine: "native-fixture=??/42",
    },
    keepArtifacts: process.env.OSEO_KEEP_ARTIFACTS === "1",
    runtime: cRuntimeProvider,
    target: describeTarget("x86_64-linux-gnu"),
    toolchain: zigToolchain,
  },
  (native) => {
    assertMatchingObservations([nodeReference, denoReference, native]);
    assert(native.emittedC.includes("oseo_runtime_write_line"), "emitted C");
    assert(
      native.compilerInvocation
        .filter((line) => line.startsWith("zig cc "))
        .every((line) => line.includes("x86_64-linux-gnu")),
      "native compiler invocation records an explicit target",
    );
  },
);

await withNativeFixture(
  {
    backend: cBackend,
    host,
    input: {
      kind: "m0-synthetic-native-module",
      outputLine: "native-fixture=??/42",
    },
    keepArtifacts: process.env.OSEO_KEEP_ARTIFACTS === "1",
    runtime: cRuntimeProvider,
    target: describeTarget("aarch64-linux-musl"),
    toolchain: zigToolchain,
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
console.log("native fixture: Node, Deno, and x86-64 outputs match");
console.log("cross fixture: aarch64-linux-musl compile and link passed");
