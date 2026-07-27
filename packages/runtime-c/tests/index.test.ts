import assert from "node:assert/strict";
import test from "node:test";

import { cRuntimeProvider } from "../src/index.ts";

test("provides the reviewed C runtime inputs", () => {
  const runtime = cRuntimeProvider.getRuntimeInput();
  assert.equal(runtime.abiVersion, "m5-21");
  assert.equal(runtime.assets.length, 14);
});
