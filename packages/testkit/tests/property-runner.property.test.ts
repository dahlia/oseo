import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  assertProperty,
  propertyParameters,
  propertySize,
} from "./property-support.ts";

const size = propertySize();
const maximumLength = size === "large" ? 128 : 32;

const ordinarySuite = {
  domain: "finite integer lists",
  numRuns: 1_000,
  profile: "M2 and M3 primitive values",
  seed: 0x5eed_0001,
  sizeLimit: `${maximumLength} integers`,
  timeLimitMilliseconds: 5_000,
} as const;

test("runs one unchanged deterministic property under both hosts", () => {
  assertProperty(
    "sorted integer lists retain their members",
    fc.property(
      fc.array(fc.integer(), { maxLength: maximumLength }),
      (values) => {
        const sorted = values.toSorted((left, right) => left - right);
        assert.deepEqual(
          sorted.toSorted((left, right) => left - right),
          sorted,
        );
        assert.equal(sorted.length, values.length);
      },
    ),
    ordinarySuite,
  );
});

test("records explicit replay inputs and incomplete-run failures", () => {
  assert.deepEqual(
    propertyParameters(ordinarySuite, {
      OSEO_PROPERTY_PATH: "1:2",
      OSEO_PROPERTY_RUN_SCALE: "10",
      OSEO_PROPERTY_SEED: "42",
    }),
    {
      interruptAfterTimeLimit: 50_000,
      markInterruptAsFailure: true,
      numRuns: 10_000,
      path: "1:2",
      randomType: "xorshift128plus",
      seed: 42,
      verbose: true,
    },
  );
});

test("rejects invalid replay configuration", () => {
  assert.throws(
    () =>
      propertyParameters(ordinarySuite, {
        OSEO_PROPERTY_SEED: "not-an-integer",
      }),
    /OSEO_PROPERTY_SEED must be a safe integer/u,
  );
  assert.throws(
    () =>
      propertyParameters(ordinarySuite, {
        OSEO_PROPERTY_RUN_SCALE: "0",
      }),
    /OSEO_PROPERTY_RUN_SCALE must be positive/u,
  );
  assert.throws(
    () =>
      propertySize({
        OSEO_PROPERTY_SIZE: "huge",
      }),
    /OSEO_PROPERTY_SIZE must be small or large/u,
  );
});
