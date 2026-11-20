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

import { parsedMapping } from "../tools/structured-data.ts";

test("accepts shared structured-data subtrees", () => {
  const shared = {
    references: ["docs/language-profile-m5.md"],
    status: "covered",
  };
  const document = { fixed: shared, structural: shared };

  assert.equal(parsedMapping(document, "document"), document);
});

test("rejects circular structured-data subtrees", () => {
  interface CircularDocument {
    self?: CircularDocument;
  }
  const document: CircularDocument = {};
  document.self = document;

  assert.throws(
    () => parsedMapping(document, "document"),
    /document must be a mapping/u,
  );
});

test("rejects undefined and missing array entries", () => {
  const sparse: (number | undefined)[] = [];
  sparse.length = 1;
  assert.throws(
    () => parsedMapping({ values: [undefined] }, "document"),
    /document must be a mapping/u,
  );
  assert.throws(
    () => parsedMapping({ values: sparse }, "document"),
    /document must be a mapping/u,
  );
});
