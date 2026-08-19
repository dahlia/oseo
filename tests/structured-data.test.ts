import assert from "node:assert/strict";
import test from "node:test";

import { parsedMapping } from "../tools/structured-data.ts";

test("accepts shared structured-data subtrees", () => {
  const shared = { references: ["PLAN-M5.md"], status: "covered" };
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
