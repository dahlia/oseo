/* eslint-disable no-await-in-loop -- Native builds and realms are isolated. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  compileSource,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { cBackend } from "../packages/backend-c/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { executeTest262Case, parseTest262Case } from "../tools/test262.ts";
import * as fixtures from "./native/fixtures/host-script-bindings.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";
import { nativeToolchain } from "./native-toolchain.ts";
import { runNativeCli } from "./native-cli.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);
const skip = nativeTarget == null ? "requires a supported native host" : false;
const originalGc = process.env.OSEO_GC_EVERY_SAFEPOINT;
test.before(() => {
  process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
});
test.after(() => {
  if (originalGc == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
  else process.env.OSEO_GC_EVERY_SAFEPOINT = originalGc;
});

for (const fixture of fixtures.hostScriptBindingFixtures) {
  test(`host Scripts: ${fixture.name}`, { skip }, async () => {
    const expected = { exitStatus: 0, stderr: "", stdout: fixture.expected };
    const references = await hostScriptReferences(host, fixture.source);
    assertMatchingObservations([expected, references[0]!]);
    assertMatchingObservations([
      { ...expected, stdout: fixture.denoExpected ?? fixture.expected },
      references[1]!,
    ]);
    const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          { source: fixture.source, sourceId: `${fixture.name}.js` },
          { specialization, observeSpecialization: true, test262Host: true },
        );
        assert.deepEqual(compiled.diagnostics, []);
        await withNativeFixture(
          {
            backend: cBackend,
            host,
            input: compiled.mir!,
            operation: "execute",
            runtime: cRuntimeProvider,
            target: nativeTarget!,
            toolchain: nativeToolchain,
          },
          (native) => {
            assertMatchingObservations([expected, native]);
            assert.ok(native.counters!.collections > 0);
          },
        );
      }
    } finally {
      if (saved == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = saved;
    }
  });
}

test(
  "observes all fourteen original host-binding subjects unchanged",
  { skip },
  async () => {
    const suite = dirname(
      fileURLToPath(import.meta.resolve("test262/package.json")),
    );
    const paths = [
      "test/built-ins/RegExp/prototype/Symbol.replace/coerce-global.js",
      "test/language/global-code/script-decl-func-dups.js",
      "test/language/global-code/script-decl-func-err-non-configurable.js",
      "test/language/global-code/script-decl-func-err-non-extensible.js",
      "test/language/global-code/script-decl-func.js",
      "test/language/global-code/script-decl-lex-deletion.js",
      "test/language/global-code/script-decl-lex-lex.js",
      "test/language/global-code/script-decl-lex-restricted-global.js",
      "test/language/global-code/script-decl-lex-var-declared-via-eval.js",
      "test/language/global-code/script-decl-lex-var.js",
      "test/language/global-code/script-decl-lex.js",
      "test/language/global-code/script-decl-var-collision.js",
      "test/language/global-code/script-decl-var-err.js",
      "test/language/global-code/script-decl-var.js",
    ];
    const base = await readFile(
      new URL("./test262/harness/base.js", import.meta.url),
      "utf8",
    );
    const property = await readFile(
      new URL("./test262/harness/propertyHelper.js", import.meta.url),
      "utf8",
    );
    for (const path of paths) {
      const source = await readFile(join(suite, path), "utf8");
      const parsed = parseTest262Case(
        source,
        path,
        "f2d1435644797268dca1f7988cad5a4e89ccd8d2",
      );
      const result = await executeTest262Case(
        source,
        parsed,
        new Set(parsed.case.features),
        {
          base,
          done: "",
          includes: new Map([["propertyHelper.js", property]]),
        },
        {
          target: nativeTarget!.name,
          async execute(request) {
            return await runNativeCli(
              {
                args: [
                  "--test262-host",
                  ...(request.specialization === "disabled"
                    ? ["--no-specialization"]
                    : []),
                  request.sourceId,
                ],
                source: request.source,
                sourceId: request.sourceId,
                version: "0.1.0",
              },
              host,
            );
          },
        },
        [],
      );
      assert.equal(
        result.classification,
        path.endsWith("script-decl-lex-var-declared-via-eval.js")
          ? "unsupported-profile-feature"
          : "pass",
        path + "\n" + JSON.stringify(result),
      );
    }
  },
);

test(
  "unmatched source keeps the explicit ahead-of-time boundary",
  { skip },
  async () => {
    const result = await runNativeCli(
      {
        args: ["--test262-host", "unknown.js"],
        source:
          'console.log("before"); const s = "var x;"; $262.evalScript(s);',
        sourceId: "unknown.js",
        version: "0.1.0",
      },
      host,
    );
    assert.equal(result.exitStatus, 1);
    assert.equal(result.stdout, "before\n");
    assert.match(result.stderr, /OSEO1001.*ahead-of-time Script set/u);
  },
);

// PutValue 6.2.5.6 keeps an initially unresolvable Reference unresolvable
// across its RHS. V8's vm contexts instead write the newly introduced
// lexical binding, so this assertion uses the normative algorithm alone.
test(
  "an initially unresolvable write still targets the global object",
  { skip },
  async () => {
    const source = `
unresolved = $262.evalScript('let unresolved = 7; 9;');
console.log(unresolved, globalThis.unresolved);
`;
    const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          { source, sourceId: "unresolvable-script.js" },
          { specialization, test262Host: true, observeSpecialization: true },
        );
        assert.deepEqual(compiled.diagnostics, []);
        await withNativeFixture(
          {
            backend: cBackend,
            host,
            input: compiled.mir!,
            operation: "execute",
            runtime: cRuntimeProvider,
            target: nativeTarget!,
            toolchain: nativeToolchain,
          },
          (native) => {
            assert.equal(native.stdout, "7 9\n");
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

test("ordinary builds install neither host binding", { skip }, async () => {
  for (const specialization of ["disabled", "enabled"] as const) {
    const result = await runNativeCli(
      {
        args: [
          ...(specialization === "disabled" ? ["--no-specialization"] : []),
          "ordinary-host.js",
        ],
        source: "console.log(typeof $262, typeof print);",
        sourceId: "ordinary-host.js",
        version: "0.1.0",
      },
      host,
    );
    assert.equal(result.exitStatus, 0, result.stderr);
    assert.equal(result.stdout, "undefined undefined\n");
  }
});
