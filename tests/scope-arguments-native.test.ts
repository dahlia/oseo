/* eslint-disable no-await-in-loop -- Native variants run serially. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { Script } from "node:vm";
import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  printMir,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import { nativeToolchain } from "./native-toolchain.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";
const { scopeArgumentsFixtures } =
  await import("./native/fixtures/scope-arguments-evidence.ts");

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);
const suiteRoot = dirname(
  createRequire(import.meta.url).resolve("test262/package.json"),
);

test("each witness keeps its original's assertions without eval", () => {
  assert.equal(new Set(scopeArgumentsFixtures.map((f) => f.path)).size, 6);
  for (const fixture of scopeArgumentsFixtures) {
    const original = readFileSync(join(suiteRoot, fixture.path), "utf8");
    const body = original.slice(original.indexOf("---*/"));
    assert.match(body, /\(p = eval\("var arguments = 'param'"\)/u);
    assert.doesNotMatch(fixture.source, /\beval\b|\bFunction\b/u);
    // Every assertion of the original body and its closing global check
    // appears verbatim in the witness.
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("assert.sameValue(") && trimmed !== "count++;") {
        continue;
      }
      if (trimmed.startsWith("assert.sameValue(globalThis.arguments")) {
        assert.ok(
          fixture.source.includes("globalThis.arguments, oldArguments"),
        );
        continue;
      }
      const head = trimmed.replace(/\);$/u, "");
      assert.ok(fixture.source.includes(head), `${fixture.name}: ${trimmed}`);
    }
    const closure = body.includes("q = () => arguments");
    assert.equal(fixture.source.includes("q = () => arguments"), closure);
    assert.equal(
      fixture.source.includes('assert.sameValue(q(), "param")'),
      closure,
    );
    for (const declaration of [
      "function arguments() {}",
      'let arguments = "local";',
      'var arguments = "local";',
    ]) {
      assert.equal(
        fixture.source.includes(declaration),
        body.includes(declaration),
        `${fixture.name}: ${declaration}`,
      );
    }
  }
});

test("the q() check rejects a closure created in the body", () => {
  const closures = scopeArgumentsFixtures.filter((f) =>
    f.source.includes("q = () => arguments"),
  );
  assert.equal(closures.length, 3);
  for (const fixture of closures) {
    // A closure created in the body reads the body binding, not "param".
    const mutant = fixture.source.replace(
      'assert.sameValue(q(), "param");',
      'const inner = () => arguments; assert.sameValue(inner(), "param");',
    );
    assert.notEqual(mutant, fixture.source);
    const logs: string[] = [];
    const console = { log: (line: string) => logs.push(line) };
    assert.throws(() => new Script(mutant).runInNewContext({ console }));
    assert.deepEqual(logs, []);
  }
});

for (const fixture of scopeArgumentsFixtures) {
  test(
    `${fixture.name} static native and reference observations`,
    {
      skip: nativeTarget == null ? "requires a supported native host" : false,
    },
    async () => {
      for (const reference of await hostScriptReferences(
        host,
        fixture.source,
      )) {
        assert.equal(reference.exitStatus, 0, reference.stderr);
        assert.equal(reference.stderr, "");
        assert.equal(reference.stdout, fixture.expected);
      }
      const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        for (const specialization of ["disabled", "enabled"] as const) {
          const result = compileSource(
            babelFrontend,
            { source: fixture.source, sourceId: `${fixture.name}.js` },
            { specialization, observeSpecialization: true },
          );
          assert.deepEqual(result.diagnostics, []);
          assert.ok(result.mir);
          assert.doesNotMatch(
            printMir(result.mir),
            /intrinsic (eval|Function)\b/u,
          );
          await withNativeFixture(
            {
              backend: cBackend,
              host,
              input: result.mir,
              operation: "execute",
              runtime: cRuntimeProvider,
              target: nativeTarget!,
              toolchain: nativeToolchain,
            },
            (native) => {
              assert.equal(native.exitStatus, 0, native.stderr);
              assert.equal(native.stderr, "");
              assert.equal(native.stdout, fixture.expected);
              assert.ok(native.counters!.collections > 0);
            },
          );
        }
      } finally {
        if (saved == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        else process.env.OSEO_GC_EVERY_SAFEPOINT = saved;
      }
    },
  );
}
