import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createNodeHost,
  normalizeExecutionHost,
} from "../packages/host/src/index.ts";
import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { runNativeCli } from "./native-cli.ts";
import { hostCcLane } from "./native-toolchain.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  normalizeExecutionHost(process.platform, process.arch),
);
test(
  "retained executable runs after replacing an earlier native build",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-retained-"));
    const source = join(directory, "entry.ts");
    const output = join(directory, "program");
    try {
      await writeFile(source, 'console.log("first");');
      const first = await runNativeCli(
        {
          args: ["build", source, "-o", output, "--build-config", "checked"],
          version: "0.0.0",
        },
        host,
      );
      assert.deepEqual(first, { exitStatus: 0, stderr: "", stdout: "" });
      assert.equal(
        spawnSync(output, [], { encoding: "utf8" }).stdout,
        "first\n",
      );
      await writeFile(source, 'console.log("replacement");');
      const second = await runNativeCli(
        {
          args: ["build", source, "-o", output, "--build-config", "checked"],
          version: "0.0.0",
        },
        host,
      );
      assert.deepEqual(second, { exitStatus: 0, stderr: "", stdout: "" });
      const execution = spawnSync(output, [], { encoding: "utf8" });
      assert.equal(execution.status, 0, execution.stderr);
      assert.equal(execution.stdout, "replacement\n");
      const before = await readFile(output);
      await writeFile(source, "Function(1);");
      const failed = await runNativeCli(
        {
          args: ["build", source, "-o", output, "--build-config", "checked"],
          version: "0.0.0",
        },
        host,
      );
      assert.equal(failed.exitStatus, 1);
      assert.deepEqual(await readFile(output), before);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "retained Linux AArch64 artifact cross-links without execution",
  {
    // The host sanitizer compiler does not cross-link.
    skip:
      nativeTarget == null || hostCcLane
        ? "requires a supported native host"
        : false,
  },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-cross-retained-"));
    const source = join(directory, "entry.ts");
    const output = join(directory, "program-linux-aarch64-musl");
    try {
      await writeFile(source, "console.log(42);");
      const built = await runNativeCli(
        {
          args: [
            "build",
            source,
            "--target",
            "linux-aarch64-musl",
            "-o",
            output,
            "--build-config",
            "checked",
          ],
          version: "0.0.0",
        },
        host,
      );
      assert.deepEqual(built, { exitStatus: 0, stderr: "", stdout: "" });
      const bytes = await readFile(output);
      assert.equal(bytes.subarray(0, 4).toString("hex"), "7f454c46");
      assert.equal(bytes.readUInt16LE(18), 183);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
