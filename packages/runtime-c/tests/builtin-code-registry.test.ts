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
import test from "node:test";

import { cRuntimeProvider } from "../src/index.ts";

const assets = await Promise.all(
  cRuntimeProvider
    .getRuntimeInput()
    .assets.map(
      async (asset) => [asset.name, await readFile(asset.url, "utf8")] as const,
    ),
);
const sources = new Map(assets);
const internalHeader = sources.get("runtime_internal.h") ?? "";
const functionSource = sources.get("runtime_function.c") ?? "";

const components = [
  "PROMISE",
  "ERROR",
  "SYMBOL",
  "ITERATOR",
  "GENERATOR",
  "ASYNC_GENERATOR",
  "ARRAY",
  "ARGUMENTS",
  "FUNCTION",
  "OBJECT",
  "NUMBER",
  "ARRAY_BUFFER",
  "STRING",
  "MAP",
  "BIGINT",
  "DATA_VIEW",
  "REGEXP",
  "MATH",
  "URI",
  "REFLECT",
  "PROXY",
  "DATE",
  "JSON",
  "SET",
  "TYPED_ARRAY",
  "ATOMICS",
  "WEAK_COLLECTION",
  "BOOLEAN",
  "AGENT",
  "REALM",
  "DISPOSAL",
  "PROCESS",
] as const;

test("allocates one stable built-in code range per runtime component", () => {
  assert.match(
    internalHeader,
    /#define OSEO_BUILTIN_CODE_RANGE_SIZE \(\(size_t\)256u\)/u,
  );
  const indexes = components.map((component) => {
    const pattern = new RegExp(
      `#define OSEO_${component}_CODE_ID_RANGE_INDEX ` +
        String.raw`\(\(size_t\)(\d+)u\)`,
      "u",
    );
    const match = internalHeader.match(pattern);
    assert.ok(match != null, `${component} needs a code range index`);
    return Number(match[1]);
  });
  assert.deepEqual(
    indexes,
    indexes.map((_, index) => index),
  );

  assert.doesNotMatch(
    internalHeader,
    /#define OSEO_[A-Z_]+_CODE_ID \(SIZE_MAX -/u,
  );
});

test("dispatches built-in code ranges through their owning components", () => {
  for (const component of components) {
    const lower = component.toLowerCase();
    assert.match(
      functionSource,
      new RegExp(
        `\\{OSEO_${component}_CODE_ID_RANGE_FIRST,\\s*` +
          `OSEO_${component}_CODE_ID_RANGE_LAST,\\s*` +
          `oseo_internal_${lower}_builtin_dispatch\\}`,
        "u",
      ),
      `${component} needs one dispatch-table entry`,
    );
  }
  assert.doesNotMatch(
    functionSource,
    /else if \(code_id == OSEO_[A-Z_]+_CODE_ID/u,
  );
});
