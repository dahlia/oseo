import assert from "node:assert/strict";
import test from "node:test";

import { renderDiagnostic } from "@oseo/compiler";
import type { Diagnostic, RegExpPatternExtensions } from "@oseo/compiler";

import {
  babelFrontend,
  createBabelFrontend,
  createBabelModuleFrontend,
} from "../src/index.ts";

const regexpExtensions: RegExpPatternExtensions = {
  admitted: ["unicode-property-escapes"],
  unicodeProperty: ({ property, value }) =>
    property === "L" ||
    property === "ASCII" ||
    (property === "sc" && value === "Grek"),
};
const configuredFrontend = createBabelFrontend({ regexpExtensions });
const configuredModuleFrontend = createBabelModuleFrontend({
  regexpExtensions,
});

function diagnostics(source: string): readonly Diagnostic[] {
  const result = configuredFrontend.parse({
    source,
    sourceId: "fixture.js",
  });
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

test("validates property escapes through its configured resolver", () => {
  const cases: readonly string[] = [
    "const x = /\\p{L}/u;\n",
    "const x = /\\P{sc=Grek}/u;\n",
    "const x = /[\\p{ASCII}]/u;\n",
  ];
  for (const source of cases) {
    const diagnostic = only(source);
    assert.equal(diagnostic.code, "OSEO1001", source);
    assert.equal(
      diagnostic.message,
      "Regular expression evaluation is outside the M5 profile.",
      source,
    );
  }
  const invalid = only("const x = /\\p{Latin}/u;\n");
  assert.equal(invalid.code, "OSEO0001");
  assert.deepEqual(invalid.byteRange, { end: 20, start: 11 });
  assert.deepEqual(invalid.range, {
    end: { column: 21, line: 1 },
    start: { column: 12, line: 1 },
  });
});

test("refuses a property escape when no resolver is configured", () => {
  const result = babelFrontend.parse({
    source: "const x = /\\p{L}/u;\n",
    sourceId: "fixture.js",
  });
  assert.equal(result.parsed, false);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.equal(
    result.diagnostics[0]?.message,
    "A Unicode property escape is not admitted yet.",
  );
});

test("supplies the same property resolver to the Module frontend", () => {
  const result = configuredModuleFrontend.parseModule({
    source: "export default /\\p{L}/u;\n",
    sourceId: "fixture.mjs",
  });
  assert.equal(result.parsed, false);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.equal(
    result.diagnostics[0]?.message,
    "Regular expression evaluation is outside the M5 profile.",
  );
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
