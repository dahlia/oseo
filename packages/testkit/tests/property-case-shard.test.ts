import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import fc from "fast-check";

import {
  assertAsyncProperty,
  assertProperty,
  propertyCaseShard,
  propertyParameters,
  shardAsyncProperty,
  shardProperty,
} from "./property-support.ts";

const suite = {
  domain: "case shard fixture",
  numRuns: 31,
  profile: "runner contract",
  seed: 42,
  sizeLimit: "one integer",
  timeLimitMilliseconds: 3_100,
} as const;

function indexedArbitrary() {
  let index = 0;
  return fc.nat().map((value) => ({ index: index++, value }));
}

function failingFixture() {
  return fc.asyncProperty(fc.integer({ min: 0, max: 100 }), async (value) => {
    if (value >= 0) throw new Error(`fixture failure ${value}`);
  });
}

test("case shards partition the same generated indices", async () => {
  const full: { readonly index: number; readonly value: number }[] = [];
  const shards: { readonly index: number; readonly value: number }[][] = [
    [],
    [],
    [],
  ];
  const parameters = propertyParameters(suite, {});
  await fc.assert(
    fc.asyncProperty(indexedArbitrary(), async (value) => {
      full.push(value);
    }),
    parameters,
  );
  await Promise.all(
    shards.map(async (recorded, index) => {
      const property = fc.asyncProperty(indexedArbitrary(), async (value) => {
        recorded.push(value);
      });
      await fc.assert(
        shardAsyncProperty(property, { index, total: 3 }),
        parameters,
      );
    }),
  );
  for (const [index, recorded] of shards.entries()) {
    assert.deepEqual(
      recorded,
      full.filter((_, run) => run % 3 === index),
    );
    assert.deepEqual(
      recorded.map((entry) => entry.index),
      Array.from({ length: suite.numRuns }, (_, run) => run).filter(
        (run) => run % 3 === index,
      ),
    );
  }
  assert.equal(
    shards.reduce((sum, values) => sum + values.length, 0),
    full.length,
  );
});

test("failing case shrinks and seed/path replay reproduces it", async () => {
  const previous = {
    shard: process.env.OSEO_PROPERTY_CASE_SHARD,
    seed: process.env.OSEO_PROPERTY_SEED,
    path: process.env.OSEO_PROPERTY_PATH,
  };
  try {
    process.env.OSEO_PROPERTY_CASE_SHARD = "2/3";
    process.env.OSEO_PROPERTY_SEED = String(suite.seed);
    delete process.env.OSEO_PROPERTY_PATH;
    let failure = "";
    await assert.rejects(
      assertAsyncProperty("fixture", failingFixture(), suite),
      (error: Error) => {
        failure = error.message;
        return (
          /Counterexample: \[0\]/u.test(failure) &&
          /case-shard=2\/3/u.test(failure)
        );
      },
    );
    const path = /path: "([^"]+)"/u.exec(failure)?.[1];
    assert.ok(path, failure);
    process.env.OSEO_PROPERTY_PATH = path;
    await assert.rejects(
      assertAsyncProperty("fixture", failingFixture(), suite),
      (error: Error) =>
        /Counterexample: \[0\]/u.test(error.message) &&
        !/case-shard=/u.test(error.message),
    );
  } finally {
    for (const [key, value] of [
      ["OSEO_PROPERTY_CASE_SHARD", previous.shard],
      ["OSEO_PROPERTY_SEED", previous.seed],
      ["OSEO_PROPERTY_PATH", previous.path],
    ] as const) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("a non-owner skips failure until path replay", async () => {
  const values = fc.sample(
    fc.integer({ min: 0, max: 1_000_000_000 }),
    propertyParameters(suite, {}),
  );
  const target = values[1];
  assert.ok(target != null);
  assert.equal(values.filter((value) => value === target).length, 1);
  const fixture = () =>
    fc.asyncProperty(
      fc.integer({ min: 0, max: 1_000_000_000 }),
      async (value) => {
        if (value === target) throw new Error("target failure");
      },
    );
  const previous = {
    shard: process.env.OSEO_PROPERTY_CASE_SHARD,
    seed: process.env.OSEO_PROPERTY_SEED,
    path: process.env.OSEO_PROPERTY_PATH,
  };
  try {
    process.env.OSEO_PROPERTY_SEED = String(suite.seed);
    delete process.env.OSEO_PROPERTY_PATH;
    process.env.OSEO_PROPERTY_CASE_SHARD = "1/3";
    await assertAsyncProperty("non-owner", fixture(), suite);
    process.env.OSEO_PROPERTY_CASE_SHARD = "2/3";
    let failure = "";
    await assert.rejects(
      assertAsyncProperty("owner", fixture(), suite),
      (error: Error) => {
        failure = error.message;
        return /Counterexample:/u.test(failure);
      },
    );
    const path = /path: "([^"]+)"/u.exec(failure)?.[1];
    assert.ok(path, failure);
    process.env.OSEO_PROPERTY_CASE_SHARD = "1/3";
    process.env.OSEO_PROPERTY_PATH = path;
    await assert.rejects(
      assertAsyncProperty("replay", fixture(), suite),
      (error: Error) =>
        /Counterexample:/u.test(error.message) &&
        !/case-shard=/u.test(error.message),
    );
  } finally {
    for (const [key, value] of [
      ["OSEO_PROPERTY_CASE_SHARD", previous.shard],
      ["OSEO_PROPERTY_SEED", previous.seed],
      ["OSEO_PROPERTY_PATH", previous.path],
    ] as const) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("case shards retain the original hard interrupt limit", () => {
  const original = propertyParameters(suite, {});
  const limits = [1, 2, 3].map(
    (index) =>
      propertyParameters(suite, { OSEO_PROPERTY_CASE_SHARD: `${index}/3` })
        .interruptAfterTimeLimit ?? 0,
  );
  assert.ok(limits.every((limit) => limit > 0));
  assert.ok(
    limits.every((limit) => limit === original.interruptAfterTimeLimit),
  );
  assert.equal(propertyCaseShard({}), undefined);
  assert.equal(propertyCaseShard({ OSEO_PROPERTY_CASE_SHARD: "" }), undefined);
  assert.deepEqual(propertyCaseShard({ OSEO_PROPERTY_CASE_SHARD: "2/3" }), {
    index: 1,
    total: 3,
  });
  for (const value of ["0/3", "4/3", "1/0", "1/x", "1/2/3"]) {
    assert.throws(() =>
      propertyCaseShard({
        OSEO_PROPERTY_CASE_SHARD: value,
      }),
    );
  }
});

test("the synchronous assertion also selects its case shard", () => {
  const previous = process.env.OSEO_PROPERTY_CASE_SHARD;
  const executed: number[] = [];
  let generated = 0;
  try {
    process.env.OSEO_PROPERTY_CASE_SHARD = "2/3";
    assertProperty(
      "sync case shard",
      fc.property(
        fc.nat().map(() => generated++),
        (index) => {
          executed.push(index);
        },
      ),
      suite,
    );
    assert.deepEqual(
      executed,
      Array.from({ length: suite.numRuns }, (_, index) => index).filter(
        (index) => index % 3 === 1,
      ),
    );
  } finally {
    if (previous == null) delete process.env.OSEO_PROPERTY_CASE_SHARD;
    else process.env.OSEO_PROPERTY_CASE_SHARD = previous;
  }
});

test("case shards reject a partition with no generated run", async () => {
  const previous = process.env.OSEO_PROPERTY_CASE_SHARD;
  try {
    process.env.OSEO_PROPERTY_CASE_SHARD = "32/32";
    assert.throws(
      () =>
        assertProperty(
          "empty sync shard",
          fc.property(fc.constant(null), () => {}),
          suite,
        ),
      /Case shard total exceeds the generated run count/u,
    );
    await assert.rejects(
      assertAsyncProperty(
        "empty async shard",
        fc.asyncProperty(fc.constant(null), async () => {}),
        suite,
      ),
      /Case shard total exceeds the generated run count/u,
    );
  } finally {
    if (previous == null) delete process.env.OSEO_PROPERTY_CASE_SHARD;
    else process.env.OSEO_PROPERTY_CASE_SHARD = previous;
  }
});

test("preconditions fail closed in a case-sharded property", () => {
  const property = fc.property(fc.constant(null), () => {
    fc.pre(false);
  });
  assert.throws(
    () =>
      fc.check(
        shardProperty(property, { index: 0, total: 3 }),
        propertyParameters(suite, {}),
      ),
    /precondition-free/u,
  );
});

test("async preconditions fail closed in a case-sharded property", async () => {
  const property = fc.asyncProperty(fc.constant(null), async () => {
    fc.pre(false);
  });
  await assert.rejects(
    fc.check(
      shardAsyncProperty(property, { index: 0, total: 3 }),
      propertyParameters(suite, {}),
    ),
    /precondition-free/u,
  );
});

test("a case shard still fails when interrupted", async () => {
  const tiny = { ...suite, numRuns: 1, timeLimitMilliseconds: 3 };
  const parameters = propertyParameters(tiny, {
    OSEO_PROPERTY_CASE_SHARD: "1/3",
  });
  const property = fc.asyncProperty(fc.constant(null), async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  const result = await fc.check(
    shardAsyncProperty(property, { index: 0, total: 3 }),
    parameters,
  );
  assert.equal(result.failed, true);
  assert.equal(result.interrupted, true);
});

test("passing case shards write their measured interval", async () => {
  const root = mkdtempSync(join(tmpdir(), "oseo-case-duration-"));
  const file = join(root, "duration.json");
  const previous = {
    shard: process.env.OSEO_PROPERTY_CASE_SHARD,
    duration: process.env.OSEO_PROPERTY_DURATION_FILE,
  };
  try {
    process.env.OSEO_PROPERTY_CASE_SHARD = "1/3";
    process.env.OSEO_PROPERTY_DURATION_FILE = file;
    await assertAsyncProperty(
      "duration fixture",
      fc.asyncProperty(fc.constant(null), async () => {}),
      { ...suite, numRuns: 3 },
    );
    // SAFETY: The assertions below validate every field used from the file.
    const record = JSON.parse(readFileSync(file, "utf8")) as {
      readonly durationMilliseconds: number;
      readonly limitMilliseconds: number;
      readonly shard: { readonly index: number; readonly total: number };
    };
    assert.ok(record.durationMilliseconds >= 0);
    assert.equal(record.limitMilliseconds, suite.timeLimitMilliseconds);
    assert.deepEqual(record.shard, { index: 1, total: 3 });
    await assert.rejects(
      assertAsyncProperty(
        "duplicate duration fixture",
        fc.asyncProperty(fc.constant(null), async () => {}),
        { ...suite, numRuns: 3 },
      ),
      (error: Error) => "code" in error && error.code === "EEXIST",
    );
    process.env.OSEO_PROPERTY_DURATION_FILE = join(root, "sync-duration.json");
    assertProperty(
      "sync duration fixture",
      fc.property(fc.constant(null), () => {}),
      { ...suite, numRuns: 3 },
    );
    // SAFETY: The assertions below validate every field used from the file.
    const syncRecord = JSON.parse(
      readFileSync(process.env.OSEO_PROPERTY_DURATION_FILE, "utf8"),
    ) as {
      readonly durationMilliseconds: number;
      readonly shard: { readonly index: number; readonly total: number };
    };
    assert.ok(syncRecord.durationMilliseconds >= 0);
    assert.deepEqual(syncRecord.shard, { index: 1, total: 3 });
  } finally {
    if (previous.shard == null) delete process.env.OSEO_PROPERTY_CASE_SHARD;
    else process.env.OSEO_PROPERTY_CASE_SHARD = previous.shard;
    if (previous.duration == null) {
      delete process.env.OSEO_PROPERTY_DURATION_FILE;
    } else process.env.OSEO_PROPERTY_DURATION_FILE = previous.duration;
    rmSync(root, { recursive: true, force: true });
  }
});

test("duration errors are not property failures", async () => {
  const previous = {
    shard: process.env.OSEO_PROPERTY_CASE_SHARD,
    duration: process.env.OSEO_PROPERTY_DURATION_FILE,
  };
  try {
    delete process.env.OSEO_PROPERTY_CASE_SHARD;
    process.env.OSEO_PROPERTY_DURATION_FILE = "/missing/duration.json";
    await assert.rejects(
      assertAsyncProperty(
        "passing fixture",
        fc.asyncProperty(fc.constant(null), async () => {}),
        { ...suite, numRuns: 1 },
      ),
      (error: Error) =>
        error.message === "Duration reporting requires a case shard.",
    );
  } finally {
    if (previous.shard == null) delete process.env.OSEO_PROPERTY_CASE_SHARD;
    else process.env.OSEO_PROPERTY_CASE_SHARD = previous.shard;
    if (previous.duration == null) {
      delete process.env.OSEO_PROPERTY_DURATION_FILE;
    } else process.env.OSEO_PROPERTY_DURATION_FILE = previous.duration;
  }
});
