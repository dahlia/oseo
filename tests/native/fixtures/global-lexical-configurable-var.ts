// Copyright (C) 2023 Alexey Shvayka. All rights reserved.
// The Test262 portions follow the BSD license in
// ../../test262/harness/LICENSE.

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

import { readFileSync } from "node:fs";
import type { Fixture } from "../fixture.ts";
import { compoundReferenceBaseCheck } from "./compound-reference-base.ts";

const harness = readFileSync(
  new URL("../../test262/harness/base.js", import.meta.url),
  "utf8",
);

/**
 * Global properties made by assignment are configurable. A later Script's
 * `var` over them leaves them configurable, as a non-strict direct eval
 * declaration would create them, so the following Scripts may declare
 * `let` and `const` over the same names.
 */
export const globalLexicalConfigurableVarScripts: readonly string[] = [
  "globalThis.test262Var = undefined; globalThis.test262Fn = undefined;",
  `var test262Var;
var test262Fn;
check(
  Object.getOwnPropertyDescriptor(globalThis, "test262Var").configurable,
  true,
);
check(
  Object.getOwnPropertyDescriptor(globalThis, "test262Fn").configurable,
  true,
);
`,
  "let test262Var = 1;",
  "check(test262Var, 1);",
  "const test262Fn = 2;",
  "check(test262Fn, 2);",
];

const prelude = harness + compoundReferenceBaseCheck;

/**
 * The witness Scripts in one realm. In a second realm the same `var` is
 * declared without the configurable property first, so it is
 * non-configurable and the later `let` must throw that realm's SyntaxError.
 */
export const globalLexicalConfigurableVarFixture: Fixture = {
  name: "global-lexical-configurable-var",
  test262Host: true,
  source: [
    "const witness = $262.createRealm();",
    "const mutant = $262.createRealm();",
    `witness.evalScript(${JSON.stringify(prelude)});`,
    ...globalLexicalConfigurableVarScripts.map(
      (script) => `witness.evalScript(${JSON.stringify(script)});`,
    ),
    'mutant.evalScript("var test262Var;");',
    "let rejected = false;",
    "try {",
    '  mutant.evalScript("let test262Var = 1;");',
    "} catch (error) {",
    "  if (!(error instanceof mutant.global.SyntaxError)) throw error;",
    "  rejected = true;",
    "}",
    'if (!rejected) throw new Error("mutation survived");',
    'console.log("global-lexical-configurable-var ok");',
  ].join("\n"),
};
