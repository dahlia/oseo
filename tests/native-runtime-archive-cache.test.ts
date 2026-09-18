import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { runNativeUnits } from "../packages/cli/src/index.ts";
import {
  compileSource,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import type { NativeToolchain } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import { runtimeArchiveCache } from "../tools/runtime-archive-cache.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const concrete = createNodeHost();
const nativeTarget = targetForExecutionHost(
  concrete.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

test(
  "CI archive paths match testkit and CLI builders after restore",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    assert.ok(nativeTarget != null);
    assert.ok(concrete.cache != null);
    const directory = await mkdtemp(join(tmpdir(), "oseo-ci-archive-"));
    let runtimeCompiles = 0;
    let executablePath: string | undefined;
    const toolchain: NativeToolchain = {
      ...nativeToolchain,
      createBuildPlan(input) {
        const plan = nativeToolchain.createBuildPlan(input);
        executablePath = plan.executablePath;
        return plan;
      },
    };
    let binary: Uint8Array | undefined;
    const host = {
      ...concrete,
      cache: {
        ...concrete.cache,
        async getDirectory(name: string) {
          const path = join(directory, name);
          await mkdir(path, { recursive: true });
          return path;
        },
      },
      async makeTemporaryDirectory() {
        // Hold the generated program's source/debug path constant, so the
        // comparison isolates archive reuse rather than build-directory paths.
        const path = join(directory, "build");
        await mkdir(path, { recursive: true });
        return path;
      },
      async run(request: Parameters<typeof concrete.run>[0]) {
        if (request.args.includes("-c")) runtimeCompiles += 1;
        const result = await concrete.run(request);
        if (request.command === executablePath) {
          binary = await readFile(request.command);
        }
        return result;
      },
    };
    try {
      const entry = await runtimeArchiveCache(
        host,
        toolchain,
        cRuntimeProvider,
        nativeTarget,
        directory,
      );
      const compiled = compileSource(babelFrontend, {
        sourceId: "cache.js",
        source: "console.log(42);",
      });
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir != null);
      const options = {
        backend: cBackend,
        host,
        input: compiled.mir,
        operation: "execute",
        runtime: cRuntimeProvider,
        target: nativeTarget,
        toolchain,
      } as const;
      const cold = await withNativeFixture(options, (result) => result);
      assert.equal(cold.stdout, "42\n");
      assert.ok(runtimeCompiles > 0);
      assert.ok(binary != null);
      const coldBinary = binary;
      const archive = await readFile(entry.path);
      const transport = join(directory, "transport.a");
      await copyFile(entry.path, transport);
      await rm(entry.path);
      await copyFile(transport, entry.path);
      runtimeCompiles = 0;
      const warm = await withNativeFixture(options, (result) => result);
      assert.equal(runtimeCompiles, 0);
      assert.equal(warm.emittedC, cold.emittedC);
      assert.equal(warm.stdout, cold.stdout);
      assert.deepEqual(binary, coldBinary);
      assert.deepEqual(await readFile(entry.path), archive);
      const cli = await runNativeUnits(
        {
          sources: [{ sourceName: "program.c", source: cold.emittedC }],
          prebuiltObjectPaths: [],
        },
        "cache.js",
        host,
        toolchain,
      );
      assert.equal(cli.exitStatus, 0, cli.stderr);
      assert.equal(cli.stdout, "42\n");
      assert.equal(runtimeCompiles, 0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
