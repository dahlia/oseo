/* eslint-disable no-await-in-loop -- Native observations run in order. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import type { CliResult } from "../packages/cli/src/index.ts";
import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { executeTest262Case, parseTest262Case } from "../tools/test262.ts";
import type { Test262Result } from "../packages/testkit/src/index.ts";
import { runNativeCli } from "./native-cli.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const revision = "f2d1435644797268dca1f7988cad5a4e89ccd8d2";
const base = await readFile(
  new URL("test262/harness/base.js", import.meta.url),
  "utf8",
);

for (const name of ["export", "import", "dependency"]) {
  test(
    `module runtime diagnostics are portable: ${name}`,
    { skip: nativeTarget == null ? "requires a supported native host" : false },
    async (t) => {
      assert.ok(nativeTarget);
      const path = `test/language/eval-code/indirect/${name}.js`;
      const source =
        name === "dependency"
          ? "/*---\nflags: [module]\nnegative:\n" +
            "  phase: runtime\n  type: TypeError\n---*/\n" +
            'import "./dep_FIXTURE.js";\n'
          : await readFile(
              new URL(path, import.meta.resolve("test262/package.json")),
              "utf8",
            );
      const parsed = parseTest262Case(source, path, revision);
      const results: Test262Result[] = [];
      const roots: string[] = [];
      try {
        for (const label of ["first #", "second %"]) {
          const root = await mkdtemp(join(tmpdir(), `oseo-${label}-`));
          roots.push(root);
          const sourcePath = join(root, path);
          await mkdir(dirname(sourcePath), { recursive: true });
          await writeFile(sourcePath, source);
          await writeFile(
            join(dirname(sourcePath), "dep_FIXTURE.js"),
            'console.log("before");\nthrow new TypeError("kept");\n',
          );
          const raw: CliResult[] = [];
          const result = await executeTest262Case(
            source,
            parsed,
            new Set<string>(),
            { base, done: "", includes: new Map() },
            {
              target: nativeTarget.name,
              async execute(request) {
                assert.ok(request.script != null);
                const observed = await runNativeCli({
                  args: [
                    "--module",
                    "--script",
                    "oseo:test262-harness.js",
                    ...(request.specialization === "disabled"
                      ? ["--no-specialization"]
                      : []),
                    "--target",
                    nativeTarget.name,
                    sourcePath,
                  ],
                  source: request.source,
                  sourceId: request.sourceId,
                  scriptSource: request.script,
                  version: "test",
                });
                raw.push(observed);
                return observed;
              },
            },
            ["dynamic-source", "module-linking"],
            { rootPath: root, sourcePath },
          );
          t.diagnostic(JSON.stringify({ root, result, raw }));
          assert.ok(raw.every((entry) => entry.executed === true));
          assert.match(raw[0]!.stderr, /^file:\/\//u);
          assert.doesNotMatch(result.observation.detail ?? "", /file:\/\//u);
          if (name === "dependency") {
            assert.equal(result.classification, "expected-negative");
            assert.equal(result.observation.failedPhase, "runtime");
            assert.equal(result.execution?.variants.length, 2);
            assert.equal(result.observation.errorType, "TypeError");
            assert.ok(raw.every((entry) => entry.stdout === "before\n"));
          } else {
            assert.equal(result.classification, "unsupported-profile-feature");
            assert.equal(
              result.observation.unsupportedCapability,
              "profile-syntax",
            );
            assert.match(
              result.observation.detail ?? "",
              /:\d+:\d+: error\[OSEO1001\]/u,
            );
          }
          results.push(result);
        }
        assert.deepEqual(results[0], results[1]);
      } finally {
        await Promise.all(
          roots.map((root) => rm(root, { recursive: true, force: true })),
        );
      }
    },
  );
}
