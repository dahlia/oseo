import assert from "node:assert/strict";
import test from "node:test";

import { describeTarget } from "@oseo/compiler";

import { zigToolchain } from "../src/index.ts";

for (const target of [
  "x86_64-linux-gnu",
  "aarch64-macos",
  "aarch64-linux-musl",
] as const) {
  test(`records deterministic ${target} compiler requests`, () => {
    const plan = zigToolchain.createBuildPlan({
      generatedSourcePath: "/tmp/generated.c",
      runtimeDirectory: "/tmp/runtime",
      runtimeSourcePath: "/tmp/runtime/runtime.c",
      target: describeTarget(target),
      workingDirectory: "/tmp/build",
    });
    assert.ok(
      plan.requests.every((request) =>
        request.command === "zig" && request.args[0] === "ar"
          ? true
          : request.args.includes(target),
      ),
    );
    assert.match(plan.executablePath, new RegExp(target, "u"));
    assert.equal(new Set(plan.requests.map((request) => request.cwd)).size, 1);
    const sanitizer = plan.target.sanitizers.join(",");
    const compilerRequests = plan.requests.filter(
      (request) => request.args[0] === "cc",
    );
    if (sanitizer === "") {
      assert.ok(
        compilerRequests.every((request) =>
          request.args.every((arg) => !arg.startsWith("-fsanitize=")),
        ),
      );
    } else {
      assert.ok(
        compilerRequests.every((request) =>
          request.args.includes(`-fsanitize=${sanitizer}`),
        ),
      );
    }
  });
}
