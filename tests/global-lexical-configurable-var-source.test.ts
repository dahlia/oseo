import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  globalLexicalConfigurableVarFixture,
  globalLexicalConfigurableVarScripts,
} from "./native/fixtures/global-lexical-configurable-var.ts";

const suite = dirname(
  fileURLToPath(import.meta.resolve("test262/package.json")),
);
const path =
  "test/language/global-code/script-decl-lex-var-declared-via-eval.js";

test("the witness keeps the original's later Scripts and values", () => {
  const source = readFileSync(join(suite, path), "utf8");
  const body = source.slice(source.indexOf("---*/"));
  // Only the two eval declarations differ; the witness replaces them with
  // Script var declarations over configurable properties.
  assert.equal(
    body,
    `---*/

eval('var test262Var;');
eval('function test262Fn() {}');

$262.evalScript('let test262Var = 1;');
assert.sameValue(test262Var, 1);

$262.evalScript('const test262Fn = 2;');
assert.sameValue(test262Fn, 2);
`,
  );
  assert.deepEqual(globalLexicalConfigurableVarScripts.slice(2), [
    "let test262Var = 1;",
    "check(test262Var, 1);",
    "const test262Fn = 2;",
    "check(test262Fn, 2);",
  ]);
});

test("the lexical witness constructs no source", () => {
  assert.doesNotMatch(
    globalLexicalConfigurableVarFixture.source,
    /\beval\s*\(|\bFunction\s*\(/u,
  );
});
