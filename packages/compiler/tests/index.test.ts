import assert from "node:assert/strict";
import test from "node:test";

import { describeTarget, renderDiagnostic } from "../src/index.ts";
import type { Diagnostic } from "../src/index.ts";

const diagnostic: Diagnostic = {
  byteRange: { end: 0, start: 0 },
  code: "OSEO1001",
  message: "Unsupported syntax.",
  range: {
    end: { column: 1, line: 1 },
    start: { column: 1, line: 1 },
  },
  sourceId: "fixture.ts",
};

test("renders an owned source-located diagnostic", () => {
  assert.equal(
    renderDiagnostic(diagnostic),
    "fixture.ts:1:1: error[OSEO1001]: Unsupported syntax.",
  );
});

test("requires explicit native and cross targets", () => {
  assert.equal(describeTarget("x86_64-linux-gnu").execute, true);
  assert.equal(describeTarget("aarch64-linux-musl").execute, false);
});
