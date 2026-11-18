import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { executeCliInvocation, parseCliRequest } from "../src/index.ts";

test("native output alone selects Zig; --zig works offline", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "oseo-cli-zig-test-"));
  t.after(() => rm(temporary, { force: true, recursive: true }));
  const zig = join(temporary, "my zig");
  await writeFile(zig, "#!/bin/sh\nexit 47\n", {
    mode: 0o755,
  });
  let requests = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    requests += 1;
    throw new Error("These invocations must not fetch Zig.");
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  for (const args of [
    ["--help"],
    ["--version"],
    ["build", "--emit-c", "app.js"],
    ["build", "--dump-mir", "app.js"],
    ["build", "--emit-c", "--zig", zig, "app.js"],
  ]) {
    const request = { args, source: "console.log(42);", version: "0.0.0" };
    const parsed = parseCliRequest(request);
    const result =
      parsed.kind === "invoke"
        ? // oxlint-disable-next-line no-await-in-loop -- Shared fetch spy.
          await executeCliInvocation(parsed.value, request)
        : parsed.value;
    if (args.includes("--zig")) {
      assert.equal(result.exitStatus, 1);
      assert.match(
        result.stderr,
        /--zig option applies only to native output/u,
      );
    } else {
      assert.equal(result.exitStatus, 0, result.stderr);
    }
  }
  const request = {
    args: [
      "build",
      "--target",
      "linux-x86_64-gnu",
      "--no-runtime-archive-reuse",
      "--zig",
      zig,
      "-o",
      join(temporary, "app"),
      "app.js",
    ],
    source: "console.log(42);",
    version: "0.0.0",
  };
  const parsed = parseCliRequest(request);
  assert.equal(parsed.kind, "invoke");
  const built = await executeCliInvocation(parsed.value, request);
  assert.equal(built.exitStatus, 1);
  assert.match(built.stderr, /exit 47/u);
  assert.equal(requests, 0);
});
