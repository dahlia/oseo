// Copyright (C) 2023 Alexey Shvayka. All rights reserved.
// The Test262 portions follow the BSD license in
// test262/harness/LICENSE.

/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This notice covers Oseo-authored code. Material derived from
 * Test262 retains its BSD license.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
