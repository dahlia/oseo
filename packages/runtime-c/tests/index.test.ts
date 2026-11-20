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
import test from "node:test";

import { cRuntimeProvider } from "../src/index.ts";

test("provides the reviewed C runtime inputs", () => {
  const runtime = cRuntimeProvider.getRuntimeInput();
  assert.equal(runtime.abiVersion, "m5-160");
  assert.equal(runtime.assets.length, 51);
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_realm.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_bigint.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_boolean.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_date.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_regexp.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_regexp_matcher.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_regexp_symbol.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_math.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_uri.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_reflect.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_proxy.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_json.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_set.c"),
    ),
  );
  assert.ok(
    runtime.assets.some((asset) =>
      asset.url.pathname.endsWith("/runtime_weak_collection.c"),
    ),
  );
});
