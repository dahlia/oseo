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
