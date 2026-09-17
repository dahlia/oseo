/* eslint-disable no-await-in-loop -- Small sequential digest checks. */
import assert from "node:assert/strict";
import test from "node:test";
import { createHarnessObjectKey, describeTarget } from "../src/index.ts";
import type { HarnessObjectKeyInput } from "../src/index.ts";

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
