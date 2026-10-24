import assert from "node:assert/strict";
import test from "node:test";

import { compileSource, renderDiagnostic } from "@oseo/compiler";

import { babelFrontend, babelModuleFrontend } from "../src/index.ts";

/** Every static declaration production, with bound local export names. */
const declarations: readonly string[] = [
  'import "m";',
  'import value from "m";',
  'import * as value from "m";',
  'import { value } from "m";',
  'import {} from "m";',
  'import type from "m";',
  'import { type as value } from "m";',
  'import { "☿" as value } from "m";',
  'import value, { other } from "m";',
  'import value, * as other from "m";',
  'import value from "m" with { type: "json" };',
  "export {};",
  "export { value };",
  'export { value as "☿" };',
  'export {} from "m";',
  'export { value as other } from "m";',
  'export { "☿" as "*" } from "m";',
  'export * from "m";',
  'export * as value from "m";',
  'export * as "☿" from "m";',
  'export * from "m" with { type: "json" };',
  "export var other;",
  "export var { other } = { other: 1 };",
  "export let other = 1;",
  "export const [other] = [1];",
  "export function other() {}",
  "export function* other() {}",
  "export async function other() {}",
  "export async function* other() {}",
  "export class Other {}",
  "export default null;",
  "export default function() {}",
  "export default function other() {}",
  "export default function*() {}",
  "export default async function() {}",
  "export default async function*() {}",
  "export default class {}",
  "export default class Other {}",
  "export const other: number = 1;",
  "export function other(x: number): number { return x; }",
];

/** Nested statement lists and statement positions are not ModuleItems. */
const contexts: readonly (readonly [string, string])[] = [
  ["", ""],
  ["{", "}"],
  ["function outer() {", "}"],
  ["const outer = function() {", "};"],
  ["const outer = () => {", "};"],
  ["function* outer() {", "}"],
  ["async function outer() {", "}"],
  ["async function* outer() {", "}"],
  ["class Outer { method() {", "} }"],
  ["class Outer { static method() {", "} }"],
  ["class Outer { static {", "} }"],
  ["const outer = { method() {", "} };"],
  ["const outer = { get value() {", "} };"],
  ["const outer = { set value(x) {", "} };"],
  ["if (true) {", "}"],
  ["if (true) {} else {", "}"],
  ["if (true) ", ""],
  ["while (false) {", "}"],
  ["do {", "} while (false);"],
  ["for (;;) {", "}"],
  ["for (const key in {}) {", "}"],
  ["for (const key of []) {", "}"],
  ["switch (0) { case 0:", "}"],
  ["switch (0) { default:", "}"],
  ["try {", "} catch {}"],
  ["try {} catch {", "}"],
  ["try {} finally {", "}"],
  ["label: {", "}"],
  ["label: ", ""],
];

test("wide statement lists preserve valid Script grammar", () => {
  const statements = ";".repeat(150_000);
  for (const source of [statements, `{${statements}}`]) {
    const result = babelFrontend.parse({ source, sourceId: "wide-script.js" });
    assert.equal(result.parsed, true);
    assert.deepEqual(result.diagnostics, []);
  }
  const source = `${statements}export default null;`;
  const result = babelFrontend.parse({ source, sourceId: "wide-export.js" });
  assert.equal(result.parsed, false);
  assert.equal(result.diagnostics[0]?.code, "OSEO0001");
  assert.deepEqual(result.diagnostics[0]?.byteRange, {
    end: statements.length,
    start: statements.length,
  });
});

test("Script rejects every static declaration at its source location", () => {
  for (const declaration of declarations) {
    for (const [open, close] of contexts) {
      for (const directive of ["", '"use strict";\r\n']) {
        const prefix = `${directive}// λ😀\r\n${open}\r\n  `;
        const source = `${prefix}${declaration}\r\n${close}`;
        const sourceId = "script-goal.ts";
        const result = babelFrontend.parse({ source, sourceId });
        assert.equal(result.parsed, false, source);
        assert.ok(result.diagnostics.length > 0, source);
        assert.ok(
          result.diagnostics.every((entry) => entry.code === "OSEO0001"),
          source,
        );
        const diagnostic = result.diagnostics[0];
        assert.ok(diagnostic != null);
        const start = new TextEncoder().encode(prefix).length;
        assert.deepEqual(diagnostic.byteRange, { end: start, start }, source);
        const line = directive === "" ? 3 : 4;
        const position = { column: 3, line };
        assert.deepEqual(diagnostic.range, {
          end: position,
          start: position,
        });
        assert.equal(diagnostic.sourceId, sourceId);
        assert.match(
          renderDiagnostic(diagnostic),
          new RegExp(`script-goal.ts:${line}:3: error\\[OSEO0001\\]`, "u"),
        );
      }
    }
  }
});

test("Module admits top-level forms and rejects nested declarations", () => {
  for (const declaration of declarations) {
    // Local export lists use the binding, while import forms declare it.
    const local = declaration.startsWith("export {") ? "const value = 1;" : "";
    const valid = babelModuleFrontend.parseModule({
      source: `${local}\n${declaration}`,
      sourceId: "module-goal.ts",
    });
    assert.equal(valid.parsed, true, declaration);
    assert.deepEqual(valid.diagnostics, [], declaration);
    for (const [open, close] of contexts.slice(1)) {
      const source = `${local}\n${open}\n${declaration}\n${close}`;
      const result = babelModuleFrontend.parseModule({
        source,
        sourceId: "nested-module.ts",
      });
      assert.equal(result.parsed, false, source);
      assert.ok(result.diagnostics.length > 0, source);
      assert.ok(result.diagnostics.every((entry) => entry.code === "OSEO0001"));
    }
  }
});

test("grammar errors precede unsupported conversion in the compiler", () => {
  for (const declaration of ['import "m";', "export default null;"]) {
    const source = `import("dynamic");\nfunction f() {\n${declaration}\n}`;
    const input = { source, sourceId: "masked-script.js" };
    const parsed = babelFrontend.parse(input);
    assert.equal(parsed.parsed, false);
    assert.equal(parsed.diagnostics[0]?.code, "OSEO0001");
    assert.equal(parsed.diagnostics[0]?.range.start.line, 3);
    for (const specialization of ["enabled", "disabled"] as const) {
      const compiled = compileSource(babelFrontend, input, { specialization });
      assert.deepEqual(compiled.diagnostics, parsed.diagnostics);
      assert.equal(compiled.syntax, undefined);
      assert.equal(compiled.hir, undefined);
      assert.equal(compiled.mir, undefined);
    }
  }
});

test("import expressions and keyword properties keep their roles", () => {
  for (const [open, close] of contexts.filter(
    ([prefix]) => !prefix.includes("label:") && prefix !== "if (true) ",
  )) {
    const source = `${open}\nimport("m");\n${close}`;
    for (const result of [
      babelFrontend.parse({ source, sourceId: "dynamic.js" }),
      babelModuleFrontend.parseModule({ source, sourceId: "dynamic.js" }),
    ]) {
      assert.equal(result.parsed, false, source);
      assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
      assert.equal(
        result.diagnostics[0]?.message,
        "ImportExpression is outside the M1 profile.",
        source,
      );
    }
  }
  const propertySource =
    "const obj = { import: 1, export() {} };\nobj.import;" +
    '\nconst text = "import value from module";' +
    "\nconst template = `export default null`;\n// export {};";
  assert.equal(
    babelFrontend.parse({ source: propertySource, sourceId: "keys.js" }).parsed,
    true,
  );
  for (const source of [
    "import.meta;",
    "function f() { return import.meta; }",
  ]) {
    const script = babelFrontend.parse({ source, sourceId: "meta.js" });
    const module = babelModuleFrontend.parseModule({
      source,
      sourceId: "meta.js",
    });
    assert.equal(script.diagnostics[0]?.code, "OSEO0001");
    assert.equal(
      script.diagnostics[0]?.byteRange.start,
      source.indexOf("import.meta"),
    );
    assert.equal(module.parsed, true);
  }
});

test("type-only star exports retain located unsupported diagnostics", () => {
  for (const declaration of [
    'export type * from "m";',
    'export type * as ns from "m";',
  ]) {
    const prefix = "// λ\r\n";
    const source = prefix + declaration;
    const input = { source, sourceId: "type-star.ts" };
    for (const result of [
      babelFrontend.parse(input),
      babelModuleFrontend.parseModule(input),
    ]) {
      assert.equal(result.parsed, false);
      assert.equal(result.diagnostics.length, 1);
      const diagnostic = result.diagnostics[0];
      assert.ok(diagnostic != null);
      assert.equal(diagnostic.code, "OSEO1001");
      const start = new TextEncoder().encode(prefix).length;
      assert.deepEqual(diagnostic.byteRange, {
        end: start + declaration.length,
        start,
      });
      assert.deepEqual(diagnostic.range, {
        end: { column: declaration.length + 1, line: 2 },
        start: { column: 1, line: 2 },
      });
      assert.equal(diagnostic.sourceId, input.sourceId);
    }
  }
});

test("annotations and unsupported TS-only extensions keep their policy", () => {
  for (const source of [
    "const value: number = 1;",
    "function f(x: number): number { return x; }",
    "const { value }: { value: number } = { value: 1 };",
  ]) {
    const script = compileSource(babelFrontend, {
      source,
      sourceId: "hints.ts",
    });
    assert.deepEqual(script.diagnostics, [], source);
    assert.ok(script.mir != null);
    assert.equal(
      babelModuleFrontend.parseModule({ source, sourceId: "hints.ts" }).parsed,
      true,
    );
  }
  for (const source of [
    "interface T {}",
    "type T = number;",
    "declare const x: number;",
    "namespace N { export const x = 1; }",
    'declare module "m" { export const x: number; }',
    "enum E { x }",
    'import x = require("m");',
    "export = 1;",
    "export as namespace N;",
    'import type { T } from "m";',
    'import { type T } from "m";',
    "export type T = number;",
    'export type * from "m";',
    'export type * as ns from "m";',
    'export { type T } from "m";',
    "export interface T {}",
    "export declare const x: number;",
    "export default interface T {}",
  ]) {
    for (const result of [
      babelFrontend.parse({ source, sourceId: "unsupported.ts" }),
      babelModuleFrontend.parseModule({ source, sourceId: "unsupported.ts" }),
    ]) {
      assert.equal(result.parsed, false, source);
      assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
      assert.equal(result.diagnostics[0]?.sourceId, "unsupported.ts");
      assert.ok((result.diagnostics[0]?.byteRange.start ?? -1) >= 0, source);
    }
  }
  // An unsupported assertion must not hide real executable grammar below it.
  const source = "(() => { export default null; }) as unknown;";
  assert.equal(
    babelFrontend.parse({ source, sourceId: "assertion.ts" }).diagnostics[0]
      ?.code,
    "OSEO0001",
  );
});

test("type-only function signatures retain unsupported diagnostics", () => {
  for (const declaration of [
    "function f();",
    "function f(): void;",
    "function f(x: number): number;",
    "function f(x?: number): number;",
    "function f(...xs: number[]): number;",
    "function f<T>(x: T): T;",
  ]) {
    for (const exported of ["", "export ", "export default "]) {
      const prefix = "// λ😀\r\n  ";
      const source = prefix + exported + declaration;
      const input = { source, sourceId: "signature.ts" };
      for (const result of [
        babelFrontend.parse(input),
        babelModuleFrontend.parseModule(input),
      ]) {
        assert.equal(result.parsed, false, source);
        assert.equal(result.diagnostics.length, 1, source);
        const diagnostic = result.diagnostics[0];
        assert.ok(diagnostic != null);
        assert.equal(diagnostic.code, "OSEO1001", source);
        assert.equal(diagnostic.sourceId, input.sourceId);
        assert.equal(diagnostic.range.start.line, 2);
        assert.equal(diagnostic.range.end.line, 2);
        const start = new TextEncoder().encode(prefix).length;
        assert.ok(diagnostic.byteRange.start >= start, source);
        assert.equal(
          diagnostic.byteRange.start - start,
          diagnostic.range.start.column - 3,
          source,
        );
        assert.equal(
          diagnostic.byteRange.end,
          new TextEncoder().encode(source).length,
          source,
        );
      }
    }
  }
  for (const declaration of [
    "function();",
    "function(): void;",
    "function(x?: number): number;",
  ]) {
    const prefix = "// λ😀\r\n  ";
    const source = `${prefix}export default ${declaration}`;
    const input = { source, sourceId: "anonymous-signature.ts" };
    const start = new TextEncoder().encode(prefix).length;
    const end = new TextEncoder().encode(source).length;
    for (const [result, offset] of [
      [babelFrontend.parse(input), 0],
      [babelModuleFrontend.parseModule(input), 15],
    ] as const) {
      assert.equal(result.parsed, false, source);
      assert.equal(result.diagnostics.length, 1, source);
      const diagnostic = result.diagnostics[0];
      assert.ok(diagnostic != null);
      assert.equal(diagnostic.code, "OSEO1001", source);
      assert.equal(diagnostic.sourceId, input.sourceId);
      assert.deepEqual(diagnostic.byteRange, { end, start: start + offset });
      assert.deepEqual(diagnostic.range, {
        end: { column: 3 + 15 + declaration.length, line: 2 },
        start: { column: 3 + offset, line: 2 },
      });
    }
  }
});

test("interfaces and ambient declarations stay unsupported", () => {
  for (const source of [
    "export interface T {}",
    "export default interface T {}",
    "export default interface T { f(x?: number): void; }",
    "declare function f(): void;",
    "export declare function f(): void;",
    "export declare function f(x?: number): number;",
    "declare namespace N { export function f(): void; }",
    'declare module "m" { export default function f(): void; }',
  ]) {
    const input = { source, sourceId: "type-declaration.ts" };
    for (const result of [
      babelFrontend.parse(input),
      babelModuleFrontend.parseModule(input),
    ]) {
      assert.equal(result.parsed, false, source);
      assert.equal(result.diagnostics.length, 1, source);
      assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
      assert.equal(result.diagnostics[0]?.sourceId, input.sourceId);
    }
  }
});

test("runtime exports retain Script grammar with TS extensions", () => {
  for (const source of [
    "export default x as any;",
    "export default (x as any);",
    "export default x satisfies any;",
    "export default x!;",
    "export default <any>x;",
    "export default f<number>;",
    "export default function f(x?: number): number { return 1; }",
    'import { type T, x } from "m";',
    'export { type T, x } from "m";',
  ]) {
    const prefix = "// λ😀\r\n  ";
    const input = { source: prefix + source, sourceId: "runtime-export.ts" };
    const script = babelFrontend.parse(input);
    assert.equal(script.parsed, false, source);
    assert.equal(script.diagnostics.length, 1, source);
    assert.equal(script.diagnostics[0]?.code, "OSEO0001", source);
    const start = new TextEncoder().encode(prefix).length;
    assert.deepEqual(script.diagnostics[0]?.byteRange, { end: start, start });
    assert.deepEqual(script.diagnostics[0]?.range.start, {
      column: 3,
      line: 2,
    });
    const module = babelModuleFrontend.parseModule(input);
    assert.equal(module.parsed, false, source);
    assert.equal(module.diagnostics[0]?.code, "OSEO1001", source);
  }
  const source = "declare function f(): void;\nexport default f;";
  const input = { source, sourceId: "declared-value-export.ts" };
  const script = babelFrontend.parse(input);
  assert.equal(script.diagnostics[0]?.code, "OSEO0001");
  assert.deepEqual(script.diagnostics[0]?.range.start, { column: 1, line: 2 });
  assert.equal(
    babelModuleFrontend.parseModule(input).diagnostics[0]?.code,
    "OSEO1001",
  );
});
