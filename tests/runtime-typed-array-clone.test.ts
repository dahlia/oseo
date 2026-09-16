import { hostCcLane } from "./native-toolchain.ts";
import { buildHostCcFixture } from "./host-cc-runtime.ts";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";

const runtime = fileURLToPath(
  new URL("../packages/runtime-c/native/", import.meta.url),
);
const runtimeSources = cRuntimeProvider
  .getRuntimeInput()
  .assets.filter((asset) => asset.kind === "source")
  .map((asset) => fileURLToPath(asset.url));
const fixture = fileURLToPath(
  new URL(
    "../packages/runtime-c/tests/fixtures/typed-array-clone.c",
    import.meta.url,
  ),
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
 * The same-kind TypedArray clone must preserve the source bytes verbatim.
 * No admitted JavaScript surface can read a clone's backing block yet, so
 * the fixture inspects it through the package-private representation.
 */
test(
  "clones same-kind TypedArray bytes on the host-native target",
  {
    skip:
      !hostCcLane || zigNativeTarget == null
        ? "requires a supported native host"
        : false,
  },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-typed-array-clone-"));
    try {
      const executable = join(directory, "typed-array-clone");
      buildHostCcFixture(fixture, runtime, runtimeSources, executable);
      run(executable, []);
      run("env", ["OSEO_GC_EVERY_SAFEPOINT=1", executable]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  },
);
