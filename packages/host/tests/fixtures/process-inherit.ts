import assert from "node:assert/strict";
import process from "node:process";

import { createDenoHost, createNodeHost } from "../../src/index.ts";

const mode = process.argv[2] ?? "direct";
const nodeHost = mode.startsWith("deno")
  ? undefined
  : createNodeHost({ delegateSpawns: mode.startsWith("delegated") });
const host = nodeHost ?? createDenoHost();
try {
  const result = await host.run({
    command: "node",
    args: [
      "-e",
      `const b = require('node:fs').readFileSync(0);
       process.stdout.write(b);
       process.stderr.write(b); process.exitCode = 23;`,
    ],
    cwd: process.cwd(),
    inheritStdin: !mode.endsWith("-eof"),
    inheritOutput: true,
  });
  assert.deepEqual(result, { exitStatus: 23, stdout: "", stderr: "" });
  process.exitCode = result.exitStatus;
} finally {
  await nodeHost?.close();
}
