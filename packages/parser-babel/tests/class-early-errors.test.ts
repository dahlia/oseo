import assert from "node:assert/strict";
import test from "node:test";

import { compileSource, renderDiagnostic } from "@oseo/compiler";
import { babelFrontend, babelModuleFrontend } from "../src/index.ts";

test("duplicate class constructors retain parse diagnostics and spans", () => {
  const forms: readonly string[] = [
    "class Example",
    "const Example = class Named",
    "const Example = class",
  ];
  const spellings: readonly string[] = [
    "constructor",
    '"constructor"',
    "'constructor'",
    "c\\u006fnstructor",
  ];
  for (const form of forms) {
    for (const spelling of spellings) {
      for (const strict of [false, true]) {
        const element = `${spelling}() {}`;
        const source =
          (strict ? '"use strict";\n' : "") +
          `// Unicode prefix: \u03bb\n${form} {\n` +
          `  constructor() {}\n  ${element}\n}`;
        const sourceId = "duplicate-class.js";
        const result = babelFrontend.parse({ source, sourceId });
        assert.equal(result.parsed, false, source);
        assert.equal(result.diagnostics.length, 1, source);
        const diagnostic = result.diagnostics[0];
        assert.ok(diagnostic != null);
        const start = source.lastIndexOf(element);
        const line = strict ? 5 : 4;
        const encoder = new TextEncoder();
        assert.deepEqual(diagnostic, {
          byteRange: {
            end: encoder.encode(source.slice(0, start + element.length)).length,
            start: encoder.encode(source.slice(0, start)).length,
          },
          code: "OSEO0001",
          message: "A class defines one constructor.",
          range: {
            end: { column: 3 + element.length, line },
            start: { column: 3, line },
          },
          sourceId,
        });
        assert.equal(
          renderDiagnostic(diagnostic),
          `${sourceId}:${line}:3: error[OSEO0001]: ` +
            "A class defines one constructor.",
        );
        const moduleResult = babelModuleFrontend.parseModule({
          source,
          sourceId,
        });
        assert.equal(moduleResult.parsed, false, source);
        assert.deepEqual(moduleResult.diagnostics, result.diagnostics, source);
        for (const specialization of ["enabled", "disabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId },
            { specialization },
          );
          assert.equal(compiled.hir, undefined, source);
          assert.equal(compiled.mir, undefined, source);
          assert.deepEqual(compiled.diagnostics, result.diagnostics, source);
        }
      }
    }
  }
});

test("earlier unsupported class syntax does not mask a duplicate", () => {
  const cases: readonly string[] = [
    'class Example { constructor() { import("m"); } constructor() {} }',
    'class Example { static masked = import("m"); ' +
      "constructor() {} constructor() {} }",
    "class Example { readonly value = 1; constructor() {} constructor() {} }",
    'class Example extends (import("m")) { constructor() {} constructor() {} }',
    'const Example = class { constructor() { import("m"); } ' +
      "constructor() {} };",
  ];
  const element = "constructor() {}";
  for (const source of cases) {
    const sourceId = "masked-duplicate-class.ts";
    const start = source.lastIndexOf(element);
    const expected = [
      {
        byteRange: { end: start + element.length, start },
        code: "OSEO0001",
        message: "A class defines one constructor.",
        range: {
          end: { column: start + element.length + 1, line: 1 },
          start: { column: start + 1, line: 1 },
        },
        sourceId,
      },
    ];
    const script = babelFrontend.parse({ source, sourceId });
    assert.equal(script.parsed, false, source);
    assert.deepEqual(script.diagnostics, expected, source);
    const moduleResult = babelModuleFrontend.parseModule({ source, sourceId });
    assert.equal(moduleResult.parsed, false, source);
    assert.deepEqual(moduleResult.diagnostics, expected, source);
    for (const specialization of ["enabled", "disabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source, sourceId },
        { specialization },
      );
      assert.equal(compiled.mir, undefined, source);
      assert.deepEqual(compiled.diagnostics, expected, source);
    }
  }
});

test("constructor-named elements keep their distinct class roles", () => {
  const bodies: readonly string[] = [
    "",
    "constructor() {}",
    '"constructor"() {}',
    "c\\u006fnstructor() {}",
    "constructor() {} static constructor() {}",
    'constructor() {} ["constructor"]() {}',
    'constructor() {} get ["constructor"]() { return 1; }',
    'constructor() {} set ["constructor"](value) {}',
    'constructor() {} ["constructor"] = 1;',
    'constructor() {} static ["constructor"] = 1;',
    "constructor() {} method() {} method() {}",
    "constructor() {} get value() {} set value(next) {}",
    "constructor() {} method() { class Inner { constructor() {} } }",
  ];
  for (const form of ["class Example", "const Example = class"]) {
    for (const body of bodies) {
      const source = `${form} { ${body} }`;
      const script = babelFrontend.parse({
        source,
        sourceId: "valid-class.js",
      });
      assert.equal(script.parsed, true, source);
      assert.deepEqual(script.diagnostics, [], source);
      const moduleResult = babelModuleFrontend.parseModule({
        source,
        sourceId: "valid-class.js",
      });
      assert.equal(moduleResult.parsed, true, source);
      assert.deepEqual(moduleResult.diagnostics, [], source);
    }
  }
});

test("unrelated profile rejections retain unsupported diagnostics", () => {
  const cases: readonly (readonly [string, string, string])[] = [
    [
      "class Example<T> {}",
      "Generic classes are unsupported.",
      "class Example<T> {}",
    ],
    [
      "class Example { readonly value = 1; }",
      "TypeScript class field modifiers are unsupported.",
      "readonly value = 1;",
    ],
    [
      "import('module');",
      "ImportExpression is outside the M1 profile.",
      "import('module')",
    ],
  ];
  for (const [source, message, span] of cases) {
    const sourceId = "unsupported-class.ts";
    const result = babelFrontend.parse({ source, sourceId });
    assert.equal(result.parsed, false, source);
    assert.equal(result.diagnostics.length, 1, source);
    const diagnostic = result.diagnostics[0];
    assert.ok(diagnostic != null);
    assert.equal(diagnostic.code, "OSEO1001", source);
    assert.equal(diagnostic.message, message, source);
    assert.equal(diagnostic.sourceId, sourceId);
    const start = source.indexOf(span);
    assert.deepEqual(diagnostic.byteRange, {
      end: start + span.length,
      start,
    });
    assert.deepEqual(diagnostic.range, {
      end: { column: start + span.length + 1, line: 1 },
      start: { column: start + 1, line: 1 },
    });
  }
});
