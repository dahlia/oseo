/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import { targetForExecutionHost } from "../../packages/compiler/src/index.ts";
import {
  assertMemberReferenceCase,
  fixedMemberReferenceCases,
  host,
  memberSubjectArbitrary,
  modelMemberSubject,
} from "./compound-assignment-support.ts";

const { assertProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

test(
  "fixed compound member references follow the ECMA-262 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const testCase of fixedMemberReferenceCases()) {
      try {
        await assertMemberReferenceCase(testCase);
      } catch (error) {
        throw new Error(
          `Fixed member reference case ${JSON.stringify(testCase)} failed.`,
          { cause: error },
        );
      }
    }
  },
);

/**
 * A successful counting key and the string it returns select the same
 * property. Removing its sole conversion event must leave the entire
 * modeled outcome, order, and stored value unchanged. Shrinking keeps the
 * structured subject, index, and strictness; no source or native build is
 * needed to check this independent substitution law.
 */
test("generated compound member models preserve key substitution", () => {
  assertProperty(
    "compound member model key substitution preserves outcome and order",
    fc.property(
      memberSubjectArbitrary,
      fc.boolean(),
      fc.integer({ min: 0, max: 100 }),
      (subject, strict, index) => {
        const counting = modelMemberSubject(
          { ...subject, key: "counting" },
          index,
          strict,
          false,
        );
        const string = modelMemberSubject(
          { ...subject, key: "string" },
          index,
          strict,
          false,
        );
        assert.equal(
          (counting.match(/conversion/gu) ?? []).length,
          subject.base === "null" || subject.base === "undefined" ? 0 : 1,
        );
        assert.equal(
          counting.replace(/,?conversion,?/gu, (event) =>
            event.startsWith(",") && event.endsWith(",") ? "," : "",
          ),
          string,
        );
      },
    ),
    {
      domain:
        "successful counting and string keys over all compound member " +
        "model forms and bases, strictness, bounded values and indices",
      numRuns: 64,
      profile: "M5 compound member model substitution",
      seed: 0x6000_8e00,
      sizeLimit: "one structured subject and an index in 0..100",
      timeLimitMilliseconds: 30_000,
    },
  );
});
