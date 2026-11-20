/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  assertAsyncProperty,
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
  seed: 0x6000_0100,
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

test("scales only the time limit for instrumented lanes", () => {
  const ordinary = propertyParameters(ordinarySuite, {});
  const instrumented = propertyParameters(ordinarySuite, {
    OSEO_PROPERTY_TIME_SCALE: "3",
  });
  assert.equal(instrumented.numRuns, ordinary.numRuns);
  assert.equal(
    instrumented.interruptAfterTimeLimit,
    (ordinary.interruptAfterTimeLimit ?? 0) * 3,
  );
  assert.equal(instrumented.markInterruptAsFailure, true);
});

test("awaits asynchronous property predicates", async () => {
  let completed = false;
  await assertAsyncProperty(
    "asynchronous runner completion",
    fc.asyncProperty(fc.constant(null), async () => {
      await Promise.resolve();
      completed = true;
    }),
    { ...ordinarySuite, numRuns: 1 },
  );
  assert.equal(completed, true);
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
      propertyParameters(ordinarySuite, {
        OSEO_PROPERTY_TIME_SCALE: "0",
      }),
    /OSEO_PROPERTY_TIME_SCALE must be positive/u,
  );
  assert.throws(
    () =>
      propertySize({
        OSEO_PROPERTY_SIZE: "huge",
      }),
    /OSEO_PROPERTY_SIZE must be small or large/u,
  );
});
