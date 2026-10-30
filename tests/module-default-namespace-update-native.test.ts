/* eslint-disable no-await-in-loop -- Native policies run serially. */
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { runNativeCli } from "./native-cli.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const entry = fileURLToPath(
  new URL(
    "./fixtures/module-default-namespace-update/entry.mjs",
    import.meta.url,
  ),
);

test(
  "a static namespace reads the updated default binding after calling it",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const expected = "1\n2\n";
    for (const [command, args] of [
      [process.execPath, [entry]],
      ["deno", ["run", "--quiet", entry]],
    ] as const) {
      const reference = await host.run({
        command,
        args,
        cwd: fileURLToPath(new URL("..", import.meta.url)),
      });
      assert.equal(reference.exitStatus, 0, reference.stderr);
      assert.equal(reference.stderr, "");
      assert.equal(reference.stdout, expected);
    }
    for (const specialization of ["disabled", "enabled"] as const) {
      const native = await runNativeCli(
        {
          args: [
            ...(specialization === "disabled" ? ["--no-specialization"] : []),
            entry,
          ],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(native.exitStatus, 0, native.stderr);
      assert.equal(native.stderr, "");
      assert.equal(native.stdout, expected, specialization);
    }
  },
);
