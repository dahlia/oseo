import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtime = join(root, "packages/runtime-c/native");
const fixture = join(root, "tests/fixtures/runtime-heap.c");

function run(command: string, args: readonly string[]): void {
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
}

test(
  "traces deep, cyclic, shared, and forward heap graphs",
  {
    skip:
      process.platform !== "linux" || process.arch !== "x64"
        ? "requires x86-64 Linux"
        : false,
  },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-runtime-heap-"));
    try {
      const executable = join(directory, "runtime-heap");
      const sources = [fixture, join(runtime, "runtime.c")];
      run("zig", [
        "cc",
        "-target",
        "x86_64-linux-gnu",
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
      run(executable, []);
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
