import assert from "node:assert/strict";
import test from "node:test";

import { compileSource, renderDiagnostic } from "@oseo/compiler";
import { babelFrontend, babelModuleFrontend } from "../src/index.ts";

const spellings = Array.from("static", (character, index) =>
  [
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
    `\\u{${character.charCodeAt(0).toString(16)}}`,
  ].map(
    (escape) => "static".slice(0, index) + escape + "static".slice(index + 1),
  ),
).flat();

test("escaped static modifiers reject before conversion in both goals", () => {
  for (const spelling of spellings) {
    for (const form of ["class C", "const C = class"]) {
      for (const member of [
        "m() {}",
        "get m() {}",
        "set m(v) {}",
        "*m() {}",
        "async m() {}",
        "async *m() {}",
        "m = 1;",
        "#m() {}",
        "#m = 1;",
        '["m"]() {}',
      ]) {
        for (const strict of [false, true]) {
          const source =
            (strict ? '"use strict";\n' : "") +
            `// λ\n${form} {\n  ${spelling} /* static */ ${member}\n}`;
          const sourceId = "escaped-static.js";
          const start = source.indexOf(spelling);
          const line = strict ? 4 : 3;
          const encoder = new TextEncoder();
          const expected = [
            {
              byteRange: {
                start: encoder.encode(source.slice(0, start)).length,
                end: encoder.encode(source.slice(0, start + spelling.length))
                  .length,
              },
              code: "OSEO0001" as const,
              message: "The static keyword must not contain Unicode escapes.",
              range: {
                start: { line, column: 3 },
                end: { line, column: 3 + spelling.length },
              },
              sourceId,
            },
          ];
          const script = babelFrontend.parse({ source, sourceId });
          assert.equal(script.parsed, false, source);
          assert.deepEqual(script.diagnostics, expected, source);
          const module = babelModuleFrontend.parseModule({ source, sourceId });
          assert.equal(module.parsed, false, source);
          assert.deepEqual(module.diagnostics, expected, source);
          assert.equal(
            renderDiagnostic(expected[0]!),
            `${sourceId}:${line}:3: error[OSEO0001]: ` + expected[0]!.message,
          );
          for (const specialization of ["enabled", "disabled"] as const) {
            const compiled = compileSource(
              babelFrontend,
              { source, sourceId },
              { specialization },
            );
            assert.equal(compiled.hir, undefined, source);
            assert.equal(compiled.mir, undefined, source);
            assert.deepEqual(compiled.diagnostics, expected, source);
          }
        }
      }
    }
  }
});

test("static grammar errors precede earlier unsupported syntax", () => {
  for (const source of [
    String.raw`import("m"); class C { st\u0061tic m() {} }`,
    String.raw`class C extends (import("m")) { st\u0061tic m() {} }`,
    String.raw`function f() { import("m"); class C { st\u0061tic m() {} } }`,
    String.raw`class C { m() { class D { st\u0061tic m() {} } } }`,
    String.raw`class C { readonly st\u0061tic m = 1; }`,
  ]) {
    for (const result of [
      babelFrontend.parse({ source, sourceId: "masked.ts" }),
      babelModuleFrontend.parseModule({ source, sourceId: "masked.ts" }),
    ]) {
      assert.equal(result.parsed, false, source);
      assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
      assert.equal(
        result.diagnostics[0]?.byteRange?.start,
        source.indexOf(String.raw`st\u0061tic`),
        source,
      );
    }
  }
});

test("static property names and unescaped modifiers remain admitted", () => {
  for (const spelling of spellings) {
    for (const body of [
      `${spelling}() {}`,
      `${spelling} = 1;`,
      `static ${spelling}() {}`,
      `static ${spelling} = 1;`,
      `get ${spelling}() {}`,
      `set ${spelling}(v) {}`,
      `static /* ${spelling} */ m() {}`,
      "static /*static*/ m() {}",
      "static //static\n m() {}",
      `static ["${spelling}"] = 1;`,
      `static { const o = { ${spelling}: 1 }; }`,
    ]) {
      const source = `class C { ${body} }`;
      for (const result of [
        babelFrontend.parse({ source, sourceId: "valid.js" }),
        babelModuleFrontend.parseModule({ source, sourceId: "valid.js" }),
      ]) {
        assert.equal(result.parsed, true, source);
        assert.deepEqual(result.diagnostics, [], source);
      }
    }
  }
});

test("escaped static ASI fields retain roles, hints and original spans", () => {
  for (const spelling of spellings) {
    for (const trivia of [
      "\n",
      "\r\n",
      "\u2028",
      "\u2029",
      "/*\n*/",
      "//static\n",
      " /* comment */ \n ",
    ]) {
      for (const form of ["class C", "const C = class"]) {
        const method = "m(value: number) { return value; }";
        const source = `// λ\n${form} { ${spelling}${trivia}${method} }`;
        const result = babelFrontend.parse({ source, sourceId: "asi.ts" });
        assert.equal(result.parsed, true, source);
        if (!result.parsed) continue;
        assert.ok(result.program);
        const declaration = result.program.body[0];
        assert.ok(declaration?.kind === "let" || declaration?.kind === "const");
        const value = declaration.initializer;
        assert.equal(value?.kind, "class");
        if (value?.kind !== "class") continue;
        assert.equal(value.elements.length, 2, source);
        const [field, member] = value.elements;
        assert.equal(field?.kind, "field", source);
        assert.equal(field?.staticPlacement, undefined, source);
        assert.deepEqual(
          field?.key.kind === "string" && field.key.value,
          "static",
          source,
        );
        const encoder = new TextEncoder();
        const fieldStart = source.indexOf(spelling);
        const methodStart = source.indexOf(method);
        assert.deepEqual(
          field?.byteRange,
          {
            start: encoder.encode(source.slice(0, fieldStart)).length,
            end: encoder.encode(source.slice(0, fieldStart + spelling.length))
              .length,
          },
          source,
        );
        assert.equal(member?.kind, "method", source);
        assert.equal(member?.staticPlacement, undefined, source);
        assert.deepEqual(
          member?.byteRange,
          {
            start: encoder.encode(source.slice(0, methodStart)).length,
            end: encoder.encode(source.slice(0, methodStart + method.length))
              .length,
          },
          source,
        );
        if (member?.kind === "method") {
          assert.equal(member.value.sourceText, method, source);
          assert.equal(member.value.parameters[0]?.hints[0]?.name, "number");
        }
        const module = babelModuleFrontend.parseModule({
          source,
          sourceId: "asi.ts",
        });
        assert.equal(module.parsed, true, source);
        assert.deepEqual(module.diagnostics, [], source);
        for (const specialization of ["enabled", "disabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "asi.ts" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, [], source);
          assert.ok(compiled.mir, source);
        }
      }
    }
  }
});

test("ASI normalization preserves roles and later error locations", () => {
  const sources = [
    String.raw`class C { st\u0061tic
static m() {} }`,
    String.raw`class C { st\u0061tic/*
*/ get m() {} }`,
    String.raw`class C { st\u0061tic` +
      "\n" +
      String.raw`st\u0061tic` +
      "\n" +
      "m() {} }",
  ];
  for (const source of sources) {
    assert.equal(
      babelFrontend.parse({ source, sourceId: "roles.js" }).parsed,
      true,
      source,
    );
  }
  const source =
    String.raw`class C { st\u0061tic` +
    "\n" +
    String.raw`m() {} } class D { st\u0061tic n() {} }`;
  const result = babelFrontend.parse({ source, sourceId: "later.js" });
  assert.equal(result.parsed, false);
  assert.equal(
    result.diagnostics[0]?.byteRange?.start,
    source.lastIndexOf(String.raw`st\u0061tic`),
  );
  assert.equal(result.diagnostics[0]?.range?.start.line, 2);
});

test("ASI probes preserve templates and larger identifiers", () => {
  const source =
    String.raw`class C { st\u0061tic` +
    "\n" +
    "m() {} }\n" +
    "const text = `" +
    String.raw`st\u0061tic` +
    "\ntext`;\n" +
    String.raw`class D { myst\u0061tic` +
    "\n" +
    "m() {} }\n" +
    String.raw`// st\u0061tic` +
    "\n";
  const result = babelFrontend.parse({ source, sourceId: "probe.js" });
  assert.equal(result.parsed, true, source);
  assert.ok(result.program);
  const text = result.program.body[1];
  assert.ok(text?.kind === "const");
  assert.ok(text.initializer?.kind === "string");
  assert.equal(text.initializer.value, "static\ntext");
  const other = result.program.body[2];
  assert.ok(other?.kind === "let" && other.initializer?.kind === "class");
  const element = other.initializer.elements[0];
  assert.ok(element?.kind === "field");
  const key = element.key;
  assert.ok(key?.kind === "string");
  assert.equal(key.value, "mystatic");
});

test("parser errors after ASI keep original offsets", () => {
  const source =
    '"use strict"; class C { ' +
    String.raw`st\u0061tic` +
    "\n m() {} } let " +
    String.raw`st\u0061tic` +
    "\n = 1;";
  for (const result of [
    babelFrontend.parse({ source, sourceId: "offset.js" }),
    babelModuleFrontend.parseModule({ source, sourceId: "offset.js" }),
  ]) {
    assert.equal(result.parsed, false);
    assert.equal(result.diagnostics[0]?.code, "OSEO0001");
    assert.equal(
      result.diagnostics[0]?.byteRange?.start,
      source.lastIndexOf(String.raw`st\u0061tic`),
    );
    assert.equal(result.diagnostics[0]?.range?.start.line, 2);
  }
});
