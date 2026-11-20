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
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import {
  delegatedThrowBoundaries,
  delegatedThrowExpected,
  delegatedThrowSource,
} from "./helpers/yield-star-throw.ts";

const originalRepro = await readFile(
  new URL(
    "./native/fixtures/yield-star-noncallable-throw.js.txt",
    import.meta.url,
  ),
  "utf8",
);

test("noncallable delegation retains the minimized counterexample", () => {
  assert.equal(
    createHash("sha256").update(originalRepro).digest("hex"),
    "db54af4f8c0803797b34f8b1b2e3bb60f4abc4e0353f6dacf0f888dca60eca86",
  );
  const lines: string[] = [];
  vm.runInNewContext(originalRepro, {
    console: { log: (...values: unknown[]) => lines.push(values.join(" ")) },
  });
  assert.equal(
    lines.join("\n") + "\n",
    "normal TypeError 0\ngetter-throw TypeError 0\nprimitive TypeError 0\n",
  );
});

test("delegation oracle covers GetMethod and close boundaries", () => {
  assert.equal(delegatedThrowBoundaries.length, 88);
  const lines: string[] = [];
  vm.runInNewContext(delegatedThrowSource(delegatedThrowBoundaries), {
    console: { log: (...values: unknown[]) => lines.push(values.join(" ")) },
  });
  assert.equal(
    lines.join("\n") + "\n",
    delegatedThrowExpected(delegatedThrowBoundaries),
  );
});

test("delegation reaches the MIR and runtime boundary", () => {
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source: originalRepro, sourceId: "yield-star-noncallable-throw.js" },
      { specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    assert.match(JSON.stringify(compiled.mir), /"iterator-delegate-throw"/u);
    assert.match(
      cBackend.emit(compiled.mir).source,
      /oseo_iterator_delegate_throw\(/u,
    );
  }
});
