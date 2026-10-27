/* eslint-disable no-await-in-loop -- Reference realms are isolated. */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource, printMir } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { assertMatchingObservations } from "../packages/testkit/src/index.ts";
import {
  directiveCases,
  directiveScriptFixtures,
} from "./native/fixtures/host-script-directives.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";

const host = createNodeHost();

for (const fixture of directiveScriptFixtures) {
  test(`host directive source: ${fixture.name}`, async () => {
    const expected = { stdout: fixture.expected, stderr: "", exitStatus: 0 };
    assertMatchingObservations([
      expected,
      ...(await hostScriptReferences(host, fixture.source)),
    ]);
    for (const specialization of ["disabled", "enabled"] as const) {
      const result = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: fixture.name + ".js" },
        { specialization, test262Host: true, observeSpecialization: true },
      );
      assert.deepEqual(result.diagnostics, []);
      assert.match(printMir(result.mir!), /initialize .*Script completion/u);
      assert.ok(
        cBackend.emit(result.mir!).source.includes("oseo_call_function"),
      );
    }
  });
}

test("cooked directives retain strictness and locations", () => {
  for (const { source, value, strict } of directiveCases) {
    const parsed = babelFrontend.parse({ source, sourceId: "directive.js" });
    assert.deepEqual(parsed.diagnostics, []);
    assert.equal(parsed.program!.strict, strict);
    assert.deepEqual(parsed.program!.body, []);
    const directive = parsed.program!.directiveCompletion!;
    assert.equal(directive.kind, "string");
    assert.equal(directive.value, value);
    const start = source.lastIndexOf(";", source.length - 2) + 1;
    const literalStart = source.indexOf('"', start);
    assert.deepEqual(directive.byteRange, {
      start: Buffer.byteLength(source.slice(0, literalStart)),
      end: Buffer.byteLength(source.slice(0, -1)),
    });
    assert.equal(directive.range.start.line, 1);
    assert.equal(directive.range.start.column, literalStart + 1);
    assert.equal(directive.range.end.line, source.includes("\n") ? 2 : 1);
    assert.equal(
      directive.range.end.column,
      source.slice(source.lastIndexOf("\n") + 1, -1).length + 1,
    );
    for (const specialization of ["disabled", "enabled"] as const) {
      const result = compileSource(
        babelFrontend,
        {
          source: `$262.evalScript(${JSON.stringify(source)});`,
          sourceId: "directive-call.js",
        },
        { specialization, test262Host: true },
      );
      assert.deepEqual(result.diagnostics, []);
      const script = result.mir!.functions.find((fn) => fn.hostScript != null)!;
      const operations = script.blocks.flatMap((block) => block.operations);
      const initialization = operations.find(
        (op) =>
          op.kind === "initialize" &&
          op.detail.endsWith(" *Script completion*"),
      )!;
      const literal = operations.find(
        (op) => op.id === initialization.arguments[0],
      );
      assert.equal(literal!.kind, "constant");
      assert.deepEqual(literal!.constant, { kind: "string", value });
      assert.deepEqual(literal!.range, directive.range);
    }
  }
});

test("directive metadata leaves ordinary compilation unchanged", () => {
  for (const specialization of ["disabled", "enabled"] as const) {
    for (const source of [
      '"hello";',
      '"use strict"; function f() { return this; } console.log(f());',
      '"first"; "last"; var x = 2; console.log(x);',
    ]) {
      const input = { source, sourceId: "ordinary-directives.js" };
      const frontendWithoutCompletion = {
        ...babelFrontend,
        parse: (sourceInput: Parameters<typeof babelFrontend.parse>[0]) => {
          const parsed = babelFrontend.parse(sourceInput);
          if (parsed.program == null) return parsed;
          const program = { ...parsed.program };
          delete program.directiveCompletion;
          return { ...parsed, program };
        },
      };
      const actual = compileSource(babelFrontend, input, { specialization });
      const previous = compileSource(frontendWithoutCompletion, input, {
        specialization,
      });
      assert.deepEqual(actual.diagnostics, []);
      assert.deepEqual(actual.hir, previous.hir);
      assert.deepEqual(actual.mir, previous.mir);
      assert.deepEqual(
        cBackend.emit(actual.mir!),
        cBackend.emit(previous.mir!),
      );
    }
  }
  for (const source of ['; "later";', '("parenthesized");', ""]) {
    const parsed = babelFrontend.parse({
      source,
      sourceId: "not-directive.js",
    });
    assert.deepEqual(parsed.diagnostics, []);
    assert.equal(parsed.program!.directiveCompletion, undefined);
  }
});
