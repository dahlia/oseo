import assert from "node:assert/strict";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import {
  babelFrontend,
  babelModuleFrontend,
} from "../packages/parser-babel/src/index.ts";

for (const source of [
  "function f() { var a=1\ninterface I{}\n+2 }",
  "function f() { var a=1\ninterface I{}\n-2 }",
  'function f() { var a=1\ninterface I{}\n/x/.test("x") }',
  "function f() { var a=1\ninterface I{}\n++a }",
  "function f() { var a=1\ninterface I{}\n--a }",
  "function f() { var a=b\ninterface I{}\n(c) }",
  "function f() { var a=b;\ninterface I{}\n(c) }",
  "function f() { var a=b\ninterface I{} (c) }",
  "function f() { var a=b\ninterface I{}\n/*comment*/(c) }",
  "function f() { var a=b\ntype T=number;\ninterface I{}\n(c) }",
  "function f() { var a=b\ninterface I{}\ntype T=number;\n(c) }",
  "function f() { var a=b\ndeclare const x:number;\n[0] }",
  "function f() { var a=b\ndeclare function g():void;\n`c` }",
  "function f() { var a=b\nnamespace N {type T=number;}\n(c) }",
  "function f() { var x = y as any\n(z) }",
  "function f() { var x = y satisfies any\n[0] }",
  "function f() { var x = y as A as B\n(z) }",
  "function f() { var x = y as any\n`t` }",
  "function f() { var x = y /*gap*/ as any\n/*comment*/(z) }",
  "function f() { class A { static: number\n m() {} } }",
  "function f() { class A { get?: number\n m() {} } }",
  "function f() { class A { set!: number\n m(v) {} } }",
  "function f() { class A { static: number; m() {} } }",
  "function f() { class A { get: number } }",
  "function f() { class A { static?: number = 1\n m() {} } }",
  "function f() { class A { get! /*gap*/ : number\n m() {} } }",
  "function f() { const k = 'm'; class A { x=1 as any\n[k]() {} } }",
  "const f=(x)\n: number=>x;",
  "const f=(x) /*\n*/ :number=>x;",
  "function f(x: λ | 名 | 𐐀): '😀' { return 'x'; }",
  "function f(x: /* λ😀 */ number) { /* keep λ😀 */ }",
  "function f(x:\t number) {}",
  "function f(x:\u2000number) {}",
  "const f=(x):\n 名=>x;",
  "const f=(x):\n 𐐀=>x;",
  "const f=(x):\n '😀'=>x;",
  "function f<T>(this: unknown, x?: number): unknown { /* body */ return x; }",
  "function f(this:T,/*keep*/x:T){}",
  "function f(this:unknown,){}",
  "function f(this:T){ return [1,2]; }",
  "function f(this:T/*keep*/){ return [1,2]; }",
  "function f(){return x /*keep*/ !;}",
  "function f(){return x! /*keep*/ !;}",
  "function f(x: /* comment */ number): string { return 'λ😀'; }",
  "function f(x: { /* member */ value: number }): void {}",
  "const f = (x: number):\n number => x;",
  "const f = <T,>(x: T): T => x;",
  "function f(\r\nx: number,\r\ny?: unknown\r\n): void {}",
]) {
  test(`function source matches Node stripping: ${source}`, () => {
    const stripped = stripTypeScriptTypes(source);
    const typed = babelFrontend.parse({ source, sourceId: "typed.ts" });
    const plain = babelFrontend.parse({
      source: stripped,
      sourceId: "plain.js",
    });
    assert.equal(typed.parsed, true, JSON.stringify(typed.diagnostics));
    assert.equal(plain.parsed, true, JSON.stringify(plain.diagnostics));
    assert.ok(typed.program != null);
    assert.ok(plain.program != null);
    const declaration = typed.program.body[0];
    const baseline = plain.program.body[0];
    const fn =
      declaration?.kind === "function"
        ? declaration
        : declaration?.kind === "const"
          ? declaration.initializer
          : undefined;
    const expected =
      baseline?.kind === "function"
        ? baseline
        : baseline?.kind === "const"
          ? baseline.initializer
          : undefined;
    assert.equal(fn?.kind, "function");
    assert.equal(expected?.kind, "function");
    if (fn?.kind !== "function" || expected?.kind !== "function") return;
    const actualFunction = "functionValue" in fn ? fn.functionValue : fn;
    const expectedFunction =
      "functionValue" in expected ? expected.functionValue : expected;
    assert.ok(actualFunction.sourceText != null);
    assert.equal(actualFunction.sourceText, expectedFunction.sourceText);
  });
}

test("anonymous abstract default class text matches Node stripping", () => {
  for (const source of [
    "export default abstract class { value: number = 1; }",
    "export default abstract class {}",
    "export default abstract class<T> extends B<T> {}",
  ]) {
    const typed = babelModuleFrontend.parseModule({
      source,
      sourceId: "abstract.ts",
    });
    const plain = babelModuleFrontend.parseModule({
      source: stripTypeScriptTypes(source),
      sourceId: "abstract.js",
    });
    assert.equal(typed.parsed, true, JSON.stringify(typed.diagnostics));
    assert.equal(plain.parsed, true, JSON.stringify(plain.diagnostics));
    const actual = typed.module?.exports.find(
      (item) => item.kind === "default",
    );
    const expected = plain.module?.exports.find(
      (item) => item.kind === "default",
    );
    assert.ok(
      actual?.kind === "default" && actual.declaration.kind === "class",
    );
    assert.ok(
      expected?.kind === "default" && expected.declaration.kind === "class",
    );
    assert.equal(
      actual.declaration.constructorFunction.sourceText,
      expected.declaration.constructorFunction.sourceText,
    );
    const script = babelFrontend.parse({ source, sourceId: "abstract.ts" });
    assert.equal(script.parsed, false);
    assert.equal(script.diagnostics[0]?.code, "OSEO0001");
  }
});
