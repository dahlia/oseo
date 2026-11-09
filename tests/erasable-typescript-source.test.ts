import assert from "node:assert/strict";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
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
  "function f(){ if(false) declare var x:number; console.log(1); }",
  "function f(){ if(true) console.log(1); else declare var x:number; }",
  "function f(){ while(false) declare function g():void; console.log(1); }",
  "function f(){ do declare var x:number; while(false); console.log(1); }",
  "function f(){ for(;false;) declare var x:number; console.log(1); }",
  "function f(){ for(const x of []) declare var y:number; console.log(1); }",
  "function f(){ for(const x in {}) declare var y:number; console.log(1); }",
  "function f(){ label: declare var x:number; console.log(1); }",
  "function f(o){ return (true ? o : null)?.f; }",
  "function f(g){ return g?.(true ? 1 : 2); }",
  "function f(a){ return a?.[true ? 0 : 1]; }",
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
  "function f(this) {}",
  "function f(this,) {}",
  "function f(this /* keep λ😀 */) {}",
  "function f(this,/* keep λ😀 */x: number) { return x; }",
  "function f(this?, x = 1) { return x; }",
  "const f = function(this, x: number) { return x; };",
  "function f() { return { m(this, x: number) { return x; } }; }",
  "function f() { return class { m(this, x: number) { return x; } }; }",
  "function f(){return x /*keep*/ !;}",
  "function f(){return x! /*keep*/ !;}",
  "function f(x: /* comment */ number): string { return 'λ😀'; }",
  "function f(x: { /* member */ value: number }): void {}",
  "const f = (x: number):\n number => x;",
  "const f = <T,>(x: T): T => x;",
  "const f = async <T>(x:T)=>x;",
  "const f = async <\nT\n>(x:T)=>x;",
  "const f = async /*keep*/ <\nT\n> /*gap*/ (x:T)=>x;",
  "const f = async <T /*\ncomment*/>(x:T)=>x;",
  "const f = async <\r\nT\r\n>(x:T)=>x;",
  "const f = async <\u2028T\u2029>(x:T)=>x;",
  "const f = async <\nT extends {x: number} = {x: number}\n>({x}:T)=>x;",
  "const f = async <\nT\n>(...x:T[])=>x;",
  "const f = async <\nT\n>()=>1;",
  "const f = async <\nT\n>(x:T=1):\n T=>x;",
  "const f = async <\nT\n>([x]:[T]):\n 名=>x;",
  "const f = async <\nT\n>(x:T):\n 𐐀=>x;",
  "const f = async <\nT\n>(x:T):\n '😀'=>x;",
  "const f = async <T>(\nx:T)=>x;",
  "function f({x=true?1:2}?: {x:number}) { return x; }",
  "function f([x=true?1:2]?: number[]) { return x; }",
  "function f({x=true?1:2}?) { return x; }",
  "function f([x=true?1:2]?) { return x; }",
  "function f({[true?'x':'y']:x}?: {x:number}) { return x; }",
  "function f({x} /*?*/ ? /*keep*/ : {x:number}) { return x; }",
  "const f = async <\nT\n>([x=true?1:2]?:[T]):\n T=>x;",
  "function f(\r\nx: number,\r\ny?: unknown\r\n): void {}",
]) {
  test(`function source matches Node.js stripping: ${source}`, () => {
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
    const reference = runInNewContext(`${stripped}; f`);
    assert.equal(
      actualFunction.sourceText,
      Function.prototype.toString.call(reference),
      source,
    );
  });
}

test("instantiation continuations retain Node.js source and grammar", () => {
  for (const gap of [" ", "\n", "\r", "\r\n", "\u2028", "\u2029", "/*\n*/"]) {
    for (const tail of ["+y", "-y", "++y", "--y", "!y", "~y", "typeof y"]) {
      for (const callee of ["x", "new X"]) {
        for (const angles of [
          "<T>",
          "<T | U>",
          "<T<U>>",
          "<(T<U>)>",
          "<[T<U>]>",
          "<{ x: T<U> }>",
          "<(T as number)>",
          "<(T satisfies number)>",
          "<(T!)>",
          "<(<U>(value: U): U => value)>",
          "<(async <U>(value: U): 한글 => value)>",
        ]) {
          const expression = `${callee}${angles}${gap}${tail}`;
          const source = `function f(x: number) { return ${expression}; }`;
          const stripped = stripTypeScriptTypes(source);
          const actual = babelFrontend.parse({ source, sourceId: "typed.ts" });
          const expected = babelFrontend.parse({
            source: stripped,
            sourceId: "plain.js",
          });
          assert.equal(actual.parsed, true, JSON.stringify(actual.diagnostics));
          assert.equal(expected.parsed, true);
          const fn = actual.program?.body[0];
          const plain = expected.program?.body[0];
          assert.ok(fn?.kind === "function" && plain?.kind === "function");
          const reference = runInNewContext(`${stripped}; f`);
          assert.equal(
            fn.sourceText,
            Function.prototype.toString.call(reference),
            source,
          );
        }
      }
    }
    for (const continuation of [
      "<U>y",
      "<U>(y)",
      "<U>[y]",
      "<U>+y",
      "<U>y ** 2",
      "<y",
    ]) {
      for (const callee of ["x", "new X"]) {
        const expression = `${callee}<T>${gap}${continuation}`;
        const source = `function f() { return ${expression}; }`;
        assert.throws(() => stripTypeScriptTypes(source), SyntaxError, source);
        for (const result of [
          babelFrontend.parse({ source, sourceId: "assertion.ts" }),
          babelModuleFrontend.parseModule({ source, sourceId: "assertion.ts" }),
        ]) {
          assert.equal(result.parsed, false, source);
          assert.ok(result.diagnostics[0]?.byteRange != null, source);
          assert.equal(
            result.diagnostics[0]?.code,
            continuation === "<y" ? "OSEO0001" : "OSEO1001",
            source,
          );
        }
      }
    }
    for (const angles of [
      "<T[]>",
      "<T,>",
      "<{ x: T; }>",
      "<(T<U>]>",
      "<[T<U>)>",
    ]) {
      const source = `function f() { return x${angles}${gap}+y; }`;
      assert.throws(() => stripTypeScriptTypes(source), SyntaxError, source);
      for (const result of [
        babelFrontend.parse({ source, sourceId: "invalid.ts" }),
        babelModuleFrontend.parseModule({ source, sourceId: "invalid.ts" }),
      ]) {
        assert.equal(result.parsed, false, source);
        assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
      }
    }
  }
});

test("assertion continuation diagnostics retain their grammar context", () => {
  for (const [prefix, expression, suffix] of [
    ["async function f() { return ", "x<T><U>await y", "; }"],
    ["function* f() { return ", "x<T><U>(yield y)", "; }"],
    ["class C { #y = 1; f() { return ", "x<T><U>this.#y", "; } }"],
    ["function f() { return ", "x<T><U>\ny", "; }"],
    ["function f() { return [", "x<T><U>(y)", "]; }"],
  ]) {
    const source = `/* 한글 */${prefix}${expression}${suffix}`;
    assert.throws(() => stripTypeScriptTypes(source), SyntaxError, source);
    for (const result of [
      babelFrontend.parse({ source, sourceId: "context.ts" }),
      babelModuleFrontend.parseModule({ source, sourceId: "context.ts" }),
    ]) {
      assert.equal(result.parsed, false, source);
      const diagnostic = result.diagnostics[0];
      assert.equal(diagnostic?.code, "OSEO1001", source);
      assert.ok(diagnostic?.byteRange != null, source);
      assert.equal(
        diagnostic.byteRange.start,
        new TextEncoder().encode(source.slice(0, source.indexOf("<U>"))).length,
        source,
      );
    }
  }
  for (const expression of ["x<T><U>()", "x<T[]><U>y", "x<T><y"]) {
    const source = `function f() { return ${expression}; }`;
    assert.throws(() => stripTypeScriptTypes(source), SyntaxError, source);
    const result = babelFrontend.parse({ source, sourceId: "malformed.ts" });
    assert.equal(result.parsed, false, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
  }
});

test("anonymous abstract default class text matches Node.js stripping", () => {
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
