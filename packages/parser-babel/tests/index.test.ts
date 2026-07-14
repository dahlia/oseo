import assert from "node:assert/strict";
import test from "node:test";

import { babelFrontend } from "../src/index.ts";

test("normalizes Babel parse failures", () => {
  const result = babelFrontend.parse({
    source: "function {",
    sourceId: "invalid.ts",
  });
  assert.equal(result.parsed, false);
  assert.equal(result.diagnostics[0]?.code, "OSEO0001");
  assert.equal(result.diagnostics[0]?.sourceId, "invalid.ts");
});

const lineTerminators = [
  ["LF", "\n"],
  ["CR", "\r"],
  ["CRLF", "\r\n"],
  ["line separator", "\u2028"],
  ["paragraph separator", "\u2029"],
] as const;

for (const [name, terminator] of lineTerminators) {
  test(`locates failures after ${name}`, () => {
    const result = babelFrontend.parse({
      source: `const value = 1;${terminator}@`,
      sourceId: "invalid.ts",
    });

    assert.deepEqual(result.diagnostics[0]?.range.start, {
      column: 1,
      line: 2,
    });
  });
}
