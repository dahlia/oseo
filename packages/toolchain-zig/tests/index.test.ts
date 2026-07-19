import assert from "node:assert/strict";
import test from "node:test";

import { describeTarget } from "@oseo/compiler";

import { zigToolchain } from "../src/index.ts";

for (const [target, zigTarget] of [
  ["linux-x86_64-gnu", "x86_64-linux-gnu"],
  ["macos-aarch64", "aarch64-macos"],
  ["linux-aarch64-musl", "aarch64-linux-musl"],
] as const) {
  test(`maps deterministic ${target} compiler requests`, () => {
    const plan = zigToolchain.createBuildPlan({
      generatedSourcePath: "/tmp/generated.c",
      runtimeDirectory: "/tmp/runtime",
      runtimeSourcePaths: ["/tmp/runtime/runtime.c"],
      target: describeTarget(target),
      workingDirectory: "/tmp/build",
    });
    assert.ok(
      plan.requests.every((request) =>
        request.command === "zig" && request.args[0] === "ar"
          ? true
          : request.args.includes(zigTarget),
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

test("compiles and archives multiple runtime sources in input order", () => {
  const plan = zigToolchain.createBuildPlan({
    generatedSourcePath: "/tmp/generated.c",
    runtimeDirectory: "/tmp/runtime",
    runtimeSourcePaths: [
      "/tmp/runtime/runtime_core.c",
      "/tmp/runtime/runtime_memory.c",
    ],
    target: describeTarget("linux-x86_64-gnu"),
    workingDirectory: "/tmp/build",
  });
  const compileRequests = plan.requests.filter(
    (request) => request.args[0] === "cc" && request.args.includes("-c"),
  );
  assert.deepEqual(
    compileRequests.map((request) => request.args.at(-3)),
    ["/tmp/runtime/runtime_core.c", "/tmp/runtime/runtime_memory.c"],
  );
  assert.deepEqual(
    compileRequests.map((request) => request.args.at(-1)),
    [
      "/tmp/build/runtime_core-0-linux-x86_64-gnu.o",
      "/tmp/build/runtime_memory-1-linux-x86_64-gnu.o",
    ],
  );
  const archive = plan.requests.find((request) => request.args[0] === "ar");
  assert.ok(archive != null);
  assert.deepEqual(archive.args, [
    "ar",
    "rcs",
    "/tmp/build/liboseo_runtime-linux-x86_64-gnu.a",
    "/tmp/build/runtime_core-0-linux-x86_64-gnu.o",
    "/tmp/build/runtime_memory-1-linux-x86_64-gnu.o",
  ]);
  const archiveIndex = plan.requests.indexOf(archive);
  assert.ok(
    compileRequests.every(
      (request) => plan.requests.indexOf(request) < archiveIndex,
    ),
  );
  const link = plan.requests.at(-1);
  assert.ok(link != null);
  assert.ok(
    link.args.includes("/tmp/build/liboseo_runtime-linux-x86_64-gnu.a"),
  );
});

test("rejects a build plan without runtime sources", () => {
  assert.throws(
    () =>
      zigToolchain.createBuildPlan({
        generatedSourcePath: "/tmp/generated.c",
        runtimeDirectory: "/tmp/runtime",
        runtimeSourcePaths: [],
        target: describeTarget("linux-x86_64-gnu"),
        workingDirectory: "/tmp/build",
      }),
    /at least one runtime source/u,
  );
});

test("keeps object names distinct for same-named sources", () => {
  const plan = zigToolchain.createBuildPlan({
    generatedSourcePath: "/tmp/generated.c",
    runtimeDirectory: "/tmp/runtime",
    runtimeSourcePaths: ["/tmp/runtime/runtime.c", "/tmp/other/runtime.c"],
    target: describeTarget("linux-x86_64-gnu"),
    workingDirectory: "/tmp/build",
  });
  const compileRequests = plan.requests.filter(
    (request) => request.args[0] === "cc" && request.args.includes("-c"),
  );
  assert.deepEqual(
    compileRequests.map((request) => request.args.at(-1)),
    [
      "/tmp/build/runtime-0-linux-x86_64-gnu.o",
      "/tmp/build/runtime-1-linux-x86_64-gnu.o",
    ],
  );
});
