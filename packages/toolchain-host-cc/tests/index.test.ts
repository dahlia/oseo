import assert from "node:assert/strict";
import test from "node:test";
import { describeTarget } from "@oseo/compiler";
import { createHostCcToolchain } from "../src/index.ts";

const supported =
  (process.platform === "linux" && process.arch === "x64") ||
  (process.platform === "darwin" && process.arch === "arm64");
const target = describeTarget(
  process.platform === "darwin" ? "macos-aarch64" : "linux-x86_64-gnu",
);
const foreign = describeTarget(
  target.name === "macos-aarch64" ? "linux-x86_64-gnu" : "macos-aarch64",
);
const options = {
  compiler: "/usr/bin/clang",
  archiver: "/usr/bin/ar",
  identity: "/usr/bin/clang\nclang 22",
  target,
};
const input = {
  generatedSourcePath: "/work/main.c",
  runtimeDirectory: "/runtime",
  runtimeSourcePaths: ["/runtime/a.c", "/runtime/b.c"],
  workingDirectory: "/work",
  target,
};

test(
  "instruments every runtime member and the generated program",
  { skip: !supported },
  () => {
    const adapter = createHostCcToolchain(options);
    const { name, ...facts } = target;
    assert.doesNotThrow(() =>
      adapter.createBuildPlan({
        ...input,
        target: { name, ...facts },
      }),
    );
    const plan = adapter.createBuildPlan(input);
    assert.equal(plan.requests.length, 4);
    for (const request of [
      plan.requests[0],
      plan.requests[1],
      plan.requests[3],
    ]) {
      assert(request != null);
      assert(request.args.includes("-fsanitize=address,undefined"));
      assert(request.args.includes("-fno-sanitize-recover=all"));
    }
    assert.deepEqual(plan.requests[2]?.args, [
      "rcs",
      "/work/liboseo-runtime-host-cc.a",
      "/work/runtime-0.o",
      "/work/runtime-1.o",
    ]);
  },
);

test(
  "rejects a foreign target and ambient compiler inputs",
  { skip: !supported },
  () => {
    const adapter = createHostCcToolchain(options);
    assert.throws(
      () =>
        adapter.createBuildPlan({
          ...input,
          target: foreign,
        }),
      /supports only/u,
    );
    assert.throws(
      () =>
        adapter.createBuildPlan({
          ...input,
          environment: { variables: { CPATH: "/unexpected" } },
        }),
      /CPATH/u,
    );
  },
);

test(
  "compiler identity and version separate runtime archives",
  { skip: !supported },
  async () => {
    const keyInput = {
      runtimeAbiVersion: "test",
      runtimeAssets: [],
      target,
      toolchainEnvironment: { variables: {} },
      toolchainIdentity: "version",
    };
    const first = createHostCcToolchain(options).runtimeArchiveReuse!;
    const second = createHostCcToolchain({
      ...options,
      identity: "/usr/bin/gcc\ngcc 16",
    }).runtimeArchiveReuse!;
    assert.notEqual(
      await first.createKey(keyInput),
      await second.createKey(keyInput),
    );
    assert.equal(
      await first.createKey(keyInput),
      await first.createKey(keyInput),
    );
  },
);

test("does not accept a caller-selected foreign execution host", () => {
  assert.throws(
    () => createHostCcToolchain({ ...options, target: foreign }),
    /requires execution host target/u,
  );
});

test(
  "links fragment units and normalizes instrumented harness objects",
  { skip: !supported },
  () => {
    const adapter = createHostCcToolchain(options);
    const plan = adapter.createBuildPlan({
      ...input,
      additionalGeneratedSourcePaths: ["/work/case.c"],
      prebuiltObjectPaths: ["/cache/harness.o"],
    });
    const link = plan.requests.at(-1)!;
    assert.ok(link.args.includes("/work/case.c"));
    assert.ok(link.args.includes("/cache/harness.o"));
    const request = adapter.harnessObjectReuse!.createBuildRequest({
      workingDirectory: "/different/build",
      target,
      environment: { variables: {} },
    });
    assert.ok(request.args.includes("harness.c"));
    assert.ok(request.args.includes("-fsanitize=address,undefined"));
    assert.ok(
      request.args.includes("-ffile-prefix-map=/different/build=/oseo/harness"),
    );
    assert.equal(request.cwd, "/different/build");
  },
);

test(
  "pins and builds through a supplied compiler path",
  { skip: !supported },
  () => {
    const toolchain = createHostCcToolchain(options);
    const reuse = toolchain.runtimeArchiveReuse!;
    // The adapter is composed with a resolved path, so it pins that one.
    assert.deepEqual(reuse.pinToolchain!("/usr/bin/clang\nclang 22"), {
      compilerPath: "/usr/bin/clang",
      watchedPaths: ["/usr/bin/clang"],
    });
    const environment = { variables: {} };
    assert.equal(
      reuse.createIdentityRequest("/work", environment).command,
      "/usr/bin/clang",
    );
    assert.equal(
      reuse.createIdentityRequest("/work", environment, "/pinned/cc").command,
      "/pinned/cc",
    );
    // Every compiler request of a pinned build runs the supplied path; the
    // archiver is a separate tool and keeps its configured one.
    const plan = toolchain.createBuildPlan({
      compilerPath: "/pinned/cc",
      environment,
      generatedSourcePath: "/work/case.c",
      runtimeSourcePaths: ["/runtime/runtime_core.c"],
      runtimeDirectory: "/runtime",
      workingDirectory: "/work",
      target,
    });
    const commands = plan.requests.map((request) => request.command);
    assert.deepEqual(commands.toSorted(), [
      "/pinned/cc",
      "/pinned/cc",
      "/usr/bin/ar",
    ]);
    assert.equal(
      toolchain.harnessObjectReuse!.createBuildRequest({
        compilerPath: "/pinned/cc",
        workingDirectory: "/work",
        target,
        environment,
      }).command,
      "/pinned/cc",
    );
    assert.equal(
      toolchain.harnessObjectReuse!.createBuildRequest({
        workingDirectory: "/work",
        target,
        environment,
      }).command,
      "/usr/bin/clang",
    );
  },
);
