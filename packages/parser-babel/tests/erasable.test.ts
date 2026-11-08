import assert from "node:assert/strict";
import test from "node:test";
import { compileSource, printHir } from "@oseo/compiler";
import { babelFrontend, babelModuleFrontend } from "../src/index.ts";

const forms = [
  "type T<X> = X extends number ? { [K in keyof X]: X[K] } : never;",
  "interface T<X> extends Array<X> { readonly value?: X; }",
  "declare const missing: number; declare class Absent { x: number; }",
  "declare function absent<T>(x: T): T; declare enum E { A }",
  "declare namespace N { const x: number; }",
  'declare module "missing" { export const x: number; }',
  "namespace Types { export interface T {} export type U = T; }",
  "namespace Empty {}",
  "function f(x: string): string; function f(x: any) { return x; }",
  "function f<T>(this: unknown, x?: T): T | undefined { return x; }",
  "const f = <T,>(x: T): T => x; f<number>(1); const g = f<string>;",
  "const xs: ReadonlyArray<number | string> = [1];",
  "const x = (1 as unknown satisfies unknown)!;",
  "const x = { f<T>(x: T): T { return x; } }; x.f<number>(1);",
  "abstract class B<T> { abstract m(x: T): T; declare x: T; }",
  "class C<T> { public readonly x!: T; protected m(x?: T): T { return x!; } }",
  "class B<T> {} class C<T> extends B<T> implements Object {} new C<number>();",
  "class C { [key: string]: unknown; get x(): number { return 1; } }",
  "try {} catch (error: unknown) {}",
  "function f(x: unknown): asserts x is number {}",
  'import type T from "missing"; export type { T };',
  'import type T = require("missing");',
  'export type * from "missing"; export default interface T {}',
] as const;

test("keeps optional pattern hints and runtime errors", () => {
  const typedSource = `
type Alias = unknown;
function object({ known, other }?: { known: number; other: Alias }) {
  return [known, other];
}
function array([head, tail]?: [string, Alias]) { return [head, tail]; }
`;
  for (const result of [
    babelFrontend.parse({ source: typedSource, sourceId: "patterns.ts" }),
    babelModuleFrontend.parseModule({
      source: typedSource,
      sourceId: "patterns.ts",
    }),
  ]) {
    assert.equal(result.parsed, true, JSON.stringify(result.diagnostics));
  }
  const compiled = compileSource(babelFrontend, {
    source: typedSource,
    sourceId: "patterns.ts",
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.hir != null);
  const hir = printHir(compiled.hir);
  assert.match(hir, /known hints=\[typescript:number\]/u);
  assert.match(hir, /head hints=\[typescript:string\]/u);
  assert.doesNotMatch(hir, /(?:other|tail) hints=/u);
  for (const source of [
    "function f(...values?: number[]) {}",
    "function f(...[x]?: number[]) {}",
    "try {} catch ({ x }?: unknown) {}",
    "const [x]?: number[] = [];",
    "function f({ x }?: T, { x }?: T) {}",
    "function f({ x }?: T) { 'use strict'; }",
    "function f({ x }?: T = {}) {}",
    "function f([x]? = []) {}",
    "function f(x?: number = 1) {}",
  ]) {
    for (const result of [
      babelFrontend.parse({ source, sourceId: "invalid.ts" }),
      babelModuleFrontend.parseModule({ source, sourceId: "invalid.ts" }),
    ]) {
      assert.equal(result.parsed, false, source);
      assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
    }
  }
});

test("uses TypeScript grammar for ambiguous generic expressions", () => {
  for (const [source, kind] of [
    ["const x = a < b > (c);", "call"],
    ["const x = a < b >\n c;", "identifier"],
  ] as const) {
    const result = babelFrontend.parse({ source, sourceId: "ambiguous.js" });
    assert.equal(result.parsed, true, JSON.stringify(result.diagnostics));
    const declaration = result.program?.body[0];
    assert.ok(declaration?.kind === "const");
    assert.equal(declaration.initializer.kind, kind);
  }
});

test("rejects erased with bodies and retains JavaScript with", () => {
  for (const body of [
    "declare var y: number;",
    "declare function f(): void;",
    "declare class C {}",
    "declare namespace N {}",
    "namespace N { type T = number; }",
    "label: declare var y: number;",
    "外: inner: declare class C {}",
    "label: namespace N { type T = number; }",
  ]) {
    const source = `var n = 0; with ({ n: 5 }) ${body} n++;`;
    const result = babelFrontend.parse({ source, sourceId: "with.ts" });
    assert.equal(result.parsed, false, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
    const keyword = body.includes("declare") ? "declare" : "namespace";
    const prefix = source.slice(0, source.indexOf(keyword));
    assert.equal(
      result.diagnostics[0]?.byteRange.start,
      new TextEncoder().encode(prefix).length,
      source,
    );
    assert.equal(
      result.diagnostics[0]?.range.start.column,
      Array.from(prefix).length + 1,
      source,
    );
  }
  for (const source of [
    "var n = 0; with ({ n: 5 }) n++;",
    "var n: number = 0; with ({ n: 5 }) n++;",
    "var n: number = 0; with ({ n: 5 }) label: n++;",
  ]) {
    assert.equal(
      babelFrontend.parse({ source, sourceId: "with.js" }).parsed,
      true,
      source,
    );
  }
});

for (const source of forms) {
  test(`erases ${source}`, () => {
    for (const result of [
      babelFrontend.parse({ source, sourceId: "erasable.ts" }),
      babelModuleFrontend.parseModule({ source, sourceId: "erasable.ts" }),
    ]) {
      assert.equal(result.parsed, true, JSON.stringify(result.diagnostics));
      assert.deepEqual(result.diagnostics, []);
    }
  });
}

test("keeps inline requests and erases whole type-only requests", () => {
  const result = babelModuleFrontend.parseModule({
    source: `
import type { Absent } from "absent";
import { type Model, value } from "mixed";
import { type Empty } from "empty";
export { type Out } from "out";
export { type Model, value };
export type * from "absent-export";
`,
    sourceId: "module.ts",
  });
  assert.equal(result.parsed, true);
  assert.ok(result.module != null);
  assert.deepEqual(
    result.module.imports.map((item) => [
      item.specifier.value,
      item.importedName,
      item.localName,
    ]),
    [
      ["mixed", "value", "value"],
      ["empty", undefined, undefined],
      ["out", undefined, undefined],
    ],
  );
  assert.equal(result.module.exports.length, 1);
  const exported = result.module.exports[0];
  assert.ok(exported != null && exported.kind !== "star");
  assert.equal(exported.exportedName, "value");
  for (const source of [
    'import { type T } from "side-effect";',
    'export { type T } from "side-effect";',
  ]) {
    assert.equal(
      babelFrontend.parse({ source, sourceId: "script.ts" }).diagnostics[0]
        ?.code,
      "OSEO0001",
    );
  }
});

test("retains primitive and destructuring hints", () => {
  const result = compileSource(babelFrontend, {
    source: `
type NumberAlias = number;
const scalar: number = 1;
const unresolved: NumberAlias = 2;
const composite: number[] = [3];
const { known, other }: { known: string; other: NumberAlias } =
  { known: "yes", other: 4 };
const [head, tail]: [bigint, NumberAlias] = [5n, 6];
function f(this: unknown, x: number, y?: number): unknown { return x + y; }
`,
    sourceId: "hints.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /scalar hints=\[typescript:number\]/u);
  assert.match(hir, /known hints=\[typescript:string\]/u);
  assert.match(hir, /head hints=\[typescript:bigint\]/u);
  assert.doesNotMatch(hir, /(?:unresolved|composite|other|tail) hints=/u);
  assert.equal(
    result.syntax?.body.find((item) => item.kind === "function")?.kind,
    "function",
  );
});

for (const source of [
  "enum E { A }",
  "const enum E { A }",
  "namespace N { export const x = 1; }",
  "namespace N { ; }",
  "module N { type T = number; }",
  "class C { constructor(public x: number) {} }",
  "const x = <number>1;",
  'import x = require("x");',
  "export = 1;",
  "export as namespace N;",
  "@decorator class C {}",
]) {
  test(`rejects runtime TS syntax: ${source}`, () => {
    for (const result of [
      babelFrontend.parse({ source, sourceId: "runtime.ts" }),
      babelModuleFrontend.parseModule({ source, sourceId: "runtime.ts" }),
    ]) {
      assert.equal(result.parsed, false);
      // Decorators are not enabled in the parser and keep its parse error.
      assert.equal(
        result.diagnostics[0]?.code,
        source.startsWith("@") || source.startsWith("module ")
          ? "OSEO0001"
          : "OSEO1001",
      );
      assert.equal(result.diagnostics[0]?.sourceId, "runtime.ts");
    }
  });
}

test("reparses directives and keeps stripped function text", () => {
  const source =
    "function f<T>(this: unknown, x?: number): unknown " +
    "{ /* body */ return x; }";
  const result = babelFrontend.parse({ source, sourceId: "source.ts" });
  assert.equal(result.parsed, true);
  if (!result.parsed) return;
  assert.ok(result.program != null);
  const fn = result.program.body[0];
  assert.equal(fn?.kind, "function");
  if (fn?.kind !== "function") return;
  assert.equal(
    fn.sourceText,
    "function f   (               x         )          " +
      "{ /* body */ return x; }",
  );
  assert.equal(fn.parameters.length, 1);
  assert.equal(fn.parameters[0]?.hints[0]?.name, "number");
  assert.equal(fn.returnHints[0]?.name, "unknown");
  for (const strictSource of [
    '"use strict" as string; with ({}) {}',
    'type T = unknown; "use strict"; with ({}) {}',
    'function f() { "use strict" satisfies string; with ({}) {} }',
  ]) {
    const strictResult = babelFrontend.parse({
      source: strictSource,
      sourceId: "strict.ts",
    });
    assert.equal(strictResult.parsed, false, strictSource);
    assert.equal(strictResult.diagnostics[0]?.code, "OSEO0001", strictSource);
    assert.equal(
      strictResult.diagnostics[0]?.byteRange.start,
      strictSource.indexOf("with"),
      strictSource,
    );
  }
});

test("rejects annotated for-in/of heads like Node", () => {
  for (const source of [
    "for (const [x]: [number] of [[1]]) {}",
    "for (const x: number in {}) {}",
  ]) {
    const result = babelFrontend.parse({ source, sourceId: "loop.ts" });
    assert.equal(result.parsed, false, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
  }
});

test("erases fields, optional markers and ambient bindings", () => {
  for (const source of [
    "abstract class C { abstract x: number; abstract [key()]: never; }",
    "class C { m?(): number { return true ? 1 : 0; } }",
    "declare const x:number; const x=1;",
    "declare var x:number; let x=1;",
    "namespace N { namespace M { type X = number; } }",
    'namespace N { declare module "m" { interface X {} } }',
    "namespace N { declare global { interface X {} } }",
    "namespace N { declare global { type X = number; } }",
  ]) {
    for (const result of [
      babelFrontend.parse({ source, sourceId: "erasable.ts" }),
      babelModuleFrontend.parseModule({ source, sourceId: "erasable.ts" }),
    ]) {
      assert.equal(result.parsed, true, JSON.stringify(result.diagnostics));
    }
  }
});

test("retains default imports and handles trailing type-only commas", () => {
  for (const source of [
    'import Value, { type Model } from "m";',
    'import Value, { type Model, } from "m";',
    'import { type Model, } from "m";',
    'import { value, type Model, } from "m";',
    'import { type A, type B, } from "m";',
    'export { type Model, } from "m";',
    'export { value, type Model, } from "m";',
  ]) {
    const result = babelModuleFrontend.parseModule({
      source,
      sourceId: "imports.ts",
    });
    assert.equal(result.parsed, true, JSON.stringify(result.diagnostics));
    assert.ok(result.module != null);
    assert.ok(result.module.imports.length + result.module.exports.length > 0);
  }
});

test("rejects namespace value members like Node", () => {
  for (const source of [
    'namespace N { import type { X } from "m"; }',
    "namespace N { declare const x: number; }",
    "namespace N { declare global { const x: number; } }",
    "namespace N { declare global { function f(): void; } }",
    "namespace N { function f(): void; }",
    "namespace N { declare namespace M { const x: number; } }",
    "namespace N { export type { X }; }",
  ]) {
    for (const result of [
      babelFrontend.parse({ source, sourceId: "namespace.ts" }),
      babelModuleFrontend.parseModule({ source, sourceId: "namespace.ts" }),
    ]) {
      assert.equal(result.parsed, false, source);
      const code =
        source.includes("import type") || source.includes("export type")
          ? "OSEO0001"
          : "OSEO1001";
      assert.equal(result.diagnostics[0]?.code, code, source);
    }
  }
});

test("preserves explicit Script and Module goals", () => {
  const source =
    'import type { X } from "never-read"; ' +
    "declare const absent: number; function goal() { return this; }";
  const script = babelFrontend.parse({ source, sourceId: "goals.ts" });
  const module = babelModuleFrontend.parseModule({
    source,
    sourceId: "goals.ts",
  });
  assert.ok(script.program != null);
  assert.ok(module.module != null);
  const scriptFunction = script.program.body.find(
    (item) => item.kind === "function",
  );
  const moduleFunction = module.module.body.find(
    (item) => item.kind === "function",
  );
  assert.ok(scriptFunction?.kind === "function");
  assert.ok(moduleFunction?.kind === "function");
  assert.equal(scriptFunction.strict, false);
  assert.equal(moduleFunction.strict, true);
  assert.deepEqual(module.module.imports, []);
});

test("rejects nested type-only module items", () => {
  for (const source of [
    'function f(){ import type { X } from "m"; }',
    '{ import type { X } from "m"; }',
    "function f(){ export type X = number; }",
    "function f(){ export interface X {} }",
  ]) {
    for (const result of [
      babelFrontend.parse({ source, sourceId: "nested.ts" }),
      babelModuleFrontend.parseModule({ source, sourceId: "nested.ts" }),
    ]) {
      assert.equal(result.parsed, false, source);
      assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
      const offset = /import|export/u.exec(source)?.index;
      assert.equal(result.diagnostics[0]?.byteRange.start, offset, source);
    }
  }
});

test("keeps original Unicode diagnostic coordinates", () => {
  for (const source of [
    'type 名 = "😀"; "use strict" as 名; with ({}) {}',
    "const arrow=(x):\n 名=>x;\n" +
      'function f(){ "use strict" as 名; with ({}) {} }',
  ]) {
    const result = babelFrontend.parse({ source, sourceId: "unicode.ts" });
    const offset = source.indexOf("with");
    const prefix = source.slice(0, offset);
    assert.equal(result.parsed, false);
    assert.equal(result.diagnostics[0]?.code, "OSEO0001");
    assert.equal(
      result.diagnostics[0]?.byteRange.start,
      new TextEncoder().encode(prefix).length,
    );
    assert.equal(
      result.diagnostics[0]?.range.start.column,
      Array.from(prefix.slice(prefix.lastIndexOf("\n") + 1)).length + 1,
    );
  }
});

test("keeps heritage when a generic constraint names implements", () => {
  const source =
    "class Base {} class C<T extends { implements: unknown }> " +
    "extends Base implements Object {}";
  const parsed = babelFrontend.parse({ source, sourceId: "heritage.ts" });
  assert.ok(parsed.program != null);
  const declaration = parsed.program.body.find(
    (item) => item.kind === "let" && item.name === "C",
  );
  assert.ok(declaration?.kind === "let");
  assert.ok(declaration.initializer.kind === "class");
  assert.ok(declaration.initializer.heritage != null);
});

test("rejects repeated declare in ambient namespace contexts like Node", () => {
  for (const source of [
    "namespace N { declare global { declare interface X {} } }",
    "namespace N { declare global { export declare type X = number; } }",
    'namespace N { declare module "m" { export declare type X = number; } }',
    "declare namespace N { declare interface X {} }",
    "declare namespace N { namespace M { declare interface X {} } }",
    "declare global { declare interface X {} }",
    "declare namespace N { declare function f(): void; }",
    "declare namespace N { declare namespace M {} }",
  ]) {
    for (const result of [
      babelFrontend.parse({ source, sourceId: "ambient.ts" }),
      babelModuleFrontend.parseModule({ source, sourceId: "ambient.ts" }),
    ]) {
      assert.equal(result.parsed, false, source);
      assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
    }
  }
  for (const source of [
    "namespace N { declare interface X {} }",
    "namespace N { declare namespace M { interface X {} } }",
    "declare class C { declare x: number; }",
    "declare namespace N { class C { declare x: number; } }",
  ]) {
    for (const result of [
      babelFrontend.parse({ source, sourceId: "ambient.ts" }),
      babelModuleFrontend.parseModule({ source, sourceId: "ambient.ts" }),
    ]) {
      assert.equal(result.parsed, true, JSON.stringify(result.diagnostics));
    }
  }
});

test("preserves ASI after assertions and contextual class field names", () => {
  for (const source of [
    "var x = y as any\n(z)",
    "var x = y satisfies any\n[0]",
    "var x = y as any\n`t`",
    "class A { static: number\n m() {} }",
    "class A { get?: number\n m() {} }",
    "class A { set!: number\n m(v) {} }",
    "const k = 'm'; class A { x = 1 as any\n[k]() {} }",
  ]) {
    for (const result of [
      babelFrontend.parse({ source, sourceId: "asi.ts" }),
      babelModuleFrontend.parseModule({ source, sourceId: "asi.ts" }),
    ]) {
      assert.equal(result.parsed, true, JSON.stringify(result.diagnostics));
    }
  }
});

test("keeps ASI boundaries around erased whole statements", () => {
  for (const declaration of [
    "interface I {}",
    "type T = number;",
    "declare const x: number;",
    "declare function f(): void;",
    "namespace N { type T = number; }",
    'import type X from "x";',
    "export type { X };",
    "export interface I {}",
  ]) {
    for (const tail of ["(1)", "[0]", "`text`", "+1", "-1", "/x/"]) {
      const source = `const a = b\n${declaration}\n${tail}`;
      for (const result of [
        babelFrontend.parse({ source, sourceId: "statement-asi.ts" }),
        babelModuleFrontend.parseModule({
          source,
          sourceId: "statement-asi.ts",
        }),
      ]) {
        assert.equal(result.parsed, true, JSON.stringify(result.diagnostics));
      }
    }
  }
});

test("erases unresolved type exports and retains runtime export errors", () => {
  for (const source of [
    "export type { Missing };",
    "export type { Missing }; export type { Missing };",
  ]) {
    for (const result of [
      babelFrontend.parse({ source, sourceId: "type-export.ts" }),
      babelModuleFrontend.parseModule({ source, sourceId: "type-export.ts" }),
    ]) {
      assert.equal(result.parsed, true, JSON.stringify(result.diagnostics));
    }
  }
  const inline = babelModuleFrontend.parseModule({
    source: "export { type Missing };",
    sourceId: "type-export.ts",
  });
  assert.equal(inline.parsed, true, JSON.stringify(inline.diagnostics));
  assert.deepEqual(inline.module?.exports, []);
  for (const source of [
    "type T = number; export { Missing };",
    "export { type T, Missing };",
    "export type { T }; export { Missing };",
    'import type { T } from "absent"; export { T };',
  ]) {
    const result = babelModuleFrontend.parseModule({
      source,
      sourceId: "runtime-export.ts",
    });
    assert.equal(result.parsed, false, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
  }
});
