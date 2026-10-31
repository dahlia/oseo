/* eslint-disable no-await-in-loop -- Native policies run serially. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  buildModuleGraph,
  compileModuleGraph,
  printMir,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import {
  createFileModuleLoader,
  createNodeHost,
  fileModuleResolver,
} from "../packages/host/src/index.ts";
import {
  babelFrontend,
  babelModuleFrontend,
} from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const fixtures = new URL(
  "./fixtures/ds12-module-observables/",
  import.meta.url,
);

// These assertions are the static witnesses' oracle, independent of Oseo.
const harness = `
function assert(value, message) {
  if (!value) throw new Error(message || "assertion failed");
}
assert.sameValue = function(actual, expected, message) {
  if (!Object.is(actual, expected)) {
    throw new Error(message || "different values");
  }
};
assert.throws = function(expected, operation, message) {
  try { operation(); } catch (error) {
    if (error.constructor === expected) return;
    throw error;
  }
  throw new Error(message || "missing exception");
};
function $DONE(error) {
  if (error !== undefined) throw error;
  console.log("ok");
}
function asyncTest(operation) { operation().then($DONE, $DONE); }
`;

// Each group runs in a fresh realm so global updater and binding sentinels
// cannot leak between cases. A prelude is a Script, even for strict modules.
const groups: readonly (readonly [string, string, string, boolean])[] = [
  [
    "delete-exported-init-no-strict",
    "delete-exported-init-no-strict.mjs",
    "delete-exported-init-no-strict.prelude.js",
    true,
  ],
  [
    "delete-exported-init-strict",
    "delete-exported-init-strict.mjs",
    "delete-exported-init-strict.prelude.js",
    true,
  ],
  [
    "delete-non-exported-no-strict",
    "delete-non-exported-no-strict.mjs",
    "delete-non-exported-no-strict.prelude.js",
    true,
  ],
  [
    "get-nested-namespace-dflt-direct",
    "get-nested-namespace-dflt-direct.mjs",
    "get-nested-namespace-dflt-direct.prelude.js",
    true,
  ],
  [
    "get-nested-namespace-dflt-indirect",
    "get-nested-namespace-dflt-indirect.mjs",
    "get-nested-namespace-dflt-indirect.prelude.js",
    true,
  ],
  [
    "get-nested-namespace-props-nrml",
    "get-nested-namespace-props-nrml.mjs",
    "get-nested-namespace-props-nrml.prelude.js",
    true,
  ],
  ["set-no-strict", "set-no-strict.mjs", "set-no-strict.prelude.js", true],
  [
    "set-same-values-no-strict",
    "set-same-values-no-strict.mjs",
    "set-same-values-no-strict.prelude.js",
    true,
  ],
  [
    "set-same-values-strict",
    "set-same-values-strict.mjs",
    "set-same-values-strict.prelude.js",
    true,
  ],
  ["set-strict", "set-strict.mjs", "set-strict.prelude.js", true],
  [
    "nested-arrow-assignment-expression-eval-gtbndng-indirect-update",
    "nested-arrow-assignment-expression-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-arrow-import-then-eval-gtbndng-indirect-update",
    "nested-arrow-import-then-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-async-arrow-function-await-eval-gtbndng-indirect-update",
    "nested-async-arrow-function-await-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-async-arrow-function-return-await-eval-gtbndng-indirect-update",
    "nested-async-arrow-function-return-await-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-async-function-await-eval-gtbndng-indirect-update",
    "nested-async-function-await-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-async-function-eval-gtbndng-indirect-update",
    "nested-async-function-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-async-function-return-await-eval-gtbndng-indirect-update",
    "nested-async-function-return-await-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-async-gen-await-eval-gtbndng-indirect-update",
    "nested-async-gen-await-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-async-gen-return-await-eval-gtbndng-indirect-update",
    "nested-async-gen-return-await-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-block-import-then-eval-gtbndng-indirect-update",
    "nested-block-import-then-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-do-while-eval-gtbndng-indirect-update",
    "nested-do-while-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-else-import-then-eval-gtbndng-indirect-update",
    "nested-else-import-then-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-function-import-then-eval-gtbndng-indirect-update",
    "nested-function-import-then-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-if-braceless-eval-gtbndng-indirect-update",
    "nested-if-braceless-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-if-import-then-eval-gtbndng-indirect-update",
    "nested-if-import-then-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "nested-while-import-then-eval-gtbndng-indirect-update",
    "nested-while-import-then-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "syntax-nested-block-labeled-eval-gtbndng-indirect-update",
    "syntax-nested-block-labeled-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "top-level-import-then-eval-gtbndng-indirect-update",
    "top-level-import-then-eval-gtbndng-indirect-update.mjs",
    "",
    true,
  ],
  [
    "eval-gtbndng-indirect-update-as",
    "eval-gtbndng-indirect-update-as.mjs",
    "",
    false,
  ],
  [
    "eval-gtbndng-indirect-update",
    "eval-gtbndng-indirect-update.mjs",
    "",
    false,
  ],
  ["eval-rqstd-once", "eval-rqstd-once.mjs", "", false],
  ["eval-rqstd-order", "eval-rqstd-order.mjs", "", false],
  ["instn-same-global", "instn-same-global.mjs", "", false],
  ["custom-primitive", "custom-primitive.mjs", "", true],
  ["imported-self-update", "imported-self-update.mjs", "", true],
  ["import-meta-specifier", "import-meta-specifier.mjs", "", false],
];

for (const [name, entryName, observerName, expectNamespace] of groups) {
  test(
    `DS-12 static module witness: ${name}`,
    { skip: nativeTarget == null ? "requires a supported native host" : false },
    async () => {
      assert.ok(nativeTarget);
      const directory = await host.makeTemporaryDirectory("oseo-ds12-");
      const observer =
        observerName === ""
          ? ""
          : await readFile(new URL(observerName, fixtures), "utf8");
      const preludeSource = harness + observer;
      try {
        await host.writeTextFile(`${directory}/prelude.js`, preludeSource);
        // Reference-only host setup installs the same Script environment.
        // The subject graph below is loaded entirely by static imports.
        await host.writeTextFile(
          `${directory}/setup.mjs`,
          [
            'import { readFileSync } from "node:fs";',
            'import { runInThisContext } from "node:vm";',
            "runInThisContext(readFileSync(",
            '  new URL("./prelude.js", import.meta.url), "utf8"));',
          ].join("\n"),
        );
        const entry = new URL(entryName, fixtures).href;
        await host.writeTextFile(
          `${directory}/reference.mjs`,
          `import "./setup.mjs";\nimport ${JSON.stringify(entry)};\n`,
        );
        for (const [command, args] of [
          [process.execPath, [`${directory}/reference.mjs`]],
          [
            "deno",
            ["run", "--quiet", "--allow-read", `${directory}/reference.mjs`],
          ],
        ] as const) {
          const result = await host.run({ command, args, cwd: directory });
          assert.equal(result.exitStatus, 0, result.stderr);
          assert.equal(result.stderr, "");
          assert.equal(result.stdout, "ok\n", command);
        }
        const graph = await buildModuleGraph(
          babelModuleFrontend,
          createFileModuleLoader(host),
          fileModuleResolver,
          entry,
        );
        assert.deepEqual(graph.diagnostics, []);
        assert.ok(graph.graph);
        const prelude = babelFrontend.parse({
          source: preludeSource,
          sourceId: `${directory}/prelude.js`,
        });
        assert.deepEqual(prelude.diagnostics, []);
        assert.ok(prelude.program);
        const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
        process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
        try {
          for (const specialization of ["disabled", "enabled"] as const) {
            const compiled = compileModuleGraph(
              graph.graph,
              { observeSpecialization: true, specialization },
              prelude.program,
            );
            assert.deepEqual(compiled.diagnostics, []);
            assert.ok(compiled.mir);
            const mir = printMir(compiled.mir);
            assert.match(mir, /function @f\d+ \*module:/u);
            if (expectNamespace) {
              assert.match(mir, /module-namespace-create \d+ live exports/u);
            }
            if (name === "import-meta-specifier") {
              assert.match(mir, /read \*import.meta\*/u);
            }
            await withNativeFixture(
              {
                backend: cBackend,
                host,
                input: compiled.mir,
                operation: "execute",
                runtime: cRuntimeProvider,
                target: nativeTarget,
                toolchain: nativeToolchain,
              },
              (native) => {
                assert.equal(native.stdout, "ok\n", specialization);
                assert.equal(native.stderr, "");
                assert.ok(native.counters);
                assert.ok(native.counters.allocations > 0);
                assert.ok(native.counters.collections > 0);
                // The AOT module graph retains real binding cells. No runtime
                // source operation replaces namespace reads or updates.
                assert.match(native.emittedC, /oseo_function_\d+/u);
                if (expectNamespace) {
                  assert.match(
                    native.emittedC,
                    /oseo_module_namespace_create/u,
                  );
                }
              },
            );
          }
        } finally {
          if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
        }
      } finally {
        await host.remove(directory);
      }
    },
  );
}
