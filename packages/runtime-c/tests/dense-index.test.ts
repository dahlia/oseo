import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { cRuntimeProvider } from "../src/index.ts";

const runtime = fileURLToPath(new URL("../native/", import.meta.url));
const runtimeSources = cRuntimeProvider
  .getRuntimeInput()
  .assets.filter((asset) => asset.kind === "source")
  .map((asset) => fileURLToPath(asset.url));
const fixture = fileURLToPath(
  new URL("./fixtures/dense-index.c", import.meta.url),
);
const zigNativeTarget =
  process.platform === "linux" && process.arch === "x64"
    ? "x86_64-linux-gnu"
    : process.platform === "darwin" && process.arch === "arm64"
      ? "aarch64-macos"
      : undefined;

function run(command: string, args: readonly string[]): void {
  const result = spawnSync(command, args, { encoding: "utf8" });
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

/*
 * The dense index hint must survive ascending index writes and agree
 * with a plain property-vector scan after every transition. No
 * JavaScript surface can see the hint, so the fixture inspects it
 * through the package-private representation.
 */
test(
  "keeps the dense index hint on the host-native target",
  {
    skip: zigNativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-dense-index-"));
    try {
      const executable = join(directory, "dense-index");
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
        fixture,
        ...runtimeSources,
        "-o",
        executable,
      ]);
      run(executable, []);
      run("env", ["OSEO_GC_EVERY_SAFEPOINT=1", executable]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  },
);
