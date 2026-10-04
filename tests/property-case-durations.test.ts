import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import fc from "fast-check";

import * as support from "../packages/testkit/tests/property-support.ts";

import {
  checkCaseDurations,
  ownKeyCaseContract,
} from "../tools/check-property-case-durations.ts";
import type { DurationRecord } from "../tools/check-property-case-durations.ts";

const targets = ["linux-x86_64-gnu", "macos-aarch64"] as const;

function writeRecords(root: string, duration: number): void {
  for (const target of targets) {
    for (let index = 1; index <= 3; index++) {
      const name = `own-key-duration-${target}-${index}-of-3`;
      const directory = join(root, name);
      mkdirSync(directory);
      writeFileSync(
        join(directory, "duration.json"),
        JSON.stringify({
          version: 1,
          domain: "own-key fixture",
          profile: "M5 Object own-key statics",
          shard: { index, total: 3 },
          durationMilliseconds: duration,
          limitMilliseconds: 3_600_000,
          numRuns: 160,
          path: "",
          seed: 1_592_590_339,
        }),
      );
    }
  }
}

test("aggregate accepts exactly six complete shards within the limit", () => {
  const root = mkdtempSync(join(tmpdir(), "oseo-property-duration-"));
  try {
    writeRecords(root, 1_000_000);
    assert.doesNotThrow(() => checkCaseDurations(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writer records are accepted by the aggregate", async () => {
  const root = mkdtempSync(join(tmpdir(), "oseo-property-duration-"));
  const first = "own-key-duration-linux-x86_64-gnu-1-of-3";
  const directory = join(root, first);
  mkdirSync(directory);
  const file = join(directory, "duration.json");
  const keys = [
    "OSEO_PROPERTY_CASE_SHARD",
    "OSEO_PROPERTY_DURATION_FILE",
    "OSEO_PROPERTY_RUN_SCALE",
    "OSEO_PROPERTY_SEED",
    "OSEO_PROPERTY_PATH",
  ] as const;
  const previous = keys.map((key) => process.env[key]);
  try {
    process.env.OSEO_PROPERTY_CASE_SHARD = "1/3";
    process.env.OSEO_PROPERTY_DURATION_FILE = file;
    process.env.OSEO_PROPERTY_RUN_SCALE = "10";
    process.env.OSEO_PROPERTY_SEED = String(ownKeyCaseContract.seed);
    delete process.env.OSEO_PROPERTY_PATH;
    await support.assertAsyncProperty(
      "duration integration",
      fc.asyncProperty(fc.constant(null), async () => {}),
      {
        domain: "own-key duration integration",
        numRuns: 16,
        profile: ownKeyCaseContract.profile,
        seed: 42,
        sizeLimit: "constant null",
        timeLimitMilliseconds: 360_000,
      },
    );
    // SAFETY: checkCaseDurations validates every field before accepting it.
    const written = JSON.parse(readFileSync(file, "utf8")) as DurationRecord;
    for (const target of targets) {
      for (let index = 1; index <= 3; index++) {
        const name = `own-key-duration-${target}-${index}-of-3`;
        if (name === first) continue;
        const path = join(root, name);
        mkdirSync(path);
        writeFileSync(
          join(path, "duration.json"),
          JSON.stringify({
            ...written,
            shard: { index, total: 3 },
          }),
        );
      }
    }
    assert.doesNotThrow(() => checkCaseDurations(root));
  } finally {
    for (const [index, key] of keys.entries()) {
      const value = previous[index];
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("aggregate rejects excess time, missing shards, and bad records", () => {
  const root = mkdtempSync(join(tmpdir(), "oseo-property-duration-"));
  try {
    writeRecords(root, 1_300_000);
    assert.throws(
      () => checkCaseDurations(root),
      /Aggregate property deadline exceeded/u,
    );
    const name = "own-key-duration-linux-x86_64-gnu-3-of-3";
    rmSync(join(root, name), { recursive: true });
    assert.throws(() => checkCaseDurations(root), /must cover all six shards/u);
    mkdirSync(join(root, name));
    writeFileSync(join(root, name, "duration.json"), "{}");
    assert.throws(() => checkCaseDurations(root), /invalid version/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("aggregate rejects duplicate indices and an individual overrun", () => {
  const root = mkdtempSync(join(tmpdir(), "oseo-property-duration-"));
  try {
    writeRecords(root, 1_000_000);
    const file = join(
      root,
      "own-key-duration-linux-x86_64-gnu-2-of-3",
      "duration.json",
    );
    // SAFETY: The record came from writeRecords in this test.
    const record = JSON.parse(readFileSync(file, "utf8")) as {
      readonly shard: { readonly index: number; readonly total: number };
      readonly durationMilliseconds: number;
    };
    writeFileSync(
      file,
      JSON.stringify({ ...record, shard: { index: "2", total: 3 } }),
    );
    assert.throws(() => checkCaseDurations(root), /invalid shard.index/u);
    writeFileSync(
      file,
      JSON.stringify({ ...record, shard: { index: 1, total: 3 } }),
    );
    assert.throws(() => checkCaseDurations(root), /wrong shard.index/u);
    writeFileSync(
      file,
      JSON.stringify({ ...record, durationMilliseconds: 3_600_001 }),
    );
    assert.throws(() => checkCaseDurations(root), /exceeds hard stop/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
