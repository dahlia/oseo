/* eslint-disable no-await-in-loop -- Native build requests are ordered. */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { runNativeFixture } from "../tools/native-fixture.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const fixture = fileURLToPath(
  new URL("fixtures/runtime-string-table.c", import.meta.url),
);
const runtimeDirectory = fileURLToPath(
  new URL("../packages/runtime-c/native/", import.meta.url),
);

test(
  "shares live short strings through a weak table",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    assert.ok(nativeTarget != null);
    const directory = await mkdtemp(join(tmpdir(), "oseo-string-table-"));
    try {
      const variables = Object.fromEntries(
        (nativeToolchain.environment?.inherit ?? []).flatMap((name) => {
          const value = process.env[name];
          return value == null ? [] : [[name, value]];
        }),
      );
      const plan = nativeToolchain.createBuildPlan({
        environment: { variables },
        generatedSourcePath: fixture,
        runtimeDirectory,
        runtimeSourcePaths: cRuntimeProvider
          .getRuntimeInput()
          .assets.filter((asset) => asset.kind === "source")
          .map((asset) => fileURLToPath(asset.url)),
        target: nativeTarget,
        workingDirectory: directory,
      });
      for (const request of plan.requests) {
        const built = await host.run(request);
        assert.equal(
          built.exitStatus,
          0,
          `${request.command} ${request.args.join(" ")}\n${built.stderr}`,
        );
      }
      const observed = runNativeFixture(plan.executablePath, [], {
        cwd: directory,
      });
      assert.ifError(observed.error);
      assert.equal(observed.status, 0, observed.stderr);
      assert.equal(observed.stderr, "");
      assert.equal(observed.stdout, "string table complete\n");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  },
);
