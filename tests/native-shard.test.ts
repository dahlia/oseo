import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

import { nativeShardCosts } from "../tools/native-shard-costs.ts";

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
    for (const total of [1, 4, 12, files.length + 1]) {
      const partitions = Array.from({ length: total }, (_, index) =>
        selectNativeTestShard(files, { index: index + 1, total }, platform),
      );
      assert.deepEqual(partitions.flat().toSorted(), files.toSorted());
      assert.equal(new Set(partitions.flat()).size, files.length);
      assert.deepEqual(
        selectNativeTestShard(
          files.toReversed(),
          { index: 1, total },
          platform,
        ),
        partitions[0],
      );
    }
  }
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
