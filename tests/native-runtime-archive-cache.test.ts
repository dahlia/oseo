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
      async run(request: Parameters<typeof concrete.run>[0]) {
        if (request.args.includes("-c")) runtimeCompiles += 1;
        return await concrete.run(request);
      },
    };
    try {
      const entry = await runtimeArchiveCache(
        host,
        nativeToolchain,
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
        toolchain: nativeToolchain,
      } as const;
      const cold = await withNativeFixture(options, (result) => result);
      assert.equal(cold.exitStatus, 0, cold.stderr);
      assert.equal(cold.stdout, "42\n");
      assert.ok(runtimeCompiles > 0);
      const archive = await readFile(entry.path);
      const transport = join(directory, "transport.a");
      await copyFile(entry.path, transport);
      await rm(entry.path);
      await copyFile(transport, entry.path);
      runtimeCompiles = 0;
      const warm = await withNativeFixture(options, (result) => result);
      assert.equal(warm.exitStatus, 0, warm.stderr);
      assert.equal(runtimeCompiles, 0);
      assert.equal(warm.emittedC, cold.emittedC);
      assert.equal(warm.stdout, cold.stdout);
      // Mach-O debug maps contain the archive's link-time path, so cold and
      // restored links need not produce identical executable bytes. Compare
      // behavior above and the cached artifact itself here. A boolean keeps
      // assertion diagnostics bounded even when a large archive differs.
      assert.ok(
        (await readFile(entry.path)).equals(archive),
        "restored runtime archive bytes changed",
      );
      const cli = await runNativeUnits(
        {
          sources: [{ sourceName: "program.c", source: cold.emittedC }],
          prebuiltObjectPaths: [],
        },
        "cache.js",
        host,
        nativeToolchain,
      );
      assert.equal(cli.exitStatus, 0, cli.stderr);
      assert.equal(cli.stdout, "42\n");
      assert.equal(runtimeCompiles, 0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
