import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { cRuntimeProvider } from "../src/index.ts";

const primitive = cRuntimeProvider
  .getRuntimeInput()
  .assets.find((asset) => asset.name === "runtime_primitive.c");
assert.ok(primitive != null);
const source = await readFile(primitive.url, "utf8");

/*
 * Every numeric property key and string conversion reaches
 * oseo_internal_number_text. The shortest round-trip search costs up to
 * 17 snprintf and strtod pairs, which dominated index-heavy programs such
 * as the property-escape harness's buildString, so integers below 2^53
 * must be formatted before that search starts. The native number-prototype
 * fixture checks the digits against the reference engines.
 */
test("safe integers skip the shortest round-trip search", () => {
  const start = source.indexOf(
    "size_t oseo_internal_number_text(double value, char *output, " +
      "size_t capacity) {",
  );
  assert.notEqual(start, -1);
  const end = source.indexOf("\n}\n", start);
  assert.notEqual(end, -1);
  const body = source.slice(start, end);
  const integer = body.indexOf(
    "magnitude < 9007199254740992.0 && magnitude == floor(magnitude)",
  );
  const search = body.indexOf("shortest_round_trip_candidate(");
  assert.notEqual(integer, -1);
  assert.notEqual(search, -1);
  assert.ok(integer < search);
  assert.doesNotMatch(body.slice(integer, search), /snprintf|strtod/u);
});
