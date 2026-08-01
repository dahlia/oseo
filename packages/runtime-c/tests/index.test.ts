import assert from "node:assert/strict";
import test from "node:test";

import { cRuntimeProvider } from "../src/index.ts";

test("provides the reviewed C runtime inputs", () => {
  const runtime = cRuntimeProvider.getRuntimeInput();
  assert.equal(runtime.abiVersion, "m5-37");
  assert.equal(runtime.assets.length, 16);
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_bigint.c"),
    ),
  );
});
