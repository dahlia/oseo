import assert from "node:assert/strict";
import test from "node:test";

import type {
  Diagnostic,
  SyntaxImportCall,
  SyntaxModule,
  SyntaxProgram,
} from "@oseo/compiler";

import {
  babelFrontend,
  babelModuleFrontend,
  createBabelFrontend,
  createBabelModuleFrontend,
} from "../src/index.ts";

const profileMessage = "ImportExpression is outside the M1 profile.";
const scriptFrontend = createBabelFrontend({ staticSpecifierImports: true });
const moduleFrontend = createBabelModuleFrontend({
  staticSpecifierImports: true,
});

function parseModule(source: string): SyntaxModule {
  const result = moduleFrontend.parseModule({ source, sourceId: "m.mjs" });
  assert.deepEqual(result.diagnostics, [], source);
  assert.ok(result.module, source);
  return result.module;
}

function parseScript(source: string): SyntaxProgram {
  const result = scriptFrontend.parse({ source, sourceId: "s.js" });
  assert.deepEqual(result.diagnostics, [], source);
  assert.ok(result.program, source);
  return result.program;
}

/** Each admitted spelling with the value its literal decodes to. */
const admittedCalls: readonly (readonly [string, string])[] = [
  ['import("./a.js")', "./a.js"],
  ["import('./a.js')", "./a.js"],
  ['import("./a.js",)', "./a.js"],
  ['import(("./a.js"))', "./a.js"],
  ['import(((  "./a.js"  )),)', "./a.js"],
  [String.raw`import("./a.js")`, "./a.js"],
  [String.raw`import("./\x61\u{62}.js")`, "./ab.js"],
  ['import("")', ""],
];

/** Sites the subset admits in module and Script source. */
const contexts: readonly (readonly [string, string])[] = [
  ["", ";"],
  ["let p = ", ";"],
  ["function f() { return ", "; }"],
  ["let f = () => ", ";"],
  ["async function f() { await ", "; }"],
  ["function* f() { yield ", "; }"],
  ["async function* f() { yield ", "; }"],
  ["let o = { m() { return ", "; } };"],
  ["class C { m() { return ", "; } }"],
  ["class C { static { ", "; } }"],
  ["class C { field = ", "; }"],
  ["if (true) { ", "; }"],
  ["new (", ");"],
];

test("default frontends still reject every ImportCall", () => {
  const source = 'let p;\n  p = import("./a.js");';
  for (const result of [
    babelFrontend.parse({ source, sourceId: "s.js" }),
    babelModuleFrontend.parseModule({ source, sourceId: "m.mjs" }),
  ]) {
    assert.equal(result.parsed, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => [
        diagnostic.code,
        diagnostic.message,
        diagnostic.range.start,
        diagnostic.byteRange,
      ]),
      [
        [
          "OSEO1001",
          profileMessage,
          { column: 7, line: 2 },
          { end: 29, start: 13 },
        ],
      ],
    );
  }
});

test("admitted literal calls convert in modules and Scripts", () => {
  for (const [call, value] of admittedCalls) {
    for (const [open, close] of contexts) {
      const source = `${open}${call}${close}`;
      const start = Buffer.byteLength(open);
      for (const syntax of [parseModule(source), parseScript(source)]) {
        assert.equal(syntax.importCalls?.length, 1, source);
        const [site] = syntax.importCalls ?? [];
        assert.equal(site?.kind, "import-call", source);
        assert.equal(site?.specifier.value, value, source);
        assert.deepEqual(
          site?.byteRange,
          { end: start + Buffer.byteLength(call), start },
          source,
        );
        assert.ok(site.specifier.byteRange.start > start, source);
        assert.equal(site.specifier.attributes, undefined, source);
      }
    }
  }
});

test("importCalls lists every converted site once in source order", () => {
  const source = [
    'const later = () => import("./c.js");',
    'import("./a.js");',
    'function f() { return [import("./b.js"), import("./a.js")]; }',
  ].join("\n");
  for (const syntax of [parseModule(source), parseScript(source)]) {
    const calls: readonly SyntaxImportCall[] = syntax.importCalls ?? [];
    assert.deepEqual(
      calls.map((call) => [call.specifier.value, call.range.start]),
      [
        ["./c.js", { column: 21, line: 1 }],
        ["./a.js", { column: 1, line: 2 }],
        ["./b.js", { column: 24, line: 3 }],
        ["./a.js", { column: 42, line: 3 }],
      ],
    );
  }
});

test("syntax without import() keeps importCalls absent", () => {
  const source = "export const value = 1;";
  assert.equal(parseModule(source).importCalls, undefined);
  assert.equal(parseScript("var value = 1;").importCalls, undefined);
});

/** Forms outside the subset, which keep the exact profile diagnostic. */
const rejectedCalls: readonly string[] = [
  "import(`./a.js`)",
  "import(specifier)",
  'import("./" + "a.js")',
  'import("./a.js", {})',
  'import("./a.js", undefined)',
  'import("./a.js", { with: { type: "json" } },)',
  "import(0)",
  "import((specifier))",
];

test("other ImportCall forms keep the exact profile diagnostic", () => {
  for (const call of rejectedCalls) {
    const source = `let specifier = "./a.js";\n${call};`;
    const start = Buffer.byteLength('let specifier = "./a.js";\n');
    for (const result of [
      scriptFrontend.parse({ source, sourceId: "s.js" }),
      moduleFrontend.parseModule({ source, sourceId: "m.mjs" }),
    ]) {
      assert.equal(result.parsed, false, call);
      const diagnostics: readonly Diagnostic[] = result.diagnostics;
      assert.deepEqual(
        diagnostics.map((diagnostic) => [
          diagnostic.code,
          diagnostic.message,
          diagnostic.byteRange,
        ]),
        [
          [
            "OSEO1001",
            profileMessage,
            { end: start + Buffer.byteLength(call), start },
          ],
        ],
        call,
      );
    }
  }
});

test("enabling the subset changes no other ImportCall diagnostic", () => {
  for (const source of [
    'new import("./a.js").prop;',
    'import.defer("./a.js");',
    'import.source("./a.js");',
    'import("./a.js"',
    "import(...specifiers);",
  ]) {
    const enabled = moduleFrontend.parseModule({ source, sourceId: "m.mjs" });
    const disabled = babelModuleFrontend.parseModule({
      source,
      sourceId: "m.mjs",
    });
    assert.equal(enabled.parsed, false, source);
    assert.deepEqual(enabled.diagnostics, disabled.diagnostics, source);
  }
});
