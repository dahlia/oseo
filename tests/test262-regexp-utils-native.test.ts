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
  parseTest262Case,
} from "../tools/test262.ts";
import { createTest262FragmentExecutor } from "../tools/test262-fragments.ts";
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
const include = "regExpUtils.js";
const base = await readFile(
  new URL("test262/harness/base.js", import.meta.url),
  "utf8",
);
const helper = await readFile(
  new URL(`test262/harness/${include}`, import.meta.url),
  "utf8",
);
const original = await readFile(
  new URL(import.meta.resolve(`test262/harness/${include}`)),
  "utf8",
);

const fixedBody = `
const string = buildString({
  loneCodePoints: [65, 0x10000, 0xd800],
  ranges: [[67, 68], [66, 66], [2, 1], [0x10ffff, 0x10ffff]]
});
assert.sameValue(string, 'A\\u{10000}\\ud800CDB\\u{10ffff}');
const calls = [];
const receiver = { test(value) {
  calls.push(value);
  return calls.length !== 1;
}};
testPropertyEscapes(receiver, 'A\\u{10000}\\udfff', 'trace');
assert.compareArray(calls, [
  'A\\u{10000}\\udfff', 'A', '\\u{10000}', '\\udfff'
]);
let message;
try { testPropertyEscapes(/^A+$/u, 'A\\u{1f4a9}', 'expr'); }
catch (error) { message = error.message; }
assert.sameValue(message, '\x60expr\x60 should match U+01F4A9 (\x60💩\x60)');
const global = /A/g;
global.lastIndex = 1;
testPropertyEscapes(global, 'AA', 'global');
assert.sameValue(global.lastIndex, 2);
assert.throws(RangeError, function () {
  buildString({loneCodePoints: [-1], ranges: []});
});
console.log('harness controls passed');
`;

test(
  "native RegExp helpers retain construction and failing assertion controls",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    assert.ok(nativeTarget);
    for (const text of [original, helper]) {
      for (const policy of ["enabled", "disabled"] as const) {
        const source = `${base}\n${text}\n${fixedBody}`;
        const result = await runNativeCli({
          args: [
            ...(policy === "disabled" ? ["--no-specialization"] : []),
            "--target",
            nativeTarget.name,
            "regexp-harness-controls.js",
          ],
          source,
          sourceId: "regexp-harness-controls.js",
          version: "test",
        });
        assert.equal(result.exitStatus, 0, result.stderr);
        assert.equal(result.stdout, "harness controls passed\n");
      }
    }
  },
);

/** Complete pinned subjects, including their original assertions and data. */
const representatives = [
  "CharacterClassEscapes/" +
    "character-class-non-digit-class-escape-positive-cases.js",
  "CharacterClassEscapes/" +
    "character-class-non-whitespace-class-escape-positive-cases.js",
  "CharacterClassEscapes/" +
    "character-class-non-word-class-escape-positive-cases.js",
  "CharacterClassEscapes/character-class-word-class-escape-positive-cases.js",
  "property-escapes/generated/ASCII.js",
  "property-escapes/generated/General_Category_-_Surrogate.js",
];

for (const relative of representatives) {
  test(
    `original RegExp subject: ${relative}`,
    {
      skip: nativeTarget == null ? "requires a supported native host" : false,
    },
    async (t) => {
      assert.ok(nativeTarget);
      const path = `test/built-ins/RegExp/${relative}`;
      const source = await readFile(
        new URL(import.meta.resolve(`test262/${path}`)),
        "utf8",
      );
      const parsed = parseTest262Case(source, path, revision);
      const executor = createTest262FragmentExecutor(host, nativeToolchain);
      const results: CliResult[] = [];
      const result = await executeTest262Case(
        source,
        parsed,
        new Set(["regexp-unicode-property-escapes", "String.fromCodePoint"]),
        {
          base,
          done: "",
          includes: new Map([[include, helper]]),
          upstreamDefinitions: new Map([
            [include, parseHarnessDefinitions(original, include)],
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
      t.diagnostic(JSON.stringify({ path, result, results }));
      assert.equal(result.classification, "pass", result.observation.detail);
      assert.equal(result.execution?.variants.length, 4);
      assert.equal(results.length, 4);
    },
  );
}
