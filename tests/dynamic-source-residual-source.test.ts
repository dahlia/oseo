/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
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
import test from "node:test";
import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource, printMir } from "../packages/compiler/src/index.ts";
import * as completions from "./native/fixtures/residual-completion-cases.ts";
import * as classes from "./native/fixtures/residual-class-cases.ts";
import * as derived from "./native/fixtures/derived-constructor-realms.ts";
import * as fixtures from "./native/fixtures/dynamic-source-residual.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";

const realmPaths = [
  "test/built-ins/Function/internals/Construct/" +
    "derived-return-val-realm.js",
  "test/built-ins/Function/internals/Construct/" +
    "derived-this-uninitialized-realm.js",
];

test("residual selector retains the exact nineteen bounded paths", () => {
  const selected = readFileSync(
    new URL(
      "../docs/m5c-graph/dynamic-source-residual-evidence.paths.txt",
      import.meta.url,
    ),
    "utf8",
  )
    .trim()
    .split("\n");
  const witnessed = [
    ...completions.residualCompletionCases.map((entry) => entry.path),
    ...classes.residualClassCases.map((entry) => entry.path),
    ...realmPaths,
    "test/language/statements/with/12.10.1-5-s.js",
  ].toSorted();
  assert.deepEqual(witnessed, selected);
  assert.equal(new Set(witnessed).size, 19);
});

for (const fixture of [
  ...derived.derivedRealmFixtures,
  ...fixtures.residualCompletionFixtures,
  ...fixtures.residualClassFixtures,
  fixtures.residualValueOracleFixture,
]) {
  test(`residual finite Script structure: ${fixture.name}`, () => {
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: fixture.name + ".js" },
        { specialization, test262Host: true },
      );
      assert.deepEqual(compiled.diagnostics, []);
      const scripts = compiled.mir!.test262Host!.scripts!;
      assert.ok(scripts.length > 0);
      assert.ok(scripts.every((script) => script.error == null));
      const emitted = cBackend.emit(compiled.mir!);
      assert.match(emitted.source, /oseo_host_scripts/u);
      if (fixture.name.startsWith("derived-realm-")) {
        assert.match(emitted.source, /oseo_derived_constructor_result/u);
        if (fixture.name === "derived-realm-tail") {
          assert.match(emitted.source, /oseo_tail_call_derived/u);
        }
      } else if (fixture.name.startsWith("residual-completion-")) {
        assert.match(printMir(compiled.mir!), /Script completion/u);
      }
    }
  });
}
