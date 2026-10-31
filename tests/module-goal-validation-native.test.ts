/* eslint-disable no-await-in-loop -- Native policies run serially. */
import assert from "node:assert/strict";
import process from "node:process";
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
  new URL("./fixtures/module-goal-validation/entry.mjs", import.meta.url),
);
const prelude = fileURLToPath(
  new URL("./fixtures/module-goal-validation/prelude.js", import.meta.url),
);
const expected = [
  ...Array.from({ length: 18 }, (_, index) => {
    const label = String(index + 1).padStart(2, "0");
    return `usage-${label} 42 Test262 42`;
  }),
  "generator call count 1",
  "completed 18",
].toSorted();

test(
  "static Module exports survive all eighteen usage contexts after a Script",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
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
      assert.deepEqual(
        reference.stdout.trim().split("\n").toSorted(),
        expected,
      );
    }

    const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const specialization of ["disabled", "enabled"] as const) {
        const result = await runNativeCli(
          {
            args: [
              ...(specialization === "disabled" ? ["--no-specialization"] : []),
              "--script",
              prelude,
              entry,
            ],
            version: "0.1.0",
          },
          host,
        );
        assert.equal(result.exitStatus, 0, result.stderr);
        assert.equal(result.stderr, "");
        assert.deepEqual(
          result.stdout.trim().split("\n").toSorted(),
          expected,
          specialization,
        );
      }
    } finally {
      if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
    }
  },
);
