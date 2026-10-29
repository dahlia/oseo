/* eslint-disable no-await-in-loop -- Native observations run in order. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { CliResult } from "../packages/cli/src/index.ts";
import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import {
  executeTest262Case,
  parseHarnessDefinitions,
  parseHarnessObjectMembers,
  parseTest262Case,
} from "../tools/test262.ts";
import { createTest262FragmentExecutor } from "../tools/test262-fragments.ts";
import { harnessTrapMarker } from "../tools/test262-harness-trap.ts";
import { runNativeCli } from "./native-cli.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const revision = "f2d1435644797268dca1f7988cad5a4e89ccd8d2";
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const include = "temporalHelpers.js";
const base = await readFile(
  new URL("test262/harness/base.js", import.meta.url),
  "utf8",
);
const reviewed = await readFile(
  new URL(`test262/harness/${include}`, import.meta.url),
  "utf8",
);
const upstream = await readFile(
  new URL(`harness/${include}`, import.meta.resolve("test262/package.json")),
  "utf8",
);

const negative = "negative:\n  phase: runtime\n  type: TypeError\n";

/**
 * Native observations of the omitted-member trap: metadata, body, and the
 * expected classification. Each body runs every variant the runner admits
 * through the split-harness executor. A runtime negative expecting
 * TypeError shows that the trap's own throw never matches it.
 */
const cases = {
  "kept members": [
    "",
    "const calls = [];\n" +
      "const bag =\n" +
      "  TemporalHelpers.propertyBagObserver(calls, { a: 1 }, 'o');\n" +
      "assert.sameValue(+bag.a, 1);\n" +
      "const target = { m() { return 2; } };\n" +
      "TemporalHelpers.observeMethod(calls, target, 'm', 't');\n" +
      "assert.sameValue(target.m(), 2);\n" +
      "assert.sameValue(calls[0], 'get o.a');\n" +
      "assert.sameValue(calls[calls.length - 1], 'call t.m');\n",
    "pass",
  ],
  "with fallback": [
    `flags: [noStrict]\n${negative}`,
    "with ({}) { TemporalHelpers.observeProperty([], {}, 'x', 1); }\n",
    "harness-failure",
  ],
  "Script var": [
    negative,
    "var TemporalHelpers;\nTemporalHelpers.observeProperty([], {}, 'x', 1);\n",
    "harness-failure",
  ],
  "caught trap": [
    "",
    "try { TemporalHelpers.ISO(); } catch (error) {}\n",
    "harness-failure",
  ],
  "replaced kept member": [
    "",
    "TemporalHelpers.observeMethod = Object.prototype.valueOf;\n" +
      "try { TemporalHelpers.observeMethod().ISO; } catch (error) {}\n",
    "harness-failure",
  ],
  "own keys": [negative, "Object.keys(TemporalHelpers);\n", "harness-failure"],
  "later job": [
    "flags: [async]\n",
    "Promise.resolve().then(() => {\n" +
      "  try { TemporalHelpers.ISO; } catch (error) {}\n" +
      "}).then($DONE, $DONE);\n",
    "harness-failure",
  ],
  "forged marker": [
    "",
    `console.log('${harnessTrapMarker}' + '0'.repeat(32) + ':x');\n`,
    "pass",
  ],
  "rebound Proxy": ["", "function Proxy() {}\n", "harness-failure"],
  // An inherited descriptor field must not make a kept-member write throw.
  "inherited descriptor field": [
    `flags: [noStrict]\n${negative}`,
    "Object.prototype.get = function () {};\n" +
      "TemporalHelpers.observeMethod = 1;\n",
    "semantic-failure",
  ],
} satisfies Readonly<Record<string, readonly [string, string, string]>>;

for (const [name, [metadata, body, expected]] of Object.entries(cases)) {
  test(
    `native harness trap: ${name}`,
    {
      skip: nativeTarget == null ? "requires a supported native host" : false,
    },
    async (t) => {
      assert.ok(nativeTarget);
      const source = `/*---\n${metadata}includes: [${include}]\n---*/\n${body}`;
      const parsed = parseTest262Case(source, "test/trap.js", revision);
      const executor = createTest262FragmentExecutor(host, nativeToolchain);
      const results: CliResult[] = [];
      const result = await executeTest262Case(
        source,
        parsed,
        new Set<string>(),
        {
          base,
          done: await readFile(
            new URL("test262/harness/doneprintHandle.js", import.meta.url),
            "utf8",
          ),
          includes: new Map([[include, reviewed]]),
          upstreamDefinitions: new Map([
            [include, parseHarnessDefinitions(upstream, include)],
          ]),
          upstreamMembers: new Map([
            [include, parseHarnessObjectMembers(upstream)],
          ]),
        },
        {
          target: nativeTarget.name,
          async execute(request) {
            const observed = await executor.execute(request, () =>
              runNativeCli({
                args: [
                  ...(request.specialization === "disabled"
                    ? ["--no-specialization"]
                    : []),
                  "--target",
                  nativeTarget.name,
                  request.sourceId,
                ],
                source: request.source,
                sourceId: request.sourceId,
                version: "test",
              }),
            );
            results.push(observed);
            return observed;
          },
        },
      );
      t.diagnostic(JSON.stringify({ result, results }));
      assert.equal(result.classification, expected, result.observation.detail);
      assert.ok(results.length > 0);
    },
  );
}
