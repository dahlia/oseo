import assert from "node:assert/strict";
import test from "node:test";

import { renderDiagnostic } from "@oseo/compiler";
import type {
  Diagnostic,
  RegExpMatcherProgram,
  RegExpMatcherUnicodeData,
  RegExpPatternExtensions,
  SyntaxExpression,
  SyntaxProgram,
} from "@oseo/compiler";

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

/**
 * A stand-in for the pinned tables, small enough to read.
 *
 * The package links no Unicode data of its own, so a test supplies the
 * same facts the command line takes from `@oseo/unicode`. Only the
 * characters these cases name have to be right: the artifact builder owns
 * every ECMAScript decision made from them.
 */
const unicodeData: RegExpMatcherUnicodeData = {
  caseEquivalenceClasses: () => [
    [0x41, 0x61],
    [0x42, 0x62],
    [0x43, 0x63],
  ],
  propertySet: ({ property, value }) => {
    if (property === "L") return [0x41, 0x5b, 0x61, 0x7b];
    if (property === "ASCII") return [0x00, 0x80];
    if (property === "sc" && value === "Grek") return [0x3b1, 0x3ca];
    return undefined;
  },
  spaceSeparators: [0x20, 0x21],
};

const configuredFrontend = createBabelFrontend({
  regexpExtensions,
  regexpUnicodeData: unicodeData,
});
const configuredModuleFrontend = createBabelModuleFrontend({
  regexpExtensions,
  regexpUnicodeData: unicodeData,
});
const dataFreeFrontend = createBabelFrontend({ regexpExtensions });

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

/**
 * The initializer of `const x = <literal>;`, which every accepted case
 * below writes, so a test reads one artifact without a tree walk.
 */
function initializer(program: SyntaxProgram): SyntaxExpression {
  const statement = program.body[0];
  assert(statement != null);
  assert(statement.kind === "const");
  return statement.initializer;
}

function artifact(source: string): RegExpMatcherProgram {
  const result = configuredFrontend.parse({ source, sourceId: "fixture.js" });
  assert.deepEqual(result.diagnostics, [], source);
  assert.equal(result.parsed, true, source);
  assert(result.program != null);
  const expression = initializer(result.program);
  assert.equal(expression.kind, "regexp", source);
  assert(expression.kind === "regexp");
  return expression.matcher;
}

test("compiles a valid literal into an immutable artifact", () => {
  const program = artifact("const x = /a[b-c]+/giu;\n");
  assert.equal(program.kind, "matcher");
  assert.equal(program.source, "a[b-c]+");
  assert.equal(program.flags.text, "giu");
  assert.equal(program.flags.global, true);
  assert.equal(program.flags.ignoreCase, true);
  assert.equal(program.unicodeMode, true);
  assert.ok(program.instructions.length > 0);
  assert.equal(Object.isFrozen(program), true);
  assert.equal(Object.isFrozen(program.instructions), true);
});

test("retains capture metadata a later accessor reports", () => {
  const program = artifact("const x = /(?<a>x)(y)\\k<a>/;\n");
  assert.deepEqual([...program.groupNames], ["a"]);
  assert.deepEqual(
    program.captures.map((capture) => capture.name),
    ["a", undefined],
  );
});

test("compiles two equal literals into two separate artifacts", () => {
  const first = artifact("const x = /a/g;\n");
  const second = artifact("const x = /a/g;\n");
  assert.notEqual(first, second);
  assert.deepEqual(first.instructions, second.instructions);
});

test("resolves property escapes through its configured resolver", () => {
  const cases: readonly string[] = [
    "const x = /\\p{L}/u;\n",
    "const x = /\\P{sc=Grek}/u;\n",
    "const x = /[\\p{ASCII}]/u;\n",
  ];
  for (const source of cases) {
    const program = artifact(source);
    assert.ok(program.sets.length > 0, source);
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

test("reports the boundary when the pinned data is not supplied", () => {
  const cases: readonly (readonly [string, string])[] = [
    [
      "const x = /a/i;\n",
      "An ignore-case pattern needs case folding data that is not linked.",
    ],
    [
      "const x = /\\s/;\n",
      "A whitespace class escape needs Unicode category data that is not " +
        "linked.",
    ],
    [
      "const x = /\\p{L}/u;\n",
      "A Unicode property escape needs property data that is not linked.",
    ],
  ];
  for (const [source, message] of cases) {
    const result = dataFreeFrontend.parse({ source, sourceId: "fixture.js" });
    assert.equal(result.parsed, false, source);
    assert.equal(result.diagnostics.length, 1, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
    assert.equal(result.diagnostics[0]?.message, message, source);
  }
});

test("supplies the same composition to the Module frontend", () => {
  const result = configuredModuleFrontend.parseModule({
    source: "export default /\\p{L}/u;\n",
    sourceId: "fixture.mjs",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.parsed, true);
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

test("admits a literal wherever an expression is admitted", () => {
  const sources: readonly string[] = [
    "console.log(/a/);\n",
    "const x = { p: /a/ };\n",
    "const x = [/a/];\n",
    "function f() {\n  return /a/;\n}\n",
  ];
  for (const source of sources) {
    const result = configuredFrontend.parse({ source, sourceId: "fixture.js" });
    assert.deepEqual(result.diagnostics, [], source);
    assert.equal(result.parsed, true, source);
  }
});
