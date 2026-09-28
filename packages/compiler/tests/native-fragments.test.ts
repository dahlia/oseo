/* eslint-disable no-await-in-loop -- Small sequential digest checks. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  createHarnessObjectKey,
  describeTarget,
  prepareHarnessObject,
} from "../src/index.ts";
import type {
  CompilerHost,
  HarnessObjectKeyInput,
  NativeToolchain,
} from "../src/index.ts";

const input: HarnessObjectKeyInput = {
  fragmentAbiVersion: "v1",
  harnessSources: [
    { sourceId: "a.js", source: "a" },
    { sourceId: "b.js", source: "b" },
  ],
  strict: false,
  specialization: "enabled",
  observeSpecialization: false,
  frontendIdentity: "frontend",
  compilerIdentity: "compiler",
  backendIdentity: "backend",
  generatedSource: "C",
  runtimeAbiVersion: "runtime",
  runtimeAssets: [{ kind: "header", name: "r.h", contents: "header" }],
  target: describeTarget("linux-x86_64-gnu"),
  toolchainEnvironment: { variables: { PATH: "bin", HOME: "home" } },
  toolchainIdentity: "cc",
};
const policy = {
  adapter: "test",
  compileFlags: ["-g"],
  linkFlags: ["-lm"],
  runtimeFlags: ["-O2"],
};

test("harness key covers every semantic and tool input", async () => {
  const base = await createHarnessObjectKey(input, policy);
  const changes: readonly Partial<HarnessObjectKeyInput>[] = [
    { fragmentAbiVersion: "v2" },
    { harnessSources: input.harnessSources.toReversed() },
    { harnessSources: [{ sourceId: "a.js", source: "changed" }] },
    { harnessSources: [...input.harnessSources, input.harnessSources[0]!] },
    { strict: true },
    { specialization: "disabled" },
    { observeSpecialization: true },
    { frontendIdentity: "other" },
    { compilerIdentity: "other" },
    { backendIdentity: "other" },
    { generatedSource: "other" },
    { runtimeAbiVersion: "other" },
    { runtimeAssets: [{ kind: "header", name: "r.h", contents: "changed" }] },
    { target: describeTarget("macos-aarch64") },
    { target: { ...input.target, sanitizers: [] } },
    { toolchainIdentity: "other" },
    { toolchainEnvironment: { variables: { PATH: "other", HOME: "home" } } },
  ];
  const keys = await Promise.all(
    changes.map((change) =>
      createHarnessObjectKey({ ...input, ...change }, policy),
    ),
  );
  for (const key of keys) assert.notEqual(key, base);
  for (const changed of [
    { ...policy, compileFlags: ["-g", "-O2"] },
    { ...policy, linkFlags: ["-lm", "-pthread"] },
    { ...policy, runtimeFlags: ["-O0"] },
    { ...policy, adapter: "other" },
  ]) {
    assert.notEqual(await createHarnessObjectKey(input, changed), base);
  }
  assert.equal(
    await createHarnessObjectKey(
      {
        ...input,
        toolchainEnvironment: { variables: { HOME: "home", PATH: "bin" } },
      },
      policy,
    ),
    base,
  );
});

/** One toolchain whose harness build records the compiler it was given. */
function harnessToolchain(commands: string[]): NativeToolchain {
  return {
    createBuildPlan() {
      throw new Error("The harness object build needs no build plan.");
    },
    harnessObjectReuse: {
      createKey: async () => "key",
      createBuildRequest(buildInput) {
        commands.push(buildInput.compilerPath ?? "cc");
        return {
          args: ["-c", "harness.c"],
          command: buildInput.compilerPath ?? "cc",
          cwd: buildInput.workingDirectory,
          environment: buildInput.environment,
        };
      },
    },
  };
}

/** One host with no cache, so the object is returned rather than published. */
function harnessHost(removed: string[]): CompilerHost {
  return {
    makeTemporaryDirectory: async () => "/harness",
    readTextFile: async () => "",
    remove: async (path) => {
      removed.push(path);
    },
    run: async () => ({ exitStatus: 0, stderr: "", stdout: "" }),
    writeTextFile: async () => {},
  };
}

const uncachedPinTitle =
  "an uncached harness object verifies its pin before it is returned";
test(uncachedPinTitle, async () => {
  for (const failAt of ["lock", "build", "after"] as const) {
    const commands: string[] = [];
    const removed: string[] = [];
    let verifications = 0;
    const pin = {
      compilerPath: "/pinned/cc",
      verify: async () => {
        verifications += 1;
        const failing = failAt === "lock" ? 1 : failAt === "build" ? 2 : 3;
        if (verifications === failing) throw new Error("pin moved");
      },
    };
    await assert.rejects(
      async () =>
        await prepareHarnessObject(
          harnessHost(removed),
          harnessToolchain(commands),
          input,
          pin,
        ),
      /pin moved/u,
    );
    // The build only runs once the first two checks have passed, and the
    // object is never returned when the check after the build fails.
    assert.equal(commands.length, failAt === "after" ? 1 : 0);
    if (failAt === "after") assert.deepEqual(commands, ["/pinned/cc"]);
  }
  // Without a failing pin the object comes back, built through the pin.
  const commands: string[] = [];
  const removed: string[] = [];
  let verifications = 0;
  const prepared = await prepareHarnessObject(
    harnessHost(removed),
    harnessToolchain(commands),
    input,
    {
      compilerPath: "/pinned/cc",
      verify: async () => {
        verifications += 1;
      },
    },
  );
  assert.equal(prepared.objectPath, "/harness/harness.o");
  assert.equal(prepared.cacheHit, false);
  assert.deepEqual(commands, ["/pinned/cc"]);
  assert.equal(verifications, 3);
  assert.deepEqual(removed, []);
});
