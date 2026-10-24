import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { Script } from "node:vm";

import fc from "fast-check";

import { compileSource } from "../../packages/compiler/src/index.ts";
import {
  babelFrontend,
  babelModuleFrontend,
} from "../../packages/parser-babel/src/index.ts";

const { assertProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/** The model selects grammar productions, never arbitrary source strings. */
interface DeclarationCase {
  readonly form: number;
  readonly name: number;
  readonly typed: boolean;
  readonly newline: string;
  readonly prefixLines: number;
  readonly wrappers: readonly number[];
  readonly masker: boolean;
}

/** Printed source and its independently recorded declaration position. */
interface PrintedDeclaration {
  readonly source: string;
  readonly start: number;
}

const maximumDepth = propertySize() === "large" ? 8 : 4;
const wrappers: readonly (readonly [string, string])[] = [
  ["{", "}"],
  ["function f() {", "}"],
  ["const f = () => {", "};"],
  ["class C { static {", "} }"],
  ["const obj = { method() {", "} };"],
  ["if (false) {", "}"],
  ["try {", "} finally {}"],
  ["switch (0) { default:", "}"],
];

/** Scope and production choices survive shrinking without filtered cases. */
function declarationCases(nested: boolean): fc.Arbitrary<DeclarationCase> {
  return fc.record({
    form: fc.integer({ min: 0, max: 11 }),
    name: fc.integer({ min: 0, max: 9 }),
    typed: fc.boolean(),
    newline: fc.constantFrom("\n", "\r\n", "\u2028", "\u2029"),
    prefixLines: fc.integer({ min: 0, max: 3 }),
    wrappers: fc.array(fc.integer({ min: 0, max: wrappers.length - 1 }), {
      minLength: nested ? 1 : 0,
      maxLength: nested ? maximumDepth : 0,
    }),
    masker: nested ? fc.boolean() : fc.constant(false),
  });
}

/** Print JS and TS twins from the same production rather than erasing text. */
function printDeclaration(testCase: DeclarationCase, typed: boolean): string {
  const name = `value${testCase.name}`;
  const hint = typed && testCase.typed ? ": number" : "";
  switch (testCase.form) {
    case 0:
      return 'import "m";';
    case 1:
      return `import ${name} from "m";`;
    case 2:
      return `import * as ${name} from "m";`;
    case 3:
      return `import { "☿" as ${name} } from "m";`;
    case 4:
      return `export var ${name}${hint} = 1;`;
    case 5:
      return `export const { ${name} } = { ${name}: 1 };`;
    case 6:
      return `export function ${name}(x${hint}) { return x; }`;
    case 7:
      return "export default class {};";
    case 8:
      return 'export * from "m";';
    case 9:
      return `export * as "${name}" from "m";`;
    case 10:
      return `export { "☿" as "${name}" } from "m";`;
    default:
      return "export default async function*() {};";
  }
}

/** Record the declaration offset while printing nested statement contexts. */
function printCase(
  testCase: DeclarationCase,
  typed: boolean,
): PrintedDeclaration {
  const newline = testCase.newline;
  let prefix = `// λ😀${newline}`.repeat(testCase.prefixLines);
  if (testCase.masker) prefix += `import("dynamic");${newline}`;
  let suffix = "";
  for (const index of testCase.wrappers) {
    const context = wrappers[index];
    assert.ok(context != null);
    prefix += `${context[0]}${newline}`;
    suffix = `${newline}${context[1]}${suffix}`;
  }
  prefix += "  ";
  return {
    source: `${prefix}${printDeclaration(testCase, typed)}${suffix}`,
    start: prefix.length,
  };
}

/** Independent V8 Script parser checks syntax without evaluating any source. */
function scriptRejects(source: string): void {
  assert.throws(() => new Script(source), SyntaxError, source);
}

/** Node's Module syntax checker performs neither linking nor evaluation. */
function moduleSyntax(source: string, valid: boolean): void {
  const result = spawnSync("node", ["--check", "--input-type=module"], {
    input: source,
    encoding: "utf8",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  if (valid) assert.equal(result.status, 0, result.stderr);
  else {
    assert.notEqual(result.status, 0, source);
    assert.match(result.stderr, /SyntaxError/u, source);
  }
}

test("generated ModuleItems are admitted only by the Module goal", () => {
  assertProperty(
    "Script and Module declaration grammar",
    fc.property(declarationCases(false), (testCase) => {
      const javascript = printCase(testCase, false).source;
      scriptRejects(javascript);
      moduleSyntax(javascript, true);
      const { source, start } = printCase(testCase, true);
      const input = { source, sourceId: "generated-module-items.ts" };
      const script = babelFrontend.parse(input);
      const module = babelModuleFrontend.parseModule(input);
      assert.equal(script.parsed, false, source);
      assert.equal(script.diagnostics[0]?.code, "OSEO0001", source);
      assert.equal(
        script.diagnostics[0]?.byteRange.start,
        new TextEncoder().encode(source.slice(0, start)).length,
      );
      assert.equal(module.parsed, true, source);
      assert.deepEqual(module.diagnostics, [], source);
    }),
    {
      domain: "script-rejects-top-level-module-items",
      numRuns: 64,
      profile: "M5 Script and Module declaration grammar",
      seed: 0x6000_8b00,
      sizeLimit: "12 productions, 10 names, 3 prefix lines, optional hints",
      timeLimitMilliseconds: 30_000,
      context: [
        "Oracle: V8 Script and Node --check Module, without evaluation.",
        "Preconditions: one ModuleItem, no unbound local export names.",
        "TS hints have independently printed JavaScript grammar twins.",
        "Shrinking retains one declaration, its goal and bound names.",
      ],
    },
  );
});

test("generated nested declarations precede unsupported conversion", () => {
  assertProperty(
    "nested module declaration early errors",
    fc.property(declarationCases(true), (testCase) => {
      const javascript = printCase(testCase, false).source;
      scriptRejects(javascript);
      moduleSyntax(javascript, false);
      const { source, start } = printCase(testCase, true);
      const input = { source, sourceId: "generated-nested-items.ts" };
      const script = babelFrontend.parse(input);
      const module = babelModuleFrontend.parseModule(input);
      const diagnostic = script.diagnostics[0];
      assert.ok(diagnostic != null);
      assert.equal(script.parsed, false, source);
      assert.equal(diagnostic.code, "OSEO0001", source);
      const byteStart = new TextEncoder().encode(source.slice(0, start)).length;
      assert.deepEqual(diagnostic.byteRange, {
        end: byteStart,
        start: byteStart,
      });
      const line = source
        .slice(0, start)
        .split(/\r\n|[\n\r\u2028\u2029]/u).length;
      const position = { column: 3, line };
      assert.deepEqual(diagnostic.range, { end: position, start: position });
      assert.equal(diagnostic.sourceId, input.sourceId);
      assert.equal(module.parsed, false, source);
      assert.equal(module.diagnostics[0]?.code, "OSEO0001", source);
      for (const specialization of ["enabled", "disabled"] as const) {
        const compiled = compileSource(babelFrontend, input, {
          specialization,
        });
        assert.deepEqual(compiled.diagnostics, script.diagnostics, source);
        assert.equal(compiled.mir, undefined);
      }
    }),
    {
      domain: "nested-declaration-grammar-with-unsupported-prefix",
      numRuns: 64,
      profile: "M5 Script and Module declaration grammar",
      seed: 0x6000_8b01,
      sizeLimit: `${maximumDepth} nested contexts, optional dynamic import`,
      timeLimitMilliseconds: 30_000,
      context: [
        "Oracle: independent V8 Script/Module syntax checks; no evaluation.",
        "Preconditions: a declaration outside a ModuleItemList.",
        "Shrinking keeps a nested context and prints fresh source locations.",
        "Failure: source, goal, diagnostic, compiler policy and replay.",
      ],
    },
  );
});
