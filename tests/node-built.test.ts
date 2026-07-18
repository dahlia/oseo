import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { runCli } from "../packages/cli/dist/index.js";
import { describeTarget } from "../packages/compiler/dist/index.js";

test("built ESM packages compose through public exports", () => {
  assert.equal(describeTarget("x86_64-linux-gnu").executableFormat, "elf");
  assert.match(
    runCli({ args: ["--help"], version: "0.0.0" }).stdout,
    /--emit-c/u,
  );
});

test("built npm CLI reads source for dump modes", () => {
  const cli = fileURLToPath(
    new URL("../packages/cli/dist/main.js", import.meta.url),
  );
  const fixture = fileURLToPath(
    new URL("./fixtures/native-reference.ts", import.meta.url),
  );
  const result = spawnSync(process.execPath, [cli, "--emit-c", fixture], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /oseo_add/u);
  assert.match(result.stdout, /oseo_console_log/u);
});

test("built npm CLI reports Optique argument errors", () => {
  const cli = fileURLToPath(
    new URL("../packages/cli/dist/main.js", import.meta.url),
  );
  const result = spawnSync(process.execPath, [cli, "--unknown"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unexpected option/u);
  assert.match(result.stderr, /--unknown/u);
});
