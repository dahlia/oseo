import assert from "node:assert/strict";
import test from "node:test";

import {
  isTestShardPosition,
  parseTestShardArguments,
  selectTestShard,
} from "../tools/shard.ts";

test("parses one-based shard arguments", () => {
  assert.deepEqual(parseTestShardArguments(["--shard", "2/3"]), {
    help: false,
    shard: { index: 2, total: 3 },
    update: false,
  });
  assert.deepEqual(parseTestShardArguments(["--help"]), {
    help: true,
    update: false,
  });
  assert.deepEqual(
    parseTestShardArguments(["--update"], { allowUpdate: true }),
    { help: false, update: true },
  );
});

test("rejects invalid shard arguments", () => {
  for (const value of ["0/3", "4/3", "1/0", "1", "1/2/3", "a/3"]) {
    assert.throws(
      () => parseTestShardArguments(["--shard", value]),
      /shard must have the form INDEX\/TOTAL/u,
      value,
    );
  }
  assert.throws(
    () => parseTestShardArguments(["--shard", "1/3", "--shard", "2/3"]),
    /shard may be specified only once/u,
  );
  assert.throws(
    () => parseTestShardArguments(["--update"]),
    /Unknown option '--update'/u,
  );
  assert.throws(
    () =>
      parseTestShardArguments(["--update", "--shard", "1/3"], {
        allowUpdate: true,
      }),
    /update cannot be combined with shard/u,
  );
});

test("partitions every item exactly once while preserving order", () => {
  const values = Array.from({ length: 10 }, (_, index) => index);
  const partitions = [1, 2, 3].map((index) =>
    selectTestShard(values, { index, total: 3 }),
  );

  assert.deepEqual(partitions, [
    [0, 3, 6, 9],
    [1, 4, 7],
    [2, 5, 8],
  ]);
  assert.deepEqual(
    partitions.flat().toSorted((left, right) => left - right),
    values,
  );
  assert.equal(new Set(partitions.flat()).size, values.length);
  assert.strictEqual(selectTestShard(values), values);
  assert.equal(isTestShardPosition(4, { index: 2, total: 3 }), true);
  assert.equal(isTestShardPosition(4, { index: 1, total: 3 }), false);
});
