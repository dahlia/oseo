import assert from "node:assert/strict";
import test from "node:test";

import { cRuntimeProvider } from "../src/index.ts";

test("provides the reviewed C runtime inputs", () => {
  const runtime = cRuntimeProvider.getRuntimeInput();
  assert.equal(runtime.abiVersion, "m5-82");
  assert.equal(runtime.assets.length, 32);
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_bigint.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_regexp.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_regexp_matcher.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_math.c"),
    ),
  );
});
