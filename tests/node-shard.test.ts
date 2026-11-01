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
  modeledNodeShardSeconds,
  nodeShardInventory,
  nodeShardModel,
  nodeTestShardArguments,
  selectNodeTestShard,
} from "../tools/node-shard.ts";
import {
  nodeShardCosts,
  nodeShardFallbackSeconds,
} from "../tools/node-shard-costs.ts";

const childEnv = { ...process.env, NODE_TEST_CONTEXT: undefined };

const runner = fileURLToPath(
  new URL("../tools/run-node-shard.ts", import.meta.url),
);

/** The CI totals, which tests/macos-lanes.test.ts pins in the workflow. */
function totalFor(platform: string): number {
  return platform === "darwin" ? 6 : 4;
}

function markers(stdout: string): readonly string[] {
  return [...stdout.matchAll(/FILE:([^\s]+)/gu)].map((match) => match[1]!);
}

function shards(
  files: readonly string[],
  platform: string,
): readonly (readonly string[])[] {
  const total = totalFor(platform);
  return Array.from({ length: total }, (_, index) =>
    selectNodeTestShard(files, { index: index + 1, total }, platform),
  );
}

test("Node shards plus dedicated files equal Node discovery", () => {
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
    for (const platform of ["linux", "darwin"]) {
      const total = totalFor(platform);
      const dedicated = platform === "darwin" ? dedicatedMacosNodeFiles : [];
      const selected = Array.from({ length: total }, (_, index) =>
        nodeTestShardArguments(cwd, { index: index + 1, total }, platform),
      ).flatMap((args) => {
        if (args.length > 0) assert.equal(args[0], "--test");
        return args.slice(1);
      });
      for (const file of dedicated) assert.ok(!selected.includes(file));
      assert.deepEqual(
        [...selected, ...dedicated].toSorted(),
        files.toSorted(),
        platform,
      );
    }
    // The runner selects the executing host's partition end to end.
    const total = totalFor(process.platform);
    const observed: string[] = [];
    for (let index = 1; index <= total; index++) {
      const child = spawnSync(
        process.execPath,
        [runner, "--shard", `${index}/${total}`],
        { cwd, env: childEnv, encoding: "utf8" },
      );
      assert.equal(child.status, 0, child.stderr);
      observed.push(...markers(child.stdout));
    }
    assert.deepEqual(
      observed.toSorted(),
      nodeShardInventory(cwd, process.platform),
    );
    assert.equal(new Set(observed).size, observed.length);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("real Node inventory runs exactly once per host", () => {
  const all = discoverNodeTests(process.cwd());
  assert.deepEqual(dedicatedMacosNodeFiles, [
    "tests/property/m5-array-constructor.property.test.ts",
  ]);
  assert.deepEqual(nodeShardInventory(process.cwd(), "linux"), all);
  for (const platform of ["linux", "darwin"]) {
    const inventory = nodeShardInventory(process.cwd(), platform);
    const selected = shards(inventory, platform).flat();
    assert.equal(new Set(selected).size, selected.length);
    assert.deepEqual(selected.toSorted(), inventory);
  }
  assert.deepEqual(
    [
      ...nodeShardInventory(process.cwd(), "darwin"),
      ...dedicatedMacosNodeFiles,
    ].toSorted(),
    all,
  );
});

test("every weighted file exists and every shard keeps its margin", () => {
  const all = new Set(discoverNodeTests(process.cwd()));
  for (const target of ["linux-x86_64-gnu", "macos-aarch64"] as const) {
    const entries = Object.entries(nodeShardCosts[target]);
    assert.ok(entries.length > 0, target);
    for (const [path, seconds] of entries) {
      // A stale entry would keep weighing nothing while hiding a rename.
      assert.ok(all.has(path), `${target}: ${path}`);
      assert.ok(Number.isSafeInteger(seconds) && seconds > 0, path);
    }
    const fallback = nodeShardFallbackSeconds[target];
    assert.ok(Number.isSafeInteger(fallback) && fallback > 0, target);
  }
  assert.deepEqual(Object.keys(nodeShardCosts).toSorted(), [
    "linux-x86_64-gnu",
    "macos-aarch64",
  ]);
  assert.deepEqual(Object.keys(nodeShardFallbackSeconds).toSorted(), [
    "linux-x86_64-gnu",
    "macos-aarch64",
  ]);
  assert.equal(nodeShardModel("linux").width, 3);
  assert.equal(nodeShardModel("darwin").width, 2);
  // Forty modeled minutes including the measured minute of job setup,
  // from the largest of three CI observations of each weighted file.
  for (const platform of ["linux", "darwin"]) {
    const inventory = nodeShardInventory(process.cwd(), platform);
    for (const shard of shards(inventory, platform)) {
      assert.ok(modeledNodeShardSeconds(shard, platform) + 60 <= 2400);
    }
  }
});

test("Node shard selection is deterministic and model-driven", () => {
  const heavy = "tests/dynamic-source-residual-evidence.test.ts";
  const files = [
    heavy,
    "tests/light-a.test.ts",
    "tests/light-b.test.ts",
    "tests/light-c.test.ts",
  ];
  // The heaviest file takes a shard of its own when lighter files can
  // fill the others, and an unknown file weighs the host fallback.
  const linux = shards(files, "linux");
  assert.deepEqual(linux[0], [heavy]);
  assert.deepEqual(linux.flat().toSorted(), files.toSorted());
  assert.deepEqual(shards(files, "linux"), linux);
  for (const shard of linux) assert.deepEqual(shard, shard.toSorted());
  assert.throws(
    () => selectNodeTestShard([heavy, heavy], { index: 1, total: 2 }, "linux"),
    /unique/u,
  );
  // A file sorted after a heavy one waits for a free worker.
  const fallback = nodeShardFallbackSeconds["linux-x86_64-gnu"];
  const weight = nodeShardCosts["linux-x86_64-gnu"][heavy];
  assert.equal(
    modeledNodeShardSeconds(
      [heavy, "z1.test.ts", "z2.test.ts", "z3.test.ts"],
      "linux",
    ),
    Math.max(weight, 2 * fallback),
  );
});

test("Node wrapper propagates failures and handles empty shards", () => {
  const cwd = mkdtempSync(join(tmpdir(), "oseo-node-shard-empty-"));
  try {
    assert.deepEqual(
      nodeTestShardArguments(cwd, { index: 1, total: 4 }, process.platform),
      [],
    );
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
