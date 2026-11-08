import assert from "node:assert/strict";
import test from "node:test";

import { assertMatchingObservations } from "../src/index.ts";

test("byte comparison distinguishes equal replacement-decoded output", () => {
  assert.throws(
    () =>
      assertMatchingObservations([
        {
          exitStatus: 0,
          stdout: "�",
          stderr: "",
          stdoutBytes: new Uint8Array([255]),
        },
        {
          exitStatus: 0,
          stdout: "�",
          stderr: "",
          stdoutBytes: new Uint8Array([254]),
        },
      ]),
    /Fixture observations differ/u,
  );
  assert.throws(
    () =>
      assertMatchingObservations([
        {
          exitStatus: 0,
          stdout: "",
          stderr: "�",
          stderrBytes: new Uint8Array([255]),
        },
        {
          exitStatus: 0,
          stdout: "",
          stderr: "�",
          stderrBytes: new Uint8Array([254]),
        },
      ]),
    /Fixture observations differ/u,
  );
});
