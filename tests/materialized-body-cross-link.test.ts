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
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import { balancedInteropBackend } from "./helpers/balanced-backend.ts";
import { materializedBodySource } from "./materialized-body-cases.ts";
import { hostCcLane, nativeToolchain } from "./native-toolchain.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? { architecture: "unknown", operatingSystem: "unknown" },
);

for (const specialization of ["disabled", "enabled"] as const) {
  test(
    `packed large bodies cross-link for AArch64 musl: ${specialization}`,
    {
      skip:
        nativeTarget == null || hostCcLane
          ? "requires a supported native host"
          : false,
    },
    async () => {
      const compiled = compileSource(
        babelFrontend,
        { source: materializedBodySource, sourceId: "materialized-body.ts" },
        { specialization, observeSpecialization: true },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir != null);
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
          assert.equal(cross.exitStatus, 0);
          assert.equal(cross.target.name, "linux-aarch64-musl");
          const commands = cross.compilerInvocation.filter((line) =>
            line.startsWith("zig cc "),
          );
          assert.ok(commands.length > 0);
          assert.ok(
            commands.every((line) =>
              /\s-target aarch64-linux-musl(?:\s|$)/u.test(line),
            ),
          );
          assert.ok(
            commands.some((line) => line.includes("generated-unit-2.c")),
          );
          assert.match(cross.emittedC, /switch \(body->entry_index\)/u);
          assert.match(cross.emittedC, /oseo_generator_suspend\(context/u);
        },
      );
    },
  );
}
