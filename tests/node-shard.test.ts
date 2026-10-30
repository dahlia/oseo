import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dedicatedMacosNodeFiles } from "../tools/native-shard.ts";
import {
  discoverNodeTests,
  nodeTestShardArguments,
} from "../tools/node-shard.ts";

const childEnv = { ...process.env, NODE_TEST_CONTEXT: undefined };

const runner = fileURLToPath(
  new URL("../tools/run-node-shard.ts", import.meta.url),
);

function markers(stdout: string): readonly string[] {
  return [...stdout.matchAll(/FILE:([^\s]+)/gu)].map((match) => match[1]!);
}

test("macOS Node shards plus the dedicated file equal Node discovery", () => {
  const cwd = mkdtempSync(join(tmpdir(), "oseo-node-shard-"));
  try {
    const files = [
      "packages/example/tests/example.test.ts",
      "packages/example/tests/example.test.mts",
      "packages/example/tests/example.test.cts",
      "tests/example.test.js",
      "tests/example.test.mjs",
      "tests/example.test.cjs",
      "test/nested/helper.ts",
      "test.ts",
      "nested/test-example.ts",
      "nested/example_test.ts",
      "nested/example-test.ts",
      ...dedicatedMacosNodeFiles,
    ];
    writeFileSync(join(cwd, "package.json"), '{"type":"module"}');
    for (const file of [
      ...files,
      "ignored.ts",
      "node_modules/ignored.test.ts",
      "nested/node_modules/ignored.test.ts",
    ]) {
      const path = join(cwd, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `console.log(${JSON.stringify(`FILE:${file}`)});`);
    }
    const baseline = spawnSync(process.execPath, ["--test"], {
      cwd,
      env: childEnv,
      encoding: "utf8",
    });
    assert.equal(baseline.status, 0, baseline.stderr);
    assert.deepEqual(markers(baseline.stdout).toSorted(), files.toSorted());
    assert.deepEqual(discoverNodeTests(cwd), files.toSorted());
    const observed: string[] = [];
    for (let index = 1; index <= 4; index++) {
      const args = nodeTestShardArguments(cwd, { index, total: 4 });
      for (const file of dedicatedMacosNodeFiles) {
        assert.ok(!args.includes(file));
      }
      const child = spawnSync(
        process.execPath,
        [runner, "--shard", `${index}/4`],
        {
          cwd,
          env: childEnv,
          encoding: "utf8",
        },
      );
      assert.equal(child.status, 0, child.stderr);
      observed.push(...markers(child.stdout));
    }
    const dedicated = spawnSync(
      process.execPath,
      ["--test", "--test-concurrency=1", ...dedicatedMacosNodeFiles],
      { cwd, env: childEnv, encoding: "utf8" },
    );
    assert.equal(dedicated.status, 0, dedicated.stderr);
    observed.push(...markers(dedicated.stdout));
    assert.deepEqual(observed.toSorted(), files.toSorted());
    assert.equal(new Set(observed).size, observed.length);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("real Node inventory excludes only the dedicated Array file", () => {
  const all = discoverNodeTests(process.cwd());
  const args = nodeTestShardArguments(process.cwd(), { index: 1, total: 4 });
  assert.deepEqual(dedicatedMacosNodeFiles, [
    "tests/property/m5-array-constructor.property.test.ts",
  ]);
  assert.deepEqual(
    [...args.slice(2), ...dedicatedMacosNodeFiles].toSorted(),
    all,
  );
});

test("Node wrapper propagates failures and handles empty shards", () => {
  const cwd = mkdtempSync(join(tmpdir(), "oseo-node-shard-empty-"));
  try {
    assert.deepEqual(nodeTestShardArguments(cwd, { index: 1, total: 4 }), []);
    const empty = spawnSync(process.execPath, [runner, "--shard=1/4"], {
      cwd,
      env: childEnv,
    });
    assert.equal(empty.status, 0);
    writeFileSync(join(cwd, "fails.test.cjs"), 'throw new Error("fixture");');
    const failure = spawnSync(process.execPath, [runner, "--shard=1/1"], {
      cwd,
      env: childEnv,
    });
    assert.equal(failure.status, 1);
    for (const args of [[], ["--shard=0/4"], ["--shard=1/4", "--shard=2/4"]]) {
      const invalid = spawnSync(process.execPath, [runner, ...args], {
        cwd,
        env: childEnv,
      });
      assert.notEqual(invalid.status, 0);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
