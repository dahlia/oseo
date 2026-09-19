import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  describeTarget,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import type {
  CompilerHost,
  RuntimeInputProvider,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { nativeToolchain, hostCcLane } from "./native-toolchain.ts";
import { runtimeArchiveCache } from "../tools/runtime-archive-cache.ts";

const target =
  targetForExecutionHost(
    createNodeHost().executionHost ?? {
      architecture: "unknown",
      operatingSystem: "unknown",
    },
  ) ?? describeTarget("linux-x86_64-gnu");
const runtime: RuntimeInputProvider = {
  getRuntimeInput: () => ({
    abiVersion: "cache-test",
    assets: [
      { name: "runtime.c", kind: "source", url: new URL("file:///runtime.c") },
    ],
  }),
};

test("restored archives miss for every changed reuse input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oseo-ci-cache-"));
  const concrete = createNodeHost();
  assert.ok(concrete.cache != null);
  const host: CompilerHost = {
    ...concrete,
    cache: { ...concrete.cache, getDirectory: async () => directory },
    captureEnvironment: async () => ({ variables: { PATH: "/compiler" } }),
    readTextFile: async () => "int runtime(void) { return 1; }",
    run: async () => ({
      exitStatus: 0,
      stdout: "zig compiler identity",
      stderr: "",
    }),
  };
  try {
    const original = await runtimeArchiveCache(
      host,
      nativeToolchain,
      runtime,
      target,
      directory,
    );
    const bytes = Buffer.from("restored archive bytes");
    await writeFile(original.path, bytes);
    const hit = await runtimeArchiveCache(
      host,
      nativeToolchain,
      runtime,
      target,
      directory,
    );
    assert.equal(hit.key, original.key);
    assert.equal(hit.path, original.path);
    assert.equal(await host.cache!.hasFile(hit.path), true);
    const variants = [
      {
        name: "compiler identity",
        host: {
          ...host,
          run: async () => ({
            exitStatus: 0,
            stdout: "other compiler",
            stderr: "",
          }),
        },
        target,
      },
      {
        name: "compiler environment",
        host: {
          ...host,
          captureEnvironment: async () => ({
            variables: { PATH: "/compiler", ZIG_VERBOSE_CC: "1" },
          }),
        },
        target,
      },
      { name: "target", host, target: describeTarget("linux-aarch64-musl") },
      { name: "sanitizers", host, target: { ...target, sanitizers: [] } },
      {
        name: "runtime source",
        host: {
          ...host,
          readTextFile: async () => "int runtime(void) { return 2; }",
        },
        target,
      },
    ];
    for (const variant of variants) {
      if (
        hostCcLane &&
        (variant.name === "target" || variant.name === "sanitizers")
      ) {
        // eslint-disable-next-line no-await-in-loop -- Reject foreign targets.
        await assert.rejects(
          runtimeArchiveCache(
            variant.host,
            nativeToolchain,
            runtime,
            variant.target,
            directory,
          ),
          /cannot build/u,
        );
        continue;
      }
      // eslint-disable-next-line no-await-in-loop -- Check each lookup.
      const changed = await runtimeArchiveCache(
        variant.host,
        nativeToolchain,
        runtime,
        variant.target,
        directory,
      );
      assert.notEqual(changed.key, original.key, variant.name);
      assert.equal(
        // eslint-disable-next-line no-await-in-loop -- Cache lookup.
        await host.cache!.hasFile(changed.path),
        false,
        variant.name,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed or empty compiler identity cannot select a cache", async () => {
  const concrete = createNodeHost();
  for (const result of [
    { exitStatus: 1, stdout: "compiler", stderr: "failure" },
    { exitStatus: 0, stdout: "  ", stderr: "" },
  ]) {
    // eslint-disable-next-line no-await-in-loop -- Check both failures.
    await assert.rejects(
      runtimeArchiveCache(
        { ...concrete, run: async () => result },
        nativeToolchain,
        runtime,
        target,
        process.cwd(),
      ),
      /Cannot identify/u,
    );
  }
});

test("an unavailable environment cannot select a cache", async () => {
  const host = {
    ...createNodeHost(),
    captureEnvironment: async () => undefined,
  };
  await assert.rejects(
    runtimeArchiveCache(host, nativeToolchain, runtime, target, process.cwd()),
    /Cannot capture/u,
  );
});
