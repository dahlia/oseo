import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  cBackend,
  emitScriptFragments,
} from "../packages/backend-c/src/index.ts";
import {
  compileBodyFragment,
  compileHarnessFragment,
  compileSource,
} from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { completionStorageCases } from "./completion-storage-cases.ts";

for (const fixture of completionStorageCases) {
  test(`completion storage reference: ${fixture.name}`, async () => {
    const lines: string[] = [];
    // This executes only the independent bootstrap oracle, in its own realm.
    await runInNewContext(fixture.source, {
      console: {
        log: (...values: readonly unknown[]) => {
          lines.push(values.map(String).join(" "));
        },
      },
    });
    assert.equal(`${lines.join("\n")}\n`, fixture.stdout);
  });

  for (const specialization of ["disabled", "enabled"] as const) {
    test(`completion storage emits ${fixture.name}: ${specialization}`, () => {
      const compiled = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: `${fixture.name}.js` },
        { specialization, observeSpecialization: true },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir != null);
      const { source } = cBackend.emit(compiled.mir);
      // These programs exercise records, not only ordinary return paths.
      assert.match(source, /OseoCompletionRecord/u);
      const declared = [
        ...source.matchAll(/OseoCompletionRecord completion\[(\d+)u\]/gu),
      ].map((match) => Number(match[1]));
      const suspended = [
        ...source.matchAll(
          /oseo_generator_create\([^;]+?, (\d+)u, (\d+)u\);/gu,
        ),
      ].map((match) => Number(match[2]));
      const maximum = Math.max(...declared, ...suspended);
      for (const match of source.matchAll(/completion\[(\d+)u\]\./gu)) {
        assert.ok(Number(match[1]) < maximum);
      }
      assert.match(source, /oseo_frame_enter/u);
    });
  }
}

test("fragment phases retain independent completion storage", () => {
  const harness = compileHarnessFragment(babelFrontend, [
    {
      sourceId: "harness.js",
      source: "function h() { try { throw 1; } catch (e) { return e; } }",
    },
  ]);
  assert.ok(harness.kind === "compiled");
  const body = compileBodyFragment(babelFrontend, harness.harness, {
    sourceId: "body.js",
    source: "try { h(); } finally { console.log('done'); }",
  });
  assert.ok(body.kind === "compiled");
  const emitted = emitScriptFragments(harness.harness, body.body, {
    sourceId: "assembled.js",
    harnessLineOffset: 0,
    bodyLineOffset: 1,
  });
  for (const source of [emitted.harness.source, emitted.body.source]) {
    assert.match(source, /OseoCompletionRecord completion\[1u\]/u);
    assert.match(source, /completion\[0u\]/u);
    assert.match(source, /oseo_frame_enter/u);
  }
});

test("sloppy receiver follows the compact saved-value range", () => {
  const compiled = compileSource(
    babelFrontend,
    {
      sourceId: "sloppy-completion.js",
      source:
        "function f() { try { throw 1; } catch (e) { return this; } } f();",
    },
    { specialization: "disabled" },
  );
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  const { source } = cBackend.emit(compiled.mir);
  assert.match(source, /OseoCompletionRecord completion\[1u\]/u);
  assert.match(source, /oseo_roots_allocate\(context, &frame, 34u\)/u);
  assert.match(source, /roots\[33\] = result.value;/u);
  assert.match(source, /roots\[32u\] = roots\[/u);
});
