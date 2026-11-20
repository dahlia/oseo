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
