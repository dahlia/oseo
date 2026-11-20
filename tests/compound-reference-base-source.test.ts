// Copyright (C) 2014 André Bargull. All rights reserved.
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
  compoundReferenceBaseCases,
  compoundReferenceBaseFixture,
  compoundReferenceBaseMutations,
  compoundReferenceBaseProgram,
} from "./native/fixtures/compound-reference-base.ts";

const suite = dirname(
  fileURLToPath(import.meta.resolve("test262/package.json")),
);

test("the witness rows are the selector's compound assignment paths", () => {
  const selector = "dynamic-source-fixture-construction-evidence.paths.txt";
  const selected = readFileSync(
    new URL(`../docs/m5c-graph/${selector}`, import.meta.url),
    "utf8",
  )
    .trim()
    .split("\n")
    .filter((path) => path.includes("/compound-assignment/"));
  assert.equal(selected.length, 11);
  assert.deepEqual(
    compoundReferenceBaseCases.map((entry) => entry.path).toSorted(),
    selected,
  );
});

for (const entry of compoundReferenceBaseCases) {
  test(`witness values match the pinned source: ${entry.path}`, () => {
    const source = readFileSync(join(suite, entry.path), "utf8");
    const body = source.slice(source.indexOf("---*/"));
    assert.match(source, /^flags: \[noStrict\]$/mu);
    // The original body differs from the witness only at the marked site.
    const original = `
function testCompoundAssignment() {
  var x = ${entry.initial};
  var innerX = (function() {
    x ${entry.operator} (eval("var x = 2;"), ${entry.operand});
    return x;
  })();

  if (innerX !== 2) {
    throw new Test262Error('#1: innerX === 2. Actual: ' + (innerX));
  }
  if (x !== ${entry.expected}) {
    throw new Test262Error('#2: x === ${entry.expected}. Actual: ' + (x));
  }
}
testCompoundAssignment();
`;
    assert.equal(body, `---*/\n${original}`);
  });

  test(`each mutation changes the witness once: ${entry.path}`, () => {
    const program = compoundReferenceBaseProgram(entry);
    for (const mutation of compoundReferenceBaseMutations(entry)) {
      assert.equal(program.split(mutation.from).length, 2, mutation.from);
    }
  });
}

test("the witness constructs no source", () => {
  assert.doesNotMatch(
    compoundReferenceBaseFixture.source,
    /\beval\s*\(|\bFunction\s*\(/u,
  );
});
