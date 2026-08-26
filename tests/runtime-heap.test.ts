import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtime = join(root, "packages/runtime-c/native");
const runtimeSources = cRuntimeProvider
  .getRuntimeInput()
  .assets.filter((asset) => asset.kind === "source")
  .map((asset) => fileURLToPath(asset.url));
const fixture = join(root, "tests/fixtures/runtime-heap.c");
const zigNativeTarget =
  process.platform === "linux" && process.arch === "x64"
    ? "x86_64-linux-gnu"
    : process.platform === "darwin" && process.arch === "arm64"
      ? "aarch64-macos"
      : undefined;

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    [
      `${command} ${args.join(" ")}`,
      `error: ${result.error?.stack ?? "none"}`,
      `signal: ${result.signal ?? "none"}`,
      `stdout: ${result.stdout ?? ""}`,
      `stderr: ${result.stderr ?? ""}`,
    ].join("\n"),
  );
  return result.stdout ?? "";
}

test(
  "traces heap graphs on the host-native target",
  {
    skip: zigNativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-runtime-heap-"));
    try {
      const executable = join(directory, "runtime-heap");
      const sources = [fixture, ...runtimeSources];
      run("zig", [
        "cc",
        "-target",
        zigNativeTarget ?? "x86_64-linux-gnu",
        "-std=c11",
        "-Wall",
        "-Wextra",
        "-Werror",
        "-fsanitize=address,undefined",
        "-I",
        runtime,
        ...sources,
        "-o",
        executable,
      ]);
      const draws = run(executable, []);
      /*
       * The fixture prints the Math.random draws of the three realms it
       * initializes. A realm seeds from its initialization ordinal
       * rather than from host entropy, so a second run of the same
       * executable on the same target prints exactly the same draws.
       */
      assert.match(draws, /^realm 0 draw 0 [0-9a-f]{16}$/mu);
      assert.equal(run(executable, []), draws);
      run("zig", [
        "cc",
        "-target",
        "aarch64-linux-musl",
        "-std=c11",
        "-Wall",
        "-Wextra",
        "-Werror",
        "-I",
        runtime,
        ...sources,
        "-o",
        join(directory, "runtime-heap-aarch64"),
      ]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  },
);
