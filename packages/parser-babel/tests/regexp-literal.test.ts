import assert from "node:assert/strict";
import test from "node:test";

import { renderDiagnostic } from "@oseo/compiler";
import type { Diagnostic } from "@oseo/compiler";

import { babelFrontend } from "../src/index.ts";

function diagnostics(source: string): readonly Diagnostic[] {
  const result = babelFrontend.parse({ source, sourceId: "fixture.js" });
  assert.equal(result.parsed, false);
  return result.diagnostics;
}

function only(source: string): Diagnostic {
  const reported = diagnostics(source);
  assert.equal(reported.length, 1, source);
  const first = reported[0];
  if (first == null) throw new Error("a rejected source reports a diagnostic");
  return first;
}

test("reports one profile boundary for a valid literal", () => {
  const diagnostic = only("const x = /a[b-c]+/giu;\n");
  assert.equal(
    renderDiagnostic(diagnostic),
    "fixture.js:1:11: error[OSEO1001]: Regular expression evaluation is " +
      "outside the M5 profile.",
  );
  assert.deepEqual(diagnostic.byteRange, { end: 22, start: 10 });
});

test("reports an invalid literal pattern as an early error", () => {
  const diagnostic = only("const x = /(a/;\n");
  assert.equal(
    renderDiagnostic(diagnostic),
    "fixture.js:1:12: error[OSEO0001]: A group is unterminated.",
  );
  assert.deepEqual(diagnostic.byteRange, { end: 13, start: 11 });
});

test("locates a pattern error inside the literal, not at its start", () => {
  const diagnostic = only("let y = 0;\nconst x = /ab{2,1}/u;\n");
  assert.equal(
    renderDiagnostic(diagnostic),
    "fixture.js:2:14: error[OSEO0001]: A quantifier's lower bound is above " +
      "its upper bound.",
  );
  assert.deepEqual(diagnostic.range.start, { column: 14, line: 2 });
  assert.deepEqual(diagnostic.range.end, { column: 19, line: 2 });
});

test("locates a pattern error after a supplementary code point", () => {
  const diagnostic = only("const x = /\u{1F600}[z-a]/u;\n");
  assert.equal(
    renderDiagnostic(diagnostic),
    "fixture.js:1:14: error[OSEO0001]: A character class range is out of " +
      "order.",
  );
  assert.deepEqual(diagnostic.byteRange, { end: 19, start: 16 });
});

test("reports an unadmitted construct as a profile diagnostic", () => {
  const cases: readonly (readonly [string, string, number])[] = [
    [
      "const x = /\\p{L}/u;\n",
      "A Unicode property escape is not admitted yet.",
      11,
    ],
    ["const x = /[a]/v;\n", "Class set notation is not admitted yet.", 11],
    [
      "const x = /(?i:a)/;\n",
      "An inline modifier group is not admitted yet.",
      11,
    ],
  ];
  for (const [source, message, start] of cases) {
    const diagnostic = only(source);
    assert.equal(diagnostic.code, "OSEO1001", source);
    assert.equal(diagnostic.message, message, source);
    assert.equal(diagnostic.byteRange.start, start, source);
  }
});

test("keeps a duplicate flag a bootstrap parse rejection", () => {
  const diagnostic = only("const x = /a/gg;\n");
  assert.equal(diagnostic.code, "OSEO0001");
});

test("reports a literal that follows admitted syntax", () => {
  const diagnostic = only("const a = 1;\nconst b = /(c/;\n");
  assert.equal(
    renderDiagnostic(diagnostic),
    "fixture.js:2:12: error[OSEO0001]: A group is unterminated.",
  );
});

test("rejects a literal wherever an expression is admitted", () => {
  const sources: readonly string[] = [
    "console.log(/a/);\n",
    "const x = { p: /a/ };\n",
    "const x = [/a/];\n",
    "function f() {\n  return /a/;\n}\n",
  ];
  for (const source of sources) {
    const diagnostic = only(source);
    assert.equal(diagnostic.code, "OSEO1001", source);
    assert.equal(
      diagnostic.message,
      "Regular expression evaluation is outside the M5 profile.",
      source,
    );
  }
});
