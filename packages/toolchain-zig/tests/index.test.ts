import assert from "node:assert/strict";
import test from "node:test";

import { zigToolchain } from "../src/index.ts";

test("records an explicit target in every compiler request", () => {
  const plan = zigToolchain.createBuildPlan({
    generatedSourcePath: "/tmp/generated.c",
    runtimeDirectory: "/tmp/runtime",
    runtimeSourcePath: "/tmp/runtime/runtime.c",
    target: {
      cStandard: "c11",
      execute: false,
      name: "aarch64-linux-musl",
      sanitizeUndefinedBehavior: false,
    },
    workingDirectory: "/tmp/build",
  });
  assert.ok(plan.requests[0]?.args.includes("aarch64-linux-musl"));
});
