import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dedicatedSanitizerPropertyFiles } from "../tools/native-shard.ts";
import {
  discoverSanitizerPropertyFiles,
  sharedSanitizerPropertyFiles,
} from "../tools/sanitizer-property-shard.ts";

const childEnv = { ...process.env, NODE_TEST_CONTEXT: undefined };

const runner = fileURLToPath(
  new URL("../tools/run-sanitizer-property-shard.ts", import.meta.url),
);

function markers(stdout: string): readonly string[] {
  return [...stdout.matchAll(/FILE:([^\s]+)/gu)].map((match) => match[1]!);
}

function run(cwd: string, args: readonly string[]): readonly string[] {
  const child = spawnSync(process.execPath, args, {
    cwd,
    env: childEnv,
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  return markers(child.stdout);
}

test("shared shards keep Node's positions minus dedicated files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "oseo-sanitizer-property-"));
  try {
    // Upper case sorts before lower case, as Node sorts an explicit list.
    const files = [
      "tests/property/A-upper.property.test.ts",
      "tests/property/a-lower.property.test.ts",
      "tests/property/m5-zz.property.test.ts",
      "tests/property/m5-aa.property.test.ts",
      "tests/property/m5-regexp-a.property.test.ts",
      "tests/property/m5-regexp-z.property.test.ts",
      ...dedicatedSanitizerPropertyFiles,
    ];
    writeFileSync(join(cwd, "package.json"), '{"type":"module"}');
    for (const file of [...files, "tests/property/helper.ts"]) {
      const path = join(cwd, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `console.log(${JSON.stringify(`FILE:${file}`)});`);
    }
    assert.deepEqual(discoverSanitizerPropertyFiles(cwd), files.toSorted());
    const observed: string[] = [];
    for (let index = 1; index <= 3; index++) {
      const shard = { index, total: 3 };
      // Node's own shard over the complete list, less the dedicated files.
      const node = run(cwd, [
        "--test",
        `--test-shard=${index}/3`,
        ...files,
      ]).filter((file) => !dedicatedSanitizerPropertyFiles.includes(file));
      const selected = sharedSanitizerPropertyFiles(cwd, shard);
      assert.deepEqual(selected.toSorted(), node.toSorted());
      const shared = run(cwd, [runner, "--shard", `${index}/3`]);
      assert.deepEqual(shared.toSorted(), node.toSorted());
      observed.push(...shared);
    }
    observed.push(...run(cwd, ["--test", ...dedicatedSanitizerPropertyFiles]));
    assert.deepEqual(observed.toSorted(), files.toSorted());
    assert.equal(new Set(observed).size, observed.length);
    // Without a shard the whole shared list runs.
    assert.deepEqual(
      run(cwd, [runner]).toSorted(),
      files
        .filter((file) => !dedicatedSanitizerPropertyFiles.includes(file))
        .toSorted(),
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("the real inventory leaves out only the dedicated files", () => {
  const all = discoverSanitizerPropertyFiles(process.cwd());
  assert.deepEqual(dedicatedSanitizerPropertyFiles, [
    "tests/property/m5-regexp-literal-exhaustive.property.test.ts",
  ]);
  for (const file of dedicatedSanitizerPropertyFiles) {
    assert.ok(all.includes(file), file);
  }
  const shards = [1, 2, 3].map((index) =>
    sharedSanitizerPropertyFiles(process.cwd(), { index, total: 3 }),
  );
  assert.deepEqual(
    [...shards.flat(), ...dedicatedSanitizerPropertyFiles].toSorted(),
    all,
  );
  assert.deepEqual(
    [
      ...sharedSanitizerPropertyFiles(process.cwd()),
      ...dedicatedSanitizerPropertyFiles,
    ].toSorted(),
    all,
  );
});

test("the shared runner propagates failures and handles empty lists", () => {
  const cwd = mkdtempSync(join(tmpdir(), "oseo-sanitizer-property-empty-"));
  try {
    assert.deepEqual(sharedSanitizerPropertyFiles(cwd), []);
    const empty = spawnSync(process.execPath, [runner, "--shard=1/3"], {
      cwd,
      env: childEnv,
      encoding: "utf8",
    });
    assert.equal(empty.status, 0, empty.stderr);
    const file = "tests/property/failing.property.test.ts";
    mkdirSync(join(cwd, "tests/property"), { recursive: true });
    writeFileSync(join(cwd, "package.json"), '{"type":"module"}');
    writeFileSync(join(cwd, file), "process.exitCode = 3;");
    const failing = spawnSync(process.execPath, [runner], {
      cwd,
      env: childEnv,
      encoding: "utf8",
    });
    assert.notEqual(failing.status, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
