/* eslint-disable no-await-in-loop -- Native builds are isolated and serial. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";
import test from "node:test";
import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  printMir,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import * as cases from "./native/fixtures/host-script-evidence-cases.ts";
const { hostScriptCases } = cases;
import * as fixtures from "./native/fixtures/host-script-evidence.ts";
const {
  cookedArgument,
  hostScriptExpectedOutput,
  hostScriptFixtures,
  hostScriptOriginal,
  hostScriptProgram,
  hostScriptValueOracleFixture,
} = fixtures;
import {
  hostScriptMainReference,
  hostScriptMainReferences,
} from "./native/host-script-main-reference.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);
const skip = nativeTarget == null ? "requires a supported native host" : false;
const baseHarness = readFileSync(
  new URL("./test262/harness/base.js", import.meta.url),
  "utf8",
);

/** Sources whose Script early error is the original's asserted subject. */
const earlyErrors = new Set([
  "new.target;",
  "super();",
  "super.property;",
  "var public = 1;",
]);

test("host Script witnesses select 44 distinct pinned originals", () => {
  const selected = new Set(
    readFileSync(
      new URL(
        "../docs/m5c-graph/dynamic-source-host-script-evidence.paths.txt",
        import.meta.url,
      ),
      "utf8",
    )
      .trim()
      .split("\n"),
  );
  assert.equal(selected.size, 99);
  const paths = hostScriptCases.map((subject) => subject.path);
  assert.equal(new Set(paths).size, 44);
  for (const path of paths) assert.ok(selected.has(path), path);
});

for (const subject of hostScriptCases) {
  test(`host Script witness keeps the original: ${subject.path}`, () => {
    const original = hostScriptOriginal(subject);
    assert.equal(
      createHash("sha256").update(original).digest("hex"),
      subject.sha256,
    );
    const frontmatter = original.slice(0, original.indexOf("---*/"));
    const flags = /^flags: \[(.*)\]$/mu.exec(frontmatter)?.[1] ?? "";
    assert.deepEqual(
      subject.modes,
      flags.includes("onlyStrict")
        ? ["strict"]
        : flags.includes("noStrict")
          ? ["sloppy"]
          : ["sloppy", "strict"],
    );
    assert.doesNotMatch(flags, /module|raw/u);
    assert.equal(
      /^negative:\n {2}phase: runtime\n {2}type: SyntaxError$/mu.test(
        frontmatter,
      ),
      subject.negative === true,
    );
    assert.equal(/^negative:/mu.test(frontmatter), subject.negative === true);
    const includes = /^includes: \[(.*)\]$/mu.exec(frontmatter)?.[1] ?? "";
    assert.deepEqual(
      includes === "" ? [] : includes.split(", "),
      subject.includes ?? [],
    );
    for (const call of subject.calls) {
      assert.equal(cookedArgument(call.call), call.source);
      assert.equal(call.call.startsWith("eval("), subject.direct);
      assert.notEqual(call.mutation, call.source);
    }
  });
}

/** Malformed host Scripts are exactly the expected early-error sources. */
function expectedErrors(subject: cases.HostScriptCase): ReadonlySet<string> {
  const errors = new Set<string>();
  for (const mode of subject.modes) {
    for (const call of subject.calls) {
      if (!earlyErrors.has(call.source)) continue;
      const inherited =
        subject.direct &&
        (mode === "strict" || subject.strictFunctionCaller === true);
      errors.add(
        inherited ? '"use strict"; void 0;\n' + call.source : call.source,
      );
    }
  }
  return errors;
}

/**
 * When a global Script redeclares the non-configurable `NaN` as a function,
 * V8 throws SyntaxError rather than the specified TypeError and keeps the
 * declarations it already instantiated. The reference verdict for these
 * originals records that divergence; native execution supplies Oseo's
 * observation against the original TypeError and absence assertions.
 */
const v8NaNScriptDivergence = new Set(
  ["direct", "indirect"].flatMap((kind) =>
    [
      "non-definable-function-with-function.js",
      "non-definable-function-with-variable.js",
      "non-definable-global-function.js",
      "non-definable-global-generator.js",
    ].map((name) => `test/language/eval-code/${kind}/${name}`),
  ),
);

/** Run every program variant once per main-realm reference process. */
async function assertMainReferences(
  subject: cases.HostScriptCase,
): Promise<void> {
  // Deno cannot unload after the original makes its global non-extensible.
  const deno = !subject.reached?.includes("nonExtensible");
  for (const mode of subject.modes) {
    for (let mutation = -1; mutation < subject.calls.length; mutation += 1) {
      const original = mutation < 0;
      const verdict = original
        ? subject.negative === true
          ? "SyntaxError"
          : v8NaNScriptDivergence.has(subject.path)
            ? "Test262Error"
            : "completed"
        : subject.negative === true
          ? "completed"
          : "Test262Error";
      const reached = original ? subject.reached : undefined;
      const source = hostScriptMainReference(
        baseHarness,
        hostScriptProgram(subject, mode === "strict", mutation),
        reached,
      );
      const observations = await hostScriptMainReferences(host, source, deno);
      assertMatchingObservations([
        {
          exitStatus: 0,
          stderr: "",
          stdout: verdict + "\n" + (reached == null ? "" : "reached\n"),
        },
        ...observations,
      ]);
    }
  }
}

for (const [index, fixture] of [
  ...hostScriptFixtures,
  hostScriptValueOracleFixture,
].entries()) {
  const subject = hostScriptCases[index];
  const expected = {
    exitStatus: 0,
    stderr: "",
    stdout:
      subject == null
        ? "host-script-evidence-oracle ok\n"
        : hostScriptExpectedOutput(subject),
  };
  test(`host Script structure and references: ${fixture.name}`, async () => {
    if (subject == null) {
      assertMatchingObservations([
        expected,
        ...(await hostScriptReferences(host, fixture.source)),
      ]);
    } else await assertMainReferences(subject);
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: fixture.name + ".js" },
        { specialization, test262Host: true },
      );
      assert.deepEqual(compiled.diagnostics, []);
      const scripts = compiled.mir!.test262Host!.scripts!;
      assert.ok(scripts.length > (subject == null ? 0 : 1));
      const errors = scripts.filter((script) => script.error != null);
      assert.ok(errors.every((script) => script.error === "syntax"));
      assert.deepEqual(
        new Set(errors.map((script) => script.source)),
        subject == null ? new Set() : expectedErrors(subject),
      );
      assert.match(printMir(compiled.mir!), /Script completion/u);
      const emitted = cBackend.emit(compiled.mir!);
      assert.match(emitted.source, /oseo_test262_host_install/u);
      assert.match(emitted.source, /oseo_host_scripts/u);
    }
  });
  test(`host Script native: ${fixture.name}`, { skip }, async () => {
    const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          { source: fixture.source, sourceId: fixture.name + ".js" },
          { observeSpecialization: true, specialization, test262Host: true },
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
