import test from "node:test";
import assert from "node:assert/strict";

import { runCli } from "../packages/cli/dist/index.js";
import { describeTarget } from "../packages/compiler/dist/index.js";

test("built ESM packages compose through public exports", () => {
  assert.equal(describeTarget("x86_64-linux-gnu").execute, true);
  assert.match(
    runCli({ args: ["--help"], version: "0.0.0" }).stdout,
    /--emit-c/u,
  );
});
