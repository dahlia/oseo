import assert from "node:assert/strict";
import test from "node:test";

import { cBackend } from "../src/index.ts";

test("emits deterministic synthetic C without executing a toolchain", () => {
  const emitted = cBackend.emit({
    kind: "m0-synthetic-native-module",
    outputLine: "native-fixture=42",
  });
  assert.ok(emitted.source.includes("oseo_runtime_write_line"));
  assert.equal(emitted.sourceName, "generated.c");
});

test("escapes C trigraph prefixes in string literals", () => {
  const emitted = cBackend.emit({
    kind: "m0-synthetic-native-module",
    outputLine: "trigraph=??/",
  });

  assert.ok(emitted.source.includes(String.raw`trigraph=\?\?/`));
  assert.ok(!emitted.source.includes("trigraph=??/"));
});
