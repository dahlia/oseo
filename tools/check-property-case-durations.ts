import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { isString } from "./value-kinds.ts";

/** Interval and runner parameters emitted by one case-shard property. */
export interface DurationRecord {
  readonly version: number;
  readonly domain: string;
  readonly profile: string;
  readonly shard: {
    readonly index: number;
    readonly total: number;
  };
  readonly durationMilliseconds: number;
  readonly limitMilliseconds: number;
  readonly numRuns: number;
  readonly path: string;
  readonly seed: number;
}

/** Pinned CI case-shard contract, checked against the suite and mise task. */
export const ownKeyCaseContract = {
  profile: "M5 Object own-key statics",
  total: 3,
  limitMilliseconds: 3_600_000,
  numRuns: 160,
  seed: 1_592_590_339,
} as const;

const targets = ["linux-x86_64-gnu", "macos-aarch64"] as const;
const shardTotal = ownKeyCaseContract.total;
const originalLimit = ownKeyCaseContract.limitMilliseconds;

function artifactName(target: string, index: number): string {
  return `own-key-duration-${target}-${index}-of-${shardTotal}`;
}

function parseRecord(text: string, name: string): DurationRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${name}: invalid JSON duration record`, {
      cause: error,
    });
  }
  // SAFETY: Every field used below is validated before the record is returned.
  const record = parsed as DurationRecord;
  function requireField(valid: boolean, field: string): void {
    if (!valid) throw new Error(`${name}: invalid ${field}`);
  }
  requireField(record != null, "record");
  requireField(record.version === 1, "version");
  requireField(record.profile === ownKeyCaseContract.profile, "profile");
  requireField(isString(record.domain) && record.domain.length > 0, "domain");
  requireField(
    Number.isFinite(record.durationMilliseconds) &&
      record.durationMilliseconds > 0,
    "durationMilliseconds",
  );
  requireField(record.limitMilliseconds === originalLimit, "limitMilliseconds");
  requireField(record.numRuns === ownKeyCaseContract.numRuns, "numRuns");
  requireField(record.seed === ownKeyCaseContract.seed, "seed");
  requireField(record.path === "", "path");
  requireField(record.shard != null, "shard");
  requireField(Number.isSafeInteger(record.shard.index), "shard.index");
  requireField(record.shard.total === shardTotal, "shard.total");
  return record;
}

/** Require every case shard and the original whole-property deadline. */
export function checkCaseDurations(root: string): void {
  const expected = targets.flatMap((target) =>
    Array.from({ length: shardTotal }, (_, offset) =>
      artifactName(target, offset + 1),
    ),
  );
  const actual = readdirSync(root).toSorted();
  if (JSON.stringify(actual) !== JSON.stringify(expected.toSorted())) {
    throw new Error(
      `Property duration artifacts must cover all six shards. ` +
        `expected=${expected.toSorted().join(",")} ` +
        `found=${actual.join(",")}`,
    );
  }
  for (const target of targets) {
    let sum = 0;
    for (let index = 1; index <= shardTotal; index++) {
      const name = artifactName(target, index);
      const record = parseRecord(
        readFileSync(join(root, name, "duration.json"), "utf8"),
        name,
      );
      if (record.shard.index !== index) {
        throw new Error(
          `${name}: wrong shard.index ${record.shard.index}, expected ${index}`,
        );
      }
      if (record.durationMilliseconds > originalLimit) {
        throw new Error(
          `${name}: measured ${record.durationMilliseconds}ms exceeds ` +
            `hard stop ${originalLimit}ms`,
        );
      }
      sum += record.durationMilliseconds;
    }
    console.log(
      `property-case-duration target=${target} ` +
        `measured=${sum.toFixed(1)}ms limit=${originalLimit}ms`,
    );
    if (sum > originalLimit) {
      throw new Error(
        `Aggregate property deadline exceeded: ${target} ` +
          `${sum}ms > ${originalLimit}ms`,
      );
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (root == null || process.argv.length !== 3) {
    throw new Error("Expected one duration artifact directory.");
  }
  checkCaseDurations(root);
}
