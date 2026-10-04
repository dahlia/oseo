import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

import {
  nativeShardCosts,
  ownKeyCaseShardCosts,
} from "../tools/native-shard-costs.ts";

import {
  nativeTestArguments,
  selectNativeTestShard,
} from "../tools/native-shard.ts";

test("native property shards cover every file exactly once", async () => {
  const files = (await readdir(new URL("property/", import.meta.url)))
    .filter((path) => path.endsWith(".property.test.ts"))
    .map((path) => `tests/property/${path}`);
  for (const table of Object.values(nativeShardCosts)) {
    for (const path of Object.keys(table))
      assert.ok(files.includes(path), path);
  }
  // Include new files absent from the checked-in measurements.
  files.push("tests/property/unknown.property.test.ts");
  for (const platform of ["darwin", "linux"]) {
    for (const inventory of [
      files,
      files.filter(
        (path) => path !== "tests/property/m5-object-own-keys.property.test.ts",
      ),
    ]) {
      for (const total of [1, 2, 4, 5, 12, inventory.length + 1]) {
        const partitions = Array.from({ length: total }, (_, index) =>
          selectNativeTestShard(
            inventory,
            { index: index + 1, total },
            platform,
          ),
        );
        assert.deepEqual(partitions.flat().toSorted(), inventory.toSorted());
        assert.equal(new Set(partitions.flat()).size, inventory.length);
        for (let index = 1; index <= total; index++) {
          assert.deepEqual(
            selectNativeTestShard(
              inventory.toReversed(),
              { index, total },
              platform,
            ),
            partitions[index - 1],
          );
        }
      }
    }
  }
});

test("Linux isolates own-key properties from every other file", async () => {
  const files = (await readdir(new URL("property/", import.meta.url)))
    .filter((path) => path.endsWith(".property.test.ts"))
    .map((path) => `tests/property/${path}`);
  const ownKeys = "tests/property/m5-object-own-keys.property.test.ts";
  assert.deepEqual(nativeTestArguments(["--shard=1/5", ...files], "linux"), [
    ownKeys,
  ]);
  for (let index = 2; index <= 5; index++) {
    assert.ok(
      !selectNativeTestShard(files, { index, total: 5 }, "linux").includes(
        ownKeys,
      ),
    );
  }
});

test("case-sharded file leaves both CI file partitions", async () => {
  const files = (await readdir(new URL("property/", import.meta.url)))
    .filter((path) => path.endsWith(".property.test.ts"))
    .map((path) => `tests/property/${path}`);
  const ownKeys = "tests/property/m5-object-own-keys.property.test.ts";
  for (const [platform, total] of [
    ["linux", 5],
    ["darwin", 12],
  ] as const) {
    const selected = Array.from({ length: total }, (_, offset) =>
      nativeTestArguments(
        [`--shard=${offset + 1}/${total}`, "--exclude-case-sharded", ...files],
        platform,
      ),
    ).flat();
    assert.deepEqual(
      selected.toSorted(),
      files.filter((path) => path !== ownKeys).toSorted(),
    );
    assert.equal(new Set(selected).size, files.length - 1);
  }
  assert.equal(ownKeyCaseShardCosts["linux-x86_64-gnu"], 1109);
  assert.equal(ownKeyCaseShardCosts["macos-aarch64"], 1189);
});

test("native shards start the measured expensive batch first", () => {
  const files = [
    "tests/property/m5-object-own-keys.property.test.ts",
    "tests/property/m5-reflect-namespace.property.test.ts",
    "tests/property/m5-proxy-exotic-object.property.test.ts",
    "tests/property/unicode-tables.property.test.ts",
  ];
  assert.deepEqual(
    selectNativeTestShard(files, { index: 1, total: 12 }, "darwin"),
    files.slice(0, 3),
  );
});

test(
  "Linux singleton runs only own-key with one worker",
  { skip: process.platform !== "linux" ? "Linux shard policy" : false },
  async () => {
    const { execFile } = await import("node:child_process");
    const { mkdir, mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const { promisify } = await import("node:util");
    const execute = promisify(execFile);
    const root = await mkdtemp(join(tmpdir(), "oseo-shard-singleton-"));
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    try {
      await mkdir(join(root, "tests/property"), { recursive: true });
      const ownKeys = "tests/property/m5-object-own-keys.property.test.ts";
      const peer = "tests/property/m5-reflect-namespace.property.test.ts";
      await writeFile(
        join(root, ownKeys),
        'import test from "node:test"; test("passes", () => {});\n',
      );
      await writeFile(join(root, peer), 'throw new Error("must not run");\n');
      const runner = fileURLToPath(
        new URL("../tools/run-native-tests.ts", import.meta.url),
      );
      const { stdout } = await execute(
        process.execPath,
        [runner, "--shard=1/5", ownKeys, peer],
        { cwd: root, env: environment },
      );
      const marker = stdout
        .split("\n")
        .find((row) => row.startsWith("native-shard "));
      assert.ok(marker);
      assert.deepEqual(JSON.parse(marker.slice("native-shard ".length)), {
        workers: 1,
        files: [ownKeys],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("native wrapper translates shards and rejects ambiguous input", () => {
  const files = ["tests/property/unknown.property.test.ts"];
  assert.deepEqual(
    nativeTestArguments(["--shard", "1/12", ...files], "darwin"),
    files,
  );
  assert.deepEqual(
    nativeTestArguments(["--shard=12/12", ...files], "darwin"),
    [],
  );
  const largest = Number.MAX_SAFE_INTEGER;
  assert.deepEqual(
    nativeTestArguments([`--shard=${largest}/${largest}`, ...files], "darwin"),
    [],
  );
  assert.deepEqual(
    nativeTestArguments([`--shard=1/${largest}`, ...files], "darwin"),
    files,
  );
  assert.strictEqual(nativeTestArguments(files, "darwin"), files);
  for (const args of [
    ["--shard=0/12", ...files],
    ["--shard=1/12", "--shard=2/12", ...files],
    ["--shard=1/12", "--test-shard=1/12", ...files],
    ["--exclude-case-sharded", ...files],
    ["--exclude-case-sharded=true", ...files],
    [
      "--shard=1/12",
      "--exclude-case-sharded",
      "--exclude-case-sharded",
      ...files,
    ],
    ["--shard=1/12"],
    ["--shard=1/12", "tests/property/*.property.test.ts"],
    ["--shard=1/12", ...files, ...files],
  ])
    assert.throws(() => nativeTestArguments(args, "darwin"));
});

test("native shard preserves order and reports failures", async () => {
  const { execFile } = await import("node:child_process");
  const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { promisify } = await import("node:util");
  const execute = promisify(execFile);
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  const root = await mkdtemp(join(tmpdir(), "oseo-shard-order-"));
  try {
    const log = join(root, "order.txt");
    const runner = fileURLToPath(
      new URL("../tools/run-native-shard.ts", import.meta.url),
    );
    const files = ["z.test.mjs", "a.test.mjs"];
    await Promise.all(
      files.map((file) =>
        writeFile(
          join(root, file),
          'import { appendFileSync } from "node:fs";\n' +
            `appendFileSync(${JSON.stringify(log)},` +
            `${JSON.stringify(file)});\n` +
            'import test from "node:test";\n' +
            'test("passes", () => {});\n',
        ),
      ),
    );
    await execute(
      process.execPath,
      [runner, "1", ...files.map((file) => join(root, file))],
      { env: environment },
    );
    assert.equal(await readFile(log, "utf8"), files.join(""));
    const failure = join(root, "failure.test.mjs");
    await writeFile(
      failure,
      'import test from "node:test";\n' +
        'test("fails", () => { throw new Error("intentional"); });\n',
    );
    await assert.rejects(
      execute(process.execPath, [runner, "1", failure], { env: environment }),
      { code: 1 },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
