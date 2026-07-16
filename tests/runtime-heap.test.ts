import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
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
    `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
  );
}

test("traces deep, cyclic, shared, and forward heap graphs", async () => {
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
});
