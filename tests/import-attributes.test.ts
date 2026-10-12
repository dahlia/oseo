import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModuleGraph,
  compileModuleGraph,
  type Diagnostic,
  linkModuleGraph,
} from "../packages/compiler/src/index.ts";
import { babelModuleFrontend } from "../packages/parser-babel/src/index.ts";

async function graphOf(
  source: string,
  json = '{"answer":262}',
  jsonDiagnostics: readonly Diagnostic[] = [],
) {
  const sources = new Map([
    ["file:///app/main.js", source],
    ["file:///app/data.json", json],
    ["file:///app/plain.js", "export default 1;"],
  ]);
  const loads: string[] = [];
  const result = await buildModuleGraph(
    babelModuleFrontend,
    {
      load(canonicalId) {
        loads.push(canonicalId);
        if (canonicalId.endsWith(".json") && jsonDiagnostics.length > 0) {
          return Promise.resolve({ diagnostics: jsonDiagnostics });
        }
        return Promise.resolve({
          diagnostics: [],
          source: {
            kind: canonicalId.endsWith(".json") ? "json" : "javascript",
            source: sources.get(canonicalId) ?? "",
            sourceHash: `content:${sources.get(canonicalId)}`,
            sourceId: canonicalId,
          },
        });
      },
    },
    {
      resolve(importerId, specifier) {
        return {
          canonicalId: new URL(specifier.value, importerId).href,
          diagnostics: [],
        };
      },
    },
    "file:///app/main.js",
  );
  return { ...result, loads };
}

test("JSON nodes share content identity and a default cell", async () => {
  const result = await graphOf(
    [
      'import first from "./data.json" with {type:"json"};',
      'import second from "././data.json" with {type:"json"};',
      'import * as namespace from "./data.json" with {type:"json"};',
      "console.log(first === second, first === namespace.default);",
    ].join("\n"),
  );
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.loads.length, 2);
  assert.ok(result.graph);
  const json = result.graph.modules.find((node) => node.moduleKind === "json");
  assert.equal(json?.sourceHash, 'content:{"answer":262}');
  assert.deepEqual(json?.dependencies, []);
  const linked = linkModuleGraph(result.graph);
  assert.deepEqual(linked.diagnostics, []);
  assert.deepEqual(
    linked.graph?.modules
      .find((node) => node.canonicalId.endsWith(".json"))
      ?.exports.map((entry) => entry.exportedName),
    ["default"],
  );
  const compiled = compileModuleGraph(result.graph);
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir);
});

test("cached loader failures are reported once across aliases", async () => {
  const diagnostic: Diagnostic = {
    code: "OSEO2001",
    sourceId: "file:///app/main.js",
    byteRange: { start: 18, end: 31 },
    range: {
      start: { line: 1, column: 19 },
      end: { line: 1, column: 32 },
    },
    message: "The dependency could not be loaded.",
  };
  const result = await graphOf(
    [
      'import first from "./data.json" with {type:"json"};',
      'import second from "././data.json" with {type:"json"};',
    ].join("\n"),
    '{"answer":262}',
    [diagnostic],
  );
  assert.equal(result.graph, undefined);
  assert.equal(result.loads.length, 2);
  assert.deepEqual(result.diagnostics, [diagnostic]);
});

test("each syntactic request is validated once across bindings", async () => {
  await Promise.all(
    [
      'import value, {answer} from "./data.json" with {unknown:"json"};',
      'export {default as a, default as b} from "./data.json" ' +
        'with {unknown:"json"};',
    ].map(async (source) => {
      const result = await graphOf(source);
      assert.equal(result.graph, undefined);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(result.diagnostics[0]?.code, "OSEO2001");
      assert.match(result.diagnostics[0]?.message ?? "", /import attribute/u);
    }),
  );
});

test("shrunk missing-type request reports one error", async () => {
  // fast-check 4.9.0, seed 1610647041, replay path 1:0:0:1.
  const result = await graphOf(
    [
      'import first from "./data.json" with {type:"json"};',
      'import second, {answer as alias0} from "././data.json";',
    ].join("\n"),
    '{"answer":0}',
  );
  assert.equal(result.graph, undefined);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, "OSEO2001");
  assert.equal(result.diagnostics[0]?.range.start.line, 2);
});

test("distinct requests retain separate attribute errors", async () => {
  const result = await graphOf(
    [
      'import first, {answer as a} from "./data.json" with {unknown:"json"};',
      'import second, {answer as b} from "./data.json" with {unknown:"json"};',
    ].join("\n"),
  );
  assert.equal(result.graph, undefined);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.range.start.line),
    [1, 2],
  );
});

test("validates every request before alias deduplication", async () => {
  await Promise.all(
    ['with {type:"javascript"}', 'with {unknown:"json"}', ""].map(
      async (clause) => {
        const result = await graphOf(
          [
            'import first from "./data.json" with {type:"json"};',
            `import second from "././data.json" ${clause};`,
          ].join("\n"),
        );
        assert.equal(result.graph, undefined);
        assert.equal(result.diagnostics[0]?.code, "OSEO2001");
        assert.equal(result.diagnostics[0]?.range.start.line, 2);
      },
    ),
  );
});

test("a JavaScript file requested as JSON is a located error", async () => {
  const direct = await graphOf(
    'import value from "./plain.js" with {type:"json"};',
  );
  assert.equal(direct.graph, undefined);
  assert.deepEqual(direct.diagnostics, [
    {
      byteRange: { start: 18, end: 30 },
      code: "OSEO2001",
      message: "The module kind does not match its import attributes.",
      range: {
        start: { line: 1, column: 19 },
        end: { line: 1, column: 31 },
      },
      sourceId: "file:///app/main.js",
    },
  ]);
  const aliased = await graphOf(
    [
      'import first from "./plain.js";',
      'import second from "././plain.js" with {type:"json"};',
    ].join("\n"),
  );
  assert.equal(aliased.graph, undefined);
  assert.equal(aliased.diagnostics.length, 1);
  assert.equal(
    aliased.diagnostics[0]?.message,
    "The module kind does not match its import attributes.",
  );
  assert.equal(aliased.diagnostics[0]?.range.start.line, 2);
});

test("malformed JSON and missing named exports are rejected", async () => {
  const malformed = await graphOf(
    'import value from "./data.json" with {type:"json"};',
    "{broken}",
  );
  assert.equal(malformed.graph, undefined);
  assert.equal(malformed.diagnostics[0]?.code, "OSEO2001");
  assert.match(malformed.diagnostics[0]?.message ?? "", /JSON/u);
  const named = await graphOf(
    'import {answer} from "./data.json" with {type:"json"};',
  );
  assert.ok(named.graph);
  assert.equal(linkModuleGraph(named.graph).diagnostics[0]?.code, "OSEO2001");
});

test("JSON grammar never becomes JavaScript and keeps data keys", async () => {
  await Promise.all(
    ["undefined", "NaN", "[1,]", '{"x":1,}', "/*x*/0"].map(async (invalid) => {
      assert.equal(
        (
          await graphOf(
            'import value from "./data.json" with {type:"json"};',
            invalid,
          )
        ).diagnostics[0]?.code,
        "OSEO2001",
      );
    }),
  );
  const result = await graphOf(
    'import value from "./data.json" with {type:"json"};',
    '{"__proto__":{"x":1},"x":1,"x":2,"zero":-0}',
  );
  assert.deepEqual(result.diagnostics, []);
  const declaration = result.graph?.modules[1]?.syntax.exports[0];
  assert.equal(declaration?.kind, "default");
  if (declaration?.kind !== "default") return;
  const expression = declaration.declaration;
  assert.equal(expression.kind, "object");
  if (expression.kind !== "object") return;
  assert.equal(expression.properties.length, 3);
  assert.ok(
    expression.properties.every(
      (property) => property.kind === "definition" && !property.prototypeSetter,
    ),
  );
});
