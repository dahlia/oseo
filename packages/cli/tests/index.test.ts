import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../src/index.ts";

test("reserves CLI output and rejects source with an owned diagnostic", () => {
  const help = runCli({ args: ["--help"], version: "0.0.0" });
  assert.ok(help.stdout.includes("--emit-c"));
  assert.ok(help.stdout.includes("--dump-mir"));
  const result = runCli({
    args: ["fixture.ts"],
    source: "console.log(42);",
    sourceId: "fixture.ts",
    version: "0.0.0",
  });
  assert.equal(result.exitStatus, 1);
  assert.equal(
    result.stderr,
    "fixture.ts:1:1: error[OSEO1001]: " +
      "Source compilation is not available before milestone M1.\n",
  );
});
